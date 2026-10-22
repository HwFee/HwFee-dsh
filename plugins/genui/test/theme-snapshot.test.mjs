/**
 * The theme handoff into the card's frame.
 *
 * The frame has an opaque origin, so it inherits no CSS from the host page. That
 * makes this module load-bearing for two things a reader would otherwise assume:
 * the card looks like the app (tokens), and it follows a light/dark switch while
 * it is already on screen.
 *
 * The tests drive a FAKE window: a `getComputedStyle` that answers from a table,
 * an element that records the mutations it is told about. That is enough to pin
 * the decisions — which names are collected, what is dropped, when a re-measure
 * is triggered — without a browser.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { readThemeSnapshot, observeTheme, themeTokenNames } = await import('../client/src/theme-snapshot.js')

/** A window whose computed style answers from `values`. */
function fakeWindow(values, { dark = false } = {}) {
  const root = {
    hasAttribute: (name) => dark === true && name === 'data-ds-dark-theme',
  }
  const body = {
    hasAttribute: () => false,
  }
  return {
    document: { documentElement: root, body, head: { contains: () => false } },
    getComputedStyle: () => ({
      getPropertyValue: (name) => values[name] ?? '',
    }),
  }
}

test('the snapshot collects only token-shaped values that are actually set', function () {
  const view = fakeWindow({
    '--dsw-alias-label-primary': 'rgb(21, 21, 21)',
    '--dsw-alias-brand-primary': '  rgb(198, 106, 74)  ',
    '--dsh-content-font-size': '14px',
    'font-family': 'Anthropic Sans, sans-serif',
    'font-size': '14px',
    'line-height': '1.4',
    'letter-spacing': '0',
    // Not a token the frame should obey, and a value long enough to be a payload
    // rather than a colour.
    'some-other-property': 'whatever',
    '--dsw-alias-huge': 'x'.repeat(400),
  }, { dark: true })

  const snapshot = readThemeSnapshot(view, [
    '--dsw-alias-label-primary', '--dsw-alias-brand-primary', '--dsh-content-font-size',
    '--dsw-alias-huge', '--dsw-alias-absent',
  ])

  assert.equal(snapshot.vars['--dsw-alias-label-primary'], 'rgb(21, 21, 21)')
  assert.equal(snapshot.vars['--dsw-alias-brand-primary'], 'rgb(198, 106, 74)', 'values are trimmed')
  assert.equal(snapshot.vars['--dsh-content-font-size'], '14px')
  assert.equal('--dsw-alias-huge' in snapshot.vars, false, 'an oversized value is dropped, not truncated')
  assert.equal('--dsw-alias-absent' in snapshot.vars, false, 'an empty value is not a token')
  assert.equal(snapshot.dark, true)
  assert.equal(snapshot.base['font-family'], 'Anthropic Sans, sans-serif')
  assert.equal(snapshot.base['font-size'], '14px')
  assert.equal('position' in snapshot.base, false, 'only the four inherited text properties travel')
})

test('a window that cannot be measured yields an empty snapshot instead of throwing', function () {
  // A theme that cannot be read must not take the card down: the frame falls back
  // to its own defaults, which is a cosmetic loss, and a throw here would be a
  // dead card.
  for (const view of [undefined, null, {}, { document: {} }, { document: { body: null } }]) {
    const snapshot = readThemeSnapshot(view, ['--dsw-alias-label-primary'])
    assert.deepEqual(snapshot, { vars: {}, base: {}, dark: false })
  }
})

test('the token list is discovered from the shipped sheets, not hand-maintained', function () {
  // The names come from the card's own CSS plus the vendor sheet, so a rule added
  // there is carried into the frame without a second edit. The skill's inline
  // tokens are the exception: no sheet mentions them.
  const names = themeTokenNames()
  assert.ok(names.includes('--dsw-alias-label-primary'), 'a vendor-sheet token is discovered')
  assert.ok(names.includes('--dsw-radius-md'), 'a card-sheet token is discovered')
  assert.ok(names.includes('--dsh-content-font-size'), 'the transcript size is carried in')
  for (const name of names) {
    assert.match(name, /^--(dsw|dsh|ds|viz)-/, `only the host token namespaces may cross: ${name}`)
  }
  assert.deepEqual(names, [...names].sort(), 'the list is stable, so the snapshot is diffable')
})

