import { test } from 'node:test'
import assert from 'node:assert/strict'

const { createLifecycle } = await import('../client/src/lifecycle.js')

function fakeDoc() {
  const listeners = new Map()
  const editor = {
    innerText: '',
    closest: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 20 }),
    focus() {},
    dispatchEvent(event) { editor.lastEvent = event; return true },
    lastEvent: null,
  }
  return {
    editor,
    appended: [],
    listeners,
    createElement: () => ({ setAttribute() {}, style: {}, textContent: '', remove() { this.removed = true } }),
    querySelector: (sel) => sel === '[data-composer-input]' ? editor : null,
    body: { append(el) { fakeDocInstance.appended.push(el) } },
    head: { append() {} },
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? []
      list.push(fn)
      listeners.set(type, list)
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) ?? []
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    },
    emit(type, event) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event)
    },
    defaultView: {
      getComputedStyle: () => ({}),
      DataTransfer: class { setData(t, v) { this.data = v } },
      ClipboardEvent: class { constructor(type, init) { this.type = type; this.clipboardData = init.clipboardData } },
    },
  }
}
let fakeDocInstance

function fakeStore(initial) {
  const listeners = new Set()
  return {
    value: initial,
    getSnapshot() { return this.value },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(value) { this.value = value; for (const fn of [...listeners]) fn() },
  }
}

function fakeSource(initial = []) {
  const listeners = new Set()
  const source = {
    entries: [...initial],
    change: { kind: 'replace', entries: [...initial] },
    getSnapshot: () => ({ entries: source.entries, change: source.change, revision: 0 }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    listenerCount: () => listeners.size,
    push(entry) {
      source.entries.push(entry)
      source.change = { kind: 'append', entries: [entry] }
      for (const fn of [...listeners]) fn()
    },
  }
  return source
}

function fakeCurrent(key = 's1') {
  const current = fakeStore({ key })
  current.set = (key) => { current.value = { key }; for (const fn of [...current.listenersSet]) fn() }
  return current
}

function fakeCurrentFixed(key = 's1') {
  const store = fakeStore({ key })
  return store
}

function fakeCtx({ rpc, sources, current, generation, remote, rowProps }) {
  const emitted = []
  const disposers = []
  const gen = generation ?? fakeStore({ id: 1, host: 'h' })
  const catalogCalls = []
  const rem = remote ?? {
    session: {
      modelCatalog: () => { catalogCalls.push(1); return Promise.resolve({ ok: true, value: { groups: [] } }) },
    },
  }
  return {
    emitted,
    rowProps,
    catalogCalls,
    generation: gen,
    remote: rem,
    ctx: {
      locale: { register() {} },
      slots: {
        inject(name, fn) { fn() },
        register: (opts) => { rowProps.value = typeof opts.inject === 'function' ? opts.inject() : {}; return {} },
      },
      effect(fn) { const c = fn(); if (typeof c === 'function') disposers.push(c) },
      get(name) {
        if (name === 'connection') return { rpc, generation: gen }
        if (name === 'sessions') return { binding: (id) => sources[id] === undefined ? undefined : { eventSource: sources[id] } }
        if (name === 'uiSession') return { current }
        if (name === 'remote') return rem
        return undefined
      },
      on() {},
      emit: (name, payload) => emitted.push([name, payload]),
    },
    dispose() { for (const fn of disposers) fn() },
  }
}

function fakeRpc(value = { sessionId: 's1', turnSeq: 0, text: 'next', reason: null }) {
  const rpc = {
    calls: [],
    next: value,
    call: async (channel, endpoint, payload, signal) => {
      rpc.calls.push([channel, endpoint, payload])
      if (rpc.throw === true) throw new Error('down')
      if (rpc.result !== undefined) return rpc.result
      return { ok: true, value: typeof rpc.next === 'function' ? rpc.next() : rpc.next }
    },
  }
  return rpc
}

const React = { createElement: () => ({}), useSyncExternalStore: (s, g) => g(), useState: (v) => [v, () => {}], useEffect: () => {} }
const mkStorage = () => { const d = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v }, data: d } }

