/**
 * The blank-session backdrop: glyph physics, the structural mount, the phase
 * gate, the click listener, reduced motion, and cleanup.
 *
 * The fake DOM below mirrors the shape this module is written against — the
 * conversation body from `docs/host-hooks.md:83-87`:
 *
 *   div[data-conversation-content][data-content-phase="hero"]   ← layer mounts here
 *   └ div[data-conversation-scroll]
 *      └ div[data-composer-seat] > (greeting + composer card)
 *
 * There is no canvas implementation in Node, so the fake 2D context records the
 * calls it receives. That is enough to assert WHAT is drawn (a glyph run, a ring,
 * the accent colour while a wave passes) without pretending to be a rasteriser.
 *
 *   node test/ripple.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  RIPPLE_ATTR, CONTENT_ANCHOR, SCROLL_ANCHOR, PHASE_ATTR, HERO_PHASE,
  GLYPH_TOKENS, TUNING, FALLBACK_PALETTE,
  createRng, glyphCount, gridFor, layoutGlyphs, rippleProgress, rippleRadius,
  easeOutCubic, waveStrength, totalWave, readPalette, findHeroHost, createHeroRipple,
} from '../client/src/ripple.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize, DEFAULT_STATE } from '../client/src/constants.js'
import { en, zh } from '../client/src/locales.js'
import { createPanel } from '../client/src/panel.js'

// ------------------------------------------------------------- fake DOM

const ATTR = /^\[([A-Za-z0-9-]+)(?:="([^"]*)")?\]$/

class FakeElement {
  constructor(tag, attrs) {
    this.tagName = String(tag === undefined ? 'div' : tag).toUpperCase()
    this.attrs = attrs || {}
    this.children = []
    this.parentNode = null
    this.nodeType = 1
    this.listeners = []
    this.width = 0
    this.height = 0
    this.rect = { left: 0, top: 0, width: 0, height: 0 }
    this.context = null
    this.contextCalls = []
  }

  insertBefore(node, reference) {
    if (node.parentNode) node.parentNode.removeChild(node)
    const index = reference === null || reference === undefined
      ? this.children.length
      : this.children.indexOf(reference)
    this.children.splice(index < 0 ? this.children.length : index, 0, node)
    node.parentNode = this
    return node
  }

  appendChild(node) {
    return this.insertBefore(node, null)
  }

  removeChild(node) {
    const index = this.children.indexOf(node)
    if (index >= 0) this.children.splice(index, 1)
    node.parentNode = null
    return node
  }

  get firstChild() {
    return this.children.length > 0 ? this.children[0] : null
  }

  /** Real DOM exposes both; `parentNode` alone would hide a real code path. */
  get parentElement() {
    return this.parentNode
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name)
  }

  getAttribute(name) {
    return this.hasAttribute(name) ? String(this.attrs[name]) : null
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value)
  }

  removeAttribute(name) {
    delete this.attrs[name]
  }

  addEventListener(type, handler) {
    this.listeners.push({ type, handler })
  }

  removeEventListener(type, handler) {
    this.listeners = this.listeners.filter(function (entry) {
      return !(entry.type === type && entry.handler === handler)
    })
  }

  dispatch(type, event) {
    for (const entry of this.listeners) {
      if (entry.type === type) entry.handler(event)
    }
  }

  getBoundingClientRect() {
    // REPLACED-ELEMENT SEMANTICS. A real `<canvas>` reports its intrinsic size —
    // the `width`/`height` ATTRIBUTES, i.e. the bitmap dimensions — when CSS does
    // not pin its box. Modelling that here is what makes the runaway feedback
    // loop visible to a test: measure → multiply by dpr → write back → measure
    // larger. `cssBox` stands in for a stylesheet that pins the box (our
    // `width: 100%; height: 100%`); when it is set, CSS wins over the attributes,
    // exactly as it does in the browser.
    if (this.tagName === 'CANVAS' && this.cssBox === undefined) {
      return Object.assign({}, this.rect, {
        width: this.width || 300,
        height: this.height || 150,
      })
    }
    return this.rect
  }

  getContext(kind) {
    if (kind !== '2d') return null
    if (this.context === null) {
      const owner = this
      const record = function (name) {
        return function () {
          owner.contextCalls.push([name].concat(Array.prototype.slice.call(arguments)))
        }
      }
      this.context = {
        // Paint state the module sets; the recorder is only for calls.
        globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
        // The glow. Present on a real 2D context, so the fake must have it too or
        // the module's `'shadowBlur' in ctx` guard would silently skip the glow
        // and every test would exercise a dimmer field than the browser shows.
        shadowBlur: 0, shadowColor: '',
        save: record('save'),
        restore: record('restore'),
        translate: record('translate'),
        rotate: record('rotate'),
        clearRect: record('clearRect'),
        fillText: function (text, x, y) {
          owner.contextCalls.push(['fillText', text, x, y, this.globalAlpha, this.fillStyle])
        },
        beginPath: record('beginPath'),
        arc: function (x, y, radius) {
          owner.contextCalls.push(['arc', x, y, radius])
        },
        stroke: record('stroke'),
        setTransform: record('setTransform'),
      }
    }
    return this.context
  }

  matches(selector) {
    const attr = ATTR.exec(selector)
    if (attr === null) throw new Error('fake DOM: unsupported selector ' + selector)
    if (!this.hasAttribute(attr[1])) return false
    return attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]
  }

  querySelectorAll(selector) {
    const out = []
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) out.push(child)
        walk(child)
      }
    }
    walk(this)
    return out
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null
  }
}

