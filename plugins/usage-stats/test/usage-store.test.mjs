/**
 * Host-half tests for dsh-usage-stats.
 *
 * Every fixture is a synthetic multi-frame zstd log, built exactly the way the
 * host writes one: one compressed frame per record, concatenated. That shape is
 * the whole reason the store splits on the frame magic, so a fixture written as
 * a single frame would test the one thing the store must NOT do.
 *
 *   node test/usage-store.test.mjs
 */

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import {
  DEFAULT_CACHE_FILE,
  DEFAULT_LEDGER_FILE,
  FALLBACK_CACHE_FILE,
  FALLBACK_LEDGER_FILE,
  HOT_GRACE_MS,
  HOT_TAIL_BYTES,
  SESSIONS_ROOT,
  WALK_TTL_MS,
  aggregateUsage,
  createUsageStore,
  hasPersistedUsageCache,
  sessionKeyOf,
} from '../lib/usage-store.js'
import { CACHE_VERSION } from '../lib/usage-cache.js'
import { LEDGER_VERSION } from '../lib/usage-ledger.js'
import { createUsageRoute, USAGE_PATH, MARKER_HEADER, MARKER_VALUE, refuseRequest } from '../lib/usage-route.js'
import { apply, name } from '../lib/index.js'

let passed = 0
const failures = []

async function test(label, fn) {
  try {
    await fn()
    passed += 1
    process.stdout.write(`  ok   ${label}\n`)
  } catch (error) {
    failures.push({ label, error })
    process.stdout.write(`  FAIL ${label}\n         ${error.message}\n`)
  }
}

/** The frame magic the store splits on. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Local wall-clock times, so the expected day/hour buckets hold in any time zone. */
const at = (day, hour, minute) => new Date(2026, 4, day, hour, minute).getTime()

function frameOf(record) {
  return zlib.zstdCompressSync(Buffer.from(`${JSON.stringify(record)}\n`, 'utf8'))
}

function record(type, seq, time, data) {
  return { type, seq, time, data }
}

/** One frame per record, concatenated — the host's own layout. */
function writeSession(file, frames) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, Buffer.concat(frames))
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dsh-usage-stats-'))
const sessionOne = path.join(tempRoot, 'workspace-a', 'session-one', 'session.v4.jsonl.zstd')
const sessionTwo = path.join(tempRoot, 'workspace-b', 'session-two', 'session.v4.jsonl.zstd')

/** A frame that is not zstd at all: a torn append, or the magic appearing inside another frame's payload. */
const junkFrame = () => Buffer.concat([ZSTD_MAGIC, Buffer.from('this is not a zstd frame')])

writeSession(sessionOne, [
  frameOf(record('session', 0, at(1, 8, 0), {})),
  frameOf(record('user/message', 1, at(1, 9, 15), {})),
  frameOf(record('request/header', 2, at(1, 9, 15), { header: { config: { model: 'model-a' } } })),
  frameOf(record('assistant/message', 3, at(1, 9, 16), { usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, cacheReadTokens: 7 } })),
  frameOf(record('assistant/message', 4, at(1, 9, 45), { usage: { inputTokens: 10, outputTokens: 20 } })),
  zlib.zstdCompressSync(Buffer.from('{"type":"assistant/message",\n', 'utf8')),
  frameOf(record('user/message', 5, at(1, 23, 59), {})),
  frameOf(record('model/selection', 6, at(1, 23, 59), { provider: 'magpie', model: 'model-b' })),
  frameOf(record('assistant/message', 7, at(2, 2, 5), { usage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 } })),
  junkFrame(),
  frameOf(record('assistant/message', 8, at(2, 2, 6), { usage: { totalTokens: 1000 } })),
  frameOf(record('user/message', 9, 'not-a-timestamp', {})),
])

// Seed-shaped log: no user/message, so every byte of it must be ignored — its
// assistant record is deliberately enormous so a leak into the totals is loud.
writeSession(sessionTwo, [
  frameOf(record('session', 0, at(1, 8, 0), {})),
  frameOf(record('assistant/message', 1, at(1, 10, 0), { usage: { totalTokens: 999999 } })),
])

