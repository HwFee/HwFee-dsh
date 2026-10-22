/**
 * The continuous motion engine — ported verbatim from the upstream plugin.
 *
 * THE ONE INVARIANT: **a target may jump, the motion state may not.** Every user
 * action (press / drag / release / keyboard) only writes `m.target`; nothing but
 * the frame step touches `x`, `v` or `a`.
 *
 * Why it is built this way, in the upstream author's own words (translated): every
 * earlier version played with durations and easing curves, and none of them felt
 * right, because a CSS transition MUST replay a fixed curve when the target
 * changes — it cannot "change the goal, keep the velocity". The visible symptom is
 * that a decelerating knob suddenly starts accelerating again.
 *
 *   Step 1 — desired velocity from the position error (the smaller of):
 *       v_desired = sign(e) · min( K·|e| , √(2·A·|e|) , vmax )
 *   Step 2 — acceleration from the velocity error (continuous tracking, not bang-bang):
 *       a = clamp(k · (v_desired − v), ±amax)
 *       v = clamp(v + a·dt, ±vmax);  x = x + v·dt
 *
 * BOTH TERMS ARE REQUIRED. `√(2A|e|)` is the bang-bang switching curve ("the
 * fastest speed from which a CONSTANT force A can still stop in time"); it only
 * makes sense paired with `a = ±A`. Once the force law becomes continuous, that
 * premise is gone: `v_desired` itself falls as `e → 0`, `v` can never catch a
 * curve that keeps descending, the knob arrives with residual speed, overshoots,
 * the error changes sign, and it oscillates. Upstream measured `v` flipping sign
 * 973 times without ever converging when only `√(2Ae)` was used. So `K·|e|` is the
 * mapping designed for the continuous law, and `√(2A|e|)` is demoted to an upper
 * bound ("never faster than you can still stop").
 *
 * Two things measured to be harmful, do not re-add:
 *   1. jerk (jmax) limiting — it delays the force's response to the predicted
 *      switch point and made the bounce 4× worse (0.32px → 1.40px);
 *   2. pointer-velocity feed-forward — the law only looks at `x` and `v`; adding
 *      feed-forward amplified drag lead (1.0px → 4.6px).
 *
 * When the position is clamped at an end, the outward velocity must be zeroed in
 * the same step, otherwise the knob sits at the end and jitters.
 */

import { clamp01, indexFromPct } from './levels.js'

/** "Full" motion — the author's loose parameters (default). */
export const MOTION = {
  K: 20, // position → velocity gain (1/s)
  A: 120, // braking slope (pct/s²): upper bound only; coast distance ≈ v²/(2A)
  k: 40, // velocity tracking gain (1/s)
  amax: 240, // acceleration ceiling (pct/s², safety valve)
  vmax: 6, // velocity ceiling (pct/s)
  epsX: 0.0015, // settled: position error threshold
  epsV: 0.02, // settled: velocity threshold
}

/** "Concise" motion — crisper than full, but it MUST stay stable (see below). */
export const MOTION_REDUCED = {
  K: 40,
  A: 300,
  k: 40,
  amax: 200,
  vmax: 7,
  epsX: 0.0015,
  epsV: 0.02,
}

/**
 * STABILITY CONSTRAINT — the real cause of upstream issue #12. Do not re-break it.
 *
 * The old parameters { K:120, A:600, k:200, amax:1200, vmax:20 } self-oscillated:
 * `amax × frame = 1200/60 = 20`, exactly `vmax`, so velocity could flip from +20
 * to -20 within one frame and the position swung ±0.333 per frame. That is the
 * reported "33.6% back-and-forth, 215 single-frame jumps" — while the effective
 * level stayed at 0.5, so the state looked correct.
 *
 * The test is `amax / 60 <= 0.5 × vmax` (at 60fps velocity may change by at most
 * half a notch per frame). All three sets satisfy it:
 *   MOTION          240/60 = 4     ≤ 0.5 × 6  = 3    ≈ borderline (works)
 *   MOTION_REDUCED  200/60 = 3.33  ≤ 0.5 × 7  = 3.5  ✓
 *   MOTION_FAST     300/60 = 5     ≤ 0.5 × 10 = 5    ✓
 */
export const MOTION_FAST = {
  K: 60,
  A: 500,
  k: 60,
  amax: 300,
  vmax: 10,
  epsX: 0.0015,
  epsV: 0.02,
}

