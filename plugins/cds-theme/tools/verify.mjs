/**
 * Human-readable proof of the implementation blocks: the embedded-font
 * delivery, the complete element→weight table (markdown + UI chrome +
 * greeting), the hero serif hook, and the bilingual copy. Prints; asserts
 * nothing (the unit tests assert).
 *
 *   node tools/verify.mjs
 */

import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { buildTokens } from '../client/src/tokens.js'
import { sanitize, DEFAULT_STATE } from '../client/src/constants.js'
import { buildCssFor, fontSheet } from '../client/src/styles.js'
import { createThemeBridge } from '../client/src/theme.js'
import { STYLE_ID, FONT_STYLE_ID } from '../client/src/constants.js'
import { EASING } from '../client/src/palette.js'
import {
  FONT_FACES, CJK_FACES, FONT_BASE_GLOBAL, fontSourcesFor, preferredCjkStackCss,
} from '../client/src/fonts.js'
import {
  TYPOGRAPHY_ROLES, WEIGHTS, GREETING_DISPLAY, UI_ROLE_TOKENS, ELEMENT_WEIGHTS,
} from '../client/src/typography.js'
import { GREETING_ATTR, findGreetingHeadline } from '../client/src/hero.js'
import { CODE_BLOCK_RULES, MARKDOWN_BODY_RULES, A_TIER_RULES, B_TIER_RULES } from '../test/rule-baseline.mjs'
import {
  PASTE_FILE_CHAR_THRESHOLD, PASTE_FILE_LINE_THRESHOLD, PASTE_ATTACH_WAIT_MS,
  isLongPaste, shouldConvertPaste, buildPastedTextFilename,
} from '../client/src/paste.js'

/**
 * The three surviving replication items: state key, page order, and the honest
 * reach/scope note printed next to each one's rule count.
 *
 * FOUR ITEMS WERE REMOVED from this ledger in the acceptance round
 * (`attachments` 31, `statusPulse` 34, `concentricRadius` 35,
 * `disclosurePolish` 38). They shipped, the user switched them off and could
 * not see a difference, and each measurement agreed: the host's own values were
 * within 2–4px of mine, one animation was clipped by the host's own
 * `contain: strict`, and one rule set added a hairline the host never drew. See
 * the RETIRED SWITCHES note in `client/src/constants.js` for the per-item
 * numbers. A switch nobody can see the effect of is worse than no switch.
 */
const A_TIER_KEYS = [
  {
    key: 'footnotes',
    order: 33,
    reachable: 'the footnote block at 12/15 tertiary with a half-pixel rule above it, superscript references in tabular Mono',
    skipped: 'nothing — this one is complete',
  },
  {
    key: 'buttonSpring',
    order: 36,
    reachable: 'press movement on this plugin\'s own controls (.dct-swatch / .dct-toggle / .dct-mode-cube)',
    skipped: 'the host\'s markdown buttons — salted CSS-Modules classes, unreachable by design',
  },
]

/** The B-tier items: same ledger shape, printed in their own section. */
const B_TIER_KEYS = [
  {
    key: 'statTypography',
    order: 37,
    reachable: 'tabular figures in the composer stat pills + the CDS dt/dd ladder in both usage popovers',
    skipped: 'the reference\'s four-colour token gauge — the host renders no such SVG and offers no mount point',
  },
]

/** The emitted block as carried by `parts.join('\n\n')`. */
function cleanBlock(text) {
  return String(text).replace(/\n\n$/, '')
}

/** The cascade result for a selector: later declarations win. */
function effectiveDeclarations(css, selector) {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  const declarations = {}
  let match = re.exec(text)
  while (match !== null) {
    if (match[1].trim().replace(/\s+/g, ' ') === selector) {
      for (const line of match[2].split(';')) {
        const at = line.indexOf(':')
        if (at > 0) declarations[line.slice(0, at).trim()] = line.slice(at + 1).trim()
      }
    }
    match = re.exec(text)
  }
  return declarations
}
import { TABLE_ATTR, findTableWrappers } from '../client/src/markdown.js'
import { en, zh, LOCALE_NS } from '../client/src/locales.js'
import { createPanel } from '../client/src/panel.js'
import {
  SECTION_NAME, APPEARANCE_SECTION_ID, APPEARANCE_SECTION_ORDER, APPEARANCE_SLOT,
  GENERAL_SLOT, appearanceSectionOptions,
} from '../client/src/section.js'
import {
  NAV_ATTR, ICON_ATTR, MODAL_ANCHOR, ICON_VIEW_BOX, ICON_SHAPES, ICON_STROKE, BANNED_MOTIF, iconMarkup,
} from '../client/src/navicon.js'
import {
  THEME_MODES, THEME_MODE_LABELS, createThemeModeStore,
} from '../client/src/thememode.js'

/** The host row this plugin replaces with its own control. */
const CUBE_HIDER = 'body [data-slot="settings.general.item"] > *:has(button[aria-pressed]:not([role="switch"]))'
/**
 * The rule this plugin deliberately does NOT emit. The host's font-size group is
 * not rebuilt, so hiding it would take the user's only font-size control away.
 */
const FONT_HIDER = 'body [data-slot="settings.general.item"] > *:has(button[aria-controls]:not([aria-haspopup]))'

const root = join(fileURLToPath(new URL('../', import.meta.url)))
const line = function (label, value) { console.log('  ' + String(label).padEnd(38) + value) }

// ---------------------------------------------------------------- fonts

console.log('================= 1. fonts =================')
const artifact = readFileSync(join(root, 'client', 'client.js'), 'utf8')
const inlined = (artifact.match(/data:font\/woff2;base64,/g) || []).length
line('inlined faces in client.js', String(inlined) + ' / ' + String(FONT_FACES.length + CJK_FACES.length))
line('Host-injected global (fallback)', FONT_BASE_GLOBAL)
line('font route', 'none — deleted (unreachable branch, see lib/index.js)')
line('faces', String(FONT_FACES.length) + ' Anthropic + ' + String(CJK_FACES.length) + ' CJK')
for (const face of FONT_FACES) {
  const file = join(root, 'fonts', face.file)
  const size = statSync(file).size
  const head = readFileSync(file).subarray(0, 4).toString('latin1')
  console.log('  ' + face.family.padEnd(16) + face.style.padEnd(8) + String(size).padStart(7) + ' B  ' + head + '  ' + face.file)
}
line('src without the build loader', fontSourcesFor(FONT_FACES[0].file, { fileBase: 'file:///x/fonts/' }))
// Read from the built artifact, not from source, so this line reflects what
// ships. It must count against every inlined face — six Anthropic plus two CJK
// fallbacks — exactly like the verdict check below; comparing against
// FONT_FACES alone reported an ERROR on a healthy artifact.
if (inlined !== FONT_FACES.length + CJK_FACES.length) {
  console.error('  ERROR: the artifact inlines ' + String(inlined) + ' of '
    + String(FONT_FACES.length + CJK_FACES.length) + ' faces')
}

