/**
 * Measured cost of one usage-stats panel render, and of a heatmap hover.
 *
 * WHY. `panel.js` re-renders the WHOLE panel on every heatmap `mouseenter`
 * (one `useState` for the tooltip). The question the audit has to answer with a
 * number is: how much work is repeated per hover, and does memoising the heat
 * grid change it?
 *
 * The harness below is a minimal React with a REAL `useMemo` (identity-keyed
 * dependency cache, like React's) and a counting `createElement`. That is what
 * makes an element-reuse fix measurable: React bails out of a subtree when the
 * child element object is identical between renders, so the number of elements
 * a re-render constructs is the cost that fix removes.
 *
 * WHAT IT DOES NOT MEASURE: real DOM commit, style recalculation and paint.
 * Those need a browser. The numbers here are JS-side only, and are reported as
 * such.
 *
 *   node tools/bench-usage-render.mjs
 */

import { performance } from 'node:perf_hooks'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'plugins', 'usage-stats', 'client', 'src')
const { createPanel } = await import(pathToFileURL(join(src, 'panel.js')).href)

// ------------------------------------------------------- mini React (hooks)

/**
 * A hooks-capable React stand-in. `useMemo` caches on dependency identity and
 * survives across renders, which is the one property the measurement needs.
 */
function createReact() {
  const stats = { elements: 0 }
  const hooks = { slots: [], cursor: 0, effects: [], cleanups: [] }

  function beginRender() {
    hooks.cursor = 0
    hooks.effects = []
  }

  /** Run the effects the last render collected, once, like React's mount pass. */
  function flushEffects() {
    for (const effect of hooks.effects.splice(0)) {
      const cleanup = effect()
      if (typeof cleanup === 'function') hooks.cleanups.push(cleanup)
    }
  }

  const React = {
    Fragment: Symbol('Fragment'),

    createElement(type, props, ...children) {
      stats.elements += 1
      const next = Object.assign({}, props)
      if (children.length === 1) next.children = children[0]
      else if (children.length > 1) next.children = children
      return { type, props: next, children }
    },

    useState(initial) {
      const index = hooks.cursor++
      if (hooks.slots[index] === undefined) {
        hooks.slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      }
      const slot = hooks.slots[index]
      return [slot.value, function (value) {
        slot.value = typeof value === 'function' ? value(slot.value) : value
        slot.dirty = true
      }]
    },

    useMemo(factory, deps) {
      const index = hooks.cursor++
      const previous = hooks.slots[index]
      if (previous !== undefined && sameDeps(previous.deps, deps)) return previous.value
      const value = factory()
      hooks.slots[index] = { deps: deps === undefined ? undefined : deps.slice(), value }
      return value
    },

    useRef(value) {
      const index = hooks.cursor++
      if (hooks.slots[index] === undefined) hooks.slots[index] = { current: value }
      return hooks.slots[index]
    },

    useEffect(effect, deps) {
      const index = hooks.cursor++
      const previous = hooks.slots[index]
      if (previous !== undefined && sameDeps(previous.deps, deps)) return
      hooks.slots[index] = { deps: deps === undefined ? undefined : deps.slice() }
      hooks.effects.push(effect)
    },

    useSyncExternalStore(subscribe, getSnapshot) {
      const index = hooks.cursor++
      if (hooks.slots[index] === undefined) hooks.slots[index] = { unsubscribe: subscribe(function () {}) }
      return getSnapshot()
    },
  }

  return { React, stats, beginRender, flushEffects, hooks }
}

function sameDeps(a, b) {
  if (a === undefined || b === undefined) return a === b
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
  return true
}

// ------------------------------------------------------------- the fixture

/** A `perDay` map of `days` consecutive days, every `busyEvery`-th one active. */
function makePerDay(days, busyEvery) {
  const perDay = {}
  const today = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today.getTime() - i * 86400000)
    const key = date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0')
    perDay[key] = i % busyEvery === 0 ? 25 + (i % 30) : 0
  }
  return perDay
}

function makeSummary(days) {
  return {
    generatedAt: Date.now(),
    sessions: 420,
    messages: 12000,
    totalTokens: 9_400_000,
    activeDays: days,
    peakHour: 14,
    perDay: makePerDay(days, 2),
    perHour: new Array(24).fill(0).map((_, hour) => (hour * 7) % 30),
    perModel: {
      'deepseek-v4.1-flash': { tokens: 5_200_000, messages: 4200 },
      'deepseek-v4-pro': { tokens: 4_200_000, messages: 3100 },
    },
  }
}

// --------------------------------------------------------------- the runs

const CASES = [
  { label: '100 days', days: 100 },
  { label: '1 year', days: 365 },
  { label: '3 years', days: 1095 },
]

const T = function (key) { return key }

function renderOnce(panel, summary, react) {
  react.beginRender()
  const tree = panel.Panel({
    session: { blank: true, running: false, promptAttempted: false },
    fetchSummary: function () { return Promise.resolve(summary) },
    t: T,
  })
  react.flushEffects()
  return tree
}

/** Drain the microtask queue so the summary promise lands in state. */
async function settle() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

/** Find the value of the first `useMemo` slot — that is the cached heat grid. */
function findHeatElement(tree) {
  const stack = [tree]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (node.props && node.props.className === 'dus-heat') return node
    if (Array.isArray(node)) stack.push(...node)
    else if (node.children) stack.push(node.children)
  }
  return null
}

console.log('== panel render cost (JS side only; not DOM commit/paint) ==')
console.log('')
console.log('case        elements/render   heat cached?   ms/render (median of 200)')

for (const item of CASES) {
  const summary = makeSummary(item.days)
  const harness = createReact()
  const panel = createPanel({ React: harness.React, primitives: {}, settings: null })

  // Mount, then let the summary promise land so the panel is in its `ready`
  // state — the state a hover actually re-renders.
  renderOnce(panel, summary, harness)
  await settle()
  const ready = renderOnce(panel, summary, harness)
  const heatFirst = findHeatElement(ready)
  const firstElements = harness.stats.elements

  // A hover re-render: same props, same summary object, nothing changed but the
  // tooltip state — which is exactly what `setTip` produces.
  harness.stats.elements = 0
  const hovered = renderOnce(panel, summary, harness)
  const hoverElements = harness.stats.elements
  const heatSecond = findHeatElement(hovered)
  const heatCached = heatFirst !== null && heatFirst === heatSecond

  const samples = []
  for (let i = 0; i < 200; i += 1) {
    harness.stats.elements = 0
    const start = performance.now()
    renderOnce(panel, summary, harness)
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]

  console.log(
    item.label.padEnd(12) +
    String(hoverElements).padStart(6) + ' /' + String(firstElements).padEnd(9) +
    String(heatCached).padEnd(15) +
    median.toFixed(4) + ' ms')
}

console.log('')
console.log('"heat cached?" is whether the `.dus-heat` element object is IDENTICAL')
console.log('between two renders. React bails out of a subtree whose element object is')
console.log('unchanged, so `true` means a hover no longer reconciles any heat cell.')
