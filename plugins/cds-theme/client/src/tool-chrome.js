/** Mark native tool chrome from stable tool/surface hooks; React owns every node. */
export const TRACE_ATTR = 'data-cds-tool-inspect'
export const BODY_ATTR = 'data-cds-tool-body'
export const RECOVERY_ATTR = 'data-cds-search-recovery'
const INSPECT_LABEL = /^(?:在轨迹中查看|在轨迹中检查|查看轨迹|查看|View in trajectory|Inspect in trajectory|Inspect)$/i

/** Keep only the recorded spill notice when the search card already shows its results. */
export function searchRecoveryNotice(text) {
  const value = text.trim()
  const split = value.lastIndexOf('\n\n(')
  const notice = split < 0 ? value : value.slice(split + 2)
  return notice.startsWith('(') && notice.endsWith(')') &&
    /Full (?:sorted|formatted) result stored at:/.test(notice) && /\bUse (?:read|grep)\b/.test(notice)
    ? notice : null
}

export function createToolChromeMarker(doc) {
  const view = doc.defaultView
  let observer = null, frame = null, started = false
  let marked = new Map()

  /**
   * Seat the glyph on the copy control it belongs beside.
   *
   * The three host panels put "Copy" in different boxes — the search card's own
   * header bar (9px/14px padding), the code banner, a bare corner — so a fixed
   * `top` lines up with at most one of them. The copy control is the anchor, and
   * its live geometry is read ONCE per panel (never per frame); a panel that is
   * re-mounted is a new node and gets measured again. The fallback when there is
   * nothing to measure (a test DOM without layout) is the corner seat from CSS.
   */
  function seat(button, body) {
    if (button.dataset.cdsTraceSeated === '1') return
    const copy = body.querySelector('[data-cds-native-copy]') ||
      body.querySelector('[data-search] > *:first-child button') ||
      body.querySelector('[data-code-block-banner] button')
    if (copy === null || typeof copy.getBoundingClientRect !== 'function' ||
        typeof body.getBoundingClientRect !== 'function') return
    const a = copy.getBoundingClientRect(), b = body.getBoundingClientRect()
    if (a.width === 0 && a.height === 0) return
    button.style.setProperty('--cds-trace-top', Math.round(a.top - b.top) + 'px')
    button.style.setProperty('--cds-trace-right', Math.round(b.right - a.left + 8) + 'px')
    button.dataset.cdsTraceSeated = '1'
  }

  function sweep() {
    if (!started) return
    const next = new Map()
    const put = (node, name, value = '') => {
      if (!next.has(node)) next.set(node, new Map())
      next.get(node).set(name, value)
    }
    for (const root of doc.querySelectorAll('[data-tool]')) {
      if (!root.closest('[data-slot="tool.call.toolview"]') || !root.closest('[data-conversation-content]')) continue
      for (const button of root.querySelectorAll('button')) {
        if (button.hasAttribute(TRACE_ATTR) && !marked.get(button)?.has(TRACE_ATTR)) continue
        if (!INSPECT_LABEL.test(button.textContent.trim()) || !button.querySelector('svg')) continue
        put(button, TRACE_ATTR)
        put(button.parentElement, BODY_ATTR)
        if (!button.hasAttribute('title') || marked.get(button)?.has('title')) put(button, 'title', button.textContent.trim())
        seat(button, button.parentElement)
      }
      for (const surface of root.querySelectorAll('[data-search]')) {
        const recovery = surface.nextElementSibling
        if (!recovery || recovery.tagName !== 'DIV') continue
        const notice = searchRecoveryNotice(recovery.textContent)
        if (notice !== null) put(recovery, RECOVERY_ATTR, notice)
      }
    }
    for (const [node, attrs] of marked) {
      for (const name of attrs.keys()) if (!next.get(node)?.has(name)) node.removeAttribute(name)
    }
    for (const [node, attrs] of next) {
      for (const [name, value] of attrs) if (node.getAttribute(name) !== value) node.setAttribute(name, value)
    }
    marked = next
  }
  function schedule() {
    if (!started || frame !== null) return
    frame = view.requestAnimationFrame(() => { frame = null; sweep() })
  }

  /**
   * Re-seat every marked control after the window changes size.
   *
   * A resize reflows the copy controls — the search card's header height and the
   * wrap of a long summary both move — and the seat was measured once. This is a
   * resize listener, NOT a layout read per frame: it fires when the geometry has
   * actually changed, then clears the marks and measures again in one pass.
   */
  function reseat() {
    for (const node of marked.keys()) {
      if (node.dataset?.cdsTraceSeated !== '1') continue
      node.style?.removeProperty('--cds-trace-top')
      node.style?.removeProperty('--cds-trace-right')
      delete node.dataset.cdsTraceSeated
    }
    if (frame !== null) view.cancelAnimationFrame(frame)
    frame = view.requestAnimationFrame(() => { frame = null; sweep() })
  }
  return {
    start() {
      if (started || !doc.body || !view?.MutationObserver || !view.requestAnimationFrame) return
      started = true
      sweep()
      observer = new view.MutationObserver(records => {
        for (const record of records) {
          if (record.type === 'characterData') continue
          for (const node of record.addedNodes || []) {
            if (node.nodeType === 1 && (node.closest('[data-tool]') || node.hasAttribute('data-tool') || node.querySelector('[data-tool]'))) { schedule(); return }
          }
          if (record.removedNodes?.length && [...marked.keys()].some(node => !node.isConnected)) { schedule(); return }
        }
      })
      observer.observe(doc.body, { subtree: true, childList: true })
      view.addEventListener('resize', reseat)
    },
    stop() {
      if (!started) return
      started = false
      view.removeEventListener('resize', reseat)
      observer.disconnect(); observer = null
      if (frame !== null) view.cancelAnimationFrame(frame)
      frame = null
      for (const [node, attrs] of marked) {
        for (const name of attrs.keys()) node.removeAttribute(name)
        // The seat is an inline length pair, so it must go with the marks: a
        // disposed marker leaving a custom property behind would pin a control
        // at a position nothing owns any more.
        if (node.dataset?.cdsTraceSeated === '1') {
          node.style?.removeProperty('--cds-trace-top')
          node.style?.removeProperty('--cds-trace-right')
          delete node.dataset.cdsTraceSeated
        }
      }
      marked.clear()
    },
    sweep,
  }
}
