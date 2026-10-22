/**
 * The diff card's line-number gutter.
 *
 * Three defects landed here in a row, each visible only on a real four-digit
 * file line, and each fixed by one declaration:
 *
 *   1. no width — the span is a flex item and shrank below its content, so
 *      `1451` broke between the digits and read as two columns of numbers;
 *   2. `nowrap` alone — with `content-box` a four-digit number filled the 5ch
 *      floor exactly, the right padding was consumed, and the last digit landed
 *      on the `+`/`-` glyph (measured at 4x on the live page: the digits' ink
 *      ended 4px past the glyph's left edge);
 *   3. widening the floor — `text-align: right` pushes the digits outward, so a
 *      wider box moved them INTO the glyph rather than away from it.
 *
 * The fix is the pair `min-width` + `box-sizing: border-box`: the floor then
 * includes the right padding, so the clearance holds at 1, 2, 3 and 4 digits.
 *
 *   node test/diff-gutter.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildCssFor } from '../client/src/styles.js'
import { sanitize } from '../client/src/constants.js'

/** The declarations of one rule, as a `{ prop: value }` map. */
function ruleBody(css, selector) {
  const at = css.indexOf(selector + ' {')
  assert.ok(at >= 0, 'expected the rule: ' + selector)
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  const body = {}
  for (const line of css.slice(open + 1, close).split('\n')) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    body[line.slice(0, colon).trim()] = line.slice(colon + 1).trim().replace(/;$/, '')
  }
  return body
}

const CSS = buildCssFor(sanitize({}))
const GUTTER = '[data-cds-diffcard] [data-cds-diff-num]'

test('the gutter never wraps a four-digit line number onto a second row', function () {
  const body = ruleBody(CSS, GUTTER)
  // Defect 1: without these two the digits break mid-number.
  assert.equal(body['white-space'], 'nowrap', 'a long number must not break between digits')
  assert.equal(body.flex, 'none', 'a flex item may not shrink below its content here')
})

test('the reserved width INCLUDES the right padding, so digits clear the glyph', function () {
  const body = ruleBody(CSS, GUTTER)
  // Defect 2 and 3 together: `content-box` made the floor and the padding add
  // up, so a four-digit number consumed the clearance; `border-box` puts the
  // padding inside the floor instead.
  assert.equal(body['box-sizing'], 'border-box',
    'the min-width must include the padding, or a 4-digit number eats the gap')
  assert.equal(body['min-width'], '5ch', 'the column stays steady across digit counts')
  assert.ok(/^0 8px 0 2px$/.test(body.padding),
    'a right pad wide enough to clear the +/− glyph: ' + body.padding)
  assert.equal(body['text-align'], 'right', 'numbers align on their last digit')
})

test('the gutter keeps its caption ink and tabular figures', function () {
  const body = ruleBody(CSS, GUTTER)
  // The two properties that make the column readable and stable while a diff
  // streams in. Neither is part of the three defects; both must survive.
  assert.equal(body['font-variant-numeric'], 'tabular-nums',
    'proportional digits would make the column jitter')
  assert.equal(body.color, 'var(--dsw-alias-label-caption)')
  assert.equal(body['user-select'], 'none', 'a copied diff must not carry the numbers')
})

test('the added and removed rows tint their numbers, not the gutter as a whole', function () {
  // The colour is on the ROW kind, so a context line keeps the caption ink while
  // an added line's number turns green and a deleted one's turns red.
  assert.ok(CSS.includes('[data-cds-diffcard] [data-kind="add"] [data-cds-diff-num] {'),
    'an added row colours its own number')
  assert.ok(CSS.includes('[data-cds-diffcard] [data-kind="del"] [data-cds-diff-num] {'),
    'a deleted row colours its own number')
  const gutter = ruleBody(CSS, GUTTER)
  assert.ok(!('color' in gutter) || gutter.color === 'var(--dsw-alias-label-caption)',
    'the base rule must not hard-code an add/del colour')
})
