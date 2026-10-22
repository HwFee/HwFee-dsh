/**
 * The continuous motion engine, and the release-landing regression.
 *
 * All assertions use a FIXED dt, so convergence, overshoot and landing are exact
 * rather than clock-dependent. The most important test in this file is the release
 * round-trip: an earlier version of the port re-derived the landing formula and got it
 * wrong in a way that only showed at 4+ levels (every release fell to the second
 * level), and no amount of "the maths looks the same" caught it — the round-trip did.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { indexFromPct, pctFromIndex } from '../client/src/levels.js'
import {
  MAX_FRAME_DT,
  MOTION,
  MOTION_FAST,
  MOTION_REDUCED,
  POINTER_SPEED_EMA,
  POINTER_SPEED_TAU,
  POINTER_STALE_S,
  RELEASE_PROJECT_S,
  cancelFrame,
  clampAbs,
  createTrackMetrics,
  decayPointerSpeed,
  motionSettled,
  motionStep,
  releaseIndexFor,
  scheduleFrame,
} from '../client/src/motion.js'

/** A settled engine sitting exactly on `x`. */
function engine(x, target) {
  return { x, v: 0, a: 0, target: target === undefined ? x : target, vPtr: 0 }
}

/** Step to convergence, returning the frame count (bounded so a bug cannot hang). */
function settle(m, p, dt = 1 / 60, limit = 2000) {
  let frames = 0
  while (!motionSettled(m, p) && frames < limit) {
    motionStep(m, dt, p)
    frames += 1
  }
  return frames
}

test('full and concise land exactly with no overshoot at any target', function () {
  for (const p of [MOTION, MOTION_REDUCED]) {
    for (const target of [0.1, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1]) {
      const m = engine(0, target)
      let peak = 0
      for (let i = 0; i < 2000 && !motionSettled(m, p); i += 1) {
        motionStep(m, 1 / 60, p)
        peak = Math.max(peak, m.x)
      }
      assert.ok(Math.abs(m.x - target) < 1e-9, `did not land on ${target}: x=${m.x}`)
      assert.ok(peak <= target + 1e-9, `overshot ${target} (peak ${peak})`)
    }
  }
})

test('fast mode lands exactly with no overshoot on every DETENT it can actually target', function () {
  // Fast mode ("does not follow the pointer") only ever receives detent targets —
  // `moveTo` writes `pctFromIndex(detent, count)` and `endDrag` keeps it. At those
  // targets the anti-overshoot branch makes it land exactly, which is the property the
  // feel depends on. At an arbitrary in-between target it can travel one extra frame
  // before correcting (measured 0.083 at 0.25), which is the residual bounce the
  // upstream recordings put at ~1–3% — and which cannot occur here, because no code
  // path produces a non-detent target in this mode.
  for (const count of [2, 4, 6]) {
    for (let index = 0; index < count; index += 1) {
      const target = pctFromIndex(index, count)
      const m = engine(0, target)
      let peak = 0
      for (let i = 0; i < 2000 && !motionSettled(m, MOTION_FAST); i += 1) {
        motionStep(m, 1 / 60, MOTION_FAST)
        peak = Math.max(peak, m.x)
      }
      assert.ok(Math.abs(m.x - target) < 1e-9, `count=${count} detent ${index}: landed on ${m.x}`)
      assert.ok(peak <= target + 1e-9, `count=${count} detent ${index} overshot (peak ${peak})`)
    }
  }
})

test('the parameter sets stay inside the documented stability envelope', function () {
  // THE REGRESSION BEHIND ISSUE #12. With amax=1200 and vmax=20 the velocity could flip
  // sign within one frame, the position swung ±0.333 per frame, and the state still
  // looked correct (effective level stayed put) — 215 single-frame jumps.
  //
  // The envelope is `amax/60 <= 0.5*vmax` (velocity may change by at most half a notch
  // per frame). The upstream author's own table records MOTION as `4 vs 3 ≈ 临界（够用）`
  // — i.e. deliberately one unit over, and measured to converge. That deviation is
  // asserted honestly here rather than rounded away; the real guard is the oscillation
  // test below, which MOTION passes.
  const ratio = (p) => p.amax / 60 / p.vmax
  assert.ok(ratio(MOTION_REDUCED) <= 0.5, `MOTION_REDUCED is outside the envelope: ${ratio(MOTION_REDUCED)}`)
  assert.ok(ratio(MOTION_FAST) <= 0.5, `MOTION_FAST is outside the envelope: ${ratio(MOTION_FAST)}`)
  assert.ok(ratio(MOTION) <= 0.7,
    `MOTION is far outside its documented borderline value: ${ratio(MOTION)} (expected ~0.67)`)
  // Nothing may be anywhere near the self-oscillating shape (1.0 = a full flip per frame).
  for (const [name, p] of [['MOTION', MOTION], ['MOTION_REDUCED', MOTION_REDUCED], ['MOTION_FAST', MOTION_FAST]]) {
    assert.ok(ratio(p) < 1, `${name} could reverse direction within one frame`)
  }
})

