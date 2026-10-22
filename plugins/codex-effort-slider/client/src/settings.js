/**
 * Settings: schema, storage, and the right-click popover.
 *
 * Ported from upstream with three deliberate changes:
 *
 *  1. **Version migration is preserved.** The storage key is still the upstream
 *     `dsh-codex-effort-slider.settings` and the schema version is still 3, so an
 *     existing install keeps its animation mode instead of silently reverting to
 *     the default. A version mismatch does not DISCARD values either: whatever the
 *     current schema still accepts survives, and the blob is rewritten with the new
 *     version number.
 *
 *  2. **Everything installed here is disposable.** Upstream installed its global
 *     listeners from module scope and never removed them, and it injected the
 *     popover's markup as an `innerHTML` string. Here:
 *       · the popover is built with DOM calls (no markup string, no escaping bugs,
 *         and the audit's "non-constant innerHTML" rule stays satisfiable by
 *         construction);
 *       · every `document` listener is registered through one disposer list, and
 *         {@link createSettingsUi} exposes `dispose()` that removes the listeners,
 *         removes the popover node, clears timers and unhooks the cache listener —
 *         so disabling the plugin leaves no trace and the host's own context menu
 *         behaves exactly as before.
 *
 *  3. **The `[data-ces-system]` sentence describes OUR behaviour, not upstream's.**
 *     Upstream could truthfully say the OS preference changed nothing, because reading
 *     it there only fed the panel hint (`systemReducedMotion()`, whose own comment says
 *     「仅用于面板提示，不影响任何行为」); its slowdown was keyed on the QUICK MODE, not
 *     on the OS. Here reduced motion forces `mode = 'reduced'` (`component.js:127-131`),
 *     so the port inherited a sentence that contradicted its own code. The copy now says
 *     the three modes all stop. Change it only together with that branch — see
 *     `syncPanel()`.
 */

import { SETTINGS_EVENT, SETTINGS_KEY, SETTINGS_VERSION } from './constants.js'

/**
 * The schema drives the popover, the storage validator and the reset action.
 * Adding a setting means adding an entry here and, if it is a new control kind,
 * one branch in `renderKind`.
 *
 * NOTE ON `data-ces-key`: that attribute is the wire between the control and the
 * schema. It is NOT a storage key and is not user data, so it can travel with the
 * port unchanged.
 */
export const SETTINGS_SCHEMA = [
  {
    key: 'motion',
    kind: 'radio',
    group: '动画效果',
    label: '动画效果',
    default: 'full',
    options: [
      { value: 'fast', label: '快速动画' },
      { value: 'quick', label: '简洁动画' },
      { value: 'full', label: '完整动画' },
    ],
  },
  {
    key: 'reachedTicks',
    kind: 'radio',
    group: '已到达档位的刻度点',
    label: '刻度点',
    default: 'hidden',
    options: [
      { value: 'highlight', label: '亮白显示' },
      { value: 'dim', label: '与未到达同色' },
      { value: 'hidden', label: '隐藏' },
    ],
  },
]

/** Every key at its default. */
export function schemaDefaults(schema) {
  const list = schema === undefined ? SETTINGS_SCHEMA : schema
  const out = {}
  for (const item of list) {
    if (item.default !== undefined) { out[item.key] = item.default; continue }
    if (item.kind === 'radio') out[item.key] = item.options[0].value
    else if (item.kind === 'switch') out[item.key] = true
    else out[item.key] = null
  }
  return out
}

/**
 * Schema-driven validation. An unknown or malformed value falls back to the
 * default, and the result is always COMPLETE — every key present, so no reader
 * has to defend against `undefined`.
 */
export function normalizeSettings(raw, schema) {
  const list = schema === undefined ? SETTINGS_SCHEMA : schema
  const out = schemaDefaults(list)
  const source = raw && typeof raw === 'object' ? raw : {}
  for (const item of list) {
    const value = source[item.key]
    if (value === undefined) continue
    if (item.kind === 'radio') {
      for (const option of item.options) {
        if (option.value === value) { out[item.key] = value; break }
      }
    } else if (item.kind === 'switch') {
      if (typeof value === 'boolean') out[item.key] = value
    }
  }
  return out
}

/**
 * A settings store bound to one storage object.
 *
 * @param {object} deps
 * @param {Storage} [deps.storage] `localStorage`, or undefined when unavailable
 * @param {Window} [deps.win] where the change event is broadcast
 */
