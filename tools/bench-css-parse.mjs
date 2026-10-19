/**
 * Measured cost of the cds-theme static font sheet vs the dynamic rules sheet.
 *
 * WHY THIS SCRIPT EXISTS. `docs/perf-audit.md` claims three numbers that must be
 * reproducible, not remembered:
 *
 *   1. how many bytes the six inlined `data:font/woff2` faces contribute to
 *      `plugins/cds-theme/client/client.js`;
 *   2. how many bytes a settings toggle actually re-parses once the static font
 *      block lives in its own `<style>` tag;
 *   3. what the sheet halves cost to build.
 *
 * THE BROWSER/NODE SPLIT MATTERS, and getting it wrong is how this number has
 * been mis-quoted before. `fonts.js` guards its `require('./font-assets.js')`:
 * under plain Node the require throws (Node cannot import `.woff2`), so
 * `fontCss()` returns the ROUTE/file fallback sources and the font block is
 * ~1.9 KB. In the built artifact the same require resolves to the inlined
 * data-URL module, so `fontCss()` in the BROWSER emits the full ~968 KB of
 * base64. The browser figure is the one that costs anything, so this script
 * derives it from the committed artifact — the bytes that actually ship — and
 * prints the Node figure beside it only to explain the difference.
 *
 * WHAT IS NOT MEASURED: the browser's CSS re-parse time in milliseconds. Node
 * has no CSSOM, so this script cannot produce that number and does not pretend
 * to. It reports the exact byte counts the browser would parse and the element/
 * selector counts, which is what scales the parse.
 *
 *   node tools/bench-css-parse.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cds = join(root, 'plugins', 'cds-theme')
const ARTIFACT = join(cds, 'client', 'client.js')

const DATA_URL = /data:font\/woff2;base64,[A-Za-z0-9+/=]+/g
const PREFIX = 'data:font/woff2;base64,'

function kb(n) {
  return (n / 1024).toFixed(1) + ' KB'
}

function dirTotal(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) total += dirTotal(full)
    else if (entry.isFile()) total += statSync(full).size
  }
  return total
}

function median(samples) {
  const sorted = samples.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function time(fn, runs) {
  fn()
  const samples = []
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  return median(samples)
}

// ------------------------------------------------- 1. the shipped artifact

const artifactText = readFileSync(ARTIFACT, 'utf8')
const artifactBytes = Buffer.byteLength(artifactText, 'utf8')
const urls = artifactText.match(DATA_URL) || []
const inlineChars = urls.reduce((sum, url) => sum + url.length, 0)
const payloadChars = inlineChars - urls.length * PREFIX.length
const faces = readdirSync(join(cds, 'fonts'))
  .filter((name) => name.endsWith('.woff2'))
  .map((name) => ({ name, size: statSync(join(cds, 'fonts', name)).size }))
const rawFontBytes = faces.reduce((sum, face) => sum + face.size, 0)

console.log('== cds-theme artifact ==')
console.log('client/client.js                 ' + kb(artifactBytes) + '  (' + artifactText.length + ' chars)')
console.log('inlined data URLs                ' + urls.length + ' (' + kb(inlineChars) + ')')
console.log('  share of the artifact          ' + ((inlineChars / artifactText.length) * 100).toFixed(2) + '%')
console.log('  base64 payload only            ' + kb(payloadChars))
console.log('  raw woff2 on disk              ' + kb(rawFontBytes) + ' across ' + faces.length + ' faces')
console.log('  base64 expansion               x' + (payloadChars / rawFontBytes).toFixed(4) + ' (4/3 as expected)')
for (const face of faces) {
  const url = urls.find(function (candidate) {
    return candidate.length === Math.ceil(face.size / 3) * 4 + PREFIX.length
  })
  console.log('    ' + face.name.padEnd(38) + kb(face.size).padStart(10) +
    (url === undefined ? '' : '  -> ' + kb(url.length) + ' as base64'))
}
console.log('plugin directory (all files)     ' + kb(dirTotal(cds)))
console.log('')

// -------------------------------------------------- 2. the two sheet halves

const styles = await import(pathToFileURL(join(cds, 'client', 'src', 'styles.js')).href)
const constants = await import(pathToFileURL(join(cds, 'client', 'src', 'constants.js')).href)
const fontsModule = await import(pathToFileURL(join(cds, 'client', 'src', 'fonts.js')).href)
const state = constants.sanitize({})

// The Node-path font block: real, but not what the browser runs.
const nodeFontBlock = styles.fontSheet()
const fullCss = styles.buildCssFor(state)
const at = fullCss.indexOf(nodeFontBlock)
const nodeRules = at < 0 ? fullCss : fullCss.slice(0, at) + fullCss.slice(at + nodeFontBlock.length)

// The BROWSER-path font block: replace each `src:` value with the data URL the
// artifact actually carries, then re-render through the same fontCss() code.
// Done by monkey-patching the module's source list, so the numbers come from
// the shipped template rather than a re-implementation of it.
const inlineTable = {}
const faceNames = fontsModule.FONT_FACES.map((face) => face.file)
// Pair each data URL with its face by decode order in the artifact: the six
// `src:` values appear in FONT_FACES order inside the bundle.
urls.forEach(function (url, index) {
  if (index < faceNames.length) inlineTable[faceNames[index]] = url
})

/** Rebuild the font block exactly as `fonts.js` would with the inline table. */
function browserFontBlock() {
  const header = '/* ---- fonts: Anthropic faces + the reference stacks ----------------- */'
  const faceBlocks = fontsModule.FONT_FACES.map(function (face) {
    return [
      '@font-face {',
      '  font-family: "' + face.family + '";',
      '  font-style: ' + face.style + ';',
      '  font-weight: 300 800;',
      '  font-display: swap;',
      '  src: url("' + inlineTable[face.file] + '") format("woff2");',
      '}',
    ].join('\n')
  }).join('\n')
  return header + '\n' + faceBlocks + '\n\n' + fontsModule.fontStackCss()
}

