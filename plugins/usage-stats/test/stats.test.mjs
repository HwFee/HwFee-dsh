/**
 * Tests for dsh-usage-stats' pure client arithmetic.
 *
 * `stats.js` is imported directly — no bundle, no DOM, no network — because the
 * contract puts every number the panel displays in that module precisely so it
 * can be asserted on like this.
 *
 *   node test/stats.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  dayKeysIn,
  summarize,
  formatNumber,
  formatHour,
  favoriteModel,
  buildHeatmap,
  bookComparison,
  resolveUnitScale,
} from '../client/src/stats.js'
import { BOOKS } from '../client/src/constants.js'

// ------------------------------------------------------------ formatNumber

/**
 * THE UNIT TABLE. Every magnitude the panel can print, in both scales. This is
 * the contract the `units` settings row promises the user: same number, two
 * ladders, same rounding.
 */
const UNIT_TABLE = [
  // [value,  short K/M/B,  myriad 万/亿]
  [0, '0', '0'],
  [1, '1', '1'],
  [999, '999', '999'],
  [1000, '1K', '1,000'],
  [1234, '1.2K', '1,234'],
  [9999, '10K', '9,999'],
  [10000, '10K', '1万'],
  [12345, '12K', '1.2万'],
  [99999, '100K', '10万'],
  [999999, '1M', '100万'],
  [1000000, '1M', '100万'],
  [1234567, '1.2M', '123万'],
  [99999999, '100M', '1亿'],
  [100000000, '100M', '1亿'],
  [123456789, '123M', '1.23亿'],
  [1000000000, '1B', '10亿'],
]

test('formatNumber prints the unit table for both scales', function () {
  for (const entry of UNIT_TABLE) {
    const value = entry[0]
    assert.equal(formatNumber(value, 'short'), entry[1], value + ' short')
    assert.equal(formatNumber(value, 'myriad'), entry[2], value + ' myriad')
  }
})

test('formatNumber rounds half up and never invents or hides a unit', function () {
  // The hard rounding requirement: 999,999 must promote, not print 1000K/99.99万.
  assert.equal(formatNumber(999999, 'short'), '1M')
  assert.equal(formatNumber(999999, 'myriad'), '100万')
  assert.equal(formatNumber(99999999, 'myriad'), '1亿', '10000万 promotes to 亿')
  assert.equal(formatNumber(99999999, 'short'), '100M')
  // A nonzero count never renders as zero of a unit (`0.0万` is impossible: the
  // smallest unit is picked by magnitude and the raw integer is used below it).
  for (const value of [1, 2, 9999, 10001, 10049]) {
    assert.doesNotMatch(formatNumber(value, 'myriad'), /^0/, String(value))
    assert.doesNotMatch(formatNumber(value, 'short'), /^0/, String(value))
  }
  // Fractional inputs: raw values round to an integer, scaled ones keep the
  // tier's significant digits.
  assert.equal(formatNumber(999.5, 'short'), '1,000')
  assert.equal(formatNumber(1234.5, 'short'), '1.2K')
  assert.equal(formatNumber(1234.5, 'myriad'), '1,235')
  assert.equal(formatNumber(-2500, 'short'), '-2.5K')
  assert.equal(formatNumber(-2500, 'myriad'), '-2,500')
  // Junk cannot blank or crash the panel.
  assert.equal(formatNumber(Number.NaN, 'short'), '0')
  assert.equal(formatNumber(Infinity, 'myriad'), '0')
  assert.equal(formatNumber('1234', 'short'), '0', 'only numbers are formatted')
  // An unknown scale falls back to the short ladder instead of throwing.
  assert.equal(formatNumber(1234, 'wat'), '1.2K')
})

test('the two scales agree on the value, only the unit ladder differs', function () {
  // Both ladders must print a scaled unit for these magnitudes, each with its
  // own suffix. (Below 10,000 the myriad scale deliberately prints the groupable
  // raw integer, so it is not part of this comparison.)
  for (const value of [10000, 12345, 999999, 123456789, 1876895612]) {
    const short = formatNumber(value, 'short')
    const myriad = formatNumber(value, 'myriad')
    assert.notEqual(short, myriad, value + ' should read differently per scale')
    assert.match(short, /^[\d.,]+(K|M|B|T)$/)
    assert.match(myriad, /^[\d.,]+(万|亿|万亿)$/)
  }
})

