import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  bandShares, formatPercent, formatTokens, leafOf, occupancy, usageTotals,
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

test('occupancy is the single authority for used, free and percent', () => {
  assert.deepEqual(occupancy({ pressureTokens: 100, projectedTokens: 200, contextWindow: 1000 }), {
    ratio: 0.2,
    percent: 20,
    freePercent: 80,
    usedTokens: 200,
    contextWindow: 1000,
    freeTokens: 800,
  })
  assert.equal(occupancy({ pressureTokens: 100, contextWindow: 1000 }).percent, 10)
  const full = occupancy({ projectedTokens: 2000, contextWindow: 1000 })
  assert.equal(full.percent, 100)
  assert.equal(full.ratio, 1)
  assert.equal(full.freePercent, 0)
  assert.equal(full.freeTokens, 0)
})

test('free tokens and free percent always describe the same remainder', () => {
  // Review case: 400 / 1000 with no breakdown used to print "used 40%" beside
  // "free 600, 100%", because the remainder came from the window while the
  // percentage came from the (empty) bands.
  const context = occupancy({ projectedTokens: 400, contextWindow: 1000 })
  assert.equal(context.freeTokens, 600)
  assert.equal(context.freePercent, 60)
  assert.deepEqual(bandShares(undefined, context), [])

  // And with a breakdown whose own sum differs from the pressure total, the
  // bands are scaled onto the same total instead of inventing a third reading.
  const bands = bandShares({ systemTokens: 20, toolsTokens: 50, messageTokens: 250 }, context)
  const bandTotal = bands.reduce((sum, band) => sum + band.percent, 0)
  assert.equal(Math.round(bandTotal * 10) / 10, 40)
  assert.equal(Math.round((bandTotal + context.freePercent) * 10) / 10, 100)
  assert.equal(context.freePercent, 60)
  assert.equal(Math.round((bandTotal + context.freePercent) * 10) / 10, 100)
})

test('the PR panel data reads 74.4%, not 75.1%', () => {
  const context = occupancy({ projectedTokens: 256_300, contextWindow: 1_000_000 })
  assert.equal(context.freePercent, 74.4)
  assert.equal(formatPercent(context.freePercent), '74.4%')
})

test('occupancy is null until both sides are known', () => {
  assert.equal(occupancy(undefined), null)
  assert.equal(occupancy({ projectedTokens: 10 }), null)
  assert.equal(occupancy({ contextWindow: 1000 }), null)
  assert.equal(occupancy({ projectedTokens: 10, contextWindow: 0 }), null)
})

test('bandShares allocates the occupancy across the breakdown, like the host meter', () => {
  const context = occupancy({ projectedTokens: 400, contextWindow: 1000 })
  const bands = bandShares({ systemTokens: 20, toolsTokens: 50, messageTokens: 250 }, context)
  assert.deepEqual(bands.map((band) => band.key), ['system', 'tools', 'messages'])
  // The printed shares sum to the printed occupancy: the last band absorbs the
  // one-decimal rounding remainder instead of pushing the total to 40.1.
  assert.deepEqual(bands.map((band) => band.percent), [2.5, 6.3, 31.2])
  // The shares are proportions of the window, and they add up to the occupancy.
  assert.equal(bands.reduce((sum, band) => sum + band.share, 0), 0.4)
})

test('bandShares drops empty bands and refuses a missing basis', () => {
  const context = occupancy({ projectedTokens: 400, contextWindow: 1000 })
  assert.deepEqual(bandShares({ systemTokens: 0, toolsTokens: 0, messageTokens: 0 }, context), [])
  assert.deepEqual(bandShares(undefined, context), [])
  assert.deepEqual(bandShares({ systemTokens: 1 }, null), [])
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
