import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createPanel } from '../client/src/panel.js'

/**
 * A React stand-in that calls function components immediately and leaves host
 * elements as plain objects, so a panel can be rendered to a tree without a DOM.
 */
const React = {
  useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] },
  createElement(type, props, ...children) {
    const merged = { ...(props ?? {}), children: children.length === 0 ? undefined : children }
    if (typeof type === 'function') return type(merged)
    return { type, props: merged }
  },
}

const { Panel } = createPanel({ React })

/** Collect every text node in a rendered tree, in order. */
function texts(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out)
    return out
  }
  const children = node.props?.children
  if (children !== undefined) texts(children, out)
  return out
}

/** Depth-first search for the first node matching a predicate. */
function find(node, predicate) {
  if (node === null || node === undefined || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, predicate)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (predicate(node)) return node
  return find(node.props?.children, predicate)
}

const PRESSURE = { projectedTokens: 256_300, contextWindow: 1_000_000 }
const BREAKDOWN = { systemTokens: 9000, toolsTokens: 30_600, messageTokens: 209_700 }
const USAGE = { uncachedInputTokens: 12_000, outputTokens: 3000, cacheReadTokens: 45_000, cacheWriteTokens: 1200 }

test('the rail renders the three cards in order', () => {
  const tree = Panel({ pressure: PRESSURE, breakdown: BREAKDOWN, usage: USAGE, cwd: '/tmp/project', model: 'deepseek-v4.1-flash', title: 'Session' })
  const cards = []
  const collect = (node) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(collect)
    const id = node.props?.['data-dcr-card']
    if (id !== undefined) cards.push(id)
    collect(node.props?.children)
  }
  collect(tree)
  assert.deepEqual(cards, ['environment', 'context', 'usage'])
})

test('the context card reads percent, figures and four bar segments', () => {
  const tree = Panel({ pressure: PRESSURE, breakdown: BREAKDOWN })
  const bar = find(tree, (node) => node.props?.['data-dcr-bar'] === 'context')
  assert.ok(bar, 'the segmented bar must render')
  const flat = []
  const flatten = (node) => {
    if (Array.isArray(node)) return node.forEach(flatten)
    if (node !== null && typeof node === 'object') flat.push(node)
  }
  flatten(bar.props.children)
  const segments = flat.filter((child) => child.props?.['data-band'] !== undefined)
  assert.deepEqual(segments.map((segment) => segment.props['data-band']), ['system', 'tools', 'messages', 'free'])
  assert.deepEqual(segments.map((segment) => segment.props.style.width),
    ['0.93%', '3.15%', '21.56%', '74.37%'])
  const text = texts(tree).join(' ')
  assert.ok(text.includes('26%'), 'the percent reads 26')
  assert.ok(text.includes('~256k / 1M'), 'the figures pair used and window')
  assert.ok(text.includes('~210k'), 'the messages band shows its own count')
})

test('the context card shows the empty state before any projection', () => {
  const tree = Panel({})
  const text = texts(tree).join(' ')
  assert.ok(text.includes('还没有上下文数据'),
    'the embedded fallback copy must appear: ' + text)
})

test('the usage card totals the four counters', () => {
  const tree = Panel({ pressure: PRESSURE, breakdown: BREAKDOWN, usage: USAGE })
  const text = texts(tree).join(' ')
  assert.ok(text.includes('61.2k'), 'input 12k + output 3k + cache read 45k + cache write 1.2k = 61.2k')
})

test('missing props never throw', () => {
  assert.doesNotThrow(() => Panel({}))
  assert.doesNotThrow(() => Panel({ pressure: {}, breakdown: {}, usage: {} }))
})

test('every section header is a collapse button with a chevron', () => {
  const tree = Panel({ pressure: PRESSURE, breakdown: BREAKDOWN, usage: USAGE })
  const heads = []
  const collect = (node) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(collect)
    if (node.type === 'button' && node.props?.className === 'dcr-head') heads.push(node)
    collect(node.props?.children)
  }
  collect(tree)
  assert.equal(heads.length, 3)
  for (const head of heads) assert.equal(head.props['aria-expanded'], true)
  const chevrons = []
  const findChevrons = (node) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(findChevrons)
    if (node.props?.className === 'dcr-chevron') chevrons.push(node)
    findChevrons(node.props?.children)
  }
  findChevrons(tree)
  assert.equal(chevrons.length, 3)
})

test('the context header carries the percent and every row its share', () => {
  const text = texts(Panel({ pressure: PRESSURE, breakdown: BREAKDOWN })).join(' ')
  assert.ok(text.includes('26% 已用'), 'header percent: ' + text)
  assert.ok(text.includes('0.9%'), 'system share')
  assert.ok(text.includes('3.1%'), 'tools share')
  assert.ok(text.includes('21.6%'), 'messages share')
  assert.ok(text.includes('74.4%'), 'free share shares the occupancy total')
})
