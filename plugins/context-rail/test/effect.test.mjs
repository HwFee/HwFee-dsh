import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ARTIFACT = join(ROOT, 'client/client.js')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/**
 * Execute the registerd component with a fake DOM and fake hooks, running every
 * effect once.
 *
 * WHY THIS EXISTS. The first in-page release crashed with
 * `ReferenceError: native is not defined` inside the geometry effect: a stale
 * identifier survived a refactor, the effect threw, React unmounted the entry,
 * and the header toggle simply never appeared — with no error anywhere the user
 * could see (a slot-level boundary swallowed it). Nothing in the pure-logic
 * tests could see that, because it lived in an effect. Running the effects
 * against a stub DOM turns that class of defect into a failing test.
 *
 * @returns {{ element: unknown, effects: number }}
 */
function renderWithFakeDom(withLocale = true) {
  const rect = (left, top, width, height) => ({
    left, top, width, height, right: left + width, bottom: top + height,
  })

  const scroller = {
    getBoundingClientRect: () => rect(400, 120, 900, 780),
    offsetWidth: 900,
    clientWidth: 895,
  }
  const content = {
    getBoundingClientRect: () => rect(400, 120, 902, 780),
    querySelector: (selector) => (selector === '[data-conversation-scroll]' ? scroller : null),
  }

  let effects = 0
  const react = {
    Component: class { constructor(props) { this.props = props } },
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props, children }),
    createPortal: (node) => node,
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: (fn) => {
      effects += 1
      const cleanup = fn()
      return typeof cleanup === 'function' ? cleanup : undefined
    },
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }

  const original = {
    window: globalThis.window,
    document: globalThis.document,
    ResizeObserver: globalThis.ResizeObserver,
    localStorage: globalThis.localStorage,
  }

  const storage = new Map()
  globalThis.window = {
    innerWidth: 1600,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn) => { fn(); return 0 },
    clearTimeout: () => {},
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => { storage.set(key, String(value)) },
    },
    __ModuleLoader__: {
      load: (registration) => {
        assert.equal(registration.id, MANIFEST.name)
        exportsHolder.value = registration.factory((name) => {
          if (name === 'react') return react
          if (name === 'react-dom') return { createPortal: (node) => node }
          throw new Error('unexpected require: ' + name)
        })
      },
    },
  }
  globalThis.document = {
    body: { dataset: {}, style: { setProperty: () => {}, removeProperty: () => {} } },
    head: { appendChild: () => {} },
    createElement: () => ({ dataset: {}, textContent: '', parentNode: null }),
    querySelector: (selector) => (selector === '[data-conversation-content]' ? content : null),
  }
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  globalThis.localStorage = globalThis.window.localStorage

  const exportsHolder = { value: null }
  try {
    // eslint-disable-next-line no-new-func
    new Function('window', readFileSync(ARTIFACT, 'utf8'))(globalThis.window)
    assert.ok(exportsHolder.value !== null, 'the bundle must register itself')

    let component = null
    const ctx = {
      locale: { register: () => () => {}, bind: () => (key) => key },
      slots: {
        inject: (_name, factory) => factory(),
        register: (_options, registered) => { component = registered; return () => {} },
      },
      effect: (fn) => { fn(); return () => {} },
    }
    exportsHolder.value.apply(ctx)
    assert.equal(typeof component, 'function', 'apply must register a component')

    const props = {
      sessionId: 'session-test',
      useProjection: () => undefined,
      useSessions: (selector) => selector({ byId: {} }),
    }
    if (withLocale) props.t = (key) => key
    const element = component(props)
    return { element, effects }
  } finally {
    globalThis.window = original.window
    globalThis.document = original.document
    globalThis.ResizeObserver = original.ResizeObserver
    globalThis.localStorage = original.localStorage
  }
}

test('the component mounts and runs its effects without throwing', () => {
  const { element, effects } = renderWithFakeDom()
  assert.ok(element !== null && element !== undefined, 'the toggle must render')
  assert.ok(effects >= 3, 'resize, geometry and reservation effects all run: ' + effects)
})

test('a missing locale seat does not throw', () => {
  // The header is host-rendered: a plugin that throws here loses its button for
  // the whole session, which is exactly what happened once.
  assert.doesNotThrow(() => {
    const { element } = renderWithFakeDom(false)
    assert.ok(element !== undefined)
  })
})
