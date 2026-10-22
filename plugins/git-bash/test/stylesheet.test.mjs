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
