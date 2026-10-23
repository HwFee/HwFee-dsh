/**
 * The embedded Anthropic variable web fonts and the reference's font stacks.
 *
 * WHY EMBEDDED. Claude Desktop renders with Anthropic Sans / Serif / Mono. The
 * six variable woff2 files (Anthropic{Sans,Serif,Mono}-{Roman,Italic}-Web.woff2)
 * are the real anthropic.com web faces, and this module declares them under the
 * exact family names the reference CSS uses — `"anthropic-sans"`,
 * `"anthropic-serif"`, `"anthropic-mono"` — so the token strings from
 * `.reference/open-claude-ui/code-examples/cds-theme.css:226-234` copy over
 * verbatim and resolve without translation.
 *
 * THOSE SIX FACES' BYTES ARE NOT SHIPPED. This project holds no redistribution
 * grant for them, so they are untracked local working copies on the developer's
 * machine — a fresh clone has none — and the published bundle carries none. Their
 * `@font-face` blocks survive with a `local()` source, so a machine that has the
 * family installed gets the replica and everything else falls through the stack.
 * `font-assets.js` explains the split; `tools/font-licences.mjs` holds the
 * fingerprints every gate checks them against.
 *
 * WEIGHT AXIS (probed with fontTools, not assumed). All six faces declare
 * `wght 300 → 800`; sans and serif also carry `opsz 16 → 48` (the reference
 * drives it through `--font-opsz-axis-*`). `font-weight: 300 800` on every
 * @font-face is what lets the dark-mode thinning (400→360, 580→550) render as
 * real axis moves instead of snapped static weights.
 *
 * HOW THE FILES ARE REACHED. A `<style>` tag resolves relative URLs against the
 * DOCUMENT origin, not against the plugin directory, so a bare
 * `url("fonts/…")` would resolve to the app root and 404. The URLs must be
 * absolute, and there is exactly ONE absolute form left:
 *
 *   - a `file://` base injected into the page by the Host half as the
 *     `__CDS_THEME_FONT_BASE__` global (a `webserver/index-inject` row). It is
 *     computed at runtime from the plugin's own location, so it is correct on
 *     any machine and needs no build stamp.
 *
 * A same-origin HTTP route (`/dsh-cds-theme/fonts/<file>`) USED to be the other
 * form. It is gone, and this module no longer emits it, for two reasons:
 *
 *   1. it could never be the live path (see the note below the inlining note —
 *      the shipped artifact always inlines, and a build without the binaries
 *      fails rather than falling back), and
 *   2. once the route was deleted, emitting its URL would produce a `src` that
 *      is guaranteed to 404.
 *
 * If neither form applies the family does not resolve and the stack falls
 * through to its system fallbacks — the UI keeps working, minus the replica.
 */

/**
 * THE FACES ARE INLINED, and that is not a size regression — it is the only
 * delivery that works in the DESKTOP shell.
 *
 * The desktop document is served from the `dsh-app://app` origin (verified:
 * Chromium's Local Storage holds `_dsh-app://app` records and no http origin).
 * Under that origin every URL strategy fails:
 *   - a route-relative `/dsh-cds-theme/fonts/...` URL resolves to
 *     `dsh-app://app/dsh-cds-theme/fonts/...`, which the app protocol handler
 *     does not serve → 404;
 *   - the `file://` base relies on the `webserver/index-inject` row, which is a
 *     WEB-server hook and never fires for the app-served index;
 *   - an absolute `http://127.0.0.1:<port>` URL would be cross-origin and the
 *     route sent no CORS headers, so the font load is blocked.
 *
 * `tools/build-client.mjs` therefore imports each woff2 as a `data:font/woff2`
 * string (a build-time loader, so the artifact carries no path and needs no
 * fetch at runtime). A data URL is origin-agnostic: it works on `dsh-app://`,
 * on http(s) and on `file://`, with no route, token, CORS or CSP dependency —
 * the app page sets no `font-src` policy.
 *
 * THE NON-INLINED BRANCH IS UNREACHABLE IN EVERY SHIPPED BUILD, which is why the
 * route it used to name is deleted. Three facts, each verified:
 *   - the build sets `loader: { '.woff2': 'dataurl' }` and imports all six
 *     binaries through `font-assets.js`, so every `src` is a data URL;
 *   - a build without the binaries does not fall back — it FAILS, because
 *     esbuild cannot resolve the import;
 *   - the only place the inline table is empty is a Node ESM test run, which
 *     serves no HTTP.
 * The `file://` fallback below survives for that source-run case only.
 */
