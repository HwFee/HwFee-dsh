/**
 * The Overview shrink arithmetic: the tab fits the body at every setting by
 * drawing smaller graphics, never by growing a scrollbar.
 *
 * `layout.js` is pure (no DOM, no browser size), so the whole model is asserted
 * here: the fixed/heat budget, the tier walk, the cell cap, the font floors and
 * the guarantee that the emitted lengths add up to no more than the body height.
 *
 *   node test/layout.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CARD_LABEL_FLOOR,
  CARD_VALUE_FLOOR,
  HEAT_CELL_FLOOR,
  HEAT_CELL_MAX,
  HEAT_SCROLLBAR_RESERVE,
  LAYOUT_TIERS,
  MAX_BODY_HEIGHT,
  MIN_BODY_HEIGHT,
  NARROW_VIEWPORT_PX,
  TIP_INSET,
  TIP_MAX_WIDTH,
  bandHeight,
  cardHeight,
  fixedHeight,
  gridRows,
  overviewLayout,
  overviewVars,
  tipCentre,
} from '../client/src/layout.js'
import { MIN_BODY_HEIGHT as SETTINGS_MIN, MAX_BODY_HEIGHT as SETTINGS_MAX } from '../client/src/settings.js'

/** Every setting the slider can produce. */
function allSettings() {
  const out = []
  for (let h = MIN_BODY_HEIGHT; h <= MAX_BODY_HEIGHT; h += 4) out.push(h)
  return out
}

const ROOMY = LAYOUT_TIERS[0]

test('the module agrees with the slider range it mirrors', function () {
  assert.equal(MIN_BODY_HEIGHT, SETTINGS_MIN)
  assert.equal(MAX_BODY_HEIGHT, SETTINGS_MAX)
  assert.equal(HEAT_CELL_MAX, 22, 'the design cap on a column')
  assert.equal(NARROW_VIEWPORT_PX, 560, 'the stylesheet breakpoint that makes the grid 3 rows')
})

test('the roomy tier reproduces the measured fixed height (147px, two rows)', function () {
  // cards 2×55 + 6 = 116, grid→band gap 10, foot gap 4 + 17 = 21 → 147.
  // (It was 161.5 while the foot carried a .5px divider plus 8px of padding-top
  // on top of the stack gap; that air is now a single 4px gap and the 14.5px it
  // used to occupy goes to the heat budget.)
  assert.equal(cardHeight(ROOMY), 55, 'card = 8+8 padding + 15 label + 2 gap + 22 value')
  assert.equal(fixedHeight(ROOMY, 2), 147)
  assert.equal(ROOMY.footGap, 4, 'the foot is held off the band by one gap, not two')
  assert.equal(gridRows(1200), 2, 'three cards across → two rows')
  assert.equal(gridRows(NARROW_VIEWPORT_PX), 3, 'two cards across → three rows')
  assert.equal(gridRows(NARROW_VIEWPORT_PX + 1), 2)
  assert.equal(gridRows(undefined), 2, 'no measurement → assume the wide layout')
})

test('every setting fits its body at both grid shapes, with no scroll', function () {
  for (const width of [320, NARROW_VIEWPORT_PX, 1200]) {
    const rows = gridRows(width)
    for (const height of allSettings()) {
      const layout = overviewLayout(height, { viewportWidth: width })
      const used = fixedHeight(LAYOUT_TIERS.find(function (tier) {
        return tier.id === layout.tier
      }), rows) + layout.band
      assert.ok(used <= height + 0.001,
        'width ' + width + ' H ' + height + ' (' + layout.tier + '): content ' + used
        + ' exceeds the body')
      assert.ok(layout.cell >= HEAT_CELL_FLOOR, 'cell ' + layout.cell + ' below the floor')
      assert.ok(layout.cell <= HEAT_CELL_MAX, 'cell ' + layout.cell + ' above the design cap')
    }
  }
})