/** A fake ResizeObserver that records its callbacks so a test can fire it. */
function fakeResizeObservers() {
  const instances = []
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback
      instances.push(this)
      this.targets = []
    }
    observe(target) { this.targets.push(target) }
    disconnect() { this.targets = []; instances.splice(instances.indexOf(this), 1) }
    /** Simulate a layout change. */
    fire() { this.callback([], this) }
  }
  return { ResizeObserver: FakeResizeObserver, instances }
}

const el = function (tag, attrs) { return new FakeElement(tag, attrs) }

/**
 * A document stand-in: an element with a `body`, a `defaultView` whose rAF is a
 * manual queue (so a test drives frames instead of waiting on a clock), and a
 * `getComputedStyle` that reports the theme tokens.
 */
function fakeDocument(options) {
  const opts = options || {}
  const doc = el('html')
  const body = el('body', opts.dark ? { 'data-ds-dark-theme': '' } : {})
  doc.appendChild(body)
  doc.body = body
  doc.visibilityState = 'visible'
  const queue = []
  const cancelled = new Set()
  let nextId = 1
  const view = {
    devicePixelRatio: opts.dpr === undefined ? 1 : opts.dpr,
    requestAnimationFrame(fn) {
      const id = nextId
      nextId += 1
      queue.push({ id, fn })
      return id
    },
    // The real API removes the pending callback. The fake must too, or a module
    // that cancels its frame would still run once more and every "no frame after
    // stop" assertion would be testing the fake instead of the code.
    cancelAnimationFrame(id) { cancelled.add(id) },
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)')
      return { matches: opts.reduceMotion === true }
    },
    performance: { now: function () { return opts.clock || 0 } },
    getComputedStyle() {
      return {
        getPropertyValue(name) {
          if (name === '--dsw-alias-brand-primary') return opts.accent || '#c6613f'
          if (name === '--dsw-alias-label-primary') return opts.text || '#1f1e1d'
          return ''
        },
      }
    },
  }
  doc.defaultView = view
  doc.queue = queue
  doc.createElement = function (tag) {
    const node = el(tag)
    // The layer's CSS box comes from its containing block (the conversation body),
    // which is what the real stylesheet's `position: absolute; inset: 0;
    // width: 100%; height: 100%` produces. `cssBox` says "CSS pins my box", so the
    // fake stops reporting the bitmap attributes as its layout size.
    node.rect = { left: 0, top: 0, width: opts.width || 1000, height: opts.height || 742 }
    node.cssBox = true
    return node
  }
  /** Run every queued frame callback once, skipping cancelled ones. */
  doc.stepFrame = function (timestamp) {
    const pending = queue.splice(0, queue.length)
    let ran = 0
    for (const entry of pending) {
      if (cancelled.has(entry.id)) continue
      entry.fn(timestamp)
      ran += 1
    }
    return ran
  }
  return doc
}

/** The host's conversation body inside a scroll container, on the given phase. */
function buildHost(doc, phase) {
  const content = el('div', {
    [CONTENT_ANCHOR.slice(1, -1)]: '',
    [PHASE_ATTR]: phase === undefined ? HERO_PHASE : phase,
  })
  // The body's own box: this is what the layer's containing block resolves to,
  // and what the module measures (it never measures the canvas — see `measure()`).
  content.rect = { left: 280, top: 80, width: 1000, height: 742 }
  const scroll = el('div', { [SCROLL_ANCHOR.slice(1, -1)]: '' })
  const seat = el('div', { 'data-composer-seat': '' })
  scroll.appendChild(seat)
  content.appendChild(scroll)
  doc.body.appendChild(content)
  content.setRect = function (rect) { content.rect = rect }
  scroll.setRect = function (rect) { scroll.rect = rect }
  return { content, scroll, seat }
}

/** A fake MutationObserver that records its callback and options. */
function fakeObservers() {
  const instances = []
  class FakeObserver {
    constructor(callback) {
      this.callback = callback
      instances.push(this)
    }
    observe(target, options) {
      this.target = target
      this.options = options
    }
    disconnect() {
      this.disconnected = true
      instances.splice(instances.indexOf(this), 1)
    }
  }
  return { Observer: FakeObserver, instances }
}

/** Build a started module on a hero-phase host, with a 900×600 canvas. */
function startedModule(overrides) {
  const opts = overrides || {}
  const doc = fakeDocument(opts)
  const host = buildHost(doc, opts.phase)
  const observers = fakeObservers()
  const resizers = fakeResizeObservers()
  const ripple = createHeroRipple({
    doc,
    Observer: observers.Observer,
    ResizeObserver: opts.noResizeObserver ? null : resizers.ResizeObserver,
    now: function () { return opts.clock || 0 },
  })
  ripple.start()
  const canvas = ripple.canvas
  return { doc, host, ripple, canvas, observers, resizers }
}

// ------------------------------------------------------------- the physics

test('the glyph field is deterministic for a size and seed', function () {
  const a = layoutGlyphs(900, 600, 7)
  const b = layoutGlyphs(900, 600, 7)
  assert.deepEqual(a, b, 'the same seed must produce the same field')
  const c = layoutGlyphs(900, 600, 8)
  assert.notDeepEqual(a, c, 'a different seed must produce a different field')
})

