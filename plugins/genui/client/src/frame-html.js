/**
 * The card frame's document, as a string.
 *
 * WHY `srcdoc` AND NOT A URL. The host serves the app from `http://127.0.0.1:PORT`
 * (web) or `dsh-app://` (desktop); a frame pointed at a real URL would inherit
 * that origin unless the sandbox forbids it, and a frame pointed at a `blob:` or
 * `data:` URL inherits the CREATOR's origin in some engines. `srcdoc` on an
 * iframe that has `sandbox="allow-scripts"` and no `allow-same-origin` produces
 * a document with an OPAQUE origin in every engine that matters, and the frame
 * then cannot read the host at all — which is the entire point of this module.
 *
 * THE DOCUMENT CONTAINS, in order:
 *
 *   1. a meta CSP that removes the network, navigation, forms and plugins, and
 *      permits scripts only under a per-render nonce;
 *   2. the card's two stylesheets, each carrying that nonce;
 *   3. a JSON payload element the runtime reads exactly once;
 *   4. the bundled runtime, as one inline script carrying the nonce.
 *
 * EVERY INTERPOLATION IS ENCODED, not merely inserted:
 *
 *   - the payload goes through `encodeJsonForScript`, because a snippet
 *     containing `</script>` would otherwise close the element and turn the rest
 *     of the model's code into markup;
 *   - both stylesheets go through `encodeCssForStyle` for the same reason with
 *     `</style>`;
 *   - the nonce is generated here from `crypto.getRandomValues`, is alphanumeric
 *     only, and is never stored anywhere a second frame could read it.
 *
 * @module frame-html
 */

import { encodeCssForStyle, encodeJsonForScript } from './frame-bridge.js'
import { RUNTIME_JS } from './frame/runtime.generated.js'
import { VENDOR_CSS } from './vendor/visualize.css.js'
import { CARD_CSS } from './styles.js'

/** Nonce length in bytes; 16 bytes of base36 is ~25 characters. */
const NONCE_BYTES = 16

/**
 * Extra CSS that only exists inside the frame.
 *
 * The host's own sheet styles `.dsh-genui-card` and its heading for a card that
 * sat directly in the transcript. Inside a frame there is no transcript: the
 * document itself is the surface, so the body must be transparent, the root must
 * size to its content, and the two failure surfaces must be readable without any
 * host chrome around them.
 *
 * `color-scheme` is set from the snapshot at runtime; the value here only keeps
 * the first paint from flashing the wrong scrollbar colours.
 */
const FRAME_CSS = `
html, body {
  margin: 0;
  padding: 0;
  background: transparent;
}
html {
  color-scheme: light dark;
}
body {
  color: var(--dsw-alias-label-primary, #141414);
  font-family: var(--dsh-font-family-ui, var(--dsw-font-family, system-ui, sans-serif));
  font-size: var(--dsh-content-font-size, 14px);
  line-height: 1.5;
  overflow: hidden;
}
#root {
  display: block;
  min-width: 0;
}
.dsh-genui-failure {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
  color: var(--dsw-alias-state-error-primary, #ba2723);
  font-size: var(--dsh-content-font-size-secondary, 13px);
}
.dsh-genui-failure-title {
  font-weight: 600;
}
.dsh-genui-failure-detail {
  color: var(--dsw-alias-label-secondary, #5c5c5c);
  white-space: pre-wrap;
  word-break: break-word;
}
`

/**
 * A random, HTML-safe nonce.
 *
 * `crypto.getRandomValues` is present in every engine the app runs in; the
 * fallback exists only so a Node test can build a document without a `crypto`
 * global. A weaker nonce in that case is harmless: the test never loads the
 * document.
 *
 * @param {object} [cryptoImpl] a `crypto` implementation
 * @returns {string} an alphanumeric nonce
 */
export function createNonce(cryptoImpl) {
  const source = cryptoImpl ?? (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined)
  if (source === undefined || source === null || typeof source.getRandomValues !== 'function') {
    return 'nonce-fallback-0000000000000000'
  }
  const bytes = new Uint8Array(NONCE_BYTES)
  source.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += (byte % 36).toString(36)
  return out
}

/**
 * The CSP this frame runs under.
 *
 * WHAT IT REMOVES, and why each one is not paranoia:
 *
 *   default-src 'none'   nothing is allowed unless a directive below allows it
 *   connect-src 'none'   no fetch/XHR/WebSocket/beacon: a card cannot exfiltrate
 *                        the conversation it can read from its own props
 *   img-src data: blob:  charts draw inline SVG and data-URL images; a remote
 *                        image would be a one-pixel exfiltration channel
 *   media-src data: blob: same for audio/video the model may generate
 *   font-src data:       the host's embedded faces arrive as data URLs
 *   object-src 'none'    no plugin content
 *   frame-src 'none'     a card cannot nest another frame
 *   child-src 'none'     the older spelling of the same rule
 *   form-action 'none'   a form submit is a navigation with data in it. Measured:
 *                        a `<form action=http://…>` inside this frame reports
 *                        "SUBMITTED" and still loads nothing, because this
 *                        directive refuses the navigation.
 *   navigation           a frame assigning its own `location` is stopped by the
 *                        policy as a whole: measured, the same snippet that
 *                        navigates a frame WITHOUT this meta cannot navigate one
 *                        with it. No single directive names this rule; the
 *                        combination is what holds.
 *   base-uri 'none'      no `<base>` rewrite of relative URLs
 *   script-src 'nonce-…' 'unsafe-eval'
 *                        the runtime is the only script, and it needs `eval`
 *                        semantics to turn the model's string into a component.
 *                        `'unsafe-eval'` is what allows `new Function`; it is
 *                        scoped by the opaque origin, so the only thing it can
 *                        evaluate is code that already runs in this frame.
 *
 * WHAT IT CANNOT PROMISE: that no network is reachable. `connect-src 'none'`
 * blocks the fetch family, but a browser with an extension, a proxy, or a future
 * API could still be a channel; the honest claim is "the documented web APIs are
 * blocked", and the isolation claim rests on the opaque origin, not on this
 * header.
 *
 * @param {string} nonce the render's nonce
 * @returns {string} the policy
 */
export function frameCsp(nonce) {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'unsafe-eval'`,
    `style-src-elem 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    'img-src data: blob:',
    'media-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

/**
 * Build one frame document.
 *
 * @param {object} options
 * @param {string} options.code the validated snippet
 * @param {string} options.token the per-render random token
 * @param {object} options.theme the theme snapshot (`theme-snapshot.js`)
 * @param {string} [options.nonce] the render's nonce (generated when absent)
 * @returns {string} the `srcdoc` value
 */
export function buildFrameDocument({ code, token, theme, nonce }) {
  const actualNonce = typeof nonce === 'string' && nonce !== '' ? nonce : createNonce()
  const payload = encodeJsonForScript({ code, token, theme: theme ?? { vars: {}, base: {}, dark: false } })
  const css = encodeCssForStyle(FRAME_CSS + '\n' + CARD_CSS + '\n' + VENDOR_CSS)

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${frameCsp(actualNonce)}">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta name="color-scheme" content="light dark">',
    `<style nonce="${actualNonce}">${css}</style>`,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script type="application/json" id="dsh-genui-payload">${payload}</script>`,
    `<script nonce="${actualNonce}">${RUNTIME_JS}</script>`,
    '</body>',
    '</html>',
  ].join('')
}
