import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createThemeBridge } from '../client/src/theme.js'
import { sanitize } from '../client/src/constants.js'

/**
 * THE REGRESSION THIS FILE EXISTS FOR.
 *
 * The first shipped version read the theme service as an OPTIONAL lookup
 * (`ctx.get('theme')`) inside the plugin body, and the bridge latched a
 * "service unavailable" flag the first time that read came back empty. At
 * apply time the theme service had not registered yet, so the plugin loaded —
 * settings rows appeared, the stylesheet applied — but not one token was ever
 * pushed. The UI looked stock and nothing errored.
 *
 * These tests pin both halves of the fix: the dependency is declared, and the
 * bridge keeps retrying instead of giving up.
 */

function fakeService() {
  const calls = []
  return {
    calls,
    overrideTokens(source, tokens) {
      calls.push({ source, tokens })
      return function dispose() { calls.push({ disposed: true }) }
    },
  }
}

test('the client module declares theme as a hard dependency', async function () {
  // A Cordis service read that must be ordered before the plugin body belongs
  // in `inject`. Reading it optionally races the registration.
  const module = await import('../client/src/index.js')
  assert.ok(Array.isArray(module.inject), 'inject must be an array')
  assert.ok(module.inject.includes('theme'),
    'theme must be a declared dependency, not an optional ctx.get lookup')
  assert.ok(module.inject.includes('slots'), 'slots is needed for the settings rows')
})

test('the bridge applies tokens as soon as the service appears', function () {
  let service = null
  const bridge = createThemeBridge({
    getState: function () { return sanitize({}) },
    getTheme: function () { return service },
  })

  // Sync before the service exists: must not throw, must not latch.
  bridge.sync()

  // The service arrives afterwards — the very case that used to be lost.
  service = fakeService()
  bridge.sync()

  assert.equal(service.calls.length, 1, 'the layer must be registered once the service exists')
  assert.equal(service.calls[0].source, 'dsh-cds-theme')
  assert.ok(Object.keys(service.calls[0].tokens).length > 100,
    'the whole token map, not a partial one')
})

test('a service that shows up late beats one that was missing at mount', function () {
  // Ordering: unavailable → available → available must register exactly once,
  // because the second available sync has an unchanged signature.
  let service = null
  const bridge = createThemeBridge({
    getState: function () { return sanitize({}) },
    getTheme: function () { return service },
  })
  bridge.sync()
  bridge.sync()
  service = fakeService()
  bridge.sync()
  bridge.sync()
  assert.equal(service.calls.length, 1, 'no duplicate layer for an unchanged state')
})

test('changing a setting re-registers the layer', function () {
  const service = fakeService()
  let state = sanitize({})
  const bridge = createThemeBridge({
    getState: function () { return state },
    getTheme: function () { return service },
  })

  bridge.sync()
  assert.equal(service.calls.length, 1)

  state = sanitize({ accent: 'graphite' })
  bridge.sync()
  assert.equal(service.calls.length, 2, 'a settings change must push a new layer')
  assert.notEqual(service.calls[0].tokens['--dsw-alias-state-business-primary'].light,
    service.calls[1].tokens['--dsw-alias-state-business-primary'].light)
})

test('disabling releases the layer instead of pushing a neutral one', function () {
  const service = fakeService()
  let state = sanitize({})
  const bridge = createThemeBridge({
    getState: function () { return state },
    getTheme: function () { return service },
  })

  bridge.sync()
  assert.equal(service.calls.length, 1)

  state = sanitize({ enabled: false })
  bridge.sync()
  // One override registration, then one dispose; nothing new is registered.
  assert.equal(service.calls.filter(function (c) { return c.tokens }).length, 1,
    'disabling must not register another token layer')
  assert.ok(service.calls.some(function (c) { return c.disposed }),
    'disabling must dispose the existing layer so the stock theme returns')
})

test('release disposes the layer and a later sync re-registers it', function () {
  const service = fakeService()
  const bridge = createThemeBridge({
    getState: function () { return sanitize({}) },
    getTheme: function () { return service },
  })

  bridge.sync()
  bridge.release()
  assert.ok(service.calls.some(function (c) { return c.disposed }))

  bridge.sync()
  assert.equal(service.calls.filter(function (c) { return c.tokens }).length, 2,
    'after release the plugin can come back')
})

