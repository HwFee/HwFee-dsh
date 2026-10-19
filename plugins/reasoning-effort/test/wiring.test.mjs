/**
 * Wiring: can the row actually reach the host's Remote namespace?
 *
 * THE REGRESSION THIS FILE EXISTS FOR. `dsh-api-gateway` mounts every Remote
 * namespace as its OWN Cordis service:
 *
 *     class RemoteNamespaceService extends Service {
 *       constructor(ctx, name) { super(ctx, 'remote.' + name) }
 *     }
 *
 * So `remote.session` is not a property of the `remote` service. Reading it from
 * a fiber that did not inject the dotted name `'remote.session'` makes Cordis
 * throw `cannot get property "remote.session" without inject`. The first
 * version of this plugin injected only `['sessions', 'remote']`, so
 * `loadCatalog()` threw on its very first line, `start()`'s `.catch(() => {})`
 * swallowed it, and the row sat on "Reading the model catalog…" forever —
 * no slider, no message. That is what the user reported as "this slider has no
 * effect".
 *
 * These tests pin all three parts of the fix:
 *   1. the lifecycle injects `remote.session` (not just `remote`);
 *   2. the controller takes the resolved namespace and never throws when the
 *      property read is unavailable;
 *   3. a failed catalog read is recorded and rendered instead of swallowed.
 *
 *   node test/wiring.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createLifecycle } from '../client/src/lifecycle.js'
import { createEffortController } from '../client/src/controller.js'
import { en, makeTranslator } from '../client/src/locales.js'

const t = makeTranslator(en)

// ------------------------------------------------------------- fake React
function fakeReact() {
  const states = new Map()
  let cursor = 0
  return {
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      const next = props || {}
      if (typeof type === 'function') return type(Object.assign({}, next, { children }))
      return { type, props: next, children }
    },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
    useState(initial) {
      const slot = cursor++
      if (!states.has(slot)) states.set(slot, initial)
      return [states.get(slot), (value) => states.set(slot, value)]
    },
    useEffect() {},
    useMemo(fn) { return fn() },
    useRef(value) { return { current: value } },
    beginRender() { cursor = 0 },
  }
}

// ------------------------------------------------------- fake host services
function fakeSessions() {
  const face = {
    getSnapshot: () => ({
      lastUsed: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' },
      next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' },
    }),
    subscribe: () => () => {},
  }
  return {
    list: {
      getSnapshot: () => ({
        ids: ['s1'],
        byId: { s1: { id: 's1', retainedBy: { mainView: 1 }, blank: false, running: false } },
        phase: 'ready',
        projectionsBySession: {},
      }),
      subscribe: () => () => {},
    },
    binding(id) {
      if (id !== 's1') return undefined
      return { sessionId: id, session: { projections: { faceOf: (key) => (key === 'modelSelection' ? face : undefined) } } }
    },
    subagentAddress() { return undefined },
  }
}

/** The `remote` service. `session` is NOT a property — it throws, like Cordis. */
function cordisStyleRemote(overrides) {
  const opts = overrides === undefined ? {} : overrides
  const remote = {
    $on() { if (opts.$onThrows === true) throw new Error('client api: forwarded events require interactions=answer'); return () => {} },
  }
  // Mimic Cordis: a dotted service read from a non-injecting fiber raises.
  Object.defineProperty(remote, 'session', {
    get() { throw new Error('cannot get property "remote.session" without inject') },
    configurable: true,
  })
  return remote
}

function fakeNamespace(overrides) {
  const opts = overrides === undefined ? {} : overrides
  const calls = { catalog: 0, writes: [] }
  const namespace = {
    async modelCatalog() {
      calls.catalog += 1
      if (opts.catalogThrows === true) throw new Error('catalog unavailable')
      return {
        ok: true,
        value: {
          default: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'max' },
          routableProviders: ['magpie'],
          groups: [{
            id: 'magpie',
            name: 'Magpie',
            models: [{
              id: 'group/deepseek-v4.1-flash',
              name: 'Deepseek V4.1 Flash',
              reasoning: {
                efforts: [['low', 'Low'], ['high', 'High'], ['max', 'Max']].map(([id, name]) => ({ id, name })),
                defaultEffort: 'max',
              },
            }],
          }],
          failures: [],
        },
      }
    },
    async selectModel(payload) {
      calls.writes.push(payload)
      return { ok: true, value: { selected: payload } }
    },
  }
  return { namespace, calls }
}

// ----------------------------------------------------- fake Cordis context
/**
 * A context whose `inject` behaves like Cordis: the callback receives a scope
 * exposing ONLY the requested dependencies, and asking for anything else throws.
 */
