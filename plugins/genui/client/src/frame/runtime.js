/**
 * The code that runs INSIDE the card's sandboxed iframe.
 *
 * THIS FILE IS THE SECURITY BOUNDARY, and the boundary is the FRAME, not the
 * code below it. The iframe is created with `sandbox="allow-scripts"` and no
 * `allow-same-origin`, so its document has an OPAQUE ORIGIN: `parent.document`,
 * `localStorage`, cookies and the host's `fetch` credentials are not merely
 * masked — they are unreadable, because a cross-origin window refuses every
 * property access. The meta CSP in the frame document (`frame-html.js`) then
 * removes the network and the ability to navigate. Nothing here relies on
 * hiding a name from the model's snippet; if it did, `h.constructor` would walk
 * straight past it (see the report at `.work/genui-isolation-report.md` for the
 * PoCs that proved the previous lexical guard was bypassable).
 *
 * WHAT THIS FILE IS RESPONSIBLE FOR:
 *
 *   1. compiling one snippet inside THIS realm (a string must become a function
 *      — that is the plugin's feature, and it now happens where the function can
 *      do nothing but draw);
 *   2. rendering it with a React that this frame owns (bundled at build time, no
 *      CDN, no host module table);
 *   3. telling the parent how tall it needs to be;
 *   4. forwarding `interact(text)` as a REQUEST, never as a send: the parent
 *      shows a button and only a real click there reaches the conversation;
 *   5. keeping the card legible (the alpha repair pass) and its timers owned.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: read the host page, persist anything, or
 * decide that a message should be sent.
 *
 * @module frame/runtime
 */

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { observeInvisibleText } from '../legibility.js'

/** Payload element id. The parent writes this JSON; the frame reads it once. */
const PAYLOAD_ID = 'dsh-genui-payload'

/**
 * The largest message a card may ask to send.
 *
 * A suggestion from a card is a user sentence, not a document. Capping it here
 * as well as on the parent side means a runaway snippet cannot even assemble an
 * oversized postMessage; the parent repeats the check because a frame is not a
 * party this code trusts.
 */
const MAX_INTERACT_BYTES = 2000

/** The largest height the frame will report, in CSS pixels. */
const MAX_HEIGHT = 20000

/** Minimum gap between two height reports, in milliseconds (one frame). */
const HEIGHT_THROTTLE_MS = 16

/** Read the JSON payload the parent embedded in this document. */
function readPayload() {
  const element = document.getElementById(PAYLOAD_ID)
  if (element === null || typeof element.textContent !== 'string') {
    throw new Error('this card has no payload')
  }
  const parsed = JSON.parse(element.textContent)
  if (parsed === null || typeof parsed !== 'object') throw new Error('this card payload is not an object')
  return parsed
}

/** Post one message to the parent. `*` is required: this frame's origin is opaque. */
function post(message) {
  // eslint-disable-next-line no-restricted-globals -- the parent IS the only peer
  window.parent.postMessage(message, '*')
}

/**
 * Timers owned by one card, cleared when the card unmounts.
 *
 * Same contract as the previous host-side pair: a card may animate, and nothing
 * it starts can outlive it. A callback that throws is reported inside the frame
 * so the card's own error surface stays the thing the user reads.
 *
 * @returns {{ api: object, clear: () => void }} the snippet-facing pair and its disposer
 */
function createScopedTimers() {
  const pending = new Set()
  const wrap = (callback) => {
    if (typeof callback !== 'function') throw new Error('timers.set/every needs a function')
    return function scopedTimerCallback() {
      try {
        callback()
      } catch (error) {
        console.error('[dsh-genui] a card timer threw:', error)
      }
    }
  }
  return {
    api: {
      set(callback, ms) {
        const id = setTimeout(() => { pending.delete(id); wrap(callback)() }, ms)
        pending.add(id)
        return id
      },
      every(callback, ms) {
        const id = setInterval(wrap(callback), ms)
        pending.add(id)
        return id
      },
      clear(id) {
        if (pending.delete(id)) { clearTimeout(id); clearInterval(id) }
      },
    },
    clear() {
      for (const id of pending) { clearTimeout(id); clearInterval(id) }
      pending.clear()
    },
  }
}

/**
 * Compile the snippet into a component.
 *
 * `'use strict'` keeps an accidental `leaked = 1` from attaching to this frame's
 * global object. The parameter list is the whole API a card gets: React, `h`,
 * `interact`, `timers`. There is no mask list to bypass because there is nothing
 * left to protect: the frame cannot reach the host at all.
 *
 * @param {string} code the validated snippet
 * @param {object} deps
 * @param {(text: string) => void} deps.interact the parent-facing request bridge
 * @param {object} deps.timers the scoped timer pair
 * @returns {Function} a React function component
 */