test('toggling thinkingLabelBlue re-registers the token layer', function () {
  // The switch swaps the two deep-diving label tokens. It is part of the
  // bridge signature, so flipping it must push a new layer — otherwise the row
  // would look dead until the next other change.
  const service = fakeService()
  let state = sanitize({})
  const bridge = createThemeBridge({
    getState: function () { return state },
    getTheme: function () { return service },
  })

  bridge.sync()
  assert.equal(service.calls.filter(function (c) { return c.tokens }).length, 1)

  state = sanitize({ thinkingLabelBlue: true })
  bridge.sync()
  const layers = service.calls.filter(function (c) { return c.tokens })
  assert.equal(layers.length, 2, 'the new state must re-register')
  assert.equal(layers[1].tokens['--dsw-alias-label-deep-diving'].light, '#7d9ade',
    'the re-registered layer carries the host blue label')
  assert.equal(layers[0].tokens['--dsw-alias-label-deep-diving'].light, '#d49b83',
    'the previous layer was the clay default')
})

/**
 * A host-accurate fake: `overrideTokens` publishes `theme/change`
 * SYNCHRONOUSLY before returning (that is what the real theme service does),
 * and the bridge's own listener re-enters `sync()` from inside that publish.
 * Layers are held in a Map keyed by source, exactly like the host, and a
 * disposer only removes the layer it created (identity check).
 */
function reentrantService() {
  const listeners = []
  const layers = new Map()
  let seq = 0
  return {
    layers,
    registrations: 0,
    onChange(callback) { listeners.push(callback) },
    overrideTokens(source, tokens) {
      const layer = { id: ++seq, tokens: tokens }
      this.registrations += 1
      layers.set(source, layer)
      // publish() → ctx.emit('theme/change') → our listener calls sync().
      for (const callback of listeners.slice()) callback()
      return function disposeLayer() {
        if (layers.get(source) === layer) layers.delete(source)
      }
    },
  }
}

test('theme OFF releases the layer when the host publishes synchronously', function () {
  // THE BUG THIS PINS: the real host emits `theme/change` synchronously from
  // inside `overrideTokens()`. Without a re-entrancy guard the nested sync
  // registered a second layer before the outer call stored its disposer, the
  // outer assignment then stored the disposer of a REPLACED layer, and every
  // later release silently no-opped — so OFF looked ineffective while ON
  // (re-)registered a layer. The guard makes one sync at a time.
  let state = sanitize({})
  const service = reentrantService()
  const bridge = createThemeBridge({
    getState: function () { return state },
    getTheme: function () { return service },
  })

  bridge.sync()                                   // mount (listener not registered yet)
  service.onChange(function () { bridge.sync() }) // lifecycle registers it after mount
  assert.equal(service.layers.size, 1)
  assert.equal(service.registrations, 1, 'mount registers exactly one layer')

  state = sanitize({ enabled: false })
  assert.doesNotThrow(function () { bridge.sync() })
  assert.equal(service.layers.size, 0, 'OFF releases the active layer')

  state = sanitize({ enabled: true })
  assert.doesNotThrow(function () { bridge.sync() })
  assert.equal(service.layers.size, 1, 'ON registers again')
  assert.equal(service.registrations, 2, 'the re-entrant publish must not double-register')

  state = sanitize({ enabled: false })
  assert.doesNotThrow(function () { bridge.sync() })
  assert.equal(service.layers.size, 0, 'the SECOND OFF must release too (the reported symptom)')

  // A few more cycles must stay symmetric.
  for (let i = 0; i < 3; i += 1) {
    state = sanitize({ enabled: true }); bridge.sync()
    assert.equal(service.layers.size, 1, 'cycle ' + i + ': ON')
    state = sanitize({ enabled: false }); bridge.sync()
    assert.equal(service.layers.size, 0, 'cycle ' + i + ': OFF')
  }
})

test('enabled=true restores the complete token layer', function () {
  let state = sanitize({ enabled: false })
  const service = reentrantService()
  const bridge = createThemeBridge({
    getState: function () { return state },
    getTheme: function () { return service },
  })
  service.onChange(function () { bridge.sync() })

  bridge.sync()
  assert.equal(service.layers.size, 0, 'a disabled mount registers nothing')

  state = sanitize({ enabled: true })
  bridge.sync()
  const layer = service.layers.get('dsh-cds-theme')
  assert.ok(layer, 'enabling registers the layer')
  assert.ok(Object.keys(layer.tokens).length > 300,
    'the full token map (~316 entries), not a partial one: ' + Object.keys(layer.tokens).length)
  assert.equal(layer.tokens['--dsw-alias-bg-base'].light, '#fcfcfb',
    'the CDS palette is back')
  assert.equal(layer.tokens['--dsw-font-family'].light.indexOf('var(--font-anthropic-sans)') >= 0, true,
    'the CDS typography is back')
})