function boot({ rpc, sources, current, generation, remote, storage }) {
  const rowProps = { value: undefined }
  const fx = fakeCtx({ rpc, sources, current, generation, remote, rowProps })
  globalThis.document = fakeDocInstance
  globalThis.localStorage = storage ?? mkStorage()
  createLifecycle({ React, primitives: null })(fx.ctx)
  return { ...fx, rowProps }
}

test('settings reach the host over RPC, never ctx.emit', async function () {
  const rpc = fakeRpc()
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  await new Promise((r) => setTimeout(r, 10))
  const configure = rpc.calls.filter((c) => c[1] === 'predictSettings/configure')
  assert.ok(configure.length >= 1)
  assert.deepEqual(configure[0], ['/api', 'predictSettings/configure',
    { args: { settings: { enabled: true, pinnedModel: '' } } }])
  assert.deepEqual(fx.emitted, [])
  fx.dispose()
})

test('the published value is the store snapshot, even when storage throws', async function () {
  const rpc = fakeRpc()
  const storage = { getItem: () => null, setItem: () => { throw new Error('denied') } }
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current, storage })
  fx.rowProps.value.setEnabled(false)
  await new Promise((r) => setTimeout(r, 10))
  const configure = rpc.calls.filter((c) => c[1] === 'predictSettings/configure')
  assert.deepEqual(configure.at(-1)[2], { args: { settings: { enabled: false, pinnedModel: '' } } })
  fx.dispose()
})

test('queued settings serialize; the newest write wins', async function () {
  const rpc = fakeRpc()
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  fx.rowProps.value.setPinnedModel('a/one')
  fx.rowProps.value.setPinnedModel('b/two')
  await new Promise((r) => setTimeout(r, 10))
  const configure = rpc.calls.filter((c) => c[1] === 'predictSettings/configure')
  assert.deepEqual(configure.at(-1)[2], { args: { settings: { enabled: true, pinnedModel: 'b/two' } } })
  fx.dispose()
})

test('a suggestion waits for the configuration write already on the wire', async function () {
  // THE RACE. `turn/end` can land while the FIRST `configure` is still in
  // flight. Asking for a suggestion then reached the host before the pinned
  // model did, so the prediction ran with the host's default settings.
  const calls = []
  let releaseConfigure = null
  const rpc = {
    call: (channel, endpoint, payload) => {
      calls.push([channel, endpoint, payload])
      if (endpoint === 'predictSettings/configure') {
        return new Promise((resolve) => { releaseConfigure = () => resolve({ ok: true }) })
      }
      return Promise.resolve({ ok: true, value: { sessionId: 's1', turnSeq: 3, text: 'x', reason: null } })
    },
  }
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: { reason: { kind: 'completed' } } } })
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(calls.filter((c) => c[1] === 'predictSettings/suggestion').length, 0,
    'the suggestion must not leave before the host has the selected model')
  releaseConfigure()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(calls.filter((c) => c[1] === 'predictSettings/suggestion').length, 1)
  fx.dispose()
})

test('a configuration that keeps failing drops the suggestion instead of using defaults', async function () {
  const calls = []
  const rpc = {
    call: (channel, endpoint, payload) => {
      calls.push([channel, endpoint, payload])
      if (endpoint === 'predictSettings/configure') {
        return Promise.resolve({ ok: false, error: { code: 'unavailable' } })
      }
      return Promise.resolve({ ok: true, value: { sessionId: 's1', turnSeq: 3, text: 'x', reason: null } })
    },
  }
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: { reason: { kind: 'completed' } } } })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(calls.filter((c) => c[1] === 'predictSettings/configure').length, 2,
    'exactly one serial retry, then give up')
  assert.equal(calls.filter((c) => c[1] === 'predictSettings/suggestion').length, 0,
    'fail closed: a prediction must not run with settings the host rejected')
  fx.dispose()
})

