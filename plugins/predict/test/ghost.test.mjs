/**
 * The ghost overlay, driven against a fake document.
 *
 * WHAT CAN BE TESTED HERE. The real composer is a Lexical editor, which needs a
 * browser. What is testable — and what actually breaks — is the DECISION layer:
 * when the overlay appears (blank composer only), what Tab does, what typing
 * does, and that teardown leaves nothing behind.
 *
 * THE LEXICAL HANDOFF IS NOT MOCKED AWAY. `accept()` dispatches a real `paste`
 * event, because that is the mechanism: the editor owns the input, and a paste
 * is the one input a plugin can synthesise that the editor will treat as its own.
 * The fake below records that the event was dispatched with the right payload.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { createGhost, GHOST_MARKER } = await import('../client/src/ghost.js')

/** A minimal document good enough for the controller. */
function fakeDocument({ text = '' } = {}) {
  const listeners = new Map()
  const dispatched = []
  const body = { children: [], append(node) { this.children.push(node); node.parent = this }, }
  const editor = {
    innerText: text,
    dispatchedEvents: dispatched,
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 600, height: 36, right: 700, bottom: 236 }),
    focus() { this.focused = true },
    dispatchEvent(event) { dispatched.push(event); return true },
  }

  // The composer's own placeholder: an absolutely-positioned, pointer-transparent
  // text element beside the editor. The controller must hide it while a
  // suggestion is drawn, or the two sentences overlap.
  const placeholder = {
    textContent: 'Message or run a task…',
    children: [],
    style: { visibility: '' },
    contains: () => false,
  }
  const card = {
    querySelectorAll: () => [editor, placeholder],
  }
  editor.closest = (selector) => (selector === '[data-composer-card]' ? card : null)

  const doc = {
    body,
    defaultView: {
      getComputedStyle: (node) => (node === placeholder
        ? { paddingTop: '0', paddingLeft: '0', fontSize: '14px', lineHeight: '24px', position: 'absolute', pointerEvents: 'none' }
        : { paddingTop: '4px', paddingLeft: '14px', fontSize: '14px', lineHeight: '24px', position: 'static', pointerEvents: 'auto' }),
      DataTransfer: class {
        constructor() { this.data = {} }
        setData(type, value) { this.data[type] = value }
        getData(type) { return this.data[type] }
      },
      ClipboardEvent: class {
        constructor(type, init) {
          this.type = type
          this.clipboardData = init.clipboardData
          this.bubbles = init.bubbles
        }
      },
    },
    createElement: () => {
      const node = {
        style: { cssText: '' },
        attributes: {},
        textContent: '',
        setAttribute(name, value) { this.attributes[name] = value },
        remove() {
          const index = body.children.indexOf(this)
          if (index !== -1) body.children.splice(index, 1)
          this.removed = true
        },
      }
      return node
    },
    querySelector: (selector) => (selector === '[data-composer-input]' ? editor : null),
    addEventListener(type, fn) { listeners.set(fn, type) },
    // The controller passes the capture flag; match on the function only, the
    // way the real DOM does for the same registration.
    removeEventListener(type, fn) { listeners.delete(fn) },
    /** Fire a keydown the way the browser would. */
    fire(type, event) {
      for (const [fn, registered] of listeners) if (registered === type) fn(event)
    },
    listenerCount: () => listeners.size,
  }
  return { doc, editor, body, listeners, placeholder }
}

test('show() draws an overlay when the composer is empty', function () {
  const { doc, body } = fakeDocument()
  const ghost = createGhost({ document: doc })
  assert.equal(ghost.show('继续看 B'), true)
  assert.equal(body.children.length, 1)
  const node = body.children[0]
  assert.equal(node.attributes[GHOST_MARKER], '')
  assert.match(node.textContent, /继续看 B/)
  assert.equal(ghost.visible, true)
})

test('show() refuses while the composer has text', function () {
  // A suggestion over a half-written message competes with what the user is
  // typing and can be accepted by a stray Tab.
  const { doc, body } = fakeDocument({ text: '我已经写了一部分' })
  const ghost = createGhost({ document: doc })
  assert.equal(ghost.show('不该出现'), false)
  assert.equal(body.children.length, 0)
})

