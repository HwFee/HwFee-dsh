/**
 * The card's isolation boundary, and the gate in front of the conversation.
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE. No Node test can prove a browser gives
 * a sandboxed frame an opaque origin — that is a property of the engine, and it
 * is verified from a real Chrome run recorded in
 * `.work/genui-isolation-report.md`. What a test CAN pin is the part that would
 * silently regress:
 *
 *   - the frame is created with exactly the sandbox it needs and no more;
 *   - the document it loads carries the CSP that removes the network;
 *   - every interpolation into that document is encoded, so a snippet containing
 *     `</script>` or a stylesheet containing `</style>` cannot break out;
 *   - the message gate rejects anything that is not this frame, this token and a
 *     whitelisted shape — including a message a DIFFERENT frame sends;
 *   - a validated `interact` becomes a pending request and NOT a send;
 *   - the send path exists only as a function the host's own click handler calls.
 *
 * The last one is the reason this file exists at all: the previous design called
 * `conversation.send` from inside the card's own render path, and a snippet
 * could produce a user message with no click.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const {
  createInteractGate, validateFrameMessage, encodeJsonForScript, encodeCssForStyle,
  MAX_INTERACT_CHARS, MAX_HEIGHT, FRAME_MESSAGE_TYPES,
} = await import('../client/src/frame-bridge.js')
const { buildFrameDocument, frameCsp, createNonce } = await import('../client/src/frame-html.js')

/** A stand-in for `event.source`: identity is the whole check, so any object does. */
const FRAME_WINDOW = { name: 'this-card-frame' }
const OTHER_WINDOW = { name: 'a-sibling-card-frame' }
const TOKEN = 'token-abc123'

/** A well-formed message from the frame this card owns. */
function message(data, overrides = {}) {
  return {
    source: FRAME_WINDOW,
    origin: 'null',
    data: { token: TOKEN, ...data },
    ...overrides,
  }
}

const expected = { source: FRAME_WINDOW, token: TOKEN }

test('a well-formed height message is accepted and rounded', function () {
  const verdict = validateFrameMessage(message({ type: 'height', height: 123.7 }), expected)
  assert.deepEqual(verdict, { ok: true, type: 'height', height: 124 })
})

test('a well-formed interact message carries its text through', function () {
  const verdict = validateFrameMessage(message({ type: 'interact', text: '  use fast mode ' }), expected)
  assert.deepEqual(verdict, { ok: true, type: 'interact', text: 'use fast mode' })
})

test('a message from a DIFFERENT frame is rejected', function () {
  // THE SIBLING-CARD CASE. Two cards are two frames; without the identity check
  // one card's request could be confirmed as the other's.
  const verdict = validateFrameMessage(message({ type: 'interact', text: 'x' }, { source: OTHER_WINDOW }), expected)
  assert.equal(verdict.ok, false)
  assert.equal(verdict.reason, 'source-mismatch')
})

test('a message whose origin is not the opaque one is rejected', function () {
  // A sandboxed document without `allow-same-origin` reports "null". Anything
  // else means the sender has a real origin, which our frame never has — so it
  // came from somewhere else in the page.
  for (const origin of ['http://127.0.0.1:60370', 'dsh-app://app', '', undefined]) {
    const verdict = validateFrameMessage(message({ type: 'height', height: 10 }, { origin }), expected)
    assert.equal(verdict.ok, false, `origin ${String(origin)} must be rejected`)
    assert.equal(verdict.reason, 'origin-not-opaque')
  }
})

test('a message without the right token is rejected', function () {
  const verdict = validateFrameMessage(message({ type: 'interact', text: 'x', token: 'guessed' }), expected)
  assert.equal(verdict.ok, false)
  assert.equal(verdict.reason, 'token-mismatch')
})

test('the token is required: an unset expectation rejects everything', function () {
  // The token is generated per mount and cleared on unmount. A frame that posts
  // after that must not be heard, and "no token" must fail closed rather than
  // matching an undefined field on the message.
  for (const token of ['', undefined, null, 42]) {
    const verdict = validateFrameMessage(message({ type: 'height', height: 10 }), { source: FRAME_WINDOW, token })
    assert.equal(verdict.ok, false)
    assert.equal(verdict.reason, 'no-token-configured')
  }
})

