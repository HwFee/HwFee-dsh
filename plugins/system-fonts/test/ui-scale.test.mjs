/**
 * The text-only UI scaler: what it touches, what it must not, and how it
 * restores. Fake DOM with computed font sizes — the unit under test is the
 * decision logic, not layout.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUiScaler, UI_SCALE_SCOPES } from '../client/src/uiscale.js'

function text(value) {
  return { nodeType: 3, textContent: value }
}

function styleBag() {
  const values = new Map()
  return {
    getPropertyValue(name) { return values.get(name) ?? '' },
    getPropertyPriority() { return '' },
    setProperty(name, value) { values.set(name, String(value)) },
    removeProperty(name) { values.delete(name) },
  }
}

function element(tagName, attrs = {}, children = [], { fontSize = '14px', lineHeight = '22px' } = {}) {
  const el = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    style: styleBag(),
    childNodes: [],
    children: [],
    baseFont: fontSize,
    baseLine: lineHeight,
    getAttribute(name) { return attrs[name] ?? null },
    matches(selector) {
      const m = /^\[([^=\]]+)="([^"]*)"\]$/.exec(selector)
      return m !== null && attrs[m[1]] === m[2]
    },
    querySelector(selector) {
      const all = this.querySelectorAll(selector)
      return all.length > 0 ? all[0] : null
    },
    querySelectorAll(selector) {
      const out = []
      const walk = (node) => {
        for (const child of node.children) {
          if (selector === '*' || child.matches(selector)) out.push(child)
          walk(child)
        }
      }
      walk(this)
      return out
    },
  }
  for (const child of children) {
    el.childNodes.push(child)
    if (child.nodeType === 1) el.children.push(child)
  }
  return el
}

function scopedDocument() {
  // sidebar > button > span("插件"), caption span("3 小时")
  const label = element('span', {}, [text('插件')], { fontSize: '14px', lineHeight: '22px' })
  const caption = element('span', {}, [text('3 小时')], { fontSize: '12px', lineHeight: '18px' })
  const button = element('button', {}, [label], { fontSize: '14px', lineHeight: '22px' })
  const sidebar = element('div', { 'data-slot': 'sidebar' }, [button, caption])
  // settings dialog > row > title div > span("内容字体")
  const titleText = element('span', {}, [text('内容字体')], { fontSize: '14px', lineHeight: '22px' })
  const title = element('div', {}, [titleText], { fontSize: '14px', lineHeight: '22px' })
  const row = element('div', {}, [title], { fontSize: '14px', lineHeight: '22px' })
  const dialog = element('div', { 'data-shortcut-modal': 'settings' }, [row])
  // conversation content: must never be touched.
  const message = element('p', { 'data-conversation-content': '' }, [text('hello')], { fontSize: '14px', lineHeight: '20px' })
  const content = element('div', { 'data-conversation-content': '' }, [message])
  const body = element('body', {}, [sidebar, dialog, content])

  const document = {
    body,
    querySelectorAll(selector) {
      return body.querySelectorAll(selector)
    },
  }
  const win = {
    getComputedStyle(el) { return { fontSize: el.baseFont, lineHeight: el.baseLine } },
    // No MutationObserver in this fake; refresh() is the explicit pass.
  }
  return { document, win, sidebar, dialog, message, label, caption, titleText }
}

test('the scopes are the stable chrome hooks only', function () {
  assert.deepEqual(UI_SCALE_SCOPES, ['[data-slot="sidebar"]', '[data-shortcut-modal="settings"]'])
})

test('scaling writes font-size and pixel line-height on text carriers only', function () {
  const dom = scopedDocument()
  const scaler = createUiScaler({ document: dom.document, window: dom.win, })
  scaler.activate()
  scaler.setScale(1.2)

  assert.equal(dom.label.style.getPropertyValue('font-size'), '16.8px')
  assert.equal(dom.label.style.getPropertyValue('line-height'), '26.4px')
  assert.equal(dom.caption.style.getPropertyValue('font-size'), '14.4px')
  assert.equal(dom.caption.style.getPropertyValue('line-height'), '21.6px')
  assert.equal(dom.titleText.style.getPropertyValue('font-size'), '16.8px')

  // Containers without their own text stay untouched.
  assert.equal(dom.sidebar.style.getPropertyValue('font-size'), '')
  assert.equal(dom.dialog.style.getPropertyValue('font-size'), '')
  assert.equal(dom.message.style.getPropertyValue('font-size'), '',
    'conversation content is outside the scopes')

  // Repeated passes never compound: the base is cached.
  scaler.refresh()
  scaler.refresh()
  assert.equal(dom.label.style.getPropertyValue('font-size'), '16.8px')
  scaler.teardown()
})

test('100% restores the exact prior inline state', function () {
  const dom = scopedDocument()
  const scaler = createUiScaler({ document: dom.document, window: dom.win, })
  scaler.activate()
  scaler.setScale(1.2)
  assert.equal(dom.label.style.getPropertyValue('font-size'), '16.8px')

  scaler.setScale(1)
  assert.equal(dom.label.style.getPropertyValue('font-size'), '')
  assert.equal(dom.label.style.getPropertyValue('line-height'), '')
  assert.equal(dom.caption.style.getPropertyValue('font-size'), '')
  assert.equal(scaler.getScale(), 1)
  scaler.teardown()
})

test('an element with its own inline font size gets it back, not erased', function () {
  const dom = scopedDocument()
  dom.label.style.setProperty('font-size', '15px')
  const scaler = createUiScaler({ document: dom.document, window: dom.win, })
  scaler.activate()
  scaler.setScale(1.2)
  assert.equal(dom.label.style.getPropertyValue('font-size'), '16.8px', 'the scaler wins while active')
  scaler.setScale(1)
  assert.equal(dom.label.style.getPropertyValue('font-size'), '15px', 'the host value returns')
  scaler.teardown()
})

test('elements mounted after activation are picked up by refresh', function () {
  const dom = scopedDocument()
  const scaler = createUiScaler({ document: dom.document, window: dom.win, })
  scaler.activate()
  scaler.setScale(1.1)

  const late = element('span', {}, [text('新会话')], { fontSize: '14px', lineHeight: '22px' })
  dom.sidebar.children.push(late)
  dom.sidebar.childNodes.push(late)
  scaler.refresh()
  assert.equal(late.style.getPropertyValue('font-size'), '15.4px')
  scaler.teardown()
})

test('teardown restores everything it touched', function () {
  const dom = scopedDocument()
  const scaler = createUiScaler({ document: dom.document, window: dom.win, })
  scaler.activate()
  scaler.setScale(1.2)
  scaler.teardown()
  assert.equal(dom.label.style.getPropertyValue('font-size'), '')
  assert.equal(dom.titleText.style.getPropertyValue('line-height'), '')
})