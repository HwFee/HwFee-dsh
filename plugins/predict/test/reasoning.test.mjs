/**
 * The reasoning guard: the prediction must never think, and its thinking must
 * never reach the composer or the conversation.
 *
 * WHY THIS FILE EXISTS. A prediction is a background helper whose only visible
 * product is ghost text in an empty composer. When its model reasons, two
 * things happen: every turn pays for a scratchpad, and that scratchpad is one
 * bug away from being rendered — as grey text the user can Tab into the draft,
 * or (worse) as something that looks like part of the conversation. The fix has
 * two independent layers, and this suite pins both:
 *
 *   1. the call disables reasoning through the documented `ConfigureCall` hook
 *      of `ctx.llm.prepareCall` (`reasoningEffort: 'off'`);
 *   2. the stream is filtered so reasoning chunks cannot contribute text even
 *      when the route ignores (1), with a second strip for thinking that
 *      arrives inline as `<thinking>…</thinking>`.
 *
 * The last test asserts the structural half: nothing about a prediction is
 * written to the session, so the transcript cannot receive it. That test fails
 * if anyone re-introduces `appendSuggestion` or an `assistant/message` write.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  PREDICTION_REASONING_EFFORT, leastReasoning, parseSuggestion, predictionChunkText, stripThinking,
} = await import('../lib/predict.js')
const { apply, callModel } = await import('../lib/index.js')

// ------------------------------------------------------------------ fixtures

/** Model metadata the way the adapters advertise it. */
const reasoner = (ids) => ({ reasoning: { efforts: ids.map((id) => ({ id, name: id })) } })

function collect(chunks) {
  return (async function* () { for (const chunk of chunks) yield chunk })()
}

/**
 * The smallest stand-in for `ctx.llm` that keeps the third argument observable.
 *
 * The real runtime calls `configure(controls, modelInfo)` INSIDE `prepareCall`
 * and validates the result, so a fake that ignores the third argument would
 * pass whether or not the plugin uses the flag. This one runs it and returns
 * its result as the prepared config, exactly as the runtime does.
 */
function fakeLlm({ model = reasoner(['off', 'low', 'high', 'max']), chunks = [] } = {}) {
  const calls = []
  return {
    calls,
    async prepareCall(config, signal, configure) {
      const call = { config, signal, configure, stream: undefined }
      calls.push(call)
      const controls = typeof configure === 'function' ? configure({}, model) : config
      return {
        config: { ...config, ...controls },
        stream(options) {
          call.stream = options
          return collect(chunks)
        },
      }
    },
  }
}

const ROUTE = { provider: 'deepseek', model: 'v4.1-flash' }
const SIGNAL = new AbortController().signal

// ------------------------------------------------- layer 1: the call config

test('a prediction asks the adapter for its "off" reasoning effort', function () {
  assert.equal(PREDICTION_REASONING_EFFORT, 'off')
  const controls = leastReasoning({}, reasoner(['off', 'low', 'high', 'max']))
  assert.deepEqual(controls, { reasoningEffort: 'off' })
})

test('a model without "off" still gets its least advertised effort', function () {
  // Leaving the default alone here would be the same thinking this call exists
  // to avoid: some routes only offer low/high.
  assert.deepEqual(leastReasoning({}, reasoner(['low', 'high'])), { reasoningEffort: 'low' })
})

test('a model that cannot reason is sent no reasoning effort at all', function () {
  // `resolveCallWithInfo` throws UNSUPPORTED_REASONING_EFFORT for any explicit
  // effort on a non-reasoning model — sending one would kill every prediction
  // on that route instead of making it cheaper.
  for (const model of [undefined, {}, { reasoning: undefined }, { reasoning: { efforts: [] } }]) {
    assert.deepEqual(leastReasoning({ temperature: 0.2 }, model), { temperature: 0.2 })
  }
})

test('callModel passes the configure hook, not a hand-built config', async function () {
  const llm = fakeLlm({ chunks: [{ type: 'text-delta', index: 0, text: 'next line' }] })
  const text = await callModel({ llm }, { route: ROUTE, messages: [], signal: SIGNAL })
  assert.equal(text, 'next line')
  assert.equal(llm.calls.length, 1)
  assert.equal(typeof llm.calls[0].configure, 'function',
    'the configure hook is what disables reasoning before adapter defaults are applied')
  assert.equal(llm.calls[0].stream.reasoningEffort, 'off',
    'the dispatched request must carry the resolved effort')
})

