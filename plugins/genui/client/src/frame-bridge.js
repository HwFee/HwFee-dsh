/**
 * The message protocol between the card's frame and the host.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE. Everything a frame sends arrives on the
 * host's `message` event, which is a public channel: ANY window in the page can
 * post to it, including a second card's frame, a host dialog, and (before the
 * isolation landed) the snippet itself. So every field is checked here, in code
 * a Node test can drive without a browser, and the host's handler does nothing
 * but call this and act on the result.
 *
 * THE THREE IDENTITIES A MESSAGE MUST PROVE:
 *
 *   1. `event.source` IS the frame we created. Not "looks like a frame": the
 *      window object we hold. A sibling card's frame fails this.
 *   2. `event.origin` is the opaque-origin serialization. A sandboxed document
 *      without `allow-same-origin` reports `"null"`; anything else means the
 *      message came from a document with a real origin, which our frame never
 *      has.
 *   3. `event.data.token` equals the random token we put into that frame's own
 *      document. It never touches a global, so no other frame can read it.
 *
 * Everything after that is shape: a whitelisted `type`, and per-type limits. A
 * frame cannot ask for anything this table does not describe.
 *
 * @module frame-bridge
 */

/** Longest text a card may ask the user to send. A choice, not a transcript. */
export const MAX_INTERACT_CHARS = 2000

/** Longest text a card may ask the user to send, in UTF-8 bytes. */
export const MAX_INTERACT_BYTES = 2000

/** Range the frame may report as its content height, in CSS pixels. */
export const MIN_HEIGHT = 1
export const MAX_HEIGHT = 20000

/** The only message types a frame may send. */
export const FRAME_MESSAGE_TYPES = ['height', 'interact', 'failed']

/** The only message types the host may send into a frame. */
export const HOST_MESSAGE_TYPES = ['theme']

/** The opaque-origin serialization every sandboxed document reports. */
const OPAQUE_ORIGIN = 'null'

/** UTF-8 byte length, mirroring `lib/spec.js:utf8Length` without a Buffer. */
export function utf8Bytes(text) {
  let bytes = 0
  const value = typeof text === 'string' ? text : ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index += 1 } else bytes += 3
    } else bytes += 3
  }
  return bytes
}

/**
 * Validate one inbound message from a card frame.
 *
 * Returns a discriminated result rather than throwing: a rejected message is
 * ordinary (a sibling frame, a stale frame after unmount) and must never surface
 * as an error in the conversation. The `reason` exists for tests and for a debug
 * counter, not for the user.
 *
 * @param {unknown} event the `message` event
 * @param {object} expected
 * @param {Window | null | undefined} expected.source the frame's contentWindow
 * @param {string} expected.token the per-card random token
 * @returns {{ ok: true, type: string, height?: number, text?: string, detail?: string } | { ok: false, reason: string }}
 */
export function validateFrameMessage(event, expected) {
  const source = expected?.source
  const token = expected?.token
  if (event === null || typeof event !== 'object') return { ok: false, reason: 'not-an-event' }
  if (typeof token !== 'string' || token === '') return { ok: false, reason: 'no-token-configured' }
  if (source === null || source === undefined) return { ok: false, reason: 'no-source-configured' }
  if (event.source !== source) return { ok: false, reason: 'source-mismatch' }
  if (event.origin !== OPAQUE_ORIGIN) return { ok: false, reason: 'origin-not-opaque' }

  const data = event.data
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'not-an-object' }
  if (typeof data.type !== 'string' || !FRAME_MESSAGE_TYPES.includes(data.type)) {
    return { ok: false, reason: 'unknown-type' }
  }
  if (data.token !== token) return { ok: false, reason: 'token-mismatch' }

  if (data.type === 'height') {
    const height = data.height
    if (typeof height !== 'number' || !Number.isFinite(height)) return { ok: false, reason: 'height-not-a-number' }
    if (height < MIN_HEIGHT || height > MAX_HEIGHT) return { ok: false, reason: 'height-out-of-range' }
    return { ok: true, type: 'height', height: Math.round(height) }
  }

  if (data.type === 'interact') {
    const text = data.text
    if (typeof text !== 'string') return { ok: false, reason: 'text-not-a-string' }
    const trimmed = text.trim()
    if (trimmed === '') return { ok: false, reason: 'text-empty' }
    if (trimmed.length > MAX_INTERACT_CHARS) return { ok: false, reason: 'text-too-long' }
    if (utf8Bytes(trimmed) > MAX_INTERACT_BYTES) return { ok: false, reason: 'text-too-long' }
    // A NUL or a lone control character is not something a person types; it is
    // how a payload smuggles structure into whatever renders it next.
    // eslint-disable-next-line no-control-regex -- rejecting them is the point
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trimmed)) return { ok: false, reason: 'text-has-control-chars' }
    return { ok: true, type: 'interact', text: trimmed }
  }

  const detail = data.detail
  if (typeof detail !== 'string') return { ok: true, type: 'failed', detail: '' }
  return { ok: true, type: 'failed', detail: detail.slice(0, 500) }
}

