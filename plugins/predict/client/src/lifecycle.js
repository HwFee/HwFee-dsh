/**
 * The client half: listen for a suggestion, draw it, accept it on Tab.
 *
 * @module lifecycle
 */

import { LOCALE_NS } from './constants.js'
import { createGhost } from './ghost.js'
import { installCss } from './styles.js'
import { en, zh } from './locales.js'
import {
  ENABLED_KEY, PINNED_MODEL_KEY, persist, readEnabled, readPinnedModel,
} from '../../lib/settings.js'

/** The host event carrying a suggestion. Mirrors `SUGGESTION_EVENT`. */
export const SUGGESTION_EVENT = 'predict/suggestion'

/** The host event carrying a dismissal. Mirrors `DISMISS_EVENT`. */
export const DISMISS_EVENT = 'predict/dismissed'

/** The host event that publishes the settings. */
export const SETTINGS_EVENT = 'predict/settings'

const persistSafe = (storage, key, value) => {
  try { persist(storage, key, value) } catch {}
}

/**
 * Build the plugin's `apply`.
 *
 * @param {object} deps
 * @param {object} deps.React the host React
 * @param {object | null} deps.primitives the host's ui-primitives, or null
 * @returns {(ctx: object) => void} the plugin's `apply`
 */
export function createLifecycle({ React, primitives }) {
  return function apply(ctx) {
    // Block body on purpose: `register` returns the disposer, and an explicit
    // `return` is the shape `checkLocaleDisposers` in tools/audit.mjs can prove.
    ctx.effect(() => {
      return ctx.locale.register(LOCALE_NS, { en, zh })
    }, 'dsh-predict: strings')
    ctx.effect(
      () => installCss(typeof document === 'undefined' ? undefined : document),
      'dsh-predict: ghost stylesheet',
    )

    const storage = typeof localStorage === 'undefined' ? undefined : localStorage
    const doc = typeof document === 'undefined' ? undefined : document
    const connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
    const uiSession = typeof ctx.get === 'function' ? ctx.get('uiSession') : undefined
    // `remote.session` is a DOTTED service name (the gateway registers
    // `remote.<namespace>`), not a property of `remote`. Reading it through
    // `ctx.get('remote').session` walks Cordis's namespace proxy, which throws
    // "cannot get property \"remote.session\" without inject" unless the fiber
    // injected that exact dotted name — and it throws at CALL time, so the row
    // rendered fine until the model menu was opened, then the error boundary
    // replaced the whole row with an empty crash cell. Resolve the namespace
    // lazily through `ctx.get` (no inject requirement) at load time, so a host
    // without it degrades to the retryable `remote-unavailable` path instead.
    const remoteSession = () => (typeof ctx.get === 'function' ? ctx.get('remote.session') : undefined)

    let disposed = false

    // TEMPORARY diagnostic surface: the host's reason for not predicting is
    // otherwise invisible, and "the model declined" and "the call threw" look
    // identical from the page.
    const debug = (payload) => {
      if (typeof globalThis !== 'undefined' && globalThis !== null) globalThis.__dshPredictDebug = payload
    }

    // THE SETTINGS LIVE IN THE PAGE and the host reads them by event. Publishing
    // them once at apply, and again on every change, keeps a single owner.
    let dirty = false
    let tail = Promise.resolve()
    const enqueue = (operation) => {
      const run = tail.then(operation, operation)
      tail = run.then(() => undefined, () => undefined)
      return run
    }
    const publish = () => enqueue(() => {
      if (disposed) return Promise.resolve()
      const snapshot = settingsStore.getSnapshot()
      const settings = { enabled: snapshot.enabled, pinnedModel: snapshot.pinnedModel }
      if (connection === undefined || typeof connection.rpc?.call !== 'function') {
        dirty = true
        return Promise.resolve()
      }
      return connection.rpc.call('/api', 'predictSettings/configure', { args: { settings } })
        .then((result) => { dirty = result?.ok !== true })
        .catch(() => { dirty = true })
    })

    /**
     * Wait for the configuration queue, then make sure the host has the values
     * the user selected. Resolves true only when the host acknowledged them.
     *
     * WHY THIS EXISTS. The first suggestion of a session can fire while the
     * initial `publish()` is still on the wire. The old code read `dirty` before
     * the queue drained, saw `false` (nothing had failed YET), and sent the
     * prediction with the host's DEFAULT settings — a pinned model silently
     * ignored, which looks like the setting not working. Checking after the
     * queue is what makes "configured" mean configured.
     *
     * ONE SERIAL RETRY, THEN FAIL CLOSED. A write that failed leaves `dirty`
     * true; re-sending it once is safe because `publish()` enqueues, so the
     * retry cannot interleave with a later change. If it fails again the
     * prediction is dropped rather than sent with settings the host does not
     * have. The slow suggestion call is deliberately NOT put on this queue: that
     * would block later configuration writes and dismissals behind a 20 s model
     * call.
     */
    const ensureConfigured = () => tail.then(() => {
      if (disposed) return false
      if (!dirty) return true
      return publish().then(() => !dirty)
    })

    let ghostSession = undefined
    const ghost = createGhost({
      document: doc,
      // Accepting or dismissing both reach the host, because the host uses the
      // dismissal to skip the next turn.
      onAccept: () => {},
      onDismiss: () => {
        const sessionId = ghostSession
        ghostSession = undefined
        if (sessionId !== undefined) {
          enqueue(() => (disposed || connection === undefined
            ? Promise.resolve()
            : connection.rpc.call('/api', 'predictSettings/dismiss', { args: { request: { sessionId } } }).catch(() => undefined)))
        }
      },
    })

    let activeId = undefined
    let unsubscribeFeed = undefined
    let lastSeq = -1
    let waitAbort = null

    const abortWait = () => {
      const controller = waitAbort
      waitAbort = null
      if (controller !== null) controller.abort()
    }

    const requestSuggestion = (turnSeq) => {
      const sessionId = activeId
      if (connection === undefined || sessionId === undefined) return
      if (settingsStore.getSnapshot().enabled !== true) { debug({ reason: 'disabled', sessionId, turnSeq }); return }
      abortWait()
      const controller = new AbortController()
      waitAbort = controller
      void ensureConfigured().then((configured) => {
        if (controller.signal.aborted || disposed) return
        if (!configured) { debug({ reason: 'error', sessionId, turnSeq }); return }
        return connection.rpc.call('/api', 'predictSettings/suggestion', { args: { request: { sessionId, turnSeq } } }, controller.signal)
          .then((result) => {
            if (controller.signal.aborted) return
            if (waitAbort === controller) waitAbort = null
            if (result?.ok !== true) { debug({ reason: 'error', sessionId, turnSeq }); catalog.invalidate(); return }
            const value = result.value
            debug({ reason: value?.reason ?? null, sessionId, turnSeq })
            if (typeof value?.text !== 'string' || value.text === '') return
            if (value.sessionId !== sessionId || value.turnSeq !== turnSeq) return
            // Only draw a suggestion for the session whose composer is on screen.
            if (activeId !== sessionId) return
            if (settingsStore.getSnapshot().enabled !== true) return
            if (ghost.show(value.text)) ghostSession = sessionId
          })
          .catch(() => {
            if (!controller.signal.aborted) debug({ reason: 'error', sessionId, turnSeq })
          })
      })
    }

    const handleEntry = (entry) => {
      const event = entry?.event
      if (event === null || typeof event !== 'object') return
      if (typeof event.seq === 'number') {
        if (event.seq <= lastSeq) return
        lastSeq = event.seq
      }
      if (event.type === 'turn/start' || event.type === 'user/message') {
        abortWait()
        ghostSession = undefined
        ghost.clear()
        return
      }
      if (event.type === 'turn/end') requestSuggestion(event.seq)
    }

    const bind = (sessionId) => {
      abortWait()
      ghostSession = undefined
      ghost.clear()
      if (unsubscribeFeed !== undefined) { unsubscribeFeed(); unsubscribeFeed = undefined }
      if (sessionId === undefined) return
      const source = typeof sessions?.binding === 'function' ? sessions.binding(sessionId)?.eventSource : undefined
      if (source === undefined) return
      const snapshot = source.getSnapshot()
      lastSeq = -1
      const entries = snapshot?.entries ?? []
      for (const entry of entries) {
        const seq = entry?.event?.seq
        if (typeof seq === 'number' && seq > lastSeq) lastSeq = seq
      }
      unsubscribeFeed = source.subscribe(() => {
        const change = source.getSnapshot()?.change
        const delta = change?.kind === 'prepend' ? []
          : change?.entries ?? (change?.entry !== undefined ? [change.entry] : [])
        for (const entry of delta) handleEntry(entry)
      })
    }

    const catalog = createCatalogStore(remoteSession)

    const currentSessionId = () => {
      const snapshot = uiSession?.current?.getSnapshot?.()
      return typeof snapshot?.key === 'string' ? snapshot.key : undefined
    }
    const watchCurrent = uiSession === undefined ? undefined : uiSession.current.subscribe(() => {
      const next = currentSessionId()
      if (next === activeId) return
      activeId = next
      bind(next)
    })
    activeId = currentSessionId()
    bind(activeId)

    let lastGeneration = typeof connection?.generation?.getSnapshot === 'function'
      ? connection.generation.getSnapshot()
      : undefined
    const watchGeneration = typeof connection?.generation?.subscribe === 'function'
      ? connection.generation.subscribe(() => {
        const next = connection.generation.getSnapshot()
        if (next === undefined || next === lastGeneration) return
        lastGeneration = next
        abortWait()
        catalog.invalidate()
        bind(activeId)
        publish()
      })
      : undefined

    const onComposerInput = (event) => {
      if (doc === undefined || event?.target !== doc.querySelector('[data-composer-input]')) return
      abortWait()
      ghostSession = undefined
      ghost.clear()
    }
    // Passive + capture: the plugin only OBSERVES typing (to drop a suggestion
    // the user is already typing over). It never calls `preventDefault()`, so it
    // has no business making the event cancelable — the repository rule is
    // passive for listeners whose job is observation.
    const COMPOSER_INPUT_OPTIONS = { capture: true, passive: true }
    if (doc !== undefined && typeof doc.addEventListener === 'function') {
      doc.addEventListener('input', onComposerInput, COMPOSER_INPUT_OPTIONS)
    }

    // THE SETTINGS ROW.
    const SettingsRow = createRow(React, primitives)
    const settingsStore = createSettingsStore(storage, () => {
      abortWait()
      ghostSession = undefined
      ghost.clear()
      publish()
    })
    publish()
    ctx.effect(() => () => settingsStore.dispose(), 'dsh-predict: settings store')

    ctx.effect(() => () => {
      disposed = true
      if (watchCurrent !== undefined) watchCurrent()
      if (watchGeneration !== undefined) watchGeneration()
      if (unsubscribeFeed !== undefined) unsubscribeFeed()
      if (doc !== undefined && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('input', onComposerInput, COMPOSER_INPUT_OPTIONS)
      }
      abortWait()
      catalog.dispose()
      ghostSession = undefined
      ghost.clear()
    }, 'dsh-predict: session watcher')

    ctx.slots.inject('settings.general.item', () => ctx.slots.register({
      name: 'settings.general.item',
      id: 'dsh-predict-settings',
      order: 44,
      locale: LOCALE_NS,
      inject: () => ({
        settingsStore,
        catalog,
        setEnabled: (value) => settingsStore.setEnabled(value),
        setPinnedModel: (value) => settingsStore.setPinnedModel(value),
      }),
    }, SettingsRow))
  }
}

