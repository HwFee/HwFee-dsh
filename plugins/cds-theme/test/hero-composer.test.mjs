import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHeroComposerVisibility } from '../client/src/hero-composer.js'

function harness() {
  let resized, mutated, pending = null, writes = 0, queries = 0, top = 0, phase = 'hero'
  const listeners = new Map(), observed = [], disconnected = []
  const input = { contains: () => false, closest: () => card }
  const decoy = { querySelector: () => null }
  const page = { bottom: 700, getBoundingClientRect() { return { bottom: this.bottom } },
    get scrollTop() { return top }, set scrollTop(value) { top = value; writes++ } }
  const card = { bottom: 760, isConnected: true,
    querySelector: () => input, contains: e => e === input,
    getBoundingClientRect() { return { bottom: this.bottom - top } } }
  const root = { isConnected: true, getAttribute: () => phase,
    querySelector: s => s === '[data-conversation-scroll]' ? page : s === '[data-composer-input]' ? input : decoy }
  const doc = { body: {}, activeElement: input,
    querySelector: () => phase === 'hero' ? root : null,
    addEventListener: (key, cb) => listeners.set(key, cb),
    removeEventListener: key => listeners.delete(key),
    defaultView: {
      innerHeight: 700,
      ResizeObserver: class { constructor(cb) { resized = cb } observe(node) { observed.push(node) } disconnect() { disconnected.push('resize') } },
      MutationObserver: class { constructor(cb) { mutated = cb } observe() {} disconnect() { disconnected.push('mutation') } },
      requestAnimationFrame(cb) { pending = cb; return 1 }, cancelAnimationFrame() { pending = null },
    },
  }
  return { doc, root, page, card, input, observed, listeners, disconnected,
    resize: () => resized(), focus: () => listeners.get('focusin')?.({ target: input }),
    mutate: records => mutated(records), flush() { const cb = pending; pending = null; cb?.() },
    get top() { return top }, get writes() { return writes }, get pending() { return pending },
    set phase(value) { phase = value } }
}

test('growing focused hero composer reveals the entire card by scrolling the existing page', () => {
  const h = harness(), controller = createHeroComposerVisibility(h.doc)
  controller.start()
  assert.equal(h.top, 76, '60px overflow plus 16px below the toolbar must scroll away above')
  assert.deepEqual(h.observed, [h.page, h.card])
  h.resize(); h.resize()
  assert.equal(h.writes, 1, 'scrolling must not create a resize feedback loop')
  controller.stop()
})

test('focus restores an existing long draft; shorter viewport reveals controls; clearing needs no height writes', () => {
  const h = harness(), controller = createHeroComposerVisibility(h.doc)
  h.doc.activeElement = null; controller.start()
  assert.equal(h.writes, 0)
  h.doc.activeElement = h.input; h.focus()
  assert.equal(h.top, 76)
  h.page.bottom = 500; h.resize()
  assert.equal(h.top, 276, 'viewport shrinking must preserve the bottom action row')
  h.card.bottom = 450; h.resize()
  assert.equal(h.writes, 2, 'clearing delegates height and scroll clamping to normal browser layout')
  controller.stop()
})

test('unfocused drafts and active conversations are left alone', () => {
  const h = harness(), controller = createHeroComposerVisibility(h.doc)
  h.card.bottom = 650; controller.start()
  assert.equal(h.writes, 0)
  h.doc.activeElement = null; h.card.bottom = 900; h.resize()
  assert.equal(h.writes, 0)
  h.doc.activeElement = h.input; h.phase = 'active'; h.resize()
  assert.equal(h.writes, 0)
  controller.stop()
})

test('replacement mounts bind once; text mutations do not query layout; stop cancels pending work', () => {
  const h = harness(), controller = createHeroComposerVisibility(h.doc)
  controller.start()
  h.mutate([{ addedNodes: [{ nodeType: 3 }] }])
  assert.equal(h.pending, null)
  h.card.isConnected = false
  h.mutate([{ addedNodes: [] }])
  assert.ok(h.pending)
  controller.stop(); h.flush()
  assert.equal(h.pending, null)
  assert.equal(h.listeners.size, 0)
  assert.ok(h.disconnected.includes('mutation'))
  assert.ok(h.disconnected.includes('resize'))
  const writes = h.writes; h.resize()
  assert.equal(h.writes, writes, 'late observer delivery after stop is inert')
})

test('the visible edge is clamped to the window even when a scroll ancestor extends below it', () => {
  const h = harness(), controller = createHeroComposerVisibility(h.doc)
  h.page.bottom = 900
  controller.start()
  assert.equal(h.top, 76)
  controller.stop()
})

test('visibility runtime follows the master switch and is part of npm test', () => {
  const lifecycle = readFileSync(new URL('../client/src/lifecycle.js', import.meta.url), 'utf8')
  assert.match(lifecycle, /createHeroComposerVisibility\(document\)/)
  assert.match(lifecycle, /settings\.getState\(\)\.enabled !== false\) visibility\.start\(\)/)
  assert.match(lifecycle, /unsubscribe\(\); visibility\.stop\(\)/)
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  assert.ok(pkg.scripts.test.includes('node test/hero-composer.test.mjs'))
})