test('within a tier the cell grows monotonically with the body', function () {
  // ACROSS a tier boundary the cell may step DOWN a few px: growing the panel
  // first restores type and spacing (the reverse of the shrink order), and that
  // costs the band its extra budget. WITHIN one tier, a taller body must never
  // draw smaller squares.
  for (const width of [400, 1200]) {
    let previous = null
    for (const height of allSettings()) {
      const layout = overviewLayout(height, { viewportWidth: width })
      if (previous !== null && previous.tier === layout.tier) {
        assert.ok(layout.cell >= previous.cell,
          'width ' + width + ' H ' + height + ': cell fell ' + previous.cell + ' -> '
          + layout.cell + ' inside tier ' + layout.tier)
      }
      previous = layout
    }
  }
  // At the very top of the range the graphics sit on the design cap, and the
  // handover steps are small enough that no setting drops below 6px.
  const cells = allSettings().map(function (height) {
    return overviewLayout(height, { viewportWidth: 1200 }).cell
  })
  assert.equal(Math.max.apply(null, cells), HEAT_CELL_MAX, 'the tallest setting reaches 22px')
  const narrowCells = allSettings().map(function (height) {
    return overviewLayout(height, { viewportWidth: 400 }).cell
  })
  assert.ok(Math.min.apply(null, narrowCells) >= 6,
    'the narrowest corner still draws 6px cells, got ' + Math.min.apply(null, narrowCells))
  // A boundary step is never larger than the fixed-height difference between
  // the two tiers divided by seven — i.e. it is exactly the budget handover and
  // not an arithmetic surprise.
  for (let i = 1; i < cells.length; i += 1) {
    assert.ok(cells[i] - cells[i - 1] > -7, 'a step larger than one tier handover at '
      + allSettings()[i])
  }
})

test('the shrink order is graphics → gaps/padding → type, never the reverse', function () {
  // Walking DOWN the settings, the packed tier must only appear once the gaps
  // and padding have already come down: the roomy tier keeps full-size type at
  // every body height, so type only moves when the cell would otherwise fall
  // below 8px.
  const tall = overviewLayout(MAX_BODY_HEIGHT, { viewportWidth: 1200 })
  assert.equal(tall.tier, 'roomy')
  assert.equal(tall.labelSize, 11, 'full-size labels at the top of the range')
  assert.equal(tall.valueSize, 17)
  assert.equal(tall.overviewGap, 10)
  assert.equal(tall.heatPad, 8)

  // The 240 floor still forces the compact tier at a NARROW viewport, where the
  // cards take three rows. (On a wide viewport 240 now only needs `tight`: the
  // foot's divider and 8px of padding-top used to cost 14.5px, and spending that
  // on whitespace rather than the calendar was the thing being fixed.)
  const small = overviewLayout(MIN_BODY_HEIGHT, { viewportWidth: 320 })
  assert.equal(small.tier, 'packed', 'the 240 floor needs the compact tier on three card rows')
  assert.equal(small.labelSize, CARD_LABEL_FLOOR, 'the label sits on its floor, not below')
  assert.equal(small.valueSize, CARD_VALUE_FLOOR)
  assert.ok(small.overviewGap < tall.overviewGap, 'gaps gave first')
  assert.ok(small.heatPad < tall.heatPad, 'band padding gave too')
  assert.ok(small.cell < tall.cell, 'the graphics shrank with them')
  assert.ok(small.footGap < tall.footGap, 'the foot space gives with the rest of the gaps')

  // The wide floor no longer needs the type to give at all.
  const wideFloor = overviewLayout(MIN_BODY_HEIGHT, { viewportWidth: 1200 })
  assert.equal(wideFloor.tier, 'tight')
  assert.ok(wideFloor.cell >= 8, 'the tight tier still clears its own 8px floor')

  // No tier ever states a font size below its floor.
  for (const tier of LAYOUT_TIERS) {
    assert.ok(tier.labelSize >= CARD_LABEL_FLOOR, tier.id + ' label below the floor')
    assert.ok(tier.valueSize >= CARD_VALUE_FLOOR, tier.id + ' value below the floor')
    assert.ok(tier.labelLh >= tier.labelSize, tier.id + ' label line-height below its size')
    assert.ok(tier.valueLh >= tier.valueSize, tier.id + ' value line-height below its size')
    assert.ok(tier.footGap >= 0, tier.id + ' foot gap must not go negative')
  }
})

