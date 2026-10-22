import { PLUGIN_ID, PANEL_STYLE_ID } from './constants.js'
import { makeT } from './locales.js'
import { ACCENT_PRESETS } from './palette.js'
import { THEME_MODES, THEME_MODE_LABELS } from './thememode.js'

// --------------------------------------------------------- row styles

/**
 * Row chrome copied from the host's own General-section rows, so a plugin row
 * is visually indistinguishable from a shipped one: 16px vertical padding, a
 * 0.5px bottom hairline in `--dsw-alias-border-l2`, a 14px/22px title and a
 * 12px/18px description in the tertiary label colour.
 *
 * The control column uses CDS's own radii and fills rather than the host's, so
 * the panel demonstrates the theme it configures.
 */
export const PANEL_CSS = [
  '.dct-row { display: flex; align-items: center; gap: 24px; padding: 16px 0;',
  '  border-bottom: .5px solid var(--dsw-alias-border-l2); justify-content: space-between; }',
  '.dct-row:last-child { border-bottom: none; }',
  '.dct-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;',
  '  padding-right: 48px; }',
  '.dct-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 400; line-height: 22px; }',
  '.dct-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 400; line-height: 18px; }',
  '.dct-control { flex: none; display: inline-flex; align-items: center; gap: 8px; min-width: 0; }',

  // Swatches: a row of accent cubes. Selected state is an accent ring plus a
  // check, never a border (CDS single-stroke discipline).
  //
  // The fill comes from the two custom properties the row sets on each button,
  // so the preview shows the accent the ACTIVE palette will actually use. The
  // check colour is derived the same way: white only reads on the darker
  // presets, so it is white in light mode (dark accents) and near-black in dark
  // mode (light accents).
  '.dct-swatches { display: inline-flex; align-items: center; gap: 8px; }',
  '.dct-swatch { position: relative; width: 28px; height: 28px; padding: 0; cursor: pointer;',
  '  border: none; border-radius: 8px; background: var(--dct-swatch-light);',
  '  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3);',
  '  transition: transform .12s cubic-bezier(.16, 1, .3, 1), box-shadow .12s cubic-bezier(.16, 1, .3, 1); }',
  'body[data-ds-dark-theme] .dct-swatch { background: var(--dct-swatch-dark); }',
  '.dct-swatch:hover { transform: translateY(-1.5px); box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l4); }',
  '.dct-swatch:active { transform: translateY(0); }',
  '.dct-swatch[data-selected="true"] { box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l4),',
  '  0 0 0 1.5px var(--dsw-focus-ring-color), 0 0 6px 1px rgba(217, 119, 87, 0.25); }',
  '.dct-swatch-check { position: absolute; inset: 0; display: grid; place-items: center;',
  '  color: #ffffff; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .35)); pointer-events: none; }',
  'body[data-ds-dark-theme] .dct-swatch-check { color: #151515; filter: none; }',
  '.dct-swatch:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),',
  '  0 0 0 1.5px var(--dsw-focus-ring-color), 0 0 6px 1px rgba(217, 119, 87, 0.25); }',

  // The slider: a 6px track with an accent fill and a 14px accent thumb.
  //
  // Both the track fill AND the thumb use the interactive accent token, which
  // is what the host's own sliders and the sibling font plugin use. An earlier
  // version painted the thumb with `--dsw-alias-label-primary` — a black dot on
  // an orange track, sitting two rows under a font slider whose thumb is
  // orange. Same list, two idioms.
  '.dct-slider { -webkit-appearance: none; appearance: none; width: 160px; height: 20px;',
  '  background: transparent; cursor: pointer; }',
  '.dct-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 3px;',
  '  background: linear-gradient(to right, var(--dsw-alias-state-business-primary) 0 var(--dct-fill, 0%),',
  '    var(--dsw-alias-border-l1) var(--dct-fill, 0%) 100%); }',
  '.dct-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px;',
  '  margin-top: -4px; border: 0; border-radius: 50%; background: var(--dsw-alias-state-business-primary);',
  '  box-shadow: 0 1px 2px rgba(0, 0, 0, .18); }',
  '.dct-slider::-moz-range-track { height: 6px; border-radius: 3px; background: var(--dsw-alias-border-l1); }',
  '.dct-slider::-moz-range-progress { height: 6px; border-radius: 3px;',
  '  background: var(--dsw-alias-state-business-primary); }',
  '.dct-slider::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%;',
  '  background: var(--dsw-alias-state-business-primary); box-shadow: 0 1px 2px rgba(0, 0, 0, .18); }',
  '.dct-slider-value { flex: none; min-width: 52px; text-align: right; color: var(--dsw-alias-label-secondary);',
  '  font-size: 12px; font-variant-numeric: tabular-nums; }',

  // Toggle: geometry and colour copied from the host's own `Switch`
  // (`_switch_1ik0f_5`: 36×20, 999px, 2px inset, thumb translate 16px, on-state
  // `--dsw-alias-brand-primary`). An earlier version was 40×22 with an 18px
  // travel and the interactive accent, so it sat a size larger AND a shade
  // brighter than the shipped switch two rows above it in the same list.
  '.dct-toggle { position: relative; flex: none; width: 36px; height: 20px; padding: 2px;',
  '  box-sizing: border-box; cursor: pointer;',
  '  border: none; border-radius: 999px; background: var(--dsw-alias-border-l3);',
  '  transition: background-color .12s cubic-bezier(.16, 1, .3, 1); }',
  '.dct-toggle[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }',
  '.dct-toggle:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);',
  '  outline-offset: 2px; }',
  '.dct-toggle-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;',
  '  background: #ffffff; box-shadow: 0 0 0 .5px rgba(0, 0, 0, .16), 0 1px 2px rgba(0, 0, 0, .2);',
  '  transition: transform .12s cubic-bezier(.16, 1, .3, 1); }',
  '.dct-toggle[aria-checked="true"] .dct-toggle-thumb { transform: translateX(16px); }',

  // Theme-mode cubes: the host's own three-cube row, re-expressed with CDS
  // geometry. The host's cube is `.5px` border + `--dsw-radius-xl` + 2px ground;
  // here the cubes are shorter and wider so three fit beside a 160px slider
  // column. Selection is a clay ring + tinted fill (the accent track), never a
  // second border — the single-stroke rule — and `aria-pressed` is the truth,
  // `data-selected` only drives paint.
  '.dct-mode-cubes { display: inline-flex; align-items: stretch; gap: 8px; flex-wrap: wrap; }',
  '.dct-mode-cube { box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px;',
  '  padding: 8px 12px; cursor: pointer; font: inherit;',
  '  color: var(--dsw-alias-label-primary); background: transparent;',
  '  border: 0; border-radius: var(--dsw-radius-sm);',
  '  box-shadow: inset 0 0 0 .5px var(--dsw-alias-border-l4);',
  '  transition: background-color .12s cubic-bezier(.16, 1, .3, 1), box-shadow .12s cubic-bezier(.16, 1, .3, 1); }',
  '.dct-mode-cube:hover:not([data-selected="true"]) { background: var(--dsw-alias-interactive-bg-hover); }',
  '.dct-mode-cube[data-selected="true"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);',
  '  box-shadow: inset 0 0 0 1px var(--dsw-alias-state-business-primary); }',
  'body[data-ds-dark-theme] .dct-mode-cube[data-selected="true"] {',
  '  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent); }',
  '.dct-mode-cube:focus-visible { outline: none;',
  '  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base), 0 0 0 1.5px var(--dsw-focus-ring-color); }',
  '.dct-mode-cube svg { flex: none; }',
  '.dct-mode-label { font-size: 13px; line-height: 20px; white-space: nowrap; }',

  // The settings page frame for 「主题定制 / Theme」: one intro line above the
  // rows. The host's own sections are a plain column, so this matches them.
  '.dct-section { display: flex; flex-direction: column; width: 100%; }',
  '.dct-section-intro { margin: 0 0 4px; color: var(--dsw-alias-label-tertiary);',
  '  font-size: 13px; line-height: 20px; }',

  // The footer hint under the rows.
  '.dct-hint { padding: 12px 0 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }',
  '@media (max-width: 600px) { .dct-row { flex-wrap: wrap; gap: 12px; }',
  '  .dct-control { width: 100%; justify-content: flex-start; } }',
].join('\n')

