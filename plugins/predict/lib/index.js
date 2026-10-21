/**
 * The Host half: ask the model what the user will say next.
 *
 * HOW IT CALLS THE MODEL — and why not HTTP. The request goes through `ctx.llm`,
 * the same service the agent loop itself calls:
 *
 *     const prepared = await ctx.llm.prepareCall({ provider, model, messages })
 *     for await (const chunk of prepared.stream({ ...prepared.config, messages }))
 *
 * That is the whole reason this is a Cordis plugin rather than a script: the
 * session's adapter, credentials, retry policy and prompt cache are already
 * wired through `ctx.llm`, so a prediction is the same KIND of call as the turn
 * that just finished — same provider, same auth, same accounting. Building an
 * HTTP request by hand would duplicate all of that and break the moment the user
 * switched providers.
 *
 * WHEN IT RUNS. On `turn/end`, if {@link shouldPredict} says so. Not on every
 * event: the turn's own result is what gives the conversation its new shape.
 *
 * WHERE THE ANSWER GOES. Nowhere on the host. It is published on an event the
 * client half listens to; the client owns the composer and decides how to draw
 * it. A host that draws UI would break the moment the browser half is disabled.
 *
 * @module @hwfee/dsh-predict
 */

import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  ANCHOR_LIMIT, CONTEXT_TURNS, PREDICTION_PROMPT, afterAttempt, leastReasoning, parseSuggestion,
  predictionChunkText, shouldPredict,
} from './predict.js'
import { buildRequestMessages } from './request.js'
import { PLUGIN_ID } from './constants.js'

export const name = 'dsh-predict'

/**
 * `llm` is required — without it there is nothing to predict with. `agents` is
 * optional: a profile without it simply never fires (there are no turns to
 * follow).
 */
export const inject = ['llm']

/** The event the client half subscribes to. */
export const SUGGESTION_EVENT = 'predict/suggestion'

/** The event the client half sends when the user accepts or dismisses. */
export const DISMISS_EVENT = 'predict/dismissed'

export const SETTINGS_SERVICE = 'predictSettings'

/** Timeout for one prediction, in milliseconds. */
export const PREDICTION_TIMEOUT_MS = 20_000

export class PredictSettings extends TypertRemoteService {
  constructor(ctx, runtime) {
    super(ctx, 'predictSettings')
    this.runtime = runtime
    this.state = { enabled: true, pinnedModel: '' }
    const service = this
    const context = (method) => ({
      kind: 'method', name: method, static: false, private: false,
      addInitializer(fn) { fn.call(service) },
    })
    Remote(this.configure, context('configure'))
    withSessionResource(this.dismiss, context('dismiss'))
    withSessionResource(this.suggestion, context('suggestion'))
  }

  enabled() { return this.state.enabled }

  pinnedModel() { return this.state.pinnedModel }

  configure(settings) {
    assertOwner(this)
    const next = normalizeSettings(settings)
    const changed = next.enabled !== this.state.enabled || next.pinnedModel !== this.state.pinnedModel
    this.state = next
    if (changed) this.runtime.disable()
    return { enabled: next.enabled, pinnedModel: next.pinnedModel }
  }

  dismiss(request) {
    assertOwner(this)
    const sessionId = readSessionId(request)
    this.runtime.dismiss(sessionId)
    return { sessionId }
  }

  async suggestion(request, signal) {
    assertOwner(this)
    const sessionId = readSessionId(request)
    const turnSeq = readTurnSeq(request)
    return this.runtime.suggest(sessionId, turnSeq, signal)
  }
}

function sessionResource(request) {
  return request?.sessionId
}

const withSessionResource = Remote({ resources: { session: sessionResource } })

function assertOwner(service) {
  const invocation = service.ctx.invocation
  if (invocation === undefined) return
  const principal = invocation?.peer?.principal
  if (principal === undefined || principal === null || principal.kind !== 'owner') {
    throw new RemoteError('remote-access/denied', 'predictSettings is owner-only', {
      action: 'predictSettings', reason: 'principal-not-owner',
    })
  }
}

