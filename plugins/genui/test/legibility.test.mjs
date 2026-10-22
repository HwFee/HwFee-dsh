/**
 * The legibility pass: a card may not paint its own answer invisible.
 *
 * THE INCIDENT THESE TESTS PIN. A model drew a comparison card and coloured its
 * headline with `var(--dsw-alias-code-diff-deleted)` — a token whose name says
 * "red" and whose value is `rgba(186, 39, 35, 0.08)`, because the host uses it
 * as a tint BEHIND diff lines. The "99.5%" rendered at rgb(247, 235, 234) on a
 * rgb(252, 252, 251) surface. The user's report was "the percentage is covered".
 * Nothing covered it: the text was painted at one thirteenth of its colour.
 *
 * So the rule under test is a MEASUREMENT, not a token list: any text colour
 * below MIN_TEXT_ALPHA is the bug, whatever token produced it. That is why the
 * fixtures below use several different tokens — the list is not the contract.
 *
 * WHY A FAKE DOM. The rule reads `getComputedStyle(el).color`, which Node does
 * not provide. The fake reports the colour a real browser would compute for the
 * inline style, which is the only part of the pipeline the rule touches; the
 * real-token numbers used here were measured from the running app.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const {
  MIN_TEXT_ALPHA,
  LEGIBLE_ATTR,
  parseComputedColor,
  repairInvisibleText,
  observeInvisibleText,
} = await import('../client/src/legibility.js')

/**
 * Build one fake element.
 *
 * `inline` is the style the test's "snippet" set; `computed` is what the
 * browser would resolve it to. Keeping them separate is the point: the rule
 * must read the COMPUTED colour, because a token's alpha only exists after
 * resolution.
 *
 * @param {object} opts
 * @param {string} [opts.text] a direct text child
 * @param {string} [opts.inline] the declared `color`
 * @param {string} [opts.computed] the resolved `color`
 * @param {string} [opts.backgroundClip] e.g. `text` for gradient text
 * @returns {object} a DOM-shaped fake
 */
function element({ text, inline, computed, backgroundClip } = {}) {
  const attributes = new Map()
  const declarations = new Map()
  if (inline !== undefined) declarations.set('color', inline)
  const node = {
    nodeType: 1,
    childNodes: text === undefined ? [] : [{ nodeType: 3, nodeValue: text }],
    children: [],
    style: {
      setProperty(name, value) { declarations.set(name, value) },
      getPropertyValue(name) { return declarations.get(name) ?? '' },
    },
    attributes,
    setAttribute(name, value) { attributes.set(name, value) },
    getAttribute(name) { return attributes.get(name) ?? null },
    append(child) { this.children.push(child); this.childNodes.push(child); return child },
    // RECURSIVE, like the real thing. A body with a wrapper around the text is
    // the normal case, and a shallow walk would never reach the text child.
    querySelectorAll() {
      const found = []
      const visit = (node) => {
        for (const child of node.children) {
          found.push(child)
          visit(child)
        }
      }
      visit(this)
      return found
    },
  }
  node.__computed = {
    color: computed ?? '',
    backgroundClip: backgroundClip ?? 'border-box',
  }
  return node
}

/** A card body whose window resolves each element's own `__computed`. */
function surface(children) {
  const root = element()
  for (const child of children) root.append(child)
  const document = {
    defaultView: {
      getComputedStyle: (node) => node.__computed ?? { color: '', backgroundClip: 'border-box' },
    },
  }
  root.ownerDocument = document
  return root
}

/** Shorthand: one card body with a single text element. */
function cardWith(options) {
  return surface([element(options)])
}

test('the alpha floor sits in the gap between ink and fill tokens', function () {
  // The constants are load-bearing, so they are asserted as a range rather than
  // as a number: every ink token the host ships is 1.0 (or 0.3 for the shimmer
  // used by skeleton loaders), and every fill token tops out at 0.24. A floor
  // below 0.24 would repair a legitimate diff background; one above 0.3 would
  // start rewriting deliberately faint text.
  assert.ok(MIN_TEXT_ALPHA > 0.08, 'the diff fill (0.08) must be below the floor')
  assert.ok(MIN_TEXT_ALPHA > 0.24, 'every fill token must be below the floor')
  assert.ok(MIN_TEXT_ALPHA <= 0.3, 'the faintest ink token (0.3) must not be repaired')
})

