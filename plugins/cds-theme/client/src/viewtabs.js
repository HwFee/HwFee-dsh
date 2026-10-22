/**
 * The two tabs' look: 「宿主原版」 or 「参考胶囊」, and nothing else about them.
 *
 * WHAT THIS DOES NOT TOUCH. The strip's position, when it appears, and whether
 * the 「轨迹」 view exists at all are the host's decisions:
 *
 *   - `viewTabs()` drops the trajectory entry while
 *     `configForms.developerTools.enabled` is false, and
 *   - `ConversationSessionHeader` draws the strip only when
 *     `!hideChrome && tabs.length > 1`.
 *
 * So with 「显示代码工作视图」 off there is not one tab but ZERO, and no
 * stylesheet brings them back. This module therefore writes ONE word on
 * `<body>` and the sheet does the rest. It never reads or writes the host's
 * setting, and the settings row says so.
 *
 * WHY A BODY MARK AND NO OBSERVER. `[data-conversation-tabs]` is public and
 * stable, so the sheet keys on it directly — no per-strip stamping, no
 * MutationObserver, no per-frame query. The strip is React's and may be
 * re-created at any time; a body-level attribute is not, so a re-render cannot
 * lose the look. A screenshot of `<body>` proves the theme did it, which is the
 * other thing a strip-level mark was buying.
 *
 * The reference's hover-to-reveal, its Windows-titlebar placement and its
 * measured lift onto the title row are deliberately NOT ported: the user asked
 * for the buttons' look, and moving the strip would be a second, unrequested
 * change.
 */

/** The attribute written on `<body>`. */
export const TABS_ATTR = 'data-cds-view-tabs'
/** The value that turns the segmented look on. */
export const TABS_PILL = 'pill'
/** The host's tablist. Public and stable; see `docs/host-hooks.md`. */
export const TABS_SELECTOR = '[data-conversation-tabs]'

/**
 * Write (or clear) the style mark on the document's body.
 *
 * Idempotent: writing the value the body already carries is not a DOM mutation,
 * so it cannot wake an observer, and `dispose` is a single `removeAttribute`.
 *
 * @param doc a document (or a fake with `body`)
 * @param style `'host'` (default) or `'pill'`
 */
export function applyTabsStyle(doc, style) {
  const body = doc && doc.body
  if (!body || typeof body.setAttribute !== 'function') return false
  if (style === TABS_PILL) {
    if (typeof body.getAttribute !== 'function' || body.getAttribute(TABS_ATTR) !== TABS_PILL) {
      body.setAttribute(TABS_ATTR, TABS_PILL)
    }
    return true
  }
  if (typeof body.hasAttribute === 'function' && body.hasAttribute(TABS_ATTR)) {
    body.removeAttribute(TABS_ATTR)
  }
  return false
}

/**
 * The runtime half: one attribute, kept in step with the settings store.
 *
 * The gate is the same one the rules ride — `enabled && viewTabsPill` — so the
 * attribute and the CSS can never disagree. `start()` writes it, a store change
 * rewrites it, and `stop()` removes it: that is the whole lifecycle, and there
 * is nothing to observe or restore because the attribute belongs to this plugin.
 *
 * @param options `{ doc, getState, subscribe }` — `subscribe` is the store's own
 */
export function createTabsStyleController(options) {
  const doc = options && options.doc
  const getState = options && typeof options.getState === 'function' ? options.getState : function () { return {} }
  const subscribe = options && typeof options.subscribe === 'function' ? options.subscribe : null
  let off = null

  function wanted() {
    const state = getState() || {}
    return state.enabled !== false && state.viewTabsPill === true
  }

  function sync() {
    applyTabsStyle(doc, wanted() ? TABS_PILL : 'host')
  }

  return {
    start() {
      if (off !== null) return
      sync()
      if (subscribe !== null) off = subscribe(sync)
    },
    sync,
    stop() {
      if (typeof off === 'function') off()
      off = null
      applyTabsStyle(doc, 'host')
    },
    get applied() {
      const body = doc && doc.body
      return !!(body && typeof body.getAttribute === 'function' && body.getAttribute(TABS_ATTR) === TABS_PILL)
    },
  }
}

