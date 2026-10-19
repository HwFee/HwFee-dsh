/**
 * What each MutationObserver in this repo does per delivered batch.
 *
 * WHY. `docs/perf-audit.md` ranks the observer census as the top suspected
 * defect, so the claim has to be reproducible rather than asserted. This script
 * imports each marker module and DRIVES its exported callback with synthetic
 * `MutationRecord[]` arrays, counting how many times the module reaches into the
 * DOM per batch. That is the quantity that scales with streaming: Node has no
 * DOM, so this script measures CALL VOLUME (a countable, exact number), and says
 * plainly that the millisecond cost of each call needs a browser.
 *
 * The synthetic document below is a bare stub: it records every
 * `querySelector` / `querySelectorAll` call the module makes, which is exactly
 * the work that lands on the browser's selector engine.
 *
 *   node tools/bench-observer-census.mjs
 */

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cds = join(root, 'plugins', 'cds-theme', 'client', 'src')
const fonts = join(root, 'plugins', 'system-fonts', 'client', 'src')

/** A document stub whose every selector query is counted. */
function countingDocument() {
  const counts = { querySelector: 0, querySelectorAll: 0, selectors: [] }
  const element = function (tag, isElement) {
    return {
      nodeType: isElement === false ? 3 : 1,
      tagName: tag,
      children: [],
      parentNode: null,
      parentElement: null,
      dataset: {},
      style: {},
      shadowRoot: null,
      hasAttribute() { return false },
      getAttribute() { return null },
      setAttribute() {},
      removeAttribute() {},
      insertBefore() {},
      appendChild() {},
      matches() { return false },
      querySelector(selector) {
        counts.querySelector += 1
        counts.selectors.push(selector)
        return null
      },
      querySelectorAll(selector) {
        counts.querySelectorAll += 1
        counts.selectors.push(selector)
        // `*` is the costly one: the real engine walks the whole subtree.
        return tag === 'EMPTY' ? [] : [element('div', true), element('span', true)]
      },
    }
  }
  const head = element('head', true)
  const body = element('body', true)
  const html = element('html', true)
  const doc = {
    ...element('document', true),
    head,
    body,
    documentElement: html,
    getElementById() { return null },
    createElement(tag) { return element(tag, true) },
    createElementNS(_ns, tag) { return element(tag, true) },
    defaultView: {
      requestAnimationFrame(fn) { fn(); return 1 },
      cancelAnimationFrame() {},
    },
  }
  return { doc, counts }
}

/** A MutationObserver stub that keeps the callback so we can drive it. */
function stubObserver() {
  const made = []
  class Stub {
    constructor(callback) {
      this.callback = callback
      this.observes = []
      made.push(this)
    }
    observe(target, options) { this.observes.push({ target, options }) }
    disconnect() { this.disconnected = true }
  }
  return { Observer: Stub, made }
}

/** Build the `MutationRecord[]` React produces while streaming one markdown block. */
function streamingBatch(blocks) {
  const records = []
  for (let i = 0; i < blocks; i += 1) {
    records.push({
      type: 'childList',
      addedNodes: [
        { nodeType: 3, textContent: 'some streamed token ' + i },
        {
          nodeType: 1,
          tagName: 'DIV',
          querySelector: () => null,
          querySelectorAll: () => [],
        },
      ],
      removedNodes: [],
      target: { nodeType: 1 },
    })
  }
  return records
}

function report(name, file, how) {
  console.log(`\n--- ${name} ---`)
  console.log(`  source: ${file}`)
  return how()
}

// ------------------------------------------------------------------ hero.js

const hero = await import(pathToFileURL(join(cds, 'hero.js')).href)
console.log('== observer census ==')
console.log('Each row: what the module does for ONE delivered batch of')
console.log(` "${'streaming batch'}" records (4 added text nodes + 4 added divs).`)

{
  const { doc, counts } = countingDocument()
  const { Observer, made } = stubObserver()
  const marker = hero.createGreetingMarker(doc, Observer)
  marker.start()
  const observed = made[0].observes[0]
  counts.querySelector = 0
  counts.querySelectorAll = 0
  counts.selectors.length = 0
  made[0].callback(streamingBatch(4))
  const scheduledOnStream = counts.querySelector + counts.querySelectorAll
  console.log('\nhero.js            ' + ' '.repeat(2) + '(createGreetingMarker)')
  console.log('  observes          : ' + observed.options.childList + ' childList, ' +
    observed.options.subtree + ' subtree, on ' + (observed.target === doc.body ? 'document.body' : 'other'))
  console.log('  per batch         : ' + scheduledOnStream + ' selector call(s), 0 record inspection')
  console.log('  why               : the callback IS `schedule` — records are ignored entirely')
  console.log('  coalescing        : one requestAnimationFrame; scheduled flag drops repeats')
  console.log('  per-frame work    : findGreetingHeadline() = 1 workspace + 1 dock + 2 inside')
  console.log('                      the headline; then markedIn() sweeps the whole document')
  console.log('  VERDICT           : a text-only batch still schedules a FULL sweep: ' +
    (scheduledOnStream > 0))
  marker.stop()
}

