/**
 * The blank-session home backdrop: an ASCII ocean, using the vendored
 * `stackedlol/ascii-sharks` simulation and renderer.
 *
 * WHAT IS VENDORED. `client/src/sharks/` is the upstream source (MIT-less — see
 * the note at the bottom) transpiled from TypeScript to ESM. Local patches add
 * shared direction hints, bounded collision avoidance, theme/whale colours and
 * forward-only motion. Geometry, species, fish flocking and glyph ramps retain the
 * upstream implementation; see sharks/README.md for the patch inventory.
 *
 * WHAT THIS FILE IS. The host integration only: where the canvas mounts, when
 * it runs, how a click becomes a lure, and the reduced-motion/teardown rules
 * this repository requires. The simulation is `World`; the painting is
 * `AsciiRenderer`; neither knows about React, phases or settings.
 *
 * WHY A CANVAS. Fish and whales are per-cell, per-frame state, so this cannot be
 * a stylesheet rule, and one DOM node per glyph would pay a style recalc per
 * frame. One canvas, one rAF, and glyphs that are strokes rather than elements.
 *
 * WHERE IT MOUNTS. Inside `[data-conversation-content]` (the host's conversation
 * body, `.Dc7zOa_body`, `docs/host-hooks.md:83`), as the FIRST child, painted at
 * `z-index: -1` under an `isolation: isolate` that is scoped to the hero phase
 * only (see `heroOceanRules()` in styles.js). That combination is what puts the
 * ocean BEHIND the composer card instead of on top of the text: a stacking
 * context on the body makes a negative-z child paint above the body's own
 * background and below every in-flow descendant, which is exactly the original
 * layering. The isolation is hero-scoped because the active conversation's
 * sticky composer seat uses `z-index: 7` and must keep competing with the header
 * in the host's own stacking order.
 *
 * WHERE IT IS VISIBLE. Only while `[data-content-phase="hero"]` — the host's own
 * phase attribute for a new/unused session (`conversation.js:17868`;
 * `hero = shellPhase === 'blank'`). An active conversation is untouched: the
 * loop stops, the canvas is hidden by its own rule, and clicks spawn nothing.
 *
 * HOW CLICKS ARRIVE. One `pointerdown` listener on `[data-conversation-content]`,
 * passive and non-capturing: it never calls `preventDefault` and never stops
 * propagation, so every button, the folder picker and the editor keep working.
 * A click ON the composer card still pulses — the listener is on the ancestor,
 * not on the empty background — which is why the card is rendered
 * translucent on a blank session (styles.js, `heroOceanRules`): the ocean has to
 * be visible THROUGH the card.
 *
 * THE CLICK DOES NOT STEER. `World.lure()` records the point, scatters the fish
 * school around it (`splash`) and lets the renderer stamp the blue pulse — the
 * expanding, fading disturbance the user asked to KEEP. No heading, speed or
 * position of a whale is touched, so the animals keep free-swimming routes of
 * their own. Earlier builds handed every whale the click bearing for 2.5 s;
 * that cursor-following behaviour is gone, together with the per-frame fish
 * flight from the pointer (`pointermove`).
 *
 * WHAT TURNS IT OFF
 *   - the setting (`heroRipple`, the key predates the ocean and is kept so a
 *     saved preference survives the upgrade) — the lifecycle stops the module;
 *   - `prefers-reduced-motion: reduce` — the tank is settled for a few seconds
 *     and painted once, with no loop and no lures at all;
 *   - a hidden document — `visibilitychange` parks the loop;
 *   - a host layout this module does not recognise — `sweep()` returns null and
 *     paints nothing (no layer, no listener), so a future host costs nothing.
 *
 * LICENSE. Upstream `stackedlol/ascii-sharks` ships with NO license file, which
 * by default means all rights reserved. The code is vendored here because the
 * plugin owner asked for it; it must not be redistributed on npm until the
 * upstream license is clarified. Everything outside `client/src/sharks/` is
 * original to this plugin.
 */

import { World } from './sharks/world.js'
import { AsciiRenderer } from './sharks/renderer.js'
import { whaleInkColor } from './whaleInk.js'

