/**
 * The two settings: default-on, and "current model" unless pinned.
 *
 * The defaults are the decision worth pinning. A feature that ships off never
 * gets discovered; a pinned model that defaults to something specific would
 * silently stop matching the conversation the user is having.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  ENABLED_KEY, PINNED_MODEL_KEY, DEFAULT_ENABLED, DEFAULT_PINNED_MODEL,
  persist, readEnabled, readPinnedModel,
} = await import('../lib/settings.js')
const { createSettingsStore } = await import('../client/src/lifecycle.js')

/** A storage double. */
function fakeStorage(initial = {}) {
  const data = { ...initial }
  return { getItem: (k) => (Object.hasOwn(data, k) ? data[k] : null), setItem: (k, v) => { data[k] = v }, data }
}

/** Storage whose every access throws. */
const hostile = {
  get getItem() { throw new Error('SecurityError') },
  setItem() { throw new Error('SecurityError') },
}

test('predictions are ON by default', function () {
  assert.equal(DEFAULT_ENABLED, true)
  assert.equal(readEnabled(fakeStorage()), true)
})

test('only the literal "false" turns them off', function () {
  for (const junk of ['', '0', 'no', 'OFF', 'null']) {
    assert.equal(readEnabled(fakeStorage({ [ENABLED_KEY]: junk })), true, `"${junk}" is not "off"`)
  }
  assert.equal(readEnabled(fakeStorage({ [ENABLED_KEY]: 'false' })), false)
})

test('the default model is the CURRENT model, not a pin', function () {
  // An empty pin is what makes the host use `agentDefaultModel`: the suggestion
  // should sound like the model the user is already talking to, and it shares
  // that conversation's prompt cache.
  assert.equal(DEFAULT_PINNED_MODEL, '')
  assert.equal(readPinnedModel(fakeStorage()), '')
})

test('a malformed pin is ignored', function () {
  // A route the host cannot parse would fail every prediction, silently.
  for (const junk of ['gpt-4', '/model', 'provider/', '   ']) {
    assert.equal(readPinnedModel(fakeStorage({ [PINNED_MODEL_KEY]: junk })), '',
      `"${junk}" must not become a route`)
  }
})

test('a well-formed pin round-trips', function () {
  assert.equal(readPinnedModel(fakeStorage({ [PINNED_MODEL_KEY]: 'magpie/deepseek-flash' })),
    'magpie/deepseek-flash')
})

test('a storage that throws keeps the defaults', function () {
  assert.equal(readEnabled(hostile), true)
  assert.equal(readPinnedModel(hostile), '')
  assert.equal(persist(hostile, ENABLED_KEY, 'false'), false)
})

test('persist writes through', function () {
  const storage = fakeStorage()
  assert.equal(persist(storage, ENABLED_KEY, 'false'), true)
  assert.equal(storage.data[ENABLED_KEY], 'false')
})

test('the store notifies on a change and tells the host', function () {
  const storage = fakeStorage()
  let told = 0
  const store = createSettingsStore(storage, () => { told += 1 })
  const seen = []
  store.subscribe(() => seen.push(store.getSnapshot()))

  store.setEnabled(false)
  assert.deepEqual(seen, [{ enabled: false, pinnedModel: '' }])
  assert.equal(storage.data[ENABLED_KEY], 'false')

  store.setPinnedModel('magpie/x')
  assert.equal(storage.data[PINNED_MODEL_KEY], 'magpie/x')
  assert.equal(told, 2, 'the host is told after every write')
})

test('setting the same value notifies once', function () {
  const store = createSettingsStore(fakeStorage(), () => {})
  let count = 0
  store.subscribe(() => { count += 1 })
  store.setEnabled(true)        // already on
  store.setEnabled(false)
  store.setEnabled(false)
  assert.equal(count, 1)
})

test('getSnapshot keeps one identity between real changes', function () {
  const store = createSettingsStore(fakeStorage(), () => {})
  const first = store.getSnapshot()
  assert.ok(Object.is(first, store.getSnapshot()), 'repeated reads must be the same object')
  store.setEnabled(false)
  const second = store.getSnapshot()
  assert.ok(!Object.is(first, second), 'a real change must replace the snapshot')
  assert.ok(Object.is(second, store.getSnapshot()))
})

test('a set that changes nothing neither notifies nor replaces the snapshot', function () {
  let told = 0
  const store = createSettingsStore(fakeStorage(), () => { told += 1 })
  const first = store.getSnapshot()
  let count = 0
  store.subscribe(() => { count += 1 })
  store.setEnabled(true)
  store.setPinnedModel('   ')
  assert.equal(count, 0)
  assert.equal(told, 0)
  assert.ok(Object.is(first, store.getSnapshot()))
  assert.deepEqual(store.getSnapshot(), { enabled: true, pinnedModel: '' })
})

test('the replaced snapshot carries every field, not just the one that moved', function () {
  const store = createSettingsStore(fakeStorage(), () => {})
  store.setPinnedModel('magpie/x')
  store.setEnabled(false)
  assert.deepEqual(store.getSnapshot(), { enabled: false, pinnedModel: 'magpie/x' })
})

test('the pin is trimmed before it is stored', function () {
  const storage = fakeStorage()
  const store = createSettingsStore(storage, () => {})
  store.setPinnedModel('  magpie/x  ')
  assert.equal(storage.data[PINNED_MODEL_KEY], 'magpie/x')
})

test('dispose stops notifications', function () {
  const store = createSettingsStore(fakeStorage(), () => {})
  let count = 0
  store.subscribe(() => { count += 1 })
  store.dispose()
  store.setEnabled(false)
  assert.equal(count, 0)
})
