import {
  PLUGIN_ID, PANEL_STYLE_ID, clampLineHeight, clampTracking, clampUiFontSize, UI_FONT_BASE_PX,
  clampInlineCodeSize, INLINE_CODE_BASE_PX, INLINE_CODE_SIZE_ROW_ID,
} from './constants.js'
import { createLocaleHandle, DEFAULT_LOCALE } from './locales.js'

// --------------------------------------------------------- row styles

export const PANEL_CSS = [
  '.dsf-row { display: flex; align-items: center; gap: 8px; padding: 16px 0;',
  '  border-bottom: .5px solid var(--dsw-alias-border-l2); }',
  '.dsf-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-right: 48px; }',
  '.dsf-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 400; line-height: 22px; }',
  '.dsf-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 400; line-height: 18px; }',
  '.dsf-control { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }',
  '.dsf-trigger { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px;',
  '  border: none; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform);',
  '  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 22px; cursor: pointer; min-width: 0; }',
  '.dsf-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }',
  '.dsf-trigger .dsf-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.dsf-trigger .dsf-chevron { flex: none; margin-left: auto; }',
  // NO placeholder grey. An UNSET family means "the host's own stack", which is
  // a real value the trigger names, not an empty field waiting for input — and a
  // dimmed trigger next to a bright one reads as "this row is disabled". All three
  // (four, with the UI row) now share the trigger's own `label-primary`.
  '.dsf-family { width: 220px; max-width: 100%; }',
  '.dsf-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; width: 100%; }',
  '.dsf-item .dsf-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.dsf-item .dsf-check { flex: none; color: var(--dsw-alias-label-secondary); display: inline-flex; }',
  '.dsf-note { padding: 6px 8px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }',
  // Section label above the built-in (embedded) families, which are not part
  // of the system catalogue and must read differently from a real font row.
  '.dsf-group { padding: 8px 8px 2px; color: var(--dsw-alias-label-tertiary);',
  '  font-size: 11px; line-height: 16px; letter-spacing: .02em; text-transform: uppercase; }',
  // The search field sticks inside the host menu's scroll viewport. top:0
  // keeps it at the viewport's top edge; a negative offset would drag it over
  // the menu's 4px padding and rounded top border while scrolling, making the
  // popup's border appear to move upward and fuse with the row above it.
  //
  // The wrapper itself paints nothing. The host already paints the menu
  // surface, and the Input inside carries its own opaque, rounded field. An
  // extra background/backdrop-filter here made an unrounded square plate
  // around the rounded search field, which read as a stray square frame.
  '.dsf-search { position: sticky; top: 0; z-index: 1; padding: 2px 2px 6px; }',
  '.dsf-search .dsf-search-input { width: 100%; box-sizing: border-box; }',
  '.dsf-font-list { min-width: 220px; max-width: 360px;',
  '  max-height: min(360px, calc(100dvh - 24px - var(--dsh-frame-overlay-top, 12px))); }',
  '.dsf-slider { -webkit-appearance: none; appearance: none; width: 180px; height: 20px; background: transparent; cursor: pointer; }',
  '.dsf-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 3px;',
  '  background: linear-gradient(to right, var(--dsw-alias-state-business-primary, #4c72e0) 0 var(--dsf-fill, 0%),',
  '    var(--dsw-alias-border-l1, #d9d9d9) var(--dsf-fill, 0%) 100%); }',
  '.dsf-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; margin-top: -4px; border: 0; border-radius: 50%; background: var(--dsw-alias-state-business-primary, #4c72e0); }',
  '.dsf-slider::-moz-range-track { height: 6px; border-radius: 3px; background: var(--dsw-alias-border-l1, #d9d9d9); }',
  '.dsf-slider::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--dsw-alias-state-business-primary, #4c72e0); }',
  '.dsf-slider::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--dsw-alias-state-business-primary, #4c72e0); }',
  '.dsf-slider-value { flex: none; min-width: 52px; text-align: right; color: var(--dsw-alias-label-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }',
  // Same read-out + arrows shape and geometry as the host's own size rows:
// a 72×36 rounded plate, the value right-aligned before the arrow column,
// `px` outside the plate. Measured from the host (字号大小) on 2026-10-20.
  '.dsf-stepper { position: relative; display: flex; align-items: center; justify-content: flex-end; width: 72px; height: 36px; padding-right: 27px; box-sizing: border-box; border-radius: 10px; background: var(--dsw-alias-bg-module-platform); }',
  '.dsf-stepper-value { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; font-variant-numeric: tabular-nums; }',
  '.dsf-stepper-unit { color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }',
  '.dsf-stepper-arrows { position: absolute; right: 8px; top: 5px; display: flex; flex-direction: column; gap: 2px; }',
  '.dsf-stepper-arrow { display: flex; align-items: center; justify-content: center; width: 17px; height: 12px; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }',
  '.dsf-stepper-arrow:hover { color: var(--dsw-alias-label-primary); }',
  '@media (max-width: 600px) { .dsf-row { flex-wrap: wrap; } .dsf-row-text { padding-right: 0; } .dsf-control { flex-wrap: wrap; } .dsf-family { width: 100%; } }',
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

/**
 * The three family rows that REPLACE the host's own family inputs. Order
 * matches the host (text, code, terminal). One family picker per role — no
 * weight control: the weight of every step belongs to the theme, so a knob
 * here could only fight it.
 *
 * The rows register into `settings.general.item` at orders 12–18 — the three
 * host family roles, OUR UI role and the two steppers, right behind the host's
 * FontSettingsGroup (appearance 10, font-size 11) — with the inline-code
 * stepper on the half step 13.5 (see `STEPPER_SLOTS`). `merge.js` then reparents
 * them INSIDE the group's collapsible font region, each picker directly after
 * the official family row it replaces, the inline-code stepper after the
 * official code-SIZE row it replaces, the remaining steppers after them, and
 * the sliders at the end of that region. While the region is collapsed the host
 * does not render it, so the rows are seated back in the slot outlet and
 * hidden: they expand/collapse with the group instead of showing as standalone
 * settings entries. The registration order is only the pre-merge / fallback
 * seat.
 * 三行替代宿主自带字体输入框：文本、代码、终端，每行只有一个字族下拉（字重归宿主
 * 主题管，故不设字重控件）。挂载后由 merge.js 搬进宿主字号组的折叠区（折叠时归位
 * 并隐藏）。
 */
const SLOTS = [
  { id: 'dsh-system-fonts-content',   order: 12, role: 'text',     titleKey: 'row.text.title',     descKey: 'row.text.desc',     familyKey: 'uiFamily' },
  { id: 'dsh-system-fonts-code',      order: 13, role: 'code',     titleKey: 'row.code.title',     descKey: 'row.code.desc',     familyKey: 'codeFamily' },
  { id: 'dsh-system-fonts-terminal',  order: 14, role: 'terminal', titleKey: 'row.terminal.title', descKey: 'row.terminal.desc', familyKey: 'terminalFamily' },
  // THE UI ROLE. The host exposes three font roles (`text`, `code`,
  // `terminal`) and no fourth, so this row does NOT go through
  // `setFontFamily(role, …)`: the bridge writes `--dsh-font-family-ui`
  // directly, and cds-theme's `--dsw-font-family-ui` falls back to
  // `--dsw-font-family`, which is what "follows the body by default" means.
  { id: 'dsh-system-fonts-ui', order: 15, role: 'ui', titleKey: 'row.ui.title', descKey: 'row.ui.desc', familyKey: 'uiFontFamily' },
]

// The two continuous rows follow the family rows (15, 16). Every drag tick
/**
 * The embedded CDS faces, offered as first-class choices.
 *
 * They are NOT Windows fonts — they ship inside the cds-theme plugin as
 * `@font-face` families — so the system catalogue can never list them. They
 * are the DEFAULT families in this app build (the theme points the role tokens
 * at them), which is exactly why the picker must show one of them as the
 * current value instead of a bare "Default font", and why choosing another
 * family here has to be able to win over the theme.
 */
const BUILTIN_FAMILIES = [
  { family: 'anthropic-sans', display: 'Anthropic Sans' },
  { family: 'anthropic-serif', display: 'Anthropic Serif' },
  { family: 'anthropic-mono', display: 'Anthropic Mono' },
]
const BUILTIN_DISPLAY = BUILTIN_FAMILIES.reduce(function (table, entry) {
  table[entry.family] = entry.display
  return table
}, {})

/** A family's human name: the built-in display name, else the raw stack name. */
function displayNameOf(family) {
  return BUILTIN_DISPLAY[family] !== undefined ? BUILTIN_DISPLAY[family] : family
}

/**
 * The CSS variables that decide which family actually renders for a role, and
 * the host's own default chain for the same role.
 *
 * WHY THE PICKER READS THEM. A theme plugin can drive the family tokens
 * directly — the CDS theme points them at its embedded Anthropic faces — so
 * the host preference stays EMPTY while the text on screen is very much not
 * the system default. A bare "Default font" then hides the truth from the
 * user, who cannot tell why the box does not name the font they see. The
 * trigger therefore appends the family that is really in effect, read from the
 * computed tokens, and only when it differs from the host's own default.
 */
const EFFECTIVE_FONT_VAR = {
  text: '--dsw-font-family',
  code: '--ds-font-family-code',
  terminal: '--dsw-font-family-terminal',
  // The UI role resolves through cds-theme's `--dsw-font-family-ui`, whose own
  // fallback is `--dsw-font-family`. Reading it means an unset UI family shows
  // the family that is ACTUALLY rendering the chrome (Anthropic Sans by default)
  // instead of the word "Default" — a placeholder that told the user nothing.
  ui: '--dsw-font-family-ui',
}
const HOST_DEFAULT_VAR = {
  text: '--dsh-font-family-text-default',
  code: '--dsh-font-family-code-default',
  terminal: '--dsh-font-family-terminal-default',
  // There is no host baseline for a role the host does not have, so the UI row
  // compares against the TEXT baseline: "same as the body" is exactly the state
  // this row calls its default, and an empty string there means "follows it".
  ui: '--dsh-font-family-text-default',
}

/** The first family of a CSS font list, unquoted. */
function firstFamilyOf(value) {
  if (typeof value !== 'string') return ''
  const first = value.split(',')[0].trim()
  return first.replace(/^["']/, '').replace(/["']$/, '').trim()
}

/**
 * The family a role renders with when the preference is empty, or '' when that
 * is simply the host's own default (nothing worth reporting).
 */
function effectiveDefaultFamily(role) {
  if (typeof document === 'undefined' || !document.body) return ''
  const variable = EFFECTIVE_FONT_VAR[role]
  if (variable === undefined) return ''
  try {
    const style = getComputedStyle(document.body)
    const effective = firstFamilyOf(style.getPropertyValue(variable))
    if (effective === '') return ''
    const baseline = firstFamilyOf(style.getPropertyValue(HOST_DEFAULT_VAR[role]))
    return effective === baseline ? '' : effective
  } catch (error) {
    return ''
  }
}

// commits immediately, so the text behind the panel tracks the slider.
// 两个连续取值行（17、18）：拖动即提交。The UI family row sits at 15, the UI
// size stepper at 16 and the inline-code stepper at 13.5, so everything but the
// sliders follows the terminal picker and the sliders close the group — in the
// region AND in the flat, collapsed fallback list.
const SLIDER_SLOTS = [
  { id: 'dsh-system-fonts-line-height', order: 17, titleKey: 'row.lineHeight.title', descKey: 'row.lineHeight.desc', key: 'lineHeightPct', min: 50, max: 100, step: 1,
    normalize: function (v) { return clampLineHeight(v) },
    display: function (v) { return v + '%' } },
  { id: 'dsh-system-fonts-tracking',    order: 18, titleKey: 'row.tracking.title',   descKey: 'row.tracking.desc',   key: 'trackingEm',  min: -30, max: 30, step: 1,
    normalize: function (v) { return clampTracking(v) },
    display: function (v) { return (v > 0 ? '+' : '') + (v / 100).toFixed(2) + 'em' } },
]

/**
 * The pixel steppers: 界面字号 and 行内代码, the same read-out-and-arrows shape
 * as the host's own 字号大小 / 代码字号 / 终端字号 rows, not sliders. 0 means
 * "not set" in both: the row then shows the size that is actually in effect and
 * nothing is written.
 * 两个像素步进器：界面字号、行内代码。0 = 未设置，显示实际生效值且不写任何东西。
 */
const STEPPER_SLOTS = [
  { id: 'dsh-system-fonts-ui-size', order: 16, titleKey: 'row.uiSize.title', descKey: 'row.uiSize.desc', key: 'uiFontSize',
    min: 10, max: 20, step: 1,
    normalize: function (v) { return clampUiFontSize(v) },
    // 0 is "unset": display the host chrome's base size in px.
    display: function (v) { const n = clampUiFontSize(v); return n > 0 ? n : UI_FONT_BASE_PX },
    increaseKey: 'row.uiSize.increase', decreaseKey: 'row.uiSize.decrease' },
  /**
   * The INLINE-CODE size row: the same pixel stepper as the host size rows,
   * because it REPLACES the host's 代码字号 row (`merge.js` covers that row the
   * same way it covers the official family inputs).
   *
   * ORDER 13.5, NOT AN INTEGER. The registration slot is fully spoken for:
   * 12–14 are the three host font roles, 15 the UI family, 16 the UI size, 17
   * and 18 the two sliders — and 11 belongs to the host's own 字号大小 row. So
   * the only place left between the code-family row (13) and the sliders (17)
   * is a half step. A half step is a real position, not a tie: the renderer
   * sorts slots with `a.order - b.order`, and renumbering the five rows above
   * would invalidate the 12–18 map this repo documents in AGENTS.md §12 and
   * pins in three test files, for nothing the user could see.
   *
   * WHY 13.5 AND NOT 16.5. Both satisfy "before the sliders". 13.5 also puts the
   * row between 代码字体 (13) and 终端字体 (14) in the FLAT fallback list — the
   * shape used when `merge.js` cannot resolve the host group — which is where a
   * code-size control reads naturally. Inside the region it is seated right
   * after the host's hidden 代码字号 row, so the two placements agree: next to
   * the code family either way.
   * 行内代码字号：与宿主字号行同款像素步进器。order 13.5 —— 12–18 已无空整数，
   * 且必须紧跟代码字体行、排在两个滑块之前；半步是真实位置（渲染器按数值排序），
   * 重编号会让 AGENTS.md 第十二节与三个测试文件里钉死的 12–18 全失效。
   */
  { id: INLINE_CODE_SIZE_ROW_ID, order: 13.5, titleKey: 'row.inlineCodeSize.title', descKey: 'row.inlineCodeSize.desc',
    key: 'inlineCodeSize', min: 10, max: 20, step: 1,
    normalize: function (v) { return clampInlineCodeSize(v) },
    // 0 is "unset": display the theme's own inline-chip rung (12 px).
    display: function (v) { const n = clampInlineCodeSize(v); return n > 0 ? n : INLINE_CODE_BASE_PX },
    increaseKey: 'row.inlineCodeSize.increase', decreaseKey: 'row.inlineCodeSize.decrease' },
]

/**
 * Build the rows.
 *
 * `locale` is the handle from `locales.js`; it already follows the host locale
 * service (registered in `lifecycle.js`) and falls back to `zh` in tests and on
 * a host that cannot bind a dictionary. A slot registration carrying
 * `locale: 'dsh-system-fonts'` also injects `t` as a component prop, and that
 * prop is preferred when present — it is the host's own translator and mints a
 * new identity on a language switch, so the rows re-render translated.
 *
 * `merger` is the DOM merger. When it is present every row notes its root
 * element, which is what lets the rows be moved into the host's font group and
 * put back on unmount. Without it (no DOM, a unit test) the rows render
 * exactly the same, minus the reparenting.
 * 每行把根元素登记给 merger（搬进宿主字号组）；没有 DOM 时行为不变。
 */
export function createPanel({ React, primitives, settings, catalogue, bridge, locale, merger }) {
  const Menu = primitives ? primitives.Menu : null
  const MenuItemButton = primitives ? primitives.MenuItemButton : null
  const Input = primitives ? primitives.Input : null
  const IconChevron = primitives ? primitives.IconChevronDownOutlineRegular : null
  const IconCheck = primitives ? primitives.IconCheckOutlineRegular : null
  const IconSearch = primitives ? primitives.IconSearchOutlineRegular : null

  const handle = locale || createLocaleHandle(DEFAULT_LOCALE)

  /** The host `t` prop when the outlet injected one, else the plugin handle. */
  function tFor(props) {
    return props && typeof props.t === 'function' ? props.t : handle.t
  }

  /**
   * One stable ref callback per slot. It must NOT be re-created per render:
   * React detaches and re-attaches a changed ref identity, which would send the
   * row home and re-merge it on every keystroke in the search field. The theme
   * role rides along so the merger knows which official family row this picker
   * replaces; the sliders pass null and go to the end of the region.
   * 每槽一个稳定的 ref 回调；每次渲染新建会让行反复归位/重搬。
   */
  function rowRef(slot) {
    return function (el) {
      if (merger) merger.note(slot.id, el, slot.order, slot.role || null)
    }
  }

  function getCatalogueList() { return catalogue.list }

  function useStoreValue(store, get) {
    return React.useSyncExternalStore(store.subscribe, get)
  }

  function familyEntryFor(name) {
    const needle = String(name).toLowerCase()
    const list = catalogue.list
    for (let i = 0; i < list.families.length; i += 1) {
      if (list.families[i].family.toLowerCase() === needle) return list.families[i]
    }
    return null
  }

  /**
   * Commit a family. The write goes to the host theme service
   * (`theme.setFontFamily`) when a bridge is live, so the plugin's dropdown
   * and the host's own family inputs share one pipeline; the settings-store
   * copy is still written so the panel and the stylesheet stay coherent on a
   * host without the service. Returns the patch for tests.
   *
   * This is the only write this row performs: weight, size and colour are the
   * theme's, not the plugin's. 族名写入优先走宿主管线；字重/字号/配色都归宿主。
   */
  function commitFamily(slot, name) {
    const patch = { [slot.familyKey]: name }
    settings.setState(patch)
    if (bridge && bridge.live) bridge.setFamily(slot.role, name)
    return patch
  }

  function FamilyMenu({ slot, family, t }) {
    const pair = React.useState(false)
    const open = pair[0]
    const setOpen = pair[1]
    const queryPair = React.useState('')
    const query = queryPair[0]
    const setQuery = queryPair[1]
    const fonts = useStoreValue(catalogue, getCatalogueList)

    function openMenu() { setQuery(''); setOpen(true) }
    function choose(name) { commitFamily(slot, name); setQuery(''); setOpen(false) }
    function commitQuery() {
      const name = query.trim()
      if (name === '') return
      const exact = familyEntryFor(name)
      choose(exact !== null ? exact.family : name)
    }

    // An empty preference means "whatever the role tokens resolve to". The
    // CDS theme resolves them to the embedded Anthropic faces, so the trigger
    // NAMES that family — the box then agrees with the text on screen, and the
    // built-in entries in the menu show which one is active.
    const effective = family === '' ? effectiveDefaultFamily(slot.role) : ''
    const valueText = family !== ''
      ? displayNameOf(family)
      : (effective === ''
          ? t('menu.default')
          : (BUILTIN_DISPLAY[effective] !== undefined
              ? BUILTIN_DISPLAY[effective]
              : t('menu.default.effective', { family: effective })))

    const label = t(slot.titleKey)
    const trigger = React.createElement('button', {
      type: 'button',
      className: 'dsf-trigger dsf-family',
      'aria-label': label,
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      onClick: function () { if (open) setOpen(false); else openMenu() },
      onKeyDown: function (event) {
        if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault()
          openMenu()
        }
      },
    },
      // NO conditional class. An unset family is "the host's own stack" — a real
      // value, not an empty field — and dimming it made the un-configured rows
      // look disabled next to the configured one.
      React.createElement('span', { className: 'dsf-value' },
        valueText),
      IconChevron ? React.createElement(IconChevron, { size: 12, className: 'dsf-chevron' }) : null)

    const q = query.trim().toLowerCase()
    const filtered = fonts.families.filter(function (entry) {
      return !entry.symbol && (q === '' || entry.family.toLowerCase().includes(q))
    })
    const exactHit = q === '' ? null : familyEntryFor(query.trim())
    const children = []

    children.push(React.createElement('div', { className: 'dsf-search', key: 'search' },
      React.createElement(Input, {
        'aria-label': t('search.placeholder'),
        className: 'dsf-search-input',
        icon: IconSearch ? React.createElement(IconSearch, { size: 14 }) : undefined,
        value: query,
        onChange: function (event) { setQuery(event.target.value) },
        onKeyDown: function (event) {
          if (event.key === 'Home' || event.key === 'End') event.stopPropagation()
          if (event.key === 'Enter' && !(event.isComposing || (event.nativeEvent && event.nativeEvent.isComposing))) {
            event.preventDefault()
            commitQuery()
          }
        },
      })))

    if (fonts.status === 'loading') {
      children.push(React.createElement('div', { className: 'dsf-note', key: 'note' }, t('note.loading')))
    } else if (fonts.status === 'error') {
      children.push(React.createElement('div', { className: 'dsf-note', key: 'note' }, t('note.error')))
    } else if (fonts.status === 'ready' && filtered.length === 0 && q !== '') {
      children.push(React.createElement('div', { className: 'dsf-note', key: 'note' }, t('note.empty')))
    }

    // The embedded CDS faces come first: they are the app's DEFAULT families,
    // so they read as a small group above the system catalogue. Selecting one
    // writes it as the host preference, which the theme honours.
    const builtinMatches = BUILTIN_FAMILIES.filter(function (entry) {
      return q === '' || entry.display.toLowerCase().includes(q) || entry.family.indexOf(q) !== -1
    })
    if (builtinMatches.length > 0) {
      children.push(React.createElement('div', { className: 'dsf-group', key: 'builtin-label' }, t('menu.builtin')))
      for (const entry of builtinMatches) {
        const active = family !== ''
          ? entry.family.toLowerCase() === family.toLowerCase()
          : entry.family === effective
        children.push(React.createElement(MenuItemButton, {
          key: 'builtin-' + entry.family,
          onSelect: function () { choose(entry.family) },
        }, React.createElement('span', { className: 'dsf-item' },
          React.createElement('span', { className: 'dsf-name' }, entry.display),
          active && IconCheck
            ? React.createElement('span', { className: 'dsf-check' }, React.createElement(IconCheck, { size: 14 }))
            : null)))
      }
    }

    if (q !== '' && exactHit === null) {
      children.push(React.createElement(MenuItemButton, {
        key: 'manual',
        onSelect: function () { commitQuery() },
      }, t('menu.use', { name: query.trim() })))
    }

    for (const entry of filtered) {
      children.push(React.createElement(MenuItemButton, {
        key: entry.family,
        onSelect: function () { choose(entry.family) },
      }, React.createElement('span', { className: 'dsf-item' },
        React.createElement('span', { className: 'dsf-name' }, entry.family),
        entry.family.toLowerCase() === family.toLowerCase() && family !== '' && IconCheck
          ? React.createElement('span', { className: 'dsf-check' }, React.createElement(IconCheck, { size: 14 }))
          : null)))
    }

    return React.createElement(Menu, {
      open: open,
      anchor: trigger,
      items: [],
      onSelect: function (id) {
        if (id === 'default') {
          commitFamily(slot, '')
          setQuery('')
          setOpen(false)
        } else if (id === 'refresh') {
          catalogue.fetchFonts(true)
        }
      },
      onClose: function () { setOpen(false) },
      align: 'end',
      portal: true,
      autoFocus: false,
      className: undefined,
      listClassName: 'dsf-font-list',
      footer: [
        { id: 'default', label: t('menu.default') },
        { id: 'refresh', label: t('menu.refresh'), disabled: fonts.status === 'loading' },
      ],
    }, ...children)
  }

  function makeRow(slot) {
    const bindRef = rowRef(slot)
    return function FontRow(props) {
      const t = tFor(props)
      const state = useStoreValue(settings, settings.getState)
      React.useEffect(function () {
        if (catalogue.list.status === 'idle') catalogue.fetchFonts(false)
      }, [])
      const family = state[slot.familyKey]
      return React.createElement('div', {
        className: 'dsf-row',
        'data-dsf-row': slot.id,
        ref: bindRef,
      },
        React.createElement('div', { className: 'dsf-row-text' },
          React.createElement('div', { className: 'dsf-title' }, t(slot.titleKey)),
          React.createElement('div', { className: 'dsf-desc' }, t(slot.descKey))),
        React.createElement('div', { className: 'dsf-control' },
          React.createElement(FamilyMenu, { slot: slot, family: family, t: t })))
    }
  }

  /**
   * A slider row: a range input styled as a progress bar plus a value
   * readout. Every `input` event commits immediately, so the text behind the
   * settings panel tracks the drag — no commit button, no stale draft.
   * 滑块行：range 输入 + 读数；每次 input 立即提交，拖动实时生效。
   */
  function SliderRow({ slot, t, bindRef }) {
    const state = useStoreValue(settings, settings.getState)
    const value = slot.normalize(state[slot.key])
    const span = slot.max - slot.min
    const fill = span > 0 ? Math.round(((value - slot.min) / span) * 100) : 0

    return React.createElement('div', { className: 'dsf-row', 'data-dsf-row': slot.id, ref: bindRef },
      React.createElement('div', { className: 'dsf-row-text' },
        React.createElement('div', { className: 'dsf-title' }, t(slot.titleKey)),
        React.createElement('div', { className: 'dsf-desc' }, t(slot.descKey))),
      React.createElement('div', { className: 'dsf-control' },
        React.createElement('input', {
          type: 'range',
          className: 'dsf-slider',
          min: slot.min,
          max: slot.max,
          step: slot.step,
          value: value,
          'aria-label': t(slot.titleKey),
          'aria-valuetext': slot.display(value),
          style: { '--dsf-fill': fill + '%' },
          onChange: function (event) {
            const next = slot.normalize(parseInt(event.target.value, 10))
            if (next !== value) settings.setState({ [slot.key]: next })
          },
        }),
        React.createElement('span', { className: 'dsf-slider-value' }, slot.display(value))))
  }

  /**
   * A size row, in the host's own idiom: value + `px` + stacked arrows. This
   * is the shape of 字号大小 / 代码字号 / 终端字号, so 界面字号 reads as one of
   * them instead of being the only percentage slider in the group.
   * 与宿主字号行一致：数值 + px + 上下箭头，不用滑块。
   */
  function StepperRow({ slot, t, bindRef }) {
    const state = useStoreValue(settings, settings.getState)
    const raw = slot.normalize(state[slot.key])
    const value = slot.display(raw)
    const stepBy = function (delta) {
      const from = raw > 0 ? raw : value
      const next = slot.normalize(from + delta)
      if (next !== raw) settings.setState({ [slot.key]: next })
    }
    const chevron = function (up) {
      return React.createElement('svg', {
        width: 9, height: 9, viewBox: '0 0 16 16', fill: 'none',
        strokeWidth: 1, 'aria-hidden': 'true',
      }, React.createElement('path', {
        d: up
          ? 'M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10'
          : 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6',
        stroke: 'currentColor',
      }))
    }
    const arrow = function (delta, label) {
      return React.createElement('button', {
        type: 'button',
        className: 'dsf-stepper-arrow',
        'aria-label': t(label),
        onClick: function () { stepBy(delta) },
      }, chevron(delta > 0))
    }
    return React.createElement('div', { className: 'dsf-row', 'data-dsf-row': slot.id, ref: bindRef },
      React.createElement('div', { className: 'dsf-row-text' },
        React.createElement('div', { className: 'dsf-title' }, t(slot.titleKey)),
        React.createElement('div', { className: 'dsf-desc' }, t(slot.descKey))),
      React.createElement('div', { className: 'dsf-control' },
        React.createElement('div', { className: 'dsf-stepper' },
          React.createElement('span', { className: 'dsf-stepper-value' }, String(value)),
          React.createElement('span', { className: 'dsf-stepper-arrows' },
            arrow(slot.step, slot.increaseKey),
            arrow(-slot.step, slot.decreaseKey))),
        React.createElement('span', { className: 'dsf-stepper-unit' }, 'px')))
  }

  const fontSlots = SLOTS.map(function (slot) {
    return Object.assign({}, slot, { component: makeRow(slot) })
  })
  const sliderSlots = SLIDER_SLOTS.map(function (slot) {
    const bindRef = rowRef(slot)
    return Object.assign({}, slot, {
      component: function BoundSlider(props) {
        return React.createElement(SliderRow, { slot: slot, t: tFor(props), bindRef: bindRef })
      },
    })
  })
  const stepperSlots = STEPPER_SLOTS.map(function (slot) {
    const bindRef = rowRef(slot)
    return Object.assign({}, slot, {
      component: function BoundStepper(props) {
        return React.createElement(StepperRow, { slot: slot, t: tFor(props), bindRef: bindRef })
      },
    })
  })
  const slots = fontSlots.concat(stepperSlots, sliderSlots)

  return {
    slots,
    locale: handle,
    ContentFontRow: fontSlots[0].component,
    CodeFontRow: fontSlots[1].component,
    TerminalFontRow: fontSlots[2].component,
  }
}
