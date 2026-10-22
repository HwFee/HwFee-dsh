/**
 * The 行内代码 / Inline code row: a fourth pixel stepper, and the one setting
 * this plugin writes straight onto a HOST variable.
 *
 * WHY THIS FILE EXISTS. The plugin's own `AGENTS.md` records the failure mode
 * this shape invites: a state key is THREE things — a default, a whitelist entry
 * in `sanitize()`, and a row that reads it — and the whitelist is the one that
 * fails silently. `uiFontFamily` was missing from it once, so every save dropped
 * the key, the row read `undefined` forever and re-rendered until React threw
 * #185, which the host swallowed into an empty `<div data-slot-error>`: no row,
 * no error message, nothing to grep for. The first test below is that bug.
 *
 * THE OTHER HALF IS THE VARIABLE. `--dsh-code-font-size` is the HOST's input and
 * cds-theme derives `--dsh-code-font-delta` from it, where only the inline-code
 * rung consumes the delta. So the row must write the SIZE and must never touch
 * the DELTA: writing the delta would move every rung that reads it (fenced
 * blocks, tool cards) and would then be overwritten by the theme on the next
 * snapshot, i.e. it would both overreach and drift.
 *
 * The DOM here is the same fake the ui-scale suite uses: a document with a body
 * whose `style` is a real property bag, and rows rendered through the bundle's
 * own React stand-in. The unit under test is the decision logic — which property
 * is written, with what value, and when it is removed — not layout.
 *
 *   node test/inline-code.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const constants = await import('../client/src/constants.js')
const {
  DEFAULT_STATE, sanitize, clampInlineCodeSize, INLINE_CODE_BASE_PX,
  CODE_SIZE_VARIABLE, INLINE_CODE_SIZE_ROW_ID,
} = constants

const ZH = JSON.parse(readFileSync(join(root, 'locale', 'zh.json'), 'utf8'))
const EN = JSON.parse(readFileSync(join(root, 'locale', 'en.json'), 'utf8'))

// ------------------------------------------------------------- the fake DOM

/**
 * A CSSStyleDeclaration stand-in with the surface `writeInlineCodeSize` uses.
 * It records priorities too, because a value written `!important` would beat
 * the host's own presentation and is not what this row does.
 */
function styleBag() {
  const values = new Map()
  const priorities = new Map()
  return {
    values,
    getPropertyValue(name) { return values.has(name) ? values.get(name) : '' },
    getPropertyPriority(name) { return priorities.has(name) ? priorities.get(name) : '' },
    setProperty(name, value, priority) {
      values.set(name, String(value))
      priorities.set(name, priority === undefined ? '' : String(priority))
    },
    removeProperty(name) { values.delete(name); priorities.delete(name) },
  }
}

function makeElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    id: '', textContent: '', dataset: {}, attributes: {},
    style: styleBag(),
    children: [], parentNode: null, disabled: false,
    appendChild(child) { this.children.push(child); child.parentNode = this; return child },
    removeChild(child) {
      const i = this.children.indexOf(child)
      if (i >= 0) this.children.splice(i, 1)
      child.parentNode = null
      return child
    },
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child)
      const i = ref === undefined || ref === null ? -1 : this.children.indexOf(ref)
      if (i < 0) this.children.push(child)
      else this.children.splice(i, 0, child)
      child.parentNode = this
      return child
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
    },
    setAttribute(name, value) { this.attributes[name] = String(value) },
    removeAttribute(name) { delete this.attributes[name] },
  }
  Object.defineProperty(el, 'firstChild', {
    get() { return this.children.length > 0 ? this.children[0] : null },
  })
  Object.defineProperty(el, 'nextSibling', {
    get() {
      const parent = this.parentNode
      if (!parent || !parent.children) return null
      const i = parent.children.indexOf(this)
      return i >= 0 && i + 1 < parent.children.length ? parent.children[i + 1] : null
    },
  })
  return el
}

/**
 * Load the committed bundle exactly as the browser would, with a hooks-capable
 * React stand-in. `body.style` is a real bag, so a test can assert on the
 * property the bridge wrote — which is the whole deliverable.
 */