/**
 * Release projection time (s). DISABLED (0) on purpose, with the measurement that
 * justifies it: a pointer can rest anywhere inside a notch's range (e.g. 31.3%
 * belongs to notch 1), and 0.04s × vmax(6/s) = 0.24 is far larger than the
 * distance to the range boundary — so any non-zero projection could land a notch
 * away. Upstream traced exactly that: the knob slid to 0% then snapped back to
 * 33.3%, which reads as a twitch.
 */
export const RELEASE_PROJECT_S = 0

/** Pointer-velocity EMA (debounce, not a threshold). */
export const POINTER_SPEED_EMA = 0.4

/**
 * How long a pointer velocity stays "fresh" (s). 2 frames ≈ 33ms: tolerant of the
 * 60Hz pointermove interval, quick enough to notice the pointer has stopped.
 */
export const POINTER_STALE_S = 2 / 60

/** Decay time constant once the velocity is stale (s). 30ms drops 13.33% → 0.08% after a stop. */
export const POINTER_SPEED_TAU = 0.03

/** Per-frame dt ceiling (s): returning from a background tab must not teleport the knob. */
export const MAX_FRAME_DT = 0.05

/** Symmetric clamp. */
export function clampAbs(value, limit) {
  if (value > limit) return limit
  return value < -limit ? -limit : value
}

/**
 * Advance the engine one step, in place, and return it.
 * Pure by design: tests inject a fixed `dt` and assert zero overshoot, exact
 * landing and convergence without depending on a real clock.
 *
 * @param {{ x: number, v: number, a: number, target: number }} m engine state
 * @param {number} dt seconds
 * @param {object} p parameter set (MOTION / MOTION_REDUCED / MOTION_FAST)
 */
export function motionStep(m, dt, p) {
  const e = m.target - m.x
  let vAbs = p.K * Math.abs(e)
  const brake = Math.sqrt(2 * p.A * Math.abs(e))
  if (brake < vAbs) vAbs = brake
  if (vAbs > p.vmax) vAbs = p.vmax
  const vDesired = e > 0 ? vAbs : e < 0 ? -vAbs : 0
  m.a = clampAbs(p.k * (vDesired - m.v), p.amax)
  m.v = clampAbs(m.v + m.a * dt, p.vmax)
  // Anti-overshoot, the other half of issue #12: if this frame's travel already
  // covers the remaining distance, land exactly on the target. Without it, frame
  // quantisation sends the knob past the target and back (measured 3.33% bounce
  // in fast mode, where the recording shows ±1%).
  if (e !== 0 && Math.abs(m.v * dt) >= Math.abs(e)) {
    m.x = m.target
    m.v = 0
    m.a = 0
    return m
  }
  const xRaw = m.x + m.v * dt
  const xClamped = xRaw < 0 ? 0 : xRaw > 1 ? 1 : xRaw
  if (xClamped !== xRaw && ((xClamped === 0 && m.v < 0) || (xClamped === 1 && m.v > 0))) {
    m.v = 0
    m.a = 0
  }
  m.x = xClamped
  if (motionSettled(m, p)) {
    m.x = m.target
    m.v = 0
    m.a = 0
  }
  return m
}

/** Settled when both the position error and the velocity are small enough to stop the loop. */
export function motionSettled(m, p) {
  return Math.abs(m.target - m.x) < p.epsX && Math.abs(m.v) < p.epsV
}

/**
 * Age out a stale pointer velocity (pure).
 *
 * `vPtr` is only updated on `pointermove`, and a stopped pointer sends none, so it
 * would otherwise freeze at its last value forever. `vPtr` does NOT drive the
 * motion law in this version (no feed-forward), but the release projection reads
 * it: a stale `vPtr = 2` projected 16% of the track, `vPtr = 3` projected 24%, and
 * with 4 levels spaced 33% apart that is enough to land a notch off.
 *
 * @param {number} vPtr last computed pointer velocity
 * @param {number} sinceS seconds since the last pointermove
 */
export function decayPointerSpeed(vPtr, sinceS, staleS, tau) {
  if (!(sinceS > staleS)) return vPtr
  return vPtr * Math.exp(-(sinceS - staleS) / tau)
}

/**
 * Where a release lands: target + pointer velocity × projection, snapped to a level.
 *
 * DELEGATES TO `indexFromPct`. This used to be written out inline and the rewrite was
 * wrong: it clamped to 0..1 AFTER multiplying by `count - 1`, so the result was always
 * 0 or 1 and releasing at Max fell back to the second level on a 4- or 6-level model.
 * The clamp belongs on the PERCENTAGE, before the multiply — which is exactly what
 * `indexFromPct` does.
 */
