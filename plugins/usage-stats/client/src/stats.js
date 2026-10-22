/**
 * dsh-usage-stats — pure arithmetic for the usage panel.
 *
 * Everything the panel displays that is derived from the Host summary is
 * computed here: the range window, the reformatted numbers, the heatmap grid
 * and the book comparison. This module deliberately has no DOM, no fetch and no
 * import from `panel.js`, so `node:test` can exercise it without a browser —
 * the panel is then only responsible for laying the results out.
 *
 * TIME ZONE: day keys are civil dates ('YYYY-MM-DD') that the Host already
 * resolved in the local zone. Every date computation here therefore reads the
 * parts of the key and compares them with `Date.UTC`, never with local `Date`
 * getters, whose result depends on the machine's zone and would make the window
 * non-deterministic across machines.
 */

const DAY_MS = 86400000

/**
 * A model is kept only while its apportioned usage reaches half a message;
 * below that its share of the range rounds to nothing and the row would be
 * noise in the model list.
 */
const MODEL_MIN_MESSAGES = 0.5

// ------------------------------------------------------------ date helpers

/**
 * Convert a 'YYYY-MM-DD' key to a UTC midnight stamp without touching the local
 * zone; keys that are not civil dates (or not dates at all) yield NaN so callers
 * can filter them in one place.
 */
