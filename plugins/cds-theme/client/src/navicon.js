/**
 * The 「外观与排版 / Appearance & type」 settings-page icon.
 *
 * WHY THIS FILE EXISTS. The settings sidebar draws each nav entry's glyph from a
 * hardcoded if-chain in the host —
 * `dsh-client-ui-settings-general/lib/client.js:244-266`:
 *
 *   function navIcon(id) {
 *     if (id === 'account')          return <IconUserOutlineMedium … />
 *     if (id === 'models')           return <IconDataOutlineMedium … />
 *     if (id === 'agent-presets')    return <IconAgentPresetOutlineMedium … />
 *     if (id === 'plugins')          return <IconPersonalizationOutlineMedium … />
 *     if (id === 'archived-sessions')return <IconArchiveOutlineMedium … />
 *     return <IconSettingsOutlineMedium … />        // ← everything else: the gear
 *   }
 *
 * and it is called with `row.id` straight from the slot ledger:

 *   {navIcon(row.id)}{<span className={navLabel}>{row.label}</span>}
 *
 * A `settings.section` registration can supply `id`, `order`, `label`, `locale`,
 * `children`, `inject` and `store` — but NOT an icon. So our section gets the
 * fallback branch and renders a gear identical to 「通用 / General」, which is
 * exactly the complaint: two entries, one glyph.
 *
 * THE LEGAL PATH is the one `hero.js` and `markdown.js` already take: find the
 * element structurally, mark it with an attribute this plugin owns, and put our
 * own content there. There is no salted class in any selector below.
 *
 * HOW THE BUTTON IS FOUND. The settings dialog is the stable
 * `[data-shortcut-modal="settings"]` element (`docs/host-hooks.md` §1.8), and the
 * nav entries are its `button`s. A button is OURS when it
 *   - is already marked `data-cds-appearance-nav` (so the identity survives a
 *     language switch that renames the label under it), or
 *   - has a direct `<span>` child whose trimmed text equals our label in EITHER
 *     registered language, and a direct `<svg>` child to replace.
 * The label is the disambiguated one (`appearance.nav`), so it cannot collide
 * with the host's own 「外观 / Appearance」 row inside General — that one is a
 * row in the page body, not a nav entry, and carries no `<svg>`.
 *
 * WHY THE HOST SVG IS HIDDEN RATHER THAN REMOVED. React owns that node. Removing
 * a React-managed child from a parent React tracks is how `removeChild` calls
 * start throwing (the same trap task-3 hit in system-fonts). So the host `<svg>`
 * stays exactly where it is and gets an inline `display: none` that this module
 * records and restores on dispose; our icon is inserted BEFORE it, so it lands
 * in the same slot. Inline `style` is not a prop the nav button sets, so React
 * never rewrites it; the attribute writes are the only other mutation, and both
 * are idempotent.
 *
 * DEGRADATION. Every lookup returns null rather than throwing: no settings
 * dialog, no nav list, a future host that renames the label, a nav built without
 * `<svg>` — all leave the host's own gear in place and cost nothing. The marker
 * never touches a button it cannot prove is ours, so the other entries keep
 * their icons.
 */

/** Marks the nav button this plugin re-skinned. */
export const NAV_ATTR = 'data-cds-appearance-nav'
/** Marks the `<svg>` this plugin inserted (the host's own has no mark). */
export const ICON_ATTR = 'data-cds-appearance-icon'
/** The settings dialog, published on purpose by the host (`docs/host-hooks.md` §1.8). */
export const MODAL_ANCHOR = '[data-shortcut-modal="settings"]'

/** `viewBox` shared by every shipped host nav icon. */
export const ICON_VIEW_BOX = '0 0 16 16'

