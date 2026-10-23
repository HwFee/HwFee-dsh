/**
 * Legacy SearchBlock (grep/glob), ReadBlock, DiffBlock and TerminalBlock use
 * text copy buttons without data-code-block-banner. Locate their documented
 * header structure from stable surface hooks and add only an owned attribute.
 * React keeps the text and click handler; CSS draws the same copy/check glyph
 * as the newer controls, and the text remains the accessible button name.
 */
export const NATIVE_COPY_ATTR = 'data-cds-native-copy'
const SURFACES = '[data-search], [data-read], [data-diff], [data-terminal]'
const LABEL = /^(copy(?: code| results| output)?|copied!?|复制|复制成功|已复制)$/i
const COPIED = /^(copied!?|复制成功|已复制)$/i

/** Return only known text-copy controls, never expand/file-header buttons. */
export function findNativeCopyButtons(doc) {
  const found = new Set()
  for (const surface of doc.querySelectorAll(SURFACES)) {
    if (!surface.closest('[data-conversation-content]')) continue
    const header = surface.firstElementChild
    if (!header) continue
    let candidates
    if (surface.hasAttribute('data-diff')) candidates = [header]
    else if (surface.hasAttribute('data-read')) candidates = Array.from(header.lastElementChild?.children || [])
    else candidates = Array.from(header.children || [])
    for (const button of candidates) {
      if (button.tagName !== 'BUTTON' || button.closest('[data-code-block-banner]')) continue
      if (LABEL.test(button.textContent.trim())) found.add(button)
    }
  }
  return found
}

/** Own marks, observe late mounts/success text, and restore on disable. */
export function createNativeCopyMarker(doc) {
  const view = doc.defaultView
  let observer = null
  let frame = null
  let started = false
  let marked = new Set()
  function sweep() {
    if (!started) return
    const next = findNativeCopyButtons(doc)
    for (const button of marked) {
      if (!next.has(button)) button.removeAttribute(NATIVE_COPY_ATTR)
    }
    for (const button of next) {
      const state = COPIED.test(button.textContent.trim()) ? 'copied' : 'idle'
      if (button.getAttribute(NATIVE_COPY_ATTR) !== state) button.setAttribute(NATIVE_COPY_ATTR, state)
    }
    marked = next
  }
  function schedule() {
    if (!started || frame !== null) return
    frame = view.requestAnimationFrame(() => { frame = null; sweep() })
  }
  return {
    start() {
      if (started || !doc.body || !view?.MutationObserver || !view.requestAnimationFrame) return
      started = true
      sweep()
      observer = new view.MutationObserver(records => {
        for (const record of records) {
          const target = record.target.nodeType === 1 ? record.target : record.target.parentElement
          if (target?.closest('[' + NATIVE_COPY_ATTR + ']')) { schedule(); return }
          // Streamed text outside a copy button cannot create a control.
          for (const node of record.addedNodes || []) {
            if (node.nodeType !== 1) continue
            if (target?.closest(SURFACES) || node.matches(SURFACES) || node.querySelector(SURFACES)) {
              schedule(); return
            }
          }
          // A removed/reparented surface must release any detached marks.
          if (record.removedNodes?.length && marked.size > 0) {
            for (const button of marked) {
              if (!button.isConnected || !button.closest('[data-conversation-content]')) { schedule(); return }
            }
          }
        }
      })
      observer.observe(doc.body, { subtree: true, childList: true, characterData: true })
    },
    stop() {
      if (!started) return
      started = false
      observer.disconnect()
      observer = null
      if (frame !== null) view.cancelAnimationFrame(frame)
      frame = null
      for (const button of marked) button.removeAttribute(NATIVE_COPY_ATTR)
      marked.clear()
    },
    sweep,
  }
}