function dayStamp(key) {
  if (typeof key !== 'string') return NaN
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (match === null) return NaN
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/**
 * Whole calendar days between two keys. Both stamps are UTC midnights, so the
 * division is exact and no daylight-saving hour can round the span off by one.
 */
function daysBetween(fromKey, toKey) {
  return Math.round((dayStamp(toKey) - dayStamp(fromKey)) / DAY_MS)
}

// ------------------------------------------------------------ range window

/**
 * Resolve the range to a set of day keys.
 *
 * The window is anchored to the newest key present in `perDay`, not to today:
 * a log that stopped being written a week ago still shows its own last 7 days
 * instead of an empty panel. `days === 0` means "no clipping".
 */
export function dayKeysIn(perDay, days) {
  const keys = Object.keys(perDay === null || perDay === undefined ? {} : perDay)
    .filter((key) => !Number.isNaN(dayStamp(key)))
    .sort()

  if (keys.length === 0) return []

  const span = Math.max(0, days)
  if (span === 0) return keys

  const newest = keys[keys.length - 1]
  // A window of N days holds N calendar days and includes the newest one, so
  // the oldest key is N-1 days back. Keys are sorted, so the first key inside
  // that distance starts the window and everything after it is inside it too.
  const start = keys.findIndex((key) => daysBetween(key, newest) < span)
  return keys.slice(start)
}

// ------------------------------------------------------------ formatting

/**
 * The two unit ladders.
 *
 * Western short scale (10^3 steps) and Chinese myriad scale (10^4 steps) are not
 * interchangeable: 1,234,567 is `1.2M` on one and `123万` on the other, and the
 * user picks which one the panel speaks. The ladder is ordered largest-first so
 * `formatNumber` can pick the first unit that fits.
 *
 * `sigDigits` is the rounded precision per tier, expressed as the decimals the
 * scaled value keeps: K/M/B/万 show one decimal below 10, none from 10 up
 * (`1.2K`, `12K`, `123K`, `1.2万`); 亿/万亿 keep one more digit (`1.23亿`,
 * `12.3亿`, `123亿`) because the panel shows totals in the hundred-million/
 * billion range there and a 1% error would be millions of tokens.
 *
 * `T` / `万亿` exist because a very old log can exceed a billion tokens; without
 * them the largest unit would print `1234B`, which is both wide and a lie about
 * the chosen scale's next step.
 */
export const UNIT_SCALES = {
  short: [
    { value: 1e12, suffix: 'T', sigDigits: 2 },
    { value: 1e9, suffix: 'B', sigDigits: 2 },
    { value: 1e6, suffix: 'M', sigDigits: 2 },
    { value: 1e3, suffix: 'K', sigDigits: 2 },
  ],
  myriad: [
    { value: 1e12, suffix: '万亿', sigDigits: 3 },
    { value: 1e8, suffix: '亿', sigDigits: 3 },
    { value: 1e4, suffix: '万', sigDigits: 2 },
  ],
}

/**
 * Resolve the stored preference to the scale that is actually rendered.
 *
 * `auto` is a real third state, not sugar for one of the scales: it follows the
 * ACTIVE LANGUAGE, so the same stored value renders 万/亿 in a zh UI and K/M/B
 * in an en UI. The caller passes the language (`'zh'`/`'en'`) so a locale switch
 * re-formats without touching the store.
 */
export function resolveUnitScale(mode, language) {
  if (mode === 'short' || mode === 'myriad') return mode
  return language === 'zh' ? 'myriad' : 'short'
}

/** Round half away from zero at `decimals` places, without float dust. */
function roundTo(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Decimals for a scaled value given the tier's `sigDigits` precision knob.
 * A scaled value is always in [1, next unit step), so the result is 1–2 below
 * 10, 0–1 below 100 and 0 from 100 up — e.g. `1.2K`, `12K`, `123K`, `1.23亿`.
 */
function decimalsFor(scaled, sigDigits) {
  const magnitude = Math.max(0, Math.floor(Math.log10(scaled)))
  return Math.max(0, sigDigits - 1 - magnitude)
}

/** Group a non-negative integer with thousands separators (no ICU dependency). */
function groupInteger(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Drop trailing zeros and a trailing decimal point: 1.20 -> 1.2, 100.0 -> 100. */
function trimNumber(text) {
  if (text.indexOf('.') < 0) return text
  return text.replace(/\.?0+$/, '')
}

/**
 * Format every count in the panel in the selected unit scale.
 *
 * RULE (the one the docs cite):
 *   1. Values below the smallest unit are grouped integers (`999`, `9,999`);
 *      that is the only place a comma separator appears.
 *   2. Otherwise divide by the largest unit that fits, round HALF UP to the
 *      tier's precision — ONE decimal below 10 and none from 10 up for
 *      K/M/B/万, one digit more for 亿/万亿 — and trim trailing zeros:
 *      1,234 -> `1.2K`, 12,345 -> `1.2万`, 123,456,789 -> `1.23亿`.
 *   3. If that rounding reaches the next ladder step (999,999 short -> 1000K),
 *      promote the unit and format again, so the result is `1M`, never `1000K`;
 *      likewise 99,999,999 myriad -> `1亿`, never `10000万`.
 *   4. A nonzero count always prints a nonzero quantity: the smallest unit is
 *      picked by magnitude, so `0.0万` can never be produced.
 *
 * `scale` is the RESOLVED scale (`short` | `myriad`); an unknown value falls
 * back to `short` so a bad caller cannot blank the panel.
 */
export function formatNumber(n, scale) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0'
  const units = UNIT_SCALES[scale === 'myriad' ? 'myriad' : 'short']
  const sign = n < 0 ? '-' : ''
  const size = Math.abs(n)

  let index = units.findIndex((unit) => size >= unit.value)
  if (index < 0) return sign + groupInteger(Math.round(size))

  // Round, and walk UP the ladder while the rounding carries (999.95K -> 1M).
  // The ladder ends at 10^12, so the loop is bounded by construction.
  let text = ''
  for (;;) {
    const unit = units[index]
    const scaled = size / unit.value
    const decimals = decimalsFor(scaled, unit.sigDigits)
    text = trimNumber(roundTo(scaled, decimals).toFixed(decimals))
    const nextStep = index === 0 ? Infinity : units[index - 1].value / unit.value
    if (index === 0 || Number(text) < nextStep) break
    index -= 1
  }

  return sign + text + units[index].suffix
}

/**
 * Render an hour as a 12-hour clock label. 0 and 12 both need the "12" label —
 * the one case where `hour % 12` is not enough — so the modulo is normalised
 * before the label is chosen.
 */
export function formatHour(h) {
  if (typeof h !== 'number' || !Number.isFinite(h)) return '12 AM'
  const hour = ((Math.trunc(h) % 24) + 24) % 24
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${hour < 12 ? 'AM' : 'PM'}`
}

// ------------------------------------------------------------ summary views

/**
 * Keep the models that were in use during the range.
 *
 * The Host summary carries no per-day model breakdown, so usage is apportioned
 * by the range's share of messages and a model is dropped once that share falls
 * below half a message. That is what makes the model list shrink with the range
 * instead of always showing every model the log ever saw.
 */
function modelsInRange(perModel, share) {
  const source = perModel === null || perModel === undefined ? {} : perModel
  const result = {}
  for (const [id, entry] of Object.entries(source)) {
    const tokens = Math.round((entry?.tokens ?? 0) * share)
    const messages = Math.round((entry?.messages ?? 0) * share)
    if (messages < MODEL_MIN_MESSAGES) continue
    result[id] = { tokens, messages }
  }
  return result
}

/**
 * Re-derive every panel number for one range.
 *
 * `sessions` has no time dimension in the Host summary, so it is carried
 * through unchanged; the message, token, day, hour and model numbers are all
 * recomputed from the window returned by `dayKeysIn`, which keeps this function
 * and `buildHeatmap` agreeing on what "the last N days" means by construction.
 */
export function summarize(summary, range) {
  const source = summary === null || summary === undefined ? {} : summary
  const perDay = source.perDay ?? {}
  const keys = dayKeysIn(perDay, range)
  const selected = keys.filter((key) => (perDay[key] ?? 0) > 0)

  let messages = 0
  const windowedPerDay = {}
  for (const key of keys) {
    const count = perDay[key] ?? 0
    windowedPerDay[key] = count
    messages += count
  }

  const allMessages = Object.values(perDay).reduce((sum, count) => sum + (count ?? 0), 0)
  // An empty log has no meaningful share; the clamping keeps the result at 0
  // rather than NaN, which would propagate into every model row.
  const share = allMessages > 0 ? messages / allMessages : 0

  const perHour = Array.isArray(source.perHour) ? source.perHour.slice() : new Array(24).fill(0)
  let peakHour = 0
  for (let hour = 1; hour < perHour.length; hour += 1) {
    if ((perHour[hour] ?? 0) > (perHour[peakHour] ?? 0)) peakHour = hour
  }

  const perModel = modelsInRange(source.perModel, share)
  const totalTokens = Object.values(perModel).reduce((sum, entry) => sum + entry.tokens, 0)

  return {
    sessions: source.sessions ?? 0,
    messages,
    totalTokens,
    activeDays: selected.length,
    peakHour,
    perDay: windowedPerDay,
    perHour,
    perModel,
  }
}

// ------------------------------------------------------------ favourite model

/** The busiest model by tokens, plus its share of the range's total; null when empty. */
export function favoriteModel(perModel) {
  const source = perModel === null || perModel === undefined ? {} : perModel
  const entries = Object.entries(source)
  if (entries.length === 0) return null

  let champion = null
  let total = 0
  for (const [id, entry] of entries) {
    const tokens = entry?.tokens ?? 0
    total += tokens
    // Strictly greater keeps the first model on a tie, so the row does not
    // change identity between two equal renders.
    if (champion === null || tokens > champion.tokens) champion = { id, tokens }
  }

  return {
    id: champion.id,
    tokens: champion.tokens,
    share: total > 0 ? champion.tokens / total : 0,
  }
}

// ------------------------------------------------------------ heatmap grid

/**
 * Map every count that occurs in the window to its 0..4 density level.
 *
 * Levels are the rank of the count among the window's distinct counts, spread
 * across 1..4 by `floor(4 * rank / distinct)`. Comparing ranks rather than raw
 * values keeps two identically busy days the same colour, and pinning the top
 * rank to 4 means the busiest day is always drawn at full strength — including
 * the degenerate window where every day has the same count, which a numeric
 * threshold would flatten to a single shade. Callers look up level 0 for a day
 * with no activity, so level 0 always means "nothing here".
 */
function heatLevels(counts) {
  const distinct = Array.from(new Set(counts)).sort((a, b) => a - b)
  const levels = new Map()
  distinct.forEach((count, index) => {
    const rank = index + 1
    levels.set(count, rank === distinct.length ? 4 : Math.max(1, Math.floor((4 * rank) / distinct.length)))
  })
  return levels
}

/**
 * Today as a local civil-date key ('YYYY-MM-DD').
 *
 * The Host resolves every `perDay` key in the LOCAL zone, so "today" has to be
 * read from the local calendar too: a UTC read would flip the right edge of the
 * grid a day early or late for every non-UTC host. `now` is injectable so the
 * tests can pin the window.
 */
function todayKey(now) {
  const date = now instanceof Date ? now : new Date(now === undefined ? Date.now() : now)
  if (Number.isNaN(date.getTime())) return ''
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * How far back the "All" range reaches when the log is younger than that.
 *
 * A heatmap that only spans first→last active day collapses to a single column
 * on a fresh install — the whole point of the grid is to show rhythm over time,
 * so the unfiltered range keeps half a year (26 columns of seven days, the
 * density the design's heatmap runs at) on screen and lets empty columns read
 * as "nothing here yet". The floor extends BACKWARD from today, so the newest
 * day stays hard against the bottom-right corner. Bounded ranges (7d, 30d) are
 * always drawn over their full window instead, so their column count never
 * lies about the range.
 */
const ALL_RANGE_MIN_DAYS = 182

/**
 * Build the rolling grid.
 *
 * THERE ARE NO WEEKDAY ROWS. The grid is anchored at today and counted
 * BACKWARD: `columns × 7` cells, cell index i (0-based) is dated
 * `today − (columns × 7 − 1 − i)` days, column = floor(i / 7), row = i mod 7.
 * The bottom-right cell (last column, last row) is therefore ALWAYS today,
 * whatever weekday today happens to be, and each row inside a column reads
 * oldest → newest top → bottom.
 *
 * THE WINDOW ENDS AT TODAY. The right edge is `max(last active day, today)` —
 * normally today — so no cell is ever dated in the future and every column is
 * a full seven cells. Days between the last active day and today are ordinary
 * quiet days with their own date and count 0, which keeps the calendar
 * continuous. If the log already holds a day newer than "today" (clock skew, a
 * restored backup) that day is the anchor, so real data is never clipped.
 *
 * `pad: true` is therefore reserved for days BEFORE the first active day — the
 * quiet columns the "All" floor adds on the left — and for nothing else. A
 * quiet day inside the window is a real dated cell at level 0: dropping it
 * would pull two busy days into neighbouring squares as if they were adjacent.
 *
 * `now` is the clock (defaults to the real one); tests pass a fixed Date.
 */
export function buildHeatmap(perDay, range, now) {
  const source = perDay === null || perDay === undefined ? {} : perDay
  const keys = dayKeysIn(source, range)

  // The window is clamped to days that actually carry a count, so a quiet tail
  // of the range does not add empty columns to the right of the grid.
  const active = keys.filter((key) => (source[key] ?? 0) > 0)
  if (active.length === 0) {
    return { weeks: [], max: 0 }
  }

  const levels = heatLevels(active.map((key) => source[key]))
  const levelOf = (count) => levels.get(count) ?? 0

  const first = active[0]
  const last = active[active.length - 1]
  const firstStamp = dayStamp(first)
  const lastStamp = dayStamp(last)

  // THE ANCHOR IS TODAY (or the newest logged day, if the log is ahead of the
  // clock — never clip real data). The grid is built backward from here, so the
  // final cell lands on this day.
  const todayStamp = dayStamp(todayKey(now))
  const endStamp = Number.isNaN(todayStamp) ? lastStamp : Math.max(lastStamp, todayStamp)

  // Enough columns of seven days to reach back to the first active day, and —
  // for the unfiltered range — never fewer than 26. Bounded ranges (7d, 30d)
  // draw exactly their own window and take no floor.
  const spanDays = Math.round((endStamp - firstStamp) / DAY_MS) + 1
  let columns = Math.max(1, Math.ceil(spanDays / 7))
  if (Math.max(0, range) === 0 && columns < ALL_RANGE_MIN_DAYS / 7) columns = ALL_RANGE_MIN_DAYS / 7

  const dayCount = columns * 7
  // Oldest cell first: the grid holds the `dayCount` days that END on the
  // anchor day, so index dayCount-1 is the anchor itself.
  const startStamp = endStamp - (dayCount - 1) * DAY_MS

  const weeks = []
  for (let day = 0; day < dayCount; day += 1) {
    const stamp = startStamp + day * DAY_MS
    const key = new Date(stamp).toISOString().slice(0, 10)
    const count = Number.isNaN(dayStamp(key)) ? 0 : source[key] ?? 0
    // Padding is only ever BEFORE the first active day (the quiet columns the
    // All floor prepends). Anything from the first active day through today is
    // a dated cell — including the quiet days after the last active one, which
    // is what keeps "last busy day" and "today" in the same calendar.
    const pad = stamp < firstStamp
    if (day % 7 === 0) weeks.push([])
    weeks[weeks.length - 1].push(
      pad
        ? { key, count: 0, level: 0, pad: true }
        : { key, count, level: count > 0 ? levelOf(count) : 0 })
  }

  let max = 0
  for (const key of active) {
    if (source[key] > max) max = source[key]
  }

  return { weeks, max }
}