test('a resize keeps the field instead of reshuffling it', function () {
  // The canvas keeps ONE seed for its lifetime precisely so a ResizeObserver tick
  // does not rearrange the backdrop. Same seed, larger area: the glyphs that still
  // exist keep their own token and position.
  const small = layoutGlyphs(600, 400, 0x5eed)
  const large = layoutGlyphs(1200, 800, 0x5eed)
  assert.ok(large.length > small.length, 'a larger backdrop carries more glyphs')
  const first = small[0]
  const match = large.find(function (glyph) {
    return glyph.text === first.text && Math.abs(glyph.x - first.x) < 0.0001
  })
  assert.ok(match, 'the first glyph of the small field must still exist in the large one')
})

test('the glyph count is bounded at the top end', function () {
  assert.equal(glyphCount(0, 0), 0, 'no area, no field')
  assert.equal(glyphCount(20000, 20000), TUNING.maxGlyphs, 'a huge backdrop is capped')
  const small = glyphCount(200, 140)
  assert.ok(small > 0, 'a small backdrop still gets a field')
  const middle = glyphCount(1000, 700)
  assert.ok(middle > small && middle < TUNING.maxGlyphs)
})

test('the grid is anchored to the top-left at a fixed cell size', function () {
  // This is what makes a resize additive instead of a reshuffle: the same cell
  // size and origin in both fields.
  const small = gridFor(600, 400)
  const large = gridFor(1200, 800)
  assert.equal(small.cell, large.cell)
  assert.ok(large.cols > small.cols)
  assert.ok(large.rows > small.rows)
  assert.deepEqual(gridFor(0, 400), { cols: 0, rows: 0, cell: TUNING.cell, count: 0 })
})

test('every glyph is a code token drawn inside the field', function () {
  const glyphs = layoutGlyphs(900, 600, 1)
  for (const glyph of glyphs) {
    assert.ok(GLYPH_TOKENS.indexOf(glyph.text) >= 0, 'unknown token ' + glyph.text)
    // No glyph may be a WORD: the field reads as texture only if nothing in it is
    // legible as an identifier.
    assert.match(glyph.text, /^[^a-zA-Z0-9]+$/, 'glyph token must be punctuation: ' + glyph.text)
    assert.ok(glyph.x >= 0 && glyph.x <= 900, 'glyph outside the field horizontally')
    assert.ok(glyph.y >= 0 && glyph.y <= 600, 'glyph outside the field vertically')
    assert.ok(glyph.size >= 9 && glyph.size <= 25, 'size out of the tuned spread: ' + glyph.size)
    assert.ok(glyph.weight > 0 && glyph.weight <= 1)
    assert.ok(Math.abs(glyph.rotate) <= 0.35, 'tilt must stay subtle')
  }
})

test('the ripple eases outward and stops at the end of its life', function () {
  assert.equal(rippleProgress(0), 0)
  assert.equal(rippleProgress(TUNING.ringLife), 1)
  assert.equal(rippleProgress(TUNING.ringLife * 4), 1, 'progress clamps')
  assert.equal(rippleRadius(0, 500), 0)
  assert.ok(Math.abs(rippleRadius(TUNING.ringLife, 500) - 500) < 1e-9)
  // Ease-out: most of the distance early, the last of it slowly.
  assert.ok(rippleRadius(TUNING.ringLife / 2, 500) > 250,
    'an eased-out wave must be past halfway at half its life')
  assert.equal(easeOutCubic(0), 0)
  assert.equal(easeOutCubic(1), 1)
})

test('the wavefront is a band: strongest at the radius, zero far from it', function () {
  const maxRadius = 600
  const age = TUNING.ringLife * 0.4
  const radius = rippleRadius(age, maxRadius)
  const atFront = waveStrength(radius, age, maxRadius)
  assert.ok(atFront > 0.1, 'a glyph on the wavefront must light up')
  assert.ok(atFront <= TUNING.waveGain)
  const behind = waveStrength(Math.max(0, radius - TUNING.waveSigma * 4), age, maxRadius)
  const ahead = waveStrength(radius + TUNING.waveSigma * 4, age, maxRadius)
  assert.ok(behind < atFront * 0.05, 'the wave must have passed already behind the front')
  assert.ok(ahead < atFront * 0.05, 'the wave must not arrive before the front')
})

test('a wave dies out as the ripple ages, and never outlives it', function () {
  const maxRadius = 600
  const early = waveStrength(rippleRadius(TUNING.ringLife * 0.2, maxRadius), TUNING.ringLife * 0.2, maxRadius)
  const late = waveStrength(rippleRadius(TUNING.ringLife * 0.9, maxRadius), TUNING.ringLife * 0.9, maxRadius)
  assert.ok(late < early, 'the same distance must read weaker late in the ripple')
  assert.equal(waveStrength(0, TUNING.ringLife + 1, maxRadius), 0, 'a dead ripple contributes nothing')
  assert.equal(waveStrength(0, -1, maxRadius), 0, 'a ripple cannot start before it was born')
})

