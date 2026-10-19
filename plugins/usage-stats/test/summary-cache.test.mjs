/**
 * The client-side summary cache: a panel reopen is instant, one request is
 * shared by concurrent mounts, and a stale response corrects itself.
 *
 * `summary-cache.js` is pure over an injected fetcher and clock, so this file
 * needs neither a browser nor a server.
 *
 *   node test/summary-cache.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createSummaryCache, SUMMARY_TTL_MS, STALE_RETRY_MS,
} from '../client/src/summary-cache.js'
import { createPanel } from '../client/src/panel.js'

/** A fetcher whose responses the test controls. */
function makeFetcher() {
  const calls = []
  return {
    calls,
    fetcher(options) {
      calls.push(options || {})
      return Promise.resolve({ generatedAt: calls.length, sessions: calls.length })
    },
  }
}

/** A clock the test advances by hand. */
function makeClock(start) {
  let now = start === undefined ? 1000 : start
  return { now: () => now, advance(ms) { now += ms } }
}

test('the cache TTL is short and the stale retry outlasts the Host grace window', function () {
  assert.ok(SUMMARY_TTL_MS > 0 && SUMMARY_TTL_MS <= 30000,
    'a reopen must be fast without letting the numbers drift for minutes')
  assert.ok(STALE_RETRY_MS >= 3000,
    'the retry must be after the Host hot-tail grace, not before it')
})

test('the first load fetches, remembers, and is peekable', async function () {
  const { fetcher, calls } = makeFetcher()
  const cache = createSummaryCache({ fetcher, now: makeClock().now })
  assert.equal(cache.peek(), null, 'nothing cached before the first load')

  const summary = await cache.load()
  assert.equal(summary.sessions, 1)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { force: false }, 'an ordinary open never forces a Host re-read')
  assert.equal(cache.peek(), summary, 'the panel can seed its first frame from peek()')
  assert.equal(cache.isFresh(), true)
})

test('within the TTL a load resolves the cached summary with no request', async function () {
  const { fetcher, calls } = makeFetcher()
  const clock = makeClock()
  const cache = createSummaryCache({ fetcher, now: clock.now })

  const first = await cache.load()
  clock.advance(SUMMARY_TTL_MS - 1)
  const second = await cache.load()
  assert.equal(second, first, 'the same summary object, not a re-fetch')
  assert.equal(calls.length, 1, 'a panel reopen inside the TTL is instant')
})

test('past the TTL the cache refetches and replaces the summary', async function () {
  const { fetcher, calls } = makeFetcher()
  const clock = makeClock()
  const cache = createSummaryCache({ fetcher, now: clock.now })

  await cache.load()
  clock.advance(SUMMARY_TTL_MS + 1)
  const second = await cache.load()
  assert.equal(calls.length, 2)
  assert.equal(second.sessions, 2, 'the newer answer wins')
  assert.equal(cache.isFresh(), true)
})

test('concurrent mounts share one in-flight request', async function () {
  const { fetcher, calls } = makeFetcher()
  const cache = createSummaryCache({ fetcher, now: makeClock().now })
  const [first, second, third] = await Promise.all([cache.load(), cache.load(), cache.load()])
  assert.equal(calls.length, 1, 'three loads, one request')
  assert.equal(second, first)
  assert.equal(third, first)
})

test('refresh bypasses the TTL but still asks for the normal incremental read', async function () {
  const { fetcher, calls } = makeFetcher()
  const cache = createSummaryCache({ fetcher, now: makeClock().now })
  await cache.load()
  const refreshed = await cache.load({ refresh: true })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1], { force: false }, 'refresh must NOT force a full Host re-read')
  assert.equal(refreshed.sessions, 2)
})

test('force bypasses the TTL, any in-flight request, and the Host caches', async function () {
  const { fetcher, calls } = makeFetcher()
  const cache = createSummaryCache({ fetcher, now: makeClock().now })
  await cache.load()
  const forced = await cache.load({ force: true })
  assert.deepEqual(calls[1], { force: true }, 'an explicit refresh is a true re-read')
  assert.equal(forced.sessions, 2)
  // And the forced answer is what later ordinary loads reuse.
  const next = await cache.load()
  assert.equal(next, forced)
  assert.equal(calls.length, 2)
})