/**
 * Build a deterministic ocean world for offline trajectory checks.
 *
 * WHY THIS EXISTS. A 24-second free-swim check needs the SAME tank every run,
 * and `seed()` draws from `Math.random`. This entry seeds a fresh `World`,
 * sizes it, and (optionally) steps it a fixed number of times at a fixed dt —
 * no canvas, no rAF, no DOM. The caller reads `world.sharks[*].nodes` and
 * `world.heading` and asserts whatever it likes.
 *
 *   const world = createTestWorld({ width: 703, height: 837, fish: 0, seed: 42 })
 *   stepTestWorld(world, 24, 1 / 60)
 *   world.sharks.map((sh) => sh.nodes[0])
 *
 * @param options.width  field width in CSS px (default 703 — the app's real hero width)
 * @param options.height field height in CSS px (default 837)
 * @param options.fish   fish population; 0 for a whales-only tank
 * @param options.cellW / cellH  cell metrics used for spacing (default 12 x 18)
 * @param options.seed   integer seed for the deterministic RNG (default 1)
 * @param options.specs  roster override (default `SHARK_SPECS`)
 */
export function createTestWorld(options) {
  const opts = options || {}
  const width = Number(opts.width) > 0 ? Number(opts.width) : 703
  const height = Number(opts.height) > 0 ? Number(opts.height) : 837
  const cellW = Number(opts.cellW) > 0 ? Number(opts.cellW) : 12
  const cellH = Number(opts.cellH) > 0 ? Number(opts.cellH) : 18
  const previous = Math.random
  const state = { value: Number.isFinite(opts.seed) ? Math.floor(opts.seed) : 1 }
  Math.random = function () {
    state.value = (Math.imul(state.value, 1664525) + 1013904223) >>> 0
    return state.value / 4294967296
  }
  try {
    const world = new World(opts.specs || SHARK_SPECS,
      opts.fish === undefined ? 0 : Math.max(0, Math.floor(opts.fish)))
    world.resize(width, height, cellW, cellH)
    return world
  } finally {
    Math.random = previous
  }
}

/**
 * Advance a world by `seconds` of fixed-step simulation.
 *
 * The clock is the caller's: nothing here reads `Date.now`, so two runs with the
 * same seed produce identical nodes. `onFrame` (optional) is called after each
 * step with `(world, frameIndex, dt)` for per-frame assertions.
 */
export function stepTestWorld(world, seconds, dt, onFrame) {
  if (!world) return 0
  const step = Number(dt) > 0 && Number.isFinite(Number(dt)) ? Number(dt) : 1 / 60
  const frames = Math.max(0, Math.round((Number(seconds) || 0) / step))
  for (let frame = 0; frame < frames; frame += 1) {
    world.step(step)
    if (typeof onFrame === 'function') onFrame(world, frame, step)
  }
  return frames
}

/** Marks the canvas this plugin owns. Never a host class. */
export const OCEAN_ATTR = 'data-cds-hero-ocean'
/** The host's conversation body — carries the phase attribute. */
export const CONTENT_ANCHOR = '[data-conversation-content]'
/** The host's scroll container; its presence is the structural check. */
export const SCROLL_ANCHOR = '[data-conversation-scroll]'
/** `hero` / `active` / `settling` (conversation.js:17868). */
export const PHASE_ATTR = 'data-content-phase'
export const HERO_PHASE = 'hero'

/** The roster. Sizes are fractions of the renderer's base length. */
export const SHARK_SPECS = [
  { kind: 'classic', size: 0.9 },
  { kind: 'hammerhead', size: 0.8 },
  { kind: 'mako', size: 0.7 },
]

/**
 * Fish population. Upstream derives this from the area (up to ~340 on a large
 * screen); that density reads as ruled lines behind a greeting, so the backdrop
 * asks for a smaller tank.
 */
export const FISH_COUNT = 110

/** The palette used when the theme service cannot be read (tests, a bare host). */
export const FALLBACK_PALETTE = {
  accent: '#d97757',
  text: '#1f1e1d',
  bg: '#faf9f5',
  dark: false,
}

export const TUNING = {
  maxDpr: 2,
  /**
   * Refuse a measured backdrop larger than this, in CSS px.
   *
   * A guard against measurement bugs, not a layout limit: a replaced element
   * measured with `getBoundingClientRect()` reports its BITMAP size, so a feedback
   * loop between the bitmap attributes and the measurement grows without bound.
   * 16384 is the ceiling of a single canvas dimension in Chromium anyway.
   */
  maxField: 16384,
  frameMs: 33,
  step: 1 / 60,
  maxSubsteps: 3,
  /** Reduced motion: how many fixed steps to settle before the single paint. */
  settleSteps: 240,
}

// --------------------------------------------------------------- the colours

/**
 * Parse a CSS colour the theme service can hand us into `{ r, g, b }`.
 * Handles the two forms computed style actually returns for our tokens: a hex
 * triple and `rgb()`/`rgba()`. Anything else falls back rather than throwing.
 */