/**
 * file → inlined `data:` URL, resolved from `font-assets.js`.
 *
 * The require is guarded on purpose: a plain Node ESM run (the unit tests)
 * cannot import `.woff2`, so it throws here and the module falls back to the
 * URL strategies below — while the browser bundle rewrites the same require
 * into the inlined data module at build time. `verify.mjs` and the artifact
 * test assert the inlined faces really are in `client/client.js`, so the two
 * worlds cannot silently diverge.
 */
let INLINE_FACE_DATA = {}
try {
  const assets = require('./font-assets.js')
  const table = assets !== null && typeof assets === 'object' && assets.default !== undefined
    ? assets.default
    : assets
  if (table !== null && typeof table === 'object') INLINE_FACE_DATA = table
} catch (error) {
  INLINE_FACE_DATA = {}
}

/** Global the Host half injects with the absolute `file://` fonts base. */
export const FONT_BASE_GLOBAL = '__CDS_THEME_FONT_BASE__'

/**
 * The faces the theme DECLARES, and which of them may be SHIPPED.
 *
 * `redistributable: false` means: keep the @font-face (so a machine that already
 * has the family installed still gets the replica), but never put the bytes in
 * the published bundle. See `font-assets.js` for why the six Anthropic faces are
 * in that category and the two Noto faces are not.
 *
 * The flag is the single source of truth for that decision: the build imports
 * only the `redistributable: true` entries, and the artifact test fails if the
 * base64 of any `false` entry appears in `client/client.js`. Adding a face is
 * therefore one edit here plus one import in `font-assets.js`, and mislabelling
 * it makes a test red rather than shipping quietly.
 *
 * `local` is a LIST, and that is not cosmetic. `local()` matches an installed
 * family-name STRING exactly, and the Anthropic distribution ships three
 * different display names for what the theme treats as one family:
 *
 *   Anthropic Sans Text / Anthropic Sans Display / Anthropic Sans Web Text
 *   Anthropic Serif Text / Anthropic Serif Display / Anthropic Serif Web Text
 *   Anthropic Mono (one name for all weights)
 *
 * A single `local("Anthropic Sans")` matched NONE of them: measured 2026-10-23
 * in the real renderer, that face reported `status: error`, the stack fell to
 * the inlined `anthropic-cjk`, and every Latin glyph was drawn in Noto Sans SC.
 * The page looked "not quite right" rather than obviously broken, which is why
 * it survived review. Each candidate costs a few bytes in the `src` list, and
 * `fontSourcesFor` emits them in order, so the first installed one wins.
 */
export const FONT_FACES = [
  { family: 'anthropic-sans', file: 'AnthropicSans-Roman-Web.woff2', style: 'normal', redistributable: false, local: ['Anthropic Sans Text', 'Anthropic Sans Display', 'Anthropic Sans Web Text', 'Anthropic Sans'] },
  { family: 'anthropic-sans', file: 'AnthropicSans-Italic-Web.woff2', style: 'italic', redistributable: false, local: ['Anthropic Sans Text', 'Anthropic Sans Display', 'Anthropic Sans Web Text', 'Anthropic Sans'] },
  { family: 'anthropic-serif', file: 'AnthropicSerif-Roman-Web.woff2', style: 'normal', redistributable: false, local: ['Anthropic Serif Text', 'Anthropic Serif Display', 'Anthropic Serif Web Text', 'Anthropic Serif'] },
  { family: 'anthropic-serif', file: 'AnthropicSerif-Italic-Web.woff2', style: 'italic', redistributable: false, local: ['Anthropic Serif Text', 'Anthropic Serif Display', 'Anthropic Serif Web Text', 'Anthropic Serif'] },
  { family: 'anthropic-mono', file: 'AnthropicMono-Roman-Web.woff2', style: 'normal', redistributable: false, local: ['Anthropic Mono'] },
  { family: 'anthropic-mono', file: 'AnthropicMono-Italic-Web.woff2', style: 'italic', redistributable: false, local: ['Anthropic Mono'] },
]

