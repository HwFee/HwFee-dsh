import { EASING } from './palette.js'

const TRACE_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M6.5 2.5H3a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V9.5M9 2.5h4.5V7M13.5 2.5l-7 7" stroke="black" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>')

/** Shared chrome for native and plugin-owned tool cards. */
export function toolChromeRules() {
  return `
[data-cds-tool-body], [data-cds-diffcard] { position: relative; }
[data-conversation-content] [data-cds-tool-inspect] {
  --cds-trace-top: 8px;
  --cds-trace-right: 34px;
  position: absolute !important; top: var(--cds-trace-top) !important; right: var(--cds-trace-right) !important;
  display: inline-flex; align-items: center; justify-content: center;
  box-sizing: border-box; width: var(--cds-copy-size, 18px); height: var(--cds-copy-size, 18px);
  padding: 0 !important; margin: 0 !important; border: 0 !important;
  border-radius: var(--cds-copy-radius, 4px) !important;
  background: transparent !important; color: var(--cds-copy-ink, var(--dsw-alias-label-tertiary));
  font-size: 0 !important; line-height: 0; cursor: pointer; z-index: 3;
  opacity: 0 !important; pointer-events: none;
  transition: opacity 100ms ${EASING.swift};
}
[data-conversation-content] [data-cds-diffrow] > [data-cds-tool-inspect] { top: 3px !important; right: 26px !important; }
[data-cds-diffrow][data-inspect] > [data-cds-diffrow-head] { padding-right: 52px; }
/* Read keeps its React-owned controls inside the payload tree. Only their
   positioning ancestors become static, so the row root owns their visual seat.
   The code scroller and its overflow remain unchanged. */
[data-conversation-content] [data-cds-tool-row-actions] { position: relative; }
[data-conversation-content] [data-cds-tool-row-path] { position: static !important; }
[data-conversation-content] [data-cds-tool-row-banner] {
  width: 0 !important; height: 0 !important; min-height: 0 !important;
  padding: 0 !important; margin: 0 !important; border: 0 !important;
}
[data-conversation-content] [data-cds-tool-row-head] { padding-right: 52px !important; }
[data-conversation-content] [data-cds-tool-row-action] {
  position: absolute !important; top: 3px !important; right: 0 !important;
  width: var(--cds-copy-size, 18px); height: var(--cds-copy-size, 18px);
  opacity: 0 !important; pointer-events: none !important; z-index: 3;
}
[data-conversation-content] [data-cds-tool-row-action="inspect"] { right: 26px !important; }
[data-conversation-content] [data-cds-tool-row-actions]:hover [data-cds-tool-row-banner],
[data-conversation-content] [data-cds-tool-row-actions]:hover [data-cds-tool-row-action] {
  opacity: 1 !important; pointer-events: auto !important;
}
[data-cds-tool-inspect] > svg { display: none; }
[data-cds-tool-inspect]::before {
  content: ''; width: var(--cds-copy-icon, 12px); height: var(--cds-copy-icon, 12px);
  background: currentColor; mask: url('${TRACE_ICON}') center / contain no-repeat;
}
[data-conversation-content] [data-cds-tool-inspect],
[data-conversation-content] [data-cds-tool-copy],
[data-conversation-content] [data-cds-diff-copy] {
  transition: opacity var(--cds-copy-reveal, 100ms) ${EASING.swift}, color var(--cds-copy-reveal, 100ms) ${EASING.swift};
}
/* Banner opacity must not multiply Copy's animation or reveal it on the outer
   slot while Inspect still waits for the panel. Only the buttons fade. */
[data-conversation-content] [data-cds-tool-body] [data-code-block-banner] {
  opacity: 1 !important; pointer-events: none !important; transition: none !important;
}
[data-conversation-content] [data-cds-tool-copy] { opacity: 0 !important; pointer-events: none !important; }
[data-conversation-content] [data-cds-tool-body]:hover [data-cds-tool-copy] { opacity: 1 !important; pointer-events: auto !important; }
[data-cds-tool-body]:hover > [data-cds-tool-inspect],
[data-cds-diffrow]:hover > [data-cds-tool-inspect],
/* The legacy surfaces own Copy directly. Inspect must ride the SAME owner, or
   the pair splits: hovering the card shows one control and not the other. */
[data-search]:hover [data-cds-tool-inspect],
[data-read]:hover [data-cds-tool-inspect],
[data-diff]:hover [data-cds-tool-inspect],
[data-terminal]:hover [data-cds-tool-inspect],
.dsh-gb-tool-request:hover > [data-cds-tool-inspect] {
  opacity: 1 !important; pointer-events: auto;
}
[data-cds-tool-inspect]:hover { color: var(--cds-copy-ink-hover, var(--dsw-alias-label-primary)); }
[data-cds-tool-inspect]:focus-visible { outline: 1px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
/* The seat is derived from the copy control it sits beside, not assumed: each
   host panel puts its copy in a different box (a header bar with its own
   padding, a banner, a bare corner), so the marker measures that control once
   per panel and hands the offset over as --cds-trace-top. The fallbacks are the
   corner seat for a card whose copy has not been marked yet. */
[data-conversation-content] [data-cds-search-recovery] {
  border: 0 !important; border-radius: 0 !important; background: transparent !important;
  margin: 6px 0 0 !important; padding: 0 !important; max-height: none; overflow: visible;
  font-size: 0 !important; line-height: 0; box-shadow: none;
}
[data-cds-search-recovery]::after {
  content: attr(data-cds-search-recovery); display: block;
  font: var(--dsw-font-xxs-11, 11px/16px var(--dsw-font-family));
  color: var(--dsw-alias-label-tertiary); white-space: pre-wrap; overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  [data-conversation-content] [data-cds-tool-inspect],
  [data-conversation-content] [data-cds-tool-copy],
  [data-conversation-content] [data-cds-diff-copy] { transition: none; }
}
`
}