function normalizeSettings(settings) {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new RemoteError('predictSettings/invalid', 'settings must be an object', { field: 'settings' })
  }
  const out = { enabled: true, pinnedModel: '' }
  if (Object.hasOwn(settings, 'enabled')) {
    if (typeof settings.enabled !== 'boolean') {
      throw new RemoteError('predictSettings/invalid', 'settings.enabled must be a boolean', { field: 'enabled' })
    }
    out.enabled = settings.enabled
  }
  if (Object.hasOwn(settings, 'pinnedModel')) {
    if (typeof settings.pinnedModel !== 'string') {
      throw new RemoteError('predictSettings/invalid', 'settings.pinnedModel must be a string', { field: 'pinnedModel' })
    }
    const raw = settings.pinnedModel.trim()
    const slash = raw.indexOf('/')
    out.pinnedModel = slash > 0 && slash < raw.length - 1 ? raw : ''
  }
  return out
}

function readSessionId(request) {
  const id = request !== null && typeof request === 'object' ? request.sessionId : undefined
  if (typeof id !== 'string' || id === '') {
    throw new RemoteError('predictSettings/invalid', 'request.sessionId must be a non-empty string', { field: 'sessionId' })
  }
  return id
}

function readTurnSeq(request) {
  const seq = request !== null && typeof request === 'object' ? request.turnSeq : undefined
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) {
    throw new RemoteError('predictSettings/invalid', 'request.turnSeq must be a non-negative integer', { field: 'turnSeq' })
  }
  return seq
}

const CANCELLED = Symbol('predict/cancelled')

/**
 * Register the turn listener.
 *
 * @param {object} ctx the host context
 */
export function apply(ctx) {
  // THE SETTINGS, as a service the rest of the plugin reads.
  //
  // The values live in `localStorage` (the browser owns the user's preference),
  // but the HOST half needs them on every turn. The client publishes them over
  // `predict/settings` and this service caches them: one owner (the page), one
  // reader (the host), and no storage access on the side that cannot see it.
  const sessions = new Map()

  // Per-session state: the last few turns, and whether the previous suggestion
  // was dismissed. Keyed by session id because the host runs several at once.
  const stateFor = (sessionId) => {
    let state = sessions.get(sessionId)
    if (state === undefined) {
      state = {
        turns: [],
        userTurns: 0,
        dismissed: false,
        pending: null,
        result: null,
        failures: 0,
        cooldownTurns: 0,
        turnSeq: -1,
        generation: 0,
      }
      sessions.set(sessionId, state)
    }
    return state
  }

  const invalidate = (state) => {
    state.generation += 1
    const pending = state.pending
    if (pending !== null) {
      state.pending = null
      pending.controller.abort()
    }
  }

  const runtime = {
    sessions,
    dismiss(sessionId) {
      stateFor(sessionId).dismissed = true
    },
    disable() {
      for (const state of sessions.values()) invalidate(state)
    },
    async suggest(sessionId, turnSeq, signal) {
      const base = { sessionId, turnSeq, text: null }
      const state = sessions.get(sessionId)
      if (state === undefined) return { ...base, reason: 'unknown-session' }
      if (state.result !== null && state.result.turnSeq === turnSeq
        && state.result.generation === state.generation) {
        return { sessionId, turnSeq, text: state.result.text, reason: state.result.reason }
      }
      const pending = state.pending
      if (pending === null || pending.turnSeq !== turnSeq) {
        return { ...base, reason: turnSeq <= state.turnSeq ? 'superseded' : 'not-started' }
      }
      const outcome = await raceSignal(pending.promise, signal)
      if (outcome === CANCELLED) return { ...base, reason: 'cancelled' }
      if (outcome.generation !== state.generation) return { ...base, reason: 'superseded' }
      return { sessionId, turnSeq, text: outcome.text, reason: outcome.reason }
    },
  }

  const service = new PredictSettings(ctx, runtime)

  // THE SEAM IS `session/event`, not a Cordis `turn/end` event.
  //
  // Turns are SESSION events: the agent loop emits them into the session log and
  // listens for them here (see `ctx.on("session/event", …)` in dsh-agent-loop).
  // A plugin that registers `ctx.on('turn/end')` receives nothing, which is why
  // the first version of this file never fired.
  ctx.on('session/event', (session, event) => {
    const sessionId = sessionIdOf(session)
    if (sessionId === null) return
    const state = stateFor(sessionId)
    if (event?.type === 'turn/start' || event?.type === 'user/message') invalidate(state)
    trackEvent(state, event)
    if (event?.type !== 'turn/end') return
    // Never let a prediction delay or disturb the turn itself: the whole handler
    // is fire-and-forget, and every failure path is swallowed. A missing
    // suggestion is not an error the user asked about.
    handleTurnEnd(ctx, { sessionId, session, event, state }).catch(() => {})
  })

  ctx.on('session/disposed', (session) => {
    const sessionId = sessionIdOf(session)
    if (sessionId === null) return
    const state = sessions.get(sessionId)
    if (state !== undefined) invalidate(state)
    sessions.delete(sessionId)
  })

  ctx.effect(() => () => {
    // Abort anything still running when the plugin is disabled, or a prediction
    // would land on a session whose plugin no longer exists.
    for (const state of sessions.values()) invalidate(state)
    sessions.clear()
  }, PLUGIN_ID + ': in-flight predictions')

  return service
}