/**
 * The stylesheet half.
 *
 * Only the container and the selected segment change, and every rule is scoped
 * to the body mark — with the default (`host`) nothing below matches, so the
 * host's underline tabs stand exactly as shipped.
 *
 * GEOMETRY from the reference screenshot's pill: 2px inner padding, 7px
 * container radius, 5px segment radius, 2px gap. COLOUR comes from tokens only —
 * an earlier draft carried three raw `rgba()` values (a 10%-black plate shadow
 * and two white-alpha fills in dark), which would have frozen those tints to
 * this version and ignored the accent/elevation settings beside them. The
 * trough is the host's selector fill, the plate is its overlay surface, and the
 * lift is the theme's own soft elevation tier, so the pill follows the palette
 * and the elevation slider.
 *
 * THE TROUGH MUST HUG ITS TABS, and `inline-flex` alone does not do it. The
 * host renders the strip as a GRID ITEM inside a grid header:
 *
 *   .Dc7zOa_header { display: grid; grid-template-columns: auto minmax(0,1fr) }
 *   .Dc7zOa_tabs   { grid-column: 1/-1; display: flex; gap: 36px }
 *
 * A grid item stretches along the inline axis by default (`justify-self:
 * stretch`), and `display: inline-flex` on the item does not change that — the
 * item's used width still fills its area, so the trough spanned the whole
 * header while the two tabs sat at the left and the right half was dead
 * surface (clicks there hit the groove, not a tab). `justify-self: start` is
 * what shrinks it: it is the grid-level property that decides the item's own
 * size, whereas `width: fit-content` would fight the host's stretch with a
 * second sizing mode and lose as soon as the host sets a width. One property,
 * one mechanism, and the strip still hugs its content if the host ever swaps
 * the grid for a flex row (`align-self: flex-start` semantics in a column flex
 * parent; harmless elsewhere).
 *
 * The host's own `gap: 36px` between the tabs is replaced by the pill's 2px.
 * Both are single-class rules, but this one is
 * `body[attr] [data-conversation-tabs]` — (0,2,0) against the host's (0,1,0) —
 * so it wins on specificity without an `!important`.
 *
 * MOTION: the reference's 120ms crossfade is kept, and turned off entirely
 * under `prefers-reduced-motion` — the house rule is "not slower, none".
 *
 * THE TYPE SCALE IS LEFT AT 13px. The audit measured the reference at 12px, but
 * that is a fidelity judgement about the reference, not a defect: the host's own
 * tab is 13px (`font-size: 13px; line-height: 16px` on `.Dc7zOa_tab`), and the
 * strip keeps the host's step so a pill tab and a host tab sit on the same
 * baseline. Changing it would be an unrequested second change.
 *
 * @returns the rule text, `\n`-joined, ending with a blank line
 */
export function tabsStyleRules() {
  const root = 'body[' + TABS_ATTR + '="' + TABS_PILL + '"] '
  const strip = root + TABS_SELECTOR
  const darkRoot = 'body[' + TABS_ATTR + '="' + TABS_PILL + '"][data-ds-dark-theme] '
  return [
    '/* ---- view tabs: the reference pill, opt-in only ------------------- */',
    strip + ' {',
    '  display: inline-flex;',
    // The shrink that `inline-flex` cannot do as a grid item — see the header.
    '  justify-self: start;',
    '  align-items: center;',
    '  gap: 2px;',
    '  padding: 2px;',
    '  border-radius: 7px;',
    '  background: var(--dsw-specific-selector);',
    '}',
    // The host draws its underline on ::after and its accent on the text; both
    // have to go for a pill, and both come back the moment the mark is removed,
    // because none of this is emitted for the host style.
    strip + ' > button[role="tab"] {',
    '  border: none;',
    '  background: transparent;',
    '  color: var(--dsw-alias-label-tertiary);',
    '  font-size: 13px;',
    '  font-weight: 500;',
    '  line-height: 16px;',
    '  padding: 3px 12px 4px;',
    '  border-radius: 5px;',
    '  transition: color 120ms cubic-bezier(0.16, 1, 0.3, 1),',
    '    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1);',
    '}',
    strip + ' > button[role="tab"]::after {',
    '  display: none;',
    '}',
    strip + ' > button[role="tab"]:hover {',
    '  color: var(--dsw-alias-label-primary);',
    '}',
    strip + ' > button[role="tab"][aria-selected="true"] {',
    '  color: var(--dsw-alias-label-primary);',
    '  background: var(--dsw-alias-bg-overlay);',
    '  box-shadow: var(--dsw-elevation-soft);',
    '}',
    // Dark: the trough is the translucent hover wash the host uses on dark
    // surfaces, and the selected plate is the raised layer — the same two tiers
    // the light pair reads as, so neither palette needs a literal colour.
    darkRoot + TABS_SELECTOR + ' {',
    '  background: var(--dsw-alias-interactive-bg-hover);',
    '}',
    darkRoot + TABS_SELECTOR + ' > button[role="tab"][aria-selected="true"] {',
    '  background: var(--dsw-alias-bg-layer-3);',
    '  box-shadow: none;',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  ' + strip + ' > button[role="tab"] {',
    '    transition: none;',
    '  }',
    '}',
    '',
  ].join('\n')
}

