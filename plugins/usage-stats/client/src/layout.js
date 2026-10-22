/**
 * Overview layout arithmetic: how the tab's graphics shrink to fit the body.
 *
 * THE PROBLEM. `.dus-overview` stacks six cards and the heat band inside
 * `.dus-body`, whose height is exactly `--dus-body-height` (240–520). The cards
 * are fixed; the heat band's height is WIDTH-derived (seven
 * square cells per column, column width capped at 22px). At a small setting the
 * natural content height exceeded the body and the tab grew a vertical
 * scrollbar — the thing the user rejected ("要等比例缩小 而不是增加滚动条").
 *
 * WHY THE MATH LIVES IN JS. CSS cannot divide a length by a length, so no
 * `calc()` can turn "available height" into "column width". `panel.js` already
 * knows the exact setting and writes it inline, so the arithmetic is done here —
 * pure, no DOM, covered by `node:test` — and handed to the stylesheet as
 * concrete lengths. `container-type: size` + `cqh` would be the CSS-only
 * alternative, but it needs a size container on `.dus-body`, cannot express the
 * tiered shrink order below, and would put the one thing the acceptance
 * measures (no overflow) out of reach of a unit test.
 *
 * SHRINK ORDER (the user's rule: graphics first, legible text last):
 *   1. the heat cell cap shrinks (`--dus-heat-cell-max`); cells stay SQUARE —
 *      `aspect-ratio: 1` is the invariant that keeps the calendar readable;
 *   2. when the cap would fall below a comfortable cell, the gaps and padding
 *      shrink (overview gap 10→6→4, band padding 8→4→2, cell gap 4→3→2);
 *   3. only when even that is not enough do the cards compact — label 11/15 →
 *      10/12 and value 17/22 → 15/18, i.e. down to the stated floors, with the
 *      card padding 8→6 and the bottom strip 25.5→19.5. No font ever goes below
 *      `CARD_LABEL_FLOOR` / `CARD_VALUE_FLOOR`.
 *
 * THE BOTTOM STRIP OUTLIVES THE CAPTION. This tab used to end in a one-line
 * comparison, and `bottomGap` is exactly the room that line took (padding +
 * hairline + leading). The caption is gone, but the number stays in the budget
 * on purpose: the cell cap is derived from what the fixed blocks leave, so
 * deleting the line and the reservation together would enlarge every heat
 * square and pull the calendar's seven rows taller. The strip now simply stands
 * empty below the grid.
 *
 * The returned lengths are emitted as custom properties by `overviewVars()`;
 * the stylesheet consumes them with today's values as fallbacks, so a host that
 * never calls this module still renders the roomy layout.
 */

/** The 22px design cap on a heat column (and therefore on a cell). */
export const HEAT_CELL_MAX = 22

/**
 * The body-height range this module understands, mirroring `settings.js`. It is
 * repeated here (rather than imported) so `layout.js` stays a leaf module with
 * no import cycle: `settings.js` is the one that composes these values into an
 * inline style, and it imports this file.
 */
export const MIN_BODY_HEIGHT = 240
export const MAX_BODY_HEIGHT = 520

/** A local, cycle-free clamp for the height this module reasons about. */
function clampHeight(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 344
  return Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, Math.round(n)))
}

/**
 * The smallest cell the theme will draw. Below this the squares stop reading as
 * a calendar at a glance. The shipped range never reaches it: the most compact
 * corner (narrow viewport + 240px) bottoms out at 6px, the wide viewport at
 * 8px, and everything from ~370px up draws the full 22px cap.
 */
export const HEAT_CELL_FLOOR = 5

/** Legibility floors for the only type this module may touch (px). */
export const CARD_LABEL_FLOOR = 10
export const CARD_VALUE_FLOOR = 15

/**
 * Reserve for the heat band's horizontal scrollbar (measured ~10px with
 * `scrollbar-width: thin`; 12 leaves a pixel of slack). A long history still
 * scrolls sideways, and that bar eats vertical space inside the band.
 */
export const HEAT_SCROLLBAR_RESERVE = 12

/** The viewport breakpoint the stylesheet wraps the cards into two columns at. */
export const NARROW_VIEWPORT_PX = 560

/** The bubble's inset from the panel edge, in px. Mirrors the stylesheet. */
export const TIP_INSET = 8

/** The design cap on the bubble's width, mirroring `.dus-tip { max-width }`. */
export const TIP_MAX_WIDTH = 240

/**
 * Where the hover bubble's CENTRE may sit so its BOX stays inside the panel.
 *
 * The bubble is centred on the cell with `translate(-50%, …)`, so clamping the
 * CENTRE holds only for a bubble of known width — the first version clamped to
 * `[28, width - 28]` and a 240px bubble then left the panel, which became
 * scrollable overflow of the hero scroll container and made the page jitter.
 * `docs/perf-audit.md` F4 has the measurements. `panelWidth <= 0` is a hidden
 * panel or a test seat: the anchor comes back as-is.
 */
export function tipCentre(centre, bubbleWidth, panelWidth, inset) {
  const gap = Number.isFinite(inset) ? Math.max(0, inset) : TIP_INSET
  const width = Number.isFinite(panelWidth) ? panelWidth : 0
  const anchor = Number.isFinite(centre) ? centre : 0
  const half = Number.isFinite(bubbleWidth) && bubbleWidth > 0 ? bubbleWidth / 2 : 0
  if (width <= 0) return anchor
  const min = gap + half
  const max = width - gap - half
  // Wider than the panel can hold: centre it; `.dus-tip`'s `max-width` keeps it in.
  if (min > max) return width / 2
  return Math.min(Math.max(anchor, min), max)
}