/**
 * The mark: **nested rounded squares** — an outer rounded frame with a smaller
 * inset one, concentric.
 *
 * WHY THE PREVIOUS DESIGN WAS BANNED. This glyph used to be a three-slider
 * triptych (three tracks, one knob each). The host's own
 * `IconPersonalizationOutlineMedium` — the glyph for the 「插件 / Plugins」 entry,
 * extracted from the shipped bundle: **3 circles + 3 gapped tracks** — is the
 * SAME design. Two entries in one nav column therefore showed the same sliders,
 * which the user reported twice. That motif belongs to 插件 now.
 *
 * WHY THIS ONE CANNOT COLLIDE. Measured against all five shipped nav glyphs
 * (`IconSettingsOutlineMedium` gear / `IconPersonalizationOutlineMedium` sliders /
 * `IconAgentPresetOutlineMedium` knot-ring / `IconDataOutlineMedium` database
 * cylinder / `IconUserOutlineMedium` head-and-shoulders): every one of them is
 * built from paths and circles — **`rects: 0`, `circles: 0` (except
 * personalization) across all five**. A pair of nested axis-aligned rounded
 * rectangles appears in none of them, and no host glyph is a closed concentric
 * pair at all.
 *
 * MEANING. It is what this page actually configures: outer frame = the surface,
 * inner frame = the shape inside it, gap = padding, radius corners = the corner
 * radius. It also echoes the plugin's own list artwork (two offset surfaces).
 *
 * TWO RECTS + CONCENTRIC GAP. Outer 10.8×10.8 at (2.6,2.6) r3.2; inner 4.2×4.2 at
 * (5.9,5.9) r1.4. The gap is 2.1px on every side, so the two frames are exactly
 * concentric: (2.6 + 5.4) = (5.9 + 2.1) = 8, the grid centre, and both corners
 * share that centre. Radii differ (3.2 vs 1.4) so the inner frame is visibly
 * "tighter" — that difference is the point: it is the 同心圆角 rule the theme
 * itself applies to the menu material.
 *
 * Geometry is shared between the two rungs — only `stroke-width` differs, like
 * the host's own `Icon*(Outline){Medium,Regular}` pairs (`Medium` = 1.3,
 * `Regular` = 1).
 */
export const ICON_SHAPES = [
  { tag: 'rect', attrs: { x: '2.6', y: '2.6', width: '10.8', height: '10.8', rx: '3.2' } },
  { tag: 'rect', attrs: { x: '5.9', y: '5.9', width: '4.2', height: '4.2', rx: '1.4' } },
]

/**
 * The motif this glyph must never return to: three horizontal tracks, each with
 * a round knob — the host's 插件 glyph. Exported so the regression test can
 * assert it is gone and stays gone.
 */
export const BANNED_MOTIF = {
  what: 'three horizontal slider tracks with round knobs',
  owner: 'IconPersonalizationOutlineMedium (the 插件 nav entry)',
}

/** Stroke width per host rung (`Medium` ships at 1.3, `Regular` at 1). */
export const ICON_STROKE = { medium: '1.3', regular: '1' }

const SVG_NS = 'http://www.w3.org/2000/svg'

/** The attributes every host nav icon carries (read off `IconSettingsOutlineMedium`). */
function rootAttributes(size, strokeWidth) {
  return {
    width: String(size),
    height: String(size),
    viewBox: ICON_VIEW_BOX,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    xmlns: SVG_NS,
  }
}

/** The icon as a standalone SVG document (the `assets/` file and previews). */
export function iconMarkup(size, rung) {
  const strokeWidth = ICON_STROKE[rung] === undefined ? ICON_STROKE.medium : ICON_STROKE[rung]
  const attrs = Object.entries(rootAttributes(size === undefined ? 16 : size, strokeWidth))
    .map(function ([name, value]) { return name + '="' + value + '"' })
    .join(' ')
  const body = ICON_SHAPES.map(function (shape) {
    const parts = Object.entries(shape.attrs)
      .map(function ([name, value]) { return name + '="' + value + '"' })
      .join(' ')
    return '  <' + shape.tag + ' ' + parts + '/>'
  }).join('\n')
  return '<svg ' + attrs + '>\n' + body + '\n</svg>'
}

/** Build the live `<svg>` element for one document. */
export function createIconNode(doc, size, rung) {
  if (!doc || typeof doc.createElementNS !== 'function') return null
  const strokeWidth = ICON_STROKE[rung] === undefined ? ICON_STROKE.medium : ICON_STROKE[rung]
  const svg = doc.createElementNS(SVG_NS, 'svg')
  const attrs = rootAttributes(size === undefined ? 16 : size, strokeWidth)
  for (const [name, value] of Object.entries(attrs)) svg.setAttribute(name, value)
  svg.setAttribute(ICON_ATTR, '')
  for (const shape of ICON_SHAPES) {
    const child = doc.createElementNS(SVG_NS, shape.tag)
    for (const [name, value] of Object.entries(shape.attrs)) child.setAttribute(name, value)
    svg.appendChild(child)
  }
  return svg
}