function fakeCordis(options) {
  const registrations = []
  const injects = []
  const effects = []
  const services = {
    sessions: options.sessions,
    remote: options.remote,
    'remote.session': options.remoteSession,
  }
  const scopeGet = (name) => {
    if (!Object.hasOwn(services, name)) throw new Error(`cannot get property "${name}" without inject`)
    return services[name]
  }
  const scope = {
    get: scopeGet,
    effect(fn, label) { effects.push(label); const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  }
  const slots = {
    inject(name, factory) { return factory() },
    register(options_, component) {
      registrations.push({ name: options_.name, id: options_.id, order: options_.order, component })
      return () => {}
    },
  }
  const ctx = {
    effect(fn, label) { effects.push(label); const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    get: scopeGet,
    inject(deps, callback) {
      injects.push(deps)
      const missing = deps.filter((name) => !Object.hasOwn(services, name) || services[name] === undefined)
      if (missing.length > 0) return () => {}
      return callback(scope)
    },
    slots,
    locale: { register() { return () => {} }, bind: () => (k) => k },
  }
  return { ctx, registrations, injects, effects }
}

/** Render a row component once and collect its visible strings + inputs. */
function render(row, React) {
  React.beginRender()
  const tree = row.component({ t })
  const acc = { text: [], inputs: [] }
  ;(function walk(node) {
    if (node === null || node === undefined) return
    if (typeof node === 'string') { acc.text.push(node); return }
    if (typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node.type === 'input') acc.inputs.push(node)
    walk(node.children)
  })(tree)
  return acc
}

// ------------------------------------------------------------------ tests

test('the lifecycle injects the `remote.session` namespace, not just `remote`', function () {
  // THE ROOT-CAUSE ASSERTION. `remote.session` is a separate dotted Cordis
  // service; without it in the inject list the catalog read throws.
  const { namespace } = fakeNamespace()
  const cordis = fakeCordis({
    sessions: fakeSessions(),
    remote: cordisStyleRemote(),
    remoteSession: namespace,
  })
  const lifecycle = createLifecycle({ React: fakeReact(), primitives: {} })
  lifecycle(cordis.ctx)

  assert.equal(cordis.injects.length, 1, 'expected exactly one nested inject')
  const deps = cordis.injects[0]
  assert.ok(deps.includes('remote.session'),
    'the lifecycle must inject `remote.session`; got ' + JSON.stringify(deps))
  assert.ok(deps.includes('sessions'), 'sessions is required')
  assert.ok(deps.includes('remote'), 'remote is required for $on')
})

test('with the namespace injected the row reaches the catalog and renders a slider', async function () {
  const { namespace, calls } = fakeNamespace()
  const cordis = fakeCordis({
    sessions: fakeSessions(),
    remote: cordisStyleRemote(),
    remoteSession: namespace,
  })
  const React = fakeReact()
  const lifecycle = createLifecycle({ React, primitives: {} })
  lifecycle(cordis.ctx)
  // The catalog read is async; the row re-renders when it lands.
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(calls.catalog, 1, 'modelCatalog must be called once on start')
  const row = cordis.registrations.find((r) => r.name === 'settings.general.item')
  assert.ok(row, 'the settings row must be registered')

  const rendered = render(row, React)
  assert.equal(rendered.inputs.length, 1, 'the row must render a real range input')
  assert.equal(rendered.inputs[0].props.max, 2, 'three advertised levels -> max 2')
  assert.ok(!rendered.text.includes('state.loading'), 'the row must not be stuck loading')
})

test('dragging the slider writes the CURRENT model plus the new effort', async function () {
  const { namespace, calls } = fakeNamespace()
  const cordis = fakeCordis({
    sessions: fakeSessions(),
    remote: cordisStyleRemote(),
    remoteSession: namespace,
  })
  const React = fakeReact()
  const lifecycle = createLifecycle({ React, primitives: {} })
  lifecycle(cordis.ctx)
  await new Promise((resolve) => setImmediate(resolve))

  const row = cordis.registrations.find((r) => r.name === 'settings.general.item')
  const rendered = render(row, React)
  await rendered.inputs[0].props.onChange({ target: { value: '2' } })

  assert.equal(calls.writes.length, 1, 'one write for one drag')
  assert.deepEqual(calls.writes[0], {
    sessionId: 's1',
    provider: 'magpie',
    model: 'group/deepseek-v4.1-flash',
    reasoningEffort: 'max',
  })
})

test('a Cordis-style throwing `remote.session` getter cannot blank the row', async function () {
  // The controller is handed the resolved namespace; the throwing property is
  // never read. This is the exact shape that produced the frozen row before.
  const { namespace, calls } = fakeNamespace()
  const controller = createEffortController({
    remote: cordisStyleRemote(),
    remoteSession: namespace,
    sessions: fakeSessions(),
  })
  controller.start()
  await new Promise((resolve) => setImmediate(resolve))

  const state = controller.getSnapshot()
  assert.equal(state.phase, 'ready', 'the row must be ready, not stuck loading')
  assert.equal(state.catalogStatus, 'ready')
  assert.equal(calls.catalog, 1)
  assert.equal(state.reasoning.efforts.length, 3, 'the stop list comes from the catalog')
  controller.dispose()
})

test('without the namespace the controller degrades to `unsupported` and does not throw', async function () {
  // Hosts that expose no model catalog: the row renders NOTHING (documented),
  // rather than throwing or spinning forever.
  const controller = createEffortController({
    remote: cordisStyleRemote(),
    sessions: fakeSessions(),
  })
  assert.doesNotThrow(function () { controller.start() })
  await new Promise((resolve) => setImmediate(resolve))

  const state = controller.getSnapshot()
  assert.equal(state.catalogStatus, 'unsupported', 'the missing capability is recorded')
  assert.equal(state.reasoning, null, 'no catalog means no level list')
  assert.equal(state.phase, 'ready', 'the session selection is still known')
  // The row therefore takes its N === 0 branch and renders nothing.
  const { buildLevelModel } = await import('../client/src/levels.js')
  assert.equal(buildLevelModel({ reasoning: state.reasoning, selected: state.selected, t }).mode, 'none')

  // And a write is refused rather than sent.
  const result = await controller.setEffort('low')
  assert.equal(result.ok, false)
  controller.dispose()
})

test('a failed catalog read is recorded, never swallowed', async function () {
  const { namespace } = fakeNamespace({ catalogThrows: true })
  const controller = createEffortController({
    remote: cordisStyleRemote(),
    remoteSession: namespace,
    sessions: fakeSessions(),
  })
  controller.start()
  await new Promise((resolve) => setImmediate(resolve))

  const state = controller.getSnapshot()
  // Before the fix this throw escaped the loader and was swallowed by
  // `start()`'s bare `.catch`, leaving catalogStatus on 'idle' forever.
  assert.equal(state.catalogStatus, 'error', 'the failure must be visible in the snapshot')
  controller.dispose()
})

test('a host without forwarded events ($on throws) still registers the row', async function () {
  // `$on` throws when the connection is composed with interactions != answer.
  // Live catalog refresh is optional; losing it must not cost the whole row.
  const { namespace, calls } = fakeNamespace()
  const cordis = fakeCordis({
    sessions: fakeSessions(),
    remote: cordisStyleRemote({ $onThrows: true }),
    remoteSession: namespace,
  })
  const lifecycle = createLifecycle({ React: fakeReact(), primitives: {} })
  assert.doesNotThrow(function () { lifecycle(cordis.ctx) })

  const row = cordis.registrations.find((r) => r.name === 'settings.general.item')
  assert.ok(row, 'the row must still register')
  assert.equal(calls.catalog, 1, 'the initial catalog read must still happen')
})

test('the row renders nothing when the catalog exposes no reasoning metadata', async function () {
  // The `xiaomi/mimo-v2.6-pro` case: reachable catalog, no `reasoning` record.
  const empty = {
    async modelCatalog() {
      return {
        ok: true,
        value: {
          default: { provider: 'magpie', model: 'xiaomi/mimo-v2.6-pro' },
          routableProviders: ['magpie'],
          groups: [{ id: 'magpie', name: 'Magpie', models: [{ id: 'xiaomi/mimo-v2.6-pro', name: 'MiMo' }] }],
          failures: [],
        },
      }
    },
    async selectModel(payload) { return { ok: true, value: payload } },
  }
  const sessions = fakeSessions()
  sessions.binding = function () {
    return {
      session: {
        projections: {
          faceOf: (key) => (key === 'modelSelection'
            ? { getSnapshot: () => ({ next: { provider: 'magpie', model: 'xiaomi/mimo-v2.6-pro' } }), subscribe: () => () => {} }
            : undefined),
        },
      },
    }
  }
  const cordis = fakeCordis({ sessions, remote: cordisStyleRemote(), remoteSession: empty })
  const React = fakeReact()
  const lifecycle = createLifecycle({ React, primitives: {} })
  lifecycle(cordis.ctx)
  await new Promise((resolve) => setImmediate(resolve))

  const row = cordis.registrations.find((r) => r.name === 'settings.general.item')
  React.beginRender()
  const tree = row.component({ t })
  assert.equal(tree, null, 'a model with no advertised levels renders no row at all')
})