test('a failed refetch never poisons the cache', async function () {
  const clock = makeClock()
  let fail = false
  const calls = []
  const cache = createSummaryCache({
    now: clock.now,
    fetcher(options) {
      calls.push(options)
      if (fail) return Promise.reject(new Error('offline'))
      return Promise.resolve({ generatedAt: 1, sessions: 1 })
    },
  })

  const first = await cache.load()
  clock.advance(SUMMARY_TTL_MS + 1)
  fail = true
  await assert.rejects(cache.load(), /offline/)
  assert.equal(cache.peek(), first, 'the previous summary survives a failed refresh')
  assert.equal(cache.isFresh(), false, 'and is still marked stale so the next load retries')

  fail = false
  const recovered = await cache.load()
  assert.equal(recovered.sessions, 1)
  assert.equal(calls.length, 3)
})

test('a first-load failure leaves the cache empty and the next load retries', async function () {
  let fail = true
  let calls = 0
  const cache = createSummaryCache({
    now: makeClock().now,
    fetcher() {
      calls += 1
      if (fail) return Promise.reject(new Error('offline'))
      return Promise.resolve({ generatedAt: 1, sessions: 0 })
    },
  })
  await assert.rejects(cache.load(), /offline/)
  assert.equal(cache.peek(), null)
  fail = false
  await cache.load()
  assert.equal(calls, 2)
  assert.notEqual(cache.peek(), null)
})

test('a fetcher that throws synchronously rejects the load instead of escaping', async function () {
  const cache = createSummaryCache({
    now: makeClock().now,
    fetcher() { throw new Error('no fetch in this seat') },
  })
  await assert.rejects(cache.load(), /no fetch/)
  assert.equal(cache.peek(), null)
})

test('the ttl is configurable for a long-lived test', async function () {
  const { fetcher, calls } = makeFetcher()
  const clock = makeClock()
  const cache = createSummaryCache({ fetcher, now: clock.now, ttlMs: 5 })
  await cache.load()
  clock.advance(5)
  await cache.load()
  assert.equal(calls.length, 1, 'at the boundary the summary is still fresh')
  clock.advance(1)
  await cache.load()
  assert.equal(calls.length, 2)
})

// ------------------------------------------------ the panel's use of the cache

const BLANK = { blank: true, running: false, promptAttempted: false }

function sampleSummary(extra) {
  return Object.assign({
    generatedAt: 1,
    sessions: 2,
    messages: 3,
    totalTokens: 100,
    activeDays: 1,
    peakHour: 9,
    perDay: {},
    perHour: new Array(24).fill(0),
    perModel: {},
  }, extra)
}

function flatten(tree, out) {
  const collected = out || []
  ;(function walk(node) {
    if (node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    collected.push(node)
    walk(node.children)
  })(tree)
  return collected
}

/** Render one Panel with a hooks-capable React stand-in. */
function renderPanel(props) {
  const effects = []
  const React = {
    createElement(type) {
      const children = Array.prototype.slice.call(arguments, 2)
      const next = Object.assign({}, arguments[1])
      if (children.length === 1) next.children = children[0]
      else if (children.length > 1) next.children = children
      return { type, props: next, children }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, function () {}]
    },
    useEffect(fn) { effects.push(fn) },
    useMemo(fn) { return fn() },
    useRef(value) { return { current: value } },
    useSyncExternalStore(subscribe, getSnapshot) {
      subscribe(function () {})
      return getSnapshot()
    },
  }
  const panel = createPanel({ React, primitives: {}, settings: undefined })
  const tree = panel.Panel(props)
  // The panel now owns more than one effect (the fetch, the resize listener and
  // the hoist), so a test cannot assume which slot the fetch landed in: run them
  // all and hand back every cleanup.
  const cleanups = effects.map(function (fn) {
    const cleanup = fn()
    return typeof cleanup === 'function' ? cleanup : function () {}
  })
  return { tree: tree, effects: effects, cleanups: cleanups }
}