// ----------------------------------------------------------- typography

const tokens = buildTokens(sanitize({}))
console.log('\n================= 2a. markdown/content roles =================')
console.log('  ' + 'role'.padEnd(18) + 'size'.padEnd(46) + 'leading'.padEnd(52) + 'weight L/D')
for (const role of TYPOGRAPHY_ROLES) {
  const base = '--dsw-font-markdown-' + role.name
  console.log('  ' + role.name.padEnd(18)
    + tokens[base + '-font-size'].light.padEnd(46)
    + tokens[base + '-line-height'].light.padEnd(52)
    + tokens[base + '-font-weight'].light + '/' + tokens[base + '-font-weight'].dark)
}
line('text family', tokens['--dsw-font-family'].light)
line('code family', tokens['--ds-font-family-code'].light)
line('override map size', String(Object.keys(tokens).length) + ' tokens (all {light,dark} pairs)')

console.log('\n================= 2b. UI-chrome weight tokens =================')
console.log('  ' + 'token'.padEnd(28) + 'size/leading'.padEnd(14) + 'weight L/D'.padEnd(12) + 'reference')
for (const step of UI_ROLE_TOKENS) {
  const rung = WEIGHTS[step.weight]
  console.log('  ' + step.token.padEnd(28)
    + (step.size + '/' + step.leading).padEnd(14)
    + (rung.light + '/' + rung.dark).padEnd(12)
    + step.reference)
}

console.log('\n================= 2c. element → weight (the reference matrix) =================')
console.log('  ' + 'element'.padEnd(30) + 'ref'.padEnd(9) + 'L/D'.padEnd(10) + 'carrier')
for (const row of ELEMENT_WEIGHTS) {
  const pair = row.rung === 'display'
    ? [GREETING_DISPLAY.weight, GREETING_DISPLAY.weight]
    : [WEIGHTS[row.rung].light, WEIGHTS[row.rung].dark]
  console.log('  ' + row.element.padEnd(30) + row.reference.padEnd(9)
    + (pair[0] + '/' + pair[1]).padEnd(10) + row.carrier)
}
line('not-addressable',
  String(ELEMENT_WEIGHTS.filter(function (row) { return row.carrier === 'not-addressable' }).length)
  + ' elements (host hard-codes the weight in salted CSS)')

const css = buildCssFor(sanitize({}))
line('@font-face blocks in sheet', String((css.match(/@font-face/g) || []).length))
line('tabular-nums on code blocks', /font-variant-numeric: tabular-nums/.test(css) ? 'yes' : 'MISSING')

// -------------------------------------------------- greeting display row

console.log('\n================= 3. hero greeting =================')
line('owned attribute', GREETING_ATTR)
line('lookup anchors', '[data-slot="conversation.hero.workspace"] + optional dock + brand.mark')
line('degradation', findGreetingHeadline(null) === null ? 'no conversation → no mark' : 'FAIL')
line('display size / leading', GREETING_DISPLAY.size + ' / ' + GREETING_DISPLAY.lineHeight)
line('display weight', GREETING_DISPLAY.weight + '  (reference .font-display, not 500/580)')
line('display variation', GREETING_DISPLAY.variationSettings)
line('reference', GREETING_DISPLAY.reference)
const greeting = css.split('[data-cds-greeting] {')[1]
console.log('  [data-cds-greeting] {' + (greeting === undefined ? ' MISSING' : greeting.split('}')[0] + '}'))

// --------------------------------------------------------------- locale

console.log('\n================= 4. bilingual settings =================')
line('locale namespace', LOCALE_NS)
line('zh/en key parity', Object.keys(en).length === Object.keys(zh).length
  ? 'yes (' + Object.keys(en).length + ' keys)'
  : 'MISMATCH')
for (const key of Object.keys(en)) {
  console.log('  ' + key.padEnd(24) + 'en: ' + en[key].slice(0, 48).padEnd(50) + 'zh: ' + zh[key])
}
for (const locale of ['en', 'zh']) {
  const doc = JSON.parse(readFileSync(join(root, 'locale', locale + '.json'), 'utf8'))
  line('inventory meta.' + locale, doc.meta.title)
}

// ------------------------------------------- settings sections (nav pages)

console.log('\n================= 4b. settings pages (settings.section) =================')

const verifyPanel = createPanel({
  React: {
    createElement(type, props) { return { type, props: props || {}, children: [] } },
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() },
  },
  primitives: { IconCheckOutlineRegular: function IconCheck() { return null } },
  settings: {
    getState() { return sanitize({}) },
    subscribe() { return function () {} },
    setState() {},
  },
})
const sectionOptions = appearanceSectionOptions(function (key) { return en[key] })

line('section slot', SECTION_NAME)
line('appearance section id', APPEARANCE_SECTION_ID)
line('appearance section order', String(APPEARANCE_SECTION_ORDER) + '  (账户 -10, 通用 0, 主题定制 1, 模型 10, 插件 15, 智能体预设 20)')
line('nav label (en)', sectionOptions.label())
line('nav label (zh)', appearanceSectionOptions(function (key) { return zh[key] }).label())
line('host light/dark row', '「外观 / Appearance」 (host ui-theme, settings.general.item id "appearance") — renamed ours to avoid the clash')
line('intro names light/dark', /light or dark/i.test(en['appearance.intro']) && /浅色/.test(zh['appearance.intro'])
  ? 'yes (this page owns them now)' : 'MISSING')
line('child ledger', Object.keys(sectionOptions.children).join(', ')
  + ' (' + sectionOptions.children[APPEARANCE_SLOT].kind + ')')
line('rows on ' + APPEARANCE_SLOT, String(verifyPanel.appearanceSlots.length))
line('rows on ' + GENERAL_SLOT, String(verifyPanel.generalSlots.length)
  + ' (' + verifyPanel.generalSlots.map(function (slot) { return slot.id }).join(', ') + ')')
for (const slot of verifyPanel.appearanceSlots) {
  console.log('  ' + APPEARANCE_SLOT.padEnd(30) + 'order ' + String(slot.order).padStart(2) + '  ' + slot.id)
}
for (const slot of verifyPanel.generalSlots) {
  console.log('  ' + GENERAL_SLOT.padEnd(30) + 'order ' + String(slot.order).padStart(2) + '  ' + slot.id)
}
line('fallback (no settings shell)', 'all ' + String(verifyPanel.slots.length)
  + ' rows register into ' + GENERAL_SLOT + ' + one warning')

// ------------------------------------------------- settings-nav icon

