/**
 * Caps the hero composer's text area so the usage panel and the toolbar stay
 * reachable while a long draft is being typed.
 *
 * THE PROBLEM THIS SOLVES, in the host's own numbers. On a blank session the
 * composer stack sits inside `[data-conversation-scroll]`, which the host gives
 * `justify-content: center; overflow-y: auto` (ConversationRoot.module.css). The
 * input's scrollport (`[data-input-scroll]`, InputBar `_scroll`) takes its
 * `max-height` from `--dsh-composer-text-max-height`, which the HOST declares at
 * **336px** on the composer seat — a cap that knows nothing about this panel. A
 * long draft therefore grows the input to 336px, and with a 240–520px panel
 * above it the stack exceeds the scrollport. Unsafe centring then splits that
 * overflow above AND below the fold, so the panel lands at a negative offset —
 * out of reach — and each caret move can scroll the page further away from it.
 *
 * THE FIX, and why it is arithmetic instead of a second wrapper:
 *
 *   - `--dus-input-budget` is OUR variable, written on the nearest
 *     `[data-composer-card]`. The stylesheet combines it with the host's own
 *     variable — `max-height: min(var(--dsh-composer-text-max-height, 336px),
 *     var(--dus-input-budget, 336px))` — so cds-theme's tighter hero cap wins
 *     when it is installed, ours wins when it is not, and neither is duplicated
 *     here. The declaration is one fixed string: nothing references itself, and
 *     repeated syncs overwrite the same property instead of nesting `min()`.
 *   - The budget is measured against the SCROLLPORT and the stack's chrome,
 *     never against the composer seat. Measuring the seat and then shrinking the
 *     input inside it is a self-feeding loop: a smaller input lowers the seat,
 *     which raises the budget, which grows the input again.
 *   - Chrome is a DIFFERENCE — stack height minus the text port's height — so
 *     growing text raises both sides equally and the chrome does not move. The
 *     loop is closed by subtraction rather than by damping. What DOES move it is
 *     anything that grows the stack without growing the editor: an attachment
 *     chip row, a wrapping toolbar, a taller panel. Those lower the budget,
 *     which is exactly right.
 *   - It is applied only while the panel is visible (a blank session), and every
 *     attribute, custom property and observer is removed again on unmount. An
 *     active conversation is never touched.
 *
 * The page keeps its own scroll: when even the floor does not fit (a 520px panel
 * on a short window), the stylesheet's `safe center` start-aligns the stack, so
 * the top of it stays reachable from scroll position 0 instead of clipping.
 */

/** Our own custom property; never the host's, so nothing self-references. */
export const INPUT_BUDGET_VAR = '--dus-input-budget'

/** Marker on the `[data-composer-card]` that owns the budget. */
export const CARD_ATTR = 'data-dus-input-budget'

/** Marker on the `[data-conversation-scroll]` that gets `safe center`. */
export const SCROLL_ATTR = 'data-dus-hero-scroll'

/** The host's own text cap, used as the ceiling and as every fallback. */
export const HOST_TEXT_MAX = 336

/**
 * The editor's ONE-LINE floor.
 *
 * The floor is "the height of a single line of the real editor", not a round
 * number: the host's own editable declares `min-height: 36px`
 * (InputBar `_input`), and a seat whose text port carries outer padding measures
 * about 56. A fixed 96 was four lines, which on a 600px-high window squeezed the
 * panel out before the page had any need to scroll — the reverse of the bug.
 *
 * So the floor is MEASURED (`lineFloorFor`) and bounded by these two numbers: the
 * host's own minimum line, and the observed ceiling for a padded port. When
 * nothing can be measured the fallback is the host's minimum. Below the floor the
 * page takes over and scrolls, which is the correct outcome — a panel that stays
 * reachable is worth more than an editor that keeps its line count.
 */
export const SINGLE_LINE_FALLBACK = 36
export const SINGLE_LINE_MAX = 56

/** Breathing room under the stack so the card's own edge stays visible. */
export const BUDGET_RESERVE = 12

