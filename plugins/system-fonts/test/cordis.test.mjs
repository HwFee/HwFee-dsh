/**
 * Activate the committed client bundle inside the real `@deepseek-ai/cordis`
 * extracted from the installed app.asar.
 *
 *   node test/cordis.test.mjs
 *   DSH_ASAR="C:\path\to\app.asar" node test/cordis.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, openSync, readSync, closeSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

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

const AUTO_ASAR = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness', 'resources', 'app.asar')
const ASAR = process.env.DSH_ASAR ?? AUTO_ASAR

const WANTED = [
  'node_modules/@deepseek-ai/cordis/package.json',
  'node_modules/@deepseek-ai/cordis/lib/index.js',
  'node_modules/@deepseek-ai/cosmokit/package.json',
  'node_modules/@deepseek-ai/cosmokit/lib/index.js',
]

function extractAsar(asarPath, destRoot) {
  const fd = openSync(asarPath, 'r')
  const extracted = []
  try {
    const head = Buffer.alloc(16)
    readSync(fd, head, 0, 16, 0)
    const headerSize = head.readUInt32LE(4)
    const jsonSize = head.readUInt32LE(12)
    const json = Buffer.alloc(jsonSize)
    readSync(fd, json, 0, jsonSize, 16)
    const header = JSON.parse(json.toString('utf8'))
    const dataOffset = 8 + headerSize
    const files = new Map()
    ;(function walk(node, prefix) {
      if (node.files) for (const [name, child] of Object.entries(node.files)) walk(child, prefix ? prefix + '/' + name : name)
      else if (node.size !== undefined) files.set(prefix, node)
    })(header, '')
    for (const wanted of WANTED) {
      const entry = files.get(wanted)
      if (!entry) throw new Error(`app.asar has no ${wanted}`)
      const dest = join(destRoot, wanted)
      mkdirSync(dirname(dest), { recursive: true })
      if (entry.unpacked) {
        writeFileSync(dest, readFileSync(asarPath + '.unpacked/' + wanted))
      } else {
        const buf = Buffer.alloc(entry.size)
        readSync(fd, buf, 0, entry.size, dataOffset + Number(entry.offset))
        writeFileSync(dest, buf)
      }
      extracted.push(wanted)
    }
  } finally {
    closeSync(fd)
  }
  return extracted
}

if (!existsSync(ASAR)) {
  if (process.env.DSH_ASAR) {
    process.stdout.write(`\nFAIL  DSH_ASAR is set but does not exist: ${ASAR}\n`)
    process.exit(1)
  }
  process.stdout.write(`\nskip  app.asar not found at ${ASAR} — real-Cordis suite skipped\n`)
  process.exit(0)
}

const vendorRoot = mkdtempSync(join(tmpdir(), 'dsh-system-fonts-cordis-'))
extractAsar(ASAR, vendorRoot)
const { Context } = await import(pathToFileURL(join(vendorRoot, 'node_modules', '@deepseek-ai', 'cordis', 'lib', 'index.js')).href)

process.stdout.write('\ntest/cordis.test.mjs — real @deepseek-ai/cordis\n')

function makeElement(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    id: '', textContent: '', dataset: {}, style: {},
    children: [], parentNode: null, disabled: false,
    appendChild(child) { this.children.push(child); child.parentNode = this; return child },
    removeChild(child) {
      const i = this.children.indexOf(child)
      if (i >= 0) this.children.splice(i, 1)
      child.parentNode = null
      return child
    },
  }
}

function loadClient({ getComputedStyle, primitives } = {}) {
  const nodes = new Map()
  const document = {
    documentElement: makeElement('html'), body: makeElement('body'), head: makeElement('head'),
    createElement: makeElement, getElementById: (id) => nodes.get(id) ?? null,
  }
  const baseAppend = document.head.appendChild.bind(document.head)
  document.head.appendChild = (c) => { baseAppend(c); if (c.id) nodes.set(c.id, c); return c }
  const baseRemove = document.head.removeChild.bind(document.head)
  document.head.removeChild = (c) => { baseRemove(c); if (c.id) nodes.delete(c.id); return c }

  let api = null
  const window = {
    document,
    localStorage: { getItem: () => null, setItem: () => {} },
    getComputedStyle: getComputedStyle ?? (() => ({ getPropertyValue: () => '' })),
    requestAnimationFrame: (fn) => fn(),
    __ModuleLoader__: { load(spec) {
      const react = { createElement: () => null, useState: (v) => [v, () => {}], useEffect: () => {}, useRef: (v) => ({ current: v }), useSyncExternalStore: (s, g) => g() }
      const stubs = primitives ?? {
        Menu: () => null, MenuItemButton: () => null, Input: () => null,
        IconChevronDownOutlineRegular: () => null,
        IconCheckOutlineRegular: () => null,
        IconSearchOutlineRegular: () => null,
      }
      api = spec.factory((n) => {
        if (n === 'react') return react
        if (n === '@deepseek-ai/dsh-client-ui-primitives') return stubs
        throw new Error('unexpected require ' + n)
      })
    } },
  }
  new Function('window', 'document', 'fetch', 'setTimeout', 'clearTimeout', 'console',
    readFileSync(join(root, 'client', 'client.js'), 'utf8'))(
    window, document, () => Promise.reject(new Error('no fetch')), () => 0, () => {}, console)
  return { api, document, window }
}

let pluginCtx = null
function makeSlots() {
  const registrations = []
  return {
    registrations,
    inject(name, cb) { return pluginCtx.effect(cb, 'slots.inject') },
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

/**
 * The locale service is a required dependency of this plugin now (every visible
 * string comes from its dictionaries), so a real-Cordis activation has to
 * provide one. The stub records what was registered and answers `bind`.
 */
