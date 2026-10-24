/**
 * The blank-session backdrop: the vendored ocean's click-lure physics, the
 * structural mount, the phase gate, the pointer listeners, reduced motion, and
 * cleanup.
 *
 * The fake DOM mirrors the shape this module is written against — the
 * conversation body from `docs/host-hooks.md:83-87`:
 *
 *   div[data-conversation-content][data-content-phase="hero"]   ← layer mounts here
 *   └ div[data-conversation-scroll]
 *      └ div[data-composer-seat] > (greeting + composer card)
 *
 * The fake 2D context records calls instead of rasterising. That is enough to
 * assert that a frame paints and that the main canvas is never stroked, without
 * pretending to be a canvas implementation.
 *
 * The lure tests drive the real `World` from `client/src/sharks/world.js`:
 * "the click is a bearing, not a destination" is a physics assertion, not a
 * screenshot.
 *
 *   node test/ocean.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  OCEAN_ATTR, CONTENT_ANCHOR, SCROLL_ANCHOR, PHASE_ATTR, HERO_PHASE,
  SHARK_SPECS, TUNING, FALLBACK_PALETTE,
  parseInk, readPalette, findHeroHost, createHeroOcean,
} from '../client/src/ocean.js'
import { World } from '../client/src/sharks/world.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize, DEFAULT_STATE, WHALE_INKS } from '../client/src/constants.js'
import { HUE_PERIOD_S, WHALE_BASE, whaleInkColor, whaleCss } from '../client/src/whaleInk.js'
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
        textAlign: '', textBaseline: '',
        shadowBlur: 0, shadowColor: '',
        save: record('save'),
        restore: record('restore'),
        translate: record('translate'),
        rotate: record('rotate'),
        clearRect: record('clearRect'),
        fillRect: record('fillRect'),
        fillText: function (text, x, y) {
          owner.contextCalls.push(['fillText', text, x, y, this.globalAlpha, this.fillStyle])
        },
        drawImage: record('drawImage'),
        beginPath: record('beginPath'),
        moveTo: record('moveTo'),
        lineTo: record('lineTo'),
        stroke: record('stroke'),
        fill: record('fill'),
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
    // The real API removes the pending callback, and so does this one: a module
    // that cancels its frame must leave the queue empty, or "no frame after stop"
    // would be testing the fake instead of the code.
    cancelAnimationFrame(id) {
      cancelled.add(id)
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (queue[i].id === id) queue.splice(i, 1)
      }
    },
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)')
      return { matches: opts.reduceMotion === true }
    },
    performance: { now: function () { return opts.clock || 0 } },
    getComputedStyle() {
      return {
        fontFamily: 'monospace',
        getPropertyValue(name) {
          if (name === '--dsw-alias-brand-primary') return opts.accent || '#c6613f'
          if (name === '--dsw-alias-label-primary') return opts.text || '#1f1e1d'
          if (name === '--dsw-alias-bg-base') return opts.bg || '#f7f4ee'
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

/** Build a started module on a hero-phase host, with a 1000×742 body. */
function startedModule(overrides) {
  const opts = overrides || {}
  const doc = fakeDocument(opts)
  const host = buildHost(doc, opts.phase)
  const observers = fakeObservers()
  const resizers = fakeResizeObservers()
  const ocean = createHeroOcean({
    doc,
    Observer: observers.Observer,
    ResizeObserver: opts.noResizeObserver ? null : resizers.ResizeObserver,
    now: function () { return opts.clock || 0 },
    // Passed through only when the test names it: `undefined` must mean "the
    // module's own default", which is what the blue-default test relies on.
    whaleInk: opts.whaleInk,
  })
  ocean.start()
  const canvas = ocean.canvas
  return { doc, host, ocean, canvas, observers, resizers }
}

const STEP = 1 / 60
/**
 * Slack for comparing a measured clearance against its requirement, in px.
 *
 * The spine lives in `Float32Array`s, so a coordinate near 1000 has a quantum of
 * about 6e-5px; a 19x19 segment-pair minimum accumulates that across both bodies
 * into a deficit of about 1e-5px. Measured worst case on the shipped motion:
 * 20.95099 against a need of 20.95100. This is quantisation, not overlap — the
 * world resolves to `CLEARANCE_FLOOR` of the lengths added and is allowed to rest
 * ON that floor, so a strict `>=` on the same number fails by the float's width.
 * Anything that genuinely closes in produces a deficit orders of magnitude larger
 * and still fails.
 */
const FLOAT_SLACK = 1e-4
function run(world, seconds) {
  const steps = Math.round(seconds / STEP)
  for (let i = 0; i < steps; i += 1) world.step(STEP)
  return world
}

/** A world with one shark, no fish, and its head placed by hand. */
function sharkAt(x, y, heading) {
  const world = new World([{ kind: 'classic', size: 1 }], 0)
  world.resize(1200, 800, 12, 18)
  const shark = world.sharks[0]
  const seg = shark.length / 19
  shark.heading = heading
  shark.speed = 30
  for (let i = 0; i < 20; i += 1) {
    shark.nodes[i * 2] = x - Math.cos(heading) * seg * i
    shark.nodes[i * 2 + 1] = y - Math.sin(heading) * seg * i
  }
  return { world, shark }
}

// --------------------------------------------------------------- the colours

test('theme colours are parsed from the two forms computed style returns', function () {
  assert.deepEqual(parseInk('#c6613f'), { r: 198, g: 97, b: 63 })
  assert.deepEqual(parseInk('#fff'), { r: 255, g: 255, b: 255 })
  assert.deepEqual(parseInk('rgb(31, 30, 29)'), { r: 31, g: 30, b: 29 })
  assert.deepEqual(parseInk('rgba(1, 2, 3, 0.5)'), { r: 1, g: 2, b: 3 })
  assert.deepEqual(parseInk('not-a-colour', { r: 9, g: 8, b: 7 }), { r: 9, g: 8, b: 7 })
  assert.deepEqual(parseInk(null), { r: 34, g: 34, b: 34 })
})

test('the palette comes from the live theme tokens', function () {
  const doc = fakeDocument({ accent: '#ab12cd', text: '#112233', bg: '#445566' })
  const palette = readPalette(doc, doc.body)
  assert.equal(palette.accent, '#ab12cd')
  assert.equal(palette.text, '#112233')
  assert.equal(palette.bg, '#445566')
  assert.equal(palette.dark, false)
  assert.equal(readPalette(null).accent, FALLBACK_PALETTE.accent)
  assert.equal(readPalette(undefined).accent, FALLBACK_PALETTE.accent)
})

test('dark mode is detected from the host body attribute', function () {
  const doc = fakeDocument({ dark: true })
  const palette = readPalette(doc, doc.body)
  assert.equal(palette.dark, true)
  assert.ok(palette.text.length > 0)
})

// ------------------------------------------------------------- the lure

function seededTest(name, fn) {
  test(name, function () {
    const random = Math.random;
    let state = 12415;
    Math.random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    try { fn() } finally { Math.random = random }
  })
}

test('a click records the point and a splash, and nothing else', function () {
  const { world } = sharkAt(300, 400, 0)
  const click = world.lure(500, 300)
  assert.equal(click.x, 500)
  assert.equal(click.y, 300)
  // NO BEARING. A click used to carry a frozen `dx`/`dy` that steered every
  // whale for 2.5 s. That field is gone; the record is a position and a time.
  assert.equal(click.dx, undefined, 'a click must not carry a steering bearing')
  assert.equal(click.dy, undefined)
  assert.ok(world.events.some(function (e) {
    return e.kind === 'splash' && e.x === 500 && e.y === 300
  }), 'the blue pulse is what a click produces')
})

