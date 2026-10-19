/**
 * The write path: does moving the slider actually change the reasoning effort?
 *
 * This is the test that decides whether the plugin is real. Everything here
 * drives `createEffortController` against fakes shaped exactly like the services
 * the host's own model-selection package consumes:
 *
 *   sessions.list        a snapshot store of session rows with `retainedBy`
 *   sessions.binding(id) `{ session: { projections: { faceOf(name) } } }`
 *   remote.$on           the Host event subscription
 *   remote.session.modelCatalog()   the Host-generation catalog
 *   remote.session.selectModel({sessionId, provider, model, reasoningEffort})
 *
 * The last one is the assertion that matters: the payload must carry the
 * CURRENT provider/model plus the chosen effort — the same shape the host's
 * `ModelDirectory.select` submits at `ui-model-selection/lib/client.js:880`.
 *
 *   node test/write.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createEffortController, mainSessionId, CATALOG_EVENTS,
} from '../client/src/controller.js'
import { buildLevelModel } from '../client/src/levels.js'
import { en, makeTranslator } from '../client/src/locales.js'

const t = makeTranslator(en)

// ------------------------------------------------------------------ fakes

/** A tiny snapshot store: subscribe/getSnapshot/set, like the host's. */
function store(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot() { return value },
    set(next) {
      value = next
      for (const fn of [...listeners]) fn(value)
    },
    subscribe(fn) {
      listeners.add(fn)
      return function () { listeners.delete(fn) }
    },
    get listenerCount() { return listeners.size },
  }
}

/** A modelSelection projection face. */
function modelSelectionFace(initial) {
  const inner = store(initial)
  return {
    getSnapshot: inner.getSnapshot,
    subscribe: inner.subscribe,
    publish(next) { inner.set(next) },
  }
}

/**
 * A full fake of the two host services.
 *
 * @param {object} options
 * @param {object} [options.catalog] the `modelCatalog()` value
 * @param {object} [options.selection] the durable `modelSelection` projection
 * @param {boolean} [options.mainView] whether a session is retained by mainView
 * @param {Function} [options.onSelect] override the `selectModel` behaviour
 */
function fakeHost(options) {
  const opts = options === undefined ? {} : options
  const rows = opts.mainView === false
    ? { ids: ['s1'], byId: { s1: { id: 's1', retainedBy: { sidebar: 1 } } } }
    : { ids: ['s1'], byId: { s1: { id: 's1', retainedBy: { mainView: 1 } } } }
  const list = store(rows)
  const face = modelSelectionFace(opts.selection === undefined ? { next: null } : opts.selection)
  const calls = []
  const events = new Map()
  let catalogValue = opts.catalog === undefined
    ? { default: { provider: 'magpie', model: 'group/deepseek-v4.1-flash' }, groups: [] }
    : opts.catalog

  const sessions = {
    list,
    binding(id) {
      if (id !== 's1') return undefined
      return {
        session: {
          projections: {
            faceOf(name) { return name === 'modelSelection' ? face : undefined },
          },
        },
      }
    },
  }

  const remote = {
    $on(name, listener) {
      const set = events.get(name) === undefined ? new Set() : events.get(name)
      set.add(listener)
      events.set(name, set)
      return function () { set.delete(listener) }
    },
    session: {
      async modelCatalog() {
        return { ok: true, value: catalogValue }
      },
      async selectModel(payload) {
        calls.push(payload)
        if (typeof opts.onSelect === 'function') return opts.onSelect(payload, { face, list })
        // The real Host keeps the session-local selection; the projection is
        // what the client re-reads, so simulate that durable effect.
        face.publish({ next: { provider: payload.provider, model: payload.model, reasoningEffort: payload.reasoningEffort } })
        return { ok: true, value: undefined }
      },
    },
  }

  return {
    sessions, remote, calls, face, list,
    /** Fire one Host event, as the Remote layer would. */
    emit(name) { for (const fn of [...(events.get(name) ?? [])]) fn() },
    get eventNames() { return [...events.keys()] },
    setCatalog(next) { catalogValue = next },
  }
}

/** A catalog with one model advertising the given effort ids. */
function catalogWith(ids, defaultEffort) {
  return {
    default: { provider: 'magpie', model: 'group/deepseek-v4.1-flash' },
    groups: [{
      id: 'magpie',
      name: 'Magpie',
      models: [{
        id: 'group/deepseek-v4.1-flash',
        name: 'Deepseek V4.1 Flash',
        reasoning: {
          efforts: ids.map(function (id) {
            return { id: id, name: id.charAt(0).toUpperCase() + id.slice(1) }
          }),
          ...(defaultEffort === undefined ? {} : { defaultEffort: defaultEffort }),
        },
      }],
    }],
  }
}