export function createSettingsStore(deps) {
  const storage = deps && deps.storage !== undefined ? deps.storage : undefined
  const win = deps && deps.win !== undefined ? deps.win : undefined
  let cache = null

  /** Read, validate and migrate. Never throws: a broken blob means defaults. */
  function read() {
    if (cache !== null) return cache
    let raw = null
    try {
      if (storage) raw = storage.getItem(SETTINGS_KEY)
    } catch (error) {
      /* unreadable storage: defaults */
    }
    let parsed = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch (error) {
      parsed = null
    }
    const out = normalizeSettings(parsed)
    out.v = SETTINGS_VERSION
    // A version bump keeps whatever the current schema still accepts and just
    // stamps the new version. Dropping the blob would lose the user's choice for a
    // purely internal reason.
    if (parsed && typeof parsed === 'object' && parsed.v !== SETTINGS_VERSION) {
      try {
        if (storage) storage.setItem(SETTINGS_KEY, JSON.stringify(out))
      } catch (error) {
        /* the values already survived in memory */
      }
    }
    cache = out
    return out
  }

  /** Merge a patch, persist it, and broadcast. */
  function write(patch) {
    const merged = Object.assign({}, read())
    if (patch && typeof patch === 'object') Object.assign(merged, patch)
    const next = normalizeSettings(merged)
    next.v = SETTINGS_VERSION
    cache = next
    try {
      if (storage) storage.setItem(SETTINGS_KEY, JSON.stringify(next))
    } catch (error) {
      /* persisting is best-effort */
    }
    try {
      if (win && typeof win.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        win.dispatchEvent(new CustomEvent(SETTINGS_EVENT))
      }
    } catch (error) {
      /* broadcasting is best-effort */
    }
    return next
  }

  return {
    read,
    write,
    /** Called when another instance (or another window) wrote settings. */
    invalidate() { cache = null },
    key: SETTINGS_KEY,
    event: SETTINGS_EVENT,
  }
}

/** Which animation mode is active. Always one of the three known values. */
export function motionMode(store) {
  const mode = store.read().motion
  return mode === 'quick' || mode === 'fast' ? mode : 'full'
}

/**
 * The popover.
 *
 * @param {object} deps
 * @param {Document} deps.doc
 * @param {Window} deps.win
 * @param {object} deps.store the settings store
 * @param {(text: string) => void} [deps.copy] clipboard sink (injectable for tests)
 * @param {() => string} [deps.diagnostics] text for the "copy diagnostics" button
 */
