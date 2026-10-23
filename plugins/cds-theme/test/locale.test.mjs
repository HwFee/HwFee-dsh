/**
 * Bilingual settings: the dictionaries the panel renders through `t`, the
 * plugin-inventory `locale/*.json` copy, and the guarantee that no visible
 * Chinese string is baked into the settings UI.
 *
 * The working pattern is usage-stats': `ctx.locale.register(ns, { en, zh })`
 * plus `locale: ns` on the slot registration, which injects `t` as a prop and
 * re-renders the row when the host language changes. These tests pin the two
 * halves of that contract that live in this plugin.
 *
 *   node test/locale.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { en, zh, LOCALE_NS, makeT, makeTranslator } from '../client/src/locales.js'
import { createPanel } from '../client/src/panel.js'
import { sanitize } from '../client/src/constants.js'

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** Strip comments so a Chinese citation cannot look like a rendered string. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// ------------------------------------------------------- dictionaries

test('en and zh carry identical, complete key sets', function () {
  const enKeys = Object.keys(en).sort()
  const zhKeys = Object.keys(zh).sort()
  assert.ok(enKeys.length >= 16, 'expected the full settings copy')
  assert.deepEqual(zhKeys, enKeys, 'a missing zh key would fall back to English mid-row')
  for (const key of enKeys) {
    assert.equal(typeof en[key], 'string', key)
    assert.equal(typeof zh[key], 'string', key)
    assert.ok(en[key].trim().length > 0, key + ' en is empty')
    assert.ok(zh[key].trim().length > 0, key + ' zh is empty')
  }
})

test('en is pure English and zh is pure Chinese (no hybrid strings)', function () {
  for (const key of Object.keys(en)) {
    assert.ok(!CJK.test(en[key]), key + ' leaks Chinese into the English locale: ' + en[key])
    assert.ok(!en[key].includes(' · '), key + ' is still a bilingual hybrid: ' + en[key])
  }
  for (const key of Object.keys(zh)) {
    assert.ok(CJK.test(zh[key]), key + ' has no Chinese at all: ' + zh[key])
    assert.ok(!zh[key].includes(' · '), key + ' is still a bilingual hybrid: ' + zh[key])
    assert.ok(!/\b(?:the|and|with|your|off|on)\b/i.test(zh[key]),
      key + ' leaks an English phrase into the Chinese locale: ' + zh[key])
  }
})

test('every settings row has a title and a description in both locales', function () {
  const rows = ['modeRow', 'accent', 'warmth', 'radius', 'elevation', 'refine',
    'thinkingBlue', 'pasteFile', 'preferThemeCjk', 'enabled']
  for (const row of rows) {
    for (const suffix of ['title', 'desc']) {
      assert.ok(Object.hasOwn(en, row + '.' + suffix), 'missing en ' + row + '.' + suffix)
      assert.ok(Object.hasOwn(zh, row + '.' + suffix), 'missing zh ' + row + '.' + suffix)
    }
  }
  // Every deleted row's copy goes with it — a leftover string is an invitation
  // to re-add the row. Nine are gone: two verified early, four deleted as
  // invisible, three solidified on the last round. `compactHero` is the tenth:
  // its runtime caused a layout loop (styles.js `newSessionInputRules`).
  for (const retired of ['codeBlockDetails', 'markdownBody', 'attachments',
    'statusPulse', 'concentricRadius', 'disclosurePolish',
    'footnotes', 'statTypography', 'buttonSpring', 'compactHero']) {
    for (const suffix of ['title', 'desc']) {
      assert.ok(!Object.hasOwn(en, retired + '.' + suffix), 'leftover en ' + retired + '.' + suffix)
      assert.ok(!Object.hasOwn(zh, retired + '.' + suffix), 'leftover zh ' + retired + '.' + suffix)
    }
  }
  // The three theme-mode cubes and the four accent swatches too.
  for (const mode of ['light', 'dark', 'system']) {
    assert.ok(Object.hasOwn(en, 'modeRow.' + mode), 'missing en modeRow.' + mode)
    assert.ok(Object.hasOwn(zh, 'modeRow.' + mode), 'missing zh modeRow.' + mode)
  }
  for (const preset of ['clay', 'ochre', 'sand', 'graphite']) {
    assert.ok(Object.hasOwn(en, 'accent.' + preset))
    assert.ok(Object.hasOwn(zh, 'accent.' + preset))
  }
})

test('the translator substitutes parameters and falls back to English', function () {
  const translate = makeTranslator(zh)
  assert.equal(translate('accent.title'), zh['accent.title'])
  assert.equal(translate('missing.key'), 'missing.key')
  assert.equal(makeTranslator({ 'unit.title': '{n} 个' })('unit.title', { n: 3 }), '3 个')
  // makeT wraps an injected t untouched and otherwise falls back to the FULL
  // en dictionary — never to a raw key.
  const injected = function (key) { return 'injected:' + key }
  assert.equal(makeT(injected)('accent.title'), 'injected:accent.title')
  assert.equal(makeT(undefined)('accent.title'), en['accent.title'])
  assert.equal(makeT(null)('enabled.desc'), en['enabled.desc'])
})

// ----------------------------------------------------- the rendered rows

/** A React stand-in: createElement plus the one hook panel.js uses. */
function fakeReact() {
  return {
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      const nextProps = props || {}
      // Render function components eagerly: real React would do it at commit,
      // and the tests only need the resulting host tree.
      if (typeof type === 'function') {
        return type(Object.assign({}, nextProps, {
          children: children.length > 0 ? children : nextProps.children,
        }))
      }
      return { type, props: nextProps, children }
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
}

/** A settings store reduced to what the rows read. */
function fakeSettings() {
  const state = sanitize({})
  return {
    getState() { return state },
    subscribe() { return function () {} },
    setState() {},
  }
}

function createRowPanel() {
  return createPanel({
    React: fakeReact(),
    primitives: {
      IconCheckOutlineRegular: function IconCheck() { return null },
      IconLightOutlineMedium: function IconLight() { return null },
      IconDarkOutlineMedium: function IconDark() { return null },
      IconFollowsystemOutlineMedium: function IconSystem() { return null },
    },
    settings: fakeSettings(),
    // A live-looking theme-mode store, so the row renders and its copy is part
    // of the bilingual sweep (the real store is bound to the host service).
    themeMode: {
      available() { return true },
      getPreference() { return 'system' },
      setPreference() { return true },
      subscribe() { return function () {} },
    },
  })
}

/** Collect every human-visible string a render tree produces. */
function visibleStrings(node, out) {
  const collected = Array.isArray(out) ? out : []
  if (node === null || node === undefined || typeof node === 'boolean') return collected
  if (typeof node === 'string') { collected.push(node); return collected }
  if (typeof node === 'number') { collected.push(String(node)); return collected }
  if (Array.isArray(node)) {
    for (const child of node) visibleStrings(child, collected)
    return collected
  }
  const props = node.props || {}
  for (const [name, value] of Object.entries(props)) {
    if (name === 'children') continue
    if ((name === 'title' || name === 'aria-label' || name === 'aria-valuetext') && typeof value === 'string') {
      collected.push(value)
    }
  }
  const nested = Array.isArray(node.children) && node.children.length > 0
    ? node.children
    : paramsChildren(props)
  visibleStrings(nested, collected)
  return collected
}

/** A React element may still expose its children through props. */
function paramsChildren(props) {
  return props && Object.hasOwn(props, 'children') ? props.children : []
}

test('the panel registers the eleven rows with stable ids and order', function () {
  const panel = createRowPanel()
  // 10 appearance rows + the master switch. EVERY retired replication row is
  // gone: four were deleted because their effects could not be seen, three were
  // solidified into unconditional rules at the user's request, and the
  // hero-compaction switch was retired with its runtime. The blank-session
  // backdrop is a live replication item, so it carries its own comparison switch,
  // while Markdown is fixed styling. The view-tabs pill
  // and the split composer were removed outright, rows included.
  const ids = panel.slots.map(function (slot) { return slot.id })
  assert.deepEqual(ids, [
    'dsh-cds-theme-mode',
    'dsh-cds-theme-accent',
    'dsh-cds-theme-warmth',
    'dsh-cds-theme-radius',
    'dsh-cds-theme-elevation',
    'dsh-cds-theme-refine',
    'dsh-cds-theme-thinking-blue',
    'dsh-cds-theme-enabled',
    'dsh-cds-theme-paste-as-file',
    'dsh-cds-theme-prefer-theme-cjk',
    'dsh-cds-theme-hero-ripple',
  ])
  assert.equal(panel.slots.length, 11)
  const orders = panel.slots.map(function (slot) { return slot.order })
  assert.deepEqual(orders, orders.slice().sort(function (a, b) { return a - b }),
    'rows must be ordered so the block reads top to bottom')
  for (const slot of panel.slots) {
    assert.equal(typeof slot.order, 'number')
    assert.equal(typeof slot.component, 'function')
  }
})

test('every visible row string goes through t (no hardcoded copy)', function () {
  const panel = createRowPanel()
  const keys = new Set()
  const t = function (key, params) {
    keys.add(key)
    return 't:' + key + (params === undefined ? '' : JSON.stringify(params))
  }
  for (const slot of panel.slots) {
    // The outlet injects `t` as a prop; the component must forward it.
    const tree = slot.component({ t })
    const strings = visibleStrings(tree).filter(function (value) {
      return !/^\d+%$/.test(value) // slider read-outs are data, not copy
    })
    assert.ok(strings.length > 0, slot.id + ' rendered nothing')
    for (const value of strings) {
      assert.ok(value.startsWith('t:'), slot.id + ' rendered hardcoded copy: ' + value)
    }
  }
  // Every key the panel asks for must exist in both dictionaries.
  assert.ok(keys.size >= 10, 'expected the settings copy keys to be requested')
  for (const key of keys) {
    assert.ok(Object.hasOwn(en, key), 'en missing key ' + key)
    assert.ok(Object.hasOwn(zh, key), 'zh missing key ' + key)
  }
})

test('switching the host language switches the whole row', function () {
  const panel = createRowPanel()
  const render = function (dict) {
    const out = []
    for (const slot of panel.slots) {
      const tree = slot.component({ t: function (key) { return dict[key] } })
      visibleStrings(tree, out)
    }
    return out.join(' ')
  }
  const english = render(en)
  const chinese = render(zh)
  assert.ok(english.includes(en['accent.title']), 'expected the English accent row')
  assert.ok(english.includes(en['enabled.desc']))
  assert.ok(english.includes(en['modeRow.title']), 'expected the theme-mode row')
  assert.ok(english.includes(en['thinkingBlue.title']), 'expected the thinking-label row')
  assert.ok(!english.includes('Segmented control'), 'the rejected segmented-control row must be gone')
  // Nine rows are gone; none of their copy may render any more.
  for (const gone of ['Code-block details', 'Markdown body', 'Attachment cards',
    'Running pulse', 'Concentric corners', 'Fold rows', 'Footnotes',
    'Usage numbers', 'Button spring']) {
    assert.ok(!english.includes(gone), 'the "' + gone + '" row must be gone')
  }
  assert.ok(!CJK.test(english), 'en mode must not render Chinese: ' + english)
  assert.ok(chinese.includes(zh['accent.title']), 'expected the Chinese accent row')
  assert.ok(chinese.includes(zh['enabled.desc']))
  assert.ok(chinese.includes(zh['thinkingBlue.title']), 'expected the Chinese thinking-label row')
  assert.ok(!chinese.includes('分段控件'), 'the Chinese segmented-control row must be gone')
  for (const gone of ['代码块细节', 'Markdown 正文', '附件卡', '运行指示呼吸',
    '同心圆角', '折叠行', '脚注', '用量数字', '按钮弹簧']) {
    assert.ok(!chinese.includes(gone), 'the Chinese "' + gone + '" row must be gone')
  }
  assert.ok(!/\bAccent colour\b/.test(chinese), 'zh mode must not render English copy')
})

test('without an injected t the rows fall back to complete English', function () {
  const panel = createRowPanel()
  const out = []
  for (const slot of panel.slots) {
    visibleStrings(slot.component({}), out)
  }
  const text = out.join(' ')
  assert.ok(text.includes(en['warmth.title']))
  assert.ok(!CJK.test(text), 'the fallback must not be the Chinese table')
  assert.ok(!/^[a-z]+\.[a-z]+$/.test(text), 'no raw key should render')
})

// ------------------------------------------------------- visible-source guard

test('the settings UI source contains no hardcoded Chinese string', function () {
  const source = readFileSync(new URL('../client/src/panel.js', import.meta.url), 'utf8')
  const code = stripComments(source)
  assert.ok(!CJK.test(code), 'panel.js has a Chinese string outside a comment: '
    + (code.match(CJK) || [''])[0])
})

test('the client module declares the locale dependency and registers the namespace', function () {
  const source = readFileSync(new URL('../client/src/index.js', import.meta.url), 'utf8')
  assert.ok(/inject\s*=\s*\[[^\]]*'locale'/.test(source),
    'the locale service must be a declared dependency (or t is never injected)')
  assert.ok(source.includes('LOCALE_NS'), 'the panel copy must be registered under LOCALE_NS')
  assert.equal(LOCALE_NS, 'dsh-cds-theme', 'the namespace is the plugin package name')
})

// ------------------------------------------------------- inventory copy

test('locale/*.json carries the plugin-inventory title and description', function () {
  const read = function (locale) {
    return JSON.parse(readFileSync(new URL('../locale/' + locale + '.json', import.meta.url), 'utf8'))
  }
  const english = read('en')
  const chinese = read('zh')

  for (const doc of [english, chinese]) {
    assert.ok(doc.meta, 'locale json must carry meta')
    assert.equal(typeof doc.meta.title, 'string')
    assert.equal(typeof doc.meta.description, 'string')
    assert.ok(doc.meta.title.trim().length > 0)
    assert.ok(doc.meta.description.trim().length > 0)
  }
  assert.deepEqual(Object.keys(chinese.meta).sort(), Object.keys(english.meta).sort(),
    'the inventory keys must match across locales')
  assert.ok(!CJK.test(english.meta.title + english.meta.description),
    'the English inventory copy leaks Chinese')
  assert.ok(CJK.test(chinese.meta.title) && CJK.test(chinese.meta.description),
    'the Chinese inventory copy is not Chinese')
  assert.notEqual(english.meta.title, chinese.meta.title)
  assert.notEqual(english.meta.description, chinese.meta.description)
})

test('the plugin-inventory copy names the theme, not another plugin', function () {
  const read = function (locale) {
    return JSON.parse(readFileSync(new URL('../locale/' + locale + '.json', import.meta.url), 'utf8'))
  }
  assert.match(read('en').meta.title, /Claude Design System/)
  assert.match(read('zh').meta.title, /Claude Design System/)
})