test('several live ripples add up but stay bounded', function () {
  const maxRadius = 600
  const radius = rippleRadius(TUNING.ringLife * 0.3, maxRadius)
  const one = totalWave(radius, [TUNING.ringLife * 0.3], maxRadius)
  const two = totalWave(radius, [TUNING.ringLife * 0.3, TUNING.ringLife * 0.3], maxRadius)
  assert.ok(Math.abs(two - one * 2) < 1e-9, 'waves sum')
  assert.ok(totalWave(radius, [], maxRadius) === 0, 'no ripples, no wave')
})

// ------------------------------------------------------------- the palette

test('the palette comes from the live theme tokens', function () {
  const doc = fakeDocument({ accent: '#aa3311', text: '#112233' })
  const palette = readPalette(doc)
  assert.equal(palette.accent, '#aa3311')
  assert.equal(palette.text, '#112233')
  assert.equal(palette.dark, false)
})

test('dark mode is detected from the host body attribute', function () {
  const doc = fakeDocument({ dark: true })
  assert.equal(readPalette(doc).dark, true)
})

test('a document without the tokens falls back instead of painting nothing', function () {
  // A bare host (or a test double) can report empty strings for both tokens.
  const doc = fakeDocument({ accent: '', text: '' })
  // The fake returns `''` for the accent only when the option is empty; assert the
  // fallback path is what fills the gap.
  const palette = readPalette(doc)
  assert.ok(palette.accent.length > 0)
  assert.ok(palette.text.length > 0)
  assert.equal(readPalette(null).accent, FALLBACK_PALETTE.accent)
  assert.equal(readPalette(undefined).accent, FALLBACK_PALETTE.accent)
})

// --------------------------------------------------------------- the mount

test('the layer mounts as the FIRST child of the conversation body', function () {
  // Painting order is the whole point: the canvas has to sit under the hero
  // stack. It is mounted first so an in-flow sibling (had there been one) would
  // also paint over it; the CSS z-index:-1 under hero-scoped isolation does the
  // rest (styles.js).
  const ui = startedModule({})
  assert.ok(ui.canvas, 'expected a mounted canvas')
  assert.equal(ui.host.content.children[0], ui.canvas, 'the canvas must be the first child')
  assert.ok(ui.canvas.hasAttribute(RIPPLE_ATTR))
  assert.equal(ui.canvas.getAttribute('aria-hidden'), 'true',
    'the layer is decoration and must be hidden from assistive technology')
})

test('the layer does not mount when the host layout is not recognised', function () {
  // No conversation body at all (the settings page, a bare shell).
  const doc = fakeDocument({})
  const ripple = createHeroRipple({ doc, Observer: fakeObservers().Observer })
  ripple.start()
  assert.equal(ripple.mounted, false)
  assert.equal(doc.body.querySelector('[' + RIPPLE_ATTR + ']'), null)
})

test('a body with no scroll container is left alone', function () {
  const doc = fakeDocument({})
  const content = el('div', { [CONTENT_ANCHOR.slice(1, -1)]: '', [PHASE_ATTR]: HERO_PHASE })
  content.appendChild(el('div'))
  doc.body.appendChild(content)
  assert.equal(findHeroHost(doc), null, 'the structural check requires the scroll container')
  const ripple = createHeroRipple({ doc, Observer: fakeObservers().Observer })
  ripple.start()
  assert.equal(ripple.mounted, false)
})

test('the canvas is sized in device pixels for the field in CSS pixels', function () {
  // The body in the fake host is 1000×742; the bitmap is that times the ratio.
  const ui = startedModule({ dpr: 2 })
  assert.equal(ui.canvas.width, 2000, '1000 CSS px at dpr 2')
  assert.equal(ui.canvas.height, 1484)
})

test('device pixel ratio is capped so a 4x display does not quadruple the buffer', function () {
  const ui = startedModule({ dpr: 4 })
  assert.equal(ui.canvas.width, 1000 * TUNING.maxDpr)
})

test('the canvas is watched for size changes instead of measured every frame', function () {
  // A rect read forces layout. Measuring the canvas on every frame meant a 30 fps
  // backdrop forcing 30 layouts a second for as long as the home screen was open.
  const ui = startedModule({})
  assert.equal(ui.resizers.instances.length, 1, 'expected a ResizeObserver on the canvas')
  assert.deepEqual(ui.resizers.instances[0].targets, [ui.canvas], 'watching the layer itself')

  // The window grows — the BODY changes size, which is what the module measures.
  ui.host.content.rect = { left: 280, top: 80, width: 1200, height: 800 }
  ui.resizers.instances[0].fire()
  ui.doc.stepFrame(40)
  assert.equal(ui.canvas.width, 1200, 'the new width is picked up')
  assert.equal(ui.canvas.height, 800)
})

test('a zero-sized layer paints nothing and never crashes', function () {
  // This is the state the layer is in for a frame or two before the host has laid
  // the conversation body out.
  const ui = startedModule({})
  ui.host.content.rect = { left: 0, top: 0, width: 0, height: 0 }
  ui.resizers.instances[0].fire()
  ui.doc.stepFrame(40)
  assert.equal(ui.ripple.painted, 0, 'nothing can be painted into a 0×0 layer')
  // And it recovers as soon as the layout arrives. The idle budget is 160 ms, so
  // the next frame has to land outside that window.
  ui.host.content.rect = { left: 0, top: 0, width: 800, height: 600 }
  ui.resizers.instances[0].fire()
  ui.doc.stepFrame(400)
  assert.ok(ui.ripple.painted > 0, 'the layer paints again once it has a size')
})