export function parseInk(value, fallback) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hex !== null) {
    const digits = hex[1]
    if (digits.length === 3) {
      return {
        r: parseInt(digits[0] + digits[0], 16),
        g: parseInt(digits[1] + digits[1], 16),
        b: parseInt(digits[2] + digits[2], 16),
      }
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    }
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text)
  if (rgb !== null) {
    return {
      r: Math.round(Number(rgb[1])),
      g: Math.round(Number(rgb[2])),
      b: Math.round(Number(rgb[3])),
    }
  }
  return fallback ? { r: fallback.r, g: fallback.g, b: fallback.b } : { r: 34, g: 34, b: 34 }
}

/**
 * Read the colours this layer paints with, from the live document.
 *
 * All three are read from COMPUTED style of the canvas itself, so they are the
 * values the theme service actually applied (including a user accent preset) and
 * not a guess at the palette. They can change at runtime — a settings row or the
 * host's own theme switch — so the caller refreshes on `theme/change` and the
 * loop does not poll it.
 */
export function readPalette(doc, node) {
  const target = node || (doc && doc.body)
  if (!doc || !target || typeof (doc.defaultView ? doc.defaultView.getComputedStyle : null) !== 'function') {
    return Object.assign({}, FALLBACK_PALETTE)
  }
  let computed = null
  try {
    computed = doc.defaultView.getComputedStyle(target)
  } catch (error) {
    return Object.assign({}, FALLBACK_PALETTE)
  }
  if (!computed || typeof computed.getPropertyValue !== 'function') {
    return Object.assign({}, FALLBACK_PALETTE)
  }
  const accent = String(computed.getPropertyValue('--dsw-alias-brand-primary') || '').trim()
  const text = String(computed.getPropertyValue('--dsw-alias-label-primary') || '').trim()
  const bg = String(computed.getPropertyValue('--dsw-alias-bg-base') || '').trim()
  const dark = !!(doc.body && typeof doc.body.hasAttribute === 'function'
    && doc.body.hasAttribute('data-ds-dark-theme'))
  return {
    accent: accent === '' ? FALLBACK_PALETTE.accent : accent,
    text: text === '' ? (dark ? '#eeede8' : FALLBACK_PALETTE.text) : text,
    bg: bg === '' ? (dark ? '#1a1a18' : FALLBACK_PALETTE.bg) : bg,
    dark: dark,
  }
}

/** Translate the palette into the renderer's ink/surface/accent triple. */
function themeFor(palette) {
  const dark = !!palette.dark
  return {
    ink: parseInk(palette.text, dark ? { r: 238, g: 237, b: 232 } : { r: 31, g: 30, b: 29 }),
    bg: parseInk(palette.bg, dark ? { r: 26, g: 26, b: 24 } : { r: 250, g: 249, b: 245 }),
    accent: parseInk(palette.accent, { r: 217, g: 119, b: 87 }),
    dark: dark,
  }
}

/**
 * Coerce a stored whale-ink value. Applied on the way IN, so a hand-edited
 * localStorage or a preset from a future build paints the shipped black instead
 * of `undefined`.
 *
 * `deepseek` was a shipped value and is no longer offered: it maps to `blue`
 * (the colour it was) rather than to the new default, so an existing user keeps
 * a blue whale instead of finding it silently turned black.
 */
export function normalizedInk(value) {
  if (value === 'blue' || value === 'live') return value
  if (value === 'deepseek') return 'blue'
  return 'black'
}

/** Whether the user asked for less motion, read once per start(). */
function prefersReducedMotion(view) {
  if (!view || typeof view.matchMedia !== 'function') return false
  let result = null
  try { result = view.matchMedia('(prefers-reduced-motion: reduce)') } catch (error) { result = null }
  return !!(result && result.matches === true)
}

// ------------------------------------------------------------------ mounts

/**
 * Locate the host conversation body and prove the layout is the one this module
 * understands. Returns null for anything else — a missing body, a body with no
 * scroll container, or a body that is no longer in the document.
 */
export function findHeroHost(root) {
  if (!root || typeof root.querySelector !== 'function') return null
  const content = root.querySelector(CONTENT_ANCHOR)
  if (!content || typeof content.querySelector !== 'function') return null
  const scroll = content.querySelector(SCROLL_ANCHOR)
  if (!scroll) return null
  if (typeof content.insertBefore !== 'function') return null
  return { content: content, scroll: scroll }
}

/** Marked canvas currently in the tree, or null. */
function markedCanvas(root) {
  if (!root || typeof root.querySelector !== 'function') return null
  return root.querySelector('[' + OCEAN_ATTR + ']')
}

