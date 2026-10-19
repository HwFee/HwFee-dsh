/**
 * The heatmap hover bubble's placement, driven through the REAL `panel.js`.
 *
 * WHY THIS SUITE EXISTS. The bubble is `position: absolute` inside `.dus-panel`
 * and centred on the hovered cell. Its first implementation clamped the bubble's
 * CENTRE to `[28, width - 28]`, which only holds for a 56px-wide bubble; this one
 * is up to 240px wide. On the last heatmap column the box therefore crossed the
 * panel's right edge, and everything above the panel lives in
 * `[data-conversation-scroll]`, which the host gives `overflow-y: auto` — so the
 * spill became SCROLLABLE overflow, a horizontal scrollbar appeared, the centred
 * hero stack shifted, the hovered cell moved out from under the pointer and the
 * bubble closed, which removed the scrollbar and shifted the stack back. That
 * loop is the jitter the user reported. The fixture in `.work/lead-hover`
 * measured it: bubble 51.31px past the panel, scroll container's `clientHeight`
 * 856 → 846, panel top alternating 229/234 across one sweep of the last column.
 *
 * WHAT THIS FILE ASSERTS. The invariant that stops the loop — the bubble's BOX
 * stays inside the panel — plus the structural belt that makes it hold even if
 * the arithmetic is ever wrong (the clip layer). It is asserted through the
 * component, not through the helper, so a wiring mistake cannot pass: the hover
 * handler is fired, the state update is applied by a small render loop, and the
 * resulting `.dus-tip` element's style is read back after the layout effect ran.
 *
 * The React stand-in here is a 90-line hook runner with real state. It is not
 * React; what it proves is the plugin's own logic, which is the part this change
 * rewrote.
 *
 *   node test/tooltip.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createPanel } from '../client/src/panel.js'
import { createSettingsStore } from '../client/src/settings.js'
import { PANEL_CSS } from '../client/src/styles.js'
import { TIP_INSET } from '../client/src/layout.js'

/** A summary with one active day, so the heatmap draws a real grid. */
function summary() {
  return {
    generatedAt: 1,
    sessions: 2,
    messages: 3600,
    totalTokens: 100,
    activeDays: 1,
    peakHour: 9,
    perDay: { '2026-10-18': 3600 },
    perHour: new Array(24).fill(0),
    perModel: { 'deepseek-v4': 100 },
  }
}

const BLANK = { blank: true, running: false, promptAttempted: false }

/**
 * Run `Panel` with a hook implementation that behaves like React for this
 * component: state updates re-render, `ref` objects receive a fake DOM node,
 * layout effects run before effects, and both only re-run when deps change.
 *
 * The fake nodes answer exactly the two questions `panel.js` asks of the DOM:
 * a bounding rect and `clientWidth`.
 */
