/**
 * The lifetime ledger: one durable row per session, never pruned.
 *
 * WHY IT EXISTS. Until this file, the summary was a pure function of the files
 * currently under `~/.dsh/sessions`. Deleting a session therefore deleted its
 * contribution from the panel: the number of sessions, messages and tokens all
 * dropped, and a user who cleans up their history loses their history of usage.
 * The parse cache (usage-cache.js) could not help — it is keyed by file path and
 * deliberately rebuilt from the files present, so that "delete the log" also
 * means "stop paying to parse it".
 *
 * The two files now have two different jobs:
 *
 *   - `parse-cache-<hash>.json`  — an accelerator. Disposable, pruned, keyed by
 *     `(path, mtimeMs, size)`. Losing it costs time, never numbers.
 *   - `ledger-<hash>.json`       — the accumulated record. Append-only in the
 *     sense that matters: a row is REPLACED when its session grows, and is never
 *     removed just because the log disappeared. Losing it costs the deleted
 *     sessions' history, because nothing on disk can rebuild that.
 *
 * Deleting the ledger file is therefore the reset switch: the next run rebuilds
 * it from whatever logs are still on disk.
 *
 * ANONYMITY. A row is keyed by the session directory name (the host's UUID,
 * with its `session-` prefix stripped) and holds counters only — no prompt
 * text, no paths, no timestamps beyond the day/hour buckets the panel already
 * shows.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { sanitizeStats } from './usage-cache.js'

/** Bump when the row shape changes; an older file is then ignored wholesale. */
export const LEDGER_VERSION = 1

/**
 * Read the ledger. Returns `Map<sessionKey, stats>` — empty (not an error) when
 * the file is missing, unreadable, corrupt or from another version, because the
 * ledger can always be rebuilt from the logs that still exist.
 */
export function loadLedger(file) {
  const sessions = new Map()
  if (typeof file !== 'string' || file === '') return sessions
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return sessions
  }
  if (parsed === null || typeof parsed !== 'object') return sessions
  if (parsed.version !== LEDGER_VERSION) return sessions
  if (parsed.sessions === null || typeof parsed.sessions !== 'object') return sessions
  for (const [key, raw] of Object.entries(parsed.sessions)) {
    if (typeof key !== 'string' || key === '') continue
    const stats = sanitizeStats(raw)
    // A row that fails validation is dropped, not merged: a string count would
    // turn every later total into concatenation.
    if (stats === null) continue
    sessions.set(key, stats)
  }
  return sessions
}

/**
 * Persist the ledger atomically (temp file + rename). Returns false on any
 * failure — a read-only data root must degrade to "no lifetime history", never
 * to a broken panel.
 */
export function saveLedger(file, ledger) {
  if (typeof file !== 'string' || file === '') return false
  const payload = { version: LEDGER_VERSION, savedAt: Date.now(), sessions: {} }
  for (const [key, stats] of ledger) {
    if (stats === null || typeof stats !== 'object') continue
    payload.sessions[key] = stats
  }
  let text
  try {
    text = JSON.stringify(payload)
  } catch {
    return false
  }
  const temporary = file + '.' + String(process.pid) + '.tmp'
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(temporary, text)
    renameSync(temporary, file)
    return true
  } catch {
    return false
  }
}