import { listSystemFonts } from './system-fonts.js'

/** Route the client reads the catalogue from. */
export const FONTS_PATH = '/dsh-system-fonts/fonts'

/**
 * The marker every legitimate request carries.
 *
 * WHY A CUSTOM HEADER. The catalogue route is an unauthenticated GET on the
 * host's loopback listener, so a web page the user visits can trigger it with
 * `<img src="http://127.0.0.1:PORT/dsh-system-fonts/fonts?refresh=1">`: no CORS
 * preflight, no interaction, and `?refresh=1` spawns three PowerShell processes
 * (~3.6 s). The host's `ctx.webServer` is a plain route registry — its README
 * says so outright ("No server-wide authentication or origin policy — route
 * owners such as dsh-client-connection enforce their own request policy") — so
 * the fence has to live here, the way `dsh-client-connection`'s own
 * `isTrustedApiRequest` does it for `/api`.
 *
 * A required NON-SAFELISTED header is the strongest piece available to a route
 * owner: `img`/`script`/`link`/`form`/navigation cannot set one at all, and a
 * cross-origin `fetch` that does would first send a CORS preflight this server
 * never answers (no `access-control-allow-origin`, OPTIONS is 405), so the real
 * request is never sent. Our own client is same-origin and adds the header, and
 * same-origin requests never preflight.
 */
export const MARKER_HEADER = 'x-dsh-system-fonts'
export const MARKER_VALUE = '1'

/**
 * The wire shape. `file` used to ride along (480 values, 198 of them absolute
 * paths such as `C:\Users\…\Fonts\0xProtoNerdFontMono-Regular.ttf`, ~21 KB of a
 * 76 KB body) and NOTHING reads it — the picker renders `family` and filters on
 * `symbol`. It is a filesystem-layout disclosure to anything that can reach the
 * port, so it is dropped here as a whitelist: a field added to the enumerator
 * later cannot leak by accident.
 */
function toWireCatalogue(catalogue) {
  const families = Array.isArray(catalogue && catalogue.families) ? catalogue.families : []
  return {
    platform: catalogue && catalogue.platform,
    supported: catalogue && catalogue.supported,
    sources: Array.isArray(catalogue && catalogue.sources) ? catalogue.sources : [],
    count: families.length,
    families: families.map((entry) => ({
      family: typeof entry.family === 'string' ? entry.family : '',
      weights: Array.isArray(entry.weights) ? entry.weights : [],
      italic: entry.italic === true,
      symbol: entry.symbol === true,
      gdi: entry.gdi === true,
      localized: entry.localized === true,
    })),
  }
}

function sendJson(response, status, body) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    // The catalogue is machine-specific and cheap to re-read; never let a proxy
    // or the webview's own cache answer a stale list after a font install.
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

/**
 * `host[:port]` of a request's Host header (`host:port`) or of an absolute
 * Origin (`http://host:port`), lowercased, default port dropped.
 */
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
 * Decide whether a request may reach the catalogue.
 *
 * Order matters: the cheap header checks run before any enumeration, so a
 * refused request costs nothing. Every branch fails CLOSED, and the listener's
 * own authority (`ctx.webServer.getOrigin()`) is the reference — the same fence
 * `dsh-client-connection` applies to `/api`, including its Host check, which is
 * the one part of a loopback HTTP request DNS rebinding cannot forge.
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
    // Before the listener reports its origin the route cannot be served at all;
    // if that ever changes, fall back to the strictest rule rather than open up.
    if (!isLoopbackAuthority(authority)) return 'foreign-host'
  } else if (authority !== own) {
    // A browser reaches the listener under its own bind authority. `localhost`
    // is the same loopback address under another name; anything else is either a
    // DNS-rebinding Host or a proxy rewriting the request.
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

/** How long a forced re-read is ignored after the previous one started. */
export const FORCE_COOLDOWN_MS = 5000

/**
 * The catalogue route.
 *
 * @param listFonts - enumerator (injectable for tests).
 * @param options - `origin()` returns the listener's own origin (or null),
 *   `now()` the clock; both exist so the fence and the cooldown are testable.
 */
export function createFontRoute(listFonts = listSystemFonts, options = {}) {
  const originOf = typeof options.origin === 'function' ? options.origin : () => null
  const now = typeof options.now === 'function' ? options.now : Date.now
  let lastForcedAt = null

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
    path: FONTS_PATH,
    handler: async (request, response) => {
      if (request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET' })
        response.end()
        return
      }
      // Refuse BEFORE the enumerator runs: a cross-site `<img>` must not cost a
      // PowerShell spawn, which is the whole point of the fence.
      const refused = refuseRequest(request, listenerOrigin())
      if (refused !== null) {
        sendJson(response, 403, { error: 'refused', reason: refused })
        return
      }
      // `?refresh=1` re-reads after the user installs a font, bypassing the
      // per-process memo. A burst of forced reads is coalesced by the cooldown:
      // the UI's refresh still works, a loop cannot spawn PowerShell per request.
      let force = false
      try {
        force = new URL(request.url ?? '/', 'http://localhost').searchParams.get('refresh') === '1'
      } catch { /* an unparseable request URL is not a reason to fail the read */ }
      if (force) {
        const at = now()
        if (lastForcedAt !== null && at - lastForcedAt < FORCE_COOLDOWN_MS) force = false
        else lastForcedAt = at
      }
      try {
        sendJson(response, 200, toWireCatalogue(await listFonts(force)))
      } catch (error) {
        sendJson(response, 500, {
          platform: process.platform,
          supported: true,
          families: [],
          sources: [],
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}