/**
 * Every face whose BYTES must never be shipped, derived from the flags above.
 *
 * Exported so the build and the artifact test read the same list instead of each
 * keeping its own copy of the six file names.
 */
export const RESTRICTED_FACES = FONT_FACES
  .filter(function (face) { return face.redistributable !== true })
  .map(function (face) { return face.file })

/**
 * THE CJK FALLBACK FACES — the Chinese counterpart of the Anthropic faces.
 *
 * WHY SOURCE HAN (Noto Sans/Serif SC) AND NOT PINGFANG.
 * The theme emits EIGHT weights (`typography.js` WEIGHTS): 330 / 360 / 400 /
 * 460 / 500 / 550 / 580 / 660, of which 360/460/550 are the dark-mode retinal
 * compensation — the mechanism that makes dark mode read like light mode.
 * A stock PingFang SC install is two STATIC files (Regular 400, Semibold 600),
 * so CSS font matching collapses those eight weights into two and six of them
 * become visually identical. Source Han is a variable face (wght 100-900), so
 * all eight survive as real axis positions.
 *
 * WHY THEY NEED AN AXIS SHIFT (`avar`).
 * Source Han is about 17% LIGHTER than Anthropic Sans at the same nominal
 * weight (measured stems at the same em: Anthropic 400 = 0.0943, Source Han
 * 400 = 0.0758). Fallback is per-character but `font-weight` is ONE property
 * for the whole run, so the CJK face cannot ask for a different number than the
 * Latin one. The `avar` table solves exactly this: it remaps user-space weight
 * onto design-space weight before interpolation. The shipped face therefore
 * answers `font-weight: 400` by drawing the design weight that has the stem
 * width of Anthropic Sans at 400.
 *
 * The breakpoints inside the files are CALIBRATED against browser-rendered
 * stems, not against outline coordinates — Chrome's own interpolation landed
 * the theoretical mapping 0.8-6.3% light. Residual error after calibration is
 * 0.0-0.7% across 330-580 and -2.8% at 660, where the theme's bold stem is
 * simply wider than Noto reaches at its 900 axis maximum.
 *
 * WHY A SUBSET. A full CJK face is 5.37 MB variable (7.70 MB serif); inlined as
 * base64 that is 17.5 MB of committed artifact. The shipped faces cover the
 * 7000 most common ideographs plus full CJK punctuation and ASCII (~2.9 MB
 * together, ~3.9 MB inlined). A rarer glyph falls through to the NEXT family in
 * the stack, which names the same installed face — so it still renders in
 * Source Han, just without the shift, which is imperceptible for one glyph.
 *
 * The serif face is STATIC: the greeting is its only consumer and it only ever
 * uses weight 330, so a static instance at the matching design weight costs a
 * third of the variable one and needs no avar.
 */
export const CJK_FACES = [
  { family: 'anthropic-cjk', file: 'NotoSansSC-Shifted-VF.woff2', style: 'normal', redistributable: true },
  { family: 'anthropic-cjk-serif', file: 'NotoSerifSC-Shifted-330.woff2', style: 'normal', redistributable: true },
]

/**
 * The CJK families' post-shift weight range.
 *
 * The axis shift means the theme's 330..660 maps onto design 404..850, so the
 * @font-face must accept exactly the CSS range the theme can emit. Declaring
 * `300 800` (the honest post-clamp axis) tells the browser every weight in that
 * span is served by this face rather than synthesising a bold.
 */
