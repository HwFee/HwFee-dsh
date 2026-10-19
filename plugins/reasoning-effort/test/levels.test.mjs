/**
 * Level resolution: the stop list and the copy, both data-driven.
 *
 * THE CONTRACT THESE TESTS PIN. The slider's stop count is
 * `reasoning.efforts.length` for the selected model — never a constant. The
 * reference component's five-level `EFFORT_META` is a COPY TABLE keyed by id,
 * not a stop list: an advertised `minimal` must appear as a stop with the
 * catalog's own name, and an adapter that advertises nothing must produce no
 * row at all.
 *
 *   node test/levels.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLevelModel, isAdvertised, isKnownLevelId, orderEfforts, stopAt,
} from '../client/src/levels.js'
import { LEVEL_META_IDS, WARNING_LEVEL_ID } from '../client/src/constants.js'
import { en, makeT, makeTranslator, zh } from '../client/src/locales.js'

/** The reference repo's EFFORT_META, for cross-checking the copy table. */
const REFERENCE = {
  low: { name: 'Low', desc: 'Quick replies to simple questions' },
  medium: { name: 'Medium', desc: 'Light, casual tasks' },
  high: { name: 'High', desc: 'Balanced for everyday work' },
  xhigh: { name: 'Extra', desc: 'Complex, detailed work' },
  max: {
    name: 'Max',
    desc: 'The hardest problems. Takes longest.',
    warning: 'May use excessive tokens resulting in long response times and may hit token limits. Use sparingly for the hardest tasks.',
  },
}

const t = makeTranslator(en)
const tzh = makeTranslator(zh)

/** A catalog `reasoning` record from a list of ids. */
function reasoning(ids, defaultEffort) {
  return {
    efforts: ids.map(function (id) {
      return { id: id, name: id.charAt(0).toUpperCase() + id.slice(1) }
    }),
    ...(defaultEffort === undefined ? {} : { defaultEffort: defaultEffort }),
  }
}

// ------------------------------------------------- the five-id copy table

test('the copy table covers exactly the reference ids', function () {
  assert.deepEqual(LEVEL_META_IDS, ['low', 'medium', 'high', 'xhigh', 'max'])
  for (const id of LEVEL_META_IDS) assert.ok(isKnownLevelId(id), id + ' must be a known id')
  for (const id of ['minimal', 'off', 'turbo', 'LOW', '']) {
    assert.equal(isKnownLevelId(id), false, id + ' must not be a known id')
  }
})

test('every known level carries the reference name and description, in both languages', function () {
  for (const id of LEVEL_META_IDS) {
    const ref = REFERENCE[id]
    assert.equal(en['level.' + id + '.name'], ref.name, id + ' en name drifted from the reference')
    assert.equal(en['level.' + id + '.desc'], ref.desc, id + ' en description drifted from the reference')
    assert.ok(en['level.' + id + '.desc'].trim().length > 0, id + ' en description is empty')
    for (const suffix of ['name', 'desc']) {
      assert.ok(Object.hasOwn(zh, 'level.' + id + '.' + suffix), 'zh missing level.' + id + '.' + suffix)
    }
  }
})

test('the reference max warning is the copy that ships, in both languages', function () {
  assert.equal(en['level.max.warning'], REFERENCE.max.warning)
  assert.ok(zh['level.max.warning'].length > 0)
})

// --------------------------------------------- the stop list is NOT fixed

test('zero advertised levels produce no row at all', function () {
  // The real case: xiaomi/mimo-v2.6-pro declares no reasoningEfforts.
  for (const input of [null, undefined, {}, { efforts: [] }]) {
    const model = buildLevelModel({ reasoning: input, t: t })
    assert.equal(model.mode, 'none', 'no advertised level must render nothing')
    assert.deepEqual(model.stops, [])
    assert.equal(model.index, -1)
    assert.equal(model.description, undefined)
    assert.equal(model.warning, false)
  }
  // A model entry that is absent from the catalog entirely.
  assert.equal(buildLevelModel({ reasoning: null, t: t }).mode, 'none')
  // Garbage in `efforts` is filtered, not invented around.
  assert.equal(buildLevelModel({ reasoning: { efforts: 'low' }, t: t }).mode, 'none')
  assert.equal(buildLevelModel({ reasoning: { efforts: [null, {}, { id: '' }] }, t: t }).mode, 'none')
})