/**
 * Follow the conversation, then predict the next user line.
 *
 * @param {object} ctx host context
 * @param {object} options
 * @param {string} options.sessionId the session's id
 * @param {object} options.session the Session subject the event carried
 * @param {object} options.event the `turn/end` payload
 * @param {object} options.state the per-session state
 */
async function handleTurnEnd(ctx, { sessionId, session, event, state }) {
  state.turnSeq = event.seq

  // Follow the conversation from the session's own event stream.
  rebuildConversation(state, session)

  const decision = shouldPredict({
    enabled: enabledFromContext(ctx),
    dismissedLastTurn: state.dismissed,
    turnFailed: event.data?.reason?.kind === 'error' || event.data?.reason?.kind === 'aborted',
    userTurns: state.userTurns,
    cooldownTurns: state.cooldownTurns,
  })
  // The dismissal only skips ONE turn: consuming it here is what makes the next
  // completed turn eligible again.
  state.dismissed = false
  if (!decision.ok) {
    // The cooldown still counts down on a skipped turn, or a ten-turn silence
    // would become an eleven, twelve, thirteen... one per turn it sat idle.
    if (decision.reason === 'cooldown') state.cooldownTurns = Math.max(0, state.cooldownTurns - 1)
    settle(state, event.seq, null, 'skipped:' + decision.reason)
    return
  }

  const generation = state.generation
  const controller = new AbortController()
  const pending = { turnSeq: event.seq, generation, controller, promise: null }
  pending.promise = runPrediction(ctx, { sessionId, session, state, controller })
    .then((outcome) => {
      // THE BACKOFF. A failed prediction is invisible, so without this a broken
      // route would cost one request per turn forever with nothing to show for it.
      if (state.generation === generation) {
        if (state.pending === pending) state.pending = null
        const next = afterAttempt({
          failures: state.failures,
          cooldownTurns: state.cooldownTurns,
          succeeded: outcome.succeeded,
        })
        state.failures = next.failures
        state.cooldownTurns = next.cooldownTurns
        state.result = { turnSeq: pending.turnSeq, generation, text: outcome.text, reason: outcome.reason }
      }
      return { ...outcome, turnSeq: pending.turnSeq, generation }
    })
  state.pending = pending
}