test('a smuggled settings field cannot turn reasoning back on', async function () {
  // The settings service rebuilds its state from known keys, so no RPC can add
  // a reasoning control; this asserts the host never reads one even if it did.
  const llm = fakeLlm({ chunks: [{ type: 'text-delta', index: 0, text: 'x' }] })
  const ctx = fakeCtx({ llm })
  apply(ctx)
  ctx.get('predictSettings').configure({
    enabled: true, pinnedModel: '', reasoningEffort: 'high', thinking: { type: 'enabled' },
  })
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  ctx.fire('session/event', session, endEvent())
  const out = await ctx.get('predictSettings').suggestion({ sessionId: 's1', turnSeq: lastSeq })
  assert.equal(out.text, 'x')
  assert.equal(llm.calls.at(-1).stream.reasoningEffort, 'off')
})

// ------------------------------------------------- layer 2: the stream filter

test('the extractor accepts text deltas and nothing else', function () {
  assert.equal(predictionChunkText({ type: 'text-delta', index: 0, text: 'go on' }), 'go on')
  assert.equal(predictionChunkText({ type: 'reasoning-delta', index: 0, text: 'thinking…' }), '',
    'reasoning is not text')
  assert.equal(predictionChunkText({ type: 'block-end', index: 0, block: { type: 'text', text: 'go on' } }), '',
    'block-end repeats what the deltas already streamed; accepting it would double the suggestion')
  assert.equal(predictionChunkText({ type: 'text', text: 'go on' }), '',
    'a chunk type the protocol does not define must not be guessed into text')
  assert.equal(predictionChunkText(null), '')
  assert.equal(predictionChunkText({ type: 'text-delta', text: 42 }), '')
})

test('a response with reasoning and text yields only the text', async function () {
  const llm = fakeLlm({
    chunks: [
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'The user just asked for ' },
      { type: 'reasoning-delta', index: 0, text: 'a summary, so they may want…' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'The user just asked…' } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: '再把 B 那一行也补上' },
      { type: 'block-end', index: 1, block: { type: 'text', text: '再把 B 那一行也补上' } },
      { type: 'usage', usage: {} },
      { type: 'finish', reason: { kind: 'completed' } },
    ],
  })
  const text = await callModel({ llm }, { route: ROUTE, messages: [], signal: SIGNAL })
  assert.equal(text, '再把 B 那一行也补上')
  assert.equal(parseSuggestion(text), '再把 B 那一行也补上')
})

test('a response with ONLY reasoning yields an empty prediction', async function () {
  // The failure this whole file guards: the model thinks, produces no answer,
  // and the plugin must render nothing rather than the thought.
  const llm = fakeLlm({
    chunks: [
      { type: 'reasoning-delta', index: 0, text: 'Maybe they want the tests run. ' },
      { type: 'reasoning-delta', index: 0, text: 'Or not. Hard to say.' },
      { type: 'finish', reason: { kind: 'completed' } },
    ],
  })
  const text = await callModel({ llm }, { route: ROUTE, messages: [], signal: SIGNAL })
  assert.equal(text, '')
  assert.equal(parseSuggestion(text), null)
})

test('the service turns a reasoning-only answer into "declined", never a ghost', async function () {
  const llm = fakeLlm({
    chunks: [{ type: 'reasoning-delta', index: 0, text: 'I should not predict anything.' }],
  })
  const ctx = fakeCtx({ llm })
  apply(ctx)
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  ctx.fire('session/event', session, endEvent())
  const out = await ctx.get('predictSettings').suggestion({ sessionId: 's1', turnSeq: lastSeq })
  assert.equal(out.text, null)
  assert.equal(out.reason, 'declined', 'no text means no result to draw, not an error to surface')
})

// --------------------------------------- inline envelopes (second line of defence)

test('thinking that arrives inline as <thinking> is stripped before parsing', function () {
  assert.equal(stripThinking('<thinking>weigh options</thinking>\n先跑测试'), '先跑测试')
  assert.equal(stripThinking('<THINKING>case</THINKING>先跑测试'), '先跑测试')
  assert.equal(stripThinking('<reasoning>r</reasoning>  next'), 'next')
  // An unterminated envelope means the model never finished the answer.
  assert.equal(stripThinking('<thinking>it depends on whether the user'), '')
  // Stray closing tags are noise.
  assert.equal(stripThinking('do it</thinking>'), 'do it')
  assert.equal(stripThinking('plain line'), 'plain line')
  assert.equal(stripThinking(undefined), '')
})