function loadClientBundle({ storageSeed } = {}) {
  const document = (function makeDocument() {
    const nodes = new Map()
    const doc = {
      documentElement: makeElement('html'),
      body: makeElement('body'),
      head: makeElement('head'),
      createElement: makeElement,
      getElementById(id) { return nodes.get(id) ?? null },
    }
    const baseAppend = doc.head.appendChild.bind(doc.head)
    doc.head.appendChild = (child) => { baseAppend(child); if (child.id) nodes.set(child.id, child); return child }
    const baseRemove = doc.head.removeChild.bind(doc.head)
    doc.head.removeChild = (child) => { baseRemove(child); if (child.id) nodes.delete(child.id); return child }
    return doc
  })()

  const storage = new Map(storageSeed ? Object.entries(storageSeed) : [])

  // Hook state is scoped per component so a row can be rendered repeatedly and
  // its callbacks driven directly, the way the ui-scale and fonts suites do.
  const scopes = new Map()
  let current = null
  const react = {
    createElement(type, props, ...children) {
      const p = props ?? {}
      if (children.length === 1) p.children = children[0]
      else if (children.length > 1) p.children = children
      return { type, props: p, children }
    },
    useState(initial) {
      const i = current.cursor++
      if (!(i in current.slots)) current.slots[i] = { v: initial }
      const cell = current.slots[i]
      return [cell.v, (nv) => { cell.v = typeof nv === 'function' ? nv(cell.v) : nv }]
    },
    useEffect() { current.cursor++ },
    useRef(v) {
      const i = current.cursor++
      if (!(i in current.slots)) current.slots[i] = { current: v }
      return current.slots[i]
    },
    useSyncExternalStore(subscribe, get) { current.cursor++; subscribe(() => {}); return get() },
  }

  const primitives = {
    Menu: (props) => ({ type: 'Menu', props, children: props.open ? [props.anchor] : [props.anchor] }),
    MenuItemButton: (props) => ({ type: 'MenuItemButton', props, children: [] }),
    Input: (props) => ({ type: 'Input', props, children: [] }),
    IconChevronDownOutlineRegular: () => null,
    IconCheckOutlineRegular: () => null,
    IconSearchOutlineRegular: () => null,
  }

  const window = {
    document,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    __ModuleLoader__: {
      load({ factory }) {
        module.exports.loaded = factory((name) => {
          if (name === 'react') return react
          if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
          throw new Error('unexpected require: ' + name)
        })
      },
    },
  }

  new Function('window', 'document', 'fetch', 'setTimeout', 'clearTimeout', 'console',
    readFileSync(join(root, 'client', 'client.js'), 'utf8'))(
    window, document, () => Promise.reject(new Error('no fetch in tests')),
    () => 0, () => {}, console)

  function render(component, props) {
    if (!scopes.has(component)) scopes.set(component, { slots: [], cursor: 0 })
    current = scopes.get(component)
    current.cursor = 0
    const resolve = (node) => {
      while (node && typeof node.type === 'function') node = node.type(node.props ?? {})
      if (node && node.children) node.children = node.children.map(resolve)
      return node
    }
    return resolve(component(props))
  }
  function* walk(node) {
    if (!node || typeof node !== 'object') return
    yield node
    for (const child of node.children ?? []) yield* walk(child)
  }
  const find = (tree, pred) => {
    const hits = []
    for (const n of walk(tree)) if (pred(n)) hits.push(n)
    return hits
  }

  return { api: module.exports.loaded, document, window, storage, render, find }
}

const module = { exports: {} }