test('the engine never oscillates: velocity sign changes are bounded', function () {
  for (const p of [MOTION, MOTION_REDUCED, MOTION_FAST]) {
    const m = engine(0, 1)
    let flips = 0
    let previous = 0
    for (let i = 0; i < 600; i += 1) {
      motionStep(m, 1 / 60, p)
      if (previous !== 0 && m.v !== 0 && Math.sign(m.v) !== Math.sign(previous)) flips += 1
      previous = m.v
      if (motionSettled(m, p)) break
    }
    assert.ok(flips <= 1, `velocity flipped sign ${flips} times, which reads as a stutter`)
  }
})

test('a position clamp also zeroes the outward velocity (no jitter at the ends)', function () {
  const m = engine(0, -1) // target outside the track: pushes against the left end
  motionStep(m, 1 / 60, MOTION)
  assert.equal(m.x >= 0, true)
  const atEnd = engine(0.999, 1)
  atEnd.v = 5
  motionStep(atEnd, MAX_FRAME_DT, MOTION)
  assert.equal(atEnd.x, 1)
  assert.equal(atEnd.v, 0, 'an outward velocity left at the end would buzz')
})

test('a single step never travels further than the remaining distance', function () {
  const m = engine(0.4, 0.41)
  m.v = 5
  motionStep(m, 1 / 60, MOTION)
  assert.ok(m.x <= 0.41 + 1e-9, 'frame quantisation must not send the knob past its target')
})

test('a large dt is clamped by the caller, and the step itself is bounded by vmax', function () {
  const m = engine(0, 1)
  motionStep(m, 1 / 60, MOTION)
  assert.ok(Math.abs(m.v) <= MOTION.vmax + 1e-9)
})

test('settling zeroes the residual so the frame loop can stop', function () {
  const m = engine(0, 0.5)
  settle(m, MOTION)
  assert.equal(m.v, 0, 'a non-zero residual velocity keeps the loop spinning forever')
  assert.equal(m.a, 0)
  assert.equal(m.x, 0.5)
})

test('the reduced and fast sets are each faster than the full set', function () {
  const framesFor = (p) => {
    const m = engine(0, 0.5)
    return settle(m, p)
  }
  const full = framesFor(MOTION)
  assert.ok(framesFor(MOTION_REDUCED) < full, 'concise should arrive sooner than full')
  assert.ok(framesFor(MOTION_FAST) < full, 'fast should arrive sooner than full')
})

test('releaseIndexFor round-trips EVERY level of 2-, 4- and 6-level models', function () {
  // THE REGRESSION THIS TEST EXISTS FOR. The port once computed
  //   round(clamp01(clamp01(target) * (count - 1)))
  // which clamps to 0..1 AFTER multiplying, so it only ever returned 0 or 1. Releasing
  // at Max on a 4-level model fell back to the second level, and the only symptom was a
  // knob that would not stay at the top.
  for (const count of [2, 4, 6]) {
    for (let index = 0; index < count; index += 1) {
      const pct = pctFromIndex(index, count)
      assert.equal(releaseIndexFor(pct, 0, count), index,
        `count=${count}: releasing at level ${index} (${pct}) landed on ${releaseIndexFor(pct, 0, count)}`)
    }
  }
})

test('releaseIndexFor survives a stale pointer velocity (projection is disabled)', function () {
  // RELEASE_PROJECT_S is 0 by measurement: a pointer resting mid-notch could otherwise
  // be projected a whole notch away and the knob would twitch on release.
  assert.equal(RELEASE_PROJECT_S, 0)
  for (const count of [4, 6]) {
    for (let index = 0; index < count; index += 1) {
      const pct = pctFromIndex(index, count)
      for (const vPtr of [-6, -2, 0, 2, 6]) {
        assert.equal(releaseIndexFor(pct, vPtr, count), index,
          `a stale velocity ${vPtr} moved the landing away from level ${index}`)
      }
    }
  }
})

test('releaseIndexFor clamps a release outside the track onto the end levels', function () {
  assert.equal(releaseIndexFor(-1, 0, 4), 0)
  assert.equal(releaseIndexFor(2, 0, 4), 3)
  assert.equal(releaseIndexFor(0.5, 0, 0), 0)
})

test('releaseIndexFor agrees with indexFromPct (it is a pure delegation)', function () {
  for (let i = 0; i <= 20; i += 1) {
    const pct = i / 20
    for (const count of [2, 3, 4, 6]) {
      assert.equal(releaseIndexFor(pct, 0, count), indexFromPct(pct, count))
    }
  }
})

