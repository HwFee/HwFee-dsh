/**
 * The floating "back to bottom" button: centred seat, streaming dots, down
 * affordance.
 *
 * This module emits CSS only — no DOM, no listeners, no timers. The state comes
 * from the host's own attributes through `:has()`, so the tests below assert the
 * emitted TEXT plus the state wiring, and the live renderer evidence lives in
 * `.work/tobottom-report.md`.
 *
 * Every assertion here is one of the four things a reader of the diff needs to
 * believe: the hook is stable, the seat is centred without covering the
 * composer, the dots only exist while the host says it is answering, and the
 * motion is CDS's (not linear) and stands still under reduced motion.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  TOBOTTOM_VIEW, TOBOTTOM_SLOT, TOBOTTOM_BUTTON, RUNNING_MARKER, STREAMING_MARKER,
  ANSWERING_GUARD, IDLE_GUARD, DOT_ANIMATION, DOT_CYCLE_MS, DOT_DELAYS, DOT_SIZE, DOT_GAP,
  PULSE, SNAP, answeringButton, idleButton, dotKeyframes, toBottomRules,
} from '../client/src/tobottom-styles.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize } from '../client/src/constants.js'
import { EASING } from '../client/src/palette.js'

/** Strip comments so prose can never look like a selector. */
function clean(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** selector -> body, ignoring @media nesting (the same parser css.test.mjs uses). */
function rules(text) {
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  const source = clean(text)
  let match = re.exec(source)
  while (match !== null) {
    out.push({ selector: match[1].trim().replace(/\s+/g, ' '), body: match[2].trim() })
    match = re.exec(source)
  }
  return out
}

const SHEET = buildCssFor(sanitize({}))
const BLOCK = toBottomRules()

// ------------------------------------------------------------- stable hooks

test('the button is found structurally, never by a salted class or a label', function () {
  const text = clean(BLOCK)
  // A salted CSS-Modules hash (e.g. xz4KEq_toBottomSlot) changes on every host
  // build: naming one would silently detach every rule after an upgrade.
  assert.doesNotMatch(text, /_\w+_\d+/, 'a salted host class may not appear')
  assert.doesNotMatch(text, /class\*?=/, 'no class-attribute guessing')
  // The accessible name is localized (`回到底部` / `Back to bottom`); keying on
  // it would break the moment the user switches the interface language.
  assert.doesNotMatch(text, /aria-label/, 'the localized aria-label is not a hook')
  // The anchor is the host's own slot outlet, then two structural steps down to
  // the seat whose ONLY child is a button.
  assert.ok(TOBOTTOM_VIEW.endsWith('[data-slot="conversation.view"]'))
  assert.ok(TOBOTTOM_SLOT.includes(':has(> button:only-child)'),
    'the seat is identified by having exactly one button child')
  assert.ok(TOBOTTOM_BUTTON.endsWith('> button:only-child'))
  // Every emitted selector that touches the button starts at the conversation
  // body and walks the same structural path to the slot, so no rule can latch
  // onto a different button elsewhere in the app.
  for (const rule of rules(BLOCK)) {
    if (!/button|svg|::before|::after/.test(rule.selector)) continue
    assert.ok(rule.selector.startsWith('[data-conversation-content]'),
      'a button rule escaped the conversation body: ' + rule.selector)
    assert.ok(rule.selector.includes('[data-slot="conversation.view"]'),
      'a button rule skipped the slot anchor: ' + rule.selector)
  }
})

// ------------------------------------------------------- centring the seat

test('the seat centres on the chat column and leaves the composer row alone', function () {
  const seat = rules(BLOCK).filter(function (rule) { return rule.selector === TOBOTTOM_SLOT })
  assert.equal(seat.length, 1, 'exactly one seat rule')
  const body = seat[0].body
  assert.match(body, /justify-content: center !important/)
  // The host's right seat is an inline padding-right derived from the composer
  // clearance; both sides are zeroed so the flex centre is the seat centre.
  assert.match(body, /padding-right: 0 !important/)
  assert.match(body, /padding-left: 0 !important/)
  // Vertical placement stays the host's. Moving the button down is what would
  // put it over the composer card, so nothing here may set it.
  for (const property of ['bottom', 'top', 'position', 'transform', 'margin']) {
    assert.ok(!new RegExp('(^|[;\\s])' + property + '\\s*:').test(body),
      property + ' would move the control off the host seat')
  }
  // Nothing in the block reaches the composer, the input, or the page body.
  assert.doesNotMatch(clean(BLOCK), /data-composer|data-input-scroll|^\s*body\b/m)
})

// --------------------------------------------------------------- the cursor

test('the cursor says "clickable", and nothing claims a resize or a drag', function () {
  const button = rules(BLOCK).find(function (rule) { return rule.selector === TOBOTTOM_BUTTON })
  assert.ok(button, 'expected the button rule')
  assert.match(button.body, /cursor: pointer !important/)
  // `grabbing`/`grab`/`move` claim a drag; `s-resize`/`ns-resize`/`row-resize`
  // claim a resize handle. This control does neither — it scrolls the transcript.
  const miscursors = /cursor:\s*(?:grabbing|grab|move|all-scroll|s-resize|n-resize|ns-resize|row-resize|col-resize)/i
  assert.doesNotMatch(clean(BLOCK), miscursors, 'a misleading cursor shape was found')
  // "Down" is carried by the chevron itself: it trends downward on hover.
  const idleSvg = rules(BLOCK).find(function (rule) { return rule.selector === idleButton() + ':hover > svg' })
  assert.ok(idleSvg, 'expected the hover rule that drops the chevron')
  assert.match(idleSvg.body, /transform: translateY\(2px\)/)
})

// -------------------------------------------------- dots only while answering

test('the dots are gated on the host say-so, not on a timer or the view phase', function () {
  // The host mounts the running row only while a turn runs, and marks streaming
  // markdown with data-streaming. Both are OR'd, because either can appear
  // first. data-content-phase is deliberately absent: it stays "active" in an
  // idle conversation and would leave the dots running forever.
  assert.equal(RUNNING_MARKER, 'data-chat-running')
  assert.equal(STREAMING_MARKER, 'data-streaming')
  assert.ok(ANSWERING_GUARD.includes('[data-chat-running]'))
  assert.ok(ANSWERING_GUARD.includes('[data-streaming]'))
  assert.ok(ANSWERING_GUARD.startsWith('[data-conversation-content]'), 'the guard rides the conversation body')
  assert.doesNotMatch(clean(BLOCK), /data-content-phase/, 'the view phase is not the answering state')

  // Every rule that draws a dot carries the answering guard.
  const dotRules = rules(BLOCK).filter(function (rule) {
    return /(?:::before|::after|> svg(?:\s|>|$)|> svg > path)/.test(rule.selector) && rule.selector.includes('button')
  })
  assert.ok(dotRules.length >= 4, 'expected the two pseudos, the svg and its path')
  for (const rule of dotRules) {
    assert.ok(rule.selector.includes('[data-chat-running]') && rule.selector.includes('[data-streaming]'),
      'a dot rule is not guarded: ' + rule.selector)
  }
  // The idle rules are the exact complement, so the chevron's hover dip can
  // never fight the dots' transform.
  assert.ok(IDLE_GUARD.includes(':not(:has([data-chat-running]))'))
  assert.ok(IDLE_GUARD.includes(':not(:has([data-streaming]))'))
  for (const rule of rules(BLOCK).filter(function (rule) {
    // Only rules that touch the GLYPH need a state: the button's own hover
    // (surface and ink) applies in both states, which is the point.
    return rule.selector.includes(':hover') && /svc|::before|::after|> svg/.test(rule.selector)
  })) {
    assert.ok(rule.selector.includes(IDLE_GUARD) || rule.selector.includes(ANSWERING_GUARD),
      'a hover rule on the glyph must name the state it belongs to: ' + rule.selector)
  }
  // HOVERING WHILE BUSY RESTORES THE ARROW. The dots say "working"; the pointer
  // says "you can click this", so the control answers with what the click does.
  const busyHover = rules(BLOCK).filter(function (rule) {
    return rule.selector.includes(ANSWERING_GUARD) && rule.selector.includes(':hover')
  })
  assert.ok(busyHover.length >= 3, 'expected the busy hover to drop the dots and restore the chevron')
  const restoredPath = busyHover.find(function (rule) { return /> svg > path$/.test(rule.selector) })
  assert.ok(restoredPath, 'the chevron stroke must come back on hover')
  assert.match(restoredPath.body, /stroke: currentColor/)
  // The two pseudo dots are dropped together in ONE rule, so match by inclusion
  // rather than by an exact selector.
  const dropped = busyHover.find(function (rule) {
    return rule.selector.includes('::before') && rule.selector.includes('::after')
  })
  assert.ok(dropped, 'expected one rule dropping both pseudo dots')
  assert.match(dropped.body, /content: none/)
  assert.match(dropped.body, /animation: none/)
})

test('the three dots are built from existing nodes, not inserted children', function () {
  // The button owns exactly one element child (the chevron svg) and is a flex
  // box, so the wave uses two pseudos plus the svg in DOM order.
  assert.equal(DOT_SIZE, '4px')
  assert.equal(DOT_GAP, '6px')
  // 3 dots + 2 gaps must fit the host's 34px button without resizing it, AND
  // leave real air at the ring: 24px inside 34px is 5px per side. The earlier
  // 5px/8px row measured 31px and read as dots touching the circle.
  const row = Number.parseInt(DOT_SIZE, 10) * 3 + Number.parseInt(DOT_GAP, 10) * 2
  assert.ok(row <= 34, 'the dot row must fit inside the host button')
  assert.ok(row <= 26, 'the dot row must leave air at the ring, measured ' + row + 'px')
  const before = rules(BLOCK).find(function (rule) { return rule.selector.endsWith('::before') })
  const after = rules(BLOCK).find(function (rule) { return rule.selector.endsWith('::after') })
  for (const [name, rule] of [['::before', before], ['::after', after]]) {
    assert.ok(rule, 'expected the ' + name + ' dot')
    assert.match(rule.body, /content: ""/)
    assert.match(rule.body, /border-radius: 50%/)
    assert.match(rule.body, /background: currentColor/)
  }
  // The svg keeps its box and becomes the middle dot; only its STROKE is
  // removed (not the element), and the aria-label still names the control for
  // assistive tech. `display: none` is avoided on purpose: a `:has()` rule that
  // hides anything is guarded against by test/thememode.test.mjs, whose rule is
  // that a relational hide may only ever target a settings row.
  const svg = rules(BLOCK).find(function (rule) {
    return rule.selector === answeringButton() + ' > svg'
  })
  assert.ok(svg, 'expected the svg-as-dot rule')
  assert.match(svg.body, new RegExp('width: ' + DOT_SIZE))
  assert.match(svg.body, /background: currentColor/)
  const path = rules(BLOCK).find(function (rule) { return rule.selector.endsWith('> svg > path') })
  assert.match(path.body, /stroke: none/)
  assert.ok(!/display|visibility|opacity/.test(path.body),
    'the chevron is neutralised by its stroke, so the dot keeps its box and its ink')
})

// -------------------------------------------------------------- the motion

test('the wave uses CDS curves, never linear, and only animates transform', function () {
  assert.ok(!/\blinear\b/.test(clean(BLOCK)), 'no linear timing anywhere in the block')
  assert.ok(!/ease-in-out/.test(clean(BLOCK)), 'no generic ease-in-out')
  // The two CDS curves, with a literal fallback so the block is safe even if the
  // token layer is off.
  assert.equal(SNAP, 'var(--ds-ease-snap, ' + EASING.snap + ')')
  assert.equal(PULSE, 'var(--cds-ease-pulse, ' + EASING.pulse + ')')
  assert.ok(dotKeyframes().includes('animation-timing-function: ' + SNAP + ';'),
    'the rise decelerates on the snap curve')
  assert.ok(dotKeyframes().includes('animation-timing-function: ' + PULSE + ';'),
    'the settle rides the pulse curve')

  // Per-keyframe timing functions split the loop into rise and settle, which is
  // why neither end is a browser default.
  const frames = [...dotKeyframes().matchAll(/(\d+)%\s*\{([^}]*)\}/g)]
  assert.ok(frames.length >= 3, 'expected the three keyframe stops')
  for (const [, , body] of frames) {
    const declarations = body.split(';').map(function (part) { return part.trim() }).filter(Boolean)
    for (const declaration of declarations) {
      const property = declaration.slice(0, declaration.indexOf(':')).trim()
      // Layout properties are forbidden: this animates while the transcript is
      // streaming, and a layout-animating dot would reflow the whole column.
      assert.ok(property === 'transform' || property === 'animation-timing-function',
        'keyframes may only animate transform, got ' + property)
    }
  }
  // The animation itself may only move the dot. Keyframes are checked above;
  // here the concern is the DECLARATIONS that come alive later: a `transition`
  // naming a layout property would reflow the transcript on every hover while
  // it is streaming.
  const layout = /(?:^|[;\s])(?:width|height|margin[\w-]*|padding[\w-]*|top|right|bottom|left|inset|gap|font-size|line-height)\s*:/
  for (const rule of rules(BLOCK).filter(function (entry) { return /(^|[;\s])transition:/.test(entry.body) })) {
    const transitioned = rule.body
      .split(';')
      .map(function (part) { return part.trim() })
      .filter(function (part) { return part.startsWith('transition') })
      .join(';')
    assert.ok(!layout.test(transitioned.replace(/transition[^:]*:/g, '')),
      'a transition may not animate layout: ' + rule.selector + ' -> ' + transitioned)
  }
  // Every declaration that ARMS a wave names the dot keyframes. The
  // reduced-motion branch is the one legitimate `animation: none`, so the test
  // looks at the DECLARATION VALUE rather than pattern-matching the rule body
  // (a `(?!none)` lookahead backtracks over the optional space and matches
  // anyway — the assertion has to read the value, not guess at it).
  const valueOf = function (body, property) {
    return body
      .split(';')
      .map(function (part) { return part.trim() })
      .filter(function (part) { return part.startsWith(property + ':') })
      .map(function (part) { return part.slice(property.length + 1).trim() })
  }
  const armed = rules(BLOCK).filter(function (entry) {
    return valueOf(entry.body, 'animation').some(function (value) { return value !== 'none' && value !== 'none !important' })
  })
  assert.ok(armed.length >= 3, 'expected the three dots to be animated')
  for (const rule of armed) {
    assert.match(rule.body, new RegExp('animation:\\s*' + DOT_ANIMATION + '\\b'),
      'an animated rule must use the dot keyframes: ' + rule.selector)
  }
  // And the only `none` values live in the reduced-motion branch.
  const disarmed = rules(BLOCK).filter(function (entry) {
    return valueOf(entry.body, 'animation').includes('none !important')
  })
  assert.ok(disarmed.length >= 1, 'expected the reduced-motion stand-down')
  for (const rule of disarmed) {
    assert.ok(!/transform:\s*translate/.test(rule.body), 'the stand-down must not keep a lift')
  }
})

