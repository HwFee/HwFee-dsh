/**
 * Host-side integration test: mount lib/index.js against a mock cordis context
 * and drive the route it registers.
 *
 *   node test/host.test.mjs
 */

import assert from 'node:assert/strict'

import { apply, name, FONTS_PATH } from '../lib/index.js'
import { createFontRoute, refuseRequest, MARKER_HEADER, MARKER_VALUE, FORCE_COOLDOWN_MS } from '../lib/font-route.js'
import { execFileBuffer } from '../lib/system-fonts.js'

let passed = 0
const failures = []

async function test(label, fn) {
  try {
    await fn()
    passed += 1
    process.stdout.write(`  ok   ${label}\n`)
  } catch (error) {
    failures.push({ label, error })
    process.stdout.write(`  FAIL ${label}\n         ${error.message}\n`)
  }
}

/** The authority the mock listener is bound to. */
const LISTENER_ORIGIN = 'http://127.0.0.1:62421'

/**
 * A request as the plugin's own client sends it: same origin, marker present.
 * Tests that want a hostile request override one header.
 */
function request({ method = 'GET', url = FONTS_PATH, headers = {}, drop = [] } = {}) {
  const all = Object.assign({
    host: '127.0.0.1:62421',
    'sec-fetch-site': 'same-origin',
    [MARKER_HEADER]: MARKER_VALUE,
  }, headers)
  for (const name of drop) delete all[name]
  return { method, url, headers: all }
}

/** A cordis host context reduced to what this plugin touches. */
function mockContext({ withWebServer = true } = {}) {
  const routes = []
  const effects = []
  const injected = []
  const webServer = {
    getOrigin() { return LISTENER_ORIGIN },
    register(route) {
      routes.push(route)
      return () => { route.disposed = true }
    },
  }
  const ctx = {
    inject(services, callback) {
      injected.push(services)
      if (withWebServer && services.includes('webServer')) {
        // `ctx.effect(fn)` RUNS fn at once and takes its return value as the
        // disposer — that is how the host's own ui-theme appends its style tags
        // and how this plugin mounts its route. A mock that only stored fn
        // would report "no route" for a correct plugin.
        const effect = (fn, label) => {
          const dispose = fn()
          effects.push({ fn, label, dispose })
          return dispose
        }
        callback({ webServer, effect })
      }
    },
  }
  return { ctx, routes, effects, injected }
}

/** A response stand-in that records what the handler wrote. */
function mockResponse() {
  const out = { status: 0, headers: null, body: '' }
  return {
    out,
    writeHead(status, headers) { out.status = status; out.headers = headers },
    end(text) { out.body = text ?? '' },
  }
}

process.stdout.write('lib/index.js — host plugin\n')

await test('exports the plugin name the bundle declares', () => {
  assert.equal(name, 'dsh-system-fonts')
})

await test('waits for the webServer service before mounting', () => {
  const { ctx, injected, routes } = mockContext()
  apply(ctx)
  assert.deepEqual(injected, [['webServer']], 'injects exactly the webServer service')
  assert.equal(routes.length, 1, 'one route')
  assert.equal(routes[0].kind, 'exact')
  assert.equal(routes[0].path, FONTS_PATH)
  assert.equal(routes[0].path, '/dsh-system-fonts/fonts')
  assert.equal(typeof routes[0].handler, 'function')
})

await test('the route is registered inside an effect, so it can be disposed', () => {
  const { ctx, effects, routes } = mockContext()
  apply(ctx)
  assert.equal(effects.length, 1, 'registered through ctx.effect')
  assert.match(effects[0].label, /dsh-system-fonts/)
  assert.equal(routes.length, 1, 'the effect body ran the registration')
})

await test('a composition without a web server is not an error', () => {
  const { ctx, routes } = mockContext({ withWebServer: false })
  assert.doesNotThrow(() => apply(ctx))
  assert.equal(routes.length, 0)
})

await test('a webServer without register() degrades instead of throwing', () => {
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(String(message))
  try {
    const ctx = { inject: (services, callback) => callback({ webServer: {}, effect: () => {} }) }
    assert.doesNotThrow(() => apply(ctx))
  } finally {
    console.warn = original
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /exposes no register/)
})

// LIVE ENUMERATION IS OPT-IN.
//
// This test used to call the real `listSystemFonts()`, which spawns
// `powershell.exe` and `reg` and takes **≈4.0 s** on this machine (measured:
// 4,021 ms for this test, 4,049 ms for the `?refresh=1` one below — 79% of the
// suite's 10.2 s between them). What it asserts about the real machine is real,
// but paying 8 s of wall clock on every run is how a suite becomes something
// people skip. The wire-shape assertions (field types, symbol faces last, no
// `file` field, no drive letter) are equally checkable against an injected
// enumerator, and the SHAPE is what regresses in practice.
//
// `DSF_LIVE_FONTS=1 npm test` runs the true enumeration when you want it.
const LIVE_FONTS = process.env.DSF_LIVE_FONTS === '1'