test('a completed turn asks for a suggestion and shows it', async function () {
  const rpc = fakeRpc({ sessionId: 's1', turnSeq: 3, text: 'now fix B', reason: null })
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: { reason: { kind: 'completed' } } } })
  await new Promise((r) => setTimeout(r, 10))
  const calls = rpc.calls.filter((c) => c[1] === 'predictSettings/suggestion')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], ['/api', 'predictSettings/suggestion',
    { args: { request: { sessionId: 's1', turnSeq: 3 } } }])
  assert.equal(fakeDocInstance.appended.length, 1)
  fx.dispose()
})

test('history already in the feed is never replayed', async function () {
  const rpc = fakeRpc()
  const sources = { s1: fakeSource([{ event: { type: 'turn/end', seq: 9, data: {} } }]) }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(rpc.calls.filter((c) => c[1] === 'predictSettings/suggestion').length, 0)
  fx.dispose()
})

test('a suggestion that lands after a session switch is not drawn', async function () {
  let release
  const rpc = {
    calls: [],
    call: (channel, endpoint, payload) => {
      rpc.calls.push([channel, endpoint, payload])
      if (endpoint === 'predictSettings/suggestion') {
        return new Promise((r) => { release = () => r({ ok: true, value: { sessionId: 's1', turnSeq: 3, text: 'stale', reason: null } }) })
      }
      return Promise.resolve({ ok: true, value: {} })
    },
  }
  const sources = { s1: fakeSource(), s2: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: {} } })
  await new Promise((r) => setTimeout(r, 5))
  current.set({ key: 's2' })
  release()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(fakeDocInstance.appended.length, 0)
  fx.dispose()
})

test('a new user message retracts the pending suggestion wait', async function () {
  let aborted = false
  const rpc = {
    calls: [],
    call: (channel, endpoint, payload, signal) => {
      rpc.calls.push([channel, endpoint, payload])
      if (endpoint === 'predictSettings/suggestion') {
        return new Promise((r, j) => {
          signal?.addEventListener('abort', () => { aborted = true; j(new Error('aborted')) })
        })
      }
      return Promise.resolve({ ok: true, value: {} })
    },
  }
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: {} } })
  await new Promise((r) => setTimeout(r, 5))
  sources.s1.push({ event: { type: 'user/message', seq: 4, data: { source: { kind: 'user' }, content: [] } } })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(aborted, true)
  fx.dispose()
})

test('typing in the composer before the reply lands shows nothing', async function () {
  let release
  const rpc = {
    calls: [],
    call: (channel, endpoint, payload) => {
      rpc.calls.push([channel, endpoint, payload])
      if (endpoint === 'predictSettings/suggestion') {
        return new Promise((r) => { release = () => r({ ok: true, value: { sessionId: 's1', turnSeq: 3, text: 'stale', reason: null } }) })
      }
      return Promise.resolve({ ok: true, value: {} })
    },
  }
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: {} } })
  await new Promise((r) => setTimeout(r, 5))
  fakeDocInstance.emit('input', { target: fakeDocInstance.editor })
  fakeDocInstance.editor.innerText = ''
  release()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(fakeDocInstance.appended.length, 0)
  fx.dispose()
})

test('disabling stops asking; the ghost never draws', async function () {
  const rpc = fakeRpc()
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  fx.rowProps.value.setEnabled(false)
  await new Promise((r) => setTimeout(r, 10))
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: {} } })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(rpc.calls.filter((c) => c[1] === 'predictSettings/suggestion').length, 0)
  assert.equal(fakeDocInstance.appended.length, 0)
  fx.dispose()
})

test('an RPC failure is safe: nothing drawn, debug carries a reason', async function () {
  const rpc = fakeRpc()
  rpc.result = { ok: false, error: { code: 'x', message: 'no' } }
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: {} } })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(fakeDocInstance.appended.length, 0)
  assert.equal(globalThis.__dshPredictDebug?.reason, 'error')
  fx.dispose()
})

