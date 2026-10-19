/**
 * dsh-cds-theme client bundle.
 *
 * A Claude Design System theme for the DeepSeek Harness Web UI. Sources live in
 * `client/src/`; `npm run build` bundles them into `client/client.js` in the
 * host's module-loader format (`window.__ModuleLoader__.load`).
 *
 * WHAT IT DOES, in five parts:
 *
 *   1. TOKENS (`tokens.js` → `theme.js`). The whole `--dsw-*` alias surface is
 *      re-mapped onto CDS: the neutral-grey surface ladder, neutral text tiers,
 *      `hsla(0,0%,8%,α)` hairline borders, the two-track clay brand, semantic
 *      states, and the radius/shadow/motion scales. This travels through
 *      `ctx.theme.overrideTokens`, because the layout presenter writes tokens as
 *      INLINE styles on `<body>` and no stylesheet can outrank that.
 *
 *   2. TYPOGRAPHY (`typography.js`, `fonts.js`). The real Anthropic variable
 *      faces ship in `fonts/` as six @font-face declarations under the
 *      reference's family names; the reference's stack tokens bridge them into
 *      `--dsw-font-family` / `--ds-font-family-code`, and the whole Claude
 *      ladder (7-tier sizes, content-matrix roles, dark-mode weight thinning)
 *      rides the same token channel. `fontCss` also emits the faces, so the
 *      family strings resolve inside the app.
 *
 *   3. STYLESHEET (`styles.js`). What a token cannot express: the
 *      `--dsw-elevation-*` tier (declared on `body, body *`, so an inline body
 *      style cannot reach it), the three-layer clay focus ring, the composer's
 *      three-state shadow, code blocks that follow the palette, and the serif
 *      hero greeting (`hero.js` marks the headline structurally). The chat
 *      markdown body's table frame and quote rhythm live here too, painted on
 *      `data-cds-table` — a hook `markdown.js` writes on the table's scroll
 *      wrapper, whose own class is salted.
 *
 *   4. SETTINGS (`panel.js`, `section.js`, `locales.js`). Nine rows on two
 *      settings pages: the eight appearance controls — the theme-mode cubes,
 *      accent, surface warmth, radius scale, shadow strength, component
 *      refinement, the thinking-label colour and long-paste-as-a-file — on
 *      their own 「外观 / Appearance」 section (a real `settings.section` nav
 *      entry, sibling of 「通用」), and the master switch still in
 *      「通用 / General」. Copy is registered on the host `locale` service and
 *      re-rendered on a language switch (pure Chinese in zh, pure English in
 *      en). If the host exposes no settings shell, every row falls back to the
 *      flat General list and a warning is logged — rows never sit on a slot
 *      nobody renders. There is no hero-compaction row: that switch and its
 *      runtime are retired (see 3. and `newSessionInputRules` in styles.js).
 *
 *   5. COMPOSER BEHAVIOURS (`paste.js`, plus CSS). A long plain-text paste is
 *      written into the session workspace as `.dsh-paste/<timestamp>.txt` by a
 *      Host route, then inserted into the composer as an `@` file REFERENCE —
 *      the same chip the host renders when you drag a real file in, so long
 *      pastes and dragged documents finally look alike. Any failure falls back
 *      to the plain text paste within 2 s, and the paste is never lost. On a
 *      NEW session only, the host's own `[data-input-scroll]` is capped at
 *      eight host line heights or 30vh (whichever is smaller) by pure CSS, and
 *      the page scrolls from its top when the greeting + dock + composer still
 *      overflow. An active conversation is untouched.
 *
 *   6. BLANK-SESSION BACKDROP (`ripple.js`). A canvas mounted as the first child
 *      of `[data-conversation-content]`, painted at `z-index: -1` under a
 *      hero-scoped `isolation: isolate`: faint code glyphs glow behind the
 *      greeting and the composer, and every pointer click sends a ring of light
 *      outward. This is a RECONSTRUCTION — the reference repo has no source for
 *      it (see the module comment in `ripple.js` for the origin and the issue
 *      number) — so it lives behind its own `heroRipple` switch.
 *
 * WHY IT IS SAFE TO UPGRADE. Component rules key on hooks the host renders on
 * purpose — `[data-composer-card]`, `[data-composer-input]`,
 * `[data-code-block-banner]`, `[data-menu-material]`, `[data-chat-flow]`, the
 * literal `.md-code-block` class, and the host's own `--dsl-code-block-*`
 * variables — never on a salted CSS-Modules class. Where no stable hook exists
 * (the sidebar root, the user bubble, the hero headline, the markdown table's
 * scroll wrapper) the theme goes through tokens, leaves the component alone, or
 * marks the element with its own attribute located from a stable anchor
 * (`data-cds-greeting` from the `data-slot` outlets, `data-cds-table` from
 * `[data-chat-flow]`). The new-session layout rides the host's published
 * `[data-content-phase]`, `[data-conversation-scroll]`, `[data-composer-seat]`
 * and `[data-input-scroll]` hooks and its own `--dsh-composer-text-max-height`.
 *
 * The `refine` switch turns the whole component half off without touching the
 * palette or the typography, so a host change that breaks one component is a
 * settings change, not an uninstall.
 *
 * SETTINGS values persist to `localStorage`, not to the profile.
 */

