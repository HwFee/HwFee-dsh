/**
 * Long plain-text paste → workspace file + `@mention`.
 *
 * Two halves are exercised here, and each one is where a bug would lose the
 * user's text:
 *
 *   1. CLIENT (`client/src/paste.js`): the pure threshold decision, the file
 *      name, the mention grammar, and — with a fake composer — the exact
 *      safety net. The Host route is faked at the `fetchPaste` seam so every
 *      failure mode can be driven: refusal, throw, a promise that never
 *      settles, a mention that never lands.
 *
 *   2. HOST (`lib/paste-route.js`, `lib/paste-store.js`): the request fence,
 *      the body reader, the never-overwrite writer, and one real end-to-end
 *      write into a temporary workspace.
 *
 *   node test/paste.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'

import {
  PASTE_FILE_CHAR_THRESHOLD, PASTE_FILE_LINE_THRESHOLD, PASTE_ATTACH_WAIT_MS,
  PASTE_FILE_TYPE, PASTE_ROUTE, PASTE_MARKER_HEADER, PASTE_MARKER_VALUE,
  countLines, isLongPaste, looksLikeRichPayload, shouldConvertPaste,
  formatPasteStamp, sanitizeFileName, buildPastedTextFilename, attachmentCount,
  formatPasteMention, composerSessionId, requestPasteFile,
  createPasteConverter,
} from '../client/src/paste.js'
import { en, zh, makeTranslator } from '../client/src/locales.js'
import {
  PASTE_PATH, refuseRequest, readJsonBody,
  createPasteRoute, sessionWorkspace,
} from '../lib/paste-route.js'
import {
  PASTE_DIR, MAX_PASTE_BYTES, MAX_PASTE_NAME, sanitizePasteName,
  formatPasteMention as hostMention, writePasteFile,
} from '../lib/paste-store.js'

// ------------------------------------------------------- pure threshold

test('the character threshold is exactly 2000', function () {
  assert.equal(PASTE_FILE_CHAR_THRESHOLD, 2000)
  assert.equal(isLongPaste('x'.repeat(1999)), false, '1999 characters stay text')
  assert.equal(isLongPaste('x'.repeat(2000)), true, '2000 characters become a file')
})

test('the line threshold is exactly 30', function () {
  assert.equal(PASTE_FILE_LINE_THRESHOLD, 30)
  const lines = function (count) { return new Array(count).fill('x').join('\n') }
  assert.equal(countLines(lines(29)), 29)
  assert.equal(countLines(lines(30)), 30)
  assert.equal(isLongPaste(lines(29)), false, '29 short lines stay text')
  assert.equal(isLongPaste(lines(30)), true, '30 short lines become a file')
})

test('countLines counts CRLF, CR and LF separators and a trailing line', function () {
  assert.equal(countLines('a\nb'), 2)
  assert.equal(countLines('a\r\nb'), 2)
  assert.equal(countLines('a\rb'), 2)
  assert.equal(countLines('a\n'), 2, 'a trailing newline opens an empty last line')
  assert.equal(countLines(''), 1)
})

test('the predicate ignores short pastes, file payloads and rich HTML', function () {
  const long = 'x'.repeat(2000)
  assert.equal(shouldConvertPaste({ text: 'short', fileCount: 0 }), false)
  assert.equal(shouldConvertPaste({ text: long, fileCount: 0 }), true)
  assert.equal(shouldConvertPaste({ text: long, fileCount: 1 }), false,
    'a clipboard carrying a file is the host’s case, not ours')
  assert.equal(shouldConvertPaste({ text: long, fileCount: 0, html: '<p>formatted</p>' }), true,
    'styled prose is still plain text')
  for (const html of [
    '<p>x</p><img src="data:image/png;base64,xx">',
    '<table><tr><td>x</td></tr></table>',
    '<a href="file:///C:/x">x</a>',
    '<video src="x"></video>',
    '<input value="x">',
  ]) {
    assert.equal(shouldConvertPaste({ text: long, fileCount: 0, html: html }), false, html)
  }
  assert.equal(shouldConvertPaste({ enabled: false, text: long, fileCount: 0 }), false,
    'the switch always wins')
})

// ------------------------------------------------------------ file name

test('the file name is bilingual and timestamped', function () {
  const clock = new Date(2026, 9, 18, 10, 37)
  assert.equal(formatPasteStamp(clock), '2026-10-18-1037')
  assert.equal(buildPastedTextFilename(makeTranslator(en), clock), 'pasted-text-2026-10-18-1037.txt')
  assert.equal(buildPastedTextFilename(makeTranslator(zh), clock), '粘贴文本-2026-10-18-1037.txt')
})

test('the file name is deterministic for an injected clock', function () {
  const clock = new Date(2026, 0, 2, 3, 4)
  assert.equal(buildPastedTextFilename(makeTranslator(en), clock), 'pasted-text-2026-01-02-0304.txt')
  assert.equal(formatPasteStamp(clock), '2026-01-02-0304', 'every field is two digits')
})

test('a hostile name loses every character Windows rejects', function () {
  const clock = new Date(2026, 9, 18, 10, 37)
  const hostile = makeTranslator({ 'pasteFile.fileName': 'a<>:"/\\|?*b-{stamp}.txt' })
  const name = buildPastedTextFilename(hostile, clock)
  assert.equal(name, 'a-b-2026-10-18-1037.txt')
  for (const character of ['<', '>', ':', '"', '/', '\\', '|', '?', '*']) {
    assert.ok(!name.includes(character), 'name still contains ' + character)
  }
})

test('sanitizeFileName trims edges, collapses separators and protects device names', function () {
  assert.equal(sanitizeFileName('  ..name..txt.. '), 'name..txt')
  assert.equal(sanitizeFileName('a///b'), 'a-b')
  assert.equal(sanitizeFileName('CON.txt'), '_CON.txt')
  assert.equal(sanitizeFileName(''), 'pasted-text.txt')
  assert.equal(sanitizeFileName('a\u0000b'), 'a-b')
})

// ------------------------------------------------------------ the mention

test('the mention uses the host grammar: plain when simple, quoted for spaces', function () {
  assert.equal(formatPasteMention('.dsh-paste/pasted-text-2026-10-18-1037.txt'),
    '@.dsh-paste/pasted-text-2026-10-18-1037.txt')
  assert.equal(formatPasteMention('.dsh-paste/two words.txt'), '@".dsh-paste/two words.txt"')
  assert.equal(formatPasteMention('a\\b.txt'), '@a/b.txt', 'backslashes normalize')
  assert.equal(formatPasteMention(''), null)
  assert.equal(formatPasteMention('a"b.txt'), null, 'a quote is unrepresentable')
  assert.equal(formatPasteMention('a\u0001b.txt'), null, 'a control character is unrepresentable')
  // The Host half must spell it identically, or the chip would open a path the
  // file was not written under.
  assert.equal(hostMention('.dsh-paste/two words.txt'), formatPasteMention('.dsh-paste/two words.txt'))
})

test('the session id comes from the conversation body, not from a guess', function () {
  const body = new FakeElement({ 'data-conversation-session': 'session-1' })
  const card = new FakeElement({ 'data-composer-card': '' })
  const input = new FakeElement({ 'data-composer-input': '' })
  body.append(card)
  card.append(input)
  assert.equal(composerSessionId(input), 'session-1')
  assert.equal(composerSessionId(new FakeElement({ 'data-composer-input': '' })), '',
    'a session-less composer answers no id')
  assert.equal(composerSessionId(null), '')
})

// --------------------------------------------------------- fake composer

class FakeElement {
  constructor(attrs) {
    this.attrs = attrs || {}
    this.children = []
    this.parentElement = null
    this.dispatched = []
    this.connected = true
    this.textContent = ''
    this.dataset = {}
    for (const [name, value] of Object.entries(this.attrs)) {
      if (!name.startsWith('data-')) continue
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      this.dataset[key] = String(value)
    }
  }

  appendChild(node) {
    node.parentElement = this
    this.children.push(node)
    return node
  }

  append() {
    for (const node of arguments) this.appendChild(node)
    return this
  }

  hasAttribute(name) { return Object.hasOwn(this.attrs, name) }
  getAttribute(name) { return this.hasAttribute(name) ? String(this.attrs[name]) : null }
  setAttribute(name, value) { this.attrs[name] = String(value) }
  removeAttribute(name) { delete this.attrs[name] }
  get isConnected() { return this.connected }

  matches(selector) {
    const attr = /^\[([A-Za-z0-9-]+)(?:="([^"]*)")?\]$/.exec(selector)
    if (attr === null) throw new Error('fake DOM: unsupported selector ' + selector)
    if (!this.hasAttribute(attr[1])) return false
    return attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]
  }

  querySelectorAll(selector) {
    const out = []
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) out.push(child)
        walk(child)
      }
    }
    walk(this)
    return out
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }

  closest(selector) {
    let node = this
    while (node) {
      if (node.matches(selector)) return node
      node = node.parentElement
    }
    return null
  }

  dispatchEvent(event) {
    this.dispatched.push(event)
    // Stand in for the host's PASTE_COMMAND handler: a text payload lands in
    // the editor, which is exactly what the landing check reads.
    const transfer = event.clipboardData
    if (transfer && typeof transfer.getData === 'function') {
      const text = transfer.getData('text/plain')
      if (text !== '') this.textContent += text
    }
    return true
  }
}

class FakeTransfer {
  constructor() {
    this.added = []
    this.data = new Map()
    this.items = { add: (file) => { this.added.push(file) } }
  }

  setData(type, value) { this.data.set(type, String(value)) }
  getData(type) { return this.data.get(type) || '' }
}

function fakeDocument() {
  const listeners = []
  const doc = new FakeElement({})
  doc.body = doc
  doc.addEventListener = function (type, callback, capture) {
    listeners.push({ type, callback, capture })
  }
  doc.removeEventListener = function (type, callback, capture) {
    const at = listeners.findIndex(function (entry) {
      return entry.type === type && entry.callback === callback && entry.capture === capture
    })
    if (at >= 0) listeners.splice(at, 1)
  }
  doc.listeners = listeners
  return doc
}

/** A composer with the host hooks the converter reads, under a Session body. */
function buildComposer(sessionId) {
  const doc = fakeDocument()
  const body = new FakeElement(sessionId === null ? {} : { 'data-conversation-session': sessionId || 'session-1' })
  const card = new FakeElement({ 'data-composer-card': '' })
  const input = new FakeElement({ 'data-composer-input': '' })
  card.append(input)
  body.append(card)
  doc.append(body)
  return { doc, body, card, input }
}

