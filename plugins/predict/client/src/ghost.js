/**
 * The ghost text: where it goes, when it shows, and how Tab accepts it.
 *
 * WHY IT IS NOT RENDERED INSIDE THE EDITOR. The composer is a **Lexical**
 * editor (`data-lexical-editor`), and its content is owned by React + Lexical's
 * own state. Appending a span inside it would be wiped on the next keystroke and
 * could corrupt the editor's DOM reconciliation. So the suggestion is drawn as a
 * SIBLING overlay positioned over the editor — the same technique the host's own
 * slash menu uses through `conversation.input.overlay`, and the reason this
 * module reads geometry instead of writing text into the field.
 *
 * WHY AN OVERLAY AND NOT A POPUP. Both shipped implementations put the
 * suggestion IN the input box as grey text: it must read as "this is what you
 * would type", not as "here is a menu of options". A box above the composer is
 * the wrong affordance.
 *
 * ACCEPTING. Tab inserts the text through Lexical's own `update()`, which is the
 * only way to change the draft that the composer's React state will notice. It
 * does NOT send: the user reviews the text and presses Enter, which is the
 * behaviour chosen for this plugin.
 *
 * @module ghost
 */

/** Marks the overlay so teardown can find it even after an HMR reload. */
export const GHOST_MARKER = 'data-dsh-predict-ghost'

/**
 * Create the ghost-text controller.
 *
 * @param {object} deps
 * @param {Document | undefined} deps.document the host document
 * @param {(text: string) => void} deps.onAccept called after the text lands
 * @param {() => void} deps.onDismiss called when the user keeps typing or Escapes
 * @returns {object} the controller
 */
