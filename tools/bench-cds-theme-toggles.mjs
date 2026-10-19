/**
 * cds-theme's per-toggle machinery, measured and exercised.
 *
 * TWO QUESTIONS, both from the audit brief:
 *
 *   1. Does the static/dynamic sheet split actually hold? `createStyles().apply()`
 *      finds the cached font block inside the freshly built sheet with
 *      `indexOf` and slices it out. In the browser that block is ~948 KB, so the
 *      search and the slice are themselves per-toggle work. Does a toggle
 *      rewrite the font `<style>` tag? (It must not.) And how long does the
 *      slice take on the real byte count?
 *
 *   2. Does `createThemeBridge().sync()` converge? The re-entrancy guard exists
 *      because the host publishes `theme/change` SYNCHRONOUSLY from inside
 *      `overrideTokens()`. If the guard is wrong, one settings flip registers
 *      two layers and the disposer stored is the stale one — which is the
 *      "turning the theme off does nothing" bug. This script drives a fake
 *      theme service that re-enters exactly like the host does, and counts.
 *
 * Both use the REAL modules; the fake DOM only counts writes.
 *
 *   node tools/bench-cds-theme-toggles.mjs
 */

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'plugins', 'cds-theme', 'client', 'src')

const stylesModule = await import(pathToFileURL(join(src, 'styles.js')).href)
const constants = await import(pathToFileURL(join(src, 'constants.js')).href)
const themeModule = await import(pathToFileURL(join(src, 'theme.js')).href)
const fontsModule = await import(pathToFileURL(join(src, 'fonts.js')).href)

// ---------------------------------------------------------- the fake DOM
//
// The one property that matters is `textContent` write COUNT per tag id, so the
// claim "a toggle does not rewrite the font block" is a counter, not a belief.

function makeDocument() {
  const head = { children: [], appendChild(node) { node.parentNode = head; head.children.push(node); return node }, removeChild(node) { const i = head.children.indexOf(node); if (i >= 0) head.children.splice(i, 1); return node } }
  const writes = {}
  const makeElement = function (tag) {
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '',
      dataset: {},
      parentNode: null,
      _text: '',
      appendChild() {},
      removeChild() {},
    }
    Object.defineProperty(node, 'textContent', {
      enumerable: true,
      get() { return node._text },
      set(value) {
        node._text = String(value)
        writes[node.id] = (writes[node.id] || 0) + 1
        writes.node = node
      },
    })
    return node
  }
  const doc = {
    head,
    body: makeElement('body'),
    documentElement: makeElement('html'),
    createElement: makeElement,
    getElementById(id) { return head.children.find((node) => node.id === id) || null },
  }
  return { doc, writes }
}

// --------------------------------------- 1. the browser-sized font block

const urls = (await import('node:fs')).readFileSync(
  join(root, 'plugins', 'cds-theme', 'client', 'client.js'), 'utf8').match(
  /data:font\/woff2;base64,[A-Za-z0-9+/=]+/g) || []

/**
 * The font block as the BROWSER builds it: `fontCss()` in Node returns the
 * URL-fallback sources (Node cannot import `.woff2`), so the data URLs are
 * substituted in to reach the real size.
 */
function browserSizedFontBlock() {
  const header = '/* ---- fonts: Anthropic faces + the reference stacks ----------------- */'
  const blocks = fontsModule.FONT_FACES.map(function (face, index) {
    return ['@font-face {',
      '  font-family: "' + face.family + '";',
      '  font-style: ' + face.style + ';',
      '  font-weight: 300 800;',
      '  font-display: swap;',
      '  src: url("' + (urls[index] || 'MISSING') + '") format("woff2");',
      '}'].join('\n')
  }).join('\n')
  return header + '\n' + blocks + '\n\n' + fontsModule.fontStackCss()
}

const fontBlock = browserSizedFontBlock()
const fontBytes = Buffer.byteLength(fontBlock, 'utf8')
// The DYNAMIC half, at browser sizes: the full sheet the plugin builds, minus
// the font block. In Node `fontSheet()` returns the ~1.9 KB URL-fallback block,
// so it has to be subtracted rather than reported directly.
const nodeFull = stylesModule.buildCssFor(constants.sanitize({}))
const nodeFontBlock = stylesModule.fontSheet()
const atNode = nodeFull.indexOf(nodeFontBlock)
const dynamicCss = atNode < 0 ? nodeFull : nodeFull.slice(0, atNode) + nodeFull.slice(atNode + nodeFontBlock.length)
const dynamicBytes = Buffer.byteLength(dynamicCss, 'utf8')