function pasteEvent(target, payload) {
  const files = payload.files || []
  const values = payload.values || {}
  return {
    target: target,
    clipboardData: {
      items: files.map(function (file) {
        return { kind: 'file', getAsFile: function () { return file } }
      }),
      files: files,
      getData: function (type) { return values[type] === undefined ? '' : values[type] },
    },
    prevented: false,
    stopped: false,
    preventDefault: function () { this.prevented = true },
    stopImmediatePropagation: function () { this.stopped = true },
  }
}

/** A manual timer queue: `flush` advances the injected clock by `pollMs`. */
function manualTimers(pollMs) {
  const queue = []
  let clock = 0
  function schedule(callback) {
    queue.push(callback)
    return callback
  }
  function cancel(timer) {
    const at = queue.indexOf(timer)
    if (at >= 0) queue.splice(at, 1)
  }
  function flush(limit) {
    let steps = 0
    while (queue.length > 0 && steps < (limit || 200)) {
      clock += pollMs
      const callback = queue.shift()
      callback()
      steps += 1
    }
  }
  return {
    schedule: schedule,
    cancel: cancel,
    flush: flush,
    nowMs: function () { return clock },
  }
}

function makeConverter(composer, timers, options) {
  const opts = options || {}
  return createPasteConverter({
    doc: composer.doc,
    getState: opts.getState || function () { return { pasteAsFile: true } },
    translate: opts.translate || makeTranslator(en),
    now: function () { return new Date(2026, 9, 18, 10, 37) },
    nowMs: timers.nowMs,
    waitMs: opts.waitMs === undefined ? PASTE_ATTACH_WAIT_MS / 10 : opts.waitMs,
    pollMs: 100,
    schedule: timers.schedule,
    cancel: timers.cancel,
    makeDataTransfer: function () { return new FakeTransfer() },
    makeClipboardEvent: function (type, init) {
      return { type: type, clipboardData: init.clipboardData, bubbles: init.bubbles, cancelable: init.cancelable }
    },
    fetchPaste: opts.fetchPaste || function () {
      return Promise.resolve({ mention: '@.dsh-paste/pasted-text-2026-10-18-1037.txt' })
    },
  })
}