test('resolveUnitScale turns the mode into a scale per language', function () {
  assert.equal(resolveUnitScale('auto', 'zh'), 'myriad')
  assert.equal(resolveUnitScale('auto', 'en'), 'short')
  assert.equal(resolveUnitScale('short', 'zh'), 'short', 'an explicit scale wins over the language')
  assert.equal(resolveUnitScale('myriad', 'en'), 'myriad')
  // Unknown/absent modes follow the language, exactly like `auto`.
  assert.equal(resolveUnitScale(undefined, 'zh'), 'myriad')
  assert.equal(resolveUnitScale('bogus', 'en'), 'short')
})

// ------------------------------------------------------------ formatHour

test('formatHour renders the 12-hour clock, including both twelves', function () {
  assert.equal(formatHour(0), '12 AM')
  assert.equal(formatHour(1), '1 AM')
  assert.equal(formatHour(11), '11 AM')
  assert.equal(formatHour(12), '12 PM')
  assert.equal(formatHour(13), '1 PM')
  assert.equal(formatHour(14), '2 PM')
  assert.equal(formatHour(23), '11 PM')
})

// ------------------------------------------------------------ dayKeysIn

test('dayKeysIn with days = 0 returns every key ascending', function () {
  const perDay = { '2025-01-03': 1, '2025-01-01': 2, '2025-01-02': 3 }
  assert.deepEqual(dayKeysIn(perDay, 0), ['2025-01-01', '2025-01-02', '2025-01-03'])
})

test('dayKeysIn anchors the window on the newest key, not on today', function () {
  const perDay = {
    '2024-11-30': 1,
    '2025-01-07': 1,
    '2025-01-08': 1,
    '2025-01-14': 1,
  }
  // 7 days ending 2025-01-14 covers 01-08..01-14 and drops the stale November key.
  assert.deepEqual(dayKeysIn(perDay, 7), ['2025-01-08', '2025-01-14'])
  assert.deepEqual(dayKeysIn(perDay, 30), ['2025-01-07', '2025-01-08', '2025-01-14'])
  assert.deepEqual(dayKeysIn(perDay, 1), ['2025-01-14'])
})

// ------------------------------------------------------------ favoriteModel

test('favoriteModel picks the token leader and its share', function () {
  const favourite = favoriteModel({
    'dsh/lean': { tokens: 750, messages: 3 },
    'dsh/pro': { tokens: 250, messages: 1 },
  })
  assert.deepEqual(favourite, { id: 'dsh/lean', tokens: 750, share: 0.75 })
  assert.equal(favoriteModel({}), null)
})

// ------------------------------------------------------------ buildHeatmap

/**
 * A pinned local-noon Date: its local calendar day is unambiguous in every
 * zone, and `buildHeatmap` derives "today" from the local civil date (the Host
 * resolves its day keys locally). Tests must pin it — the grid is anchored at
 * today, so an unpinned clock would drag every fixture to the real date.
 */
function at(year, month, day) {
  return new Date(year, month - 1, day, 12, 0, 0)
}

/** The grid as one flat, oldest→newest list of cells. */
const cellsOf = (grid) => grid.weeks.flat()