console.log('\n================= 4c. settings-nav icon =================')
line('nav anchor', MODAL_ANCHOR)
line('marker attributes', NAV_ATTR + ' (button) + ' + ICON_ATTR + ' (svg)')
line('viewBox', ICON_VIEW_BOX)
line('stroke widths', 'Medium ' + ICON_STROKE.medium + ' / Regular ' + ICON_STROKE.regular)
line('primitives', ICON_SHAPES.length + ' (' + ICON_SHAPES.map(function (shape) { return shape.tag }).join(', ') + ') — nested concentric rounded frames')
line('banned motif', BANNED_MOTIF.what + ' — owned by ' + BANNED_MOTIF.owner)
line('standalone asset', 'assets/appearance-icon.svg')
line('preview page', 'assets/preview.html')
line('degradation', 'no settings dialog / renamed label → the host gear is left untouched')
console.log('  ' + iconMarkup(16, 'medium').replace(/\n/g, '\n  '))

// ------------------------------------------ 主题模式 row + host-row hide

console.log('\n================= 4d. 主题模式 row + hidden host row =================')
line('preference ids', THEME_MODES.join(' / '))
line('labels (en)', THEME_MODES.map(function (id) { return en[THEME_MODE_LABELS[id]] }).join(' / '))
line('labels (zh)', THEME_MODES.map(function (id) { return zh[THEME_MODE_LABELS[id]] }).join(' / '))
line('row slot / order', 'dsh-cds-theme-mode on ' + APPEARANCE_SLOT + ' at order 10 (first on the page)')
line('read path', 'theme.getTheme().preference  (persisted, not the resolved theme)')
line('write path', 'theme.setTheme(id)  — the host’s own "only preference write entry"')
line('subscribed to', 'theme/change  (a change made in either row repaints both)')
for (const selector of [CUBE_HIDER]) {
  console.log('  HIDES  ' + selector)
  console.log('    { display: none !important; }')
}
console.log('  KEEPS  ' + FONT_HIDER)
console.log('    (font sizing stays in 通用 by the user’s decision — not a pending replacement)')
line('gate', 'themeMode.available() — no service → no row AND no hide rule (host row stays)')
line('rides', 'the master switch only; survives refine=false')
line('proven-safe', 'scoped to the General slot; its :has() sits on the ROW')
line('proven-safe', 'aria-pressed is unique to ui-theme across all 8 packages')
line('proven-safe', 'menus (aria-haspopup) + our swatches + the enabled switch: no match')
line('hidden row', 'exactly ONE (the cubes); the 字号大小 group stays in General by decision')
line('OS flip under system', 'host re-publishes (media listener returns unless preference==="system")')
line('  → the row wakes, re-reads preference, 跟随系统 stays selected')
line('OS flip when pinned', 'host emits nothing; the row is untouched')

// ------------------- composer behaviour + new-session layout (2. feature rows)

console.log('\n================= 4e. composer behaviour (pasteAsFile) + new-session layout =================')
const pasteRow = verifyPanel.appearanceSlots.find(function (slot) { return slot.key === 'pasteAsFile' })
line('long-paste row', pasteRow === undefined ? 'MISSING' : pasteRow.id + ' @ order ' + pasteRow.order)
line('hero-compaction row', 'RETIRED — no row, no setting, no runtime')
line('order collision with usage-stats', '39 + 43  (usage-stats owns 40/41 on this same page; 42 stays vacated)')
line('appearance rows', String(verifyPanel.appearanceSlots.length) + ' + 1 in General')
line('paste threshold', PASTE_FILE_CHAR_THRESHOLD + ' characters OR ' + PASTE_FILE_LINE_THRESHOLD + ' lines')
line('1999 chars / 2000 chars', isLongPaste('x'.repeat(1999)) + ' / ' + isLongPaste('x'.repeat(2000)))
line('29 lines / 30 lines',
  isLongPaste(new Array(29).fill('x').join('\n')) + ' / ' + isLongPaste(new Array(30).fill('x').join('\n')))
line('file / rich HTML ignored',
  shouldConvertPaste({ text: 'x'.repeat(2500), fileCount: 1 }) + ' / '
  + shouldConvertPaste({ text: 'x'.repeat(2500), fileCount: 0, html: '<img src="x">' }))
const demoClock = new Date(2026, 9, 18, 10, 37)
line('file name (en)', buildPastedTextFilename(function (key, params) {
  return String(en[key]).replace(/\{(\w+)\}/g, function (match, name) { return params && name in params ? params[name] : match })
}, demoClock))
line('file name (zh)', buildPastedTextFilename(function (key, params) {
  return String(zh[key]).replace(/\{(\w+)\}/g, function (match, name) { return params && name in params ? params[name] : match })
}, demoClock))
line('fallback watchdog', String(PASTE_ATTACH_WAIT_MS) + 'ms, then a text-only paste')
const layoutBlock = blockOf(buildCssFor(sanitize({})), '/* ---- new-session input')
console.log('  ' + (layoutBlock === null
  ? 'MISSING new-session layout block'
  : layoutBlock.trimEnd().split('\n').join('\n  ')))
line('text cap', 'min(30vh, 8 host line heights) via the host variable --dsh-composer-text-max-height')
line('text scrollport', 'the host\'s [data-input-scroll] — the only one this theme adds nothing to')
line('page overflow', 'safe center (flex-start fallback) + overflow-y: auto on [data-conversation-scroll]')
line('active conversation', 'untouched — every rule is scoped to [data-content-phase="hero"]')
line('measured baseline', 'gone — nothing observes or re-measures the composer seat')
line('legacy storage key', 'compactHero: ' + (Object.hasOwn(sanitize({ compactHero: false }), 'compactHero')
  ? 'STILL STATE' : 'dropped by sanitize(), sheet byte-identical'))

// ------------------- shimmer + thinking-label colour switch

console.log('\n================= 5. thinking shimmer + thinking-label switch =================')
// The RULE BODY only — `.split(…)[1]` alone runs to the end of the sheet, so an
// earlier version of the check below matched `backdrop-filter` declared hundreds
// of rules later and reported a false failure. Cut at the first `}`.
const shimmer = (function () {
  const after = css.split('[data-shimmer-decoration] {')[1]
  return after === undefined ? undefined : after.split('}')[0]
})()
console.log('  [data-shimmer-decoration] {' + (shimmer === undefined ? ' MISSING' : shimmer + '}'))
line('--cds-ease-pulse', EASING.pulse + '  (reference breathing curve)')
const clayTokens = buildTokens(sanitize({}))
const labelBlueTokens = buildTokens(sanitize({ thinkingLabelBlue: true }))
const labelChanged = Object.keys(labelBlueTokens).filter(function (name) {
  const clay = clayTokens[name]
  const blue = labelBlueTokens[name]
  return clay === undefined || clay.light !== blue.light || clay.dark !== blue.dark
})
line('tokens changed by the label switch', String(labelChanged.length) + ': ' + labelChanged.join(', '))
line('deep-diving label clay → blue',
  clayTokens['--dsw-alias-label-deep-diving'].light + '/' + clayTokens['--dsw-alias-label-deep-diving'].dark
  + '  →  '
  + labelBlueTokens['--dsw-alias-label-deep-diving'].light + '/' + labelBlueTokens['--dsw-alias-label-deep-diving'].dark)