/** The mention the fake Host answers, and what the composer must receive. */
const MENTION = '@.dsh-paste/pasted-text-2026-10-18-1037.txt'

/** The text payloads the composer actually received. */
function pastedTexts(input) {
  return input.dispatched.map(function (event) {
    return event.clipboardData && typeof event.clipboardData.getData === 'function'
      ? event.clipboardData.getData('text/plain')
      : ''
  })
}

// -------------------------------------------------------------- behaviour

test('the switch is off → the paste is not intercepted', function () {
  const composer = buildComposer()
  const timers = manualTimers(100)
  const converter = makeConverter(composer, timers, {
    getState: function () { return { pasteAsFile: false } },
  })
  converter.start()
  const listener = composer.doc.listeners[0]
  assert.equal(listener.capture, true, 'the listener must capture the real paste')

  const event = pasteEvent(composer.input, { values: { 'text/plain': 'x'.repeat(2500) } })
  listener.callback(event)
  assert.equal(event.prevented, false, 'no preventDefault when the switch is off')
  assert.equal(event.stopped, false)
  assert.equal(composer.input.dispatched.length, 0, 'no synthetic paste is dispatched')
  converter.stop()
})

test('a long paste becomes one mention, not the text', async function () {
  const composer = buildComposer()
  const timers = manualTimers(100)
  const calls = []
  const converter = makeConverter(composer, timers, {
    fetchPaste: function (request) {
      calls.push(request)
      return Promise.resolve({ mention: '@.dsh-paste/pasted-text-2026-10-18-1037.txt' })
    },
  })
  converter.start()
  const listener = composer.doc.listeners[0]

  const text = 'x'.repeat(2100)
  const event = pasteEvent(composer.input, { values: { 'text/plain': text } })
  listener.callback(event)

  assert.equal(event.prevented, true)
  assert.equal(event.stopped, true, 'the host must not also insert the text')
  assert.equal(calls.length, 1, 'the Host is asked exactly once')
  assert.equal(calls[0].sessionId, 'session-1')
  assert.equal(calls[0].name, 'pasted-text-2026-10-18-1037.txt')
  assert.equal(calls[0].text, text)

  // The dispatch is asynchronous (the Host answer is a promise); let it settle.
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(pastedTexts(composer.input), [MENTION + ' '],
    'only the mention reaches the composer, separated by one trailing space')

  // The mention landed: the watchdog must not paste the text afterwards.
  timers.flush()
  assert.deepEqual(pastedTexts(composer.input), [MENTION + ' '])
  converter.stop()
})

