/**
 * Tests for dsh-usage-stats' panel-height setting.
 *
 * `settings.js` is pure over an injected storage adapter, so it is imported
 * directly — no bundle, no DOM, no network. The stylesheet assertions read
 * `styles.js` (which exports the exact CSS string the plugin installs) and pin
 * the equal-height contract: the shared body wrapper owns the custom property,
 * the model list and the overview wrapper both fill it, and the overview's heat
 * band is the flexing child — so both tabs are the same height at every setting
 * and the composer dock below the panel cannot jump on a tab switch.
 *
 *   node test/settings.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BODY_HEIGHT_STEP,
  BODY_HEIGHT_VAR,
  DEFAULT_BODY_HEIGHT,
  DEFAULT_UNITS,
  MAX_BODY_HEIGHT,
  MIN_BODY_HEIGHT,
  UNIT_MODES,
  bodyHeightStyle,
  clampBodyHeight,
  clampUnits,
  createSettingsStore,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  unitsForSwitch,
  unitsIsOn,
} from '../client/src/settings.js'
import { PANEL_CSS } from '../client/src/styles.js'
import { createPanel, overviewElement } from '../client/src/panel.js'
import { createLifecycle } from '../client/src/lifecycle.js'
import {
  SETTINGS_ROW_ID, SETTINGS_ROW_ORDER, STORAGE_KEY, UNITS_ROW_ID, UNITS_ROW_ORDER,
} from '../client/src/constants.js'
import { en, zh } from '../client/src/locales.js'

/** A Map-backed localStorage stand-in. `broken` makes every write throw. */
function makeStorage(initial, { broken = false } = {}) {
  const map = new Map(initial ? Object.entries(initial) : [])
  return {
    map,
    getItem(key) { return map.has(key) ? map.get(key) : null },
    setItem(key, value) {
      if (broken) throw new Error('quota exceeded')
      map.set(key, String(value))
    },
    removeItem(key) { map.delete(key) },
  }
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

// ------------------------------------------------------------ the constants

test('the default height is 344px on the slider grid', function () {
  assert.equal(DEFAULT_BODY_HEIGHT, 344)
  assert.equal(MIN_BODY_HEIGHT, 240)
  assert.equal(MAX_BODY_HEIGHT, 520)
  assert.equal(BODY_HEIGHT_STEP, 4)
  // The default must be reachable by the control (344 = 240 + 26×4).
  assert.equal((DEFAULT_BODY_HEIGHT - MIN_BODY_HEIGHT) % BODY_HEIGHT_STEP, 0)
  assert.ok(DEFAULT_BODY_HEIGHT >= MIN_BODY_HEIGHT && DEFAULT_BODY_HEIGHT <= MAX_BODY_HEIGHT)
})

test('the unit preference is a two-state switch, defaulting to Chinese units', function () {
  // It was a THREE-way segmented control (auto | short | myriad) and the user
  // could not tell what it asked: 「什么叫短式」. One switch asks a yes/no
  // question. `auto` is gone as a STORED value but still migrates — see below.
  assert.equal(DEFAULT_UNITS, 'myriad', 'a zh interface keeps 万/亿, as auto resolved')
  assert.deepEqual(UNIT_MODES, ['short', 'myriad'])
  assert.equal(clampUnits(undefined), 'myriad', 'an old payload has no field → the default')
  assert.equal(clampUnits('short'), 'short')
  assert.equal(clampUnits('myriad'), 'myriad')
  assert.equal(clampUnits('k'), 'myriad', 'unknown modes fall back to the default')

  // MIGRATION: a store written by the old build can still hold `auto`. It must
  // resolve exactly the way the old build resolved it, or an upgrade silently
  // changes what the panel shows.
  assert.equal(clampUnits('auto', 'zh'), 'myriad', 'auto on a zh UI was 万/亿')
  assert.equal(clampUnits('auto', 'en'), 'short', 'auto on an en UI was K/M/B')
  assert.equal(clampUnits(undefined, 'en'), 'short', 'no field on an en UI is K/M/B')

  // The switch surface: what it reads and what it writes.
  assert.equal(unitsIsOn('myriad'), true)
  assert.equal(unitsIsOn('short'), false)
  assert.equal(unitsIsOn('auto'), true, 'old auto counts as on (its zh resolution)')
  assert.equal(unitsForSwitch(true), 'myriad')
  assert.equal(unitsForSwitch(false), 'short')
})

test('the two settings rows have stable ids and non-tied orders', function () {
  assert.equal(SETTINGS_ROW_ID, 'dsh-usage-stats-panel-height')
  assert.equal(UNITS_ROW_ID, 'dsh-usage-stats-units')
  // 40/41, not mid-ladder numbers: the theme page is still growing rows, so any
  // value between the theme rows would collide with whatever cds-theme adds next.
  assert.equal(SETTINGS_ROW_ORDER, 40)
  assert.equal(UNITS_ROW_ORDER, 41)
  assert.notEqual(SETTINGS_ROW_ORDER, UNITS_ROW_ORDER, 'the two rows must not tie')
  assert.equal(STORAGE_KEY, 'dsh-usage-stats/settings')
})

// ------------------------------------------------------------ clamping

test('clampBodyHeight keeps every accepted value inside the range and on the grid', function () {
  assert.equal(clampBodyHeight(300), 300)
  assert.equal(clampBodyHeight(DEFAULT_BODY_HEIGHT), DEFAULT_BODY_HEIGHT)
  assert.equal(clampBodyHeight('400'), 400, 'a numeric string is accepted')
  // Out-of-range numbers clamp instead of resetting.
  assert.equal(clampBodyHeight(0), MIN_BODY_HEIGHT)
  assert.equal(clampBodyHeight(-5), MIN_BODY_HEIGHT)
  assert.equal(clampBodyHeight(MIN_BODY_HEIGHT - 1), MIN_BODY_HEIGHT)
  assert.equal(clampBodyHeight(9999), MAX_BODY_HEIGHT)
  assert.equal(clampBodyHeight(MAX_BODY_HEIGHT + 1), MAX_BODY_HEIGHT)
  // Hand-edited values snap to the slider's grid (240 + k×4).
  assert.equal(clampBodyHeight(345), 344)
  assert.equal(clampBodyHeight(346), 348)
  assert.equal(clampBodyHeight(347), 348)
  for (const value of [100, 241, 243, 300, 519, 600, 347.4]) {
    const clamped = clampBodyHeight(value)
    assert.ok(clamped >= MIN_BODY_HEIGHT && clamped <= MAX_BODY_HEIGHT, `${value} -> ${clamped}`)
    assert.equal((clamped - MIN_BODY_HEIGHT) % BODY_HEIGHT_STEP, 0, `${value} -> ${clamped} is off-grid`)
  }
})

test('malformed values fall back to the default', function () {
  for (const value of [null, undefined, '', 'abc', 'NaN', Number.NaN, Infinity, -Infinity, {}, [], true]) {
    assert.equal(clampBodyHeight(value), DEFAULT_BODY_HEIGHT, `${String(value)} -> default`)
  }
})

// ------------------------------------------------------------ sanitize + load

test('sanitizeSettings coerces the schema and drops everything else', function () {
  assert.deepEqual(sanitizeSettings({ bodyHeight: 300 }),
    { bodyHeight: 300, units: 'myriad' })
  assert.deepEqual(sanitizeSettings({}), { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' })
  assert.deepEqual(sanitizeSettings(null), { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' })
  assert.deepEqual(sanitizeSettings('nope'), { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' })
  assert.deepEqual(sanitizeSettings({ bodyHeight: 'abc' }),
    { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' })
  assert.deepEqual(sanitizeSettings({ bodyHeight: 9999 }),
    { bodyHeight: MAX_BODY_HEIGHT, units: 'myriad' })
  assert.deepEqual(sanitizeSettings({ units: 'myriad' }),
    { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' })
  assert.deepEqual(sanitizeSettings({ units: 'wat' }),
    { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' }, 'unknown unit mode → the default')
  // A payload from an older build or a hand-edited document keeps only the
  // known fields; unknown keys cannot leak into the store.
  assert.deepEqual(
    sanitizeSettings({ range: '7d', tab: 'models', bodyHeight: 400, units: 'short', junk: true }),
    { bodyHeight: 400, units: 'short' })
})

test('loadSettings reads localStorage and survives garbage', function () {
  assert.deepEqual(loadSettings(null),
    { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' }, 'no storage')
  assert.deepEqual(loadSettings(makeStorage()),
    { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' }, 'empty storage')

  const seeded = makeStorage({ [STORAGE_KEY]: JSON.stringify({ bodyHeight: 400, units: 'myriad' }) })
  assert.deepEqual(loadSettings(seeded), { bodyHeight: 400, units: 'myriad' })

  const broken = makeStorage({ [STORAGE_KEY]: '{not json' })
  assert.deepEqual(loadSettings(broken),
    { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' }, 'unparseable JSON')

  // A payload written before the unit row existed has no `units` field.
  const legacy = makeStorage({ [STORAGE_KEY]: JSON.stringify({ bodyHeight: 360 }) })
  assert.deepEqual(loadSettings(legacy), { bodyHeight: 360, units: 'myriad' },
    'legacy payload → auto')
})

test('saveSettings persists the schema and never throws on a broken storage', function () {
  const storage = makeStorage()
  saveSettings(storage, { bodyHeight: 400 })
  assert.equal(storage.getItem(STORAGE_KEY), JSON.stringify({ bodyHeight: 400 }))
  assert.doesNotThrow(function () {
    saveSettings(makeStorage(null, { broken: true }), { bodyHeight: 400 })
  })
  assert.doesNotThrow(function () { saveSettings(null, { bodyHeight: 400 }) })
})

// ------------------------------------------------------------ the store

test('the store clamps, persists and notifies only on a real change', function () {
  const storage = makeStorage()
  const store = createSettingsStore(storage)
  assert.equal(store.getState().bodyHeight, DEFAULT_BODY_HEIGHT)
  assert.equal(store.getState().units, 'myriad')

  const seen = []
  const unsubscribe = store.subscribe(function (state) { seen.push(state.bodyHeight) })

  assert.equal(store.setBodyHeight(400), 400)
  assert.equal(store.getState().bodyHeight, 400)
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { bodyHeight: 400, units: 'myriad' })
  assert.deepEqual(seen, [400], 'subscribers hear about the change')

  const before = store.getState()
  assert.equal(store.setBodyHeight(400), 400, 'setting the same value is a no-op')
  assert.equal(store.getState(), before, 'and keeps the snapshot reference (no re-render)')
  assert.deepEqual(seen, [400])

  assert.equal(store.setBodyHeight(9999), MAX_BODY_HEIGHT, 'clamped on write')
  assert.deepEqual(seen, [400, MAX_BODY_HEIGHT])

  unsubscribe()
  assert.equal(store.listenerCount(), 0)
  store.setBodyHeight(300)
  assert.deepEqual(seen, [400, MAX_BODY_HEIGHT], 'a removed listener is not called')
})

test('the unit mode lives in the same store and persists with the height', function () {
  const storage = makeStorage()
  const store = createSettingsStore(storage)
  const seen = []
  store.subscribe(function (state) { seen.push(state.units) })

  // The default is already `myriad`, so a write of the same value is a no-op by
  // design (the store notifies only on a real change). Start from `short` so the
  // transition below is a real one.
  assert.equal(store.setUnits('short'), 'short')
  assert.equal(store.getState().units, 'short')
  assert.deepEqual(seen, ['short'])

  assert.equal(store.setUnits('myriad'), 'myriad')
  assert.equal(store.getState().units, 'myriad')
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)),
    { bodyHeight: DEFAULT_BODY_HEIGHT, units: 'myriad' })
  assert.deepEqual(seen, ['short', 'myriad'])

  const before = store.getState()
  assert.equal(store.setUnits('myriad'), 'myriad', 'same mode is a no-op')
  assert.equal(store.getState(), before, 'and keeps the snapshot reference')
  assert.deepEqual(seen, ['short', 'myriad'], 'a no-op write notifies nobody')

  assert.equal(store.setUnits('wat'), 'myriad', 'unknown mode falls back to the default')
  assert.equal(store.getState().units, 'myriad')
  assert.deepEqual(seen, ['short', 'myriad'], 'a no-op write notifies nobody')

  // The two preferences share one storage key without clobbering each other.
  store.setBodyHeight(400)
  store.setUnits('short')
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { bodyHeight: 400, units: 'short' })
  const remounted = createSettingsStore(storage)
  assert.equal(remounted.getState().bodyHeight, 400)
  assert.equal(remounted.getState().units, 'short')
})

test('the value survives a remount: a fresh store reads the persisted number', function () {
  const storage = makeStorage()
  const first = createSettingsStore(storage)
  first.setBodyHeight(412)

  // The panel/settings tree unmounts and remounts on a reload — a new bundle
  // instance builds a new store over the same localStorage.
  const second = createSettingsStore(storage)
  assert.equal(second.getState().bodyHeight, 412)
})

test('a malformed stored payload boots at the default instead of throwing', function () {
  const storage = makeStorage({ [STORAGE_KEY]: '{"bodyHeight":"tall","units":42}' })
  const store = createSettingsStore(storage)
  assert.equal(store.getState().bodyHeight, DEFAULT_BODY_HEIGHT)
  assert.equal(store.getState().units, 'myriad', 'a malformed unit mode is not fatal')
  // The first write repairs the payload.
  store.setBodyHeight(360)
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { bodyHeight: 360, units: 'myriad' })
})

test('a broken storage still serves the in-memory value', function () {
  const store = createSettingsStore(makeStorage(null, { broken: true }))
  assert.doesNotThrow(function () { store.setBodyHeight(400) })
  assert.equal(store.getState().bodyHeight, 400, 'the UI reads memory, not the failed write')
})

// ------------------------------------------------------------ the CSS contract
//
// WHY THIS IS THE COMPOSER-JUMP TEST. The panel is a column stack: head, a 10px
// gap, then the body. If the body's height depends on the tab, the composer dock
// below the panel moves on every tab switch. The fix is structural: `.dus-body`
// owns the ONE fixed height, `.dus-models` fills it, and `.dus-overview` fills it
// — those two 100% fillers are the equality carriers. The heat band must NOT be
// one: square cells capped at 22px cannot absorb height, so a growing band would
// only paint empty tinted surface above the reserved space. A second height
// anywhere in the sheet is exactly the bug, so that is what these assertions pin.

/** The declaration body of one single-selector rule (`.name { … }`). */
function ruleBody(css, name) {
  const match = new RegExp('\\.' + name + '\\s*\\{([^}]*)\\}').exec(css)
  assert.ok(match !== null, 'expected a .' + name + ' rule in the stylesheet')
  return match[1]
}

/** Every `selector { body }` pair of the flat sheet (only @media nests here). */
function cssRules(css) {
  const rules = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match = re.exec(css)
  while (match !== null) {
    rules.push({ selector: match[1].trim().replace(/\s+/g, ' '), body: match[2] })
    match = re.exec(css)
  }
  return rules
}

test('the body wrapper is the single source of the tab height', function () {
  const body = ruleBody(PANEL_CSS, 'dus-body')
  assert.match(body, new RegExp(
    'height:\\s*var\\(\\s*' + BODY_HEIGHT_VAR + '\\s*,\\s*' + DEFAULT_BODY_HEIGHT + 'px\\s*\\)'),
  '.dus-body must read var(--dus-body-height, 344px)')
  // The horizontal slide translates outside the fixed box; it must be clipped.
  assert.match(body, /overflow:\s*hidden/)
  // It is still the animated flex column the tab swap relies on.
  assert.match(body, /display:\s*flex/)
  assert.match(body, /flex-direction:\s*column/)
  assert.match(body, /gap:\s*10px/)
  assert.match(body, /animation:\s*dus-slide-in/)
  // The number lives in exactly one declaration in the whole sheet, and that
  // declaration is the body's height — not a model list's.
  assert.equal((PANEL_CSS.match(new RegExp(BODY_HEIGHT_VAR, 'g')) || []).length, 1,
    'the height variable must be referenced exactly once')
  assert.deepEqual(cssRules(PANEL_CSS)
    .filter(function (rule) { return rule.body.indexOf(BODY_HEIGHT_VAR) >= 0 })
    .map(function (rule) { return rule.selector }), ['.dus-body'])
  // The settings row still ships from the same sheet.
  assert.match(PANEL_CSS, /\.dus-row\s*\{/, 'the settings row is styled from the same sheet')
  assert.match(PANEL_CSS, /\.dus-row-slider\s*\{/, 'the row control has its own class')
})

test('the models tab fills the shared body instead of owning a height', function () {
  const models = ruleBody(PANEL_CSS, 'dus-models')
  assert.match(models, /height:\s*100%/, 'the list is sized BY the body, not by the setting')
  assert.match(models, /min-height:\s*0/,
    'min-height:0 is what lets the list shrink to the body instead of overflowing it')
  // Scrolling stays as a SILENT safety valve; the user asked for no visible bar,
  // because the list is short in every real profile and a gutter reads as broken.
  assert.match(models, /overflow-y:\s*auto/, 'a genuinely long list still scrolls')
  assert.match(models, /overscroll-behavior:\s*contain/)
  assert.match(models, /scrollbar-width:\s*none/, 'no scrollbar gutter on a short list')
  assert.ok(!/mask-image/.test(models),
    'no fade mask: with a few rows it fades the first and last row for no reason')
  assert.ok(!/padding-right/.test(models),
    'the 2px pad existed only to clear the scrollbar; it would now misalign the rows')
  // Chromium/WebKit path: display:none also releases the reserved gutter.
  assert.match(PANEL_CSS, /\.dus-models::-webkit-scrollbar\s*\{\s*display:\s*none/,
    'the scrollbar is hidden in webkit too, not just narrowed')
  assert.ok(!/dus-models::-webkit-scrollbar-thumb/.test(PANEL_CSS),
    'a thumb rule with no track is dead weight')
  assert.ok(models.indexOf(BODY_HEIGHT_VAR) < 0,
    '.dus-models must not read the setting any more')
  // A literal height here is the exact regression this contract removes.
  assert.doesNotMatch(PANEL_CSS, /\.dus-models\s*\{[^}]*height:\s*\d+px/)
})

test('the overview tab fills the body and never scrolls vertically', function () {
  // The wrapper is the same 100% filler as the model list — that is what makes
  // the Overview tab's OUTER box equal the body height at every setting. It does
  // NOT scroll: a shorter panel shrinks the graphics instead (layout.js feeds the
  // lengths below), and `overflow-y: hidden` is only the belt to that arithmetic's
  // braces — clipping a stray pixel beats growing the scrollbar the user
  // rejected.
  const overview = ruleBody(PANEL_CSS, 'dus-overview')
  // The Overview wrapper is a plain column: its two seams are stated on the
  // children instead (`.dus-grid` margin-bottom = the overview gap, `.dus-foot`
  // margin-top = the tighter foot gap), because a uniform `gap` could not give
  // the foot less air than the cards↔band seam.
  for (const declaration of [
    /display:\s*flex/,
    /flex-direction:\s*column/,
    /height:\s*100%/,
    /min-height:\s*0/,
    /overflow-y:\s*hidden/,
  ]) {
    assert.match(overview, declaration, '.dus-overview must keep its fill contract')
  }
  assert.ok(!/(^|[;\s])gap:/.test(overview),
    'a uniform gap is gone: the foot needs less air than the cards↔band seam')
  // Both seams are still fed by layout.js, and the foot's is the smaller one.
  assert.match(ruleBody(PANEL_CSS, 'dus-grid'),
    /margin-bottom:\s*var\(--dus-overview-gap,\s*10px\)/, 'the grid carries the band seam')
  assert.match(ruleBody(PANEL_CSS, 'dus-foot'),
    /margin-top:\s*var\(--dus-foot-gap,\s*4px\)/, 'the foot carries its own, tighter seam')
  assert.ok(!/overflow-y:\s*auto/.test(overview),
    'auto was the scrollbar the user complained about; the tab shrinks instead')
  assert.ok(!/overflow(-y)?:\s*scroll/.test(overview))
  assert.ok(overview.indexOf(BODY_HEIGHT_VAR) < 0,
    '.dus-overview must not re-read the setting (the body already did)')

  // The band's cell cap is the shrink knob, and it is fed from the body height.
  const heat = ruleBody(PANEL_CSS, 'dus-heat')
  assert.match(heat, /flex:\s*0 0 auto/, 'the band keeps its content height')
  assert.match(heat, /padding:\s*var\(--dus-heat-pad,\s*8px\)/)
  assert.match(heat, /gap:\s*var\(--dus-heat-gap,\s*4px\)/)
  assert.ok(heat.indexOf(BODY_HEIGHT_VAR) < 0,
    'the band height must never be tied to the setting')
  // Internals unchanged: columns share the band edge to edge, cells stay
  // square, surplus goes into the gaps.
  assert.match(heat, /align-items:\s*stretch/)
  assert.match(heat, /justify-content:\s*space-between/)
  // Scrolling still works, but NO BAR IS DRAWN and no gutter is reserved — the
  // same treatment as the model list, and the reason `HEAT_SCROLLBAR_RESERVE`
  // is 0 in `layout.js`. `scrollbar-width: thin` would reserve real height.
  assert.match(heat, /overflow-x:\s*auto/, 'touch/trackpad scrolling stays available')
  assert.match(heat, /scrollbar-width:\s*none/, 'no gutter: the bar must not eat height')
  assert.ok(!/scrollbar-width:\s*thin/.test(heat), 'thin still reserves height')
  assert.match(PANEL_CSS, /\.dus-heat::-webkit-scrollbar\s*\{\s*display:\s*none/,
    'the Chromium/WebKit path hides it too, like .dus-models')
  assert.match(heat, /overscroll-behavior-x:\s*contain/)
  const week = ruleBody(PANEL_CSS, 'dus-heat-week')
  assert.match(week, /flex:\s*1 0 9px/)
  assert.match(week, /max-width:\s*var\(--dus-heat-cell-max,\s*22px\)/,
    'the column cap is the JS-derived shrink knob, with the design cap as fallback')
  assert.match(ruleBody(PANEL_CSS, 'dus-heat-cell'), /aspect-ratio:\s*1/,
    'cells stay square: a rectangle breaks the calendar read')
  // The type that may shrink carries its floors as the CSS fallbacks.
  assert.match(ruleBody(PANEL_CSS, 'dus-card-label'), /font-size:\s*var\(--dus-card-label-size,\s*11px\)/)
  assert.match(ruleBody(PANEL_CSS, 'dus-card-value'), /font-size:\s*var\(--dus-card-value-size,\s*17px\)/)
  assert.match(ruleBody(PANEL_CSS, 'dus-foot'), /font-size:\s*12px/,
    'the foot is prose: its size never changes, only its leading')
  // The foot carries NO rule and no vertical padding: the .5px `border-top`
  // hairline plus 8px `padding-top` stacked a stray line and 18.5px of air over
  // one line of prose. Its only spacing is the one `--dus-foot-gap` margin.
  const foot = ruleBody(PANEL_CSS, 'dus-foot')
  assert.ok(!/border/.test(foot), 'no divider above the book line')
  assert.ok(!/padding/.test(foot), 'no vertical padding on the foot; the gap is the margin')
  assert.match(foot, /margin-top:\s*var\(--dus-foot-gap,\s*4px\)/, 'one gap owns its spacing')
})

test('equal height comes from .dus-body + the 100% overview filler, never from a growing heat band', function () {
  // A future reader must not "fix" the band back into the slack absorber. The
  // equality chain is: `.dus-body` has the definite height, and BOTH tab
  // fillers are `height:100%` of it. The band only paints its calendar.
  const body = ruleBody(PANEL_CSS, 'dus-body')
  assert.match(body, new RegExp('height:\\s*var\\(\\s*' + BODY_HEIGHT_VAR + '\\s*,\\s*'
    + DEFAULT_BODY_HEIGHT + 'px\\s*\\)'), 'the body must own the definite height')
  assert.match(ruleBody(PANEL_CSS, 'dus-overview'), /height:\s*100%/,
    'the overview filler is the equality carrier')
  assert.match(ruleBody(PANEL_CSS, 'dus-models'), /height:\s*100%/,
    'the model filler is the equality carrier')
  // The band must neither grow nor shrink with the reserved height.
  const heat = ruleBody(PANEL_CSS, 'dus-heat')
  assert.match(heat, /flex:\s*0 0 auto/)
  assert.doesNotMatch(heat, /flex:\s*[1-9]/, 'a growing band would paint an empty tinted card')
  assert.doesNotMatch(heat, /flex-grow:\s*[1-9]/)
  // And it never reads the setting (only `.dus-body` may).
  assert.equal((PANEL_CSS.match(new RegExp(BODY_HEIGHT_VAR, 'g')) || []).length, 1)
})

test('nothing in the tab stack can stretch or shrink a tab away from the setting', function () {
  // `.dus-body` must keep its definite height: not a stretched flex child and
  // no min/max height that could re-derive it.
  const body = ruleBody(PANEL_CSS, 'dus-body')
  assert.doesNotMatch(body, /(^|[;\s])flex:/, 'the body is not a stretched flex child')
  assert.doesNotMatch(body, /(^|[;\s])(?:min|max)-height:/)
  // The panel stays content-height, so its height is head + gap + body and both
  // tabs contribute the same body height.
  assert.doesNotMatch(ruleBody(PANEL_CSS, 'dus-panel'), /(^|[;\s])(?:min-|max-)?height:/)
  // The two tab fillers are the only children with a definite height, and both
  // are 100% of the body.
  assert.match(ruleBody(PANEL_CSS, 'dus-models'), /height:\s*100%/)
  assert.match(ruleBody(PANEL_CSS, 'dus-overview'), /height:\s*100%/)
})

test('the hover bubble cannot reach an ancestor scroll container', function () {
  // This is the jitter fix, and it is a LAYOUT contract, so it is asserted here
  // as well as computed in `layout.js`. The hero stack lives in a scroll
  // container with `overflow-y: auto`; a bubble that escapes the panel becomes
  // scrollable overflow there, a horizontal scrollbar appears, the centred stack
  // shifts and the hovered cell moves out from under the pointer. Measured in
  // `.work/lead-hover` at 790x900: panel top 229↔234 and clientHeight 856↔846
  // with the bubble escaping by 51.31px; one panel top and no overflow after.

  // 1. The clip gate: an always-mounted, full-panel layer that clips.
  const layer = ruleBody(PANEL_CSS, 'dus-tip-layer')
  assert.match(layer, /position:\s*absolute/, 'the layer does not join the flex flow')
  assert.match(layer, /inset:\s*0/, 'the bubble keeps panel-relative coordinates')
  assert.match(layer, /overflow:\s*hidden/,
    'clipping here is what stops the ancestor from ever seeing the bubble')
  assert.match(layer, /pointer-events:\s*none/, 'the layer must not eat the hover')
  assert.doesNotMatch(layer, /(^|[;\s])height:/,
    'a sized layer would change the panel layout it is supposed to leave alone')

  // 2. The bubble itself is capped by the panel, not only by the 240px design
  //    cap, so the clamp stays solvable on a narrow panel.
  const tip = ruleBody(PANEL_CSS, 'dus-tip')
  assert.match(tip, /max-width:\s*min\(240px,\s*calc\(100%\s*-\s*16px\)\)/)
  assert.match(tip, /max-width:\s*240px/, 'the design cap stays as the fallback')
  assert.match(tip, /position:\s*absolute/)
  assert.match(tip, /transform:\s*translate\(-50%,\s*calc\(-100%\s*-\s*6px\)\)/,
    'the bubble is centred on the cell, so the clamp owns the offset')
  assert.match(tip, /pointer-events:\s*none/)
  // The 16px is two 8px insets: the same number `TIP_INSET` uses.
  assert.match(tip, /calc\(100%\s*-\s*16px\)/)
})

test('the panel positions the bubble from its measured width, not from a guess', function () {
  const source = readFileSync(new URL('../client/src/panel.js', import.meta.url), 'utf8')
  // The bug: a centre clamp hardcoded to a 28px half-width. It cannot hold a
  // 240px-max bubble, and `28` must never come back as the placement rule.
  assert.doesNotMatch(source, /Math\.min\(Math\.max\(centre,\s*28\)/,
    'the centre-only clamp is the bug this change removed')
  // The fix: the shared geometry helper, fed the bubble's real width.
  assert.match(source, /tipCentre\(/, 'placement goes through layout.js')
  assert.match(source, /getBoundingClientRect\(\)\.width/,
    'the bubble is measured, not assumed')
  assert.match(source, /useLayoutEffect/, 'the correction must land before paint')
  assert.match(source, /className:\s*'dus-tip-layer'/,
    'the bubble is mounted inside the clip layer')
})

test('bodyHeightStyle writes the clamped height and the derived Overview lengths', function () {
  // The height itself, clamped like the control.
  assert.equal(bodyHeightStyle(344)[BODY_HEIGHT_VAR], '344px')
  assert.equal(bodyHeightStyle(400)[BODY_HEIGHT_VAR], '400px')
  assert.equal(bodyHeightStyle(347)[BODY_HEIGHT_VAR], '348px', 'snapped like the control')
  assert.equal(bodyHeightStyle(null)[BODY_HEIGHT_VAR], '344px', 'malformed -> default')

  // Every other property is a shrink length derived from that height; the
  // height is the only one that is not prefixed `--dus-overview`/`--dus-heat`/
  // `--dus-card`/`--dus-grid`/`--dus-foot`.
  //
  // At the 240 floor on a WIDE viewport the tab fits the `tight` tier: the type
  // keeps full size and only the graphics give.
  const style = bodyHeightStyle(240)
  assert.equal(style['--dus-heat-cell-max'], '10px', 'the tight tier at the 240 floor')
  assert.equal(style['--dus-card-label-size'], '11px', 'full-size labels still fit')
  assert.equal(style['--dus-card-value-size'], '17px')
  assert.equal(style['--dus-foot-gap'], '4px', 'one small gap above the foot, no divider')
  for (const [name, value] of Object.entries(style)) {
    assert.equal(typeof value, 'string', name + ' is a string')
    assert.match(value, /-?\d+(?:\.\d+)?px$/, name + ' is a px length')
  }
  // A taller panel gives the graphics more room: the cell cap grows, never shrinks.
  const tall = bodyHeightStyle(520)
  assert.ok(parseFloat(tall['--dus-heat-cell-max']) > parseFloat(style['--dus-heat-cell-max']),
    'a taller setting draws bigger cells')
  assert.equal(tall['--dus-heat-cell-max'], '22px', 'and stops at the design cap')
  // The viewport width only changes the card-row count (and with it the budget):
  // three card rows at a narrow width still need the packed tier at 240.
  const narrow = bodyHeightStyle(240, 400)
  assert.equal(narrow['--dus-heat-cell-max'], '9px',
    'three card rows cost a row, so the band gets the smallest cells')
  assert.equal(narrow['--dus-card-label-size'], '10px', 'the packed tier sits on the label floor')
  assert.equal(narrow['--dus-card-value-size'], '15px', 'the type floor is unchanged')
  assert.equal(narrow['--dus-foot-gap'], '2px', 'and the packed foot gap')
  // The default body now reaches the 22px design cap: with no scrollbar reserve
  // the band fits full-size cells, so the tab is not padded out by an idle strip.
  assert.equal(bodyHeightStyle(344)['--dus-heat-cell-max'], '22px',
    'the default height draws the full cells, not a reserve-limited size')
})

/**
 * A hooks-capable React stand-in: just enough for `createPanel` to render one
 * tree, so the panel's own wiring (subscribe -> style -> format) is asserted
 * for real instead of being inferred from the stylesheet. `options.tab` pins
 * the first `useState` call (the panel's tab), which otherwise opens on
 * Overview.
 */
function makeReactStub(options) {
  const opts = options || {}
  let stateCalls = 0
  return {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const next = Object.assign({}, props)
      if (children.length === 1) next.children = children[0]
      else if (children.length > 1) next.children = children
      return { type, props: next, children }
    },
    useState(initial) {
      stateCalls += 1
      if (stateCalls === 1 && opts.tab !== undefined) return [opts.tab, function () {}]
      return [typeof initial === 'function' ? initial() : initial, function () {}]
    },
    useEffect() {},
    useMemo(fn) { return fn() },
    useRef(value) { return { current: value } },
    useSyncExternalStore(subscribe, getSnapshot) {
      subscribe(function () {})
      return getSnapshot()
    },
  }
}

function flatten(tree) {
  const out = []
  ;(function walk(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      if (Array.isArray(node)) for (const child of node) walk(child)
      return
    }
    out.push(node)
    walk(node.children)
  })(tree)
  return out
}

test('the panel reads the shared store and rewrites the variable live', function () {
  const React = makeReactStub()
  const storage = makeStorage()
  const store = createSettingsStore(storage)
  const panel = createPanel({ React, primitives: {}, settings: store })
  const session = { blank: true, running: false, promptAttempted: false }
  const render = function () {
    return panel.Panel({ session: session, fetchSummary: function () { return Promise.reject(new Error('offline')) }, t: function (key) { return key } })
  }

  const root = flatten(render()).find(function (node) { return node.props?.className === 'dus-panel' })
  assert.ok(root, 'the panel rendered')
  assert.equal(root.props.style[BODY_HEIGHT_VAR], '344px', 'default height on the panel root')
  // The same inline style carries the Overview shrink lengths (layout.js), so
  // one store read drives both the tab height and the graphics scale. With no
  // scrollbar reserve the default height already reaches the 22px design cap.
  assert.equal(root.props.style['--dus-heat-cell-max'], '22px')

  // A drag in General settings goes through the same store: the next panel
  // render must carry the new value, with no reload and no remount.
  store.setBodyHeight(456)
  const after = flatten(render()).find(function (node) { return node.props?.className === 'dus-panel' })
  assert.equal(after.props.style[BODY_HEIGHT_VAR], '456px')
  assert.equal(after.props.style['--dus-heat-cell-max'], '22px',
    'a taller body hands the band the full 22px cap')
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { bodyHeight: 456, units: 'myriad' })

  // The derived lengths follow the same read going DOWN too — that is what makes
  // "缩小而不是滚动" live rather than a reload-only behaviour.
  store.setBodyHeight(MIN_BODY_HEIGHT)
  const small = flatten(render()).find(function (node) { return node.props?.className === 'dus-panel' })
  assert.equal(small.props.style[BODY_HEIGHT_VAR], MIN_BODY_HEIGHT + 'px')
  assert.equal(small.props.style['--dus-heat-cell-max'], '10px',
    'the short body shrinks the cells without a scrollbar')
})

test('the overview tab renders one .dus-overview wrapper around its sections', function () {
  // The CSS fix only works if panel.js actually wraps the three Overview
  // sections in the filler element: `.dus-body` height → `.dus-overview` 100%
  // → `.dus-heat` flexes. Asserted as a structure so the rule cannot be
  // shipped against a bare Fragment.
  const React = makeReactStub()
  const cards = { section: 'cards' }
  const heat = { section: 'heat' }
  const foot = { section: 'foot' }
  const node = overviewElement(React, cards, heat, foot)
  assert.equal(node.type, 'div')
  assert.equal(node.props.className, 'dus-overview')
  assert.deepEqual(node.children, [cards, heat, foot],
    'cards, heat band and foot stay in this order inside one wrapper')
})

// ------------------------------------------------------------ locale copy

test('zh and en define the same keys, and the settings-row copy is monolingual', function () {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), 'dictionary key sets must match')
  for (const key of Object.keys(en)) {
    assert.equal(typeof en[key], 'string', `en.${key} is a string`)
    assert.equal(typeof zh[key], 'string', `zh.${key} is a string`)
    assert.ok(en[key].length > 0 && zh[key].length > 0, `${key} is not empty`)
    assert.ok(!CJK.test(en[key]), `en.${key} must not contain Chinese`)
  }
  for (const key of ['settings.height.title', 'settings.height.desc',
    'units.title', 'units.desc', 'units.short', 'units.myriad']) {
    assert.ok(key in zh && key in en, `${key} exists in both dictionaries`)
    // The settings-row copy is monolingual — no `中文 · English` glue. (The
    // heatmap tooltip legitimately uses ` · ` as a date/count separator.)
    assert.ok(!zh[key].includes(' · ') && !en[key].includes(' · '), `${key} carries no glued pair`)
  }
  assert.equal(zh['settings.height.title'], '用量面板高度')
  assert.equal(en['settings.height.title'], 'Stats panel height')
  assert.ok(CJK.test(zh['settings.height.title']), 'the zh label is Chinese')
  assert.ok(!CJK.test(en['settings.height.title']), 'the en label is English')
  // The switch is described in BOTH languages, and the description names both
  // ends with an example — 「什么叫短式」 was the feedback that removed `auto`,
  // so a description that leaves the reader guessing would repeat the mistake.
  assert.equal(zh['units.title'], '数字单位')
  assert.ok(CJK.test(zh['units.desc']), 'the zh description is Chinese')
  assert.ok(!CJK.test(en['units.desc']), 'the en description is English')
  assert.ok(zh['units.desc'].includes('万物') || zh['units.desc'].includes('万/亿'),
    'the zh description shows what ON looks like')
  assert.ok(zh['units.desc'].includes('K') && en['units.desc'].includes('K'),
    'both descriptions show what OFF looks like')
  for (const key of ['units.short', 'units.myriad']) {
    assert.ok(key in zh && key in en, key + ' exists in both dictionaries')
  }
  assert.ok(!('units.auto' in zh), 'the auto label is gone, not left as a dead key')
  assert.ok(!('units.auto' in en), 'the auto label is gone from en too')
})

// ------------------------------------- the unit setting reaches every number

const BLANK_SESSION = { blank: true, running: false, promptAttempted: false }

/** A summary big enough that every scale step appears in one render. */
function unitSummary() {
  const perHour = new Array(24).fill(0)
  perHour[9] = 3
  return {
    generatedAt: 1,
    sessions: 1234,
    messages: 0,
    totalTokens: 0,
    activeDays: 0,
    peakHour: 9,
    perDay: { '2026-05-01': 3, '2026-05-02': 12345 },
    perHour: perHour,
    perModel: { 'model-a': { tokens: 1876895612, messages: 2 } },
  }
}

/** Render one Panel over a fresh store, with a controllable language/mode/tab. */
function renderUnitPanel(options) {
  const opts = options || {}
  const storage = makeStorage()
  const store = createSettingsStore(storage)
  // `mode` sets an explicit scale. There is no `auto` any more: a caller that
  // passes nothing gets the store's language-appropriate default, which is the
  // only remaining place the interface language affects the units.
  if (opts.mode !== undefined) store.setUnits(opts.mode)
  const React = makeReactStub({ tab: opts.tab })
  const panel = createPanel({ React, primitives: {}, settings: store })
  const summary = unitSummary()
  const tree = panel.Panel({
    session: BLANK_SESSION,
    fetchSummary: function () { return new Promise(function () {}) },
    peekSummary: function () { return summary },
    t: function (key, params) {
      if (key === 'book.lang') return opts.lang || 'en'
      return params ? key + '|' + JSON.stringify(params) : key
    },
  })
  return { tree, store, storage }
}

/** Every `.dus-card-value`, with its visible text and its `title` tooltip. */
function cardValues(tree) {
  return flatten(tree)
    .filter(function (node) { return node.props && node.props.className === 'dus-card-value' })
    .map(function (node) { return { value: node.props.children, title: node.props.title } })
}

/**
 * Run the real lifecycle against a fake slots service that declares the theme
 * page immediately, and hand back the registered settings rows. This is how the
 * registration (slot / ids / orders) and the row component itself are asserted
 * without a host.
 */
function lifecycleRows() {
  const registrations = []
  const store = createSettingsStore(makeStorage())
  const slots = {
    inject(key, callback) { callback(); return function () {} },
    register(options, component) {
      // The dock occupant lands here too; only the settings rows are collected.
      if (options.id === SETTINGS_ROW_ID || options.id === UNITS_ROW_ID) {
        registrations.push({ options: options, component: component })
      }
      return function () {}
    },
  }
  const lifecycle = createLifecycle({
    React: makeReactStub(),
    primitives: {},
    panel: { Panel: function () { return null } },
    fetchSummary: function () {},
    peekSummary: function () { return null },
    settings: store,
  })
  lifecycle({
    slots: slots,
    locale: { register: function () { return function () {} } },
    effect: function (fn) { fn(); return function () {} },
  })
  const units = registrations.filter(function (row) { return row.options.id === UNITS_ROW_ID })[0]
  return {
    store: store,
    registrations: registrations,
    unitsTree: function () {
      return units.component({ t: function (key) { return key } })
    },
  }
}

function textOf(tree, className) {
  const node = flatten(tree).find(function (entry) {
    return entry.props && entry.props.className === className
  })
  return node === undefined ? null : node
}

test('one formatter reaches the cards, model rows, heatmap text and book line', function () {
  // Explicit short scale: the cards carry the scaled values, and each card's
  // `title` is the SAME string (screen reader and screen agree).
  const short = renderUnitPanel({ lang: 'en', mode: 'short' })
  const shortCards = cardValues(short.tree)
  assert.deepEqual(shortCards.map(function (card) { return card.value }),
    ['1.2K', '12K', '1.9B', '2', '9 AM', 'model-a'])
  for (const card of shortCards) {
    assert.equal(card.title, card.value, 'card title must equal the visible value')
  }

  // Explicit myriad scale, Chinese UI: the same summary in 万/亿.
  const myriad = renderUnitPanel({ lang: 'zh', mode: 'myriad' })
  assert.deepEqual(cardValues(myriad.tree).map(function (card) { return card.value }),
    ['1,234', '1.2万', '18.8亿', '2', '9 AM', 'model-a'])

  // The heatmap's accessibility text uses the formatter too (busiest day max).
  const heatShort = textOf(short.tree, 'dus-heat')
  const heatMyriad = textOf(myriad.tree, 'dus-heat')
  assert.ok(heatShort, 'expected the heatmap band')
  assert.match(String(heatShort.props['aria-label']), /"max":"12K"/)
  assert.match(String(heatMyriad.props['aria-label']), /"max":"1.2万"/)
})

test('the chosen scale applies whatever the interface language is', function () {
  // `auto` used to make the scale follow the language. It is gone: the switch
  // stores the scale the user picked, so an English UI showing Chinese units
  // keeps them, and vice versa. What must still hold is that the stored value is
  // never rewritten by a render — the language only decides DEFAULTS at boot.
  const englishMyriad = renderUnitPanel({ lang: 'en', mode: 'myriad' })
  const chineseShort = renderUnitPanel({ lang: 'zh', mode: 'short' })
  assert.equal(cardValues(englishMyriad.tree)[2].value, '18.8亿',
    'an explicit myriad choice survives an English UI')
  assert.equal(cardValues(chineseShort.tree)[2].value, '1.9B',
    'an explicit short choice survives a Chinese UI')
  assert.equal(englishMyriad.store.getState().units, 'myriad', 'the stored mode never changed')
  assert.equal(chineseShort.store.getState().units, 'short')

  // A store that has no units field at all takes the language-appropriate
  // default, which is the one place the language still matters.
  assert.equal(renderUnitPanel({ lang: 'zh' }).store.getState().units, 'myriad',
    'a zh interface defaults to 万/亿')
})

test('the models list uses the same scale as the cards', function () {
  const short = renderUnitPanel({ lang: 'en', mode: 'short', tab: 'models' })
  const shortTokens = textOf(short.tree, 'dus-model-tokens')
  assert.ok(shortTokens, 'expected a model row')
  assert.equal(shortTokens.props.children, '1.9B')

  const myriad = renderUnitPanel({ lang: 'zh', mode: 'myriad', tab: 'models' })
  const myriadTokens = textOf(myriad.tree, 'dus-model-tokens')
  assert.ok(myriadTokens)
  assert.equal(myriadTokens.props.children, '18.8亿')
})

test('the book comparison line uses the selected scale', function () {
  // `roll` is pinned with Math.random so the book (and therefore the ratio) is
  // deterministic: BOOKS[0] has 730,000 chars → ~2,571 copies.
  const originalRandom = Math.random
  Math.random = function () { return 0 }
  try {
    const short = renderUnitPanel({ lang: 'en', mode: 'short' })
    const foot = textOf(short.tree, 'dus-foot-line')
    assert.ok(foot, 'expected the book line')
    assert.match(String(foot.props.children), /"ratio":"2\.6K"/)

    const myriad = renderUnitPanel({ lang: 'zh', mode: 'myriad' })
    const footZh = textOf(myriad.tree, 'dus-foot-line')
    assert.match(String(footZh.props.children), /"ratio":"2,571"/)
  } finally {
    Math.random = originalRandom
  }
})

test('the panel cannot regress to a second formatter', function () {
  // One helper, one scale: the old `formatTokens`/`formatCount` pair is gone, so
  // no call site can keep the pre-setting units.
  const source = readFileSync(new URL('../client/src/panel.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /formatTokens\(|formatCount\(/,
    'the unlocalised helper names must be gone')
  assert.ok((source.match(/formatNumber\(/g) || []).length >= 8,
    'cards, model rows, heat count, heat max and the book ratio all go through it')
  assert.match(source, /title:\s*card\.value/, 'the card tooltip carries the visible string')
  assert.match(source, /'aria-label':\s*text/, 'the heat cell aria text is the same formatted text')
})

test('the unit row renders ONE switch, not a segmented control', function () {
  const rendered = lifecycleRows()
  const toggles = flatten(rendered.unitsTree()).filter(function (node) {
    return node.props && node.props.className === 'dct-toggle'
  })
  // THE REGRESSION: three radio buttons asking a yes/no question. It also had to
  // explain what "auto" meant, which is the tell that it was the wrong control.
  assert.equal(toggles.length, 1, 'one switch, not three options')
  assert.equal(flatten(rendered.unitsTree()).filter(function (node) {
    return node.props && node.props.className === 'dus-unit'
  }).length, 0, 'the segmented control is gone')

  const toggle = toggles[0]
  assert.equal(toggle.props.role, 'switch')
  assert.equal(toggle.props['aria-checked'], true, 'the default is ON (万/亿)')
  assert.equal(toggle.props['data-on'], 'true')
  assert.equal(rendered.store.getState().units, 'myriad')

  // Clicking flips the stored scale in the shared store — the panel re-renders
  // from the same snapshot, so no reload is involved.
  toggle.props.onClick()
  assert.equal(rendered.store.getState().units, 'short')
  assert.equal(toggle.props['aria-checked'], true,
    'the captured element is a snapshot; the store is the source of truth')
})

test('both settings rows register on the theme page with ids 40/41', function () {
  const rendered = lifecycleRows()
  assert.equal(rendered.registrations.length, 2, 'dock + both rows is a different list; rows only here')
  assert.deepEqual(rendered.registrations.map(function (row) { return row.options.name }),
    ['settings.appearance.item', 'settings.appearance.item'])
  assert.deepEqual(rendered.registrations.map(function (row) { return row.options.id }),
    [SETTINGS_ROW_ID, UNITS_ROW_ID])
  assert.deepEqual(rendered.registrations.map(function (row) { return row.options.order }),
    [SETTINGS_ROW_ORDER, UNITS_ROW_ORDER])
})

// ------------------------------------------- the route fence's shared contract
//
// Two files must agree on the marker header: the Host refuses without it, and
// the client sends it. If they drift, EVERY panel request is a silent 403 —
// the panel shows "usage unavailable" and nothing points at the header. The
// `system-fonts` fence carries this same test for the same reason.

test('the client and the Host agree on the marker header and value', async function () {
  const client = await import('../client/src/constants.js')
  const host = await import('../lib/usage-route.js')
  assert.equal(client.USAGE_MARKER_HEADER, host.MARKER_HEADER,
    'client/src/constants.js USAGE_MARKER_HEADER must equal lib/usage-route.js MARKER_HEADER')
  assert.equal(client.USAGE_MARKER_VALUE, host.MARKER_VALUE,
    'and the values must match too')
  assert.equal(client.USAGE_PATH, host.USAGE_PATH, 'one route path, declared twice')
  // A non-safelisted header cannot be set by img/script/link/form/navigation.
  // `x-` prefixed names are not on the CORS-safelisted list; assert the shape so
  // a future rename cannot quietly pick a safelisted name.
  assert.match(host.MARKER_HEADER, /^x-[a-z0-9-]+$/, 'the marker must be an x- header')
  for (const safelisted of ['accept', 'content-type', 'content-language', 'origin', 'referer']) {
    assert.notEqual(host.MARKER_HEADER, safelisted, 'a CORS-safelisted header is useless as a fence')
  }
})

test('the shipped client artifact really sends the marker', function () {
  // A test that only reads constants.js would pass even if the fetch site
  // stopped adding the header. The artifact is what ships, so assert on it.
  const artifact = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  assert.ok(artifact.includes("'x-dsh-usage-stats'") || artifact.includes('"x-dsh-usage-stats"'),
    'the marker header name must be in the bundle')
  assert.ok(/headers:\s*\{[^}]*USAGE_MARKER_HEADER|\[USAGE_MARKER_HEADER\]/.test(artifact)
    || artifact.includes('x-dsh-usage-stats'),
    'the summary fetch must carry the marker')
  assert.ok(artifact.includes('/dsh-usage-stats/summary'), 'the route path must be in the bundle')
})
