/**
 * Position → colour, energy and starfield parameters. Pure functions.
 *
 * Everything here is driven by ONE number (the knob's position 0..1), so the
 * visual state is a continuous function of the slider rather than a mode switch.
 * All of it is deterministic: the 22 particles come from index arithmetic, never
 * `Math.random`, so a re-render cannot reshuffle the starfield and the tests can
 * assert exact values.
 */

import {
  COLOR_BLUE,
  COLOR_DEEP,
  COLOR_TEXT_VIOLET,
  COLOR_VIOLET,
  ENERGY_END,
  ENERGY_START,
  GOLDEN_RATIO,
  KNOB_RADIUS,
  MAX_SPEED_FACTOR,
  MIN_HEIGHT_SLOTS,
  STARFIELD_DURATION_MEAN,
  STARFIELD_DURATION_SPREAD,
  STARFIELD_MIN,
} from './constants.js'
import { clamp01 } from './levels.js'

/** Linear RGB interpolation, rounded to integers (so it prints as a clean CSS colour). */
export function mixColor(from, to, t) {
  const k = clamp01(t)
  return [
    Math.round(from[0] + (to[0] - from[0]) * k),
    Math.round(from[1] + (to[1] - from[1]) * k),
    Math.round(from[2] + (to[2] - from[2]) * k),
  ]
}

export function rgbOf(color) {
  return 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')'
}

/** Position → the colour at that point (i.e. the gradient's right end). */
export function fillColorFor(pct) {
  const t = clamp01(pct)
  if (t <= ENERGY_START) return rgbOf(COLOR_BLUE)
  if (t <= ENERGY_END) {
    return rgbOf(mixColor(COLOR_BLUE, COLOR_VIOLET, (t - ENERGY_START) / (ENERGY_END - ENERGY_START)))
  }
  return rgbOf(mixColor(COLOR_VIOLET, COLOR_DEEP, (t - ENERGY_END) / (1 - ENERGY_END)))
}

/**
 * The fill layer's background: ALWAYS blue on the left, the current position's
 * colour on the right. That is what makes `high` read as "blue to violet" and
 * makes dragging right visibly deepen it.
 */
export function fillBackgroundFor(pct) {
  return 'linear-gradient(90deg, ' + rgbOf(COLOR_BLUE) + ', ' + fillColorFor(pct) + ')'
}

/**
 * Is this the "reasoning off" level?
 *
 * DeepSeek's own table uses id `off` / name `Off`, but the id is a provider-owned
 * string, so both fields are checked plus a few synonyms. Anything unrecognised is
 * an ordinary level and gets coloured as one.
 */
export function isOffLevel(level) {
  if (!level) return false
  for (const candidate of [level.id, level.name]) {
    if (typeof candidate !== 'string') continue
    const flat = candidate.replace(/\s+/g, '').toLowerCase()
    if (flat === 'off' || flat === 'none' || flat === '关闭' || flat === '无') return true
  }
  return false
}

/**
 * Colour for the host row's own value text ("Max").
 *
 * Same source as the energy (blue → violet as you go right), but it stops at the
 * LIGHT violet: `COLOR_DEEP` as text is nearly invisible on a dark surface. A
 * string is returned so the caller can assign it straight to `style.color`.
 *
 * THE OFF LEVEL RETURNS AN EMPTY STRING, which clears the inline colour and leaves
 * the host's own grey — the requirement is that "off" looks like the host in both
 * menus, not like a coloured level.
 */
export function valueColorFor(pct, level) {
  if (isOffLevel(level)) return ''
  return rgbOf(mixColor(COLOR_BLUE, COLOR_TEXT_VIOLET, energyFor(pct)))
}

/**
 * Position → energy 0..1: the total strength of the nebula + particles.
 *
 * Purely position-driven and independent of the level count, so the same gesture
 * looks the same on a 2-level and a 6-level model. Anchors: 1/3 → 0 (still clean
 * blue), 2/3 → 0.5 (the `high` of a 4-level model), 1 → 1.
 */
export function energyFor(pct) {
  return clamp01((clamp01(pct) - ENERGY_START) / (1 - ENERGY_START))
}

/**
 * Position → particle speed factor.
 *
 * Anchors come from measurement: `high` (2/3 on a 4-level model) should be 1×
 * — i.e. the speed that already looked right — and the top level 2×. The same
 * slope continues leftward with a 0.35× floor so the low end is not frozen.
 */
export function speedFor(pct) {
  return Math.min(2, Math.max(0.35, 3 * clamp01(pct) - 1))
}

/** Deterministic pseudo-random [0,1): no `Math.random`, so re-renders cannot jump. */
export function starHash01(index, salt) {
  const value = ((index + 1) * salt * 2654435761) % 4294967296
  return ((value >>> 8) % 1000) / 1000
}