test('buildHeatmap rolls backward from today in full columns of seven', function () {
  // 2025-01-16 is a Thursday; the first active day is 2025-01-06 (Monday). The
  // grid holds whole seven-day columns ENDING on today, so it starts on
  // 2025-01-03 (the day 13 back) — not on a Sunday, and with no weekday rows.
  const perDay = {}
  for (let day = 6; day <= 14; day += 1) perDay[`2025-01-${String(day).padStart(2, '0')}`] = 5

  const grid = buildHeatmap(perDay, 30, at(2025, 1, 16))
  assert.equal(grid.max, 5)
  assert.equal(grid.weeks.length, 2)
  assert.ok(grid.weeks.every((week) => week.length === 7), 'every column is full')

  assert.deepEqual(grid.weeks[0], [
    { key: '2025-01-03', count: 0, level: 0, pad: true },
    { key: '2025-01-04', count: 0, level: 0, pad: true },
    { key: '2025-01-05', count: 0, level: 0, pad: true },
    { key: '2025-01-06', count: 5, level: 4 },
    { key: '2025-01-07', count: 5, level: 4 },
    { key: '2025-01-08', count: 5, level: 4 },
    { key: '2025-01-09', count: 5, level: 4 },
  ])
  // The last column ends on today: quiet, dated cells for the days between the
  // last activity and today, then today itself in the bottom-right cell.
  assert.deepEqual(grid.weeks[1], [
    { key: '2025-01-10', count: 5, level: 4 },
    { key: '2025-01-11', count: 5, level: 4 },
    { key: '2025-01-12', count: 5, level: 4 },
    { key: '2025-01-13', count: 5, level: 4 },
    { key: '2025-01-14', count: 5, level: 4 },
    { key: '2025-01-15', count: 0, level: 0 },
    { key: '2025-01-16', count: 0, level: 0 },
  ])
  const cells = cellsOf(grid)
  assert.equal(cells.at(-1).key, '2025-01-16', 'the bottom-right cell is today')
})

test('buildHeatmap with a single active day is one full column ending today', function () {
  // 2025-01-09 is today, 2025-01-08 the only active day. A bounded range takes
  // no floor: one column of seven days, 01-03 … 01-09.
  const grid = buildHeatmap({ '2025-01-08': 9 }, 7, at(2025, 1, 9))
  assert.equal(grid.max, 9)
  assert.equal(grid.weeks.length, 1)
  assert.deepEqual(grid.weeks[0], [
    { key: '2025-01-03', count: 0, level: 0, pad: true },
    { key: '2025-01-04', count: 0, level: 0, pad: true },
    { key: '2025-01-05', count: 0, level: 0, pad: true },
    { key: '2025-01-06', count: 0, level: 0, pad: true },
    { key: '2025-01-07', count: 0, level: 0, pad: true },
    { key: '2025-01-08', count: 9, level: 4 },
    { key: '2025-01-09', count: 0, level: 0 },
  ])
})

test('buildHeatmap pads the All floor backward, and the grid still ends at today', function () {
  // A single active day is enough for the floor: at least 26 columns (182
  // cells), counted backward from today.
  const grid = buildHeatmap({ '2025-01-08': 9 }, 0, at(2025, 1, 15))
  assert.equal(grid.weeks.length, 26)
  assert.ok(grid.weeks.every((week) => week.length === 7), 'every floor column is full')

  const cells = cellsOf(grid)
  assert.equal(cells.length, 182)
  assert.equal(cells[0].key, '2024-07-18', '26 columns of seven, ending today')
  assert.equal(cells.at(-1).key, '2025-01-15', 'today is the bottom-right cell')

  // Padding is ONLY the quiet columns before the first active day: 174 cells.
  const pad = cells.filter((cell) => cell.pad)
  assert.equal(cells.filter((cell) => typeof cell?.key !== 'string').length, 0)
  assert.equal(pad.length, 174)
  for (const cell of pad) assert.ok(cell.key < '2025-01-08', `${cell.key} pads before the first active day`)
  const dated = cells.filter((cell) => !cell.pad)
  assert.equal(dated.length, 8, '2025-01-08 … 2025-01-15 are all dated cells')
  assert.equal(dated.filter((cell) => cell.count === 0).length, 7, 'the days after the last activity are quiet cells')

  // The active day sits in its own column, last row; today's column is all quiet.
  assert.equal(grid.weeks[24].at(-1).key, '2025-01-08')
  assert.equal(grid.weeks[24].filter((cell) => cell.count > 0).length, 1)
  assert.equal(grid.weeks[25].filter((cell) => cell.count > 0).length, 0)

  // A bounded range never gets the floor: it draws its own window, to today.
  assert.equal(buildHeatmap({ '2025-01-08': 9 }, 7, at(2025, 1, 9)).weeks.length, 1)
  assert.equal(buildHeatmap({ '2025-01-08': 9 }, 30, at(2025, 1, 15)).weeks.length, 2)
})

