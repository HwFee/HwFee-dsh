import {
  PLUGIN_ID, DEFAULT_UI_STACK,
} from './constants.js'
import { buildStack } from './typography.js'

/**
 * Shadow-root typography.
 *
 * A stylesheet in `document.head` cannot select into a shadow tree: only
 * inherited custom properties cross the boundary. The Windows caption
 * menubar (the 应用 / 编辑 bar, mounted by the host's preload script as
 * `div[data-windows-menu]` with an open shadow root) hard-codes
 * `button { font: inherit; font-size: 14px }`, so its family and size cannot
 * follow the host from the outside. The plugin therefore writes one small
 * stylesheet INTO each open shadow root.
 *
 * FAMILY AND SIZE ONLY. Weight is deliberately absent: the theme owns the
 * weight of every step (this plugin no longer has a weight control, and a
 * `font-weight` here would fight the theme's own choice).
 *
 * The caption menubar also follows the host's own 字号大小 axis — the
 * `--dsh-content-font-size` variable `dsh-client-ui-theme` writes on `body` —
 * so the titlebar grows and shrinks with the setting that already drives the
 * conversation content.
 */
export const SHADOW_STYLE_ID = PLUGIN_ID + '/shadow'

/**
 * The backstop sweep interval, in ms.
 *
 * The per-mutation pass (`sweepNodes`) is what finds a NEW shadow root the
 * moment it appears, so this timer is only a safety net for a root that was
 * already in the tree when the plugin activated. It therefore does not need to
 * be frequent — it needs to be RATE LIMITED, which is what the timestamp check
 * in `activate()` is for: at most one per interval regardless of mutation rate.
 */
export const BACKSTOP_MS = 400

/** The host element of the Windows caption menubar. */
export const CAPTION_MENU_SELECTOR = '[data-windows-menu]'

function isCaptionMenu(el) {
  if (!el) return false
  if (el.dataset && 'windowsMenu' in el.dataset) return true
  return typeof el.matches === 'function' && el.matches(CAPTION_MENU_SELECTOR)
}

/**
 * The stylesheet for one shadow root. `caption` adds the host's font-size
 * axis, which is a titlebar concern and not a general one.
 */
export function buildShadowCss(current, caption) {
  const lines = ['/* ' + PLUGIN_ID + ' — shadow typography */']
  if (current.uiFamily) {
    lines.push(':host { font-family: ' + buildStack(current.uiFamily, DEFAULT_UI_STACK) + ' !important; }')
  }
  if (caption) {
    // The host owns 字号大小; the titlebar follows it rather than inventing
    // its own scale. 14px is the menubar's own shipped size, so the default
    // setting changes nothing.
    lines.push('button, [role="menuitem"] { font-size: var(--dsh-content-font-size, 14px) !important; }')
  }
  return lines.join('\n')
}

