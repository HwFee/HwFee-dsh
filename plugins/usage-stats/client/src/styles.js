import { PLUGIN_ID } from './constants.js'

/**
 * Id of the one style tag this plugin owns. Namespaced by the plugin id so a
 * second install (or a stale tag from a previous bundle) is detected instead of
 * stacked.
 */
export const PANEL_STYLE_ID = 'dsh-usage-stats/panel'

/**
 * Every colour here is a host theme token or derived from one with
 * `color-mix`, so the panel follows the host palette and any theme plugin
 * that overrides it. The only literals are alpha fractions (the CDS
 * surface/hairline recipe) and the 2px heatmap-cell radius the contract
 * fixes; every radius is a host radius token.
 *
 * DESIGN VOCABULARY. The panel borrows the Claude Desktop surface grammar:
 * one bordered shell (the panel itself), one pill track (the head row is a
 * single segmented control, not two button clusters), fill-based metric
 * tiles, and an inset hairline on the heatmap. Inside the shell nothing
 * carries a second closed border — the CDS "1-border rule".
 */
export const PANEL_CSS = [
  // The wrapper owns the width, not the panel. The dock renders its occupants
  // as children of the hero's composer stack, whose width is the composer card
  // plus one `--dsh-composer-side-clearance` on each side; subtracting both
  // yields exactly the card width, so the panel edges line up with the input
  // box. This is the same width arithmetic the host's own dock occupant uses.
  //
  // The bottom margin is real on purpose. The queue dock cancels the stack gap
  // with a negative margin so it fuses with the composer; a stats panel fused
  // to the input would read as part of the composer, so this one is held off
  // it by its own margin instead.
  '.dus-root { box-sizing: border-box; flex: none;',
  '  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance));',
  '  max-width: var(--dsh-composer-card-max-width);',
  '  margin: 4px auto 8px; }',

  // The panel is the ONE bordered shell (CDS 1-border rule). It reuses the
  // composer card's OWN elevation recipe verbatim — `--dsw-elevation-soft`
  // with its stroke color set to the L2 border token — so the panel sits on
  // the same elevation plane as the input box and reads as a clear sibling
  // object, not a flat fill. `--dsw-alias-bg-base` keeps it on the host canvas
  // tone.
  //
  // The CHROME is 8px, not 10px. The body height is the user's setting, so the
  // shell's own padding and the head↔body gap are the only air this plugin owns
  // around a fixed-height body; 10/10 read as loose once the foot's divider and
  // 18.5px of gap above it went away. Vertical padding 10→8 and gap 10→8 take
  // 6px off the whole panel without touching a single content metric, so the
  // equal-height contract between the two tabs is unchanged.
  '.dus-panel { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px;',
  '  position: relative;',
  '  padding: 8px 12px; border-radius: var(--dsw-radius-panel);',
  '  background: var(--dsw-alias-bg-base);',
  '  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);',
  '  box-shadow: var(--dsw-elevation-soft); }',

  // Hover bubble for the heatmap cells. CDS's floating-surface language: the
  // panel surface one step up, a hairline, the same soft elevation shadow and
  // 12px copy — instead of the OS tooltip the native `title` produced (system
  // font, system colours, ~500ms delay). `tabular-nums` because the sentence
  // carries a count. Never interactive: `pointer-events: none` so it cannot
  // steal the hover from the cell underneath.
  //
  // A CLIP GATE, NOT DECORATION: it stops the bubble becoming scrollable overflow
  // of the hero scroll container (the jitter — `docs/perf-audit.md` F4). Always
  // mounted, so a hover inserts one element.
  '.dus-tip-layer { position: absolute; inset: 0; z-index: 2;',
  '  overflow: hidden; pointer-events: none; }',
  // `max-width` is bounded by the panel too, so the clamp stays solvable when the
  // panel is narrow. 16px = twice the 8px inset `tipCentre()` uses.
  '.dus-tip { position: absolute; transform: translate(-50%, calc(-100% - 6px));',
  '  max-width: 240px; max-width: min(240px, calc(100% - 16px));',
  '  padding: 4px 8px; border-radius: var(--dsw-radius-sm);',
  '  background: var(--dsw-alias-bg-module-platform);',
  '  color: var(--dsw-alias-label-primary);',
  '  font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums;',
  '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
  '  pointer-events: none;',
  '  box-shadow: inset 0 0 0 .5px var(--dsw-alias-border-l2), var(--dsw-elevation-soft); }',

  // Head: plain switch buttons — tabs left, ranges right. NO track, NO ring:
  // the earlier pill-track + raised-thumb recipe wrapped the buttons in a
  // second surface, which read as an extra layer around every switch. Now the
  // only state feedback is one soft fill on the selected button.
  '.dus-head { display: flex; align-items: center; gap: 2px; }',
  '.dus-head-spacer { flex: 1; min-width: 4px; }',
  '.dus-tabs, .dus-ranges { display: inline-flex; align-items: center; gap: 2px; }',

  // Button geometry: flat text buttons, no border in any state so picking one
  // never shifts the row. The selected button is a single filled chip — no
  // hairline, no shadow. Tabs are primary text, ranges the quieter variant.
  '.dus-range, .dus-tab { border: 0; border-radius: var(--dsw-radius-md);',
  '  background: transparent; cursor: pointer; font: inherit; font-variant-numeric: tabular-nums;',
  '  transition: color .12s ease, background-color .12s ease; }',
  '.dus-range { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; padding: 3px 10px; }',
  '.dus-tab { color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 20px; padding: 3px 12px; }',
  '.dus-range:hover, .dus-tab:hover { color: var(--dsw-alias-label-primary); }',
  '.dus-range:active, .dus-tab:active { transform: scale(.97); }',
  '.dus-range[data-active="true"], .dus-tab[data-active="true"] {',
  '  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-primary); font-weight: 500; }',

  // Body: ONE fixed height for BOTH tabs, and the only place the setting is
  // consumed. Models fills it and scrolls inside; Overview fills it too and is
  // TOP-ALIGNED, so its reserved height simply pads the shorter tab (the
  // leftover reads as the canvas background below the foot line). This is what
  // keeps the composer dock below the panel from jumping when the user flips
  // tabs: the panel's content stack is head + the panel gap (8px) + body,
  // identical on both tabs for every setting value. `overflow: hidden` clips the
  // horizontal slide translate so the swap animation cannot paint outside the
  // now-fixed box.
  '.dus-body { display: flex; flex-direction: column; gap: 10px; min-width: 0;',
  '  height: var(--dus-body-height, 344px);',
  '  overflow: hidden;',
  '  animation: dus-slide-in .22s cubic-bezier(.16, 1, .3, 1) both; }',
  '.dus-body[data-dir="fwd"] { --dus-slide-from: 14px; }',
  '.dus-body[data-dir="back"] { --dus-slide-from: -14px; }',
  '@keyframes dus-slide-in { from { opacity: 0; transform: translateX(var(--dus-slide-from, 14px)); }',
  '  to { opacity: 1; transform: translateX(0); } }',
  '@media (prefers-reduced-motion: reduce) { .dus-body { animation: none; } }',

  // Overview: the first tab's content, wrapped in one filler so it has the same
  // `height:100%` contract as the model list — the equality carrier, together
  // with the definite height on `.dus-body`. It is a top-aligned column and it
  // NEVER SCROLLS: the graphics shrink to fit instead (see `layout.js` and the
  // `--dus-*` lengths below). `overflow-y: hidden` is the belt to the
  // arithmetic's braces — if a host ever changes a metric the JS does not know
  // about, the tab clips a pixel rather than growing the very scrollbar the user
  // rejected. Every length here is fed by `overviewVars()` with today's value as
  // the fallback, so the module is the single place the shrink is computed.
  //
  // NO `gap` HERE ON PURPOSE. A uniform gap can only give the foot the SAME
  // air as the cards↔band seam, and the foot wants less (see `.dus-foot`). So
  // the two seams are stated separately: the grid carries a bottom margin of
  // `--dus-overview-gap`, the foot a top margin of `--dus-foot-gap`.
  '.dus-overview { display: flex; flex-direction: column;',
  '  height: 100%; min-height: 0; overflow-y: hidden; }',

  // Six tiles, three across (two across under the 560px breakpoint). They are
  // fills, never outlined boxes: the tile boundary is the tint step between
  // `--dsw-alias-bg-module-platform` and the panel surface behind it — CDS
  // low-contrast surface layering. The type sizes carry floors: the packed tier
  // stops at 10px/15px (label/value), never smaller.
  '.dus-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));',
  '  gap: var(--dus-grid-gap, 6px);',
  '  margin-bottom: var(--dus-overview-gap, 10px); }',
  '.dus-card { display: flex; flex-direction: column; gap: var(--dus-card-gap, 2px);',
  '  padding: var(--dus-card-pad, 8px) 10px;',
  '  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform); }',
  '.dus-card-label { color: var(--dsw-alias-label-tertiary);',
  '  font-size: var(--dus-card-label-size, 11px); line-height: var(--dus-card-label-lh, 15px);',
  '  letter-spacing: .02em; }',
  '.dus-card-value { color: var(--dsw-alias-label-primary); font-weight: 600;',
  '  font-size: var(--dus-card-value-size, 17px); line-height: var(--dus-card-value-lh, 22px);',
  '  font-variant-numeric: tabular-nums; overflow: hidden;',
  '  text-overflow: ellipsis; white-space: nowrap; }',

  // Heatmap: one column per SEVEN-DAY BLOCK, oldest left, TODAY at the
  // bottom-right corner. The grid is anchored at today and counted backward
  // (`buildHeatmap`), so the newest square is always in the corner and every
  // column holds exactly seven cells. Columns SHARE the band edge to edge
  // (flex, capped) and cells stay square, so a full history reads as one dense
  // calendar like the design target; `space-between` spreads surplus into the
  // gaps so the band still spans the full width.
  //
  // THE BAND HUGS ITS CONTENT AND SHRINKS WITH THE PANEL. `flex: 0 0 auto`: its
  // height is exactly its calendar (7 square cells + 6 gaps + 2 paddings), and
  // the column cap is a HEIGHT BUDGET computed in `layout.js` from
  // `--dus-body-height` — `max-width: var(--dus-heat-cell-max, 22px)` on the
  // week column is what makes a shorter panel draw smaller squares instead of a
  // scrollbar. `aspect-ratio: 1` is the invariant: a rectangle would break the
  // calendar read. Cells never grow past the 22px design cap.
  //
  // Quiet days are DRAWN, not skipped: `buildHeatmap` emits level 0 for days
  // inside the window and `pad: true` only for the quiet columns before the
  // first active day; both take the same grey tile. A calendar with visible
  // holes is what makes the grid read as a calendar instead of a bar chart of
  // busy days.
  //
  // NO VISIBLE SCROLLBAR, AND NO RESERVED HEIGHT FOR ONE. The band hides its
  // scrollbar the same way the model list does — `scrollbar-width: none` plus
  // `::-webkit-scrollbar { display: none }`, so neither engine reserves a
  // gutter. `overflow-x: auto` STAYS: a genuinely long history (≈44 columns at
  // 1104px, ≈308 days) still scrolls by wheel, trackpad and touch, it just has
  // no bar. This is what let `HEAT_SCROLLBAR_RESERVE` go to 0 in `layout.js` —
  // the 12px it used to subtract from the cell budget was the dead space under
  // the foot on every profile whose history never overflowed.
  '.dus-heat { display: flex; align-items: stretch; gap: var(--dus-heat-gap, 4px);',
  '  flex: 0 0 auto; overflow-x: auto; padding: var(--dus-heat-pad, 8px);',
  '  border-radius: var(--dsw-radius-md);',
  '  background: var(--dsw-alias-bg-module-platform);',
  '  justify-content: space-between;',
  '  overscroll-behavior-x: contain; scrollbar-width: none; }',
  '.dus-heat::-webkit-scrollbar { display: none; }',
  '.dus-heat-week { display: flex; flex-direction: column; gap: var(--dus-heat-gap, 4px);',
  '  flex: 1 0 9px; max-width: var(--dus-heat-cell-max, 22px); }',
  // The quiet cell is a plain grey tile — visibly darker than the band, the
  // way the design target draws its empty days — so the grid reads as a grid
  // even when almost everything is empty. The accent only enters at level 1
  // and climbs a stepped ramp, which is what makes the hot days pop against
  // the field of quiet grey.
  '.dus-heat-cell { display: block; width: 100%; aspect-ratio: 1; border-radius: 2px;',
  '  background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 18%, var(--dsw-alias-bg-module-platform)); }',
  '.dus-heat-cell[data-level="1"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, var(--dsw-alias-bg-base)); }',
  '.dus-heat-cell[data-level="2"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-bg-base)); }',
  '.dus-heat-cell[data-level="3"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 80%, transparent); }',
  '.dus-heat-cell[data-level="4"] { background: var(--dsw-alias-state-business-primary); }',

  // Model list: one row per model, the share bar under its label row.
  //
  // The list FILLS the shared body height (`height: 100%; min-height: 0`) so the
  // two tabs stay exactly equal and the composer dock never jumps on a tab
  // switch. Scrolling is kept as a silent safety valve — a machine with twenty
  // providers' models would otherwise clip the tail — but it is INVISIBLE:
  //
  //   - no scrollbar: a visible gutter on a four-item list reads as "the panel
  //     is broken", and the model list is short in every real profile;
  //   - no fade mask: the earlier 12px/16px `mask-image` was meant as a
  //     half-row peek, but with only a few rows it fades the FIRST row's top and
  //     the LAST row's bottom for no reason, which looks like a rendering bug.
  //
  // `scrollbar-width: none` + the `::-webkit-scrollbar { display: none }` rule
  // below hide it in both engines; wheel/trackpad scrolling still works, so a
  // genuinely long list degrades to "scrolls without a bar" rather than "clips".
  //
  // THE HEIGHT IS NOT WRITTEN HERE. `.dus-body` owns the single
  // `--dus-body-height` height (above) and the Overview tab fills the same body;
  // this rule used to carry its own copy of the var, which is exactly why the
  // two tabs had different heights and the composer dock jumped on a tab switch.
  '.dus-models { display: flex; flex-direction: column;',
  '  height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain;',
  '  scrollbar-width: none; }',
  // Hidden in WebKit/Chromium too. `display: none` (not `width: 0`) is what also
  // removes the reserved gutter, so the rows keep the full width.
  '.dus-models::-webkit-scrollbar { display: none; }',
  '.dus-model { display: flex; flex-direction: column; gap: 6px; padding: 8px 0;',
  '  border-bottom: .5px solid var(--dsw-alias-border-l2); }',
  '.dus-model:last-child { border-bottom: none; }',
  '.dus-model-head { display: flex; align-items: baseline; gap: 10px; min-width: 0; }',
  '.dus-model-id { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;',
  '  white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; }',
  '.dus-model-tokens { flex: none; color: var(--dsw-alias-label-secondary); font-size: 12px;',
  '  line-height: 18px; font-variant-numeric: tabular-nums; }',
  '.dus-model-share { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 12px;',
  '  line-height: 18px; font-variant-numeric: tabular-nums; }',
  '.dus-model-track { height: 4px; overflow: hidden; border-radius: var(--dsw-radius-md);',
  '  background: var(--dsw-alias-border-l2); }',
  '.dus-model-fill { height: 100%; border-radius: inherit;',
  '  background: var(--dsw-alias-state-business-primary); }',

  // The comparison is exactly one line — no byline and no basis. NO DIVIDER AND
  // NO VERTICAL PADDING: it used to carry a .5px `border-top` hairline plus 8px
  // of `padding-top`, and with the overview's uniform 10px gap that stacked
  // 18.5px of air and a rule over a single line of prose — the rule read as a
  // stray line and the air was the largest gap in the panel. It is now held off
  // the band by ONE number, `--dus-foot-gap` (4px, 2px packed), which `layout.js`
  // also subtracts in `fixedHeight()`, so the budget saved here goes back to the
  // heatmap instead of becoming whitespace. The leading follows the same tier as
  // the cards, with the 12px font size untouched — the foot is prose, so it is
  // the LAST thing to give and it never shrinks past its own line box.
  '.dus-foot { display: flex; flex-direction: column;',
  '  margin-top: var(--dus-foot-gap, 4px);',
  '  color: var(--dsw-alias-label-tertiary); font-size: 12px;',
  '  line-height: var(--dus-foot-lh, 17px); }',
  '.dus-foot-line { color: var(--dsw-alias-label-secondary); }',
  '.dus-note { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; padding: 4px 0; }',

  // — Settings rows -----------------------------------------------------------
  //
  // Both rows (panel height, number units) register into the 主题定制 page's
  // `settings.appearance.item` ledger, with the General list as the bounded-wait
  // fallback. Geometry mirrors the host's General rows (docs/host-hooks.md §5.3):
  // 14/22 title in label-primary, 12/18 description in label-tertiary, 16px
  // vertical padding and a .5px bottom hairline, with the control right-aligned.
  // Our own classes only — never the host's salted module hashes.
  '.dus-row { display: flex; align-items: center; gap: 8px; padding: 16px 0;',
  '  border-bottom: .5px solid var(--dsw-alias-border-l2); }',
  '.dus-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-right: 48px; }',
  '.dus-row-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 400; line-height: 22px; }',
  '.dus-row-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 400; line-height: 18px; }',
  '.dus-row-control { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }',
  '.dus-row-slider { -webkit-appearance: none; appearance: none; width: 180px; height: 20px;',
  '  background: transparent; cursor: pointer; }',
  '.dus-row-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 3px;',
  '  background: linear-gradient(to right, var(--dsw-alias-state-business-primary, #4c72e0) 0 var(--dus-fill, 0%),',
  '    var(--dsw-alias-border-l1, #d9d9d9) var(--dus-fill, 0%) 100%); }',
  '.dus-row-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px;',
  '  margin-top: -4px; border: 0; border-radius: 50%; background: var(--dsw-alias-state-business-primary, #4c72e0); }',
  '.dus-row-slider::-moz-range-track { height: 6px; border-radius: 3px; background: var(--dsw-alias-border-l1, #d9d9d9); }',
  '.dus-row-slider::-moz-range-progress { height: 6px; border-radius: 3px;',
  '  background: var(--dsw-alias-state-business-primary, #4c72e0); }',
  '.dus-row-slider::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%;',
  '  background: var(--dsw-alias-state-business-primary, #4c72e0); }',
  '.dus-row-value { flex: none; min-width: 52px; text-align: right; color: var(--dsw-alias-label-secondary);',
  '  font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }',
  // Three-way unit control: flat segmented buttons, the same switch grammar as
  // the panel's own tabs — no track, no ring, one soft fill for the active mode.
  // The unit row is a SWITCH, so it uses the host's own switch geometry (36×20,
  // 999px radius, 2px inset, 16px thumb travel) rather than inventing a size.
  // A three-option segmented control lived here before `units` became a switch;
  // its styles are gone rather than left orphaned.
  '.dct-toggle { position: relative; flex: none; width: 36px; height: 20px; padding: 2px;',
  '  box-sizing: border-box; cursor: pointer; border: none; border-radius: 999px;',
  '  background: var(--dsw-alias-border-l3);',
  '  transition: background-color .15s ease; }',
  '.dct-toggle[data-on="true"] { background: var(--dsw-alias-brand-primary); }',
  '.dct-toggle:focus-visible { outline: 2px solid var(--dsw-focus-ring-color); outline-offset: 2px; }',
  '.dct-toggle-knob { display: block; width: 16px; height: 16px; border-radius: 999px;',
  '  background: var(--dsw-alias-bg-base); box-shadow: 0 1px 2px rgba(0, 0, 0, .18);',
  '  transform: translateX(0); transition: transform .15s var(--cds-ease-snap, ease); }',
  '.dct-toggle[data-on="true"] .dct-toggle-knob { transform: translateX(16px); }',
  '@media (max-width: 600px) { .dus-row { flex-wrap: wrap; } .dus-row-text { padding-right: 0; }',
  '  .dus-row-slider { width: 100%; } }',

  // Two columns once three tiles would be narrower than their numbers.
  '@media (max-width: 560px) { .dus-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',

  // — Preset chip placement ---------------------------------------------------
  //
  // "Standard mode" lives in the hero's workspace row, which in DOM order sits
  // ABOVE this panel. The host's composer stack is a column flex whose children
  // are the hero shell, that workspace row, the input dock outlet, and the
  // input bar (`dsh-client-ui-conversation` composer stack, class
  // `Dc7zOa_composerStack`).
  //
  // The dock outlet wrapper is `display: contents` (dsh-client-ui-renderer
  // SlotOutlet, ANCHOR_STYLE), which means the stack sees OUR root as its own
  // flex item. `order` on `.dus-root` can only move it to the very front of the
  // stack (a negative order beats every default-order sibling, including the
  // hero shell that carries the headline) — there is no integer order that
  // lands between two `order:0` DOM siblings, so CSS alone cannot place the
  // panel between the headline and the chip row.
  //
  // The row carries no `data-*` hook — only a CSS-module hash the host is free
  // to rename — and `:has()` cannot reach a PREVIOUS sibling. So the placement
  // the design wants (headline → panel → mode chips → composer) is done in
  // `panel.js` with a one-time `insertBefore` on the outlet's real parent: the
  // panel is hoisted so it sits right after the hero shell and right before the
  // workspace row, leaving the row fused to the composer. It is a DOM move of
  // our own node, not a style spoof; it degrades to the static dock position
  // (below the row) on any seat whose parent is not the composer stack.
  //
  // The panel's own bottom margin is re-seated here for its new neighbour: the
  // stack gap is 6px and the row carries a 4px top margin of its own, so 8px
  // keeps the panel-to-chip spacing at the rhythm it had against the composer.
  '.dus-root { margin-bottom: 8px; }',
].join('\n')

/**
 * Installs the stylesheet once. Called at plugin apply rather than at first
 * render so the occupant can never paint an unstyled frame.
 */
export function installPanelCss() {
  if (typeof document === 'undefined' || !document.head) return
  if (document.getElementById(PANEL_STYLE_ID) !== null) return
  const tag = document.createElement('style')
  tag.id = PANEL_STYLE_ID
  tag.dataset.plugin = PLUGIN_ID
  tag.textContent = PANEL_CSS
  document.head.appendChild(tag)
}

/** Removes the stylesheet; the plugin's own effect disposer calls this. */
export function removePanelCss() {
  if (typeof document === 'undefined' || !document.head) return
  const tag = document.getElementById(PANEL_STYLE_ID)
  if (tag !== null && tag.parentNode) tag.parentNode.removeChild(tag)
}
