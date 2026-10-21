/**
 * Session-log aggregation for dsh-usage-stats.
 *
 * The host writes one `.dsh/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd`
 * per session, and that file is a CONCATENATION of independent zstd frames — the
 * writer appends one compressed frame per record. `zstdDecompressSync` decodes
 * only the FIRST frame of such a buffer and silently ignores the rest, so the
 * file is split on the frame magic `28 B5 2F FD` and every slice is decoded on
 * its own. Decoding the whole buffer in one call would under-count nearly every
 * real session.
 *
 * Only files holding at least one `user/message` are counted: a session
 * directory created and never used keeps a seed log (session / permission /
 * sandbox records only) and must not inflate the session count.
 *
 * The parse is cached per `(path, mtimeMs, size)`. The panel renders on every
 * blank session, and re-reading tens of megabytes of logs on each render is the
 * difference between an instant card and a visible stall. Two further layers sit
 * on top of that map:
 *
 *   - the counters are PERSISTED (see usage-cache.js), keyed the same way, so a
 *     restarted Host rebuilds the table from one stat pass instead of paying the
 *     decompression again;
 *   - a file that is STILL BEING WRITTEN (mtime within `graceMs`) is allowed to
 *     reuse its previous parse for a small appended tail (`tailBytes`), and the
 *     summary is marked `stale` so the client knows to correct itself. A file
 *     that grew by more than the tail cap is always re-read — that is a whole
 *     session of new records, not a torn last frame.
 *
 * THE SUMMARY IS NOT "WHAT IS ON DISK". It is the union of the lifetime ledger
 * (usage-ledger.js): one row per session, replaced when that session grows and
 * NEVER removed when its log is deleted. Archiving leaves the log in place, so
 * an archived session keeps being counted either way; deleting removes the log,
 * and only the ledger remembers it. `?refresh=1` (force) still re-reads every
 * log and clears the parse cache — the ledger is not a cache and survives it.
 * Deleting `ledger-<hash>.json` is the explicit reset.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import {
  CACHE_VERSION,
  hasParseCache, ledgerFile, loadParseCache, parseCacheFile, parseCacheFileFallback, saveParseCache,
} from './usage-cache.js'
import { loadLedger, saveLedger } from './usage-ledger.js'

/** zstd frame magic; every concatenated frame starts with it. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Contract-fixed log root. Exported so the route layer and tests can name it. */
export const SESSIONS_ROOT = path.join(os.homedir(), '.dsh', 'sessions')

/** The prefix the host puts on a session directory (`session-<uuid>`). */
const SESSION_DIR_PREFIX = 'session-'

/**
 * The durable identity of one session: its directory name with the host's
 * `session-` prefix removed.
 *
 * Keyed by the SESSION, not the file path, because the ledger must survive the
 * log disappearing — and because current directory names are `session-<uuid>`
 * while older ones are the bare uuid, and both spellings are the same session.
 *
 * One session directory holds one `session.v4.jsonl.zstd` (the host's layout), so
 * the directory name is a sufficient key. A second log file in the same
 * directory would share the row and the later parse would win; that is the one
 * shape this key cannot represent.
 */
export function sessionKeyOf(file) {
  const text = typeof file === 'string' ? file : ''
  const directory = path.basename(path.dirname(text))
  if (directory === '' || directory === '.' || directory === path.sep) return text
  return directory.startsWith(SESSION_DIR_PREFIX) ? directory.slice(SESSION_DIR_PREFIX.length) : directory
}

/**
 * Resolved once at import: Node 22.15+ and 24 ship zstd, and the package
 * engines admit `^22.19.0 || >=24.0.0`, so in practice it is always present.
 * Pinning the function here turns "absent binding" into one stable, reportable
 * condition instead of a fresh property lookup on every frame.
 */
const ZSTD_DECOMPRESS = typeof zlib.zstdDecompressSync === 'function' ? zlib.zstdDecompressSync.bind(zlib) : null

/**
 * The documented empty `Summary`; also the shape the route serves when a read
 * fails, so a client can render zeroes instead of having to special-case it.
 */
export function emptyUsageSummary() {
  return {
    generatedAt: Date.now(),
    sessions: 0,
    messages: 0,
    totalTokens: 0,
    activeDays: 0,
    peakHour: 0,
    perDay: {},
    perHour: new Array(24).fill(0),
    perModel: {},
  }
}

