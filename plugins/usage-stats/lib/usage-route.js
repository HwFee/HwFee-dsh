import { aggregateUsage, emptyUsageSummary } from './usage-store.js'

/** Route the client reads the aggregated summary from. */
export const USAGE_PATH = '/dsh-usage-stats/summary'

/**
 * The marker every legitimate request carries.
 *
 * WHY A CUSTOM HEADER. The summary route is an unauthenticated GET on the
 * host's loopback listener. There are no CORS headers, so a hostile page
 * cannot READ the body — but it can still TRIGGER the request with
 * `<img src="http://127.0.0.1:PORT/dsh-usage-stats/summary?refresh=1">`: no
 * preflight, no interaction, no CORS needed to cause the work. And the work is
 * expensive: `?refresh=1` drops the parse cache and re-reads the whole session
 * corpus (~50 MB, ~2.3 s of synchronous decode), so a handful of `<img>` tags
 * is a measurable stall. Even without `refresh`, the response size and latency
 * are a fingerprinting surface.
 *
 * The host's `ctx.webServer` is a plain route registry with no server-wide
 * authentication or origin policy (its README says so: route owners enforce
 * their own), so the fence has to live here — the same shape
 * `dsh-client-connection`'s `isTrustedApiRequest` applies to `/api`, and the
 * same one `plugins/system-fonts/lib/font-route.js` ships.
 *
 * A required NON-SAFELISTED header is the strongest piece available to a route
 * owner: `img`/`script`/`link`/`form`/navigation cannot set one at all, and a
 * cross-origin `fetch` that would first sends a CORS preflight this server
 * never answers (no `access-control-allow-origin`, OPTIONS is 405), so the real
 * request is never sent. Our own client is same-origin and adds the header, and
 * same-origin requests never preflight.
 *
 * MUST MATCH `USAGE_MARKER_HEADER` in `client/src/constants.js`; a
 * cross-file test asserts the two strings are equal, because a drift here is a
 * silent 403 for the whole panel.
 */
export const MARKER_HEADER = 'x-dsh-usage-stats'
export const MARKER_VALUE = '1'

function sendJson(response, status, body) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    // The summary changes as soon as a session writes another record; a cached
    // copy would keep showing yesterday's totals until a hard reload.
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
 * Decide whether a request may reach the summary.
 *
 * Order matters: every cheap header check runs BEFORE `aggregate()` is called,
 * so a refused request does no enumeration and no parsing at all. That is the
 * whole point — a cross-site `<img>` must not cost a 2.3 s corpus read.
 *
 * Every branch fails CLOSED. The listener's own authority
 * (`ctx.webServer.getOrigin()`) is the reference: the Host header is the one
 * part of a loopback HTTP request DNS rebinding cannot forge.
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

/**
 * The summary route.
 *
 * @param aggregate - aggregator (injectable for tests).
 * @param options.origin() returns the listener's own origin (or null); it is a
 *   function so the fence stays testable and so a not-yet-known origin fails
 *   closed instead of being captured once as null.
 */
export function createUsageRoute(aggregate = aggregateUsage, options = {}) {
  const originOf = typeof options.origin === 'function' ? options.origin : () => null

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
    path: USAGE_PATH,
    handler: async (request, response) => {
      if (request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET' })
        response.end()
        return
      }
      // Refuse BEFORE the aggregator runs. A refused request must cost nothing:
      // no session enumeration, no log parse, no cache invalidation.
      const refused = refuseRequest(request, listenerOrigin())
      if (refused !== null) {
        sendJson(response, 403, { error: 'refused', reason: refused })
        return
      }
      // `?refresh=1` (the panel's manual refresh) drops the parse cache and
      // re-reads every log — the single most expensive thing this plugin does.
      // It is only reachable past the fence above; the check is repeated here so
      // the intent is documented at the point where the cost is incurred, and so
      // a future relaxation of the fence cannot silently expose the 2.3 s path.
      let force = false
      try {
        force = new URL(request.url ?? '/', 'http://localhost').searchParams.get('refresh') === '1'
      } catch { /* an unparseable request URL is not a reason to fail the read */ }
      if (force && refuseRequest(request, listenerOrigin()) !== null) {
        sendJson(response, 403, { error: 'refused', reason: 'refresh-without-fence' })
        return
      }
      try {
        sendJson(response, 200, await aggregate({ force }))
      } catch (error) {
        // The client renders one "usage unavailable" line from `error`; the rest
        // of the summary stays in its documented shape so a lenient client can
        // still read the zeroes.
        sendJson(response, 500, {
          ...emptyUsageSummary(),
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}