async function runPrediction(ctx, { sessionId, session, state, controller }) {
  const signal = controller.signal
  let succeeded = false
  let text = null
  let reason = null
  let timedOut = false
  // The abort waiter's listener must be removed on EVERY exit path. `race()`
  // leaves the losing promise pending forever, so a model that answers normally
  // would keep its `abort` listener (and this closure) on the controller's
  // signal — one leak per completed prediction. `cancel()` in the `finally` is
  // what makes the listener lifetime equal to the call's.
  let waiter = null
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, PREDICTION_TIMEOUT_MS)
  try {
    const route = readRoute(ctx, { sessionId, session })
    // A silent skip here is the difference between "the model declined" and
    // "the plugin could not find a route"; the log is the only way to tell.
    if (route === null) {
      reason = 'no-route'
    } else {
      // NO CONTEXT, NO CALL. `buildRequestMessages` returns null when the turn
    // left nothing to continue from (no assistant prose and no user line).
    // Predicting from an empty prompt is how an unrelated suggestion gets
    // invented, so the honest answer is to stay silent.
    const messages = buildRequestMessages(state.turns, route)
    if (messages === null) {
      reason = 'no-context'
    } else {
      waiter = waitAborted(signal)
      const outcome = await Promise.race([
        callModel(ctx, {
          route,
          messages,
          signal,
        }).then(
          (value) => ({ value }),
          (error) => ({ error }),
        ),
        waiter.promise.then(() => ({ aborted: true })),
      ])
      if (outcome.aborted === true) {
        reason = timedOut ? 'timeout' : 'superseded'
      } else if (outcome.error !== undefined) {
        throw outcome.error
      } else {
        const suggestion = parseSuggestion(outcome.value)
        if (suggestion === null) {
          reason = 'declined'
        } else {
          succeeded = true
          text = suggestion
        }
      }
      }
    }
  } catch (error) {
    reason = timedOut ? 'timeout' : signal.aborted ? 'superseded' : 'error'
  } finally {
    if (waiter !== null) waiter.cancel()
    clearTimeout(timer)
  }
  return { text, reason, succeeded }
}

/**
 * An abort waiter that can be disarmed.
 *
 * `Promise.race` cannot cancel the loser, so returning a bare promise leaks one
 * `abort` listener per prediction that finishes before it is aborted. Callers
 * must invoke `cancel()` when the race is over — `runPrediction` does it in its
 * `finally`.
 */
function waitAborted(signal) {
  let onAbort = null
  const promise = signal.aborted ? Promise.resolve() : new Promise((resolve) => {
    onAbort = () => resolve()
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return {
    promise,
    cancel() {
      if (onAbort === null) return
      signal.removeEventListener('abort', onAbort)
      onAbort = null
    },
  }
}

function settle(state, turnSeq, text, reason) {
  state.result = { turnSeq, generation: state.generation, text, reason }
}

function raceSignal(promise, signal) {
  if (signal === undefined) return promise
  if (signal.aborted) return Promise.resolve(CANCELLED)
  return new Promise((resolve) => {
    const onAbort = () => resolve(CANCELLED)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value) },
      () => { signal.removeEventListener('abort', onAbort); resolve(CANCELLED) },
    )
  })
}

export function rebuildConversation(state, session) {
  const messages = typeof session?.deriveMessages === 'function' ? session.deriveMessages() : []
  const turns = []
  let userTurns = 0
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role === 'user') {
      // THE HOST'S SOURCE KEY AND SOURCE KIND DISAGREE. The message source map
      // declares `'user-rpc': { kind: 'user'; rpcId: … }`: a message typed in
      // the web composer is KEYED `user-rpc` but its `kind` is `'user'`. This
      // filter used to test `kind === 'user-rpc'`, so every real user message
      // was dropped, `userTurns` stayed 0, and `shouldPredict` classified every
      // turn as the first — no prediction ever ran. The official session-title
      // plugin filters the same way (`source.kind === 'user'`).
      if (message.source?.kind !== 'user') continue
      const text = contentText(message.content)
      if (text === '') continue
      userTurns += 1
      turns.push({ role: 'user', text, source: message.source })
    } else if (message?.role === 'assistant') {
      const text = contentText(message.content)
      if (text !== '') turns.push({ role: 'assistant', text, source: message.source })
      // ANCHORS, even when the turn has no prose. A coding-agent turn is mostly
      // tool calls (`block.type === 'tool-call'`, per dsh-agent-loop's own
      // filter at lib/index.js:1164), so dropping text-less turns threw away
      // the only topical signal in the conversation: which files were touched.
      // These become one compact annotation per turn, not transcript lines.
      const anchors = anchorTurn(message.content)
      if (anchors !== '') turns.push({ role: 'anchor', text: anchors })
    }
  }
  state.turns = turns.slice(-CONTEXT_TURNS * 2)
  state.userTurns = userTurns
}

export function contentText(content) {
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      text += block.text
    }
  }
  return text
}

/**
 * One compact annotation for a turn's tool calls: `edit plugins/x/styles.js`.
 *
 * WHY THIS EXISTS. The suggestion model needs to know WHAT the turn touched,
 * not what it said. Without it an anaphoric next line ("now the other file")
 * has no referent, and the model invents one — the "completely unrelated
 * prediction" report. Kept to a single line per turn so the request stays
 * small: this is the cheap half of what Cursor buys with a 13k-token context.
 *
 * @param content the assistant message's content blocks
 * @returns the annotation, or '' when the turn called no tools
 */