/** Local-time `YYYY-MM-DD`: the contract fixes the day boundary to the user's clock. */
function localDayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Token fields arrive from the writer, but a truncated or older record can omit
 * or null them, and a single NaN would poison every total downstream. Anything
 * that is not a positive finite number counts as zero.
 */
function tokenCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Add one message record to the day and hour buckets; a record without a usable timestamp is counted nowhere. */
function bucketByTime(stats, time) {
  if (typeof time !== 'number' || !Number.isFinite(time)) return
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return
  const key = localDayKey(date)
  stats.perDay[key] = (stats.perDay[key] ?? 0) + 1
  stats.perHour[date.getHours()] += 1
}

/** The zeroed counters for one session file. */
function emptyFileStats() {
  return {
    hasUserMessage: false,
    messages: 0,
    totalTokens: 0,
    perDay: {},
    perHour: new Array(24).fill(0),
    perModel: {},
  }
}

/** Byte offsets of every zstd frame in a concatenated file (the file is one frame per record). */
function frameOffsets(buffer) {
  const offsets = []
  let at = buffer.indexOf(ZSTD_MAGIC)
  while (at !== -1) {
    offsets.push(at)
    at = buffer.indexOf(ZSTD_MAGIC, at + ZSTD_MAGIC.length)
  }
  return offsets
}

/**
 * Decode one frame slice into lines; null when the slice is undecodable.
 *
 * A slice can fail for two reasons that both deserve the same answer: a torn
 * tail (the host is mid-append) and a record whose compressed payload happens to
 * contain the magic bytes, which splits one real frame into two undecodable
 * halves. Either way the rest of the file is still readable, so a bad slice is
 * dropped rather than failing the whole session.
 */
function frameLines(buffer, start, end, decompress) {
  let text
  try {
    text = decompress(buffer.subarray(start, end)).toString('utf8')
  } catch {
    return null
  }
  const lines = []
  for (const line of text.split('\n')) {
    if (line.trim() !== '') lines.push(line)
  }
  return lines
}

/**
 * Fold one JSON line into the counters.
 *
 * Model attribution is positional: a message belongs to whichever model the file
 * had selected at that point, which is why records are walked in file order.
 */
function applyRecord(stats, line, state) {
  let record
  try {
    record = JSON.parse(line)
  } catch {
    return
  }
  if (record === null || typeof record !== 'object') return

  const data = record.data
  if (record.type === 'request/header') {
    const model = data?.header?.config?.model
    if (typeof model === 'string' && model !== '') state.currentModel = model
    return
  }
  if (record.type === 'model/selection') {
    const model = data?.model
    if (typeof model === 'string' && model !== '') state.currentModel = model
    return
  }
  if (record.type === 'user/message') {
    stats.hasUserMessage = true
    stats.messages += 1
    bucketByTime(stats, record.time)
    return
  }
  if (record.type !== 'assistant/message') return

  stats.messages += 1
  bucketByTime(stats, record.time)

  const usage = data?.usage
  // `totalTokens` is authoritative when present; older records carry only the
  // two halves, and a present zero must not fall back to them.
  const total = usage !== null && typeof usage === 'object'
    ? (usage.totalTokens === undefined || usage.totalTokens === null
        ? tokenCount(usage.inputTokens) + tokenCount(usage.outputTokens)
        : tokenCount(usage.totalTokens))
    : 0
  stats.totalTokens += total

  // An assistant message before any model record has no model to attribute to;
  // its tokens still count toward the total, they just cannot appear in the
  // per-model list.
  if (state.currentModel !== null) {
    const entry = stats.perModel[state.currentModel]
      ?? (stats.perModel[state.currentModel] = { tokens: 0, messages: 0 })
    entry.tokens += total
    entry.messages += 1
  }
}

/**
 * Reduce one session file to small counters, so the cache holds a few hundred
 * bytes per session instead of the raw log.
 */
function summarizeFile(buffer, decompress) {
  const stats = emptyFileStats()
  const state = { currentModel: null }
  const offsets = frameOffsets(buffer)
  for (let index = 0; index < offsets.length; index += 1) {
    const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length
    const lines = frameLines(buffer, offsets[index], end, decompress)
    if (lines === null) continue
    for (const line of lines) applyRecord(stats, line, state)
  }
  return stats
}