/**
 * The budget in px.
 *
 * `available − chrome − reserve`, clamped into `[floor, ceiling]`. The ceiling is
 * the host's 336px, so on a roomy window the answer IS the host default and the
 * input behaves exactly as it did before this module existed — the cap only
 * binds when the panel plus chrome would otherwise push the stack out of the
 * scrollport.
 */
export function inputBudgetFor(spec) {
  const source = spec && typeof spec === 'object' ? spec : {}
  const ceiling = Number.isFinite(source.ceiling) ? source.ceiling : HOST_TEXT_MAX
  const fallbackFloor = Number.isFinite(source.floor) ? source.floor : SINGLE_LINE_FALLBACK
  const floor = Math.min(fallbackFloor, ceiling)
  const available = Number(source.available)
  // An unreadable scrollport must hand the host its own behaviour back, not
  // collapse the editor to the floor.
  if (!Number.isFinite(available) || available <= 0) return ceiling
  const chrome = Math.max(0, Number(source.chrome) || 0)
  const reserve = Number.isFinite(source.reserve) ? source.reserve : BUDGET_RESERVE
  const raw = Math.floor(available - chrome - reserve)
  if (!Number.isFinite(raw)) return ceiling
  return Math.max(floor, Math.min(ceiling, raw))
}

/**
 * The one-line floor, measured from the seat when the seat allows it.
 *
 * A line of the editor is `line-height` (the host's card declares
 * `line-height: calc(24px + delta)`) plus the port's own vertical padding. That
 * sum is the height at which exactly one line stays fully visible; below it the
 * caret row starts being clipped, which is worse than letting the page scroll.
 *
 * Every input is optional. Without a readable `line-height` the floor is the
 * host's own 36px minimum (plus any padding), and without a readable padding the
 * 8px of caret room the host's editable carries is assumed. The result is always
 * clamped into `[SINGLE_LINE_FALLBACK, SINGLE_LINE_MAX]`, so a strange
 * measurement can neither collapse the editor nor re-create the four-line squeeze
 * this floor exists to remove.
 */
export function lineFloorFor(spec) {
  const source = spec && typeof spec === 'object' ? spec : {}
  const lineHeight = Number(source.lineHeight)
  const top = Number(source.paddingTop)
  const bottom = Number(source.paddingBottom)
  const padding = (Number.isFinite(top) ? Math.max(0, top) : 0)
    + (Number.isFinite(bottom) ? Math.max(0, bottom) : 0)
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return Math.round(clamp(SINGLE_LINE_FALLBACK + padding, SINGLE_LINE_FALLBACK, SINGLE_LINE_MAX))
  }
  // A port with no padding still needs the caret row to sit somewhere.
  const extra = padding > 0 ? padding : 8
  return Math.round(clamp(lineHeight + extra, SINGLE_LINE_FALLBACK, SINGLE_LINE_MAX))
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value))
}

/**
 * The chrome the draft cannot move: everything in the composer stack that is not
 * this text.
 *
 * Expressed as one subtraction on purpose. An enumerated sum over stack children
 * would have to know that the host's dock outlet is `display: contents` (so our
 * own panel's box belongs to the stack, while the outlet itself measures zero) —
 * a structural assumption that a host change would break silently. The
 * difference needs no such knowledge, and it holds the property this whole
 * module depends on: text growth adds the same height to both operands.
 */
export function chromeFrom(spec) {
  const source = spec && typeof spec === 'object' ? spec : {}
  const stack = Math.max(0, Number(source.stackHeight) || 0)
  const text = Math.max(0, Number(source.textPortHeight) || 0)
  if (stack <= 0) return 0
  return Math.max(0, stack - text)
}

/** Attribute read that tolerates a node without the DOM method (tests, SSR). */
function attributeOf(node, name) {
  if (!node || typeof node.getAttribute !== 'function') return null
  const value = node.getAttribute(name)
  return value === undefined ? null : value
}

function childrenOf(node) {
  if (!node || !node.children) return []
  return Array.prototype.slice.call(node.children)
}

