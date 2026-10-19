/**
 * Tests for dsh-system-fonts.
 *
 * The client bundle is a browser artifact built from client/src/ by
 * `npm run build`; this loads it through a minimal DOM shim and asserts on
 * the CSS it generates, on the DOM merger that seats the rows inside the
 * host's font group (driven against a synthetic copy of the host's settings
 * subtree), and on the locale dictionaries that every visible string comes
 * from — in both languages.
 *
 *   node test/fonts.test.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseFontName, mergeCatalogue, execFileBuffer } from '../lib/system-fonts.js'
import { readFontMetadata, FONT_PATH_GUARD_SCRIPT, METADATA_SCRIPT_SOURCE } from '../lib/font-metadata.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let passed = 0
const failures = []

async function test(name, fn) {
  try {
    await fn()
    passed += 1
    process.stdout.write(`  ok   ${name}\n`)
  } catch (error) {
    failures.push({ name, error })
    process.stdout.write(`  FAIL ${name}\n         ${error.message}\n`)
  }
}

function section(title) {
  process.stdout.write(`\n${title}\n`)
}

// --------------------------------------------------------------- host parser

section('lib/system-fonts.js — display-name decomposition')

await test('strips a trailing weight and italic', () => {
  assert.deepEqual(parseFontName('Arial Bold Italic (TrueType)'), { family: 'Arial', weight: 700, italic: true })
})
await test('plain family is weight 400', () => {
  assert.deepEqual(parseFontName('Arial (TrueType)'), { family: 'Arial', weight: 400, italic: false })
})
await test('Light is 300', () => {
  assert.deepEqual(parseFontName('Calibri Light (TrueType)'), { family: 'Calibri', weight: 300, italic: false })
})
await test('two-word weight "Semi Bold" is folded to 600', () => {
  assert.equal(parseFontName('Segoe UI Semibold (TrueType)').weight, 600)
  assert.equal(parseFontName('Segoe UI SemiBold (TrueType)').family, 'Segoe UI')
})
await test('an ampersand list keeps the family\'s own name', () => {
  assert.deepEqual(parseFontName('Cambria & Cambria Math (TrueType)'), { family: 'Cambria', weight: 400, italic: false })
  assert.equal(parseFontName('Microsoft YaHei & Microsoft YaHei UI (TrueType)').family, 'Microsoft YaHei')
})
await test('CJK weight words are understood', () => {
  assert.deepEqual(parseFontName('苹方-简 中粗体 (TrueType)'), { family: '苹方-简', weight: 600, italic: false })
  assert.equal(parseFontName('苹方-简 常规体 (TrueType)').weight, 400)
  assert.equal(parseFontName('思源黑体 细体 (TrueType)').weight, 300)
})
await test('a hyphen separator is handled', () => {
  assert.equal(parseFontName('DSISO1-Bold (TrueType)').family, 'DSISO1')
})
await test('a family whose own name ends in a weight word keeps it', () => {
  // "Arial Black" is genuinely Arial at 900, but "Blackadder ITC" is its own face.
  assert.equal(parseFontName('Blackadder ITC (TrueType)').family, 'Blackadder ITC')
  assert.deepEqual(parseFontName('Arial Black (TrueType)'), { family: 'Arial', weight: 900, italic: false })
})
await test('a single word is never stripped away', () => {
  assert.deepEqual(parseFontName('Bold (TrueType)'), { family: 'Bold', weight: 400, italic: false })
})

section('lib/system-fonts.js — catalogue merge')

await test('GDI names and registry weights merge into one family', () => {
  const catalogue = mergeCatalogue(
    ['Arial', 'Arial Black', 'Calibri'],
    [
      { display: 'Arial Bold (TrueType)', file: 'arialbd.ttf' },
      { display: 'Arial Italic (TrueType)', file: 'ariali.ttf' },
      { display: '华文楷体 (TrueType)', file: 'STKAITI.TTF' },
    ],
  )
  const arial = catalogue.find((f) => f.family === 'Arial')
  // 400 from the base name, 700 from "Arial Bold", 900 from the GDI name
  // "Arial Black" — which is Arial at 900, so folding it in is what lets the
  // weight picker offer Black as a weight instead of a second family.
  assert.deepEqual(arial.weights, [400, 700, 900])
  assert.equal(arial.gdi, true)
  assert.equal(arial.localized, true)
  const kaiti = catalogue.find((f) => f.family === '华文楷体')
  assert.equal(kaiti.gdi, false, 'a localized-only name is not GDI-canonical')
  assert.equal(kaiti.localized, true)
})

await test('symbol faces are flagged, and listed last', () => {
  const catalogue = mergeCatalogue(['Arial', 'Wingdings', 'Segoe MDL2 Assets'], [])
  assert.equal(catalogue.find((f) => f.family === 'Wingdings').symbol, true)
  assert.equal(catalogue.find((f) => f.family === 'Segoe MDL2 Assets').symbol, true)
  assert.equal(catalogue[0].family, 'Arial', 'a text face sorts first')
  assert.equal(catalogue[catalogue.length - 1].symbol, true, 'symbol faces sort last')
})

await test('a name that cannot survive CSS quoting is dropped', () => {
  const catalogue = mergeCatalogue(['Evil"; font: 1px', 'Arial'], [])
  assert.equal(catalogue.find((f) => /Evil/.test(f.family)), undefined)
  assert.ok(catalogue.find((f) => f.family === 'Arial'))
})

section('lib/font-metadata.js + merge — per-file face records')

const PINGFANG_METADATA = [
  { families: ['PingFang SC', '苹方-简'], weight: 400, italic: false, file: 'C:\\Users\\u\\PingFang-SC-Regular.otf' },
  { families: ['PingFang SC', '苹方-简'], weight: 600, italic: false, file: 'C:\\Users\\u\\PingFang-SC-Semibold.otf' },
]

await test('file metadata merges a face\'s true weights into every alias it declares', () => {
  const catalogue = mergeCatalogue(
    ['PingFang SC', 'PingFang TC', 'PingFang HK'],
    [
      { display: '苹方-简 常规体 (TrueType)', file: 'PingFang-SC-Regular.otf' },
      { display: '苹方-简 中粗体 (TrueType)', file: 'PingFang-SC-Semibold.otf' },
    ],
    PINGFANG_METADATA,
  )
  const sc = catalogue.find((f) => f.family === 'PingFang SC')
  const zh = catalogue.find((f) => f.family === '苹方-简')
  assert.deepEqual(sc.weights, [400, 600], 'the GDI-only English alias gains the semibold')
  assert.deepEqual(zh.weights, [400, 600])
  assert.equal(sc.gdi, true)
  assert.equal(zh.localized, true)
  for (const name of ['PingFang TC', 'PingFang HK']) {
    assert.deepEqual(catalogue.find((f) => f.family === name).weights, [400],
      `${name} is a different face and keeps 400 only`)
  }
})

await test('the same metadata works for a generic family, no name is hardcoded', () => {
  const catalogue = mergeCatalogue(
    ['Test Sans'],
    [{ display: '测试无衬线 (TrueType)', file: 'testsans.ttf' }],
    [{ families: ['Test Sans', '测试无衬线'], weight: 700, italic: false, file: 'testsansbd.ttf' }],
  )
  assert.deepEqual(catalogue.find((f) => f.family === 'Test Sans').weights, [400, 700])
  assert.deepEqual(catalogue.find((f) => f.family === '测试无衬线').weights, [400, 700])
})

await test('metadata matching is case-insensitive and never duplicates a family', () => {
  const catalogue = mergeCatalogue(
    ['Test Sans'],
    [],
    [{ families: ['TEST SANS', 'test sans'], weight: 600, italic: false, file: 't.ttf' }],
  )
  const hits = catalogue.filter((f) => f.family.toLowerCase() === 'test sans')
  assert.equal(hits.length, 1, 'one catalogue entry regardless of case spelling')
  assert.deepEqual(hits[0].weights, [400, 600])
})

await test('a family known only from file metadata joins as a localized alias', () => {
  const catalogue = mergeCatalogue(
    ['Arial'], [],
    [{ families: ['Only Meta'], weight: 500, italic: false, file: 'm.otf' }],
  )
  const entry = catalogue.find((f) => f.family === 'Only Meta')
  assert.deepEqual(entry.weights, [500])
  assert.equal(entry.localized, true)
  assert.equal(entry.gdi, false)
  // The catalogue IS the wire (lib/font-route.js sends it field-for-field), so
  // a path here would be a machine-layout disclosure to the whole catalogue.
  assert.equal('file' in entry, false, 'no filesystem path in the catalogue')
})

await test('malformed metadata is ignored, and the plain merge is preserved', () => {
  const before = mergeCatalogue(['Arial'], [{ display: 'Arial Bold (TrueType)', file: 'arialbd.ttf' }])
  const after = mergeCatalogue(
    ['Arial'],
    [{ display: 'Arial Bold (TrueType)', file: 'arialbd.ttf' }],
    [
      null, 'junk', 42, {},
      { families: 'not-an-array', weight: 700 },
      { families: ['Arial'], weight: 'heavy' },
      { families: ['Arial'], weight: 2500 },
      { families: [], weight: 400 },
      { families: ['', '  '], weight: 400 },
      { families: ['Arial'], weight: 700 },
    ],
  )
  assert.deepEqual(before, after)
  const final = mergeCatalogue(
    ['Arial'],
    [{ display: 'Arial Bold (TrueType)', file: 'arialbd.ttf' }],
    [{ families: ['Arial'], weight: 900 }],
  )
  assert.deepEqual(final.find((f) => f.family === 'Arial').weights, [400, 700, 900])
})

await test('the metadata reader returns [] on failure and drops malformed rows', async () => {
  assert.deepEqual(await readFontMetadata(() => Promise.resolve({ stdout: null })), [])
  assert.deepEqual(await readFontMetadata(() => Promise.resolve({ stdout: Buffer.from('not json') })), [])
  assert.deepEqual(await readFontMetadata(() => Promise.reject(new Error('EPERM'))), [])
  assert.deepEqual(await readFontMetadata(null), [])
  const run = () => Promise.resolve({
    stdout: Buffer.from(JSON.stringify([
      { families: ['PingFang SC', '苹方-简'], weight: 600, italic: false, file: 'C:\\x.otf' },
      { families: [], weight: 400 },
      { families: ['Ghost'], weight: 3.5 },
      { families: ['Ghost'], weight: 0 },
    ]), 'utf8'),
  })
  assert.deepEqual(await readFontMetadata(run), [
    { families: ['PingFang SC', '苹方-简'], weight: 600, italic: false, file: 'C:\\x.otf' },
  ])
  const single = () => Promise.resolve({
    stdout: Buffer.from(JSON.stringify({ families: ['Solo'], weight: 400, italic: false, file: 's.otf' }), 'utf8'),
  })
  assert.deepEqual(await readFontMetadata(single), [
    { families: ['Solo'], weight: 400, italic: false, file: 's.otf' },
  ])
})

/**
 * The registry Fonts value is attacker-influenced data (HKCU is writable by any
 * process running as the user) and it reaches `Test-Path` + `GlyphTypeface`.
 * The guard is a PowerShell function inside the script, so the test drives THAT
 * function — not a JavaScript copy of its rules, which could drift.
 */