function createCatalogStore(resolveRemoteSession) {
  let snapshot = { status: 'idle', value: null, error: null }
  let generation = 0
  let inflight = null
  const listeners = new Set()
  const set = (next) => {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    invalidate() {
      generation += 1
      inflight = null
      set({ status: 'idle', value: null, error: null })
    },
    load() {
      if (snapshot.status === 'ready') return Promise.resolve(snapshot.value)
      if (snapshot.status === 'error') return Promise.reject(new Error(snapshot.error ?? 'catalog-failed'))
      if (inflight !== null) return inflight
      const gen = generation
      const settle = (next) => { if (gen === generation) set(next) }
      set({ status: 'loading', value: snapshot.value, error: null })

      // THREE WAYS THIS CAN FAIL, ALL OF THEM MUST END IN 'error'.
      //
      // 1. the RPC rejects;
      // 2. `modelCatalog()` throws synchronously (no transport yet);
      // 3. the RPC RESOLVES with `{ ok: false }` — the normal error shape.
      //
      // Case 3 used to live in the success callback and merely `throw`, which
      // the sibling rejection handler in the same `.then` never sees. The
      // snapshot then stayed `loading` forever: the row showed "…" and the
      // Retry affordance never appeared, so a transient `unavailable` wedged
      // the picker until the page reloaded. The resolution is therefore
      // normalised INTO the rejection path below before anything can throw.
      // The namespace is resolved HERE, not at apply: at apply the gateway may
      // not have installed `remote.session` yet, and reading it through
      // `remote.session` would throw the dotted-name inject error described at
      // the `remoteSession` definition above.
      const remote = resolveRemoteSession()
      const call = remote?.modelCatalog
      let started
      try {
        started = typeof call === 'function'
          ? call.call(remote)
          : Promise.reject(new Error('remote-unavailable'))
      } catch (error) {
        started = Promise.reject(error)
      }

      const operation = Promise.resolve(started).then(
        (response) => {
          if (response?.ok !== true) {
            const error = new Error(response?.error?.code ?? 'catalog-failed')
            settle({ status: 'error', value: snapshot.value, error: error.message })
            throw error
          }
          settle({ status: 'ready', value: response.value ?? { groups: [] }, error: null })
          return response.value
        },
        (error) => {
          settle({ status: 'error', value: snapshot.value, error: String(error?.message ?? error) })
          throw error
        },
      )
      inflight = operation
      void operation.then(
        () => { if (inflight === operation) inflight = null },
        () => { if (inflight === operation) inflight = null },
      )
      return operation
    },
    retry() {
      // A retry is a NEW RPC. Clearing `inflight` is what makes `load()` start
      // one instead of handing back the promise that just failed.
      inflight = null
      set({ status: 'idle', value: snapshot.value, error: null })
      return this.load()
    },
    dispose() {
      generation += 1
      inflight = null
      listeners.clear()
      snapshot = { status: 'idle', value: null, error: null }
    },
  }
}