console.log('== the sheet split, at browser byte counts ==')
console.log('static font block      ' + (fontBytes / 1024).toFixed(1) + ' KB')
console.log('dynamic rules          ' + (dynamicBytes / 1024).toFixed(1) + ' KB')
console.log('full sheet             ' + ((fontBytes + dynamicBytes) / 1024).toFixed(1) + ' KB')
console.log('a toggle re-parses     ' + dynamicBytes + ' B instead of ' +
  (fontBytes + dynamicBytes) + ' B  (x' + ((fontBytes + dynamicBytes) / dynamicBytes).toFixed(1) + ')')
console.log('')

/** `apply()`'s own arithmetic: indexOf + two slices, on the real sizes. */
const synthetic = '/* banner */\n' + fontBlock + '\n\n' + 'x'.repeat(dynamicBytes)
function sliceOnce() {
  const start = performance.now()
  const at = synthetic.indexOf(fontBlock)
  const rest = at < 0 ? synthetic : synthetic.slice(0, at) + synthetic.slice(at + fontBlock.length)
  return { ms: performance.now() - start, length: rest.length, found: at }
}
sliceOnce()
const samples = []
for (let i = 0; i < 200; i += 1) samples.push(sliceOnce().ms)
samples.sort((a, b) => a - b)
const probe = sliceOnce()
console.log('== the indexOf + slice that every apply() runs ==')
console.log('input size             ' + (synthetic.length / 1024).toFixed(1) + ' KB')
console.log('font block located at  ' + probe.found)
console.log('result length          ' + probe.length + ' chars')
console.log('median of 200 runs     ' + samples[100].toFixed(3) + ' ms')
console.log('')

// ----------------------------------- 2. does a toggle rewrite the font tag?

const previousDocument = globalThis.document
const { doc, writes } = makeDocument()
globalThis.document = doc

let state = constants.sanitize({})
const styles = stylesModule.createStyles({ getState: function () { return state } })
styles.activate()
styles.apply()

const FONT_ID = constants.FONT_STYLE_ID
const RULES_ID = constants.STYLE_ID
const tags = doc.head.children.map((node) => node.id)
console.log('== does a settings toggle rewrite the font block? ==')
console.log('tags in <head> after the first apply: ' + tags.length + ' (' + tags.join(', ') + ')')
const fontWritesBefore = writes[FONT_ID] || 0

const flips = [
  ['accent -> graphite', { accent: 'graphite' }],
  ['warmth -> 40', { warmth: 40 }],
  ['elevation -> 150', { elevation: 150 }],
  ['radiusScale -> 1.2', { radiusScale: 1.2 }],
  ['refine -> false', { refine: false }],
  ['refine -> true', { refine: true }],
  ['codeBlockDetails -> false', { codeBlockDetails: false }],
  ['markdownBody -> false', { markdownBody: false }],
  ['enabled -> false', { enabled: false }],
  ['enabled -> true', { enabled: true }],
]
for (const [label, patch] of flips) {
  const beforeRules = writes[RULES_ID] || 0
  state = constants.sanitize(Object.assign({}, state, patch))
  styles.apply()
  const fontWrites = writes[FONT_ID] || 0
  const rulesDelta = (writes[RULES_ID] || 0) - beforeRules
  console.log('  ' + label.padEnd(26) +
    'font-tag writes: ' + String(fontWrites).padEnd(3) +
    'rules-tag write this toggle: ' + rulesDelta)
}
const fontWritesAfter = writes[FONT_ID] || 0
console.log('')
console.log('font tag written ' + fontWritesAfter + ' time(s) in total across ' +
  flips.length + ' toggles  -> split holds: ' + (fontWritesAfter === fontWritesBefore))
console.log('rules tag written ' + (writes[RULES_ID] || 0) + ' time(s), once on the first')
console.log('apply and once per toggle whose CSS actually changed (a toggle that only')
console.log('re-registers tokens leaves the text identical and is skipped).')
styles.teardown()
globalThis.document = previousDocument
console.log('')