seededTest('a click does not change any whale heading, speed or position', function () {
  // THE REGRESSION THAT MATTERS: the user asked for the pointer-following
  // behaviour to be removed. Two identical worlds, one of which is clicked every
  // frame, must stay bit-for-bit identical — if a click still touches steering,
  // speed or the body, they diverge within a few frames.
  const a = new World(SHARK_SPECS, 0)
  a.resize(1000, 742, 12, 18)
  const b = Object.assign(new World([], 0), structuredClone(a))
  Math.random = function () { return 0.5 }
  for (let frame = 0; frame < 180; frame += 1) {
    b.lure(500 + (frame % 7) * 40, 300 + (frame % 5) * 30)
    a.step(STEP)
    b.step(STEP)
    a.sharks.forEach(function (sh, index) {
      assert.equal(b.sharks[index].heading, sh.heading,
        'a click must not tilt heading (frame ' + frame + ')')
      assert.equal(b.sharks[index].speed, sh.speed,
        'a click must not change speed (frame ' + frame + ')')
      assert.deepEqual(b.sharks[index].nodes, sh.nodes,
        'a click must not move a whale (frame ' + frame + ')')
    })
  }
})

seededTest('clicking the same corner repeatedly cannot drag the school there', function () {
  // The old lure pulled a common bearing toward the click, so a corner clicked
  // every second produced a visibly different tank from an unclicked one. With
  // clicks inert, the ONLY difference may be fish alarm — whale paths must stay
  // in the same family, not migrate to the corner.
  const plain = new World(SHARK_SPECS, 0)
  plain.resize(1000, 742, 12, 18)
  const clicked = Object.assign(new World([], 0), structuredClone(plain))
  Math.random = function () { return 0.5 }
  for (let frame = 0; frame < 600; frame += 1) {
    if (frame % 60 === 0) clicked.lure(0, 0)
    plain.step(STEP)
    clicked.step(STEP)
  }
  plain.sharks.forEach(function (sh, index) {
    const other = clicked.sharks[index]
    assert.deepEqual(other.nodes, sh.nodes,
      sh.kind + ' must swim the same route whether or not the corner was clicked')
    const cx = sh.nodes[0] + (sh.nodes[38] - sh.nodes[0]) / 2
    assert.ok(cx > 5, 'a clicked corner must not lure the school into it')
  })
})

test('the click record expires so a burst cannot accumulate state', function () {
  const { world } = sharkAt(300, 400, 0)
  world.lure(800, 400)
  assert.equal(world.lures.length, 1)
  run(world, 9)
  assert.equal(world.lures.length, 0, 'an old click record must be dropped')
})

test('clicks are capped so click-spam cannot accumulate state', function () {
  const { world } = sharkAt(300, 400, 0)
  for (let i = 0; i < 10; i += 1) world.lure(100 + i * 10, 100 + i * 10)
  assert.equal(world.lures.length, 4)
})

// --------------------------------------------------- the swimming lanes


/**
 * The closest distance between two sharks' spines, in px.
 *
 * SEGMENT TO SEGMENT, not node to node. Two bodies crossing at a shallow angle
 * meet in the INTERIOR of both centre lines, where the nearest NODE can be half a
 * segment away — the first version of this test measured 88px (no overlap) for a
 * pair whose spines actually crossed at 2.8px.
 *
 * In 2D the distance between two segments is 0 when they intersect and otherwise
 * the smallest of the four endpoint-to-segment distances, so this needs no
 * iteration. It is deliberately a DIFFERENT derivation from the world's own
 * `closestOnSegments` (Ericson's clamped-parameter form): a test that repeats the
 * implementation's arithmetic would agree with it even when both are wrong.
 */
function pointToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  const u = len2 > 1e-9 ? Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0
  return Math.hypot(px - (ax + vx * u), py - (ay + vy * u))
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const side = function (px, py, qx, qy, rx, ry) {
    return (qx - px) * (ry - py) - (qy - py) * (rx - px)
  }
  const d1 = side(ax, ay, bx, by, cx, cy)
  const d2 = side(ax, ay, bx, by, dx, dy)
  const d3 = side(cx, cy, dx, dy, ax, ay)
  const d4 = side(cx, cy, dx, dy, bx, by)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

function spineGap(a, b) {
  let best = Infinity
  for (let i = 0; i < 19; i += 1) {
    const ax = a.nodes[i * 2]
    const ay = a.nodes[i * 2 + 1]
    const bx = a.nodes[(i + 1) * 2]
    const by = a.nodes[(i + 1) * 2 + 1]
    for (let j = 0; j < 19; j += 1) {
      const cx = b.nodes[j * 2]
      const cy = b.nodes[j * 2 + 1]
      const dx = b.nodes[(j + 1) * 2]
      const dy = b.nodes[(j + 1) * 2 + 1]
      if (segmentsCross(ax, ay, bx, by, cx, cy, dx, dy)) return 0
      const d = Math.min(
        pointToSegment(ax, ay, cx, cy, dx, dy),
        pointToSegment(bx, by, cx, cy, dx, dy),
        pointToSegment(cx, cy, ax, ay, bx, by),
        pointToSegment(dx, dy, ax, ay, bx, by))
      if (d < best) best = d
    }
  }
  return best
}


//
// WHAT IS GUARDED HERE, AND WHY IT IS NOT THE OLD SOLVER'S ASSERTIONS.
//
// Each whale swims a closed, homothetic elliptical lane of its own: the head is
// a point moving at arc length `u`, and the twenty body nodes are the same lane
// a fixed arc distance behind it. Containment, spacing and forward progress are
// therefore properties of the GEOMETRY, not of a per-frame search — so the tests
// below check the geometry (lane separation measured by sampling the curves),
// the derived body (links, node movement, tail-on-route) and long-run liveness.
//
// The previous suite proved `commitMotion` never accepted an illegal pose. That
// solver is gone, and its head-on / intersecting / near-corner fixtures hand-
// placed spines that the new model never produces: running them would either be
// impossible (the world re-seats any node on the lane) or fake-green (an
// assertion about a solver that no longer exists). They are replaced — not
// deleted — by tests of the property the user asked for: bodies never meet,
// never leave the window, and never stop.

/**
 * The closest distance between two lane curves, in px, by direct sampling.
 *
 * DELIBERATELY INDEPENDENT of the planner. It walks both ellipses on a fine
 * parameter grid and takes the minimum pairwise distance, so it agrees with the
 * implementation's claim only if the curves really are that far apart. (The
 * homothetic construction gives a closed form — `(s_out - s_in) * min(a, b)` —
 * but a test that recomputed that formula would pass on a planner that shrank
 * both radii independently, which is exactly the bug this boundary exists to
 * catch.)
 */
function laneGapPx(outer, inner, samples) {
  const n = samples || 720;
  let best = Infinity;
  for (let i = 0; i < n; i += 1) {
    const t = i / n * Math.PI * 2
    const x = outer.a * Math.cos(t)
    const y = outer.b * Math.sin(t)
    for (let j = 0; j < n; j += 1) {
      const u = j / n * Math.PI * 2
      const d = Math.hypot(x - inner.a * Math.cos(u), y - inner.b * Math.sin(u))
      if (d < best) best = d
    }
  }
  return best
}

/** Largest residual of `|link - segment|` over the spine, in px. */
function worstLinkError(sh) {
  let worst = 0
  for (let k = 1; k < 20; k += 1) {
    const link = Math.hypot(sh.nodes[k * 2] - sh.nodes[(k - 1) * 2],
      sh.nodes[k * 2 + 1] - sh.nodes[(k - 1) * 2 + 1])
    const error = Math.abs(link - sh.segment)
    if (error > worst) worst = error
  }
  return worst
}