/** A strict-ish ctx: only the services the plugin injected are readable. */
function makeCtx({ services = {}, inject = [] } = {}) {
  const disposables = []
  const injected = new Set(inject)
  const ears = new Map()
  const ctx = {
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') disposables.push(d)
      return typeof d === 'function' ? d : function () {}
    },
    on(name, fn) {
      if (!ears.has(name)) ears.set(name, new Set())
      ears.get(name).add(fn)
      return () => ears.get(name).delete(fn)
    },
    emit(name, ...args) { for (const fn of [...(ears.get(name) ?? [])]) fn(...args) },
    get(name) { return services[name] },
    dispose() { for (const d of disposables.splice(0).reverse()) { try { d() } catch (e) {} } },
  }
  ctx.proxy = new Proxy(ctx, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop]
      if (prop in target) return target[prop]
      if (!injected.has(prop)) throw new Error(`cannot get property "${String(prop)}" without inject`)
      return services[prop]
    },
  })
  return ctx
}

function makeSlots() {
  const registrations = []
  return {
    registrations,
    inject(name, cb) { cb(); return () => {} },
    register(spec, component) {
      const entry = { spec, component }
      registrations.push(entry)
      return () => {
        const i = registrations.indexOf(entry)
        if (i >= 0) registrations.splice(i, 1)
      }
    },
  }
}

function makeLocale() {
  const tables = new Map()
  return {
    tables,
    register(ns, table) { tables.set(ns, table); return () => tables.delete(ns) },
    bind(ns) {
      return function t(key) {
        const table = tables.get(ns)
        const raw = table && table.zh ? table.zh[key] : undefined
        return raw === undefined ? key : raw
      }
    },
    getSnapshot() { return { language: 'zh', revision: 1 } },
    subscribe() { return () => {} },
  }
}

// ------------------------------------------------------ 1. the three places

test('inlineCodeSize is in DEFAULT_STATE, survives sanitize, and clamps', function () {
  // PLACE ONE of three: the initial value.
  assert.equal(DEFAULT_STATE.inlineCodeSize, 0, '0 = unset, like the host size rows')
  assert.equal(typeof DEFAULT_STATE.inlineCodeSize, 'number', 'a number, not a string: the stepper does arithmetic on it')

  // PLACE TWO of three: the sanitize() whitelist. This is the failing half of
  // the bug recorded in AGENTS.md §12 — a key missing here is dropped on EVERY
  // save, silently, so the row would read `undefined` forever.
  assert.equal(sanitize({}).inlineCodeSize, 0, 'an empty payload still names the key')
  assert.equal(sanitize({ inlineCodeSize: 15 }).inlineCodeSize, 15, 'and a real value survives')
  assert.equal(
    Object.prototype.hasOwnProperty.call(sanitize({}), 'inlineCodeSize'), true,
    'the key must be PRESENT after sanitize, not merely readable as undefined',
  )

  // CLAMPING, the same contract as every other size row: 0 or below is "unset",
  // above the range pins to the maximum, inside the range is untouched.
  assert.equal(sanitize({ inlineCodeSize: -5 }).inlineCodeSize, 0, '-5 is unset, not a negative font size')
  assert.equal(sanitize({ inlineCodeSize: 99 }).inlineCodeSize, 20, '99 pins to the 20px ceiling')
  assert.equal(sanitize({ inlineCodeSize: 12 }).inlineCodeSize, 12, '12 is inside the range and stays')
  assert.equal(sanitize({ inlineCodeSize: '15' }).inlineCodeSize, 15, 'a string from a hand-edited store is coerced')
  assert.equal(sanitize({ inlineCodeSize: 12.6 }).inlineCodeSize, 13, 'px are integers')

  // The clamp function itself, so the test names what the row calls.
  assert.equal(clampInlineCodeSize(-5), 0)
  assert.equal(clampInlineCodeSize(99), 20)
  assert.equal(clampInlineCodeSize(12), 12)
  assert.equal(clampInlineCodeSize('nonsense'), 0)
  assert.equal(INLINE_CODE_BASE_PX, 12, 'an unset row displays the theme\'s own chip rung')
})

