import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findNativeCopyButtons, createNativeCopyMarker, NATIVE_COPY_ATTR } from '../client/src/native-copy.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize } from '../client/src/constants.js'

// Minimal structural DOM: only tag/data selectors, no host CSS class names.
class Element {
  constructor(tag = 'div', attrs = {}, text = '') {
    this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.textContent = text
    this.children = []; this.parentElement = null; this.nodeType = 1; this.writes = 0
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child) }; return this }
  get firstElementChild() { return this.children[0] || null }
  get lastElementChild() { return this.children.at(-1) || null }
  get isConnected() { return this.closest('body') !== null }
  hasAttribute(key) { return Object.hasOwn(this.attrs, key) }
  getAttribute(key) { return this.attrs[key] ?? null }
  setAttribute(key, value) { this.attrs[key] = value; this.writes++ }
  removeAttribute(key) { delete this.attrs[key] }
  matches(selector) {
    return selector.split(',').some(part => {
      const s = part.trim()
      return s[0] === '[' ? this.hasAttribute(s.slice(1, -1)) : this.tagName === s.toUpperCase()
    })
  }
  closest(selector) { for (let el = this; el; el = el.parentElement) if (el.matches(selector)) return el; return null }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]) }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
}
const el = (...args) => new Element(...args)
function setup() {
  let observe, cancelled = 0, pending = null, disconnected = false
  const body = el('body'), flow = el('div', { 'data-conversation-content': '' })
  body.append(flow)
  const doc = {
    body, querySelectorAll: selector => body.querySelectorAll(selector),
    defaultView: {
      MutationObserver: class {
        constructor(fn) { observe = fn }
        observe(target, options) { assert.equal(target, body); assert.equal(options.characterData, true) }
        disconnect() { disconnected = true }
      },
      requestAnimationFrame(fn) { pending = fn; return 1 },
      cancelAnimationFrame() { pending = null; cancelled++ },
    },
  }
  return { doc, body, flow, mutate(records) { observe(records) }, flush() { const fn = pending; pending = null; fn?.() }, get pending() { return pending }, get cancelled() { return cancelled }, get disconnected() { return disconnected } }
}
function card(kind, text = '复制') {
  const root = el('div', { ['data-' + kind]: '' }), copy = el('button', {}, text)
  if (kind === 'diff') root.append(copy, el())
  else if (kind === 'read') root.append(el().append(el('span'), el().append(el('span'), copy)), el())
  else root.append(el().append(el('span'), copy), el())
  return { root, copy }
}

test('finds grep/glob and legacy read/diff/terminal copy, never file/expand controls or outside chat', () => {
  const s = setup(), expected = []
  for (const kind of ['search', 'read', 'diff', 'terminal']) {
    const c = card(kind); s.flow.append(c.root); expected.push(c.copy)
    c.root.append(el('button', { 'aria-expanded': 'false' }, '复制'))
  }
  const empty = el('div', { 'data-search': 'paths' }).append(el().append(el('span')), el('div', {}, '无结果'))
  s.flow.append(empty)
  s.body.append(card('search').root)
  const modern = card('read'); modern.copy.parentElement.setAttribute('data-code-block-banner', '')
  s.flow.append(modern.root)
  assert.deepEqual([...findNativeCopyButtons(s.doc)], expected)
})

test('success/restore follows native text without replacing text, attributes or handlers', () => {
  const s = setup(), c = card('search', 'Copy'); s.flow.append(c.root)
  const click = () => {}; c.copy.onclick = click
  c.copy.setAttribute('aria-label', 'Copy results')
  const marker = createNativeCopyMarker(s.doc); marker.start()
  assert.equal(c.copy.getAttribute(NATIVE_COPY_ATTR), 'idle')
  const writes = c.copy.writes; marker.sweep(); assert.equal(c.copy.writes, writes)
  for (const text of ['Copied', '复制成功', '已复制', '复制']) {
    c.copy.textContent = text
    s.mutate([{ type: 'characterData', target: { nodeType: 3, parentElement: c.copy } }]); s.flush()
    assert.equal(c.copy.getAttribute(NATIVE_COPY_ATTR), text === '复制' ? 'idle' : 'copied')
  }
  assert.equal(c.copy.onclick, click); assert.equal(c.copy.textContent, '复制')
  marker.stop(); assert.equal(c.copy.hasAttribute(NATIVE_COPY_ATTR), false)
  assert.equal(c.copy.getAttribute('aria-label'), 'Copy results'); assert.equal(s.disconnected, true)
})

test('late mounts are batched, streaming text is ignored, stop cancels and re-enable works', () => {
  const s = setup(), marker = createNativeCopyMarker(s.doc); marker.start()
  s.mutate([{ type: 'characterData', target: { nodeType: 3, parentElement: s.flow } }]); assert.equal(s.pending, null)
  const c = card('search'); s.flow.append(c.root)
  s.mutate([{ target: s.flow, addedNodes: [c.root] }]); assert.ok(s.pending)
  marker.stop(); assert.equal(s.cancelled, 1); assert.equal(c.copy.hasAttribute(NATIVE_COPY_ATTR), false)
  marker.start(); assert.equal(c.copy.getAttribute(NATIVE_COPY_ATTR), 'idle')
  s.flow.children = []; c.root.parentElement = null
  s.mutate([{ target: s.flow, removedNodes: [c.root] }]); s.flush()
  assert.equal(c.copy.hasAttribute(NATIVE_COPY_ATTR), false)
  marker.stop()
})

test('native icons share copy tokens, retain success feedback, and follow refine/master gates', () => {
  const css = buildCssFor(sanitize({}))
  assert.match(css, /\[data-cds-native-copy\],[\s\S]*?width: var\(--cds-copy-size\)/)
  assert.match(css, /\[data-cds-native-copy\]::before \{[\s\S]*?width: var\(--cds-copy-icon\)/)
  assert.match(css, /\[data-cds-native-copy="copied"\]::before/)
  assert.ok(!css.includes('[data-code-block-banner]:focus-within'), 'retained focus must not reveal the banner')
  for (const state of [{ refine: false }, { enabled: false }]) {
    assert.ok(!buildCssFor(sanitize(state)).includes('[data-cds-native-copy]'))
  }
})