export function anchorTurn(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block === null || typeof block !== 'object' || block.type !== 'tool-call') continue
    const name = typeof block.name === 'string' ? block.name : (typeof block.toolName === 'string' ? block.toolName : '')
    if (name === '') continue
    // The path is the useful half; accept the shapes the fs tools actually use
    // rather than guessing one. `input` is the field agent-loop hands to the
    // scheduler, `arguments` the pre-parse name.
    const input = block.input ?? block.arguments ?? {}
    const path = typeof input?.path === 'string' ? input.path
      : typeof input?.file_path === 'string' ? input.file_path
        : ''
    parts.push(path === '' ? name : name + ' ' + path)
    if (parts.length >= ANCHOR_LIMIT) break
  }
  return parts.join(' · ')
}

/**
 * Fold one session event into the per-session prediction state.
 *
 * Kept as a pure-ish step so the counters it maintains can be reasoned about:
 * `turns` is the rolling context window, `userTurns` the total the first-turn
 * rule reads.
 *
 * @param {object} state the per-session state
 * @param {object} event a session event
 */
export function trackEvent(state, event) {
  const type = event?.type

  if (type === 'user/message' && event.surfaceOp !== 'remove') {
    // Same key/kind mismatch as `rebuildConversation`: the web composer's
    // message is keyed `user-rpc` with `source.kind === 'user'`.
    if (event.data?.source?.kind !== 'user') return
    const text = contentText(event.data?.content)
    if (text !== '') {
      state.userTurns += 1
      state.turns.push({ role: 'user', text, source: event.data.source })
      trimTurns(state)
    }
    return
  }

  if (type === 'assistant/message' && event.surfaceOp !== 'remove') {
    const text = contentText(event.data?.message?.content)
    if (text !== '') {
      state.turns.push({ role: 'assistant', text, source: event.data?.message?.source })
      trimTurns(state)
    }
  }
}

/**
 * Keep the rolling window bounded.
 *
 * The request only sends the last `CONTEXT_TURNS`, so holding the whole session
 * would be memory nobody reads.
 *
 * @param {object} state the per-session state
 */
function trimTurns(state) {
  const limit = CONTEXT_TURNS * 2
  if (state.turns.length > limit) state.turns = state.turns.slice(-limit)
}

// THERE IS DELIBERATELY NO "WRITE THE SUGGESTION TO THE SESSION" HELPER.
//
// An earlier design appended a `plugin:dsh-predict/suggestion` record and
// persisted the model's text next to the conversation. The shipped path never
// used it (the client asks for the suggestion over `predictSettings/suggestion`
// and draws it in the composer), but a writer is a standing invitation to route
// the model's answer — reasoning included — into the transcript. The only
// durable record of a prediction is now the absence of one.

/**
 * The session id behind a `session/event` subject.
 *
 * The subject is the session object; its id is the stable key. Accepting a
 * string too keeps this total against a host that passes the id directly.
 *
 * @param {unknown} subject the event subject
 * @returns {string | null} the id, or null
 */
export function sessionIdOf(subject) {
  if (typeof subject === 'string') return subject
  const id = subject?.id
  return typeof id === 'string' ? id : null
}

/**
 * One model call through the session's own LLM service.
 *
 * THINKING IS SWITCHED OFF AT THE SOURCE, and then filtered anyway.
 *
 * The third argument of `ctx.llm.prepareCall` is the documented `ConfigureCall`
 * hook (`dsh-llm/lib/index.js`, `prepareCall(config, signal, configure)`): it
 * runs before adapter defaults are materialized, which is the only point at
 * which this call can say "no reasoning" without racing the adapter's own
 * default. `leastReasoning` selects `reasoningEffort: 'off'` (DeepSeek turns
 * that into `thinking: { type: 'disabled' }`). Without it, a route configured
 * for `high` would reason before writing six words, every turn.
 *
 * The stream is still filtered by `predictionChunkText`, because a model that
 * cannot switch thinking off (or a route that ignores the effort) must not be
 * able to hand reasoning to the composer. Only `text-delta` survives; a stream
 * with nothing but reasoning resolves to `''`, which `parseSuggestion` turns
 * into "no prediction".
 *
 * NOTHING IS APPENDED TO THE SESSION. A prediction is not a turn: it is not a
 * message, not a step, and not a plugin record. The host renders the transcript
 * from `assistant/message` events that only the agent loop appends, so keeping
 * this function free of session writes is what guarantees the transcript never
 * receives a prediction — or its reasoning.
 *
 * @param {object} ctx host context
 * @param {object} options
 * @param {{ provider: string, model: string }} options.route the route to use
 * @param {Array<object>} options.messages the conversation
 * @param {AbortSignal} options.signal cancellation
 * @returns {Promise<string>} the assistant text, joined
 */