test('the row is registered under its id and appears in the emitted row list', function () {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots(), locale: makeLocale() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)

  // PLACE THREE of three: the slot that reads the key. A row id is what the
  // host's outlet keys on and what the merger marks the DOM with, so a typo is
  // not a wrong label — it is a row that never appears.
  const slot = bundle.api.__internals.panel.slots.find((s) => s.id === INLINE_CODE_SIZE_ROW_ID)
  assert.ok(slot, `no slot with id "${INLINE_CODE_SIZE_ROW_ID}" — the row would never appear`)
  assert.equal(slot.key, 'inlineCodeSize', 'the row reads the state key that sanitize() keeps')
  assert.equal(slot.order, 13.5, 'the half step between 代码字体 (13) and the sliders (17)')

  // The emitted list is what the host outlet renders, in registration order.
  const ids = bundle.api.__internals.panel.slots.map((s) => s.id)
  assert.ok(ids.includes(INLINE_CODE_SIZE_ROW_ID), 'the row is in the list handed to the slot service')
  const code = ids.indexOf('dsh-system-fonts-code')
  const terminal = ids.indexOf('dsh-system-fonts-terminal')
  assert.ok(code >= 0 && terminal >= 0)
  assert.ok(code < ids.indexOf(INLINE_CODE_SIZE_ROW_ID) && ids.indexOf(INLINE_CODE_SIZE_ROW_ID) < ids.indexOf('dsh-system-fonts-line-height'),
    'registered after the code-family row and before the sliders')

  // And the row renders the stepper SHAPE the host uses: a 72×36 plate, the
  // value, the two aria-labelled arrows, `px` outside the plate. Not a slider —
  // every other size in that group is a pixel stepper.
  const tree = bundle.render(slot.component)
  assert.equal(tree.props['data-dsf-row'], INLINE_CODE_SIZE_ROW_ID, 'the root carries its own mark')
  const arrows = bundle.find(tree, (n) => n.type === 'button')
  assert.equal(arrows.length, 2, 'exactly the two step arrows')
  const labels = arrows.map((a) => a.props['aria-label'])
  assert.deepEqual(labels, [ZH.strings['row.inlineCodeSize.increase'], ZH.strings['row.inlineCodeSize.decrease']],
    'the aria keys are the row\'s own, so a screen reader says which stepper it is')
  const unit = bundle.find(tree, (n) => n.props?.className === 'dsf-stepper-unit')
  assert.equal(unit.length, 1, '`px` sits outside the plate')
  assert.equal(unit[0].children[0], 'px')
  // Unset displays 12, not 0: the row must never claim a size nothing renders.
  const value = bundle.find(tree, (n) => n.props?.className === 'dsf-stepper-value')
  assert.equal(value[0].children[0], '12', 'unset shows the theme\'s 12px chip rung')
  ctx.dispose()

  // Both dictionaries carry the four strings, or one language shows raw keys.
  for (const key of ['row.inlineCodeSize.title', 'row.inlineCodeSize.desc',
    'row.inlineCodeSize.increase', 'row.inlineCodeSize.decrease']) {
    assert.equal(typeof ZH.strings[key], 'string', `zh.json is missing ${key}`)
    assert.equal(typeof EN.strings[key], 'string', `en.json is missing ${key}`)
  }
  assert.equal(ZH.strings['row.inlineCodeSize.title'], '行内代码')
  assert.equal(EN.strings['row.inlineCodeSize.title'], 'Inline code')
  // The description promises ONLY inline code — the host's fenced blocks and
  // the terminal are pinned by the theme, and a copy that overpromised would be
  // a bug report waiting to happen.
  assert.match(ZH.strings['row.inlineCodeSize.desc'], /行内代码/)
  assert.match(EN.strings['row.inlineCodeSize.desc'], /[Ii]nline code/)
})

// --------------------------------------------------------- 2. the variable