await test('the metadata script refuses UNC / device / `..` paths before any filesystem probe', async () => {
  assert.ok(
    METADATA_SCRIPT_SOURCE.indexOf('Test-FontPathCandidate $value') < METADATA_SCRIPT_SOURCE.indexOf('Test-Path'),
    'the guard is applied before the first Test-Path',
  )
  if (process.platform !== 'win32') {
    process.stdout.write('         (not Windows — the PowerShell guard cannot be exercised)\n')
    return
  }
  const cases = [
    // a bare file name and a local absolute path: the two shapes a real entry has
    ['arial.ttf', true],
    ['ARIALBD.TTF', true],
    ['C:\\Windows\\Fonts\\arial.ttf', true],
    ['C:/Windows/Fonts/arial.ttf', true],
    // UNC: Test-Path would open SMB and offer the user's NTLM credentials
    ['\\\\attacker\\share\\x.ttf', false],
    ['//attacker/share/x.ttf', false],
    // the device namespace and root-relative paths
    ['\\\\?\\C:\\Windows\\Fonts\\arial.ttf', false],
    ['\\\\.\\PhysicalDrive0', false],
    ['\\Windows\\Fonts\\arial.ttf', false],
    // path traversal out of the Fonts directory
    ['..\\..\\Windows\\Fonts\\arial.ttf', false],
    ['C:\\Windows\\Fonts\\..\\..\\secret.txt', false],
    // URI-shaped values
    ['http://evil.example/x.ttf', false],
    ['file:///C:/x.ttf', false],
    ['C:relative.ttf', false],
  ]
  const literal = cases
    .map(([value]) => "'" + value.replace(/'/g, "''") + "'")
    .join(', ')
  const script = FONT_PATH_GUARD_SCRIPT + '\n' +
    'foreach ($value in @(' + literal + ')) {\n' +
    '  if (Test-FontPathCandidate $value) { [Console]::Out.Write("y") } else { [Console]::Out.Write("n") }\n' +
    '}\n'
  const result = await execFileBuffer('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
  assert.ok(result.stdout !== null, 'PowerShell answered')
  const answers = result.stdout.toString('utf8').trim()
  const expected = cases.map(([, ok]) => (ok ? 'y' : 'n')).join('')
  assert.equal(answers, expected,
    'verdicts differ from the table — got ' + answers + ' for ' + cases.map(([v]) => v).join(' | '))
})

// ------------------------------------------------------------- client bundle

section('client/client.js — loading the bundle under a DOM shim')

/**
 * The host's live typography, transcribed from its own stylesheets. Two code
 * steps are included so the code/UI split can be asserted.
 */
const HOST_TOKENS = {
  '--dsw-font-base-16': '16px/24px -apple-system, sans-serif',
  '--dsw-font-base-16-font-weight': '400',
  '--dsw-font-base-strong-16': '500 16px/24px -apple-system, sans-serif',
  '--dsw-font-base-strong-16-font-weight': '500',
  '--dsw-font-xl-24': '600 24px/32px -apple-system, sans-serif',
  '--dsw-font-xl-24-font-weight': '600',
  '--dsw-font-markdown-base': '14px/24px -apple-system, sans-serif',
  '--dsw-font-markdown-base-font-weight': '400',
  '--dsw-font-markdown-base-line-height': 'calc(24px + var(--dsh-content-font-delta))',
  '--dsw-font-markdown-base-italic': 'italic 14px/24px -apple-system, sans-serif',
  '--dsw-font-markdown-base-italic-font-weight': '400',
  '--dsw-font-markdown-h1': '21px/30px -apple-system, sans-serif',
  '--dsw-font-markdown-h1-font-weight': '700',
  '--dsw-font-markdown-code': '12px/19px "SF Mono", Consolas, monospace',
  '--dsw-font-markdown-code-font-weight': '400',
  '--dsw-font-markdown-code-block': '11px/19px "SF Mono", Consolas, monospace',
  '--dsw-font-markdown-code-block-font-weight': '400',
}

function makeElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    id: '', textContent: '', dataset: {}, style: {},
    attributes: {},
    children: [], parentNode: null, disabled: false,
    appendChild(child) { this.children.push(child); child.parentNode = this; return child },
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child)
      // A browser THROWS here when `ref` is not a child of this node, and that
      // throw is the exact failure this plugin's `seat()` machinery exists to
      // prevent: React holds a row as one of the outlet's fiber children while
      // this plugin has moved that row's DOM into the host's font region, so
      // `outlet.insertBefore(newRow, mergedRow)` is a NotFoundError in a real
      // DOM. A shim that silently appends instead makes every detach test pass
      // whether or not `seat()` runs — deleting `seat()` kept all 137 green.
      if (ref !== undefined && ref !== null && ref.parentNode !== this) {
        const error = new Error('NotFoundError: the node before which the new node is to be inserted is not a child of this node.')
        error.name = 'NotFoundError'
        throw error
      }
      const i = ref === undefined || ref === null ? -1 : this.children.indexOf(ref)
      if (i < 0) this.children.push(child)
      else this.children.splice(i, 0, child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      // Same rule as a browser: removing a node this parent does not hold is a
      // NotFoundError, not a no-op. The settings-page crash that motivated
      // `seat()` is precisely this throw.
      if (child === null || child === undefined || child.parentNode !== this) {
        const error = new Error('NotFoundError: the node to be removed is not a child of this node.')
        error.name = 'NotFoundError'
        throw error
      }
      const i = this.children.indexOf(child)
      if (i >= 0) this.children.splice(i, 1)
      child.parentNode = null
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

function makeDocument() {
  const nodes = new Map()
  const document = {
    documentElement: makeElement('html'),
    body: makeElement('body'),
    head: makeElement('head'),
    createElement: makeElement,
    getElementById(id) { return nodes.get(id) ?? null },
  }
  const appendChild = document.head.appendChild.bind(document.head)
  document.head.appendChild = (child) => {
    appendChild(child)
    if (child.id) nodes.set(child.id, child)
    return child
  }
  const removeChild = document.head.removeChild.bind(document.head)
  document.head.removeChild = (child) => {
    removeChild(child)
    if (child.id) nodes.delete(child.id)
    return child
  }
  return document
}

function computedTokens(document, hostTokens) {
  const merged = Object.assign({}, hostTokens)
  for (const el of document.head.children) {
    if (el.tagName !== 'STYLE' || el.disabled === true) continue
    const block = /:root\s*\{([^}]*)\}/.exec(el.textContent)
    if (!block) continue
    for (const decl of block[1].split(';')) {
      const m = /(--[\w-]+)\s*:\s*(.+?)\s*(?:!important)?\s*$/.exec(decl.trim())
      if (m) merged[m[1]] = m[2]
    }
  }
  return merged
}

function loadClientBundle({ fetchImpl, storageSeed } = {}) {
  const document = makeDocument()
  // `storageSeed` lets a test load the bundle over an existing localStorage
  // payload — the upgrade path from a build that still wrote weight fields.
  const storage = new Map(storageSeed ? Object.entries(storageSeed) : [])
  const loaded = []
  const hostTokens = Object.assign({}, HOST_TOKENS)
  const timers = new Map()
  const rafs = []
  let nextTimer = 1

  // A hooks-capable React stand-in: element trees plus positional hook state
  // scoped per rendered component, so row components can be rendered and their
  // callbacks driven directly.
  const scopes = new Map()
  const pendingEffects = []
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
    useEffect(fn) {
      const i = current.cursor++
      if (!(i in current.slots)) { current.slots[i] = true; pendingEffects.push(fn) }
    },
    useRef(v) {
      const i = current.cursor++
      if (!(i in current.slots)) current.slots[i] = { current: v }
      return current.slots[i]
    },
    useSyncExternalStore(subscribe, get) { current.cursor++; subscribe(() => {}); return get() },
  }

  const primitives = {
    Menu(props) {
      const kids = [].concat(props.children ?? [])
      const rows = (props.items ?? []).map((entry) => ({ type: 'MenuItem', props: { entry }, children: [entry.label] }))
      const foot = (props.footer ?? []).map((entry) => ({ type: 'MenuFooterItem', props: { entry }, children: [entry.label] }))
      return { type: 'Menu', props, children: props.open ? [props.anchor, ...rows, ...kids, ...foot] : [props.anchor] }
    },
    MenuItemButton: (props) => ({ type: 'MenuItemButton', props, children: [].concat(props.children ?? []) }),
    Input: (props) => ({ type: 'Input', props, children: [] }),
    IconChevronDownOutlineRegular: (props) => ({ type: 'IconChevronDown', props, children: [] }),
    IconCheckOutlineRegular: (props) => ({ type: 'IconCheck', props, children: [] }),
    IconSearchOutlineRegular: (props) => ({ type: 'IconSearch', props, children: [] }),
  }

  const window = {
    document,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    getComputedStyle: () => ({
      getPropertyValue: (name) => computedTokens(document, hostTokens)[name] ?? '',
    }),
    requestAnimationFrame: (fn) => { rafs.push(fn); return rafs.length },
    cancelAnimationFrame: (id) => { if (rafs[id - 1]) rafs[id - 1] = null },
    __ModuleLoader__: {
      load({ id, factory }) {
        loaded.push(id)
        const require = (name) => {
          if (name === 'react') return react
          if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
          throw new Error('unexpected require: ' + name)
        }
        module.exports.__loaded = factory(require)
      },
    },
  }

  const source = readFileSync(join(root, 'client', 'client.js'), 'utf8')
  // The bundle targets a browser global; run it with `window`/`document` in scope.
  const runner = new Function('window', 'document', 'fetch', 'setTimeout', 'clearTimeout', 'console', source)
  runner(window, document,
    fetchImpl ?? (() => Promise.reject(new Error('no fetch in tests'))),
    (fn) => { const id = nextTimer++; timers.set(id, fn); return id },
    (id) => timers.delete(id),
    console)

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
  function flushEffects() { for (const fn of pendingEffects.splice(0)) fn() }
  function* walk(node) {
    if (!node || typeof node !== 'object') return
    yield node
    for (const child of node.children ?? []) yield* walk(child)
  }
  const find = (tree, pred) => { const hits = []; for (const n of walk(tree)) if (pred(n)) hits.push(n); return hits }
  const texts = (tree) => { const out = []; for (const n of walk(tree)) for (const c of n.children ?? []) if (typeof c === 'string') out.push(c); return out }

  return {
    api: module.exports.__loaded, document, window, loaded, storage, hostTokens, timers, rafs,
    render, flushEffects, find, texts,
    fireTimers() { for (const fn of [...timers.values()]) fn(); timers.clear() },
    fireRafs() { for (const fn of rafs.splice(0)) if (fn) fn() },
  }
}

const module = { exports: {} }
const { api, document, loaded } = loadClientBundle()

await test('the bundle registers itself under its package name', () => {
  assert.deepEqual(loaded, ['dsh-system-fonts'])
  assert.equal(api.name, 'dsh-system-fonts')
  assert.deepEqual(api.inject, ['slots', 'locale'], 'the rows are slot occupants and every string comes from the locale service')
  assert.equal(typeof api.apply, 'function')
})

/**
 * A locale-service stand-in with the host's surface: `register(ns, { zh, en })`
 * stores dictionaries, `bind(ns)` returns the translator for the active
 * language (default zh; a missing zh key falls through to en, then the key),
 * and `setLanguage` flips it so a test can drive the bilingual path the same
 * way the host's language switch does.
 */
function makeLocale() {
  const tables = new Map()
  let language = 'zh'
  const service = {
    tables,
    language: () => language,
    register(ns, table) {
      tables.set(ns, table)
      return () => tables.delete(ns)
    },
    bind(ns) {
      return function t(key, params) {
        const table = tables.get(ns)
        const dict = (table && table[language]) || (table && table.en) || {}
        let raw = dict[key]
        if (raw === undefined && table && table.en) raw = table.en[key]
        if (raw === undefined) raw = key
        if (params === undefined || params === null) return raw
        return String(raw).replace(/\{(\w+)\}/g, function (whole, name) {
          return params[name] !== undefined ? String(params[name]) : whole
        })
      }
    },
    setLanguage(next) { language = next },
    getSnapshot() { return { language, revision: language === 'zh' ? 1 : 2 } },
    subscribe() { return () => {} },
  }
  return service
}

function makeCtx({ services = {}, inject = [], listeners } = {}) {
  // `locale` is a required service for this plugin, so every strict harness
  // needs one; a test that wants to steer the language passes its own.
  if (inject.includes('locale') && services.locale === undefined) services.locale = makeLocale()
  const ears = listeners ?? new Map()
  const disposables = []
  const injects = []
  const injected = new Set(inject)
  let disposed = false
  const ctx = {
    disposables,
    injects,
    dispose() {
      if (disposed) return
      disposed = true
      for (const d of disposables.splice(0).reverse()) { try { d() } catch (e) {} }
    },
    effect(fn, label) {
      let d
      try {
        d = fn()
      } catch (error) {
        ctx.dispose()
        throw error
      }
      if (typeof d === 'function') disposables.push(d)
      return typeof d === 'function' ? d : function () {}
    },
    on(name, fn) {
      let set = ears.get(name)
      if (!set) ears.set(name, set = new Set())
      set.add(fn)
      const off = () => set.delete(fn)
      ctx.effect(() => off)
      return off
    },
    emit(name, ...args) { for (const fn of [...(ears.get(name) ?? [])]) fn(...args) },
    // Cordis exposes optional services through `get`: absent is undefined, not
    // a throw (unlike a direct property read, which is what the strict proxy
    // guards). This is the path the plugin uses for the optional theme service.
    get(name) { return services[name] },
    provide(name, impl) {
      services[name] = impl
      for (const entry of injects) ctx._tryRun(entry)
    },
    unprovide(name) {
      delete services[name]
      for (const entry of injects) {
        if (entry.ran && entry.needed.includes(name)) {
          entry.child.dispose()
          entry.child = makeCtx({ services, inject: entry.needed, listeners: ears })
          entry.ran = false
        }
      }
    },
    inject(names, cb) {
      const needed = Array.isArray(names) ? names : Object.keys(names)
      const entry = { needed, cb, child: makeCtx({ services, inject: needed, listeners: ears }), ran: false }
      injects.push(entry)
      disposables.push(() => entry.child.dispose())
      ctx._tryRun(entry)
      return { await: async () => entry.child.proxy, dispose: () => entry.child.dispose(), restart: async () => {} }
    },
    _tryRun(entry) {
      if (!entry.ran && entry.needed.every((n) => services[n] !== undefined)) {
        entry.ran = true
        entry.cb(entry.child.proxy)
      }
    },
  }
  ctx.proxy = new Proxy(ctx, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop]
      if (prop in target) return target[prop]
      if (!injected.has(prop)) throw new Error(`cannot get property "${String(prop)}" without inject`)
      if (services[prop] === undefined) throw new Error(`cannot get required service "${String(prop)}" in inactive context`)
      return services[prop]
    },
  })
  if (services.slots && typeof services.slots.inject === 'function') {
    const raw = services.slots.inject.bind(services.slots)
    services.slots.inject = (name, cb) => {
      const d = raw(name, cb)
      disposables.push(() => d && d())
      return d
    }
  }
  return ctx
}

function makeSlots({ declared = true } = {}) {
  const registrations = []
  const waits = []
  const slots = {
    registrations,
    injectCalls: [],
    inject(name, cb) {
      slots.injectCalls.push(name)
      if (!declared) { waits.push(cb); return () => {} }
      const out = cb()
      return () => { for (const d of out ?? []) d() }
    },
    register(spec, component) {
      const entry = { spec, component }
      registrations.push(entry)
      return () => {
        const i = registrations.indexOf(entry)
        if (i >= 0) registrations.splice(i, 1)
      }
    },
    declare() {
      declared = true
      for (const cb of waits.splice(0)) slots.inject('settings.general.item', cb)
    },
  }
  return slots
}

function renderRows(bundle) {
  const content = bundle.render(bundle.api.__internals.panel.ContentFontRow)
  const code = bundle.render(bundle.api.__internals.panel.CodeFontRow)
  return { content, code }
}

section('client/client.js — activation under a strict service contract')

await test('reading an un-injected service throws — the original web-boot failure', () => {
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: api.inject })
  assert.throws(() => ctx.proxy.theme, /cannot get property "theme" without inject/)
})

/**
 * The host theme service, reduced to the surface the bridge touches. `live`
 * means `setFontFamily` exists; the snapshot is what `getTheme` answers and
 * what a `theme/change` carries.
 */
function makeTheme({ families, sizes } = {}) {
  const calls = []
  const theme = {
    calls,
    families: Object.assign({ text: '', code: '', terminal: '' }, families),
    sizes: Object.assign({ text: 14, code: 12, terminal: 12 }, sizes),
    getTheme() {
      return {
        fontFamilies: Object.assign({}, theme.families),
        fontSizes: Object.assign({}, theme.sizes),
        revision: 1,
      }
    },
    setFontFamily(role, value) {
      calls.push(['setFontFamily', role, value])
      theme.families[role] = value
    },
    setFontSize(role, px) { calls.push(['setFontSize', role, px]) },
  }
  return theme
}

await test('activation adopts the host families and writes nothing', () => {
  const { api } = loadClientBundle()
  const theme = makeTheme({ families: {
    text: '"Microsoft YaHei", "PingFang SC", sans-serif',
    code: '"Consolas"',
    terminal: '',
  } })
  const slots = makeSlots()
  const ctx = makeCtx({ services: { slots, theme }, inject: api.inject })
  api.apply(ctx.proxy)
  const state = api.__internals.getState()
  assert.equal(state.uiFamily, 'Microsoft YaHei', 'the host is the single source of truth')
  assert.equal(state.codeFamily, 'Consolas')
  assert.equal(state.terminalFamily, '', 'an empty host list is the default row value')
  assert.deepEqual(theme.calls, [], 'adopting a snapshot never writes the host')
  assert.equal(ctx.injects.length, 0, 'the plugin declares its injections, it does not add any')
  assert.equal(slots.registrations.length, 5,
    'three font rows + line-height + tracking register')
})

await test('a family changed by the host mirrors into the rows through theme/change', () => {
  const { api } = loadClientBundle()
  const theme = makeTheme()
  const ctx = makeCtx({ services: { slots: makeSlots(), theme }, inject: api.inject })
  api.apply(ctx.proxy)
  ctx.emit('theme/change', {
    fontFamilies: { text: '"Segoe UI"', code: '"Consolas"', terminal: '"Cascadia Mono"' },
    fontSizes: { text: 15, code: 12, terminal: 12 },
    revision: 2,
  })
  const state = api.__internals.getState()
  assert.equal(state.uiFamily, 'Segoe UI')
  assert.equal(state.codeFamily, 'Consolas')
  assert.equal(state.terminalFamily, 'Cascadia Mono')
  assert.equal(theme.calls.length, 0, 'the mirror is a read, not a write')
})