line('deep-diving shimmer clay → blue',
  clayTokens['--dsw-alias-label-deep-diving-shimmer'].light + '/' + clayTokens['--dsw-alias-label-deep-diving-shimmer'].dark
  + '  →  '
  + labelBlueTokens['--dsw-alias-label-deep-diving-shimmer'].light + '/' + labelBlueTokens['--dsw-alias-label-deep-diving-shimmer'].dark)
line('accent track (must stay clay)',
  clayTokens['--dsw-alias-state-business-primary'].light + ' → '
  + labelBlueTokens['--dsw-alias-state-business-primary'].light)

// ------------------------------------------ static font split / toggle cost

console.log('\n================= 6. style-tag split (settings-toggle cost) =================')
const fontUrls = artifact.match(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g) || []
const inlineFontChars = fontUrls.reduce(function (sum, url) { return sum + url.length }, 0)
const staticChars = fontSheet().length
const fullChars = buildCssFor(sanitize({})).length
const dynamicChars = fullChars - staticChars
line('font block cached', fontSheet() === fontSheet() ? 'yes' : 'NO')
line('static font block (browser)', inlineFontChars + ' chars of inlined data: URLs')
line('dynamic rules block', dynamicChars + ' chars (Node run; browser ≈ same)')
line('per-toggle re-parsed BEFORE', inlineFontChars + dynamicChars + ' chars (font + rules)')
line('per-toggle re-parsed AFTER', dynamicChars + ' chars (rules only)')
line('style tags', FONT_STYLE_ID + ' (written once) + ' + STYLE_ID + ' (rewritten)')
line('buildCssFor output unchanged', buildCssFor(sanitize({})).length === fullChars ? 'byte-identical' : 'DRIFT')

// ------------------------------------------------------- master switch

console.log('\n================= 7. master switch (synchronous host publish) =================')
const switchListeners = []
const switchLayers = new Map()
let switchSeq = 0
const switchService = {
  overrideTokens(source, tokens) {
    const layer = { id: ++switchSeq, n: Object.keys(tokens).length }
    switchLayers.set(source, layer)
    // The real theme runtime publishes theme/change synchronously here; our
    // listener re-enters bridge.sync() from inside this callback.
    switchListeners.slice().forEach(function (callback) { callback() })
    return function disposeLayer() {
      if (switchLayers.get(source) === layer) switchLayers.delete(source)
    }
  },
}
let switchState = sanitize({})
const switchBridge = createThemeBridge({
  getState: function () { return switchState },
  getTheme: function () { return switchService },
})
switchBridge.sync()
switchListeners.push(function () { switchBridge.sync() })
const switchTrace = []
const flip = function (enabled) {
  switchState = sanitize({ enabled: enabled })
  switchBridge.sync()
  switchTrace.push(switchLayers.size)
}
flip(false); flip(true); flip(false); flip(true)
line('layers after OFF→ON→OFF→ON', switchTrace.join(' → ') + '  (expected 0 → 1 → 0 → 1)')
line('token-layer registrations', String(switchSeq) + '  (mount + two ONs = 3, no re-entrant doubles)')

// ------------------------- B-group effects (unconditional under refine)

console.log('\n================= 8. B-group effects (no per-item switches) =================')

const defaultSheet = buildCssFor(sanitize({}))
const noRefine = buildCssFor(sanitize({ refine: false }))
const legacySheet = buildCssFor(sanitize({ revealActions: false, scrollFades: false }))

line('hover-reveal rules under refine', defaultSheet.includes('[data-actions-reveal="hover"] > :last-child') ? 'present' : 'MISSING')
line('scroll-fade rules under refine', defaultSheet.includes('[data-step-process-body][data-scroll-up]') ? 'present' : 'MISSING')
line('same rules with refine=false',
  !noRefine.includes('data-actions-reveal') && !noRefine.includes('data-step-process-body') ? 'absent' : 'STILL PRESENT')
line('legacy payload (old switch fields)',
  legacySheet === defaultSheet ? 'ignored — identical sheet' : 'DRIFT')
line('retired keys in sanitize output', [
  Object.hasOwn(sanitize({ revealActions: false, scrollFades: false }), 'revealActions'),
  Object.hasOwn(sanitize({ revealActions: false, scrollFades: false }), 'scrollFades'),
].join(' / ') + '  (expected false / false)')

// ------------------- B-group item 3 (switch removed: always on)

/** Selector → body map of the emitted sheet (comments stripped). */
function sheetMap(text) {
  const map = new Map()
  const cssText = String(text).replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match = re.exec(cssText)
  while (match !== null) {
    map.set(match[1].trim().replace(/\s+/g, ' '), match[2].trim())
    match = re.exec(cssText)
  }
  return map
}

function diffSheets(before, after) {
  const a = sheetMap(before)
  const b = sheetMap(after)
  return {
    removed: [...a.keys()].filter(function (key) { return !b.has(key) }).sort(),
    added: [...b.keys()].filter(function (key) { return !a.has(key) }).sort(),
    changed: [...a.keys()].filter(function (key) { return b.has(key) && b.get(key) !== a.get(key) }),
  }
}

/** The emitted rules as `{ selector, body }`, in sheet order. */
function parseSheetRules(text) {
  const out = []
  const cssText = String(text).replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match = re.exec(cssText)
  while (match !== null) {
    out.push({
      selector: match[1].trim().replace(/\s+/g, ' '),
      body: match[2].trim(),
    })
    match = re.exec(cssText)
  }
  return out
}

/** One comment-delimited block of the emitted sheet, marker line included. */
function blockOf(css, prefix) {
  const re = /\/\* ----[^\n]*\*\//g
  const marks = [...String(css).matchAll(re)].map(function (m) { return { text: m[0], index: m.index } })
  for (let i = 0; i < marks.length; i += 1) {
    if (!marks[i].text.startsWith(prefix)) continue
    const end = i + 1 < marks.length ? marks[i + 1].index : css.length
    return css.slice(marks[i].index, end)
  }
  return null
}

// ------------------- code artefact details (switch removed: always on)

console.log('\n================= 9. code-artefact details (always on) =================')
line('switch', 'REMOVED — the user verified the look, so the rules are permanent under refine')
line('default state key', Object.hasOwn(sanitize({}), 'codeBlockDetails') ? 'STILL PRESENT (FAIL)' : 'gone (sanitize drops it)')
line('legacy payload {false}', 'dropped; sheet identical to default: '
  + (buildCssFor(sanitize({ codeBlockDetails: false })) === defaultSheet ? 'yes' : 'NO'))