test('the band needs no scrollbar room, so the tab ends within one cell step of the body', function () {
  // The band is 7 cells + 6 gaps + 2 paddings; the budget the cell formula uses
  // keeps the band itself inside the body.
  const tier = ROOMY
  assert.equal(bandHeight(tier, 22), 22 * 7 + tier.heatGap * 6 + tier.heatPad * 2)
  // NOTHING IS RESERVED for a horizontal scrollbar any more: the band hides it
  // (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`), so the
  // gutter no longer exists to eat vertical space. While the reserve was 12px
  // the Overview tab ended in 12–18px of dead space under the foot at EVERY
  // setting, which is the blank the user saw.
  assert.equal(HEAT_SCROLLBAR_RESERVE, 0, 'the reserve must stay at zero: the band hides its bar')
  for (const height of allSettings()) {
    for (const width of [320, 400, 1200]) {
      const layout = overviewLayout(height, { viewportWidth: width })
      const rows = gridRows(width)
      const fixed = fixedHeight(LAYOUT_TIERS.find(function (t) {
        return t.id === layout.tier
      }), rows)
      const used = fixed + layout.band
      assert.ok(used <= height + 0.001,
        'width ' + width + ' H ' + height + ': content ' + used + ' exceeds the body')
      if (layout.cell >= HEAT_CELL_MAX) {
        // The 22px DESIGN CAP is what stops the cells, not the budget, so the
        // leftover is deliberately handed back as blank: drawing bigger squares
        // is forbidden. Nothing to assert about slack here.
        continue
      }
      // Below the cap the only leftover is integer cell rounding (< 7px): a
      // whole extra row of cells would have fit, so it is a rounding artefact
      // and not a reserved strip. A reintroduced scrollbar reserve shows up
      // here immediately — at the default height a 12px reserve pushes the
      // slack back to 17px and this assertion fails.
      assert.ok(height - used < 7,
        'width ' + width + ' H ' + height + ': ' + (height - used)
        + 'px of slack is more than one rounding step; a reserve crept back in')
    }
  }
})

