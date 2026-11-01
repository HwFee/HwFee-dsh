import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLifecycle } from '../client/src/lifecycle.js'
import { createSettingsStore } from '../client/src/settings.js'
import { UNITS_ROW_ID } from '../client/src/constants.js'

function fakeReact() {
  return {
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      return { type, props: props || {}, children }
    },
    useSyncExternalStore(getSnapshot) { return getSnapshot() },
    useMemo(fn) { return fn() },
    useState(v) { return [typeof v === 'function' ? v() : v, function () {}] },
    useEffect() {},
  }
}

function makeStorage() {
  const map = new Map()
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null },
    setItem(key, value) { map.set(key, String(value)) },
    removeItem(key) { map.delete(key) },
  }
}

function unitRow(language) {
  const registrations = []
  const lifecycle = createLifecycle({
    React: fakeReact(),
    primitives: {},
    panel: { Panel() { return null } },
    fetchSummary() {},
    peekSummary() { return null },
    settings: createSettingsStore(makeStorage()),
  })
  lifecycle({
    slots: {
      inject(key, callback) { callback(); return function () {} },
      register(options, component) { registrations.push({ options, component }); return function () {} },
    },
    locale: { register() { return function () {} } },
    effect(fn) { fn(); return function () {} },
  })
  const row = registrations.find((entry) => entry.options.id === UNITS_ROW_ID)
  return row.component({ t: (key) => (key === 'book.lang' ? language : key) })
}

test('the number-units switch is offered on a Chinese interface', function () {
  const tree = unitRow('zh')
  assert.ok(tree, 'the row must render in a zh UI')
  assert.equal(tree.props.className, 'dus-row')
})

test('the number-units switch is absent from an English interface', function () {
  // English always reads K/M/B, so offering a "Chinese units" switch there
  // would be a control with no effect.
  assert.equal(unitRow('en'), null)
})