test('a stale pointer velocity decays towards zero after the freshness window', function () {
  const v = 3
  assert.equal(decayPointerSpeed(v, 0, POINTER_STALE_S, POINTER_SPEED_TAU), v, 'fresh: unchanged')
  assert.equal(decayPointerSpeed(v, POINTER_STALE_S, POINTER_STALE_S, POINTER_SPEED_TAU), v,
    'exactly at the window: still fresh')
  const decayed = decayPointerSpeed(v, POINTER_STALE_S + POINTER_SPEED_TAU, POINTER_STALE_S, POINTER_SPEED_TAU)
  assert.ok(decayed < v * 0.5, `a stale velocity must fall off, got ${decayed}`)
  const older = decayPointerSpeed(v, POINTER_STALE_S + POINTER_SPEED_TAU * 10, POINTER_STALE_S, POINTER_SPEED_TAU)
  assert.ok(older < decayed)
})

test('clampAbs is symmetric and inclusive at the limit', function () {
  assert.equal(clampAbs(5, 3), 3)
  assert.equal(clampAbs(-5, 3), -3)
  assert.equal(clampAbs(3, 3), 3)
  assert.equal(clampAbs(0, 3), 0)
})

test('the pointer EMA constant is a debounce weight, not a threshold', function () {
  assert.ok(POINTER_SPEED_EMA > 0 && POINTER_SPEED_EMA < 1)
})

test('scheduleFrame uses rAF when the host has it and cancels through the same handle', function () {
  const savedWindow = globalThis.window
  let requested = 0
  let cancelled = 0
  globalThis.window = {
    requestAnimationFrame(cb) { requested += 1; return 42 },
    cancelAnimationFrame(handle) { cancelled += handle === 42 ? 1 : 0 },
  }
  try {
    const handle = scheduleFrame(() => {})
    assert.equal(handle.raf, true)
    assert.equal(requested, 1)
    cancelFrame(handle)
    assert.equal(cancelled, 1)
    cancelFrame(null) // must not throw
  } finally {
    globalThis.window = savedWindow
  }
})

test('scheduleFrame falls back to a bare setTimeout without rAF', function () {
  // Two traps: `window.setTimeout` does not exist in a test double, and a bare
  // `requestAnimationFrame` is a ReferenceError in Node that takes the bundle down.
  const savedWindow = globalThis.window
  globalThis.window = {}
  try {
    const handle = scheduleFrame(() => {})
    assert.equal(handle.raf, false)
    cancelFrame(handle)
  } finally {
    globalThis.window = savedWindow
  }
})

/* ─── track metrics: measured at drag start, not per pointer move ───────────── */

/** A ResizeObserver double that records what it watches and can fire. */
function sizeWatcher() {
  const instances = []
  function Impl(callback) {
    instances.push({ callback, elements: [], disconnected: false })
    this.observe = (el) => instances[instances.length - 1].elements.push(el)
    this.disconnect = () => { instances[instances.length - 1].disconnected = true }
  }
  return { Impl, instances, fire: () => { for (const instance of instances) instance.callback([]) } }
}

test('metrics measure once per start and answer pctAt from the cached box', function () {
  let rects = 0
  const element = {
    getBoundingClientRect() {
      rects += 1
      return { left: 100, width: 228 }
    },
  }
  const watcher = sizeWatcher()
  const metrics = createTrackMetrics({ track: () => element, SizeWatcherImpl: watcher.Impl })
  metrics.start()
  assert.equal(rects, 1, 'start measures once')

  // Every pointer position must be answered WITHOUT touching layout.
  for (let x = 100; x <= 328; x += 7) metrics.pctAt(x, 14)
  assert.equal(rects, 1, 'pctAt must not read layout')

  // The mapping spans "the distance the knob CENTRE can travel", so both ends reach.
  assert.equal(metrics.pctAt(100 + 14, 14), 0)
  assert.equal(metrics.pctAt(100 + 228 - 14, 14), 1)
  metrics.dispose()
})

test('metrics re-measure when the element reports a size change', function () {
  let width = 200
  const element = { getBoundingClientRect: () => ({ left: 0, width }) }
  const watcher = sizeWatcher()
  const metrics = createTrackMetrics({ track: () => element, SizeWatcherImpl: watcher.Impl })
  metrics.start()
  assert.equal(metrics.pctAt(0 + 14, 14), 0)
  // The menu was measured and repositioned; the track is now wider.
  width = 400
  watcher.fire()
  assert.ok(metrics.pctAt(200, 14) < 1, 'the new width must be in use after the observer fired')
  metrics.dispose()
  assert.equal(watcher.instances[0].disconnected, true, 'dispose must disconnect')
})

test('metrics are safe with no element, no usable width and no observer', function () {
  const metrics = createTrackMetrics({ track: () => null, SizeWatcherImpl: null })
  metrics.start()
  assert.equal(metrics.pctAt(50, 14), null, 'no element means no position, not 0')
  metrics.dispose()

  const zeroWidth = createTrackMetrics({ track: () => ({ getBoundingClientRect: () => ({ left: 0, width: 10 }) }), SizeWatcherImpl: null })
  zeroWidth.start()
  assert.equal(zeroWidth.pctAt(5, 14), null, 'a track narrower than the knob cannot map a position')
  zeroWidth.dispose()
})
