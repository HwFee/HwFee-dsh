/**
 * Geometry for the COMPACT panel style — the second selectable look.
 *
 * WHY A SECOND STYLE AT ALL. The panel ships two looks the user picks between in
 * settings: `classic` (the shipped one, unchanged) and `compact`. `compact`
 * follows the usage panel of the Claude-style reference
 * (github.com/Nwflower/dsh-claude-style, MIT; the Sodium engine, Anthropic's
 * commercial fonts and the crab artwork are excluded from that licence and none
 * of them is used here): a 480px plain card, six flat metric tiles, the same
 * seven-row heat grid and a quiet strip at the foot.
 *
 * WHY THE ARITHMETIC IS HERE AND NOT IN CSS. The compact card is WIDTH-driven:
 * one heat column per week, all columns sharing the 456px inner width, so a
 * column is ~14.6px and the grid is ~116px tall. But the same panel must honour
 * the body-height setting, and CSS cannot turn "remaining height" into "column
 * width" (no division of a length by a length). So this module resolves ONE
 * number — the column cap — and the stylesheet lays the grid out with it. The
 * grid itself never gets a fixed height, so all seven rows always draw: the
 * compact style has no clipping mode.
 *
 * WHAT THE HEIGHT SETTING MEANS HERE. The compact card's natural body is
 * `COMPACT_DEFAULT_BODY_HEIGHT` (252px). A smaller setting shrinks the column
 * cap (down to `COMPACT_CELL_FLOOR`), a larger one leaves the surplus as empty
 * card below the grid — the same "reserved height pads the shorter tab"
 * contract the classic style already has. The setting is therefore never
 * ignored: it always decides the body's height, and below the natural height it
 * is what makes the grid smaller.
 *
 * THE BOTTOM STRIP OUTLIVES THE CAPTION. `COMPACT_BOTTOM_GAP` is 16px, the
 * line box the card's one-line comparison used to occupy. That line is gone,
 * but the 16px stays in `compactFixedHeight()` on purpose: the column cap is
 * derived from what the fixed blocks leave, so dropping the reservation with
 * the caption would enlarge every heat square (14px → 15px, the ceiling).
 * 252 = 136 (tiles + gaps + strip) + 116 (the 14px grid), unchanged, and the
 * strip now stands empty below the grid.
 *
 * 紧凑样式的几何：面板固定 480px、六格平面指标、7 行热图、底部一段留白。
 * 列宽由正文高度推出（CSS 无法把高度换成宽度），热图不设固定高度，因此永远不裁切。
 */

/** The compact card's width, matching the reference panel. */
export const COMPACT_PANEL_WIDTH = 480

/** The card's inner padding, one value for all four sides (`styles.js`). */
export const COMPACT_PAD = 12

/**
 * The compact body's natural height.
 *
 * It is the exact sum of the reference panel's own parts at a 14px column: 136
 * (six tiles in two rows, the gap between them, the two block gaps and the
 * footer strip) + 116 (its seven 14px cells and the six 3px gaps) = 252. 14px is
 * the column the reference draws, and 456px of inner width holds its 26 weeks at
 * that size.
 *
 * 252 is also a slider step (240 + 4×3), so the default lands on the control's
 * grid rather than between two positions.
 */
export const COMPACT_DEFAULT_BODY_HEIGHT = 252

/**
 * The height slider's range, mirrored from the classic style so one control
 * drives both styles. Repeated here rather than imported so this stays a leaf
 * module with no cycle: `settings.js` imports this file, not the other way.
 */
export const MIN_BODY_HEIGHT = 240
export const MAX_BODY_HEIGHT = 520

/** One metric tile: 5px padding ×2 + 16px label + 2px gap + 18px value. */
export const COMPACT_TILE_HEIGHT = 46

/** The tile grid's gap, in px. */
export const COMPACT_TILE_GAP = 4

/** The space between the tile grid, the heat grid and the card's bottom edge. */
export const COMPACT_BLOCK_GAP = 12

/**
 * The quiet strip under the heat grid. It was the caption's line box (12px type
 * on a 16px leading); the caption is gone and the strip remains as the card's
 * bottom inset, because the column cap is derived from what the fixed blocks
 * leave — see the module header.
 */
export const COMPACT_BOTTOM_GAP = 16