test('exactly one advertised level is a label, not a one-stop slider', function () {
  const model = buildLevelModel({ reasoning: reasoning(['high']), t: t })
  assert.equal(model.mode, 'label', 'a single stop is not a slider')
  assert.equal(model.stops.length, 1)
  assert.equal(model.stops[0].name, 'High')
  assert.equal(model.selected, 'high')
})

test('two advertised levels produce two stops — not five', function () {
  const model = buildLevelModel({ reasoning: reasoning(['low', 'high']), t: t })
  assert.equal(model.mode, 'slider')
  assert.equal(model.stops.length, 2)
  assert.deepEqual(model.stops.map(function (s) { return s.id }), ['low', 'high'])
  assert.deepEqual(model.stops.map(function (s) { return s.name }), ['Low', 'High'])
})

test('three advertised levels produce three stops', function () {
  // group/deepseek-v4.1-flash and stepfun-cn/step-5-preview in the profile.
  const model = buildLevelModel({ reasoning: reasoning(['low', 'medium', 'high']), t: t })
  assert.equal(model.stops.length, 3)
  assert.deepEqual(model.stops.map(function (s) { return s.id }), ['low', 'medium', 'high'])
})

test('five advertised levels produce five stops', function () {
  // devin/claude-sonnet-5-5 in the profile.
  const model = buildLevelModel({ reasoning: reasoning(LEVEL_META_IDS), t: t })
  assert.equal(model.stops.length, 5)
  assert.deepEqual(model.stops.map(function (s) { return s.id }), LEVEL_META_IDS)
})

test('the stop count tracks the catalog, model by model', function () {
  // Every shape the user's own profile declares, in one sweep.
  const catalogue = {
    'group/deepseek-v4.1-flash': ['low', 'high', 'max'],
    'stepfun-cn/step-5-preview': ['low', 'medium', 'high'],
    'xiaomi/mimo-v2.6-pro': [],
    'devin/swe-2': ['medium', 'high', 'max'],
    'devin/gemini-4-argon': ['low', 'medium', 'high'],
    'devin/claude-sonnet-5-5': ['low', 'medium', 'high', 'xhigh', 'max'],
  }
  for (const [model, ids] of Object.entries(catalogue)) {
    const built = buildLevelModel({ reasoning: reasoning(ids), t: t })
    const expected = ids.length === 0 ? 'none' : ids.length === 1 ? 'label' : 'slider'
    assert.equal(built.mode, expected, model + ' should render ' + expected)
    assert.equal(built.stops.length, ids.length, model + ' stop count must equal the advertised count')
  }
})

// ------------------------------------------------- unknown ids never invent

test('an unknown id keeps the catalog name and gets no invented description', function () {
  const model = buildLevelModel({
    reasoning: {
      efforts: [
        { id: 'minimal', name: 'Minimal' },
        { id: 'low', name: 'Low' },
        { id: 'turbo', name: 'Turbo' },
      ],
    },
    t: t,
  })
  assert.equal(model.stops.length, 3)
  const minimal = model.stops.find(function (s) { return s.id === 'minimal' })
  assert.equal(minimal.name, 'Minimal', 'an unknown id keeps the provider name')
  assert.equal(minimal.known, false)
  assert.equal(minimal.description, undefined, 'never claim a semantic the provider did not state')
  const turbo = model.stops.find(function (s) { return s.id === 'turbo' })
  assert.equal(turbo.name, 'Turbo')
  assert.equal(turbo.description, undefined)
  // The known id in the same list still gets the reference copy.
  const low = model.stops.find(function (s) { return s.id === 'low' })
  assert.equal(low.known, true)
  assert.equal(low.description, REFERENCE.low.desc)
})

test('an unknown id with no catalog name falls back to the id itself', function () {
  const model = buildLevelModel({ reasoning: { efforts: [{ id: 'custom-key' }, { id: 'high' }] }, t: t })
  // Known ids sort first, so the unknown one is last.
  const custom = model.stops.find(function (s) { return s.id === 'custom-key' })
  assert.equal(custom.name, 'custom-key')
  assert.equal(custom.description, undefined)
  assert.deepEqual(model.stops.map(function (s) { return s.id }), ['high', 'custom-key'])
})