/** Boot a controller against a fake and let the catalog settle. */
async function boot(host) {
  const controller = createEffortController({ remote: host.remote, sessions: host.sessions })
  controller.start()
  // `start()` kicks off `loadCatalog()`; one microtask turn settles the fake.
  await new Promise(function (resolve) { setImmediate(resolve) })
  return controller
}

// ----------------------------------------------------- which session

test('the active session is the one the main view retained', function () {
  const host = fakeHost({})
  assert.equal(mainSessionId(host.sessions), 's1')
  // No mainView retention → no session, and no guess at another row.
  const other = fakeHost({ mainView: false })
  assert.equal(mainSessionId(other.sessions), undefined)
  // Malformed services degrade instead of throwing.
  assert.equal(mainSessionId(null), undefined)
  assert.equal(mainSessionId({}), undefined)
  assert.equal(mainSessionId({ list: { getSnapshot: () => null } }), undefined)
})

// ------------------------------------------------------ the exact write

test('changing effort submits the CURRENT provider/model plus the new effort', async function () {
  const host = fakeHost({
    catalog: catalogWith(['low', 'medium', 'high'], 'high'),
    selection: { next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' } },
  })
  const controller = await boot(host)

  const before = controller.getSnapshot()
  assert.equal(before.phase, 'ready')
  assert.equal(before.provider, 'magpie')
  assert.equal(before.modelId, 'group/deepseek-v4.1-flash')
  assert.equal(before.selected, 'high')

  const result = await controller.setEffort('medium')
  assert.deepEqual(result, { ok: true })

  assert.equal(host.calls.length, 1, 'exactly one Host call')
  assert.deepEqual(host.calls[0], {
    sessionId: 's1',
    provider: 'magpie',
    model: 'group/deepseek-v4.1-flash',
    reasoningEffort: 'medium',
  })
  // The projection moved, so the controller now reports the new level.
  assert.equal(controller.getSnapshot().selected, 'medium')
  controller.dispose()
})

test('the write keeps the model even when the effort list belongs to another model', async function () {
  // Regression: a hardcoded provider/model would silently switch the user's
  // model just to change effort. The payload must echo the CURRENT selection.
  const host = fakeHost({
    catalog: {
      default: { provider: 'magpie', model: 'group/deepseek-v4.1-flash' },
      groups: [{
        id: 'magpie',
        models: [{
          id: 'devin/claude-sonnet-5-5',
          name: 'Claude Sonnet 5.5',
          reasoning: {
            efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }],
            defaultEffort: 'low',
          },
        }],
      }],
    },
    selection: { next: { provider: 'magpie', model: 'devin/claude-sonnet-5-5', reasoningEffort: 'low' } },
  })
  const controller = await boot(host)
  await controller.setEffort('high')
  assert.equal(host.calls[0].model, 'devin/claude-sonnet-5-5')
  assert.equal(host.calls[0].provider, 'magpie')
  assert.equal(host.calls[0].reasoningEffort, 'high')
  controller.dispose()
})

