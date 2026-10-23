/**
 * Sidebar session details are a raised preview, while short tooltips remain
 * inverse. The host gives this portal a hover-preview variable and always
 * renders the session's extension slot directly inside its content container.
 * Both anchors are needed: neither every hover card nor every tooltip is ours.
 */
export const SESSION_PREVIEW_ROOT = 'body [style*="--dsh-hover-preview-fade"]:has(> div > [data-slot="sidebar.session.row.hover"])'

export function sessionPreviewRules() {
  const root = SESSION_PREVIEW_ROOT
  return `
/* ---- sidebar session preview: current CDS surface and text roles ---- */
${root} {
  background: var(--dsw-alias-bg-overlay) !important;
  color: var(--dsw-alias-label-primary) !important;
  border: 0 !important;
  border-radius: var(--dsw-radius-lg) !important;
  box-shadow: var(--dsw-elevation-prominent) !important;
}
${root} > div > div:not([data-slot]) {
  color: var(--dsw-alias-label-secondary) !important;
}
${root} > div > div:first-child {
  color: var(--dsw-alias-label-primary) !important;
}
${root} > div > div:nth-child(2):not([data-slot]) {
  color: var(--dsw-alias-label-tertiary) !important;
}
`
}