/**
 * The motion invariants of a lane-swum whale, checked between two frames.
 *
 * 1. THE HEAD ADVANCES ALONG ITS OWN POINTING DIRECTION, never backwards. The
 *    heading is the nose chord (head to second node) in this model, so the
 *    projection is the real forward progress, not a proxy.
 * 2. THE SPINE IS SAMPLED, NOT SOLVED: consecutive nodes keep the same ARC
 *    spacing, so their CHORD differs from `segment` only by the sagitta of the
 *    lane's curvature. The tolerance is derived, not tuned: a chord of length
 *    `seg` across curvature `kappa` is shorter by `kappa^2 seg^3 / 24`, which on
 *    the tightest lane here (a 1600x400 field, `b ~ 90`) measures under 0.01px.
 * 3. NO NODE JUMPS: every node moves within one frame of swimming. A rigid
 *    translation, a teleport or a re-seat fails this immediately.
 */
function assertLaneMotion(sh, before, dt) {
  const step = (sh.speed || 30) * dt
  const headDx = sh.nodes[0] - before[0]
  const headDy = sh.nodes[1] - before[1]
  const headAlong = headDx * Math.cos(sh.heading) + headDy * Math.sin(sh.heading)
  assert.ok(headAlong >= -1e-6,
    'the head moved backwards: ' + headAlong.toFixed(4) + 'px against its heading')
  // The allowance is `speed x dt` read AFTER the step, so it carries a few parts
  // in 10,000 of the smooth speed wobble (0.08 amplitude at 0.23 rad/s moves the
  // speed by <0.1% per 1/60 s frame). The bound still rejects a real overspeed:
  // anything that travels at the wrong rate is off by whole percent.
  assert.ok(headAlong <= step * 1.02 + 1e-9,
    'the head outran its own speed: ' + headAlong.toFixed(4) + 'px in a frame allowing ' + step.toFixed(4))
  const linkError = worstLinkError(sh)
  assert.ok(linkError <= sh.segment * 0.004 + 0.02,
    'a spine link changed length by ' + linkError.toFixed(4) + 'px (segment ' + sh.segment.toFixed(3) + ')')
  for (let k = 0; k < 20; k += 1) {
    const move = Math.hypot(sh.nodes[k * 2] - before[k * 2], sh.nodes[k * 2 + 1] - before[k * 2 + 1])
    assert.ok(move <= sh.speed * 1.8 * dt + 0.002,
      'node ' + k + ' moved ' + move.toFixed(3) + 'px in one frame allowing '
      + (sh.speed * 1.8 * dt).toFixed(3) + '; the body is being repositioned, not followed')
  }
  const nose = Math.atan2(sh.nodes[1] - sh.nodes[3], sh.nodes[0] - sh.nodes[2])
  assert.ok(Math.abs(Math.atan2(Math.sin(sh.heading - nose), Math.cos(sh.heading - nose))) < 1e-6,
    'the heading must be the direction the rendered nose points')
}

/** A lanes-only world: no fish, so a run measures whales alone. */
function laneWorld(width, height, specs) {
  const world = new World(specs || SHARK_SPECS, 0)
  world.resize(width, height, 12, 18)
  return world
}

const VIEWPORTS = [[1000, 742], [703, 757], [520, 640], [320, 240], [1600, 400]]

seededTest('each whale swims its own lane, fully inside the window, at every viewport', function () {
  // THE WHOLE-BODY CONTAINMENT CLAIM. In the old model only the HEAD was
  // guaranteed inside; the tail could trail over an edge while the animal was
  // "mostly in view". A lane is inside the window by construction, and the body
  // is on the lane, so every one of the twenty nodes must stay in bounds — for
  // 60 simulated seconds, every frame.
  for (const [width, height] of VIEWPORTS) {
    const world = laneWorld(width, height)
    let previous = world.sharks.map(function (sh) { return sh.nodes.slice() })
    for (let frame = 0; frame < 60 * 60; frame += 1) {
      world.step(STEP)
      world.sharks.forEach(function (sh, index) {
        assertLaneMotion(sh, previous[index], STEP)
        for (let k = 0; k < 20; k += 1) {
          const x = sh.nodes[k * 2]
          const y = sh.nodes[k * 2 + 1]
          assert.ok(x >= 0 && x <= width && y >= 0 && y <= height,
            sh.kind + ' left the window at ' + width + 'x' + height + ': node ' + k
            + ' at ' + x.toFixed(1) + ',' + y.toFixed(1) + ' (frame ' + frame + ')')
        }
      })
      previous = world.sharks.map(function (sh) { return sh.nodes.slice() })
    }
  }
})

seededTest('the body is the route the head just swam, node by node', function () {
  // THE REPLACEMENT FOR "THE BODY FOLLOWS THE NOSE". A rigid rotation or a
  // sideways re-seat can still put the nodes inside the window and within one
  // frame's travel, so position bounds alone would not catch it. This records
  // where the HEAD actually was over a lap and requires every body node to lie
  // ON that recorded route: a tail that cut a corner (as a rigid body would)
  // would sit off the head's own history by far more than a frame of travel.
  const world = laneWorld(1000, 742)
  const route = world.sharks.map(function () { return [] })
  for (let frame = 0; frame < 40 * 60; frame += 1) {
    world.step(STEP)
    world.sharks.forEach(function (sh, index) { route[index].push([sh.nodes[0], sh.nodes[1]]) })
  }
  const allowed = Math.max.apply(null, world.sharks.map(function (sh) { return sh.speed })) * STEP * 1.5 + 0.25
  world.sharks.forEach(function (sh, index) {
    const points = route[index]
    for (let k = 0; k < 20; k += 1) {
      let best = Infinity
      for (let i = 0; i < points.length; i += 1) {
        const d = Math.hypot(sh.nodes[k * 2] - points[i][0], sh.nodes[k * 2 + 1] - points[i][1])
        if (d < best) best = d
      }
      assert.ok(best <= allowed,
        sh.kind + ' node ' + k + ' is ' + best.toFixed(2) + 'px off the route the head swam'
        + ' (allowed ' + allowed.toFixed(2) + '): the body is not following the head')
    }
  })
})

seededTest('the head keeps making way: no ten seconds of a lap is idle', function () {
  // "KEEPS SWIMMING" IN THE USER'S TERMS: over any ten seconds, every head must
  // cover a visible distance. In this model the distance is arc length at
  // cruise speed (`~30 L/s`), so the check is honest per whale and per window.
  const world = laneWorld(1000, 742)
  const travelled = world.sharks.map(function () { return 0 })
  const marks = world.sharks.map(function (sh) { return [sh.nodes[0], sh.nodes[1]] })
  for (let frame = 1; frame <= 10 * 60; frame += 1) {
    world.step(STEP)
    world.sharks.forEach(function (sh, index) {
      travelled[index] += Math.hypot(sh.nodes[0] - marks[index][0], sh.nodes[1] - marks[index][1])
      marks[index] = [sh.nodes[0], sh.nodes[1]]
    })
  }
  travelled.forEach(function (distance, index) {
    assert.ok(distance > 20,
      world.sharks[index].kind + ' covered only ' + distance.toFixed(1) + 'px in ten seconds')
  })
})