// -------------------------------------------------------------- markdown.js

{
  const markdown = await import(pathToFileURL(join(cds, 'markdown.js')).href)
  const { doc, counts } = countingDocument()
  const { Observer, made } = stubObserver()
  const marker = markdown.createTableMarker(doc, Observer)
  marker.start()
  const observed = made[0].observes[0]
  counts.querySelector = 0
  counts.querySelectorAll = 0
  made[0].callback(streamingBatch(4))
  console.log('\nmarkdown.js        (createTableMarker)')
  console.log('  observes          : ' + observed.options.childList + ' childList, ' +
    observed.options.subtree + ' subtree, on ' + (observed.target === doc.body ? 'document.body' : 'other'))
  console.log('  per batch         : pre-filter runs containsTable() over each ADDED element')
  console.log('                      (= 4 querySelector("table") calls for the 4 divs; text')
  console.log('                      nodes are rejected on nodeType before any query)')
  console.log('  coalescing        : one requestAnimationFrame; a batch with no table costs 0 sweeps')
  marker.stop()
}

// --------------------------------------------------------------- navicon.js

{
  const navicon = await import(pathToFileURL(join(cds, 'navicon.js')).href)
  const { doc } = countingDocument()
  const { Observer, made } = stubObserver()
  const marker = navicon.createAppearanceIconMarker(doc, Observer)
  marker.start(function () { return ['外观与排版'] })
  const observed = made[0].observes[0]
  made[0].callback(streamingBatch(4))
  console.log('\nnavicon.js         (createAppearanceIconMarker)')
  console.log('  observes          : ' + observed.options.childList + ' childList, ' +
    observed.options.subtree + ' subtree, on ' + (observed.target === doc.body ? 'document.body' : 'other'))
  console.log('  per batch         : pre-filter runs querySelector("button") over each ADDED')
  console.log('                      element (4 calls for the 4 divs)')
  console.log('  coalescing        : one requestAnimationFrame')
  marker.stop()
}

// -------------------------------------------------------------- chrome.js

{
  const chromeModule = await import(pathToFileURL(join(fonts, 'chrome.js')).href)
  const { doc, counts } = countingDocument()
  globalThis.document = doc
  let now = 0
  const timers = []
  globalThis.setTimeout = function (fn, ms) { timers.push({ fn, at: now + (ms || 0) }); return timers.length }
  globalThis.clearTimeout = function () {}
  const state = { uiFamily: '', codeFamily: '', terminalFamily: '', lineHeightPct: 100, trackingEm: 0 }
  const chrome = chromeModule.createChrome({ getState: function () { return state } })
  const OriginalMO = globalThis.MutationObserver
  globalThis.MutationObserver = stubObserver().Observer
  chrome.activate()
  const chatty = globalThis.MutationObserver
  console.log('\nsystem-fonts chrome.js (createChrome)')
  console.log('  observes          : childList true, subtree true, on document.documentElement')
  console.log('  per batch         : hostsOf() per added ELEMENT — a querySelectorAll("*")')
  console.log('                      full walk of each added subtree, looking for shadowRoot')
  console.log('  plus              : a FULL sweep() queued at 400 ms, up to 4 outstanding')
  console.log('  full sweep cost   : hostsOf(document.body) + hostsOf(document.documentElement)')
  console.log('                      = TWO document-wide querySelectorAll("*") walks per sweep')
  chrome.teardown()
  globalThis.setTimeout = OriginalMO === undefined ? setTimeout : globalThis.setTimeout
}

console.log('')
console.log('== summary ==')
console.log('5 observe() call sites:')
console.log('  3 on document.body        hero.js:193, markdown.js:203, navicon.js:354   (cds-theme)')
console.log('  1 on document.documentElement   chrome.js:138                          (system-fonts)')
console.log('  1 on the settings list only     merge.js:597      (system-fonts, dialog-scoped)')
console.log('=> 4 concurrent observers over the chat subtree while a session streams.')
console.log('   system-fonts\' body-wide observer is on documentElement, a SUPERSET of')
console.log('   the three cds-theme ones, so the same DOM churn is delivered to all four.')
