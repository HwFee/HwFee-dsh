/**
 * The row's stylesheet: CDS visual language on slider geometry.
 *
 * PORTED FROM the reference component
 * (`.reference/open-claude-ui/code-examples/ModelSelectorEffort.tsx`) and the
 * CDS token contract in `.reference/open-claude-ui/AGENTS.md`:
 *   - pill geometry (`9999px`) for the track and thumb, as in its trigger
 *     capsule and its `SegmentedControl` (`--cds-radius-pill`);
 *   - a filled clay track drawn with the accent token, the same `clay-500` that
 *     drives the reference's pulsing dot;
 *   - a 14px thumb, matching the reference's compact control scale;
 *   - hairline separation (`--dsw-alias-border-l1/l2`) rather than borders on
 *     every internal element (the single-stroke rule);
 *   - the description line and the amber `max` warning, which the reference
 *     renders under the level name and inside the `max` row respectively.
 *
 * TOKENS ONLY. Not one hex literal: the clay is
 * `--dsw-alias-state-business-primary`, the surfaces are the host's alias
 * ladder, the warning is the host's own warn ramp. That is what makes the row
 * follow the theme the user actually runs — CDS, stock, or anything else —
 * instead of hardcoding this plugin's idea of clay.
 *
 * SELECTORS. Only this plugin's own classes (`.dre-*`) and one stable host slot
 * attribute (`[data-slot="settings.general.item"]`). No salted CSS-Modules
 * class, so a host rebuild cannot silently unhook the styling.
 *
 * MOTION. The clay glow on the thumb is the only animation, and it is disabled
 * under `prefers-reduced-motion: reduce`.
 */

import { PLUGIN_ID, PANEL_STYLE_ID } from './constants.js'

