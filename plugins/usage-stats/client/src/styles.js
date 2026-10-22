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
  '.dus-panel { box-sizing: border-box; display: flex; flex-direction: column; gap: 10px;',
  '  position: relative;',
  '  padding: 10px 12px; border-radius: var(--dsw-radius-panel);',
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
  // tabs: the panel's content stack is head + 10px + body, identical on both
  // tabs for every setting value. `overflow: hidden` clips the horizontal slide
  // translate so the swap animation cannot paint outside the now-fixed box.
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
  '.dus-overview { display: flex; flex-direction: column;',
  '  gap: var(--dus-overview-gap, 10px);',
  '  height: 100%; min-height: 0; overflow-y: hidden; }',

  // Six tiles, three across (two across under the 560px breakpoint). They are
  // fills, never outlined boxes: the tile boundary is the tint step between
  // `--dsw-alias-bg-module-platform` and the panel surface behind it — CDS
  // low-contrast surface layering. The type sizes carry floors: the packed tier
  // stops at 10px/15px (label/value), never smaller.
  '.dus-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));',
  '  gap: var(--dus-grid-gap, 6px); }',
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
  '.dus-heat { display: flex; align-items: stretch; gap: var(--dus-heat-gap, 4px);',
  '  flex: 0 0 auto; overflow-x: auto; padding: var(--dus-heat-pad, 8px);',
  '  border-radius: var(--dsw-radius-md);',
  '  background: var(--dsw-alias-bg-module-platform);',
  '  justify-content: space-between;',
  '  overscroll-behavior-x: contain; scrollbar-width: thin; }',
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

  // The comparison is exactly one line — no byline and no basis. A hairline
  // divider (CDS one-directional rule) separates it from the tiles above. Its
  // padding and leading follow the same tier as the cards (`layout.js`), with the
  // 12px font size untouched — the foot is prose, so it is the LAST thing to give
  // and it never shrinks past its own line box.
  '.dus-foot { display: flex; flex-direction: column;',
  '  padding-top: var(--dus-foot-pad, 8px);',
  '  border-top: .5px solid var(--dsw-alias-border-l2);',
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

  // — The input height budget (see `input-budget.js`) -------------------------
  //
  // WHY THIS IS A COMBINATION AND NOT A NEW NUMBER. The host caps the editor's
  // scrollport at `--dsh-composer-text-max-height` (336px, declared on the
  // composer seat); cds-theme's hero rules lower that same variable. Neither
  // knows how tall OUR panel is, so on a blank session a long draft plus a
  // 344/520px panel can exceed the hero scrollport — and the host's centred
  // stack then splits the overflow above and below the fold, leaving the panel
  // at a negative offset where scrolling cannot reach it.
  //
  // `min()` of the two caps is the fix: whichever is tighter wins, so the input
  // follows an installed theme without duplicating its numbers, and there is no
  // second wrapper to keep in sync with the host's own scrolling. The right-hand
  // operand is OUR property (written in px by `attachInputBudget`), so this is
  // one fixed declaration: it cannot reference itself, and re-syncing writes the
  // same custom property instead of nesting `min()` deeper each time.
  '[data-composer-card] [data-input-scroll] {',
  '  max-height: min(var(--dsh-composer-text-max-height, 336px), var(--dus-input-budget, 336px)); }',
  //
  // The page's own scrollport, marked only while this panel is mounted. `safe
  // center` centres the stack when it fits and start-aligns it when it does not,
  // so the top of the stack (this panel) stays reachable from scroll position 0
  // instead of being pushed above it. `flex-start` is the explicit fallback for
  // engines without `safe`; both are declared together so the invalid value is
  // dropped and the valid one wins. `!important` because the host's own hero rule
  // (`.root[data-phase=hero] .scrollBody`) outranks a single attribute selector
  // and this plugin owns no stylesheet-order guarantee.
  '[data-conversation-scroll][data-dus-hero-scroll] {',
  '  justify-content: flex-start !important;',
  '  justify-content: safe center !important; }',

  // — Compact style -----------------------------------------------------------
  //
  // The second selectable look, from the usage panel of the Claude-style
  // reference (github.com/Nwflower/dsh-claude-style, MIT for everything this
  // block uses). WHAT IS NOT TAKEN FROM IT: the Sodium engine (PolyForm Shield),
  // Anthropic's commercial typefaces and the crab artwork are outside that
  // licence, and none of them appears here — this block is plain CSS over host
  // tokens. Nor does it bring the reference's page treatment (hero pinned to the
  // top, 20px greeting, composer glued to the bottom): that belongs to the whole
  // new-session screen, and this option only changes the panel.
  //
  // EVERY RULE IS SCOPED to the root attribute the panel writes, so the classic
  // look above is byte-identical to what shipped and the option can be removed
  // by deleting this block. The reference is a 480px plain card: one tone of
  // wash for the panel, tiles one tone deeper, the heat grid directly on the
  // card with no band of its own, and no divider above the caption.
  //
  // THE FIRST RULE MATCHES THE ROOT ITSELF, NOT A DESCENDANT. `data-dus-style`
  // is written ON `.dus-root` (panel.js), so a `[data-dus-style] .dus-root`
  // selector would need an ancestor carrying the attribute and would never
  // match — the width would silently stay classic while every descendant rule
  // worked. That is why this one is `.dus-root[data-dus-style="compact"]` and
  // the rest keep the descendant form.
  '.dus-root[data-dus-style="compact"] { width: 480px;',
  '  max-width: calc(100% - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-side-clearance, 0px));',
  '  margin: 4px auto 8px; }',
  // A flat wash, no outline and no elevation: the reference card is a fill, not
  // a raised surface. 4% of the label ink over the layer-2 tone is the whole
  // recipe — it flips with the theme on its own, so no dark override is needed.
  '[data-dus-style="compact"] .dus-panel { gap: 12px; padding: 12px;',
  '  border-radius: 12px;',
  '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, var(--dsw-alias-bg-layer-2));',
  '  --dsw-elevation-stroke-color: transparent;',
  '  box-shadow: none; }',
  // The head keeps the same two clusters but Claude's smaller chip: 12/18 type
  // with a 1px vertical pad, and a 5px radius on a 20px control (half its
  // height, the same rounding rule the reference states).
  '[data-dus-style="compact"] .dus-tab,',
  '[data-dus-style="compact"] .dus-range { padding: 1px 8px; border-radius: 5px;',
  '  font-size: 12px; line-height: 18px; font-weight: 400; }',
  '[data-dus-style="compact"] .dus-range[data-active="true"],',
  '[data-dus-style="compact"] .dus-tab[data-active="true"] { font-weight: 500;',
  '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, var(--dsw-alias-bg-layer-2)); }',
  '[data-dus-style="compact"] .dus-range:hover:not([data-active="true"]),',
  '[data-dus-style="compact"] .dus-tab:hover:not([data-active="true"]) {',
  '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }',
  '[data-dus-style="compact"] .dus-body { gap: 12px; }',
  // Overview: the reference's own rhythm — tiles, grid, caption, 12px apart.
  '[data-dus-style="compact"] .dus-overview { gap: var(--dus-compact-block-gap, 12px); }',
  // Tiles: three across at EVERY width (the reference's own arrangement). They
  // hold a short label and a 13px figure, so they stay legible well below the
  // classic style's 560px breakpoint, which is why that breakpoint is overridden
  // here rather than inherited.
  '[data-dus-style="compact"] .dus-grid { grid-template-columns: repeat(3, minmax(0, 1fr));',
  '  gap: var(--dus-compact-tile-gap, 4px); }',
  '[data-dus-style="compact"] .dus-card { gap: 2px; padding: 5px 8px; border-radius: 8px;',
  '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 15%, var(--dsw-alias-bg-layer-2)); }',
  // The figure sits barely above its own label, which is also what keeps a long
  // model id on one line instead of cutting it. Both truncate rather than wrap.
  '[data-dus-style="compact"] .dus-card-label { letter-spacing: 0;',
  '  font-size: 12px; line-height: 16px; white-space: nowrap;',
  '  overflow: hidden; text-overflow: ellipsis; }',
  '[data-dus-style="compact"] .dus-card-value { font-size: 13px; line-height: 18px;',
  '  font-weight: 600; }',
  // The favourite model is a NAME, not a figure: the reference sets it at the
  // label weight so it does not read as another count.
  '[data-dus-style="compact"] .dus-card[data-card="model"] .dus-card-value { font-weight: 400; }',
  // The grid: no band behind it, no padding, 3px gaps. Columns share whatever
  // the card's inner width gives them and stop growing at the cap the layout
  // module derives from the body height, so the panel's height setting still
  // decides how large a square is. The grid has NO fixed height — every one of
  // the seven rows is always drawn.
  '[data-dus-style="compact"] .dus-heat { padding: 0; gap: var(--dus-compact-heat-gap, 3px);',
  '  background: transparent; border-radius: 0; }',
  '[data-dus-style="compact"] .dus-heat-week { gap: var(--dus-compact-heat-gap, 3px);',
  '  flex: 1 0 8px; max-width: var(--dus-compact-cell, 15px); }',
  // Level 0 is the faintest step of the label ink, on the card itself rather
  // than on a band. Every lit level mixes the project accent by the reference
  // ramp shares (20 / 40 / 65 / 100%), so the grid follows the theme's accent
  // colour instead of pinning the reference's data blue.
  '[data-dus-style="compact"] .dus-heat-cell { border-radius: 3px;',
  '  background: color-mix(in srgb, var(--dsw-alias-label-primary) 11%, transparent); }',
  '[data-dus-style="compact"] .dus-heat-cell[data-level="1"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, var(--dsw-alias-bg-layer-2)); }',
  '[data-dus-style="compact"] .dus-heat-cell[data-level="2"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, var(--dsw-alias-bg-layer-2)); }',
  '[data-dus-style="compact"] .dus-heat-cell[data-level="3"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, var(--dsw-alias-bg-layer-2)); }',
  '[data-dus-style="compact"] .dus-heat-cell[data-level="4"] { background: var(--dsw-alias-state-business-primary); }',
  // The caption is a plain line on the card: no divider above it and no padding
  // of its own, 12/16 in the tertiary tone exactly as the reference sets it.
  //
  // THE CAPTION IS ONE LINE, AND SAYS SO IN CSS. The compact arithmetic
  // (`compact-layout.js`) reserves exactly `COMPACT_FOOT_HEIGHT` = 16px for it:
  // 252 = 136 (tiles + gaps) + 116 (the 14px grid) + 16, with zero slack. A
  // caption that wrapped — a longer sentence, or the English locale — needed two
  // 16px lines, and `.dus-body { overflow: hidden }` cut the second one through
  // the middle of its glyphs with no scrollbar to show it had happened.
  //
  // The alternative (shrink the caption's box and let the heat block absorb the
  // difference) cannot work: at 252 the grid already takes every spare pixel, so
  // a *smaller* reservation buys nothing for a longer text, and a *larger* one
  // would have to come out of the grid's seven rows or out of the persisted 252.
  // So the line is truncated visibly instead — one line, an ellipsis at the
  // trailing edge, and the full sentence still in the DOM for a screen reader.
  // `height` is pinned to the same token the arithmetic uses, so what is reserved
  // and what is painted are the same number rather than merely usually equal.
  '[data-dus-style="compact"] .dus-foot { padding-top: 0; border-top: 0; flex: none;',
  '  height: var(--dus-compact-foot-h, 16px); overflow: hidden;',
  '  font-size: 12px; line-height: var(--dus-compact-foot-h, 16px); }',
  '[data-dus-style="compact"] .dus-foot-line { color: var(--dsw-alias-label-tertiary);',
  '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  // The models tab keeps the shared body, its silent scroll and its rows; only
  // the row rhythm gets the compact spacing.
  '[data-dus-style="compact"] .dus-model { gap: 4px; padding: 6px 0; }',
  '[data-dus-style="compact"] .dus-model-id { font-size: 13px; line-height: 18px; }',
  // The hover bubble rides the same card tone so it still reads as part of the
  // panel when the panel has no border of its own.
  '[data-dus-style="compact"] .dus-tip { border-radius: 8px;',
  '  box-shadow: inset 0 0 0 .5px var(--dsw-alias-border-l2); }',

  // — The style switcher (settings row 39) ------------------------------------
  //
  // Two flat buttons carrying the style names, in the same switch grammar as the
  // panel's own tabs: no track, no ring, one soft fill on the chosen one. It sits
  // ABOVE the height row so the page reads "pick a style, then size it", which is
  // also the order the two settings actually interact in.
  //
  // THE TIMING IS THE PROJECT'S, NOT A GENERIC CURVE: the snap curve and the fast
  // duration both come from the theme's own tokens (`--cds-ease-snap`,
  // `--ds-transition-duration-fast`) with their values as fallbacks, so the
  // control moves with the rest of the UI when cds-theme is installed and still
  // animates sensibly without it. `ease` and `ease-in-out` are banned here for
  // the same reason they are banned elsewhere in this repo.
  '.dus-seg { display: inline-flex; align-items: center; gap: 2px; }',
  '.dus-seg-btn { border: 0; border-radius: var(--dsw-radius-md);',
  '  background: transparent; color: var(--dsw-alias-label-tertiary);',
  '  cursor: pointer; font: inherit; font-size: 12px; line-height: 18px; padding: 3px 12px;',
  '  transition: color var(--ds-transition-duration-fast, .12s) var(--cds-ease-snap, cubic-bezier(.32, .72, 0, 1)),',
  '    background-color var(--ds-transition-duration-fast, .12s) var(--cds-ease-snap, cubic-bezier(.32, .72, 0, 1)),',
  '    transform var(--ds-transition-duration-fast, .12s) var(--cds-ease-snap, cubic-bezier(.32, .72, 0, 1)); }',
  '.dus-seg-btn:hover { color: var(--dsw-alias-label-primary); }',
  '.dus-seg-btn:active { transform: scale(.97); }',
  '.dus-seg-btn[data-active="true"] { background: var(--dsw-alias-bg-module-platform);',
  '  color: var(--dsw-alias-label-primary); font-weight: 500; }',
  '.dus-seg-btn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color); outline-offset: 2px; }',
  // Reduced motion means STILL, not slower: the press feedback is the only thing
  // this control animates, so it is dropped entirely when the user asked for no
  // motion. Scoped to this control so the shipped tab/range rules keep exactly
  // the behaviour they had.
  '@media (prefers-reduced-motion: reduce) { .dus-seg-btn { transition: none; }',
  '  .dus-seg-btn:active { transform: none; } }',
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