test('the warning rides the max id only', function () {
  assert.equal(WARNING_LEVEL_ID, 'max')
  const withMax = buildLevelModel({ reasoning: reasoning(['low', 'max']), selected: 'max', t: t })
  assert.equal(withMax.stops.find(function (s) { return s.id === 'max' }).warning, true)
  assert.equal(withMax.warning, true)
  for (const other of withMax.stops.filter(function (s) { return s.id !== 'max' })) {
    assert.equal(other.warning, false)
  }
  // And it is invisible unless max is the SELECTED stop.
  const notMax = buildLevelModel({ reasoning: reasoning(['low', 'max']), selected: 'low', t: t })
  assert.equal(notMax.warning, false)
})

// ---------------------------------------------------- default vs recommended

test('the Default marker comes from the catalog defaultEffort, never from a constant', function () {
  const high = buildLevelModel({ reasoning: reasoning(['low', 'medium', 'high'], 'high'), t: t })
  assert.deepEqual(high.stops.filter(function (s) { return s.isDefault }).map(function (s) { return s.id }), ['high'])
  // A different model defaults elsewhere; nothing is hardcoded to 'high'.
  const medium = buildLevelModel({ reasoning: reasoning(['low', 'medium', 'high'], 'medium'), t: t })
  assert.deepEqual(medium.stops.filter(function (s) { return s.isDefault }).map(function (s) { return s.id }), ['medium'])
  // No advertised default → no marker at all.
  const none = buildLevelModel({ reasoning: reasoning(['low', 'high']), t: t })
  assert.equal(none.stops.some(function (s) { return s.isDefault }), false)
  assert.equal(none.defaultId, undefined)
  // A default id the provider does not offer cannot mark a stop.
  const stray = buildLevelModel({ reasoning: reasoning(['low', 'high'], 'max'), t: t })
  assert.equal(stray.stops.some(function (s) { return s.isDefault }), false)
})

test('there is no Recommended marker anywhere in the copy', function () {
  for (const dict of [en, zh]) {
    for (const value of Object.values(dict)) {
      assert.ok(!/recommend/i.test(value), 'the reference Recommended badge must be gone: ' + value)
      assert.ok(!/推荐/.test(value), 'the reference Recommended badge must be gone: ' + value)
    }
  }
})

// ------------------------------------------------------- selection + clamp

test('the selected stop is the session effort when the provider still offers it', function () {
  const model = buildLevelModel({ reasoning: reasoning(['low', 'medium', 'high']), selected: 'medium', t: t })
  assert.equal(model.index, 1)
  assert.equal(model.selected, 'medium')
  assert.equal(model.description, REFERENCE.medium.desc)
})

test('the selection clamps onto a shorter list when the model changes', function () {
  // The regression this guards: a session on claude-sonnet-5-5 at xhigh, then
  // the user switches to a model advertising medium/high/max.
  const before = reasoning(['low', 'medium', 'high', 'xhigh', 'max'], 'high')
  assert.equal(buildLevelModel({ reasoning: before, selected: 'xhigh', t: t }).index, 3)

  // With a default: the stale id is gone, so the model's own default takes over
  // — which is also what the Host would use for the next request.
  const withDefault = reasoning(['medium', 'high', 'max'], 'high')
  const clamped = buildLevelModel({ reasoning: withDefault, selected: 'xhigh', t: t })
  assert.equal(clamped.stops.length, 3)
  assert.equal(clamped.index, 1, 'xhigh is gone; the default (high) takes over')
  assert.equal(clamped.selected, 'high')

  // With no default: the first advertised stop, still in range.
  const bare = buildLevelModel({ reasoning: reasoning(['medium', 'high']), selected: 'xhigh', t: t })
  assert.equal(bare.index, 0)
  assert.equal(bare.selected, 'medium')
  assert.ok(bare.index < bare.stops.length)
})

test('a stale selection never leaves the index out of range', function () {
  const model = buildLevelModel({ reasoning: reasoning(['low', 'high']), selected: 'nonsense', t: t })
  assert.ok(model.index >= 0 && model.index < model.stops.length)
})

// --------------------------------------------------------------- ordering