test('a Host refusal puts the original text back, exactly once', async function () {
  const composer = buildComposer()
  const timers = manualTimers(100)
  const converter = makeConverter(composer, timers, {
    fetchPaste: function () { return Promise.reject(new Error('403')) },
  })
  converter.start()
  const listener = composer.doc.listeners[0]

  const text = 'y'.repeat(2500)
  const event = pasteEvent(composer.input, { values: { 'text/plain': text } })
  listener.callback(event)
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(pastedTexts(composer.input), [text], 'the text is the only payload')
  timers.flush()
  assert.equal(composer.input.dispatched.length, 1, 'the fallback never repeats')
  converter.stop()
})

test('a Host that throws synchronously still yields the original text', async function () {
  const composer = buildComposer()
  const timers = manualTimers(100)
  const converter = makeConverter(composer, timers, {
    fetchPaste: function () { throw new Error('no fetch') },
  })
  converter.start()
  const listener = composer.doc.listeners[0]

  const text = 'z'.repeat(2500)
  listener.callback(pasteEvent(composer.input, { values: { 'text/plain': text } }))
  assert.deepEqual(pastedTexts(composer.input), [text])
  converter.stop()
})

test('a Host that never answers yields the text at the deadline and aborts', function () {
  const composer = buildComposer()
  const timers = manualTimers(100)
  let signal = null
  const converter = makeConverter(composer, timers, {
    waitMs: 300,
    fetchPaste: function (request, init) {
      signal = init && init.signal
      return new Promise(function () {})
    },
  })
  converter.start()
  const listener = composer.doc.listeners[0]

  const text = 'q'.repeat(2500)
  listener.callback(pasteEvent(composer.input, { values: { 'text/plain': text } }))
  assert.equal(composer.input.dispatched.length, 0, 'nothing yet: the Host is in flight')

  timers.flush()
  assert.deepEqual(pastedTexts(composer.input), [text], 'the deadline pastes the original text')
  assert.ok(signal !== null && signal.aborted === true, 'the request is aborted')
  converter.stop()
})

test('a mention that never lands falls back to the text', async function () {
  // The editor refuses the synthetic paste (a lock, a phase guard, a missing
  // handler): the mention was dispatched but never arrived.
  const composer = buildComposer()
  const timers = manualTimers(100)
  composer.input.dispatchEvent = function (event) {
    // Record the payload without applying it.
    this.dispatched.push(event)
    return true
  }
  const converter = makeConverter(composer, timers, { waitMs: 300 })
  converter.start()
  const listener = composer.doc.listeners[0]

  const text = 'w'.repeat(2500)
  listener.callback(pasteEvent(composer.input, { values: { 'text/plain': text } }))
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(pastedTexts(composer.input), [MENTION + ' '])

  timers.flush()
  assert.deepEqual(pastedTexts(composer.input),
    [MENTION + ' ', text],
    'the original text is put back after the mention fails to land')
  converter.stop()
})