try {
  process.stdout.write('lib/usage-store.js — session log aggregation\n')

  await test('the default log root is the contracted sessions directory', () => {
    assert.equal(SESSIONS_ROOT, path.join(os.homedir(), '.dsh', 'sessions'))
  })

  await test('aggregates messages, tokens, days, hours and models across concatenated frames', async () => {
    const summary = await createUsageStore({ root: tempRoot }).aggregate()

    assert.equal(typeof summary.generatedAt, 'number')
    assert.equal(summary.sessions, 1, 'only the log with a user/message is a session')
    assert.equal(summary.messages, 7, '3 user + 4 assistant records')
    assert.equal(summary.totalTokens, 1185, '150 + (10+20) + 5 + 1000')
    assert.equal(summary.activeDays, 2)
    assert.equal(summary.peakHour, 9, 'three messages at 09:00 beats two at 02:00')

    assert.deepEqual(summary.perDay, { '2026-05-01': 4, '2026-05-02': 2 })
    const perHour = new Array(24).fill(0)
    perHour[2] = 2
    perHour[9] = 3
    perHour[23] = 1
    assert.deepEqual(summary.perHour, perHour)

    assert.deepEqual(summary.perModel, {
      'model-a': { tokens: 180, messages: 2 },
      'model-b': { tokens: 1005, messages: 2 },
    })
  })

  await test('a file without a user/message contributes nothing', async () => {
    const summary = await createUsageStore({ root: tempRoot }).aggregate()
    assert.equal(summary.sessions, 1)
    assert.equal(summary.totalTokens, 1185, 'the 999,999-token seed log is excluded')
    assert.equal(summary.perModel['model-a'].tokens, 180)
    assert.equal(summary.messages, 7)
  })

  await test('an unreadable frame and an unparseable line are skipped, not thrown', async () => {
    const summary = await createUsageStore({ root: tempRoot }).aggregate()
    // Frame 8 sits behind the junk frame; if the scanner failed to resync on the
    // next magic its 1000 tokens would be missing.
    assert.equal(summary.perModel['model-b'].tokens, 1005)
    assert.equal(summary.perDay['2026-05-02'], 2, 'the truncated JSON line is not a message')
  })

  await test('a warm cache does not re-read any file', async () => {
    let reads = 0
    const store = createUsageStore({
      root: tempRoot,
      readFile: (file) => {
        reads += 1
        return readFileSync(file)
      },
    })

    const first = await store.aggregate()
    assert.equal(reads, 2, 'both session files read once')
    const afterFirst = reads

    const second = await store.aggregate()
    assert.equal(reads, afterFirst, 'a fully cached pass reads nothing')
    assert.deepEqual({ ...second, generatedAt: 0 }, { ...first, generatedAt: 0 }, 'and returns identical numbers')
  })

  await test('force drops the whole cache and re-reads', async () => {
    let reads = 0
    const store = createUsageStore({
      root: tempRoot,
      readFile: (file) => {
        reads += 1
        return readFileSync(file)
      },
    })

    await store.aggregate()
    const afterFirst = reads
    await store.aggregate({ force: true })
    assert.equal(reads, afterFirst + 2, 'force re-reads every file')
  })

  await test('a settled session that grew is re-read; the untouched one is not', async () => {
    let reads = 0
    let clock = Date.now()
    const store = createUsageStore({
      root: tempRoot,
      now: () => clock,
      readFile: (file) => {
        reads += 1
        return readFileSync(file)
      },
    })

    await store.aggregate()
    const afterFirst = reads

    // Appending is exactly what the host does when a session keeps going. Once
    // the write has SETTLED (past the hot-tail grace) the file must be re-read.
    appendFileSync(sessionOne, frameOf(record('assistant/message', 10, at(2, 2, 7), { usage: { totalTokens: 10 } })))
    clock += HOT_GRACE_MS + 1000

    const grown = await store.aggregate()
    assert.equal(reads, afterFirst + 1, 'only the appended file is re-read')
    assert.equal(grown.totalTokens, 1195, 'the new record is picked up')
    assert.equal(grown.stale, undefined, 'a settled read is not marked stale')
  })

  await test('a file still being written reuses its parse and marks the summary stale', async () => {
    // The active session's log grows every turn, but the panel only runs on a
    // blank session; if the last write is SECONDS old and only a small tail was
    // appended since the previous parse, re-decoding the whole file for it is
    // waste. The summary says so (`stale`), and the next settled pass is exact.
    let reads = 0
    let clock = Date.now()
    const store = createUsageStore({
      root: tempRoot,
      now: () => clock,
      readFile: (file) => {
        reads += 1
        return readFileSync(file)
      },
    })

    const before = await store.aggregate()
    const afterFirst = reads
    appendFileSync(sessionOne, frameOf(record('assistant/message', 11, at(2, 2, 8), { usage: { totalTokens: 7 } })))

    const hot = await store.aggregate()
    assert.equal(reads, afterFirst, 'a small tail within the grace window is not re-read')
    assert.equal(hot.totalTokens, before.totalTokens, 'the parse is the previous one')
    assert.equal(hot.stale, true, 'the client is told the numbers are transiently behind')

    // Once the writer settles, the same request path reads the file exactly.
    clock += HOT_GRACE_MS + 1000
    const settled = await store.aggregate()
    assert.equal(reads, afterFirst + 1)
    assert.equal(settled.totalTokens, before.totalTokens + 7)
    assert.equal(settled.stale, undefined)
  })

  await test('a large append inside the grace window is still re-read', async () => {
    // Reusing the parse here would hide a whole session of records, so the tail
    // cap wins over the recency rule.
    const bigRoot = path.join(tempRoot, 'big-tail')
    const bigFile = path.join(bigRoot, 'workspace', 'session-big', 'session.v4.jsonl.zstd')
    writeSession(bigFile, [frameOf(record('user/message', 0, at(1, 9, 0), {}))])
    let reads = 0
    const clock = Date.now()
    const store = createUsageStore({
      root: bigRoot,
      now: () => clock,
      readFile: (file) => {
        reads += 1
        return readFileSync(file)
      },
    })

    const before = await store.aggregate()
    assert.equal(before.totalTokens, 0)
    // A payload larger than the tail cap, appended while the file is still "hot".
    // Random bytes so zstd cannot compress the tail under the cap.
    const filler = randomBytes(HOT_TAIL_BYTES * 2).toString('base64')
    appendFileSync(bigFile, frameOf(record('assistant/message', 1, at(1, 9, 1), { usage: { totalTokens: 42 }, filler })))
    const after = await store.aggregate()
    assert.equal(reads, 2, 'a change bigger than the tail cap is always decoded')
    assert.equal(after.totalTokens, 42)
    assert.equal(after.stale, undefined, 'the result is exact, not stale')
  })

  await test('the directory walk is memoised briefly and force refreshes it', async () => {
    const walkRoot = path.join(tempRoot, 'walk-memo')
    const first = path.join(walkRoot, 'a', 'session.v4.jsonl.zstd')
    const second = path.join(walkRoot, 'b', 'session.v4.jsonl.zstd')
    writeSession(first, [frameOf(record('user/message', 0, at(3, 9, 0), {}))])
    let clock = Date.now()
    const store = createUsageStore({ root: walkRoot, now: () => clock, walkTtlMs: WALK_TTL_MS })

    const before = await store.aggregate()
    assert.equal(before.sessions, 1)

    // A brand-new session file inside the walk window is not noticed yet …
    writeSession(second, [frameOf(record('user/message', 0, at(3, 10, 0), {}))])
    const within = await store.aggregate()
    assert.equal(within.sessions, 1, 'the memoised walk is reused inside the TTL')

    // … but it is after the TTL or on a forced read.
    clock += WALK_TTL_MS + 1
    const after = await store.aggregate()
    assert.equal(after.sessions, 2, 'the walk reruns after the TTL')
  })

  await test('the background warm-up parses cooperatively and yields between batches', async () => {
    // The startup warm-up must not block one event-loop turn while it re-reads a
    // large log: it parses in frame batches and yields between them.
    const cooperativeRoot = path.join(tempRoot, 'cooperative')
    const file = path.join(cooperativeRoot, 'w', 'session-big', 'session.v4.jsonl.zstd')
    writeSession(file, [
      frameOf(record('user/message', 0, at(5, 9, 0), {})),
      frameOf(record('request/header', 1, at(5, 9, 1), { header: { config: { model: 'model-c' } } })),
      frameOf(record('assistant/message', 2, at(5, 9, 2), { usage: { totalTokens: 40 } })),
      frameOf(record('assistant/message', 3, at(5, 9, 3), { usage: { totalTokens: 2 } })),
    ])

    let yields = 0
    const store = createUsageStore({
      root: cooperativeRoot,
      framesPerYield: 1,
      yieldFn: () => { yields += 1; return Promise.resolve() },
    })
    const summary = await store.aggregate({ background: true })
    assert.equal(summary.sessions, 1)
    assert.equal(summary.totalTokens, 42)
    assert.ok(yields >= 3, 'the parser yielded between frame batches, got ' + yields)

    // And the cooperative result is identical to the synchronous parse.
    const synchronous = await createUsageStore({ root: cooperativeRoot }).aggregate()
    assert.deepEqual({ ...summary, generatedAt: 0 }, { ...synchronous, generatedAt: 0 })
  })

  await test('a request joins the in-flight warm-up instead of duplicating it', async () => {
    // A dedicated two-file root: the shared fixture root keeps growing as this
    // file's earlier tests add directories.
    const inflightRoot = path.join(tempRoot, 'inflight')
    writeSession(path.join(inflightRoot, 'a', 'session.v4.jsonl.zstd'),
      [frameOf(record('user/message', 0, at(6, 9, 0), {}))])
    writeSession(path.join(inflightRoot, 'b', 'session.v4.jsonl.zstd'),
      [frameOf(record('user/message', 0, at(6, 10, 0), {}))])
    let reads = 0
    const store = createUsageStore({
      root: inflightRoot,
      framesPerYield: 1,
      yieldFn: () => new Promise((resolve) => setImmediate(resolve)),
      readFile: (file) => { reads += 1; return readFileSync(file) },
    })

    const warm = store.aggregate({ background: true })
    const request = store.aggregate()
    assert.equal(request, warm, 'the request shares the warm-up promise')
    const [warmSummary, requestSummary] = await Promise.all([warm, request])
    assert.equal(requestSummary, warmSummary, 'and receives the same summary object')
    assert.equal(reads, 2, 'the corpus was read once, not twice')
  })

  await test('a forced read waits for the in-flight pass and then truly re-reads', async () => {
    const inflightRoot = path.join(tempRoot, 'inflight')
    let reads = 0
    const store = createUsageStore({
      root: inflightRoot,
      framesPerYield: 1,
      yieldFn: () => new Promise((resolve) => setImmediate(resolve)),
      readFile: (file) => { reads += 1; return readFileSync(file) },
    })

    const warm = store.aggregate({ background: true })
    const forced = store.aggregate({ force: true })
    assert.notEqual(forced, warm, 'force never reuses the in-flight summary')
    await Promise.all([warm, forced])
    assert.equal(reads, 4, 'two files for the warm-up plus two for the true re-read')
  })

  await test('an absent zstd binding reports an error instead of throwing', async () => {
    const summary = await createUsageStore({ root: tempRoot, decompress: null }).aggregate()
    assert.match(summary.error, /zstdDecompressSync/)
    assert.equal(summary.sessions, 0)
    assert.equal(summary.totalTokens, 0)
    assert.deepEqual(summary.perDay, {})
    assert.equal(summary.perHour.length, 24)
  })

  await test('a missing log root yields an empty summary, not an exception', async () => {
    const summary = await createUsageStore({ root: path.join(tempRoot, 'does-not-exist') }).aggregate()
    assert.equal(summary.error, undefined)
    assert.equal(summary.sessions, 0)
    assert.equal(summary.activeDays, 0)
    assert.equal(summary.peakHour, 0)
    assert.deepEqual(summary.perModel, {})
  })

  await test('the module-level aggregateUsage runs against the real root', async () => {
    const summary = await aggregateUsage()
    assert.equal(typeof summary.generatedAt, 'number')
    assert.ok(Number.isInteger(summary.sessions) && summary.sessions >= 0)
    assert.ok(summary.totalTokens >= 0)
  })

  // ------------------------------------------------------ persisted cache

  process.stdout.write('\nlib/usage-cache.js — the persisted per-file cache\n')

  const cacheRoot = path.join(tempRoot, 'cache-root')
  const cacheA = path.join(cacheRoot, 'w', 'session-a', 'session.v4.jsonl.zstd')
  writeSession(cacheA, [
    frameOf(record('user/message', 0, at(4, 9, 0), {})),
    frameOf(record('assistant/message', 1, at(4, 9, 1), { usage: { totalTokens: 25 } })),
  ])
  const cacheFile = path.join(tempRoot, 'parse-cache.json')

  await test('the first aggregate writes a per-file cache', async () => {
    const store = createUsageStore({ root: cacheRoot, cacheFile })
    const summary = await store.aggregate()
    assert.equal(summary.totalTokens, 25)
    assert.equal(existsSync(cacheFile), true, 'the cache file is written')
    const doc = JSON.parse(readFileSync(cacheFile, 'utf8'))
    assert.equal(doc.version, CACHE_VERSION)
    assert.equal(Object.keys(doc.files).length, 1)
    assert.equal(doc.files[cacheA].stats.totalTokens, 25)
  })

  await test('a restarted store rebuilds from the cache without reading a log', async () => {
    let reads = 0
    const restarted = createUsageStore({
      root: cacheRoot,
      cacheFile,
      readFile: (file) => { reads += 1; return readFileSync(file) },
    })
    const summary = await restarted.aggregate()
    assert.equal(reads, 0, 'no log is decompressed after a restart')
    assert.equal(summary.sessions, 1)
    assert.equal(summary.totalTokens, 25)
  })

  await test('a changed file is re-read and the cache is refreshed', async () => {
    let reads = 0
    let clock = Date.now()
    const store = createUsageStore({
      root: cacheRoot,
      cacheFile,
      now: () => clock,
      readFile: (file) => { reads += 1; return readFileSync(file) },
    })
    assert.equal((await store.aggregate()).totalTokens, 25, 'warm from disk')
    assert.equal(reads, 0)

    appendFileSync(cacheA, frameOf(record('assistant/message', 2, at(4, 9, 2), { usage: { totalTokens: 5 } })))
    clock += HOT_GRACE_MS + 1000

    const grown = await store.aggregate()
    assert.equal(reads, 1)
    assert.equal(grown.totalTokens, 30)
    // The refreshed entry survives a restart too.
    const restarted = createUsageStore({ root: cacheRoot, cacheFile })
    assert.equal((await restarted.aggregate()).totalTokens, 30)
  })

  await test('a corrupt or outdated cache is ignored, not fatal', async () => {
    writeFileSync(cacheFile, '{not json')
    let reads = 0
    const corrupt = createUsageStore({
      root: cacheRoot,
      cacheFile,
      readFile: (file) => { reads += 1; return readFileSync(file) },
    })
    const summary = await corrupt.aggregate()
    assert.equal(summary.totalTokens, 30)
    assert.equal(reads, 1, 'a corrupt cache falls back to a real read')

    writeFileSync(cacheFile, JSON.stringify({
      version: CACHE_VERSION + 1,
      files: { [cacheA]: { mtimeMs: 0, size: 0, stats: null } },
    }))
    let rereads = 0
    const outdated = createUsageStore({
      root: cacheRoot,
      cacheFile,
      readFile: (file) => { rereads += 1; return readFileSync(file) },
    })
    assert.equal((await outdated.aggregate()).totalTokens, 30)
    assert.equal(rereads, 1, 'a version mismatch is ignored')

    // A structurally valid file carrying poisoned counts is rejected per entry:
    // merging a string count would turn every later total into concatenation.
    const info = statSync(cacheA)
    writeFileSync(cacheFile, JSON.stringify({
      version: CACHE_VERSION,
      files: {
        [cacheA]: {
          mtimeMs: info.mtimeMs,
          size: info.size,
          stats: {
            hasUserMessage: true,
            messages: 'many',
            totalTokens: 30,
            perDay: {},
            perHour: new Array(24).fill(0),
            perModel: {},
          },
        },
      },
    }))
    let poisonedReads = 0
    const poisoned = createUsageStore({
      root: cacheRoot,
      cacheFile,
      readFile: (file) => { poisonedReads += 1; return readFileSync(file) },
    })
    const repaired = await poisoned.aggregate()
    assert.equal(poisonedReads, 1, 'a poisoned entry is discarded and the log re-read')
    assert.equal(repaired.totalTokens, 30)
    assert.equal(typeof repaired.messages, 'number')
  })

  await test('a deleted session is pruned from the cache but kept in the ledger', async () => {
    const deletedDirectory = path.join(cacheRoot, 'w', 'session-gone')
    const deleted = path.join(deletedDirectory, 'session.v4.jsonl.zstd')
    writeSession(deleted, [
      frameOf(record('user/message', 0, at(4, 10, 0), {})),
      frameOf(record('assistant/message', 1, at(4, 10, 1), { usage: { totalTokens: 40 } })),
    ])
    const ledger = path.join(tempRoot, 'ledger-prune.json')
    const store = createUsageStore({ root: cacheRoot, cacheFile, ledgerFile: ledger })
    assert.equal((await store.aggregate()).sessions, 2)

    rmSync(deletedDirectory, { recursive: true, force: true })
    const after = await store.aggregate()
    assert.equal(after.sessions, 2, 'the deleted session still counts')
    assert.equal(after.totalTokens, 70, '30 (still on disk) + 40 (deleted)')
    const doc = JSON.parse(readFileSync(cacheFile, 'utf8'))
    assert.equal(Object.keys(doc.files).some((file) => file === deleted), false, 'the parse cache still prunes the deleted file')
    assert.equal(Object.keys(doc.files).length, 1)
    const ledgerDoc = JSON.parse(readFileSync(ledger, 'utf8'))
    assert.equal(ledgerDoc.sessions['gone'].totalTokens, 40, 'the row is keyed by session id, not by path')
  })

  await test('force re-reads everything even with a persisted cache', async () => {
    let reads = 0
    const store = createUsageStore({
      root: cacheRoot,
      cacheFile,
      readFile: (file) => { reads += 1; return readFileSync(file) },
    })
    await store.aggregate()
    assert.equal(reads, 0)
    await store.aggregate({ force: true })
    assert.equal(reads, 1, 'force ignores the persisted entry')
  })

  await test('the default cache file and prewarm probe are stable', function () {
    // The cache deliberately does NOT live in the OS temp directory any more:
    // Windows Disk Cleanup and Storage Sense delete that on a schedule, which
    // silently threw the fast path away and made the panel slow again with no
    // visible cause. It sits under the DSH data root (the same tree as the
    // session logs) so it is as durable as the rest of the app's state.
    assert.match(DEFAULT_CACHE_FILE, /[\\/]cache[\\/]usage-stats[\\/]parse-cache-[0-9a-f]+\.json$/)
    assert.ok(DEFAULT_CACHE_FILE.indexOf(os.tmpdir()) !== 0,
      'the primary cache must not live under the OS temp directory')
    // The temp location survives only as the fallback for a read-only data root.
    assert.match(FALLBACK_CACHE_FILE, /dsh-usage-stats[\\/]parse-cache-[0-9a-f]+\.json$/)
    assert.ok(FALLBACK_CACHE_FILE.indexOf(os.tmpdir()) === 0,
      'the fallback is the OS temp directory')
    assert.notEqual(DEFAULT_CACHE_FILE, FALLBACK_CACHE_FILE)
    assert.equal(typeof hasPersistedUsageCache(), 'boolean')

    // The ledger is the durable half and lives beside the cache, so Windows
    // cleanup cannot take the record of already-deleted sessions with it.
    assert.match(DEFAULT_LEDGER_FILE, /[\\/]cache[\\/]usage-stats[\\/]ledger-[0-9a-f]+\.json$/)
    assert.ok(DEFAULT_LEDGER_FILE.indexOf(os.tmpdir()) !== 0,
      'the ledger must not live under the OS temp directory')
    assert.match(FALLBACK_LEDGER_FILE, /dsh-usage-stats[\\/]ledger-[0-9a-f]+\.json$/)
    assert.notEqual(DEFAULT_LEDGER_FILE, DEFAULT_CACHE_FILE)
    assert.notEqual(DEFAULT_LEDGER_FILE, FALLBACK_LEDGER_FILE)
  })

  // ------------------------------------------------------- lifetime ledger

  process.stdout.write('\nlib/usage-ledger.js — the append-only lifetime ledger\n')

  const ledgerRoot = path.join(tempRoot, 'ledger-root')
  const ledgerFile = path.join(tempRoot, 'ledger-restart.json')
  const keptFile = path.join(ledgerRoot, 'w', 'session-keep', 'session.v4.jsonl.zstd')
  const goneFile = path.join(ledgerRoot, 'w', 'session-gone-two', 'session.v4.jsonl.zstd')
  writeSession(keptFile, [
    frameOf(record('user/message', 0, at(6, 9, 0), {})),
    frameOf(record('assistant/message', 1, at(6, 9, 1), { usage: { totalTokens: 10 } })),
  ])
  writeSession(goneFile, [
    frameOf(record('user/message', 0, at(7, 9, 0), {})),
    frameOf(record('assistant/message', 1, at(7, 9, 1), { usage: { totalTokens: 90 } })),
  ])

  await test('session identity is the directory name without the host prefix', async () => {
    assert.equal(sessionKeyOf(keptFile), 'keep')
    assert.equal(sessionKeyOf('/x/w/0d1e737b-a511-4d34-869d-e85450541134/session.v4.jsonl.zstd'),
      '0d1e737b-a511-4d34-869d-e85450541134', 'an older bare-uuid directory is the same identity')
    assert.equal(sessionKeyOf('/x/w/session-u/session.v4.jsonl.zstd'), 'u')
  })

  await test('a deleted session survives a restart through the ledger', async () => {
    const first = await createUsageStore({ root: ledgerRoot, ledgerFile }).aggregate()
    assert.equal(first.sessions, 2)
    assert.equal(first.totalTokens, 100)

    rmSync(path.dirname(goneFile), { recursive: true, force: true })

    // A restarted store has no parse cache here, so the surviving log is read
    // again; the deleted one must arrive from the ledger alone.
    let reads = 0
    const restarted = createUsageStore({
      root: ledgerRoot,
      ledgerFile,
      readFile: (file) => { reads += 1; return readFileSync(file) },
    })
    const after = await restarted.aggregate()
    assert.equal(reads, 1, 'only the log still on disk is decoded')
    assert.equal(after.sessions, 2, 'the deleted session is still a session')
    assert.equal(after.totalTokens, 100, 'its tokens are still counted')
    assert.equal(after.perDay['2026-05-07'], 2, 'its day bucket is kept')
  })

  await test('a growing session replaces its row instead of being counted twice', async () => {
    let clock = Date.now()
    const store = createUsageStore({ root: ledgerRoot, ledgerFile, now: () => clock })
    assert.equal((await store.aggregate()).totalTokens, 100)

    appendFileSync(keptFile, frameOf(record('assistant/message', 2, at(6, 9, 2), { usage: { totalTokens: 5 } })))
    clock += HOT_GRACE_MS + 1000

    const grown = await store.aggregate()
    assert.equal(grown.totalTokens, 105, '10 becomes 15, not 10 + 15')
    assert.equal(grown.sessions, 2)
    const doc = JSON.parse(readFileSync(ledgerFile, 'utf8'))
    assert.equal(doc.sessions.keep.totalTokens, 15)
  })

  await test('force re-reads the logs but never resets the ledger', async () => {
    const store = createUsageStore({ root: ledgerRoot, ledgerFile })
    const forced = await store.aggregate({ force: true })
    assert.equal(forced.sessions, 2, 'the deleted session is still there after a full re-read')
    assert.equal(forced.totalTokens, 105)
  })

  await test('a corrupt or poisoned ledger is ignored, not fatal', async () => {
    writeFileSync(ledgerFile, '{not json')
    const corrupt = await createUsageStore({ root: ledgerRoot, ledgerFile }).aggregate()
    assert.equal(corrupt.totalTokens, 15, 'rebuilt from the file still on disk')
    assert.equal(corrupt.sessions, 1)

    // A structurally valid row with a string count must be dropped, not merged:
    // concatenating it would turn every later total into a string.
    writeFileSync(ledgerFile, JSON.stringify({
      version: LEDGER_VERSION,
      sessions: {
        keep: { hasUserMessage: true, messages: 'many', totalTokens: 15, perDay: {}, perHour: new Array(24).fill(0), perModel: {} },
      },
    }))
    const poisoned = await createUsageStore({ root: ledgerRoot, ledgerFile }).aggregate()
    assert.equal(poisoned.totalTokens, 15)
    assert.equal(typeof poisoned.messages, 'number')

    // An older version is ignored wholesale, so a shape change cannot be
    // half-read into a total.
    writeFileSync(ledgerFile, JSON.stringify({ version: LEDGER_VERSION + 1, sessions: {} }))
    const outdated = await createUsageStore({ root: ledgerRoot, ledgerFile }).aggregate()
    assert.equal(outdated.totalTokens, 15)
  })

  // ------------------------------------------------------------- usage route

  process.stdout.write('\nlib/usage-route.js — the summary route with an injected aggregator\n')

  const sample = {
    generatedAt: 1,
    sessions: 2,
    messages: 3,
    totalTokens: 4,
    activeDays: 5,
    peakHour: 6,
    perDay: { '2026-05-01': 3 },
    perHour: new Array(24).fill(0),
    perModel: { 'model-a': { tokens: 4, messages: 3 } },
  }

  /** The listener's own origin, as the fence's reference authority. */
  const ORIGIN = 'http://127.0.0.1:55904'

  /**
   * A request as the plugin's own client sends it: same-origin, with the
   * marker header. Tests that are not about the fence use this so they exercise
   * the real path rather than a half-formed request.
   */
  function legitRequest(url = USAGE_PATH, extra = {}) {
    return {
      method: 'GET',
      url,
      headers: Object.assign({
        host: '127.0.0.1:55904',
        'sec-fetch-site': 'same-origin',
        [MARKER_HEADER]: MARKER_VALUE,
      }, extra),
    }
  }

  function judge(mutate) {
    const request = legitRequest()
    if (typeof mutate === 'function') mutate(request)
    return refuseRequest(request, ORIGIN)
  }

  // ---------------------------------------------------------- the request fence

  await test('the fence admits the real client request', async () => {
    assert.equal(refuseRequest(legitRequest(), ORIGIN), null, 'the plugin\'s own fetch must pass')
    assert.equal(judge((r) => { r.headers['sec-fetch-site'] = 'none' }), null, 'a typed URL is ours too')
    assert.equal(refuseRequest(legitRequest(USAGE_PATH, { host: 'localhost:55904' }), ORIGIN), null,
      'localhost and 127.0.0.1 are the same loopback peer')
  })

  await test('a request without the marker is refused', async () => {
    assert.equal(judge((r) => { delete r.headers[MARKER_HEADER] }), 'missing-marker')
    assert.equal(judge((r) => { r.headers[MARKER_HEADER] = '' }), 'missing-marker')
    assert.equal(judge((r) => { r.headers[MARKER_HEADER] = 'true' }), 'missing-marker')
    assert.equal(judge((r) => { r.headers[MARKER_HEADER] = ['1', '2'] }), 'missing-marker',
      'a repeated header is not a single marker')
  })

  await test('a foreign Host is refused (DNS rebinding)', async () => {
    assert.equal(judge((r) => { r.headers.host = 'evil.example:55904' }), 'foreign-host')
    assert.equal(judge((r) => { r.headers.host = '127.0.0.1:1234' }), 'foreign-host',
      'a different loopback port is still a different authority')
    assert.equal(judge((r) => { delete r.headers.host }), 'no-host')
    assert.equal(judge((r) => { r.headers.host = ':::' }), 'bad-host')
  })

  await test('a cross-site request is refused', async () => {
    assert.equal(judge((r) => { r.headers['sec-fetch-site'] = 'cross-site' }), 'cross-site')
    assert.equal(judge((r) => { r.headers['sec-fetch-site'] = 'same-site' }), 'cross-site')
  })

  await test('a foreign Origin is refused', async () => {
    assert.equal(judge((r) => { r.headers.origin = 'http://evil.example' }), 'foreign-origin')
    assert.equal(judge((r) => { r.headers.origin = 'http://127.0.0.1:1234' }), 'foreign-origin',
      'a different port is a different origin')
    assert.equal(judge((r) => { r.headers.origin = 'http://127.0.0.1:55904' }), null,
      'our own origin passes')
    // The comparison is on AUTHORITY, not scheme — deliberately, and identical to
    // the validated `system-fonts` fence. A mismatched scheme means the page was
    // served over a different protocol than the listener; the browser already
    // blocks that read as mixed content / cross-origin, and adding a scheme check
    // here would break a reverse-proxied deployment that terminates TLS upstream.
    assert.equal(judge((r) => { r.headers.origin = 'https://127.0.0.1:55904' }), null,
      'scheme is not part of the authority comparison (documented limitation)')
  })

  await test('with no known listener origin the fence fails closed', async () => {
    assert.equal(refuseRequest(legitRequest(), null), null, 'loopback Host still passes')
    const remote = legitRequest(USAGE_PATH, { host: '10.0.0.5:55904' })
    assert.equal(refuseRequest(remote, null), 'foreign-host',
      'an unknown origin must not become an open door for a routable Host')
  })

  await test('a refused request does NO work — the aggregator is never called', async () => {
    let calls = 0
    const route = createUsageRoute(async () => { calls += 1; return sample }, { origin: () => ORIGIN })

    const noMarker = mockResponse()
    await route.handler({ method: 'GET', url: USAGE_PATH, headers: { host: '127.0.0.1:55904' } }, noMarker)
    assert.equal(noMarker.out.status, 403)
    assert.equal(JSON.parse(noMarker.out.body).reason, 'missing-marker')

    const crossSite = mockResponse()
    await route.handler(legitRequest(USAGE_PATH, { 'sec-fetch-site': 'cross-site' }), crossSite)
    assert.equal(crossSite.out.status, 403)

    // The one that has teeth: a cross-site ?refresh=1 must not drop the cache.
    const forced = mockResponse()
    await route.handler({
      method: 'GET',
      url: `${USAGE_PATH}?refresh=1`,
      headers: { host: 'evil.example:55904', 'sec-fetch-site': 'cross-site' },
    }, forced)
    assert.equal(forced.out.status, 403)
    assert.equal(calls, 0, 'no enumeration, no parse, no cache invalidation for a refused request')
  })

  await test('a deterministic summary is served verbatim', async () => {
    const route = createUsageRoute(async () => sample, { origin: () => ORIGIN })
    assert.equal(route.kind, 'exact')
    assert.equal(route.path, USAGE_PATH)
    assert.equal(route.path, '/dsh-usage-stats/summary')

    const response = mockResponse()
    await route.handler(legitRequest(), response)
    assert.equal(response.out.status, 200)
    assert.equal(response.out.headers['content-type'], 'application/json; charset=utf-8')
    assert.equal(response.out.headers['cache-control'], 'no-store')
    assert.equal(response.out.headers['content-length'], Buffer.byteLength(response.out.body))
    assert.deepEqual(JSON.parse(response.out.body), sample)
  })

  await test('?refresh=1 is forwarded as force=true', async () => {
    const seen = []
    const route = createUsageRoute(async (options) => {
      seen.push(options)
      return sample
    }, { origin: () => ORIGIN })
    await route.handler(legitRequest(), mockResponse())
    await route.handler(legitRequest(`${USAGE_PATH}?refresh=1`), mockResponse())
    await route.handler(legitRequest('::::not a url'), mockResponse())
    assert.deepEqual(seen, [{ force: false }, { force: true }, { force: false }])
  })

  await test('a non-GET method is refused with 405', async () => {
    const route = createUsageRoute(async () => sample, { origin: () => ORIGIN })
    const response = mockResponse()
    await route.handler({ method: 'POST', url: USAGE_PATH }, response)
    assert.equal(response.out.status, 405)
    assert.equal(response.out.headers.allow, 'GET')
  })

  await test('an aggregator failure becomes a 500 that still carries the summary shape', async () => {
    const route = createUsageRoute(async () => { throw new Error('log root unreadable') },
      { origin: () => ORIGIN })
    const response = mockResponse()
    await route.handler(legitRequest(), response)
    assert.equal(response.out.status, 500)
    const body = JSON.parse(response.out.body)
    assert.equal(body.error, 'log root unreadable')
    assert.equal(body.sessions, 0)
    assert.equal(body.perHour.length, 24)
  })

  // -------------------------------------------------------------- host entry

  process.stdout.write('\nlib/index.js — host plugin\n')

  await test('exports the plugin name the bundle declares', () => {
    assert.equal(name, 'dsh-usage-stats')
  })

  await test('mounts one exact route inside an effect after webServer arrives', () => {
    const { ctx, routes, effects, injected } = mockContext()
    // `prewarm: false` keeps the test independent of whatever cache this machine
    // happens to have left in the OS temp directory.
    apply(ctx, { prewarm: false })
    assert.deepEqual(injected, [['webServer']], 'injects exactly the webServer service')
    assert.equal(routes.length, 1)
    assert.equal(routes[0].kind, 'exact')
    assert.equal(routes[0].path, USAGE_PATH)
    assert.equal(effects.length, 1, 'registered through ctx.effect')
    assert.match(effects[0].label, /dsh-usage-stats/)
  })

  await test('disposing the effect unregisters the route', async () => {
    const { ctx, effects, routes } = mockContext()
    apply(ctx, { prewarm: false })
    await effects[0].dispose()
    assert.equal(routes[0].disposed, true)
  })

  await test('a composition without a web server is not an error', () => {
    const { ctx, routes } = mockContext({ withWebServer: false })
    assert.doesNotThrow(() => apply(ctx, { prewarm: false }))
    assert.equal(routes.length, 0)
  })

  await test('a webServer without register() degrades instead of throwing', () => {
    const warnings = []
    const original = console.warn
    console.warn = (message) => warnings.push(String(message))
    try {
      const ctx = { inject: (services, callback) => callback({ webServer: {}, effect: () => {} }) }
      assert.doesNotThrow(() => apply(ctx, { prewarm: false }))
    } finally {
      console.warn = original
    }
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /exposes no register/)
  })
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`)
if (failures.length > 0) {
  for (const failure of failures) process.stdout.write(`\n--- ${failure.label} ---\n${failure.error.stack}\n`)
  process.exit(1)
}

// ------------------------------------------------------------------- helpers

/** A cordis host context reduced to what this plugin touches. */
function mockContext({ withWebServer = true } = {}) {
  const routes = []
  const effects = []
  const injected = []
  const webServer = {
    register(route) {
      routes.push(route)
      return () => { route.disposed = true }
    },
  }
  const ctx = {
    inject(services, callback) {
      injected.push(services)
      if (withWebServer && services.includes('webServer')) {
        // `ctx.effect(fn)` RUNS fn at once and takes its return value as the
        // disposer — that is how the host mounts its own style tags and how this
        // plugin mounts its route. A mock that only stored fn would report "no
        // route" for a correct plugin.
        const effect = (fn, label) => {
          const dispose = fn()
          effects.push({ fn, label, dispose })
          return dispose
        }
        callback({ webServer, effect })
      }
    },
  }
  return { ctx, routes, effects, injected }
}

/** A response stand-in that records what the handler wrote. */
function mockResponse() {
  const out = { status: 0, headers: null, body: '' }
  return {
    out,
    writeHead(status, headers) { out.status = status; out.headers = headers },
    end(text) { out.body = text ?? '' },
  }
}
