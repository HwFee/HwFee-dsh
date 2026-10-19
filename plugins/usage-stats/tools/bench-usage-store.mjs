/**
 * Timing harness for the usage store's three cache layers. Dev-only (not
 * shipped: package.json `files` excludes `tools/`).
 *
 *   node tools/bench-usage-store.mjs
 *
 * Measures, against the real `~/.dsh/sessions`:
 *   - corpus size and the largest logs;
 *   - COLD (no caches): what the first panel open pays after a fresh install;
 *   - WARM: the same store on later opens;
 *   - FORCED: `?refresh=1`;
 *   - RESTART: a new store process reusing the persisted per-file cache (what
 *     every DSH restart pays now);
 *   - HOT TAIL: one small append to the biggest log inside the grace window;
 *   - per-file read + decompress cost, worst first.
 *
 * Read-only against the real log root; the hot-tail simulation works on a copy
 * under the OS temp directory.
 */

import {
  appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import { HOT_GRACE_MS, SESSIONS_ROOT, createUsageStore } from '../lib/usage-store.js'

const now = () => process.hrtime.bigint()
const ms = (from) => Number(process.hrtime.bigint() - from) / 1e6
const fmt = (value) => value.toFixed(1).padStart(8) + ' ms'

function walkZstd(root) {
  const out = []
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.zstd')) out.push(full)
    }
  }
  walk(root)
  return out
}

/** A store whose reads/decompressions are timed and attributed per file. */
function instrumentedStore(options) {
  const files = new Map()
  let current = null
  const readFile = (file) => {
    const started = now()
    const buffer = readFileSync(file)
    const elapsed = ms(started)
    const entry = files.get(file) || { reads: 0, readMs: 0, decompressMs: 0, bytes: 0 }
    entry.reads += 1
    entry.readMs += elapsed
    entry.bytes += buffer.length
    files.set(file, entry)
    current = file
    return buffer
  }
  const decompress = (buffer) => {
    const started = now()
    const output = zlib.zstdDecompressSync(buffer)
    const elapsed = ms(started)
    if (current !== null) {
      const entry = files.get(current)
      if (entry) entry.decompressMs += elapsed
    }
    return output
  }
  return { store: createUsageStore(Object.assign({ readFile, decompress }, options)), files }
}

function reset(files) {
  for (const entry of files.values()) {
    entry.reads = 0
    entry.readMs = 0
    entry.decompressMs = 0
    entry.bytes = 0
  }
}

function totalReads(files) {
  let reads = 0
  for (const entry of files.values()) reads += entry.reads
  return reads
}

async function timed(store, options) {
  const started = now()
  const summary = await store.aggregate(options)
  return { summary, elapsed: ms(started) }
}