test('a session-less composer pastes the text and never calls the Host', function () {
  const composer = buildComposer(null)
  const timers = manualTimers(100)
  let called = false
  const converter = makeConverter(composer, timers, {
    fetchPaste: function () { called = true; return Promise.resolve({ mention: '@x' }) },
  })
  converter.start()
  const listener = composer.doc.listeners[0]

  const text = 'v'.repeat(2500)
  const event = pasteEvent(composer.input, { values: { 'text/plain': text } })
  listener.callback(event)
  assert.equal(event.prevented, true, 'we own the paste either way')
  assert.equal(called, false, 'no Session means no workspace to write into')
  assert.deepEqual(pastedTexts(composer.input), [text])
  converter.stop()
})

test('a short paste and a file paste are left to the host untouched', function () {
  const composer = buildComposer()
  const timers = manualTimers(100)
  const converter = makeConverter(composer, timers)
  converter.start()
  const listener = composer.doc.listeners[0]

  const short = pasteEvent(composer.input, { values: { 'text/plain': 'hello' } })
  listener.callback(short)
  assert.equal(short.prevented, false)
  assert.equal(composer.input.dispatched.length, 0)

  const file = { name: 'a.png' }
  const withFile = pasteEvent(composer.input, {
    files: [file],
    values: { 'text/plain': 'x'.repeat(3000) },
  })
  listener.callback(withFile)
  assert.equal(withFile.prevented, false, 'a clipboard with a file is the host’s own case')
  assert.equal(composer.input.dispatched.length, 0)
  converter.stop()
})

test('the paste listener is removable and stops all work', function () {
  const composer = buildComposer()
  const timers = manualTimers(100)
  const converter = makeConverter(composer, timers, {
    fetchPaste: function () { return new Promise(function () {}) },
  })
  converter.start()
  const listener = composer.doc.listeners[0]
  converter.stop()
  assert.equal(composer.doc.listeners.length, 0)
  // A late paste after stop is somebody else's problem.
  listener.callback(pasteEvent(composer.input, { values: { 'text/plain': 'x'.repeat(2500) } }))
  assert.equal(composer.input.dispatched.length, 0)
})

// ------------------------------------------------------- request assembly

test('requestPasteFile posts the marker header and reads the mention', async function () {
  const seen = []
  const result = await requestPasteFile(
    { sessionId: 's1', name: 'a.txt', text: 'body' },
    {
      fetchImpl: async function (url, init) {
        seen.push({ url: url, init: init })
        return { ok: true, status: 200, json: async function () { return { ok: true, mention: '@.dsh-paste/a.txt' } } }
      },
    },
  )
  assert.equal(result.mention, '@.dsh-paste/a.txt')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].url, PASTE_ROUTE)
  assert.equal(seen[0].init.method, 'POST')
  assert.equal(seen[0].init.credentials, 'same-origin')
  assert.equal(seen[0].init.headers[PASTE_MARKER_HEADER], PASTE_MARKER_VALUE)
  assert.equal(JSON.parse(seen[0].init.body).sessionId, 's1')
})

test('requestPasteFile rejects a refused or malformed answer', async function () {
  await assert.rejects(requestPasteFile({}, {
    fetchImpl: async function () { return { ok: false, status: 403, json: async function () { return {} } } },
  }), /refused the conversion/)
  await assert.rejects(requestPasteFile({}, {
    fetchImpl: async function () { return { ok: true, status: 200, json: async function () { return { ok: true } } } },
  }), /no mention/)
})

test('attachmentCount reads the host file card title (kept for the internals)', function () {
  const card = new FakeElement({ 'data-composer-card': '' })
  assert.equal(attachmentCount(card, 'a.txt'), 0)
  for (const name of ['a.txt', 'a.txt', 'b.txt']) card.appendChild(new FakeElement({ title: name }))
  assert.equal(attachmentCount(card, 'a.txt'), 2)
  assert.equal(attachmentCount(null, 'a.txt'), 0)
})

// ------------------------------------------------------------ host route

function fakeRequest(options) {
  const opts = options || {}
  const headers = {}
  for (const [name, value] of Object.entries(opts.headers || {})) headers[name.toLowerCase()] = value
  const request = new PassThrough()
  request.method = opts.method || 'POST'
  request.headers = headers
  request.url = PASTE_PATH
  request.end(opts.body === undefined ? '' : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)))
  return request
}

function fakeResponse() {
  return {
    status: 0,
    headers: null,
    body: '',
    writeHead(code, headers) { this.status = code; this.headers = headers || {} },
    end(text) { this.body = text === undefined ? '' : String(text) },
  }
}