await test('the family menu writes the normalized family to the host, not just local state', () => {
  const bundle = loadClientBundle()
  const theme = makeTheme()
  const ctx = makeCtx({ services: { slots: makeSlots(), theme }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const tree = () => bundle.render(bundle.api.__internals.panel.ContentFontRow)
  const search = () => bundle.find(tree(), (n) => n.type === 'Input')[0]
  bundle.find(tree(), (n) => n.type === 'button' && n.props.className === 'dsf-trigger dsf-family')[0].props.onClick()
  search().props.onChange({ target: { value: 'Arial' } })
  // Re-read the field: the Enter handler closes over the query of ITS render.
  search().props.onKeyDown({ key: 'Enter', isComposing: false, preventDefault() {} })
  assert.equal(bundle.api.__internals.getState().uiFamily, 'Arial')
  assert.deepEqual(theme.calls, [['setFontFamily', 'text', '"Arial"']],
    'one write, normalized by the bridge, through the role the row owns')
})

await test('the default footer clears the family through the same host pipeline', () => {
  const bundle = loadClientBundle()
  const theme = makeTheme()
  const ctx = makeCtx({ services: { slots: makeSlots(), theme }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  bundle.api.__internals.setState({ uiFamily: 'Arial', lineHeightPct: 80 })
  const tree = () => bundle.render(bundle.api.__internals.panel.ContentFontRow)
  bundle.find(tree(), (n) => n.type === 'button' && n.props.className === 'dsf-trigger dsf-family')[0].props.onClick()
  const menu = bundle.find(tree(), (n) => n.type === 'Menu')[0]
  menu.props.onSelect('default')
  assert.equal(bundle.api.__internals.getState().uiFamily, '')
  assert.equal(bundle.api.__internals.getState().lineHeightPct, 80, 'the family reset leaves the other rows alone')
  assert.deepEqual(theme.calls, [['setFontFamily', 'text', '']],
    'clearing must be a host write as well, or the hidden official row keeps the old family')
})

await test('a delayed settings.general.item declaration parks the rows', () => {
  const { api, document } = loadClientBundle()
  const slots = makeSlots({ declared: false })
  const ctx = makeCtx({ services: { slots }, inject: api.inject })
  api.apply(ctx.proxy)
  assert.deepEqual(slots.injectCalls, ['settings.general.item'])
  assert.equal(slots.registrations.length, 0, 'a pending declaration is parked, not a failure')
  assert.ok(document.getElementById('dsh-system-fonts-style') !== null, 'fonts applied anyway')
  slots.declare()
  assert.equal(slots.registrations.length, 5, 'rows register once the declaration arrives')
  assert.deepEqual(
    slots.registrations.map((r) => [r.spec.id, r.spec.order]),
    [['dsh-system-fonts-content', 12], ['dsh-system-fonts-code', 13],
     ['dsh-system-fonts-terminal', 14], ['dsh-system-fonts-line-height', 15],
     ['dsh-system-fonts-tracking', 16]])
  assert.ok(slots.registrations.every((r) => r.spec.name === 'settings.general.item'),
    'no settings.section entry remains')
})

section('client/client.js — line-height rewriting and stacks')

const { rewriteLineHeight, buildStack, quoteFamily, clampLineHeight, clampTracking } = api.__internals

await test('the line-height rewrite keeps every other piece verbatim', () => {
  assert.equal(
    rewriteLineHeight('14px/24px Arial, sans-serif', 0.8),
    '14px/calc(24px * 0.8) Arial, sans-serif',
  )
})
await test('a weight token in the host shorthand is preserved, never rewritten', () => {
  // The theme owns the weight: re-writing it here would be a second authority.
  assert.equal(
    rewriteLineHeight('600 14px/24px -apple-system, sans-serif', 0.8),
    '600 14px/calc(24px * 0.8) -apple-system, sans-serif',
  )
  assert.equal(
    rewriteLineHeight('italic 400 14px/24px Arial', 0.8),
    'italic 400 14px/calc(24px * 0.8) Arial',
  )
})
await test('a var() size and a calc() line-height keep tracking the host axes', () => {
  // The host's content steps carry `var(--dsh-content-font-size,…)`, the axis
  // 字号大小 writes. Substituting a number here would freeze the size.
  assert.equal(
    rewriteLineHeight(
      'var(--dsh-content-font-size,14px)/calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)',
      0.8),
    'var(--dsh-content-font-size,14px)/calc(calc(24px + var(--dsh-content-font-delta)) * 0.8) var(--dsw-font-family)',
  )
})
await test('a calc() line-height is not cut at its inner spaces', () => {
  assert.equal(
    rewriteLineHeight('13px / calc(24px + calc(13px - 14px)) -apple-system, sans-serif', 0.5),
    '13px/calc(calc(24px + calc(13px - 14px)) * 0.5) -apple-system, sans-serif',
  )
})
await test('a min()/max() size survives the rewrite', () => {
  const tail = 'min(calc(13px - 1px), max(13px, calc(13px - 2px)))/calc(22px + 0px) var(--dsw-font-family)'
  assert.equal(
    rewriteLineHeight(tail, 0.9),
    'min(calc(13px - 1px), max(13px, calc(13px - 2px)))/calc(calc(22px + 0px) * 0.9) var(--dsw-font-family)',
  )
})
await test('a shorthand without a line-height is left alone so the caller can degrade', () => {
  assert.equal(rewriteLineHeight('14px Arial, sans-serif', 0.8), null)
  assert.equal(rewriteLineHeight('inherit', 0.8), null)
  assert.equal(rewriteLineHeight('', 0.8), null)
})
await test('a chosen family is prepended and never duplicated in the tail', () => {
  const stack = buildStack('Segoe UI', ['-apple-system', '"Segoe UI"', 'Arial', 'sans-serif'])
  assert.equal(stack, '"Segoe UI", -apple-system, Arial, sans-serif')
})
await test('an unsafe family name is stripped rather than injected', () => {
  assert.equal(quoteFamily('Evil"; color: red'), '"Evil color: red"')
  assert.equal(quoteFamily('   '), null)
  assert.equal(buildStack('   ', ['Arial']), 'Arial')
})
await test('a control character in a stored family cannot emit a broken declaration', () => {
  // A corrupt localStorage payload — or a family name read off a font face —
  // can carry a raw newline. A newline inside a quoted CSS string is a parse
  // error, so the declaration is dropped; the host's own normalize strips the
  // same character set, and this stylesheet has to agree with it.
  const hostile = 'Evil\n}\nbody{display:none}/*'
  const quoted = quoteFamily(hostile)
  assert.ok(quoted !== null)
  assert.ok(!/[\u0000-\u001f\u007f]/.test(quoted), 'no control characters survive into CSS')
  const css = api.__internals.buildCss({ uiFamily: hostile, codeFamily: '', lineHeightPct: 100, trackingEm: 0 })
  assert.equal(css.split('\n').filter((line) => line.includes('--dsw-font-family')).length, 1,
    'the value stays on one declaration line')
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, 'braces stay balanced')
  assert.doesNotMatch(css, /\{\s*display\s*:/, 'no rule was smuggled into the stylesheet')
})
await test('a whitespace-only family is "no choice", not a silent reset to the default stack', () => {
  // Emitting the fallback stack here would override a theme that points
  // --dsw-font-family at an embedded face, while the user chose nothing at all.
  const css = api.__internals.buildCss({ uiFamily: '   ', codeFamily: '\t', lineHeightPct: 100, trackingEm: 0 })
  assert.ok(!/--dsw-font-family\s*:/.test(css), 'nothing is emitted for an unusable value')
  assert.ok(!/--ds-font-family-code\s*:/.test(css))
})
await test('clamps hold the promised ranges', () => {
  assert.equal(clampLineHeight(50), 50, 'the floor must not swallow a low choice')
  assert.equal(clampLineHeight(120), 100, 'row spacing never exceeds the host default')
  assert.equal(clampLineHeight(undefined), 100)
  assert.equal(clampTracking(45), 30)
  assert.equal(clampTracking(-45), -30)
})

section('client/client.js — generated CSS')

const { buildCss, setState, getState, applyCss } = api.__internals

await test('an unconfigured plugin emits no font rule at all', () => {
  const css = buildCss(Object.assign({}, api.__internals.DEFAULT_STATE))
  assert.ok(!/--dsw-font-family\s*:/.test(css), 'no family override when none was chosen')
  assert.ok(!/--ds-font-family-code\s*:/.test(css), 'no code override when none was chosen')
  assert.ok(!/--dsh-content-font-size/.test(css), 'no size override at the default')
})

await test('the shared slot writes --dsw-font-family and the code slot does not', () => {
  const css = buildCss({
    uiFamily: 'Microsoft YaHei',
    codeFamily: 'Consolas',
    fontSize: 14, showSymbol: false,
  })
  assert.match(css, /--dsw-font-family: "Microsoft YaHei", -apple-system/)
  assert.match(css, /--ds-font-family-code: "Consolas", "SF Mono"/)
  // The tail still carries CJK fallbacks, so a Latin-only choice cannot lose 汉字.
  assert.match(css, /"Microsoft YaHei"/)
})

await test('THE CONTRACT: the stylesheet never carries a weight declaration', () => {
  // Weights belong to the theme, so no state may produce a `font-weight`
  // declaration or a per-step `-font-weight` token — including a payload from
  // an older build that still carries the removed weight axes.
  const combos = [
    Object.assign({}, api.__internals.DEFAULT_STATE),
    { uiFamily: 'Arial', codeFamily: 'Consolas', lineHeightPct: 50, trackingEm: 30 },
    { uiFamily: '', codeFamily: '', lineHeightPct: 80, trackingEm: -30 },
    { uiFamily: 'Arial', uiWeight: 300, codeFamily: 'Consolas', codeWeight: 700, lineHeightPct: 90, trackingEm: 2 },
  ]
  for (const state of combos) {
    const css = buildCss(state)
    assert.ok(!/font-weight/.test(css), 'no font-weight declaration anywhere')
    assert.ok(!/-font-weight\s*:/.test(css), 'no per-step weight sub-token')
  }
})

await test('the scale is overridden where the host declares it', () => {
  const css = buildCss({ uiFamily: '', codeFamily: '', lineHeightPct: 80, trackingEm: 0 })
  // base.css declares the 30 steps on `body`; a `:root`-only override loses to
  // `body`'s own declaration for everything on the page.
  assert.match(css, /:root, body \{/)
  assert.match(css, /--dsw-font-markdown-base-line-height: /)
})

await test('no colour or layout rule is ever emitted', () => {
  const css = buildCss({ uiFamily: 'Arial', codeFamily: 'Consolas', lineHeightPct: 100, trackingEm: 0 })
  for (const forbidden of ['color:', 'background', 'border', 'padding', 'margin', 'text-align', 'font-weight', 'letter-spacing']) {
    assert.ok(!css.includes(forbidden), `must not emit ${forbidden}`)
  }
})

await test('no content font-size is ever emitted, even from a legacy stored value', () => {
  setState({ fontSize: 26 })
  assert.equal(getState().fontSize, undefined, 'legacy fontSize is dropped from state')
  const css = buildCss(getState())
  assert.ok(!/--dsh-content-font-size/.test(css), 'the stylesheet never writes a size token')
})

section('client/client.js — the apply cascade does not drift')

await test('repeated applies are byte-identical and never accumulate', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  bundle.api.__internals.setState({ lineHeightPct: 80 })
  const tag = bundle.document.getElementById('dsh-system-fonts-style')
  const first = tag.textContent
  for (let i = 0; i < 3; i += 1) bundle.api.__internals.applyCss()
  assert.equal(tag.textContent, first, 'CSS is stable across repeated applies')
  assert.match(tag.textContent,
    /--dsw-font-markdown-base-line-height: calc\(calc\(24px \+ var\(--dsh-content-font-delta\)\) \* 0\.8\) !important;/)
  assert.match(tag.textContent, /--dsw-font-markdown-base: 14px\/calc\(24px \* 0\.8\) -apple-system, sans-serif !important;/)
  assert.ok(!/font-weight/.test(tag.textContent), 'still no weight declaration')
})

await test('the deferred rebuild passes write nothing new, and a state change does', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  bundle.api.__internals.setState({ lineHeightPct: 80 })
  const tag = bundle.document.getElementById('dsh-system-fonts-style')
  const before = tag.textContent
  bundle.fireRafs()
  bundle.fireTimers()
  assert.equal(tag.textContent, before, 'scheduled passes produce identical CSS')
  bundle.api.__internals.setState({ lineHeightPct: 90 })
  assert.match(tag.textContent, /--dsw-font-markdown-base-line-height: calc\(calc\(24px \+ var\(--dsh-content-font-delta\)\) \* 0\.9\) !important;/)
})

await test('live host token changes are picked up from the clean base', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  bundle.api.__internals.setState({ lineHeightPct: 90 })
  bundle.hostTokens['--dsw-font-markdown-base-line-height'] = 'calc(28px + var(--dsh-content-font-delta))'
  bundle.hostTokens['--dsw-font-markdown-base'] = '14px calc(28px + var(--dsh-content-font-delta)) -apple-system, sans-serif'
  bundle.api.__internals.applyCss()
  const tag = bundle.document.getElementById('dsh-system-fonts-style')
  assert.match(tag.textContent,
    /--dsw-font-markdown-base-line-height: calc\(calc\(28px \+ var\(--dsh-content-font-delta\)\) \* 0\.9\) !important;/,
    'the scale derives from the NEW host base, not from our previous output')
})

await test('with no row spacing or tracking the stylesheet holds only family tokens', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  bundle.api.__internals.setState({ uiFamily: 'Arial', codeFamily: 'Consolas', lineHeightPct: 100, trackingEm: 0 })
  const tag = bundle.document.getElementById('dsh-system-fonts-style')
  assert.match(tag.textContent, /--dsw-font-family: "Arial"/)
  assert.match(tag.textContent, /--ds-font-family-code: "Consolas"/)
  assert.ok(!/font-weight/.test(tag.textContent), 'no weight overrides, ever')
  assert.ok(!/--dsh-content-font-size\s*:/.test(tag.textContent), 'no size override')
})

section('client/client.js — 行距 / 字距')

await test('row spacing scales the markdown steps only', () => {
  const css = buildCss({
    uiFamily: '', codeFamily: '',
    lineHeightPct: 80,
  })
  assert.match(css,
    /--dsw-font-markdown-base-line-height: calc\(calc\(24px \+ var\(--dsh-content-font-delta\)\) \* 0\.8\) !important;/,
    'the line-height sub-token is scaled')
  assert.match(css,
    /--dsw-font-markdown-base: 14px\/calc\(24px \* 0\.8\) -apple-system, sans-serif !important;/,
    'the shorthand /lh segment is scaled too')
  assert.ok(!/base-16-line-height/.test(css), 'UI row heights are never touched')
  assert.ok(!/--dsh-content-font-size\s*:/.test(css), 'sizes stay with the host')
})

await test('row spacing rewrites the line-height without touching the family token', () => {
  const css = buildCss({
    uiFamily: 'Arial', codeFamily: '',
    lineHeightPct: 80,
  })
  assert.match(css,
    /--dsw-font-markdown-base: 14px\/calc\(24px \* 0\.8\) -apple-system, sans-serif !important;/,
    'the shorthand keeps its family list; only the /lh segment moves')
  assert.match(css, /--dsw-font-markdown-base-line-height: calc\(calc\(24px \+ var\(--dsh-content-font-delta\)\) \* 0\.8\) !important;/)
  assert.ok(!/font-weight/.test(css), 'no weight ever joins the rewrite')
})

await test('letter-spacing targets the hashed markdown roots, never .markdown-body', () => {
  const css = buildCss({
    uiFamily: '', codeFamily: '',
    trackingEm: 3,
  })
  // The host's markdown roots are CSS-Modules hashed (_markdown_1ypvv_5),
  // so only an attribute-contains selector can reach them across builds.
  assert.match(css, /\[class\*="markdown"\] \{/, 'attribute-contains matches the hash')
  assert.match(css, /letter-spacing: 0\.03em !important;/)
  assert.ok(!/markdown-body/.test(css), 'the old selector matched nothing in the host')
  assert.ok(!/:root, body \{[^}]*letter-spacing/.test(css), 'tracking stays off body')
})

await test('tracking is a no-op at 0 and cannot emit a NaN length', () => {
  const css = buildCss({ uiFamily: '', codeFamily: '' })
  assert.ok(!/letter-spacing/.test(css), 'nothing emitted at the default')
  assert.ok(!/NaN/.test(css), 'a partial state never leaks NaN')
})

await test('a 50% line-height is kept, and >100% is cut at the store', () => {
  const bundle = loadClientBundle()
  bundle.api.__internals.setState({ lineHeightPct: 50 })
  assert.equal(bundle.api.__internals.getState().lineHeightPct, 50, '50 is not silently raised to 80')
  bundle.api.__internals.setState({ lineHeightPct: 120 })
  assert.equal(bundle.api.__internals.getState().lineHeightPct, 100, 'the ceiling is the host default')
})

await test('both slider rows are range inputs with a live readout', () => {
  const bundle = loadClientBundle()
  const slots = bundle.api.__internals.panel.slots

  const lh = bundle.render(slots.find((s) => s.id === 'dsh-system-fonts-line-height').component)
  const lhInput = bundle.find(lh, (n) => n.type === 'input')
  assert.equal(lhInput.length, 1, 'one range input in the 行距 row')
  assert.equal(lhInput[0].props.type, 'range')
  assert.deepEqual([lhInput[0].props.min, lhInput[0].props.max], [50, 100], '行距 drags down only, 50–100')
  assert.match(bundle.texts(bundle.find(lh, (n) => n.props?.className === 'dsf-slider-value')[0])[0], /%$/)
  lhInput[0].props.onChange({ target: { value: '72' } })
  assert.equal(bundle.api.__internals.getState().lineHeightPct, 72, 'every drag tick commits immediately')

  const tr = bundle.render(slots.find((s) => s.id === 'dsh-system-fonts-tracking').component)
  const trInput = bundle.find(tr, (n) => n.type === 'input')[0]
  assert.deepEqual([trInput.props.min, trInput.props.max], [-30, 30])
  trInput.props.onChange({ target: { value: '-4' } })
  assert.equal(bundle.api.__internals.getState().trackingEm, -4)
  const trAgain = bundle.render(slots.find((s) => s.id === 'dsh-system-fonts-tracking').component)
  assert.equal(bundle.texts(bundle.find(trAgain, (n) => n.props?.className === 'dsf-slider-value')[0])[0], '-0.04em',
    'the readout tracks the committed value')
})

section('client/client.js — state')

await test('state round-trips through localStorage', () => {
  setState({ uiFamily: 'Arial', lineHeightPct: 80, trackingEm: 2 })
  const saved = api.__internals.loadState()
  assert.equal(saved.uiFamily, 'Arial')
  assert.equal(saved.lineHeightPct, 80)
  assert.equal(saved.trackingEm, 2)
  assert.equal(getState().uiFamily, 'Arial')
  assert.equal('uiWeight' in saved, false, 'the removed weight axis is not part of the schema')
  assert.equal('codeWeight' in saved, false)
})

await test('a legacy payload that still carries weight fields loads and drops them', () => {
  // An install upgrading from the weight-feature build: the sanitizer must not
  // throw and must simply ignore the fields that no longer exist.
  const legacy = {
    uiFamily: 'Arial',
    uiWeight: 300,
    codeFamily: 'Consolas',
    codeWeight: 700,
    terminalFamily: 'Cascadia Mono',
    lineHeightPct: 80,
    trackingEm: 3,
  }
  const seeded = loadClientBundle({ storageSeed: { 'dsh-system-fonts/settings': JSON.stringify(legacy) } })
  const state = seeded.api.__internals.loadState()
  assert.deepEqual(state, {
    uiFamily: 'Arial',
    codeFamily: 'Consolas',
    terminalFamily: 'Cascadia Mono',
    lineHeightPct: 80,
    trackingEm: 3,
  }, 'the family/line-height/tracking values survive; the weight axes are gone')
  const css = seeded.api.__internals.buildCss(state)
  assert.ok(!/font-weight/.test(css), 'and the stylesheet still emits no weight')
})

await test('a corrupt stored value falls back to defaults', () => {
  // Exercised through the clamp boundaries rather than by rewriting storage:
  // loadState() runs once at bundle load, so the live path is setState.
  setState({ lineHeightPct: 9999 })
  assert.equal(getState().lineHeightPct, 100)
  setState({ trackingEm: -999 })
  assert.equal(getState().trackingEm, -30)
  setState({ fontSize: 1 })
  assert.equal(getState().fontSize, undefined, 'fontSize is no longer state')
  setState({ uiFamily: 'Arial', lineHeightPct: 100, trackingEm: 0 })
})

await test('a corrupt stored payload loads as defaults and can never emit broken CSS', () => {
  // A SECOND bundle over a broken localStorage payload — the case the test
  // above explicitly could not reach, because loadState() runs at bundle load.
  const broken = loadClientBundle({ storageSeed: { 'dsh-system-fonts/settings': '{not json' } })
  assert.deepEqual(broken.api.__internals.loadState(), broken.api.__internals.DEFAULT_STATE,
    'unparseable JSON falls back to the defaults')

  // Valid JSON with hostile values: the strings pass through sanitize (it only
  // type-checks them), so the CSS builder is the last line of defence.
  const hostile = loadClientBundle({
    storageSeed: {
      'dsh-system-fonts/settings': JSON.stringify({
        uiFamily: 'Evil\n} body{display:none}',
        codeFamily: 42,
        terminalFamily: null,
        lineHeightPct: 'lots',
        trackingEm: { x: 1 },
      }),
    },
  })
  const state = hostile.api.__internals.getState()
  assert.equal(state.uiFamily, 'Evil\n} body{display:none}', 'a string is kept as given and only sanitised at the CSS boundary')
  assert.equal(state.codeFamily, '', 'a non-string family is dropped')
  assert.equal(state.terminalFamily, '')
  assert.equal(state.lineHeightPct, 100, 'a non-numeric percentage clamps to the default')
  assert.equal(state.trackingEm, 0)
  const css = hostile.api.__internals.buildCss(state)
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, 'braces stay balanced')
  assert.equal(css.split('\n').filter((line) => line.includes('--dsw-font-family')).length, 1,
    'the hostile value stays inside its own single declaration')
  assert.ok(!/body\s*\{\s*display/.test(css), 'no rule was smuggled into the stylesheet')
})

await test('a rebuild failure mid-session cannot break the settings panel', () => {
  // Activation rolls a throw back (a later effect test covers that), but a
  // rebuild triggered by a slider drag has nothing to roll back: the previous
  // stylesheet stays installed and must not take the React handler down.
  const bundle = loadClientBundle()
  const store = bundle.api.__internals.settings
  const real = store.onChange
  const warnings = []
  const originalWarn = console.warn
  console.warn = (message) => warnings.push(String(message))
  try {
    store.onChange = function () { throw new Error('style rebuild exploded') }
    assert.doesNotThrow(() => store.setState({ uiFamily: 'Arial' }), 'the commit still succeeds')
    assert.equal(store.getState().uiFamily, 'Arial', 'and the value is kept')
  } finally {
    store.onChange = real
    console.warn = originalWarn
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /could not apply/)
})

await test('the stylesheet is installed into head on activation, once', () => {
  const bundle = loadClientBundle()
  assert.equal(bundle.document.getElementById('dsh-system-fonts-style'), null,
    'module load alone installs nothing')
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const style = bundle.document.getElementById('dsh-system-fonts-style')
  assert.ok(style !== null, 'the style tag exists after activation')
  assert.equal(style.dataset.plugin, 'dsh-system-fonts')
  assert.match(style.textContent, /fonts & content spacing/)
})

section('client/client.js — the general settings rows')

await test('each row is one family picker — no second control, no weight menu', () => {
  const bundle = loadClientBundle()
  const { content, code } = renderRows(bundle)
  const terminal = bundle.render(bundle.api.__internals.panel.TerminalFontRow)
  const rowText = (tree) => bundle.texts(tree).join(' ')
  assert.match(rowText(content), /内容字体/)
  assert.match(rowText(content), /界面与正文使用同一字体/)
  assert.match(rowText(code), /代码字体/)
  assert.match(rowText(code), /行内代码与代码块/)
  for (const tree of [content, code, terminal]) {
    const menus = bundle.find(tree, (n) => n.type === 'Menu')
    assert.equal(menus.length, 1, 'exactly one family menu per row')
    const buttons = bundle.find(tree, (n) => n.type === 'button')
    assert.equal(buttons.length, 1, 'exactly one trigger per row')
    assert.equal(buttons[0].props.className, 'dsf-trigger dsf-family')
    const dead = bundle.find(tree, (n) => typeof n.props?.className === 'string'
      && /dsf-(weight|card|preview|stepper|btn|error|row)$/.test(n.props.className) && n.props.className !== 'dsf-row')
    assert.equal(dead.length, 0, 'no weight control, cards, previews or stray controls')
    assert.ok(bundle.find(tree, (n) => n.type === 'input').length === 0, 'no inline inputs while closed')
  }
})

await test('the sticky search stays inside the menu scrollport and paints no plate', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const css = bundle.document.getElementById('dsh-system-fonts/panel').textContent
  // A negative sticky offset drags the search header over the host menu's 4px
  // top padding and rounded stroke, so the popup's border appears to move
  // upward as the (long) font list scrolls.
  assert.match(css, /\.dsf-search\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/)
  assert.doesNotMatch(css, /\.dsf-search\s*\{[^}]*top:\s*-/)
  // The host menu already paints its surface and the Input carries its own
  // opaque rounded field. An extra fill here is an unrounded square plate
  // around the rounded input — the stray frame users see.
  assert.doesNotMatch(css, /\.dsf-search\s*\{[^}]*background:/)
  assert.doesNotMatch(css, /\.dsf-search\s*\{[^}]*backdrop-filter:/)
})

await test('the family trigger opens on click and ArrowDown, with proper aria', () => {
  const bundle = loadClientBundle()
  const trigger = () => bundle.find(renderRows(bundle).content,
    (n) => n.type === 'button' && n.props['aria-label'] === '内容字体')[0]
  let node = trigger()
  assert.equal(node.props['aria-haspopup'], 'menu')
  assert.equal(node.props['aria-expanded'], false)
  node.props.onClick()
  node = trigger()
  assert.equal(node.props['aria-expanded'], true)
  const tree = renderRows(bundle).content
  assert.ok(bundle.find(tree, (n) => n.type === 'Input').length === 1, 'search input rendered in the open menu')
  const value = node.children[0]
  assert.match(String(value.children[0]), /默认字体/, 'empty family shows the placeholder')
  node.props.onClick()
  node = trigger()
  node.props.onKeyDown({ key: 'ArrowDown', preventDefault() {} })
  assert.equal(trigger().props['aria-expanded'], true, 'ArrowDown reopens a closed trigger')
})

await test('searching filters the catalogue, Enter commits, IME is ignored', async () => {
  const fetchImpl = () => Promise.resolve({
    ok: true,
    json: async () => ({ supported: true, sources: [], families: [
      { family: 'Microsoft YaHei', weights: [300, 400, 700], symbol: false },
      { family: 'Arial', weights: [400, 700], symbol: false },
      { family: 'Wingdings', weights: [400], symbol: true },
    ] }),
  })
  const bundle = loadClientBundle({ fetchImpl })
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  renderRows(bundle)
  bundle.flushEffects()
  await new Promise((r) => setTimeout(r, 0))
  const menu = () => bundle.find(renderRows(bundle).content, (n) => n.type === 'Menu')[0]
  const input = () => bundle.find(menu(), (n) => n.type === 'Input')[0]
  // The three embedded CDS faces are offered above the system catalogue and are
  // NOT system fonts, so the catalogue assertions below must skip them.
  const BUILTIN_NAMES = ['Anthropic Sans', 'Anthropic Serif', 'Anthropic Mono']
  const itemName = (n) => n?.children?.[0]?.children?.[0]?.children?.[0]
  const familyRows = () => bundle.find(menu(), (n) => n.type === 'MenuItemButton' && n.children[0]?.type === 'span')
    .filter((n) => !BUILTIN_NAMES.includes(itemName(n)))
  const manualRow = () => bundle.find(menu(), (n) => n.type === 'MenuItemButton' && typeof n.children[0] === 'string' && n.children[0].startsWith('使用'))
  bundle.find(renderRows(bundle).content, (n) => n.type === 'button' && n.props['aria-label'] === '内容字体')[0].props.onClick()
  assert.equal(familyRows().length, 2, 'symbol faces never offered')
  assert.equal(input().props['aria-label'], '搜索字体或输入字体名称')
  input().props.onChange({ target: { value: 'yahei' } })
  assert.equal(familyRows().length, 1, 'case-insensitive substring filter')
  input().props.onKeyDown({ key: 'Enter', isComposing: true, preventDefault() {} })
  assert.equal(bundle.api.__internals.getState().uiFamily, '', 'composition Enter commits nothing')
  input().props.onKeyDown({ key: 'Enter', isComposing: false, preventDefault() {} })
  assert.equal(bundle.api.__internals.getState().uiFamily, 'yahei', 'a non-exact query commits as a manual name')
  bundle.api.__internals.setState({ uiFamily: '' })
  bundle.find(renderRows(bundle).content, (n) => n.type === 'button' && n.props['aria-label'] === '内容字体')[0].props.onClick()
  input().props.onChange({ target: { value: 'microsoft yahei' } })
  input().props.onKeyDown({ key: 'Enter', isComposing: false, preventDefault() {} })
  assert.equal(bundle.api.__internals.getState().uiFamily, 'Microsoft YaHei', 'an exact match commits the canonical family name')
  bundle.find(renderRows(bundle).content, (n) => n.type === 'button' && n.props['aria-label'] === '内容字体')[0].props.onClick()
  input().props.onChange({ target: { value: '雅黑' } })
  const manual = manualRow()
  assert.equal(manual.length, 1, 'a manual commit row appears for an unknown name')
  assert.ok(manual[0].children[0].includes('使用“雅黑”'))
  manual[0].props.onSelect()
  assert.equal(bundle.api.__internals.getState().uiFamily, '雅黑', 'manual names commit')
})

await test('search input preserves Home/End for text editing', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  bundle.find(renderRows(bundle).content, (n) => n.type === 'button' && n.props['aria-label'] === '内容字体')[0].props.onClick()
  const input = bundle.find(renderRows(bundle).content, (n) => n.type === 'Input')[0]
  for (const key of ['Home', 'End']) {
    let stopped = false
    input.props.onKeyDown({ key, stopPropagation() { stopped = true }, preventDefault() {} })
    assert.equal(stopped, true, `${key} does not bubble to the menu walk`)
  }
})

