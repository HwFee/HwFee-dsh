/**
 * Measured cost of the usage-stats panel's per-render arithmetic.
 *
 * WHY. `panel.js` calls `buildHeatmap()` on every render, and the panel
 * re-renders on every hover-tooltip state change (one `setTip` per heat cell
 * `mouseenter`). This script measures how expensive that is at realistic log
 * sizes so the audit can state a number instead of a suspicion.
 *
 *   node tools/bench-usage-heatmap.mjs
 */

import { performance } from 'node:perf_hooks'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const statsPath = join(root, 'plugins', 'usage-stats', 'client', 'src', 'stats.js')
const stats = await import(pathToFileURL(statsPath).href)

function median(samples) {
  const sorted = samples.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function time(fn, runs) {
  fn()
  const samples = []
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  return { median: median(samples), max: Math.max(...samples) }
}

/** A `perDay` map shaped like a real log: `days` consecutive busy days ending today. */
function makePerDay(days, busyEvery) {
  const perDay = {}
  const today = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86400000)
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0')
    perDay[key] = (i % busyEvery === 0) ? 20 + (i % 40) : 0
  }
  return perDay
}

const cases = [
  { label: 'fresh install (7 days)', perDay: makePerDay(7, 2) },
  { label: 'one month', perDay: makePerDay(30, 2) },
  { label: 'one year', perDay: makePerDay(365, 2) },
  { label: 'three years', perDay: makePerDay(1095, 2) },
]

console.log('== buildHeatmap(perDay, 0) — called on EVERY panel render ==')
console.log('case                     median       max        cells')
for (const item of cases) {
  const timing = time(function () { stats.buildHeatmap(item.perDay, 0) }, 60)
  const grid = stats.buildHeatmap(item.perDay, 0)
  const cells = grid.weeks.reduce((sum, week) => sum + week.length, 0)
  console.log(
    item.label.padEnd(24) +
    (timing.median.toFixed(3) + ' ms').padEnd(12) +
    (timing.max.toFixed(3) + ' ms').padEnd(11) +
    String(cells))
}

console.log('')
console.log('== what a hover costs ==')
console.log('Each heat cell has onMouseEnter -> setTip(...), which re-renders the')
console.log('whole Panel component. Every such render calls buildHeatmap() again and')
console.log('recreates one React element per cell. Moving the pointer across the grid')
console.log('fires one mouseenter per cell crossed.')
for (const item of cases) {
  const grid = stats.buildHeatmap(item.perDay, 0)
  const cells = grid.weeks.reduce((sum, week) => sum + week.length, 0)
  const timing = time(function () { stats.buildHeatmap(item.perDay, 0) }, 60)
  console.log(item.label.padEnd(24) + String(cells).padStart(4) + ' elements per hover-render, ' +
    timing.median.toFixed(3) + ' ms of grid arithmetic each')
}

console.log('')
console.log('== summarize() ==')
const summary = {
  sessions: 400, messages: 12000, totalTokens: 9_000_000,
  perDay: cases[2].perDay,
  perHour: new Array(24).fill(0).map((_, i) => (i * 7) % 30),
  perModel: { 'deepseek-v4.1-flash': { tokens: 5_000_000, messages: 4000 }, 'deepseek-v4-pro': { tokens: 4_000_000, messages: 3000 } },
}
for (const days of [0, 7, 30]) {
  const timing = time(function () { stats.summarize(summary, days) }, 200)
  console.log(('summarize(range=' + days + ')').padEnd(24) + timing.median.toFixed(4) + ' ms')
}