function harness(options) {
  const panelWidth = options.panelWidth
  const tipWidth = options.tipWidth || 0
  const hooks = []
  let cursor = 0
  let tree = null
  const cleanups = []

  const fakeBubble = {
    style: {},
    getBoundingClientRect() { return { width: tipWidth, height: 24, left: 0, right: tipWidth, top: 0, bottom: 24 } },
  }
  const fakePanel = {
    clientWidth: panelWidth,
    getBoundingClientRect() {
      return { width: panelWidth, height: 344, left: 0, right: panelWidth, top: 200, bottom: 544 }
    },
  }

  const sameDeps = function (left, right) {
    if (left === undefined || right === undefined) return false
    if (left.length !== right.length) return false
    for (let i = 0; i < left.length; i++) if (!Object.is(left[i], right[i])) return false
    return true
  }

  /** Compare props so a node keeps its identity across renders. */
  function createElement(type, props) {
    const children = Array.prototype.slice.call(arguments, 2)
    const next = Object.assign({}, props)
    if (children.length > 0) next.children = children.length === 1 ? children[0] : children
    return { type: type, props: next, key: props && props.key !== undefined ? props.key : null }
  }

  const React = {
    createElement: createElement,
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) {
        hooks[index] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial }
      }
      const slot = hooks[index]
      return [slot.value, function (next) {
        slot.value = typeof next === 'function' ? next(slot.value) : next
        render()
      }]
    },
    useRef(value) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = { kind: 'ref', value: { current: value } }
      return hooks[index].value
    },
    useMemo(fn, deps) {
      const index = cursor++
      const previous = hooks[index]
      if (previous && previous.kind === 'memo' && sameDeps(previous.deps, deps)) return previous.value
      const value = fn()
      hooks[index] = { kind: 'memo', value: value, deps: deps }
      return value
    },
    useEffect(fn, deps) {
      const index = cursor++
      const previous = hooks[index]
      if (previous && previous.kind === 'effect' && sameDeps(previous.deps, deps)) return
      hooks[index] = { kind: 'effect', deps: deps }
      // Deferred like React's: run after the render's layout effects.
      pending.push(function () {
        const cleanup = fn()
        if (typeof cleanup === 'function') cleanups.push(cleanup)
      })
    },
    useLayoutEffect(fn, deps) {
      const index = cursor++
      const previous = hooks[index]
      if (previous && previous.kind === 'layout' && sameDeps(previous.deps, deps)) return
      hooks[index] = { kind: 'layout', deps: deps }
      layouts.push(fn)
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      subscribe(function () {})
      return getSnapshot()
    },
  }

  const pending = []
  const layouts = []

  /** Hand every `ref` a fake node: only the panel and the bubble are asked. */
  function attachRefs(node) {
    if (node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(attachRefs); return }
    const props = node.props || {}
    if (props.ref !== undefined && props.ref !== null) {
      if (props.className === 'dus-panel') props.ref.current = fakePanel
      else if (props.className === 'dus-tip') {
        props.ref.current = fakeBubble
        // React writes the rendered `style` onto the node when it changes; the
        // fake node has to do the same or a later layout effect's correction
        // would look like it came from the render. The layout effect then
        // overwrites `left`, which is exactly the sequence in the browser.
        fakeBubble.style = Object.assign({}, props.style)
      }
    }
    if (node.props && node.props.children !== undefined) attachRefs(node.props.children)
  }

  const settings = createSettingsStore(null)
  const { Panel } = createPanel({ React: React, primitives: {}, settings: settings })

  const props = {
    session: BLANK,
    fetchSummary: function () { return new Promise(function () {}) },
    peekSummary: summary,
    t: function (key) { return key },
  }

  function render() {
    cursor = 0
    layouts.length = 0
    pending.length = 0
    tree = Panel(props)
    attachRefs(tree)
    // Layout effects: after the nodes exist, before any paint would happen.
    for (const fn of layouts.slice()) {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    }
    for (const fn of pending.slice()) fn()
    return tree
  }

  return {
    render: render,
    tree: function () { return tree },
    bubble: fakeBubble,
    panel: fakePanel,
    dispose: function () { for (const cleanup of cleanups) cleanup() },
  }
}