seededTest('the real tank — three whales and 110 fish — swims for ten minutes', function () {
  // The shipped configuration, for 600s: this is the run that used to freeze.
  // Every ten seconds each head must have covered more than 20px, every node
  // must be in the window, and no frame may move a node beyond its speed.
  const world = new World(SHARK_SPECS, 110)
  world.resize(1000, 742, 12, 18)
  const marks = world.sharks.map(function (sh) { return [sh.nodes[0], sh.nodes[1]] })
  let previous = world.sharks.map(function (sh) { return sh.nodes.slice() })
  for (let frame = 1; frame <= 600 * 60; frame += 1) {
    world.step(STEP)
    world.sharks.forEach(function (sh, index) {
      for (let k = 0; k < 20; k += 1) {
        const x = sh.nodes[k * 2]
        const y = sh.nodes[k * 2 + 1]
        assert.ok(x >= 0 && x <= 1000 && y >= 0 && y <= 742,
          sh.kind + ' left the window after ' + (frame / 60).toFixed(0) + 's (node ' + k + ')')
        assert.ok(Math.hypot(x - previous[index][k * 2], y - previous[index][k * 2 + 1])
          <= sh.speed * 1.8 * STEP + 0.002, 'a node jumped in one frame at ' + (frame / 60).toFixed(0) + 's')
      }
      if (frame % (10 * 60) === 0) {
        const distance = Math.hypot(sh.nodes[0] - marks[index][0], sh.nodes[1] - marks[index][1])
        assert.ok(distance > 20,
          sh.kind + ' moved only ' + distance.toFixed(1) + 'px in 10s around '
          + (frame / 60).toFixed(0) + 's of a 600s run')
        marks[index] = [sh.nodes[0], sh.nodes[1]]
      }
    })
    previous = world.sharks.map(function (sh) { return sh.nodes.slice() })
  }
})

seededTest('nested lanes keep whole spines apart, and clicks do not change that', function () {
  // THE NO-OVERLAP CONTRACT, measured on the DRAWN spines (full segment-to-
  // segment distance) rather than on the lane curves, because the chords cut
  // very slightly inside the lane. The click is a splash only; this drives
  // clicks along the midline where the old model used to converge the pair, and
  // requires the clearance ratio `0.124` the user specified at every frame.
  const specs = [{ kind: 'classic', size: 1 }, { kind: 'classic', size: 1 }]
  const world = laneWorld(1200, 800, specs)
  const [a, b] = world.sharks
  const need = (a.length + b.length) * 0.124
  let worst = Infinity
  for (let frame = 0; frame < 60 * 60; frame += 1) {
    world.step(STEP)
    if (frame % 600 === 300) world.lure(600, 400)
    const gap = spineGap(a, b)
    if (gap < worst) worst = gap
  }
  assert.ok(worst >= need,
    'the spines came within ' + worst.toFixed(2) + 'px, below the ' + need.toFixed(2)
    + 'px clearance (0.124 of the lengths added)')
})

seededTest('lane spacing has a geometric floor at every viewport, not just the seeded one', function () {
  // THE GEOMETRY ITSELF, independent of a run: for every adjacent pair of lanes
  // in every viewport (including the extreme 1600x400 and the sidebar-sized
  // 320x240), the sampled curve-to-curve distance must exceed the clearance the
  // two bodies need. This is the property the old near-corner and collision-
  // course fixtures tried to prove dynamically; it holds by construction now,
  // and it is checked here on the curves so a planner change that merely
  // preserves today's seed cannot pass.
  for (const [width, height] of VIEWPORTS) {
    const world = laneWorld(width, height)
    const lanes = world.sharks.map(function (sh) { return sh.lane })
    // Whales are sorted by length ascending and the shortest takes the
    // innermost lane, so `sharks[i]` and `sharks[i + 1]` are neighbours.
    for (let i = 0; i + 1 < lanes.length; i += 1) {
      const outer = lanes[i + 1]
      const inner = lanes[i]
      const gap = laneGapPx(outer, inner, 720)
      const need = (world.sharks[i].length + world.sharks[i + 1].length) * 0.124
      assert.ok(gap >= need,
        'at ' + width + 'x' + height + ' the lanes of ' + world.sharks[i].kind + ' and '
        + world.sharks[i + 1].kind + ' are only ' + gap.toFixed(1) + 'px apart (need ' + need.toFixed(1) + ')')
      assert.ok(gap >= need * 1.2,
        'the lanes at ' + width + 'x' + height + ' have no margin over the clearance: '
        + gap.toFixed(1) + 'px against ' + need.toFixed(1) + 'px')
    }
  }
})

seededTest('clicking a corner cannot drag a whale there, and cannot stop it either', function () {
  // A click is a splash. Two things must remain true through corner spam: the
  // route is identical to an unclicked tank (so clicks cannot steer), and the
  // animals keep swimming (so the deck cannot stall the loop).
  const plain = laneWorld(1000, 742)
  const clicked = Object.assign(new World([], 0), structuredClone(plain))
  const travelled = clicked.sharks.map(function () { return 0 })
  const marks = clicked.sharks.map(function (sh) { return [sh.nodes[0], sh.nodes[1]] })
  for (let frame = 0; frame < 30 * 60; frame += 1) {
    if (frame % 60 === 0) clicked.lure(0, 0)
    plain.step(STEP)
    clicked.step(STEP)
    clicked.sharks.forEach(function (sh, index) {
      travelled[index] += Math.hypot(sh.nodes[0] - marks[index][0], sh.nodes[1] - marks[index][1])
      marks[index] = [sh.nodes[0], sh.nodes[1]]
    })
  }
  plain.sharks.forEach(function (sh, index) {
    assert.deepEqual(clicked.sharks[index].nodes, sh.nodes,
      sh.kind + ' must swim the same route whether or not the corner was clicked')
    assert.ok(travelled[index] > 200, sh.kind + ' stopped after corner spam')
  })
})

seededTest('a hand-placed spine is re-seated on its lane, never trusted as a pose', function () {
  // THE OLD SUITE'S FIXTURES PLACED NODES BY HAND (head-on pairs, intersecting
  // pairs, near-corner starts). Those poses are not reachable in this model: the
  // body is derived from the lane every frame, so any mutation is discarded on
  // the next step rather than argued with by a solver. This states that
  // explicitly, so a future change that starts believing hand-set nodes fails
  // here instead of silently reintroducing a second source of truth.
  const world = laneWorld(1200, 800)
  const sh = world.sharks[0]
  const lane = sh.lane
  for (let k = 0; k < 20; k += 1) {
    sh.nodes[k * 2] = -500
    sh.nodes[k * 2 + 1] = -500
  }
  world.step(STEP)
  assert.ok(worstLinkError(sh) <= sh.segment * 0.004 + 0.02,
    'the body must be rebuilt from the lane, with its arc spacing')
  for (let k = 0; k < 20; k += 1) {
    const x = sh.nodes[k * 2]
    const y = sh.nodes[k * 2 + 1]
    assert.ok(x >= 0 && x <= 1200 && y >= 0 && y <= 800, 'a rebuilt node must be inside the window')
    const onLane = ((x - lane.cx) / lane.a) ** 2 + ((y - lane.cy) / lane.b) ** 2
    assert.ok(Math.abs(onLane - 1) < 1e-3, 'a rebuilt node must sit on the lane (saw ' + onLane.toFixed(6) + ')')
  }
})

