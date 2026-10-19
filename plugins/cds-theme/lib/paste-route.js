/**
 * Host route: turn a pasted long text into a real file under the session
 * workspace, and answer with the `@relative` mention the composer should carry.
 *
 * WHY A ROUTE. The renderer cannot write files (`ctx.fs` is a Host service; the
 * desktop shell exposes no filesystem bridge to the page). A same-origin POST is
 * the smallest Host seam that also works in both supported surfaces: the plain
 * Web GUI document (`http://127.0.0.1:<port>`, same origin) and the Desktop
 * shell (`dsh-app://app`, whose protocol handler forwards every non-asset path
 * to the Host's own listener, see `lib/main.js` `forwardWebRequest`).
 *
 * THE FENCE. This route writes to disk, so it is reachable only by our own
 * client: the listener's own authority is the reference, `sec-fetch-site` and
 * `origin` must be absent or same-origin when present (the Desktop forwarder
 * strips both, which is why they are optional rather than required), and a
 * custom non-safelisted header must be present — no `<img>`, `<script>`,
 * `<form>`, navigation, or cross-origin `fetch` can set one without a CORS
 * preflight this server never answers. The same fence ships in
 * `plugins/system-fonts/lib/font-route.js` and `plugins/usage-stats`.
 *
 * THE WORKSPACE. The Client sends only a Session id; the Host resolves the
 * absolute workspace itself (`sessions` for a live Session,
 * `sessionController.inspect` for a persisted one) and writes under
 * `<cwd>/.dsh-paste/`. A browser-supplied path never reaches `fs`.
 */

import { PASTE_DIR, MAX_PASTE_BYTES, writePasteFile, formatPasteMention } from './paste-store.js'

/** Route the client POSTs one converted paste to. */
export const PASTE_PATH = '/dsh-cds-theme/paste'

/** The marker every legitimate request carries (must match `client/src/paste.js`). */
export const MARKER_HEADER = 'x-dsh-cds-theme'
export const MARKER_VALUE = '1'

/** Refuse a request body larger than this (JSON envelope included). */
export const MAX_BODY_BYTES = MAX_PASTE_BYTES + 64 * 1024

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

// ------------------------------------------------------------ request fence

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
  } catch (error) {
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
 * Decide whether a request may write one paste file.
 *
 * Every branch fails CLOSED; the reference authority is the listener's own
 * origin (`ctx.webServer.getOrigin()`), whose Host header a DNS rebinding
 * attacker cannot forge. A not-yet-known origin falls back to the strictest
 * loopback rule instead of opening up.
 *
 * @param request - node:http request (only `headers` is read).
 * @param origin - the listener's own `http://host:port`, or null when unknown.
 * @returns null when the request is ours, else a short machine-readable reason.
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

  if (headerOf(request, MARKER_HEADER) !== MARKER_VALUE) return 'missing-marker'

  return null
}

// -------------------------------------------------------------- body reader

/**
 * Read a bounded JSON body. The Client sends one small object; anything else is
 * a bug or an attack, and neither deserves streaming.
 *
 * @param request - node:http request.
 * @param limit - byte cap.
 * @returns the parsed value.
 * @throws Error with `code === 'TOO_LARGE'` past the cap, or a parse error.
 */
export function readJsonBody(request, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let failed = false
    const fail = (error) => {
      if (failed) return
      failed = true
      reject(error)
    }
    request.on('data', (chunk) => {
      if (failed) return
      total += chunk.length
      if (total > limit) {
        const error = new Error('paste: request body too large')
        error.code = 'TOO_LARGE'
        fail(error)
        return
      }
      chunks.push(chunk)
    })
    request.on('error', fail)
    request.on('end', () => {
      if (failed) return
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        fail(error)
      }
    })
  })
}

// ------------------------------------------------------------ workspace

/**
 * Resolve one Session's absolute workspace without activating an Agent.
 *
 * @param ctx - host context carrying `sessions` and/or `sessionController`.
 * @param sessionId - durable Session identity from the Client.
 * @returns the absolute cwd, or null when the Session is unknown/workspaceless.
 */
export async function sessionWorkspace(ctx, sessionId) {
  const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : ctx.sessions
  const attached = sessions !== undefined && sessions !== null && typeof sessions.get === 'function'
    ? sessions.get(sessionId)
    : undefined
  const live = attached === undefined || attached === null ? undefined : attached.header
  if (live !== undefined && live !== null && typeof live.cwd === 'string') return live.cwd

  const controller = typeof ctx.get === 'function' ? ctx.get('sessionController') : ctx.sessionController
  if (controller !== undefined && controller !== null && typeof controller.inspect === 'function') {
    const inspection = await controller.inspect(sessionId)
    const meta = inspection === undefined || inspection === null ? undefined : inspection.meta
    if (meta !== undefined && meta !== null && typeof meta.cwd === 'string') return meta.cwd
  }
  return null
}