export function installPanelCss() {
  if (typeof document === 'undefined' || !document.head) return
  if (document.getElementById(PANEL_STYLE_ID) !== null) return
  const tag = document.createElement('style')
  tag.id = PANEL_STYLE_ID
  tag.dataset.plugin = PLUGIN_ID
  tag.textContent = PANEL_CSS
  document.head.appendChild(tag)
}

export function removePanelCss() {
  if (typeof document === 'undefined' || !document.head) return
  const tag = document.getElementById(PANEL_STYLE_ID)
  if (tag !== null && tag.parentNode) tag.parentNode.removeChild(tag)
}

// ------------------------------------------------------------- the rows

const SLIDER_SLOTS = [
  {
    id: 'dsh-cds-theme-warmth',
    // Order is chosen to sit INSIDE the shipped General rows without landing on
    // one: the host owns 11 (font-size), 12, 15, 16, 17, 20 (composer-enter),
    // 30 and up. 19 keeps the theme block contiguous below Appearance.
    order: 19,
    titleKey: 'warmth.title',
    descKey: 'warmth.desc',
    key: 'warmth',
    min: 0,
    max: 100,
    step: 1,
    normalize: function (value) { return Math.min(100, Math.max(0, Math.round(value))) },
    display: function (value) { return value + '%' },
  },
  {
    id: 'dsh-cds-theme-radius',
    order: 22,
    titleKey: 'radius.title',
    descKey: 'radius.desc',
    key: 'radiusScale',
    min: 50,
    max: 150,
    step: 5,
    normalize: function (value) { return Math.min(1.5, Math.max(0.5, value / 100)) },
    read: function (state) { return Math.round(state.radiusScale * 100) },
    display: function (value) { return value + '%' },
  },
  {
    id: 'dsh-cds-theme-elevation',
    order: 24,
    titleKey: 'elevation.title',
    descKey: 'elevation.desc',
    key: 'elevation',
    min: 0,
    max: 200,
    step: 5,
    normalize: function (value) { return Math.min(200, Math.max(0, Math.round(value))) },
    display: function (value) { return value + '%' },
  },
]