/**
 * The settings store the row reads.
 *
 * Same shape as every other store here: `getSnapshot`/`subscribe`, read with
 * `useSyncExternalStore`, because a function component receives props and not
 * the framework-built hook props.
 *
 * @param {Storage | undefined} storage the storage object
 * @param {() => void} onChange called after a write, so the host is told
 * @returns {object} the store
 */
export function createSettingsStore(storage, onChange) {
  let enabled = readEnabled(storage)
  let pinnedModel = readPinnedModel(storage)
  let snapshot = { enabled, pinnedModel }
  const listeners = new Set()
  const notify = () => {
    for (const listener of listeners) listener()
    onChange?.()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setEnabled(value) {
      const next = value === true
      if (next === enabled) return
      enabled = next
      snapshot = { enabled, pinnedModel }
      persistSafe(storage, ENABLED_KEY, next ? 'true' : 'false')
      notify()
    },
    setPinnedModel(value) {
      const next = typeof value === 'string' ? value.trim() : ''
      if (next === pinnedModel) return
      pinnedModel = next
      snapshot = { enabled, pinnedModel }
      persistSafe(storage, PINNED_MODEL_KEY, next)
      notify()
    },
    dispose() { listeners.clear() },
  }
}

/**
 * The settings row: a switch and a model field.
 *
 * @param {object} React the host React
 * @param {object | null} primitives the host's ui-primitives, or null
 * @returns {Function} the row component
 */
