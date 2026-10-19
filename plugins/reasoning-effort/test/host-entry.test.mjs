/**
 * The Host half must be a loadable CORDIS PLUGIN — not just a module.
 *
 * THE REGRESSION THIS FILE EXISTS FOR. `lib/index.js` used to export only
 * `name`, with a comment explaining that the Host owns nothing and therefore
 * "should not invent" an `apply`. That reasoning was wrong, and it silently
 * deleted the entire feature:
 *
 *   cordis `RegistryService.resolve()` accepts exactly two shapes:
 *
 *       if (typeof plugin === 'function') return plugin
 *       if (isApplicable(plugin)) return plugin.apply      // object with .apply
 *
 *   An ES module namespace is an object, so exporting only `name` matches
 *   NEITHER branch: `resolve()` returns `undefined` and `registry.plugin()`
 *   throws `invalid plugin, expect function or object with an "apply" method`.
 *   `Entry._init()` logs that error and returns BEFORE the line that assigns
 *   `this.fiber`, so the Loader entry keeps `fiber === undefined`.
 *
 *   Two downstream consequences, both invisible as errors:
 *     - `@deepseek-ai/dsh-tool-cordis` reports the entry `status: "inactive"`;
 *     - `@deepseek-ai/dsh-client-modules` skips it when composing the browser
 *       boot graph (`if (entry.options.name !== entryName || entry.fiber ===
 *       void 0 || entry.disabled) continue`), so `client/client.js` never
 *       reaches `window.__DSH_BOOT__` and the settings row never mounts.
 *
 *   The user-visible symptom was a MISSING slider with no message anywhere.
 *
 * These tests pin the contract at the level the Loader checks it, so the same
 * mistake fails `npm test` instead of disappearing into the settings page.
 *
 *   node test/host-entry.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as hostEntry from '../lib/index.js'

/**
 * cordis `RegistryService.resolve()`, reproduced verbatim from
 * `@deepseek-ai/cordis/lib/types/registry.js`:
 *
 *     function isApplicable(object) {
 *       return object && typeof object === 'object' && typeof object.apply === 'function'
 *     }
 *     resolve(plugin) {
 *       try {
 *         if (typeof plugin === 'function') return plugin
 *         if (isApplicable(plugin)) return plugin.apply
 *       } catch {}
 *     }
 *
 * @returns the callback cordis would register, or `undefined` when it would
 *          throw "invalid plugin".
 */
function cordisResolve(plugin) {
  const isApplicable = (object) =>
    object && typeof object === 'object' && typeof object.apply === 'function'
  try {
    if (typeof plugin === 'function') return plugin
    if (isApplicable(plugin)) return plugin.apply
  } catch (error) { /* cordis swallows a throwing getter here */ }
  return undefined
}

/** The Loader's own export normalization, from `cordis-plugin-loader`. */
function unwrapExports(exports) {
  if (exports === null || exports === undefined) return exports
  let value = exports.default ?? exports
  if (!value.__esModule) return value
  return value.default ?? value
}

test('the Host half resolves to a plugin callback the way cordis resolves it', function () {
  // THE ROOT-CAUSE ASSERTION. Before the fix this was `undefined`.
  const resolved = cordisResolve(unwrapExports(hostEntry))
  assert.equal(typeof resolved, 'function',
    'lib/index.js must export `apply` (or be a function): without it cordis throws ' +
    '"invalid plugin" and the Loader entry never gets a fiber')
})

test('the Host half still names the Loader entry', function () {
  // `name` is what the bundle patch and the client manifest key on; adding
  // `apply` must not cost it.
  assert.equal(hostEntry.name, 'dsh-reasoning-effort')
})

test('the Host body is inert: it needs no services and installs nothing', function () {
  // The Host owns no route, no file access and no service. `apply` exists for
  // the Loader, not for work — so it must survive a call with no context at
  // all, and must not reach for any service it did not declare.
  assert.doesNotThrow(function () { hostEntry.apply() })
  assert.doesNotThrow(function () { hostEntry.apply({}) })
})

test('the Host half declares no inject, so it cannot wait on a Host service', function () {
  // A `lib/index.js` that required a service would turn a client-only plugin
  // into one that can fail to start on a host without that service.
  const declared = hostEntry.inject
  assert.equal(declared, undefined,
    'this plugin has no Host dependency; a declared inject would gate its fiber')
})

test('the Host half exports no Config, so the entry needs no config schema', function () {
  // `dsh-tool-cordis` reports `status: "absent"` for a fiber whose Config is
  // missing, which is the honest answer for a plugin with nothing to configure.
  assert.equal(hostEntry.Config, undefined)
})