const classesOf = function (tree) {
  return flatten(tree).map(function (node) { return node.props && node.props.className })
}

/** Flush the promise chain the panel's effect starts (no timers involved). */
const flush = async function () {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function noteTexts(tree) {
  return flatten(tree)
    .filter(function (node) { return node.props && node.props.className === 'dus-note' })
    .map(function (node) { return node.props.children })
}

test('the panel paints a cached summary on its first frame (no loading flash)', function () {
  const cached = sampleSummary()
  const { tree } = renderPanel({
    session: BLANK,
    fetchSummary: function () { return Promise.resolve(cached) },
    peekSummary: function () { return cached },
    t: function (key) { return key },
  })
  const classes = classesOf(tree)
  assert.ok(classes.includes('dus-grid'), 'the metric grid is already rendered')
  assert.ok(!noteTexts(tree).includes('note.loading'),
    'the loading row must not flash on a warm reopen')
})

test('without a cached summary the panel still renders the loading row', function () {
  const { tree } = renderPanel({
    session: BLANK,
    fetchSummary: function () { return new Promise(function () {}) },
    peekSummary: function () { return null },
    t: function (key) { return key },
  })
  assert.ok(noteTexts(tree).includes('note.loading'))
})

test('an ordinary mount loads through the shared cache without forcing', async function () {
  const calls = []
  const cached = sampleSummary()
  const { cleanups } = renderPanel({
    session: BLANK,
    fetchSummary: function (options) {
      calls.push(options)
      return Promise.resolve(cached)
    },
    peekSummary: function () { return cached },
    t: function (key) { return key },
  })
  await flush()
  assert.equal(calls.length, 1, 'one load per mount')
  assert.equal(calls[0], undefined, 'ordinary opens pass no force/refresh option')
  for (const cleanup of cleanups) cleanup()
})

test('a live conversation does not hit the cache at all', async function () {
  let calls = 0
  const { cleanups } = renderPanel({
    session: { blank: false, running: false, promptAttempted: false },
    fetchSummary: function () { calls += 1; return Promise.resolve(sampleSummary()) },
    peekSummary: function () { return null },
    t: function (key) { return key },
  })
  await flush()
  assert.equal(calls, 0, 'the panel only fetches while the session is blank')
  for (const cleanup of cleanups) cleanup()
})

test('a stale summary schedules exactly one incremental correction', async function () {
  const calls = []
  const stale = sampleSummary({ stale: true })
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const scheduled = []
  globalThis.setTimeout = function (fn, ms) {
    scheduled.push({ fn: fn, ms: ms })
    return scheduled.length
  }
  globalThis.clearTimeout = function () {}
  try {
    const { cleanups } = renderPanel({
      session: BLANK,
      fetchSummary: function (options) {
        calls.push(options)
        return Promise.resolve(stale)
      },
      peekSummary: function () { return stale },
      t: function (key) { return key },
    })
    await flush()
    assert.equal(calls.length, 1)
    assert.equal(scheduled.length, 1, 'one retry scheduled for a stale response')
    assert.equal(scheduled[0].ms, STALE_RETRY_MS, 'the retry waits out the Host grace window')

    scheduled[0].fn()
    await flush()
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1], { refresh: true },
      'the correction is incremental; it must not force a full corpus re-read')
    for (const cleanup of cleanups) cleanup()
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})

test('unmount clears a pending stale retry', async function () {
  const stale = sampleSummary({ stale: true })
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const cleared = []
  globalThis.setTimeout = function () { return 7 }
  globalThis.clearTimeout = function (handle) { cleared.push(handle) }
  try {
    const { cleanups } = renderPanel({
      session: BLANK,
      fetchSummary: function () { return Promise.resolve(stale) },
      peekSummary: function () { return stale },
      t: function (key) { return key },
    })
    await flush()
    // Simulate the unmount: every effect's cleanup runs, exactly as React would
    // do it. The fetch effect is the one that must cancel the pending retry.
    assert.ok(cleanups.length >= 1)
    for (const cleanup of cleanups) cleanup()
    assert.deepEqual(cleared, [7], 'the pending correction is cancelled with the panel')
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})
