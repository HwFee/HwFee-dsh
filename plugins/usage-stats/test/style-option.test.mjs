/**
 * The second panel style: `compact`.
 *
 * WHAT THIS FILE GUARDS. The panel now ships two looks the user picks in
 * settings — `classic` (unchanged) and `compact` (the reference's 480px flat
 * card). Three things can break silently and each is covered here:
 *
 *   1. THE STYLE MIGHT NOT ACTUALLY APPLY. The width lives on `.dus-root`, so a
 *      `[data-dus-style="compact"] .dus-root` rule would need an ANCESTOR with
 *      the attribute and would never match, while every descendant rule still
 *      worked. The root selector is asserted literally, and the rendered tree is
 *      asserted to put the attribute on the same element the width is on.
 *   2. THE HEIGHT SETTING MIGHT BE IGNORED. Both styles store their own height;
 *      the compact style's own default must be its natural 252px rather than
 *      classic's 344, and the slider must edit the style in view. A style that
 *      showed a height control while rendering something else is the failure.
 *   3. THE CLASSIC STYLE MIGHT DRIFT. Every compact rule is scoped to the root
 *      attribute, so the shipped rules must be untouched — asserted by diffing
 *      the classic declarations against the ones they had.
 *   4. THE CARD GEOMETRY MIGHT BE WRITTEN TWICE. The 480px width and the 12px
 *      inset live in `compact-layout.js` as constants and again as literals in
 *      the stylesheet, with nothing tying them together — the audit flagged it.
 *      One assertion makes the sheet's numbers the module's numbers, and another
 *      makes the caption's reserved 16px box a one-line, visibly-ellipsised box
 *      rather than something a second line could overflow invisibly.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPACT_BLOCK_GAP,
  COMPACT_CELL_CEIL,
  COMPACT_CELL_FLOOR,
  COMPACT_DEFAULT_BODY_HEIGHT,
  COMPACT_BOTTOM_GAP,
  COMPACT_HEAT_GAP,
  COMPACT_HEAT_ROWS,
  COMPACT_PAD,
  COMPACT_PANEL_WIDTH,
  COMPACT_TILE_GAP,
  COMPACT_TILE_HEIGHT,
  compactCellForHeight,
  compactFixedHeight,
  compactLayout,
  compactVars,
} from '../client/src/compact-layout.js'
import {
  BODY_HEIGHT_STEP,
  DEFAULT_BODY_HEIGHT,
  DEFAULT_STYLE,
  MAX_BODY_HEIGHT,
  MIN_BODY_HEIGHT,
  PANEL_STYLES,
  bodyHeightKey,
  bodyHeightOf,
  bodyHeightStyle,
  clampStyle,
  createSettingsStore,
  isCompact,
  sanitizeSettings,
} from '../client/src/settings.js'
import { PANEL_CSS } from '../client/src/styles.js'
import { createPanel } from '../client/src/panel.js'
import {
  SETTINGS_ROW_ID, SETTINGS_ROW_ORDER, STORAGE_KEY,
  STYLE_ROW_ID, STYLE_ROW_ORDER, UNITS_ROW_ID, UNITS_ROW_ORDER,
} from '../client/src/constants.js'
import { createLifecycle } from '../client/src/lifecycle.js'
import { en, zh } from '../client/src/locales.js'

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

// ------------------------------------------------------------ the geometry

test('the compact card is 480px with a 12px inset on every side', function () {
  assert.equal(COMPACT_PANEL_WIDTH, 480, 'the reference panel width')
  assert.equal(COMPACT_PAD, 12)
  // The inner width is what the heat columns share.
  assert.equal(COMPACT_PANEL_WIDTH - COMPACT_PAD * 2, 456)
})

test('the compact default height is the natural sum, and lands on the slider grid', function () {
  // The reference's own parts add up to exactly this, which is why the default is
  // not classic's 344: reusing 344 would leave ~92px of empty card and lose the
  // compact read entirely.
  assert.equal(compactFixedHeight(),
    COMPACT_TILE_HEIGHT * 2 + COMPACT_TILE_GAP + COMPACT_BLOCK_GAP * 2 + COMPACT_BOTTOM_GAP)
  assert.equal(compactFixedHeight(), 136)
  // Seven 14px cells and the six gaps between them complete the card.
  const natural = compactFixedHeight() + COMPACT_HEAT_GAP * (COMPACT_HEAT_ROWS - 1)
    + 14 * COMPACT_HEAT_ROWS
  assert.equal(natural, 252)
  assert.equal(COMPACT_DEFAULT_BODY_HEIGHT, natural,
    'the default is exactly tiles + gaps + caption + a 14px-cell grid, with no slack')
  // It must be reachable by the shared control.
  assert.equal((COMPACT_DEFAULT_BODY_HEIGHT - MIN_BODY_HEIGHT) % BODY_HEIGHT_STEP, 0)
  assert.ok(COMPACT_DEFAULT_BODY_HEIGHT >= MIN_BODY_HEIGHT
    && COMPACT_DEFAULT_BODY_HEIGHT <= MAX_BODY_HEIGHT)
  assert.notEqual(COMPACT_DEFAULT_BODY_HEIGHT, DEFAULT_BODY_HEIGHT,
    'the compact default is its own number, not the classic height')
})

test('the heat grid is always seven rows and never has a clipping mode', function () {
  assert.equal(COMPACT_HEAT_ROWS, 7)
  // Seven cells of `cell` plus six gaps is what the grid paints; the stylesheet
  // writes no height for it, so every row draws.
  const layout = compactLayout(COMPACT_DEFAULT_BODY_HEIGHT)
  assert.equal(layout.band, layout.cell * 7 + COMPACT_HEAT_GAP * 6)
})

test('the height setting decides the cell size, bounded by the floor and the ceiling', function () {
  // The natural height draws the reference's own 14px column.
  assert.equal(compactLayout(COMPACT_DEFAULT_BODY_HEIGHT).cell, 14)
  assert.equal(compactLayout(COMPACT_DEFAULT_BODY_HEIGHT).heightBound, true,
    'at its natural height the cells are what the height allows')

  // Shrinking the card shrinks the squares: this is what makes the control honest
  // for this style rather than a slider that changes nothing.
  const smallest = compactLayout(MIN_BODY_HEIGHT)
  const middle = compactLayout(248)
  const natural = compactLayout(COMPACT_DEFAULT_BODY_HEIGHT)
  assert.equal(smallest.cell, 12, 'the shortest card the slider allows draws a 12px cell')
  assert.equal(middle.cell, 13)
  assert.ok(smallest.cell < middle.cell, 'a shorter card draws smaller cells')
  assert.ok(middle.cell < natural.cell)
  assert.equal(smallest.heightBound && middle.heightBound && natural.heightBound, true)

  // Above the natural height the cells stop growing: the card is taller than its
  // content, and the surplus is empty card — the same "reserved height pads"
  // contract the classic tab has. The ceiling is the reference's own column, so
  // the card never stops looking compact.
  for (const height of [300, 400, MAX_BODY_HEIGHT]) {
    assert.equal(compactLayout(height).cell, COMPACT_CELL_CEIL)
    assert.equal(compactLayout(height).heightBound, false,
      'the height is no longer what limits the cells')
  }
  // The floor is a guard for a future range, not a value the shipped slider can
  // reach: the 240px end still draws a legible 12px cell.
  assert.ok(compactLayout(MIN_BODY_HEIGHT).cell > COMPACT_CELL_FLOOR,
    'the shipped range never bottoms out at the floor')

  // Every value in range stays inside the bounds and produces a usable grid.
  for (let height = MIN_BODY_HEIGHT; height <= MAX_BODY_HEIGHT; height += BODY_HEIGHT_STEP) {
    const layout = compactLayout(height)
    assert.ok(layout.cell >= COMPACT_CELL_FLOOR && layout.cell <= COMPACT_CELL_CEIL,
      `${height} -> ${layout.cell}px is outside the bounds`)
    assert.equal(layout.height, height)
  }
})

test('the cell size never regresses as the panel grows', function () {
  let previous = 0
  for (let height = MIN_BODY_HEIGHT; height <= MAX_BODY_HEIGHT; height += BODY_HEIGHT_STEP) {
    const cell = compactCellForHeight(height)
    assert.ok(cell >= previous, `cell shrank from ${previous} to ${cell} at ${height}px`)
    previous = cell
  }
})

test('compactVars emits only the column cap and the fixed block metrics', function () {
  const vars = compactVars(COMPACT_DEFAULT_BODY_HEIGHT)
  assert.equal(vars['--dus-compact-cell'], '14px')
  assert.equal(vars['--dus-compact-tile-h'], COMPACT_TILE_HEIGHT + 'px')
  assert.equal(vars['--dus-compact-tile-gap'], COMPACT_TILE_GAP + 'px')
  assert.equal(vars['--dus-compact-block-gap'], COMPACT_BLOCK_GAP + 'px')
  assert.equal(vars['--dus-compact-heat-gap'], COMPACT_HEAT_GAP + 'px')
  // No height of the grid or of the card is ever written: both are outcomes.
  for (const name of Object.keys(vars)) {
    assert.doesNotMatch(name, /band|body|panel/, name + ' must not name a height')
    assert.match(vars[name], /^\d+(?:\.\d+)?px$/, name + ' is a px length')
  }
})

// ------------------------------------------------------------ the style setting

test('classic is the default, and only the two known styles survive', function () {
  assert.equal(DEFAULT_STYLE, 'classic', 'an upgrade must not change what the user sees')
  assert.deepEqual(PANEL_STYLES, ['classic', 'compact'])
  assert.equal(clampStyle('compact'), 'compact')
  assert.equal(clampStyle('classic'), 'classic')
  for (const value of ['fancy', '', null, undefined, 42, {}, true]) {
    assert.equal(clampStyle(value), 'classic', `${String(value)} → classic`)
  }
  assert.equal(isCompact('compact'), true)
  assert.equal(isCompact(undefined), false)
})

test('each style keeps its own height, so neither rewrites the other', function () {
  const defaults = sanitizeSettings(null)
  assert.equal(defaults.style, 'classic')
  assert.equal(defaults.bodyHeight, DEFAULT_BODY_HEIGHT)
  assert.equal(defaults.compactBodyHeight, COMPACT_DEFAULT_BODY_HEIGHT)

  // The classic payload from a build without the option keeps its height and
  // gains the compact default; nothing the user chose is lost.
  assert.equal(sanitizeSettings({ bodyHeight: 412 }).bodyHeight, 412)
  assert.equal(sanitizeSettings({ bodyHeight: 412 }).compactBodyHeight,
    COMPACT_DEFAULT_BODY_HEIGHT)

  // `bodyHeightOf` reads the field of the style in view.
  assert.equal(bodyHeightOf({ style: 'classic', bodyHeight: 344, compactBodyHeight: 252 }), 344)
  assert.equal(bodyHeightOf({ style: 'compact', bodyHeight: 344, compactBodyHeight: 252 }), 252)
  assert.equal(bodyHeightKey('compact'), 'compactBodyHeight')
  assert.equal(bodyHeightKey('classic'), 'bodyHeight')
})

test('the body height is FIXED per style, and the style switch persists', function () {
  const storage = makeStorage()
  const store = createSettingsStore(storage)

  // There is no height preference any more: each style carries its own number,
  // and `bodyHeightOf` reports that number whatever the stored state says.
  // Removing the slider was the point — a value under the design height either
  // dropped heat rows or clipped the caption, both silently.
  assert.equal(bodyHeightOf({ style: 'classic' }), DEFAULT_BODY_HEIGHT)
  assert.equal(bodyHeightOf({ style: 'compact' }), COMPACT_DEFAULT_BODY_HEIGHT)
  assert.equal(bodyHeightOf({ style: 'compact', compactBodyHeight: 288 }), COMPACT_DEFAULT_BODY_HEIGHT,
    'a leftover persisted height is ignored, not honoured')
  assert.equal(bodyHeightOf({ style: 'classic', bodyHeight: 520 }), DEFAULT_BODY_HEIGHT,
    'and so is a leftover classic one')

  // Picking a style still writes and persists, and never touches a height.
  assert.equal(store.setStyle('compact'), 'compact')
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).style, 'compact',
    'the choice persists')
  assert.equal(bodyHeightOf(store.getState()), COMPACT_DEFAULT_BODY_HEIGHT)
  store.setStyle('classic')
  assert.equal(bodyHeightOf(store.getState()), DEFAULT_BODY_HEIGHT)

  // Setting the same style twice notifies nobody.
  const before = store.getState()
  store.setStyle('classic')
  assert.equal(store.getState(), before, 'a no-op style write keeps the snapshot')

  // A fresh store over the same storage reads the style back and reports the
  // same fixed height.
  const remounted = createSettingsStore(storage)
  assert.equal(remounted.getState().style, 'classic')
  assert.equal(bodyHeightOf(remounted.getState()), DEFAULT_BODY_HEIGHT)
})

test('bodyHeightStyle emits ONLY the active style\'s lengths', function () {
  const classic = bodyHeightStyle(344, 1200, 'classic')
  const compact = bodyHeightStyle(COMPACT_DEFAULT_BODY_HEIGHT, 1200, 'compact')
  assert.ok('--dus-heat-cell-max' in classic, 'the classic shrink lengths are emitted')
  assert.ok(!('--dus-heat-cell-max' in compact),
    'a stale classic length must not leak into the compact style')
  assert.equal(compact['--dus-compact-cell'], '14px')
  assert.ok(!('--dus-compact-cell' in classic))
  // Both carry the one height variable the tab body consumes.
  assert.equal(classic['--dus-body-height'], '344px')
  assert.equal(compact['--dus-body-height'], COMPACT_DEFAULT_BODY_HEIGHT + 'px')
  // The call without a style keeps the classic behaviour it had before the option.
  assert.deepEqual(bodyHeightStyle(344, 1200), classic)
})

// ------------------------------------------------------------ the stylesheet

/** Every `selector { body }` pair of the flat sheet plus its @media blocks. */
function cssRules(css) {
  const rules = []
  const re = /([^{}@]+)\{([^{}]*)\}/g
  let match = re.exec(css)
  while (match !== null) {
    rules.push({ selector: match[1].trim().replace(/\s+/g, ' '), body: match[2] })
    match = re.exec(css)
  }
  return rules
}