test('buildHeatmap renders a quiet day inside the window as a dated level-0 cell', function () {
  // A day the log skipped between two active days is not the same as a day
  // before the first one: it keeps its date so the tooltip can say so.
  const grid = buildHeatmap({ '2025-01-06': 4, '2025-01-08': 6 }, 0, at(2025, 1, 9))
  assert.deepEqual(grid.weeks.at(-1), [
    { key: '2025-01-03', count: 0, level: 0, pad: true },
    { key: '2025-01-04', count: 0, level: 0, pad: true },
    { key: '2025-01-05', count: 0, level: 0, pad: true },
    { key: '2025-01-06', count: 4, level: 2 },
    { key: '2025-01-07', count: 0, level: 0 },
    { key: '2025-01-08', count: 6, level: 4 },
    { key: '2025-01-09', count: 0, level: 0 },
  ])
  // Days before the first active day are padding, not quiet days: dated (the
  // hover contract) but flagged `pad`. Days after the last active one are NOT.
  assert.equal(grid.weeks.at(-1)[2].pad, true)
  assert.equal(grid.weeks.at(-1)[4].pad, undefined)
  assert.equal(cellsOf(grid).at(-1).key, '2025-01-09')
})

test('buildHeatmap ranks distinct counts into levels, and 0 stays 0', function () {
  const perDay = {
    '2025-01-06': 1,
    '2025-01-07': 2,
    '2025-01-08': 3,
    '2025-01-09': 4,
    '2025-01-10': 40,
  }
  const grid = buildHeatmap(perDay, 0, at(2025, 1, 10))
  // The last column is the seven days ending on today (Friday): two pads, the
  // five ranked days, and today itself.
  assert.deepEqual(grid.weeks.at(-1).map((cell) => cell.level), [0, 0, 1, 1, 2, 3, 4])
  // Days with identical counts get identical levels; in a window where every
  // day is equally busy, the top rank still pins them to level 4.
  const flat = buildHeatmap({ '2025-01-06': 5, '2025-01-07': 5 }, 0, at(2025, 1, 7))
  assert.deepEqual(flat.weeks.at(-1).map((cell) => cell.level), [0, 0, 0, 0, 0, 4, 4])
  // A day with no messages is level 0 rather than a quantile of the quiet ones.
  assert.equal(buildHeatmap({ '2025-01-08': 0 }, 0, at(2025, 1, 9)).weeks.length, 0)
  assert.deepEqual(buildHeatmap({}, 7, at(2025, 1, 9)), { weeks: [], max: 0 })
})

test('buildHeatmap clips to the range and never draws the clipped-out edge', function () {
  const perDay = { '2025-01-01': 1, '2025-01-08': 3, '2025-01-09': 4 }
  const grid = buildHeatmap(perDay, 7, at(2025, 1, 9))
  assert.equal(grid.max, 4)
  // The range's oldest key (01-01) never appears; the single column still ends
  // on today and is padded back to seven cells.
  assert.equal(grid.weeks.length, 1)
  assert.deepEqual(grid.weeks[0], [
    { key: '2025-01-03', count: 0, level: 0, pad: true },
    { key: '2025-01-04', count: 0, level: 0, pad: true },
    { key: '2025-01-05', count: 0, level: 0, pad: true },
    { key: '2025-01-06', count: 0, level: 0, pad: true },
    { key: '2025-01-07', count: 0, level: 0, pad: true },
    { key: '2025-01-08', count: 3, level: 2 },
    { key: '2025-01-09', count: 4, level: 4 },
  ])
})