async function callRoute(route, options) {
  const request = fakeRequest(options)
  const response = fakeResponse()
  await route.handler(request, response)
  let json = null
  try { json = response.body === '' ? null : JSON.parse(response.body) } catch (error) { json = null }
  return { status: response.status, headers: response.headers, json: json }
}

const SAME_ORIGIN = 'http://127.0.0.1:50425'

test('the route path and the client constant are the same string', function () {
  assert.equal(PASTE_PATH, '/dsh-cds-theme/paste')
  assert.equal(PASTE_ROUTE, PASTE_PATH)
})

test('the fence refuses a foreign Host, a cross-site request and a missing marker', function () {
  assert.equal(refuseRequest(fakeRequest({ headers: {} }), SAME_ORIGIN), 'no-host')
  assert.equal(refuseRequest(fakeRequest({ headers: { host: 'evil.example:50425' } }), SAME_ORIGIN), 'foreign-host')
  assert.equal(refuseRequest(fakeRequest({ headers: { host: '127.0.0.1:50425' } }), SAME_ORIGIN), 'missing-marker')
  assert.equal(refuseRequest(fakeRequest({
    headers: { host: '127.0.0.1:50425', 'sec-fetch-site': 'cross-site', [PASTE_MARKER_HEADER]: '1' },
  }), SAME_ORIGIN), 'cross-site')
  assert.equal(refuseRequest(fakeRequest({
    headers: { host: '127.0.0.1:50425', origin: 'http://evil.example', [PASTE_MARKER_HEADER]: '1' },
  }), SAME_ORIGIN), 'foreign-origin')
  assert.equal(refuseRequest(fakeRequest({
    headers: { host: '127.0.0.1:50425', 'sec-fetch-site': 'same-origin', [PASTE_MARKER_HEADER]: '1' },
  }), SAME_ORIGIN), null, 'our own request passes')
  // The Desktop forwarder strips Origin and Sec-Fetch-Site, so their absence
  // must pass too.
  assert.equal(refuseRequest(fakeRequest({
    headers: { host: '127.0.0.1:50425', [PASTE_MARKER_HEADER]: '1' },
  }), SAME_ORIGIN), null)
})

test('an unknown listener origin still demands loopback', function () {
  assert.equal(refuseRequest(fakeRequest({
    headers: { host: '10.0.0.5:50425', [PASTE_MARKER_HEADER]: '1' },
  }), null), 'foreign-host')
  assert.equal(refuseRequest(fakeRequest({
    headers: { host: 'localhost:50425', [PASTE_MARKER_HEADER]: '1' },
  }), null), null)
})

test('readJsonBody parses one object and refuses an oversized body', async function () {
  assert.deepEqual(await readJsonBody(fakeRequest({ body: { a: 1 } })), { a: 1 })
  await assert.rejects(readJsonBody(fakeRequest({ body: 'x'.repeat(64) }), 8), /too large/)
  await assert.rejects(readJsonBody(fakeRequest({ body: 'not json' })), SyntaxError)
})

test('the route answers 405, 403, 400 and 409 without writing', async function () {
  const writes = []
  const route = createPasteRoute({}, {
    origin: () => SAME_ORIGIN,
    resolveWorkspace: async () => '/workspace',
    store: async (input) => { writes.push(input); return { fileName: 'a.txt', relativePath: '.dsh-paste/a.txt' } },
  })
  assert.equal((await callRoute(route, { method: 'GET', headers: { host: '127.0.0.1:50425' } })).status, 405)
  assert.equal((await callRoute(route, {
    headers: { host: '127.0.0.1:50425' }, body: { sessionId: 's', name: 'a.txt', text: 'x' },
  })).status, 403, 'no marker, no write')
  assert.equal((await callRoute(route, {
    headers: { host: '127.0.0.1:50425', [PASTE_MARKER_HEADER]: '1' }, body: 'garbage',
  })).status, 400)
  assert.equal((await callRoute(route, {
    headers: { host: '127.0.0.1:50425', [PASTE_MARKER_HEADER]: '1' }, body: { sessionId: 's' },
  })).status, 400, 'a missing field is a client bug')
  assert.equal(writes.length, 0, 'nothing reached the writer')

  const noWorkspace = createPasteRoute({}, {
    origin: () => SAME_ORIGIN,
    resolveWorkspace: async () => null,
    store: async (input) => { writes.push(input); return { fileName: 'a.txt', relativePath: '.dsh-paste/a.txt' } },
  })
  const refused = await callRoute(noWorkspace, {
    headers: { host: '127.0.0.1:50425', [PASTE_MARKER_HEADER]: '1' },
    body: { sessionId: 's', name: 'a.txt', text: 'x' },
  })
  assert.equal(refused.status, 409)
  assert.equal(refused.json.reason, 'no-workspace')
  assert.equal(writes.length, 0)
})