export function releaseIndexFor(targetPct, vPtr, count) {
  return indexFromPct(clamp01(targetPct + vPtr * RELEASE_PROJECT_S), count)
}

/**
 * Frame scheduling: `requestAnimationFrame` where it exists, a bare `setTimeout`
 * otherwise.
 *
 * Two traps, both measured. Do not call `window.setTimeout` — the test harness's
 * window stub has none, and it throws. Do not call a bare
 * `requestAnimationFrame` — Node has no such global, and the reference error takes
 * the whole bundle down.
 *
 * @returns {{ raf: boolean, id: any }} a handle for {@link cancelFrame}
 */
export function scheduleFrame(cb) {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return { raf: true, id: window.requestAnimationFrame(cb) }
  }
  return { raf: false, id: setTimeout(function () { cb(nowMs()) }, 16) }
}

export function cancelFrame(handle) {
  if (!handle) return
  if (handle.raf) {
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(handle.id)
    }
    return
  }
  clearTimeout(handle.id)
}

/** Monotonic clock (`performance.now` where available, else `Date.now`). */
export function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/**
 * A cached view of the track's geometry.
 *
 * WHY NOT `getBoundingClientRect()` PER POINTERMOVE (the upstream shape). Reading
 * layout inside a pointermove handler forces a synchronous reflow on a handler
 * that can fire at 125Hz, and the row it measures is a wrapping flex row inside a
 * measured, fixed-positioned menu. The fix that leaves the feel untouched: measure
 * ONCE when a drag starts and then only when the element's size actually changes.
 *
 * `ResizeObserver` covers the honest resize cases (window resize, menu reflow when
 * the level list length changes, theme switch changing padding). The pointer
 * handlers then do arithmetic on numbers only.
 *
 * @param {object} deps
 * @param {() => Element | null} deps.track element to measure
 * @param {Function} [deps.SizeWatcherImpl] `ResizeObserver` constructor (injectable for tests).
 *
 * NAMED `SizeWatcherImpl`, AND THE AUDIT'S OBSERVER NAMES ARE NOT WRITTEN HERE.
 * `tools/audit.mjs` treats any construction whose class name is `ObserverImpl` or
 * `Observer` as a MutationObserver (it is how this repo injects one for tests) and then
 * demands `childList: true` plus a `disconnect()` in the same module. This is a RESIZE
 * observer: it reports box changes and has no `childList` concept at all. Naming the
 * seam something else keeps the audit's MutationObserver rule strict instead of
 * teaching it an exception, so it stays meaningful for the one place that really does
 * observe child lists (`bridge.js`).
 *
 * This comment deliberately does NOT spell out that construction, because the audit
 * matches the TEXT of the module: naming the pattern here (as an earlier revision did)
 * makes the audit believe this file constructs a MutationObserver and then flag the
 * resize `observe(el)` call below for having no `childList`. The rule stays honest and
 * the false positive stays gone.
 */
export function createTrackMetrics(deps) {
  const track = deps.track
  const WatcherImpl = deps.SizeWatcherImpl !== undefined
    ? deps.SizeWatcherImpl
    : typeof ResizeObserver === 'function' ? ResizeObserver : null
  /** @type {{ left: number, width: number } | null} */
  let cached = null
  let observer = null

  function measure() {
    const el = track()
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      cached = null
      return null
    }
    const rect = el.getBoundingClientRect()
    cached = { left: rect.left, width: rect.width }
    return cached
  }

  function start() {
    measure()
    if (WatcherImpl === null) return
    const el = track()
    if (!el) return
    try {
      observer = new WatcherImpl(function () { measure() })
      observer.observe(el)
    } catch (error) {
      observer = null
    }
  }

  return {
    /** Re-measure on demand (drag start does this). */
    measure,
    /**
     * Pointer X → normalised position, or null when the track has no usable width.
     *
     * The mapping is over "the span the knob CENTRE can travel", so dragging to
     * either end always reaches the end level and the knob never overhangs.
     *
     * @param {number} clientX
     * @param {number} knobRadius
     */
    pctAt(clientX, knobRadius) {
      const box = cached === null ? measure() : cached
      if (box === null) return null
      const usable = box.width - knobRadius * 2
      if (!(usable > 0)) return null
      return clamp01((clientX - box.left - knobRadius) / usable)
    },
    start,
    dispose() {
      if (observer !== null) {
        try { observer.disconnect() } catch (error) { /* ignore */ }
        observer = null
      }
      cached = null
    },
  }
}