export const CJK_WEIGHT_RANGE = '300 800'

/**
 * Normalize a face's `local` field to a non-empty list of family names.
 *
 * Exported because the tests assert on the same normalization the emitter uses
 * instead of re-deriving it. A bare string is accepted (older entries and any
 * caller that supplies one name), so this widening does not break a caller.
 */
export function localNames(face) {
  if (face === undefined || face === null) return []
  const raw = face.local
  const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : [])
  const seen = new Set()
  const out = []
  for (const name of list) {
    if (typeof name !== 'string') continue
    const trimmed = name.trim()
    if (trimmed === '') continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

/**
 * The `src` list for one face. Pure and injectable, so the fallback is testable
 * without a browser.
 *
 * `options.fileBase` is the absolute `file://` fonts base (trailing slash).
 * `options.restricted` marks a face this package may NOT redistribute, and
 * `options.local` is that face's own installed family name — a string or a list
 * of candidates, tried in order.
 *
 * THE INLINED `data:` URL WINS WHEN PRESENT, AND A RESTRICTED FACE IS NEVER
 * ALLOWED TO GET ONE. That second clause is the licence rule, enforced here
 * rather than only in the build: whatever ends up in the inline table, a
 * restricted face resolves through `local()` and nothing else. A machine that
 * has the family installed renders the replica exactly as before; a machine
 * without it falls through the stack to the system faces.
 *
 * EVERY local() candidate is emitted for a restricted face, not just the first.
 * `local()` resolves at most one installed family, and CSS takes the first
 * `src` entry that resolves, so listing all of them is how one @font-face covers
 * machines that installed the family under a different display name.
 *
 * No URL is emitted for a restricted face even when a `file://` base exists.
 * The package does not ship `fonts/`, so such a URL would 404 once per face on
 * every page load — a console error for a file we deliberately stopped
 * distributing.
 *
 * Otherwise there is exactly ONE fallback left, the `file://` base, and no
 * route: the HTTP route was deleted because the branch that needed it cannot be
 * built (see the module header). With neither, `src` is `local()`, which leaves
 * the family unresolvable on purpose so the stack falls through to its system
 * fallbacks instead of requesting a URL that is guaranteed to 404.
 */
export function fontSourcesFor(file, options) {
  const opts = options === undefined || options === null ? {} : options
  // The installed family name comes from the face table, so a caller can never
  // emit `local("<file>.woff2")` — a name no machine has installed — by
  // forgetting to pass it.
  const declared = FONT_FACES.concat(CJK_FACES).find(function (face) { return face.file === file })
  const candidates = Array.isArray(opts.local) || typeof opts.local === 'string'
    ? localNames({ local: opts.local })
    : localNames(declared)
  // A face with no declared name keeps the old behaviour: the file name stands
  // in, which resolves nowhere and is the honest "we do not know" answer.
  const locals = candidates.length > 0 ? candidates : [file]
  const localSrc = locals
    .map(function (name) { return 'local("' + name + '")' })
    .join(', ')
  if (opts.restricted === true || (declared !== undefined && declared.redistributable !== true)) {
    return localSrc
  }
  // The inlined face wins unconditionally: it cannot 404, needs no origin and
  // no token, and is what makes the replica render in the desktop shell.
  const inline = INLINE_FACE_DATA[file]
  if (typeof inline === 'string' && inline !== '') {
    return 'url("' + inline + '") format("woff2")'
  }
  const fileBase = typeof opts.fileBase === 'string' ? opts.fileBase : ''
  if (fileBase === '') return localSrc
  return 'url("' + fileBase + file + '") format("woff2")'
}

/** The Host-injected `file://` base, or '' when the row did not render. */
function runtimeFileBase() {
  const value = typeof globalThis === 'undefined' ? undefined : globalThis[FONT_BASE_GLOBAL]
  return typeof value === 'string' ? value : ''
}

/** One `@font-face` block. `weightRange` differs for the shifted CJK faces. */
function faceBlock(face, opts, weightRange) {
  const restricted = face.redistributable !== true
  const options = restricted
    ? { restricted: true, local: face.local }
    : opts
  return [
    '@font-face {',
    '  font-family: "' + face.family + '";',
    '  font-style: ' + face.style + ';',
    '  font-weight: ' + weightRange + ';',
    '  font-display: swap;',
    '  src: ' + fontSourcesFor(face.file, options) + ';',
    '}',
  ].join('\n')
}

/**
 * The `@font-face` blocks: six Anthropic faces plus the two CJK fallbacks.
 *
 * The Anthropic faces expose the probed `wght 300–800` axis. The CJK faces
 * declare the same span (post-clamp), so the browser routes every weight the
 * theme can emit into the shifted face rather than synthesising a bold.
 */
export function fontFaceCss(options) {
  const opts = options === undefined || options === null
    ? { fileBase: runtimeFileBase() }
    : options
  const latin = FONT_FACES.map(function (face) { return faceBlock(face, opts, '300 800') })
  const cjk = CJK_FACES.map(function (face) { return faceBlock(face, opts, CJK_WEIGHT_RANGE) })
  return latin.concat(cjk).join('\n')
}

/**
 * The stack tokens.
 *
 * THE CJK RUNGS ARE NOW OURS, AND THAT IS A DELIBERATE DEPARTURE FROM THE
 * REFERENCE. The reference CSS (`cds-theme.css:226-234`) names four macOS
 * families — `PingFang SC`, `PingFang TC`, `Hiragino Sans`,
 * `Apple SD Gothic Neo`. On Windows none of them resolve, so Chinese fell
 * through to whatever the system default happened to be, with unpredictable
 * weight behaviour. On macOS they DO resolve — to *stock* PingFang, which is
 * two static files, so the theme's eight weights collapse to two there as well.
 *
 * Shipping `"anthropic-cjk"` first fixes both platforms: it is the real Source
 * Han face, it is variable, and its axis is shifted so Chinese renders at the
 * same optical weight as the Latin text beside it. The reference's macOS names
 * stay behind it, so a reader whose machine has them gets the same glyphs as a
 * last resort instead of a random system fallback.
 *
 * The serif rung is the one genuine improvement to report: the reference's
 * `--font-anthropic-serif` ends in `var(--font-cjk-sans-fallback)` — SANS faces
 * behind a SERIF stack, so Chinese in the greeting rendered in a sans while the
 * Latin beside it rendered in a serif. `"anthropic-cjk-serif"` puts Source Han
 * Serif there instead, and the greeting now reads as one typeface.
 */
export function fontStackCss() {
  return [
    ':root {',
    '  --font-cjk-sans-sc: "PingFang SC";',
    '  --font-cjk-sans-tc: "PingFang TC";',
    '  --font-cjk-sans-jp: "Hiragino Sans";',
    '  --font-cjk-sans-kr: "Apple SD Gothic Neo";',
    // The shipped shifted face first; the system families behind it so an
    // uncovered rare glyph still lands in the SAME typeface when installed.
    //
    // The `-rest` tokens exist so a composite can pull in the SYSTEM CJK
    // families WITHOUT repeating the embedded face. `preferredCjkStackCss` has
    // to write the full composite on `body` (see its header), and expanding
    // `var(--font-cjk-sans)` there put `anthropic-cjk` in the list twice: once
    // where the preference wants it, once where the root stack happens to
    // mention it. The second copy could never match, but it made the emitted
    // stack read as if two different orders were in force.
    '  --font-cjk-sans-rest: "Noto Sans SC", "Source Han Sans SC", var(--font-cjk-sans-sc), var(--font-cjk-sans-tc), var(--font-cjk-sans-jp), var(--font-cjk-sans-kr), "Microsoft YaHei";',
    '  --font-cjk-serif-rest: "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, var(--font-cjk-sans-rest);',
    '  --font-cjk-sans: "anthropic-cjk", var(--font-cjk-sans-rest);',
    '  --font-cjk-serif: "anthropic-cjk-serif", var(--font-cjk-serif-rest);',
    '  --font-cjk-sans-fallback: var(--font-cjk-sans);',
    // The Latin-only half. Kept separate from --font-sans-fallbacks for the same
    // reason as the -rest tokens: `preferredCjkStackCss` has to write a complete
    // composite on body, and expanding a token that already ends in the CJK
    // chain appended that whole chain a second time.
    '  --font-latin-fallbacks: system-ui, "Segoe UI", Roboto, Helvetica, Arial;',
    '  --font-sans-fallbacks: system-ui, "Segoe UI", Roboto, Helvetica, Arial, var(--font-cjk-sans), sans-serif;',
    '  --font-anthropic-sans: "anthropic-sans", var(--font-sans-fallbacks);',
    '  --font-anthropic-serif: "anthropic-serif", ui-serif, Georgia, "Times New Roman", var(--font-cjk-serif), serif;',
    '  --font-anthropic-mono: "anthropic-mono", ui-monospace, "Cascadia Mono", Consolas, var(--font-cjk-sans), monospace;',
    '}',
  ].join('\n')
}

/**
 * Small dynamic override; the large font-face sheet above stays immutable.
 *
 * Use BODY, not :root: the host resolves its font tokens on body. Composite
 * custom properties inherited from :root have already resolved their var()
 * references there, so changing only --font-cjk-sans lower down cannot reorder
 * an inherited --font-anthropic-sans. Re-declare all three complete composites
 * beside the host tokens instead. Never override --dsh-font-family-* or the
 * host's family tokens: explicit user picks must keep their existing priority.
 *
 * THE SYSTEM LIST IS BUILT FROM THE `-rest` TOKENS, NOT THE FULL `--font-cjk-*`
 * ONES. Those full tokens begin with the embedded face; expanding one here and
 * also naming the embedded face directly is what produced a stack with
 * `anthropic-cjk` in it TWICE and `system-ui` wedged between the copies:
 *
 *   anthropic-sans, anthropic-cjk, system-ui, "Segoe UI", ..., anthropic-cjk, ...
 *                                      ^^^^^^^^^^ ^^^^^^^^^^^^ first copy of CJK
 *
 * The second copy could never match, so rendering was correct — but the Latin
 * run fell to `system-ui` before reaching any CJK arm, which is exactly the
 * Latin/Chinese split this switch exists to remove. With the `-rest` tokens the
 * Chinese arm sits immediately behind the Latin face, so a Latin glyph that the
 * Anthropic face lacks and a Chinese glyph are served by the same typeface.
 *
 * A false preference emits nothing and restores fontStackCss() byte-for-byte.
 * Serif keeps the embedded serif CJK face rather than borrowing the sans one.
 */
export function preferredCjkStackCss(preferThemeCjk) {
  if (preferThemeCjk === false) return ''
  return [
    '/* ---- preferred Chinese fonts: calibrated faces before system ------- */',
    'body {',
    '  --font-anthropic-sans: "anthropic-sans", "anthropic-cjk", var(--font-cjk-sans-rest), var(--font-latin-fallbacks), sans-serif;',
    '  --font-anthropic-mono: "anthropic-mono", "anthropic-cjk", var(--font-cjk-sans-rest), ui-monospace, "Cascadia Mono", Consolas, monospace;',
    '  --font-anthropic-serif: "anthropic-serif", "anthropic-cjk-serif", var(--font-cjk-serif-rest), ui-serif, Georgia, "Times New Roman", serif;',
    '}',
  ].join('\n')
}

/** Everything the STATIC stylesheet needs from this module, in one block. */
export function fontCss(options) {
  return fontFaceCss(options) + '\n\n' + fontStackCss()
}