test('show() refuses an empty or non-string suggestion', function () {
  const { doc, body } = fakeDocument()
  const ghost = createGhost({ document: doc })
  for (const value of ['', '   ', null, undefined, 42]) {
    assert.equal(ghost.show(value), false, `"${String(value)}" must not draw`)
  }
  assert.equal(body.children.length, 0)
})

test('a second show replaces the first without stacking overlays', function () {
  const { doc, body } = fakeDocument()
  const ghost = createGhost({ document: doc })
  ghost.show('first')
  ghost.show('second')
  assert.equal(body.children.length, 1, 'exactly one overlay at a time')
  assert.equal(ghost.text, 'second')
})

test('the overlay is positioned from the editor, not from hardcoded numbers', function () {
  // The composer pads by the host's own values, which change with the app font
  // size. The overlay must follow the editor, or it drifts off the caret.
  const { doc, body } = fakeDocument()
  const ghost = createGhost({ document: doc })
  ghost.show('x')
  const overlay = body.children[0]
  assert.equal(overlay.style.left, '114px', 'editor left 100 + padding 14')
  assert.equal(overlay.style.top, '204px', 'editor top 200 + padding 4')
  assert.match(overlay.style.cssText, /pointer-events: none/, 'the overlay must never eat a click')
})

test('the overlay follows the editor when the window or the composer changes', function () {
  // A position computed once at show() time goes stale on resize, on the
  // sidebar toggle and when the composer grows a line. On narrow windows the
  // suggestion ended up above the composer — the box moved, the ghost did not.
  const { doc, body, editor } = fakeDocument()
  const ghost = createGhost({ document: doc })
  ghost.show('x')
  assert.equal(body.children[0].style.top, '204px')

  editor.getBoundingClientRect = () => ({ left: 40, top: 500, width: 300, height: 72, right: 340, bottom: 572 })
  doc.fire('scroll', {})
  assert.equal(body.children[0].style.left, '54px', 'the new left plus padding')
  assert.equal(body.children[0].style.top, '504px', 'the new top plus padding')
  assert.equal(body.children[0].style.maxWidth, '276px', 'a narrower editor narrows the overlay')
  ghost.clear()
})

test('a hidden composer takes no suggestion', function () {
  // A zero box (settings open, a reflow mid-flight) is not a place to draw.
  const { doc, editor } = fakeDocument()
  editor.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 })
  const ghost = createGhost({ document: doc })
  assert.equal(ghost.show('x'), false)
  assert.equal(ghost.visible, false)
})

// REGRESSION: the suggestion rendered but was invisible.
//
// The overlay is appended to <body>, while the host wraps the composer in a
// `position: sticky` seat at `z-index: 7`. At `z-index: 1` the whole seat
// painted over the suggestion: the element existed, sat exactly over the
// caret, and the user saw an empty box — the feature looked like it never
// produced anything. Keep the overlay above the app's positioned layers and
// below the host's menus/dialogs (100/1000/1100).
test('the overlay paints above the composer seat and below host menus', function () {
  const { doc, body } = fakeDocument()
  const ghost = createGhost({ document: doc })
  ghost.show('x')
  const css = body.children[0].style.cssText
  const zIndex = Number(/z-index: (\d+)/.exec(css)?.[1])
  assert.ok(Number.isFinite(zIndex), 'the overlay must set an explicit z-index')
  assert.ok(zIndex > 7, `z-index ${zIndex} would sit under the composer seat (sticky, z-index 7)`)
  assert.ok(zIndex < 100, `z-index ${zIndex} would paint over the host's menus (z-index 100)`)
})

test('Tab accepts: the text goes in as a paste event, and no Tab reaches the editor', function () {
  const { doc, editor } = fakeDocument()
  let accepted = null
  const ghost = createGhost({ document: doc, onAccept: (text) => { accepted = text } })
  ghost.show('继续看 B')

  let prevented = 0
  let stopped = 0
  doc.fire('keydown', {
    key: 'Tab',
    preventDefault() { prevented += 1 },
    stopPropagation() { stopped += 1 },
  })

  assert.equal(prevented, 1, 'Tab must not move focus out of the composer')
  assert.equal(stopped, 1, 'the editor must not also see the Tab')
  assert.equal(accepted, '继续看 B')
  assert.equal(editor.dispatchedEvents.length, 1, 'the text is inserted through the editor')
  const event = editor.dispatchedEvents[0]
  assert.equal(event.type, 'paste')
  assert.equal(event.clipboardData.getData('text/plain'), '继续看 B')
  assert.equal(editor.focused, true, 'the caret returns to the composer')
  assert.equal(ghost.visible, false, 'the overlay is gone once accepted')
})

