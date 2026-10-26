/**
 * The context rail's stylesheet.
 *
 * Every colour is a host theme token or a color-mix of one, so the rail follows
 * the active theme (including dsh-cds-theme) instead of freezing a palette of
 * its own. The only literals are alpha fractions and the three band hues the
 * host's own composer meter already hardcodes for the same three bands.
 *
 * AN IN-PAGE RAIL, NOT A PANEL. The rail is a fixed column anchored to the
 * measured rectangle of the conversation body; the page reserves its width with
 * padding, so there is no vertical divider and no host column involved. Each
 * section inside it is a rounded module with a hairline edge.
 *
 * NO BACKTICKS IN THIS FILE. The whole sheet is one template literal; a stray
 * backtick in a comment ends the string early. See AGENTS.md.
 */

export const STYLE_ID = '@hwfee/dsh-context-rail/rail.css'

export const CSS = `
.dcr-toggle {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 6px);
  background: none;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}

.dcr-toggle:hover,
.dcr-toggle[aria-pressed="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dcr-toggle:focus-visible {
  outline: 2px solid var(--dsw-alias-border-focus, var(--dsw-alias-border-l3));
  outline-offset: 2px;
}

body[data-dcr-open="true"] [data-conversation-scroll] {
  padding-right: var(--dcr-rail-width, 328px);
}

.dcr-rail {
  box-sizing: border-box;
  position: fixed;
  right: calc(var(--dsh-scrollbar-width, 5px) + 2px);
  z-index: 3;
  display: flex;
  flex-direction: column;
  width: 328px;
  min-height: 0;
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
}

.dcr-root {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 12px 20px;
  font-family: var(--dsw-font-family);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  scrollbar-width: thin;
}

.dcr-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px 12px 14px;
  border: .5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-lg, 12px);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent);
}

.dcr-head {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.dcr-head:focus-visible {
  outline: 2px solid var(--dsw-alias-border-focus, var(--dsw-alias-border-l3));
  outline-offset: 4px;
  border-radius: var(--dsw-radius-sm, 4px);
}

.dcr-title {
  font-weight: 600;
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-primary);
}

.dcr-spacer { flex: 1 1 auto; }

.dcr-head-meta {
  flex: none;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

.dcr-chevron {
  flex: none;
  margin-left: 2px;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 140ms ease;
}

.dcr-card[data-collapsed="true"] .dcr-chevron { transform: rotate(-90deg); }

.dcr-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dcr-figures {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 2px;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

.dcr-bar {
  display: flex;
  gap: 1px;
  height: 4px;
  margin: 1px 0 6px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--dsw-alias-interactive-bg-hover);
}

.dcr-seg {
  flex: none;
  height: 100%;
  min-width: 1px;
  border-radius: 1px;
  background: var(--dcr-tint, var(--dsw-alias-label-tertiary));
}

.dcr-seg[data-band="system"] { --dcr-tint: var(--dsw-static-neutral-bluish-400, #9aa0a6); }
.dcr-seg[data-band="tools"] { --dcr-tint: #a78bfa; }
.dcr-seg[data-band="messages"] { --dcr-tint: var(--dsw-static-blue-450, #3b82f6); }
.dcr-seg[data-band="free"] { --dcr-tint: transparent; flex: 1 1 auto; }

.dcr-rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
}

.dcr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 21px;
}

.dcr-row dt {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
}

.dcr-row dd {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 10px;
  margin: 0;
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
  text-align: right;
}

.dcr-pct {
  flex: none;
  min-width: 42px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}

.dcr-swatch {
  display: inline-block;
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dcr-tint, var(--dsw-alias-label-tertiary));
}

.dcr-swatch[data-band="system"] { --dcr-tint: var(--dsw-static-neutral-bluish-400, #9aa0a6); }
.dcr-swatch[data-band="tools"] { --dcr-tint: #a78bfa; }
.dcr-swatch[data-band="messages"] { --dcr-tint: var(--dsw-static-blue-450, #3b82f6); }
.dcr-swatch[data-band="free"] { --dcr-tint: var(--dsw-alias-border-l3); }

.dcr-value {
  max-width: 62%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dcr-empty {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

`

/**
 * Install the sheet once per document.
 * @returns {() => void} disposer that removes this plugin's tag
 */
export function installCss() {
  if (typeof document === 'undefined') return () => {}
  const existing = document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]')
  if (existing !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = '@hwfee/dsh-context-rail'
  tag.dataset.pluginCss = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => {
    if (tag.parentNode !== null) tag.parentNode.removeChild(tag)
  }
}