test('the bottom-right cell is today: row 6, last column, nothing in the future', function () {
  const perDay = {}
  for (let day = 1; day <= 15; day += 1) perDay[`2025-01-${String(day).padStart(2, '0')}`] = day
  const today = '2025-01-15' // a Wednesday — the geometry must not care
  const grid = buildHeatmap(perDay, 0, at(2025, 1, 15))
  const cells = cellsOf(grid)
  const index = cells.length - 1

  assert.equal(cells[index].key, today, 'the newest square is today')
  assert.equal(cells[index].pad, undefined, 'today is a real dated cell, not padding')
  assert.equal(index % 7, 6, 'today sits on the last row')
  assert.equal(Math.floor(index / 7), grid.weeks.length - 1, 'today sits in the last column')
  assert.equal(grid.weeks.at(-1).at(-1).key, today, 'bottom-right of the rendered grid')
  assert.equal(cells.filter((cell) => cell.key > today).length, 0, 'not one cell past today')
  assert.ok(grid.weeks.every((week) => week.length === 7), 'every column is full — no short last column')
  assert.equal(grid.weeks.length, 26, 'the All floor still gives 26 columns')
})

test('today is Sunday 2026-10-18: the bottom-right cell is today, full columns', function () {
  // The reported data: Saturday 2026-10-17 and today, Sunday 2026-10-18. Under
  // the old weekday grid today sat on the Sunday row with a truncated column;
  // the rolling grid puts it in the corner regardless of weekday.
  const perDay = { '2026-10-17': 3993, '2026-10-18': 439 }
  const sunday = at(2026, 10, 18)
  assert.equal(sunday.getDay(), 0, 'fixture assumption: 2026-10-18 is a Sunday')

  const grid = buildHeatmap(perDay, 0, sunday)
  assert.equal(grid.max, 3993)
  assert.equal(grid.weeks.length, 26)
  assert.ok(grid.weeks.every((week) => week.length === 7), 'every column is full')

  const cells = cellsOf(grid)
  assert.equal(cells.length, 182)
  assert.equal(cells[0].key, '2026-04-20', '26 columns of seven, ending today')
  assert.equal(cells.at(-1).key, '2026-10-18', 'today is the bottom-right cell')

  // The final column: five padding days, Saturday (row 5) and today (row 6).
  assert.deepEqual(grid.weeks.at(-1), [
    { key: '2026-10-12', count: 0, level: 0, pad: true },
    { key: '2026-10-13', count: 0, level: 0, pad: true },
    { key: '2026-10-14', count: 0, level: 0, pad: true },
    { key: '2026-10-15', count: 0, level: 0, pad: true },
    { key: '2026-10-16', count: 0, level: 0, pad: true },
    { key: '2026-10-17', count: 3993, level: 4 },
    { key: '2026-10-18', count: 439, level: 2 },
  ])
  assert.equal(grid.weeks.at(-1)[5].key, '2026-10-17')
  assert.equal(grid.weeks.at(-1)[6].key, '2026-10-18')
  for (const cell of cells) assert.ok(cell.key <= '2026-10-18', `${cell.key} is in the future`)
  assert.equal(cells.filter((cell) => !cell.pad).length, 2, 'Saturday and today are the dated cells')
})

test('days between the last active day and today are quiet dated cells, not padding', function () {
  const grid = buildHeatmap({ '2025-02-10': 7 }, 0, at(2025, 2, 20))
  const cells = cellsOf(grid)
  const tail = cells.filter((cell) => cell.key > '2025-02-10' && cell.key <= '2025-02-20')
  assert.equal(tail.length, 10)
  for (const cell of tail) {
    assert.equal(cell.pad, undefined, `${cell.key} must be a dated cell`)
    assert.equal(cell.count, 0)
    assert.equal(cell.level, 0)
  }
  assert.equal(cells.at(-1).key, '2025-02-20')
  assert.equal(cells.filter((cell) => cell.pad).every((cell) => cell.key < '2025-02-10'), true)
})

