/**
 * The Host half end to end: `session/event` in, `predictSettings/*` RPC out.
 */

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

const {
  apply, PredictSettings, contentText, rebuildConversation, trackEvent, sessionIdOf, PREDICTION_PROMPT,
  PREDICTION_TIMEOUT_MS,
} = await import('../lib/index.js')


function fakeCtx(services = {}, { principal } = {}) {
  const handlers = new Map()
  const provided = { ...services }
  const disposers = []
  return {
    handlers,
    reflect: { provide(name, value) { provided[name] = value } },
    invocation: principal === undefined ? undefined : { peer: { principal } },
    on(name, fn) { const list = handlers.get(name) ?? []; list.push(fn); handlers.set(name, list) },
    effect(fn) { const cleanup = typeof fn === 'function' ? fn() : fn; if (typeof cleanup === 'function') disposers.push(cleanup) },
    get(name) { return provided[name] },
    llm: services.llm,
    emit() {},
    logger: { warn() {} },
    fire(name, ...args) { for (const fn of handlers.get(name) ?? []) fn(...args) },
    dispose() { for (const fn of disposers) fn() },
    provided,
  }
}

let seq = 0
const defModel = { currentSelection: () => ({ provider: 'p', model: 'm' }) }
function userMsg(text, kind = 'user') {
  return { id: 'm' + (++seq), role: 'user', source: { kind }, content: [{ type: 'text', text }] }
}
function assistantMsg(text) {
  return {
    id: 'm' + (++seq), role: 'assistant',
    source: { kind: 'model', provider: 'p', model: 'm' },
    content: [{ type: 'text', text }],
  }
}
function ev(type, data, extra = {}) {
  return { type, seq: seq++, time: Date.now(), data, surfaceOp: 'append', ...extra }
}
const userEvent = (text, kind) => ev('user/message', userMsg(text, kind))
const assistantEvent = (text) => ev('assistant/message', {
  message: assistantMsg(text), turn: 0, step: 0,
})
let lastEnd = -1
const endEvent = (reason = 'completed') => { const e = ev('turn/end', { turn: 0, reason: { kind: reason } }); lastEnd = e.seq; return e }
const startEvent = () => ev('turn/start', { turn: 0 })

function fakeSession(id, messages, header) {
  return {
    id,
    deriveMessages: () => messages,
    requestHeader: () => header,
  }
}

function fakeLlm(text = 'next line', { fail } = {}) {
  const calls = []
  return {
    calls,
    prepareCall: async (route, signal) => {
      calls.push(route)
      if (fail === true) throw new Error('boom')
      return {
        config: { ...route, prepared: true },
        stream: async function* () { yield { type: 'text-delta', text } },
      }
    },
  }
}

const sessionTurn = (ctx, session, events) => { for (const e of events) ctx.fire('session/event', session, e) }

/**
 * A stream that is a legal async iterable AND never produces anything.
 *
 * The old tests used `stream: () => new Promise(() => {})`. A promise is not an
 * async iterable, so `for await` reaches a TypeError as soon as the promise
 * settles — the "hang" the test believed it was modelling was really an
 * exception waiting for a resolution that never came. This generator hangs for
 * the same reason a real adapter would: it is waiting on the provider.
 */
function pendingStream() {
  return (async function* () { await new Promise(() => {}) })()
}


