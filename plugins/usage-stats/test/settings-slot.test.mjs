/**
 * Where this plugin's settings rows land: the 主题定制 page when it exists, the
 * General list otherwise — as ONE list, with a bounded wait and no duplicate row.
 *
 * `settings-slot.js` is pure over an injected `slots` service and timer pair, so
 * it is tested without a host or a DOM.
 *
 *   node test/settings-slot.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  APPEARANCE_SLOT,
  GENERAL_SLOT,
  SLOT_WAIT_MS,
  registerSettingsRows,
  rowRegistration,
} from '../client/src/settings-slot.js'
import {
  SETTINGS_ROW_ID, SETTINGS_ROW_ORDER, UNITS_ROW_ID, UNITS_ROW_ORDER,
} from '../client/src/constants.js'

/**
 * A `ctx.slots` stand-in: injections are fired by hand, registrations recorded.
 * `failOn` makes `register` throw for that slot, to exercise the unwind path.
 */
function makeSlots(options) {
  const opts = options || {}
  const injections = new Map()
  const registrations = []
  return {
    registrations,
    inject(key, callback) {
      const list = injections.get(key) || []
      list.push(callback)
      injections.set(key, list)
      return function () { /* the subscription is stopped on dispose */ }
    },
    register(registration, component) {
      if (registration.name === opts.failOn) throw new Error('refused by the host')
      const row = { options: registration, component, disposed: false }
      registrations.push(row)
      return function () { row.disposed = true }
    },
    /** Fire every injection callback waiting on `key`; returns their disposers. */
    declare(key) {
      const list = injections.get(key) || []
      return list.map(function (callback) { return callback() })
    },
    listeners(key) { return (injections.get(key) || []).length },
  }
}

/** Deterministic timers: nothing fires until `advance()`. */
function makeTimers() {
  const pending = []
  return {
    pending,
    timers: {
      setTimeout(fn, ms) {
        const handle = { fn, ms, cleared: false }
        pending.push(handle)
        return handle
      },
      clearTimeout(handle) { handle.cleared = true },
    },
    advance() {
      for (const handle of pending.slice()) {
        if (handle.cleared) continue
        handle.cleared = true
        handle.fn()
      }
    },
  }
}

const HeightRow = function HeightRow() { return null }
const UnitsRow = function UnitsRow() { return null }

const ROWS = [
  { id: SETTINGS_ROW_ID, order: SETTINGS_ROW_ORDER, component: HeightRow },
  { id: UNITS_ROW_ID, order: UNITS_ROW_ORDER, component: UnitsRow },
]

function place(slots, options) {
  return registerSettingsRows(Object.assign({
    slots, rows: ROWS, warn: function () {},
  }, options))
}

test('each row keeps its id, order and locale namespace', function () {
  const height = rowRegistration(APPEARANCE_SLOT, ROWS[0])
  assert.equal(height.name, 'settings.appearance.item')
  assert.equal(height.id, SETTINGS_ROW_ID)
  assert.equal(height.id, 'dsh-usage-stats-panel-height')
  assert.equal(height.order, 40)
  assert.equal(height.locale, 'dsh-usage-stats')

  const units = rowRegistration(APPEARANCE_SLOT, ROWS[1])
  assert.equal(units.id, UNITS_ROW_ID)
  assert.equal(units.id, 'dsh-usage-stats-units')
  assert.equal(units.order, 41)
  assert.equal(units.locale, 'dsh-usage-stats')
  assert.notEqual(height.order, units.order, 'the two rows must not tie')
})

test('a declared theme page wins: BOTH rows land there and the wait is cancelled', function () {
  const slots = makeSlots()
  const timers = makeTimers()
  const placement = place(slots, { timers: timers.timers, waitMs: 3000 })
  assert.equal(placement.mode, 'pending')
  assert.equal(placement.rows(), 2)

  slots.declare(APPEARANCE_SLOT)
  assert.equal(placement.mode, 'appearance')
  assert.equal(slots.registrations.length, 2, 'both rows, as one list')
  assert.deepEqual(slots.registrations.map(function (row) { return row.options.name }),
    [APPEARANCE_SLOT, APPEARANCE_SLOT])
  assert.deepEqual(slots.registrations.map(function (row) { return row.options.id }),
    [SETTINGS_ROW_ID, UNITS_ROW_ID])
  assert.equal(slots.registrations[0].component, HeightRow)
  assert.equal(slots.registrations[1].component, UnitsRow)
  assert.equal(timers.pending[0].cleared, true, 'the wait is cancelled once the slot mounts')
})

