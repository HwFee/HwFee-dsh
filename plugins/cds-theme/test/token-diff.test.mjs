/**
 * Token-level change emphasis on the diff card.
 *
 * The card exists to answer "which token changed", so these tests pin the three
 * answers it can give:
 *
 *   - a replacement pair marks EXACTLY the tokens that differ;
 *   - identical lines mark nothing (an empty wash would be noise);
 *   - a line with no partner is wholly new or wholly gone, so it is marked whole.
 *
 *   node test/token-diff.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildHunk, decorateHunk, diffTokens, MAX_TOKEN_DIFF_CHARS } from '../client/src/diffview.js'
import { scanTokens } from '../client/src/tokenscan.js'

/** Tokenise one line the way the card does, for a `.js` hunk. */
function tokens(line) {
  return scanTokens(line, 'js')
}

/** The text of the tokens at `indexes`. */
function marked(list, indexes) {
  return [...indexes].map(function (index) { return list[index].text })
}

test('identical token lists mark nothing at all', function () {
  const before = tokens('const a = 1')
  const after = tokens('const a = 1')
  const result = diffTokens(before, after)
  assert.deepEqual(result.del, [])
  assert.deepEqual(result.add, [])
})

test('a replacement marks exactly the changed token', function () {
  const before = tokens('const alpha = 1')
  const after = tokens('const beta = 1')
  const result = diffTokens(before, after)
  assert.deepEqual(marked(before, result.del), ['alpha'])
  assert.deepEqual(marked(after, result.add), ['beta'])
})

test('a changed string literal marks the literal, not its neighbours', function () {
  const before = tokens('render("a", 1)')
  const after = tokens('render("b", 1)')
  const result = diffTokens(before, after)
  assert.deepEqual(marked(before, result.del), ['"a"'])
  assert.deepEqual(marked(after, result.add), ['"b"'])
})

test('a changed comment marks the comment token whole', function () {
  const before = tokens('x = 1 // one')
  const after = tokens('x = 1 // two')
  const result = diffTokens(before, after)
  assert.deepEqual(marked(before, result.del), ['// one'])
  assert.deepEqual(marked(after, result.add), ['// two'])
})

test('a replaced keyword keeps its neighbours unmarked', function () {
  const before = tokens('let v = 1')
  const after = tokens('const v = 1')
  const result = diffTokens(before, after)
  assert.deepEqual(marked(before, result.del), ['let'])
  assert.deepEqual(marked(after, result.add), ['const'])
})

test('an over-long line declines the token diff instead of guessing', function () {
  const long = 'x'.repeat(MAX_TOKEN_DIFF_CHARS + 1)
  assert.equal(diffTokens(tokens('const a = "' + long + '"'), tokens('const b = "' + long + '"')), null)
})

test('replacement rows are paired and only the differing tokens are marked', function () {
  const hunk = buildHunk({
    path: '/w/a.js',
    oldText: 'const answer = 41',
    newText: 'const answer = 42',
  })
  assert.deepEqual(hunk.rows.map(function (row) { return row.kind }), ['del', 'add'])
  assert.equal(hunk.rows[0].pair, 1)
  assert.equal(hunk.rows[1].pair, 0)

  const decorated = decorateHunk(hunk)
  for (const [row, at] of [[hunk.rows[0], 0], [hunk.rows[1], 1]]) {
    const mark = decorated.marks[at]
    assert.ok(mark !== null, 'the row is marked')
    assert.equal(mark.indexes.size, 1, 'exactly one token changed')
    const index = [...mark.indexes][0]
    assert.equal(decorated.tokens[at][index].text, row.kind === 'del' ? '41' : '42')
    assert.equal(decorated.tokens[at][index].kind, 'number')
  }
})

test('a pure addition marks the whole line', function () {
  const hunk = buildHunk({ path: '/w/a.js', oldText: null, newText: 'const a = 1\nconst b = 2' })
  assert.deepEqual(hunk.rows.map(function (row) { return row.kind }), ['add', 'add'])
  const decorated = decorateHunk(hunk)
  for (const mark of decorated.marks) {
    assert.deepEqual(mark, { all: true })
  }
})

test('a pure deletion marks the whole line', function () {
  const hunk = buildHunk({ path: '/w/a.js', oldText: 'gone\nleaving', newText: '' })
  assert.deepEqual(hunk.rows.map(function (row) { return row.kind }), ['del', 'del'])
  const decorated = decorateHunk(hunk)
  for (const mark of decorated.marks) assert.deepEqual(mark, { all: true })
})

test('a replacement block keeps unpaired rows whole', function () {
  // Two deletions, one addition: only the first pair is compared token by
  // token, the leftover deletion is entirely gone.
  const hunk = buildHunk({
    path: '/w/a.js',
    oldText: 'const a = 1\nconst b = 2',
    newText: 'const a = 9',
  })
  assert.deepEqual(hunk.rows.map(function (row) { return row.kind }), ['del', 'del', 'add'])
  const decorated = decorateHunk(hunk)
  // The pair is exact: `1` against `9`, one token each.
  assert.equal(decorated.marks[0].indexes.size, 1)
  assert.equal(decorated.marks[2].indexes.size, 1, 'the addition is the pair of the first deletion')
  // The second deletion has no partner at all, so the whole line is gone.
  assert.deepEqual(decorated.marks[1], { all: true })
})

test('context rows are never marked', function () {
  const hunk = buildHunk({
    path: '/w/a.js',
    oldText: 'same\nold',
    newText: 'same\nnew',
  })
  const decorated = decorateHunk(hunk)
  assert.ok(hunk.rows[0].kind === 'ctx')
  assert.equal(decorated.marks[0], null)
})

test('the scanner a hunk uses follows its file extension', function () {
  const js = buildHunk({ path: '/w/a.js', oldText: 'const a = 1', newText: 'const b = 1' })
  const css = buildHunk({ path: '/w/a.css', oldText: 'color: red', newText: 'color: blue' })
  assert.equal(js.language, 'js')
  assert.equal(css.language, 'css')
  // CSS property names are keywords and values are prose; JS keywords are
  // keywords and identifiers are prose. The marking follows the scan.
  assert.equal(decorateHunk(css).tokens[0][0].kind, 'keyword')
})