test('the reported bug: a diff fill used as a headline colour is repaired', function () {
  // REGRESSION, measured from the screenshot: `--dsw-alias-code-diff-deleted`
  // resolved to rgba(186, 39, 35, 0.08), which composited to rgb(247, 235, 234)
  // on the card surface. The number was there, at 8% of its colour.
  const root = cardWith({ text: '99.5%', inline: 'rgba(186, 39, 35, 0.08)', computed: 'rgba(186, 39, 35, 0.08)' })
  const repaired = repairInvisibleText(root)

  assert.equal(repaired, 1, 'exactly one element carries the text')
  const child = root.children[0]
  assert.equal(child.style.getPropertyValue('color'), 'rgb(186, 39, 35)',
    'the hue is kept and only the alpha is dropped — that is the colour the model meant')
  assert.equal(child.getAttribute(LEGIBLE_ATTR), '', 'the repair is marked for a test to see')
})

test('the repair composites nothing, so it cannot reproduce the invisible result', function () {
  // A tempting wrong fix: blend rgba(186,39,35,0.08) over the card surface. That
  // returns rgb(247, 235, 234) — the exact colour in the screenshot, i.e. the
  // bug. The repair must DROP the alpha, not flatten the fill.
  const root = cardWith({ text: '99.5%', computed: 'rgba(186, 39, 35, 0.08)' })
  repairInvisibleText(root)
  const painted = root.children[0].style.getPropertyValue('color')
  assert.notEqual(painted, 'rgb(247, 235, 234)', 'flattening the fill is the bug, not the fix')
  assert.equal(painted, 'rgb(186, 39, 35)', 'the intended danger red')
})

test('opaque text is left completely alone', function () {
  const root = cardWith({ text: '94 KB', inline: 'rgb(21, 21, 21)', computed: 'rgb(21, 21, 21)' })
  assert.equal(repairInvisibleText(root), 0)
  assert.equal(root.children[0].getAttribute(LEGIBLE_ATTR), null,
    'an untouched element must stay untouched — no marker, no inline write')
})

test('a deliberately faint label is not repaired', function () {
  // `--dsw-alias-label-shimmer` is rgba(0, 0, 0, 0.3): a skeleton animation, not
  // a mistake. The floor exists to keep this out of the repair.
  const root = cardWith({ text: 'loading…', computed: 'rgba(0, 0, 0, 0.3)' })
  assert.equal(repairInvisibleText(root), 0)
})

test('every translucent fill family is caught, not just the diff token', function () {
  // THE LIST IS NOT THE CONTRACT. The same mistake is available through any fill
  // token, and a deny-list would have to grow with the host's palette. These are
  // the values the running theme reports for four different token families.
  const samples = [
    'rgba(47, 158, 68, 0.10)',   // --dsw-alias-code-diff-added
    'rgba(20, 20, 20, 0.06)',    // --dsw-alias-border-l1 used as a colour
    'rgba(232, 89, 12, 0.10)',   // --dsw-alias-state-warn-tertiary
    'rgba(186, 39, 35, 0.14)',   // --dsw-alias-file-diff-deleted-gutter
  ]
  for (const color of samples) {
    const root = cardWith({ text: 'value', computed: color })
    assert.equal(repairInvisibleText(root), 1, `${color} must be repaired`)
  }
})