import {
  PLUGIN_ID, DEFAULT_STATE, BUBBLE_RADIUS, STYLE_ID, FONT_STYLE_ID,
  clampWarmth, clampRadiusScale, clampElevation, clampAccent, sanitize,
} from './constants.js'
import { createSettingsStore } from './settings.js'
import { buildTokens, scaleShadow, NON_COLOR_TOKENS } from './tokens.js'
import { buildGlow, assertPairs, createThemeBridge } from './theme.js'
import { buildCss, createStyles, fontSheet } from './styles.js'
import { createPanel, installPanelCss, removePanelCss } from './panel.js'
import { createThemeModeStore, THEME_MODES, THEME_MODE_LABELS, DEFAULT_PREFERENCE } from './thememode.js'
import { createLifecycle } from './lifecycle.js'
import { ACCENT_PRESETS, RADII } from './palette.js'
import { parseColor, formatColor, mixColor, contrast, luminance } from './color.js'
import { buildTypographyTokens, TYPOGRAPHY_TOKEN_NAMES, WEIGHTS, TYPOGRAPHY_ROLES,
  GREETING_DISPLAY, UI_ROLE_TOKENS, ELEMENT_WEIGHTS } from './typography.js'
import { fontCss, fontFaceCss, fontStackCss, fontSourcesFor, FONT_FACES, FONT_BASE_GLOBAL } from './fonts.js'
import { findGreetingHeadline, sweepGreeting, createGreetingMarker, GREETING_ATTR } from './hero.js'
import {
  PASTE_FILE_CHAR_THRESHOLD, PASTE_FILE_LINE_THRESHOLD, PASTE_ATTACH_WAIT_MS,
  PASTE_FILE_TYPE, isLongPaste, shouldConvertPaste, formatPasteStamp,
  sanitizeFileName, buildPastedTextFilename, attachmentCount, createPasteConverter,
} from './paste.js'
import { TABLE_ATTR, findTableWrappers, sweepMarkdownTables, createTableMarker } from './markdown.js'
import {
  RIPPLE_ATTR, GLYPH_TOKENS, TUNING, FALLBACK_PALETTE,
  createRng, gridFor, layoutGlyphs, glyphCount, rippleProgress, rippleRadius,
  easeOutCubic, waveStrength, totalWave, restingAlpha, readPalette,
  findHeroHost, createHeroRipple,
} from './ripple.js'
import { LOCALE_NS, en as EN_STRINGS, zh as ZH_STRINGS, makeT, makeTranslator } from './locales.js'
import {
  SECTION_NAME, APPEARANCE_SECTION_ID, APPEARANCE_SECTION_ORDER, APPEARANCE_SLOT,
  GENERAL_SLOT, SECTION_ATTR, SECTION_WAIT_MS, appearanceSectionOptions,
  createAppearanceSection, registerSettingsRows,
} from './section.js'

// React and the primitives come from the host's frozen platform module table.
// Both are absent in a non-browser context, so every entry point guards.
let React = null
try { React = require('react') } catch (error) { React = null }

let primitives = null
try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { primitives = null }

let storage = null
try { storage = typeof window === 'undefined' ? null : window.localStorage } catch (error) { storage = null }

const settings = createSettingsStore(storage)

// The theme service is resolved lazily inside `apply`: at module-evaluation
// time the plugin context does not exist yet.
let themeService = null
const bridge = createThemeBridge({
  getState: settings.getState,
  getTheme: function () { return themeService },
})

// The 「主题模式 / Theme mode」 row's view of the host theme preference. Same
// service instance the bridge holds: one `theme` object, so the row's read/write
// and the token layer can never disagree about which service is authoritative.
const themeMode = createThemeModeStore()
themeMode.setService(null)