test('the route answers the mention and the relative path', async function () {
  const route = createPasteRoute({}, {
    origin: () => SAME_ORIGIN,
    resolveWorkspace: async () => '/workspace',
    store: async () => ({ fileName: 'two words.txt', relativePath: '.dsh-paste/two words.txt' }),
  })
  const answer = await callRoute(route, {
    headers: { host: '127.0.0.1:50425', [PASTE_MARKER_HEADER]: '1' },
    body: { sessionId: 's', name: 'two words.txt', text: 'hello' },
  })
  assert.equal(answer.status, 200)
  assert.equal(answer.json.ok, true)
  assert.equal(answer.json.relativePath, '.dsh-paste/two words.txt')
  assert.equal(answer.json.mention, '@".dsh-paste/two words.txt"')
  assert.equal(answer.headers['cache-control'], 'no-store')
})

test('the route caps the body and reports a write failure', async function () {
  const tooBig = createPasteRoute({}, {
    origin: () => SAME_ORIGIN,
    resolveWorkspace: async () => '/workspace',
    store: async () => { throw new Error('must not run') },
  })
  const big = await callRoute(tooBig, {
    headers: { host: '127.0.0.1:50425', [PASTE_MARKER_HEADER]: '1' },
    body: { sessionId: 's', name: 'a.txt', text: 'x'.repeat(MAX_PASTE_BYTES + 1) },
  })
  assert.equal(big.status, 413)
  assert.equal(big.json.reason, 'too-large')

  const broken = createPasteRoute({}, {
    origin: () => SAME_ORIGIN,
    resolveWorkspace: async () => '/workspace',
    store: async () => { throw new Error('EACCES') },
  })
  const failed = await callRoute(broken, {
    headers: { host: '127.0.0.1:50425', [PASTE_MARKER_HEADER]: '1' },
    body: { sessionId: 's', name: 'a.txt', text: 'x' },
  })
  assert.equal(failed.status, 500)
  assert.equal(failed.json.reason, 'write-failed')
})

test('sessionWorkspace reads the live header, then the persisted one', async function () {
  const live = {
    get(id) { return id === 'live' ? { header: { cwd: 'C:\\work\\live' } } : undefined },
  }
  assert.equal(await sessionWorkspace({ get: (name) => (name === 'sessions' ? live : undefined) }, 'live'),
    'C:\\work\\live')
  assert.equal(await sessionWorkspace({ get: (name) => (name === 'sessions' ? live : undefined) }, 'cold'), null)

  const controller = { async inspect(id) { return id === 'cold' ? { meta: { cwd: '/work/cold' } } : { meta: {} } } }
  const ctx = { get: (name) => (name === 'sessionController' ? controller : undefined) }
  assert.equal(await sessionWorkspace(ctx, 'cold'), '/work/cold')
  assert.equal(await sessionWorkspace(ctx, 'gone'), null)
  assert.equal(await sessionWorkspace({ get: () => undefined }, 'x'), null, 'no services, no workspace')
})

// ----------------------------------------------------------- host writer

test('sanitizePasteName is the same discipline the client applies', function () {
  assert.equal(sanitizePasteName('a/b.txt'), 'a-b.txt')
  assert.equal(sanitizePasteName('../escape.txt'), '-escape.txt',
    'a traversal prefix cannot survive as a path separator')
  assert.equal(sanitizePasteName('CON.txt'), '_CON.txt')
  assert.equal(sanitizePasteName(''), 'pasted-text.txt')
  assert.equal(sanitizePasteName('x'.repeat(400)).length, MAX_PASTE_NAME)
})