function compile(code, { interact, timers }) {
  let body
  try {
    // eslint-disable-next-line no-new-func -- the plugin's feature is "the model writes React"
    body = new Function('React', 'h', 'interact', 'timers', `'use strict';\n${code}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `the snippet did not parse: ${detail}. `
      + 'JSX is not available — use h(tag, props, ...children) or React.createElement.',
    )
  }

  function Card() {
    const result = body(React, React.createElement, interact, timers.api)
    if (typeof result === 'function') {
      try {
        if (/^[A-Z]/.test(result.name ?? '') || result.prototype?.isReactComponent !== undefined) {
          return React.createElement(result)
        }
      } catch (error) {
        return result
      }
    }
    return result
  }
  return Card
}

/** Catches a snippet that throws at render so the card shows a sentence, not a blank box. */
class CardBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error !== null) {
      const detail = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
      return React.createElement('div', { className: 'dsh-genui-failure', role: 'alert' },
        React.createElement('div', { className: 'dsh-genui-failure-title' }, 'This card failed to render'),
        React.createElement('div', { className: 'dsh-genui-failure-detail' }, detail))
    }
    return this.props.children
  }
}

/**
 * Apply a theme snapshot to this document.
 *
 * The host measures its own computed custom properties and sends the map. The
 * frame cannot inherit them across the origin boundary, so they are written here
 * as inline custom properties on `:root` — the same channel the host's presenter
 * uses on its `<body>`.
 *
 * `data-ds-dark-theme` is mirrored because the ported vendor sheet and any
 * `light-dark()` remnant key off the app's theme attribute, not the OS.
 *
 * @param {{ vars?: object, dark?: boolean, base?: object }} snapshot the theme
 */
function applyTheme(snapshot) {
  const root = document.documentElement
  const vars = snapshot?.vars ?? {}
  for (const [name, value] of Object.entries(vars)) {
    // Only custom properties from the host's own `--dsw-*` / `--dsh-*` surface.
    if (typeof name !== 'string' || !/^--(dsw|dsh)-[a-z0-9-]+$/.test(name)) continue
    if (typeof value !== 'string' || value.length > 200) continue
    root.style.setProperty(name, value)
  }
  const base = snapshot?.base ?? {}
  const body = document.body
  for (const [prop, value] of Object.entries(base)) {
    if (typeof value !== 'string' || value.length > 200) continue
    if (prop !== 'font-family' && prop !== 'font-size' && prop !== 'line-height' && prop !== 'letter-spacing') continue
    body.style.setProperty(prop, value)
  }
  if (snapshot?.dark === true) root.setAttribute('data-ds-dark-theme', '')
  else root.removeAttribute('data-ds-dark-theme')
  root.style.colorScheme = snapshot?.dark === true ? 'dark' : 'light'
}

/**
 * The frame's entry point.
 *
 * Everything above is pure; this is the only part that touches the document, and
 * it is called once per frame because every card gets its own document.
 */
function start() {
  const payload = readPayload()
  const token = typeof payload.token === 'string' ? payload.token : ''
  applyTheme(payload.theme)

  let lastHeight = 0
  let heightTimer = 0
  const reportHeight = () => {
    heightTimer = 0
    const height = Math.max(
      1,
      Math.min(MAX_HEIGHT, Math.ceil(document.documentElement.getBoundingClientRect().height)),
    )
    if (height === lastHeight) return
    lastHeight = height
    post({ type: 'height', token, height })
  }
  const scheduleHeight = () => {
    if (heightTimer !== 0) return
    heightTimer = setTimeout(reportHeight, HEIGHT_THROTTLE_MS)
  }

  const timers = createScopedTimers()
  const interact = (text) => {
    if (typeof text !== 'string') throw new Error('interact() needs a string')
    const message = text.trim()
    if (message === '') throw new Error('interact() needs a non-empty message')
    if (new TextEncoder().encode(message).length > MAX_INTERACT_BYTES) {
      throw new Error('interact() message is too long — send the choice, not the transcript')
    }
    post({ type: 'interact', token, text: message })
  }

  const container = document.getElementById('root')
  const root = createRoot(container)
  const Card = compile(String(payload.code ?? ''), { interact, timers })

  root.render(React.createElement(CardBoundary, null, React.createElement(Card)))

  // The legibility pass and the height report both run after the commit, so the
  // browser has resolved the tokens the snippet used. `#root` is the card's own
  // subtree — the only thing this frame may measure.
  const body = document.getElementById('root')
  const disposeLegibility = observeInvisibleText(body)
  const observer = new ResizeObserver(scheduleHeight)
  observer.observe(document.documentElement)
  observer.observe(body)
  scheduleHeight()

  // The parent may re-send the theme (light/dark switch, theme plugin reload).
  window.addEventListener('message', (event) => {
    // `event.source` is the only identity an opaque document can check; the
    // token is the second factor, because the host is the sole holder.
    if (event.source !== window.parent) return
    const data = event.data
    if (data === null || typeof data !== 'object' || data.token !== token) return
    if (data.type === 'theme') applyTheme(data.theme)
  })

  window.addEventListener('error', () => { scheduleHeight() })

  return function dispose() {
    observer.disconnect()
    disposeLegibility()
    timers.clear()
    root.unmount()
  }
}

// A frame that fails to start is a blank rectangle, which reads as "the card is
// empty". Report instead, in text the host renders as-is.
try {
  start()
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  const container = document.getElementById('root')
  if (container !== null) {
    container.textContent = ''
    const box = document.createElement('div')
    box.className = 'dsh-genui-failure'
    box.setAttribute('role', 'alert')
    box.textContent = detail
    container.append(box)
  }
  try { post({ type: 'failed', token: '', detail }) } catch (ignored) {}
}