for (const [width, height] of [[1000, 742], [320, 240]]) {
  seededTest('corner spam keeps three whole spines inside and apart at ' + width + 'x' + height, function () {
    const world = new World(SHARK_SPECS, 20)
    world.resize(width, height, 12, 18)
    const corners = [[0, 0], [width, 0], [width, height], [0, height]]
    let previous = world.sharks.map(function (sh) { return sh.nodes.slice() })
    for (let frame = 0; frame < 30 * 60; frame += 1) {
      if (frame % 10 === 0) world.lure(corners[(frame / 10 | 0) % 4][0], corners[(frame / 10 | 0) % 4][1])
      // A long frame arrives now and then (a hidden tab, a slow paint): motion
      // stays bounded by `speed x dt` whatever the dt.
      const dt = frame % 100 === 0 ? 0.1 : STEP
      world.step(dt)
      world.sharks.forEach(function (sh, index) {
        assertLaneMotion(sh, previous[index], dt)
        for (let k = 0; k < 20; k += 1) {
          const x = sh.nodes[k * 2]
          const y = sh.nodes[k * 2 + 1]
          assert.ok(x >= 0 && x <= width && y >= 0 && y <= height,
            'whole spine must remain visible, frame ' + frame + ' node ' + k)
        }
        for (let j = index + 1; j < world.sharks.length; j += 1) {
          const other = world.sharks[j]
          const gap = spineGap(sh, other)
          const need = (sh.length + other.length) * 0.124
          assert.ok(gap >= need - FLOAT_SLACK,
            'corner spam reduced clearance at frame ' + frame + ': ' + gap.toFixed(3)
            + ' < ' + need.toFixed(3))
        }
      })
      previous = world.sharks.map(function (sh) { return sh.nodes.slice() })
    }
  })
}

test('outside-field and non-primary clicks cannot create guidance', function () {
  const ui = startedModule()
  ui.host.content.dispatch('pointerdown', {clientX: 2, clientY: 2})
  ui.host.content.dispatch('pointerdown', {clientX: 400, clientY: 300, button: 2})
  assert.equal(ui.ocean.lures.length, 0)
  ui.ocean.stop()
})

test('the roster seeds distinct sharks', function () {
  assert.ok(SHARK_SPECS.length >= 2, 'more than one animal')
  const kinds = new Set(SHARK_SPECS.map(function (s) { return s.kind }))
  assert.equal(kinds.size, SHARK_SPECS.length, 'every shark is a different kind, not a clone')
  const world = new World(SHARK_SPECS, 0)
  world.resize(1200, 800, 12, 18)
  assert.equal(world.sharks.length, SHARK_SPECS.length)
})

// --------------------------------------------------------------- the mount

test('the layer mounts as the FIRST child of the conversation body', function () {
  const ui = startedModule({})
  assert.ok(ui.canvas, 'expected a mounted canvas')
  assert.equal(ui.host.content.children[0], ui.canvas, 'the canvas must be the first child')
  assert.ok(ui.canvas.hasAttribute(OCEAN_ATTR))
  assert.equal(ui.canvas.getAttribute('aria-hidden'), 'true',
    'the layer is decoration and must be hidden from assistive technology')
})

test('the layer does not mount when the host layout is not recognised', function () {
  const doc = fakeDocument({})
  const ocean = createHeroOcean({ doc, Observer: fakeObservers().Observer })
  ocean.start()
  assert.equal(ocean.mounted, false)
  assert.equal(doc.body.querySelector('[' + OCEAN_ATTR + ']'), null)
})

test('a body with no scroll container is left alone', function () {
  const doc = fakeDocument({})
  const content = el('div', { [CONTENT_ANCHOR.slice(1, -1)]: '', [PHASE_ATTR]: HERO_PHASE })
  content.appendChild(el('div'))
  doc.body.appendChild(content)
  assert.equal(findHeroHost(doc), null, 'the structural check requires the scroll container')
  const ocean = createHeroOcean({ doc, Observer: fakeObservers().Observer })
  ocean.start()
  assert.equal(ocean.mounted, false)
})

test('the canvas is sized in device pixels for the field in CSS pixels', function () {
  const ui = startedModule({ dpr: 2 })
  assert.equal(ui.canvas.width, 2000, '1000 CSS px at dpr 2')
  assert.equal(ui.canvas.height, 1484)
  assert.equal(ui.ocean.field.width, 1000)
  assert.equal(ui.ocean.field.height, 742)
})

test('device pixel ratio is capped so a 4x display does not quadruple the buffer', function () {
  const ui = startedModule({ dpr: 4 })
  assert.equal(ui.canvas.width, 1000 * TUNING.maxDpr)
})

test('the canvas is watched for size changes instead of measured every frame', function () {
  const ui = startedModule({})
  assert.equal(ui.resizers.instances.length, 1, 'expected a ResizeObserver on the canvas')
  assert.deepEqual(ui.resizers.instances[0].targets, [ui.canvas], 'watching the layer itself')

  ui.host.content.rect = { left: 280, top: 80, width: 1200, height: 800 }
  ui.resizers.instances[0].fire()
  ui.doc.stepFrame(40)
  assert.equal(ui.canvas.width, 1200, 'the new width is picked up')
  assert.equal(ui.canvas.height, 800)
})

test('a zero-sized layer paints nothing and never crashes', function () {
  const ui = startedModule({})
  ui.host.content.rect = { left: 0, top: 0, width: 0, height: 0 }
  ui.resizers.instances[0].fire()
  ui.doc.stepFrame(40)
  assert.equal(ui.ocean.painted, 0, 'nothing can be painted into a 0×0 layer')

  ui.host.content.rect = { left: 0, top: 0, width: 800, height: 600 }
  ui.resizers.instances[0].fire()
  ui.doc.stepFrame(400)
  assert.equal(ui.ocean.painted, 1, 'the layer paints again once it has a size')
})

test('a hero-phase frame paints the ocean', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(40)
  assert.equal(ui.ocean.painted, 1)
  const texts = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'fillText' })
  assert.ok(texts.length > 0, 'expected glyphs on the canvas')
})

test('the main canvas is never stroked — the grid lives on the offscreen surface', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(40)
  const strokes = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'stroke' })
  assert.equal(strokes.length, 0, 'the visible layer is filled, never stroked')
})

test('an active conversation paints nothing and drops no lure', function () {
  const ui = startedModule({ phase: 'active' })
  assert.equal(ui.doc.queue.length, 0, 'no loop may be scheduled outside the hero phase')
  assert.equal(ui.ocean.painted, 0)
  ui.host.content.dispatch('pointerdown', { clientX: 310, clientY: 220 })
  assert.equal(ui.ocean.lures.length, 0, 'a click outside the hero phase must be ignored')
})

test('a click on the conversation body drops a lure at the pointer', function () {
  const ui = startedModule({})
  ui.host.content.dispatch('pointerdown', { clientX: 310, clientY: 220 })
  const lures = ui.ocean.lures
  assert.equal(lures.length, 1)
  // The layer's box is its containing block (the conversation body), which the
  // fake places at (280, 80) — so a click at (310, 220) is (30, 140) inside it.
  assert.equal(lures[0].x, 30)
  assert.equal(lures[0].y, 140)
})

test('a resize that does not change the field moves nothing', function () {
  // THE LAYOUT REMAP IS FOR REAL RESIZES ONLY.
  //
  // Moving a whole animal is forbidden in normal swimming — that is the "整体平移"
  // the user reported — and the one legitimate place is a genuine field change,
  // where the school has to be kept visible. If that correction leaked into the
  // common path (a composer reflowing by a pixel, a repeated layout pass, a
  // pointer event) the school would jump for no reason. So: identical calls are
  // bit-identical, and a one-pixel change moves NOTHING.
  const world = new World(SHARK_SPECS, 0)
  world.resize(1000, 742, 12, 18)
  const snapshot = () => world.sharks.map(sh => Array.from(sh.nodes))
  const start = snapshot()

  for (let i = 0; i < 5; i += 1) world.resize(1000, 742, 12, 18)
  assert.deepEqual(snapshot(), start, 'a same-size resize must be idempotent')

  world.resize(1001, 742, 12, 18)
  world.resize(1001, 743, 12, 18)
  const moved = snapshot()
  let worst = 0
  for (let i = 0; i < start.length; i += 1) {
    for (let k = 0; k < 40; k += 1) worst = Math.max(worst, Math.abs(moved[i][k] - start[i][k]))
  }
  assert.equal(worst, 0, 'a one-pixel resize must not move a single node')
})