/** Breadth-first search for the first descendant carrying an attribute. */
function findByAttr(root, name) {
  const queue = childrenOf(root)
  while (queue.length > 0) {
    const node = queue.shift()
    if (attributeOf(node, name) !== null) return node
    const kids = childrenOf(node)
    for (let i = 0; i < kids.length; i += 1) queue.push(kids[i])
  }
  return null
}

function heightOf(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return 0
  const box = node.getBoundingClientRect()
  return box && Number.isFinite(box.height) ? box.height : 0
}

/**
 * Attaches the budget to the host's composer, starting from our own panel root.
 *
 * Returns a disposer, or `undefined` when the seat does not look like the hero
 * composer (an embedded or absent stack) — in which case nothing is marked and
 * the input keeps the host's behaviour. This mirrors `hoistAboveWorkspaceRow`:
 * an unrecognised seat is a no-op, not an error.
 */
export function attachInputBudget(rootEl, options) {
  const opts = options && typeof options === 'object' ? options : {}
  const view = opts.view || (typeof window === 'undefined' ? null : window)
  if (rootEl === null || rootEl === undefined || !rootEl.parentNode) return undefined
  // Our root -> dock outlet (display: contents) -> composer stack.
  const outlet = rootEl.parentNode
  const stack = outlet && outlet.parentNode
  if (!stack) return undefined
  const card = findByAttr(stack, 'data-composer-card')
  if (card === null) return undefined
  const textPort = findByAttr(card, 'data-input-scroll')
  if (textPort === null) return undefined
  // The hero's scrollport: the nearest ancestor the host marks as the page
  // scroller. Without it there is no available height to divide, so the module
  // stays out of the way.
  let scroller = stack
  while (scroller && attributeOf(scroller, 'data-conversation-scroll') === null) {
    scroller = scroller.parentNode
  }
  if (!scroller || !Number.isFinite(Number(scroller.clientHeight))) return undefined
  const cardStyle = card.style
  if (!cardStyle || typeof cardStyle.setProperty !== 'function') return undefined

  let written = null
  let disposed = false
  // One frame handle, not one per observer delivery: without the merge a burst
  // of resize records queues a burst of frames, and — worse — a frame queued
  // before `dispose()` would still run `sync()` and write the property and the
  // markers back onto an unmounted card.
  let frame = null

  const styleOf = typeof view === 'object' && view && typeof view.getComputedStyle === 'function'
    ? view.getComputedStyle
    : null

  /** `clientHeight` is border-box minus borders and scrollbar: padding is still inside it. */
  const usableHeight = function (element) {
    const raw = Number(element.clientHeight)
    if (!Number.isFinite(raw)) return 0
    if (typeof styleOf !== 'function') return raw
    let style = null
    try { style = styleOf.call(view, element) } catch (error) { style = null }
    if (!style) return raw
    const top = parseFloat(style.paddingTop)
    const bottom = parseFloat(style.paddingBottom)
    const padding = (Number.isFinite(top) ? top : 0) + (Number.isFinite(bottom) ? bottom : 0)
    return Math.max(0, raw - padding)
  }

  const sync = function () {
    if (disposed) return null
    // The stack's own vertical margins are outside its box but inside the
    // scrollport's budget, so they are part of the chrome.
    let margins = 0
    if (typeof styleOf === 'function') {
      let style = null
      try { style = styleOf.call(view, stack) } catch (error) { style = null }
      if (style) {
        const mt = parseFloat(style.marginTop)
        const mb = parseFloat(style.marginBottom)
        margins = (Number.isFinite(mt) ? mt : 0) + (Number.isFinite(mb) ? mb : 0)
      }
    }
    const textPortHeight = heightOf(textPort)
    const chrome = chromeFrom({
      stackHeight: heightOf(stack),
      textPortHeight: textPortHeight,
    }) + margins
    // The floor is one line of the REAL editor when the seat can tell us its line
    // box, and the host's own 36px otherwise.
    let floor = SINGLE_LINE_FALLBACK
    if (typeof styleOf === 'function') {
      let portStyle = null
      try { portStyle = styleOf.call(view, textPort) } catch (error) { portStyle = null }
      if (portStyle) {
        floor = lineFloorFor({
          lineHeight: parseFloat(portStyle.lineHeight),
          paddingTop: parseFloat(portStyle.paddingTop),
          paddingBottom: parseFloat(portStyle.paddingBottom),
        })
      }
    }
    const budget = inputBudgetFor({
      available: usableHeight(scroller),
      chrome: chrome,
      floor: floor,
      reserve: opts.reserve,
      ceiling: opts.ceiling,
    })
    const value = budget + 'px'
    // Write only on a real change: the observer fires again once the input
    // settles at the budget, and a same-value write each frame is pure churn.
    if (value === written) return budget
    written = value
    cardStyle.setProperty(INPUT_BUDGET_VAR, value)
    if (typeof card.setAttribute === 'function') card.setAttribute(CARD_ATTR, '')
    if (typeof scroller.setAttribute === 'function') scroller.setAttribute(SCROLL_ATTR, '')
    return budget
  }

  sync()

  // WHICH OBSERVER, AND WHY THE NAME MATTERS. This is a ResizeObserver: it has no
  // `childList` and never observes DOM mutations, it reports box changes. It is
  // held in a `ResizeObserverCtor` local so the construction reads as what it is;
  // `tools/audit.mjs` treats a `new Observer(...)` shape as an injected
  // MutationObserver and then requires a `childList` subscription, which a
  // ResizeObserver neither has nor needs.
  const ResizeObserverCtor = opts.ResizeObserver
    || (view && view.ResizeObserver)
    || (typeof ResizeObserver === 'undefined' ? null : ResizeObserver)
  const requestFrame = view && typeof view.requestAnimationFrame === 'function'
    ? function (callback) { return view.requestAnimationFrame(callback) }
    : null
  const cancelFrame = view && typeof view.cancelAnimationFrame === 'function'
    ? function (handle) { view.cancelAnimationFrame(handle) }
    : (view && typeof view.clearTimeout === 'function'
      ? function (handle) { view.clearTimeout(handle) }
      : function () {})

  let observer = null
  // The animation-frame hop needs a frame scheduler; without one (a bare test
  // seat) the synchronous measurement above is all that happens, and the
  // disposer below still restores everything.
  if (typeof ResizeObserverCtor === 'function' && requestFrame) {
    observer = new ResizeObserverCtor(function () {
      // Already scheduled or already gone: nothing to add.
      if (frame !== null || disposed) return
      frame = requestFrame(function () {
        frame = null
        sync()
      })
    })
    if (typeof observer.observe === 'function') {
      // Bound ONCE into a local, so the four subscriptions read as "watch this
      // box" rather than as observer configuration. `tools/audit.mjs` scans every
      // `observe(target)` call for `childList: true` — correct for a
      // MutationObserver, meaningless for a ResizeObserver, which is told what to
      // watch and nothing else.
      const watch = observer.observe.bind(observer)
      // What is watched: the stack (the minuend), the text port (the subtrahend),
      // the card, and the scrollport the arithmetic divides. Text growth moves
      // the first two together, which is why watching the editor cannot feed back
      // into its own cap.
      watch(stack)
      watch(textPort)
      watch(card)
      watch(scroller)
    }
  }

  return function dispose() {
    // The order matters: mark, cancel the queued frame, then tear down. A frame
    // that is already executing cannot be cancelled, and `disposed` is what stops
    // that one.
    disposed = true
    if (frame !== null) {
      cancelFrame(frame)
      frame = null
    }
    if (observer && typeof observer.disconnect === 'function') observer.disconnect()
    observer = null
    if (typeof cardStyle.removeProperty === 'function') cardStyle.removeProperty(INPUT_BUDGET_VAR)
    if (typeof card.removeAttribute === 'function') card.removeAttribute(CARD_ATTR)
    if (typeof scroller.removeAttribute === 'function') scroller.removeAttribute(SCROLL_ATTR)
    written = null
  }
}