test('the three dots are staggered into a wave', function () {
  // Read the delay from EACH dot rather than in emission order: the svg rule is
  // written before the two pseudo rules, so a positional list would be wrong.
  const delayOf = function (selector) {
    const rule = rules(BLOCK).find(function (entry) { return entry.selector === selector })
    assert.ok(rule, 'expected a rule for ' + selector)
    const found = /animation-delay:\s*([^;]+);/.exec(rule.body)
    assert.ok(found, 'no animation delay on ' + selector)
    return found[1].trim()
  }
  const answering = answeringButton()
  assert.deepEqual([
    delayOf(answering + '::before'),
    delayOf(answering + ' > svg'),
    delayOf(answering + '::after'),
  ], DOT_DELAYS, 'each dot starts its own phase of the cycle, left to right')
  assert.equal(DOT_DELAYS.length, 3)
  assert.equal(new Set(DOT_DELAYS).size, 3, 'the offsets must differ')
  assert.ok(DOT_CYCLE_MS >= 900 && DOT_CYCLE_MS <= 1600,
    'one loop must stay inside the 1.0-1.5s band the design systems use')
})

// ---------------------------------------------------------- reduced motion

test('reduced motion stops the wave instead of slowing it', function () {
  const media = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/.exec(clean(BLOCK).trim())
  assert.ok(media, 'the block must end with a reduced-motion branch')
  assert.match(media[1], /animation: none !important/)
  // Not "slower": no duration may survive the branch.
  assert.match(media[1], /transition: none !important/)
  assert.match(media[1], /transform: none !important/)
  assert.ok(!/animation-duration|animation-delay/.test(media[1]),
    'a shortened duration is still motion')
  // It must cover every moving part.
  for (const part of ['::before', '::after', '> svg']) {
    assert.ok(media[1].includes(part), 'reduced motion must also stop ' + part)
  }
})

