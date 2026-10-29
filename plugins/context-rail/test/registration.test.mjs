import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ARTIFACT = join(ROOT, 'client/client.js')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/**
 * Evaluate the committed artifact the way the host does: one
 * window.__ModuleLoader__.load call, whose factory receives a require that can
 * only reach the frozen platform modules.
 * @returns {object} the bundle's exports
 */
function loadBundle() {
  const source = readFileSync(ARTIFACT, 'utf8')
  let exported = null
  const react = {
    Component: class { constructor(props) { this.props = props } },
    createElement: () => null,
    Fragment: 'fragment',
    useEffect: () => {},
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useSyncExternalStore: () => undefined,
  }
  const window = {
    __ModuleLoader__: {
      load(registration) {
        assert.equal(registration.id, MANIFEST.name)
        exported = registration.factory((name) => {
          if (name === 'react') return react
          if (name === 'react-dom') return { createPortal: (node) => node }
          throw new Error('unexpected require: ' + name)
        })
      },
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', source)(window)
  assert.ok(exported !== null, 'the bundle must register itself')
  return exported
}

/** A Cordis-shaped context that records every registration it receives. */
function recordingContext() {
  const calls = { locale: [], slotInject: [], slotRegister: [] }
  const ctx = {
    locale: {
      register(namespace, dictionaries) {
        calls.locale.push({ namespace, dictionaries })
        return () => {}
      },
      bind(namespace) {
        return (key) => namespace + ':' + key
      },
    },
    slots: {
      inject(name, factory) {
        calls.slotInject.push(name)
        return factory()
      },
      register(options, component) {
        calls.slotRegister.push({ options, component })
        return () => {}
      },
    },
    effect(fn) {
      const dispose = fn()
      return () => { if (typeof dispose === 'function') dispose() }
    },
  }
  return { ctx, calls }
}

test('the bundle exports a plugin with just the slots and locale services', () => {
  const exported = loadBundle()
  assert.equal(typeof exported.apply, 'function')
  assert.deepEqual(exported.inject, ['slots', 'locale'])
})

test('the geometry constants are the published ones', () => {
  const exported = loadBundle()
  assert.equal(exported.RAIL_WIDTH, 328)
  assert.equal(exported.AUTO_OPEN_MIN_WIDTH, 1180)
  assert.equal(exported.MIN_CONTENT_WIDTH, 240)
  assert.equal(exported.STORAGE_KEY, 'dsh-context-rail/open')
})

test('the rail fits whenever the column can hold rail plus text', () => {
  const exported = loadBundle()
  // 328 rail + 240 text is the floor.
  assert.equal(exported.railFits(568), true)
  assert.equal(exported.railFits(967), true)
  assert.equal(exported.railFits(567), false)
  assert.equal(exported.railFits(undefined), false)
})

test('an open native right sidebar is not a reason to hide the rail', () => {
  // Regression: the first in-page version hid the rail whenever the native
  // column was open, so the rail could never come back with a file preview up.
  // The decision must depend on the measured column width only.
  const exported = loadBundle()
  const source = readFileSync(join(ROOT, 'client/src/index.js'), 'utf8')
  assert.ok(!source.includes('nativeOpen'), 'visibility must not be gated on the native column')
  assert.equal(typeof exported.railFits, 'function')
})

test('apply registers the toggle in the conversation header utility row', () => {
  const exported = loadBundle()
  const { ctx, calls } = recordingContext()
  exported.apply(ctx)

  assert.equal(calls.locale.length, 1)
  assert.equal(calls.locale[0].namespace, 'contextRail')
  assert.ok(calls.locale[0].dictionaries.zh['toggle.title'])

  assert.deepEqual(calls.slotInject, ['conversation.session.header.utilities'])
  assert.equal(calls.slotRegister.length, 1)
  const { options, component } = calls.slotRegister[0]
  assert.equal(options.name, 'conversation.session.header.utilities')
  assert.equal(options.id, 'context-rail')
  assert.equal(options.order, 10)
  assert.equal(options.locale, 'contextRail')
  assert.equal(typeof component, 'function')
})

test('the rail never takes the native right sidebar', () => {
  const exported = loadBundle()
  const { ctx, calls } = recordingContext()
  exported.apply(ctx)
  const names = calls.slotInject.concat(calls.slotRegister.map((entry) => entry.options.name))
  assert.ok(!names.some((name) => name.startsWith('sidebar.right.')),
    'a file preview must keep the native column: ' + names.join(', '))
  assert.ok(!('sidebarRightTabs' in exported))
})

test('apply survives a context without slots', () => {
  const exported = loadBundle()
  const warnings = []
  const original = console.warn
  console.warn = (message) => warnings.push(message)
  try {
    assert.doesNotThrow(() => exported.apply({}))
  } finally {
    console.warn = original
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /slots/)
})
