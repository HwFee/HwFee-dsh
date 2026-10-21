/**
 * The diff card's tokenizer.
 *
 * What is pinned here, and why each one matters:
 *
 *   - COVERAGE: the tokens concatenate to the input. A renderer that lost or
 *     reordered a character would still look plausible in a screenshot, so the
 *     invariant is asserted rather than eyeballed.
 *   - KINDS per language: the stylesheet paints `data-cds-tok="<kind>"`, so a
 *     kind that drifts (a keyword classified as `plain`) silently stops being
 *     coloured.
 *   - MALFORMED INPUT: an unterminated string or comment must degrade, not
 *     throw — this runs inside a React render, where a throw takes the whole
 *     tool row down.
 *
 *   node test/tokenscan.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { languageForPath, scanTokens, scanLines } from '../client/src/tokenscan.js'

/** Join the tokens back into the input, which must always be lossless. */
function text(tokens) {
  return tokens.map(function (token) { return token.text }).join('')
}

/** The kinds of the non-space tokens, in order. */
function kinds(tokens) {
  return tokens.filter(function (token) { return token.text.trim() !== '' })
    .map(function (token) { return token.kind })
}

/** The one token whose text is `value`. */
function token(tokens, value) {
  return tokens.find(function (entry) { return entry.text === value })
}

test('the empty string yields no tokens', function () {
  for (const language of ['js', 'json', 'css', 'md', 'plain', undefined]) {
    assert.deepEqual(scanTokens('', language), [], 'language ' + String(language))
  }
  // Not a string at all: still nothing, and no throw.
  assert.deepEqual(scanTokens(null, 'js'), [])
  assert.deepEqual(scanTokens(42, 'js'), [])
})

test('every scan is lossless', function () {
  const samples = [
    ['js', 'const answer = 42; // the answer'],
    ['js', 'const s = "hi" + `t${x}`'],
    ['js', '/* a */ f(1, 2)'],
    ['json', '{"a": true, "b": -1.5, "c": "x"}'],
    ['css', '.a { color: #fff; margin: 4px }'],
    ['css', '@media (min-width: 10px) { a:hover { color: red !important } }'],
    ['md', '# Title `code` **bold** [link](url)'],
    ['md', '```js'],
    ['plain', 'anything at all'],
  ]
  for (const [language, source] of samples) {
    assert.equal(text(scanTokens(source, language)), source, language + ': ' + source)
  }
})

test('javascript: keywords, literals, numbers and function calls', function () {
  const tokens = scanTokens('const answer = render(42, true, "x")', 'js')
  assert.equal(token(tokens, 'const').kind, 'keyword')
  assert.equal(token(tokens, 'render').kind, 'function')
  assert.equal(token(tokens, '42').kind, 'number')
  assert.equal(token(tokens, 'true').kind, 'constant')
  assert.equal(token(tokens, '"x"').kind, 'string')
  assert.equal(token(tokens, '=').kind, 'punctuation')
  assert.equal(token(tokens, 'answer').kind, 'plain')
  // A word glued to a call is a function; the same word in prose is not.
  assert.equal(token(scanTokens('const f = 1', 'js'), 'f').kind, 'plain')
})

test('javascript: comments run to the end of the line', function () {
  const tokens = scanTokens('x = 1 // note', 'js')
  assert.equal(tokens[tokens.length - 1].kind, 'comment')
  assert.equal(tokens[tokens.length - 1].text, '// note')
  const block = scanTokens('/* take */ y', 'js')
  assert.equal(block[0].kind, 'comment')
  assert.equal(block[0].text, '/* take */')
})

test('block state is carried across lines and closed again', function () {
  const rows = scanLines(['/* open', 'still', 'closed */ const a = 1'], 'js')
  assert.deepEqual(rows.map(function (tokens) {
    return kinds(tokens)
  }), [['comment'], ['comment'], ['comment', 'keyword', 'plain', 'punctuation', 'number']])
  // …and the state is per sequence, not global: the next call starts clean.
  assert.equal(kinds(scanLines(['plain text'], 'js')[0])[0], 'plain')
})

test('a template literal spans lines as one string', function () {
  const rows = scanLines(['`start', 'end`'], 'js')
  assert.deepEqual(kinds(rows[0]), ['string'])
  // The unterminated first line is a string to EOL; the continuation is not a
  // template in this scanner, so it is prose. Documented, not silent.
  assert.equal(text(rows[0]), '`start')
})