test('unset writes nothing; 15 writes --dsh-code-font-size: 15px, never the delta', function () {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots(), locale: makeLocale() }, inject: bundle.api.inject })
  const body = bundle.document.body
  bundle.api.apply(ctx.proxy)

  // ACTIVATION with the default: the host's own value must survive untouched.
  // Writing 12 here would look identical to the user but would freeze the
  // host's 代码字号 preference out of the axis.
  assert.equal(body.style.getPropertyValue(CODE_SIZE_VARIABLE), '',
    'an unset row leaves the host variable alone')

  // The row's commit path, driven through the bundle's own settings store —
  // the same `setState` the stepper arrows call.
  bundle.api.__internals.setState({ inlineCodeSize: 15 })
  assert.equal(body.style.getPropertyValue(CODE_SIZE_VARIABLE), '15px',
    'the host code-size axis carries the user\'s number')
  assert.equal(body.style.getPropertyPriority(CODE_SIZE_VARIABLE), '',
    'no !important: the host presenter owns this property and must be able to rewrite it')

  // THE DELTA IS THE THEME'S. cds-theme derives it from the size we just wrote,
  // and only the inline-code rung consumes it. Writing it here would move the
  // fenced-block and tool-card rungs too, then be overwritten on the next
  // snapshot — overreach AND drift.
  assert.equal(body.style.getPropertyValue('--dsh-code-font-delta'), '',
    'the plugin must never write --dsh-code-font-delta')

  // Back to 0 REMOVES the property: "unset" has to mean "the host decides", and
  // the host presenter re-writes it from its own preference anyway.
  bundle.api.__internals.setState({ inlineCodeSize: 0 })
  assert.equal(body.style.getPropertyValue(CODE_SIZE_VARIABLE), '',
    '0 removes the property instead of pinning a value')
  assert.equal(body.style.getPropertyValue('--dsh-code-font-delta'), '')
  ctx.dispose()
})

test('a theme snapshot that rewrites the host variable does not undo the setting', function () {
  // The host's presenter projects `snapshot.fontSizes.code` onto the same
  // property on EVERY theme change. Without a re-assert the user's inline-code
  // size would silently revert the first time anything else in the theme moved
  // — a saved setting that quietly stops applying.
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots(), locale: makeLocale() }, inject: bundle.api.inject })
  const body = bundle.document.body
  bundle.api.apply(ctx.proxy)
  bundle.api.__internals.setState({ inlineCodeSize: 15 })
  assert.equal(body.style.getPropertyValue(CODE_SIZE_VARIABLE), '15px')

  // Simulate the host: it overwrites the variable with its own 代码字号 value.
  body.style.setProperty(CODE_SIZE_VARIABLE, '11px')
  ctx.emit('theme/change', {
    fontFamilies: { text: '', code: '', terminal: '' },
    fontSizes: { text: 14, code: 11, terminal: 12 },
    revision: 7,
  })
  assert.equal(body.style.getPropertyValue(CODE_SIZE_VARIABLE), '15px',
    'the stored size is re-asserted after the host rewrote the variable')
  ctx.dispose()
})

// ------------------------------------------------------ 3. the hidden host row

/**
 * Build the host's General-settings subtree for one language, expanded.
 *
 * The region must carry the family inputs, or the merger reads the group as an
 * unrecognized shape and refuses to guess (by design) — so both language
 * variants below include them.
 */
function makeHostDom(document, strings) {
  const text = (value) => { const el = document.createElement('div'); el.textContent = value; return el }

  function sizeRow(title) {
    const row = document.createElement('div')
    row.appendChild(text(title))
    const control = document.createElement('div')
    control.appendChild(text('14'))
    control.appendChild(text('px'))
    row.appendChild(control)
    return row
  }
  function familyRow(title, placeholder) {
    const row = document.createElement('div')
    row.appendChild(text(title))
    const field = document.createElement('div')
    const input = document.createElement('input')
    input.setAttribute('maxlength', '200')
    input.setAttribute('placeholder', placeholder)
    input.setAttribute('aria-label', title)
    field.appendChild(input)
    row.appendChild(field)
    return row
  }

  const outlet = document.createElement('div')
  outlet.setAttribute('data-slot', 'settings.general.item')
  const group = document.createElement('div')
  const expander = document.createElement('button')
  expander.setAttribute('aria-expanded', 'true')
  expander.setAttribute('aria-controls', strings.regionId)
  const control = sizeRow(strings.groupTitle)
  control.appendChild(expander)
  group.appendChild(control)
  const region = document.createElement('div')
  region.id = strings.regionId
  const official = {
    textFamily: familyRow(strings.textFamily, strings.placeholder),
    codeFamily: familyRow(strings.codeFamily, strings.placeholder),
    codeSize: sizeRow(strings.codeSize),
    terminalFamily: familyRow(strings.terminalFamily, strings.placeholder),
    terminalSize: sizeRow(strings.terminalSize),
  }
  for (const key of ['textFamily', 'codeFamily', 'codeSize', 'terminalFamily', 'terminalSize']) {
    region.appendChild(official[key])
  }
  group.appendChild(region)
  outlet.appendChild(group)
  return { outlet, group, region, official }
}