test('the compact width rule matches the element that carries the attribute', function () {
  // THE REGRESSION. `data-dus-style` is written on `.dus-root` itself, so a
  // `[data-dus-style="compact"] .dus-root` selector needs an ancestor and never
  // matches — the width would stay at the composer's while every descendant rule
  // applied. The root rule must therefore be the compound selector.
  const rules = cssRules(PANEL_CSS)
  const widthRule = rules.find(function (rule) {
    return /\.dus-root/.test(rule.selector) && /width:\s*480px/.test(rule.body)
  })
  assert.ok(widthRule, 'expected a 480px width rule for the compact style')
  assert.equal(widthRule.selector, '.dus-root[data-dus-style="compact"]',
    'the width must be declared on the root itself, not on a descendant of it')
  assert.match(widthRule.body, /max-width:\s*calc\(100% - /,
    'a narrow window must still cap the card')

  // No other rule may assume an ancestor carries the attribute.
  for (const rule of rules) {
    if (!/^\[data-dus-style="compact"\]\s+\.dus-root\b/.test(rule.selector)) continue
    assert.fail('a descendant form of the root selector cannot match: ' + rule.selector)
  }
})

test('the stylesheet and the layout module agree on the compact card geometry', function () {
  // THE AUDIT FINDING. `compact-layout.js` derives the heat column from a 480px
  // card with a 12px inset (`COMPACT_PANEL_WIDTH`, `COMPACT_PAD`), and
  // `styles.js` writes both numbers a second time (`.dus-root[...] { width:
  // 480px }`, `.dus-panel { padding: 12px }`). Nothing tied the two copies
  // together, so the module could be retuned and the card would silently keep
  // rendering at the old width with every derived column already wrong — the
  // exact class of silent failure this repo pays for. These assertions are the
  // tie: the stylesheet numbers must be the module's constants, not equal-looking
  // literals.
  const rules = cssRules(PANEL_CSS)
  const root = rules.find(function (rule) {
    return rule.selector === '.dus-root[data-dus-style="compact"]'
  })
  assert.ok(root, 'expected the compact root rule')
  assert.match(root.body, new RegExp('width:\\s*' + COMPACT_PANEL_WIDTH + 'px\\s*[;}]'),
    'the card width in the sheet must be COMPACT_PANEL_WIDTH')

  const panel = rules.find(function (rule) {
    return rule.selector === '[data-dus-style="compact"] .dus-panel'
  })
  assert.ok(panel, 'expected the compact panel rule')
  // One value for all four sides, so a single `padding:` declaration is what the
  // arithmetic assumes; `COMPACT_PAD` is that value.
  assert.match(panel.body, new RegExp('(?:^|;)\\s*padding:\\s*' + COMPACT_PAD + 'px\\s*(?:;|$)'),
    'the card inset in the sheet must be COMPACT_PAD, on all four sides')

  // The two numbers together are what the module divides: the inner width the
  // heat columns share.
  const inner = COMPACT_PANEL_WIDTH - COMPACT_PAD * 2
  assert.equal(inner, 456, 'the derived inner width the column arithmetic assumes')
  // And the sheet declares no second padding that could override the inset.
  const paddings = panel.body.match(/padding[^:]*:\s*[^;]+/g) || []
  assert.equal(paddings.length, 1, 'exactly one padding declaration: ' + paddings.join(' | '))
})

test('the bottom strip is reserved but no caption is drawn, and the grid keeps its 14px cells', function () {
  // THE REGRESSION THIS GUARDS. The compact body height is exactly
  // `compactFixedHeight() + grid`: 252 = 136 + 116. The 16px inside the 136 was
  // the caption's line box, and the caption is now gone. Dropping the
  // reservation WITH the caption would have enlarged every heat square
  // (14px → 15px, `COMPACT_CELL_CEIL`) and pulled the seven rows taller — the
  // user asked for the line to go, not for the grid to grow. So the reservation
  // stays and the strip simply stands empty under the grid.
  const layout = compactLayout(COMPACT_DEFAULT_BODY_HEIGHT)
  assert.equal(layout.height, compactFixedHeight() + layout.band,
    'the default body is still exactly fixed blocks + grid')
  assert.equal(layout.cell, 14, 'the grid still draws 14px cells')
  assert.equal(COMPACT_BOTTOM_GAP, 16, 'the strip is the reservation the caption left behind')

  const rules = cssRules(PANEL_CSS)
  const find = function (selector) {
    const rule = rules.find(function (entry) { return entry.selector === selector })
    assert.ok(rule, 'expected a rule for ' + selector)
    return rule
  }

  // No caption rule survives in either style, in any scope.
  assert.ok(!/\.dus-foot\b/.test(PANEL_CSS), 'no classic caption rule')
  assert.ok(!/dus-foot-line/.test(PANEL_CSS), 'no caption line rule')
  assert.ok(!rules.some(function (rule) { return /dus-foot/.test(rule.selector) }),
    'no compact caption rule either')

  // The strip is a BUDGET, not a painted length, so it is not emitted as a
  // custom property: an unused var invites a rule to start reading it.
  assert.equal(compactVars(COMPACT_DEFAULT_BODY_HEIGHT)['--dus-compact-bottom-gap'],
    undefined, 'the strip is budgeted in JS only')

  // The body still clips at its persisted height, which is what makes the fixed
  // height the contract rather than a suggestion.
  const body = find('.dus-body')
  assert.match(body.body, /height:\s*var\(--dus-body-height/)
  assert.match(body.body, /overflow:\s*hidden/)
})

test('every compact rule is scoped, so the classic sheet is untouched', function () {
  const compactRules = cssRules(PANEL_CSS).filter(function (rule) {
    return /dus-root\[data-dus-style|\[data-dus-style="compact"\]/.test(rule.selector)
  })
  // A floor, not a target: this guards against the block silently vanishing.
  // It is 20 today because the compact rules now carry only what DIFFERS from
  // classic — the head chip and the tile geometry became the base rules (they
  // are the reference's own numbers), so their compact copies were deleted
  // rather than left to drift.
  assert.ok(compactRules.length >= 18, 'the compact block should be substantial')

  // The classic `.dus-card` / `.dus-heat` rules the shipped panel relies on must
  // be the same declarations they always were: a compact block that edited them
  // in place would restyle the default look.
  const card = cssRules(PANEL_CSS).filter(function (rule) { return rule.selector === '.dus-card' })
  assert.equal(card.length, 1, 'exactly one unscoped .dus-card rule')
  assert.match(card[0].body, /color-mix\(in srgb, var\(--dsw-alias-label-primary\) 11%,/,
    'the classic tile keeps its own deeper fill')
  const heat = cssRules(PANEL_CSS).filter(function (rule) { return rule.selector === '.dus-heat' })
  assert.equal(heat.length, 1, 'exactly one unscoped .dus-heat rule')
  assert.match(heat[0].body, /background:\s*var\(--dsw-alias-bg-module-platform\)/,
    'the classic band keeps its own surface')

  // The compact overrides exist for the same elements, under the scope.
  const scoped = function (suffix) {
    return compactRules.some(function (rule) {
      return new RegExp('\\s\\.' + suffix + '$').test(rule.selector)
    })
  }
  assert.ok(scoped('dus-card'), 'the compact style overrides the tile')
  assert.ok(scoped('dus-heat'), 'the compact style overrides the band')
  // The caption has no compact override because it has no rule at all any more.
  assert.ok(!scoped('dus-foot'), 'the removed caption has no compact rule')
})

test('the compact look is a flat card with no band and no divider', function () {
  const rules = cssRules(PANEL_CSS)
  const find = function (suffix) {
    const rule = rules.find(function (entry) {
      return entry.selector.indexOf('[data-dus-style="compact"]') === 0
        && new RegExp('\\s\\.' + suffix + '\\s*$').test(entry.selector)
    })
    assert.ok(rule, 'expected a compact rule for .' + suffix)
    return rule
  }
  // Panel: a wash, no stroke, no elevation.
  const panel = find('dus-panel')
  assert.match(panel.body, /box-shadow:\s*none/)
  assert.match(panel.body, /border-radius:\s*12px/)
  assert.match(panel.body, /color-mix\(in srgb, var\(--dsw-alias-label-primary\) 4%,/,
    'the card is one tone of wash over the layer-2 surface')
  // Heat grid: on the card, not on a band of its own.
  const heat = find('dus-heat')
  assert.match(heat.body, /background:\s*transparent/)
  assert.match(heat.body, /padding:\s*0/)
  // Tiles are one tone deeper than the wash.
  const card = find('dus-card')
  assert.match(card.body, /color-mix\(in srgb, var\(--dsw-alias-label-primary\) 15%,/,
    'the tile sits one tone deeper than the panel wash')
})

test('the heat ramp uses the project accent, not a pinned data blue', function () {
  // The reference draws its grid in a data blue. This plugin follows the theme
  // token instead, so the grid tracks the accent the user picked — the whole
  // panel is documented as reading host tokens only.
  const rules = cssRules(PANEL_CSS).filter(function (rule) {
    return rule.selector.indexOf('[data-dus-style="compact"]') === 0
      && /dus-heat-cell\[data-level="[1-4]"\]/.test(rule.selector)
  })
  assert.equal(rules.length, 4, 'four lit levels in the compact ramp')
  for (const rule of rules) {
    assert.match(rule.body, /var\(--dsw-alias-state-business-primary\)/,
      rule.selector + ' must paint from the accent token')
  }
  // The reference's own blue is not written anywhere in the sheet.
  assert.ok(!/#3b6ecf/i.test(PANEL_CSS), 'no pinned reference blue in the shipped sheet')
  // The level-0 cell is the faint label ink on the card.
  const zero = cssRules(PANEL_CSS).filter(function (rule) {
    return /^\[data-dus-style="compact"\] \.dus-heat-cell\s*$/.test(rule.selector)
  })[0]
  assert.ok(zero, 'expected the base cell rule')
  assert.match(zero.body, /var\(--dsw-alias-label-primary\) 11%/)
})

test('the style control carries the project curve and stands still under reduced motion', function () {
  const css = PANEL_CSS
  const seg = cssRules(css).filter(function (rule) { return rule.selector === '.dus-seg-btn' })[0]
  assert.ok(seg, 'expected the style control rule')
  assert.match(seg.body, /var\(--cds-ease-snap,\s*cubic-bezier/,
    'the press feedback uses the project snap curve, never a generic ease')
  assert.ok(!/\bease-in-out\b/.test(seg.body), 'no generic ease-in-out')
  assert.ok(!/(?<![\w-])ease(?=[,;\s])/.test(seg.body), 'no bare `ease`')
  assert.match(seg.body, /var\(--ds-transition-duration-fast,/, 'the project duration token')

  // Reduced motion means STILL: both the transition and the press scale are gone.
  // The sheet already has a reduced-motion block for the tab slide, so this finds
  // the one that names the style control rather than the first at-rule.
  const start = css.indexOf('@media (prefers-reduced-motion: reduce) { .dus-seg-btn')
  assert.ok(start >= 0, 'expected a reduced-motion block for the style control')
  const block = css.slice(start, css.indexOf('}', css.indexOf('}', start) + 1) + 1)
  assert.match(block, /\.dus-seg-btn \{ transition: none; \}/,
    'the transition is dropped, not merely slowed')
  assert.match(block, /\.dus-seg-btn:active \{ transform: none; \}/,
    'the press scale is dropped too: reduced motion means no movement')
  // It is scoped to the new control: the shipped tab/range motion is untouched.
  assert.ok(block.indexOf('.dus-tab') < 0 && block.indexOf('.dus-range') < 0,
    'the reduced-motion block must not reach the shipped controls')
})

// ------------------------------------------------------------ the rendered panel

function makeReactStub() {
  return {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const next = Object.assign({}, props)
      if (children.length === 1) next.children = children[0]
      else if (children.length > 1) next.children = children
      return { type, props: next, children }
    },
    useState(initial) { return [typeof initial === 'function' ? initial() : initial, function () {}] },
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
    if (Array.isArray(node)) { for (const child of node) walk(child); return }
    if (!node || typeof node !== 'object') return
    out.push(node)
    walk(node.children)
  })(tree)
  return out
}

/**
 * A summary in the Host route's own shape. The panel paints from `peekSummary`
 * on its first frame, so a stub that answers here renders the real Overview —
 * six tiles, the heat grid and the caption — with no network and no timer.
 */
const SUMMARY = {
  sessions: 177,
  messages: 29527,
  totalTokens: 7146401944,
  activeDays: 6,
  peakHour: 16,
  perDay: {
    '2026-10-17': 3505, '2026-10-18': 7182, '2026-10-19': 5496,
    '2026-10-20': 1447, '2026-10-21': 7115, '2026-10-22': 4782,
  },
  perHour: new Array(24).fill(0),
  perModel: {
    'qoder-cn/dfmodel': { tokens: 5000000000, messages: 12000 },
    'workbuddy/deepseek-v4.1-flash': { tokens: 2000000000, messages: 9000 },
  },
}

function renderPanel(store) {
  const panel = createPanel({ React: makeReactStub(), primitives: {}, settings: store })
  return panel.Panel({
    session: { blank: true, running: false, promptAttempted: false },
    fetchSummary: function () { return Promise.resolve(SUMMARY) },
    peekSummary: function () { return SUMMARY },
    t: function (key) { return key },
  })
}

test('the root carries the style attribute AND the width the stylesheet targets', function () {
  const store = createSettingsStore(makeStorage())
  const classicRoot = flatten(renderPanel(store))
    .find(function (node) { return node.props?.className === 'dus-root' })
  assert.ok(classicRoot, 'the root rendered')
  assert.equal(classicRoot.props['data-dus-style'], 'classic',
    'the shipped style is named explicitly rather than left off')

  store.setStyle('compact')
  const tree = renderPanel(store)
  const root = flatten(tree).find(function (node) { return node.props?.className === 'dus-root' })
  assert.equal(root.props['data-dus-style'], 'compact',
    'the attribute the width rule keys on is on the element that rule selects')
  // The panel is the child that receives the derived lengths, and it must carry
  // the compact set (not the classic one) so nothing leaks across styles.
  const panelEl = flatten(tree).find(function (node) { return node.props?.className === 'dus-panel' })
  assert.equal(panelEl.props.style['--dus-compact-cell'], '14px')
  assert.ok(!('--dus-heat-cell-max' in panelEl.props.style))
  assert.equal(panelEl.props.style['--dus-body-height'], COMPACT_DEFAULT_BODY_HEIGHT + 'px',
    'the compact card is sized by the compact height, not by classic\'s 344')
})

test('the compact card renders at its own fixed height, and classic at 344', function () {
  const store = createSettingsStore(makeStorage())
  store.setStyle('compact')
  // A stale slider value from an older build must not resize anything.
  store.setBodyHeight(288)
  const panelEl = flatten(renderPanel(store))
    .find(function (node) { return node.props?.className === 'dus-panel' })
  assert.equal(panelEl.props.style['--dus-body-height'], COMPACT_DEFAULT_BODY_HEIGHT + 'px',
    'the compact card keeps its designed 252px whatever is stored')
  assert.equal(panelEl.props.style['--dus-compact-cell'], '14px',
    'and the cells stay at the size that ratio implies')

  store.setStyle('classic')
  const classicEl = flatten(renderPanel(store))
    .find(function (node) { return node.props?.className === 'dus-panel' })
  assert.equal(classicEl.props.style['--dus-body-height'], DEFAULT_BODY_HEIGHT + 'px',
    'classic renders at 344')
})

test('every metric tile is named, so the compact model tile can drop its emphasis', function () {
  const store = createSettingsStore(makeStorage())
  const tree = renderPanel(store)
  const cards = flatten(tree).filter(function (node) {
    return node.props?.className === 'dus-card'
  })
  assert.equal(cards.length, 6, 'six tiles in both styles')
  assert.deepEqual(cards.map(function (card) { return card.props['data-card'] }),
    ['sessions', 'messages', 'tokens', 'days', 'peak', 'model'])
  // The compact stylesheet reads `[data-card="model"]`, so the hook has to exist.
  assert.match(PANEL_CSS, /\[data-dus-style="compact"\] \.dus-card\[data-card="model"\]/,
    'the model tile is set at the label weight in the compact style')
})

// ------------------------------------------------------------ the settings rows

test('the style row sits above the height row, and the shipped ids keep their orders', function () {
  assert.equal(STYLE_ROW_ID, 'dsh-usage-stats-panel-style')
  assert.equal(SETTINGS_ROW_ID, 'dsh-usage-stats-panel-height')
  assert.equal(UNITS_ROW_ID, 'dsh-usage-stats-units')
  assert.equal(STYLE_ROW_ORDER, 39, 'pick a style, then size it')
  assert.equal(SETTINGS_ROW_ORDER, 40, 'unchanged from the shipped row')
  assert.equal(UNITS_ROW_ORDER, 41, 'unchanged from the shipped row')
  assert.ok(STYLE_ROW_ORDER < SETTINGS_ROW_ORDER)
  assert.ok(SETTINGS_ROW_ORDER < UNITS_ROW_ORDER)
})

test('both rows register together, in reading order, on the same page', function () {
  const registrations = []
  const store = createSettingsStore(makeStorage())
  const slots = {
    inject(key, callback) { callback(); return function () {} },
    register(options, component) {
      registrations.push({ options: options, component: component })
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

  const rows = registrations.filter(function (row) {
    return row.options.name === 'settings.appearance.item'
  })
  // Two rows, not three: the height slider is gone, because each style's height
  // is part of its design rather than a preference.
  assert.deepEqual(rows.map(function (row) { return row.options.id }),
    [STYLE_ROW_ID, UNITS_ROW_ID], 'one list, in reading order')
  assert.deepEqual(rows.map(function (row) { return row.options.order }),
    [STYLE_ROW_ORDER, UNITS_ROW_ORDER])
  for (const row of rows) {
    assert.equal(row.options.locale, 'dsh-usage-stats')
  }
})

test('the style row renders two buttons and the chosen one is marked', function () {
  const registrations = []
  const store = createSettingsStore(makeStorage())
  const slots = {
    inject(key, callback) { callback(); return function () {} },
    register(options, component) {
      registrations.push({ options: options, component: component })
      return function () {}
    },
  }
  createLifecycle({
    React: makeReactStub(),
    primitives: {},
    panel: { Panel: function () { return null } },
    fetchSummary: function () {},
    peekSummary: function () { return null },
    settings: store,
  })({
    slots: slots,
    locale: { register: function () { return function () {} } },
    effect: function (fn) { fn(); return function () {} },
  })

  const styleRow = registrations.filter(function (row) { return row.options.id === STYLE_ROW_ID })[0]
  const tree = styleRow.component({ t: function (key) { return key } })
  const buttons = flatten(tree).filter(function (node) {
    return node.props?.className === 'dus-seg-btn'
  })
  assert.deepEqual(buttons.map(function (btn) { return btn.props['data-style'] }),
    ['classic', 'compact'])
  assert.deepEqual(buttons.map(function (btn) { return btn.props['data-active'] }),
    ['true', 'false'], 'classic is selected by default')
  assert.deepEqual(buttons.map(function (btn) { return btn.props['aria-pressed'] }),
    [true, false], 'and says so to assistive tech')
  // Clicking writes the store, which is what re-renders the panel.
  buttons[1].props.onClick()
  assert.equal(store.getState().style, 'compact')
})

test('both dictionaries name the style row, in one language each', function () {
  const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const key of ['settings.style.title', 'settings.style.desc',
    'settings.style.classic', 'settings.style.compact', 'settings.style.aria']) {
    assert.ok(key in en && key in zh, key + ' exists in both dictionaries')
    assert.ok(!CJK.test(en[key]), 'en.' + key + ' must not contain Chinese')
    assert.ok(CJK.test(zh[key]), 'zh.' + key + ' must be Chinese')
  }
  // The style names are the user's own words for the two options.
  assert.equal(zh['settings.style.classic'], '现有')
  assert.equal(zh['settings.style.compact'], '参考')
  assert.equal(en['settings.style.classic'], 'Classic')
  assert.equal(en['settings.style.compact'], 'Compact')
})