// ------------------------------------------- 3. does the bridge converge?

console.log('== createThemeBridge().sync() convergence ==')
console.log('The host publishes theme/change synchronously INSIDE overrideTokens()')
console.log('(.repro/asar/.../dsh-client-ui-theme/lib/client.js:1877-1881), and keys its')
console.log('override layers in a Map BY SOURCE (:1835-1847), so a re-registration with')
console.log('the same source REPLACES the layer instead of stacking. The fake below is')
console.log('a transcription of that method, including the disposer identity guard.')

function fakeThemeService() {
  const stats = { registered: 0, disposed: 0, replaced: 0, listeners: [] }
  // Exactly the host's field: `overrides = new Map()`, keyed by source.
  const overrides = new Map()
  let overrideSeq = 0
  const service = {
    get stats() { return stats },
    get layerCount() { return overrides.size },
    on(event, listener) {
      stats.listeners.push(listener)
      return function off() {
        const index = stats.listeners.indexOf(listener)
        if (index >= 0) stats.listeners.splice(index, 1)
      }
    },
    overrideTokens(source, tokens) {
      stats.registered += 1
      const layer = { seq: overrideSeq++, tokens }
      if (overrides.has(source)) stats.replaced += 1
      overrides.set(source, layer)
      // The host notifies synchronously here — the re-entrancy hazard.
      for (const listener of stats.listeners.slice()) listener(service)
      return function dispose() {
        // The host's own identity guard: a stale disposer is a silent no-op.
        if (overrides.get(source) !== layer) {
          stats.disposed += 1
          return
        }
        overrides.delete(source)
        stats.disposed += 1
        for (const listener of stats.listeners.slice()) listener(service)
      }
    },
  }
  return service
}

const service = fakeThemeService()
let bridgeState = constants.sanitize({})
const bridge = themeModule.createThemeBridge({
  getState: function () { return bridgeState },
  getTheme: function () { return service },
})
// A listener that re-syncs on every theme/change, like lifecycle.js:98-103.
service.on('theme/change', function () { bridge.sync() })

bridge.sync()
console.log('')
console.log('after the first sync    registered=' + service.stats.registered +
  ' liveLayers=' + service.layerCount + ' disposed=' + service.stats.disposed)

const flips2 = [
  ['accent -> ochre', { accent: 'ochre' }],
  ['warmth -> 70', { warmth: 70 }],
  ['radiusScale -> 0.8', { radiusScale: 0.8 }],
  ['elevation -> 120', { elevation: 120 }],
  ['thinkingLabelBlue -> true', { thinkingLabelBlue: true }],
]
for (const [label, patch] of flips2) {
  bridgeState = constants.sanitize(Object.assign({}, bridgeState, patch))
  bridge.sync()
  console.log('  ' + label.padEnd(26) + 'registered=' + service.stats.registered +
    ' liveLayers=' + service.layerCount + ' replaced=' + service.stats.replaced)
}

const beforeIdle = service.stats.registered
bridge.sync()
bridge.sync()
bridge.sync()
console.log('  ' + '(3 syncs, no change)'.padEnd(26) + 'registered=' + service.stats.registered +
  ' liveLayers=' + service.layerCount +
  '  -> no new registration: ' + (service.stats.registered === beforeIdle))

bridgeState = constants.sanitize(Object.assign({}, bridgeState, { enabled: false }))
bridge.sync()
console.log('  ' + 'enabled -> false'.padEnd(26) + 'liveLayers=' + service.layerCount +
  ' (0 means the layer was RELEASED, which is the bug the guard prevents)')

bridgeState = constants.sanitize(Object.assign({}, bridgeState, { enabled: true }))
bridge.sync()
console.log('  ' + 'enabled -> true'.padEnd(26) + 'liveLayers=' + service.layerCount)
bridge.release()
console.log('  ' + 'release()'.padEnd(26) + 'liveLayers=' + service.layerCount)
console.log('')
console.log('the host Map holds at most one layer for this source: ' +
  (service.layerCount <= 1))
console.log('total registrations for ' + (1 + flips2.length + 3 + 2) + ' syncs that mattered: ' +
  service.stats.registered)