function makeLocale() {
  const tables = new Map()
  return {
    tables,
    register(ns, table) {
      tables.set(ns, table)
      return () => tables.delete(ns)
    },
    bind(ns) {
      return function (key) {
        const table = tables.get(ns)
        const raw = table && table.zh ? table.zh[key] : undefined
        return raw === undefined ? key : raw
      }
    },
    getSnapshot() { return { language: 'zh', revision: 1 } },
    subscribe() { return () => {} },
  }
}

const settle = () => new Promise((r) => setTimeout(r, 20))

await test('regression probe: a plugin reading ctx.theme without inject fails', async () => {
  const app = new Context()
  app.provide('slots', makeSlots())
  const fiber = app.plugin({
    name: 'probe',
    inject: ['slots'],
    apply(ctx) { void ctx.theme },
  })
  await assert.rejects(async () => { await fiber }, /cannot get property "theme" without inject/)
})

function activate(api, app, slots) {
  return app.plugin({
    name: api.name,
    inject: api.inject,
    apply(ctx) { pluginCtx = ctx; api.apply(ctx) },
  })
}

await test('the client activates under real Cordis and registers all rows', async () => {
  const { api, document } = loadClient()
  const slots = makeSlots()
  const app = new Context()
  const locale = makeLocale()
  app.provide('slots', slots)
  app.provide('locale', locale)
  const fiber = activate(api, app, slots)
  await fiber
  assert.equal(slots.registrations.length, 7, 'seven settings.general.item entries')
  assert.deepEqual(slots.registrations.map((r) => [r.spec.id, r.spec.order]),
    [['dsh-system-fonts-content', 12], ['dsh-system-fonts-code', 13],
     ['dsh-system-fonts-terminal', 14], ['dsh-system-fonts-ui', 15],
     ['dsh-system-fonts-ui-size', 16], ['dsh-system-fonts-line-height', 17],
     ['dsh-system-fonts-tracking', 18]])
  assert.ok(slots.registrations.every((r) => r.spec.name === 'settings.general.item'))
  assert.ok(slots.registrations.every((r) => r.spec.locale === 'dsh-system-fonts'),
    'every registration carries the plugin locale namespace')
  const table = locale.tables.get('dsh-system-fonts')
  assert.ok(table && table.zh && table.en, 'the dictionaries rode the locale service')
  assert.equal(table.zh['row.text.title'], '内容字体')
  assert.equal(table.en['row.text.title'], 'Text font')
  assert.ok(document.getElementById('dsh-system-fonts-style') !== null, 'font stylesheet installed')
  await fiber.dispose()
  assert.equal(locale.tables.size, 0, 'the dictionary registration was disposed with the plugin')
})