/** The heat grid's gap, in px, both between and inside the week columns. */
export const COMPACT_HEAT_GAP = 3

/** Rows in the heat grid. Fixed: the grid is a calendar, not a bar chart. */
export const COMPACT_HEAT_ROWS = 7

/**
 * The smallest column the compact style will draw. Below this a square stops
 * reading as a day and starts reading as a texture. The shipped range never
 * reaches it — the 240px end of the slider still draws 12px — so this is a guard
 * on the arithmetic, not a size a user can select.
 */
export const COMPACT_CELL_FLOOR = 8

/**
 * The largest column the compact style will draw: the reference's own 14px is
 * the natural size, and one step above it is the slack a taller setting may use.
 *
 * Past this the card stops reading as a compact card, so a taller height setting
 * leaves empty card under the grid instead of inflating the squares.
 */
export const COMPACT_CELL_CEIL = 15

/**
 * Everything in the compact body that the heat grid does NOT absorb.
 *
 * The tile grid is always three columns (the reference's own arrangement, kept
 * at every width: the tiles hold a short label and a 13px figure, which fit a
 * ~109px column even in a 360px window), so this is two tile rows plus the two
 * block gaps and the bottom strip.
 */
export function compactFixedHeight() {
  return COMPACT_TILE_HEIGHT * 2 + COMPACT_TILE_GAP
    + COMPACT_BLOCK_GAP * 2 + COMPACT_BOTTOM_GAP
}

/** The grid's own vertical chrome: six inner gaps between seven rows. */
function heatChrome() {
  return COMPACT_HEAT_GAP * (COMPACT_HEAT_ROWS - 1)
}

/** A local, cycle-free clamp for the height this module reasons about. */
function clampHeight(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return COMPACT_DEFAULT_BODY_HEIGHT
  return Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, Math.round(n)))
}

/**
 * The column cap a body height allows, before the floor and ceiling apply.
 *
 * The heat grid may take whatever the tiles, the gaps and the bottom strip
 * leave: `(height - fixed - chrome) / 7` is the column that fits all seven rows.
 */
export function compactCellForHeight(bodyHeight) {
  const height = clampHeight(bodyHeight)
  const budget = height - compactFixedHeight() - heatChrome()
  return Math.floor(budget / COMPACT_HEAT_ROWS)
}

/**
 * Resolve the compact layout for one body height.
 *
 * `cell` is the width one heat column may take; `band` is the grid's resulting
 * height. Because the stylesheet lays the columns out at `cell` with
 * `aspect-ratio: 1` and never fixes the grid's height, `band` is a REPORT of
 * what those columns add up to, not a limit anything is clipped to.
 */
export function compactLayout(bodyHeight) {
  const height = clampHeight(bodyHeight)
  const raw = compactCellForHeight(height)
  const cell = Math.min(COMPACT_CELL_CEIL, Math.max(COMPACT_CELL_FLOOR, raw))
  return {
    height: height,
    cell: cell,
    band: cell * COMPACT_HEAT_ROWS + heatChrome(),
    // True when the height setting is what bounds the columns (rather than the
    // 480px width or the ceiling). The settings copy and the tests read it.
    heightBound: raw < COMPACT_CELL_CEIL,
  }
}

/**
 * The custom properties the compact stylesheet consumes.
 *
 * Only the column cap and the fixed block metrics: the grid's height and the
 * card's height are both outcomes, so they are never written as lengths.
 *
 * `COMPACT_BOTTOM_GAP` is NOT emitted, for the same reason `layout.js` does not
 * emit its `bottomGap`: it is a budget the column cap is computed against, not a
 * length anything paints. An unused custom property would invite a future rule
 * to start reading it and quietly change the geometry.
 */
export function compactVars(bodyHeight) {
  const layout = compactLayout(bodyHeight)
  return {
    '--dus-compact-cell': layout.cell + 'px',
    '--dus-compact-tile-h': COMPACT_TILE_HEIGHT + 'px',
    '--dus-compact-tile-gap': COMPACT_TILE_GAP + 'px',
    '--dus-compact-block-gap': COMPACT_BLOCK_GAP + 'px',
    '--dus-compact-heat-gap': COMPACT_HEAT_GAP + 'px',
  }
}