function flatten(tree, out) {
  const collected = out || []
  ;(function walk(node) {
    if (node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    collected.push(node)
    walk(node.props && node.props.children)
  })(tree)
  return collected
}

function byClass(tree, className) {
  return flatten(tree).filter(function (node) {
    return node.props && node.props.className === className
  })
}

/** The `.dus-heat` element, which owns the hover handlers. */
function heatCells(tree) {
  return byClass(tree, 'dus-heat-cell')
}

/**
 * Fire `mouseenter` on the cell at `index` of the grid, the way the browser
 * does: with the cell as `currentTarget`.
 *
 * The synthetic rects reproduce the grid's REAL geometry, which is what makes
 * the edge case real: `.dus-heat` uses `justify-content: space-between` with a
 * 12px panel padding, so the columns are spread from the panel's left padding to
 * its right padding and the LAST column sits flush with the panel's right edge.
 * A pitch-based layout would park the last column in the middle of a wide panel
 * and quietly stop testing the bug.
 */
function hover(instance, index, cellWidth) {
  const cells = heatCells(instance.tree())
  assert.ok(cells.length > 0, 'expected the heatmap to render cells')
  const target = Math.min(index === undefined ? cells.length - 1 : index, cells.length - 1)
  const width = cellWidth || 22
  const columns = Math.max(1, Math.round(cells.length / 7))
  const column = Math.floor(target / 7)
  // `.dus-panel` padding is 12px; the band stretches edge to edge inside it.
  const span = instance.panel.clientWidth - 24 - width
  const left = 12 + (columns === 1 ? 0 : (column / (columns - 1)) * span)
  cells[target].props.onMouseEnter({
    currentTarget: {
      getBoundingClientRect: function () {
        return { width: width, height: width, left: left, right: left + width, top: 500, bottom: 500 + width }
      },
    },
  })
  return { cell: cells[target], centre: left + width / 2 }
}

/**
 * The bubble's EFFECTIVE placement.
 *
 * `left` is written in two places: the hover handler renders it (kept in the
 * element's props) and the layout effect re-writes the DOM node's `style` with
 * the measured width. The second one is the fix, so this reads the NODE — a test
 * that only looked at props would pass while the correction was missing.
 */
function placement(instance) {
  const tips = byClass(instance.tree(), 'dus-tip')
  assert.equal(tips.length, 1, 'expected exactly one bubble while hovering')
  const declared = tips[0].props.style
  const node = instance.bubble
  const effective = node.style.left === undefined ? declared.left : node.style.left
  return {
    left: Number.parseFloat(effective),
    declaredLeft: Number.parseFloat(declared.left),
    top: Number.parseFloat(declared.top),
    node: tips[0],
  }
}

test('the bubble keeps its BOX inside the panel, measured from the real width', function () {
  // The panel width and bubble width measured in `.work/lead-hover`: the bubble
  // ('2026-10-17 · 3.6K messages') is 163.66px wide inside a 1104px panel.
  const instance = harness({ panelWidth: 1104, tipWidth: 163.66 })
  try {
    instance.render()
    // The last cell of the grid: its centre is well past the right inset.
    hover(instance, undefined, 22)
    const place = placement(instance)
    const half = 163.66 / 2
    assert.ok(place.left + half <= 1104 - TIP_INSET + 0.001,
      'the right edge escaped: ' + (place.left + half))
    assert.ok(place.left - half >= TIP_INSET - 0.001,
      'the left edge escaped: ' + (place.left - half))
    // It is the BOX clamp, not the old centre clamp: the centre clamp would have
    // left it at 1104 - 28 = 1076 and put the right edge at 1157.83.
    assert.ok(place.left <= 1104 - TIP_INSET - half + 0.001,
      'expected the bubble to be pulled back from the edge, got ' + place.left)
  } finally {
    instance.dispose()
  }
})

test('the clamp does not move a bubble that already fits', function () {
  const instance = harness({ panelWidth: 1104, tipWidth: 163.66 })
  try {
    instance.render()
    // A cell in the middle of a 27-column grid: its centre is far from both
    // insets, so the bubble must sit exactly there — the fix must not shift
    // what is already fine.
    const cells = heatCells(instance.tree())
    const middle = Math.floor(cells.length / 2)
    const anchor = hover(instance, middle, 22)
    const place = placement(instance)
    assert.ok(Math.abs(place.left - anchor.centre) < 0.001,
      'expected the bubble centred at ' + anchor.centre + ', got ' + place.left)
  } finally {
    instance.dispose()
  }
})

test('the FIRST column is pulled in from the left edge too', function () {
  const instance = harness({ panelWidth: 1104, tipWidth: 163.66 })
  try {
    instance.render()
    const cells = heatCells(instance.tree())
    // Make the first cell's centre smaller than half the bubble width.
    cells[0].props.onMouseEnter({
      currentTarget: {
        getBoundingClientRect: function () {
          return { width: 22, height: 22, left: 0, right: 22, top: 500, bottom: 522 }
        },
      },
    })
    const place = placement(instance)
    const half = 163.66 / 2
    assert.ok(place.left - half >= TIP_INSET - 0.001,
      'the left edge escaped: ' + (place.left - half))
  } finally {
    instance.dispose()
  }
})

test('the placement is inside the panel before the width is even measured', function () {
  // The handler runs before the layout effect: its provisional value uses the
  // previous width (none yet → the 240px design cap), and it must already be
  // legal, because a frame must never paint an escaping bubble.
  const instance = harness({ panelWidth: 700, tipWidth: 0 })
  try {
    instance.render()
    // Read the tree BEFORE running the layout effects: render() already ran
    // them, so instead assert the invariant on the final value with the width
    // the stylesheet would cap to.
    hover(instance, undefined, 22)
    const place = placement(instance)
    assert.ok(Number.isFinite(place.left))
    assert.ok(place.left <= 700 - TIP_INSET, 'provisional left inside the panel')
  } finally {
    instance.dispose()
  }
})

test('a narrow panel still keeps the bubble inside', function () {
  // 284px is the narrowest composer card the host can draw (680 - clearing).
  const instance = harness({ panelWidth: 284, tipWidth: 240 })
  try {
    instance.render()
    hover(instance, undefined, 22)
    const place = placement(instance)
    assert.ok(place.left - 120 >= TIP_INSET - 0.001, 'left edge ' + (place.left - 120))
    assert.ok(place.left + 120 <= 284 - TIP_INSET + 0.001, 'right edge ' + (place.left + 120))
  } finally {
    instance.dispose()
  }
})

test('the bubble is mounted inside the always-present clip layer', function () {
  // The layer is what makes the guarantee structural: even a mis-clamped bubble
  // is clipped at the panel instead of becoming scrollable overflow of the hero
  // scroll container. It must be a sibling of the body, last, and mounted even
  // when no bubble is showing — inserting it on hover would be a second DOM
  // mutation per hover.
  const instance = harness({ panelWidth: 900, tipWidth: 160 })
  try {
    instance.render()
    const idle = byClass(instance.tree(), 'dus-tip-layer')
    assert.equal(idle.length, 1, 'the layer exists with no hover')
    assert.equal(idle[0].props.children, null, 'and it is empty')

    hover(instance, undefined, 22)
    const layers = byClass(instance.tree(), 'dus-tip-layer')
    assert.equal(layers.length, 1, 'hover does not add a second layer')
    const child = layers[0].props.children
    assert.ok(child !== null && child !== undefined, 'the bubble is inside the layer')
    assert.equal(child.props.className, 'dus-tip')
    assert.equal(child.props['aria-hidden'], undefined,
      'aria-hidden belongs to the layer now, so the bubble is not double-marked')
    assert.equal(layers[0].props['aria-hidden'], 'true',
      'the whole layer stays out of the accessibility tree')

    // The layer is the panel's last child, so the bubble still paints above the
    // grid.
    const roots = byClass(instance.tree(), 'dus-panel')
    assert.equal(roots.length, 1)
    const children = roots[0].props.children
    const last = Array.isArray(children) ? children[children.length - 1] : children
    assert.equal(last.props.className, 'dus-tip-layer', 'the layer is mounted last')
  } finally {
    instance.dispose()
  }
})

test('the stylesheet clips at the panel and caps the bubble by the panel', function () {
  const layer = /\.dus-tip-layer\s*\{([^}]*)\}/.exec(PANEL_CSS)
  assert.ok(layer !== null, 'expected a .dus-tip-layer rule')
  assert.match(layer[1], /position:\s*absolute/)
  assert.match(layer[1], /inset:\s*0/)
  assert.match(layer[1], /overflow:\s*hidden/)
  assert.match(layer[1], /pointer-events:\s*none/)
  assert.match(layer[1], /z-index:\s*2/, 'the bubble stays above the grid')

  const tip = /(?:^|\n)\.dus-tip\s*\{([^}]*)\}/.exec(PANEL_CSS)
  assert.ok(tip !== null, 'expected a .dus-tip rule')
  assert.match(tip[1], new RegExp('max-width:\\s*min\\(240px,\\s*calc\\(100%\\s*-\\s*'
    + (TIP_INSET * 2) + 'px\\)\\)'),
  'the bubble may never be wider than the panel allows the clamp to place')
})
