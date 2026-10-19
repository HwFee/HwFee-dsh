import zhJson from '../../locale/zh.json'
import enJson from '../../locale/en.json'

/**
 * Client dictionaries for the settings rows, one object per host locale.
 *
 * WHY IN `locale/*.json`. The same two files serve two consumers: the Plugin
 * Manager reads their `meta.*` block (plugin-inventory title/description)
 * without activating the plugin, and this module imports their `strings`
 * block at build time (esbuild inlines the JSON into `client/client.js`), so
 * the bundle never fetches anything at runtime. One key set, one place —
 * a string and its interpolation contract cannot drift apart across files.
 *
 * The runtime dictionaries are registered with the browser `ctx.locale`
 * service under `LOCALE_NS` (`ctx.locale.register(ns, { zh, en })`), the same
 * mechanism the host's own client bundles use; `locale: LOCALE_NS` on the
 * slot registration then injects `t(key, params)` as a component prop and
 * re-renders the rows on a language switch. Where the slot cannot inject `t`,
 * `createLocaleHandle` supplies a fallback call with the same semantics.
 *
 * `t(key, params)` returns the entry for the active locale and substitutes
 * `{param}` placeholders from the second argument; a key missing from the
 * active dictionary falls through to `en`, so `en` is the complete set.
 * Every string is MONOLINGUAL per dictionary — a zh UI shows pure Chinese,
 * an en UI pure English, aria-labels included. The glued `中文 · English`
 * strings are gone.
 */

/** Namespace owning this plugin's settings-row copy. */
export const LOCALE_NS = 'dsh-system-fonts'

/** Runtime dictionaries, stripped from the locale files' `strings` block. */
export const zh = zhJson.strings
export const en = enJson.strings

/** Plugin-inventory copy (`meta.title` / `meta.description`) per locale. */
export const META = { zh: zhJson.meta, en: enJson.meta }

const DICTS = { zh, en }

/** Default locale when no host locale is attached (tests, offline). */
export const DEFAULT_LOCALE = 'zh'

/**
 * Build `t(key, params)` for one locale. Missing keys fall back to `en`,
 * then to the key itself, so a half-translated dictionary degrades to
 * readable English instead of `undefined`.
 */
export function createTranslator(lang) {
  const dict = DICTS[lang] || DICTS[DEFAULT_LOCALE]
  return function t(key, params) {
    const raw = dict[key] !== undefined ? dict[key]
      : (en[key] !== undefined ? en[key] : key)
    if (params === undefined || params === null) return raw
    return String(raw).replace(/\{(\w+)\}/g, function (whole, name) {
      return params[name] !== undefined ? String(params[name]) : whole
    })
  }
}

/**
 * The translator handle the panel binds. It starts on `initial` and is
 * swapped to the live host `t` (from `ctx.locale.bind(LOCALE_NS)`) the moment
 * the locale service is resolved inside `apply`, so already-mounted rows
 * follow the host UI language without re-render plumbing of their own.
 */
export function createLocaleHandle(initial) {
  let t = createTranslator(initial && DICTS[initial] ? initial : DEFAULT_LOCALE)
  return {
    /** Bind the live host translator. 绑定宿主翻译函数。 */
    attach(hostT) {
      if (typeof hostT === 'function') t = hostT
    },
    t(key, params) { return t(key, params) },
  }
}