test('a failed configure is retried before the next request and gates it', async function () {
  let configureOk = false
  const rpc = {
    calls: [],
    call: async (channel, endpoint, payload) => {
      rpc.calls.push([channel, endpoint, payload])
      if (endpoint === 'predictSettings/configure') {
        return configureOk ? { ok: true, value: {} } : { ok: false, error: { code: 'x', message: 'no' } }
      }
      return { ok: true, value: { sessionId: 's1', turnSeq: 3, text: 'x', reason: null } }
    },
  }
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  await new Promise((r) => setTimeout(r, 10))
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: {} } })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(rpc.calls.filter((c) => c[1] === 'predictSettings/suggestion').length, 0, 'fail closed while dirty')
  configureOk = true
  fx.generation.set({ id: 2, host: 'h' })
  await new Promise((r) => setTimeout(r, 10))
  const configure = rpc.calls.filter((c) => c[1] === 'predictSettings/configure')
  assert.ok(configure.length >= 2, 'republished on the new generation')
  sources.s1.push({ event: { type: 'turn/end', seq: 4, data: {} } })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(rpc.calls.filter((c) => c[1] === 'predictSettings/suggestion').length, 1)
  fx.dispose()
})

test('a reconnect rebinds the feed without replaying history', async function () {
  const rpc = fakeRpc()
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  await new Promise((r) => setTimeout(r, 10))
  sources.s1.push({ event: { type: 'turn/end', seq: 5, data: {} } })
  fx.generation.set({ id: 2, host: 'h' })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(rpc.calls.filter((c) => c[1] === 'predictSettings/suggestion').length, 0,
    'the pre-reconnect turn/end was not replayed')
  assert.equal(sources.s1.listenerCount(), 1, 'one live feed subscription')
  sources.s1.push({ event: { type: 'turn/end', seq: 6, data: {} } })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(rpc.calls.filter((c) => c[1] === 'predictSettings/suggestion').length, 1)
  fx.dispose()
})

test('disposal sends no late configure and clears the ghost', async function () {
  const rpc = fakeRpc({ sessionId: 's1', turnSeq: 3, text: 'x', reason: null })
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: {} } })
  await new Promise((r) => setTimeout(r, 10))
  const before = rpc.calls.length
  fx.dispose()
  fx.rowProps.value.setEnabled(false)
  sources.s1.push({ event: { type: 'turn/end', seq: 4, data: {} } })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(rpc.calls.length, before)
  fx.dispose()
})

test('accepting inserts the text and sends nothing', async function () {
  const rpc = fakeRpc({ sessionId: 's1', turnSeq: 3, text: 'accepted line', reason: null })
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: {} } })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(fakeDocInstance.appended.length, 1)
  for (const fn of fakeDocInstance.listeners.get('keydown') ?? []) {
    fn({ key: 'Tab', preventDefault() {}, stopPropagation() {} })
  }
  assert.equal(fakeDocInstance.editor.lastEvent?.type, 'paste')
  assert.equal(rpc.calls.filter((c) => /prompt|send/.test(c[1])).length, 0)
  fx.dispose()
})

test('dismissal reports the session over RPC', async function () {
  const rpc = fakeRpc({ sessionId: 's1', turnSeq: 3, text: 'later', reason: null })
  const sources = { s1: fakeSource() }
  const current = fakeCurrentFixed('s1')
  fakeDocInstance = fakeDoc()
  const fx = boot({ rpc, sources, current })
  sources.s1.push({ event: { type: 'turn/end', seq: 3, data: {} } })
  await new Promise((r) => setTimeout(r, 10))
  for (const fn of fakeDocInstance.listeners.get('keydown') ?? []) {
    fn({ key: 'a', preventDefault() {}, stopPropagation() {} })
  }
  await new Promise((r) => setTimeout(r, 10))
  const dismiss = rpc.calls.filter((c) => c[1] === 'predictSettings/dismiss')
  assert.equal(dismiss.length, 1)
  assert.deepEqual(dismiss[0], ['/api', 'predictSettings/dismiss',
    { args: { request: { sessionId: 's1' } } }])
  fx.dispose()
})