/**
 * The same reduction, but cooperative: every `framesPerYield` frames it awaits
 * `yieldFn`, so a 7 MB log (thousands of frames) costs a few dozen short turns
 * instead of one long block. Only the startup warm-up uses this — a request
 * parses synchronously so it answers as soon as possible.
 */
async function summarizeFileCooperatively(buffer, decompress, framesPerYield, yieldFn) {
  const stats = emptyFileStats()
  const state = { currentModel: null }
  const offsets = frameOffsets(buffer)
  let sinceYield = 0
  for (let index = 0; index < offsets.length; index += 1) {
    const start = offsets[index]
    const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length
    const lines = frameLines(buffer, start, end, decompress)
    if (lines !== null) {
      for (const line of lines) applyRecord(stats, line, state)
    }
    sinceYield += 1
    if (sinceYield >= framesPerYield && index + 1 < offsets.length) {
      sinceYield = 0
      await yieldFn()
    }
  }
  return stats
}

/**
 * Recursively collect `*.zstd` under `root`.
 *
 * The walk is hand-rolled because a single unreadable directory (a lock, a
 * permission denial) must not abort the scan, and because symlinked
 * directories are skipped — following them risks a cycle that would hang the
 * request.
 */
function findSessionFiles(root) {
  const found = []
  const walk = (directory) => {
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.zstd')) found.push(full)
    }
  }
  walk(root)
  return found
}

/** Ties go to the earliest hour, so the peak card is stable across identical logs. */
function busiestHour(perHour) {
  let best = 0
  for (let hour = 1; hour < 24; hour += 1) {
    if (perHour[hour] > perHour[best]) best = hour
  }
  return best
}

/** Fold one file's counters into the running summary; a skipped or unreadable file contributes nothing. */
function mergeFileStats(summary, stats) {
  if (stats === null || !stats.hasUserMessage) return
  summary.sessions += 1
  summary.messages += stats.messages
  summary.totalTokens += stats.totalTokens

  for (const [day, count] of Object.entries(stats.perDay)) {
    summary.perDay[day] = (summary.perDay[day] ?? 0) + count
  }
  for (let hour = 0; hour < 24; hour += 1) {
    summary.perHour[hour] += stats.perHour[hour]
  }
  for (const [model, entry] of Object.entries(stats.perModel)) {
    const target = summary.perModel[model] ?? (summary.perModel[model] = { tokens: 0, messages: 0 })
    target.tokens += entry.tokens
    target.messages += entry.messages
  }
}

/**
 * How recently a changed file must have been written for its cached parse to be
 * reused as a "hot tail" instead of re-decoding the whole log.
 */
export const HOT_GRACE_MS = 3000

/**
 * The largest appended tail (compressed bytes) that may be treated as a torn
 * last write. Anything bigger is a real new session's worth of records and must
 * be parsed.
 */
export const HOT_TAIL_BYTES = 256 * 1024

/** How long the directory walk is reused before the `readdir`/`stat` pass reruns. */
export const WALK_TTL_MS = 1500

/**
 * Frames decoded between event-loop yields in the cooperative (background)
 * parser. Measured on the real corpus at ~0.07ms per frame, so 128 frames keeps
 * a turn at roughly ten milliseconds; the route's own parse is synchronous and
 * never yields.
 */
export const PREWARM_FRAMES_PER_YIELD = 128

/** Yield one macrotask so startup I/O and the first UI work can run. */
function yieldToEventLoop() {
  return new Promise(function (resolve) { setImmediate(resolve) })
}

/**
 * Build an independent aggregator over its own parse cache.
 *
 * The module-level `aggregateUsage` is one such store; the factory exists so a
 * caller (the test suite, or a host that keeps logs somewhere else) can supply
 * its own root and file reader without touching process-wide state.
 *
 * `aggregate()` is SINGLE-FLIGHT: while one pass is running (typically the
 * background startup warm-up), any other ordinary caller joins that same
 * promise instead of duplicating the whole corpus pass. A `force` caller waits
 * for the in-flight pass to finish and then runs its own true re-read, so it is
 * always the last word.
 *
 * @param options.readFile  file reader (tests inject one)
 * @param options.root      session root
 * @param options.decompress frame decoder (null simulates a runtime without zstd)
 * @param options.cacheFile persisted-cache path; null (the default for custom
 *        roots) keeps the store purely in memory — tests stay hermetic, and the
 *        module-level store passes a real path explicitly
 * @param options.ledgerFile lifetime-ledger path; null keeps it in memory. A
 *        custom root does not inherit the real ledger: two different corpora
 *        must never share rows.
 * @param options.ledgerFallbackFile temp-directory ledger location, used when
 *        the data root is read-only
 * @param options.now       clock, injected by tests for the hot-tail window
 * @param options.graceMs   hot-tail recency window
 * @param options.tailBytes hot-tail max appended size
 * @param options.walkTtlMs directory-walk reuse window
 * @param options.framesPerYield cooperative-parser batch size
 * @param options.yieldFn   cooperative-parser yield (tests count the yields)
 */
