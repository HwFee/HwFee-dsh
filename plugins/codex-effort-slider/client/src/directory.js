/**
 * Per-session access to the host's model directory.
 *
 * Two real problems this solves, both of which produced "the knob sometimes jumps"
 * reports before they were fixed upstream:
 *
 *  1. `directoryFor(sessionId)` THROWS BY DESIGN while the session scope / binding
 *     is not ready — it is not a "not yet" return value.
 *  2. The directory INSTANCE can be rebuilt (model generation change, connection
 *     reset), so caching one instance and holding it forever turns a momentary
 *     startup blip into a permanently dead control.
 *
 * So every read re-resolves the instance, a failed resolve schedules a bounded
 * backoff, and the subscription is (re)established whenever the instance changes.
 */

import { EMPTY_SNAPSHOT } from './levels.js'
import { RETRY_DELAYS } from './constants.js'

/**
 * @param {object} deps
 * @param {object} deps.ctx host context with `modelDirectories`
 * @param {string} deps.sessionId
 * @param {{ set: Function, clear: Function }} deps.timers injectable so tests stay deterministic
 */
export function createDirectoryAccess(deps) {
  const ctx = deps.ctx
  const sessionId = deps.sessionId
  const timers = deps.timers

  const listeners = new Set()
  let directory = null
  let unsubscribe = null
  let last = EMPTY_SNAPSHOT
  let retryIndex = 0
  let retryTimer = null
  let closed = false
  let lastLoadAt = 0

  function notify() {
    // A throwing subscriber must not silence the others.
    for (const listener of Array.from(listeners)) {
      try { listener() } catch (error) { /* ignore */ }
    }
  }

  function scheduleRetry() {
    if (closed || retryTimer !== null || retryIndex >= RETRY_DELAYS.length) return
    const delay = RETRY_DELAYS[retryIndex]
    retryIndex += 1
    retryTimer = timers.set(function () {
      retryTimer = null
      if (resolve() !== null) {
        // A successful resolve must announce itself: the caller (useSyncExternalStore)
        // is waiting for the store to appear.
        notify()
        return
      }
      // Still not ready: keep backing off. Without this line the self-healing chain
      // dies after the first failed retry and the control silently stays dead —
      // exactly the "one startup hiccup becomes a permanent break" failure.
      scheduleRetry()
    }, delay)
  }

  /** Re-resolve the directory; re-subscribe when the instance changed. Returns it (or null). */
  function resolve() {
    if (closed) return null
    let fresh = null
    try {
      fresh = ctx.modelDirectories.directoryFor(sessionId)
    } catch (error) {
      fresh = null
    }
    if (!fresh || !fresh.store || typeof fresh.store.getSnapshot !== 'function') fresh = null
    if (fresh === directory) return directory
    if (unsubscribe !== null) {
      try { unsubscribe() } catch (error) { /* a failed unsubscribe must not block the new one */ }
      unsubscribe = null
    }
    directory = fresh
    if (directory !== null) {
      retryIndex = 0
      try {
        unsubscribe = typeof directory.store.subscribe === 'function' ? directory.store.subscribe(notify) : null
      } catch (error) {
        unsubscribe = null
      }
      kickLoad()
    }
    return directory
  }

  /** Pull the catalog once. Without a `load()` the store sits idle and the level list is empty. */
  function kickLoad() {
    if (closed || directory === null || typeof directory.load !== 'function') return
    const now = Date.now()
    if (now - lastLoadAt < 400) return
    lastLoadAt = now
    const target = directory
    try {
      Promise.resolve(target.load()).catch(function () { /* the store exposes the error */ })
    } catch (error) {
      /* a synchronous throw is still the store's error to report */
    }
  }

  return {
    getSnapshot() {
      if (closed) return EMPTY_SNAPSHOT
      // RE-RESOLVE ON EVERY READ, not just when the instance is missing.
      //
      // `directoryFor` is a WeakMap lookup keyed by the session binding, so it is
      // cheap — and it is the only way to notice that the binding was replaced
      // (a session rebind, or a fresh resolver generation). `resetConnected()` on a
      // connection reset bumps the directory's own generation in place, but a
      // REBOUND session yields a DIFFERENT directory instance; holding the old one
      // would keep reading and subscribing to a store nothing writes any more, and
      // the slider would silently show a frozen level list.
      resolve()
      if (directory === null) scheduleRetry()
      if (directory !== null) {
        try {
          const value = directory.store.getSnapshot()
          if (value && typeof value === 'object') last = value
        } catch (error) {
          /* keep the previous snapshot; never take the render down */
        }
      }
      return last
    },
    subscribe(listener) {
      if (closed) return function () {}
      listeners.add(listener)
      // Same reasoning as getSnapshot: re-resolve so the subscription lands on the
      // CURRENT directory instance rather than the one that existed at mount.
      resolve()
      if (directory === null) scheduleRetry()
      // StrictMode subscribes/unsubscribes once; unsubscribing must clear only the
      // listener, never permanently close the accessor.
      return function () { listeners.delete(listener) }
    },
    /** The directory to write through, re-resolved at call time (never a stale instance). */
    directory() {
      const fresh = resolve()
      return fresh !== null ? fresh : directory
    },
    load: kickLoad,
    dispose() {
      closed = true
      listeners.clear()
      if (retryTimer !== null) {
        try { timers.clear(retryTimer) } catch (error) { /* ignore */ }
        retryTimer = null
      }
      if (unsubscribe !== null) {
        try { unsubscribe() } catch (error) { /* ignore */ }
        unsubscribe = null
      }
      directory = null
    },
  }
}
