/**
 * Host-side integration test: the two seams the Host half owns.
 *
 *   1. `webserver/index-inject` publishes the absolute `file://` fonts base
 *      (`__CDS_THEME_FONT_BASE__`) for the Electron shell and for a source run.
 *   2. `webServer.register` gains exactly ONE route — the long-paste store
 *      (`/dsh-cds-theme/paste`, see `lib/paste-route.js`). A composition
 *      without a web server mounts no route and does not fail; the client's
 *      long paste then stays plain text.
 *
 * The old font routes are GONE and their tests with them: the branch that would
 * use them cannot be built (see `lib/index.js` — the artifact inlines all six
 * faces as `data:` URLs, a build without the binaries fails instead of falling
 * back, and the desktop document origin `dsh-app://app` never resolves a
 * route-relative URL).
 *
 *   node test/host.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { apply, name, FONT_BASE_GLOBAL, FONT_BASE_URL, PASTE_PATH } from '../lib/index.js'
import { PASTE_PATH as ROUTE_PASTE_PATH, MARKER_HEADER, MARKER_VALUE } from '../lib/paste-route.js'
import { FONT_FACES } from '../client/src/fonts.js'
import { PASTE_ROUTE, PASTE_MARKER_HEADER, PASTE_MARKER_VALUE } from '../client/src/paste.js'

// ------------------------------------------------------------- harness

/** A cordis host context reduced to what this plugin touches. */
function mockContext(options) {
  const opts = options || {}
  const handlers = new Map()
  const injected = []
  const routes = []
  const effects = []
  const ctx = {
    on(event, handler) { handlers.set(event, handler) },
    inject(services, callback) {
      injected.push(services)
      if (opts.withWebServer === false || !services.includes('webServer')) return
      callback({
        webServer: opts.webServer || {
          register(route) { routes.push(route); return () => {} },
          getOrigin() { return 'http://127.0.0.1:50425' },
        },
        effect(factory) { effects.push(factory()) },
      })
    },
  }
  return { ctx, handlers, injected, routes, effects }
}

function injectTable(handlers) {
  const handler = handlers.get('webserver/index-inject')
  assert.equal(typeof handler, 'function', 'the Host half must listen for webserver/index-inject')
  const table = []
  handler(table)
  return table
}

// --------------------------------------------------------- index-inject

test('the plugin exports the name the bundle patch declares', function () {
  assert.equal(name, 'dsh-cds-theme')
})

test('the index injection publishes the absolute file:// fonts base', function () {
  const { ctx, handlers } = mockContext()
  apply(ctx)
  const table = injectTable(handlers)
  assert.equal(table.length, 1)

  const row = table[0]
  assert.equal(row.kind, 'global')
  assert.equal(row.name, FONT_BASE_GLOBAL)
  assert.equal(row.name, '__CDS_THEME_FONT_BASE__')
  assert.equal(row.value, FONT_BASE_URL)
  assert.ok(row.value.startsWith('file://'), 'the base must be an absolute file URL')
  assert.ok(row.value.endsWith('/fonts/'), 'the base must end at the shipped fonts directory')
  // Rows are JSON-serializable by contract (two renderers consume them).
  assert.equal(JSON.parse(JSON.stringify(row)).value, FONT_BASE_URL)
})

test('the injected base points at the six real files', function () {
  const dir = fileURLToPath(FONT_BASE_URL)
  for (const face of FONT_FACES) {
    assert.ok(existsSync(dir + face.file), 'missing ' + dir + face.file)
  }
})

// ---------------------------------------------------------- paste route

test('the Host half registers exactly one route: the long-paste store', function () {
  const { ctx, routes, effects } = mockContext()
  assert.doesNotThrow(function () { apply(ctx) })
  assert.equal(routes.length, 1, 'one route, and only one')
  assert.equal(routes[0].path, PASTE_PATH)
  assert.equal(routes[0].path, '/dsh-cds-theme/paste')
  assert.equal(routes[0].kind, 'exact')
  assert.equal(typeof routes[0].handler, 'function')
  assert.equal(effects.length, 1, 'registration is owned by a ctx.effect')
})

test('the Host route path and marker match the client constants', function () {
  assert.equal(PASTE_PATH, ROUTE_PASTE_PATH)
  assert.equal(PASTE_ROUTE, PASTE_PATH)
  assert.equal(PASTE_MARKER_HEADER, MARKER_HEADER)
  assert.equal(PASTE_MARKER_VALUE, MARKER_VALUE)
})

test('a web server without register() degrades instead of throwing', function () {
  const warnings = []
  const original = console.warn
  console.warn = function (message) { warnings.push(String(message)) }
  try {
    const { ctx } = mockContext({ webServer: {} })
    assert.doesNotThrow(function () { apply(ctx) })
  } finally {
    console.warn = original
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /long pastes stay plain text/)
})

test('a composition without a web server is not an error', function () {
  const { ctx, handlers, routes } = mockContext({ withWebServer: false })
  assert.doesNotThrow(function () { apply(ctx) })
  assert.equal(injectTable(handlers).length, 1, 'the index row is served either way')
  assert.equal(routes.length, 0, 'no web server, no route')
})
