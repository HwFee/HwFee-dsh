/**
 * dsh-usage-stats host entry.
 *
 * The host owns exactly one job: reading and aggregating the session logs under
 * `~/.dsh/sessions`. That cannot happen in the browser — the logs are files on
 * disk, and DSH exposes no filesystem bridge to the renderer.
 *
 * The aggregate is served over one same-origin route (see usage-route.js);
 * the panel, its styles and its settings all live in the client bundle.
 */

import { createUsageRoute, USAGE_PATH } from './usage-route.js'
import { aggregateUsage, hasPersistedUsageCache } from './usage-store.js'

export { USAGE_PATH }

export const name = 'dsh-usage-stats'

/**
 * Mount the summary route once the profile composes a web server.
 *
 * `ctx.inject` waits for the service, so a composition without a web server (a
 * headless run) simply never mounts the route — the panel then reports the data
 * as unavailable instead of the plugin failing to load.
 *
 * A second effect WARMS THE PARSE CACHE at startup, but only when a previous run
 * left one behind (the cache read itself is ~17ms; a first-ever run has no cache
 * and is left lazy on purpose — a 2.4s synchronous parse during Host startup
 * would stall every other plugin's mount).
 *
 * THE WARM-UP MUST NOT BLOCK STARTUP. Two things make that true:
 *   - it is scheduled on a later event-loop turn (`setTimeout(…, 0)`), after the
 *     plugin graph has mounted;
 *   - it runs in `{ background: true }` mode: files that still need re-reading
 *     (typically the last session's log, ~350ms when parsed in one go) are
 *     decoded cooperatively, yielding every `PREWARM_FRAMES_PER_YIELD` frames, so
 *     no single turn blocks for more than roughly ten milliseconds.
 * A panel request that arrives mid-warm-up joins the in-flight aggregate (the
 * store is single-flight) instead of duplicating the pass, and answers from it.
 *
 * @param ctx host context
 * @param options.prewarm force the startup warm-up on/off (tests pass false to
 *        stay independent of whatever cache the machine has)
 */
export function apply(ctx, options = {}) {
  const prewarm = options.prewarm === undefined ? hasPersistedUsageCache() : options.prewarm === true
  ctx.inject(['webServer'], (hostCtx) => {
    const webServer = hostCtx.webServer
    if (webServer === undefined || typeof webServer.register !== 'function') {
      console.warn('dsh-usage-stats: the webServer service exposes no register(); usage statistics will be unavailable')
      return
    }
    hostCtx.effect(() => {
      // The fence's reference authority is the listener's own origin. Reading it
      // lazily (inside the handler) rather than once here means a not-yet-known
      // origin fails closed at request time instead of being frozen as null.
      const disposeRoute = webServer.register(createUsageRoute(undefined, {
        origin: () => {
          try {
            return typeof webServer.getOrigin === 'function' ? webServer.getOrigin() : null
          } catch (error) {
            return null
          }
        },
      }))
      let timer = null
      if (prewarm) {
        // Deferred one turn and cooperative: the callback returns quickly between
        // frame batches, so startup and the first UI work are never stuck behind
        // the corpus. Fire-and-forget — only the store cache is being filled.
        timer = setTimeout(() => {
          timer = null
          aggregateUsage({ background: true }).catch(() => {})
        }, 0)
      }
      return () => {
        if (timer !== null) clearTimeout(timer)
        if (typeof disposeRoute === 'function') disposeRoute()
      }
    }, 'dsh-usage-stats: usage summary route')
  })
}