test('overviewVars emits a complete px-only set, with the type floors', function () {
  const vars = overviewVars(240, { viewportWidth: 1200 })
  const expected = [
    '--dus-overview-gap', '--dus-grid-gap', '--dus-card-pad', '--dus-card-gap',
    '--dus-card-label-size', '--dus-card-label-lh',
    '--dus-card-value-size', '--dus-card-value-lh',
    '--dus-foot-gap', '--dus-foot-lh',
    '--dus-heat-pad', '--dus-heat-gap', '--dus-heat-cell-max',
  ]
  assert.deepEqual(Object.keys(vars).sort(), expected.slice().sort())
  for (const [name, value] of Object.entries(vars)) {
    assert.match(value, /^\d+(?:\.\d+)?px$/, name + ' must be a plain px length')
  }
  // The floors come from the PACKED tier, which the compact corner selects.
  const packed = overviewVars(240, { viewportWidth: 320 })
  assert.equal(packed['--dus-card-label-size'], CARD_LABEL_FLOOR + 'px')
  assert.equal(packed['--dus-card-value-size'], CARD_VALUE_FLOOR + 'px')
  assert.equal(packed['--dus-foot-gap'], '2px', 'the packed foot gap')
  assert.equal(vars['--dus-foot-gap'], '4px', 'the roomy/tight foot gap')
  assert.equal(vars['--dus-heat-cell-max'], overviewLayout(240, { viewportWidth: 1200 }).cell + 'px')
  // No ratio to divide: every value is concrete, which is why the shrink is
  // testable here instead of in `calc()`.
  for (const value of Object.values(vars)) assert.ok(!/calc|var\(/.test(value))
})

test('malformed heights fall back to the default instead of throwing', function () {
  for (const value of [null, undefined, 'tall', Number.NaN, -5, 1e9]) {
    const layout = overviewLayout(value, { viewportWidth: 1200 })
    assert.ok(layout.height >= MIN_BODY_HEIGHT && layout.height <= MAX_BODY_HEIGHT,
      String(value) + ' -> ' + layout.height)
    assert.ok(layout.cell >= HEAT_CELL_FLOOR && layout.cell <= HEAT_CELL_MAX)
  }
})

/**
 * The hover bubble's placement. It is here (not in a new module) because it is
 * the same kind of thing: pixel arithmetic that CSS cannot express, asserted
 * without a DOM.
 *
 * The bug this guards: clamping the bubble's CENTRE held only for a 56px bubble.
 * A 240px-max bubble at the last heatmap column then crossed the panel's right
 * edge (measured 51.31px in `.work/lead-hover`), which became scrollable
 * overflow of the hero scroll container, which grew a scrollbar — 856 → 846 —
 * which shifted the centred stack by 5px, which moved the hovered cell out from
 * under the pointer. The page jittered. So the invariant asserted below is the
 * one that stops it: **the bubble's BOX stays inside the panel**.
 */
function tipBox(centre, width, panelWidth) {
  const half = width / 2
  const left = tipCentre(centre, width, panelWidth, TIP_INSET)
  return { left: left - half, right: left + half }
}

test('the hover bubble keeps its BOX inside the panel on the edge columns', function () {
  // Widths a real cell sentence produces: a short count, and a long one.
  const widths = [96, 163.66, TIP_MAX_WIDTH]
  // Panel widths a real hero produces, and the anchor a cell can land on:
  // the first cell, the middle, the last one (past both edges).
  const panels = [284, 680, 1104]
  for (const panelWidth of panels) {
    for (const width of widths) {
      for (const centre of [-40, 0, 12, panelWidth / 2, panelWidth - 12, panelWidth + 40]) {
        const box = tipBox(centre, width, panelWidth)
        const label = 'panel ' + panelWidth + ', bubble ' + width + ', centre ' + centre
        assert.ok(box.left >= TIP_INSET - 0.001, label + ': left edge ' + box.left + ' escaped')
        assert.ok(box.right <= panelWidth - TIP_INSET + 0.001,
          label + ': right edge ' + box.right + ' escaped')
      }
    }
  }
})

test('the clamp moves the bubble as little as it can, and only at the edges', function () {
  const panelWidth = 1104
  const width = 163.66
  // Centred on the cell whenever the box fits: no gratuitous nudging.
  for (const centre of [200, 552, 900]) {
    assert.equal(tipCentre(centre, width, panelWidth, TIP_INSET), centre)
  }
  // At the edges it slides to the inset, no further.
  assert.equal(tipCentre(10, width, panelWidth, TIP_INSET), TIP_INSET + width / 2)
  assert.equal(tipCentre(panelWidth, width, panelWidth, TIP_INSET),
    panelWidth - TIP_INSET - width / 2)
  // Monotonic in the anchor: a wider window never reorders two placements.
  let previous = -Infinity
  for (let centre = -20; centre <= panelWidth + 20; centre += 7) {
    const left = tipCentre(centre, width, panelWidth, TIP_INSET)
    assert.ok(left >= previous, 'placement went backwards at centre ' + centre)
    previous = left
  }
})

test('a bubble wider than the panel is centred instead of pushed off one side', function () {
  // The stylesheet caps the bubble at `calc(100% - 16px)`, so this is the
  // defensive branch: it must still produce a real number inside the panel.
  const place = tipCentre(100, 400, 200, TIP_INSET)
  assert.equal(place, 100, 'centred, not pinned to an edge')
  assert.ok(Number.isFinite(place))
})

test('the clamp survives values a hidden panel or a test seat can produce', function () {
  // No panel to measure: keep the anchor rather than invent a position.
  assert.equal(tipCentre(123, 160, 0, TIP_INSET), 123)
  // No width yet (the first frame): the inline inset still holds.
  assert.equal(tipCentre(5, 0, 1104, TIP_INSET), TIP_INSET)
  // Non-finite input must not become NaN in a style value.
  for (const value of [tipCentre(Number.NaN, 160, 1104, TIP_INSET),
    tipCentre(600, Number.NaN, 1104, TIP_INSET),
    tipCentre(600, 160, Number.NaN, TIP_INSET)]) {
    assert.ok(Number.isFinite(value), 'produced ' + value)
  }
  // A missing inset falls back to the design value.
  assert.equal(tipCentre(0, 160, 1104, undefined), tipCentre(0, 160, 1104, TIP_INSET))
})