await test('an error catalogue still offers a manual name inside the menu', async () => {
  const bundle = loadClientBundle({ fetchImpl: () => Promise.reject(new Error('EPERM')) })
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  renderRows(bundle)
  bundle.flushEffects()
  await new Promise((r) => setTimeout(r, 0))
  bundle.find(renderRows(bundle).content, (n) => n.type === 'button' && n.props['aria-label'] === '内容字体')[0].props.onClick()
  const menu = () => bundle.find(renderRows(bundle).content, (n) => n.type === 'Menu')[0]
  const note = bundle.find(menu(), (n) => n.props?.className === 'dsf-note')
  assert.equal(note.length, 1, 'a notice shows inside the dropdown, not as a settings row')
  bundle.find(menu(), (n) => n.type === 'Input')[0].props.onChange({ target: { value: 'MyFont' } })
  const manual = bundle.find(menu(), (n) => n.type === 'MenuItemButton' && typeof n.children[0] === 'string' && n.children[0].startsWith('使用'))
  assert.equal(manual.length, 1, 'manual commit still offered on error')
})

await test('choosing a family writes only the family field', async () => {
  const fetchImpl = () => Promise.resolve({
    ok: true,
    json: async () => ({ supported: true, sources: [], families: [
      { family: 'OnlyLight', weights: [100, 200], symbol: false },
      { family: 'NoRegular', weights: [100, 900], symbol: false },
    ] }),
  })
  const bundle = loadClientBundle({ fetchImpl })
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  renderRows(bundle)
  bundle.flushEffects()
  await new Promise((r) => setTimeout(r, 0))
  const rowByName = (name) => bundle.find(
    bundle.find(renderRows(bundle).content, (n) => n.type === 'Menu')[0],
    (n) => n.type === 'MenuItemButton' && n.children[0]?.children?.[0]?.children?.[0] === name)
  const trigger = () => bundle.find(renderRows(bundle).content, (n) => n.type === 'button' && n.props['aria-label'] === '内容字体')[0]
  trigger().props.onClick()
  rowByName('OnlyLight')[0].props.onSelect()
  const state = bundle.api.__internals.getState()
  assert.equal(state.uiFamily, 'OnlyLight')
  assert.equal('uiWeight' in state, false, 'the removed weight axis is not part of the schema')
  assert.equal('codeWeight' in state, false)
  assert.deepEqual(Object.keys(state).sort(), ['codeFamily', 'lineHeightPct', 'terminalFamily', 'trackingEm', 'uiFamily'])
  bundle.api.__internals.setState({ uiFamily: 'MyCode', lineHeightPct: 100, trackingEm: 0 })
})

await test('the family menu is the only catalogue subscriber a row has', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  let subs = 0
  const cat = bundle.api.__internals.catalogue
  const orig = cat.subscribe
  cat.subscribe = (l) => { subs++; return orig(l) }
  renderRows(bundle)
  cat.subscribe = orig
  assert.equal(subs, 2, 'one family menu per rendered row subscribes')
})

await test('footer default resets the slot; footer refresh re-reads without closing', async () => {
  const calls = []
  const fetchImpl = (url) => { calls.push(url); return Promise.resolve({ ok: true, json: async () => ({ supported: true, sources: [], families: [] }) }) }
  const bundle = loadClientBundle({ fetchImpl })
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  bundle.api.__internals.setState({ uiFamily: 'Arial' })
  renderRows(bundle).content
  const menu = bundle.find(renderRows(bundle).content, (n) => n.type === 'Menu')[0]
  menu.props.onSelect('default')
  assert.equal(bundle.api.__internals.getState().uiFamily, '')
  bundle.find(renderRows(bundle).content, (n) => n.type === 'button' && n.props['aria-label'] === '内容字体')[0].props.onClick()
  const openMenu = bundle.find(renderRows(bundle).content, (n) => n.type === 'Menu')[0]
  openMenu.props.onSelect('refresh')
  assert.ok(calls.some((u) => String(u).includes('refresh=1')), 'refresh hit the catalogue')
  assert.equal(openMenu.props.open, true, 'the menu stays open after refresh')
})

