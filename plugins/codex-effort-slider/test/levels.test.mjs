/**
 * Level arithmetic and the directory-snapshot readers.
 *
 * The two regressions pinned here are the ones that produced user-visible "the
 * slider jumps / lies" reports upstream:
 *   · a single-level model must pin the knob to the RIGHT (that one level is the
 *     maximum, not "leftmost/off");
 *   · an empty level list must not fling the knob anywhere, and a release landing in
 *     an empty list must not be treated as level 0.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPTY_SNAPSHOT,
  detentTargetIndex,
  effectiveEffortId,
  indexFromPct,
  indexOfLevel,
  levelsOf,
  modelOf,
  pctFromIndex,
  reasoningSupport,
  resolveLevels,
} from '../client/src/levels.js'

/** A snapshot in the shape the host's directory store returns. */
function snapshot(efforts, options = {}) {
  const model = {
    id: options.modelId ?? 'deepseek-v41-flash',
    name: 'DeepSeek-V41-Flash',
    reasoning: { defaultEffort: options.defaultEffort ?? 'high', efforts },
  }
  return {
    current: {
      provider: options.provider ?? 'deepseek',
      model: model.id,
      ...(options.effort === undefined ? {} : { reasoningEffort: options.effort }),
    },
    groups: [{ id: options.provider ?? 'deepseek', name: 'DeepSeek', models: [model] }],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
  }
}