export function createGhost({ document: doc, onAccept, onDismiss }) {
  if (doc === undefined || doc === null || typeof doc.createElement !== 'function') {
    return emptyController()
  }

  let element = null
  let text = ''
  let keyHandler = null
  let placement = null
  // The composer's own placeholder, hidden while a suggestion is drawn.
  let hiddenPlaceholder = null

  /** The composer's editable element, or null. */
  const editor = () => doc.querySelector('[data-composer-input]')

  /**
   * The composer's placeholder element, when it is showing.
   *
   * THE PLACEHOLDER AND THE SUGGESTION OCCUPY THE SAME PIXELS. Both appear only
   * on an empty composer, both start at the caret, and the host's placeholder
   * says "Message or run a task…". Drawing the suggestion over it produces two
   * overlapping sentences. So the suggestion WINS while it is visible: the
   * placeholder is hidden, and restored the moment the suggestion goes away.
   *
   * Found by STRUCTURE, not by class name: the host's CSS-Modules classes are
   * salted per build (`RlGAzG_placeholder` today, something else tomorrow). The
   * placeholder is the element inside the composer card that is not the editor
   * and has text.
   *
   * @returns {HTMLElement | null} the placeholder, or null
   */
  function placeholder() {
    const ed = editor()
    const card = ed?.closest('[data-composer-card]')
    if (card === null || card === undefined) return null
    for (const child of card.querySelectorAll('*')) {
      if (child === ed || child.contains(ed)) continue
      if (child.children.length !== 0) continue
      const value = (child.textContent ?? '').trim()
      if (value === '') continue
      const style = doc.defaultView?.getComputedStyle(child)
      // The composer's own hint is the only text element positioned over the
      // editor's first line.
      if (style?.position === 'absolute' && style?.pointerEvents === 'none') return child
    }
    return null
  }

  /** Hide the placeholder while a suggestion is visible. */
  function hidePlaceholder() {
    if (hiddenPlaceholder !== null) return
    const target = placeholder()
    if (target === null) return
    hiddenPlaceholder = { element: target, previous: target.style.visibility }
    target.style.visibility = 'hidden'
  }

  /** Put the placeholder back exactly as it was found. */
  function restorePlaceholder() {
    if (hiddenPlaceholder === null) return
    hiddenPlaceholder.element.style.visibility = hiddenPlaceholder.previous
    hiddenPlaceholder = null
  }

  /** Remove the overlay and the key listener. */
  function clear() {
    if (element !== null) {
      element.remove()
      element = null
    }
    if (keyHandler !== null) {
      keyHandler.target.removeEventListener('keydown', keyHandler.listener, true)
      keyHandler = null
    }
    if (placement !== null) {
      const { reposition, observer, view } = placement
      placement = null
      if (view && typeof view.removeEventListener === 'function') {
        view.removeEventListener('resize', reposition)
      }
      if (typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('scroll', reposition, true)
      }
      if (observer !== null) {
        try { observer.disconnect() } catch (error) { /* already gone */ }
      }
    }
    text = ''
    restorePlaceholder()
  }

  /**
   * Decide whether the composer can take a suggestion right now.
   *
   * Only when it is EMPTY. A suggestion in a half-written message would compete
   * with what the user is typing and could be accepted by a stray Tab; both
   * shipped implementations only offer a prediction on a blank box.
   *
   * @returns {{ editor: HTMLElement, rect: DOMRect } | null} the target, or null
   */
  function target() {
    const ed = editor()
    if (ed === null) return null
    // `innerText` on a Lexical root is the rendered text; an empty editor has
    // none. `textContent` would include the placeholder span's text.
    if ((ed.innerText ?? '').trim() !== '') return null
    const rect = ed.getBoundingClientRect()
    // A hidden composer (settings open, narrow layout mid-reflow) reports a
    // zero box. Positioning from it put the ghost in the page corner — reported
    // as "the suggestion appears above the dialog".
    if (!(rect.width > 0 && rect.height > 0)) return null
    return { editor: ed, rect }
  }

  /**
   * Position the overlay from the editor's CURRENT box.
   *
   * THE WINDOW MOVES. The composer reflows on resize, on the sidebar toggle and
   * on the settings dialog; a position computed once at show() time goes stale
   * and the suggestion drifts away from the caret (on narrow windows it ended
   * up above the composer). Every show attaches resize + scroll + ResizeObserver
   * listeners that call this again.
   */
  function place(tag, ed) {
    if (ed === null || ed.isConnected === false) { tag.style.display = 'none'; return }
    const rect = ed.getBoundingClientRect()
    if (!(rect.width > 0 && rect.height > 0)) { tag.style.display = 'none'; return }
    tag.style.display = ''
    const style = doc.defaultView?.getComputedStyle(ed)
    const padTop = Number.parseFloat(style?.paddingTop ?? '') || 0
    const padLeft = Number.parseFloat(style?.paddingLeft ?? '') || 0
    tag.style.fontSize = style?.fontSize ?? 'inherit'
    tag.style.lineHeight = style?.lineHeight ?? 'inherit'
    tag.style.maxWidth = Math.max(80, rect.width - 24) + 'px'
    tag.style.left = (rect.left + padLeft) + 'px'
    tag.style.top = (rect.top + padTop) + 'px'
  }

  /**
   * Show a suggestion.
   *
   * @param {string} suggestion the text to offer
   * @returns {boolean} whether it was shown
   */
  function show(suggestion) {
    clear()
    if (typeof suggestion !== 'string' || suggestion.trim() === '') return false
    const spot = target()
    if (spot === null) return false

    text = suggestion

    const tag = doc.createElement('div')
    tag.setAttribute(GHOST_MARKER, '')
    tag.setAttribute('aria-hidden', 'true')
    tag.textContent = suggestion + ' '
    // Position over the editor's first line. The composer pads its text by the
    // host's own values, which are read from the editor rather than guessed, so
    // the overlay lines up with the caret even when the user changes the app's
    // font size. `fixed`, not `absolute`: the coordinates are viewport-relative
    // and must not drift when any ancestor scrolls.
    tag.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'user-select: none',
      // THE OVERLAY LIVES ON <body>, THE COMPOSER'S SEAT DOES NOT. The host
      // wraps the composer in a `position: sticky` seat with `z-index: 7`, and
      // a body-level overlay at z-index 1 paints UNDER it: the suggestion was
      // in the DOM, positioned over the caret, and invisible. 50 clears the
      // app's sticky/positioned layers (≤10) while staying below the host's
      // menus and dialogs (100/1000/1100), so a modal still covers it.
      'z-index: 50',
      'color: var(--dsw-alias-label-caption, rgba(128,128,128,0.75))',
      'white-space: pre',
      'overflow: hidden',
      'text-overflow: ellipsis',
    ].join(';')
    place(tag, spot.editor)

    doc.body.append(tag)
    element = tag
    // Re-place on every layout change while visible. `capture` sees the inner
    // scroll containers the app uses; ResizeObserver catches the composer
    // growing a line or the window crossing a breakpoint.
    const view = doc.defaultView
    const reposition = () => place(tag, spot.editor)
    if (view && typeof view.addEventListener === 'function') {
      view.addEventListener('resize', reposition, { passive: true })
    }
    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('scroll', reposition, { passive: true, capture: true })
    }
    let observer = null
    if (view && typeof view.ResizeObserver === 'function') {
      observer = new view.ResizeObserver(reposition)
      try {
        observer.observe(spot.editor)
        const card = spot.editor.closest?.('[data-composer-card]')
        if (card !== null && card !== undefined) observer.observe(card)
      } catch (error) { /* an unobservable target still gets resize/scroll */ }
    }
    placement = { reposition, observer, view }
    // The suggestion replaces the placeholder rather than sitting on top of it.
    hidePlaceholder()

    // Tab accepts, Escape dismisses, and any other key dismisses too — the user
    // started typing, so the suggestion is no longer what they mean.
    //
    // CAPTURE phase and `stopPropagation`: the composer's own key handling must
    // not also see the Tab, or Lexical would insert a tab character first.
    const listener = (event) => {
      if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && event.isComposing !== true) {
        event.preventDefault()
        event.stopPropagation()
        accept()
        return
      }
      if (event.key === 'Escape') {
        clear()
        onDismiss?.()
        return
      }
      // Arrow keys and modifiers alone do not dismiss; a printable key does.
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter') {
        clear()
        onDismiss?.()
      }
    }
    doc.addEventListener('keydown', listener, true)
    // Remember the EXACT pair to remove. The first version wrapped a fake
    // `target` object, so teardown called removeEventListener on the wrapper and
    // the real listener leaked — a capture-phase keydown that would keep eating
    // Tab after the plugin was disabled.
    keyHandler = { target: doc, listener }
    return true
  }

  /**
   * Put the suggestion into the editor.
   *
   * THROUGH A PASTE EVENT, not by writing DOM or by reaching into Lexical's
   * internals. The composer is a Lexical editor; a `paste` event is one of the
   * two inputs it owns end to end (the other is real typing), so the text lands
   * in the editor's own state, the draft React sees is updated, and Enter sends
   * what the user is looking at.
   *
   * The alternatives were both worse and both were tried:
   *   - `ed.textContent = ...` desynchronises Lexical's node map from the DOM and
   *     is wiped by the next render;
   *   - `lexical.update()` needs `$getRoot` and friends, which live in Lexical's
   *     module scope and are not reachable from a plugin bundle without linking
   *     against the host's copy.
   *
   * `DataTransfer` is not constructible in every browser context, so the path
   * fails closed: if the event cannot be built, nothing is inserted and the
   * caller keeps the box as it was.
   *
   * @returns {boolean} whether the text was inserted
   */
  function accept() {
    const suggested = text
    const spot = target()
    clear()
    if (suggested === '' || spot === null) return false

    const view = doc.defaultView
    if (view === undefined || typeof view.DataTransfer !== 'function') return false

    try {
      const data = new view.DataTransfer()
      data.setData('text/plain', suggested)
      spot.editor.focus()
      const event = new view.ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      })
      spot.editor.dispatchEvent(event)
    } catch {
      return false
    }

    onAccept?.(suggested)
    return true
  }

  return {
    show,
    clear,
    accept,
    /** Whether a suggestion is currently on screen. */
    get visible() { return element !== null },
    /** The current suggestion text. */
    get text() { return text },
  }
}

/** A controller for a document-less context (unit tests, SSR). */
function emptyController() {
  return {
    show: () => false,
    clear: () => {},
    accept: () => false,
    get visible() { return false },
    get text() { return '' },
  }
}
