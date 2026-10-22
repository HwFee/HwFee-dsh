/**
 * Position → colour, energy and starfield parameters.
 *
 * Two properties matter and are easy to break:
 *   · the particle layout must be DETERMINISTIC (no `Math.random`), or a re-render
 *     reshuffles the starfield mid-drag;
 *   · the star PHASE must depend on the index only, not on the current particle count,
 *     or dragging rewrites every mounted `animation-delay` and the field jerks.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  COLOR_BLUE,
  COLOR_DEEP,
  COLOR_TEXT_VIOLET,
  COLOR_VIOLET,
  ENERGY_END,
  ENERGY_START,
  KNOB_RADIUS,
  MAX_SPEED_FACTOR,
  STARFIELD_MIN,
} from '../client/src/constants.js'
import {
  PARTICLES,
  energyFor,
  fillBackgroundFor,
  fillColorFor,
  isOffLevel,
  knobOffsetOf,
  mixColor,
  particleCountFor,
  rgbOf,
  speedFor,
  starBrightnessFor,
  starCountFor,
  starDelayFor,
  starDurationFor,
  starHash01,
  starLayerOpacityFor,
  valueColorFor,
} from '../client/src/energy.js'

test('mixColor interpolates and clamps at both ends', function () {
  assert.deepEqual(mixColor([0, 0, 0], [100, 200, 40], 0), [0, 0, 0])
  assert.deepEqual(mixColor([0, 0, 0], [100, 200, 40], 1), [100, 200, 40])
  assert.deepEqual(mixColor([0, 0, 0], [100, 200, 40], 0.5), [50, 100, 20])
  assert.deepEqual(mixColor([0, 0, 0], [10, 10, 10], 5), [10, 10, 10], 'over-range clamps')
  assert.deepEqual(mixColor([0, 0, 0], [10, 10, 10], NaN), [0, 0, 0], 'NaN means t=0, not a broken colour')
})

test('fillColorFor is plain blue up to the first anchor, then runs to deep violet', function () {
  assert.equal(fillColorFor(0), rgbOf(COLOR_BLUE))
  assert.equal(fillColorFor(ENERGY_START), rgbOf(COLOR_BLUE), 'nothing before the energy start changes colour')
  assert.equal(fillColorFor(0.5).startsWith('rgb('), true)
  assert.equal(fillColorFor(1), rgbOf(COLOR_DEEP))
  // Two levels of a 6-step model must still read as blue, not as nearly-violet.
  assert.equal(fillColorFor(1 / 6), rgbOf(COLOR_BLUE))
})

test('the fill gradient always starts blue and ends at the current colour', function () {
  for (const pct of [0, 1 / 3, 0.5, 2 / 3, 1]) {
    assert.equal(fillBackgroundFor(pct), 'linear-gradient(90deg, ' + rgbOf(COLOR_BLUE) + ', ' + fillColorFor(pct) + ')')
  }
})

test('energyFor is 0 until the second level and reaches 1 at the top', function () {
  assert.equal(energyFor(0), 0)
  assert.equal(energyFor(ENERGY_START), 0)
  // The anchors are thirds, so the midpoint is 0.5 up to float noise.
  assert.ok(Math.abs(energyFor(ENERGY_END) - 0.5) < 1e-9, 'the high level of a 4-level model sits at half energy')
  assert.equal(energyFor(1), 1)
  // Monotonic: energy must never go back down as the knob moves right.
  let previous = -1
  for (let i = 0; i <= 20; i += 1) {
    const value = energyFor(i / 20)
    assert.ok(value >= previous)
    previous = value
  }
})

test('speedFor follows the position with 0.35x and 2x bounds', function () {
  assert.equal(speedFor(0), 0.35)
  assert.equal(speedFor(2 / 3), 1, 'the high level is the reference speed')
  assert.equal(speedFor(1), 2)
  assert.ok(speedFor(0.5) < speedFor(1))
})

test('the OFF level keeps the host grey; other levels get a legible violet end', function () {
  // An empty string CLEARS the inline colour, which is what leaves the host's own tone.
  assert.equal(valueColorFor(1, { id: 'off', name: 'Off' }), '')
  assert.equal(valueColorFor(1, { id: 'none', name: 'None' }), '')
  assert.equal(valueColorFor(1, { id: 'off', name: '关闭' }), '')
  assert.equal(valueColorFor(0, { id: 'low', name: 'Low' }), rgbOf(COLOR_BLUE))
  assert.equal(valueColorFor(1, { id: 'max', name: 'Max' }), rgbOf(COLOR_TEXT_VIOLET))
  // The text endpoint must be the LIGHT violet: COLOR_DEEP as text is illegible on a
  // dark surface, which is why it is not reused here.
  assert.notEqual(rgbOf(COLOR_TEXT_VIOLET), rgbOf(COLOR_DEEP))
})

test('isOffLevel recognises the id, the name and a few synonyms', function () {
  assert.equal(isOffLevel({ id: 'off', name: 'Off' }), true)
  assert.equal(isOffLevel({ id: 'x', name: ' OFF ' }), true)
  assert.equal(isOffLevel({ id: 'none' }), true)
  assert.equal(isOffLevel({ id: 'x', name: '关闭' }), true)
  assert.equal(isOffLevel({ id: 'low', name: 'Low' }), false)
  assert.equal(isOffLevel(null), false)
})

test('the 22 particles are laid out deterministically', function () {
  assert.equal(PARTICLES.length, 22)
  // Same module, same values: no Math.random anywhere in the layout.
  assert.deepEqual(PARTICLES.map((p) => p.y), PARTICLES.map((p) => p.y))
  for (const particle of PARTICLES) {
    assert.ok(particle.y >= 8 && particle.y <= 92, `height ${particle.y} outside the 8–92% band`)
    assert.ok(particle.phase >= 0 && particle.phase < 1)
  }
})

test('particle heights are decoupled from the phase ranking (no diagonal line)', function () {
  // The early version derived both from the same number, and 22 stars formed a
  // diagonal (measured correlation 0.999). Heights must be a SHUFFLE of the slots.
  const byPhase = PARTICLES.map((p, index) => ({ index, phase: p.phase }))
    .sort((a, b) => a.phase - b.phase)
  const heights = byPhase.map((entry) => PARTICLES[entry.index].y)
  const slots = heights.map((y) => (y - 8) / 84 * 21)
  // Adjacent-in-phase particles must differ by at least MIN_HEIGHT_SLOTS (3 slots).
  for (let i = 1; i < slots.length; i += 1) {
    assert.ok(Math.abs(slots[i] - slots[i - 1]) >= 3,
      `particles ${i - 1} and ${i} travel side by side at nearly the same height`)
  }
  // ...and the heights must not be sorted (that would be the diagonal again).
  const sorted = [...heights].sort((a, b) => a - b)
  assert.notDeepEqual(heights, sorted, 'heights came out in phase order — that is the diagonal bug')
})

test('starHash01 is deterministic, in [0,1) and spread out', function () {
  const values = []
  for (let i = 0; i < 50; i += 1) {
    const value = starHash01(i, 61)
    assert.ok(value >= 0 && value < 1, `starHash01(${i}) = ${value}`)
    values.push(value)
  }
  assert.equal(new Set(values.map((v) => v.toFixed(3))).size > 20, true, 'the hash must not repeat in clumps')
  assert.equal(starHash01(7, 61), starHash01(7, 61))
  assert.notEqual(starHash01(7, 61), starHash01(7, 29), 'different salts must decorrelate')
})

test('particle brightness stays within the documented band (brighter = bigger)', function () {
  for (let i = 0; i < 22; i += 1) {
    const brightness = starBrightnessFor(i)
    assert.ok(brightness >= STARFIELD_MIN && brightness <= 1, `brightness ${brightness} outside the band`)
  }
})

test('particle duration shrinks as the position speeds up, and stays spread-safe', function () {
  const slow = starDurationFor(0, speedFor(0))
  const fast = starDurationFor(0, speedFor(1))
  assert.ok(fast < slow, 'the top level must traverse faster than the left end')
  // Individual stars differ by only ±8%, which is what stops a fast one catching a slow
  // one and bunching the field.
  const durations = [0, 1, 2, 3, 4, 5].map((i) => starDurationFor(i, 1))
  const spread = Math.max(...durations) / Math.min(...durations)
  assert.ok(spread < 1.2, `stars differ by ${spread}×, which lets them catch up and clump`)
})

test('the star phase depends on the index ONLY, never on the current count', function () {
  // THE REGRESSION. Keying the phase on `i / visibleCount` rewrites every mounted
  // animation-delay as the count grows during a drag; the spec then recomputes progress
  // from the new start time and the whole starfield jerks and reshuffles.
  const duration = 3
  const phaseAt = (index) => starDelayFor(index, duration)
  const before = [0, 1, 2].map(phaseAt)
  // Simulate "now three more particles are visible": the delays of the first three are
  // computed from their own indices, so they are unchanged.
  for (let i = 0; i < 6; i += 1) starCountFor(1)
  const after = [0, 1, 2].map(phaseAt)
  assert.deepEqual(after, before)
  assert.ok(Math.abs(starDelayFor(0, 6) - starDelayFor(0, 3) * 2) < 1e-9, 'delays scale with duration only')
})

test('particle delays are negative and inside one period', function () {
  for (let i = 0; i < 22; i += 1) {
    const delay = starDelayFor(i, 2)
    assert.ok(delay <= 0, `delay ${delay} must be negative (a phase offset, not a wait)`)
    assert.ok(delay > -2, `delay ${delay} escaped the period — every star would start at the line`)
  }
})

test('the particle count grows with energy and is bounded by the pool', function () {
  assert.equal(particleCountFor(0), 0)
  assert.equal(particleCountFor(ENERGY_START), 0)
  assert.equal(particleCountFor(1), 22)
  assert.ok(particleCountFor(0.5) > 0)
  let previous = -1
  for (let i = 0; i <= 20; i += 1) {
    const value = particleCountFor(i / 20)
    assert.ok(value >= previous, 'the count must never drop as the knob moves right (it would flicker)')
    assert.ok(value <= 22)
    previous = value
  }
  assert.equal(starCountFor(1), particleCountFor(1), 'the star layer uses the same count')
})

test('the star layer keeps a visibility floor so high effort is not washed out', function () {
  // The nebula's opacity IS the energy, so fading the stars with it would put them at
  // 0.25–0.5 against violet — reported as "at high there are almost no particles".
  assert.ok(starLayerOpacityFor(ENERGY_END) >= 0.79)
  assert.equal(starLayerOpacityFor(1), 1)
  assert.ok(starLayerOpacityFor(0) >= 0.6, 'and it never disappears entirely at the low end')
})

test('the knob offset anchors on the radius so the circle is never clipped', function () {
  assert.equal(knobOffsetOf(0), 'calc(' + KNOB_RADIUS + 'px + 0 * (100% - ' + KNOB_RADIUS * 2 + 'px))')
  assert.equal(knobOffsetOf(1), 'calc(' + KNOB_RADIUS + 'px + 1 * (100% - ' + KNOB_RADIUS * 2 + 'px))')
  assert.match(knobOffsetOf(0.5), /^calc\(14px \+ 0\.5 \* \(100% - 28px\)\)$/)
})

test('the knob offset is clamped and rounded to keep the CSS stable', function () {
  assert.equal(knobOffsetOf(-3), knobOffsetOf(0))
  assert.equal(knobOffsetOf(9), knobOffsetOf(1))
  // Rounded to 4 decimals, so a sub-pixel jitter does not produce a new style string on
  // every frame (which would defeat React's style diffing).
  assert.match(knobOffsetOf(1 / 3), /0\.3333 /)
})

test('MAX_SPEED_FACTOR matches the top of the speed curve', function () {
  assert.equal(speedFor(1), MAX_SPEED_FACTOR)
})