await test('a provided theme service is never touched', async () => {
  const { api } = loadClient()
  const app = new Context()
  app.provide('slots', makeSlots())
  app.provide('locale', makeLocale())
  app.provide('theme', new Proxy({}, { get: () => { throw new Error('theme touched') } }))
  const fiber = activate(api, app)
  await fiber
  await settle()
  await fiber.dispose()
})

await test('disposing the plugin cleans up, and the same module reactivates', async () => {
  const { api, document } = loadClient()
  const slots = makeSlots()
  const app = new Context()
  app.provide('slots', slots)
  app.provide('locale', makeLocale())
  const fiber = activate(api, app)
  await fiber
  assert.ok(document.getElementById('dsh-system-fonts-style') !== null)

  await fiber.dispose()
  await settle()
  assert.equal(document.getElementById('dsh-system-fonts-style'), null, 'stylesheet removed on dispose')
  assert.equal(document.getElementById('dsh-system-fonts/panel'), null, 'row stylesheet removed on dispose')
  assert.equal(slots.registrations.length, 0, 'both rows unregistered on dispose')

  const slots2 = makeSlots()
  const app2 = new Context()
  app2.provide('slots', slots2)
  app2.provide('locale', makeLocale())
  const fiber2 = activate(api, app2)
  await fiber2
  assert.equal(slots2.registrations.length, 7, 'reactivation registers all rows again')
  const styles = document.head.children.filter((el) => el.id === 'dsh-system-fonts-style')
  assert.equal(styles.length, 1, 'no duplicate stylesheet')
  await fiber2.dispose()
})

await test('a failed activation rolls back and the same module retries cleanly', async () => {
  const { api, document, window } = loadClient()
  // Row spacing forces the stylesheet builder to read the host's live tokens,
  // so the throwing getComputedStyle is reached during apply and the effect
  // fails — which is what Cordis must roll back.
  api.__internals.setState({ lineHeightPct: 80 })
  window.getComputedStyle = () => { throw new Error('computed style unavailable') }
  const slots = makeSlots()
  const app = new Context()
  app.provide('slots', slots)
  app.provide('locale', makeLocale())
  const fiber = activate(api, app)
  await assert.rejects(async () => { await fiber }, /computed style unavailable/)
  await settle()
  assert.equal(document.getElementById('dsh-system-fonts-style'), null, 'Cordis disposed the partial activation')
  assert.equal(document.getElementById('dsh-system-fonts/panel'), null)
  assert.equal(slots.registrations.length, 0, 'row registrations rolled back')

  window.getComputedStyle = () => ({ getPropertyValue: () => '' })
  const slots2 = makeSlots()
  const app2 = new Context()
  app2.provide('slots', slots2)
  app2.provide('locale', makeLocale())
  const fiber2 = activate(api, app2)
  await fiber2
  assert.ok(document.getElementById('dsh-system-fonts-style') !== null, 'same module instance activates after the failure')
  assert.equal(slots2.registrations.length, 7)
  await fiber2.dispose()
})

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`)
if (failures.length > 0) {
  for (const f of failures) process.stdout.write(`\n--- ${f.name} ---\n${f.error.stack}\n`)
  process.exit(1)
}