await test('the catalogue request carries the marker the host route requires', async () => {
  // The host answers 403 without it (lib/font-route.js), BEFORE it considers
  // `?refresh=1`. The value is pinned literally: it is a wire contract, not an
  // implementation detail of the same module.
  const calls = []
  const fetchImpl = (url, options) => {
    calls.push({ url, options })
    return Promise.resolve({ ok: true, json: async () => ({ supported: true, sources: [], families: [] }) })
  }
  const bundle = loadClientBundle({ fetchImpl })
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  await bundle.api.__internals.catalogue.fetchFonts(false)
  await bundle.api.__internals.catalogue.fetchFonts(true)
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.deepEqual(call.options.headers, { 'x-dsh-system-fonts': '1' }, 'the marker rides every read')
    assert.equal(call.options.credentials, 'same-origin')
  }
  assert.match(String(calls[1].url), /\?refresh=1$/)
})

section('client/client.js — lifecycle')

await test('dispose removes both stylesheets, both rows and all timers', () => {
  const bundle = loadClientBundle()
  const slots = makeSlots()
  const ctx = makeCtx({ services: { slots }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  assert.equal(slots.registrations.length, 5)
  assert.ok(bundle.timers.size > 0 || bundle.rafs.length > 0, 'a rebuild was scheduled')
  ctx.dispose()
  assert.equal(bundle.document.getElementById('dsh-system-fonts-style'), null, 'font stylesheet removed')
  assert.equal(bundle.document.getElementById('dsh-system-fonts/panel'), null, 'panel stylesheet removed')
  assert.equal(bundle.timers.size, 0, 'pending timeouts cancelled')
  assert.equal(slots.registrations.length, 0, 'all row registrations removed')
})

await test('dispose -> activate on the same module is clean, no duplicates', () => {
  const bundle = loadClientBundle()
  const slots1 = makeSlots()
  const ctx1 = makeCtx({ services: { slots: slots1 }, inject: bundle.api.inject })
  bundle.api.apply(ctx1.proxy)
  ctx1.dispose()
  const slots2 = makeSlots()
  const ctx2 = makeCtx({ services: { slots: slots2 }, inject: bundle.api.inject })
  assert.doesNotThrow(() => bundle.api.apply(ctx2.proxy), 're-activation runs')
  const styles = bundle.document.head.children.filter((el) => el.id === 'dsh-system-fonts-style')
  const panels = bundle.document.head.children.filter((el) => el.id === 'dsh-system-fonts/panel')
  assert.equal(styles.length, 1, 'exactly one font stylesheet')
  assert.equal(panels.length, 1, 'exactly one panel stylesheet')
  assert.equal(slots2.registrations.length, 5, 'all rows re-registered on the new ctx')
})

await test('double activation is a no-op', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  bundle.api.apply(ctx.proxy)
  const styles = bundle.document.head.children.filter((el) => el.id === 'dsh-system-fonts-style')
  assert.equal(styles.length, 1)
})

await test('a fetch pending at disposal resets to idle and its late response is dropped', async () => {
  let resolveFetch
  const fetchImpl = () => new Promise((resolve) => { resolveFetch = resolve })
  const bundle = loadClientBundle({ fetchImpl })
  const catalogue = bundle.api.__internals.catalogue
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const pending = catalogue.fetchFonts(false)
  assert.equal(catalogue.list.status, 'loading')
  ctx.dispose()
  assert.equal(catalogue.list.status, 'idle', 'a pending read does not survive unload')
  resolveFetch({ ok: true, json: async () => ({ families: [{ family: 'Arial' }], sources: [], supported: true }) })
  await pending
  assert.equal(catalogue.list.status, 'idle', 'the late response did not update a dead view')
  const ctx2 = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx2.proxy)
  const r2 = catalogue.fetchFonts(false)
  assert.equal(catalogue.list.status, 'loading')
  resolveFetch({ ok: true, json: async () => ({ families: [{ family: 'Arial' }], sources: [], supported: true }) })
  await r2
  assert.equal(catalogue.list.status, 'ready')
  assert.equal(catalogue.list.families[0].family, 'Arial')
})

await test('overlapping fetches resolve in order of issue, not arrival', async () => {
  const resolvers = []
  const fetchImpl = () => new Promise((resolve) => resolvers.push(resolve))
  const bundle = loadClientBundle({ fetchImpl })
  const catalogue = bundle.api.__internals.catalogue
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const first = catalogue.fetchFonts(false)
  const second = catalogue.fetchFonts(true)
  const body = (name) => ({ ok: true, json: async () => ({ families: [{ family: name }], sources: [], supported: true }) })
  resolvers[1](body('Newer'))
  await second
  assert.equal(catalogue.list.families[0].family, 'Newer')
  resolvers[0](body('Older'))
  await first
  assert.equal(catalogue.list.families[0].family, 'Newer', 'the earlier request cannot overwrite the newer catalogue')
})

await test('a state change after disposal persists but installs no tag', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  ctx.dispose()
  bundle.api.__internals.setState({ lineHeightPct: 80, uiFamily: 'Arial' })
  assert.equal(bundle.api.__internals.getState().lineHeightPct, 80, 'state persisted')
  assert.equal(bundle.document.getElementById('dsh-system-fonts-style'), null, 'no stylesheet recreated')
  bundle.fireRafs()
  bundle.fireTimers()
  assert.equal(bundle.document.getElementById('dsh-system-fonts-style'), null, 'stale deferred passes stayed dead')
  const ctx2 = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx2.proxy)
  const tag = bundle.document.getElementById('dsh-system-fonts-style')
  assert.ok(tag !== null, 'reactivation reinstalls the stylesheet')
  assert.match(tag.textContent,
    /--dsw-font-markdown-base-line-height: calc\(calc\(24px \+ var\(--dsh-content-font-delta\)\) \* 0\.8\) !important;/,
    'rebuilt from the saved state')
})

await test('a thrown slots.inject rolls activation back with nothing left behind', () => {
  const bundle = loadClientBundle()
  const slots = makeSlots()
  slots.inject = () => { throw new Error('slots blew up') }
  const ctx = makeCtx({ services: { slots }, inject: bundle.api.inject })
  assert.throws(() => bundle.api.apply(ctx.proxy), /slots blew up/, 'the original error propagates')
  ctx.dispose()
  assert.equal(bundle.document.head.children.length, 0, 'no orphan tags after rollback')
  const ctx2 = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  assert.doesNotThrow(() => bundle.api.apply(ctx2.proxy), 'the same module activates on a fresh ctx')
  assert.ok(bundle.document.getElementById('dsh-system-fonts-style') !== null)
})

await test('a DOM failure inside a later effect rolls the whole activation back', () => {
  const bundle = loadClientBundle()
  // Row spacing forces the stylesheet builder to read the host's live tokens,
  // so the throwing getComputedStyle is actually reached during apply.
  bundle.api.__internals.setState({ lineHeightPct: 80 })
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.window.getComputedStyle = () => { throw new Error('computed style unavailable') }
  assert.throws(() => bundle.api.apply(ctx.proxy), /computed style unavailable/)
  assert.equal(bundle.document.head.children.length, 0, 'partially installed tags were rolled back')
  assert.equal(bundle.timers.size, 0, 'no scheduled work survived')
  const ctx2 = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.window.getComputedStyle = () => ({ getPropertyValue: (n) => computedTokens(bundle.document, bundle.hostTokens)[n] ?? '' })
  assert.doesNotThrow(() => bundle.api.apply(ctx2.proxy), 'reactivation after rollback works')
  assert.ok(bundle.document.getElementById('dsh-system-fonts-style') !== null)
})

section('client/client.js — shadow typography (the Windows caption menubar)')

const { buildShadowCss, chrome } = api.__internals

await test('the caption menubar follows the host font-size axis', () => {
  const css = buildShadowCss({ uiFamily: '' }, true)
  assert.match(css, /font-size: var\(--dsh-content-font-size, 14px\) !important;/)
  assert.ok(!/:host/.test(css), 'nothing to declare at the defaults')
})

await test('a shadow root gets the chosen family and never a weight', () => {
  const css = buildShadowCss({ uiFamily: 'Arial' }, false)
  assert.match(css, /:host \{ font-family: "Arial", -apple-system/)
  assert.ok(!/font-weight/.test(css), 'weights belong to the theme, inside a shadow root too')
  assert.ok(!/font-size/.test(css), 'no size rule outside the titlebar')
})

await test('the shadow stylesheet is installed and removed with the plugin', () => {
  const bundle = loadClientBundle()
  const root = {
    children: [],
    appendChild(child) {
      this.children.push(child); child.parentNode = this; child.isConnected = true; return child
    },
    removeChild(child) {
      const i = this.children.indexOf(child)
      if (i >= 0) this.children.splice(i, 1)
      child.parentNode = null; child.isConnected = false
    },
    querySelector() { return null },
  }
  const host = bundle.document.createElement('div')
  host.dataset.windowsMenu = ''
  host.shadowRoot = root
  const inner = bundle.api.__internals.chrome
  inner.activate()
  inner.paint(host)
  assert.equal(root.children.length, 1, 'one stylesheet per shadow root')
  assert.match(root.children[0].textContent, /font-size: var\(--dsh-content-font-size, 14px\) !important;/)
  assert.ok(!/font-weight/.test(root.children[0].textContent), 'no weight rule, even for the titlebar')
  inner.paint(host)
  assert.equal(root.children.length, 1, 'repainting replaces rather than stacks')
  bundle.api.__internals.setState({ uiFamily: 'Arial' })
  inner.apply()
  assert.match(root.children[0].textContent, /:host \{ font-family: "Arial", -apple-system/, 'the shadow root follows the family row')
  inner.teardown()
  assert.equal(root.children.length, 0, 'teardown removes the injected stylesheet')
})

await test('a shadow host that left the document is dropped, not repainted forever', () => {
  // The app mints one shadow root per tooltip/popover. Keeping every entry in
  // the plugin's installed map would grow it for the whole session and repaint
  // detached trees on every sweep — a leak the user never sees directly.
  const bundle = loadClientBundle()
  const inner = bundle.api.__internals.chrome
  const root = {
    children: [],
    appendChild(child) { this.children.push(child); child.parentNode = this; child.isConnected = true; return child },
    removeChild(child) {
      const i = this.children.indexOf(child)
      if (i >= 0) this.children.splice(i, 1)
      child.parentNode = null; child.isConnected = false
    },
  }
  const host = bundle.document.createElement('div')
  host.shadowRoot = root
  host.isConnected = true
  inner.activate()
  inner.paint(host)
  assert.equal(root.children.length, 1, 'the live host gets its stylesheet')

  host.isConnected = false // React removed the popover
  inner.apply()
  assert.equal(root.children.length, 0, 'the detached host’s stylesheet is removed with it')
  inner.apply()
  assert.equal(root.children.length, 0, 'and it is never re-created by a later sweep')
  assert.equal(inner.hostCount, 0, 'the installed map does not keep the dead shadow root')
  inner.teardown()
})

await test('a fired sweep timer leaves the teardown list', () => {
  // `timers` is the teardown list cleared on unload. Before the fix every fired
  // id stayed in it, so a long session accumulated dead entries for the whole
  // lifetime of the plugin.
  const bundle = loadClientBundle()
  const inner = bundle.api.__internals.chrome
  inner.activate()
  assert.ok(inner.timerCount >= 1, 'activation schedules its deferred sweep')
  bundle.fireTimers()
  assert.equal(inner.timerCount, 0, 'firing a timer removes its id')
  inner.teardown()
})

await test('the backstop sweep is rate limited by time, not by queue depth', () => {
  // THE REGRESSION THIS PINS. The mutation callback used to arm the backstop
  // sweep whenever fewer than four were in flight (`sweeps.length < 4`), which
  // reads like a throttle but is a QUEUE DEPTH: each timer pops itself when it
  // fires, so the queue drains at the timer's own rate and refills on the very
  // next mutation. During a stream — mutations on every frame — the backstop
  // kept firing at the timer rate indefinitely. The repo's performance review
  // measured a 5.2 s stream on the real page: 42 full sweeps (8.1/s) with the
  // queue-depth shape, 12 with a cap of one, 2 with no backstop at all. One sweep
  // is a document-wide `querySelectorAll('*')` plus a `paint()` per shadow root:
  // 40 µs at 537 elements, 880 µs at 12,717.
  //
  // The fix replaced the queue with a timestamp. This test pins the SHAPE of the
  // fix in the source, because the sandbox cannot drive the real observer: the
  // bundle reads the bare global `MutationObserver`, so `activate()` installs
  // Node's own observer rather than a fake one. A source assertion is weaker than
  // a behavioural one, and it is the honest option available — it catches exactly
  // the regression that matters (someone reintroducing a depth check).
  // Strip comments first: the fix's own explanatory comment QUOTES the old
  // `sweeps.length < 4` line ("this used to read…"), which a naive source scan
  // matches and reports as the bug it documents. Code only.
  const raw = readFileSync(join(root, 'client', 'src', 'chrome.js'), 'utf8')
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(function (line) { return line.replace(/\/\/.*$/, '') })
    .join('\n')
  // Only a COMPARISON is the bug; `sweeps.length = 0` in teardown clears the
  // bookkeeping and is fine. `<=`/`<` against a number is the depth check.
  assert.ok(!/sweeps\.length\s*[<>]=?\s*\d/.test(source),
    'no queue-depth comparison: `sweeps.length < N` is a depth check, not a rate limit')
  assert.ok(!/sweeps\.push/.test(source),
    'the sweeps queue is gone; the backstop is a timestamp now')
  assert.match(source, /BACKSTOP_MS/,
    'the interval is a named constant, so the next reader sees what it throttles')
  assert.match(source,
    /Date\.now\(\)\s*-\s*lastBackstopAt\s*>=\s*BACKSTOP_MS/,
    'the rate limit is a timestamp comparison against BACKSTOP_MS')
  assert.match(source, /backstopArmed/,
    'at most one backstop is in flight, so a burst cannot queue a second')
  // And the timer count still tells the truth about what is scheduled.
  const bundle = loadClientBundle()
  const inner = bundle.api.__internals.chrome
  inner.activate()
  assert.ok(inner.timerCount >= 1, 'activation schedules its initial sweep')
  inner.teardown()
  assert.equal(inner.timerCount, 0, 'teardown clears every scheduled sweep')
})

// ------------------------------------------- the merge into the host region

section('client/client.js — the rows merge into the host font region')

/**
 * The host's General-settings DOM, reduced to what the merger looks at:
 *
 *   div[data-slot="settings.general.item"]        <- the stable slot outlet
 *     ├── div                                     <- the appearance row
 *     ├── div                                     <- FontSettingsGroup
 *     │     ├── div                               <- FontSizeRow(text): expander + px
 *     │     └── div#font-region                   <- mounted ONLY while expanded
 *     │           ├── div  FontFamilyRow(text)    <- official input, must be covered
 *     │           ├── div  FontFamilyRow(code)
 *     │           ├── div  FontSizeRow(code)      <- stepper + px, stays visible
 *     │           ├── div  FontFamilyRow(terminal)
 *     │           └── div  FontSizeRow(terminal)
 *     └── div                                     <- the developer-tools row
 *
 * Every marker here is one the host publishes on purpose: the `data-slot`
 * outlet (renderer.js:1124) and the ARIA/`px`/`maxlength` shape of the font
 * rows (`FontFamilyRow`/`FontSizeRow` in ui-theme's client). No salted class.
 */
const FAMILY_TITLES = ['正文字体', '代码字体', '终端字体']

function makeTestText(bundle, tag, text) {
  const el = bundle.document.createElement(tag)
  el.textContent = text
  return el
}

function makeTestFamilyRow(bundle, ariaLabel, placeholder) {
  const row = bundle.document.createElement('div')
  row.appendChild(makeTestText(bundle, 'div', ariaLabel))
  // The primitive Input renders a wrapper element around the real <input>, so
  // the row root is never the input's direct parent — the merger has to climb.
  const field = bundle.document.createElement('div')
  const input = bundle.document.createElement('input')
  input.setAttribute('maxlength', '200')
  input.setAttribute('placeholder', placeholder)
  input.setAttribute('aria-label', ariaLabel)
  field.appendChild(input)
  row.appendChild(field)
  return row
}

function makeTestSizeRow(bundle, title) {
  const row = bundle.document.createElement('div')
  row.appendChild(makeTestText(bundle, 'div', title))
  const control = bundle.document.createElement('div')
  control.appendChild(makeTestText(bundle, 'span', '14'))
  control.appendChild(makeTestText(bundle, 'span', 'px'))
  row.appendChild(control)
  return row
}

/**
 * `mountRegion()` / `removeRegion()` mimic React's conditional render of the
 * disclosure region: the whole subtree joins and leaves the document, and
 * anything we left inside it travels with the removed node (the orphan hazard).
 */
function makeHostSettingsDom(bundle, { collapsed = true, withGroup = true, stray = false } = {}) {
  const outlet = bundle.document.createElement('div')
  outlet.setAttribute('data-slot', 'settings.general.item')
  outlet.appendChild(bundle.document.createElement('div')) // the appearance row

  let group = null
  let control = null
  const expander = bundle.document.createElement('button')
  let region = null
  if (withGroup) {
    group = bundle.document.createElement('div')
    control = makeTestSizeRow(bundle, '字号大小')
    expander.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    expander.setAttribute('aria-controls', 'font-region')
    control.appendChild(expander)
    group.appendChild(control)
    outlet.appendChild(group)
    if (stray) {
      // A group child that carries neither family inputs nor the size row:
      // the shape the merger must refuse to guess about.
      group.appendChild(makeTestText(bundle, 'div', 'something else'))
    } else if (!collapsed) {
      region = makeRegion()
      group.appendChild(region)
    }
  }
  outlet.appendChild(bundle.document.createElement('div')) // developer-tools row

  function makeRegion(order) {
    const el = bundle.document.createElement('div')
    el.id = 'font-region'
    const entries = order || [
      'family:正文字体', 'family:代码字体', 'size:代码字号',
      'family:终端字体', 'size:终端字号',
    ]
    for (const entry of entries) {
      const parts = entry.split(':')
      el.appendChild(parts[0] === 'family'
        ? makeTestFamilyRow(bundle, parts[1], '默认')
        : makeTestSizeRow(bundle, parts[1]))
    }
    return el
  }

  return {
    outlet,
    group,
    control,
    expander,
    get region() { return region },
    /** The expander click: React mounts a fresh region. */
    mountRegion(order) {
      region = makeRegion(order)
      expander.setAttribute('aria-expanded', 'true')
      if (group) group.appendChild(region)
      return region
    },
    /** The expander click again: React removes the region (and its subtree). */
    removeRegion() {
      const gone = region
      expander.setAttribute('aria-expanded', 'false')
      if (gone && gone.parentNode === group) group.removeChild(gone)
      region = null
      return gone
    },
  }
}

/** Mount the plugin's five rows as the outlet's children, in slot order. */
function mountTestRows(bundle, outlet) {
  const merger = bundle.api.__internals.merger
  const slots = bundle.api.__internals.panel.slots
  const mounted = []
  for (const slot of slots) {
    const el = bundle.document.createElement('div')
    el.setAttribute('data-dsf-row', slot.id)
    outlet.appendChild(el)
    merger.note(slot.id, el, slot.order, slot.role || null)
    mounted.push(el)
  }
  return mounted
}

/** Count insertBefore writes so idempotency is observable, not inferred. */
function trackInsertions(elements) {
  const state = { count: 0, stop() {} }
  const undo = []
  for (const el of elements) {
    const raw = el.insertBefore
    el.insertBefore = function (child, ref) { state.count += 1; return raw.call(el, child, ref) }
    undo.push(function () { el.insertBefore = raw })
  }
  state.stop = function () { for (const fn of undo) fn() }
  return state
}

const isOurs = (el) => el.getAttribute('data-dsf-row') !== null
const officialFamilyRows = (region) => region.children.filter(
  (child) => !isOurs(child) && child.children.some((c) => c.children.some((i) => i.tagName === 'INPUT')))

/**
 * A MutationObserver stand-in: records the callback the merger installs and
 * lets a test deliver "the host changed" the way the browser would. It also
 * records WHAT it was told to observe — a callback the merger fires by hand
 * would pass even if `observe()` had been given the wrong node or options.
 */
function installFakeObserver(bundle) {
  const instances = []
  function FakeObserver(callback) {
    this.callback = callback
    this.disconnected = false
    this.target = null
    this.options = null
    instances.push(this)
  }
  FakeObserver.prototype.observe = function (target, options) {
    this.target = target
    this.options = options
  }
  FakeObserver.prototype.disconnect = function () { this.disconnected = true }
  bundle.window.MutationObserver = FakeObserver
  return {
    instances,
    fire() { for (const obs of instances) if (!obs.disconnected) obs.callback([], obs) },
    stop() { delete bundle.window.MutationObserver },
  }
}

await test('the observer pass follows expand and collapse by itself', () => {
  const bundle = loadClientBundle()
  const observer = installFakeObserver(bundle)
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger
  assert.equal(observer.instances.length, 1, 'one observer on the settings list')
  assert.equal(observer.instances[0].target, dom.outlet,
    'it observes the data-slot outlet, not the document: a body-wide observer would wake on every streamed token')
  assert.deepEqual(observer.instances[0].options, { childList: true, subtree: true },
    'childList+subtree is what catches React mounting/removing the region')
  assert.equal(merger.isCollapsed(), true, 'the mount pass already hid the rows')

  const region = dom.mountRegion()
  observer.fire() // React's childList record for the region
  assert.equal(merger.isMerged(), true, 'the observer seated the rows in the new region')
  assert.equal(region.children.filter(isOurs).length, 5)

  dom.removeRegion()
  observer.fire()
  assert.equal(merger.isCollapsed(), true, 'and re-homed them when the region went away')
  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet)
    assert.equal(row.style.display, 'none')
  }
  observer.stop()
})

