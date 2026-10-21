/**
 * The settings row's stylesheet.
 *
 * Mirrors the host's own general-settings rows: a two-column row with the label
 * block on the left and its control on the right, separated by a hairline.
 * Every value is a host token, so the row matches its neighbours in both themes.
 */

const STYLE_MARKER = 'data-dsh-git-bash-style'

const CSS = `
.dsh-git-bash-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  /* NO border of our own. cds-theme owns the rule that draws the hairline under
     every settings row (the slot-child selector), and its selector is more
     specific than a single class — so a border here LOSES and the row ends up
     with the theme's line anyway. Declaring it was worse than useless: it made
     this row's line look different from its neighbours whenever the specificity
     race went the other way. The theme draws it; the row leaves space for it. */
}

.dsh-git-bash-main {
  min-width: 0;
  flex: 1;
}

.dsh-git-bash-title {
  font-size: var(--dsh-content-font-size, 14px);
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}

.dsh-git-bash-hint {
  margin-top: 2px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-git-bash-status {
  margin-top: 6px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  /* A Windows path is long and has no spaces to break at, so wrap anywhere
     rather than let it push the menu off the row. */
  overflow-wrap: anywhere;
}

.dsh-git-bash-missing {
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-code-diff-deleted));
}

/* The trigger states the current mode, so the row is readable without opening
   the menu — the same shape the host's own multi-value rows use. */
.dsh-git-bash-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  align-self: flex-start;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  cursor: pointer;
}

.dsh-git-bash-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-git-bash-trigger:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.dsh-git-bash-select {
  flex: none;
  align-self: flex-start;
  height: 32px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
}

/* One row per mode inside the popup, with a check on the active one. */
.dsh-git-bash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 190px;
}

.dsh-git-bash-check {
  display: inline-flex;
  color: var(--dsw-alias-brand-primary);
}
`

/**
 * Install the stylesheet, returning its disposer.
 *
 * Idempotent: a tag left by an HMR reload is removed first, so the DOM never
 * carries two copies and a later dispose cannot remove the wrong one.
 *
 * @param {Document | undefined} doc the document to mount into
 * @returns {() => void} disposer
 */
export function installCss(doc) {
  if (doc === undefined || doc === null || typeof doc.createElement !== 'function') {
    return function disposeWithoutDocument() {}
  }
  const previous = doc.querySelector(`style[${STYLE_MARKER}]`)
  if (previous !== null) previous.remove()

  const tag = doc.createElement('style')
  tag.setAttribute(STYLE_MARKER, '')
  tag.textContent = CSS
  doc.head.append(tag)

  return function dispose() { tag.remove() }
}

/** The stylesheet text, for tests. */
export const ROW_CSS = CSS