test('a wrapper that only inherits is not written to; its text child is', function () {
  // The repair belongs on the element that owns the text. Writing an inline
  // colour onto an empty wrapper would override the snippet's own intent for
  // everything inside it — including children that are painted correctly.
  const wrapper = element()
  const child = element({ text: '99.5%', computed: 'rgba(186, 39, 35, 0.08)' })
  wrapper.append(child)
  const root = surface([wrapper])

  assert.equal(repairInvisibleText(root), 1)
  assert.equal(wrapper.style.getPropertyValue('color'), '', 'the wrapper keeps no colour of its own')
  assert.equal(child.style.getPropertyValue('color'), 'rgb(186, 39, 35)')
})

test('gradient text is skipped, because transparent ink is the technique there', function () {
  // `background-clip: text` + `color: transparent` is how a gradient headline is
  // built. Repairing it would replace the gradient with a flat colour.
  const root = cardWith({ text: 'Gradient', computed: 'rgba(0, 0, 0, 0)', backgroundClip: 'text' })
  assert.equal(repairInvisibleText(root), 0)
})

test('an unparsable colour is left alone rather than guessed at', function () {
  // A detached node reports `''`; a future engine may report `color(srgb …)`.
  // Doing nothing is the only defensible answer — inventing a colour would
  // overwrite something the snippet meant.
  for (const color of ['', 'color(srgb 1 0 0)', 'transparent', 'not-a-colour']) {
    const root = cardWith({ text: 'x', computed: color })
    assert.equal(repairInvisibleText(root), 0, `${JSON.stringify(color)} must not be rewritten`)
  }
})

test('the pass is idempotent: a second run rewrites nothing', function () {
  // The observer fires on every mutation, so a repair that retriggers itself
  // would spin. Idempotence comes from the MEASUREMENT (the colour is opaque
  // now), not from a marker attribute.
  const root = cardWith({ text: '99.5%', computed: 'rgba(186, 39, 35, 0.08)' })
  assert.equal(repairInvisibleText(root), 1)

  // The fake resolves the rewritten inline value, exactly as a browser would.
  const child = root.children[0]
  child.__computed = { color: child.style.getPropertyValue('color'), backgroundClip: 'border-box' }
  assert.equal(repairInvisibleText(root), 0, 'a repaired element must not be repaired twice')
})

test('a subtree with no window degrades to a no-op', function () {
  // `repairInvisibleText` is called from an effect that React may run in a test
  // renderer with no DOM at all. It must not throw there.
  assert.equal(repairInvisibleText(null), 0)
  assert.equal(repairInvisibleText({}), 0)
})

test('observe() runs a first pass immediately and can be disposed', function () {
  // THE LIFECYCLE THIS PINS. A card unmounts every time the row scrolls away.
  // An observer left connected keeps sweeping a detached subtree, which is the
  // repository's documented observer-leak failure.
  const root = cardWith({ text: '99.5%', computed: 'rgba(186, 39, 35, 0.08)' })
  let connected = false
  let disconnected = false
  const frames = []
  root.ownerDocument.defaultView.MutationObserver = class {
    constructor(callback) { this.callback = callback }
    observe() { connected = true }
    disconnect() { disconnected = true }
  }
  root.ownerDocument.defaultView.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length }
  root.ownerDocument.defaultView.cancelAnimationFrame = () => {}

  const dispose = observeInvisibleText(root)
  assert.equal(root.children[0].style.getPropertyValue('color'), 'rgb(186, 39, 35)',
    'the first pass runs at observe time, before any mutation arrives')
  assert.equal(connected, true, 'and the observer is connected for later renders')

  dispose()
  assert.equal(disconnected, true, 'dispose must disconnect, or a recycled row leaks a sweep')
})

test('a mutation schedules one pass per frame, not one per mutation', function () {
  // A snippet that renders a table mutates once per cell. Sweeping per mutation
  // would walk the card dozens of times for one answer.
  const root = cardWith({ text: '99.5%', computed: 'rgba(186, 39, 35, 0.08)' })
  const frames = []
  let observer = null
  root.ownerDocument.defaultView.MutationObserver = class {
    constructor(callback) { this.callback = callback; observer = this }
    observe() {}
    disconnect() {}
  }
  root.ownerDocument.defaultView.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length }
  root.ownerDocument.defaultView.cancelAnimationFrame = () => {}

  const dispose = observeInvisibleText(root)
  for (let i = 0; i < 5; i += 1) observer.callback()
  assert.equal(frames.length, 1, 'five mutations in one frame coalesce to one pass')

  // Running the queued frame allows the next mutation to schedule again.
  frames[0]()
  observer.callback()
  assert.equal(frames.length, 2, 'and the next frame gets its own pass')
  dispose()
})