await test('collapsed: the rows live in the slot outlet, hidden — no standalone entries', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger

  assert.equal(merger.attempt(), true, 'the group was resolved')
  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet, 'the row is home, not inside a removed region')
    assert.equal(row.style.display, 'none', 'no standalone settings entry is shown')
    assert.equal(row.getAttribute('data-dsf-collapsed'), '', 'marked as collapsed-hidden')
  }
  assert.equal(merger.isCollapsed(), true)
  assert.equal(merger.isMerged(), false)
  assert.equal(merger.region(), null, 'a collapsed group has no region')
  assert.equal(merger.coveredCount, 0, 'there is no official row to cover yet')
})

await test('collapsed: a second pass writes nothing', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger
  merger.attempt()
  const writes = trackInsertions([dom.outlet, dom.group])
  assert.equal(merger.attempt(), true)
  assert.equal(merger.attempt(), true)
  writes.stop()
  assert.equal(writes.count, 0, 'hidden rows are not re-seated')
})

await test('expanded: each picker sits inside the region, right after its official row', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet) // mounts collapsed → hidden
  const region = dom.mountRegion() // the expander click
  const merger = bundle.api.__internals.merger
  const official = region.children.slice()

  assert.equal(merger.attempt(), true)
  assert.equal(merger.isMerged(), true, 'all rows are inside the live region')
  assert.deepEqual(region.children, [
    official[0], rows[0], // 正文字体 → content picker
    official[1], rows[1], // 代码字体 → code picker
    official[2],          // 代码字号 stays usable
    official[3], rows[2], // 终端字体 → terminal picker
    official[4],          // 终端字号 stays usable
    rows[3], rows[4],     // 行距 / 字距 last
  ])
  for (const row of rows) {
    assert.equal(row.parentNode, region)
    assert.notEqual(row.style.display, 'none', 'the pickers become visible with the region')
    assert.equal(row.getAttribute('data-dsf-collapsed'), null)
  }
  for (const familyRow of officialFamilyRows(region)) {
    assert.equal(familyRow.style.display, 'none', 'the redundant official input is hidden')
    assert.equal(familyRow.getAttribute('data-dsf-covered'), '', 'marked so restore() unhides exactly these')
  }
  assert.equal(merger.coveredCount, 3, 'text / code / terminal family rows covered')
  for (const sizeRow of [official[2], official[4]]) {
    assert.notEqual(sizeRow.style.display, 'none', 'the code / terminal size steppers stay usable')
    assert.equal(sizeRow.getAttribute('data-dsf-covered'), null)
  }
})

await test('a correct expanded pass writes nothing', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  mountTestRows(bundle, dom.outlet)
  const region = dom.mountRegion()
  const merger = bundle.api.__internals.merger
  merger.attempt()
  const writes = trackInsertions([dom.outlet, dom.group, region])
  assert.equal(merger.attempt(), true)
  assert.equal(merger.attempt(), true)
  writes.stop()
  assert.equal(writes.count, 0, 'no insertBefore on rows already in place')
})

await test('an official row whose inline style got reset is hidden again, not skipped by the mark', () => {
  // `data-dsf-covered` is our own attribute and React does not manage it, while
  // `style.display` lives in DOM state a re-render can rewrite. If the two
  // disagree, skipping on the mark alone leaves the official input visible
  // right next to our picker while the pass still reports success.
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle, { collapsed: false })
  mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger
  assert.equal(merger.attempt(), true)
  const official = dom.region.children.find(
    (el) => !isOurs(el) && el.getAttribute('data-dsf-covered') !== null)
  assert.ok(official, 'a family row was covered')
  assert.equal(official.style.display, 'none')

  official.style.display = '' // React re-renders the row and resets the inline style
  assert.equal(merger.attempt(), true)
  assert.equal(official.style.display, 'none', 'the next pass re-asserts the hidden state')
  assert.equal(merger.coveredCount, 3, 'and the record is not duplicated')

  merger.restore()
  assert.equal(official.style.display, '', 'restore unhides it exactly once')
  assert.equal(official.getAttribute('data-dsf-covered'), null)
})

await test('collapse: the rows leave the removed region and hide home — no orphans', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet)
  dom.mountRegion()
  const merger = bundle.api.__internals.merger
  merger.attempt()

  const gone = dom.removeRegion() // React drops the region subtree
  // The hazard is real before the observer pass: the rows travel with it.
  assert.ok(rows.some((row) => row.parentNode === gone), 'rows are inside the detached node for an instant')
  assert.equal(merger.attempt(), true) // the MutationObserver flush

  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet, 'the row is back in the outlet React manages')
    assert.equal(row.style.display, 'none')
    assert.equal(row.getAttribute('data-dsf-collapsed'), '')
    let node = row
    while (node) {
      assert.notEqual(node, gone, 'no row stays a descendant of the removed region')
      node = node.parentNode
    }
  }
  assert.equal(merger.isCollapsed(), true)
  assert.equal(merger.coveredCount, 0, 'cover records of the removed region are dropped')
})

await test('expand → collapse → expand converges without leftovers', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger

  const first = dom.mountRegion()
  merger.attempt()
  assert.equal(merger.isMerged(), true)

  const gone = dom.removeRegion()
  assert.equal(merger.attempt(), true)
  assert.equal(merger.isCollapsed(), true)

  const second = dom.mountRegion()
  assert.equal(merger.attempt(), true)
  assert.equal(merger.isMerged(), true)
  assert.deepEqual(second.children.filter(isOurs), rows, 'the same nodes, seated in the new region')
  assert.equal(second.children.filter(isOurs).length, 5)
  assert.equal(gone.children.filter(isOurs).length, 0, 'nothing was left behind in the removed region')
  assert.equal(merger.coveredCount, 3, 'the new region official rows are covered')
})

await test('role mapping follows the official titles, not the document order', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet)
  // A region whose official rows are deliberately out of order.
  const region = dom.mountRegion(['family:终端字体', 'family:代码字体', 'family:正文字体'])
  const merger = bundle.api.__internals.merger
  merger.attempt()

  const official = region.children.filter((el) => !isOurs(el))
  const [termFam, codeFam, textFam] = official
  assert.equal(termFam.children[0].textContent, '终端字体')
  assert.equal(codeFam.children[0].textContent, '代码字体')
  assert.equal(textFam.children[0].textContent, '正文字体')
  assert.deepEqual(region.children, [
    termFam, rows[2],
    codeFam, rows[1],
    textFam, rows[0],
    rows[3], rows[4],
  ], 'each picker follows the row carrying its role title')
})

await test('unmounting a row from inside the region seats it home first', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet)
  const region = dom.mountRegion()
  const merger = bundle.api.__internals.merger
  merger.attempt()

  // PRECONDITION, and the reason the previous version of this test proved
  // nothing: it never asserted that the rows had actually been moved into the
  // region, so it passed even when no merge happened at all — and it kept
  // passing with `seat()` short-circuited to `return`, which is exactly the
  // guarantee it claims to test.
  assert.equal(merger.isMerged(), true, 'precondition: the pass merged the rows')
  assert.equal(region.children.filter(isOurs).length, 5, 'precondition: rows sit inside the region')
  assert.equal(rows[1].parentNode, region)

  // React detaches a ref before removing the node: it must already be back
  // under the outlet, or React's `removeChild(outlet, row)` throws
  // NotFoundError and takes the settings page down with it. The strict shim
  // above throws for real, so this is the crash, not a proxy for it.
  merger.note('dsh-system-fonts-code', null)
  assert.equal(rows[1].parentNode, dom.outlet, 'the unmounted row is home again')
  assert.doesNotThrow(function () { dom.outlet.removeChild(rows[1]) },
    "React's own removal must succeed after the ref detach")
  assert.equal(merger.rowCount, 4)
  assert.equal(rows[0].parentNode, region, 'the other rows stay seated')
  merger.restore()
})

/**
 * The same failure from the other end: a pass that CANNOT resolve the host
 * group must still seat every merged row home. Otherwise the rows travel into
 * the removed `FontSettingsGroup` subtree while React still believes they are
 * outlet children — the `removeChild` throw that once broke this settings page.
 *
 * Measured against a real browser DOM shape: with `degrade()` removed this
 * strands 5 of 5 rows and the subsequent `outlet.removeChild` throws.
 */
await test('a pass that cannot resolve the group strands no row inside it', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet)
  dom.mountRegion()
  const merger = bundle.api.__internals.merger
  merger.attempt()
  assert.equal(merger.isMerged(), true, 'precondition: merged')

  // The host group is replaced by a shape the merger must refuse to guess
  // about (no family inputs, no size row): findHostFontGroup returns null.
  const region = dom.region
  const group = region.parentNode
  while (group.children.length > 0) group.removeChild(group.children[0])
  group.appendChild(makeTestText(bundle, 'div', 'unrecognized group shape'))
  merger.attempt()

  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet,
      'every row is back under the outlet, not inside the group React is about to remove')
  }
  // The crash this prevents: React removing the rows it thinks it owns.
  assert.doesNotThrow(function () {
    for (const row of rows.slice()) dom.outlet.removeChild(row)
  }, "React's removeChild must not throw for any row")
  merger.restore()
})

await test('dispose restores the rows and the official inputs', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet)
  const region = dom.mountRegion()
  const merger = bundle.api.__internals.merger
  merger.attempt()
  assert.equal(merger.coveredCount, 3)
  const official = region.children.filter((el) => !isOurs(el))

  merger.restore()
  assert.equal(merger.rowCount, 5, 'restore keeps the mounted rows registered')
  assert.equal(merger.coveredCount, 0, 'nothing stays covered')
  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet, 'rows are back in the slot outlet')
    assert.notEqual(row.style.display, 'none', 'rows are visible again')
    assert.equal(row.getAttribute('data-dsf-collapsed'), null)
  }
  for (const familyRow of officialFamilyRows(region)) {
    assert.equal(familyRow.style.display, '', 'official family row visible again')
    assert.equal(familyRow.getAttribute('data-dsf-covered'), null, 'mark removed')
  }
  assert.deepEqual(region.children, official, 'the region holds only the host rows again')
  assert.equal(merger.isMerged(), false)
  assert.equal(merger.isCollapsed(), false)
})

await test('a pass queued before dispose cannot re-merge after restore', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  const rows = mountTestRows(bundle, dom.outlet) // schedules a frame with the first pass
  const merger = bundle.api.__internals.merger
  merger.restore() // dispose lands before that frame
  bundle.fireRafs() // the queued pass now runs
  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet, 'nothing moved after restore')
    assert.notEqual(row.style.display, 'none', 'and nothing was hidden')
  }
  assert.equal(merger.isMerged(), false)
})