const FOUR = [
  { id: 'off', name: 'Off' },
  { id: 'low', name: 'Low' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max' },
]

test('levelsOf reads the exact model\'s advertised efforts in catalog order', function () {
  const levels = levelsOf(snapshot(FOUR))
  assert.deepEqual(levels.map((level) => level.id), ['off', 'low', 'high', 'max'])
  assert.deepEqual(levels.map((level) => level.name), ['Off', 'Low', 'High', 'Max'])
})

test('levelsOf drops entries with no usable id, and falls back to the id as a name', function () {
  // Writing an unknown effort id back to the host is rejected by the adapter, so a
  // level we cannot commit must not appear at all — a slider that offers it would lie.
  const levels = levelsOf(snapshot([
    { id: 'low', name: 'Low' },
    { id: '', name: 'Broken' },
    { name: 'No id' },
    null,
    { id: 'max' },
  ]))
  assert.deepEqual(levels.map((level) => level.id), ['low', 'max'])
  assert.equal(levels[1].name, 'max', 'a missing display name falls back to the id')
})

test('levelsOf is empty for a model without reasoning metadata', function () {
  const snap = snapshot([])
  delete snap.groups[0].models[0].reasoning
  assert.deepEqual(levelsOf(snap), [])
  // ...and that is what makes the whole control disappear rather than render inert.
  assert.deepEqual(levelsOf(EMPTY_SNAPSHOT), [])
})

test('modelOf matches on provider AND model id', function () {
  const snap = snapshot(FOUR)
  assert.equal(modelOf(snap)?.id, 'deepseek-v41-flash')
  assert.equal(modelOf({ ...snap, current: { provider: 'other', model: 'deepseek-v41-flash' } }), null)
  assert.equal(modelOf({ ...snap, current: { provider: 'deepseek', model: 'nope' } }), null)
  assert.equal(modelOf(EMPTY_SNAPSHOT), null)
  assert.equal(modelOf(null), null)
})

test('effectiveEffortId prefers the explicit choice, then the model default', function () {
  assert.equal(effectiveEffortId(snapshot(FOUR, { effort: 'max' })), 'max')
  assert.equal(effectiveEffortId(snapshot(FOUR)), 'high', 'no explicit choice → the model default')
  assert.equal(effectiveEffortId(snapshot(FOUR, { effort: '' })), 'high', 'an empty string is not a choice')
  const noReasoning = snapshot([])
  delete noReasoning.groups[0].models[0].reasoning
  assert.equal(effectiveEffortId(noReasoning), null)
})

test('a single level pins to the RIGHT, not to the left (upstream issue #7)', function () {
  // One level means "there is exactly one effort, and it is the maximum". Pinning the
  // knob at 0 would read as "off", which is the opposite of the truth.
  assert.equal(pctFromIndex(0, 1), 1)
  assert.equal(pctFromIndex(5, 1), 1)
})

test('an empty level list positions at 0 and never flings the knob to the right', function () {
  assert.equal(pctFromIndex(0, 0), 0)
  assert.equal(pctFromIndex(3, 0), 0)
  assert.equal(indexFromPct(0.9, 0), 0)
  assert.equal(indexFromPct(0.9, 1), 0)
})

test('pctFromIndex and indexFromPct round-trip every level of 2/4/6-level models', function () {
  for (const count of [2, 4, 6]) {
    for (let index = 0; index < count; index += 1) {
      const pct = pctFromIndex(index, count)
      assert.equal(indexFromPct(pct, count), index,
        `count=${count} index=${index} did not round-trip through pct=${pct}`)
    }
  }
})

test('indexFromPct snaps to the nearest level and clamps out-of-range input', function () {
  // 4 levels sit at 0, 1/3, 2/3, 1. The midpoint between 0 and 1/3 is 1/6.
  assert.equal(indexFromPct(0.1, 4), 0)
  assert.equal(indexFromPct(0.2, 4), 1)
  assert.equal(indexFromPct(0.5, 4), 2)
  assert.equal(indexFromPct(1, 4), 3)
  assert.equal(indexFromPct(-5, 4), 0)
  assert.equal(indexFromPct(5, 4), 3)
  assert.equal(indexFromPct(NaN, 4), 0, 'NaN must not propagate into the knob position')
})

test('indexOfLevel finds a level by id and refuses an unknown or non-string one', function () {
  const levels = levelsOf(snapshot(FOUR))
  assert.equal(indexOfLevel(levels, 'high'), 2)
  assert.equal(indexOfLevel(levels, 'nope'), -1)
  assert.equal(indexOfLevel(levels, null), -1)
  assert.equal(indexOfLevel(levels, undefined), -1)
})

test('resolveLevels keeps the last non-empty list across a transient empty snapshot', function () {
  // THE REGRESSION. While a model is being switched the host momentarily reports no
  // efforts. A release landing in that window computed levelCount = 0, aborted the
  // write-back, and the display snapped back — "it pauses, then jumps a notch".
  const cache = { key: null, levels: [] }
  const live = levelsOf(snapshot(FOUR))
  assert.deepEqual(resolveLevels(live, 'deepseek\u0000deepseek-v41-flash', cache), live)
  assert.deepEqual(resolveLevels([], 'deepseek\u0000deepseek-v41-flash', cache), live,
    'an empty list for the SAME model falls back to the cache')
})

test('resolveLevels refuses to reuse a cache that belongs to a DIFFERENT model', function () {
  const cache = { key: null, levels: [] }
  const live = levelsOf(snapshot(FOUR))
  resolveLevels(live, 'deepseek\u0000model-a', cache)
  // A real model change must not hand the new model the old model's levels: their ids
  // and meanings differ, and writing one back would set an effort nobody chose.
  assert.deepEqual(resolveLevels([], 'deepseek\u0000model-b', cache), [])
})

test('resolveLevels never reuses the cache when the identity is UNKNOWN', function () {
  // THE REGRESSION. The old predicate read `liveKey === null || …`, i.e. it treated "I
  // do not know which model this is" as "any cached list will do". A snapshot without a
  // usable provider/model therefore inherited the previous model's levels: the slider
  // rendered rungs for a model that offers none, and a drag could write an effort id
  // that model rejects. No identity means no evidence, so: no reuse.
  const cache = { key: null, levels: [] }
  const live = levelsOf(snapshot(FOUR))
  resolveLevels(live, 'deepseek\u0000model-a', cache)
  assert.deepEqual(resolveLevels([], null, cache), [], 'a null identity must not inherit anything')
  assert.deepEqual(resolveLevels([], 'deepseek\u0000model-a', cache), live,
    'while a KNOWN identical identity still gets the transient-empty fallback')
  // And an unknown identity must not POISON the cache for the model that is still cached.
  assert.equal(cache.key, 'deepseek\u0000model-a')
})

test('resolveLevels refuses the cache when the model DEFINITIVELY has no reasoning', function () {
  // THE OTHER HALF OF THE SAME BUG, and the one identity alone cannot catch: the model
  // is identifiable (same provider/model as the cached one) but its catalog entry has
  // NO `reasoning` block. `efforts` is `[]` for a definitive reason, not a transient
  // one, so the cached list must not resurrect the control.
  const cache = { key: null, levels: [] }
  const live = levelsOf(snapshot(FOUR))
  resolveLevels(live, 'deepseek\u0000deepseek-v41-flash', cache)

  const noReasoning = { current: { provider: 'deepseek', model: 'deepseek-v41-flash' }, groups: [{ id: 'deepseek', models: [{ id: 'deepseek-v41-flash', name: 'X' }] }] }
  assert.equal(reasoningSupport(noReasoning), false, 'a known model without a reasoning block answers false')
  assert.deepEqual(resolveLevels([], 'deepseek\u0000deepseek-v41-flash', cache, false), [],
    'a definitive "no reasoning" must not fall back to the cache')
})

test('reasoningSupport separates transient-empty from definitively-absent', function () {
  // Three answers, and the third one is what the empty list cannot express on its own.
  assert.equal(reasoningSupport(snapshot(FOUR)), true, 'a model WITH efforts supports reasoning')
  const noReasoning = { current: { provider: 'deepseek', model: 'deepseek-v41-flash' }, groups: [{ id: 'deepseek', models: [{ id: 'deepseek-v41-flash', name: 'X' }] }] }
  assert.equal(reasoningSupport(noReasoning), false, 'a known model without efforts does NOT')
  // The catalog does not know this model yet: unknown, so the cache may still serve.
  const unknownModel = { current: { provider: 'deepseek', model: 'not-in-catalog' }, groups: [{ id: 'deepseek', models: [] }] }
  assert.equal(reasoningSupport(unknownModel), null, 'an unknown model is null, not false')
  assert.equal(reasoningSupport(null), null)
  assert.equal(reasoningSupport({ current: null }), null)
  assert.equal(reasoningSupport(EMPTY_SNAPSHOT), null)
  // …and an unknown model still gets the transient-empty fallback.
  const cache = { key: null, levels: [] }
  const live = levelsOf(snapshot(FOUR))
  resolveLevels(live, 'deepseek\u0000deepseek-v41-flash', cache)
  assert.deepEqual(resolveLevels([], 'deepseek\u0000deepseek-v41-flash', cache, null), live)
})

test('resolveLevels updates the cache when a non-empty list arrives', function () {
  const cache = { key: null, levels: [] }
  const two = levelsOf(snapshot([{ id: 'high', name: 'High' }, { id: 'max', name: 'Max' }]))
  resolveLevels(two, 'deepseek\u0000model-a', cache)
  assert.equal(cache.key, 'deepseek\u0000model-a')
  assert.deepEqual(cache.levels.map((level) => level.id), ['high', 'max'])
})

test('the fast-mode detent advances at +1/3 and retreats only at -2/3', function () {
  // The hysteresis is what stops a pointer wobbling on the line from flickering
  // between two notches.
  const count = 4
  assert.equal(detentTargetIndex(1 + 0.2, 1, count, 1 / 3), 1, 'just under +1/3: stay')
  // Crossing the line advances by AT LEAST one notch even when `round` would stay put
  // (pos 1.34 rounds to 1, but the rule is "you crossed it, so step to 2"). That is
  // upstream's deliberate `Math.max(lo + 1, Math.round(p))`.
  assert.equal(detentTargetIndex(1 + 0.34, 1, count, 1 / 3), 2, 'crossed +1/3: at least one notch')
  assert.equal(detentTargetIndex(1.5, 1, count, 1 / 3), 2, 'a fast drag crosses at once')
  assert.equal(detentTargetIndex(1 - 0.5, 1, count, 1 / 3), 1, 'a small retreat must not step back')
  assert.equal(detentTargetIndex(1 - 0.7, 1, count, 1 / 3), 0, 'past -2/3 it steps back')
})

test('the detent clamps at both ends and never returns an index outside the list', function () {
  assert.equal(detentTargetIndex(99, 0, 4, 1 / 3), 3)
  assert.equal(detentTargetIndex(-99, 3, 4, 1 / 3), 0)
  assert.equal(detentTargetIndex(2, 0, 1, 1 / 3), 0, 'a single level never moves')
  assert.equal(detentTargetIndex(2, 0, 0, 1 / 3), 0)
})