test('a host with no MutationObserver still gets the one-shot repair', function () {
  // An exotic host (or a test renderer) may not expose an observer. The repair
  // is still worth doing once; only the "later renders" half is lost.
  const root = cardWith({ text: '99.5%', computed: 'rgba(186, 39, 35, 0.08)' })
  const dispose = observeInvisibleText(root)
  assert.equal(root.children[0].style.getPropertyValue('color'), 'rgb(186, 39, 35)')
  assert.equal(typeof dispose, 'function')
  dispose()
})

test('parseComputedColor accepts the syntaxes an engine may report', function () {
  assert.deepEqual(parseComputedColor('rgb(21, 21, 21)'), { r: 21, g: 21, b: 21, a: 1 })
  assert.deepEqual(parseComputedColor('rgba(186, 39, 35, 0.08)'), { r: 186, g: 39, b: 35, a: 0.08 })
  assert.deepEqual(parseComputedColor('rgb(186 39 35 / 8%)'), { r: 186, g: 39, b: 35, a: 0.08 },
    'the modern space-separated syntax with a percentage alpha')
  assert.equal(parseComputedColor(''), null)
  assert.equal(parseComputedColor(null), null)
})

test('the frame runtime wires the pass into the card subtree and disposes it', function () {
  // WHAT THIS PROVES, AND WHAT IT CANNOT. The tests above drive `legibility.js`
  // directly, so on their own they would still pass if nothing ever CALLED it —
  // the "correct module, unreachable" failure this repository has hit before.
  //
  // WHERE IT RUNS MOVED. The pass used to run in `card.js` over the host-rendered
  // body. The body lives in the sandboxed frame now, so the pass runs THERE: a
  // host-side pass could not reach the card's DOM across the origin boundary at
  // all, and the measurement needs `getComputedStyle` on the card's own nodes.
  const runtime = readFileSync(new URL('../client/src/frame/runtime.js', import.meta.url), 'utf8')

  assert.match(runtime, /import \{ observeInvisibleText \} from '\.\.\/legibility\.js'/,
    'the runtime must import the pass')
  assert.match(runtime, /document\.getElementById\('root'\)/,
    'it observes the CARD root: the frame has no plugin chrome to repair')
  assert.match(runtime, /disposeLegibility\(\)/,
    'the disposer must be reached — a card unmounts on every scroll, and an '
    + 'observer left connected sweeps a detached subtree')

  // And the HOST must not do it: a pass over the iframe element measures a
  // rectangle, not the card's text, and would walk the host document instead.
  const card = readFileSync(new URL('../client/src/card.js', import.meta.url), 'utf8')
  assert.equal(/observeInvisibleText|repairInvisibleText/.test(card), false,
    'the host half must not run the legibility pass over its own document')
})

test('the plugin stylesheet does not colour its own chrome with a fill token', function () {
  // The failure panel is the plugin's OWN markup, so the legibility pass — which
  // measures only the card body — would never see a translucent edge there.
  // Pinned at the other end: the stylesheet must name the opaque ink.
  const css = readFileSync(new URL('../client/src/styles.js', import.meta.url), 'utf8')
  const failure = /\.dsh-genui-failure\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  assert.ok(failure !== '', 'the failure panel must exist')
  assert.match(failure, /border-left:\s*2px solid var\(--dsw-alias-state-error-primary\)/,
    'the edge uses the opaque error ink; --dsw-alias-code-diff-deleted is rgba(…, 0.08) and '
    + 'renders a 2px rule at eight percent opacity, i.e. no edge at all')
})

