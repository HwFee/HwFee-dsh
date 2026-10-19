/**
 * The effort controller: where the levels come from, and how a change is written.
 *
 * TWO READS, ONE WRITE, all of them the host's own paths.
 *
 *   READ the active session: `sessions.list` publishes `retainedBy` — the
 *   positive local reference-source counts — and the main view is the reference
 *   source named `mainView` (ui-workspace retains the visible conversation as
 *   `{source: 'mainView'}` and its own `mainSessionId()` finds it exactly this
 *   way). A root-scoped settings row has no session scope of its own, so this is
 *   how it names the conversation the user is looking at.
 *
 *   READ the selection: `sessions.binding(id).session.projections
 *   .faceOf('modelSelection')` is the durable projection the host's model seat
 *   renders from; `next` is the selection that applies to the next request.
 *
 *   READ the catalog: `remote.session.modelCatalog()` — the exact call the
 *   host's ModelCatalogDirectory makes (`ui-model-selection/lib/client.js`), a
 *   Host-generation catalog of `groups[].models[].reasoning.efforts[]` and
 *   `reasoning.defaultEffort`.
 *
 *   WRITE: `remote.session.selectModel({ sessionId, provider, model,
 *   reasoningEffort })` — the identical payload the host's own ModelDirectory
 *   submits (`:880`), reached the identical way: it passes `ctx.remote.session`
 *   as its `sessions` argument and calls `this.sessions.selectModel(...)`.
 *   Changing effort re-submits the CURRENT provider/model with the new effort,
 *   which is what `chooseEffort` (`:1445`) does. Nothing here invents a level: a
 *   write is refused unless the id is one the provider advertised.
 *
 * Live updates: the catalog refreshes on the same four Host events the host's
 * own directory listens to (`llm/adapters-updated`, `settings/document-updated`
 * and the two credential events, `:1006-1015`), and the session list and the
 * selection projection are subscribed directly, so switching to a model with a
 * different effort list changes the stop count immediately.
 *
 * PURE BY CONSTRUCTION: no React, no DOM, no import-time side effects. Both
 * services arrive as arguments, so `node:test` drives this against fakes.
 */

import { PLUGIN_ID } from './constants.js'

/** The reference source name the main view retains its session under. */
const MAIN_VIEW_SOURCE = 'mainView'

/** The Host events that invalidate the model catalog. */
export const CATALOG_EVENTS = [
  'llm/adapters-updated',
  'settings/document-updated',
  'credentials/record-updated',
  'credentials/reference-updated',
]

/** Key for the reasoning-metadata memo. */
function modelKey(selection) {
  return JSON.stringify([selection.provider, selection.model])
}

/**
 * Find the session the main conversation view is showing, if any.
 * @param {{list: {getSnapshot: Function}}} sessions the Client sessions service
 * @returns {string|undefined}
 */
export function mainSessionId(sessions) {
  if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== 'function') return undefined
  const snapshot = sessions.list.getSnapshot()
  if (!snapshot || !Array.isArray(snapshot.ids)) return undefined
  for (const id of snapshot.ids) {
    const row = snapshot.byId === undefined ? undefined : snapshot.byId[id]
    const retained = row === undefined ? undefined : row.retainedBy
    if (retained !== undefined && retained !== null && (retained[MAIN_VIEW_SOURCE] ?? 0) > 0) return id
  }
  return undefined
}

/** Whether a RemoteResult failed. */
function failureOf(result) {
  if (result === null || typeof result !== 'object') return 'no response'
  if (result.ok === true) return undefined
  const error = result.error
  if (error === null || typeof error !== 'object') return 'unknown error'
  const code = typeof error.code === 'string' ? error.code : 'error'
  const message = typeof error.message === 'string' ? error.message : ''
  return message === '' ? code : code + ': ' + message
}

/**
 * Build the controller the settings row renders from.
 *
 * @param {object} deps
 * @param {object|null} deps.remote the client Remote service (`ctx.remote`)
 * @param {object|null} deps.sessions the client sessions service (`ctx.sessions`)
 * @returns {{
 *   subscribe: (fn: Function) => Function,
 *   getSnapshot: () => object,
 *   start: () => void,
 *   dispose: () => void,
 *   refresh: () => Promise<object>,
 *   setEffort: (id: string) => Promise<{ok: boolean, error?: string}>,
 * }}
 */
