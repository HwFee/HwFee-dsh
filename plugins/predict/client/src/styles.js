/** The prediction settings row, in the host's own tokens. */
const STYLE_MARKER = 'data-dsh-predict-style'

const CSS = `
.dsh-predict-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
}

.dsh-predict-main { min-width: 0; flex: 1; }

.dsh-predict-title {
  font-size: var(--dsh-content-font-size, 14px);
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}

.dsh-predict-hint {
  margin-top: 2px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-predict-control {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.dsh-predict-model-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-predict-model-label {
  font-size: var(--dsh-content-font-size-caption, 12px);
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.dsh-predict-model-input {
  width: 200px;
  height: 28px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
}

.dsh-predict-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 260px;
  height: 28px;
  padding: 0 4px 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  cursor: pointer;
}

.dsh-predict-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-predict-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-predict-group {
  padding: 6px 8px 2px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  color: var(--dsw-alias-label-tertiary);
}

.dsh-predict-item {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 160px;
}

.dsh-predict-check {
  display: inline-flex;
  color: var(--dsw-alias-label-primary);
}

.dsh-predict-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  color: var(--dsw-alias-label-tertiary);
}

.dsh-predict-retry {
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.dsh-predict-search {
  margin: 2px 0 3px;
}
`

/**
 * Install the stylesheet, returning its disposer.
 * @param {Document | undefined} doc the document
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

export const ROW_CSS = CSS
