/**
 * The on-disk form of the usage store's per-file parse cache.
 *
 * WHY IT EXISTS. Decompression dominates the first panel open after a restart:
 * the corpus is ~128 logs / ~49 MB compressed and the store's parse is one
 * zstd frame at a time (the host writes one frame per record), which costs
 * seconds. That cost is only paid again because the per-file cache lives in
 * process memory and dies with the Host. Persisting the small per-file
 * COUNTERS (not the logs, a few hundred bytes each) lets a restarted Host
 * rebuild the map with one stat pass instead of re-decoding every frame.
 *
 * CORRECTNESS. Nothing here is an authority: an entry is only usable when the
 * file's `(mtimeMs, size)` still matches, exactly like the in-memory cache, so
 * a finished session is never stale. A missing, corrupt, unreadable or
 * version-mismatched file is ignored wholesale — the cache can always be
 * rebuilt from the logs.
 *
 * The file lives under the OS temp directory, keyed by the log root, so it
 * never touches the DSH profile or the session logs and is not part of any
 * task storage.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

/** Bump when the parse/stats shape changes; old files are then ignored. */
export const CACHE_VERSION = 1

/**
 * Where the cache file lives, in preference order.
 *
 * WHY NOT `os.tmpdir()` ALONE. The OS temp directory was the first choice — it
 * keeps the DSH profile and the session logs untouched — but on Windows the
 * temp directory is exactly what Disk Cleanup and "Storage Sense" delete, and
 * some cleaners run on a schedule. Losing it is not a correctness problem (the
 * cache rebuilds from the logs) but it silently costs the user the ~2.4 s cold
 * parse *again*, which reads as "the speed-up stopped working". So the cache
 * now prefers the application's own data directory, which is as durable as the
 * rest of the app's state, and keeps the temp directory only as a fallback for
 * a composition without one.
 *
 * The DSH data root is discovered, never assumed: `DSH_HOME` when the Host sets
 * it, else `~/.dsh`. Both are where the session logs live, so a machine that
 * can read logs can also write next to them.
 */
function dataRoot() {
  const configured = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  if (configured !== '') return configured
  return path.join(os.homedir(), '.dsh')
}

/**
 * The cache file for one log root (hashed so two roots cannot collide).
 *
 * `preferTemp` exists for the tests and for a composition where the data root
 * is read-only: the caller can ask for the temp location explicitly instead of
 * discovering the failure on the first write.
 */
export function parseCacheFile(root, options) {
  const key = crypto.createHash('sha1').update(String(root)).digest('hex').slice(0, 12)
  const name = 'parse-cache-' + key + '.json'
  const useTemp = options !== null && typeof options === 'object' && options.preferTemp === true
  const base = useTemp ? path.join(os.tmpdir(), 'dsh-usage-stats') : path.join(dataRoot(), 'cache', 'usage-stats')
  return path.join(base, name)
}

/**
 * The temp-directory fallback for the same root. Used only when the primary
 * location cannot be written (a read-only data root), so a hostile filesystem
 * still degrades to "slow every restart" rather than "no cache at all".
 */
export function parseCacheFileFallback(root) {
  return parseCacheFile(root, { preferTemp: true })
}

/** True when a previous run left a cache behind (used to decide the prewarm). */
export function hasParseCache(file) {
  try {
    return typeof file === 'string' && file !== '' && existsSync(file)
  } catch {
    return false
  }
}

/** A stats value that can be merged without poisoning every total downstream. */
function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * Validate and normalise one persisted stats entry. The cache lives in a shared
 * temp directory, so a hand-edited or half-written file must degrade to "read
 * the log again", never to string-concatenated totals.
 */
function sanitizeStats(raw) {
  if (raw === null) return null
  if (raw === undefined || typeof raw !== 'object') return null
  if (typeof raw.hasUserMessage !== 'boolean') return null
  if (!finiteNonNegative(raw.messages) || !finiteNonNegative(raw.totalTokens)) return null
  if (raw.perDay === null || typeof raw.perDay !== 'object') return null
  if (!Array.isArray(raw.perHour) || raw.perHour.length !== 24) return null
  if (raw.perModel === null || typeof raw.perModel !== 'object') return null

  const perDay = {}
  for (const [day, count] of Object.entries(raw.perDay)) {
    if (finiteNonNegative(count)) perDay[day] = count
  }
  const perHour = raw.perHour.map(function (value) {
    return finiteNonNegative(value) ? value : 0
  })
  const perModel = {}
  for (const [model, entry] of Object.entries(raw.perModel)) {
    if (entry === null || typeof entry !== 'object') continue
    if (!finiteNonNegative(entry.tokens) || !finiteNonNegative(entry.messages)) continue
    perModel[model] = { tokens: entry.tokens, messages: entry.messages }
  }
  return {
    hasUserMessage: raw.hasUserMessage,
    messages: raw.messages,
    totalTokens: raw.totalTokens,
    perDay: perDay,
    perHour: perHour,
    perModel: perModel,
  }
}

/**
 * Read the cache. Returns a `Map<path, { mtimeMs, size, stats }>` — an empty
 * map (not an error) whenever anything is missing or unusable.
 */
export function loadParseCache(file) {
  const files = new Map()
  if (typeof file !== 'string' || file === '') return files
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return files
  }
  if (parsed === null || typeof parsed !== 'object') return files
  if (parsed.version !== CACHE_VERSION) return files
  if (parsed.files === null || typeof parsed.files !== 'object') return files
  for (const [sessionFile, entry] of Object.entries(parsed.files)) {
    if (entry === null || typeof entry !== 'object') continue
    if (typeof entry.mtimeMs !== 'number' || typeof entry.size !== 'number') continue
    const stats = sanitizeStats(entry.stats)
    // `null` means "this file was unreadable when cached" — still cached against
    // its exact (mtime, size) so a locked file is not read on every request.
    if (entry.stats !== null && stats === null) continue
    files.set(sessionFile, { mtimeMs: entry.mtimeMs, size: entry.size, stats })
  }
  return files
}

/**
 * Persist the cache atomically (temp file + rename), silently ignoring any
 * failure: a read-only temp directory must never break the panel.
 */
export function saveParseCache(file, cache) {
  if (typeof file !== 'string' || file === '') return false
  const payload = { version: CACHE_VERSION, savedAt: Date.now(), files: {} }
  for (const [sessionFile, entry] of cache.entries()) {
    if (entry === null || typeof entry !== 'object') continue
    payload.files[sessionFile] = { mtimeMs: entry.mtimeMs, size: entry.size, stats: entry.stats }
  }
  let text
  try {
    text = JSON.stringify(payload)
  } catch {
    return false
  }
  const directory = path.dirname(file)
  const temporary = file + '.' + String(process.pid) + '.tmp'
  try {
    mkdirSync(directory, { recursive: true })
    writeFileSync(temporary, text)
    renameSync(temporary, file)
    return true
  } catch {
    return false
  }
}