test('a message with no known source is rejected, not trusted', function () {
  for (const source of [undefined, null]) {
    const verdict = validateFrameMessage(message({ type: 'height', height: 10 }), { source, token: TOKEN })
    assert.equal(verdict.ok, false)
    assert.equal(verdict.reason, 'no-source-configured')
  }
})

test('only the three known types are accepted', function () {
  for (const type of ['send', 'open', 'navigate', 'eval', '', undefined, 42]) {
    const verdict = validateFrameMessage(message({ type, text: 'x' }), expected)
    assert.equal(verdict.ok, false, `type ${String(type)} must not be accepted`)
  }
  assert.deepEqual(FRAME_MESSAGE_TYPES.slice().sort(), ['failed', 'height', 'interact'])
})

test('an interact message is length limited and rejects control characters', function () {
  const long = 'a'.repeat(MAX_INTERACT_CHARS + 1)
  assert.equal(validateFrameMessage(message({ type: 'interact', text: long }), expected).reason, 'text-too-long')

  // Multibyte text hits the BYTE ceiling before the character ceiling, which is
  // what protects whatever renders it next.
  const cjk = '界'.repeat(Math.ceil(MAX_INTERACT_CHARS / 2))
  assert.equal(validateFrameMessage(message({ type: 'interact', text: cjk }), expected).reason, 'text-too-long')

  assert.equal(validateFrameMessage(message({ type: 'interact', text: '   ' }), expected).reason, 'text-empty')
  assert.equal(validateFrameMessage(message({ type: 'interact', text: 42 }), expected).reason, 'text-not-a-string')
  assert.equal(
    validateFrameMessage(message({ type: 'interact', text: 'ok\u0000hidden' }), expected).reason,
    'text-has-control-chars',
  )
})

test('a height outside the supported range is rejected', function () {
  for (const height of [0, -5, MAX_HEIGHT + 1, Number.NaN, Infinity, '120', undefined]) {
    const verdict = validateFrameMessage(message({ type: 'height', height }), expected)
    assert.equal(verdict.ok, false, `height ${String(height)} must be rejected`)
  }
})

test('a non-object payload is rejected', function () {
  for (const data of [null, 'height', 42, [], true]) {
    const verdict = validateFrameMessage({ source: FRAME_WINDOW, origin: 'null', data }, expected)
    assert.equal(verdict.ok, false)
  }
})

test('the gate holds ONE pending request and never sends', function () {
  // THE BEHAVIOUR THAT REPLACED AUTO-SEND. A card asks; the user confirms. The
  // gate is the place that records the ask, and it has no path to a send.
  let clock = 10_000
  const gate = createInteractGate({ now: () => clock, minIntervalMs: 1000, maxPerCard: 3 })

  assert.deepEqual(gate.request('first'), { ok: true })
  assert.deepEqual(gate.getPending(), { text: 'first', at: 10_000 })

  // A second request while one is pending is refused: the host shows ONE
  // confirmation, and silently replacing its text would change what the user is
  // about to approve.
  assert.deepEqual(gate.request('second'), { ok: false, reason: 'already-pending' })
  assert.equal(gate.getPending().text, 'first')

  // Accepting is the host's click. It returns the text and empties the queue.
  assert.equal(gate.accept(), 'first')
  assert.equal(gate.getPending(), null)
  assert.equal(gate.getAcceptedCount(), 1)

  // Immediately asking again is rate limited.
  assert.deepEqual(gate.request('third'), { ok: false, reason: 'too-soon' })

  clock += 1000
  assert.equal(gate.request('fourth').ok, true)
  assert.equal(gate.accept(), 'fourth')

  clock += 1000
  assert.equal(gate.request('fifth').ok, true)
  assert.equal(gate.accept(), 'fifth')

  // The per-card cap is the last line: a card cannot keep the user busy.
  clock += 1000
  assert.deepEqual(gate.request('sixth'), { ok: false, reason: 'cap-reached' })
})

test('clearing the gate drops a pending request without sending it', function () {
  const gate = createInteractGate({ now: () => 0, minIntervalMs: 0, maxPerCard: 5 })
  assert.equal(gate.request('nevermind').ok, true)
  gate.clear()
  assert.equal(gate.getPending(), null)
  assert.equal(gate.accept(), null)
  assert.equal(gate.getAcceptedCount(), 0, 'a cleared request was never sent')
})