export function createChrome({ getState }) {
  let active = false
  let observer = null
  const installed = new Map()
  const timers = []
  const sweeps = []
  /** At most one backstop sweep per `BACKSTOP_MS`, however hard the DOM churns. */
  let backstopArmed = false
  let lastBackstopAt = 0

  function paint(host) {
    if (!active || !host || !host.shadowRoot) return
    // Never install a stylesheet into a host React has already detached: the
    // tag would be unreachable and the entry would outlive its element.
    if (host.isConnected === false) return
    const root = host.shadowRoot
    const caption = isCaptionMenu(host)
    const css = buildShadowCss(getState(), caption)
    let entry = installed.get(root)
    if (entry === undefined || entry.host !== host || !entry.tag.isConnected) {
      let tag = root.querySelector ? root.querySelector('style#' + SHADOW_STYLE_ID.replace(/\//g, '\\/')) : null
      if (tag === null) {
        tag = document.createElement('style')
        tag.id = SHADOW_STYLE_ID
        tag.dataset.plugin = PLUGIN_ID
        root.appendChild(tag)
      }
      entry = { host: host, tag: tag }
      installed.set(root, entry)
    }
    if (entry.tag.textContent !== css) entry.tag.textContent = css
  }

  function hostsOf(scope) {
    const out = []
    if (!scope) return out
    if (scope.shadowRoot) out.push(scope)
    if (typeof scope.querySelectorAll === 'function') {
      const all = scope.querySelectorAll('*')
      for (let i = 0; i < all.length; i += 1) {
        if (all[i].shadowRoot) out.push(all[i])
      }
    }
    return out
  }

  /** Paint every open shadow root: the ones we already know, plus new ones. */
  function sweep() {
    if (!active || typeof document === 'undefined') return
    // The app mints a shadow root per tooltip/popover, so entries whose host
    // left the document must go: keeping them would grow this map for the
    // whole session AND repaint a detached tree on every sweep.
    for (const [root, entry] of Array.from(installed)) {
      if (!entry.host || entry.host.isConnected === false || !entry.tag.isConnected) {
        if (entry.tag && entry.tag.parentNode) entry.tag.parentNode.removeChild(entry.tag)
        installed.delete(root)
        continue
      }
      paint(entry.host)
    }
    if (typeof document.querySelector === 'function') {
      const caption = document.querySelector(CAPTION_MENU_SELECTOR)
      if (caption) paint(caption)
    }
    // ONE walk: documentElement contains body. Walking both was the same
    // document scanned twice per sweep, and the sweep runs on every state
    // change (each slider tick) as well as on the debounced observer pass.
    const scope = document.documentElement || document.body
    for (const host of hostsOf(scope)) paint(host)
  }

  /** Cheap pass: only the nodes that just arrived. */
  function sweepNodes(nodes) {
    if (!active) return
    for (const node of nodes) {
      if (!node || node.nodeType !== 1) continue
      for (const host of hostsOf(node)) paint(host)
    }
  }

  function schedule(fn, ms) {
    if (typeof setTimeout !== 'function') return
    // Remove the id when it fires: this array is the teardown list, and leaving
    // fired ids in it grew it for the whole session.
    const id = setTimeout(function () {
      const at = timers.indexOf(id)
      if (at >= 0) timers.splice(at, 1)
      fn()
    }, ms)
    timers.push(id)
  }

  function activate() {
    if (active) return
    active = true
    sweep()
    // Shadow roots can appear after us — the caption menubar is mounted by the
    // preload script, tooltips and popovers on demand.
    if (typeof MutationObserver === 'function' && document.documentElement) {
      observer = new MutationObserver(function (records) {
        const nodes = []
        for (const record of records) {
          for (const node of record.addedNodes) nodes.push(node)
        }
        if (nodes.length > 0) sweepNodes(nodes)
        // RATE LIMIT THE BACKSTOP, DO NOT DEPTH-LIMIT IT.
        //
        // This used to read `if (sweeps.length < 4)`, which looks like a throttle
        // but is a QUEUE DEPTH: each timer pops itself when it fires, so the
        // queue drains at the timer's own rate and refills on the next mutation.
        // During a stream that is mutations on every frame, so the backstop kept
        // firing at ~2/s forever. The repo's performance review measured it on a
        // 5.2 s stream of the real page: **42 full sweeps (8.1/s)** with this
        // shape, versus 12 with a cap of one and 2 with no backstop at all. One
        // sweep is a document-wide `querySelectorAll('*')` plus a `paint()` per
        // open shadow root: 40 µs on a 537-element page but **880 µs on 12,717**
        // — i.e. ~110 µs of script per frame out of the 137 µs/frame that all
        // four of this plugin's observers cost together.
        //
        // A timestamp is the actual rate limit: at most one backstop sweep per
        // BACKSTOP_MS regardless of how much the DOM churns. The per-node pass
        // above stays instant — that is the one that finds NEW shadow roots as
        // they appear, so the backstop is only a safety net for roots that were
        // already in the tree at activation time.
        if (!backstopArmed && Date.now() - lastBackstopAt >= BACKSTOP_MS) {
          backstopArmed = true
          lastBackstopAt = Date.now() + BACKSTOP_MS
          schedule(function () {
            backstopArmed = false
            if (active) sweep()
          }, BACKSTOP_MS)
        }
      })
      observer.observe(document.documentElement, { childList: true, subtree: true })
    }
    schedule(sweep, 600)
  }

  function teardown() {
    active = false
    if (observer !== null) { observer.disconnect(); observer = null }
    for (const timer of timers.splice(0)) clearTimeout(timer)
    sweeps.length = 0
    backstopArmed = false
    lastBackstopAt = 0
    installed.forEach(function (entry) {
      if (entry.tag && entry.tag.parentNode) entry.tag.parentNode.removeChild(entry.tag)
    })
    installed.clear()
  }

  return {
    activate,
    apply: sweep,
    teardown,
    paint,
    buildShadowCss,
    get active() { return active },
    /** Test/introspection surface: live (unfired) timers in the teardown list. */
    get timerCount() { return timers.length },
    /** Test/introspection surface: shadow roots still tracked. */
    get hostCount() { return installed.size },
  }
}