export function createEffortController(deps) {
  const source = deps === null || typeof deps !== 'object' ? {} : deps
  const remote = source.remote
  // THE NAMESPACE IS ITS OWN SERVICE. `api-gateway` mounts every Remote
  // namespace as a separate dotted Cordis service (`RemoteNamespaceService`
  // calls `super(ctx, 'remote.' + name)`), so `remote.session` is NOT a property
  // of the `remote` service: reading it from a fiber that did not inject
  // `'remote.session'` throws `cannot get property "remote.session" without
  // inject`. The plugin therefore injects that name and hands the resolved
  // namespace in here. The guarded property read is only a fallback for plain
  // objects (unit tests) and hosts that happen to expose it.
  const injectedNamespace = source.remoteSession
  const sessions = source.sessions

  const listeners = new Set()
  const reasoningByKey = new Map()
  const disposers = []

  let snapshot = Object.freeze({
    phase: 'idle',
    sessionId: undefined,
    provider: undefined,
    modelId: undefined,
    reasoning: null,
    selected: undefined,
    error: undefined,
    catalogStatus: 'idle',
  })
  let catalog = null
  let catalogStatus = 'idle'
  let catalogError
  let generation = 0
  let started = false
  let disposed = false
  let faceUnsub = null
  let faceKey

  /**
   * Resolve the `remote.session` namespace, safely.
   *
   * Never throws: a Cordis getter for a dotted service raises when the name was
   * not injected, and that raise used to be swallowed by the catalog loader,
   * leaving the row stuck on "reading the catalog" with no slider and no error.
   *
   * @returns {object|undefined} the namespace service, when reachable
   */
  function resolveNamespace() {
    if (injectedNamespace !== undefined && injectedNamespace !== null) return injectedNamespace
    if (remote === null || remote === undefined) return undefined
    try {
      return remote.session
    } catch (error) {
      return undefined
    }
  }

  function publish(next) {
    const merged = Object.assign({}, snapshot, next)
    // Keep the object identity stable when nothing a renderer reads has changed,
    // which is what `useSyncExternalStore` compares on.
    const same = Object.keys(merged).every(function (key) { return Object.is(merged[key], snapshot[key]) })
    if (same) return
    snapshot = Object.freeze(merged)
    for (const listener of [...listeners]) {
      try { listener(snapshot) } catch (error) { /* one dead row must not stall the others */ }
    }
  }

  /** Recompute the row state from the current catalog + session. */
  function project() {
    if (disposed) return snapshot
    const sessionId = mainSessionId(sessions)
    if (sessionId === undefined) {
      if (faceUnsub !== null) { faceUnsub(); faceUnsub = null; faceKey = undefined }
      publish({
        phase: 'no-session',
        sessionId: undefined,
        provider: undefined,
        modelId: undefined,
        reasoning: null,
        selected: undefined,
        error: undefined,
        catalogStatus: catalogStatus,
      })
      return snapshot
    }

    // Subscribe to the durable selection projection of THIS session. The
    // projection is the authority on what the next request will use.
    if (faceKey !== sessionId) {
      if (faceUnsub !== null) { faceUnsub(); faceUnsub = null }
      faceKey = sessionId
      const binding = typeof sessions.binding === 'function' ? sessions.binding(sessionId) : undefined
      const projections = binding === undefined ? undefined : binding.session.projections
      const face = projections !== undefined && typeof projections.faceOf === 'function'
        ? projections.faceOf('modelSelection')
        : undefined
      if (face !== undefined && typeof face.subscribe === 'function') {
        const unsubscribe = face.subscribe(function () { project() })
        faceUnsub = typeof unsubscribe === 'function' ? unsubscribe : null
      }
    }

    const binding = typeof sessions.binding === 'function' ? sessions.binding(sessionId) : undefined
    const projections = binding === undefined ? undefined : binding.session.projections
    const face = projections !== undefined && typeof projections.faceOf === 'function'
      ? projections.faceOf('modelSelection')
      : undefined
    const projected = face !== undefined && typeof face.getSnapshot === 'function' ? face.getSnapshot() : undefined

    // Exactly the host directory's own fallback order: the projected selection,
    // then the deployment default from the catalog.
    const intended = (projected !== undefined && projected !== null ? projected.next : undefined)
      ?? (catalog !== null ? catalog.default : undefined)

    if (intended === undefined || intended === null) {
      publish({
        // `unsupported` is the row's "render nothing" state: this host exposes
        // no model catalog, so there is no level list to draw.
        phase: catalogStatus === 'error'
          ? 'error'
          : catalogStatus === 'unsupported' ? 'unsupported' : 'loading',
        sessionId: sessionId,
        provider: undefined,
        modelId: undefined,
        reasoning: null,
        selected: undefined,
        error: catalogStatus === 'error' ? catalogError : undefined,
        catalogStatus: catalogStatus,
      })
      return snapshot
    }

    const reasoning = reasoningByKey.get(modelKey(intended))
    const selected = typeof intended.reasoningEffort === 'string' ? intended.reasoningEffort : undefined

    publish({
      phase: 'ready',
      sessionId: sessionId,
      provider: intended.provider,
      modelId: intended.model,
      reasoning: reasoning === undefined ? null : reasoning,
      selected: selected,
      error: undefined,
      catalogStatus: catalogStatus,
    })
    return snapshot
  }

  /** Load one Host generation's catalog and memoize its reasoning metadata. */
  async function loadCatalog() {
    const namespace = resolveNamespace()
    if (namespace === undefined || typeof namespace.modelCatalog !== 'function') {
      catalogStatus = 'unsupported'
      catalogError = undefined
      project()
      return snapshot
    }
    const mine = ++generation
    catalogStatus = 'loading'
    project()
    let result
    try {
      result = await namespace.modelCatalog()
    } catch (error) {
      if (mine !== generation || disposed) return snapshot
      catalogStatus = 'error'
      catalogError = error instanceof Error ? error.message : String(error)
      project()
      return snapshot
    }
    if (mine !== generation || disposed) return snapshot
    const failure = failureOf(result)
    if (failure !== undefined) {
      catalogStatus = 'error'
      catalogError = failure
      project()
      return snapshot
    }
    const value = result.value === null || typeof result.value !== 'object' ? null : result.value
    catalog = value
    reasoningByKey.clear()
    if (value !== null && Array.isArray(value.groups)) {
      for (const group of value.groups) {
        const models = group === null || typeof group !== 'object' ? [] : group.models
        if (!Array.isArray(models)) continue
        for (const model of models) {
          if (model === null || typeof model !== 'object') continue
          reasoningByKey.set(modelKey({ provider: group.id, model: model.id }), model.reasoning)
        }
      }
    }
    catalogStatus = 'ready'
    catalogError = undefined
    project()
    return snapshot
  }

  /**
   * Change the effort, re-submitting the CURRENT provider/model exactly like the
   * host's `chooseEffort`. Refuses an id the current model does not advertise,
   * and refuses when there is no session to write to.
   *
   * @param {string} effort advertised effort id
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async function setEffort(effort) {
    if (disposed) return { ok: false, error: 'disposed' }
    const current = snapshot
    if (current.phase !== 'ready' || current.provider === undefined || current.modelId === undefined) {
      return { ok: false, error: 'no selection' }
    }
    const advertised = current.reasoning === null || !Array.isArray(current.reasoning.efforts)
      ? []
      : current.reasoning.efforts
    const offered = advertised.some(function (level) { return level !== null && level.id === effort })
    if (!offered) return { ok: false, error: 'effort not advertised' }

    const namespace = resolveNamespace()
    if (namespace === undefined || typeof namespace.selectModel !== 'function') {
      return { ok: false, error: 'selectModel unavailable' }
    }

    // The exact host payload: the current model plus the new effort.
    let result
    try {
      result = await namespace.selectModel({
        sessionId: current.sessionId,
        provider: current.provider,
        model: current.modelId,
        reasoningEffort: effort,
      })
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    const failure = failureOf(result)
    if (failure !== undefined) return { ok: false, error: failure }
    // The projection drives the durable value; a refresh makes the new value
    // land even if this client missed a frame.
    project()
    return { ok: true }
  }

  return {
    getSnapshot() { return snapshot },

    subscribe(listener) {
      listeners.add(listener)
      return function unsubscribe() { listeners.delete(listener) }
    },

    start() {
      if (started || disposed) return
      started = true
      // `$on` is the Remote service's event subscription (the host's own
      // model-selection directory subscribes to these same four events).
      //
      // Guarded per event: a host composed without forwarded events
      // (`connection.interactions !== 'answer'`) throws from `$on`. Live catalog
      // refresh is a nicety — losing it must not cost the row.
      const on = remote !== null && remote !== undefined ? remote['$on'] : undefined
      if (typeof on === 'function') {
        for (const name of CATALOG_EVENTS) {
          try {
            const dispose = on.call(remote, name, function () { loadCatalog().catch(function () {}) })
            if (typeof dispose === 'function') disposers.push(dispose)
          } catch (error) {
            /* catalog changes then do not live-update; the row still works */
          }
        }
      }
      const list = sessions !== null && sessions !== undefined ? sessions.list : undefined
      if (list !== undefined && typeof list.subscribe === 'function') {
        const dispose = list.subscribe(function () { project() })
        if (typeof dispose === 'function') disposers.push(dispose)
      }
      // NEVER a bare `.catch(() => {})` here: swallowing this was exactly how a
      // namespace-resolution failure became an eternally-"loading" row with no
      // slider and no message. A failed first read is recorded and rendered.
      loadCatalog().catch(function (error) {
        if (disposed) return
        catalogStatus = 'error'
        catalogError = error instanceof Error ? error.message : String(error)
        project()
      })
    },

    refresh() {
      if (disposed) return Promise.resolve(snapshot)
      return loadCatalog()
    },

    setEffort,

    dispose() {
      disposed = true
      generation += 1
      if (faceUnsub !== null) { faceUnsub(); faceUnsub = null }
      for (const dispose of disposers.splice(0)) {
        try { dispose() } catch (error) { /* already gone */ }
      }
      listeners.clear()
    },

    /** Test seam: the plugin name, so a log line names the owner. */
    owner: PLUGIN_ID,
  }
}
