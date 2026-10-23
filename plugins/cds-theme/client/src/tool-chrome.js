/** Mark native tool chrome from stable tool/surface hooks; React owns every node. */
export const TRACE_ATTR = 'data-cds-tool-inspect'
export const BODY_ATTR = 'data-cds-tool-body'
export const RECOVERY_ATTR = 'data-cds-search-recovery'
export const ROW_ATTR = 'data-cds-tool-row-actions'
export const ROW_ACTION_ATTR = 'data-cds-tool-row-action'
export const ROW_PATH_ATTR = 'data-cds-tool-row-path'
export const ROW_BANNER_ATTR = 'data-cds-tool-row-banner'
export const ROW_HEAD_ATTR = 'data-cds-tool-row-head'
export const COPY_ATTR = 'data-cds-tool-copy'
const COPY_LABEL = /^(?:copy(?: code| results| output)?|copied!?|复制|复制成功|已复制)$/i

function copyButtons(root) {
  const found = new Set(root.querySelectorAll('[data-cds-native-copy]'))
  for (const banner of root.querySelectorAll('[data-code-block-banner]')) {
    for (const button of banner.querySelectorAll('button')) {
      if (!button.hasAttribute('aria-pressed') && COPY_LABEL.test((button.getAttribute('aria-label') || button.textContent).trim())) found.add(button)
    }
  }
  return [...found]
}
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

  const seats = new Map()

  function clearSeat(button) {
    const previous = seats.get(button)
    if (!previous) return
    for (const [name, value, priority] of previous) {
      if (value === '') button.style.removeProperty(name)
      else button.style.setProperty(name, value, priority)
    }
    delete button.dataset.cdsTraceSeated
    seats.delete(button)
  }

  // Only the read card changes seat. Both controls retain their own React
  // handlers, feedback and clipboard payload. Static ancestors let their
  // absolute boxes resolve against the row root without reparenting nodes.
  function readRow(root, put) {
    if (root.getAttribute('data-tool') !== 'read') return
    const head = root.querySelector('[data-disclosure-row]')
    if (!head || head.getAttribute('aria-expanded') !== 'true') return
    const controls = []
    for (const banner of root.querySelectorAll('[data-code-block-banner]')) {
      const copy = Array.from(banner.querySelectorAll('button')).find(button =>
        !button.hasAttribute('aria-pressed') && COPY_LABEL.test((button.getAttribute('aria-label') || button.textContent).trim()))
      if (copy) {
        controls.push([copy, 'copy'])
        put(banner, ROW_BANNER_ATTR)
      }
    }
    // Older ReadBlock builds use a text copy button instead of a banner.
    if (!controls.length) {
      const copy = root.querySelector('[data-cds-native-copy]')
      if (copy) controls.push([copy, 'copy'])
    }
    const inspect = Array.from(root.querySelectorAll('button')).find(button =>
      INSPECT_LABEL.test(button.textContent.trim()) && button.querySelector('svg'))
    if (inspect) controls.push([inspect, 'inspect'])
    if (!controls.length) return
    put(root, ROW_ATTR)
    put(head, ROW_HEAD_ATTR)
    for (const [button, action] of controls) {
      clearSeat(button)
      put(button, ROW_ACTION_ATTR, action)
      for (let node = button.parentElement; node && node !== root; node = node.parentElement) put(node, ROW_PATH_ATTR)
    }
  }

  /** Measure the panel copy seat for tools that keep actions inside the panel. */
  function seat(button, body) {
    if (button.dataset.cdsTraceSeated === '1') return
    const copy = copyButtons(body)[0] ||
      body.querySelector('[data-search] > *:first-child button')
    if (!copy || typeof copy.getBoundingClientRect !== 'function' ||
        typeof body.getBoundingClientRect !== 'function') return
    const a = copy.getBoundingClientRect(), b = body.getBoundingClientRect()
    if (a.width === 0 && a.height === 0) return
    seats.set(button, ['--cds-trace-top', '--cds-trace-right'].map(name =>
      [name, button.style.getPropertyValue?.(name) || '', button.style.getPropertyPriority?.(name) || '']))
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
      for (const copy of copyButtons(root)) put(copy, COPY_ATTR)
      for (const button of root.querySelectorAll('button')) {
        if (button.hasAttribute(TRACE_ATTR) && !marked.get(button)?.has(TRACE_ATTR)) continue
        if (!INSPECT_LABEL.test(button.textContent.trim()) || !button.querySelector('svg')) continue
        put(button, TRACE_ATTR)
        put(button.parentElement, BODY_ATTR)
        if (!button.hasAttribute('title') || marked.get(button)?.has('title')) put(button, 'title', button.textContent.trim())
        if (root.getAttribute('data-tool') !== 'read') seat(button, button.parentElement)
      }
      readRow(root, put)
      for (const surface of root.querySelectorAll('[data-search]')) {
        const recovery = surface.nextElementSibling
        if (!recovery || recovery.tagName !== 'DIV') continue
        const notice = searchRecoveryNotice(recovery.textContent)
        if (notice !== null) put(recovery, RECOVERY_ATTR, notice)
      }
    }
    for (const [node, attrs] of marked) {
      if (attrs.has(TRACE_ATTR) && !next.get(node)?.has(TRACE_ATTR)) clearSeat(node)
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
    for (const node of [...seats.keys()]) clearSeat(node)
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
      }
      for (const node of [...seats.keys()]) clearSeat(node)
      marked.clear()
    },
    sweep,
  }
}