test('parseSuggestion returns nothing for an answer that is entirely reasoning', function () {
  // This is the "it sometimes ends up in the composer" case, as a regression:
  // the first non-empty line of a thinking block is exactly what would have
  // been shown as grey text before the strip.
  assert.equal(parseSuggestion('<thinking>Plan:\n1. read the file\n2. patch it</thinking>'), null)
  assert.equal(parseSuggestion('<thinking>only a thought</thinking>'), null)
  assert.equal(parseSuggestion('<thinking>x</thinking>\n```\nno```'), null)
})

test('a thinking envelope streamed as TEXT deltas still never becomes the ghost', async function () {
  // A route that only speaks the inline dialect delivers the envelope as
  // ordinary text, so the chunk filter cannot see it. The two layers together
  // are what keep it out of the composer: the deltas join into text, and the
  // parser strips the envelope before the first line is chosen.
  const wrapped = fakeLlm({
    chunks: [
      { type: 'text-delta', index: 0, text: '<thinking>weigh the options' },
      { type: 'text-delta', index: 0, text: ' and pick one</thinking>' },
      { type: 'text-delta', index: 0, text: '\n先跑测试' },
    ],
  })
  const text = await callModel({ llm: wrapped }, { route: ROUTE, messages: [], signal: SIGNAL })
  assert.equal(parseSuggestion(text), '先跑测试')

  const thoughtOnly = fakeLlm({
    chunks: [{ type: 'text-delta', index: 0, text: '<thinking>nothing to say</thinking>' }],
  })
  const closed = await callModel({ llm: thoughtOnly }, { route: ROUTE, messages: [], signal: SIGNAL })
  assert.equal(parseSuggestion(closed), null)
})

// ------------------------------------------------ the transcript guarantee

test('a prediction writes nothing to the session, so the transcript cannot receive it', async function () {
  const llm = fakeLlm({
    chunks: [
      { type: 'reasoning-delta', index: 0, text: 'private thought' },
      { type: 'text-delta', index: 0, text: 'looks good' },
    ],
  })
  const ctx = fakeCtx({ llm })
  apply(ctx)
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  ctx.fire('session/event', session, endEvent())
  const out = await ctx.get('predictSettings').suggestion({ sessionId: 's1', turnSeq: lastSeq })
  assert.equal(out.text, 'looks good')
  // `append` would create an assistant/message row (`role` + `content`), and
  // `appendPluginRecord` would persist the text next to the conversation.
  // Neither may happen for a background prediction.
  assert.deepEqual(session.writes, [],
    'a prediction is not a turn: no session append, no plugin record, no reasoning in the log')
})

// ------------------------------------------------------------------ harness

function fakeCtx(services = {}) {
  const handlers = new Map()
  const provided = { ...services }
  const disposers = []
  return {
    reflect: { provide(name, value) { provided[name] = value } },
    on(name, fn) { const list = handlers.get(name) ?? []; list.push(fn); handlers.set(name, list) },
    effect(fn) { const cleanup = typeof fn === 'function' ? fn() : fn; if (typeof cleanup === 'function') disposers.push(cleanup) },
    get(name) { return provided[name] },
    llm: services.llm,
    logger: { warn() {} },
    fire(name, ...args) { for (const fn of handlers.get(name) ?? []) fn(...args) },
    dispose() { for (const fn of disposers) fn() },
  }
}

let seq = 0
let lastSeq = -1
function userMsg(text) {
  return { id: 'm' + (++seq), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] }
}
function assistantMsg(text) {
  return {
    id: 'm' + (++seq), role: 'assistant',
    source: { kind: 'model', provider: 'deepseek', model: 'v4.1-flash' },
    content: [{ type: 'text', text }],
  }
}
function endEvent() {
  lastSeq = ++seq
  return { type: 'turn/end', seq: lastSeq, time: Date.now(), data: { turn: 0, reason: { kind: 'completed' } } }
}
function fakeSession(id, messages) {
  const writes = []
  return {
    id,
    writes,
    deriveMessages: () => messages,
    requestHeader: () => ({ config: { provider: 'deepseek', model: 'v4.1-flash' } }),
    append(...args) { writes.push(['append', ...args]) },
    appendPluginRecord(...args) { writes.push(['plugin-record', ...args]) },
  }
}