test('a theme page that never appears moves BOTH rows to the General list', function () {
  const slots = makeSlots()
  const timers = makeTimers()
  const warnings = []
  const placement = registerSettingsRows({
    slots, rows: ROWS, timers: timers.timers, waitMs: SLOT_WAIT_MS,
    warn: function (message) { warnings.push(String(message)) },
  })
  assert.equal(placement.mode, 'pending')
  timers.advance()
  assert.equal(placement.mode, 'general')
  assert.equal(slots.registrations.length, 2)
  assert.deepEqual(slots.registrations.map(function (row) { return row.options.name }),
    [GENERAL_SLOT, GENERAL_SLOT])
  assert.match(placement.reason(), /within/)
  assert.equal(warnings.length, 1, 'the fallback is reported once')
})

test('waitMs <= 0 decides with what exists right now', function () {
  const slots = makeSlots()
  const placement = place(slots, { waitMs: 0 })
  assert.equal(placement.mode, 'general')
  assert.equal(slots.registrations.length, 2)
  assert.equal(placement.reason(), 'no declaration is available')
})

test('a late theme-page declaration after the fallback does not double-register', function () {
  const slots = makeSlots()
  const timers = makeTimers()
  const placement = place(slots, { timers: timers.timers, waitMs: 10 })
  timers.advance()
  assert.equal(placement.mode, 'general')
  assert.equal(slots.registrations.length, 2)

  slots.declare(APPEARANCE_SLOT)
  assert.equal(placement.mode, 'general', 'the fallback decision is final')
  assert.equal(slots.registrations.length, 2, 'neither row may exist on both pages')
})

test('a refused theme-page registration unwinds and falls back with the full list', function () {
  const slots = makeSlots({ failOn: APPEARANCE_SLOT })
  const timers = makeTimers()
  const warnings = []
  const placement = registerSettingsRows({
    slots, rows: ROWS, timers: timers.timers, waitMs: 3000,
    warn: function (message) { warnings.push(String(message)) },
  })
  slots.declare(APPEARANCE_SLOT)
  assert.equal(placement.mode, 'general', 'the fallback still seats both rows')
  assert.equal(slots.registrations.length, 2, 'only the General rows exist')
  assert.deepEqual(slots.registrations.map(function (row) { return row.options.name }),
    [GENERAL_SLOT, GENERAL_SLOT])
  assert.equal(warnings.length, 2, 'registration refusal + fallback, each once')
  assert.equal(timers.pending[0].cleared, true, 'the bounded wait is cancelled')
})

test('losing the theme page moves BOTH rows back to General instead of dropping them', function () {
  const slots = makeSlots()
  const timers = makeTimers()
  const placement = place(slots, { timers: timers.timers, waitMs: 3000 })
  const appearanceDisposers = slots.declare(APPEARANCE_SLOT)
  assert.equal(placement.mode, 'appearance')
  assert.equal(slots.registrations.length, 2)

  // cds-theme is disabled: the slot owner disposes our registrations.
  for (const dispose of appearanceDisposers) dispose()
  assert.equal(placement.mode, 'general')
  assert.equal(slots.registrations[0].disposed, true, 'the theme-page height row is gone')
  assert.equal(slots.registrations[1].disposed, true, 'the theme-page unit row is gone')
  assert.equal(slots.registrations.length, 4)
  assert.deepEqual(slots.registrations.slice(2).map(function (row) { return row.options.name }),
    [GENERAL_SLOT, GENERAL_SLOT])
  assert.match(placement.reason(), /removed/)
})

test('dispose cancels the wait and removes whatever rows exist', function () {
  const slots = makeSlots()
  const timers = makeTimers()
  const pending = place(slots, { timers: timers.timers, waitMs: 3000 })
  pending.dispose()
  assert.equal(timers.pending[0].cleared, true)
  assert.equal(slots.registrations.length, 0)

  const seated = makeSlots()
  const placement = place(seated, { waitMs: 3000 })
  seated.declare(APPEARANCE_SLOT)
  placement.dispose()
  assert.equal(seated.registrations.length, 2)
  assert.ok(seated.registrations.every(function (row) { return row.disposed }))
})