test('the frame is created with allow-scripts and NOTHING else', function () {
  // THE WHOLE ISOLATION RESTS ON THIS STRING. `allow-same-origin` would give the
  // frame the app's origin and every guarantee here would evaporate; `allow-
  // forms` and `allow-popups` would each be a navigation channel out.
  const source = readFileSync(join(HERE, '..', 'client', 'src', 'card.js'), 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const match = /sandbox:\s*'([^']*)'/.exec(code)
  assert.ok(match, 'the card must declare an iframe sandbox')
  assert.equal(match[1], 'allow-scripts',
    'the sandbox must be exactly allow-scripts: allow-same-origin restores the host origin, '
    + 'allow-forms/allow-popups/allow-top-navigation are navigations out')
  assert.equal(/allow-same-origin/.test(code), false, 'allow-same-origin must not appear at all')
})

test('the old same-origin evaluator is gone from the UI path', function () {
  // FAIL-CLOSED GUARD. The previous design compiled the snippet in the host
  // realm. If that file comes back, the isolation is a preference rather than a
  // property, so its absence is asserted rather than assumed.
  assert.throws(
    () => readFileSync(join(HERE, '..', 'client', 'src', 'sandbox.js'), 'utf8'),
    /ENOENT/,
    'client/src/sandbox.js must not exist — the snippet runs in the frame only',
  )
  for (const file of ['card.js', 'lifecycle.js', 'render-ui-node.js']) {
    const source = readFileSync(join(HERE, '..', 'client', 'src', file), 'utf8')
    assert.equal(/from '\.\/sandbox\.js'/.test(source), false, `${file} must not import the old sandbox`)
  }
})

test('the frame document carries a CSP that removes the network', function () {
  const nonce = createNonce({ getRandomValues: (bytes) => { for (let i = 0; i < bytes.length; i += 1) bytes[i] = 7; return bytes } })
  const doc = buildFrameDocument({
    code: 'return h("div", null, "hi")',
    token: TOKEN,
    theme: { vars: { '--dsw-alias-label-primary': 'rgb(1, 2, 3)' }, base: {}, dark: false },
    nonce,
  })

  const csp = /content="([^"]+)"/.exec(doc)[1]
  assert.match(csp, /default-src 'none'/, 'everything is denied by default')
  assert.match(csp, /connect-src 'none'/, 'fetch/XHR/WebSocket/beacon are blocked')
  assert.match(csp, /form-action 'none'/, 'a form submit is a navigation with data in it')
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /frame-src 'none'/, 'a card cannot nest another frame')
  assert.match(csp, /base-uri 'none'/, 'no <base> rewrite of relative URLs')
  assert.match(csp, /img-src data: blob:/, 'inline charts still work; remote images do not')
  assert.match(csp, new RegExp(`script-src 'nonce-${nonce}' 'unsafe-eval'`),
    'the runtime is the only script, and it needs eval semantics for the snippet')
  // STYLE MUST BE SPLIT, not nonce-only: React applies inline style props through
  // the style ATTRIBUTE, which `style-src-elem` does not cover. A nonce-only
  // policy renders every card unstyled.
  assert.match(csp, new RegExp(`style-src-elem 'nonce-${nonce}'`), 'the stylesheet is nonce-gated')
  assert.match(csp, /style-src-attr 'unsafe-inline'/, 'style props from React need the attribute form')
})

test('the CSP is a policy, not a claim of no network', function () {
  // The generous reading ("blocked, therefore no network") is what a later
  // reader would rely on and be wrong about. The honest statement is about the
  // web APIs, and it is asserted so the comment cannot drift into a promise.
  const source = readFileSync(join(HERE, '..', 'client', 'src', 'frame-html.js'), 'utf8')
  assert.match(source, /WHAT IT CANNOT PROMISE/,
    'the module must state the limit of a CSP rather than promise total isolation')
})