/**
 * The 22 particles' heights and phases.
 *
 * TWO INDEPENDENT ASSIGNMENTS, deliberately. An earlier version derived both from
 * the same number, `frac((i+1)×φ)`, which made each successive star sit higher —
 * 22 stars in a diagonal line (measured correlation 0.999) — and the user asked
 * for "more random". So:
 *   · phase  = golden-ratio low-discrepancy sequence (any prefix stays spread out,
 *              which matters because the count grows while dragging);
 *   · height = a deterministically shuffled set of evenly spaced slots, decoupled
 *              from the phase ranking.
 * The shuffle salt is chosen so that two particles ADJACENT IN PHASE (which will
 * travel side by side forever) differ in height by at least `MIN_HEIGHT_SLOTS`.
 */
export const PARTICLES = (function buildParticles() {
  const count = 22
  const out = []
  for (let i = 0; i < count; i += 1) out.push({ y: 0, phase: ((i + 1) * GOLDEN_RATIO) % 1 })

  const byPhase = []
  for (let i = 0; i < count; i += 1) byPhase.push(i)
  byPhase.sort(function (a, b) { return out[a].phase - out[b].phase })

  let slots = null
  for (let salt = 71; salt < 4000 && slots === null; salt += 1) {
    const candidate = []
    for (let i = 0; i < count; i += 1) candidate.push(i)
    candidate.sort(function (a, b) {
      const ha = starHash01(a, salt)
      const hb = starHash01(b, salt)
      return ha === hb ? a - b : ha - hb
    })
    let ok = true
    for (let k = 1; k < count && ok; k += 1) {
      if (Math.abs(candidate[k] - candidate[k - 1]) < MIN_HEIGHT_SLOTS) ok = false
    }
    if (ok) slots = candidate
  }
  if (slots === null) {
    // Fallback: step 5 is coprime with 22, so this is a permutation and adjacent
    // slots always differ by 5 (≥ MIN_HEIGHT_SLOTS).
    slots = []
    for (let i = 0; i < count; i += 1) slots.push((i * 5) % count)
  }
  for (let rank = 0; rank < count; rank += 1) {
    out[byPhase[rank]].y = 8 + (slots[rank] / (count - 1)) * 84
  }
  return out
})()

/** Brightness/size factor for particle `index`, within [STARFIELD_MIN, 1] (brighter = bigger). */
export function starBrightnessFor(index) {
  return STARFIELD_MIN + (1 - STARFIELD_MIN) * starHash01(index, 61)
}

/**
 * Particle `index`'s traversal duration (s).
 *
 * Speed variation by position is kept: the top level is aligned with the baseline
 * duration, `high` is 2× slower, the left end ≈8.6× slower. Individual stars differ
 * by only ±8%, which stops a fast star from catching a slow one and bunching them.
 */
export function starDurationFor(index, speedFactor) {
  const speed = Math.min(MAX_SPEED_FACTOR, Math.max(0.35, typeof speedFactor === 'number' ? speedFactor : MAX_SPEED_FACTOR))
  const spread = 1 - STARFIELD_DURATION_SPREAD + 2 * STARFIELD_DURATION_SPREAD * starHash01(index, 29)
  return (STARFIELD_DURATION_MEAN * MAX_SPEED_FACTOR) / speed * spread
}

/**
 * Particle `index`'s animation delay (s, negative for a phase offset).
 *
 * The phase depends on the INDEX ONLY, never on how many particles are currently
 * shown. That matters: keying it on `i / currentCount` rewrites every mounted
 * `animation-delay` as the count grows during a drag, the spec recomputes progress
 * from the new start time, and the whole starfield visibly jerks and reshuffles.
 * A low-discrepancy sequence also means any prefix is already evenly spread.
 */
export function starDelayFor(index, duration) {
  const particle = PARTICLES[index]
  const phase = particle && typeof particle.phase === 'number' ? particle.phase : 0
  const jitter = starHash01(index, 53) * 0.03 // small, so it does not read as a queue
  return -(((phase + jitter) % 1) * duration)
}

/** Position → how many particles are visible ("gradually appears, gets denser"). */
export function particleCountFor(pct) {
  return Math.round(energyFor(pct) * PARTICLES.length)
}

export function starCountFor(pct) {
  return particleCountFor(pct)
}

/**
 * Position → the star LAYER's opacity, with a floor.
 *
 * The stars must not fade in with the nebula: the nebula's opacity IS the energy,
 * so at `high` (0.5) every star would compute to 0.25–0.5 and vanish against the
 * violet (reported as "at high you can barely see any particles"). "Gradually
 * appears" is expressed by the particle COUNT instead; this only varies 0.6 → 1.
 */
export function starLayerOpacityFor(pct) {
  return 0.6 + 0.4 * energyFor(pct)
}

/**
 * Knob centre / fill end / tick position: `radius + pct × (100% − diameter)`.
 *
 * Anchoring on the radius is what keeps the circle whole: at pct=0 its centre sits
 * inside the left cap, at pct=1 inside the right cap, so no part of it is ever
 * clipped by the rounded track.
 */
export function knobOffsetOf(pct) {
  const t = Math.round(clamp01(pct) * 10000) / 10000
  return 'calc(' + KNOB_RADIUS + 'px + ' + t + ' * (100% - ' + KNOB_RADIUS * 2 + 'px))'
}