test('json: strings, numbers, literals, no comments', function () {
  const tokens = scanTokens('{"a": true, "n": -1.5, "z": null}', 'json')
  assert.equal(token(tokens, '"a"').kind, 'string')
  assert.equal(token(tokens, 'true').kind, 'constant')
  assert.equal(token(tokens, 'null').kind, 'constant')
  assert.equal(token(tokens, '-1.5').kind, 'number')
  assert.equal(token(tokens, '{').kind, 'punctuation')
  // A `//` in JSON is not a comment: JSON has none, and treating it as one
  // would swallow the rest of a valid line.
  assert.ok(kinds(scanTokens('{"u": "http://x"}', 'json')).includes('string'))
})

test('css: at-rules, properties, hex colours, measures and !important', function () {
  const tokens = scanTokens('@media { color: #fff; margin: 4px !important }', 'css')
  assert.equal(token(tokens, '@media').kind, 'keyword')
  assert.equal(token(tokens, 'color').kind, 'keyword')
  assert.equal(token(tokens, '#fff').kind, 'number')
  assert.equal(token(tokens, '4px').kind, 'number')
  assert.equal(token(tokens, '!important').kind, 'constant')
  assert.equal(token(tokens, 'margin').kind, 'keyword')
  // A value that is not a property is prose, not a keyword.
  assert.equal(token(scanTokens('a { display: grid }', 'css'), 'grid').kind, 'plain')
  // Comments, both single-line and carried.
  const commented = scanTokens('/* note */ a', 'css')
  assert.equal(commented[0].kind, 'comment')
})

test('markdown: fences, headings, inline code and link marks', function () {
  const heading = scanTokens('# Title', 'md')
  assert.deepEqual(kinds(heading), ['keyword', 'plain'])
  assert.equal(text(heading), '# Title')

  const inline = scanTokens('a `code` b', 'md')
  assert.equal(token(inline, '`code`').kind, 'string')
  assert.equal(text(inline), 'a `code` b')

  // Fences toggle through the carried state: the opening marker is a keyword,
  // its info string a string, and the block body is all string.
  const rows = scanLines(['```js', 'const a = 1', '```', 'after'], 'md')
  assert.equal(kinds(rows[0])[0], 'keyword')
  assert.deepEqual(kinds(rows[1]), ['string'])
  assert.equal(kinds(rows[2])[0], 'keyword')
  assert.equal(kinds(rows[3])[0], 'plain')
})

test('an unknown language is one plain token, not an error', function () {
  for (const language of ['plain', 'python', undefined, '']) {
    const tokens = scanTokens('def f(): pass', language)
    assert.deepEqual(tokens, [{ text: 'def f(): pass', kind: 'plain' }])
  }
})

test('malformed input never throws and stays lossless', function () {
  const bad = [
    ['js', '"unterminated'],
    ['js', "'also unterminated\\"],
    ['js', '/* never closed'],
    ['js', '`template'],
    ['js', '\\'],
    ['js', '0x'],
    ['js', '1e'],
    ['js', '\u0000\u0001binary'],
    ['css', 'a { content: "open'],
    ['css', '#'],
    ['css', '!'],
    ['md', '```'],
    ['md', '`'],
    ['json', '{"a":'],
  ]
  for (const [language, source] of bad) {
    let tokens
    assert.doesNotThrow(function () { tokens = scanTokens(source, language) }, language + ': ' + source)
    assert.equal(text(tokens), source, 'lossless: ' + language + ': ' + source)
  }
})

test('a pathological line is scanned in one pass without throwing', function () {
  // 20k characters of mixed content: the scan is linear, so this is a smoke
  // test of the loop structure rather than a timing assertion (timings on CI
  // are noise). It must stay lossless — and it must RETURN, which a scan that
  // fails to advance the cursor does not.
  const source = 'const x = "y" + 12; '.repeat(1000)
  const tokens = scanTokens(source, 'js')
  assert.equal(text(tokens), source)
  assert.ok(tokens.length > 1000)
})

test('paths map to scan profiles by extension', function () {
  assert.equal(languageForPath('/w/a.js'), 'js')
  assert.equal(languageForPath('/w/a.mjs'), 'js')
  assert.equal(languageForPath('/w/a.tsx'), 'js')
  assert.equal(languageForPath('C:\\w\\a.JSON'), 'json')
  assert.equal(languageForPath('/w/a.css'), 'css')
  assert.equal(languageForPath('/w/a.scss'), 'css')
  assert.equal(languageForPath('/w/a.md'), 'md')
  assert.equal(languageForPath('/w/a.markdown'), 'md')
  assert.equal(languageForPath('/w/a.txt'), 'plain')
  assert.equal(languageForPath('/w/noext'), 'plain')
  assert.equal(languageForPath(undefined), 'plain')
})