test('a snippet containing </script> cannot escape the payload element', function () {
  // THE BREAKOUT THIS ENCODES AGAINST. `JSON.stringify` leaves `<` alone, so a
  // snippet ending its own script tag would have its tail parsed as markup.
  const hostile = 'return h("div", null, "</script><img src=x onerror=alert(1)>")'
  const doc = buildFrameDocument({ code: hostile, token: TOKEN, theme: {}, nonce: 'n0nce' })
  const payload = /<script type="application\/json" id="dsh-genui-payload">([\s\S]*?)<\/script>/.exec(doc)
  assert.ok(payload, 'the payload element must be present and closed exactly once')
  assert.equal(/<\/script/i.test(payload[1]), false, 'the payload must not contain a closing script tag')
  assert.equal(/<img/i.test(payload[1]), false, 'the hostile markup must stay inside the JSON string')
  // And it still parses back to exactly the code that went in.
  assert.equal(JSON.parse(payload[1]).code, hostile)
})

test('a stylesheet containing </style> cannot escape the style element', function () {
  const css = 'body { color: red } </style><script>alert(1)</script>'
  const encoded = encodeCssForStyle(css)
  assert.equal(/<\/style/i.test(encoded), false)
  assert.match(encoded, /<\\\/style/, 'the slash is escaped, which CSS reads as the same character')
})

test('the JSON encoder escapes every html-significant character', function () {
  const payload = encodeJsonForScript({ a: '<>&', b: '\u2028\u2029' })
  assert.equal(/[<>&]/.test(payload), false, 'raw < > & must not survive into an HTML context')
  assert.deepEqual(JSON.parse(payload), { a: '<>&', b: '\u2028\u2029' }, 'and the value must round-trip')
})

test('the frame document inlines the runtime and nothing external', function () {
  const doc = buildFrameDocument({ code: 'return null', token: TOKEN, theme: {}, nonce: 'n0nce' })
  assert.match(doc, /<script nonce="n0nce">/, 'the runtime is an inline script under the nonce')
  // No remote anything: the frame must be self-contained, because a fetch here
  // would be both a dependency and an exfiltration path.
  assert.equal(/src\s*=\s*["']https?:/i.test(doc), false, 'no remote script, style, image or frame')
  assert.equal(/@import/i.test(doc), false, 'no imported stylesheet')
  assert.equal(/url\(\s*['"]?https?:/i.test(doc), false, 'no remote css url()')
})

test('a card message cannot reach conversation.send by itself', function () {
  // THE INVARIANT, ASSERTED FROM THE SOURCE. `sendMessage` is called from one
  // place: the host's confirmation click handler. If a future edit called it
  // from the message listener, this test fails — which is the only way to keep
  // the gate a property of the code rather than of a reviewer's memory.
  const source = readFileSync(join(HERE, '..', 'client', 'src', 'card.js'), 'utf8')
  const calls = [...source.matchAll(/sendMessage\(/g)]
  assert.equal(calls.length, 1, 'exactly one call site may exist')

  const listener = source.indexOf('const onMessage =')
  const accept = source.indexOf('const accept =')
  const call = source.indexOf('await sendMessage(text)')
  assert.ok(listener !== -1 && accept !== -1 && call !== -1)
  assert.ok(call > accept, 'the send must live inside the accept handler, after the message listener')
  assert.ok(listener < accept, 'and the listener must come first, so the ordering is visible')

  // The interact branch of the listener may only record a request.
  const interactBranch = source.slice(source.indexOf("verdict.type === 'height'"), accept)
  assert.match(interactBranch, /gate\.request\(/, 'a card request goes to the gate')
  assert.equal(/sendMessage/.test(interactBranch), false, 'and never straight to the bridge')
})

test('the confirm controls are real buttons in the host document', function () {
  // `div` with an onClick would be clickable by script and unreachable by
  // keyboard; a `<button>` is focusable, so Enter and Space work, and a click on
  // it carries a user activation the frame cannot manufacture.
  const source = readFileSync(join(HERE, '..', 'client', 'src', 'card.js'), 'utf8')
  const confirm = /className: 'dsh-genui-confirm',\s*\n\s*onClick: accept/.exec(source)
  assert.ok(confirm, 'the confirm control must be the button whose onClick is accept')
  assert.match(source, /'button',\s*\{\s*\n\s*type: 'button',\s*\n\s*className: 'dsh-genui-confirm'/)
  assert.match(source, /'button',\s*\{\s*\n\s*type: 'button',\s*\n\s*className: 'dsh-genui-dismiss'/)
  // The pending text is a text child, never markup.
  assert.equal(/dangerouslySetInnerHTML/.test(source), false,
    'the one place frame text reaches the host document must not be an html sink')
})