test('a pointer move steers the fish away, a pointer leave releases them', function () {
  const ui = startedModule({})
  ui.host.content.dispatch('pointermove', { clientX: 400, clientY: 300, pointerType: 'mouse' })
  assert.equal(ui.ocean.world.pointer.active, true)
  assert.equal(ui.ocean.world.pointer.x, 120)
  assert.equal(ui.ocean.world.pointer.y, 220)
  ui.host.content.dispatch('pointermove', { clientX: 900, clientY: 300, pointerType: 'touch' })
  assert.equal(ui.ocean.world.pointer.active, false, 'a touch must not leave a phantom cursor')
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

test('the listener sits on the body, so a click on the composer card works too', function () {
  const ui = startedModule({})
  const card = el('div', { 'data-composer-card': '' })
  ui.host.seat.appendChild(card)
  card.dispatch('pointerdown', { clientX: 500, clientY: 500 })
  assert.equal(ui.ocean.lures.length, 0, 'the card itself is not a listener target')
  ui.host.content.dispatch('pointerdown', { clientX: 500, clientY: 500 })
  assert.equal(ui.ocean.lures.length, 1, 'the bubbled event does drop a lure')
})

test('flipping to the active phase stops the loop and clears the field', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(40)
  assert.equal(ui.ocean.painted, 1)
  ui.host.content.setAttribute(PHASE_ATTR, 'active')
  ui.ocean.syncPhase()
  assert.equal(ui.ocean.painted, 0, 'the field must clear when the conversation starts')
  assert.equal(ui.doc.queue.length, 0, 'and the loop must stop')
})

test('flipping back to the hero phase resumes painting', function () {
  const ui = startedModule({})
  ui.host.content.setAttribute(PHASE_ATTR, 'active')
  ui.ocean.syncPhase()
  ui.host.content.setAttribute(PHASE_ATTR, HERO_PHASE)
  ui.ocean.syncPhase()
  ui.doc.stepFrame(500)
  assert.equal(ui.ocean.painted, 1)
})

test('the observer watches exactly the phase attribute and the child list', function () {
  const ui = startedModule({})
  const observer = ui.observers.instances[0]
  assert.deepEqual(observer.options, {
    childList: true, subtree: true, attributes: true, attributeFilter: [PHASE_ATTR],
  })
  assert.equal(observer.target, ui.doc.body)
})

test('a body rendered AFTER start still gets the layer', function () {
  // The mount gate regression: the plugin activates before React has rendered the
  // conversation body. A phase filter before the first successful sweep would
  // deadlock the feature for the whole session.
  const doc = fakeDocument({})
  const observers = fakeObservers()
  const resizers = fakeResizeObservers()
  const ocean = createHeroOcean({
    doc,
    Observer: observers.Observer,
    ResizeObserver: resizers.ResizeObserver,
    now: function () { return 0 },
  })
  ocean.start()
  assert.equal(ocean.mounted, false)
  const host = buildHost(doc, HERO_PHASE)
  observers.instances[0].callback([{ type: 'childList', addedNodes: [host.content], removedNodes: [] }])
  doc.stepFrame(40)
  assert.equal(ocean.mounted, true, 'the added body must mount the layer')
  assert.equal(host.content.children[0], ocean.canvas)
})

test('a recreated conversation body gets a fresh layer and fresh listeners', function () {
  const ui = startedModule({})
  const old = ui.host.content
  ui.doc.body.removeChild(old)
  const replacement = buildHost(ui.doc, HERO_PHASE)
  ui.ocean.sweep()
  assert.equal(ui.ocean.mounted, true)
  assert.equal(replacement.content.children[0], ui.ocean.canvas, 'the layer moved to the new body')
  assert.equal(old.querySelector('[' + OCEAN_ATTR + ']'), null, 'the old body keeps nothing')
  replacement.content.dispatch('pointerdown', { clientX: 320, clientY: 220 })
  assert.equal(ui.ocean.lures.length, 1, 'the new body receives clicks')
})

// -------------------------------------------------------- reduced motion

test('reduced motion paints once, statically, and never loops', function () {
  const ui = startedModule({ reduceMotion: true })
  assert.equal(ui.ocean.reducedMotion, true)
  assert.equal(ui.ocean.painted, 1, 'the ocean is still drawn once')
  const clears = ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length
  assert.equal(ui.doc.queue.length, 0, 'no frame may be scheduled')
  assert.equal(ui.ocean.pushLure(100, 100), false, 'no lure under reduced motion')
  assert.equal(ui.ocean.lures.length, 0)
  ui.doc.stepFrame(100)
  assert.equal(ui.canvas.contextCalls.filter(function (c) { return c[0] === 'clearRect' }).length, clears,
    'and nothing repaints')
})

test('a live preference change stops and restarts the loop, and stop unsubscribes', function () {
  // THE PREFERENCE IS NOT READ ONCE. A user who flips "reduce motion" in the OS
  // (or a screen reader that does) expects the backdrop to freeze there and then,
  // and to resume when they flip it back — without reloading the app. The
  // listener must also be removed on stop, or a torn-down module keeps a
  // reference and the media query keeps calling into it.
  //
  // The fake view returns a FRESH object per matchMedia() call, so this test
  // pins ONE stable query object: the module subscribes to the object it got,
  // and a test that fired a different object would prove nothing.
  const doc = fakeDocument({})
  const host = buildHost(doc, HERO_PHASE)
  const observers = fakeObservers()
  const resizers = fakeResizeObservers()
  const listeners = new Set()
  const query = {
    matches: false,
    addEventListener(type, fn) { if (type === 'change') listeners.add(fn) },
    removeEventListener(type, fn) { if (type === 'change') listeners.delete(fn) },
    dispatch(matches) {
      query.matches = matches
      for (const fn of Array.from(listeners)) fn({ matches })
    },
  }
  doc.defaultView.matchMedia = function (text) {
    assert.equal(text, '(prefers-reduced-motion: reduce)')
    return query
  }
  const ocean = createHeroOcean({
    doc,
    Observer: observers.Observer,
    ResizeObserver: resizers.ResizeObserver,
  })
  ocean.start()
  assert.equal(ocean.reducedMotion, false)
  assert.equal(listeners.size, 1, 'the module subscribes exactly once')
  assert.ok(doc.queue.length > 0, 'and the animated loop is running')

  // Reduce: the frame is cancelled and the scene is painted once, statically.
  query.dispatch(true)
  assert.equal(ocean.reducedMotion, true)
  assert.equal(doc.queue.length, 0, 'no frame may stay queued after the switch')
  assert.equal(ocean.painted, 1, 'the frozen scene is still painted')
  assert.equal(ocean.pushLure(120, 90), false, 'and clicks stay inert under reduced motion')

  // Restore: the loop comes back on its own.
  query.dispatch(false)
  assert.equal(ocean.reducedMotion, false)
  assert.ok(doc.queue.length > 0, 'the loop must restart when motion is allowed again')

  ocean.stop()
  assert.equal(listeners.size, 0, 'stop must drop the media-query listener')
  query.dispatch(true)
  assert.equal(ocean.reducedMotion, false, 'a stopped module must not react to the preference')
  assert.equal(doc.queue.length, 0)
})

// --------------------------------------------------------------- teardown

test('stop removes the layer, both listeners and the observer', function () {
  const ui = startedModule({})
  const observer = ui.observers.instances[0]
  ui.ocean.stop()
  assert.equal(ui.ocean.started, false)
  assert.equal(ui.ocean.mounted, false)
  assert.equal(ui.doc.body.querySelector('[' + OCEAN_ATTR + ']'), null, 'the canvas is gone')
  assert.equal(observer.disconnected, true, 'the observer is disconnected')
  assert.equal(ui.host.content.listeners.length, 0, 'the pointer listeners are removed')
  ui.ocean.stop()
})

test('start is idempotent and never double-mounts', function () {
  const ui = startedModule({})
  const first = ui.ocean.canvas
  ui.ocean.start()
  assert.equal(ui.ocean.canvas, first)
  assert.equal(ui.host.content.querySelectorAll('[' + OCEAN_ATTR + ']').length, 1)
})

// ---------------------------------------------------------- the switch

test('the setting defaults on, sanitises a legacy payload, and only a false turns it off', function () {
  assert.equal(DEFAULT_STATE.heroRipple, true)
  assert.equal(sanitize({}).heroRipple, true)
  assert.equal(sanitize({ heroRipple: false }).heroRipple, false)
  assert.equal(sanitize({ heroRipple: 'no' }).heroRipple, true,
    'only an explicit boolean false may disable it')
  assert.equal(sanitize({ heroRipple: true }).heroRipple, true)
  assert.equal(sanitize({ warmth: 60, accent: 'ochre' }).heroRipple, true,
    'a legacy payload without the key keeps the shipped look')
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
  assert.ok(text.includes('[' + OCEAN_ATTR + ']'), 'the rules must key on this plugin’s own marker')
  assert.ok(text.includes('[data-composer-card]'), 'the card must let the ocean through')
  assert.ok(/color-mix\(in srgb, var\(--dsw-specific-input-major\) 82%, transparent\)/.test(text),
    'the see-through card must mix the theme’s own input surface')
  assert.ok(!/\.\w+_\w+_\d+/.test(text), 'no salted class may appear in the block')
  for (const line of text.split('\n')) {
    if (!line.includes('{') || line.trim().startsWith('/*')) continue
    if (!line.includes('data-')) continue
    assert.ok(!/data-content-phase="active"/.test(line), 'no rule may target the active phase')
  }
})

// --------------------------------------------------------- the whale colour
//
// The row offers EXACTLY THREE values: black (the shipped default), blue (the
// DeepSeek brand blue) and live (the hue walk). The values and the copy are the
// user's requirement, so the tests pin them literally rather than by shape.

test('the whale ink ships black, and the row offers exactly black, blue and live', function () {
  // THE DEFAULT IS THE FEATURE. A payload from before this row existed has no
  // `whaleInk` field at all, and an install that never touches the row must get
  // BLACK — the page's own ink, the least conspicuous of the three.
  assert.equal(DEFAULT_STATE.whaleInk, 'black')
  assert.equal(sanitize({}).whaleInk, 'black', 'a legacy payload gets black')
  assert.equal(sanitize({ whaleInk: 'black' }).whaleInk, 'black')
  assert.equal(sanitize({ whaleInk: 'blue' }).whaleInk, 'blue')
  assert.equal(sanitize({ whaleInk: 'live' }).whaleInk, 'live')
  // The removed `deepseek` entry maps onto `blue`, which carries the colour it
  // used to have — an existing preference keeps its exact pigment.
  assert.equal(sanitize({ whaleInk: 'deepseek' }).whaleInk, 'blue',
    'the retired deepseek value becomes blue')
  // An unknown value is coerced, never carried through to the painter.
  assert.equal(sanitize({ whaleInk: 'chartreuse' }).whaleInk, 'black')
  assert.equal(sanitize({ whaleInk: 42 }).whaleInk, 'black')
  assert.equal(sanitize({ whaleInk: null }).whaleInk, 'black')
  assert.deepEqual(WHALE_INKS, ['black', 'blue', 'live'])
})

test('blue is the DeepSeek brand blue, and black is the page ink', function () {
  // THE EXACT BRAND PIGMENT, in both modes: #4176e6 / #7aaaff.
  assert.deepEqual(whaleInkColor('blue', { dark: false }), { r: 65, g: 118, b: 230 })
  assert.deepEqual(whaleInkColor('blue', { dark: true }), { r: 122, g: 170, b: 255 })
  // A saved `deepseek` value reaches the same colour through the alias.
  assert.deepEqual(whaleInkColor(sanitize({ whaleInk: 'deepseek' }).whaleInk, { dark: false }),
    { r: 65, g: 118, b: 230 })
  // Black is the page's own ink: pure black on a light page, and the host's light
  // ink on a dark one (pure black would be invisible there).
  assert.deepEqual(whaleInkColor('black', { dark: false }), { r: 0, g: 0, b: 0 })
  const darkBlack = whaleInkColor('black', { dark: true })
  assert.ok(darkBlack.r > 200 && darkBlack.g > 200 && darkBlack.b > 200,
    'black inverts to the light ink on a dark page, got ' + JSON.stringify(darkBlack))
  // The three are distinct pigments, or the row would offer nothing.
  assert.notDeepEqual(whaleInkColor('black', {}), whaleInkColor('blue', {}))
})

test('dark mode lifts the brand blue instead of reusing the light colour', function () {
  // The glyph alphas are fixed, so the INK has to carry the mode: a dark blue at
  // 0.5 alpha on #1a1a18 is invisible.
  for (const inkId of ['black', 'blue']) {
    const light = whaleInkColor(inkId, { dark: false })
    const dark = whaleInkColor(inkId, { dark: true })
    assert.notDeepEqual(light, dark, inkId + ' must differ per mode')
    const lumaLight = light.r * 0.299 + light.g * 0.587 + light.b * 0.114
    const lumaDark = dark.r * 0.299 + dark.g * 0.587 + dark.b * 0.114
    assert.ok(lumaDark > lumaLight, inkId + ' is lighter on the dark surface')
  }
  assert.ok(whaleInkColor('blue', { dark: true }).b > whaleInkColor('blue', { dark: true }).r,
    'blue stays blue in dark mode')
})

test('live mode walks the hue and is a pure function of the clock', function () {
  const t0 = whaleInkColor('live', { time: 0 })
  const quarter = whaleInkColor('live', { time: HUE_PERIOD_S / 4 })
  const half = whaleInkColor('live', { time: HUE_PERIOD_S / 2 })
  const full = whaleInkColor('live', { time: HUE_PERIOD_S })
  // A full period returns to the start: the walk is periodic, so it never jumps.
  assert.deepEqual(full, t0, 'one period is one full turn')
  // A quarter turn is a different colour, and NOT just a darker one — the hue
  // moved rather than the brightness.
  assert.notDeepEqual(quarter, t0)
  assert.notDeepEqual(half, t0)
  // Deterministic: same time, same colour (no hidden random, no wall clock).
  assert.deepEqual(whaleInkColor('live', { time: 12.5 }), whaleInkColor('live', { time: 12.5 }))
  // A missing timestamp must still paint: the first frame of a rAF can arrive
  // with no argument.
  const noTime = whaleInkColor('live', {})
  assert.ok(Number.isFinite(noTime.r) && Number.isFinite(noTime.g) && Number.isFinite(noTime.b))
  assert.ok(!Number.isNaN(whaleInkColor('live', { time: NaN }).r))
  // The walk stays at a legible saturation in both modes — no washed-out pastels
  // on the light page and no near-black on the dark one.
  for (const time of [0, 5, 11, 19, 27, 35]) {
    const light = whaleInkColor('live', { time: time, dark: false })
    const dark = whaleInkColor('live', { time: time, dark: true })
    const luma = function (c) { return (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) / 255 }
    assert.ok(luma(light) < 0.75, 'a live colour on the light page stays dark enough')
    assert.ok(luma(dark) > 0.45, 'a live colour on the dark page stays light enough')
  }
})

test('an unknown ink mode falls through to the animated walk, never to a hole', function () {
  // `whaleInkColor` is the last line of defence: `sanitize()` already coerces, but
  // a direct call must not return `undefined` and paint nothing.
  const color = whaleInkColor('not-a-mode', { time: 3 })
  assert.equal(typeof color.r, 'number')
  assert.equal(typeof color.g, 'number')
  assert.equal(typeof color.b, 'number')
})

test('whaleCss formats a canvas fill and clamps alpha', function () {
  assert.equal(whaleCss({ r: 32, g: 74, b: 168 }, 0.5), 'rgba(32,74,168,0.500)')
  assert.equal(whaleCss({ r: 32, g: 74, b: 168 }, 2), 'rgba(32,74,168,1.000)')
  assert.equal(whaleCss({ r: 32, g: 74, b: 168 }, -1), 'rgba(32,74,168,0.000)')
  // A rounding host float still produces integers a canvas parses.
  assert.equal(whaleCss({ r: 32.4, g: 74.6, b: 168.2 }, 0.25), 'rgba(32,75,168,0.250)')
})

test('the layer paints the whales in the chosen colour, not the page ink', function () {
  const ui = startedModule({})
  ui.doc.stepFrame(40)
  const painted = ui.ocean.whaleColor
  assert.ok(painted, 'a frame must have resolved a whale colour')
  const expected = whaleInkColor('black', { dark: ui.ocean.palette.dark, time: ui.ocean.world.time })
  assert.deepEqual(painted, expected, 'the default is the black the policy names')

  // Switching to the brand blue repaints in that colour, with no remount.
  const canvasBefore = ui.ocean.canvas
  assert.equal(ui.ocean.setWhaleInk('blue'), 'blue')
  ui.doc.stepFrame(400)
  assert.equal(ui.ocean.canvas, canvasBefore, 'the layer is not rebuilt for a colour change')
  assert.deepEqual(ui.ocean.whaleColor, whaleInkColor('blue', { dark: ui.ocean.palette.dark, time: ui.ocean.world.time }))

  // And the glyphs on the canvas carry it: the fake context records each
  // `fillText` together with the `fillStyle` in force, so the assertion is about
  // what was DRAWN rather than about a field the test could be reading back from
  // its own setup.
  const whaleFills = ui.canvas.contextCalls
    .filter(function (call) { return call[0] === 'fillText' })
    .map(function (call) { return call[5] || '' })
    .filter(function (style) { return style.indexOf('rgba(') === 0 })
  assert.ok(whaleFills.length > 0, 'the frame must have drawn glyphs')
  const target = ui.ocean.whaleColor
  const needle = 'rgba(' + Math.round(target.r) + ',' + Math.round(target.g) + ',' + Math.round(target.b) + ','
  assert.ok(whaleFills.some(function (style) { return style.indexOf(needle) === 0 }),
    'at least one glyph must be painted in the whale colour, saw ' + JSON.stringify(whaleFills.slice(0, 3)))
})

test('an unknown mode is coerced on the way in, so a stale key cannot blank the whales', function () {
  const ui = startedModule({ whaleInk: 'chartreuse' })
  assert.equal(ui.ocean.whaleInk, 'black')
  ui.doc.stepFrame(40)
  assert.deepEqual(ui.ocean.whaleColor, whaleInkColor('black', { dark: ui.ocean.palette.dark, time: ui.ocean.world.time }))
})

test('reduced motion repaints once when the colour changes', function () {
  // Under reduced motion there is no loop, so a colour set after the single paint
  // would otherwise never reach the canvas — a setting that silently does nothing
  // on exactly the machines that cannot afford the loop.
  const ui = startedModule({ reduceMotion: true })
  const before = ui.ocean.whaleColor
  assert.deepEqual(before, whaleInkColor('black', { dark: ui.ocean.palette.dark, time: ui.ocean.world.time }))
  ui.ocean.setWhaleInk('blue')
  assert.deepEqual(ui.ocean.whaleColor, whaleInkColor('blue', { dark: ui.ocean.palette.dark, time: ui.ocean.world.time }),
    'the settled frame is repainted in the new colour')
  assert.equal(ui.doc.queue.length, 0, 'still no loop')
})

test('the whale colour is a settings row with three options and bilingual copy', function () {
  const panel = createPanel({
    React: {
      createElement() { return null },
      useSyncExternalStore(store, get) { return get() },
    },
    primitives: null,
    settings: { getState: function () { return sanitize({}) }, subscribe: function () { return function () {} } },
    themeMode: null,
  })
  const row = panel.slots.find(function (slot) { return slot.key === 'whaleInk' })
  assert.ok(row, 'the colour must have its own settings row')
  assert.equal(row.id, 'dsh-cds-theme-whale-ink')
  // 49: the first order that no retired row ever held (45/46/47 are vacated and
  // 40/41 belong to usage-stats), so taking one of those would break the vacancy
  // contract the settings page is reviewed against.
  assert.equal(row.order, 49)
  assert.ok(panel.appearanceSlots.indexOf(row) >= 0, 'it belongs on the theme page')
  for (const key of [row.titleKey, row.descKey]) {
    assert.ok(Object.hasOwn(en, key), 'en is missing ' + key)
    assert.ok(Object.hasOwn(zh, key), 'zh is missing ' + key)
  }
  for (const inkId of WHALE_INKS) {
    assert.ok(Object.hasOwn(en, 'whaleInk.' + inkId), 'en is missing the ' + inkId + ' label')
    assert.ok(Object.hasOwn(zh, 'whaleInk.' + inkId), 'zh is missing the ' + inkId + ' label')
  }
})

test('the row renders one button per option, marking the stored one', function () {
  // A minimal React stand-in: the row only calls `createElement` and
  // `useSyncExternalStore`, so the element tree is assertable without a renderer.
  const elements = []
  const React = {
    createElement: function (type, props) {
      const node = { type: type, props: props || {}, children: Array.prototype.slice.call(arguments, 2) }
      elements.push(node)
      return node
    },
    useSyncExternalStore(store, get) { return get() },
  }
  const state = sanitize({ whaleInk: 'blue' })
  let written = null
  const panel = createPanel({
    React: React,
    primitives: null,
    settings: {
      getState: function () { return state },
      subscribe: function () { return function () {} },
      setState: function (patch) { written = patch },
    },
    themeMode: null,
  })
  const row = panel.appearanceSlots.find(function (slot) { return slot.key === 'whaleInk' })
  // The registered component is a BOUND wrapper: it returns an element whose type
  // is the row component. Invoking that element's type is what a renderer does
  // next, so the fake has to do it too or the buttons are never created.
  const wrapper = row.component({ t: function (key) { return key } })
  wrapper.type(wrapper.props)
  const buttons = elements.filter(function (node) { return node.type === 'button' })
  assert.equal(buttons.length, 3, 'three options, no fourth state')
  const selected = buttons.filter(function (node) { return node.props['data-selected'] === 'true' })
  assert.equal(selected.length, 1, 'exactly one option is selected')
  assert.equal(selected[0].props['data-ink'], 'blue', 'the stored value is the selected one')
  for (const button of buttons) {
    assert.equal(button.props['aria-pressed'], button.props['data-selected'] === 'true',
      'aria-pressed is the truth, data-selected only drives paint')
  }
  // Clicking writes the key the store and the layer both read.
  buttons[2].props.onClick()
  assert.deepEqual(written, { whaleInk: 'live' })
})

// ------------------------------------------------------------ the artifact

test('the committed client bundle carries the ocean module', function () {
  // `client/client.js` is the shipped artifact; a link: install never builds.
  const artifact = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  assert.ok(artifact.includes(OCEAN_ATTR), 'the built bundle must carry the layer attribute')
  assert.ok(artifact.includes('createHeroOcean'), 'the built bundle must carry the module')
  assert.ok(artifact.includes('hammerhead'), 'the built bundle must carry the vendored roster')
})