/** A deterministic catalogue with the shapes the real one produces. */
function sampleCatalogue() {
  return {
    platform: 'win32',
    supported: true,
    sources: ['registry', 'gdi'],
    families: [
      { family: 'Arial', weights: [400, 700], italic: true, symbol: false, gdi: true, localized: false },
      { family: 'Segoe UI', weights: [300, 400, 600], italic: true, symbol: false, gdi: true, localized: false },
      { family: 'Microsoft YaHei', weights: [400], italic: false, symbol: false, gdi: true, localized: true },
      { family: 'Wingdings', weights: [400], italic: false, symbol: true, gdi: true, localized: false },
    ],
  }
}

await test('GET answers the documented catalogue shape', async () => {
  const route = createFontRoute(
    LIVE_FONTS ? undefined : async () => sampleCatalogue(),
    { origin: () => LISTENER_ORIGIN },
  )
  const response = mockResponse()
  await route.handler(request(), response)

  assert.equal(response.out.status, 200)
  assert.equal(response.out.headers['cache-control'], 'no-store')
  assert.equal(response.out.headers['content-type'], 'application/json; charset=utf-8')

  const body = JSON.parse(response.out.body)
  assert.equal(typeof body.platform, 'string')
  assert.equal(typeof body.supported, 'boolean')
  assert.ok(Array.isArray(body.families), 'families is an array')
  assert.ok(Array.isArray(body.sources), 'sources is an array')

  if (body.supported && body.families.length > 0) {
    const first = body.families[0]
    assert.equal(typeof first.family, 'string')
    assert.ok(Array.isArray(first.weights), 'each family lists its weights')
    assert.equal(typeof first.symbol, 'boolean')
    assert.equal(typeof first.gdi, 'boolean')
    // Symbol faces must sort last, so the picker's first entry is usable text.
    assert.equal(first.symbol, false, 'the first entry is a text face')
    const last = body.families[body.families.length - 1]
    assert.equal(last.symbol, true, 'the last entry is a symbol face')
    // Nothing on the wire may name a file: nothing reads it, and 480 machine
    // paths in a response is a layout disclosure.
    for (const entry of body.families) {
      assert.equal('file' in entry, false, 'no file field on the wire')
    }
    assert.doesNotMatch(response.out.body, /[A-Za-z]:\\\\/, 'no drive-letter path anywhere in the body')
    process.stdout.write(`         (${body.families.length} families from ${LIVE_FONTS ? 'the live machine' : 'the injected sample'}${LIVE_FONTS ? '' : '; set DSF_LIVE_FONTS=1 for the real one'})\n`)
  } else {
    process.stdout.write('         (no fonts readable in this environment — shape only)\n')
  }
})

await test('a non-GET method is refused with 405', async () => {
  const { ctx, routes } = mockContext()
  apply(ctx)
  const response = mockResponse()
  await routes[0].handler(request({ method: 'POST' }), response)
  assert.equal(response.out.status, 405)
  assert.equal(response.out.headers.allow, 'GET')
})

await test('a request WITHOUT the marker is refused, and costs no enumeration', async () => {
  let enumerated = 0
  const route = createFontRoute(async () => { enumerated += 1; return { families: [] } }, {
    origin: () => LISTENER_ORIGIN,
  })
  const response = mockResponse()
  // The exact shape of the drive-by: an <img> from another page. It has no
  // marker, no Origin (images do not send one) and a foreign Referer.
  await route.handler({
    method: 'GET',
    url: FONTS_PATH + '?refresh=1',
    headers: { host: '127.0.0.1:62421', 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'image' },
  }, response)
  assert.equal(response.out.status, 403, 'no marker -> refused')
  assert.equal(enumerated, 0, 'and the enumerator never ran: no PowerShell was spawned')
})

