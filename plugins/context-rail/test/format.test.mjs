import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  breakdownBands, formatPercent, formatTokens, leafOf, occupancy, usageTotals,
} from '../client/src/format.js'

test('formatTokens compacts at k and M', () => {
  assert.equal(formatTokens(0), '0')
  assert.equal(formatTokens(950), '950')
  assert.equal(formatTokens(1000), '1k')
  assert.equal(formatTokens(12345), '12.3k')
  assert.equal(formatTokens(123456), '123k')
  assert.equal(formatTokens(1_048_576), '1M')
  assert.equal(formatTokens(2_600_000), '2.6M')
})

test('formatTokens refuses a negative or non-finite value', () => {
  assert.equal(formatTokens(-1), '—')
  assert.equal(formatTokens(Number.NaN), '—')
  assert.equal(formatTokens(undefined), '—')
})

test('occupancy prefers the projected total and clamps at 100', () => {
  assert.deepEqual(occupancy({ pressureTokens: 100, projectedTokens: 200, contextWindow: 1000 }), {
    percent: 20, usedTokens: 200, contextWindow: 1000, freeTokens: 800,
  })
  assert.equal(occupancy({ pressureTokens: 100, contextWindow: 1000 }).percent, 10)
  assert.equal(occupancy({ projectedTokens: 2000, contextWindow: 1000 }).percent, 100)
  assert.equal(occupancy({ projectedTokens: 2000, contextWindow: 1000 }).freeTokens, 0)
})

test('occupancy is null until both sides are known', () => {
  assert.equal(occupancy(undefined), null)
  assert.equal(occupancy({ projectedTokens: 10 }), null)
  assert.equal(occupancy({ contextWindow: 1000 }), null)
  assert.equal(occupancy({ projectedTokens: 10, contextWindow: 0 }), null)
})

test('breakdownBands draws against the window, not the sum', () => {
  const bands = breakdownBands({ systemTokens: 100, toolsTokens: 50, messageTokens: 250 }, { contextWindow: 1000 })
  assert.deepEqual(bands, [
    { key: 'system', tokens: 100, percent: 10 },
    { key: 'tools', tokens: 50, percent: 5 },
    { key: 'messages', tokens: 250, percent: 25 },
  ])
})

test('breakdownBands drops empty bands and refuses a missing window', () => {
  assert.deepEqual(breakdownBands({ systemTokens: 0, toolsTokens: 0, messageTokens: 0 }, { contextWindow: 1000 }), [])
  assert.deepEqual(breakdownBands(undefined, { contextWindow: 1000 }), [])
  assert.deepEqual(breakdownBands({ systemTokens: 1 }, null), [])
})

test('usageTotals sums the four counters', () => {
  const totals = usageTotals({ uncachedInputTokens: 1000, outputTokens: 2000, cacheReadTokens: 300, cacheWriteTokens: 20 })
  assert.equal(totals.total, 3320)
  assert.deepEqual(totals.rows.map((row) => row.key), ['input', 'output', 'cacheRead', 'cacheWrite'])
})

test('usageTotals is null without a projection', () => {
  assert.equal(usageTotals(undefined), null)
})

test('leafOf keeps the last path segment', () => {
  assert.equal(leafOf('/Users/shirazu/Documents/project/'), 'project')
  assert.equal(leafOf('C:\\Users\\me\\repo'), 'repo')
  assert.equal(leafOf(''), '—')
  assert.equal(leafOf(null), '—')
})

test('formatPercent keeps one decimal and drops a trailing zero', () => {
  assert.equal(formatPercent(20.97), '21%')
  assert.equal(formatPercent(18.44), '18.4%')
  assert.equal(formatPercent(0.9), '0.9%')
  assert.equal(formatPercent(75.07), '75.1%')
  assert.equal(formatPercent(100), '100%')
  assert.equal(formatPercent(Number.NaN), '—')
})
