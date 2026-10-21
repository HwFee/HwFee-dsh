import { test } from 'node:test'
import assert from 'node:assert/strict'

const { createLifecycle, createRow } = await import('../client/src/lifecycle.js')

function makeReact() {
  const cells = []
  let cursor = 0
  return {
    // REACT THROWS ON A NULL TYPE, AND THIS HARNESS MUST TOO. The degraded row
    // builds primitive-backed children only after it has decided that the
    // primitives exist; the old ordering produced `h(null, …)` here and in the
    // app, but a permissive `createElement` turned the crash into a green test.
    // "Element type is invalid" is the real host's behaviour, so the fake must
    // reproduce it or the fallback path is untested.
    createElement: (type, props, ...children) => {
      if (type === null || type === undefined) {
        throw new Error('Element type is invalid: ' + String(type))
      }
      return { type, props: props ?? {}, children: children.flat() }
    },
    useSyncExternalStore: (sub, get) => get(),
    useState(initial) {
      const i = cursor++
      if (cells[i] === undefined) cells[i] = initial
      return [cells[i], (next) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next }]
    },
    useEffect(fn) { fn() },
    begin() { cursor = 0 },
  }
}

const noop = () => {}
const t = (key) => key

function makePrimitives() {
  return {
    Switch: function Switch() {},
    Input: function Input() {},
    Menu: function Menu() {},
    MenuItemButton: function MenuItemButton() {},
    IconChevronDownOutlineRegular: function Icon() {},
    IconCheckOutlineRegular: function IconCheck() {},
    rankByName: (models, query) => models.filter((m) => (m.name ?? m.id).toLowerCase().includes(String(query).toLowerCase())),
  }
}

const CATALOG = {
  groups: [
    { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'chat', name: 'Chat' }, { id: 'r1', name: 'Reasoner' }] },
    { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-x', name: 'GPT-X' }] },
  ],
}

function fakeStore(initial) {
  const listeners = new Set()
  return {
    value: initial,
    getSnapshot() { return this.value },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(value) { this.value = value; for (const fn of [...listeners]) fn() },
  }
}

function fakeSource() {
  return {
    entries: [],
    change: { kind: 'replace', entries: [] },
    getSnapshot() { return { entries: this.entries, change: this.change, revision: 0 } },
    subscribe() { return () => {} },
  }
}

const React = { createElement: () => ({}), useSyncExternalStore: (s, g) => g(), useState: (v) => [v, () => {}], useEffect: () => {} }

function boot({ remote, session, generation }) {
  const rowProps = { value: undefined }
  const gen = generation ?? fakeStore({ id: 1, host: 'h' })
  const rpc = { calls: [], call: async () => ({ ok: true, value: {} }) }
  const disposers = []
  const ctx = {
    locale: { register() {} },
    slots: {
      inject(name, fn) { fn() },
      register: (opts) => { rowProps.value = typeof opts.inject === 'function' ? opts.inject() : {}; return {} },
    },
    effect(fn) { const c = fn(); if (typeof c === 'function') disposers.push(c) },
    get(name) {
      if (name === 'connection') return { rpc, generation: gen }
      if (name === 'sessions') return { binding: () => ({ eventSource: fakeSource() }) }
      if (name === 'uiSession') return { current: fakeStore({ key: 's1' }) }
      if (name === 'remote') return remote
      // The gateway registers the namespace under the DOTTED name
      // `remote.session`; it is not a property of the `remote` service.
      if (name === 'remote.session') return session !== undefined ? session : remote?.session
      return undefined
    },
    on() {},
    emit() {},
  }
  globalThis.localStorage = { getItem: () => null, setItem() {} }
  globalThis.document = undefined
  createLifecycle({ React, primitives: null })(ctx)
  return { rowProps, gen, dispose() { for (const fn of disposers) fn() } }
}

function findAll(el, type) {
  const out = []
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return
    if (node.type === type) out.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(el)
  return out
}

function render(React, Row, props) {
  React.begin()
  return Row(props)
}

function catalogRemote(handler) {
  const calls = []
  return {
    calls,
    session: {
      modelCatalog: () => { calls.push(1); return handler() },
    },
  }
}

