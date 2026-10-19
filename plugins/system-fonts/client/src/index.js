/**
 * dsh-system-fonts client bundle.
 *
 * Sources live in `client/src/`; `npm run build` bundles them into
 * `client/client.js` in the host's module-loader format
 * (`window.__ModuleLoader__.load`), exactly the shape `dsh-client-ui-theme`
 * and `dsh-custom-font` ship.
 *
 * WHAT IT CHANGES: font FAMILIES, plus the row spacing and tracking of the
 * content column. Family names go through the host's own theme service
 * (`setFontFamily`), so this plugin's three dropdowns REPLACE the host's three
 * official family inputs (roles text/code/terminal) and share one persisted
 * state with them. Sizes stay on the host's steppers.
 *
 *   row 1  t('row.text.title')      ->  text family
 *   row 2  t('row.code.title')      ->  code family
 *   row 3  t('row.terminal.title')  ->  terminal family
 *   row 4  t('row.lineHeight.title')->  --dsw-font-markdown-*-line-height, 50–100
 *   row 5  t('row.tracking.title')  ->  letter-spacing on `[class*="markdown"]`
 *
 * No colour, no font-size axis, no column-width rule, and NO `font-weight`
 * declaration is ever emitted.
 *
 * WEIGHTS BELONG TO THE THEME. The host's typography is a scale of 30 steps
 * (`--dsw-font-base-16`, `--dsw-font-markdown-h1`, …), each a `font`
 * shorthand carrying its own weight; the active theme decides them. An earlier
 * build shipped a weight knob that shifted every step — that machinery is
 * gone, because a second weight authority can only fight the theme's. This
 * plugin rewrites a step's shorthand only to scale its `/line-height`.
 *
 * WHERE THE ROWS SIT. `settings.general.item` is a flat sibling list: a slot
 * can only inject rows next to the host's FontSettingsGroup, never inside it.
 * The rows therefore register at orders 12–16 and `merge.js` reparents them
 * INTO the group's collapsible font region after mount: each picker directly
 * after the official family row it replaces (正文字体 / 代码字体 / 终端字体),
 * the two sliders at the end, and the official family inputs covered (hidden).
 * While that region is collapsed the host removes it from the DOM, so the rows
 * are seated back in the slot outlet and hidden — they expand and collapse with
 * the group instead of showing as standalone entries. The merge is idempotent,
 * reversible on dispose, and does nothing at all when the host group cannot be
 * found.
 *
 * WHY `!important`. The host writes theme tokens per element and declares its
 * steps with its own specificity; an `!important` author declaration wins,
 * which is what makes a stylesheet the correct vehicle here. It is also the
 * approach the host's own theme stylesheets rely on.
 *
 * LANGUAGE. Every visible string — titles, descriptions, menu entries, search
 * placeholder, aria-labels — comes from `locale/zh.json` and
 * `locale/en.json` through `locales.js`, so a zh UI is pure Chinese and an en
 * UI pure English. The dictionaries are registered on the host locale service
 * (`locale: 'dsh-system-fonts'` on the slot registration injects `t`), the
 * same pattern `plugins/usage-stats` uses. The only Chinese left outside the
 * dictionaries is font DATA: the Windows face suffixes the Host half parses
 * (`中粗体` / `Regular`), which are file names, not UI copy.
 */

import {
  PLUGIN_ID, DEFAULT_STATE, SCALE_STEPS,
  clampLineHeight, clampTracking,
} from './constants.js'
import { createSettingsStore } from './settings.js'
import { createTypography, buildCss, buildStack, rewriteLineHeight, quoteFamily, splitFontTail, readDeclaredToken } from './typography.js'
import { createChrome, buildShadowCss } from './chrome.js'
import { createCatalogue } from './catalogue.js'
import { createPanel } from './panel.js'
import { createLifecycle } from './lifecycle.js'
import { createThemeBridge } from './bridge.js'
import { createHostMerger } from './merge.js'
import { createLocaleHandle, createTranslator, LOCALE_NS, DEFAULT_LOCALE } from './locales.js'

// React comes from the host's frozen platform module table. Absent in a
// non-browser context; every entry point below guards on it.
let React = null
try { React = require('react') } catch (error) { React = null }

let primitives = null
try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { primitives = null }

let storage = null
try { storage = typeof window === 'undefined' ? null : window.localStorage } catch (error) { storage = null }

const settings = createSettingsStore(storage)
const typography = createTypography({ getState: settings.getState })
const chrome = createChrome({ getState: settings.getState })
settings.onChange = function () { typography.apply(); chrome.apply() }
const catalogue = createCatalogue()

// The bridge starts offline (no theme service). The panel binds this one
// object; once `apply` resolves `ctx.get('theme')`, `attach` swaps the live
// service in in-place, so already-mounted rows delegate to it transparently.
// 桥以离线态起步，面板绑定同一个桥对象；`apply` 经 `ctx.get('theme')` 拿到服务后
// `attach` 原地换上活服务，已挂载的行透明委托。
const bridge = createThemeBridge(null, settings)

// Panel copy starts on the embedded `zh` dictionary and is swapped to the live
// host translator inside `apply` (`ctx.locale.bind`), while the slot's
// `locale:` field supplies the authoritative `t` prop. 文案起于内置字典，
// 挂载后换成宿主翻译函数；槽位注册的 `locale:` 字段提供权威的 t prop。
const locale = createLocaleHandle(DEFAULT_LOCALE)

// The DOM merger that seats the rows inside the host's font group. It is a
// plain object with no React and no host access, so it is exercised directly
// in tests against a synthetic DOM.
const merger = createHostMerger()

const panel = createPanel({ React, primitives, settings, catalogue, bridge, locale, merger })

const apply = createLifecycle({
  settings, typography, chrome, catalogue, panel, merger, locale, React, primitives,
  onTheme: function (theme) { bridge.attach(theme) },
})

export const name = PLUGIN_ID
/**
 * `slots` is required — the rows are slot occupants. `locale` is required too:
 * it backs every visible string and is what `locale: LOCALE_NS` resolves
 * against. A host without the locale service cannot render translated rows, so
 * failing closed is the honest behavior. 必需 slots 与 locale：行是槽位占用者，
 * 且全部文案来自 locale 字典。
 */
export const inject = ['slots', 'locale']
export { apply }
export const __internals = {
  DEFAULT_STATE,
  SCALE_STEPS,
  LOCALE_NS,
  buildCss,
  buildStack,
  rewriteLineHeight,
  splitFontTail,
  readDeclaredToken,
  buildShadowCss,
  quoteFamily,
  clampLineHeight,
  clampTracking,
  loadState: settings.loadState,
  getState: settings.getState,
  setState: settings.setState,
  applyCss: typography.apply,
  settings,
  catalogue,
  typography,
  chrome,
  panel,
  merger,
  localeHandle: locale,
  translator: createTranslator,
}