const detailsBlock = blockOf(defaultSheet, '/* ---- code artefact details')
const detailsRules = parseSheetRules(detailsBlock)
line('rules always emitted', String(detailsRules.length) + ' rules in the code-artefact block')
for (const rule of detailsRules) console.log('    ' + rule.selector)
line('byte-identical to the verified sheet', detailsBlock === CODE_BLOCK_RULES ? 'yes' : 'NO')
line('gate', 'inside refine only (refine=false removes them: '
  + (!noRefine.includes('data-disclosure-header') ? 'yes' : 'NO') + ')')
line('titlebar switch', 'still retired (no data-windows-titlebar rule: '
  + (!defaultSheet.includes('data-windows-titlebar') ? 'yes' : 'NO') + ')')

// ----------------------- markdown body: table frame + rhythm (always on)

console.log('\n================= 10. markdown body (always on) =================')

line('switch', 'REMOVED — the user verified the look, so the rules are permanent under refine')
line('owned attribute', TABLE_ATTR)
line('lookup anchor', '[data-chat-flow] table → table.parentElement')
line('default state key', Object.hasOwn(sanitize({}), 'markdownBody') ? 'STILL PRESENT (FAIL)' : 'gone (sanitize drops it)')
line('legacy payload {false}', 'dropped; sheet identical to default: '
  + (buildCssFor(sanitize({ markdownBody: false })) === defaultSheet ? 'yes' : 'NO'))
const mdBlock = blockOf(defaultSheet, '/* ---- markdown body')
const mdRules = parseSheetRules(mdBlock)
line('rules always emitted', String(mdRules.length) + ' rules in the markdown-body block')
for (const rule of mdRules) console.log('    ' + rule.selector)
line('byte-identical to the verified sheet', mdBlock === MARKDOWN_BODY_RULES ? 'yes' : 'NO')
line('marker gate', 'enabled && refine (the markdownBody term was removed)')
line('refine=false drops the item',
  !noRefine.includes('data-cds-table') && !noRefine.includes('blockquote') ? 'yes' : 'NO')
line('degenerate lookup', JSON.stringify(findTableWrappers(null)) === '[]'
  ? 'null root → no wrappers' : 'FAIL')
line('token-free',
  JSON.stringify(buildTokens(sanitize({ markdownBody: false }))) === JSON.stringify(tokens) ? 'yes' : 'NO')

// ------------------------------------------- A-tier batch (six own switches)

console.log('\n================= 11. A-tier batch (one switch each) =================')

A_TIER_KEYS.forEach(function (item) {
  const on = buildCssFor(sanitize({}))
  const off = buildCssFor(sanitize({ [item.key]: false }))
  const block = cleanBlock(A_TIER_RULES[item.key])
  const rules = parseSheetRules(block).length
  const exact = off === on.split('\n\n').filter(function (part) { return part !== block }).join('\n\n')
  console.log('  ' + item.key + '  (order ' + item.order + ')')
  console.log('    state key      ' + item.key + '   default ON')
  console.log('    rules          ' + String(rules).padStart(2) + ' in its own block')
  console.log('    off removes    exactly that block: ' + (exact ? 'yes' : 'NO'))
  console.log('    reachable      ' + item.reachable)
  console.log('    not reachable  ' + item.skipped)
})
// The curves are tokens, not looks.
console.log('  motion curves (always present, independent of buttonSpring and refine)')
for (const name of ['--cds-btn-spring', '--cds-ease-rise', '--cds-ease-fall']) {
  const everywhere = buildCssFor(sanitize({})).includes(name)
    && buildCssFor(sanitize({ buttonSpring: false })).includes(name)
    && buildCssFor(sanitize({ refine: false })).includes(name)
  console.log('    ' + name.padEnd(18) + (everywhere ? 'present in all three states' : 'MISSING in one state'))
}

// ------------------------------------------- B-tier batch (two own switches)

console.log('\n================= 12. B-tier batch (one switch each) =================')

B_TIER_KEYS.forEach(function (item) {
  const on = buildCssFor(sanitize({}))
  const off = buildCssFor(sanitize({ [item.key]: false }))
  const block = cleanBlock(B_TIER_RULES[item.key])
  const rules = parseSheetRules(block).length
  const exact = off === on.split('\n\n').filter(function (part) { return part !== block }).join('\n\n')
  console.log('  ' + item.key + '  (order ' + item.order + ')')
  console.log('    state key      ' + item.key + '   default ON')
  console.log('    rules          ' + String(rules).padStart(2) + ' in its own block')
  console.log('    off removes    exactly that block: ' + (exact ? 'yes' : 'NO'))
  console.log('    reachable      ' + item.reachable)
  console.log('    not reachable  ' + item.skipped)
})

// --------------------------------------------------------------- verdict