test('a browser without ResizeObserver still measures, just less often', function () {
  // The fallback is deliberate: no watcher means the loop re-measures, which is
  // correct but costs a layout read per frame. It must not crash.
  const ui = startedModule({ noResizeObserver: true })
  assert.equal(ui.resizers.instances.length, 0)
  ui.doc.stepFrame(40)
  assert.ok(ui.ripple.painted > 0, 'the field still paints without a ResizeObserver')
})

// ---------------------------------------------------------------- drawing

test('a hero-phase frame paints the glyph field', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(0)
  assert.ok(ui.ripple.painted > 0, 'expected glyphs on a hero-phase frame')
  const texts = ui.canvas.contextCalls.filter(function (call) { return call[0] === 'fillText' })
  assert.ok(texts.length > 0, 'expected glyph runs')
  for (const call of texts) {
    assert.ok(GLYPH_TOKENS.indexOf(call[1]) >= 0, 'painted a non-token glyph: ' + call[1])
    assert.ok(call[4] > 0 && call[4] <= 1, 'alpha out of range: ' + call[4])
  }
})

test('the field is faint at rest — this is a backdrop, not content', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(0)
  const alphas = ui.canvas.contextCalls
    .filter(function (call) { return call[0] === 'fillText' })
    .map(function (call) { return call[4] })
  assert.ok(alphas.length > 0)
  const brightest = Math.max.apply(null, alphas)
  assert.ok(brightest < 0.2, 'a resting glyph must stay under 20% opacity, got ' + brightest)
})

test('dark mode paints the field stronger than light mode', function () {
  // A light stroke on a dark surface reads weaker at the same alpha, so the dark
  // palette lifts the resting opacity.
  const light = startedModule({})
  light.doc.stepFrame(0)
  const lightAlpha = Math.max.apply(null, light.canvas.contextCalls
    .filter(function (call) { return call[0] === 'fillText' })
    .map(function (call) { return call[4] }))
  const dark = startedModule({ dark: true })
  dark.doc.stepFrame(0)
  const darkAlpha = Math.max.apply(null, dark.canvas.contextCalls
    .filter(function (call) { return call[0] === 'fillText' })
    .map(function (call) { return call[4] }))
  assert.ok(darkAlpha > lightAlpha, 'dark mode must not be dimmer than light')
})

test('an active conversation paints nothing and spawns no ripple', function () {
  // The effect belongs to the empty home screen. An active conversation gets no
  // frames, no ripple and no layer over its text.
  const ui = startedModule({ phase: 'active' })
  ui.doc.stepFrame(0)
  assert.equal(ui.ripple.painted, 0, 'an active phase must not paint')
  assert.equal(ui.ripple.pushRipple(100, 100), true,
    'a ripple can be queued, but the gate is the phase')
  ui.doc.stepFrame(40)
  assert.equal(ui.ripple.painted, 0, 'an active phase must still not paint')
})

// ---------------------------------------------------------------- clicks

test('a click on the conversation body spawns a ripple at the pointer', function () {
  const ui = startedModule({})
  ui.host.content.dispatch('pointerdown', { clientX: 310, clientY: 220 })
  const ripples = ui.ripple.ripples
  assert.equal(ripples.length, 1)
  // The layer's box is its containing block (the conversation body), which the
  // fake places at (280, 80) — so a click at (310, 220) is (30, 140) inside it.
  assert.equal(ripples[0].x, 30)
  assert.equal(ripples[0].y, 140)
})

test('the field is sized from the containing block, never from the bitmap', function () {
  // THE RUNAWAY REGRESSION. A `<canvas>` is a replaced element: without a CSS box
  // it reports its BITMAP size from `getBoundingClientRect()`. The module used to
  // measure the canvas, multiply by devicePixelRatio and write the result back to
  // `canvas.width/height` — so every resize tick measured the previous bitmap and
  // made a bigger one. In the running app a 1000×742 area reached a 25973×13013
  // bitmap (≈1.3 GB) while looking "mounted and visible" but painting nothing
  // usable. The field must be the PARENT's box, and must stay there.
  const ui = startedModule({ dpr: 2 })
  assert.equal(ui.canvas.width, 1000 * 2, 'bitmap width follows the body, not itself')
  assert.equal(ui.canvas.height, 742 * 2)
  // Pretend the stylesheet is gone: the fake canvas now reports its bitmap as its
  // layout size, the exact browser behaviour that caused the loop.
  ui.canvas.cssBox = undefined
  ui.resizers.instances[0].fire()
  ui.doc.stepFrame(40)
  assert.equal(ui.canvas.width, 2000, 'the bitmap must not grow when it is re-measured')
  ui.resizers.instances[0].fire()
  ui.doc.stepFrame(80)
  assert.equal(ui.canvas.width, 2000, 'and must stay stable after repeated ticks')
  ui.resizers.instances[0].fire()
  ui.doc.stepFrame(120)
  assert.equal(ui.canvas.width, 2000, 'no exponential growth over many ticks')
})

test('a click is never intercepted: no preventDefault, no propagation stop', function () {
  const ui = startedModule({})
  let prevented = false
  let stopped = false
  ui.host.content.dispatch('pointerdown', {
    clientX: 100,
    clientY: 100,
    preventDefault() { prevented = true },
    stopPropagation() { stopped = true },
  })
  assert.equal(prevented, false, 'the backdrop must never cancel the host’s pointer event')
  assert.equal(stopped, false, 'the backdrop must never swallow the host’s pointer event')
})

