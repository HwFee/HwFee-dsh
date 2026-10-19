/**
 * The rendered row: N stops in, N stops out.
 *
 * A fake React (the three hooks the row uses) renders the component tree into
 * plain objects, so these tests assert the DOM the user would get without a
 * browser: the number of tick marks, the range's `max`, the `aria-valuetext`,
 * the Default badge, the max warning, and the two degenerate branches.
 *
 * The point of every assertion here is the same: the control's stop count is
 * the provider's `reasoning.efforts.length`, never a constant.
 *
 *   node test/view.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createPanel } from '../client/src/panel.js'
import { createEffortController } from '../client/src/controller.js'
import { en, makeTranslator, zh } from '../client/src/locales.js'

const t = makeTranslator(en)
const tzh = makeTranslator(zh)

// ------------------------------------------------------------ fake React

/**
 * A React stand-in: `createElement`, one store hook, and mutable state hooks.
 * `useState` keeps its value per component instance across re-renders driven by
 * `render()`, which is enough for a row with two local flags.
 */
function fakeReact() {
  const states = []
  let cursor = 0
  return {
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      const next = props || {}
      if (typeof type === 'function') {
        return type(Object.assign({}, next, {
          children: children.length > 0 ? children : next.children,
        }))
      }
      return { type, props: next, children }
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      return getSnapshot()
    },
    useState(initial) {
      const slot = cursor
      cursor += 1
      if (!(slot in states)) states[slot] = initial
      return [states[slot], function set(value) { states[slot] = value }]
    },
    useEffect() { /* effects are not exercised by the static render assertions */ },
    beginRender() { cursor = 0 },
  }
}

/** A controller stub whose snapshot the test controls. */
function stubController(snapshot) {
  return {
    getSnapshot() { return snapshot },
    subscribe() { return function () {} },
    setEffort() { return Promise.resolve({ ok: true }) },
    start() {},
    dispose() {},
  }
}

/** Render the row once against one snapshot. */
function renderRow(snapshot, translate) {
  const React = fakeReact()
  const controller = stubController(snapshot)
  const panel = createPanel({ React, controller })
  React.beginRender()
  return panel.EffortRow({ t: translate === undefined ? t : translate })
}

/** Walk a rendered tree and collect every element of one type. */
function elementsOfType(node, type, out) {
  const collected = Array.isArray(out) ? out : []
  if (node === null || node === undefined || typeof node !== 'object') return collected
  if (Array.isArray(node)) {
    for (const child of node) elementsOfType(child, type, collected)
    return collected
  }
  if (node.type === type) collected.push(node)
  for (const child of node.children) elementsOfType(child, type, collected)
  return collected
}

/** Collect every visible string in a rendered tree. */
function textOf(node, out) {
  const collected = Array.isArray(out) ? out : []
  if (node === null || node === undefined || typeof node === 'boolean') return collected
  if (typeof node === 'string' || typeof node === 'number') { collected.push(String(node)); return collected }
  if (Array.isArray(node)) {
    for (const child of node) textOf(child, collected)
    return collected
  }
  for (const child of node.children) textOf(child, collected)
  return collected
}

/** A ready snapshot for a model advertising the given ids. */
function ready(ids, options) {
  const opts = options === undefined ? {} : options
  return {
    phase: 'ready',
    sessionId: 's1',
    provider: 'magpie',
    modelId: 'm1',
    reasoning: {
      efforts: ids.map(function (id) { return { id: id, name: id.charAt(0).toUpperCase() + id.slice(1) } }),
      ...(opts.defaultEffort === undefined ? {} : { defaultEffort: opts.defaultEffort }),
    },
    selected: opts.selected,
    error: undefined,
    catalogStatus: 'ready',
  }
}

// ------------------------------------------------------------- N === 0

test('no advertised levels render no row at all', function () {
  for (const state of [
    ready([]),
    Object.assign(ready([]), { reasoning: null }),
    Object.assign(ready(['low']), { reasoning: undefined }),
  ]) {
    assert.equal(renderRow(state), null, 'a model without metadata must render nothing')
  }
})

// ------------------------------------------------------------- N === 1

test('one advertised level renders a label, not a one-stop slider', function () {
  const tree = renderRow(ready(['high'], { defaultEffort: 'high', selected: 'high' }))
  assert.notEqual(tree, null)
  assert.equal(elementsOfType(tree, 'input').length, 0, 'a single level must not be a slider')
  const text = textOf(tree).join(' ')
  assert.match(text, /High/)
  assert.match(text, /Default/, 'the Default marker follows defaultEffort')
  // The label names the fixed level for assistive tech too.
  const labels = []
  ;(function walk(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (node.props && typeof node.props['aria-label'] === 'string') labels.push(node.props['aria-label'])
    node.children.forEach(walk)
  })(tree)
  assert.ok(labels.some(function (label) { return /High/.test(label) }),
    'the single-level label must carry the level name')
})

// ------------------------------------------------------------ N >= 2

test('two advertised levels render a two-stop slider', function () {
  const tree = renderRow(ready(['low', 'high'], { defaultEffort: 'low', selected: 'low' }))
  const sliders = elementsOfType(tree, 'input')
  assert.equal(sliders.length, 1)
  const slider = sliders[0]
  assert.equal(slider.props.type, 'range')
  assert.equal(slider.props.min, 0)
  assert.equal(slider.props.max, 1, 'a two-level model gets two stops, not five')
  assert.equal(slider.props.step, 1)
  assert.equal(slider.props.value, 0)
  assert.equal(elementsOfType(tree, 'span').filter(function (s) { return s.props.className === 'dre-tick' }).length, 2)
})