test('an out-of-order catalog is sorted into escalation order, nothing dropped', function () {
  const shuffled = reasoning(['max', 'low', 'xhigh', 'high', 'medium'])
  assert.deepEqual(orderEfforts(shuffled.efforts).map(function (e) { return e.id }), LEVEL_META_IDS)
  const model = buildLevelModel({ reasoning: shuffled, t: t })
  assert.equal(model.stops.length, 5)
  assert.deepEqual(model.stops.map(function (s) { return s.id }), LEVEL_META_IDS)
})

test('unknown ids sort after known ones and keep their relative order', function () {
  const efforts = [
    { id: 'turbo' },
    { id: 'high' },
    { id: 'alpha' },
    { id: 'low' },
  ]
  assert.deepEqual(orderEfforts(efforts).map(function (e) { return e.id }), ['low', 'high', 'turbo', 'alpha'])
})

test('ordering is stable across repeated calls and does not mutate the input', function () {
  const efforts = reasoning(['high', 'low']).efforts
  const copy = efforts.slice()
  const first = orderEfforts(efforts)
  const second = orderEfforts(efforts)
  assert.deepEqual(first.map(function (e) { return e.id }), second.map(function (e) { return e.id }))
  assert.deepEqual(efforts, copy, 'the catalog array must not be reordered in place')
  assert.notEqual(first, efforts)
})

// -------------------------------------------------------- index → level

test('stopAt snaps and clamps an index into the advertised list', function () {
  const stops = [{ id: 'low' }, { id: 'medium' }, { id: 'high' }]
  assert.equal(stopAt(stops, 0).id, 'low')
  assert.equal(stopAt(stops, 2).id, 'high')
  assert.equal(stopAt(stops, 1.4).id, 'medium', 'a fractional index snaps')
  assert.equal(stopAt(stops, 1.6).id, 'high')
  assert.equal(stopAt(stops, 99).id, 'high', 'past the end clamps to the last stop')
  assert.equal(stopAt(stops, -7).id, 'low', 'before the start clamps to the first')
  assert.equal(stopAt(stops, NaN).id, 'low')
  assert.equal(stopAt(stops, '1').id, 'medium', 'a string from the DOM still resolves')
  assert.equal(stopAt([], 0), undefined)
  assert.equal(stopAt(null, 0), undefined)
})

test('isAdvertised refuses an id the provider did not offer', function () {
  const stops = [{ id: 'medium' }, { id: 'high' }]
  assert.equal(isAdvertised(stops, 'high'), true)
  assert.equal(isAdvertised(stops, 'low'), false, 'a stale id must be refused, not written')
  assert.equal(isAdvertised(stops, ''), false)
  assert.equal(isAdvertised(stops, undefined), false)
  assert.equal(isAdvertised(stops, 3), false)
  assert.equal(isAdvertised([], 'high'), false)
})

// ------------------------------------------------------------- localisation

test('the same catalog renders Chinese names under the zh translator', function () {
  const model = buildLevelModel({ reasoning: reasoning(['low', 'medium', 'max']), selected: 'max', t: tzh })
  assert.deepEqual(model.stops.map(function (s) { return s.name }), ['低', '中', '最高'])
  assert.equal(model.description, zh['level.max.desc'])
  assert.equal(model.warning, true)
})

test('an unknown id keeps the provider name under both translators', function () {
  // The provider's name is data, not copy: it is shown verbatim in both. Known
  // ids sort first, so the unknown one is found by id rather than by position.
  const input = { reasoning: { efforts: [{ id: 'minimal', name: 'Minimal' }, { id: 'high' }] } }
  const byEn = buildLevelModel(Object.assign({ t: t }, input))
  const byZh = buildLevelModel(Object.assign({ t: tzh }, input))
  const pick = function (model) { return model.stops.find(function (s) { return s.id === 'minimal' }) }
  assert.equal(pick(byEn).name, 'Minimal')
  assert.equal(pick(byZh).name, 'Minimal')
  // The known neighbour still localises.
  assert.equal(byEn.stops.find(function (s) { return s.id === 'high' }).name, 'High')
  assert.equal(byZh.stops.find(function (s) { return s.id === 'high' }).name, '高')
})

test('buildLevelModel tolerates a missing translator', function () {
  const model = buildLevelModel({ reasoning: reasoning(['low', 'high']) })
  assert.equal(model.mode, 'slider')
  // `makeT`-less callers get the raw key, never a crash; the row never omits `t`.
  assert.equal(model.stops[0].name, 'level.low.name')
})
