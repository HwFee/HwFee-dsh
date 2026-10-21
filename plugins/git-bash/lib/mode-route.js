/**
 * The mode bridge: the page → host half of the `默认 shell` setting.
 *
 * WHY A ROUTE AND NOT AN EVENT. The settings row lives in the browser process;
 * `run_shell` lives in the host process. `ctx.emit('git-bash/mode', …)` reaches
 * browser listeners only, so the host kept its boot default (`auto`) FOREVER —
 * choosing "Windows PowerShell" repainted the row and changed nothing the model
 * ran. That was invisible because the row is client-rendered: it named the mode
 * the user picked while every command still went to Git Bash.
 *
 * A same-origin POST to the host's own web server is the smallest bridge that
 * crosses the process boundary without adding the Typert RPC dependency to this
 * package. The fence is the same one `dsh-system-fonts`' catalogue route uses:
 * the custom header is impossible for an `<img>`/`<form>`/navigation to send,
 * a cross-origin fetch that set it would preflight and be refused, and the Host
 * / Origin / Sec-Fetch-Site checks stop DNS rebinding and cross-site forms.
 *
 * @module @hwfee/dsh-git-bash/mode-route
 */

import { MODES } from './mode.js'

/** Route the page posts the selected mode to. */
export const MODE_PATH = '/dsh-git-bash/mode'

/** The marker every legitimate request carries (see the header comment). */
export const MODE_MARKER_HEADER = 'x-dsh-git-bash'
export const MODE_MARKER_VALUE = '1'

/** Largest body accepted. A mode is a three-letter word; 1 KiB is generous. */
export const MAX_BODY_BYTES = 1024

function headerOf(request, name) {
  const headers = request && request.headers
  if (!headers || typeof headers !== 'object') return undefined
  const value = headers[name]
  if (Array.isArray(value)) return value.length === 1 ? String(value[0]) : undefined
  return typeof value === 'string' ? value : undefined
}

function authorityOf(text, scheme) {
  if (typeof text !== 'string' || text === '') return null
  const absolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)
  try {
    const url = new URL(absolute ? text : (scheme || 'http:') + '//' + text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.host.toLowerCase()
  } catch {
    return null
  }
}

function hostnameOf(authority) {
  const at = authority.lastIndexOf(':')
  return at === -1 ? authority : authority.slice(0, at)
}

function portOf(authority) {
  const at = authority.lastIndexOf(':')
  return at === -1 ? '' : authority.slice(at + 1)
}

function isLoopbackAuthority(authority) {
  const host = hostnameOf(authority)
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/**
 * Decide whether a request may change the mode.
 *
 * Fails CLOSED on every branch, and checks only headers — the body is never
 * read for a refused request.
 *
 * @param {object} request node:http request (only `headers` is read)
 * @param {string | null} origin the listener's own `http://host:port`
 * @returns {string | null} null when the request is ours, else a reason
 */
export function refuseRequest(request, origin) {
  const host = headerOf(request, 'host')
  if (host === undefined) return 'no-host'
  const authority = authorityOf(host, 'http:')
  if (authority === null) return 'bad-host'

  const own = origin === null || origin === undefined ? null : authorityOf(String(origin), 'http:')
  if (own === null) {
    if (!isLoopbackAuthority(authority)) return 'foreign-host'
  } else if (authority !== own) {
    const sameLoopbackPeer = isLoopbackAuthority(authority)
      && isLoopbackAuthority(own)
      && portOf(authority) === portOf(own)
    if (!sameLoopbackPeer) return 'foreign-host'
  }

  const site = headerOf(request, 'sec-fetch-site')
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return 'cross-site'

  const requestOrigin = headerOf(request, 'origin')
  if (requestOrigin !== undefined && authorityOf(requestOrigin, 'http:') !== authority) return 'foreign-origin'

  if (headerOf(request, MODE_MARKER_HEADER) !== MODE_MARKER_VALUE) return 'missing-marker'

  return null
}

function sendJson(response, status, body) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(text)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body-too-large'))
        request.destroy?.()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

/**
 * The mode route.
 *
 * `POST { mode }` sets; `GET` reports the host's current value. The read half
 * exists because the host's mode was otherwise INVISIBLE from the page: the
 * row could show one value while the host ran another, and no diagnostic could
 * tell them apart. It is fenced exactly like the write.
 *
 * @param {(mode: string) => void} onMode called with a VALIDATED mode
 * @param {object} [options]
 * @param {() => string | null} [options.origin] the listener's own origin
 * @param {() => string} [options.readMode] the host's current mode
 * @returns {{ kind: 'exact', path: string, handler: Function }} the route
 */
export function createModeRoute(onMode, options = {}) {
  const originOf = typeof options.origin === 'function' ? options.origin : () => null
  const read = typeof options.readMode === 'function' ? options.readMode : () => 'auto'
  const origin = () => {
    try {
      const value = originOf()
      return typeof value === 'string' && value !== '' ? value : null
    } catch {
      return null
    }
  }

  return {
    kind: 'exact',
    path: MODE_PATH,
    handler: async (request, response) => {
      if (request.method !== 'POST' && request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET, POST' })
        response.end()
        return
      }
      const refused = refuseRequest(request, origin())
      if (refused !== null) {
        sendJson(response, 403, { error: 'refused', reason: refused })
        return
      }
      if (request.method === 'GET') {
        sendJson(response, 200, { ok: true, mode: read() })
        return
      }
      let body
      try {
        body = await readBody(request)
      } catch (error) {
        sendJson(response, 413, { error: String(error?.message ?? 'body') })
        return
      }
      let parsed
      try {
        parsed = JSON.parse(body)
      } catch {
        sendJson(response, 400, { error: 'invalid-json' })
        return
      }
      if (parsed === null || typeof parsed !== 'object' || typeof parsed.mode !== 'string') {
        sendJson(response, 400, { error: 'invalid-mode' })
        return
      }
      if (!MODES.includes(parsed.mode)) {
        sendJson(response, 400, { error: 'unknown-mode', mode: parsed.mode })
        return
      }
      onMode(parsed.mode)
      sendJson(response, 200, { ok: true, mode: parsed.mode })
    },
  }
}