async function main() {
  const allFiles = walkZstd(SESSIONS_ROOT)
  let totalBytes = 0
  const sized = []
  for (const file of allFiles) {
    try {
      const info = statSync(file)
      totalBytes += info.size
      sized.push({ file, size: info.size })
    } catch { /* vanished */ }
  }
  sized.sort((left, right) => right.size - left.size)

  console.log('================= corpus =================')
  console.log('  root               ' + SESSIONS_ROOT)
  console.log('  files              ' + sized.length)
  console.log('  compressed total   ' + (totalBytes / 1024 / 1024).toFixed(1) + ' MB')
  console.log('  largest            ' + (sized[0] ? (sized[0].size / 1024 / 1024).toFixed(2) + ' MB' : 'n/a'))

  // ---- cold: no persisted cache, empty memory cache ---------------------
  const coldStore = instrumentedStore({ cacheFile: null })
  const cold = await timed(coldStore.store)
  const coldReads = totalReads(coldStore.files)
  console.log('\n================= caches =================')
  console.log('  cold (no cache)    ' + fmt(cold.elapsed) + '   reads=' + coldReads)

  // ---- warm: same store, nothing changed --------------------------------
  const warmTimes = []
  for (let i = 0; i < 3; i += 1) {
    reset(coldStore.files)
    const warm = await timed(coldStore.store)
    warmTimes.push(warm.elapsed)
    console.log('  warm #' + (i + 1) + '             '
      + fmt(warm.elapsed) + '   reads=' + totalReads(coldStore.files))
  }

  // ---- forced: ?refresh=1 ----------------------------------------------
  reset(coldStore.files)
  const forced = await timed(coldStore.store, { force: true })
  console.log('  forced             ' + fmt(forced.elapsed) + '   reads=' + totalReads(coldStore.files))

  // ---- restart: persisted per-file cache -------------------------------
  const restartTimes = []
  const restartReads = []
  const cacheDirectory = mkdtempSync(path.join(os.tmpdir(), 'dsh-usage-bench-cache-'))
  const cacheFile = path.join(cacheDirectory, 'parse-cache.json')
  try {
    const first = instrumentedStore({ cacheFile })
    const firstPass = await timed(first.store)
    console.log('  first run (cold)   ' + fmt(firstPass.elapsed) + '   reads=' + totalReads(first.files)
      + '   -> writes the per-file cache')
    for (let i = 0; i < 3; i += 1) {
      const restarted = instrumentedStore({ cacheFile })
      const pass = await timed(restarted.store)
      restartTimes.push(pass.elapsed)
      restartReads.push(totalReads(restarted.files))
      console.log('  restart #' + (i + 1) + '         ' + fmt(pass.elapsed)
        + '   reads=' + totalReads(restarted.files) + '   sessions=' + pass.summary.sessions)
    }
  } finally {
    rmSync(cacheDirectory, { recursive: true, force: true })
  }

  // ---- hot tail: one append to the biggest log -------------------------
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dsh-usage-bench-hot-'))
  try {
    const biggest = sized[0]
    if (biggest === undefined) {
      console.log('\n  (no log files to simulate a hot append)')
    } else {
      const copied = path.join(tempRoot, 'workspace', 'session-big', 'session.v4.jsonl.zstd')
      mkdirSync(path.dirname(copied), { recursive: true })
      copyFileSync(biggest.file, copied)

      let clock = Date.now()
      const hot = instrumentedStore({ cacheFile: null, now: () => clock, root: tempRoot })
      const first = await timed(hot.store)
      reset(hot.files)
      appendFileSync(copied, zlib.zstdCompressSync(Buffer.from(
        '{"type":"assistant/message","time":1,"data":{"usage":{"totalTokens":1}}}\n')))
      const hotTail = await timed(hot.store)
      const hotReads = totalReads(hot.files)
      reset(hot.files)
      clock += HOT_GRACE_MS + 1000
      const settled = await timed(hot.store)
      console.log('\n================= active session (largest log copy) =================')
      console.log('  file size          ' + (biggest.size / 1024 / 1024).toFixed(2) + ' MB compressed')
      console.log('  cold parse         ' + fmt(first.elapsed) + '   reads=' + 1)
      console.log('  small append, hot  ' + fmt(hotTail.elapsed) + '   reads=' + hotReads
        + '   stale=' + String(hotTail.summary.stale === true))
      console.log('  once it settles    ' + fmt(settled.elapsed) + '   reads=' + totalReads(hot.files)
        + '   (the one exact re-read)')
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }

  // ---- startup warm-up: per-turn block profile -------------------------
  const prewarmRoot = mkdtempSync(path.join(os.tmpdir(), 'dsh-usage-bench-prewarm-'))
  try {
    const biggest = sized[0]
    if (biggest !== undefined) {
      const copied = path.join(prewarmRoot, 'workspace', 'session-big', 'session.v4.jsonl.zstd')
      mkdirSync(path.dirname(copied), { recursive: true })
      copyFileSync(biggest.file, copied)
      const prewarmCache = path.join(prewarmRoot, 'parse-cache.json')

      // Seed the persisted cache with the original file, then append more than
      // the hot-tail cap: the background warm-up now has a real re-read of the
      // largest log to do — the ~350 ms case startup must not block on.
      const seeder = instrumentedStore({ root: prewarmRoot, cacheFile: prewarmCache })
      await timed(seeder.store)
      appendFileSync(copied, zlib.zstdCompressSync(Buffer.from(JSON.stringify({
        type: 'assistant/message',
        time: 1,
        data: { usage: { totalTokens: 1 }, filler: randomBytes(400 * 1024).toString('base64') },
      }) + '\n')))

      const warmStore = instrumentedStore({ root: prewarmRoot, cacheFile: prewarmCache })
      const lags = []
      let last = process.hrtime.bigint()
      const probe = setInterval(function () {
        const tick = process.hrtime.bigint()
        lags.push(Number(tick - last) / 1e6 - 10)
        last = tick
      }, 10)
      const started = now()
      const warmSummary = await warmStore.store.aggregate({ background: true })
      const warmElapsed = ms(started)
      clearInterval(probe)
      const turns = lags.slice(1)
      const maxLag = turns.length === 0 ? 0 : Math.max.apply(null, turns)
      const meanLag = turns.length === 0 ? 0 : turns.reduce(function (sum, value) { return sum + value }, 0) / turns.length
      console.log('\n================= startup warm-up (background) =================')
      console.log('  file size          ' + (biggest.size / 1024 / 1024).toFixed(2) + ' MB + a >256 KB append')
      console.log('  warm-up total      ' + fmt(warmElapsed) + '   reads=' + totalReads(warmStore.files)
        + '   sessions=' + warmSummary.sessions)
      console.log('  longest block      ' + fmt(maxLag) + '   (one 350 ms turn would be the old behaviour)')
      console.log('  turns sampled      ' + turns.length + '   mean lag ' + fmt(meanLag))
    }
  } finally {
    rmSync(prewarmRoot, { recursive: true, force: true })
  }

  // ---- per-file cold cost ----------------------------------------------
  console.log('\n================= per-file cost (cold pass, worst 8) =================')
  const perFile = [...coldStore.files.entries()]
    .map(([file, entry]) => ({ file, ...entry }))
    .sort((left, right) => (right.readMs + right.decompressMs) - (left.readMs + left.decompressMs))
  console.log('  ' + 'MB'.padStart(6) + '  ' + 'read'.padStart(9) + '  ' + 'decompress'.padStart(11) + '  file')
  for (const row of perFile.slice(0, 8)) {
    console.log('  ' + (row.bytes / 1024 / 1024).toFixed(2).padStart(6)
      + '  ' + row.readMs.toFixed(1).padStart(7) + 'ms'
      + '  ' + row.decompressMs.toFixed(1).padStart(9) + 'ms'
      + '  ' + path.relative(SESSIONS_ROOT, row.file))
  }

  console.log('\n================= verdict input =================')
  console.log('  first ever open (cold)         ' + fmt(cold.elapsed))
  console.log('  open after a DSH restart       ' + fmt(Math.min(...restartTimes)) + ' … '
    + fmt(Math.max(...restartTimes)) + '   reads=' + restartReads.join('/'))
  console.log('  later open (warm)              ' + fmt(Math.min(...warmTimes)) + ' … ' + fmt(Math.max(...warmTimes)))
  console.log('  forced refresh                 ' + fmt(forced.elapsed))
}

await main()