export function createUsageStore({
  readFile = readFileSync,
  root = SESSIONS_ROOT,
  decompress = ZSTD_DECOMPRESS,
  cacheFile = null,
  fallbackFile = null,
  ledgerFile = null,
  ledgerFallbackFile = null,
  now = Date.now,
  graceMs = HOT_GRACE_MS,
  tailBytes = HOT_TAIL_BYTES,
  walkTtlMs = WALK_TTL_MS,
  framesPerYield = PREWARM_FRAMES_PER_YIELD,
  yieldFn = yieldToEventLoop,
} = {}) {
  let cache = new Map()
  let diskLoaded = false
  let savedOnce = false
  let ledger = new Map()
  let ledgerLoaded = false
  let ledgerSavedOnce = false
  let walk = null
  let inflight = null

  /**
   * A changed file may reuse its previous parse only when it was written moments
   * ago AND grew by no more than a small tail. The cached entry keeps its OLD
   * `(mtimeMs, size)` so the next request after the grace window re-reads it —
   * the reuse can never be permanent.
   */
  function reusableHotTail(cached, stat) {
    const grown = stat.size - cached.size
    if (grown < 0 || grown > tailBytes) return false
    return (now() - stat.mtimeMs) <= graceMs
  }

  async function run({ force = false, background = false } = {}) {
    const summary = emptyUsageSummary()

    if (decompress === null) {
      summary.error = 'zlib.zstdDecompressSync is unavailable in this Node runtime (needs Node >= 22.15 or >= 24); session logs cannot be read'
      return summary
    }

    if (!diskLoaded) {
      cache = cacheFile === null ? new Map() : loadParseCache(cacheFile)
      diskLoaded = true
    }
    if (!ledgerLoaded) {
      ledger = ledgerFile === null ? new Map() : loadLedger(ledgerFile)
      ledgerLoaded = true
    }
    if (force) {
      // A true re-read: nothing cached in memory, nothing reused, walk fresh.
      // The ledger is deliberately NOT cleared — it is the record of sessions
      // whose logs may no longer exist, so nothing on disk could rebuild it.
      cache = new Map()
      walk = null
    }

    let files
    if (!force && walk !== null && now() - walk.at <= walkTtlMs) {
      files = walk.files
    } else {
      files = findSessionFiles(root)
      walk = { files, at: now() }
    }

    let stale = false
    let dirty = false
    let ledgerDirty = false

    // Rebuilt rather than mutated so entries for deleted session files fall out
    // of the CACHE on their own. The ledger is the opposite: a row is only ever
    // added or replaced, never dropped because its log is gone.
    const next = new Map()
    for (const file of files) {
      let stat
      try {
        stat = statSync(file)
      } catch {
        continue
      }

      const cached = cache.get(file)
      let stats
      let entry
      let fresh = false
      if (!force && cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        stats = cached.stats
        entry = cached
      } else if (!force && cached !== undefined && reusableHotTail(cached, stat)) {
        // Still being written: serve the previous parse for up to the grace
        // window, keep the OLD key so it is re-read once it settles, and tell
        // the client the numbers are transiently behind.
        stats = cached.stats
        entry = cached
        stale = true
      } else {
        try {
          const buffer = readFile(file)
          stats = background
            ? await summarizeFileCooperatively(buffer, decompress, Math.max(1, framesPerYield), yieldFn)
            : summarizeFile(buffer, decompress)
        } catch {
          // Cache the failure against this exact (path, mtime, size): a file
          // caught mid-write or locked would otherwise be re-read on every
          // request for as long as it stays broken.
          stats = null
        }
        entry = { mtimeMs: stat.mtimeMs, size: stat.size, stats }
        dirty = true
        fresh = true
      }

      next.set(file, entry)

      // A row REPLACES itself, so a growing session is never counted twice; a
      // failed re-read keeps whatever the row already earned because `stats` is
      // null and we skip it. On a cache hit the row is only filled in when it is
      // missing (a fresh ledger, or one written before this feature existed).
      if (stats !== null) {
        const key = sessionKeyOf(file)
        if (fresh || !ledger.has(key)) {
          ledger.set(key, stats)
          ledgerDirty = true
        }
      }
    }
    if (next.size !== cache.size) dirty = true
    cache = next

    // The summary is the ledger, not the file table: every session ever counted
    // keeps its place after the log is deleted.
    for (const stats of ledger.values()) mergeFileStats(summary, stats)

    if (stale) summary.stale = true

    summary.activeDays = Object.keys(summary.perDay).length
    summary.peakHour = busiestHour(summary.perHour)

    if (cacheFile !== null && (dirty || !savedOnce)) {
      // The primary location can be unwritable (a read-only DSH data root on a
      // managed machine). Falling back keeps the NEXT start fast instead of
      // silently degrading to a full parse every time; whichever path succeeded
      // is remembered so the load path reads the same file back.
      if (!saveParseCache(cacheFile, cache) && fallbackFile !== null) {
        if (saveParseCache(fallbackFile, cache)) cacheFile = fallbackFile
      }
      savedOnce = true
    }
    if (ledgerFile !== null && (ledgerDirty || !ledgerSavedOnce)) {
      // Same fallback discipline as the parse cache, for the same reason: a
      // read-only data root must not silently turn the lifetime record into a
      // per-process one. Here the file also carries rows that exist nowhere
      // else, so a failed write is the only way history can be lost.
      if (!saveLedger(ledgerFile, ledger) && ledgerFallbackFile !== null) {
        if (saveLedger(ledgerFallbackFile, ledger)) ledgerFile = ledgerFallbackFile
      }
      ledgerSavedOnce = true
    }
    return summary
  }

  function aggregate(options) {
    const request = options || {}
    if (request.force === true) {
      // A true re-read must be the last word: let an in-flight (warm-up) pass
      // finish first, then run with every cache bypassed.
      const settled = inflight === null
        ? Promise.resolve()
        : inflight.then(function () {}, function () {})
      return settled.then(function () { return run(request) })
    }
    if (inflight !== null) return inflight
    const job = run(request)
    const shared = job.then(function (summary) {
      if (inflight === shared) inflight = null
      return summary
    }, function (error) {
      if (inflight === shared) inflight = null
      throw error
    })
    inflight = shared
    return shared
  }

  return { aggregate }
}