export const PANEL_CSS = [
  '/* ---- thinking effort: the row --------------------------------------- */',
  // Row chrome copied from the host's General-row recipe (16px padding, a .5px
  // hairline, 14/22 title, 12/18 description) — the same geometry the sibling
  // plugin rows use, so this row sits in the section without a seam.
  '.dre-row { display: flex; align-items: flex-start; gap: 24px; padding: 16px 0;',
  '  border-bottom: .5px solid var(--dsw-alias-border-l2); justify-content: space-between; }',
  '.dre-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;',
  '  padding-right: 32px; }',
  '.dre-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 400; line-height: 22px; }',
  '.dre-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 400;',
  '  line-height: 18px; }',
  '.dre-control { flex: none; display: flex; flex-direction: column; gap: 8px;',
  '  align-items: flex-end; min-width: 232px; }',

  '/* ---- the level name, the Default badge, the description ------------- */',
  // The reference's `Thinking: {name}` capsule reduced to the value line above
  // the track: name in the primary tone, the Default marker as a neutral chip.
  '.dre-value { display: flex; align-items: center; gap: 6px; min-height: 20px;',
  '  font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }',
  '.dre-badge { flex: none; padding: 0 6px; border-radius: 9999px;',
  '  background: var(--dsw-alias-interactive-bg-hover);',
  '  color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 16px; }',

  '/* ---- the track: a flat pill with one clay fill ---------------------- */',
  // `--dre-fill` is written inline by the row as a percentage, so the fill
  // tracks the thumb without a second React render of the stylesheet.
  '.dre-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 20px;',
  '  background: transparent; cursor: pointer; margin: 0; }',
  '.dre-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 9999px;',
  '  background: linear-gradient(to right,',
  '    var(--dsw-alias-state-business-primary) 0 var(--dre-fill, 0%),',
  '    var(--dsw-alias-border-l1) var(--dre-fill, 0%) 100%); }',
  '.dre-slider::-moz-range-track { height: 6px; border-radius: 9999px;',
  '  background: var(--dsw-alias-border-l1); }',
  '.dre-slider::-moz-range-progress { height: 6px; border-radius: 9999px;',
  '  background: var(--dsw-alias-state-business-primary); }',

  '/* ---- the thumb: 14px clay pill with the CDS ring -------------------- */',
  '.dre-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;',
  '  width: 14px; height: 14px; margin-top: -4px; border: 0; border-radius: 9999px;',
  '  background: var(--dsw-alias-state-business-primary);',
  '  box-shadow: 0 1px 2px hsla(0, 0%, 8%, .18);',
  '  transition: box-shadow .12s cubic-bezier(.16, 1, .3, 1); }',
  '.dre-slider::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 9999px;',
  '  background: var(--dsw-alias-state-business-primary);',
  '  box-shadow: 0 1px 2px hsla(0, 0%, 8%, .18);',
  '  transition: box-shadow .12s cubic-bezier(.16, 1, .3, 1); }',
  // The CDS three-layer focus ring, drawn on the thumb the way the reference
  // draws it on its controls: an inset separator, the accent core, the glow.
  '.dre-slider:focus-visible { outline: none; }',
  '.dre-slider:focus-visible::-webkit-slider-thumb {',
  '  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),',
  '    0 0 0 1.5px var(--dsw-focus-ring-color),',
  '    0 0 6px 1px var(--dsw-alias-state-business-tertiary); }',
  '.dre-slider:focus-visible::-moz-range-thumb {',
  '  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),',
  '    0 0 0 1.5px var(--dsw-focus-ring-color),',
  '    0 0 6px 1px var(--dsw-alias-state-business-tertiary); }',
  // The clay breathing glow the reference puts on its pulsing dot, attached to
  // the thumb while the control has focus. Under `prefers-reduced-motion` the
  // animation is dropped entirely and only the static ring remains.
  '@media (prefers-reduced-motion: no-preference) {',
  '  .dre-slider:focus-visible::-webkit-slider-thumb { animation: dre-breathe 2.4s',
  '    cubic-bezier(.4, 0, .2, 1) infinite; }',
  '  .dre-slider:focus-visible::-moz-range-thumb { animation: dre-breathe 2.4s',
  '    cubic-bezier(.4, 0, .2, 1) infinite; }',
  '}',
  '@keyframes dre-breathe {',
  '  0%, 100% { box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),',
  '    0 0 0 1.5px var(--dsw-focus-ring-color),',
  '    0 0 4px 1px var(--dsw-alias-state-business-tertiary); }',
  '  50% { box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),',
  '    0 0 0 1.5px var(--dsw-focus-ring-color),',
  '    0 0 10px 2px var(--dsw-alias-state-business-tertiary); }',
  '}',

  '/* ---- the stops: a tick under every advertised level ----------------- */',
  // Rendered as absolutely positioned ticks over the same width the input
  // spans, so N stops = N marks with no extra DOM in the track itself. Each
  // tick is centred on its stop with `translateX(-50%)`.
  '.dre-ticks { position: relative; width: 100%; height: 10px; margin-top: -4px; }',
  '.dre-tick { position: absolute; top: 0; width: 2px; height: 6px; border-radius: 9999px;',
  '  background: var(--dsw-alias-border-l3); transform: translateX(-50%); }',
  '.dre-tick[data-past="true"] { background: var(--dsw-alias-state-business-primary); }',

  '/* ---- the max warning, the reference amber block --------------------- */',
  '.dre-warning { display: flex; gap: 6px; padding: 6px 8px; border-radius: 8px;',
  '  background: var(--dsw-alias-state-warn-tertiary);',
  '  color: var(--dsw-alias-state-warn-label);',
  '  font-size: 11px; line-height: 15px; max-width: 320px; text-align: left; }',
  '.dre-warning-mark { flex: none; }',

  '/* ---- the degenerate one-level case: a label, never a slider --------- */',
  '.dre-single { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }',

  '/* ---- the write failure: say so, do not pretend ---------------------- */',
  '.dre-error { padding: 6px 8px; border-radius: 8px;',
  '  background: var(--dsw-alias-interactive-bg-hover-danger);',
  '  color: var(--dsw-alias-state-error-primary);',
  '  font-size: 11px; line-height: 15px; max-width: 320px; text-align: left; }',

  '/* ---- the pending write: a single quiet line ------------------------- */',
  '.dre-pending { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 15px; }',

  '@media (max-width: 600px) {',
  '  .dre-row { flex-wrap: wrap; gap: 12px; }',
  '  .dre-control { width: 100%; align-items: stretch; min-width: 0; }',
  '  .dre-row-text { padding-right: 0; }',
  '}',
].join('\n')

/** Install the row's stylesheet once into the host document. */
export function installPanelCss(document_) {
  const doc = document_ === undefined ? (typeof document === 'undefined' ? undefined : document) : document_
  if (doc === undefined || !doc.head) return
  if (doc.getElementById(PANEL_STYLE_ID) !== null) return
  const tag = doc.createElement('style')
  tag.id = PANEL_STYLE_ID
  tag.dataset.plugin = PLUGIN_ID
  tag.textContent = PANEL_CSS
  doc.head.appendChild(tag)
}

/** Remove it again; a disabled plugin leaves no style tag behind. */
export function removePanelCss(document_) {
  const doc = document_ === undefined ? (typeof document === 'undefined' ? undefined : document) : document_
  if (doc === undefined || !doc.head) return
  const tag = doc.getElementById(PANEL_STYLE_ID)
  if (tag !== null && tag.parentNode) tag.parentNode.removeChild(tag)
}
