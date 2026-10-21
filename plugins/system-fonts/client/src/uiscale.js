/**
 * Text-only UI scaling for the chrome.
 *
 * WHY NOT `zoom`. `zoom` multiplies the whole subtree — text, padding, icons,
 * the container's own box — so the settings dialog grows and the layout moves.
 * The user asked for bigger UI TEXT, not a scaled layout: the sidebar labels
 * should get bigger, the column should stay where it is.
 *
 * WHY NOT CSS `font-size`. The host's chrome sets concrete pixel `font`
 * shorthands in CSS-Modules classes (`500 14px/22px`, `12px/18px`), whose
 * names are salted per build. There is no stable selector to override and no
 * variable to retarget, so the only way to reach those sizes is to read each
 * element's computed size and write the scaled value inline.
 *
 * SCOPE. Only chrome roots with stable hooks: the sidebar and the settings
 * dialog. Conversation content is deliberately absent — it already follows the
 * host's 字号大小 setting, and two scales multiplying would be unexplainable.
 *
 * LIFECYCLE. Bases are recorded once per element, before its first write, so
 * repeated passes never compound. `setScale(100)` restores every touched
 * element to its exact inline prior state (usually "none"). A MutationObserver
 * per root applies to nodes React mounts later (settings rows, new sessions).
 */

/** Stable chrome roots. `data-slot` and `data-shortcut-modal` are host hooks. */
export const UI_SCALE_SCOPES = [
  '[data-slot="sidebar"]',
  '[data-shortcut-modal="settings"]',
]

/** Elements whose text the browser paints from a value, not a text node. */
const VALUE_TEXT = /^(INPUT|TEXTAREA)$/

/**
 * @param {object} options
 * @param {Document | undefined} options.document the host document
 * @param {() => number} options.getScale the settings value (90–120)
 * @param {object} [options.window] the window (tests may inject one)
 * @returns {object} the controller
 */
export function createUiScaler({ document: doc, getScale, window: win }) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return emptyScaler()
  const view = win ?? doc.defaultView
  if (!view || typeof view.getComputedStyle !== 'function') return emptyScaler()

  const bases = new WeakMap()
  const touched = new Set()
  const observedRoots = new WeakSet()
  const rootObservers = new Set()
  let bodyObserver = null
  let scale = 1
  let scheduled = false
  let active = false

  const raf = typeof view.requestAnimationFrame === 'function'
    ? (fn) => view.requestAnimationFrame(fn)
    : (fn) => setTimeout(fn, 16)

  function hasDirectText(el) {
    const nodes = el.childNodes
    if (!nodes) return false
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]
      if (node.nodeType === 3 && String(node.textContent ?? '').trim() !== '') return true
    }
    return false
  }

  /** Record the host's own size before the first write. */
  function record(el) {
    const style = view.getComputedStyle(el)
    const line = String(style.lineHeight ?? '')
    const base = {
      size: Number.parseFloat(style.fontSize),
      linePx: /^-?\d+(\.\d+)?px$/.test(line) ? Number.parseFloat(line) : null,
      ownSize: el.style.getPropertyValue('font-size'),
      ownSizePriority: el.style.getPropertyPriority('font-size'),
      ownLine: el.style.getPropertyValue('line-height'),
      ownLinePriority: el.style.getPropertyPriority('line-height'),
    }
    bases.set(el, base)
    return base
  }

  function write(el, base) {
    if (!(base.size > 0)) return
    const size = Math.round(base.size * scale * 100) / 100
    if (el.style.getPropertyValue('font-size') !== size + 'px') {
      el.style.setProperty('font-size', size + 'px', 'important')
    }
    if (base.linePx !== null && base.linePx > 0) {
      const line = Math.round(base.linePx * scale * 100) / 100
      if (el.style.getPropertyValue('line-height') !== line + 'px') {
        el.style.setProperty('line-height', line + 'px', 'important')
      }
    }
    touched.add(el)
  }

  function applyTo(el) {
    if (!el || el.nodeType !== 1) return
    if (scale === 1) return
    const cached = bases.get(el)
    if (cached) { write(el, cached); return }
    if (!hasDirectText(el) && !VALUE_TEXT.test(el.tagName)) return
    write(el, record(el))
  }

  function walk(root) {
    applyTo(root)
    const all = root.querySelectorAll('*')
    for (let i = 0; i < all.length; i += 1) applyTo(all[i])
  }

  function restore() {
    for (const el of touched) {
      const base = bases.get(el)
      if (!base) continue
      if (base.ownSize !== '') el.style.setProperty('font-size', base.ownSize, base.ownSizePriority)
      else el.style.removeProperty('font-size')
      if (base.ownLine !== '') el.style.setProperty('line-height', base.ownLine, base.ownLinePriority)
      else el.style.removeProperty('line-height')
    }
    touched.clear()
  }

  function observeRoot(root) {
    if (observedRoots.has(root)) return
    const Observer = view.MutationObserver
    if (typeof Observer !== 'function') return
    observedRoots.add(root)
    const observer = new Observer(schedule)
    try {
      observer.observe(root, { childList: true, subtree: true })
      rootObservers.add(observer)
    } catch (error) { /* a detached root will be picked up by the next pass */ }
  }

  function roots() {
    const out = []
    for (const selector of UI_SCALE_SCOPES) {
      const found = doc.querySelectorAll(selector)
      for (let i = 0; i < found.length; i += 1) out.push(found[i])
    }
    return out
  }

  function refresh() {
    scheduled = false
    if (!active) return
    if (scale === 1) return
    for (const root of roots()) {
      observeRoot(root)
      walk(root)
    }
  }

  function schedule() {
    if (!active || scheduled) return
    scheduled = true
    raf(refresh)
  }

  function setScale(next) {
    const value = Number(next)
    if (!Number.isFinite(value) || value <= 0) return
    // 0.5–3 is a sanity rail, not a product limit: the row itself is 10–20 px
    // against a 14 px base, so callers stay well inside it.
    const factor = Math.min(3, Math.max(0.5, value))
    if (factor === scale) return
    if (factor === 1) {
      scale = 1
      restore()
      return
    }
    scale = factor
    refresh()
  }

  function activate() {
    if (active) return
    active = true
    const Observer = view.MutationObserver
    if (typeof Observer === 'function' && doc.body) {
      // The settings dialog is a portal mounted on body AFTER boot; this
      // observer notices its arrival. Subtree work belongs to the root
      // observers so streaming churn never reaches this callback.
      bodyObserver = new Observer((records) => {
        for (const record of records) {
          for (const node of record.addedNodes ?? []) {
            if (node.nodeType !== 1) continue
            if (UI_SCALE_SCOPES.some((selector) => node.matches?.(selector) || node.querySelector?.(selector))) {
              schedule()
              return
            }
          }
        }
      })
      try { bodyObserver.observe(doc.body, { childList: true }) } catch (error) { /* no body, no observer */ }
    }
    refresh()
  }

  function teardown() {
    active = false
    restore()
    for (const observer of rootObservers) {
      try { observer.disconnect() } catch (error) { /* already gone */ }
    }
    rootObservers.clear()
    if (bodyObserver !== null) {
      try { bodyObserver.disconnect() } catch (error) { /* already gone */ }
      bodyObserver = null
    }
  }

  return { activate, setScale, refresh, teardown, getScale: () => scale }
}

function emptyScaler() {
  return {
    activate() {},
    setScale() {},
    refresh() {},
    teardown() {},
    getScale: () => 1,
  }
}