const styles = createStyles({
  getState: settings.getState,
  // The host-row hide rule and the replacement row are one decision: hide the
  // host's cubes only while our own cubes can render.
  isThemeModeAvailable: themeMode.available,
})

const panel = createPanel({ React, primitives, settings, themeMode })

const apply = createLifecycle({
  settings, bridge, styles, panel, React, primitives, themeMode,
  bindTheme: function (service) {
    themeService = service
    themeMode.setService(service)
  },
})

export const name = PLUGIN_ID

/**
 * Cordis service dependencies.
 *
 * `theme` is a HARD dependency, not an optional lookup. The plugin's colour
 * layer is entirely `ctx.theme.overrideTokens`, and without the service it is
 * only a stylesheet — which cannot recolour an app whose palette the layout
 * presenter writes inline on `<body>`. Declaring the dependency makes Cordis
 * order this plugin's activation after the theme service registers.
 *
 * The earlier version listed only `slots` and read the service with
 * `ctx.get('theme')` in the plugin body. That read raced the registration and
 * returned undefined; the bridge then cached its "unavailable" verdict and
 * never retried, so the theme went live with its settings rows and stylesheet
 * but not one token. That is exactly the failure a hard dependency prevents.
 *
 * `slots` is required for the settings rows, and `locale` supplies the
 * bilingual settings copy: the slot registration carries `locale: 'dsh-cds-theme'`
 * and the outlet injects `t(key, params)` into every row (usage-stats' pattern).
 */
export const inject = ['theme', 'slots', 'locale']

export { apply }

/**
 * Bind the theme service once the context exists, then hand off to the
 * lifecycle. `apply` itself is the plugin body and runs at mount.
 */
export const __internals = {
  PLUGIN_ID,
  DEFAULT_STATE,
  BUBBLE_RADIUS,
  RADII,
  ACCENT_PRESETS,
  NON_COLOR_TOKENS,
  buildTokens,
  buildGlow,
  buildCss,
  fontSheet,
  STYLE_ID,
  FONT_STYLE_ID,
  scaleShadow,
  assertPairs,
  sanitize,
  clampWarmth,
  clampRadiusScale,
  clampElevation,
  clampAccent,
  parseColor,
  formatColor,
  mixColor,
  contrast,
  luminance,
  settings,
  bridge,
  styles,
  panel,
  installPanelCss,
  removePanelCss,
  buildTypographyTokens,
  TYPOGRAPHY_TOKEN_NAMES,
  TYPOGRAPHY_ROLES,
  WEIGHTS,
  GREETING_DISPLAY,
  UI_ROLE_TOKENS,
  ELEMENT_WEIGHTS,
  fontCss,
  fontFaceCss,
  fontStackCss,
  fontSourcesFor,
  FONT_FACES,
  FONT_BASE_GLOBAL,
  findGreetingHeadline,
  sweepGreeting,
  createGreetingMarker,
  GREETING_ATTR,
  PASTE_FILE_CHAR_THRESHOLD,
  PASTE_FILE_LINE_THRESHOLD,
  PASTE_ATTACH_WAIT_MS,
  PASTE_FILE_TYPE,
  isLongPaste,
  shouldConvertPaste,
  formatPasteStamp,
  sanitizeFileName,
  buildPastedTextFilename,
  attachmentCount,
  createPasteConverter,
  TABLE_ATTR,
  findTableWrappers,
  sweepMarkdownTables,
  createTableMarker,
  RIPPLE_ATTR,
  GLYPH_TOKENS,
  TUNING,
  FALLBACK_PALETTE,
  createRng,
  gridFor,
  layoutGlyphs,
  glyphCount,
  rippleProgress,
  rippleRadius,
  easeOutCubic,
  waveStrength,
  totalWave,
  restingAlpha,
  readPalette,
  findHeroHost,
  createHeroRipple,
  LOCALE_NS,
  EN_STRINGS,
  ZH_STRINGS,
  makeT,
  makeTranslator,
  SECTION_NAME,
  APPEARANCE_SECTION_ID,
  APPEARANCE_SECTION_ORDER,
  APPEARANCE_SLOT,
  GENERAL_SLOT,
  SECTION_ATTR,
  SECTION_WAIT_MS,
  appearanceSectionOptions,
  createAppearanceSection,
  registerSettingsRows,
  get theme() { return themeService },
}