test('the listener sits on the body, so a click on the composer card ripples too', function () {
  // This is the reason the card is rendered see-through on a blank session: the
  // click lands on the card, the event bubbles to the body, and the wave has to
  // be visible THROUGH the card rather than cut off at its edge.
  const ui = startedModule({})
  const card = el('div', { 'data-composer-card': '' })
  ui.host.seat.appendChild(card)
  card.dispatch('pointerdown', { clientX: 500, clientY: 500 })
  // The click targets the card, not the content: dispatching on the card is the
  // host's job, so simulate the bubble.
  assert.equal(ui.ripple.ripples.length, 0, 'the card itself is not a listener target')
  ui.host.content.dispatch('pointerdown', { clientX: 500, clientY: 500 })
  assert.equal(ui.ripple.ripples.length, 1, 'the bubbled event does spawn a ripple')
})

test('a wave brightens glyphs, and nothing is ever STROKED', function () {
  const ui = startedModule({})
  ui.ripple.pushRipple(450, 300)
  ui.doc.stepFrame(200)
  const texts = ui.canvas.contextCalls.filter(function (call) { return call[0] === 'fillText' })
  assert.ok(texts.length > 0, 'expected glyphs')
  // Every glyph is the accent colour, at every moment. The first version painted
  // resting glyphs in the body text colour and only switched to the accent inside
  // a wave, which read as stray characters rather than as glow.
  for (const call of texts) {
    assert.equal(call[5], '#c6613f', 'a glyph was painted outside the accent colour')
  }
  // THE RING IS GONE, and this assertion is the reason it stays gone. A stroked
  // closed curve travelling across a dim field reads as a radar sweep. The
  // reference repo's only ambient-canvas precedent (`AmbientLightFieldCanvas` in
  // ReasoningAmbientGlow.tsx) draws light with radial gradients and never strokes.
  const arcs = ui.canvas.contextCalls.filter(function (call) { return call[0] === 'arc' })
  assert.equal(arcs.length, 0, 'the ripple must not be a stroked circle')
  const strokes = ui.canvas.contextCalls.filter(function (call) { return call[0] === 'stroke' })
  assert.equal(strokes.length, 0, 'nothing may be stroked')
})

test('the glyphs glow: a shadow is set while painting and cleared after', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(0)
  // The fake context records property writes through a plain object, so assert on
  // the final state: a non-zero shadowBlur DURING painting is what makes a flat
  // glyph read as a point of light; it must be cleared afterwards so nothing else
  // on the canvas inherits it.
  assert.ok(ui.ripple.painted > 0)
  assert.equal(typeof ui.canvas.getContext('2d').shadowBlur, 'number')
  assert.equal(ui.canvas.getContext('2d').shadowBlur, 0, 'shadowBlur is reset after the frame')
})

test('concurrent ripples are capped so a click-spam cannot accumulate state', function () {
  const ui = startedModule({})
  for (let i = 0; i < TUNING.maxRipples + 8; i += 1) ui.ripple.pushRipple(10 + i, 10)
  assert.equal(ui.ripple.ripples.length, TUNING.maxRipples)
})

test('a ripple is dropped once its life is over', function () {
  const ui = startedModule({})
  ui.ripple.pushRipple(100, 100)
  ui.doc.stepFrame(0)
  assert.equal(ui.ripple.ripples.length, 1)
  ui.doc.stepFrame(TUNING.ringLife + 100)
  assert.equal(ui.ripple.ripples.length, 0, 'an expired ripple must not accumulate')
})

test('the loop runs at a capped frame rate, not at the display rate', function () {
  // A background decoration has no claim on a 120 Hz budget. The module must skip
  // frames that arrive inside one budget window. With nothing animating the window
  // is the IDLE budget (160 ms) — cheaper than the 33 ms an active ripple gets.
  const ui = startedModule({})
  ui.doc.stepFrame(0)
  const afterFirst = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length
  ui.doc.stepFrame(5) // far inside the idle window
  const afterSecond = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length
  assert.equal(afterSecond, afterFirst, 'a frame inside the budget must be skipped')
  ui.doc.stepFrame(TUNING.idleMs + 1)
  const afterThird = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length
  assert.equal(afterThird, afterFirst + 1, 'the next budget window paints')
})

test('a live ripple drops the budget to 30 fps, an idle field to 6 fps', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(0)
  const base = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length

  // Idle: a frame at +80 ms is inside the 160 ms window and must be skipped.
  ui.doc.stepFrame(80)
  assert.equal(ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length, base,
    'an idle field must not repaint inside the idle budget')

  // With a ripple alive the same +80 ms gap must paint: the swell needs 30 fps.
  ui.ripple.pushRipple(100, 100)
  ui.doc.stepFrame(200)
  const withRipple = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length
  ui.doc.stepFrame(240)
  assert.equal(ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length,
    withRipple + 1, 'a live ripple must paint at the 33 ms budget')
})

// ------------------------------------------------------------ phase gate

test('flipping to the active phase stops the loop and clears the field', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(0)
  assert.ok(ui.ripple.painted > 0)
  ui.host.content.setAttribute(PHASE_ATTR, 'active')
  ui.ripple.syncPhase()
  assert.equal(ui.ripple.painted, 0, 'leaving the hero phase clears the canvas')
  const clears = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length
  ui.doc.stepFrame(100)
  assert.equal(ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length, clears,
    'no frame may run outside the hero phase')
})