await test('a fresh mount after restore re-arms the merger', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle)
  mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger
  merger.attempt()
  merger.restore()
  assert.equal(merger.isCollapsed(), false)
  // Settings reopened: the rows mount again and note themselves once more.
  const again = mountTestRows(bundle, dom.outlet)
  assert.equal(merger.attempt(), true, 'the merger is armed again by a mount')
  assert.equal(merger.isCollapsed(), true, 'and hides them again while collapsed')
  for (const row of again) assert.equal(row.style.display, 'none')
})

await test('a settings remount while expanded re-seats the fresh rows in the fresh region', () => {
  const bundle = loadClientBundle()
  const merger = bundle.api.__internals.merger
  const panel = bundle.api.__internals.panel
  const first = makeHostSettingsDom(bundle, { collapsed: false })
  const firstRows = mountTestRows(bundle, first.outlet)
  assert.equal(merger.attempt(), true)
  assert.equal(merger.isMerged(), true)

  // The settings page closes (every row's ref cleanup) and reopens on brand
  // new DOM with brand new row nodes.
  for (const slot of panel.slots) merger.note(slot.id, null)
  assert.equal(merger.rowCount, 0)
  assert.equal(merger.coveredCount, 0, 'closing the page unhid the old official rows')
  assert.equal(first.region.children.filter(isOurs).length, 0, 'the old region holds only host rows')
  for (const row of firstRows) assert.equal(row.parentNode, first.outlet, 'old nodes were left home')

  const second = makeHostSettingsDom(bundle, { collapsed: false })
  const secondRows = mountTestRows(bundle, second.outlet)
  assert.equal(merger.attempt(), true)
  assert.equal(merger.isMerged(), true)
  assert.deepEqual(second.region.children.filter(isOurs), secondRows, 'the new nodes are the seated ones')
  for (const row of secondRows) assert.equal(row.parentNode, second.region)
  assert.equal(merger.coveredCount, 3, 'the new region\u2019s official rows are covered')
})

await test('no host group: the rows stay visible at their slot positions', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle, { withGroup: false })
  const rows = mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger
  const before = dom.outlet.children.slice()

  assert.equal(merger.attempt(), false, 'no group — the pass declines')
  assert.deepEqual(dom.outlet.children, before, 'the outlet order is untouched')
  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet)
    assert.notEqual(row.style.display, 'none', 'degradation never hides the plugin UI')
    assert.equal(row.getAttribute('data-dsf-collapsed'), null)
  }
  assert.equal(merger.coveredCount, 0, 'nothing was hidden')
  assert.equal(merger.isMerged(), false)
  assert.equal(merger.isCollapsed(), false)
})

await test('an unrecognized group shape hides nothing', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle, { stray: true })
  const rows = mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger

  assert.equal(merger.attempt(), false, 'a group child that is not a region — refuse to guess')
  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet)
    assert.notEqual(row.style.display, 'none')
    assert.equal(row.getAttribute('data-dsf-collapsed'), null)
  }
  assert.equal(merger.coveredCount, 0)
})

await test('without the data-slot outlet the merge does not even start', () => {
  const bundle = loadClientBundle()
  const plain = bundle.document.createElement('div')
  const merger = bundle.api.__internals.merger
  const row = bundle.document.createElement('div')
  plain.appendChild(row)
  merger.note('dsh-system-fonts-content', row, 12, 'text')
  assert.equal(merger.attempt(), false)
  assert.equal(row.parentNode, plain, 'left exactly where it was found')
  assert.notEqual(row.style.display, 'none')
})

await test('no expander: a nested region carrying the official input still seats the rows', () => {
  const bundle = loadClientBundle()
  const outlet = bundle.document.createElement('div')
  outlet.setAttribute('data-slot', 'settings.general.item')
  const group = bundle.document.createElement('div')
  const region = bundle.document.createElement('div')
  const familyRow = makeTestFamilyRow(bundle, '正文字体', '默认')
  region.appendChild(familyRow)
  group.appendChild(region)
  outlet.appendChild(group)
  const rows = mountTestRows(bundle, outlet)
  const merger = bundle.api.__internals.merger

  assert.equal(merger.attempt(), true, 'the official input is the fallback locator')
  assert.equal(rows[0].parentNode, region, 'rows still land inside the region')
  assert.equal(region.children[1], rows[0], 'the content picker follows the text family row')
  assert.equal(merger.coveredCount, 1)
  assert.equal(familyRow.style.display, 'none')
})

await test('every rendered row carries its mark and notes itself with its role', () => {
  const bundle = loadClientBundle()
  const merger = bundle.api.__internals.merger
  const panel = bundle.api.__internals.panel
  for (const slot of panel.slots) {
    const tree = bundle.render(slot.component)
    assert.equal(tree.props['data-dsf-row'], slot.id, `${slot.id} marks its root`)
    assert.equal(typeof tree.props.ref, 'function', 'the root exposes a ref for the merger')
    const el = bundle.document.createElement('div')
    tree.props.ref(el)
    assert.equal(el.getAttribute('data-dsf-row'), slot.id)
  }
  assert.equal(merger.rowCount, 5, 'all five rows registered on mount')
  for (const slot of panel.slots) bundle.render(slot.component).props.ref(null)
  assert.equal(merger.rowCount, 0, 'ref cleanup unregisters every row')
})

/**
 * The detach guarantee, where it had no test: a pass that cannot resolve the
 * host's group must still put every row back in the slot outlet. A row left
 * inside host-owned DOM that React removes travels into a detached subtree,
 * while React still believes it is the outlet's child — the next
 * `removeChild(outlet, row)` is the throw that once broke the settings page.
 */
await test('the host group disappearing while merged seats every row home', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle, { collapsed: false })
  const rows = mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger
  assert.equal(merger.attempt(), true)
  assert.equal(merger.isMerged(), true)

  const removed = dom.group
  dom.outlet.removeChild(removed) // React unmounts FontSettingsGroup; rows go with it
  assert.ok(rows.every((row) => {
    let node = row
    while (node) { if (node === removed) return true; node = node.parentNode }
    return false
  }), 'the rows travelled into the removed subtree — the hazard is real')

  assert.equal(merger.attempt(), false, 'the pass cannot resolve a region any more')
  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet, 'seated home, never left in the removed group')
    assert.notEqual(row.style.display, 'none', 'and visible, per the documented degradation')
    assert.equal(row.getAttribute('data-dsf-collapsed'), null)
  }

  // And the merger is not dead: when the host's group comes back (the theme
  // plugin reloaded), the same rows merge into the new region.
  const resurrected = makeHostSettingsDom(bundle, { collapsed: false })
  dom.outlet.appendChild(resurrected.group)
  assert.equal(merger.attempt(), true, 'the merger recovered with the host group')
  assert.equal(merger.isMerged(), true)
  merger.restore()
})

await test('a group replaced by an unrecognized shape leaves the rows home and hides nothing', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle, { collapsed: false })
  const rows = mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger
  merger.attempt()

  dom.outlet.removeChild(dom.group)
  const stranger = bundle.document.createElement('div')
  const strangerRow = makeTestText(bundle, 'div', 'another plugin’s row')
  stranger.appendChild(strangerRow)
  dom.outlet.insertBefore(stranger, dom.outlet.children[1])

  assert.equal(merger.attempt(), false)
  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet, 'rows are back in the outlet')
    assert.notEqual(row.style.display, 'none', 'and visible')
  }
  assert.notEqual(strangerRow.style.display, 'none', 'the stranger row is never hidden')
  merger.restore()
})

await test('a failed in-region move degrades to the slot positions instead of half-merging', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle) // starts collapsed: rows are home + hidden
  const rows = mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger
  assert.equal(merger.attempt(), true)
  assert.equal(merger.isCollapsed(), true)

  const region = dom.mountRegion()
  const real = region.insertBefore
  let moves = 0
  region.insertBefore = function (child, ref) {
    // A real DOM throws HierarchyRequestError when the reference node stopped
    // being a child mid-pass (a host re-render between two placements).
    if (isOurs(child) && ++moves === 3) throw new Error('HierarchyRequestError: simulated')
    return real.call(region, child, ref)
  }
  const warnings = []
  const originalWarn = console.warn
  console.warn = (message) => warnings.push(String(message))
  let merged = null
  try {
    merged = merger.attempt()
  } finally {
    console.warn = originalWarn
  }
  region.insertBefore = real
  assert.equal(merged, false, 'a failed move is reported, not merged halfway')
  assert.ok(warnings.length <= 1, 'the failure is reported at most once (warnOnce)')

  assert.equal(region.children.filter(isOurs).length, 0, 'nothing stays half-inside the host region')
  for (const row of rows) {
    assert.equal(row.parentNode, dom.outlet, 'every row is home')
    assert.notEqual(row.style.display, 'none', 'and visible: a failed merge must not hide the pickers')
  }
  assert.equal(merger.coveredCount, 0, 'and no official row was hidden')
  merger.restore()
})

await test('a new element for a merged slot seats the old one home first', () => {
  const bundle = loadClientBundle()
  const dom = makeHostSettingsDom(bundle, { collapsed: false })
  const rows = mountTestRows(bundle, dom.outlet)
  const merger = bundle.api.__internals.merger
  merger.attempt()
  assert.equal(rows[1].parentNode, dom.region, 'the code picker is merged')

  // HMR / a remount that keeps the plugin mounted: React hands the ref a NEW
  // node for the same slot and will remove the old one itself.
  const replacement = bundle.document.createElement('div')
  dom.outlet.appendChild(replacement)
  merger.note('dsh-system-fonts-code', replacement, 13, 'code')

  assert.equal(rows[1].parentNode, dom.outlet, 'the old node is where React will remove it from')
  assert.equal(replacement.parentNode, dom.region, 'the new node took its place in the region')
  merger.restore()
})

// ------------------------------------------------------------- the language

section('client/client.js — bilingual strings')

const ZH_JSON = JSON.parse(readFileSync(join(root, 'locale', 'zh.json'), 'utf8'))
const EN_JSON = JSON.parse(readFileSync(join(root, 'locale', 'en.json'), 'utf8'))

const EXPECTED_KEYS = [
  'row.text.title', 'row.text.desc',
  'row.code.title', 'row.code.desc',
  'row.terminal.title', 'row.terminal.desc',
  'row.lineHeight.title', 'row.lineHeight.desc',
  'row.tracking.title', 'row.tracking.desc',
  'note.loading', 'note.error', 'note.empty',
  'menu.default', 'menu.refresh', 'menu.use',
  'menu.builtin', 'menu.default.effective',
  'search.placeholder',
]

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** Every string a row can put on screen, including aria and placeholders. */
function visibleStrings(bundle, tree) {
  const out = []
  for (const node of (function* walkAll(root) {
    if (!root) return
    if (Array.isArray(root)) {
      for (const child of root) yield* walkAll(child)
      return
    }
    if (typeof root !== 'object') return
    yield root
    for (const child of root.children ?? []) yield* walkAll(child)
  })(tree)) {
    for (const child of node.children ?? []) if (typeof child === 'string') out.push(child)
    for (const prop of ['aria-label', 'placeholder', 'aria-valuetext', 'title']) {
      if (typeof node.props?.[prop] === 'string') out.push(node.props[prop])
    }
  }
  return out
}

function renderAllRows(bundle) {
  const panel = bundle.api.__internals.panel
  return panel.slots.map((slot) => bundle.render(slot.component))
}

/**
 * Every string the settings rows can show with their menus CLOSED, plus the
 * open family menu of the first row — that is where the search placeholder,
 * its aria-label and the two footer entries live.
 */
function renderAllStrings(bundle) {
  const closed = renderAllRows(bundle)
  const trigger = bundle.find(closed[0],
    (n) => n.type === 'button' && n.props.className === 'dsf-trigger dsf-family')[0]
  trigger.props.onClick()
  const open = renderAllRows(bundle)
  const strings = visibleStrings(bundle, open)
  // Leave the menu closed again for the next assertion in the same test.
  bundle.find(open[0], (n) => n.type === 'button' && n.props.className === 'dsf-trigger dsf-family')[0]
    .props.onClick()
  return strings
}

