/**
 * Sidebar WORKSPACE (folder) details card: CDS surface and text roles.
 *
 * WHY A SECOND MODULE. `session-preview-styles.js` covers the SESSION card, and
 * it anchors on `[data-slot="sidebar.session.row.hover"]` — an outlet the host
 * renders inside `SessionHoverContent`. The folder card is a DIFFERENT component
 * (`WorkspaceHoverContent`) that renders no slot at all, so that selector can
 * never reach it and the folder card keeps the host's hard-coded dark fill.
 *
 * WHAT DISTINGUISHES THE TWO, measured on the running app rather than guessed:
 *
 *   folder card    background rgb(44,44,46)   content rows: 3, no data-slot
 *   session card   background rgb(255,255,255) content rows: 4, one is the slot
 *
 * `WorkspaceHoverContent` is `hoverTitle / hoverPath / hoverTime` and nothing
 * else, while `SessionHoverContent` always carries at least the title, the
 * relative time and the session-row slot. So "exactly three direct rows AND no
 * slot anywhere inside" separates them without touching a salted class name.
 *
 * WHY THE VARIABLE ALONE IS NOT ENOUGH. `--dsh-hover-preview-fade` is written by
 * the shared `HoverCard` primitive, so every hover card has it — including the
 * deliverables package's single-file preview (`variant="preview"`). Matching on
 * the variable alone would repaint unrelated cards, which is why the structural
 * clause is part of the selector rather than a refinement.
 *
 * SCOPE. Colour, border, radius and shadow only. Display, position and
 * pointer-events belong to the host's portal; changing them here would fight
 * its collision placement and its own fade.
 */
export const WORKSPACE_PREVIEW_ROOT = 'body [style*="--dsh-hover-preview-fade"]:has(> div > :nth-child(3):last-child):not(:has([data-slot]))'

export function workspacePreviewRules() {
  const root = WORKSPACE_PREVIEW_ROOT
  return `
/* ---- sidebar workspace preview: current CDS surface and text roles ---- */
${root} {
  background: var(--dsw-alias-bg-overlay) !important;
  color: var(--dsw-alias-label-primary) !important;
  border: 0 !important;
  border-radius: var(--dsw-radius-lg) !important;
  box-shadow: var(--dsw-elevation-prominent) !important;
}
${root} > div > div:not(:first-child) {
  color: var(--dsw-alias-label-tertiary) !important;
}
${root} > div > div:first-child {
  color: var(--dsw-alias-label-primary) !important;
}
`
}
