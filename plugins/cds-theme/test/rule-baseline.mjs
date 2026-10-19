// AUTO-GENERATED from the pre-toggle-removal sheet, then reviewed.
// These two blocks are the EXACT emitted text of the always-on rule sets.
// Do not regenerate this file to make a failing test pass: a diff here means
// the rules changed, which is exactly what test/css.test.mjs asserts.
export const CODE_BLOCK_RULES = "/* ---- code artefact details: banner, disclosure row ---------------- */\n[data-code-block-banner] > :first-child,\n[data-code-block-banner] > :first-child > :first-child {\n  font-family: var(--ds-font-family-code) !important;\n  font-size: 10.5px !important;\n  line-height: 12px !important;\n  font-weight: 500 !important;\n  text-transform: uppercase !important;\n  letter-spacing: 0.05em !important;\n}\n[data-code-block-banner] > :first-child > :not(:first-child) {\n  font-family: var(--dsw-font-family) !important;\n  font-size: 11px !important;\n  line-height: 18px !important;\n  font-weight: 400 !important;\n  text-transform: none !important;\n  letter-spacing: normal !important;\n}\n.md-code-block [data-code-block-banner],\n[data-code-block-banner] {\n  border-bottom: .5px solid var(--dsw-alias-border-l2) !important;\n}\n[data-disclosure-header] {\n  font-size: 12px;\n  line-height: 16px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n  transition: color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n[data-disclosure-header] :where(span, div, button) {\n  font-size: inherit;\n  line-height: inherit;\n  font-weight: inherit;\n}\n[data-disclosure-header]:hover,\n[data-disclosure-header]:focus-within {\n  color: var(--dsw-alias-label-primary);\n}\n\n"

export const MARKDOWN_BODY_RULES = "/* ---- markdown body: table frame + quote rhythm --------------------- */\n[data-cds-table] {\n  box-sizing: border-box;\n  border: .5px solid var(--dsw-alias-border-l1);\n  border-radius: var(--dsw-radius-md);\n  background: var(--dsw-alias-bg-base);\n  width: 100% !important;\n  max-width: 100% !important;\n  margin-left: 0 !important;\n  padding-left: 0 !important;\n  overflow-x: auto !important;\n  padding-bottom: 0 !important;\n}\n[data-cds-table] table {\n  width: 100% !important;\n  max-width: 100% !important;\n}\n[data-cds-table] th {\n  background: var(--dsw-alias-bg-module-platform);\n  border-bottom: .5px solid var(--dsw-alias-border-l1) !important;\n}\n[data-cds-table] th,\n[data-cds-table] td {\n  padding: 10px 14px !important;\n  max-width: none !important;\n  overflow-wrap: anywhere;\n}\n[data-cds-table] th:first-child,\n[data-cds-table] td:first-child {\n  padding-left: 14px !important;\n}\n[data-cds-table] th:last-child,\n[data-cds-table] td:last-child {\n  padding-right: 14px !important;\n}\n[data-cds-table] tbody tr:last-child td {\n  border-bottom: none;\n}\n[data-cds-table] td {\n  font-variant-numeric: tabular-nums !important;\n}\n[data-cds-table] table code {\n  font-size: .875em !important;\n}\n[data-chat-flow] blockquote {\n  margin: 16px 0 !important;\n}\n\n"

export const CODE_BLOCK_RULE_COUNT = 6

export const MARKDOWN_BODY_RULE_COUNT = 10

// ---- hero compaction rules: RETIRED. The blank-session greeting/dock collapse
// measured `[data-composer-seat]`, which wraps the whole hero stack, so hiding
// the greeting fed the next measurement and the layout oscillated. The rules,
// the runtime and the switch are gone; the replacement is the CSS-only
// new-session text cap asserted in test/css.test.mjs.

// ---- the A-tier batch: one block per item switch, captured with every
// switch ON (the replicated look). Turning a switch off must remove exactly
// its block and change nothing else; test/css.test.mjs asserts that.
export const A_TIER_RULES = {
  footnotes: "/* ---- footnotes: 12/15, tertiary, half-pixel rule above ------------- */\n[data-footnotes] {\n  font-size: 12px;\n  line-height: 15px;\n  color: var(--dsw-alias-label-tertiary);\n  border-top: .5px solid var(--dsw-alias-border-l2);\n  padding-top: 10px;\n}\n[data-chat-flow] sup {\n  font-family: var(--ds-font-family-code);\n  font-variant-numeric: tabular-nums;\n  line-height: 0;\n}\n\n",
  buttonSpring: "/* ---- button spring: press movement on this plugin's own controls ---- */\n.dct-swatch, .dct-toggle, .dct-mode-cube {\n  transition: transform 260ms var(--cds-btn-spring), box-shadow 120ms cubic-bezier(0.16, 1, 0.3, 1), background-color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n.dct-swatch:active, .dct-toggle:active, .dct-mode-cube:active {\n  transform: scale(.96);\n}",
  motionTokens: "/* ---- motion tokens: the reference spring + the two unused curves ---- */\n:root {\n  --cds-btn-spring: linear(0, .2459, .6526, .9468, 1.0764, 1.0915, 1.0585, 1.0219, .9993, .9914, .9921, .9957, .9988, 1.0004, 1);\n  --cds-ease-rise: cubic-bezier(.3, .7, .4, 1);\n  --cds-ease-fall: cubic-bezier(0, 0, .2, 1);\n}\n\nbody :focus-visible:not(:read-write) {\n  outline-color: transparent !important;\n  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base), 0 0 0 1.5px var(--dsw-focus-ring-color), 0 0 6px 1px var(--dsw-focus-ring-glow) !important;\n}\nhtml[data-input-modality='pointer'] body :focus-visible:not(:read-write) {\n  box-shadow: none !important;\n}\nbody :focus-visible:read-write {\n  outline-color: var(--dsw-focus-ring-color) !important;\n}\n\n",
}

// ---- the B-tier batch: one block per item switch, captured with every switch
// ON. Turning a switch off must remove exactly its block and change nothing else.
export const B_TIER_RULES = {
  statTypography: "/* ---- usage numbers: tabular counting + the dt/dd ladder -------------- */\n[data-composer-stat] {\n  font-variant-numeric: tabular-nums;\n}\n[data-session-stats-details], [data-turn-usage-details] {\n  display: grid;\n  grid-template-columns: auto 1fr;\n  column-gap: 6px;\n  row-gap: 4px;\n  align-items: baseline;\n}\n[data-session-stats-details] dt, [data-turn-usage-details] dt {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 15px;\n  font-weight: 400;\n}\n[data-session-stats-details] dd, [data-turn-usage-details] dd {\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  line-height: 15px;\n  font-variant-numeric: tabular-nums;\n}\n\n",
}
