/**
 * Number formatting for the context rail.
 *
 * Pure functions, no DOM, no React: the panel's numbers are asserted in
 * `test/format.test.mjs` without rendering anything.
 *
 * UNIT CONVENTION. The rail shows one kind of number — token counts — at a
 * different scale from the host's own composer meter only in that it never
 * prints a raw count above 999. Three significant digits, one decimal below
 * 100, so a 26% reading next to `256.3k` and a window of `1M` line up on the
 * same baseline.
 */

/**
 * Compact a token count: 950 → `950`, 12 345 → `12.3k`, 1 048 576 → `1M`.
 * @param {number} value - non-negative token count.
 * @returns {string} compact text, `—` for a value that is not a finite number.
 */
export function formatTokens(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—'
  const scaled = (candidate) => (candidate >= 100
    ? String(Math.round(candidate))
    : String(Math.round(candidate * 10) / 10))
  if (value < 1000) return String(Math.round(value))
  if (value < 1e6) return scaled(value / 1e3) + 'k'
  return scaled(value / 1e6) + 'M'
}

/**
 * Occupancy of the context window.
 *
 * Mirrors the host's own `contextOccupancy`: the projected total wins over the
 * last measured pressure, and nothing is shown until both the numerator and
 * the window are known. The percent is clamped to 100 so an over-window turn
 * cannot draw a bar past its track.
 *
 * @param {{ pressureTokens?: number, projectedTokens?: number, contextWindow?: number }} pressure
 * @returns {{ percent: number, usedTokens: number, contextWindow: number, freeTokens: number } | null}
 */
export function occupancy(pressure) {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  const contextWindow = pressure?.contextWindow
  if (typeof usedTokens !== 'number' || typeof contextWindow !== 'number' || contextWindow <= 0) {
    return null
  }
  return {
    percent: Math.max(0, Math.min(100, Math.round((usedTokens / contextWindow) * 100))),
    usedTokens,
    contextWindow,
    freeTokens: Math.max(0, contextWindow - usedTokens),
  }
}

/**
 * The three measured bands of the context breakdown.
 *
 * `contextBreakdown` arrives as three independent token counts. The rail draws
 * them as a stacked bar over the *window* (not over their own sum), so the
 * empty part of the track is literally the free space the model still has —
 * the same reading as the host's composer popover.
 *
 * @param {{ systemTokens: number, toolsTokens: number, messageTokens: number } | undefined} breakdown
 * @param {{ contextWindow: number } | null} context
 * @returns {Array<{ key: string, tokens: number, percent: number }>}
 */
export function breakdownBands(breakdown, context) {
  if (!breakdown || !context || context.contextWindow <= 0) return []
  const rows = [
    { key: 'system', tokens: breakdown.systemTokens },
    { key: 'tools', tokens: breakdown.toolsTokens },
    { key: 'messages', tokens: breakdown.messageTokens },
  ]
  return rows
    .filter((row) => typeof row.tokens === 'number' && row.tokens > 0)
    .map((row) => ({
      key: row.key,
      tokens: row.tokens,
      percent: Math.min(100, (row.tokens / context.contextWindow) * 100),
    }))
}

/**
 * Total tokens a session has billed, and the split the rail prints.
 * @param {{ uncachedInputTokens?: number, outputTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number } | undefined} usage
 * @returns {{ total: number, rows: Array<{ key: string, tokens: number }> } | null}
 */
export function usageTotals(usage) {
  if (!usage) return null
  const rows = [
    { key: 'input', tokens: usage.uncachedInputTokens },
    { key: 'output', tokens: usage.outputTokens },
    { key: 'cacheRead', tokens: usage.cacheReadTokens },
    { key: 'cacheWrite', tokens: usage.cacheWriteTokens },
  ].filter((row) => typeof row.tokens === 'number' && row.tokens >= 0)
  const total = rows.reduce((sum, row) => sum + row.tokens, 0)
  return { total, rows }
}

/**
 * Last path segment of a working directory, for the Environment card's
 * one-line value. The full path stays available as the row's title.
 * @param {string | null | undefined} cwd
 * @returns {string}
 */
export function leafOf(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return '—'
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || cwd
}

/**
 * One percentage for a row's right column: whole numbers at or above ten, one
 * decimal below, matching the host's own compact percentage reading.
 * @param {number} value - percent in 0..100
 * @returns {string}
 */
export function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return String(Math.round(value * 10) / 10) + '%'
}
