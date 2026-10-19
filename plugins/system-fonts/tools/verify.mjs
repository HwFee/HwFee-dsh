/**
 * End-to-end check: the host's real enumeration plus the CSS the client would
 * emit for a realistic configuration. Prints, asserts nothing.
 *
 *   node tools/verify.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { listSystemFonts } from '../lib/system-fonts.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- host side

const t0 = Date.now()
const catalogue = await listSystemFonts()
const elapsed = Date.now() - t0

console.log('================= host: font catalogue =================')
console.log(`  elapsed      ${elapsed} ms`)
console.log(`  platform     ${catalogue.platform}   supported ${catalogue.supported}`)
console.log(`  sources      ${catalogue.sources.join('  ')}`)
console.log(`  families     ${catalogue.count}`)
const text = catalogue.families.filter((f) => !f.symbol)
console.log(`  text/symbol  ${text.length} / ${catalogue.count - text.length}`)
console.log(`  multi-weight ${text.filter((f) => f.weights.length > 1).length}`)

console.log('\n  --- the families a DSH user is most likely to pick ---')
for (const name of [
  'Microsoft YaHei', 'Segoe UI', 'SimSun', 'KaiTi', 'Microsoft JhengHei', 'DengXian',
  'Consolas', 'Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code',
  '华文楷体', '苹方-简', '霞鹜文楷等宽', 'Anthropic Sans Web Text',
]) {
  const hit = catalogue.families.find((f) => f.family === name)
  console.log(
    '   ' + name.padEnd(26) +
    (hit ? `[${hit.weights.join(',')}]`.padEnd(20) + (hit.gdi ? 'GDI' : 'localized') : '(not installed)'),
  )
}

console.log('\n  --- symbol faces hidden by default ---')
console.log('   ' + catalogue.families.filter((f) => f.symbol).map((f) => f.family).join(' | '))

// -------------------------------------------------------------- client side

// Load the client bundle under a DOM shim, exactly as the test does, to show
// the stylesheet it would install.
const HOST_TOKENS = {
  '--dsw-font-base-16': '16px/24px -apple-system, sans-serif',
  '--dsw-font-base-16-font-weight': '400',
  '--dsw-font-base-strong-16': '500 16px/24px -apple-system, sans-serif',
  '--dsw-font-base-strong-16-font-weight': '500',
  '--dsw-font-xl-24': '600 24px/32px -apple-system, sans-serif',
  '--dsw-font-xl-24-font-weight': '600',
  '--dsw-font-markdown-h1': '21px/30px -apple-system, sans-serif',
  '--dsw-font-markdown-h1-font-weight': '700',
  '--dsw-font-markdown-base': 'var(--dsh-content-font-size,14px) / calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)',
  '--dsw-font-markdown-base-font-weight': '400',
  '--dsw-font-markdown-base-line-height': 'calc(24px + var(--dsh-content-font-delta))',
  '--dsw-font-markdown-base-italic': 'italic var(--dsh-content-font-size,14px) / calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)',
  '--dsw-font-markdown-base-italic-font-weight': '400',
  '--dsw-font-markdown-code': '12px/19px "SF Mono", Consolas, monospace',
  '--dsw-font-markdown-code-font-weight': '400',
  '--dsw-font-markdown-code-block': '11px/19px "SF Mono", Consolas, monospace',
  '--dsw-font-markdown-code-block-font-weight': '400',
}

function makeElement(tag) {
  return { tagName: String(tag).toUpperCase(), id: '', textContent: '', dataset: {}, style: {}, children: [], appendChild(c) { this.children.push(c); return c } }
}
const nodes = new Map()
const document = {
  documentElement: makeElement('html'), body: makeElement('body'), head: makeElement('head'),
  createElement: makeElement,
  getElementById: (id) => nodes.get(id) ?? null,
}
const baseAppend = document.head.appendChild.bind(document.head)
document.head.appendChild = (child) => { baseAppend(child); if (child.id) nodes.set(child.id, child); return child }

const window = {
  document,
  localStorage: { getItem: () => null, setItem: () => {} },
  getComputedStyle: () => ({ getPropertyValue: (n) => HOST_TOKENS[n] ?? '' }),
  __ModuleLoader__: { load({ factory }) {
    const react = { createElement: () => null, useState: (v) => [v, () => {}], useEffect: () => {}, useRef: (v) => ({ current: v }), useSyncExternalStore: (s, g) => g() }
    const primitives = {
      Menu: () => null, MenuItemButton: () => null, Input: () => null,
      IconChevronDownOutlineRegular: () => null,
      IconCheckOutlineRegular: () => null,
      IconSearchOutlineRegular: () => null,
    }
    module.exports.api = factory((n) => {
      if (n === 'react') return react
      if (n === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error('unexpected require ' + n)
    })
  } },
}

const module = { exports: {} }
new Function('window', 'document', 'fetch', 'console',
  readFileSync(join(root, 'client', 'client.js'), 'utf8'))(
  window, document, () => Promise.reject(new Error('no fetch')), console)

const api = module.exports.api
api.__internals.setState({
  uiFamily: 'Microsoft YaHei',
  codeFamily: 'Cascadia Mono',
  lineHeightPct: 80,
  trackingEm: 3,
})

console.log('\n================= client: generated stylesheet =================')
console.log(api.__internals.buildCss(api.__internals.getState()))

console.log('\n================= sanity =================')
const css = api.__internals.buildCss(api.__internals.getState())
const checks = [
  ['shared family slot written', /--dsw-font-family: "Microsoft YaHei"/.test(css)],
  ['code family slot written, separately', /--ds-font-family-code: "Cascadia Mono"/.test(css)],
  ['CJK fallback survives the choice', /"Microsoft YaHei"/.test(css) && /"PingFang SC"/.test(css)],
  ['NO font-weight declaration anywhere (the theme owns weights)', !/font-weight/.test(css)],
  ['no per-step weight sub-token either', !/-font-weight\s*:/.test(css)],
  ['no font-size override (the host owns 字号)', !/--dsh-content-font-size\s*:/.test(css)],
  ['no colour rule', !/color\s*:/.test(css)],
  ['content line-height scaled', /--dsw-font-markdown-base-line-height: calc\(calc\(24px \+ var\(--dsh-content-font-delta\)\) \* 0\.8\)/.test(css)],
  ['shorthand /lh scaled too, every other piece verbatim', /--dsw-font-markdown-base: var\(--dsh-content-font-size,14px\)\/calc\(calc\(24px \+ var\(--dsh-content-font-delta\)\) \* 0\.8\) var\(--dsw-font-family\)/.test(css)],
  ['UI row line-height untouched', !/--dsw-font-base-16-line-height/.test(css)],
  ['letter-spacing reaches the hashed markdown roots', /\[class\*="markdown"\] \{/.test(css) && /letter-spacing: 0\.03em/.test(css)],
  ['no dead .markdown-body selector', !/markdown-body/.test(css)],
]
for (const [label, ok] of checks) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