/**
 * The gate between "a card asked to send" and "a message reaches the conversation".
 *
 * TWO RULES, and both exist because of measured behaviour rather than caution:
 *
 *   - a card may have only ONE request pending at a time, because the host shows
 *     one confirmation button and a second pending request would silently replace
 *     the text the user is looking at;
 *   - requests are rate limited and capped per card, because a snippet can call
 *     `interact` from a timer: a card that asked every 20 ms produced four real
 *     user messages in 120 ms before this gate existed.
 *
 * The gate NEVER sends. It records a pending request; the caller sends only from
 * a real click on its own button.
 *
 * @param {object} [options]
 * @param {() => number} [options.now] clock, injectable for tests
 * @param {number} [options.minIntervalMs] minimum gap between two acceptances
 * @param {number} [options.maxPerCard] lifetime cap per card
 * @returns {object} the gate
 */
export function createInteractGate({ now = () => Date.now(), minIntervalMs = 1000, maxPerCard = 20 } = {}) {
  let pending = null
  let accepted = 0
  let lastAcceptedAt = Number.NEGATIVE_INFINITY

  return {
    /**
     * @param {string} text a validated request
     * @returns {{ ok: true } | { ok: false, reason: string }} whether it became pending
     */
    request(text) {
      if (pending !== null) return { ok: false, reason: 'already-pending' }
      if (accepted >= maxPerCard) return { ok: false, reason: 'cap-reached' }
      const at = now()
      if (at - lastAcceptedAt < minIntervalMs) return { ok: false, reason: 'too-soon' }
      pending = { text, at }
      return { ok: true }
    },

    /** The text waiting for the user's click, or null. */
    getPending() {
      return pending
    },

    /** Called when the user's own button was clicked. Returns the text to send, or null. */
    accept() {
      if (pending === null) return null
      const text = pending.text
      pending = null
      accepted += 1
      lastAcceptedAt = now()
      return text
    },

    /** Called when the user dismissed the request, or the card went away. */
    clear() {
      pending = null
    },

    /** How many messages this card has actually sent (for tests and diagnostics). */
    getAcceptedCount() {
      return accepted
    },
  }
}

/**
 * Encode a value as JSON that is safe inside a `<script type="application/json">`.
 *
 * THE ESCAPES ARE THE POINT. `JSON.stringify` leaves `<` alone, so a snippet
 * containing the literal `</script>` would close the payload element and turn
 * the rest of the model's code into markup. Escaping `<`, `>` and `&` as JSON
 * unicode escapes keeps the value byte-identical after `JSON.parse` while making
 * that impossible. The two line separators are escaped because an engine may
 * treat them as line terminators.
 *
 * @param {unknown} value the payload
 * @returns {string} JSON safe to embed in an HTML `<script>` element
 */
export function encodeJsonForScript(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Make CSS text safe inside a `<style>` element.
 *
 * `</style` anywhere in the sheet would end the element, and the remainder of
 * the sheet would be parsed as HTML — the classic stylesheet breakout. A
 * backslash before `/` is a valid CSS escape for `/`, so the text keeps its
 * meaning while the HTML parser no longer sees a closing tag.
 *
 * @param {string} css the stylesheet
 * @returns {string} the same sheet, unable to close its element
 */
export function encodeCssForStyle(css) {
  return String(css ?? '').replace(/<\/(style|script)/gi, '<\\/$1')
}