function makeLocalizedBundle(language) {
  const bundle = loadClientBundle()
  const locale = makeLocale()
  locale.setLanguage(language)
  const ctx = makeCtx({ services: { slots: makeSlots(), locale }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  return { bundle, ctx, locale }
}

await test('zh and en dictionaries define exactly the same key set, all of them used', () => {
  const zhKeys = Object.keys(ZH_JSON.strings).sort()
  const enKeys = Object.keys(EN_JSON.strings).sort()
  assert.deepEqual(zhKeys, enKeys, 'a key missing from one dictionary is a fallback bug')

  // SET EQUALITY against the keys the rows actually exercise — not a subset
  // check and not a literal count. A subset check wearing this test's name
  // would let a key sit in the dictionaries forever with nothing reading it;
  // comparing the two sets means adding a string without wiring it up (or
  // wiring one up without adding it) fails here immediately.
  // 与「行真正用到的键」做集合相等比较：既不是子集检查，也不是写死数字。
  const exercised = EXPECTED_KEYS.slice().sort()
  const unexercised = zhKeys.filter((key) => EXPECTED_KEYS.indexOf(key) < 0)
  const unknown = exercised.filter((key) => zhKeys.indexOf(key) < 0)
  assert.deepEqual({ unexercised: unexercised, unknown: unknown },
    { unexercised: [], unknown: [] },
    'dictionary vs EXPECTED_KEYS mismatch — in the dictionary but never exercised: ['
      + unexercised.join(', ') + ']; asserted but absent from the dictionary: ['
      + unknown.join(', ') + ']')

  // meta.* is the Plugin Manager copy and is not part of the row dictionary.
  assert.equal(typeof ZH_JSON.meta.title, 'string')
  assert.equal(typeof EN_JSON.meta.title, 'string')
  assert.notEqual(ZH_JSON.meta.title, EN_JSON.meta.title)
})

await test('zh mode renders pure Chinese, with no glued "中文 · English" pair', () => {
  const { bundle } = makeLocalizedBundle('zh')
  const strings = renderAllStrings(bundle)
  assert.ok(strings.length > 10, 'rows expose their copy')
  assert.ok(strings.includes('内容字体'), 'the text row title is Chinese')
  assert.ok(strings.includes('行距'), 'the line-height row title is Chinese')
  assert.ok(strings.includes('搜索字体或输入字体名称'), 'the search aria-label is Chinese')
  // Proper nouns stay Latin in a Chinese UI: the embedded faces are named
  // Anthropic Sans / Serif / Mono in every locale, so they are exempt from the
  // "no English words" rule while everything else stays fully translated.
  const BRAND_NAMES = new Set(['Anthropic Sans', 'Anthropic Serif', 'Anthropic Mono'])
  for (const value of strings) {
    assert.ok(!value.includes(' · '), `no bilingual glue in "${value}"`)
    if (BRAND_NAMES.has(value)) continue
    assert.ok(!/[A-Za-z]{3,}/.test(value), `no English phrase in a zh string: "${value}"`)
  }
})

await test('en mode renders pure English, aria labels and placeholders included', () => {
  const { bundle } = makeLocalizedBundle('en')
  const strings = renderAllStrings(bundle)
  assert.ok(strings.includes('Text font'), 'the text row title is English')
  assert.ok(strings.includes('Line height'), 'the line-height row title is English')
  assert.ok(strings.includes('Search fonts or type a family name'), 'the search aria-label is English')
  for (const value of strings) {
    assert.ok(!CJK.test(value), `no Chinese left in an en string: "${value}"`)
    assert.ok(!value.includes(' · '), `no bilingual glue in "${value}"`)
  }
})

await test('the dictionaries carry no weight keys and no row exposes a weight control', () => {
  for (const json of [ZH_JSON, EN_JSON]) {
    assert.deepEqual(Object.keys(json.strings).filter((key) => key.startsWith('weight.')), [],
      'the removed weight feature leaves no dictionary keys behind')
    assert.ok(!/weight control|weight picker|weight row|字重控制|字重档|字重选择/i.test(json.meta.description),
      'the plugin-inventory copy does not advertise a weight control any more')
  }
  for (const language of ['zh', 'en']) {
    const { bundle } = makeLocalizedBundle(language)
    const familyRows = renderAllRows(bundle).slice(0, 3) // content / code / terminal
    for (const tree of familyRows) {
      assert.equal(bundle.find(tree, (n) => n.type === 'button' && /dsf-weight/.test(String(n.props.className))).length, 0,
        'no weight trigger on any row')
      assert.equal(bundle.find(tree, (n) => n.type === 'Menu').length, 1, 'exactly one family menu per family row')
    }
  }
})

await test('the terminal row exposes a family picker and nothing else', () => {
  const { bundle } = makeLocalizedBundle('en')
  const terminal = bundle.render(bundle.api.__internals.panel.TerminalFontRow)
  const menus = bundle.find(terminal, (n) => n.type === 'Menu')
  assert.equal(menus.length, 1, 'one family menu')
  const triggers = bundle.find(terminal, (n) => n.type === 'button')
  assert.equal(triggers.length, 1)
  assert.equal(triggers[0].props['aria-label'], 'Terminal font')
  assert.ok(!bundle.find(terminal, (n) => n.type === 'input').length)
})

await test('switch language on a live locale service re-renders the rows translated', () => {
  const { bundle, locale } = makeLocalizedBundle('zh')
  const title = () => visibleStrings(bundle, [bundle.render(bundle.api.__internals.panel.ContentFontRow)]).includes('内容字体')
  assert.equal(title(), true)
  locale.setLanguage('en')
  const en = visibleStrings(bundle, [bundle.render(bundle.api.__internals.panel.ContentFontRow)])
  assert.ok(en.includes('Text font'), 'the same mounted rows follow the switch')
  assert.ok(!en.some((value) => CJK.test(value)))
  locale.setLanguage('zh')
  assert.equal(title(), true, 'and back again')
})

await test('a row rendered with an injected t prop prefers it over the handle', () => {
  const { bundle } = makeLocalizedBundle('zh')
  const props = { t: (key) => (key === 'row.text.title' ? 'INJECTED' : key) }
  const tree = bundle.render(bundle.api.__internals.panel.ContentFontRow, props)
  const titles = bundle.find(tree, (n) => n.props?.className === 'dsf-title')
  assert.equal(titles[0].children[0], 'INJECTED', 'the slot-provided translator wins (locale: on the registration)')
})

await test('the registrations carry the locale namespace and dictionaries ride the service', () => {
  const bundle = loadClientBundle()
  const locale = makeLocale()
  const slots = makeSlots()
  const ctx = makeCtx({ services: { slots, locale }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  assert.equal(slots.registrations.length, 5)
  assert.ok(slots.registrations.every((r) => r.spec.locale === 'dsh-system-fonts'),
    'every row registration declares the namespace the outlet injects t from')
  const table = locale.tables.get('dsh-system-fonts')
  assert.ok(table, 'the dictionaries were registered')
  assert.deepEqual(Object.keys(table.zh).sort(), Object.keys(ZH_JSON.strings).sort())
  assert.deepEqual(Object.keys(table.en).sort(), Object.keys(EN_JSON.strings).sort())
  ctx.dispose()
  assert.equal(locale.tables.size, 0, 'the dictionary registration is disposed with the plugin')
})

// ---------------------------------------- a stored choice must not be erased
//
// The user's report: "终端字体选择了之后，我再次打开它，好像又恢复默认了。" Pick a
// terminal family, reopen, and it is back to the default.
//
// Root cause: `reconcileFamilies` used to mirror the host snapshot over the
// plugin's store unconditionally. The host's three family fields are
// `volatile()`, so a restart (or a snapshot read that lands before the
// settings read) reports `""` for every role. `""` means "no preference
// recorded", NOT "forget the preference" — but blind mirroring treated it as
// an instruction and wiped all three roles. The loss is not terminal-specific:
// text and code were erased by the same line, and the tests below pin all
// three. The host's CSS is also terminal-blind (no rule consumes
// `--dsh-font-family-terminal`; the terminal pane reads the value in JS), which
// is why terminal was simply the role where the revert was noticed first.

const SEEDED_FAMILIES = JSON.stringify({
  uiFamily: 'Segoe UI',
  codeFamily: 'Consolas',
  terminalFamily: 'Cascadia Mono',
  lineHeightPct: 100,
  trackingEm: 0,
})

await test('a stored family survives activation when the host reports none, and is written back', () => {
  const bundle = loadClientBundle({ storageSeed: { 'dsh-system-fonts/settings': SEEDED_FAMILIES } })
  // A fresh host: every role is "". This is what a restart looks like, because
  // the host's family fields are volatile.
  const theme = makeTheme()
  const ctx = makeCtx({ services: { slots: makeSlots(), theme }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const state = bundle.api.__internals.getState()
  assert.equal(state.uiFamily, 'Segoe UI', 'the stored text family is not erased')
  assert.equal(state.codeFamily, 'Consolas', 'the stored code family is not erased')
  assert.equal(state.terminalFamily, 'Cascadia Mono', 'the stored terminal family is not erased')
  // Keeping the value locally is not enough: the terminal pane renders from the
  // host's snapshot, so the choice has to be pushed back through the pipeline.
  assert.deepEqual(theme.calls, [
    ['setFontFamily', 'text', '"Segoe UI"'],
    ['setFontFamily', 'code', '"Consolas"'],
    ['setFontFamily', 'terminal', '"Cascadia Mono"'],
  ], 'each stored family is re-asserted through the host pipeline, normalized')
})

await test('a host family still wins over the stored copy', () => {
  const bundle = loadClientBundle({ storageSeed: { 'dsh-system-fonts/settings': SEEDED_FAMILIES } })
  const theme = makeTheme({ families: { text: '"Microsoft YaHei"', code: '"Fira Code"', terminal: '"Courier New"' } })
  const ctx = makeCtx({ services: { slots: makeSlots(), theme }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const state = bundle.api.__internals.getState()
  assert.equal(state.uiFamily, 'Microsoft YaHei')
  assert.equal(state.codeFamily, 'Fira Code')
  assert.equal(state.terminalFamily, 'Courier New')
  assert.deepEqual(theme.calls, [], 'a host that has values is never overwritten by our copy')
})

await test('an empty host echo after a pick does not undo the pick', () => {
  const bundle = loadClientBundle()
  const theme = makeTheme()
  const ctx = makeCtx({ services: { slots: makeSlots(), theme }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const internals = bundle.api.__internals
  const tree = () => bundle.render(internals.panel.TerminalFontRow)
  bundle.find(tree(), (n) => n.type === 'button' && n.props.className === 'dsf-trigger dsf-family')[0]
    .props.onClick()
  bundle.find(tree(), (n) => n.type === 'Input')[0].props.onChange({ target: { value: 'Cascadia Mono' } })
  bundle.find(tree(), (n) => n.type === 'Input')[0]
    .props.onKeyDown({ key: 'Enter', isComposing: false, preventDefault() {} })
  assert.equal(internals.getState().terminalFamily, 'Cascadia Mono')
  // The host echoes an empty snapshot (volatile field lost on reload). Before
  // the fix this wiped the pick back to the default row value.
  ctx.emit('theme/change', { fontFamilies: { text: '', code: '', terminal: '' }, fontSizes: null, revision: 9 })
  assert.equal(internals.getState().terminalFamily, 'Cascadia Mono',
    'an empty host echo is not an instruction to forget the choice')
})

await test('an empty family and an empty host stay empty — no phantom re-assert', () => {
  const bundle = loadClientBundle()
  const theme = makeTheme()
  const ctx = makeCtx({ services: { slots: makeSlots(), theme }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const state = bundle.api.__internals.getState()
  assert.equal(state.terminalFamily, '', 'nothing is invented when neither side has a choice')
  assert.equal(state.uiFamily, '')
  assert.equal(state.codeFamily, '')
  assert.deepEqual(theme.calls, [], 'an empty host plus an empty store writes nothing')
})

// ------------------------------------------------- reading the host's CSSOM
//
// `buildCss` reads the host's DECLARED tokens (not computed ones — those would
// freeze the host's font-size axis) to scale each markdown step. A rebuild asks
// for 34 names: 17 markdown steps × (shorthand + line-height). Reading them one
// at a time walked every rule of every sheet per name, so a 58-sheet × 24-rule
// document cost 34 × 1,392 = 47,328 `getPropertyValue` calls and ~1.06 ms per
// rebuild — and the line-height slider commits on every `input` event, so a drag
// burned ~64 ms of CSSOM work per second. `collectDeclaredTokens` answers all 34
// from ONE pass.
//
// THE PRECEDENCE IS THE POINT. This plugin's standing invariant is that repeated
// rebuilds produce byte-identical CSS; that only holds if exactly the same
// declaration wins every time. So these tests pin the matching rules — inline
// first, last body/html/:root rule before the first ordinary one, our own sheet
// and disabled/unreadable sheets skipped — not just the speed.

function makeCssomStyle(decls, stats) {
  const names = Object.keys(decls)
  return {
    length: names.length,
    item(i) { return names[i] },
    getPropertyValue(name) {
      if (stats) stats.getPropertyValue += 1
      return decls[name] === undefined ? '' : decls[name]
    },
  }
}

/** Build `document.styleSheets` from a readable spec; returns the sheet array. */
function makeCssom(spec, stats) {
  return spec.map(function (sheetSpec) {
    const rules = (sheetSpec.rules || []).map(function (ruleSpec) {
      return {
        selectorText: ruleSpec.selector,
        style: makeCssomStyle(ruleSpec.decls || {}, stats),
      }
    })
    const sheet = {
      ownerNode: sheetSpec.ownerNode === undefined ? null : sheetSpec.ownerNode,
      disabled: sheetSpec.disabled === true,
      cssRules: rules,
    }
    if (sheetSpec.unreadable === true) {
      Object.defineProperty(sheet, 'cssRules', {
        get() { throw new Error('SecurityError: cannot read cross-origin cssRules') },
      })
    }
    return sheet
  })
}

/** Run `fn` with `document.styleSheets` set to `spec`, then restore it. */
function withCssom(bundle, spec, stats, fn) {
  const doc = bundle.document
  const had = Object.prototype.hasOwnProperty.call(doc, 'styleSheets')
  const before = doc.styleSheets
  doc.styleSheets = makeCssom(spec, stats)
  try { return fn(doc.styleSheets) } finally {
    if (had) doc.styleSheets = before
    else delete doc.styleSheets
  }
}

function readToken(bundle, name, skip) {
  return bundle.api.__internals.readDeclaredToken(name, skip)
}

await test('declared tokens: last body rule beats the first ordinary one', () => {
  const bundle = loadClientBundle()
  const spec = [
    { rules: [
      { selector: 'body', decls: { '--t': 'from-body-first' } },
      { selector: '.ordinary', decls: { '--t': 'from-loose-first' } },
    ] },
    { rules: [
      { selector: ':root, body', decls: { '--t': 'from-body-last' } },
      { selector: '.ordinary', decls: { '--t': 'from-loose-second' } },
    ] },
  ]
  withCssom(bundle, spec, null, () => {
    assert.equal(readToken(bundle, '--t'), 'from-body-last',
      'the LAST body/html/:root declaration wins, as it does in the cascade')
  })
})

await test('declared tokens: with no body rule, the FIRST ordinary one wins', () => {
  const bundle = loadClientBundle()
  const spec = [
    { rules: [{ selector: '.a', decls: { '--t': 'loose-first' } }] },
    { rules: [{ selector: '.b', decls: { '--t': 'loose-second' } }] },
  ]
  withCssom(bundle, spec, null, () => {
    assert.equal(readToken(bundle, '--t'), 'loose-first')
  })
})

await test('declared tokens: an inline body value wins over every rule', () => {
  const bundle = loadClientBundle()
  const spec = [{ rules: [{ selector: 'body', decls: { '--t': 'from-rule' } }] }]
  withCssom(bundle, spec, null, () => {
    const body = bundle.document.body
    const previous = body.style
    body.style = { getPropertyValue: (name) => (name === '--t' ? 'from-inline' : '') }
    try {
      assert.equal(readToken(bundle, '--t'), 'from-inline',
        'the theme writes tokens inline on body; that beats any sheet')
    } finally { body.style = previous }
  })
})

await test('declared tokens: our own sheet, disabled sheets and unreadable sheets are skipped', () => {
  const bundle = loadClientBundle()
  const own = { tagName: 'STYLE', id: 'dsh-system-fonts-style' }
  // Ours is LAST so the two answers below are distinguishable: if it were not
  // skipped it would override the host (last tight rule wins).
  const spec = [
    { disabled: true, rules: [{ selector: 'body', decls: { '--t': 'from-disabled' } }] },
    { unreadable: true },
    { rules: [{ selector: 'body', decls: { '--t': 'from-host' } }] },
    { ownerNode: own, rules: [{ selector: 'body', decls: { '--t': 'from-ours' } }] },
  ]
  withCssom(bundle, spec, null, () => {
    assert.equal(readToken(bundle, '--t', own), 'from-host',
      'rebuilding must never read the values it just wrote')
    assert.equal(readToken(bundle, '--t', null), 'from-ours',
      'without a skip argument that sheet is just another sheet')
  })
})

await test('one CSSOM pass per rebuild: 58 × 24 rules cost a handful of reads, not 47,328', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const stats = { getPropertyValue: 0 }
  // The reviewer's shape: 58 sheets × 24 rules, with the type scale declared on
  // a few body rules and one loose rule, everything else ordinary chrome.
  const spec = []
  for (let s = 0; s < 58; s += 1) {
    const rules = []
    for (let r = 0; r < 24; r += 1) {
      const decls = {}
      if (s === 0 && r === 0) decls['--dsw-font-markdown-base'] = 'italic 400 15px/24px ui-serif'
      if (s === 0 && r === 1) decls['--dsw-font-markdown-base-line-height'] = '24px'
      if (s === 2 && r === 7) decls['--dsw-font-markdown-code'] = 'normal 400 13px/20px ui-monospace'
      if (r % 3 === 0) decls.color = 'red'
      rules.push({ selector: (s === 0 && r < 2) ? 'body' : '.x' + r, decls })
    }
    spec.push({ rules })
  }
  withCssom(bundle, spec, stats, () => {
    bundle.api.__internals.setState({ lineHeightPct: 88 })
    stats.getPropertyValue = 0
    bundle.api.__internals.typography.apply()
    const calls = stats.getPropertyValue
    // 34 names × 1,392 rules = 47,328 before. One pass touches only the rules
    // that DECLARE one of those names, so the cost is a function of the
    // document's declarations, not of its size.
    assert.ok(calls < 50, 'a rebuild reads a handful of declarations, got ' + calls)
    assert.ok(calls > 0, 'the tokens are still read — this is not a no-op')
    const css = bundle.document.getElementById('dsh-system-fonts-style').textContent
    assert.ok(css.includes('--dsw-font-markdown-base-line-height:'),
      'the scaled line-height token is still emitted from the declared value')
    assert.ok(css.includes('--dsw-font-markdown-code:'),
      'a loose rule still supplies a step')
  })
})

await test('a rebuild against a live CSSOM is byte-identical across applies', () => {
  const bundle = loadClientBundle()
  const ctx = makeCtx({ services: { slots: makeSlots() }, inject: bundle.api.inject })
  bundle.api.apply(ctx.proxy)
  const spec = [{ rules: [
    { selector: 'body', decls: { '--dsw-font-markdown-base': 'normal 400 15px/24px ui-serif' } },
    { selector: '.x', decls: { '--dsw-font-markdown-code': 'normal 400 13px/20px ui-monospace' } },
  ] }]
  withCssom(bundle, spec, null, () => {
    const typography = bundle.api.__internals.typography
    const internals = bundle.api.__internals
    const tag = () => bundle.document.getElementById('dsh-system-fonts-style').textContent
    internals.setState({ lineHeightPct: 100 })
    typography.apply()
    const untouched = tag()
    internals.setState({ lineHeightPct: 80 })
    typography.apply()
    const first = tag()
    typography.apply()
    typography.apply()
    assert.equal(tag(), first, 'reading the CSSOM must not compound across rebuilds')
    assert.notEqual(first, untouched, 'the declared values really were scaled')
    assert.ok(first.includes('--dsw-font-markdown-base:'), 'the shorthand is rewritten')
    assert.ok(first.includes('--dsw-font-markdown-code:'), 'a loose rule supplies a step')
  })
})

// --------------------------------------------------------------------- report

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`)
if (failures.length > 0) {
  for (const f of failures) {
    process.stdout.write(`\n--- ${f.name} ---\n${f.error.stack}\n`)
  }
  process.exit(1)
}
