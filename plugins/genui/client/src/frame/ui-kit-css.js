/** Frame-only styles; scoped so the same CSS remains harmless in a host document. */
export const UI_KIT_CSS = `
.dsh-genui-card { color-scheme: inherit; }
.dsh-genui-card .gui-chart { display: grid; gap: 10px; min-width: 0; }
.dsh-genui-card .gui-label { color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size-secondary, 13px); }
.dsh-genui-card .gui-muted, .dsh-genui-card .gui-empty, .dsh-genui-card .gui-chart-ends { color: var(--dsw-alias-label-tertiary); font-size: var(--dsh-content-font-size-caption, 12px); }
.dsh-genui-card .gui-number { font-variant-numeric: tabular-nums; white-space: nowrap; }
.dsh-genui-card .gui-metric { display: grid; gap: 4px; min-width: 0; }
.dsh-genui-card .gui-metric-value { font-size: 24px; font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.dsh-genui-card .gui-bar-row { display: grid; grid-template-columns: minmax(60px, 1fr) minmax(60px, 3fr) minmax(45px, auto); gap: 12px; align-items: center; min-width: 0; width: 100%; padding: 8px 0; border: 0; background: transparent; color: var(--dsw-alias-label-primary); text-align: start; font: inherit; cursor: pointer; }
.dsh-genui-card .gui-bar-label { overflow-wrap: anywhere; }
.dsh-genui-card .gui-bar-track { display: block; position: relative; height: 22px; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); }
.dsh-genui-card .gui-bar-fill { position: absolute; top: 0; bottom: 0; border-radius: 3px; background: var(--dsw-alias-brand-primary); opacity: .75; }
.dsh-genui-card .gui-bar-row[aria-pressed=true] .gui-bar-fill, .dsh-genui-card .gui-bar-row:hover .gui-bar-fill { opacity: 1; }
.dsh-genui-card .gui-bar-zero { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--dsw-alias-border-l2); }
.dsh-genui-card .gui-line-chart { display: block; width: 100%; height: auto; max-height: 240px; overflow: visible; }
.dsh-genui-card .gui-axis { stroke: var(--dsw-alias-border-l2); stroke-width: 1; }
.dsh-genui-card .gui-line { fill: none; stroke: var(--dsw-alias-brand-primary); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.dsh-genui-card .gui-point { fill: var(--dsw-alias-brand-primary); stroke: var(--dsw-alias-bg-layer-1); stroke-width: 2; cursor: pointer; }
.dsh-genui-card .gui-readout { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.dsh-genui-card .gui-chart-ends span { min-width: 0; overflow-wrap: anywhere; }
.dsh-genui-card .gui-chart-ends { display: flex; justify-content: space-between; gap: 12px; }
.dsh-genui-card .gui-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.dsh-genui-card .gui-tabs button { min-width: 0; max-width: 100%; overflow-wrap: anywhere; font: inherit; padding: 6px 12px; border: 1px solid transparent; border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsh-genui-card .gui-tabs button[aria-pressed=true] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l1); }
.dsh-genui-card .gui-control { display: grid; gap: 8px; min-width: 0; }
.dsh-genui-card .gui-control select { font: inherit; min-width: 0; width: 100%; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 8px); color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); }
.dsh-genui-card .gui-control input[type=range] { width: 100%; min-width: 0; margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.dsh-genui-card .gui-range-label { display: flex; justify-content: space-between; gap: 12px; }
.dsh-genui-card .gui-bar-row:focus-visible, .dsh-genui-card .gui-tabs button:focus-visible, .dsh-genui-card .gui-point:focus-visible, .dsh-genui-card .gui-control :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }
@media (max-width: 400px) {
  .dsh-genui-card .gui-bar-row { grid-template-columns: minmax(50px, 1fr) minmax(40px, 2fr) minmax(35px, auto); gap: 8px; }
}
`
