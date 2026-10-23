/**
 * The package's own name — and therefore the only id this client half may
 * register under.
 *
 * WHY IT MUST EQUAL package.json `name`. The host composes one client-module
 * graph row per package, keyed by the package name (`graphRow(packageName, …)`),
 * and the boot audit only counts a row as arrived once a factory is registered
 * under that exact id. Two silent failures follow from any other string:
 *
 *   - the row never matches its registration — the loader reports "loaded
 *     without registering", retries the row through its one-resource URL, the
 *     bundle executes a second time, and the second `load()` throws
 *     `client-modules: duplicate factory registration … (bundle executed twice
 *     without invalidate?)`;
 *   - invalidation deletes factories and styles by row id, so a bundle
 *     registered under another id is never evicted — it either resurrects as a
 *     duplicate or keeps a stale stylesheet alive.
 *
 * This is the second half of the rename that shipped 0.1.1: the patch row was
 * corrected to the scoped name, but the bundle still registered the old
 * unscoped one, so every web boot failed with the duplicate-registration dialog.
 * `tools/build-client.mjs` now reads the name from package.json instead of
 * hardcoding it, and `test/manifest.test.mjs` pins the shipped artifact.
 */
export const PLUGIN_ID = '@hwfee/dsh-usage-stats'

/** Same-origin route the Host half serves the aggregated summary from. */
export const USAGE_PATH = '/dsh-usage-stats/summary'

/**
 * The marker header the Host's request fence requires
 * (`lib/usage-route.js` MARKER_HEADER / MARKER_VALUE).
 *
 * It is NOT a secret — it ships in this bundle, so a determined same-origin
 * script could replay it. Its job is narrower and it does that job completely:
 * it is a NON-SAFELISTED header, so `<img>`, `<link>`, `<script>`, a form post
 * and a top-level navigation cannot carry it, and a cross-origin `fetch` that
 * tries is stopped by the CORS preflight this server never answers. That is
 * exactly the drive-by class the fence exists to stop; it is not an
 * authentication mechanism and must not be described as one.
 *
 * MUST equal MARKER_HEADER in `lib/usage-route.js` — a cross-file test asserts
 * it, because drift here is a silent 403 for the whole panel.
 */
export const USAGE_MARKER_HEADER = 'x-dsh-usage-stats'
export const USAGE_MARKER_VALUE = '1'

export const STORAGE_KEY = 'dsh-usage-stats/settings'

/**
 * The two settings rows this plugin contributes, and where they sit.
 *
 * The 主题定制 page (cds-theme's section, `settings.appearance.item`) already
 * fills the low ladder — 18 accent, 19 warmth, 22 radius, 24 elevation, 26
 * refine, 29 thinking label, 30 master switch — and is still growing, so a
 * mid-ladder number would collide with the next theme row. 40 and 41 keep the
 * usage rows together at the end of that page whatever the theme adds; in the
 * General fallback they sit after the host's own rows and before the version
 * row (100). Both are normal single entries, not a nested group;
 * `settings-slot.js` owns the placement policy and moves them as one list.
 * 设置里的两行：「用量面板高度」(order 40) 与「数字单位」(order 41)，
 * 优先落在「主题定制」页，缺失时两行一起回退通用列表。
 */
export const SETTINGS_ROW_ID = 'dsh-usage-stats-panel-height'
export const SETTINGS_ROW_ORDER = 40
export const UNITS_ROW_ID = 'dsh-usage-stats-units'
export const UNITS_ROW_ORDER = 41

/**
 * Range selector values; `all` means "everything in the log". The pills' text
 * is localized: look it up as `range.<id>` in `locales.js` rather than adding a
 * `label` field back here.
 */
export const RANGES = [
  { id: 'all', days: 0 },
  { id: '30d', days: 30 },
  { id: '7d', days: 7 },
]

/**
 * Books used for the fun comparison.
 *
 * The comparison picks ONE book per mount — see `bookComparison` — and renders
 * it as a single line, so each entry carries `title` and `chars` only. `title`
 * is the display name verbatim: zh renders it inside 《》, en renders it as-is,
 * which is why every entry has an explicit English title.
 *
 * 字数 are the commonly cited counts for the widely-read editions and are
 * ROUND NUMBERS ON PURPOSE. They are not manuscript figures, and the real
 * tokens-per-character ratio depends on the tokenizer — this is a scale joke,
 * not a measurement, so the printed sentence carries no byline or basis.
 */
export const BOOKS = [
  { title: '红楼梦', titleEn: 'Dream of the Red Chamber', chars: 730000 },
  { title: '三国演义', titleEn: 'Romance of the Three Kingdoms', chars: 630000 },
  { title: '围城', titleEn: 'Fortress Besieged', chars: 230000 },
  { title: '活着', titleEn: 'To Live', chars: 120000 },
  { title: '骆驼祥子', titleEn: 'Rickshaw Boy', chars: 100000 },
]

export const DEFAULT_STATE = {
  range: 'all',
  tab: 'overview',
}