test('three advertised levels render three stops', function () {
  const tree = renderRow(ready(['low', 'medium', 'high'], { defaultEffort: 'high', selected: 'medium' }))
  const slider = elementsOfType(tree, 'input')[0]
  assert.equal(slider.props.max, 2)
  assert.equal(slider.props.value, 1)
  assert.equal(slider.props['aria-valuetext'], 'Thinking effort, Medium, level 2 of 3')
  const ticks = elementsOfType(tree, 'span').filter(function (s) { return s.props.className === 'dre-tick' })
  assert.equal(ticks.length, 3)
  // Tick positions are evenly spaced over the track.
  assert.deepEqual(ticks.map(function (tick) { return tick.props.style.left }), ['0%', '50%', '100%'])
  // Ticks up to and including the active stop are clay.
  assert.deepEqual(ticks.map(function (tick) { return tick.props['data-past'] }), ['true', 'true', 'false'])
})

test('five advertised levels render five stops', function () {
  const tree = renderRow(ready(['low', 'medium', 'high', 'xhigh', 'max'], { defaultEffort: 'high', selected: 'max' }))
  const slider = elementsOfType(tree, 'input')[0]
  assert.equal(slider.props.max, 4)
  assert.equal(slider.props.value, 4)
  assert.equal(slider.props['aria-valuetext'], 'Thinking effort, Max, level 5 of 5')
  const ticks = elementsOfType(tree, 'span').filter(function (s) { return s.props.className === 'dre-tick' })
  assert.equal(ticks.length, 5)
  assert.deepEqual(ticks.map(function (tick) { return tick.props.style.left }), ['0%', '25%', '50%', '75%', '100%'])
})

test('the stop count follows the catalog, not a constant', function () {
  for (const ids of [['low', 'high'], ['low', 'medium', 'high'], ['low', 'medium', 'high', 'xhigh', 'max']]) {
    const tree = renderRow(ready(ids, { selected: ids[0] }))
    const slider = elementsOfType(tree, 'input')[0]
    assert.equal(slider.props.max, ids.length - 1, ids.length + ' levels → max ' + (ids.length - 1))
  }
})

// --------------------------------------------------------------- copy

test('the selected level name and description sit under the track', function () {
  const tree = renderRow(ready(['low', 'medium', 'high'], { defaultEffort: 'high', selected: 'medium' }))
  const text = textOf(tree).join(' ')
  assert.match(text, /Medium/)
  assert.match(text, /Light, casual tasks/)
  // The Default badge belongs to high, not to the selected medium.
  assert.ok(!/Default/.test(text), 'the unselected default level must not show the badge')
})

test('the Default badge appears on the default level, wherever the provider put it', function () {
  const tree = renderRow(ready(['low', 'medium', 'high'], { defaultEffort: 'low', selected: 'low' }))
  assert.match(textOf(tree).join(' '), /Default/)
  // A model that defaults to medium marks medium, not high.
  const medium = renderRow(ready(['low', 'medium', 'high'], { defaultEffort: 'medium', selected: 'medium' }))
  assert.match(textOf(medium).join(' '), /Default/)
})

test('the max warning shows only while max is selected', function () {
  const atMax = renderRow(ready(['low', 'max'], { defaultEffort: 'low', selected: 'max' }))
  assert.match(textOf(atMax).join(' '), /May use excessive tokens/, 'the reference warning is the copy')
  const atLow = renderRow(ready(['low', 'max'], { defaultEffort: 'low', selected: 'low' }))
  assert.ok(!/May use excessive tokens/.test(textOf(atLow).join(' ')), 'not while another stop is selected')
})

test('an unknown advertised id renders the catalog name and no invented copy', function () {
  const tree = renderRow(ready(['minimal', 'high'], { selected: 'minimal' }))
  const text = textOf(tree).join(' ')
  assert.match(text, /Minimal/, 'the provider name is shown')
  assert.ok(!/Quick replies/.test(text))
  assert.ok(!/Balanced for everyday work/.test(text), 'no description for an unknown id')
})

test('the Chinese locale renders Chinese copy and level names', function () {
  const tree = renderRow(ready(['low', 'high'], { defaultEffort: 'low', selected: 'low' }), tzh)
  const text = textOf(tree).join(' ')
  assert.match(text, /思考强度/)
  assert.match(text, /低/)
  assert.match(text, /默认/)
  assert.ok(!/Thinking effort/.test(text), 'zh must be pure Chinese')
})

// ------------------------------------------------------- degraded states

test('a missing session renders the explanation and no control', function () {
  const tree = renderRow({
    phase: 'no-session', sessionId: undefined, provider: undefined, modelId: undefined,
    reasoning: null, selected: undefined, error: undefined, catalogStatus: 'ready',
  })
  assert.notEqual(tree, null)
  assert.equal(elementsOfType(tree, 'input').length, 0)
  assert.match(textOf(tree).join(' '), /Open a session/)
})

test('a loading catalog renders a quiet line and no control', function () {
  const tree = renderRow({
    phase: 'loading', sessionId: 's1', provider: undefined, modelId: undefined,
    reasoning: null, selected: undefined, error: undefined, catalogStatus: 'loading',
  })
  assert.equal(elementsOfType(tree, 'input').length, 0)
  assert.match(textOf(tree).join(' '), /Reading the model catalog/)
})

test('a catalog error renders the error line and no control', function () {
  const tree = renderRow({
    phase: 'error', sessionId: 's1', provider: undefined, modelId: undefined,
    reasoning: null, selected: undefined, error: 'gateway/internal: catalog unavailable', catalogStatus: 'error',
  })
  assert.equal(elementsOfType(tree, 'input').length, 0)
  const text = textOf(tree).join(' ')
  assert.match(text, /gateway\/internal/)
  assert.match(text, /Effort change failed/)
})