export function createSettingsUi(deps) {
  const doc = deps.doc
  const win = deps.win
  const store = deps.store
  const copy = deps.copy
  const diagnostics = deps.diagnostics

  /** @type {Array<() => void>} */
  const teardown = []
  const state = { panel: null, longPressTimer: null, longPressOrigin: null, anchorEl: null }
  let installed = false

  /** Register one document/window listener and remember how to remove it. */
  function listen(target, type, handler, capture) {
    if (!target || typeof target.addEventListener !== 'function') return
    target.addEventListener(type, handler, capture === true)
    teardown.push(function () { target.removeEventListener(type, handler, capture === true) })
  }

  function isOurSlider(node) {
    return !!(node && typeof node.closest === 'function' && node.closest('.ces-inline'))
  }

  /** Build one element with optional attributes/text. Keeps this file free of markup strings. */
  function el(tag, attrs, text) {
    const node = doc.createElement(tag)
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key]
        if (value === undefined || value === null || value === false) continue
        if (key === 'className') node.className = value
        else if (key === 'checked' || key === 'disabled') node[key] = value === true
        else node.setAttribute(key, String(value))
      }
    }
    if (text !== undefined && text !== null) node.textContent = String(text)
    return node
  }

  /** One schema entry → its control(s). Unknown kinds render nothing and are skipped. */
  function renderKind(item, value) {
    if (item.kind === 'radio') {
      const group = el('fieldset', { className: 'ces-set__group', role: 'radiogroup', 'aria-label': item.group || item.label })
      if (item.group) group.appendChild(el('legend', { className: 'ces-set__legend' }, item.group))
      for (const option of item.options) {
        const label = el('label')
        label.appendChild(el('input', {
          type: 'radio',
          name: 'ces-' + item.key,
          'data-ces-key': item.key,
          value: option.value,
          checked: value === option.value,
        }))
        label.appendChild(doc.createTextNode(' ' + option.label))
        group.appendChild(label)
      }
      return group
    }
    if (item.kind === 'switch') {
      const group = el('div', { className: 'ces-set__group' })
      const label = el('label')
      label.appendChild(el('input', { type: 'checkbox', 'data-ces-key': item.key, checked: value === true }))
      label.appendChild(doc.createTextNode(' ' + item.label))
      group.appendChild(label)
      return group
    }
    return null
  }

  function disposePanel() {
    if (state.longPressTimer !== null) {
      clearTimeout(state.longPressTimer)
      state.longPressTimer = null
    }
    const panel = state.panel
    state.panel = null
    if (panel && panel.parentNode) {
      try { panel.parentNode.removeChild(panel) } catch (error) { /* ignore */ }
    }
  }

  /**
   * Push the stored values into the existing controls.
   *
   * THE `data-ces-system` LINE STATES THE BEHAVIOUR, NOT UPSTREAM'S. Upstream said
   * 「三种动画都不受系统「减少动态效果」影响」 because there the OS preference really
   * changed nothing. Here it does: `component.js:127-131` forces the mode to
   * `'reduced'` the moment the OS asks for reduced motion, whatever the stored value
   * is, and the repo's accessibility rule (AGENTS.md §五) requires exactly that. The
   * port inherited upstream's sentence and it contradicted the code — a settings row
   * that promises "no effect" while the animation actually stops is worse than no
   * row, because the user then goes looking for the fault in the OS.
   *
   * So this sentence may only be changed together with `component.js:127-131`.
   */
  function syncPanel() {
    const panel = state.panel
    if (!panel) return
    const settings = store.read()
    for (const item of SETTINGS_SCHEMA) {
      if (item.kind !== 'radio') continue
      for (const input of panel.querySelectorAll('[data-ces-key="' + item.key + '"]')) {
        input.checked = input.value === settings[item.key]
      }
    }
    const system = panel.querySelector('[data-ces-system]')
    if (system) system.textContent = '系统要求「减少动态效果」时，以上三种动画都会停止：不渲染粒子、禁用扫光、旋钮直接跳位（拖拽与写回照常）'
  }

  function buildPanel() {
    disposePanel()
    const panel = el('div', { className: 'ces-set', role: 'dialog', 'aria-label': '推理等级滑条 · 设置', tabindex: '-1' })
    panel.appendChild(el('div', { className: 'ces-set__title' }, '滑条设置'))
    panel.appendChild(el('div', { className: 'ces-set__row', 'data-ces-system': '' }))
    const settings = store.read()
    for (const item of SETTINGS_SCHEMA) {
      const control = renderKind(item, settings[item.key])
      if (control !== null) panel.appendChild(control)
    }
    const actions = el('div', { className: 'ces-set__actions' })
    actions.appendChild(el('button', { type: 'button', 'data-ces-trace': '' }, '复制诊断'))
    actions.appendChild(el('button', { type: 'button', 'data-ces-reset': '' }, '恢复默认'))
    actions.appendChild(el('button', { type: 'button', 'data-ces-close': '' }, '关闭'))
    panel.appendChild(actions)

    // Changes are driven entirely by `data-ces-key`, so a new setting needs no edit
    // here. `input` only: listening to `change` too would write every radio twice.
    panel.addEventListener('input', function (event) {
      const input = event.target
      if (!input || typeof input.getAttribute !== 'function') return
      const key = input.getAttribute('data-ces-key')
      if (!key) return
      const item = SETTINGS_SCHEMA.find(function (entry) { return entry.key === key })
      if (!item) return
      const patch = {}
      patch[key] = item.kind === 'switch' ? input.checked === true : input.value
      store.write(patch)
      syncPanel()
    })
    panel.addEventListener('click', function (event) {
      const target = event.target
      if (!target || typeof target.hasAttribute !== 'function') return
      if (target.hasAttribute('data-ces-trace')) {
        const text = typeof diagnostics === 'function' ? diagnostics() : ''
        let label = '无法复制'
        try {
          if (typeof copy === 'function') { copy(text); label = '已复制 ✓' }
        } catch (error) { label = '无法复制' }
        target.textContent = label
        setTimeout(function () {
          try { target.textContent = '复制诊断' } catch (error) { /* gone */ }
        }, 1500)
      }
      if (target.hasAttribute('data-ces-reset')) { store.write(schemaDefaults()); syncPanel() }
      if (target.hasAttribute('data-ces-close')) closePanel()
    })
    // A press inside the popover must not reach the host's outside-click closers.
    panel.addEventListener('mousedown', function (event) { event.stopPropagation() })

    if (doc.body) doc.body.appendChild(panel)
    state.panel = panel
    return panel
  }

  function closePanel() {
    const panel = state.panel
    if (!panel || panel.style.display === 'none') return
    panel.style.display = 'none'
    try {
      if (state.anchorEl && typeof state.anchorEl.focus === 'function') state.anchorEl.focus()
    } catch (error) { /* ignore */ }
  }

  function openPanel(rect, anchorEl) {
    if (!doc || !doc.body) return
    const panel = buildPanel()
    syncPanel()
    panel.style.display = 'block'
    state.anchorEl = anchorEl || null
    const width = panel.offsetWidth || 280
    const height = panel.offsetHeight || 200
    const x = rect ? rect.left : 40
    const y = rect ? rect.bottom + 6 : 80
    const maxX = (win && win.innerWidth ? win.innerWidth : 1024) - width - 8
    const maxY = (win && win.innerHeight ? win.innerHeight : 768) - height - 8
    panel.style.left = Math.max(8, Math.min(x, maxX)) + 'px'
    panel.style.top = Math.max(8, Math.min(y, maxY)) + 'px'
    try { panel.focus() } catch (error) { /* not focusable is fine */ }
  }

  /** Install the global gestures. Idempotent. */
  function install() {
    if (installed || !doc || typeof doc.addEventListener !== 'function') return
    installed = true

    // The settings cache must drop when settings change, so a second instance or
    // another window cannot serve a stale read.
    listen(win, SETTINGS_EVENT, function () { store.invalidate() })

    // 1) Right-click on the slider.
    listen(doc, 'contextmenu', function (event) {
      if (!isOurSlider(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      const hostEl = event.target.closest('.ces-inline')
      openPanel(hostEl.getBoundingClientRect(), hostEl)
    }, true)

    // 2) Long press (600ms, and only while the pointer stays put — a drag must
    //    never open this popover).
    listen(doc, 'pointerdown', function (event) {
      if (!isOurSlider(event.target)) return
      const hostEl = event.target.closest('.ces-inline')
      clearTimeout(state.longPressTimer)
      state.longPressOrigin = { x: event.clientX, y: event.clientY }
      state.longPressTimer = setTimeout(function () {
        state.longPressTimer = null
        openPanel(hostEl.getBoundingClientRect(), hostEl)
      }, 600)
    }, true)
    const cancelLongPress = function () {
      if (!state.longPressTimer) return
      clearTimeout(state.longPressTimer)
      state.longPressTimer = null
    }
    listen(doc, 'pointermove', function (event) {
      const origin = state.longPressOrigin
      if (!origin) return
      if (Math.abs((event.clientX || 0) - origin.x) > 6 || Math.abs((event.clientY || 0) - origin.y) > 6) {
        cancelLongPress()
      }
    }, true)
    listen(doc, 'pointerup', cancelLongPress, true)
    listen(doc, 'pointercancel', cancelLongPress, true)

    // 3) Keyboard equivalent of right-click (which a keyboard user cannot reach).
    listen(doc, 'keydown', function (event) {
      const isMenuKey = (event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu'
      if (!isMenuKey) return
      const activeEl = doc.activeElement
      if (!isOurSlider(activeEl)) return
      event.preventDefault()
      openPanel(activeEl.getBoundingClientRect(), activeEl)
    }, true)

    // 4) Escape, or a press outside, closes it.
    listen(doc, 'keydown', function (event) {
      if (event.key === 'Escape') closePanel()
    }, true)
    listen(doc, 'mousedown', function (event) {
      const panel = state.panel
      if (!panel || panel.style.display === 'none') return
      if (panel.contains(event.target)) return
      // Right-click / long press re-opens it right after, so do not close on those.
      if (isOurSlider(event.target)) return
      closePanel()
    }, true)
  }

  /** Remove every listener, the popover node, and the timers. */
  function dispose() {
    installed = false
    disposePanel()
    state.longPressOrigin = null
    state.anchorEl = null
    while (teardown.length > 0) {
      const remove = teardown.pop()
      try { remove() } catch (error) { /* ignore */ }
    }
  }

  return {
    install,
    dispose,
    openPanel,
    closePanel,
    isOpen() { return !!(state.panel && state.panel.style.display !== 'none') },
    panel() { return state.panel },
  }
}