// -------------------------------------------------------------- the route

/**
 * The paste store route.
 *
 * @param options.resolveWorkspace - `(ctx, sessionId) => Promise<string|null>`,
 *        injectable so the route is testable without a session store.
 * @param options.origin - returns the listener's own origin (or null).
 * @param options.store - `writePasteFile`-shaped writer, injectable for tests.
 */
export function createPasteRoute(ctx, options = {}) {
  const resolve = typeof options.resolveWorkspace === 'function'
    ? options.resolveWorkspace
    : (hostCtx, sessionId) => sessionWorkspace(hostCtx, sessionId)
  const originOf = typeof options.origin === 'function' ? options.origin : () => null
  const store = typeof options.store === 'function' ? options.store : writePasteFile

  function listenerOrigin() {
    try {
      const value = originOf()
      return typeof value === 'string' && value !== '' ? value : null
    } catch (error) {
      return null
    }
  }

  return {
    kind: 'exact',
    path: PASTE_PATH,
    handler: async (request, response) => {
      if (request.method !== 'POST') {
        response.writeHead(405, { allow: 'POST' })
        response.end()
        return
      }
      // Refuse before reading a body: a refused request must cost nothing.
      const refused = refuseRequest(request, listenerOrigin())
      if (refused !== null) {
        sendJson(response, 403, { error: 'refused', reason: refused })
        return
      }

      let body
      try {
        body = await readJsonBody(request)
      } catch (error) {
        const tooLarge = error && error.code === 'TOO_LARGE'
        sendJson(response, tooLarge ? 413 : 400, {
          ok: false,
          reason: tooLarge ? 'too-large' : 'bad-json',
        })
        return
      }
      if (body === null || typeof body !== 'object') {
        sendJson(response, 400, { ok: false, reason: 'bad-body' })
        return
      }
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      const name = typeof body.name === 'string' ? body.name : ''
      const text = typeof body.text === 'string' ? body.text : ''
      if (sessionId === '' || name === '' || text === '') {
        sendJson(response, 400, { ok: false, reason: 'bad-body' })
        return
      }
      if (Buffer.byteLength(text, 'utf8') > MAX_PASTE_BYTES) {
        sendJson(response, 413, { ok: false, reason: 'too-large' })
        return
      }

      let cwd
      try {
        cwd = await resolve(ctx, sessionId)
      } catch (error) {
        cwd = null
      }
      if (typeof cwd !== 'string' || cwd === '') {
        // No workspace (unknown Session, a session-less composer): the Client
        // falls back to an ordinary text paste. Never an error the user sees.
        sendJson(response, 409, { ok: false, reason: 'no-workspace' })
        return
      }

      try {
        const written = await store({ cwd, name, text })
        const mention = formatPasteMention(written.relativePath)
        if (mention === null) {
          sendJson(response, 422, { ok: false, reason: 'unrepresentable-path' })
          return
        }
        sendJson(response, 200, {
          ok: true,
          fileName: written.fileName,
          relativePath: written.relativePath,
          mention,
        })
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          reason: 'write-failed',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}

/**
 * Mount the route once the profile composes a web server.
 *
 * `ctx.inject` waits for the service, so a composition without a web server (a
 * headless run) simply never mounts the route and the Client's paste falls back
 * to plain text — the feature degrades, the plugin never fails to load.
 *
 * @param ctx - host context of this plugin.
 */
export function installPasteRoute(ctx) {
  if (ctx === undefined || ctx === null || typeof ctx.inject !== 'function') return
  ctx.inject(['webServer'], (hostCtx) => {
    const webServer = hostCtx.webServer
    if (webServer === undefined || typeof webServer.register !== 'function') {
      console.warn('dsh-cds-theme: the webServer service exposes no register(); long pastes stay plain text')
      return
    }
    const origin = () => {
      try {
        return typeof webServer.getOrigin === 'function' ? webServer.getOrigin() : null
      } catch (error) {
        return null
      }
    }
    hostCtx.effect(
      () => webServer.register(createPasteRoute(hostCtx, { origin })),
      'dsh-cds-theme: paste store route',
    )
  })
}

export { PASTE_DIR }
