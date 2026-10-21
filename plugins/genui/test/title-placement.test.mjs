/**
 * The title-placement preference.
 *
 * Two things are easy to get wrong here and both are invisible in a screenshot:
 *
 *   1. A stored value that no longer exists (a rename, a downgrade) must fall back
 *      to the default rather than rendering the card with a placement the code
 *      does not know.
 *   2. Storage itself can THROW — private mode throws on the property read,
 *      before any method runs — and the card must still render. A cosmetic
 *      preference must never be able to break the answer.
 *
 * The store is also the mechanism that makes a settings change apply to cards
 * already on screen, so its notify contract is asserted too.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  DEFAULT_PLACEMENT, PLACEMENTS, PLACEMENT_LABELS, STORAGE_KEY,
  createPlacementStore, readPlacement, writePlacement,
} = await import('../client/src/settings.js')

/** A storage double that records writes. */
function fakeStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (key) => (Object.hasOwn(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value) },
    data,
  }
}

/** A storage whose every operation throws, like private mode. */
const hostileStorage = {
  get getItem() { throw new Error('SecurityError: storage disabled') },
  setItem() { throw new Error('SecurityError: storage disabled') },
}

test('the default placement is above', function () {
  // Above, centred, is what ZCode's visuals do and what a figure wants.
  assert.equal(DEFAULT_PLACEMENT, 'above')
  assert.deepEqual(PLACEMENTS, ['left', 'above', 'below'])
})

test('a stored placement round-trips', function () {
  const storage = fakeStorage()
  assert.equal(writePlacement(storage, 'below'), true)
  assert.equal(storage.data[STORAGE_KEY], 'below')
  assert.equal(readPlacement(storage), 'below')
})

test('the legacy `inline` value maps to `left`', function () {
  // The first build wrote `inline`; a user who ran it must keep a sensible
  // choice rather than being reset to the default by the rename.
  assert.equal(readPlacement(fakeStorage({ [STORAGE_KEY]: 'inline' })), 'left')
})

test('an unknown stored value falls back to the default', function () {
  // A downgrade, a rename, or a hand-edited key must not produce a card with a
  // placement the renderer does not implement.
  for (const junk of ['sideways', '', 'ABOVE', 'null']) {
    assert.equal(readPlacement(fakeStorage({ [STORAGE_KEY]: junk })), DEFAULT_PLACEMENT,
      `"${junk}" must not be honoured`)
  }
})

test('a storage that throws on read yields the default, not an exception', function () {
  assert.equal(readPlacement(hostileStorage), DEFAULT_PLACEMENT)
  assert.equal(writePlacement(hostileStorage, 'below'), false)
})

test('a missing storage is a no-op, not a crash', function () {
  assert.equal(readPlacement(undefined), DEFAULT_PLACEMENT)
  assert.equal(readPlacement(null), DEFAULT_PLACEMENT)
  assert.equal(writePlacement(undefined, 'below'), false)
})

test('writing an invalid placement is refused', function () {
  const storage = fakeStorage()
  assert.equal(writePlacement(storage, 'sideways'), false)
  assert.equal(readPlacement(storage), DEFAULT_PLACEMENT, 'nothing was stored')
})

test('the store notifies subscribers so mounted cards move immediately', function () {
  // The reason the store exists: a preference that only applied to the NEXT card
  // would look broken, because the user is looking at cards right now.
  const store = createPlacementStore(fakeStorage())
  const seen = []
  const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot()))

  store.set('below')
  store.set('left')
  assert.deepEqual(seen, ['below', 'left'])

  unsubscribe()
  store.set('above')
  assert.deepEqual(seen, ['below', 'left'], 'an unsubscribed listener is not called')
})

test('setting the same value twice notifies once', function () {
  // The menu calls set() on every click; a no-op change must not re-render every
  // card in a long transcript.
  const store = createPlacementStore(fakeStorage())
  let count = 0
  store.subscribe(() => { count += 1 })
  store.set('above')   // already the default
  store.set('below')
  store.set('below')
  assert.equal(count, 1)
})

test('an invalid set is ignored without notifying', function () {
  const store = createPlacementStore(fakeStorage())
  let count = 0
  store.subscribe(() => { count += 1 })
  store.set('sideways')
  assert.equal(count, 0)
  assert.equal(store.getSnapshot(), DEFAULT_PLACEMENT)
})

test('dispose stops notifications', function () {
  const store = createPlacementStore(fakeStorage())
  let count = 0
  store.subscribe(() => { count += 1 })
  store.dispose()
  store.set('below')
  assert.equal(count, 0)
})

test('the store starts from what storage already holds', function () {
  const store = createPlacementStore(fakeStorage({ [STORAGE_KEY]: 'below' }))
  assert.equal(store.getSnapshot(), 'below', 'a reload must restore the choice')
})

test('every placement has a label in both dictionaries', async function () {
  const { en, zh } = await import('../client/src/locales.js')
  for (const value of PLACEMENTS) {
    const key = PLACEMENT_LABELS[value]
    assert.equal(typeof en[key], 'string', `en is missing ${key}`)
    assert.equal(typeof zh[key], 'string', `zh is missing ${key}`)
  }
  // And the row itself needs its title and hint.
  for (const key of ['setting.titlePlacement', 'setting.titlePlacementHint']) {
    assert.equal(typeof en[key], 'string', `en is missing ${key}`)
    assert.equal(typeof zh[key], 'string', `zh is missing ${key}`)
  }
})