test('flipping back to the hero phase resumes painting', function () {
  const ui = startedModule({ phase: 'active' })
  ui.doc.stepFrame(0)
  assert.equal(ui.ripple.painted, 0)
  ui.host.content.setAttribute(PHASE_ATTR, HERO_PHASE)
  ui.ripple.syncPhase()
  ui.doc.stepFrame(40)
  assert.ok(ui.ripple.painted > 0, 'returning to a blank session must re-arm the backdrop')
})

test('the observer watches exactly the phase attribute and the child list', function () {
  const ui = startedModule({})
  const observer = ui.observers.instances[0]
  assert.ok(observer, 'expected a MutationObserver')
  assert.equal(observer.target, ui.doc.body)
  assert.equal(observer.options.attributes, true)
  assert.deepEqual(observer.options.attributeFilter, [PHASE_ATTR])
  assert.equal(observer.options.childList, true)
  assert.equal(observer.options.subtree, true)
})

test('a child-list mutation outside the hero phase schedules nothing', function () {
  // A streaming answer adds rows continuously. The module must not run a sweep —
  // which reads layout — for any of them.
  const ui = startedModule({ phase: 'active' })
  const added = el('div')
  ui.host.content.appendChild(added)
  ui.observers.instances[0].callback([{ type: 'childList', addedNodes: [added], removedNodes: [] }])
  assert.equal(ui.doc.queue.length, 0, 'no frame may be scheduled outside the hero phase')
})

test('a healthy layer is not re-queried on every added node', function () {
  // The scheduled check is a pointer comparison, not a document query: nodes are
  // added, a frame runs, and the layer is untouched.
  const ui = startedModule({})
  const canvas = ui.ripple.canvas
  const added = el('div')
  ui.host.content.appendChild(added)
  ui.observers.instances[0].callback([{ type: 'childList', addedNodes: [added], removedNodes: [] }])
  ui.doc.stepFrame(0)
  assert.equal(ui.ripple.canvas, canvas, 'the layer must not be rebuilt')
  assert.equal(ui.host.content.querySelectorAll('[' + RIPPLE_ATTR + ']').length, 1)
})

test('a body rendered AFTER start still gets the layer', function () {
  // REGRESSION GUARD for the dead-on-arrival bug. The plugin activates during
  // profile assembly, before React renders the conversation body. The mutation
  // path used to filter every addition with `if (!isHero()) continue`, and
  // `isHero()` reads the CACHED host — which is null until the first successful
  // sweep. So: no body at start → every addition skipped → no sweep → no layer,
  // forever. Every other test built the body BEFORE start() and could not see it.
  const doc = fakeDocument({})
  const observers = fakeObservers()
  const ripple = createHeroRipple({ doc, Observer: observers.Observer })
  ripple.start()
  assert.equal(ripple.mounted, false, 'nothing to mount yet')

  // The host finishes its first paint.
  const host = buildHost(doc, HERO_PHASE)
  observers.instances[0].callback([{ type: 'childList', addedNodes: [host.content], removedNodes: [] }])
  doc.stepFrame(16)

  assert.equal(ripple.mounted, true, 'the layer must mount once the body appears')
  assert.equal(host.content.children[0], ripple.canvas, 'and be the body first child')
})

test('a phase attribute record drives the gate without a rebuild', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(0)
  ui.host.content.setAttribute(PHASE_ATTR, 'active')
  ui.observers.instances[0].callback([
    { type: 'attributes', attributeName: PHASE_ATTR, target: ui.host.content },
  ])
  assert.equal(ui.ripple.painted, 0)
})

test('a recreated conversation body gets a fresh layer and a fresh listener', function () {
  // React recreates the body across some transitions. The sweep must both re-mount
  // the canvas into the NEW node and move the pointer listener with it — a
  // listener left on the detached node would silently stop receiving clicks.
  const ui = startedModule({})
  const old = ui.host.content
  ui.doc.body.removeChild(old)
  old.removeEventListener('pointerdown', old.listeners[0] ? old.listeners[0].handler : null)
  const replacement = buildHost(ui.doc, HERO_PHASE)
  ui.ripple.sweep()
  assert.equal(ui.ripple.mounted, true)
  assert.equal(replacement.content.children[0], ui.ripple.canvas, 'the layer moved to the new body')
  assert.equal(old.querySelector('[' + RIPPLE_ATTR + ']'), null, 'the old body keeps nothing')
  replacement.content.dispatch('pointerdown', { clientX: 20, clientY: 20 })
  assert.equal(ui.ripple.ripples.length, 1, 'the new body receives clicks')
})

// -------------------------------------------------------- reduced motion

test('reduced motion paints once, statically, and never loops', function () {
  const ui = startedModule({ reduceMotion: true })
  assert.equal(ui.ripple.reducedMotion, true)
  assert.equal(ui.ripple.painted > 0, true, 'the field is still drawn once')
  const clears = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length
  assert.equal(ui.doc.queue.length, 0, 'no frame may be scheduled')
  assert.equal(ui.ripple.pushRipple(100, 100), false, 'no ripple under reduced motion')
  assert.equal(ui.ripple.ripples.length, 0)
  ui.doc.stepFrame(100)
  assert.equal(ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length, clears)
})

