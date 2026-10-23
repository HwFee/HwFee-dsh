/** Keep a growing blank-session composer in view without changing hero heights.
 * The page already scrolls and the editor already has its own text scrollport.
 * Resize notifications only move the existing page scroll position; they never
 * change measured sizes, hide content, or schedule a measurement feedback loop.
 */
export function createHeroComposerVisibility(doc) {
  const view = doc.defaultView
  let started = false, mutations = null, resize = null, frame = null
  let root = null, page = null, card = null

  function reveal() {
    if (!started || !root?.isConnected || root.getAttribute('data-content-phase') !== 'hero') return
    const input = card?.querySelector('[data-composer-input]')
    if (!input || !(input === doc.activeElement || input.contains(doc.activeElement))) return
    const edge = Math.min(page.getBoundingClientRect().bottom, view.innerHeight)
    const bottom = card.getBoundingClientRect().bottom
    const overflow = bottom + 16 - edge
    // A fractional layout remainder must not trigger repeated scroll writes.
    if (overflow > 1) page.scrollTop += overflow
  }

  function bind() {
    const next = doc.querySelector('[data-conversation-content][data-content-phase="hero"]')
    const nextPage = next?.querySelector('[data-conversation-scroll]') || null
    const nextCard = next?.querySelector('[data-composer-input]')?.closest('[data-composer-card]') || null
    if (next === root && nextPage === page && nextCard === card) return
    resize?.disconnect()
    root = next; page = nextPage; card = nextCard
    if (page && card) {
      resize.observe(page)
      resize.observe(card)
      reveal()
    }
  }

  function scheduleBind(records) {
    if (!started || frame !== null) return
    const relevant = !records || (card !== null && !card.isConnected) || records.some(record => {
      if (record.type === 'attributes') return true
      return [...(record.addedNodes || [])].some(node => node.nodeType === 1 &&
        (node.hasAttribute('data-composer-card') || node.querySelector('[data-composer-card]')))
    })
    if (relevant) frame = view.requestAnimationFrame(() => { frame = null; if (started) bind() })
  }

  function focused(event) {
    if (card?.contains(event.target)) reveal()
  }

  return {
    start() {
      if (started || !view?.ResizeObserver || !view?.MutationObserver || !doc.body) return
      started = true
      resize = new view.ResizeObserver(reveal)
      mutations = new view.MutationObserver(scheduleBind)
      mutations.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-content-phase'] })
      doc.addEventListener('focusin', focused, { passive: true })
      bind()
    },
    stop() {
      if (!started) return
      started = false
      mutations.disconnect(); resize.disconnect()
      doc.removeEventListener('focusin', focused)
      if (frame !== null) view.cancelAnimationFrame(frame)
      frame = null; mutations = null; resize = null; root = null; page = null; card = null
    },
  }
}