test('Shift+Tab is not an accept', function () {
  // Shift+Tab is the browser's focus-back gesture; stealing it would trap
  // keyboard users in the composer.
  const { doc, editor } = fakeDocument()
  const ghost = createGhost({ document: doc })
  ghost.show('x')
  doc.fire('keydown', { key: 'Tab', shiftKey: true, preventDefault() {}, stopPropagation() {} })
  assert.equal(editor.dispatchedEvents.length, 0)
})

test('typing dismisses', function () {
  const { doc, body } = fakeDocument()
  let dismissed = 0
  const ghost = createGhost({ document: doc, onDismiss: () => { dismissed += 1 } })
  ghost.show('x')
  doc.fire('keydown', { key: 'a', preventDefault() {}, stopPropagation() {} })
  assert.equal(body.children.length, 0)
  assert.equal(dismissed, 1)
})

test('Escape dismisses', function () {
  const { doc, body } = fakeDocument()
  let dismissed = 0
  const ghost = createGhost({ document: doc, onDismiss: () => { dismissed += 1 } })
  ghost.show('x')
  doc.fire('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} })
  assert.equal(body.children.length, 0)
  assert.equal(dismissed, 1)
})

test('a modifier alone does not dismiss', function () {
  // Holding Ctrl to copy the suggestion must not remove it.
  const { doc, body } = fakeDocument()
  const ghost = createGhost({ document: doc })
  ghost.show('x')
  doc.fire('keydown', { key: 'Control', preventDefault() {}, stopPropagation() {} })
  assert.equal(body.children.length, 1)
})

test('the key listener is removed with the overlay', function () {
  // A leaked capture-phase keydown listener would keep intercepting Tab on a
  // page where the plugin is disabled.
  const { doc } = fakeDocument()
  const ghost = createGhost({ document: doc })
  ghost.show('x')
  // keydown (capture) + scroll (capture): both exist only while the overlay does.
  assert.equal(doc.listenerCount(), 2)
  ghost.clear()
  assert.equal(doc.listenerCount(), 0, 'the overlay leaves no listener behind')
})

test('accept() without a visible suggestion does nothing', function () {
  const { doc, editor } = fakeDocument()
  const ghost = createGhost({ document: doc })
  assert.equal(ghost.accept(), false)
  assert.equal(editor.dispatchedEvents.length, 0)
})

test('a document-less context degrades to a no-op', function () {
  const ghost = createGhost({ document: undefined })
  assert.equal(ghost.show('x'), false)
  assert.equal(ghost.accept(), false)
  ghost.clear()
})

test('a suggestion hides the composer placeholder instead of overlapping it', function () {
  // BOTH OCCUPY THE SAME PIXELS: they only ever appear on an empty composer and
  // both start at the caret. Drawing one over the other produces two
  // overlapping sentences, so the suggestion wins while it is visible.
  const { doc, placeholder } = fakeDocument()
  const ghost = createGhost({ document: doc })
  assert.equal(placeholder.style.visibility, '', 'the placeholder starts visible')

  ghost.show('先把 C 那一行补齐')
  assert.equal(placeholder.style.visibility, 'hidden', 'hidden while the suggestion shows')

  ghost.clear()
  assert.equal(placeholder.style.visibility, '', 'restored when the suggestion goes')
})

test('accepting also restores the placeholder', function () {
  const { doc, placeholder } = fakeDocument()
  const ghost = createGhost({ document: doc })
  ghost.show('x')
  ghost.accept()
  assert.equal(placeholder.style.visibility, '',
    'the placeholder must come back with the suggestion gone, or the composer looks blank forever')
})

test('the placeholder is restored to what it WAS, not assumed empty', function () {
  // A host that hides its placeholder itself (a focused composer, a chip
  // selected) must not be made visible by our teardown.
  const { doc, placeholder } = fakeDocument()
  placeholder.style.visibility = 'collapse'
  const ghost = createGhost({ document: doc })
  ghost.show('x')
  ghost.clear()
  assert.equal(placeholder.style.visibility, 'collapse',
    'teardown restores the previous value rather than clearing it')
})