export async function callModel(ctx, { route, messages, signal }) {
  const prepared = await ctx.llm.prepareCall(route, signal, leastReasoning)
  const chunks = []
  // `prepared.stream` refuses a config that differs from the prepared one (see
  // `INVALID_PREPARED_CALL` in dsh-llm), so the route is spread back in exactly.
  for await (const chunk of prepared.stream({ ...prepared.config, messages, signal })) {
    const text = predictionChunkText(chunk)
    if (text !== '') chunks.push(text)
  }
  return chunks.join('')
}

/**
 * Read the model route.
 *
 * THE DEFAULT IS THE CURRENT MODEL, which is what the user is already talking
 * to: a suggestion in a different voice would be jarring, and it would not share
 * the prompt cache. An explicit setting can pin a cheaper model instead.
 *
 * @param {object} ctx host context
 * @param {object} [options]
 * @param {string} [options.sessionId] the session's id
 * @param {object} [options.session] the Session subject
 * @returns {{ provider: string, model: string } | null} the route, or null
 */
export function readRoute(ctx, { sessionId, session } = {}) {
  // The user's pinned override, when it names a complete route.
  const pinned = pinnedModelFromContext(ctx)
  if (pinned !== null) return pinned

  const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  const agent = sessionId === undefined ? undefined : agents?.get?.(sessionId)
  if (agent !== undefined) {
    const current = agents?.selectionFor?.(agent)?.current
    if (typeof current?.provider === 'string' && typeof current?.model === 'string') {
      return { provider: current.provider, model: current.model }
    }
  }

  const header = typeof session?.requestHeader === 'function' ? session.requestHeader() : undefined
  const config = header?.config
  if (typeof config?.provider === 'string' && typeof config?.model === 'string') {
    return { provider: config.provider, model: config.model }
  }

  const selection = ctx.get === undefined ? undefined : ctx.get('agentDefaultModel')
  if (selection !== undefined && typeof selection.currentSelection === 'function') {
    const current = selection.currentSelection()
    if (typeof current?.provider === 'string' && typeof current?.model === 'string') {
      return { provider: current.provider, model: current.model }
    }
  }
  return null
}

/**
 * Read the model the user pinned in settings.
 *
 * Shape: a single string `"provider/model"`, so the settings row is one text
 * field rather than two dependent dropdowns.
 *
 * @param {object} ctx host context
 * @returns {{ provider: string, model: string } | null} the pinned route, or null
 */
export function pinnedModelFromContext(ctx) {
  if (typeof ctx.get !== 'function') return null
  const settings = ctx.get('predictSettings')
  if (settings === undefined || typeof settings.pinnedModel !== 'function') return null
  const pinned = settings.pinnedModel()
  if (typeof pinned !== 'string') return null
  const slash = pinned.indexOf('/')
  if (slash <= 0 || slash === pinned.length - 1) return null
  return { provider: pinned.slice(0, slash), model: pinned.slice(slash + 1) }
}

/**
 * Whether the plugin is on.
 *
 * Default ON: the feature is the point of installing it. The setting exists so
 * it can be turned off without uninstalling.
 *
 * @param {object} ctx host context
 * @returns {boolean} whether to predict
 */
export function enabledFromContext(ctx) {
  if (typeof ctx.get !== 'function') return false
  const settings = ctx.get('predictSettings')
  if (settings === undefined || typeof settings.enabled !== 'function') return false
  return settings.enabled() !== false
}

export { PREDICTION_PROMPT }
