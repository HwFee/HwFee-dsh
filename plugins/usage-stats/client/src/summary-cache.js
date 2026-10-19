/**
 * The client-side summary cache: a panel reopen is instant, and two mounts
 * share one request.
 *
 * The hero panel mounts every time the user lands on a blank session, and the
 * panel's loading state was painted from an empty state each time even though
 * the previous answer was still perfectly good seconds earlier. This cache keeps
 * the last summary for a SHORT TTL:
 *
 *   - within the TTL, `load()` resolves the cached summary synchronously (no
 *     network, no loading line: the panel seeds its state from `peek()`);
 *   - past the TTL, it refetches in the background while the cached summary
 *     stays on screen (no flash);
 *   - a failed refetch never poisons the cache;
 *   - concurrent loads share one in-flight request;
 *   - `load({ refresh: true })` ignores the TTL but still asks the Host for its
 *     normal incremental answer — the panel uses it to correct a `stale` reply;
 *   - `load({ force: true })` is the explicit user refresh and asks the Host for
 *     a TRUE re-read (`?refresh=1`), bypassing the Host's caches too.
 *
 * WHY A TTL rather than "until the app reloads": the numbers are a summary of
 * an append-only log, and the user can open a new session seconds after the
 * last one ended. A bounded TTL keeps every reopen fast while guaranteeing the
 * panel refreshes on its own; the Host additionally settles any actively-
 * written file within its own grace window (see lib/usage-store.js), and a
 * `stale` response makes the panel retry once that window has passed.
 */

/** How long a fetched summary may be reused without asking the Host again. */
export const SUMMARY_TTL_MS = 15000

/** How long after a `stale` response the panel asks again (Host grace + slack). */
export const STALE_RETRY_MS = 3500

/**
 * @param options.fetcher `({ force }) => Promise<summary>` — the network read
 * @param options.now clock (tests)
 * @param options.ttlMs reuse window; defaults to SUMMARY_TTL_MS
 */
export function createSummaryCache(options) {
  const fetcher = options.fetcher
  const now = typeof options.now === 'function' ? options.now : function () { return Date.now() }
  const ttlMs = options.ttlMs === undefined ? SUMMARY_TTL_MS : options.ttlMs

  let cached = null
  let inflight = null

  /** The last summary, or null — lets the panel render it on its FIRST frame. */
  function peek() {
    return cached === null ? null : cached.summary
  }

  function ageMs() {
    return cached === null ? Infinity : now() - cached.at
  }

  function isFresh() {
    return cached !== null && ageMs() <= ttlMs
  }

  function remember(summary) {
    cached = { summary: summary, at: now() }
    return summary
  }

  /**
   * Resolve the summary, reusing the cache unless stale or asked to bypass it.
   *
   * Two bypass modes, deliberately distinct:
   *   - `refresh: true` ignores the TTL but still asks the Host for its normal
   *     answer (it re-reads only what changed). The panel uses this to correct a
   *     `stale` summary once the Host's grace window has passed.
   *   - `force: true` is the user's explicit refresh: it also asks the Host to
   *     re-read every log (`?refresh=1`).
   *
   * Ordinary concurrent calls share one request so N mounts cannot multiply the
   * work; a forced call starts its own.
   */
  function load(readOptions) {
    const options = readOptions || {}
    const force = options.force === true
    const refresh = options.refresh === true
    if (!force && !refresh) {
      if (isFresh()) return Promise.resolve(cached.summary)
      if (inflight !== null) return inflight
    }
    const request = Promise.resolve()
      .then(function () { return fetcher({ force: force }) })
      .then(function (summary) { return remember(summary) }, function (error) {
        throw error
      })
    if (force) return request
    if (inflight !== null) return inflight
    const tracked = request.then(
      function (summary) { inflight = null; return summary },
      function (error) { inflight = null; throw error },
    )
    inflight = tracked
    return tracked
  }

  return {
    load: load,
    peek: peek,
    isFresh: isFresh,
    ageMs: ageMs,
    get ttlMs() { return ttlMs },
  }
}