test('opening the menu loads the catalog once and renders groups', async function () {
  const remote = catalogRemote(() => Promise.resolve({ ok: true, value: CATALOG }))
  const { rowProps, dispose } = boot({ remote })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  const props = { ...rowProps.value, t }
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  assert.equal(remote.calls.length, 1)
  const labels = findAll(el, p.MenuItemButton).map((i) => i.children[0].children[0].children[0])
  assert.deepEqual(labels, ['predict.follow', 'Chat', 'Reasoner', 'GPT-X'])
  dispose()
})

// REGRESSION: "选择模型那一行不见了".
//
// `remote.session` is a dotted Cordis service name registered by the gateway
// (`remote.${namespace}`), not a property of the `remote` service. Reading
// `ctx.get('remote').session` walks the inject-guarded namespace proxy and
// throws `cannot get property "remote.session" without inject`. The throw
// happens at CATALOG LOAD time, i.e. when the model menu opens, so the row
// looked healthy until clicked and then React's error boundary replaced the
// whole row with an empty `[data-slot-error]` cell. The fake below reproduces
// the host proxy: any property read on `remote` throws.
test('the catalog reads the dotted remote.session service, never a property of remote', async function () {
  let touchedRemote = false
  const remote = new Proxy({}, {
    get() {
      touchedRemote = true
      throw new Error('cannot get property "remote.session" without inject')
    },
  })
  const namespace = catalogRemote(() => Promise.resolve({ ok: true, value: CATALOG })).session
  const { rowProps, dispose } = boot({ remote, session: namespace })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  const props = { ...rowProps.value, t }
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  assert.equal(touchedRemote, false, 'the row must not read remote.session through remote')
  assert.equal(rowProps.value.catalog.getSnapshot().status, 'ready')
  const labels = findAll(el, p.MenuItemButton).map((i) => i.children[0].children[0].children[0])
  assert.deepEqual(labels, ['predict.follow', 'Chat', 'Reasoner', 'GPT-X'])
  dispose()
})

test('follow-current is first and selectable while loading and in error', async function () {
  const remote = catalogRemote(() => new Promise(() => {}))
  const { rowProps, dispose } = boot({ remote })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  let pinned = 'unset'
  const props = { ...rowProps.value, t, setPinnedModel: (v) => { pinned = v } }
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  const first = findAll(el, p.MenuItemButton)[0]
  assert.equal(first.children[0].children[0].children[0], 'predict.follow')
  first.props.onSelect()
  assert.equal(pinned, '')
  dispose()
})

test('a rejected load shows the error and Retry re-sends the RPC', async function () {
  let call = 0
  const remote = catalogRemote(() => {
    call += 1
    return call === 1 ? Promise.reject(new Error('down')) : Promise.resolve({ ok: true, value: CATALOG })
  })
  const { rowProps, dispose } = boot({ remote })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  const props = { ...rowProps.value, t }
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  const retry = findAll(el, 'button').find((b) => b.children.includes('predict.retry'))
  assert.ok(retry !== undefined, 'error state renders Retry')
  assert.equal(remote.calls.length, 1, 'no auto-fetch storm while the error sits')
  retry.props.onClick()
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  assert.equal(remote.calls.length, 2)
  assert.ok(findAll(el, p.MenuItemButton).length > 1)
  dispose()
})

test('an ok:false catalogue answer is a retryable error, not a stuck spinner', async function () {
  // THE NORMAL RPC FAILURE SHAPE. `{ ok: false, error: { code } }` resolves the
  // promise, so it used to throw inside the SUCCESS callback — where the
  // sibling rejection handler cannot see it. The snapshot stayed `loading` and
  // the row showed "…" with no Retry for the rest of the page's life.
  let call = 0
  const remote = catalogRemote(() => {
    call += 1
    return call === 1
      ? Promise.resolve({ ok: false, error: { code: 'unavailable' } })
      : Promise.resolve({ ok: true, value: CATALOG })
  })
  const { rowProps, dispose } = boot({ remote })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  const props = { ...rowProps.value, t }
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)

  const status = findAll(el, 'div').find((d) => d.props.className === 'dsh-predict-status')
  assert.ok(status !== undefined, 'the menu must show an error line')
  const retry = findAll(el, 'button').find((b) => b.children.includes('predict.retry'))
  assert.ok(retry !== undefined, 'ok:false must render Retry, not the loading dots')
  assert.equal(remote.calls.length, 1, 'the failure must not auto-retry in a loop')

  retry.props.onClick()
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  assert.equal(remote.calls.length, 2, 'Retry must issue a genuinely new RPC')
  assert.ok(findAll(el, p.MenuItemButton).length > 1)
  dispose()
})