/**
 * The three shrink tiers, largest first. Every length the Overview view uses is
 * listed here — including the card and bottom-strip metrics the arithmetic
 * depends on — so the stylesheet and this module cannot disagree about a number.
 *
 * `bottomGap` is the strip under the heat grid: the room the caption took
 * (8px padding + .5px hairline + 17px leading = 25.5px) and the compact
 * equivalent. The caption is gone; the number is kept so the cell cap, and
 * therefore the calendar's cell size, is exactly what it was.
 */
export const LAYOUT_TIERS = [
  {
    id: 'roomy',
    minCell: 10,
    overviewGap: 10, gridGap: 6,
    cardPad: 8, cardGap: 2, labelSize: 11, labelLh: 15, valueSize: 17, valueLh: 22,
    bottomGap: 25.5,
    heatPad: 8, heatGap: 4,
  },
  {
    id: 'tight',
    minCell: 8,
    overviewGap: 6, gridGap: 6,
    cardPad: 8, cardGap: 2, labelSize: 11, labelLh: 15, valueSize: 17, valueLh: 22,
    bottomGap: 25.5,
    heatPad: 4, heatGap: 3,
  },
  {
    id: 'packed',
    minCell: 0,
    overviewGap: 4, gridGap: 4,
    cardPad: 6, cardGap: 2, labelSize: CARD_LABEL_FLOOR, labelLh: 12,
    valueSize: CARD_VALUE_FLOOR, valueLh: 18,
    bottomGap: 19.5,
    heatPad: 2, heatGap: 2,
  },
]

/** Height of one metric card, from the tier's own padding and line boxes. */
export function cardHeight(tier) {
  return tier.cardPad * 2 + tier.labelLh + tier.cardGap + tier.valueLh
}

/**
 * How many card rows the grid has at this viewport width: three across above
 * the stylesheet's breakpoint, two across below it (six tiles → three rows).
 */
export function gridRows(viewportWidth) {
  const width = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth)
    ? viewportWidth
    : NARROW_VIEWPORT_PX + 1
  return width <= NARROW_VIEWPORT_PX ? 3 : 2
}

/** Everything in the tab that does NOT shrink with the heat cells. */
export function fixedHeight(tier, rows) {
  const grid = cardHeight(tier) * rows + tier.gridGap * (rows - 1)
  return grid + tier.overviewGap * 2 + tier.bottomGap
}

/** The cell size a tier would use at this body height (before its min test). */
function cellFor(tier, rows, bodyHeight) {
  const bandBudget = bodyHeight - fixedHeight(tier, rows)
  const content = bandBudget - tier.heatPad * 2 - tier.heatGap * 6 - HEAT_SCROLLBAR_RESERVE
  return Math.floor(content / 7)
}

/** The band's own height for a tier, once the cell size is known. */
export function bandHeight(tier, cell) {
  return cell * 7 + tier.heatGap * 6 + tier.heatPad * 2
}

/**
 * Resolve the layout for one body height (and one viewport width).
 *
 * Walks the tiers largest-first and takes the first whose cell size is still
 * comfortable; the packed tier is the fallback. The result carries every length
 * the view needs, so a caller never reads a half-applied tier.
 */
export function overviewLayout(bodyHeight, options) {
  const opts = options || {}
  const height = clampHeight(bodyHeight)
  const rows = gridRows(opts.viewportWidth)
  let chosen = LAYOUT_TIERS[LAYOUT_TIERS.length - 1]
  let raw = cellFor(chosen, rows, height)
  for (const tier of LAYOUT_TIERS) {
    const cell = cellFor(tier, rows, height)
    if (cell >= tier.minCell) {
      chosen = tier
      raw = cell
      break
    }
  }
  const cell = Math.min(HEAT_CELL_MAX, Math.max(HEAT_CELL_FLOOR, raw))
  const band = bandHeight(chosen, cell)
  return {
    tier: chosen.id,
    rows: rows,
    height: height,
    cell: cell,
    band: band,
    // The custom-property values, in px, all derived from this one tier.
    overviewGap: chosen.overviewGap,
    gridGap: chosen.gridGap,
    cardPad: chosen.cardPad,
    cardGap: chosen.cardGap,
    labelSize: chosen.labelSize,
    labelLh: chosen.labelLh,
    valueSize: chosen.valueSize,
    valueLh: chosen.valueLh,
    bottomGap: chosen.bottomGap,
    heatPad: chosen.heatPad,
    heatGap: chosen.heatGap,
  }
}

/**
 * The custom properties `overviewLayout` hands to the stylesheet.
 *
 * Every value is a concrete px length — no `calc()` ratio games. The stylesheet
 * uses each one with today's value as the fallback, so a host that never calls
 * this module still renders the roomy layout.
 *
 * `bottomGap` is NOT emitted: it is a budget the cell cap is computed against,
 * not a length anything paints, and an unused custom property would invite a
 * future rule to start reading it.
 */
export function overviewVars(bodyHeight, options) {
  const layout = overviewLayout(bodyHeight, options)
  return {
    '--dus-overview-gap': layout.overviewGap + 'px',
    '--dus-grid-gap': layout.gridGap + 'px',
    '--dus-card-pad': layout.cardPad + 'px',
    '--dus-card-gap': layout.cardGap + 'px',
    '--dus-card-label-size': layout.labelSize + 'px',
    '--dus-card-label-lh': layout.labelLh + 'px',
    '--dus-card-value-size': layout.valueSize + 'px',
    '--dus-card-value-lh': layout.valueLh + 'px',
    '--dus-heat-pad': layout.heatPad + 'px',
    '--dus-heat-gap': layout.heatGap + 'px',
    '--dus-heat-cell-max': layout.cell + 'px',
  }
}