await test('the marker alone is not enough: cross-site and foreign-origin requests are refused', async () => {
  let enumerated = 0
  const route = createFontRoute(async () => { enumerated += 1; return { families: [] } }, {
    origin: () => LISTENER_ORIGIN,
  })

  const crossSite = mockResponse()
  await route.handler(request({ headers: { 'sec-fetch-site': 'cross-site' } }), crossSite)
  assert.equal(crossSite.out.status, 403, 'sec-fetch-site: cross-site is refused even with the marker')

  const foreignOrigin = mockResponse()
  await route.handler(request({ headers: { origin: 'https://evil.example' } }), foreignOrigin)
  assert.equal(foreignOrigin.out.status, 403, 'an Origin that is not this authority is refused')

  const rebinding = mockResponse()
  await route.handler(request({ headers: { host: 'evil.example:62421', origin: 'http://evil.example:62421' } }), rebinding)
  assert.equal(rebinding.out.status, 403, 'a Host that is not the listener (DNS rebinding) is refused')

  const sameOrigin = mockResponse()
  await route.handler(request(), sameOrigin)
  assert.equal(sameOrigin.out.status, 200, 'the same-origin client still works')
  assert.equal(enumerated, 1, 'only the accepted request enumerated')
})

await test('the fence policy is a pure function the route and the tests share', () => {
  assert.equal(refuseRequest(request(), LISTENER_ORIGIN), null)
  assert.equal(refuseRequest(request(), null), null, 'a loopback Host is accepted before the origin is known')
  assert.equal(refuseRequest(request({ drop: [MARKER_HEADER] }), LISTENER_ORIGIN), 'missing-marker')
  assert.equal(refuseRequest(request({ headers: { 'sec-fetch-site': 'cross-site' } }), LISTENER_ORIGIN), 'cross-site')
  assert.equal(refuseRequest(request({ headers: { origin: 'https://evil.example' } }), LISTENER_ORIGIN), 'foreign-origin')
  assert.equal(refuseRequest(request({ headers: { host: 'evil.example:62421' } }), LISTENER_ORIGIN), 'foreign-host')
  assert.equal(refuseRequest({ method: 'GET', url: FONTS_PATH }, LISTENER_ORIGIN), 'no-host')
  assert.equal(
    refuseRequest(request({ headers: { host: 'localhost:62421' } }), LISTENER_ORIGIN), null,
    'localhost is the same loopback listener under another name',
  )
})

await test('?refresh=1 is forwarded as force, and costs no live enumeration', async () => {
  // What this test is FOR is the flag reaching the enumerator. Running the real
  // PowerShell enumeration to prove it cost ≈4.0 s (measured) and asserted only
  // "status 200 + isArray", both of which the injected form below checks exactly.
  const seen = []
  const route = createFontRoute(async (force) => {
    seen.push(force === true)
    return { platform: 'win32', supported: true, sources: [], families: [] }
  }, { origin: () => LISTENER_ORIGIN })

  const forced = mockResponse()
  await route.handler(request({ url: FONTS_PATH + '?refresh=1' }), forced)
  assert.equal(forced.out.status, 200)
  assert.deepEqual(seen, [true], '?refresh=1 reaches the enumerator as force=true')

  const plain = mockResponse()
  await route.handler(request(), plain)
  assert.equal(plain.out.status, 200)
  assert.deepEqual(seen, [true, false], 'an ordinary read does not force')
})

await test('an unparseable request URL does not fail the read', async () => {
  const { ctx, routes } = mockContext()
  apply(ctx)
  const response = mockResponse()
  await routes[0].handler(request({ url: '::::not a url' }), response)
  assert.equal(response.out.status, 200, 'falls back to a non-forced read')
})

await test('disposing the effect unregisters the route', async () => {
  const { ctx, effects, routes } = mockContext()
  apply(ctx)
  assert.equal(routes[0].disposed, undefined)
  await effects[0].dispose()
  assert.equal(routes[0].disposed, true, 'the disposer register() returned was honored')
})

// --------------------------------------------------------------- font route

process.stdout.write('\nlib/font-route.js — the catalogue route with an injected enumerator\n')

await test('a deterministic catalogue is served in the documented wire shape', async () => {
  // The enumerator still carries provenance (`file`) internally; the wire must
  // not. This is the whitelist, proven on the one field that used to ride along.
  const catalogue = {
    platform: 'win32', supported: true, count: 1, sources: ['injected:1'],
    families: [{
      family: 'Test Sans', weights: [400, 700], italic: false, symbol: false,
      gdi: true, localized: false, file: 'C:\\Users\\u\\AppData\\Local\\Microsoft\\Windows\\Fonts\\test.ttf',
    }],
  }
  const route = createFontRoute(async () => catalogue, { origin: () => LISTENER_ORIGIN })
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, FONTS_PATH)
  const response = mockResponse()
  await route.handler(request(), response)
  assert.equal(response.out.status, 200)
  assert.deepEqual(JSON.parse(response.out.body), {
    platform: 'win32',
    supported: true,
    sources: ['injected:1'],
    count: 1,
    families: [{ family: 'Test Sans', weights: [400, 700], italic: false, symbol: false, gdi: true, localized: false }],
  })
  assert.ok(!response.out.body.includes('test.ttf'), 'the file path is not on the wire')
})