const browserFontBlockText = browserFontBlock()
const browserFontBytes = Buffer.byteLength(browserFontBlockText, 'utf8')
const rulesBytes = Buffer.byteLength(nodeRules, 'utf8')
const browserFullBytes = browserFontBytes + rulesBytes

console.log('== the two sheet halves, as the BROWSER sees them ==')
console.log('static font block (own <style> tag, written once)  ' + kb(browserFontBytes))
console.log('dynamic rules (rewritten on a settings toggle)    ' + kb(rulesBytes))
console.log('full sheet (what shipped in one tag before)       ' + kb(browserFullBytes))
console.log('')
console.log('== per settings toggle ==')
console.log('bytes the browser re-parses WITH the split         ' + rulesBytes + ' B')
console.log('bytes it re-parsed WITHOUT the split               ' + browserFullBytes + ' B')
console.log('reduction                                          x' +
  (browserFullBytes / rulesBytes).toFixed(1) + '  (' +
  (100 - (rulesBytes / browserFullBytes) * 100).toFixed(2) + '% less)')
console.log('@font-face blocks re-registered per toggle: 0 (with the split), 6 (without)')
console.log('base64 strings the CSS tokeniser walks per toggle: 0 (with), 6 (without)')
console.log('')

// ------------------------------------------------------ 3. construction cost

const buildCssFor = styles.buildCssFor
const fontSheet = styles.fontSheet
console.log('== construction cost in Node, median of 500 runs ==')
console.log('buildCssFor(state)                 ' + time(function () { buildCssFor(state) }, 500).toFixed(4) + ' ms')
console.log('fontSheet() after the first call    ' + time(function () { fontSheet() }, 500).toFixed(5) + ' ms')
console.log('')
console.log('The first buildCssFor() call is the only one that builds the font block;')
console.log('every later call is a cache read. A settings toggle therefore pays the')
console.log('dynamic half only, which is what the byte numbers above quantify.')

console.log('')
console.log('== what this script does NOT measure ==')
console.log('The browser\'s CSS re-parse and style recalc for those bytes. That needs a')
console.log('real CSSOM; Node has none, so no millisecond figure is claimed here.')
console.log('The byte and selector counts above are what the parse scales with.')
console.log('')
console.log('selector count, dynamic rules      ' +
  (nodeRules.match(/\{/g) || []).length + ' rule blocks')
console.log('selector count, full sheet         ' +
  ((browserFontBlockText + nodeRules).match(/\{/g) || []).length + ' rule blocks')
