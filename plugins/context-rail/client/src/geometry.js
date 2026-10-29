/**
 * The rail's geometry: the numbers, and the two pure functions that decide
 * placement.
 *
 * Kept apart from index.js so the arithmetic is importable without React — the
 * module that draws the rail starts with `require('react')` and a class derived
 * from React.Component, neither of which exists under Node. A test that needs to
 * check an inset must not have to load the renderer to do it.
 */

/** Rail width in CSS pixels. The content padding uses the same constant. */
export const RAIL_WIDTH = 328

/** Windows narrower than this keep the rail closed until the user asks for it. */
export const AUTO_OPEN_MIN_WIDTH = 1180

/** Content left beside the rail before the rail gives up its place entirely. */
export const MIN_CONTENT_WIDTH = 240

/**
 * Whether the conversation column can hold the rail at all.
 * @param {number} columnWidth - the scroller's border-box width
 * @returns {boolean}
 */
export function railFits(columnWidth) {
  return typeof columnWidth === 'number' && columnWidth >= RAIL_WIDTH + MIN_CONTENT_WIDTH
}

/**
 * The right inset an absolutely positioned composer must use to clear the rail.
 *
 * The host's trajectory view mounts `[data-conversation-composer-overlay]` and
 * turns `[data-composer-seat]` into an absolutely positioned box whose right
 * edge is the scrollbar width. An absolutely positioned box ignores the
 * scroller's padding, so the padding that reserves the rail for normal flow does
 * not move it — the seat has to be told about the rail explicitly. The seat is
 * positioned against the scroller's padding box, so the inset is the rail plus
 * the scroller's own scrollbar gutter.
 *
 * @param {number} scrollbarWidth - measured `offsetWidth - clientWidth`
 * @returns {number} inset in CSS pixels
 */
export function composerInset(scrollbarWidth) {
  const bar = typeof scrollbarWidth === 'number' && scrollbarWidth > 0 ? scrollbarWidth : 0
  return RAIL_WIDTH + bar
}