test('a logged day newer than the clock is kept, not clipped', function () {
  // Clock skew / a restored backup must not hide real data: the anchor is
  // max(last active day, today), so the newest logged day wins the corner.
  const grid = buildHeatmap({ '2025-03-01': 1, '2025-03-10': 2 }, 30, at(2025, 3, 5))
  const cells = cellsOf(grid)
  assert.equal(cells.at(-1).key, '2025-03-10')
  assert.equal(cells.at(-1).count, 2)
  assert.equal(cells.at(-1).key, grid.weeks.at(-1).at(-1).key)
})

test('buildHeatmap defaults its anchor to the real local today', function () {
  // No `now`: the corner must still be the machine's local civil date (the
  // panel never passes a clock).
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const grid = buildHeatmap({ '2020-01-01': 1 }, 0)
  const cells = cellsOf(grid)
  assert.equal(cells.at(-1).key, today)
  assert.equal(cells.filter((cell) => cell.key > today).length, 0)
  assert.ok(grid.weeks.every((week) => week.length === 7))
})

test('buildHeatmap falls back to the newest logged day on an invalid clock', function () {
  const grid = buildHeatmap({ '2025-01-08': 9 }, 7, new Date('not a date'))
  assert.equal(cellsOf(grid).at(-1).key, '2025-01-08', 'the corner is the last real day, not garbage')
})

// ------------------------------------------------------------ summarize

/** 60 days of 40 messages each, plus two models with a lopsided split. */
function fixture() {
  const perDay = {}
  for (let offset = 0; offset < 60; offset += 1) {
    const date = new Date(Date.UTC(2025, 0, 1) + offset * 86400000)
    perDay[date.toISOString().slice(0, 10)] = 40
  }

  const perHour = new Array(24).fill(0)
  perHour[9] = 100
  perHour[14] = 300
  perHour[22] = 100

  return {
    generatedAt: 1735689600000,
    sessions: 12,
    messages: 2400,
    totalTokens: 1000000,
    activeDays: 60,
    peakHour: 14,
    perDay,
    perHour,
    perModel: {
      'dsh/pro': { tokens: 750000, messages: 1800 },
      'dsh/nano': { tokens: 250000, messages: 600 },
    },
  }
}

test('summarize clips a 60-day log to the last 30 calendar days', function () {
  const clipped = summarize(fixture(), 30)

  assert.equal(Object.keys(clipped.perDay).length, 30)
  assert.equal(clipped.perDay['2025-01-30'], undefined)
  assert.equal(clipped.perDay['2025-01-31'], 40)
  assert.equal(clipped.perDay['2025-03-01'], 40)

  assert.equal(clipped.messages, 1200)
  assert.equal(clipped.activeDays, 30)
  // sessions has no time dimension in the Host summary and is carried through.
  assert.equal(clipped.sessions, 12)
  assert.equal(clipped.peakHour, 14)
  assert.equal(clipped.perHour[14], 300)
  // Half the messages are in range, so every model is scaled by half.
  assert.deepEqual(clipped.perModel, {
    'dsh/pro': { tokens: 375000, messages: 900 },
    'dsh/nano': { tokens: 125000, messages: 300 },
  })
  assert.equal(clipped.totalTokens, 500000)
})

test('summarize with the full range keeps the log and scales rare models', function () {
  const full = summarize(fixture(), 0)
  assert.equal(full.messages, 2400)
  assert.equal(full.activeDays, 60)
  assert.equal(full.totalTokens, 1000000)

  // 2 messages of 2400 scales to 1 message in a 30-day window — above the
  // half-message floor, so the model list keeps the row and halves its numbers.
  const withGhost = fixture()
  withGhost.perModel['dsh/ghost'] = { tokens: 5000, messages: 2 }
  assert.deepEqual(summarize(withGhost, 30).perModel['dsh/ghost'], { tokens: 2500, messages: 1 })

  // The full range keeps every model at the numbers the Host reported.
  assert.deepEqual(Object.keys(summarize(withGhost, 0).perModel), ['dsh/pro', 'dsh/nano', 'dsh/ghost'])
  assert.deepEqual(summarize(withGhost, 0).perModel['dsh/ghost'], { tokens: 5000, messages: 2 })
})