test('writePasteFile writes UTF-8 under .dsh-paste and never overwrites', async function () {
  const workspace = await mkdtemp(path.join(tmpdir(), 'cds-paste-'))
  try {
    const first = await writePasteFile({ cwd: workspace, name: 'paste.txt', text: 'hello 世界' })
    assert.equal(first.fileName, 'paste.txt')
    assert.equal(first.relativePath, PASTE_DIR + '/paste.txt')
    assert.equal(await readFile(path.join(workspace, PASTE_DIR, 'paste.txt'), 'utf8'), 'hello 世界')

    const second = await writePasteFile({ cwd: workspace, name: 'paste.txt', text: 'second' })
    assert.equal(second.fileName, 'paste-2.txt', 'a second paste gets its own file')
    assert.equal(await readFile(path.join(workspace, PASTE_DIR, 'paste-2.txt'), 'utf8'), 'second')
    assert.equal(await readFile(path.join(workspace, PASTE_DIR, 'paste.txt'), 'utf8'), 'hello 世界',
      'the first paste is intact')

    const third = await writePasteFile({ cwd: workspace, name: 'paste.txt', text: 'third' })
    assert.equal(third.fileName, 'paste-3.txt')
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('writePasteFile refuses a relative workspace', async function () {
  await assert.rejects(writePasteFile({ cwd: 'relative/dir', name: 'a.txt', text: 'x' }), /absolute path/)
  await assert.rejects(writePasteFile({ cwd: '', name: 'a.txt', text: 'x' }), /absolute path/)
})

test('writePasteFile leaves no half-written file when the write fails', async function () {
  const workspace = await mkdtemp(path.join(tmpdir(), 'cds-paste-fail-'))
  try {
    // A directory squatting on the target name makes `open(…, 'wx')` fail with
    // EEXIST → the retry path; a directory at every candidate is the hard stop.
    await mkdir(path.join(workspace, PASTE_DIR), { recursive: true })
    await mkdir(path.join(workspace, PASTE_DIR, 'blocked.txt'))
    for (let i = 2; i <= 100; i += 1) await mkdir(path.join(workspace, PASTE_DIR, 'blocked-' + i + '.txt'))
    await assert.rejects(
      writePasteFile({ cwd: workspace, name: 'blocked.txt', text: 'x' }),
      /every candidate file name is taken|EISDIR|EEXIST/,
    )
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('the whole Host path writes a real file a relative mention resolves to', async function () {
  const workspace = await mkdtemp(path.join(tmpdir(), 'cds-paste-e2e-'))
  try {
    const route = createPasteRoute({}, { origin: () => SAME_ORIGIN, resolveWorkspace: async () => workspace })
    const answer = await callRoute(route, {
      headers: { host: '127.0.0.1:50425', [PASTE_MARKER_HEADER]: '1' },
      body: { sessionId: 's', name: 'pasted-text-2026-10-18-1037.txt', text: 'kept exactly\nline two' },
    })
    assert.equal(answer.status, 200)
    assert.equal(answer.json.mention, '@' + answer.json.relativePath)
    const written = await readFile(path.join(workspace, answer.json.relativePath), 'utf8')
    assert.equal(written, 'kept exactly\nline two')
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('the route works against a real node:http request stream', async function () {
  // `readJsonBody` reads a real `IncomingMessage`, not a PassThrough: chunking,
  // `end` ordering and the abort path are transport behaviour. One real server
  // is the only way to prove the route answers as configured.
  const { createServer } = await import('node:http')
  const workspace = await mkdtemp(path.join(tmpdir(), 'cds-paste-http-'))
  const route = createPasteRoute({}, { origin: () => origin, resolveWorkspace: async () => workspace })
  const server = createServer((request, response) => { route.handler(request, response) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = 'http://127.0.0.1:' + server.address().port
  try {
    const ok = await fetch(origin + PASTE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [PASTE_MARKER_HEADER]: PASTE_MARKER_VALUE },
      body: JSON.stringify({ sessionId: 's', name: 'real.txt', text: 'over a real socket' }),
    })
    assert.equal(ok.status, 200)
    const answer = await ok.json()
    assert.equal(answer.ok, true)
    assert.equal(await readFile(path.join(workspace, answer.relativePath), 'utf8'), 'over a real socket')

    const refused = await fetch(origin + PASTE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's', name: 'x.txt', text: 'no marker' }),
    })
    assert.equal(refused.status, 403, 'the fence answers a real cross-site-shaped request')
    assert.equal((await refused.json()).reason, 'missing-marker')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(workspace, { recursive: true, force: true })
  }
})

test('a workspace that cannot be written answers 500, never a thrown handler', async function () {
  const parent = await mkdtemp(path.join(tmpdir(), 'cds-paste-denied-'))
  try {
    // A regular FILE where the paste directory must go: mkdir fails ENOTDIR.
    const workspace = path.join(parent, 'workspace')
    await mkdir(workspace)
    await writeFile(path.join(workspace, PASTE_DIR), 'not a directory')
    const route = createPasteRoute({}, { origin: () => SAME_ORIGIN, resolveWorkspace: async () => workspace })
    const answer = await callRoute(route, {
      headers: { host: '127.0.0.1:50425', [PASTE_MARKER_HEADER]: '1' },
      body: { sessionId: 's', name: 'a.txt', text: 'x' },
    })
    assert.equal(answer.status, 500)
    assert.equal(answer.json.reason, 'write-failed')
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