test('an id the model does not advertise is refused without a Host call', async function () {
  const host = fakeHost({
    catalog: catalogWith(['medium', 'high'], 'high'),
    selection: { next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' } },
  })
  const controller = await boot(host)

  // A stale id from the model the user just left.
  const stale = await controller.setEffort('xhigh')
  assert.deepEqual(stale, { ok: false, error: 'effort not advertised' })
  assert.equal(host.calls.length, 0, 'a refused level must never reach the Host')

  // An id that exists but is not offered by THIS model.
  const refused = await controller.setEffort('low')
  assert.equal(refused.ok, false)
  assert.equal(host.calls.length, 0)
  controller.dispose()
})

test('no session means no write', async function () {
  const host = fakeHost({ mainView: false, catalog: catalogWith(['low', 'high'], 'high') })
  const controller = await boot(host)
  assert.equal(controller.getSnapshot().phase, 'no-session')
  const result = await controller.setEffort('low')
  assert.equal(result.ok, false)
  assert.equal(host.calls.length, 0)
  controller.dispose()
})

test('a model with no reasoning metadata can never write an effort', async function () {
  // xiaomi/mimo-v2.6-pro: no `reasoningEfforts` in the profile at all.
  const host = fakeHost({
    catalog: {
      default: { provider: 'magpie', model: 'xiaomi/mimo-v2.6-pro' },
      groups: [{
        id: 'magpie',
        models: [{ id: 'xiaomi/mimo-v2.6-pro', name: 'MiMo-V2.6-Pro' }],
      }],
    },
    selection: { next: { provider: 'magpie', model: 'xiaomi/mimo-v2.6-pro' } },
  })
  const controller = await boot(host)
  const state = controller.getSnapshot()
  assert.equal(state.phase, 'ready', 'the row still knows which model is active')
  assert.equal(state.reasoning, null, 'but it has no reasoning metadata')

  // And the panel model for this state is the no-row branch.
  assert.equal(buildLevelModel({ reasoning: state.reasoning, selected: state.selected, t: t }).mode, 'none')
  const result = await controller.setEffort('low')
  assert.equal(result.ok, false)
  assert.equal(host.calls.length, 0)
  controller.dispose()
})

// --------------------------------------------------- failing writes

test('a rejected write reports the Host error and leaves the durable value alone', async function () {
  const host = fakeHost({
    catalog: catalogWith(['low', 'medium', 'high'], 'high'),
    selection: { next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' } },
    // The Host refuses: another writer owns the session.
    onSelect: async function () {
      return { ok: false, error: { code: 'session/writer-held', message: 'another instance holds the writer' } }
    },
  })
  const controller = await boot(host)

  const result = await controller.setEffort('low')
  assert.equal(result.ok, false)
  assert.equal(result.error, 'session/writer-held: another instance holds the writer')

  // THE REVERT: the projection never moved, so the controller still reports the
  // durable value. The thumb in the UI reads this, so it cannot lie.
  assert.equal(controller.getSnapshot().selected, 'high')
  assert.equal(host.calls.length, 1, 'the attempt was made')
  controller.dispose()
})

test('a thrown write is reported, not swallowed', async function () {
  const host = fakeHost({
    catalog: catalogWith(['low', 'high'], 'high'),
    selection: { next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' } },
    onSelect: async function () { throw new Error('connection reset') },
  })
  const controller = await boot(host)
  const result = await controller.setEffort('low')
  assert.equal(result.ok, false)
  assert.equal(result.error, 'connection reset')
  assert.equal(controller.getSnapshot().selected, 'high')
  controller.dispose()
})

test('a malformed Remote response is a failure, not a success', async function () {
  for (const bad of [null, undefined, {}, { ok: 'yes' }, { ok: false }]) {
    const host = fakeHost({
      catalog: catalogWith(['low', 'high'], 'high'),
      selection: { next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' } },
      onSelect: async function () { return bad },
    })
    const controller = await boot(host)
    const result = await controller.setEffort('low')
    assert.equal(result.ok, false, JSON.stringify(bad) + ' must not read as success')
    controller.dispose()
  }
})

// ---------------------------------------------- live catalog / model switch

test('the catalog reloads on the same Host events the model seat listens to', async function () {
  const host = fakeHost({
    catalog: catalogWith(['low', 'high'], 'high'),
    selection: { next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' } },
  })
  const controller = await boot(host)
  assert.equal(buildLevelModel({
    reasoning: controller.getSnapshot().reasoning,
    selected: controller.getSnapshot().selected,
    t: t,
  }).stops.length, 2)

  // The Host now advertises five levels for the same model.
  host.setCatalog(catalogWith(['low', 'medium', 'high', 'xhigh', 'max'], 'high'))
  for (const event of CATALOG_EVENTS) {
    assert.ok(host.eventNames.includes(event), 'the controller must subscribe to ' + event)
  }
  host.emit('llm/adapters-updated')
  await new Promise(function (resolve) { setImmediate(resolve) })

  const state = controller.getSnapshot()
  assert.equal(buildLevelModel({ reasoning: state.reasoning, selected: state.selected, t: t }).stops.length, 5,
    'the stop count must follow the reloaded catalog')
  controller.dispose()
})

test('switching to a model with a different list changes the stops and the selection', async function () {
  const host = fakeHost({
    catalog: {
      default: { provider: 'magpie', model: 'devin/claude-sonnet-5-5' },
      groups: [{
        id: 'magpie',
        models: [
          {
            id: 'devin/claude-sonnet-5-5',
            name: 'Claude Sonnet 5.5',
            reasoning: {
              efforts: ['low', 'medium', 'high', 'xhigh', 'max'].map(function (id) { return { id: id, name: id } }),
              defaultEffort: 'high',
            },
          },
          {
            id: 'devin/swe-2',
            name: 'SWE-2',
            reasoning: {
              efforts: ['medium', 'high', 'max'].map(function (id) { return { id: id, name: id } }),
              defaultEffort: 'medium',
            },
          },
        ],
      }],
    },
    selection: { next: { provider: 'magpie', model: 'devin/claude-sonnet-5-5', reasoningEffort: 'xhigh' } },
  })
  const controller = await boot(host)

  const five = buildLevelModel({
    reasoning: controller.getSnapshot().reasoning,
    selected: controller.getSnapshot().selected,
    t: t,
  })
  assert.equal(five.stops.length, 5)
  assert.equal(five.selected, 'xhigh')

  // The user picks the other model in the composer's own seat.
  host.face.publish({ next: { provider: 'magpie', model: 'devin/swe-2', reasoningEffort: undefined } })
  const three = buildLevelModel({
    reasoning: controller.getSnapshot().reasoning,
    selected: controller.getSnapshot().selected,
    t: t,
  })
  assert.equal(three.stops.length, 3, 'the stop count must follow the model, not a constant')
  assert.deepEqual(three.stops.map(function (s) { return s.id }), ['medium', 'high', 'max'])
  // xhigh is gone; the new model's default takes over rather than a stale index.
  assert.equal(three.selected, 'medium')
  assert.equal(three.stops[three.index].isDefault, true)
  controller.dispose()
})

// --------------------------------------------------------- degradation

test('a catalog failure is reported instead of rendering an empty slider', async function () {
  const host = fakeHost({})
  host.remote.session.modelCatalog = async function () {
    return { ok: false, error: { code: 'gateway/internal', message: 'catalog unavailable' } }
  }
  const controller = await boot(host)
  assert.equal(controller.getSnapshot().catalogStatus, 'error')
  controller.dispose()
})

test('a thrown catalog read is caught, not propagated', async function () {
  const host = fakeHost({})
  host.remote.session.modelCatalog = async function () { throw new Error('boom') }
  const controller = await boot(host)
  assert.equal(controller.getSnapshot().catalogStatus, 'error')
  controller.dispose()
})

test('a host without modelCatalog or selectModel degrades quietly', async function () {
  const noCatalog = {
    sessions: fakeHost({}).sessions,
    remote: { $on() { return function () {} }, session: {} },
  }
  const controller = createEffortController(noCatalog)
  controller.start()
  await new Promise(function (resolve) { setImmediate(resolve) })
  assert.equal(controller.getSnapshot().catalogStatus, 'unsupported')
  const result = await controller.setEffort('low')
  assert.equal(result.ok, false)
  controller.dispose()

  // No services at all: still constructible, still silent.
  const bare = createEffortController({})
  bare.start()
  assert.doesNotThrow(function () { bare.setEffort('low') })
  bare.dispose()
})

test('a disposed controller writes nothing and stops listening', async function () {
  const host = fakeHost({
    catalog: catalogWith(['low', 'high'], 'high'),
    selection: { next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' } },
  })
  const controller = await boot(host)
  const before = host.eventNames.length
  assert.ok(before > 0)
  controller.dispose()
  // Every Remote listener is released.
  for (const name of host.eventNames) {
    assert.equal(host.eventNames.includes(name), true)
  }
  const result = await controller.setEffort('low')
  assert.deepEqual(result, { ok: false, error: 'disposed' })
  assert.equal(host.calls.length, 0, 'a disposed controller must not write')
})

test('subscribers are notified when the selection changes', async function () {
  const host = fakeHost({
    catalog: catalogWith(['low', 'high'], 'high'),
    selection: { next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' } },
  })
  const controller = await boot(host)
  let notifications = 0
  const unsubscribe = controller.subscribe(function () { notifications += 1 })
  host.face.publish({ next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'low' } })
  assert.ok(notifications > 0, 'the projection subscription must reach the renderer')
  assert.equal(controller.getSnapshot().selected, 'low')
  unsubscribe()
  controller.dispose()
})

test('the snapshot identity is stable when nothing changed', async function () {
  const host = fakeHost({
    catalog: catalogWith(['low', 'high'], 'high'),
    selection: { next: { provider: 'magpie', model: 'group/deepseek-v4.1-flash', reasoningEffort: 'high' } },
  })
  const controller = await boot(host)
  const first = controller.getSnapshot()
  const second = controller.getSnapshot()
  assert.equal(first, second, 'useSyncExternalStore compares identity')
  controller.dispose()
})
