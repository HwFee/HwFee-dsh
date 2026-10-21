/**
 * The page → host mode bridge.
 *
 * The failure this file exists for: the settings row published the mode with a
 * Cordis event, which never crosses the process boundary, so the host kept
 * running `auto` (Git Bash on this machine) while the row said "Windows
 * PowerShell". These tests pin the route, its fence, and the validation —
 * without them the bridge can silently be missing again.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const {
  createModeRoute, MODE_PATH, MODE_MARKER_HEADER, MODE_MARKER_VALUE, MAX_BODY_BYTES,
} = await import('../lib/mode-route.js')

const ORIGIN = 'http://127.0.0.1:5000'

function fakeRequest(method, { headers = {}, body = '' } = {}) {
  const request = new EventEmitter()
  request.method = method
  request.headers = headers
  request.destroy = () => {}
  setTimeout(() => {
    if (body !== '') request.emit('data', Buffer.from(body))
    request.emit('end')
  }, 0)
  return request
}

function fakeResponse() {
  const out = { status: 0, headers: null, body: '' }
  return {
    out,
    writeHead(status, headers) { out.status = status; out.headers = headers },
    end(text = '') { out.body = text },
  }
}

const ours = (extra = {}) => ({
  host: '127.0.0.1:5000',
  [MODE_MARKER_HEADER]: MODE_MARKER_VALUE,
  'sec-fetch-site': 'same-origin',
  ...extra,
})

async function call(route, method, options) {
  const response = fakeResponse()
  await route.handler(fakeRequest(method, options), response)
  return response.out
}

test('the route path matches what the client posts to', function () {
  // The client hard-codes this string too (its bundle cannot import host code);
  // a drift here would be a silent 404 and the old mode forever.
  assert.equal(MODE_PATH, '/dsh-git-bash/mode')
  const route = createModeRoute(() => {})
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, MODE_PATH)
})

test('a same-origin POST with the marker switches the host mode', async function () {
  const seen = []
  const route = createModeRoute((mode) => seen.push(mode), { origin: () => ORIGIN })
  const out = await call(route, 'POST', {
    headers: ours({ 'content-type': 'application/json' }),
    body: JSON.stringify({ mode: 'pwsh' }),
  })
  assert.equal(out.status, 200)
  assert.deepEqual(JSON.parse(out.body), { ok: true, mode: 'pwsh' })
  assert.deepEqual(seen, ['pwsh'])
})

test('the marker is required, and it is checked before the body is read', async function () {
  const seen = []
  const route = createModeRoute((mode) => seen.push(mode), { origin: () => ORIGIN })
  const out = await call(route, 'POST', {
    headers: { host: '127.0.0.1:5000' },
    body: JSON.stringify({ mode: 'pwsh' }),
  })
  assert.equal(out.status, 403)
  assert.equal(JSON.parse(out.body).reason, 'missing-marker')
  assert.deepEqual(seen, [], 'a refused request must not change the mode')
})

test('a foreign Host or a cross-site request is refused', async function () {
  const seen = []
  const route = createModeRoute((mode) => seen.push(mode), { origin: () => ORIGIN })
  const foreign = await call(route, 'POST', {
    headers: ours({ host: 'evil.example:5000' }),
    body: JSON.stringify({ mode: 'pwsh' }),
  })
  assert.equal(foreign.status, 403)
  assert.equal(JSON.parse(foreign.body).reason, 'foreign-host')

  const crossSite = await call(route, 'POST', {
    headers: ours({ 'sec-fetch-site': 'cross-site' }),
    body: JSON.stringify({ mode: 'pwsh' }),
  })
  assert.equal(crossSite.status, 403)
  assert.equal(JSON.parse(crossSite.body).reason, 'cross-site')
  assert.deepEqual(seen, [])
})

test('GET reports the host mode, with the same fence', async function () {
  const route = createModeRoute(() => {}, { origin: () => ORIGIN, readMode: () => 'pwsh' })
  const out = await call(route, 'GET', { headers: ours() })
  assert.equal(out.status, 200)
  assert.deepEqual(JSON.parse(out.body), { ok: true, mode: 'pwsh' })

  const refused = await call(route, 'GET', { headers: { host: '127.0.0.1:5000' } })
  assert.equal(refused.status, 403, 'the read half is fenced too')
})

test('only GET and POST are accepted', async function () {
  const route = createModeRoute(() => {})
  const out = await call(route, 'DELETE')
  assert.equal(out.status, 405)
  assert.equal(out.headers.allow, 'GET, POST')
})

test('an unknown mode is rejected instead of echoed as success', async function () {
  const seen = []
  const route = createModeRoute((mode) => seen.push(mode), { origin: () => ORIGIN })
  const out = await call(route, 'POST', {
    headers: ours(),
    body: JSON.stringify({ mode: 'cmd' }),
  })
  assert.equal(out.status, 400)
  assert.equal(JSON.parse(out.body).error, 'unknown-mode')
  assert.deepEqual(seen, [])
})

test('an oversized body is refused', async function () {
  const seen = []
  const route = createModeRoute((mode) => seen.push(mode), { origin: () => ORIGIN })
  const out = await call(route, 'POST', {
    headers: ours(),
    body: 'x'.repeat(MAX_BODY_BYTES + 1),
  })
  assert.equal(out.status, 413)
  assert.deepEqual(seen, [])
})