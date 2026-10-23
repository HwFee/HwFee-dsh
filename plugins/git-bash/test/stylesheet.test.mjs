/**
 * The stylesheet must be a STRING, not a multiplication of two strings.
 *
 * THE BUG THIS PINS (shipped three times, 2026-10-21 the third): the whole sheet
 * lives in one template literal. A pair of backticks inside a CSS comment —
 * even one that reads like ordinary prose, e.g. naming the universal child
 * selector — ends that literal early, and the remaining text parses as
 * JavaScript. Two backticks with a valid expression between them make the CSS
 * constant evaluate to `string * string`, i.e. `NaN`. Consequences, in order:
 *
 *   1. `installCss` throws `CSS.trim is not a function`;
 *   2. that throw happens inside the `ctx.effect` for the row stylesheet, i.e.
 *      BEFORE the `tool.call.toolview` registrations in the same `apply`;
 *   3. so `run_shell` / `pwsh` / `bash` silently render the host's generic
 *      card, and the plugin looks installed but does nothing.
 *
 * `node tools/build-client.mjs --check` does NOT catch it: it runs the module
 * factory (which only DEFINED `apply`) and never calls it. The live page shows
 * no error at all. Only evaluating the constant does.
 *
 * A static scan for backticks cannot work — this file legitimately contains
 * them. So the assertion is on the VALUE.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ROW_CSS } from '../client/src/styles.js'

test('shell payload seat is centred under its row and preserves command/output insets', function () {
  const body = /\.dsh-gb-tool-body\s*\{([^}]+)\}/.exec(ROW_CSS)?.[1]
  assert.ok(body, 'shell body rule must exist')
  assert.match(body, /margin:\s*4px 10px 8px 10px\s*;/,
    'a left-only 22px margin shifts shell cards relative to read cards')
  const request = /\.dsh-gb-tool-request\s*\{([^}]+)\}/.exec(ROW_CSS)?.[1]
  const output = /\.dsh-gb-tool-respond\s*\{([^}]+)\}/.exec(ROW_CSS)?.[1]
  assert.match(request, /padding:\s*8px 12px\s*;/)
  assert.match(output, /margin:\s*5px 0 0\s*;/)
  assert.match(output, /padding:\s*5px 8px\s*;/)
})

test('copy controls hide after pointer exit even when focus remains in the shell card', function () {
  const rules = [...ROW_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const reveals = rules.filter(([, selector, body]) => selector.includes('.dsh-gb-copy') && /opacity:\s*1\s*;/.test(body))
  assert.ok(reveals.length)
  for (const [, selectors] of reveals) {
    for (const selector of selectors.split(',')) {
      assert.ok(selector.includes(':hover'), 'copy reveal must require hover: ' + selector)
      assert.ok(!selector.includes(':focus'), 'focus must not keep copy visible: ' + selector)
    }
  }
})

test('the trajectory entrance floats over the command box and takes no layout room', function () {
  // THE USER'S COMPLAINT: the entrance sat on a line of its own under the card.
  // It is now a corner glyph like the copy control — absolutely positioned, so
  // it contributes nothing to the box's height.
  const rule = /\.dsh-gb-inspect\s*\{([^}]+)\}/.exec(ROW_CSS)?.[1]
  assert.ok(rule, 'the entrance rule must exist')
  assert.match(rule, /position:\s*absolute\s*;/,
    'a static control would occupy the flex row and grow the card')
  assert.match(rule, /top:\s*8px\s*;/)
  // 30px, not 8px: the copy control owns the 8px corner and this sits one seat
  // to its left (18px wide + a 4px gap).
  assert.match(rule, /right:\s*34px\s*;/)
  assert.match(rule, /width:\s*18px\s*;/)
  assert.match(rule, /height:\s*18px\s*;/)
  // No frame, no plate: the reference's rail is bare and lets the command show.
  assert.match(rule, /border:\s*0\s*;/)
  assert.match(rule, /background:\s*transparent\s*;/)
  assert.match(rule, /pointer-events:\s*none\s*;/,
    'an invisible but clickable control answers the pointer on blank space')
})

test('the corner pair reserves its width statically, so hover never reflows the command', function () {
  // The copy glyph spans 8-26px from the right and the entrance spans 30-48px,
  // so a wrapping command's first line would run under the entrance. The
  // reserve is keyed on the entrance EXISTING (our own marker attribute, not a
  // browser feature), and it is static: a reserve that appeared on hover would
  // reflow the command every time the pointer crossed the box. No VERTICAL room
  // is taken — that is the whole point of the floating glyph.
  const reserve = /\.dsh-gb-tool-request\[data-inspect\][^{]*\{([^}]+)\}/.exec(ROW_CSS)?.[1]
  assert.ok(reserve, 'the pair needs a shared horizontal reserve on the command')
  // 52px clears the seat cds-theme's shared chrome uses (right 34 + 18 wide)
  // as well as our own 30px, so the same sheet is correct under either owner.
  assert.match(reserve, /padding-right:\s*52px\s*;/)
  assert.doesNotMatch(reserve, /(^|[\s;{])(margin|height|min-height|padding-top|padding-bottom)\s*:/,
    'the reserve must be horizontal only — a vertical one is the extra row the user removed')
  const selector = /([^{}]*)\{[^}]*padding-right:\s*48px/.exec(ROW_CSS)?.[1] ?? ''
  assert.ok(!selector.includes(':hover'),
    'the reserve must not depend on hover: ' + selector)
})

test('the trajectory entrance reveals only on command-box hover', function () {
  // The command box owns the reveal; retained focus must not keep it visible.
  const rules = [...ROW_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const reveals = rules.filter(([, , body]) => /opacity:\s*1\s*;/.test(body) && /pointer-events:\s*auto\s*;/.test(body))
    .filter(([, selectors]) => selectors.includes('.dsh-gb-inspect'))
  assert.ok(reveals.length, 'the entrance must have a reveal rule')

  const selectors = reveals.flatMap(([, list]) => list.split(',').map((one) => one.trim())).filter((one) => one.includes('.dsh-gb-inspect'))
  assert.ok(selectors.includes('.dsh-gb-tool-request:hover .dsh-gb-inspect'),
    'the reveal must be scoped to the command box: ' + selectors.join(' | '))
  assert.ok(!selectors.includes('.dsh-gb-inspect:focus-visible'),
    'focus must not keep the control visible after pointer exit')
  for (const selector of selectors) {
    assert.ok(
      selector.includes(':hover'),
      'the entrance must never be painted unconditionally: ' + selector)
    assert.ok(!selector.includes('focus-within'),
      'retained focus after a click must not keep it visible: ' + selector)
    assert.ok(!/\.dsh-gb-tool:hover\s+\.dsh-gb-inspect/.test(selector),
      'the whole card is clickable; its hover would flash the control on the way past: ' + selector)
  }
})

test('the stylesheet constant is a string, not NaN from a broken template literal', function () {
  assert.equal(typeof ROW_CSS, 'string',
    'ROW_CSS is ' + typeof ROW_CSS + ' — the CSS template literal was ended early by a '
    + 'backtick in a comment. Fix the comment, do not just rebuild.')
  assert.ok(ROW_CSS.length > 10000,
    'the sheet is only ' + ROW_CSS.length + ' bytes — it was cut off part-way through')
})

test('the sheet runs to its final rule, i.e. it was not truncated mid-literal', function () {
  // The LAST selector in the sheet. If a comment above it broke the literal,
  // everything from the break onward never reaches the style tag.
  assert.ok(ROW_CSS.includes('.dsh-gb-tool-respond *:not(svg)'),
    'the tail of the sheet is missing — the literal was terminated before the end')
  // And the sheet closes cleanly: the final non-space character ends a block.
  assert.equal(ROW_CSS.trimEnd().endsWith('}'), true,
    'the sheet does not end on a closing brace: ' + JSON.stringify(ROW_CSS.trimEnd().slice(-60)))
})

test('no comment in the sheet carries a backtick', function () {
  // Belt and braces, because the VALUE test above only catches the variant
  // where both backticks land inside a valid expression. A lone backtick is a
  // build error instead (esbuild reports it), but it has also shipped as an
  // unbalanced pair before, so it is worth naming both.
  const comments = ROW_CSS.match(/\/\*[\s\S]*?\*\//g) ?? []
  const offenders = comments.filter(function (comment) { return comment.includes('`') })
  assert.deepEqual(offenders, [],
    'backtick(s) inside a CSS comment — this ends the enclosing template literal')
})
