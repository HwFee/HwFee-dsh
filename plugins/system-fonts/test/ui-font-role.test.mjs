/**
 * The UI font role: a fourth family the host does not have.
 *
 * THE FAILURE THIS FILE EXISTS FOR. `sanitize()` rebuilds the settings object
 * from a WHITELIST, so a key it does not name is silently dropped on every save.
 * `uiFontFamily` was missing from that list: the row read `undefined` forever,
 * re-rendered in a loop, React raised error #185 (maximum update depth), and the
 * host swallowed the throw into an empty `<div data-slot-error>` — the row did
 * not appear at all, and nothing in the console named the cause.
 *
 * A state key is therefore three things, and all three must agree:
 *   DEFAULT_STATE   the initial value
 *   sanitize        the whitelist that keeps it alive across a save
 *   the slot        the row that reads it
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { DEFAULT_STATE, sanitize, UI_FAMILY_VARIABLE } = await import('../client/src/constants.js')

test('the UI family survives sanitize', function () {
  // The bug: this returned an object without `uiFontFamily`, so the key was
  // erased on the first write.
  const out = sanitize({ ...DEFAULT_STATE, uiFontFamily: 'Georgia' })
  assert.equal(out.uiFontFamily, 'Georgia')
})

test('every DEFAULT_STATE key survives sanitize', function () {
  // The general form of the bug above: any key in the defaults that sanitize
  // does not name is dropped the moment the user changes anything else.
  const out = sanitize({ ...DEFAULT_STATE })
  for (const key of Object.keys(DEFAULT_STATE)) {
    assert.ok(Object.hasOwn(out, key), `sanitize drops "${key}" — it must be whitelisted`)
  }
})

test('a non-string UI family falls back to empty, never to a number', function () {
  for (const junk of [42, null, {}, []]) {
    assert.equal(sanitize({ uiFontFamily: junk }).uiFontFamily, '')
  }
})

test('the UI family starts empty, which means "follow the body"', function () {
  // `--dsw-font-family-ui: var(--dsh-font-family-ui, var(--dsw-font-family))`
  // in cds-theme: with no value set, the UI keeps the text role. An empty string
  // is therefore a MEANING (follow), not a missing preference.
  assert.equal(DEFAULT_STATE.uiFontFamily, '')
})

test('the variable name is the plugin\'s own, not a host token', function () {
  // `FONT_ROLES` in the host theme is exactly ['text','code','terminal'], so
  // there is no host variable for this role; cds-theme reads ours.
  assert.equal(UI_FAMILY_VARIABLE, '--dsh-font-family-ui')
  assert.ok(UI_FAMILY_VARIABLE.startsWith('--dsh-'), 'the plugin-owned prefix, not --dsw-')
})
