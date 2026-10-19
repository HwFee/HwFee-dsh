/**
 * Final integration check: resolve the package the way the host does, from
 * inside a profile directory, and confirm both entry points load.
 *
 *   node tools/integration.mjs [profile-dir]
 *   DSH_PROFILE=... node tools/integration.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { join, isAbsolute } from 'node:path'

// DSH_PROFILE is a profile NAME in a harness session ("desktop"), but a bare
// directory outside one — accept either, resolving names under ~/.dsh/profiles.
function resolveProfile(value) {
  if (!value) return null
  if (isAbsolute(value) || value.includes('/') || value.includes('\\')) return value
  return join(process.env.USERPROFILE ?? homedir(), '.dsh', 'profiles', value)
}
const PROFILE = resolveProfile(process.argv[2])
  ?? resolveProfile(process.env.DSH_PROFILE)
  ?? join(process.env.USERPROFILE ?? homedir(), '.dsh', 'profiles', 'desktop')
const PKG = 'dsh-system-fonts'
const EXPECTED_CLIENT_INJECT = [
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-settings-general',
]

let failures = 0
function check(label, ok, detail = '') {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`)
}

console.log(`profile: ${PROFILE}`)

console.log('================= profile wiring =================')
const profilePkg = JSON.parse(readFileSync(join(PROFILE, 'package.json'), 'utf8'))
check(`${PKG} is a dependency`, Boolean(profilePkg.dependencies?.[PKG]), profilePkg.dependencies?.[PKG])
check(`${PKG} is in dsh.profile.bundles`, profilePkg.dsh.profile.bundles.includes(PKG),
  profilePkg.dsh.profile.bundles.join(', '))

console.log('\n================= module resolution (as the host does) =================')
const require = createRequire(join(PROFILE, 'noop.js'))

// 1. The host entry, through the exports map's "." condition.
let hostEntry = null
try {
  hostEntry = require.resolve(PKG)
  check('resolves the host entry via exports["."]', hostEntry.includes('lib'), hostEntry.replace(PROFILE, '<profile>'))
} catch (error) {
  check('resolves the host entry via exports["."]', false, error.message)
}

// 2. The client bundle, through the exports map's "./client" subpath — the very
//    path the host fetches to serve a plugin's browser bundle.
let clientEntry = null
try {
  clientEntry = require.resolve(PKG + '/client')
  check('resolves the client bundle via exports["./client"]', clientEntry.endsWith('client.js'),
    clientEntry.replace(PROFILE, '<profile>'))
} catch (error) {
  check('resolves the client bundle via exports["./client"]', false, error.message)
}

// 3. The manifest the host reads to decide platform and load order.
try {
  const own = require(PKG + '/package.json')
  check('manifest declares dsh.bundle.patch', own.dsh?.bundle?.patch === './cordis.patch.yml')
  check('manifest declares dsh.client.platform = web', own.dsh?.client?.platform === 'web')
  check('manifest lists the renderer + settings-general packages in dsh.client.inject',
    EXPECTED_CLIENT_INJECT.every((p) => own.dsh?.client?.inject?.includes(p)),
    JSON.stringify(own.dsh?.client?.inject))
} catch (error) {
  check('manifest readable', false, error.message)
}

console.log('\n================= entry points actually load =================')
if (hostEntry) {
  const mod = await import(pathToFileURL(hostEntry).href)
  check('host entry imports', typeof mod.apply === 'function' && mod.name === PKG,
    `name=${mod.name} apply=${typeof mod.apply}`)
}

if (clientEntry) {
  const source = readFileSync(clientEntry, 'utf8')

  // The loader contract: one __ModuleLoader__.load({ id, factory }) call whose
  // factory returns name/inject/apply.
  let captured = null
  const reactShim = {
    createElement: () => null,
    useState: (v) => [v, () => {}],
    useEffect: () => {},
    useRef: (v) => ({ current: v }),
    useSyncExternalStore: (s, g) => g(),
  }
  const primitivesShim = {
    Menu: () => null,
    MenuItemButton: () => null,
    Input: () => null,
    IconChevronDownOutlineRegular: () => null,
    IconCheckOutlineRegular: () => null,
    IconSearchOutlineRegular: () => null,
  }
  const requireShim = (name) => {
    if (name === 'react') return reactShim
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitivesShim
    throw new Error('unexpected require ' + name)
  }
  const capture = (spec) => {
    captured = { id: spec.id, exports: spec.factory(requireShim) }
  }

  function makeElement(tag) {
    return {
      tagName: String(tag).toUpperCase(), id: '', textContent: '', dataset: {}, style: {},
      children: [], parentNode: null, disabled: false,
      appendChild(c) { this.children.push(c); c.parentNode = this; return c },
      removeChild(c) {
        const i = this.children.indexOf(c)
        if (i >= 0) this.children.splice(i, 1)
        c.parentNode = null
        return c
      },
    }
  }
  const nodes = new Map()
  const documentShim = {
    documentElement: makeElement('html'),
    body: makeElement('body'),
    head: makeElement('head'),
    createElement: makeElement,
    getElementById: (id) => nodes.get(id) ?? null,
  }
  const baseAppend = documentShim.head.appendChild.bind(documentShim.head)
  documentShim.head.appendChild = (c) => { baseAppend(c); if (c.id) nodes.set(c.id, c); return c }
  const baseRemove = documentShim.head.removeChild.bind(documentShim.head)
  documentShim.head.removeChild = (c) => { baseRemove(c); if (c.id) nodes.delete(c.id); return c }

  const windowShim = {
    document: documentShim,
    localStorage: { getItem: () => null, setItem: () => {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (fn) => { const id = {}; rafFired.push(fn); return id },
    cancelAnimationFrame: () => {},
    __ModuleLoader__: { load: capture },
  }
  const rafFired = []
  const pendingTimers = new Map()
  let timerId = 1

  new Function('window', 'document', 'fetch', 'setTimeout', 'clearTimeout', 'console', source)(
    windowShim, documentShim, () => Promise.reject(new Error('no fetch')),
    (fn) => { const id = timerId++; pendingTimers.set(id, fn); return id },
    (id) => pendingTimers.delete(id),
    console)

  check('client bundle registers under its id', captured?.id === PKG, captured?.id)
  check('client bundle exports name/inject/apply',
    captured?.exports.name === PKG &&
    Array.isArray(captured?.exports.inject) &&
    typeof captured?.exports.apply === 'function',
    `name=${captured?.exports.name} inject=[${captured?.exports.inject}]`)
  check('client bundle injects the slots + locale services',
    JSON.stringify(captured?.exports.inject) === '["slots","locale"]',
    `[${captured?.exports.inject}]`)

  function makeStrictCtx({ services = {}, inject = [] } = {}) {
    const disposables = []
    const injects = []
    const injected = new Set(inject)
    const ctx = {
      effect(fn, label) {
        const d = fn()
        if (typeof d === 'function') disposables.push(d)
        return typeof d === 'function' ? d : function () {}
      },
      on() { return function () {} },
      inject(names, cb) {
        const needed = Array.isArray(names) ? names : Object.keys(names)
        const entry = { needed, cb, child: makeStrictCtx({ services, inject: needed }), ran: false }
        injects.push(entry)
        disposables.push(() => entry.child.dispose())
        tryRun(entry)
        return { await: async () => entry.child.proxy, dispose: () => entry.child.dispose() }
      },
      provide(name, impl) { services[name] = impl; for (const e of injects) tryRun(e) },
      dispose() { for (const d of disposables.splice(0).reverse()) try { d() } catch {} },
      _injects: injects,
    }
    function tryRun(entry) {
      if (!entry.ran && entry.needed.every((n) => services[n] !== undefined)) {
        entry.ran = true
        entry.cb(entry.child.proxy)
      }
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
    return ctx
  }

  if (captured?.exports) {
    const registrations = []
    const slots = {
      inject: (n, cb) => cb(),
      register(spec, component) { registrations.push({ spec, component }); return () => {} },
    }
    // `locale` is a required dependency: every visible row string comes from
    // the dictionaries registered through it.
    const localeTables = new Map()
    const locale = {
      register(ns, table) {
        localeTables.set(ns, table)
        return () => localeTables.delete(ns)
      },
      bind() { return (key) => key },
      getSnapshot() { return { language: 'zh', revision: 1 } },
      subscribe() { return () => {} },
    }
    const ctx = makeStrictCtx({ services: { slots, locale }, inject: captured.exports.inject })
    let applied = true
    try {
      captured.exports.apply(ctx.proxy)
    } catch (error) {
      applied = false
      console.log(`       apply() threw: ${error.message}`)
    }
    check('apply() activates under the strict service contract (no un-injected reads)', applied)
    check('no service is injected beyond the declared slots read',
      ctx._injects.length === 0,
      ctx._injects.map((i) => i.needed.join('+')).join(','))
    check('every registration carries the plugin locale namespace',
      registrations.every((r) => r.spec.locale === PKG) && localeTables.has(PKG),
      [...localeTables.keys()].join(','))
    const expected = [
      ['dsh-system-fonts-content', 12],
      ['dsh-system-fonts-code', 13],
      ['dsh-system-fonts-terminal', 14],
      ['dsh-system-fonts-line-height', 15],
      ['dsh-system-fonts-tracking', 16],
    ]
    check('five settings.general.item rows register at orders 12–16',
      registrations.length === expected.length &&
      expected.every(([id, order], i) => registrations[i].spec.name === 'settings.general.item' &&
        registrations[i].spec.id === id && registrations[i].spec.order === order),
      registrations.map((r) => r.spec.id + '@' + r.spec.order).join(','))
    ctx.dispose()
    check('dispose removes the plugin stylesheets',
      documentShim.getElementById('dsh-system-fonts-style') === null &&
      documentShim.getElementById('dsh-system-fonts/panel') === null)
  }

  // ---- artifact freshness ------------------------------------------------
  try {
    const { buildArtifact } = await import('./build-client.mjs')
    check('client/client.js is fresh (matches what client/src builds to)',
      buildArtifact() === source)
  } catch (error) {
    check('client/client.js freshness check', false, error.message)
  }
}

console.log(failures === 0
  ? '\nall checks passed (wiring + strict-contract activation; desktop UI not launched)'
  : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