await test('?refresh=1 is forwarded to the enumerator as force=true', async () => {
  const seen = []
  const route = createFontRoute(async (force) => {
    seen.push(force)
    return { platform: 'win32', supported: true, families: [], sources: [] }
  }, { origin: () => LISTENER_ORIGIN })
  const response = mockResponse()
  await route.handler(request(), response)
  await route.handler(request({ url: FONTS_PATH + '?refresh=1' }), mockResponse())
  assert.deepEqual(seen, [false, true])
})

await test('a burst of forced refreshes is coalesced, so a loop cannot spawn PowerShell per request', async () => {
  const seen = []
  let clock = 1_000
  const route = createFontRoute(async (force) => {
    seen.push(force)
    return { platform: 'win32', supported: true, families: [], sources: [] }
  }, { origin: () => LISTENER_ORIGIN, now: () => clock })

  await route.handler(request({ url: FONTS_PATH + '?refresh=1' }), mockResponse())
  clock += 100
  await route.handler(request({ url: FONTS_PATH + '?refresh=1' }), mockResponse())
  clock += 100
  await route.handler(request({ url: FONTS_PATH + '?refresh=1' }), mockResponse())
  assert.deepEqual(seen, [true, false, false], 'only the first forced read re-enumerates inside the window')

  clock += FORCE_COOLDOWN_MS + 1
  await route.handler(request({ url: FONTS_PATH + '?refresh=1' }), mockResponse())
  assert.deepEqual(seen, [true, false, false, true], 'a later refresh is honoured again')
})

await test('an enumerator failure becomes a 500 with the error message', async () => {
  const route = createFontRoute(async () => { throw new Error('registry read failed') }, {
    origin: () => LISTENER_ORIGIN,
  })
  const response = mockResponse()
  await route.handler(request(), response)
  assert.equal(response.out.status, 500)
  const body = JSON.parse(response.out.body)
  assert.equal(body.error, 'registry read failed')
  assert.ok(Array.isArray(body.families))
  assert.equal(body.families.length, 0)
  assert.equal(body.supported, true, 'the platform is still supported — the read failed')
})

await test('a non-GET method is refused with 405 on the direct route too', async () => {
  const route = createFontRoute(async () => ({ families: [] }), { origin: () => LISTENER_ORIGIN })
  const response = mockResponse()
  await route.handler(request({ method: 'POST' }), response)
  assert.equal(response.out.status, 405)
  assert.equal(response.out.headers.allow, 'GET')
})

// ------------------------------------------------------- child-process bound

process.stdout.write('\nlib/system-fonts.js — child-process bounds\n')

await test('a hung child process is killed and degrades instead of wedging the catalogue', async () => {
  const started = Date.now()
  const result = await execFileBuffer(process.execPath, ['-e', 'setTimeout(function () {}, 30000)'], { timeout: 300 })
  const elapsed = Date.now() - started
  assert.equal(result.ok, false, 'the run reports failure')
  assert.equal(result.stdout, null, 'and contributes no output, so the source degrades to []')
  assert.ok(elapsed < 5000, `returned in ${elapsed} ms, not after the child's own 30 s`)
})

// ------------------------------------------ client/host marker agreement

process.stdout.write('\nlib/font-route.js — the client and the fence agree\n')

/**
 * The marker header/value are declared twice: once in the host half
 * (`lib/font-route.js`) and once in the client bundle
 * (`client/src/constants.js`), because the two halves are built separately and
 * cannot import each other. A drift is the worst kind of failure this plugin
 * can have: the fence would refuse every request, the picker would silently
 * fall back to manual input, and nothing in either half would look wrong.
 */
await test('the client sends exactly the marker the route requires', async () => {
  const clientConstants = await import('../client/src/constants.js')
  assert.equal(clientConstants.FONTS_MARKER_HEADER, MARKER_HEADER,
    'the header name drifted between client/src/constants.js and lib/font-route.js')
  assert.equal(clientConstants.FONTS_MARKER_VALUE, MARKER_VALUE,
    'the header value drifted between client/src/constants.js and lib/font-route.js')
  // Lowercase is what node lowercases incoming header names to; a client that
  // spelled it differently would still work over `fetch` but the assertion
  // documents the contract the route reads.
  assert.equal(MARKER_HEADER, MARKER_HEADER.toLowerCase(),
    'the route looks the header up in lowercase, so the constant must be lowercase')
})

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`)
if (failures.length > 0) {
  for (const f of failures) process.stdout.write(`\n--- ${f.label} ---\n${f.error.stack}\n`)
  process.exit(1)
}