test('a dark-theme flip is reported, and only once per frame', function () {
  // The host rewrites its whole token sheet in one go when the user flips
  // light/dark. Measuring per mutation would sweep the palette dozens of times
  // for one switch; the debounce is what makes that one.
  const handlers = []
  const view = fakeWindow({ '--dsw-alias-label-primary': 'rgb(1, 2, 3)' })
  view.MutationObserver = class {
    constructor(handler) { handlers.push(handler) }
    observe() {}
    disconnect() { this.disconnected = true }
  }
  view.requestAnimationFrame = (callback) => { setTimeout(callback, 0) }

  let snapshots = 0
  const dispose = observeTheme(view, () => { snapshots += 1 })
  assert.equal(typeof dispose, 'function')

  // Three mutation batches inside one frame schedule ONE re-measure.
  const records = [{ target: view.document.documentElement }]
  handlers[0](records)
  handlers[0](records)
  handlers[0](records)

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(snapshots, 1, 'three mutations in one frame cost one snapshot')
      dispose()
      resolve()
    }, 5)
  })
})

test('a transcript mutation does not trigger a theme re-measure', function () {
  // THE COST THAT MATTERS. The observer watches the root subtree, which includes
  // the conversation: every streamed reply would otherwise re-measure the theme.
  const handlers = []
  const view = fakeWindow({ '--dsw-alias-label-primary': 'rgb(1, 2, 3)' })
  view.MutationObserver = class {
    constructor(handler) { handlers.push(handler) }
    observe() {}
    disconnect() {}
  }
  view.requestAnimationFrame = (callback) => { setTimeout(callback, 0) }

  let snapshots = 0
  const dispose = observeTheme(view, () => { snapshots += 1 })

  // A node inside the transcript, nowhere near `<head>` or `<body>`.
  handlers[0]([{ target: { nodeType: 1, parentElement: null, isConnected: true } }])

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(snapshots, 0, 'a message list re-render is not a theme change')
      dispose()
      resolve()
    }, 5)
  })
})

test('the disposer disconnects the observer and stops reporting', function () {
  // The repository's observer rule: every construction has a disconnect, and a
  // recycled row must not leave a live observer behind.
  let disconnected = false
  const handlers = []
  const view = fakeWindow({ '--dsw-alias-label-primary': 'rgb(1, 2, 3)' })
  view.MutationObserver = class {
    constructor(handler) { handlers.push(handler) }
    observe() {}
    disconnect() { disconnected = true }
  }
  view.requestAnimationFrame = (callback) => { setTimeout(callback, 0) }

  let snapshots = 0
  const dispose = observeTheme(view, () => { snapshots += 1 })
  dispose()
  assert.equal(disconnected, true)

  handlers[0]([{ target: view.document.documentElement }])
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(snapshots, 0, 'nothing is reported after dispose')
      resolve()
    }, 5)
  })
})

test('the media query is the one non-mutation signal', function () {
  // The OS palette can move while the app follows it, and no MutationObserver
  // reports that. Losing this listener means a card stays in the previous mode.
  const listeners = []
  const view = fakeWindow({})
  view.matchMedia = () => ({
    addEventListener: (type, handler) => listeners.push({ type, handler }),
    removeEventListener: (type, handler) => {
      const at = listeners.findIndex((entry) => entry.handler === handler)
      if (at !== -1) listeners.splice(at, 1)
    },
  })
  view.requestAnimationFrame = (callback) => setTimeout(callback, 0)

  let snapshots = 0
  const dispose = observeTheme(view, () => { snapshots += 1 })
  assert.equal(listeners.length, 1, 'one change listener on prefers-color-scheme')

  listeners[0].handler()
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(snapshots, 1)
      dispose()
      assert.equal(listeners.length, 0, 'and it is removed on dispose')
      resolve()
    }, 5)
  })
})
