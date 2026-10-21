/**
 * Stamp `data-read` / `data-diff` onto the host's payload cards.
 *
 * WHY THIS FILE EXISTS. The theme's tool-card rules were written against
 * `[data-read]` and `[data-diff]`, and neither attribute exists in the shipped
 * DOM: a probe of a live conversation found 47 tool rows carrying
 * `data-tool`, `data-variant` and `data-state`, zero elements with
 * `data-read`, zero with `data-diff`, and seven `[data-code-wrap]` cards. So
 * every rule keyed on those two hooks was inert — the card frame, the mono
 * family, the numbered gutter, the token wash, the hidden path line — which is
 * exactly the "none of it took effect" report.
 *
 * WHY NOT REWRITE THE RULES INSTEAD. `[data-variant="read"]` sits on the ROW
 * root, while the rules need the CARD root (`[data-diff] > [class*="_body_"]`
 * reaches the line container only from the card). Stamping the card lets all
 * of them keep working unchanged. This is also the pattern the repo prescribes:
 * find the target from a stable anchor, then mark it ourselves.
 *
 * The marks are ours, idempotent, and removed on dispose.
 *
 * @param doc the document to observe
 * @returns a disposer
 */
export function installVariantHooks(doc) {
  const STAMPED = ['data-read', 'data-diff']

  const variantOf = (card) => {
    const row = card.closest('[data-tool][data-variant]')
    return row === null ? '' : (row.getAttribute('data-variant') ?? '')
  }

  const apply = (card) => {
    const variant = variantOf(card)
    const want = variant === 'read' ? 'data-read' : (variant === 'edit' || variant === 'write' ? 'data-diff' : '')
    for (const name of STAMPED) {
      if (name === want) {
        if (!card.hasAttribute(name)) card.setAttribute(name, '')
      } else if (card.hasAttribute(name)) {
        card.removeAttribute(name)
      }
    }
  }

  const sweep = (root) => {
    for (const card of root.querySelectorAll('[data-code-wrap]')) apply(card)
  }

  sweep(doc)

  // The conversation re-renders constantly (streaming, expand/collapse), so the
  // observer re-stamps new cards. It only writes an attribute when the value
  // differs, which keeps the callback cheap enough for streaming.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        if (node.matches?.('[data-code-wrap]')) apply(node)
        sweep(node)
      }
    }
  })
  observer.observe(doc.body, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    for (const card of doc.querySelectorAll('[data-code-wrap]')) {
      for (const name of STAMPED) card.removeAttribute(name)
    }
  }
}