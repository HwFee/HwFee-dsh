/**
 * The link underline in the assistant markdown scope.
 *
 * Regression: a link (`示例网站`) followed on the same line by an inline-code
 * chip (`查看文档`) had its underline sitting so close to the chip's left border
 * that the two read as touching. The underline now sits 3px below the baseline
 * instead of 2px, which drops its 1px band to the chip's bottom-left corner
 * rather than part-way up the chip's side border. The reasoning is in the
 * `markdown-scope.js` header ("WHY 3px AND NOT 2px").
 *
 * The other assertions here are not new behaviour — they guard the parts of the
 * rule that the offset change must not have disturbed: the 1px thickness, the
 * `color-mix` decoration colour, and the `EXCLUDE` scoping that keeps the rule
 * out of a code block or an inline chip.
 *
 *   node test/markdown-link.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { markdownScopeRules, MARKDOWN_ROOT, EXCLUDE } from '../client/src/markdown-scope.js'

/** The emitted rule whose selector ends in `a[href]` (not `:hover`). */
function linkRule() {
  const text = markdownScopeRules()
  const start = text.indexOf(MARKDOWN_ROOT + ' a[href]')
  assert.notEqual(start, -1, 'expected an a[href] rule in the markdown scope block')
  const open = text.indexOf('{', start)
  const close = text.indexOf('}', open)
  return { selector: text.slice(start, open).trim(), body: text.slice(open + 1, close) }
}

test('the link underline sits 3px below the baseline', function () {
  // The one value this change moves: 2px put the band inside the adjacent
  // chip's side border. Reverting it to 2px must turn this red.
  assert.match(linkRule().body, /^\s*text-underline-offset: 3px;$/m)
})

test('the underline keeps its 1px thickness and an actual underline', function () {
  const body = linkRule().body
  assert.match(body, /^\s*text-decoration-thickness: 1px;$/m)
  assert.match(body, /^\s*text-decoration-line: underline;$/m)
})

test('the decoration colour is still the 45% accent mix', function () {
  assert.match(linkRule().body,
    /text-decoration-color: color-mix\(in srgb, var\(--dsw-alias-state-business-primary\) 45%, transparent\);/)
})

test('the link keeps the accent ink', function () {
  assert.match(linkRule().body, /^\s*color: var\(--dsw-alias-state-business-primary\);$/m)
})

test('the rule still carries the EXCLUDE scoping, so it cannot reach a code block', function () {
  const { selector } = linkRule()
  assert.ok(selector.includes(EXCLUDE),
    'the subject must carry the exclusion block: ' + selector)
  // Spelled out, so a future edit that trims the exclusion for brevity fails
  // here rather than silently repainting code chips.
  for (const part of ['pre', 'pre *', 'code', 'code *', '.dsh-genui-card', '[data-slot="tool.call.toolview"]']) {
    assert.ok(EXCLUDE.includes(part), 'the exclusion must still name ' + part)
  }
  assert.ok(selector.startsWith(MARKDOWN_ROOT + ' '),
    'the rule must stay rooted at the assistant-step row: ' + selector)
})

test('the link owns 5px of trailing space so its underline clears a chip', function () {
  // THE REAL FIX. `[示例网站](…)` immediately followed by `` `查看文档` `` has no
  // whitespace between them, so the underline ran into the chip's left border.
  // Raising the offset does not help — that moves the rule DOWN; the collision
  // is horizontal. The link therefore carries its own trailing padding, and the
  // chip's box (shared with every inline code via `codeRules()`) does not move.
  const body = linkRule().body
  assert.ok(/padding-inline-end:\s*5px/.test(body),
    'the link must reserve trailing space for its underline: ' + body)
  assert.ok(!/margin/.test(body),
    'a margin would collapse against neighbouring whitespace: ' + body)
  // The pad is horizontal only: vertical padding would grow the line box.
  assert.ok(!/padding-(top|bottom)|padding:\s/.test(body),
    'only the inline end may be padded: ' + body)
})