/** Mount the plugin's rows into `outlet` and return the merger for that DOM. */
function mountRows(bundle, outlet, merger) {
  for (const slot of bundle.api.__internals.panel.slots) {
    const el = bundle.document.createElement('div')
    outlet.appendChild(el)
    merger.note(slot.id, el, slot.order, slot.role || null)
  }
  return merger
}

test('the host code-size row is hidden, and only that one', async function () {
  // The host's collapsible region holds TWO size rows with identical markup
  // (code and terminal), so the row is identified by its own dictionary title —
  // `fontSize.code.title` — exactly the way `roleOfTitle` identifies family rows.
  const { createHostMerger } = await import('../client/src/merge.js')
  const bundle = loadClientBundle()
  const document = bundle.document

  const zhDom = makeHostDom(document, {
    groupTitle: '字号大小', regionId: 'region-zh', placeholder: '默认',
    textFamily: '正文字体', codeFamily: '代码字体', terminalFamily: '终端字体',
    codeSize: '代码字号', terminalSize: '终端字号',
  })
  const merger = mountRows(bundle, zhDom.outlet, createHostMerger())
  assert.equal(merger.attempt(), true, 'the group resolved')

  const { codeSize, terminalSize } = zhDom.official
  assert.equal(codeSize.style.display, 'none', 'the duplicated 代码字号 control is hidden')
  assert.equal(codeSize.getAttribute('data-dsf-covered'), '',
    'marked, so restore() unhides exactly what this plugin hid')
  assert.notEqual(terminalSize.style.display, 'none',
    'the TERMINAL size row stays visible — that one is still the host\'s to own')
  assert.equal(terminalSize.getAttribute('data-dsf-covered'), null)
  for (const key of ['textFamily', 'codeFamily', 'terminalFamily']) {
    assert.equal(zhDom.official[key].style.display, 'none', 'the official family inputs are still covered too')
  }
  assert.equal(merger.coveredCount, 4, 'three family rows + the code-size row')

  // REVERSIBILITY. A hidden row left hidden after dispose would leave the host
  // settings page missing a control it thinks it renders.
  merger.restore()
  assert.equal(codeSize.style.display, '', 'restore() unhides the host code-size row')
  assert.equal(codeSize.getAttribute('data-dsf-covered'), null)

  // The English dictionary's title is the same anchor in an en UI, and there the
  // two size rows read "Code font size" / "Terminal font size" — close enough
  // that a prefix match would hide both. A separate subtree so a lucky match in
  // the Chinese region cannot mask a wrong one here.
  const enDom = makeHostDom(document, {
    groupTitle: 'Font size', regionId: 'region-en', placeholder: 'Default',
    textFamily: 'Text font', codeFamily: 'Code font', terminalFamily: 'Terminal font',
    codeSize: 'Code font size', terminalSize: 'Terminal font size',
  })
  const merger2 = mountRows(bundle, enDom.outlet, createHostMerger())
  assert.equal(merger2.attempt(), true, 'the en group resolved too')
  assert.equal(enDom.official.codeSize.style.display, 'none', 'the en title is matched as well')
  assert.notEqual(enDom.official.terminalSize.style.display, 'none',
    'and "Terminal font size" is still spared — the match is exact, not a prefix')
  merger2.restore()
})