test('a host reconnect invalidates the catalog and the next open reloads', async function () {
  let call = 0
  const remote = catalogRemote(() => {
    call += 1
    return Promise.resolve({ ok: true, value: call === 1 ? CATALOG : { groups: [{ id: 'new', name: 'New', models: [{ id: 'm', name: 'Fresh' }] }] } })
  })
  const gen = fakeStore({ id: 1, host: 'h' })
  const { rowProps, dispose } = boot({ remote, generation: gen })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  const props = { ...rowProps.value, t }
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  assert.equal(remote.calls.length, 1)
  gen.set({ id: 2, host: 'h' })
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  assert.equal(remote.calls.length, 2)
  assert.ok(findAll(el, p.MenuItemButton).some((i) => i.children[0].children[0].children[0] === 'Fresh'))
  dispose()
})

test('disposal invalidates the catalog so a reopened row cannot show stale data', async function () {
  const remote = catalogRemote(() => Promise.resolve({ ok: true, value: CATALOG }))
  const { rowProps, dispose } = boot({ remote })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  const props = { ...rowProps.value, t }
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  assert.ok(findAll(el, p.MenuItemButton).length > 1)
  dispose()
  const snap = rowProps.value.catalog.getSnapshot()
  assert.equal(snap.status, 'idle')
  assert.equal(snap.value, null)
})

test('a pinned choice writes provider/model and only ever reads the catalog', async function () {
  const forbidden = {
    session: {
      modelCatalog: () => Promise.resolve({ ok: true, value: CATALOG }),
      setModel: () => { throw new Error('session.setModel must not be called') },
    },
    directory: { select: () => { throw new Error('directory.select must not be called') } },
  }
  const { rowProps, dispose } = boot({ remote: forbidden })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  const props = { ...rowProps.value, t }
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  const item = findAll(el, p.MenuItemButton).find((i) => i.children[0].children[0].children[0] === 'GPT-X')
  item.props.onSelect()
  assert.equal(rowProps.value.settingsStore.getSnapshot().pinnedModel, 'openai/gpt-x')
  dispose()
})

test('the search field filters through rankByName', async function () {
  const remote = catalogRemote(() => Promise.resolve({ ok: true, value: CATALOG }))
  const { rowProps, dispose } = boot({ remote })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  const props = { ...rowProps.value, t }
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  findAll(el, p.Input)[0].props.onChange({ target: { value: 'gpt' } })
  el = render(R, Row, props)
  const labels = findAll(el, p.MenuItemButton).map((i) => i.children[0].children[0].children[0])
  assert.deepEqual(labels, ['predict.follow', 'GPT-X'])
  dispose()
})

test('an unknown stored pin is shown, not rewritten', async function () {
  const remote = catalogRemote(() => Promise.resolve({ ok: true, value: CATALOG }))
  const { rowProps, dispose } = boot({ remote })
  const R = makeReact()
  const p = makePrimitives()
  const Row = createRow(R, p)
  const props = { ...rowProps.value, t }
  rowProps.value.setPinnedModel('old/gone')
  let el = render(R, Row, props)
  findAll(el, p.Menu)[0].props.anchor.props.onClick()
  el = render(R, Row, props)
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  const menu = findAll(el, p.Menu)[0]
  assert.equal(menu.props.anchor.children[0].children[0], 'old/gone')
  dispose()
})

test('the HTML fallback loads usable choices on focus', async function () {
  const remote = catalogRemote(() => Promise.resolve({ ok: true, value: CATALOG }))
  const { rowProps, dispose } = boot({ remote })
  const R = makeReact()
  const Row = createRow(R, null)
  const props = { ...rowProps.value, t }
  let el = render(R, Row, props)
  // THE ROW ITSELF, not only its control: a missing primitive used to make the
  // whole row throw, and the host then swapped it for an empty slot-error cell
  // that still got the theme hairline (the "thick line" under Default shell).
  assert.equal(el.type, 'div')
  assert.equal(el.props.className, 'dsh-predict-row')
  const select = findAll(el, 'select')[0]
  select.props.onFocus()
  await new Promise((r) => setTimeout(r, 10))
  el = render(R, Row, props)
  assert.equal(remote.calls.length, 1)
  const optgroups = findAll(el, 'optgroup')
  assert.equal(optgroups.length, 2)
  dispose()
})