test('the service registers and exposes the original getter contract', function () {
  const ctx = fakeCtx({ llm: fakeLlm(), agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  assert.ok(service instanceof PredictSettings)
  assert.equal(service.enabled(), true)
  assert.equal(service.pinnedModel(), '')
})

test('the first completed turn does not call the model', async function () {
  const llm = fakeLlm()
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const session = fakeSession('s1', [userMsg('hi')])
  sessionTurn(ctx, session, [userEvent('hi'), assistantEvent('ok'), endEvent()])
  const service = ctx.get('predictSettings')
  const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(out.text, null)
  assert.equal(out.reason, 'skipped:first-turn')
  assert.equal(llm.calls.length, 0)
})

test('a second turn predicts over the rebuilt conversation', async function () {
  const llm = fakeLlm('run the tests')
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const messages = [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')]
  const session = fakeSession('s1', messages)
  sessionTurn(ctx, session, [endEvent()])
  const service = ctx.get('predictSettings')
  const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(out.text, 'run the tests')
  assert.equal(out.sessionId, 's1')
  assert.equal(out.turnSeq, lastEnd)
  assert.equal(llm.calls.length, 1)
})

test('route: pinned wins, then agent selection, then header, then default', async function () {
  const llm = fakeLlm('x')
  const agents = { get: (id) => id === 's1' ? { id: 's1' } : undefined, selectionFor: () => ({ current: { provider: 'agent-p', model: 'agent-m' } }) }
  const agentDefaultModel = { currentSelection: () => ({ provider: 'def-p', model: 'def-m' }) }
  const ctx = fakeCtx({ llm, agents, agentDefaultModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')],
    { config: { provider: 'hdr-p', model: 'hdr-m' } })

  sessionTurn(ctx, session, [endEvent()])
  await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.deepEqual(llm.calls.at(-1), { provider: 'agent-p', model: 'agent-m' })

  service.configure({ settings: undefined, enabled: true, pinnedModel: 'pin/pinned' })
  sessionTurn(ctx, session, [endEvent()])
  await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.deepEqual(llm.calls.at(-1), { provider: 'pin', model: 'pinned' })

  service.configure({ enabled: true, pinnedModel: 'not-a-route' })
  sessionTurn(ctx, session, [endEvent()])
  await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.deepEqual(llm.calls.at(-1), { provider: 'agent-p', model: 'agent-m' })
})

test('route falls back to requestHeader then agentDefaultModel', async function () {
  const llm = fakeLlm('x')
  const agentDefaultModel = { currentSelection: () => ({ provider: 'def-p', model: 'def-m' }) }
  const ctx = fakeCtx({ llm, agentDefaultModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const messages = [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')]

  const withHeader = fakeSession('s1', messages, { config: { provider: 'hdr-p', model: 'hdr-m' } })
  sessionTurn(ctx, withHeader, [endEvent()])
  await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.deepEqual(llm.calls.at(-1), { provider: 'hdr-p', model: 'hdr-m' })

  const bare = fakeSession('s2', messages, undefined)
  sessionTurn(ctx, bare, [endEvent()])
  await service.suggestion({ sessionId: 's2', turnSeq: lastEnd })
  assert.deepEqual(llm.calls.at(-1), { provider: 'def-p', model: 'def-m' })
})

test('configure(false) stops predicting and aborts a pending task', async function () {
  const llm = fakeLlm('x')
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  service.configure({ enabled: false })
  sessionTurn(ctx, session, [endEvent()])
  const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(out.reason, 'skipped:disabled')
  assert.equal(llm.calls.length, 0)
})

test('a dismissal skips exactly the next completed turn', async function () {
  const llm = fakeLlm('y')
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  service.dismiss({ sessionId: 's1' })
  sessionTurn(ctx, session, [endEvent()])
  const first = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(first.reason, 'skipped:dismissed-last-turn')
  assert.equal(llm.calls.length, 0)
  sessionTurn(ctx, session, [endEvent()])
  const second = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(second.text, 'y')
  assert.equal(llm.calls.length, 1)
})

test('three failures arm a ten-turn cooldown', async function () {
  const llm = fakeLlm('x', { fail: true })
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  for (let i = 0; i < 3; i += 1) {
    sessionTurn(ctx, session, [endEvent()])
    const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
    assert.equal(out.text, null)
  }
  assert.equal(llm.calls.length, 3)
  sessionTurn(ctx, session, [endEvent()])
  const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(out.reason, 'skipped:cooldown')
  assert.equal(llm.calls.length, 3)
})

test('a superseded wait resolves safe and the stale task cannot write', async function () {
  let release
  const gate = new Promise((r) => { release = r })
  const llm = {
    calls: [],
    prepareCall: async (route) => {
      llm.calls.push(route)
      return {
        config: route,
        stream: async function* () { await gate; yield { type: 'text', text: 'stale' } },
      }
    },
  }
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  sessionTurn(ctx, session, [endEvent()])
  const waiting = service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  sessionTurn(ctx, session, [userEvent('new line'), startEvent()])
  release()
  const stale = await waiting
  assert.equal(stale.text, null)
  assert.equal(stale.reason, 'superseded')
})

test('caller cancellation releases the waiter, not the shared task', async function () {
  const llm = fakeLlm('x')
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  sessionTurn(ctx, session, [endEvent()])
  const controller = new AbortController()
  const waiting = service.suggestion({ sessionId: 's1', turnSeq: lastEnd }, controller.signal)
  controller.abort()
  assert.equal((await waiting).reason, 'cancelled')
  const again = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(again.text, 'x')
})

test('session/disposed drops the session state', async function () {
  const ctx = fakeCtx({ llm: fakeLlm(), agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a')])
  sessionTurn(ctx, session, [userEvent('a')])
  ctx.fire('session/disposed', session)
  const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(out.reason, 'unknown-session')
})

test('malformed wire input is rejected, never trusted', async function () {
  const ctx = fakeCtx({ llm: fakeLlm(), agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  for (const bad of ['x', 5, null, []]) {
    assert.throws(() => service.configure(bad))
  }
  assert.throws(() => service.configure({ enabled: 1 }))
  assert.throws(() => service.configure({ pinnedModel: 5 }))
  await assert.rejects(() => service.suggestion({ sessionId: 5, turnSeq: lastEnd }))
  await assert.rejects(() => service.suggestion({ sessionId: 's', turnSeq: '0' }))
  assert.throws(() => service.dismiss({}))
})

test('a non-owner principal is refused', async function () {
  const ctx = fakeCtx({ llm: fakeLlm(), agentDefaultModel: defModel }, { principal: { kind: 'guest' } })
  apply(ctx)
  const service = ctx.get('predictSettings')
  assert.throws(() => service.configure({ enabled: true }), /owner/)
  await assert.rejects(() => service.suggestion({ sessionId: 's', turnSeq: lastEnd }))
})

test('incremental tracking counts only real user messages', function () {
  const state = { turns: [], userTurns: 0 }
  trackEvent(state, userEvent('hello'))
  assert.equal(state.userTurns, 1)
  trackEvent(state, userEvent('ctx', 'runtime-context'))
  assert.equal(state.userTurns, 1, 'automatic context must not count')
  trackEvent(state, { ...userEvent('gone'), surfaceOp: 'remove' })
  assert.equal(state.userTurns, 1, 'removals must not count')
  trackEvent(state, assistantEvent('fine'))
  assert.equal(state.turns.length, 2)
  assert.equal(contentText([{ type: 'reasoning', text: 'r' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }]), 'ab')
  assert.equal(contentText(undefined), '')
})

// REGRESSION: every turn looked like the first one, so no prediction ever ran.
//
// The host's message source map declares `'user-rpc': { kind: 'user'; rpcId }`:
// the SOURCE KEY is `user-rpc`, but the KIND is `'user'`. Both filters used to
// test the kind against the key (`kind !== 'user-rpc'`), dropping every real
// composer message. `userTurns` stayed 0, `shouldPredict` answered
// `first-turn` on every turn, and the feature was silently dead. The fixture
// below is the host's REAL shape (key user-rpc / kind user); it is the case
// the old code could not count.
test('a composer message (key user-rpc, kind user) counts toward the first-turn rule', function () {
  const source = { kind: 'user', rpcId: 'req-1', clientTimeZone: 'Asia/Shanghai' }
  const state = { turns: [], userTurns: 0 }
  trackEvent(state, {
    type: 'user/message', seq: 1, surfaceOp: 'append',
    data: { source, content: [{ type: 'text', text: 'hello' }] },
  })
  assert.equal(state.userTurns, 1)

  const rebuilt = { turns: [], userTurns: 0 }
  rebuildConversation(rebuilt, {
    deriveMessages: () => [{ id: 'm1', role: 'user', source, content: [{ type: 'text', text: 'hello' }] }],
  })
  assert.equal(rebuilt.userTurns, 1, 'the turn-end path (deriveMessages) must count the same message')
})

test('the prompt text is unchanged', function () {
  assert.match(PREDICTION_PROMPT, /ONLY that line/)
})

test('plugin disposal aborts pending work', async function () {
  let released = false
  const llm = { calls: 0, prepareCall: async () => ({ config: {}, stream: (async function* () { await new Promise((r) => setTimeout(r, 50)); released = true; yield { type: 'text', text: 'x' } })() }) }
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  sessionTurn(ctx, session, [endEvent()])
  ctx.dispose()
  const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(out.text, null)
})

test('sessionIdOf reads the session subject', function () {
  assert.equal(sessionIdOf({ id: 's1' }), 's1')
  assert.equal(sessionIdOf('s2'), 's2')
  assert.equal(sessionIdOf({}), null)
})

test('a signal-ignoring adapter still hits exactly the prediction timeout', async function (t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let capturedSignal
  const llm = {
    calls: 0,
    prepareCall: async (route, signal) => {
      llm.calls += 1
      capturedSignal = signal
      return { config: route, stream: () => pendingStream() }
    },
  }
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  sessionTurn(ctx, session, [endEvent()])
  const waiting = service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  t.mock.timers.tick(19_999)
  assert.equal(capturedSignal.aborted, false)
  t.mock.timers.tick(1)
  assert.equal(capturedSignal.aborted, true)
  const out = await waiting
  assert.equal(out.text, null)
  assert.equal(out.reason, 'timeout')
})

test('a successful call leaves no live timeout', async function () {
  const live = new Set()
  const realSet = globalThis.setTimeout
  const realClear = globalThis.clearTimeout
  globalThis.setTimeout = (fn, ms, ...args) => {
    const handle = realSet(() => { live.delete(handle); fn() }, ms, ...args)
    live.add(handle)
    return handle
  }
  globalThis.clearTimeout = (handle) => { live.delete(handle); realClear(handle) }
  try {
    const llm = fakeLlm('x')
    const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
    apply(ctx)
    const service = ctx.get('predictSettings')
    const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
    sessionTurn(ctx, session, [endEvent()])
    const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
    assert.equal(out.text, 'x')
    await new Promise((r) => realSet(r, 5))
    assert.equal(live.size, 0)
  } finally {
    globalThis.setTimeout = realSet
    globalThis.clearTimeout = realClear
  }
})

test('invalidation releases the waiter even when the adapter ignores the signal', async function () {
  const llm = {
    calls: 0,
    prepareCall: async () => {
      llm.calls += 1
      return { config: {}, stream: () => pendingStream() }
    },
  }
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  sessionTurn(ctx, session, [endEvent()])
  const waiting = service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  sessionTurn(ctx, session, [userEvent('new')])
  const out = await Promise.race([waiting, new Promise((r) => setTimeout(() => r('hung'), 500))])
  assert.notEqual(out, 'hung')
  assert.equal(out.reason, 'superseded')
  assert.equal(out.text, null)
})

test('a prepareCall that never settles still times out', async function (t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0
  const llm = {
    prepareCall: (route, signal) => {
      calls += 1
      return new Promise(() => {})
    },
  }
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  sessionTurn(ctx, session, [endEvent()])
  const waiting = service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  t.mock.timers.tick(PREDICTION_TIMEOUT_MS)
  const out = await waiting
  assert.equal(calls, 1)
  assert.equal(out.text, null)
  assert.equal(out.reason, 'timeout', 'the deadline must cover prepareCall, not only the stream')
})

test('a completed prediction leaves no abort listener behind', async function () {
  // `race()` cannot cancel the losing promise, so the abort waiter is the one
  // listener that outlives a successful call unless it is disarmed. Counting
  // add/remove pairs is the only way to see that from outside.
  const live = new Map()
  const realAdd = AbortSignal.prototype.addEventListener
  const realRemove = AbortSignal.prototype.removeEventListener
  AbortSignal.prototype.addEventListener = function (type, fn, options) {
    if (type === 'abort') live.set(this, (live.get(this) ?? 0) + 1)
    return realAdd.call(this, type, fn, options)
  }
  AbortSignal.prototype.removeEventListener = function (type, fn, options) {
    if (type === 'abort') live.set(this, (live.get(this) ?? 0) - 1)
    return realRemove.call(this, type, fn, options)
  }
  try {
    const ctx = fakeCtx({ llm: fakeLlm('x'), agentDefaultModel: defModel })
    apply(ctx)
    const service = ctx.get('predictSettings')
    const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
    sessionTurn(ctx, session, [endEvent()])
    const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
    assert.equal(out.text, 'x')
    for (const [signal, count] of live) {
      assert.equal(count, 0, 'every abort listener must be removed once the call settles')
    }
  } finally {
    AbortSignal.prototype.addEventListener = realAdd
    AbortSignal.prototype.removeEventListener = realRemove
  }
})

test('the cooldown is exactly ten completed turns', async function () {
  const llm = fakeLlm('x', { fail: true })
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  for (let i = 0; i < 3; i += 1) {
    sessionTurn(ctx, session, [endEvent()])
    await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  }
  assert.equal(llm.calls.length, 3)
  for (let i = 0; i < 10; i += 1) {
    sessionTurn(ctx, session, [endEvent()])
    const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
    assert.equal(out.reason, 'skipped:cooldown')
  }
  assert.equal(llm.calls.length, 3)
  sessionTurn(ctx, session, [endEvent()])
  const out = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(out.reason, 'error')
  assert.equal(llm.calls.length, 4)
})

test('any settings change invalidates the previous result and pending work', async function () {
  const llm = fakeLlm('x')
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const session = fakeSession('s1', [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')])
  sessionTurn(ctx, session, [endEvent()])
  const first = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(first.text, 'x')
  service.configure({ enabled: true, pinnedModel: 'pin/m' })
  const again = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(again.text, null)
  assert.equal(again.reason, 'superseded')
  sessionTurn(ctx, session, [endEvent()])
  const next = await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  assert.equal(next.text, 'x')
  assert.deepEqual(llm.calls.at(-1), { provider: 'pin', model: 'm' })
})

test('the request stream carries the prompt, ids, sources and no replayState', async function () {
  let captured
  const llm = {
    calls: [],
    prepareCall: async (route) => {
      llm.calls.push(route)
      return {
        config: { ...route },
        stream: (req) => {
          captured = req
          return (async function* () { yield { type: 'text-delta', text: 'y' } })()
        },
      }
    },
  }
  const ctx = fakeCtx({ llm, agentDefaultModel: defModel })
  apply(ctx)
  const service = ctx.get('predictSettings')
  const replayed = { id: 'h', role: 'assistant', source: { kind: 'model', provider: 'orig-p', model: 'orig-m', replayState: { foo: 1 } }, content: [{ type: 'text', text: 'b' }] }
  const session = fakeSession('s1', [userMsg('a'), replayed, userMsg('c'), assistantMsg('d')])
  service.configure({ enabled: true, pinnedModel: 'pin/pinned' })
  sessionTurn(ctx, session, [endEvent()])
  await service.suggestion({ sessionId: 's1', turnSeq: lastEnd })
  const { PREDICTION_PROMPT } = await import('../lib/index.js')
  const messages = captured.messages
  assert.equal(messages[0].role, 'system')
  assert.equal(messages[0].content[0].text, PREDICTION_PROMPT)
  for (const message of messages) {
    assert.equal(typeof message.id, 'string')
    assert.equal(typeof message.source, 'object')
    assert.notEqual(message.source, null)
  }
  const assistant = messages.find((m) => m.role === 'assistant')
  assert.equal(assistant.source.provider, 'orig-p')
  assert.equal(assistant.source.model, 'orig-m')
  assert.equal('replayState' in assistant.source, false)
  assert.deepEqual(llm.calls.at(-1), { provider: 'pin', model: 'pinned' })
})

test('owner passes; malformed invocation and non-owner reject on every verb', async function () {
  const ownerCtx = fakeCtx({ llm: fakeLlm(), agentDefaultModel: defModel }, { principal: { kind: 'owner' } })
  apply(ownerCtx)
  const owner = ownerCtx.get('predictSettings')
  owner.configure({ enabled: false })
  owner.dismiss({ sessionId: 's' })
  assert.equal(typeof (await owner.suggestion({ sessionId: 's', turnSeq: 0 })).reason, 'string')
  for (const invocation of [{ peer: { principal: { kind: 'guest' } } }, { peer: {} }, { peer: null }, {}]) {
    const ctx = fakeCtx({ llm: fakeLlm(), agentDefaultModel: defModel })
    ctx.invocation = invocation
    apply(ctx)
    const service = ctx.get('predictSettings')
    assert.throws(() => service.configure({ enabled: true }))
    assert.throws(() => service.dismiss({ sessionId: 's' }))
    await assert.rejects(() => service.suggestion({ sessionId: 's', turnSeq: 0 }))
  }
})