export function createRow(React, primitives) {
  const h = React.createElement
  const Switch = primitives === null ? null : primitives.Switch
  const Input = primitives === null ? null : primitives.Input
  const Menu = primitives === null ? null : primitives.Menu
  const MenuItemButton = primitives === null ? null : primitives.MenuItemButton
  const IconChevron = primitives === null ? null : primitives.IconChevronDownOutlineRegular
  const IconCheck = primitives === null ? null : primitives.IconCheckOutlineRegular
  const rankByName = typeof primitives?.rankByName === 'function' ? primitives.rankByName : null

  const pinLabel = (pinned, catalogValue, t) => {
    if (pinned === '') return t('predict.follow')
    if (catalogValue !== null) {
      for (const group of catalogValue.groups ?? []) {
        for (const model of group.models ?? []) {
          if (group.id + '/' + model.id === pinned) return model.name ?? model.id
        }
      }
    }
    return pinned
  }

  return function PredictRow(props) {
    const t = props.t
    const state = React.useSyncExternalStore(
      props.settingsStore.subscribe, props.settingsStore.getSnapshot,
    )
    const catalog = React.useSyncExternalStore(
      props.catalog.subscribe, props.catalog.getSnapshot,
    )
    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState('')

    React.useEffect(() => {
      if (!open) return
      props.catalog.load().catch(() => {})
    }, [open, catalog.status])

    const groups = catalog.value === null || typeof catalog.value !== 'object' ? []
      : catalog.value.groups ?? []
    const term = query.trim()
    const groupsFor = () => groups.map((group) => ({
      id: group.id, name: group.name ?? group.id,
      models: rankByName === null || term === '' ? group.models ?? [] : rankByName(group.models ?? [], term),
    })).filter((group) => group.models.length > 0)

    const toggle = Switch === null
      ? h('input', {
        type: 'checkbox', checked: state.enabled, 'aria-label': t('predict.enable'),
        onChange: (event) => props.setEnabled(event.target.checked),
      })
      : h(Switch, {
        checked: state.enabled, label: t('predict.enable'),
        onChange: (next) => props.setEnabled(next),
      })

    const choose = (pin) => { props.setPinnedModel(pin); setOpen(false); setQuery('') }
    const checkFor = (pin) => pin === state.pinnedModel && IconCheck !== null
      ? h('span', { className: 'dsh-predict-check' }, h(IconCheck, { size: 14 }))
      : null

    const selectFallback = h('select', {
      className: 'dsh-predict-model-input', 'aria-label': t('predict.model'),
      value: state.pinnedModel,
      onFocus: () => { props.catalog.load().catch(() => {}) },
      onChange: (event) => props.setPinnedModel(event.target.value),
    },
    h('option', { value: '' }, t('predict.follow')),
    groups.map((group) => h('optgroup', { key: group.id, label: group.name ?? group.id },
      (group.models ?? []).map((model) => h('option', {
        key: model.id, value: group.id + '/' + model.id,
      }, model.name ?? model.id)))),
    state.pinnedModel !== '' && pinLabel(state.pinnedModel, catalog.value, t) === state.pinnedModel
      ? h('option', { value: state.pinnedModel }, state.pinnedModel)
      : null)

    // ONE ROW SHELL, TWO CONTROLS. Built before either control so the degraded
    // path and the menu path cannot drift apart in spacing or class names.
    const layout = (control) => h('div', { className: 'dsh-predict-row' },
      h('div', { className: 'dsh-predict-main' },
        h('div', { className: 'dsh-predict-title' }, t('predict.title')),
        h('div', { className: 'dsh-predict-hint' }, t('predict.hint'))),
      h('div', { className: 'dsh-predict-control' },
        h('div', { className: 'dsh-predict-switch-row' }, toggle),
        h('div', { className: 'dsh-predict-model-row' },
          h('label', { className: 'dsh-predict-model-label' }, t('predict.model')),
          control)))

    // THE DEGRADED PATH IS DECIDED BEFORE ANY PRIMITIVE IS USED AS A TYPE.
    //
    // This was a real defect, not tidiness: the menu children below were built
    // unconditionally, so with `MenuItemButton` absent `h(MenuItemButton, …)`
    // became `h(null, …)` and React threw "Element type is invalid". The host
    // replaces a thrown slot occupant with an EMPTY `div[data-slot-error]`
    // (renderer `SlotErrorBoundary`), which is a zero-height direct child of the
    // settings list — and the theme's row hairline then painted a second 0.5px
    // line one device pixel under 「默认 shell」. That is the "thick line".
    // A row that cannot build its menu must still render a usable control.
    if (Menu === null || MenuItemButton === null || Input === null || rankByName === null) {
      return layout(selectFallback)
    }

    const menuChildren = []
    menuChildren.push(h(Input, {
      key: 'search', className: 'dsh-predict-search', value: query,
      placeholder: t('predict.search'), 'aria-label': t('predict.search'),
      onChange: (event) => setQuery(event.target.value),
    }))
    menuChildren.push(h(MenuItemButton, {
      key: 'follow', onSelect: () => choose(''),
    }, h('span', { className: 'dsh-predict-item' },
      h('span', null, t('predict.follow')), checkFor(''))))
    if (catalog.status === 'error') {
      menuChildren.push(h('div', { key: 'error', className: 'dsh-predict-status' },
        h('span', null, t('predict.error')),
        h('button', {
          type: 'button', className: 'dsh-predict-retry',
          onClick: () => { props.catalog.retry().catch(() => {}) },
        }, t('predict.retry'))))
    } else if (catalog.status === 'loading') {
      menuChildren.push(h('div', { key: 'status', className: 'dsh-predict-status' }, '…'))
    } else {
      const grouped = groupsFor()
      if (grouped.length === 0 && catalog.status === 'ready') {
        menuChildren.push(h('div', { key: 'empty', className: 'dsh-predict-status' }, t('predict.empty')))
      }
      for (const group of grouped) {
        menuChildren.push(h('div', { key: 'group:' + group.id, className: 'dsh-predict-group' }, group.name))
        for (const model of group.models) {
          const pin = group.id + '/' + model.id
          menuChildren.push(h(MenuItemButton, {
            key: pin, onSelect: () => choose(pin),
          }, h('span', { className: 'dsh-predict-item' },
            h('span', null, model.name ?? model.id), checkFor(pin))))
        }
      }
    }

    const trigger = (isOpen) => h('button', {
      type: 'button', className: 'dsh-predict-trigger',
      'aria-label': t('predict.model'), 'aria-haspopup': 'menu', 'aria-expanded': isOpen,
      onClick: () => setOpen(!isOpen),
    },
    h('span', { className: 'dsh-predict-value' }, pinLabel(state.pinnedModel, catalog.value, t)),
    IconChevron === null ? '▾' : h(IconChevron, { size: 12 }))

    return layout(h(Menu, {
      open, anchor: trigger(open), items: [],
      onSelect: () => setOpen(false), onClose: () => setOpen(false),
      align: 'end', portal: true, autoFocus: false,
    }, ...menuChildren))
  }
}