function elementChildren(el) {
  return el && el.children ? Array.prototype.slice.call(el.children) : []
}

/** The first direct-child `<svg>` that is NOT ours (the host's own icon). */
export function hostSvgOf(button) {
  for (const child of elementChildren(button)) {
    const tag = String(child.tagName || '').toUpperCase()
    if (tag !== 'SVG') continue
    if (typeof child.hasAttribute === 'function' && child.hasAttribute(ICON_ATTR)) continue
    return child
  }
  return null
}

/** The direct-child `<span>` that carries the nav label, or null. */
function labelSpanOf(button) {
  for (const child of elementChildren(button)) {
    if (String(child.tagName || '').toUpperCase() === 'SPAN') return child
  }
  return null
}

function labelMatches(button, labels) {
  const span = labelSpanOf(button)
  if (!span) return false
  const text = String(span.textContent === undefined || span.textContent === null
    ? ''
    : span.textContent).trim()
  if (text === '') return false
  return labels.indexOf(text) >= 0
}

/** The nav button this plugin owns, or null. */
export function findNavButton(root, labels) {
  if (!root || typeof root.querySelectorAll !== 'function') return null
  const list = Array.isArray(labels) ? labels : []
  const scope = typeof root.querySelector === 'function'
    ? (root.querySelector(MODAL_ANCHOR) || root)
    : root
  if (!scope || typeof scope.querySelectorAll !== 'function') return null
  const buttons = Array.prototype.slice.call(scope.querySelectorAll('button'))
  // Identity first: a marked button stays ours even after the label changes
  // under it (a language switch re-renders the span, not the button).
  for (const button of buttons) {
    if (typeof button.hasAttribute === 'function' && button.hasAttribute(NAV_ATTR)) return button
  }
  for (const button of buttons) {
    if (labelMatches(button, list) && hostSvgOf(button) !== null) return button
  }
  return null
}

/** The icon already inserted into this button, or null. */
export function iconIn(button) {
  for (const child of elementChildren(button)) {
    if (String(child.tagName || '').toUpperCase() !== 'SVG') continue
    if (typeof child.hasAttribute === 'function' && child.hasAttribute(ICON_ATTR)) return child
  }
  return null
}

/**
 * Put our icon into the nav button, once.
 *
 * Returns `null` when the button cannot be found (a host without the settings
 * dialog, a renamed label); otherwise `{ button, icon, hostSvg, created }` where
 * `created` is false when the icon was already there — the whole call is
 * idempotent, so the marker can sweep on every frame without writing anything.
 */
export function markAppearanceNav(doc, labels, rung) {
  const button = findNavButton(doc, labels)
  if (button === null) return null
  const hostSvg = hostSvgOf(button)
  const existing = iconIn(button)
  if (existing !== null && hostSvg !== null && hostSvg.style && hostSvg.style.display === 'none') {
    return { button: button, icon: existing, hostSvg: hostSvg, created: false, previousDisplay: '' }
  }

  // The host's own `display` value is captured BEFORE hiding, so a dispose can
  // restore it exactly (a host that sets its own inline display would otherwise
  // be left with `display:none`).
  const previousDisplay = hostSvg !== null && hostSvg.style
    && typeof hostSvg.style.display === 'string'
    ? hostSvg.style.display
    : ''

  // Size (and therefore the visual weight) follows whatever the host rendered,
  // so a 20px rung or a host that changes the nav size keeps working.
  const rawSize = hostSvg !== null && typeof hostSvg.getAttribute === 'function'
    ? hostSvg.getAttribute('width')
    : null
  const size = rawSize !== null && /^[0-9.]+$/.test(rawSize) ? Number(rawSize) : 16
  const icon = existing !== null ? existing : createIconNode(doc, size, rung)
  if (icon === null) return null

  if (existing === null) {
    if (typeof button.insertBefore === 'function' && hostSvg !== null) {
      button.insertBefore(icon, hostSvg)
    } else if (typeof button.appendChild === 'function') {
      button.appendChild(icon)
    } else {
      return null
    }
  }
  if (hostSvg !== null && hostSvg.style) hostSvg.style.display = 'none'
  if (typeof button.setAttribute === 'function' && !button.hasAttribute(NAV_ATTR)) {
    button.setAttribute(NAV_ATTR, '')
  }
  return {
    button: button,
    icon: icon,
    hostSvg: hostSvg,
    created: existing === null,
    previousDisplay: previousDisplay,
  }
}