/**
 * One ocean for one plugin lifetime.
 *
 * `Observer`, `ResizeObserver` and `now` are injectable so the whole state
 * machine is testable without a browser; in the app they default to the real
 * ones.
 */
export function createHeroOcean(options) {
  const opts = options || {}
  const doc = opts.doc
  const view = opts.view !== undefined
    ? opts.view
    : (doc && doc.defaultView ? doc.defaultView : null)
  const ObserverImpl = opts.Observer === undefined
    ? (typeof MutationObserver === 'function' ? MutationObserver : null)
    : opts.Observer
  // The size watcher. Observing the canvas is how the module learns its own size
  // WITHOUT reading layout on every frame — a rect read forces layout, and a
  // 30 fps decorative layer has no business doing that.
  const ResizeObserverImpl = opts.ResizeObserver === undefined
    ? (typeof ResizeObserver === 'function' ? ResizeObserver : null)
    : opts.ResizeObserver
  const nowImpl = typeof opts.now === 'function'
    ? opts.now
    : function () {
        if (view && typeof view.performance === 'object' && view.performance !== null
          && typeof view.performance.now === 'function') return view.performance.now()
        return Date.now()
      }

  let started = false
  let host = null
  let canvas = null
  let ctx = null
  let world = null
  let renderer = null
  let palette = Object.assign({}, FALLBACK_PALETTE)
  let paletteDirty = true
  /**
   * The whale pigment, live. `setWhaleInk()` writes it; `paintInk()` turns it into
   * a colour for the current frame. Instance state, not module state: two
   * `createHeroOcean()` calls (a test, a remount race) must not share a global.
   */
  let whaleInk = opts.whaleInk === undefined ? 'black' : normalizedInk(opts.whaleInk)
  let observer = null
  let sizeObserver = null
  let reduceMotion = false
  let motionQuery = null
  let rafId = null
  // -Infinity, not 0: a first frame arriving at timestamp 0 would otherwise be
  // swallowed by the frame budget and the scene would stay blank until the second
  // tick. Browsers start `performance.now()` above 0, but a test clock does not,
  // and "the first frame paints" is worth guaranteeing on its own.
  let lastFrame = -Infinity
  let acc = 0
  /** Set by the ResizeObserver; the loop re-measures only when this is true. */
  let sizeDirty = true
  let fieldW = 0
  let fieldH = 0
  let dpr = 1
  /** 1 when a frame has painted, 0 after a clear. Tests use it as a presence flag. */
  let painted = 0

  function requestFrame(fn) {
    if (view && typeof view.requestAnimationFrame === 'function') {
      return view.requestAnimationFrame(fn)
    }
    return setTimeout(fn, 16)
  }

  function cancelFrame(id) {
    if (id === null) return
    if (view && typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(id)
    else clearTimeout(id)
  }

  function isHero() {
    if (!host || !host.content || typeof host.content.getAttribute !== 'function') return false
    return host.content.getAttribute(PHASE_ATTR) === HERO_PHASE
  }

  /**
   * (Re)measure the canvas.
   *
   * MEASURE THE PARENT, NOT THE CANVAS — this is the fix for a runaway feedback
   * loop that was shipping a 25973×13013 bitmap (≈1.3 GB) into a 1000×742 area.
   *
   * WHY IT RAN AWAY. `<canvas>` is a REPLACED element. With `position: absolute;
   * inset: 0` and `width`/`height` left at `auto` it is NOT stretched to the
   * inset box: a replaced element takes its INTRINSIC size, which is exactly the
   * `width`/`height` ATTRIBUTES — the bitmap dimensions. So measuring the canvas
   * with `getBoundingClientRect()` returned the bitmap size, which was multiplied
   * by devicePixelRatio and written straight back to the attributes, which made
   * the next measurement larger again. Every ResizeObserver tick multiplied the
   * buffer: 450 → 675 → … → 25973. The layer stayed "mounted and visible" the
   * whole time, which is why it looked like nothing was happening.
   *
   * TWO INDEPENDENT GUARDS, because one of them alone is not enough:
   *
   *   1. The stylesheet gives the layer `width: 100%; height: 100%` (styles.js),
   *      so its CSS box comes from the containing block and no longer depends on
   *      the bitmap. That alone breaks the loop.
   *   2. This function measures the PARENT's box, so even a future stylesheet
   *      regression cannot feed bitmap size back into layout.
   *
   * A zero or absurd measurement is refused rather than drawn: the caller keeps
   * waiting, which is the correct behaviour for the frame or two before the host
   * has laid the conversation body out.
   */
  function measure() {
    if (!canvas) return null
    const parent = canvas.parentElement
    // NO FALLBACK TO THE CANVAS ITSELF. Measuring the canvas is the feedback loop:
    // a replaced element reports its bitmap as its layout size, so the write-back
    // would grow the bitmap on every measurement. Without a parent there is no
    // containing block to measure, and the honest answer is "not yet".
    if (!parent || typeof parent.getBoundingClientRect !== 'function') return null
    const rect = parent.getBoundingClientRect()
    const width = Math.round(rect.width || 0)
    const height = Math.round(rect.height || 0)
    if (width <= 0 || height <= 0) return null
    // A backdrop larger than any real window is a measurement bug, never a layout.
    // Refusing it keeps a runaway from allocating gigabytes before it is noticed.
    if (width > TUNING.maxField || height > TUNING.maxField) return null
    return { width: width, height: height }
  }

  function applySize(width, height) {
    const ratio = Math.min(TUNING.maxDpr,
      Math.max(1, Number(view && view.devicePixelRatio) || 1))
    fieldW = width
    fieldH = height
    dpr = ratio
    renderer.resize(width, height, ratio)
    if (!world) world = new World(SHARK_SPECS, FISH_COUNT)
    world.resize(width, height, renderer.cellWidth, renderer.cellHeight)
    if (ctx && typeof ctx.setTransform === 'function') ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  function resize(force) {
    if (!canvas || !renderer) return false
    const size = measure()
    if (size === null) return false
    const ratio = Math.min(TUNING.maxDpr,
      Math.max(1, Number(view && view.devicePixelRatio) || 1))
    if (!force && size.width === fieldW && size.height === fieldH && ratio === dpr) return true
    applySize(size.width, size.height)
    return true
  }

  function clear() {
    if (ctx && typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, fieldW, fieldH)
    painted = 0
  }

  function refreshPalette() {
    paletteDirty = true
  }

  /** Ensure the palette is current before painting; cheap because it is rare. */
  function currentPalette() {
    if (paletteDirty) {
      palette = readPalette(doc, canvas)
      paletteDirty = false
      if (renderer) renderer.setTheme(themeFor(palette))
    }
    return palette
  }

  function draw() {
    if (!ctx || !renderer || !world || fieldW === 0 || fieldH === 0) { painted = 0; return }
    currentPalette()
    // THE ANIMATED MODE READS THE SIMULATION CLOCK, not the wall clock: `world.time`
    // advances by the fixed step the loop already integrates, so the hue moves at
    // the same rate whatever the frame rate is, it pauses with the loop when the
    // layer is off screen, and the reduced-motion single paint gets a stable
    // colour instead of one that depends on when the paint happened.
    renderer.setWhaleColor(whaleInkColor(whaleInk, { dark: palette.dark, time: world.time }))
    renderer.render(world, TUNING.step)
    painted = 1
  }

  function frame(timestamp) {
    rafId = null
    if (!started || !isHero()) { clear(); return }
    const time = typeof timestamp === 'number' && isFinite(timestamp) ? timestamp : nowImpl()
    // The first frame has no previous timestamp. Pretend it arrived one budget
    // ago instead of one INFINITY ago, so the tank advances by exactly one
    // frame's worth of simulation.
    if (lastFrame === -Infinity) lastFrame = time - TUNING.frameMs
    if (time - lastFrame < TUNING.frameMs - 1) {
      rafId = requestFrame(frame)
      return
    }
    let dt = (time - lastFrame) / 1000
    if (!(dt > 0)) dt = TUNING.step
    lastFrame = time
    dt = Math.min(0.1, dt)

    // NOT `resize(false)` here. Measuring per frame forces layout, and a 30 fps
    // backdrop must not force 30 layouts a second. The size arrives from the
    // ResizeObserver instead (`onResize` sets `sizeDirty`); the loop only makes
    // sure a measurement exists at all.
    if (sizeDirty) {
      sizeDirty = false
      // A failed measurement means the host has not laid the body out (or is
      // mid-swap). Painting the OLD size here would keep a stale ocean on screen
      // after the layer's box collapsed to zero.
      if (!resize(false)) { rafId = requestFrame(frame); return }
    }
    if (world && renderer && fieldW > 0 && fieldH > 0) {
      acc += dt
      let steps = 0
      while (acc >= TUNING.step && steps < TUNING.maxSubsteps) {
        world.step(TUNING.step)
        acc -= TUNING.step
        steps += 1
      }
      if (steps === TUNING.maxSubsteps) acc = 0
      draw()
    }
    rafId = requestFrame(frame)
  }

  function startLoop() {
    if (rafId !== null) return
    if (reduceMotion) {
      // Static scene, one paint, no loop and no lures: reduced motion asked for
      // no movement, not for a slower version of the movement. The tank is
      // settled first so the still frame is a formed school, not the seed.
      if (resize(true)) {
        for (let i = 0; i < TUNING.settleSteps; i += 1) world.step(TUNING.step)
        draw()
      }
      return
    }
    rafId = requestFrame(frame)
  }

  function stopLoop() {
    cancelFrame(rafId)
    rafId = null
  }

  /** Drop a lure at a point in field coordinates. Returns false under reduced motion. */
  function pushLureAt(x, y) {
    if (reduceMotion || !world) return false
    if (!isFinite(Number(x)) || !isFinite(Number(y))) return false
    world.lure(Number(x), Number(y))
    startLoop()
    return true
  }

  /**
   * The pointer handler: map a client point into the FIELD's coordinate space.
   *
   * The origin is the same element `measure()` reads — the canvas's parent — so
   * the lure and the whales are guaranteed to be in one space. Reading the
   * canvas's own rect here was the same trap `measure()` documents: on a replaced
   * element that rect is the BITMAP size, not the CSS box, so the lure would land
   * at a scaled position.
   */
  function localPoint(event) {
    if (!canvas) return null
    if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return null
    const origin = canvas.parentElement
    if (!origin || typeof origin.getBoundingClientRect !== 'function') return null
    const rect = origin.getBoundingClientRect()
    const x = event.clientX - (rect.left || 0)
    const y = event.clientY - (rect.top || 0)
    return {
      x: x,
      y: y,
      inside: x >= 0 && y >= 0 && x <= (rect.width || 0) && y <= (rect.height || 0),
    }
  }

  function onPointerDown(event) {
    if (!started || !isHero() || !canvas) return
    const point = localPoint(event)
    if (point === null || !point.inside || event.button > 0) return
    pushLureAt(point.x, point.y)
  }

  /**
   * The pointer's position in the water, so the school keeps clear of it.
   *
   * This is NOT click guidance: a click is a splash (`pushLureAt`), while the
   * cursor is only an obstacle the fish steer around, exactly as they steer around
   * a whale. A touch never sets it — a finger that has lifted leaves no cursor
   * behind, and a phantom one would keep a patch of water permanently empty.
   */
  function onPointerMove(event) {
    if (!started || !world) return
    if (event && event.pointerType === 'touch') {
      // A finger is not a hovering cursor: it has no position between taps, and a
      // stale one would keep a patch of water permanently empty.
      world.pointer.active = false
      return
    }
    const point = localPoint(event)
    if (point === null || !point.inside) {
      world.pointer.active = false
      return
    }
    world.pointer.x = point.x
    world.pointer.y = point.y
    world.pointer.active = true
  }

  /** The pointer left the water: nothing to swim around any more. */
  function onPointerLeave() {
    if (world) world.pointer.active = false
  }

  function attachLayer(target) {
    const node = doc.createElement('canvas')
    node.setAttribute(OCEAN_ATTR, '')
    node.setAttribute('data-cds-ocean-motion', 'head-trail-v1')
    node.setAttribute('aria-hidden', 'true')
    target.insertBefore(node, target.firstChild)
    return node
  }

  function detachLayer() {
    if (sizeObserver) { sizeObserver.disconnect(); sizeObserver = null }
    if (!canvas) return
    if (canvas.parentNode && typeof canvas.parentNode.removeChild === 'function') {
      canvas.parentNode.removeChild(canvas)
    }
    canvas = null
    ctx = null
    renderer = null
    world = null
    fieldW = 0
    fieldH = 0
    acc = 0
  }

  /** The size watcher's callback: stop reading layout per frame. */
  function onResize() {
    if (!started) return
    sizeDirty = true
    if (isHero()) startLoop()
  }

  /** Observe the canvas for size changes; a no-op when the browser lacks it. */
  function watchSize(node) {
    if (sizeObserver) { sizeObserver.disconnect(); sizeObserver = null }
    if (!ResizeObserverImpl || !node) return
    try {
      sizeObserver = new ResizeObserverImpl(onResize)
      sizeObserver.observe(node)
    } catch (error) {
      sizeObserver = null
    }
    // Without a ResizeObserver the loop falls back to measuring on its own; the
    // flag below makes that path explicit rather than accidental.
    if (sizeObserver === null) sizeDirty = true
  }

  function bindCanvas() {
    if (!canvas) return
    if (typeof canvas.getContext === 'function') ctx = canvas.getContext('2d')
    renderer = new AsciiRenderer(canvas, doc)
    if (view && typeof view.getComputedStyle === 'function') {
      const computed = view.getComputedStyle(canvas)
      if (computed && computed.fontFamily) renderer.setFontFamily(computed.fontFamily)
    }
    world = null
    paletteDirty = true
  }

  function unbindCanvas() {
    if (ctx && typeof ctx.setTransform === 'function') {
      // Nothing to release: the context belongs to the removed canvas.
    }
    ctx = null
    renderer = null
    world = null
  }

  /** One sweep: make the layer true for the current DOM, or remove it. */
  function sweep() {
    if (!started) return null
    const found = findHeroHost(doc)
    if (!found) {
      if (host && typeof host.content.removeEventListener === 'function') {
        host.content.removeEventListener('pointerdown', onPointerDown)
        host.content.removeEventListener('pointermove', onPointerMove)
        host.content.removeEventListener('pointerleave', onPointerLeave)
      }
      detachLayer()
      host = null
      clear()
      return null
    }
    // Re-attach the listeners whenever the host node changes: the content body is
    // recreated by React on some phase transitions, and a listener left on the
    // detached node would silently stop receiving clicks.
    if (host === null || host.content !== found.content) {
      if (host && typeof host.content.removeEventListener === 'function') {
        host.content.removeEventListener('pointerdown', onPointerDown)
        host.content.removeEventListener('pointermove', onPointerMove)
        host.content.removeEventListener('pointerleave', onPointerLeave)
      }
      if (typeof found.content.addEventListener === 'function') {
        found.content.addEventListener('pointerdown', onPointerDown)
        found.content.addEventListener('pointermove', onPointerMove)
        found.content.addEventListener('pointerleave', onPointerLeave)
      }
    }
    host = found
    const existing = markedCanvas(host.content)
    if (existing === null) {
      detachLayer()
      canvas = attachLayer(host.content)
      bindCanvas()
      watchSize(canvas)
    } else if (existing !== canvas) {
      canvas = existing
      bindCanvas()
      watchSize(canvas)
    }
    paletteDirty = true
    sizeDirty = true
    resize(true)
    if (isHero()) startLoop()
    else { stopLoop(); clear() }
    return canvas
  }

  /**
   * Is the layer still where it belongs?
   *
   * The cheap test the mutation path runs before doing any real work. React
   * re-creating the conversation body is the ONE case a child-list mutation can
   * hurt us, and it shows up here as `canvas.parentNode` no longer being the
   * cached host body. Everything else — a streaming response adding rows, the
   * composer growing a line — leaves this true, and then there is nothing to do.
   */
  function isLayerHealthy() {
    if (!canvas || !host || !host.content) return false
    if (canvas.parentNode !== host.content) return false
    if (typeof host.content.isConnected === 'boolean' && !host.content.isConnected) return false
    return true
  }

  /**
   * Coalesce mutation reactions onto one animation frame.
   *
   * Streaming mutates the chat body continuously; without this every added text
   * element would run a document query and a phase check. One scheduled check per
   * frame is enough, and the check itself is `isLayerHealthy()` — a pointer
   * comparison, not a query (the same discipline as `hero.js`).
   */
  let sweepQueued = false
  function scheduleSweep() {
    if (!started || sweepQueued) return
    sweepQueued = true
    requestFrame(function () {
      sweepQueued = false
      if (!started) return
      if (isLayerHealthy()) return
      sweep()
    })
  }

  function onMutations(records) {
    if (!started) return
    // Only an added element, or the phase attribute, can change anything here.
    if (!records || records.length === 0) { scheduleSweep(); return }
    for (const record of records) {
      if (!record) continue
      if (record.type === 'attributes') {
        if (record.attributeName === PHASE_ATTR) { syncPhase(); return }
        continue
      }
      // THE MOUNT GATE, and the bug it fixes:
      //
      //   `if (!isHero()) continue` was here, and it deadlocked the whole feature.
      //   `isHero()` reads the CACHED host, so before the first successful sweep it
      //   is always false — and the plugin activates before React has rendered the
      //   conversation body at all. Every later mutation therefore hit `continue`,
      //   no sweep ever ran, and the canvas was never mounted: the effect was dead
      //   for the entire session while every unit test passed, because the tests
      //   build the body BEFORE `start()`.
      //
      //   The phase filter is only valid once a layer EXISTS: with the canvas
      //   mounted, a child-list change outside the hero phase genuinely cannot
      //   matter (nothing is painted). Without a layer, an addition is the only
      //   thing that can ever mount one, so it must always be looked at.
      //
      // `isLayerHealthy()` is what keeps streaming cheap — it is a pointer compare,
      // so an active conversation with no layer does one comparison per frame and
      // no document query.
      if (isLayerHealthy()) {
        if (!isHero()) continue
      }
      const added = record.addedNodes || []
      for (const node of added) {
        if (!node) continue
        if (node.nodeType === 3 || node.nodeType === 8) continue
        if (node === canvas) continue
        scheduleSweep()
        return
      }
      const removed = record.removedNodes || []
      for (const node of removed) {
        if (!node) continue
        if (node.nodeType === 3 || node.nodeType === 8) continue
        if (node === canvas) { scheduleSweep(); return }
      }
    }
  }

  /** Phase changed: start or stop the loop without rebuilding anything. */
  function syncPhase() {
    if (!started) return
    if (isHero()) {
      paletteDirty = true
      startLoop()
    } else {
      stopLoop()
      if (world) world.lures.length = 0
      clear()
    }
  }

  function onMotionChange(event) {
    const next = event.matches === true
    if (!started || next === reduceMotion) return
    reduceMotion = next
    stopLoop()
    lastFrame = -Infinity
    acc = 0
    if (isHero()) startLoop()
  }

  function onVisibility() {
    if (!started) return
    const hidden = !!(doc && doc.visibilityState === 'hidden')
    if (hidden) stopLoop()
    else if (isHero()) startLoop()
    else clear()
  }

  return {
    /** Mount the layer and attach every listener. Idempotent. */
    start() {
      if (started || !doc) return
      started = true
      reduceMotion = prefersReducedMotion(view)
      if (view && typeof view.matchMedia === 'function') {
        try { motionQuery = view.matchMedia('(prefers-reduced-motion: reduce)') } catch { motionQuery = null }
        if (motionQuery && typeof motionQuery.addEventListener === 'function') {
          motionQuery.addEventListener('change', onMotionChange)
        }
      }
      sweep()
      const Obs = ObserverImpl
      if (Obs && doc.body && typeof Obs === 'function') {
        observer = new Obs(onMutations)
        // `attributes` on the subtree is what catches the host flipping
        // `data-content-phase` on the conversation body; `childList` is what
        // catches React recreating that body.
        observer.observe(doc.body, {
          childList: true, subtree: true, attributes: true, attributeFilter: [PHASE_ATTR],
        })
      }
      if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', onVisibility)
      }
    },

    /** Remove the layer, the listeners and the loop. Safe to call twice. */
    stop() {
      if (!started) return
      started = false
      stopLoop()
      if (motionQuery && typeof motionQuery.removeEventListener === 'function') {
        motionQuery.removeEventListener('change', onMotionChange)
      }
      motionQuery = null
      if (observer) { observer.disconnect(); observer = null }
      if (host && host.content && typeof host.content.removeEventListener === 'function') {
        host.content.removeEventListener('pointerdown', onPointerDown)
        host.content.removeEventListener('pointermove', onPointerMove)
        host.content.removeEventListener('pointerleave', onPointerLeave)
      }
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('visibilitychange', onVisibility)
      }
      detachLayer()
      host = null
      acc = 0
    },

    sweep: sweep,
    syncPhase: syncPhase,
    refresh: refreshPalette,
    pushLure: pushLureAt,
    /**
     * Change the whale pigment while the layer is up.
     *
     * Applied on the NEXT paint rather than immediately: `draw()` resolves it per
     * frame (which is what makes the animated mode free), so a colour set here is
     * picked up on the next tick with no remount and no palette re-read. Under
     * reduced motion there is no loop, so the single settled frame is repainted
     * here — otherwise a colour change would silently do nothing on a machine
     * that asked for less motion, which is the one case a user cannot diagnose.
     */
    setWhaleInk(value) {
      const next = normalizedInk(value)
      if (next === whaleInk) return next
      whaleInk = next
      if (reduceMotion && started) draw()
      return next
    },
    get whaleInk() { return whaleInk },
    /** The colour the LAST painted frame used (tests and console probes). */
    get whaleColor() { return renderer ? Object.assign({}, renderer.whaleColor) : null },
    get started() { return started },
    get mounted() { return canvas !== null },
    get canvas() { return canvas },
    /** The vendored simulation, exposed for tests and console probes. */
    get world() { return world },
    get lures() { return world ? world.lures.slice() : [] },
    get painted() { return painted },
    get reducedMotion() { return reduceMotion },
    get field() { return { width: fieldW, height: fieldH, dpr: dpr } },
    /** The palette last read from the live document (tests and verify read it). */
    get palette() { return Object.assign({}, palette) },
  }
}