/** The cache file the module-level store uses for the real log root. */
export const DEFAULT_CACHE_FILE = parseCacheFile(SESSIONS_ROOT)
/** The temp-directory fallback, used when the data root cannot be written. */
export const FALLBACK_CACHE_FILE = parseCacheFileFallback(SESSIONS_ROOT)
/** The lifetime ledger next to the cache; deleting it resets the totals. */
export const DEFAULT_LEDGER_FILE = ledgerFile(SESSIONS_ROOT)
/** The temp-directory ledger fallback, used only when the data root is unwritable. */
export const FALLBACK_LEDGER_FILE = ledgerFile(SESSIONS_ROOT, { preferTemp: true })

const defaultStore = createUsageStore({
  cacheFile: DEFAULT_CACHE_FILE,
  fallbackFile: FALLBACK_CACHE_FILE,
  ledgerFile: DEFAULT_LEDGER_FILE,
  ledgerFallbackFile: FALLBACK_LEDGER_FILE,
})

/**
 * True when a previous Host run left a parse cache behind. The plugin uses this
 * to decide whether a startup warm-up is cheap (cache present: a stat pass) or
 * would block the event loop on a first-ever full parse.
 */
export function hasPersistedUsageCache() {
  return hasParseCache(DEFAULT_CACHE_FILE)
}

/**
 * Aggregate the sessions under `~/.dsh/sessions`.
 *
 * Served with `force` from `?refresh=1`, which clears the parse cache so a
 * session that just ended shows up immediately.
 */
export async function aggregateUsage(options = {}) {
  return defaultStore.aggregate(options)
}