test('summarize shrinks the model list with the range', function () {
  const summary = fixture()
  // A model whose 2 messages over 60 days fall below half a message in a
  // 7-day window: it must not survive the clip.
  summary.perModel['dsh/brief'] = { tokens: 8000, messages: 2 }
  assert.deepEqual(Object.keys(summarize(summary, 7).perModel), ['dsh/pro', 'dsh/nano'])

  summary.perModel['dsh/dead'] = { tokens: 0, messages: 0 }
  assert.deepEqual(Object.keys(summarize(summary, 0).perModel), ['dsh/pro', 'dsh/nano', 'dsh/brief'])
})

test('summarize survives an empty log and an empty range', function () {
  const empty = { sessions: 0, perDay: {}, perHour: new Array(24).fill(0), perModel: {} }
  assert.deepEqual(summarize(empty, 30), {
    sessions: 0,
    messages: 0,
    totalTokens: 0,
    activeDays: 0,
    peakHour: 0,
    perDay: {},
    perHour: new Array(24).fill(0),
    perModel: {},
  })
})

// ------------------------------------------------------------ bookComparison

// The pick is injected, so these assert the arithmetic and the wording, not
// "whatever Math.random happened to return".
const first = function () { return 0 }
const last = function () { return 0.999 }

test('bookComparison returns ratio data, not a sentence', function () {
  const small = bookComparison(BOOKS[0].chars / 2, first)
  assert.equal(small.ratio, 0.5)
  assert.equal(small.title, BOOKS[0].title)
  // The printed sentence lives in the panel's locale dictionary; this module
  // deliberately hands back the pick and the ratio so either language can
  // phrase it. Anything sentence-shaped, byline-shaped or basis-shaped must
  // stay absent.
  assert.ok(!('text' in small), 'sentence must not be computed here')
  assert.ok(!('author' in small), 'byline must not be computed here')
  assert.ok(!('basis' in small), 'basis caveat must not be computed here')
  assert.ok(!('charsText' in small), 'localized char count must not be computed here')
})

test('bookComparison reports exact ratios the panel interpolates', function () {
  const one = BOOKS[0].chars
  assert.equal(bookComparison(one, first).ratio, 1)
  assert.equal(bookComparison(one * 733, first).ratio, 733)
  // The panel rounds the ratio for display; the value itself stays exact.
  assert.equal(bookComparison(one * 2.6, first).ratio, 2.6)
})

test('bookComparison picks a book from the injected random source', function () {
  const flat = function () { return 0 }
  assert.equal(bookComparison(0, flat).title, BOOKS[0].title)
  assert.equal(bookComparison(0, last).title, BOOKS[BOOKS.length - 1].title)

  // 0.5 lands in the middle bucket of an even-length list.
  const mid = bookComparison(0, function () { return 0.5 })
  const expected = BOOKS[Math.floor(0.5 * BOOKS.length)]
  assert.equal(mid.title, expected.title)
})

test('every book in BOOKS is reachable in both languages', function () {
  BOOKS.forEach(function (entry, i) {
    const pick = bookComparison(0, function () { return (i + 0.5) / BOOKS.length })
    assert.equal(pick.title, entry.title, 'index ' + i)
    assert.equal(pick.titleEn, entry.titleEn, 'index ' + i)
    assert.equal(pick.chars, entry.chars, 'index ' + i)
  })
})

test('bookComparison clamps an out-of-range random instead of crashing', function () {
  assert.equal(bookComparison(0, function () { return 1 }).title, BOOKS[BOOKS.length - 1].title)
  assert.equal(bookComparison(0, function () { return -5 }).title, BOOKS[0].title)
  // A random source that returns garbage falls back to the first book rather
  // than rendering `《undefined》`.
  assert.equal(bookComparison(0, function () { return Number.NaN }).title, BOOKS[0].title)
})

test('the default random source always yields a real book', function () {
  for (let i = 0; i < 200; i += 1) {
    const pick = bookComparison(1e6)
    assert.ok(BOOKS.some(function (entry) { return entry.title === pick.title }),
      'unknown book: ' + pick.title)
  }
})