/**
 * Own the re-skin for one plugin lifetime.
 *
 * The settings dialog is created and destroyed as React mounts and closes it, so
 * a MutationObserver re-sweeps. The pre-filter is deliberately narrow: only an
 * ADDED node that can contain a `button` schedules a sweep — streamed chat text
 * and markdown blocks cannot, so a streaming session costs no structural query.
 * Sweeps coalesce onto one animation frame.
 *
 * `Observer` is injectable so the logic is testable without a DOM.
 */
export function createAppearanceIconMarker(doc, Observer) {
  const ObserverImpl = Observer === undefined
    ? (typeof MutationObserver === 'function' ? MutationObserver : null)
    : Observer
  const view = doc && doc.defaultView ? doc.defaultView : null
  let observer = null
  let started = false
  let scheduled = false
  // Injected by the lifecycle: reads the CURRENT language's label, so a
  // mid-life language switch is picked up on the next sweep.
  let labelsOf = null
  // Everything this marker changed, so dispose can restore it exactly.
  const touched = []

  function remember(result) {
    if (result === null || !result.created) return
    touched.push({
      button: result.button,
      icon: result.icon,
      hostSvg: result.hostSvg,
      previous: result.previousDisplay,
    })
  }

  function sweep() {
    if (!started) return
    const labels = typeof labelsOf === 'function' ? labelsOf() : []
    remember(markAppearanceNav(doc, labels))
  }

  function schedule() {
    if (!started || scheduled) return
    scheduled = true
    const run = function () {
      scheduled = false
      sweep()
    }
    if (view && typeof view.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(run)
    } else {
      setTimeout(run, 0)
    }
  }

  function onMutations(records) {
    if (!started) return
    if (!records) {
      schedule()
      return
    }
    for (const record of records) {
      const added = record && record.addedNodes ? record.addedNodes : []
      for (const node of added) {
        if (node && node.nodeType === 3) continue
        if (typeof node.querySelector === 'function' && node.querySelector('button') !== null) {
          schedule()
          return
        }
        if (String(node.tagName || '').toUpperCase() === 'BUTTON') {
          schedule()
          return
        }
      }
    }
  }

  // `labelsOf` is injected by the lifecycle: it reads the CURRENT language's
  // label, so a mid-life language switch is picked up on the next sweep.

  return {
    start(readLabels) {
      if (typeof readLabels === 'function') labelsOf = readLabels
      if (started || !doc) return
      started = true
      sweep()
      if (ObserverImpl && doc.body && typeof ObserverImpl === 'function') {
        observer = new ObserverImpl(onMutations)
        observer.observe(doc.body, { childList: true, subtree: true })
      }
    },
    stop() {
      if (!started) return
      started = false
      scheduled = false
      if (observer) {
        observer.disconnect()
        observer = null
      }
      for (const entry of touched.splice(0)) {
        if (entry.icon && entry.icon.parentNode && typeof entry.icon.parentNode.removeChild === 'function') {
          entry.icon.parentNode.removeChild(entry.icon)
        }
        if (entry.hostSvg && entry.hostSvg.style) entry.hostSvg.style.display = entry.previous
        if (entry.button && typeof entry.button.removeAttribute === 'function') {
          entry.button.removeAttribute(NAV_ATTR)
        }
      }
      // A button marked in an earlier sweep whose icon was replaced by React is
      // still marked; clear every remaining mark this plugin owns.
      if (doc && typeof doc.querySelectorAll === 'function') {
        for (const el of Array.prototype.slice.call(doc.querySelectorAll('[' + NAV_ATTR + ']'))) {
          if (typeof el.removeAttribute === 'function') el.removeAttribute(NAV_ATTR)
        }
      }
    },
    sweep,
    get started() { return started },
  }
}