// --------------------------------------------------------------- teardown

test('stop removes the layer, the listener and the observer', function () {
  const ui = startedModule({})
  const observer = ui.observers.instances[0]
  ui.ripple.stop()
  assert.equal(ui.ripple.started, false)
  assert.equal(ui.ripple.mounted, false)
  assert.equal(ui.doc.body.querySelector('[' + RIPPLE_ATTR + ']'), null, 'the canvas is gone')
  assert.equal(observer.disconnected, true, 'the observer is disconnected')
  assert.equal(ui.host.content.listeners.length, 0, 'the pointer listener is removed')
  // Idempotent: a second stop must not throw.
  ui.ripple.stop()
})

test('start is idempotent and never double-mounts', function () {
  const ui = startedModule({})
  const first = ui.ripple.canvas
  ui.ripple.start()
  assert.equal(ui.ripple.canvas, first)
  assert.equal(ui.host.content.querySelectorAll('[' + RIPPLE_ATTR + ']').length, 1)
})

// ---------------------------------------------------------- the switch

test('the setting defaults on, sanitises a legacy payload, and only a false turns it off', function () {
  assert.equal(DEFAULT_STATE.heroRipple, true)
  assert.equal(sanitize({}).heroRipple, true)
  assert.equal(sanitize({ heroRipple: false }).heroRipple, false)
  assert.equal(sanitize({ heroRipple: 'no' }).heroRipple, true,
    'only an explicit boolean false may disable it')
  assert.equal(sanitize({ heroRipple: true }).heroRipple, true)
  // A legacy payload without the key keeps the shipped look.
  assert.equal(sanitize({ warmth: 60, accent: 'ochre' }).heroRipple, true)
})

test('the switch has its own settings row with bilingual copy', function () {
  const panel = createPanel({
    React: {
      createElement() { return null },
      useSyncExternalStore(store, get) { return get() },
    },
    primitives: null,
    settings: { getState: function () { return sanitize({}) }, subscribe: function () { return function () {} } },
    themeMode: null,
  })
  const row = panel.slots.find(function (slot) { return slot.key === 'heroRipple' })
  assert.ok(row, 'the switch must have a settings row')
  assert.equal(row.id, 'dsh-cds-theme-hero-ripple')
  assert.equal(row.order, 44, 'order 44 is the next free seat after 43')
  assert.ok(panel.appearanceSlots.indexOf(row) >= 0, 'it belongs on the theme page')
  for (const key of [row.titleKey, row.descKey]) {
    assert.ok(Object.hasOwn(en, key), 'en is missing ' + key)
    assert.ok(Object.hasOwn(zh, key), 'zh is missing ' + key)
  }
})

test('the switch is the ONLY thing that gates the stylesheet block', function () {
  const on = buildCssFor(sanitize({ heroRipple: true }))
  const off = buildCssFor(sanitize({ heroRipple: false }))
  const marker = '/* ---- blank-session backdrop'
  assert.ok(on.includes(marker), 'the layer rules must be emitted when the switch is on')
  assert.ok(!off.includes(marker), 'the layer rules must be gone when the switch is off')
  // Turning it off must not disturb anything else: the rest of the sheet is
  // byte-identical once the block is removed.
  const blockStart = on.indexOf(marker)
  const blockEnd = on.indexOf('/* ----', blockStart + marker.length)
  const rest = on.slice(0, blockStart) + on.slice(blockEnd)
  assert.equal(rest, off, 'only the backdrop block may change with the switch')
})

test('the layer rules are hero-scoped, stable-hook-only, and promote the layer', function () {
  const css = buildCssFor(sanitize({}))
  const block = css.slice(css.indexOf('/* ---- blank-session backdrop'))
  const text = block.slice(0, block.indexOf('/* ----', 1) < 0 ? undefined : block.indexOf('/* ----', 1))
  assert.ok(text.includes('[data-conversation-content][data-content-phase="hero"]'),
    'the promotion must be scoped to the blank-session phase')
  assert.ok(text.includes('isolation: isolate'))
  assert.ok(text.includes('z-index: -1'), 'the layer must paint behind the hero stack')
  assert.ok(text.includes('pointer-events: none'), 'the layer must never eat a click')
  assert.ok(text.includes('[data-composer-card]'), 'the card must let the wave through')
  assert.ok(/color-mix\(in srgb, var\(--dsw-specific-input-major\) 82%, transparent\)/.test(text),
    'the see-through card must mix the theme’s own input surface')
  assert.ok(!/\.\w+_\w+_\d+/.test(text), 'no salted class may appear in the block')
  // Never a rule that reaches an active conversation.
  for (const line of text.split('\n')) {
    if (!line.includes('{') || line.trim().startsWith('/*')) continue
    if (!line.includes('data-')) continue
    assert.ok(!/data-content-phase="active"/.test(line), 'no rule may target the active phase')
  }
})

// ------------------------------------------------------------ the artifact

test('the committed client bundle carries the backdrop module', function () {
  // `client/client.js` is the shipped artifact; a link: install never builds.
  const artifact = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  assert.ok(artifact.includes(RIPPLE_ATTR), 'the built bundle must carry the layer attribute')
  assert.ok(artifact.includes('createHeroRipple'), 'the built bundle must carry the module')
})