export function createPanel({ React, primitives, settings, themeMode }) {
  const IconCheck = primitives ? primitives.IconCheckOutlineRegular : null
  const IconSun = primitives ? primitives.IconLightOutlineMedium : null
  const IconMoon = primitives ? primitives.IconDarkOutlineMedium : null
  const IconSystem = primitives ? primitives.IconFollowsystemOutlineMedium : null

  // A panel built without the host theme service (unit tests, a host without the
  // service) still has to construct; the row then reads `available() === false`
  // and renders nothing, which is the same contract the stylesheet's hide rule
  // uses. That fallback is why a missing service can never produce a page that
  // hides the host row without offering the replacement.
  const mode = themeMode === undefined || themeMode === null
    ? {
        available: function () { return false },
        getPreference: function () { return 'system' },
        setPreference: function () { return false },
        subscribe: function () { return function () {} },
      }
    : themeMode

  function useStoreValue(store, get) {
    return React.useSyncExternalStore(store.subscribe, get)
  }

  // ------------------------------------------------------- theme mode row
  //
  // The 浅色 / 深色 / 跟随系统 cubes live in 「通用」 as a HOST row
  // (`ui-theme` registers `settings.general.item` id `appearance`). That row is
  // hidden by this plugin's stylesheet while this page exists — see
  // `themeModeRules()` in styles.js — and rebuilt here so the preference sits
  // with the rest of the look-and-feel controls.
  //
  // The value shown is the PERSISTED `preference`, read through the host theme
  // service (`theme.getTheme().preference`); the write is `theme.setTheme(id)`,
  // the host's own "only user preference write entry". Both rows therefore read
  // and write the same field, so they cannot fork.
  //
  // The row renders ONLY when the service is available: without it there is no
  // read, no write, and the stylesheet leaves the host row visible (the hide
  // rule is gated on the same condition). That pairing is what keeps the
  // degradation honest — hiding the host row without offering a replacement
  // would strand the user with no way to switch themes.
  function ThemeModeRow(props) {
    const t = makeT(props.t)
    const store = props.themeMode === undefined ? mode : props.themeMode
    const available = useStoreValue(store, store.available)
    const preference = useStoreValue(store, store.getPreference)
    if (!available) return null
    const icons = { light: IconSun, dark: IconMoon, system: IconSystem }
    const cubes = THEME_MODES.map(function (id) {
      const selected = preference === id
      const label = t(THEME_MODE_LABELS[id])
      const Icon = icons[id]
      return React.createElement('button', {
        key: id,
        type: 'button',
        className: 'dct-mode-cube',
        'data-mode': id,
        'data-selected': selected ? 'true' : 'false',
        'aria-pressed': selected,
        title: label,
        'aria-label': label,
        onClick: function () { store.setPreference(id) },
      },
      Icon ? React.createElement(Icon, { size: 16 }) : null,
      React.createElement('span', { className: 'dct-mode-label' }, label))
    })
    return React.createElement('div', { className: 'dct-row dct-mode-row' },
      React.createElement('div', { className: 'dct-row-text' },
        React.createElement('div', { className: 'dct-title' }, t('modeRow.title')),
        React.createElement('div', { className: 'dct-desc' }, t('modeRow.desc'))),
      React.createElement('div', { className: 'dct-control' },
        React.createElement('div', { className: 'dct-mode-cubes', role: 'group', 'aria-label': t('modeRow.title') },
          ...cubes)))
  }

  // ---------------------------------------------------------- accent row
  //
  // Every visible string goes through `t`, the prop the slot outlet injects
  // because the registration carries `locale: 'dsh-cds-theme'` (see
  // lifecycle.js and locales.js). `makeT` wraps it with the embedded English
  // table for when it is absent (unit tests, a host without ctx.locale). The
  // host language decides the whole string: zh shows pure Chinese, en pure
  // English — including aria-labels, which the old code kept zh-only.
  function AccentRow(props) {
    const t = makeT(props.t)
    const state = useStoreValue(settings, settings.getState)
    const swatches = ACCENT_PRESETS.map(function (preset) {
      const selected = state.accent === preset.id
      const label = t('accent.' + preset.id)
      // Both palette values are handed to CSS as custom properties, and the
      // stylesheet picks by mode. Painting `preset.light` unconditionally — an
      // earlier version did — shows the wrong accent when the UI is dark, so the
      // swatch preview disagrees with the colour actually applied.
      //
      // The check mark uses the same technique for its own colour: it is white
      // on a dark accent and near-black on a light one, because a white tick on
      // the sand preset (luminance 0.5) is invisible.
      return React.createElement('button', {
        key: preset.id,
        type: 'button',
        className: 'dct-swatch',
        'data-selected': selected ? 'true' : 'false',
        style: {
          '--dct-swatch-light': preset.light,
          '--dct-swatch-dark': preset.dark,
        },
        title: label,
        'aria-label': label,
        'aria-pressed': selected,
        onClick: function () { settings.setState({ accent: preset.id }) },
      }, selected && IconCheck
        ? React.createElement('span', { className: 'dct-swatch-check' },
          React.createElement(IconCheck, { size: 14 }))
        : null)
    })
    return React.createElement('div', { className: 'dct-row' },
      React.createElement('div', { className: 'dct-row-text' },
        React.createElement('div', { className: 'dct-title' }, t('accent.title')),
        React.createElement('div', { className: 'dct-desc' }, t('accent.desc'))),
      React.createElement('div', { className: 'dct-control' },
        React.createElement('div', { className: 'dct-swatches', role: 'group', 'aria-label': t('accent.title') }, ...swatches)))
  }

  // ---------------------------------------------------------- slider row
  function SliderRow(props) {
    const slot = props.slot
    const t = makeT(props.t)
    const state = useStoreValue(settings, settings.getState)
    const value = slot.read ? slot.read(state) : slot.normalize(state[slot.key])
    const span = slot.max - slot.min
    const fill = span > 0 ? Math.round(((value - slot.min) / span) * 100) : 0

    return React.createElement('div', { className: 'dct-row' },
      React.createElement('div', { className: 'dct-row-text' },
        React.createElement('div', { className: 'dct-title' }, t(slot.titleKey)),
        React.createElement('div', { className: 'dct-desc' }, t(slot.descKey))),
      React.createElement('div', { className: 'dct-control' },
        React.createElement('input', {
          type: 'range',
          className: 'dct-slider',
          min: slot.min,
          max: slot.max,
          step: slot.step,
          value: value,
          'aria-label': t(slot.titleKey),
          'aria-valuetext': slot.display(value),
          style: { '--dct-fill': fill + '%' },
          onChange: function (event) {
            const raw = parseInt(event.target.value, 10)
            const next = slot.normalize(raw)
            if (next !== state[slot.key]) settings.setState({ [slot.key]: next })
          },
        }),
        React.createElement('span', { className: 'dct-slider-value' }, slot.display(value))))
  }

  // ---------------------------------------------------------- toggle row
  //
  // `state[key] !== false` is the reading every row shares: an absent key and an
  // explicit `true` both show ON, which is right because `sanitize()` fills every
  // key and the older rows all default ON. The two opt-in looks default to a
  // stored `false`, so they render OFF through the same expression — no second
  // convention, and the markdown/tabs suite drives the real component to prove
  // it, including that one click flips and the next one flips back.
  function ToggleRow(props) {
    const slot = props.slot
    const t = makeT(props.t)
    const state = useStoreValue(settings, settings.getState)
    const on = state[slot.key] !== false
    return React.createElement('div', { className: 'dct-row' },
      React.createElement('div', { className: 'dct-row-text' },
        React.createElement('div', { className: 'dct-title' }, t(slot.titleKey)),
        React.createElement('div', { className: 'dct-desc' }, t(slot.descKey))),
      React.createElement('div', { className: 'dct-control' },
        React.createElement('button', {
          type: 'button',
          className: 'dct-toggle',
          role: 'switch',
          'aria-checked': on,
          'aria-label': t(slot.titleKey),
          onClick: function () { settings.setState({ [slot.key]: !on }) },
        }, React.createElement('span', { className: 'dct-toggle-thumb' }))))
  }

  const accentSlot = {
    id: 'dsh-cds-theme-accent',
    order: 18,
    // The bound component forwards the outlet's props — that is where `t`
    // arrives. Dropping them (as an earlier version did) silently reverted
    // every row to the fallback dictionary.
    component: function BoundAccent(props) {
      return React.createElement(AccentRow, { t: props.t })
    },
  }

  const sliderSlots = SLIDER_SLOTS.map(function (slot) {
    return Object.assign({}, slot, {
      component: function BoundSlider(props) {
        return React.createElement(SliderRow, { slot: slot, t: props.t })
      },
    })
  })

  // The per-item replication switches that USED to live here
  // (`dsh-cds-theme-code-block-details` order 27, `dsh-cds-theme-markdown-body`
  // order 28) are gone: the user verified both looks, and by the standing
  // convention (docs/replication-toggles.md) a switch exists only while an item
  // is being compared. Their RULES are permanent now — see the unconditional
  // `codeBlockDetailsRules()` / `markdownBodyRules()` inside `refine` in
  // styles.js — and the table marker follows `enabled && refine` in lifecycle.js.
  // A legacy `localStorage` payload may still carry `codeBlockDetails: false` /
  // `markdownBody: false`; `sanitize()` drops unknown fields, so those simply do
  // not resurrect as a hidden mode.
  const toggleSlots = [
    {
      id: 'dsh-cds-theme-refine',
      order: 26,
      key: 'refine',
      titleKey: 'refine.title',
      descKey: 'refine.desc',
      component: function BoundToggle(props) {
        return React.createElement(ToggleRow, {
          slot: { key: 'refine', titleKey: 'refine.title', descKey: 'refine.desc' },
          t: props.t,
        })
      },
    },
    {
      // One switch for one line of copy: the "Deep diving for Ns…" thinking
      // label. It swaps exactly two tokens (label + shimmer) and nothing else,
      // so it cannot drag the accent track, onboarding rings or focus ring with
      // it. Sits between Refine and the master switch.
      id: 'dsh-cds-theme-thinking-blue',
      order: 29,
      key: 'thinkingLabelBlue',
      titleKey: 'thinkingBlue.title',
      descKey: 'thinkingBlue.desc',
      component: function BoundToggle(props) {
        return React.createElement(ToggleRow, {
          slot: {
            key: 'thinkingLabelBlue',
            titleKey: 'thinkingBlue.title',
            descKey: 'thinkingBlue.desc',
          },
          t: props.t,
        })
      },
    },
    {
      // ONE feature, ONE switch (docs/replication-toggles.md). A long plain-text
      // paste is converted into a .txt attachment through the host's own paste
      // file-intake path, so the chip, upload and send are the shipped ones.
      // Off restores the host's ordinary paste with no interception at all.
      //
      // ORDER 39 is free. ORDER 40 IS NOT: usage-stats registers
      // `dsh-usage-stats-panel-height` at 40 and `dsh-usage-stats-units` at 41
      // into this SAME `settings.appearance.item` slot (its
      // `client/src/constants.js` and `lifecycle.js`). 39 therefore sits between
      // the two of them on the page the user reviews.
      id: 'dsh-cds-theme-paste-as-file',
      order: 39,
      key: 'pasteAsFile',
      titleKey: 'pasteFile.title',
      descKey: 'pasteFile.desc',
      component: function BoundToggle(props) {
        return React.createElement(ToggleRow, {
          slot: {
            key: 'pasteAsFile',
            titleKey: 'pasteFile.title',
            descKey: 'pasteFile.desc',
          },
          t: props.t,
        })
      },
    },
    {
      // 40/41 belong to usage-stats and 42 is retired; never reuse those seats.
      id: 'dsh-cds-theme-prefer-theme-cjk',
      order: 43,
      key: 'preferThemeCjk',
      titleKey: 'preferThemeCjk.title',
      descKey: 'preferThemeCjk.desc',
      component: function BoundToggle(props) {
        return React.createElement(ToggleRow, {
          slot: {
            key: 'preferThemeCjk',
            titleKey: 'preferThemeCjk.title',
            descKey: 'preferThemeCjk.desc',
          },
          t: props.t,
        })
      },
    },
    {
      // The blank-session backdrop is a replica of a shipped look, so by
      // docs/replication-toggles.md it ships WITH its own comparison switch
      // (default on = the replicated look; off = no layer at all).
      //
      // ORDER 44 sits after both usage-stats rows (40/41) and after 43. Nothing
      // retires into this seat: 42 was the hero-compaction switch and stays
      // vacant, and every other order below 40 belongs to a row that exists or
      // that the section test asserts vacant.
      id: 'dsh-cds-theme-hero-ripple',
      order: 44,
      key: 'heroRipple',
      titleKey: 'heroRipple.title',
      descKey: 'heroRipple.desc',
      component: function BoundToggle(props) {
        return React.createElement(ToggleRow, {
          slot: {
            key: 'heroRipple',
            titleKey: 'heroRipple.title',
            descKey: 'heroRipple.desc',
          },
          t: props.t,
        })
      },
    },
    {
      // A REPLICATION ITEM, so by docs/replication-toggles.md it ships WITH its
      // comparison switch — and OFF at the start, because installing this version
      // must not change the interface on its own. Off is the host's own list
      // markers, emphasis and link colour; on is the reference's.
      //
      // ORDER 45 is free: 44 is the backdrop above, 42 is retired. The row is a
      // look-only switch — the rules it gates live in `markdown-scope.js` and are
      // emitted inside `refine` (styles.js), so turning refinement off removes
      // the look without touching this setting. Orders 46 and 47 are vacant: the
      // view-tabs pill and the split composer were removed outright.
      id: 'dsh-cds-theme-markdown-scope',
      order: 45,
      key: 'markdownScope',
      titleKey: 'markdownScope.title',
      descKey: 'markdownScope.desc',
      component: function BoundToggle(props) {
        return React.createElement(ToggleRow, {
          slot: {
            key: 'markdownScope',
            titleKey: 'markdownScope.title',
            descKey: 'markdownScope.desc',
          },
          t: props.t,
        })
      },
    },
    {
      id: 'dsh-cds-theme-enabled',
      order: 30,
      key: 'enabled',
      titleKey: 'enabled.title',
      descKey: 'enabled.desc',
      component: function BoundToggle(props) {
        return React.createElement(ToggleRow, {
          slot: { key: 'enabled', titleKey: 'enabled.title', descKey: 'enabled.desc' },
          t: props.t,
        })
      },
    },
    // ---- no RETIRED replication rows remain -------------------------------
    //
    // THE VACANT ORDERS ARE THE POINT. Every per-item switch has now been retired:
    // 27 and 28 with the two the user verified first; 31, 34, 35 and 38 with the
    // four whose effects could not be seen; and 33, 36 and 37 with the three the
    // user asked to solidify on the last round. Their rules stay (unconditional in
    // `buildCss`), only the comparison switch is gone — the same convention
    // `docs/replication-toggles.md` records.
    //
    // None of these numbers may be reused: a future row taking one would silently
    // reorder the page against the layout the user reviewed. The ONE new row
    // above (long paste → file, 39) is a feature, not a retired replication
    // item; order 42 is vacant again now that the hero-compaction switch is
    // retired (see the note beside `newSessionInputRules` in styles.js).
    //
    // Orders 46 and 47 are now vacant: the view-tabs pill and the split
    // composer were removed outright at the user's request, rows and rules
    // together. They are not retired — there is nothing left to retire — and a
    // future row may NOT take those numbers either, for the same reason the
    // numbers above stay unused.
  ]

  // ------------------------------------------------------- slot placement
  //
  // The rows are split into two groups because they live on two settings
  // PAGES (see section.js for the host contract):
  //
  //   appearanceSlots — the theme-mode cubes, the five appearance knobs
  //                     (accent, warmth, radius, elevation, refine), the
  //                     thinking-label switch and the long-paste switch, on
  //                     「主题定制 / Theme」
  //                     (`settings.appearance.item`);
  //   generalSlots    — the master switch only, still in 「通用 / General」
  //                     (`settings.general.item`), order 30.
  //
  // `slots` stays the union in display order: it is what the fallback registers
  // when the section ledger is unavailable, and it is the stable list the
  // tests and tools/verify.mjs read.
  //
  // ORDER. The cube row takes 10 — the same number the host's own cube row uses
  // in General — so it reads FIRST on the page, the page's intro copy aside. The
  // eight knobs keep their original orders (18-29) underneath, and the ONE new
  // row sits at 39 (40/41 are usage-stats' rows on this same page).
  const modeSlot = {
    id: 'dsh-cds-theme-mode',
    order: 10,
    // Bound component: forwards the outlet's props (`t`) and the store.
    component: function BoundThemeMode(props) {
      return React.createElement(ThemeModeRow, { t: props.t, themeMode: mode })
    },
  }

  const generalSlots = toggleSlots.filter(function (slot) { return slot.key === 'enabled' })
  const appearanceSlots = [modeSlot, accentSlot]
    .concat(sliderSlots, toggleSlots.filter(function (slot) { return slot.key !== 'enabled' }))

  /** Display order is `order`, never array position — the master switch (30)
   *  sorts before the A-tier batch (31–36) even though it is grouped last. */
  function byOrder(a, b) { return a.order - b.order }

  return {
    slots: appearanceSlots.concat(generalSlots).sort(byOrder),
    appearanceSlots: appearanceSlots.slice().sort(byOrder),
    generalSlots,
    modeSlot,
    ThemeModeRow,
    AccentRow,
    SliderRow,
    ToggleRow,
  }
}