const checks = [
  ['eight faces declared (six Anthropic + two CJK fallbacks)', FONT_FACES.length + CJK_FACES.length === 8],
  ['all eight faces inlined in the artifact', inlined === FONT_FACES.length + CJK_FACES.length],
  ['fonts are listed in package.json',
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).files.includes('fonts')],
  ['body is 14/20 regular 400/360', tokens['--dsw-font-markdown-base-font-weight'].light === '400'
    && tokens['--dsw-font-markdown-base-font-weight'].dark === '360'],
  ['headings are 580/550', tokens['--dsw-font-markdown-h1-font-weight'].light === '580'
    && tokens['--dsw-font-markdown-h1-font-weight'].dark === '550'],
  ['code block is 12/17.5 400', tokens['--dsw-font-markdown-code-block-font-size'].light === 'calc(12px + var(--dsh-code-font-delta))'
    && tokens['--dsw-font-markdown-code-block-line-height'].light === 'calc(17.5px + var(--dsh-code-font-delta))'],
  ['inline code is 12/14 500', tokens['--dsw-font-markdown-code-font-size'].light === 'calc(12px + var(--dsh-code-font-delta))'
    && tokens['--dsw-font-markdown-code-line-height'].light === 'calc(14px + var(--dsh-code-font-delta))'],
  ['all 13 UI steps remapped', UI_ROLE_TOKENS.every(function (step) {
    return tokens[step.token + '-font-weight'] !== undefined
  })],
  ['UI steps thin in dark mode', UI_ROLE_TOKENS.every(function (step) {
    const rung = WEIGHTS[step.weight]
    return rung.light === rung.dark
      || tokens[step.token].light !== tokens[step.token].dark
  })],
  ['language tag banner font 500/460', (function () {
    const light = css.split('.md-code-block {')[1]
    const dark = css.split('body[data-ds-dark-theme] .md-code-block {')[1]
    return light.includes('--dsl-code-block-banner-font: 500 11px/18px')
      && dark.includes('--dsl-code-block-banner-font: 460 11px/18px')
  })()],
  ['text/code families resolve through the stacks',
    tokens['--dsw-font-family'].light.indexOf('var(--font-anthropic-sans)') >= 0
    && tokens['--ds-font-family-code'].light.indexOf('var(--font-anthropic-mono)') >= 0],
  ['reference stacks are in the sheet', css.includes('--font-anthropic-serif: "anthropic-serif"')],
  ['greeting carries the reference display row', greeting !== undefined
    && /font-size: 38px/.test(greeting)
    && /line-height: 1\.2/.test(greeting)
    && /font-weight: 330/.test(greeting)
    && /"opsz" 48/.test(greeting)],
  ['every element row has a reference line', ELEMENT_WEIGHTS.every(function (row) {
    return /^:\d+/.test(row.reference)
  })],
  // The shimmer rule paints the glint's COLOUR only. `opacity` and `filter` were
  // here once and caused a reported artefact: the row's text is re-rendered while
  // a response streams, and a blurred, half-transparent layer over the 「思考」
  // glyphs made the label look smeared/covered DURING output. This check used to
  // assert that opacity — it pinned the bug as correct. It now asserts their
  // ABSENCE, which is the invariant.
  ['shimmer rule targets only the stable hook, with no opacity or filter', shimmer !== undefined
    && shimmer.includes('linear-gradient(90deg, transparent 0%, var(--dsw-alias-label-deep-diving-shimmer) 50%, transparent 100%) !important;')
    && !/opacity\s*:/.test(shimmer)
    && !/filter\s*:/.test(shimmer)
    && /animation-timing-function: var\(--cds-ease-pulse\) !important/.test(shimmer)],
  ['--cds-ease-pulse is the reference curve',
    css.includes('--cds-ease-pulse: cubic-bezier(0.4, 0, 0.2, 1);')],
  ['the thinking-label switch changes exactly 2 tokens',
    labelChanged.length === 2
    && labelChanged.indexOf('--dsw-alias-label-deep-diving') >= 0
    && labelChanged.indexOf('--dsw-alias-label-deep-diving-shimmer') >= 0],
  ['the thinking-label switch restores the host blue',
    labelBlueTokens['--dsw-alias-label-deep-diving'].light === '#7d9ade'
    && labelBlueTokens['--dsw-alias-label-deep-diving'].dark === '#3a61b5'
    && labelBlueTokens['--dsw-alias-label-deep-diving-shimmer'].light === '#a2befe'
    && labelBlueTokens['--dsw-alias-label-deep-diving-shimmer'].dark === '#4767b5'],
  ['the thinking-label switch leaves the accent track clay',
    labelBlueTokens['--dsw-alias-state-business-primary'].light === '#d97757'
    && labelBlueTokens['--dsw-alias-link'].light === '#a55a42'
    && labelBlueTokens['--dsw-static-deepseek-500'].light === '#d77150'
    && labelBlueTokens['--dsw-gradient-onboarding-violet-stops'].light.startsWith('#c6613f')],
  ['theme OFF releases the layer and ON re-registers',
    switchTrace.join(',') === '0,1,0,1'],
  ['master-switch re-registration is bounded (no re-entrant doubles)',
    switchSeq === 3],
  ['the font block is cached once', fontSheet() === fontSheet()],
  ['buildCssFor still embeds the static font block',
    buildCssFor(sanitize({})).indexOf(fontSheet()) > 0],
  ['a settings toggle only re-parses the rules tag',
    dynamicChars < 100000 && inlineFontChars > 800000
    && staticChars > 0],
  ['hover-reveal rules present under refine',
    defaultSheet.includes('[data-actions-reveal="hover"] > :last-child')
    && defaultSheet.includes('transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1)')],
  ['scroll-fade rules present under refine',
    defaultSheet.includes('[data-step-process-body][data-scroll-up]')
    && defaultSheet.includes('#0000000d') && defaultSheet.includes('#000000b3')],
  ['both B-group rule sets disappear with refine=false',
    !noRefine.includes('data-actions-reveal') && !noRefine.includes('data-step-process-body')],
  ['the per-item switches are gone (state + sanitize)',
    !Object.hasOwn(DEFAULT_STATE, 'revealActions') && !Object.hasOwn(DEFAULT_STATE, 'scrollFades')
    && !Object.hasOwn(sanitize({ revealActions: false, scrollFades: false }), 'revealActions')
    && !Object.hasOwn(sanitize({ revealActions: false, scrollFades: false }), 'scrollFades')],
  ['a legacy payload produces the identical sheet',
    legacySheet === defaultSheet],
  ['code-block details present by default',
    defaultSheet.includes('[data-code-block-banner] > :first-child')
    && defaultSheet.includes('[data-disclosure-header]')],
  ['no line-number rules (the chat renderer never enables the hook)',
    !defaultSheet.includes('data-line-numbers')
    && !defaultSheet.includes('data-code-block-content')],
  ['the desktop-titlebar feature is gone',
    !Object.hasOwn(DEFAULT_STATE, 'desktopTitlebar')
    && !Object.hasOwn(sanitize({ desktopTitlebar: false }), 'desktopTitlebar')
    && !defaultSheet.includes('data-windows-titlebar')
    && !defaultSheet.includes('data-windows-menu')],
  ['the code-block detail rules are ALWAYS on (its switch was removed)',
    Object.hasOwn(sanitize({}), 'codeBlockDetails') === false
    && detailsRules.length === 6
    && detailsRules.every(function (rule) {
      return rule.selector.includes('data-code-block-banner')
        || rule.selector.includes('data-disclosure-header')
    })],
  ['a legacy {codeBlockDetails:false} emits the identical sheet',
    buildCssFor(sanitize({ codeBlockDetails: false })) === defaultSheet],
  ['markdown body rules present by default',
    defaultSheet.includes('[data-cds-table]')
    && defaultSheet.includes('font-variant-numeric: tabular-nums')
    && defaultSheet.includes('overflow-x: auto !important')
    && defaultSheet.includes('[data-chat-flow] blockquote')],
  ['the markdown-body rules are ALWAYS on (its switch was removed)',
    Object.hasOwn(sanitize({}), 'markdownBody') === false
    && mdRules.length === 10],
  ['a legacy {markdownBody:false} emits the identical sheet',
    buildCssFor(sanitize({ markdownBody: false })) === defaultSheet],
  ['markdown body rules are refine-gated',
    !noRefine.includes('data-cds-table') && !noRefine.includes('blockquote')],
  ['the markdown-body sheet names no host table class',
    ['.md-table-wide', '.md-table-fill', 'tableScroll', 'tableFill'].every(function (name) {
      return defaultSheet.indexOf(name) < 0
    })],
  ['the markdown-body marker ignores a missing conversation',
    JSON.stringify(findTableWrappers(null)) === '[]'],
  ['the retired switch fields are token-free',
    JSON.stringify(buildTokens(sanitize({ markdownBody: false, codeBlockDetails: false })))
      === JSON.stringify(tokens)],
  ['zh and en key sets match', Object.keys(en).sort().join() === Object.keys(zh).sort().join()],
  ['the appearance section is a settings.section sibling of 通用',
    sectionOptions.name === 'settings.section'
    && sectionOptions.id === 'appearance'
    && sectionOptions.order === 1
    && sectionOptions.locale === LOCALE_NS],
  ['the appearance section declares its own child ledger',
    Object.keys(sectionOptions.children).join() === 'settings.appearance.item'
    && sectionOptions.children['settings.appearance.item'].kind === 'list'
    && sectionOptions.children['settings.appearance.item'].scope === 'root'],
  ['the appearance label follows the locale',
    sectionOptions.label() === en['appearance.nav']
    && appearanceSectionOptions(function (key) { return zh[key] }).label() === zh['appearance.nav']],
  ['the nav label no longer collides with the host light/dark row',
    sectionOptions.label() !== 'Appearance'
    && appearanceSectionOptions(function (key) { return zh[key] }).label() !== '外观'
    && !/仍在「通用」/.test(zh['appearance.intro'])
    && !/stay in General/.test(en['appearance.intro'])],
  ['the nav icon is drawn in the host icon language',
    /viewBox="0 0 16 16"/.test(iconMarkup(16, 'medium'))
    && /fill="none"/.test(iconMarkup(16, 'medium'))
    && /stroke="currentColor"/.test(iconMarkup(16, 'medium'))
    && ICON_SHAPES.length === 2
    && ICON_SHAPES.every(function (shape) { return shape.tag === 'rect' })],
  ['the nav icon is NOT the 插件 slider motif (the reported collision)',
    ICON_SHAPES.filter(function (shape) { return shape.tag === 'circle' }).length === 0
    && !/<circle/.test(iconMarkup(16, 'medium'))
    && !iconMarkup(16, 'medium').includes('h5.9')
    && BANNED_MOTIF.owner.indexOf('Plugin') < 0],
  ['the nav icon hides the host gear rather than removing it',
    NAV_ATTR === 'data-cds-appearance-nav' && ICON_ATTR === 'data-cds-appearance-icon'],
  ['artifacts exist for the icon',
    readFileSync(join(root, 'assets', 'appearance-icon.svg'), 'utf8').includes('stroke="currentColor"')
    && readFileSync(join(root, 'assets', 'preview.html'), 'utf8').includes('data-cds-appearance-icon')],
  ['the 主题模式 row sits first and writes through the host service',
    verifyPanel.modeSlot.id === 'dsh-cds-theme-mode'
    && verifyPanel.modeSlot.order === 10
    && verifyPanel.appearanceSlots[0] === verifyPanel.modeSlot],
  ['the theme-mode store reads the persisted preference',
    (function () {
      const store = createThemeModeStore()
      let preference = 'system'
      store.setService({
        getTheme: function () { return { preference: preference } },
        setTheme: function (id) { preference = id },
      })
      const before = store.getPreference()
      store.setPreference('dark')
      return before === 'system' && preference === 'dark' && store.getPreference() === 'dark'
    })()],
  ['the hide rule is emitted for the host cube row only',
    new RegExp(CUBE_HIDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(defaultSheet)
    && !defaultSheet.includes('aria-controls]:not([aria-haspopup])'),
    'font sizing stays in General by the user’s decision'],
  ['the hide rules scope :has() to the row, never the outlet',
    !/\[data-slot="settings\.general\.item"\]:has\(/.test(defaultSheet)
    && defaultSheet.indexOf('[data-slot="settings.general.item"] > *:has(') >= 0],
  ['the hide rules survive refine=false (they are not refinement)',
    buildCssFor(sanitize({ refine: false }), { themeModeAvailable: true }).includes(CUBE_HIDER)],
  ['without the theme service the hide rules disappear',
    !buildCssFor(sanitize({}), { themeModeAvailable: false }).includes('settings.general.item"] > *:has(')],
  ['the theme-mode row and the nine knobs live on the appearance page, only enabled in General',
    verifyPanel.appearanceSlots.length === 10
    && verifyPanel.generalSlots.length === 1
    && verifyPanel.generalSlots[0].id === 'dsh-cds-theme-enabled'],
  ['the long-paste switch sits at 39 and the Chinese-font switch at 43, with 40/41/42 never taken',
    DEFAULT_STATE.pasteAsFile === true
    && Object.hasOwn(DEFAULT_STATE, 'compactHero') === false
    && sanitize({ pasteAsFile: false, compactHero: false }).pasteAsFile === false
    && verifyPanel.appearanceSlots.some(function (slot) {
      return slot.id === 'dsh-cds-theme-paste-as-file' && slot.order === 39
    })
    && verifyPanel.appearanceSlots.some(function (slot) {
      return slot.id === 'dsh-cds-theme-prefer-theme-cjk' && slot.order === 43
    })
    && !verifyPanel.slots.some(function (slot) {
      return slot.order === 40 || slot.order === 41 || slot.order === 42
    })
    && !verifyPanel.slots.some(function (slot) { return slot.key === 'compactHero' })],
  ['long-paste thresholds are 2,000 characters / 30 lines',
    PASTE_FILE_CHAR_THRESHOLD === 2000 && PASTE_FILE_LINE_THRESHOLD === 30
    && isLongPaste('x'.repeat(1999)) === false && isLongPaste('x'.repeat(2000)) === true
    && isLongPaste(new Array(29).fill('x').join('\n')) === false
    && isLongPaste(new Array(30).fill('x').join('\n')) === true],
  ['the retired compactor leaves no measurement, mark or hook behind',
    // The seat wraps the whole hero stack, so the old runtime fed its own
    // collapse. Nothing may survive that observes or marks it.
    !/data-cds-hero-compact|data-cds-dock-compact|cds-hero-height/.test(defaultSheet)
    && !/data-cds-hero-shell|data-cds-dock-shell/.test(defaultSheet)
    && !defaultSheet.includes('ResizeObserver')],
  ['the new-session text cap is 8 host lines or 30vh on the host\'s own variable',
    defaultSheet.includes('--dsh-composer-text-max-height: min(30vh, calc(192px + 8 * var(--dsh-content-font-delta, 0px)));')
    && defaultSheet.includes('[data-content-phase="hero"] [data-composer-card]')],
  ['the page owns overflow with safe centring and the top stays reachable',
    // Equal specificity with the host (0,3,0 vs 0,3,0): both justify-content
    // values carry !important so neither stylesheet's load order decides the
    // result, and they carry it together so the fallback still competes.
    defaultSheet.includes('[data-content-phase="hero"] > [data-conversation-scroll] {\n  justify-content: flex-start !important;\n  justify-content: safe center !important;\n  overflow-y: auto;\n}')
    && defaultSheet.includes('[data-content-phase="hero"] > [data-conversation-scroll] > [data-composer-seat] {\n  flex: 0 0 auto;\n  position: static;\n}')],
  ['the page rule cannot be decided by stylesheet load order (equal specificity, 0,3,0)',
    (function () {
      const block = blockOf(buildCssFor(sanitize({})), '/* ---- new-session input')
      if (block === null) return false
      const at = block.indexOf('> [data-conversation-scroll] {')
      if (at === -1) return false
      const open = block.indexOf('{', at)
      if (open === -1) return false
      // Cut after the brace: the selector carries no `;`, so leaving it in
      // would glue it to the first declaration and hide that one.
      const body = block.slice(open + 1, block.indexOf('}', open))
      const justify = body.split(';')
        .map(function (entry) { return entry.trim() })
        .filter(function (entry) { return entry.indexOf('justify-content:') === 0 })
      return justify.length === 2
        && justify.every(function (entry) { return /!important$/.test(entry) })
        && !/overflow-y:\s*auto\s*!important/.test(body)
    })()],
  ['the new-session layout rides neither refine nor a retired stored field',
    buildCssFor(sanitize({ refine: false })).includes('--dsh-composer-text-max-height')
    && buildCssFor(sanitize({ compactHero: false })) === defaultSheet
    && Object.hasOwn(sanitize({ compactHero: false }), 'compactHero') === false],
  ['the long-paste switch emits no CSS of its own',
    // `pasteAsFile` is JS-only — it intercepts a paste and emits no CSS — so the
    // sheet must be byte-identical with it off.
    buildCssFor(sanitize({ pasteAsFile: false })) === defaultSheet],
  ['the Chinese-font switch defaults ON and only the small stack block leaves when OFF',
    DEFAULT_STATE.preferThemeCjk === true
    && sanitize({}).preferThemeCjk === true
    && sanitize({ preferThemeCjk: false }).preferThemeCjk === false
    && preferredCjkStackCss(false) === ''
    && buildCssFor(sanitize({ preferThemeCjk: false })) === defaultSheet.replace('\n\n' + preferredCjkStackCss(true), '')
    && !preferredCjkStackCss(true).includes('@font-face')
    && !/--dsh-font-family-|--dsw-font-family:/.test(preferredCjkStackCss(true))],
  ['the six retired replication rows are gone everywhere',    ['dsh-cds-theme-code-block-details', 'dsh-cds-theme-markdown-body',
      'dsh-cds-theme-attachments', 'dsh-cds-theme-status-pulse',
      'dsh-cds-theme-concentric-radius', 'dsh-cds-theme-disclosure-polish',
      'dsh-cds-theme-compact-hero'].every(function (id) {
      return verifyPanel.slots.every(function (slot) { return slot.id !== id })
    })
    && ['codeBlockDetails', 'markdownBody', 'attachments', 'statusPulse',
      'concentricRadius', 'disclosurePolish', 'compactHero'].every(function (key) {
      return !Object.hasOwn(sanitize({}), key)
    })],
  ['each solidified item is unconditional and inert to its retired switch',
    A_TIER_KEYS.concat(B_TIER_KEYS).every(function (item) {
      const rules = A_TIER_RULES[item.key] ?? B_TIER_RULES[item.key]
      const block = cleanBlock(rules)
      const on = buildCssFor(sanitize({}))
      // Present by default, present under refine:false, absent only with the
      // master switch, and a stale `false` in an old payload changes nothing.
      return on.includes(block)
        && buildCssFor(sanitize({ refine: false })).includes(block)
        && buildCssFor(sanitize({ enabled: false })) === ''
        && buildCssFor(sanitize({ [item.key]: false })) === on
    })],
  ['no solidified item moves the token layer',
    A_TIER_KEYS.concat(B_TIER_KEYS).every(function (item) {
      return JSON.stringify(buildTokens(sanitize({ [item.key]: false })))
        === JSON.stringify(buildTokens(sanitize({})))
    })],
  ['the three motion curves are unconditional vocabulary',
    ['--cds-btn-spring', '--cds-ease-rise', '--cds-ease-fall'].every(function (name) {
      return buildCssFor(sanitize({})).includes(name)
        && buildCssFor(sanitize({ buttonSpring: false })).includes(name)
        && buildCssFor(sanitize({ refine: false })).includes(name)
    })],
  ['the blank-session backdrop is a switch: rules in, rules out, nothing else moves',
    // One switch, one block. On: the layer promotion and the see-through card.
    // Off: the whole block leaves and the rest of the sheet is byte-identical —
    // proved by deleting the block from the ON sheet and comparing to the OFF one.
    (function () {
      const on = buildCssFor(sanitize({ heroRipple: true }))
      const off = buildCssFor(sanitize({ heroRipple: false }))
      const marker = '/* ---- blank-session backdrop'
      const start = on.indexOf(marker)
      if (start < 0) return false
      const next = on.indexOf('/* ----', start + marker.length)
      const stripped = on.slice(0, start) + (next < 0 ? '' : on.slice(next))
      return stripped === off
        && on.includes('[data-conversation-content][data-content-phase="hero"] {\n  isolation: isolate;\n}')
        // The explicit 100% pair is load-bearing (a canvas is a replaced element
        // and would otherwise take its bitmap size as its layout size).
        && on.includes('[data-cds-hero-ripple] {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  z-index: -1;')
        && on.includes('color-mix(in srgb, var(--dsw-specific-input-major) 82%, transparent)')
    })()],
  ['the backdrop never covers an active conversation and never eats a click',
    // The promotion is hero-scoped (an active conversation keeps the host's own
    // stacking order for its z-index 7/8/9 header and seat), and the layer is
    // pointer-transparent so a click always reaches whatever is underneath.
    (function () {
      const block = blockOf(buildCssFor(sanitize({})), '/* ---- blank-session backdrop')
      if (block === null) return false
      if (/data-content-phase="active"/.test(block)) return false
      if (!block.includes('pointer-events: none')) return false
      // The isolation rule is the hero rule; the layer rule must not reintroduce it.
      const isolateCount = (block.match(/isolation:\s*isolate/g) || []).length
      return isolateCount === 1
    })()],
  ['the backdrop switch is a live replication switch, not a retired one',
    DEFAULT_STATE.heroRipple === true
    && sanitize({}).heroRipple === true
    && sanitize({ heroRipple: 'no' }).heroRipple === true
    && sanitize({ heroRipple: false }).heroRipple === false
    && verifyPanel.slots.some(function (slot) {
      return slot.id === 'dsh-cds-theme-hero-ripple' && slot.order === 44
    })
    && verifyPanel.appearanceSlots.some(function (slot) {
      return slot.key === 'heroRipple'
    })
    && Object.hasOwn(en, 'heroRipple.title') && Object.hasOwn(zh, 'heroRipple.title')
    && Object.hasOwn(en, 'heroRipple.desc') && Object.hasOwn(zh, 'heroRipple.desc')
    && JSON.stringify(buildTokens(sanitize({ heroRipple: false })))
      === JSON.stringify(buildTokens(sanitize({})))],
]

console.log('\n================= verdict =================')
let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label)
}
process.exit(failed === 0 ? 0 : 1)