// ------------------------------------------------------------------ wiring

test('the block is emitted only with the component half switched on', function () {
  assert.ok(SHEET.includes(toBottomRules()), 'the default sheet carries the block')
  assert.ok(SHEET.includes(DOT_ANIMATION))
  // `refine` is the component escape hatch: a user who distrusts component rules
  // gets the host's own button back, dots and centring included.
  assert.ok(!buildCssFor(sanitize({ refine: false })).includes(TOBOTTOM_BUTTON))
  assert.equal(buildCssFor(sanitize({ enabled: false })), '')
})

test('the sheet stays parseable and free of the template-literal trap', function () {
  // The repo's known trap: a backtick inside a CSS comment ends the surrounding
  // template string early and produces a bundle that throws at load time. This
  // module is written with concatenation only, so its prose may NAME the trap
  // (this file does) — what must never exist is a backtick in CODE, or in the
  // emitted CSS text. Strip comments first, then look.
  const source = readFileSync(new URL('../client/src/tobottom-styles.js', import.meta.url), 'utf8')
  // Strip BOTH comment forms: a `//` line may name the trap freely, and a CSS
  // comment inside a concatenated array is not a string hazard at all.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  assert.ok(!code.includes('\u0060'),
    'a template literal in this module would make every CSS comment a syntax hazard')
  assert.ok(!BLOCK.includes('\u0060'), 'the emitted CSS text may not contain a backtick')
  const open = (BLOCK.match(/\{/g) || []).length
  const close = (BLOCK.match(/\}/g) || []).length
  assert.equal(open, close, 'unbalanced braces in the block')
  // The keyframes must be emitted once, at top level, not nested in a rule.
  assert.equal((BLOCK.match(/@keyframes /g) || []).length, 1)
  assert.ok(!/\.[A-Za-z0-9]+_[A-Za-z0-9]+_\d/.test(BLOCK))
})
