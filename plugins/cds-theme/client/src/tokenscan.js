/**
 * A dependency-free, line-oriented syntax scanner for the diff card.
 *
 * WHY THIS EXISTS. The theme colours code through the host's `--shiki-token-*`
 * custom properties, but those variables are only ever *consumed* by Shiki's
 * own `<pre>` output. A diff card built by a client plugin gets plain text rows
 * from the host (`{ kind, text }`, see `diffnumbers.js`), so there is no token
 * structure to colour. Owning the card means owning the scan.
 *
 * CONTRACT — the parts callers rely on:
 *
 *   - CONTIGUOUS COVERAGE: the returned tokens' `text` values concatenate to
 *     exactly the input, so rendering them as spans cannot lose, reorder or
 *     duplicate a character and a token kind is purely decorative.
 *   - TOTAL: never throws. Every branch advances the cursor by at least one
 *     character; malformed input (`"unterminated`, `/* never closed`, a lone
 *     backslash, binary noise) yields `plain`/`string`/`comment` tokens instead
 *     of an exception, because this runs inside a React render where a throw
 *     would take the whole tool row down.
 *   - LINEAR: one forward pass, no backtracking, no expressions over the whole
 *     line. A 10 KB line costs one pass.
 *   - EMPTY IN, EMPTY OUT: `''` produces `[]`, not one empty token.
 *
 * PER LINE, NOT PER FILE. A diff row is one line, so the scanner is fed one
 * line at a time. Block comments, template literals and markdown fences do span
 * lines in the source, so callers scanning consecutive lines pass one mutable
 * `state` object through the sequence (see `scanLines`); a line scanned without
 * state is scanned in isolation.
 *
 * LANGUAGES. JavaScript/TypeScript, JSON, CSS and a markdown-ish scan are
 * covered; anything else falls back to one `plain` token, which is a valid
 * (if uncoloured) rendering rather than a failure.
 *
 * @module tokenscan
 */

/** Every `data-cds-tok` value the stylesheet knows how to paint. */
export const TOKEN_KINDS = Object.freeze([
  'keyword', 'string', 'number', 'comment', 'function', 'constant', 'punctuation', 'plain',
])

/**
 * JavaScript / TypeScript reserved words. Literals live in `LITERALS`: Shiki
 * paints `true`/`null` as `constant`, and the card inherits that mapping.
 */
const KEYWORDS = new Set((
  'as async await break case catch class const continue debugger declare default delete do '
  + 'else enum export extends finally for from function get if implements import in instanceof '
  + 'interface let new of private protected public readonly return set static super switch '
  + 'this throw try typeof var void while with yield satisfies keyof infer abstract'
).split(' '))

const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'])
const JSON_LITERALS = new Set(['true', 'false', 'null', 'NaN', 'Infinity'])

/** Operator / bracket characters, consumed in runs to keep the span count low. */
const PUNCT = '+-*/%=<>!&|^~?:;,.()[]{}'

const isDigit = (c) => c >= '0' && c <= '9'
const isHex = (c) => isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
  || c === '_' || c === '$' || c > '\u007f'
const isIdPart = (c) => isIdStart(c) || isDigit(c)

/**
 * The scan target for a path, from its extension.
 *
 * Deliberately extension-only: the contents are not inspected (that would be a
 * second guess on top of the first), and an unknown extension is the documented
 * `plain` fallback.
 *
 * @param {unknown} path a file path, possibly absent
 * @returns {'js' | 'json' | 'css' | 'md' | 'plain'}
 */
export function languageForPath(path) {
  if (typeof path !== 'string') return 'plain'
  const at = path.lastIndexOf('.')
  if (at < 0) return 'plain'
  const ext = path.slice(at + 1).toLowerCase()
  if (ext === 'md' || ext === 'mdx' || ext === 'markdown') return 'md'
  if (ext === 'css' || ext === 'scss' || ext === 'less') return 'css'
  if (ext === 'json' || ext === 'jsonc' || ext === 'json5') return 'json'
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'jsx'
    || ext === 'ts' || ext === 'mts' || ext === 'cts' || ext === 'tsx') return 'js'
  return 'plain'
}

/** Index just past a quoted run; an unterminated quote runs to the line end. */
function strEnd(s, start, quote) {
  let i = start + 1
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue }
    if (s[i] === quote) return i + 1
    i += 1
  }
  return s.length
}

/** Index just past a numeric literal (hex/binary/octal forms included). */
function numEnd(s, start) {
  const mark = s[start] === '0' ? s[start + 1] : ''
  if ('xXbBoO'.includes(mark) && mark !== '') {
    let i = start + 2
    while (i < s.length && (isHex(s[i]) || s[i] === '_')) i += 1
    return i
  }
  let i = start
  while (i < s.length && (isDigit(s[i]) || s[i] === '_')) i += 1
  if (s[i] === '.') {
    i += 1
    while (i < s.length && isDigit(s[i])) i += 1
  }
  if (s[i] === 'e' || s[i] === 'E') {
    const signed = s[i + 1] === '+' || s[i + 1] === '-'
    if (isDigit(signed === true ? s[i + 2] : s[i + 1])) {
      i += signed === true ? 2 : 1
      while (i < s.length && isDigit(s[i])) i += 1
    }
  }
  return i
}

/** Index just past the identifier starting at `start`. */
function idEnd(s, start) {
  let i = start
  while (i < s.length && isIdPart(s[i])) i += 1
  return i
}

/** Index just past a run of operator / bracket characters. */
function punctEnd(s, start) {
  let i = start
  while (i < s.length && PUNCT.includes(s[i])) i += 1
  return i
}

/** Index past spaces, for the one bounded lookahead (`(` / `:`) the scan needs. */
function skipSpace(s, from) {
  let i = from
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i += 1
  return i
}

/**
 * Whether a character is PROSE to this scanner: not an identifier, not a digit,
 * not a quote and not an operator. Spaces, tabs, stray control characters and
 * the language-specific sigils a branch above did not claim all land here.
 *
 * The predicate is also the progress guarantee: every iteration either matches
 * one of the branches above (each of which advances) or consumes at least one
 * plain character, so `while (i < n)` always terminates.
 */
const isPlain = (c) => c !== undefined && !isIdStart(c) && !isDigit(c)
  && !'"\'`'.includes(c) && !'@#!'.includes(c) && !PUNCT.includes(c)

/** Index past a run of prose characters (at least one). */
function plainEnd(s, start) {
  let i = start + 1
  while (i < s.length && isPlain(s[i])) i += 1
  return i
}

/**
 * JavaScript / TypeScript, and JSON through the `json` flag.
 *
 * Block comments and template literals cross lines, so their open state is
 * written onto `state` and the following line resumes inside them.
 */
function scanCode(s, state, json) {
  const out = []
  const push = (kind, a, b) => { if (b > a) out.push({ text: s.slice(a, b), kind }) }
  const n = s.length
  let i = 0
  while (i < n) {
    if (state.block === true) {
      const close = s.indexOf('*/', i)
      if (close < 0) { push('comment', i, n); return out }
      push('comment', i, close + 2)
      i = close + 2
      state.block = false
      continue
    }
    const c = s[i]
    if (json === false && c === '/' && s[i + 1] === '/') { push('comment', i, n); return out }
    if (json === false && c === '/' && s[i + 1] === '*') {
      const close = s.indexOf('*/', i + 2)
      if (close < 0) { push('comment', i, n); state.block = true; return out }
      push('comment', i, close + 2)
      i = close + 2
      continue
    }
    if (c === '"' || (json === false && (c === "'" || c === '`'))) {
      const end = strEnd(s, i, c)
      push('string', i, end)
      i = end
      continue
    }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1])) || (c === '-' && json === true && isDigit(s[i + 1]))) {
      const end = c === '-' ? numEnd(s, i + 1) : numEnd(s, i)
      push('number', i, end)
      i = end
      continue
    }
    if (isIdStart(c)) {
      const end = idEnd(s, i)
      const word = s.slice(i, end)
      let kind = 'plain'
      if (json === true) kind = JSON_LITERALS.has(word) ? 'constant' : 'plain'
      else if (KEYWORDS.has(word)) kind = 'keyword'
      else if (LITERALS.has(word)) kind = 'constant'
      else if (s[skipSpace(s, end)] === '(') kind = 'function'
      out.push({ text: word, kind })
      i = end
      continue
    }
    const end = punctEnd(s, i)
    if (end > i) {
      push('punctuation', i, end)
      i = end
      continue
    }
    // Prose: spaces, and any character no branch above claims. Guarantees the
    // cursor advances on every iteration.
    const plain = plainEnd(s, i)
    push('plain', i, plain)
    i = plain
  }
  return out
}

/**
 * CSS / SCSS / LESS.
 *
 * A property name is the identifier before `:`, an at-rule is `@word`, a hex
 * colour and a measurement are numbers (Shiki paints both as `constant`), and
 * `!important` is a constant.
 */
function scanCss(s, state) {
  const out = []
  const push = (kind, a, b) => { if (b > a) out.push({ text: s.slice(a, b), kind }) }
  const n = s.length
  let i = 0
  while (i < n) {
    if (state.block === true) {
      const close = s.indexOf('*/', i)
      if (close < 0) { push('comment', i, n); return out }
      push('comment', i, close + 2)
      i = close + 2
      state.block = false
      continue
    }
    const c = s[i]
    if (c === '/' && s[i + 1] === '*') {
      const close = s.indexOf('*/', i + 2)
      if (close < 0) { push('comment', i, n); state.block = true; return out }
      push('comment', i, close + 2)
      i = close + 2
      continue
    }
    if (c === '"' || c === "'") {
      const end = strEnd(s, i, c)
      push('string', i, end)
      i = end
      continue
    }
    if (c === '@' && isIdStart(s[i + 1] ?? '')) {
      const end = idEnd(s, i + 1)
      push('keyword', i, end)
      i = end
      continue
    }
    if (c === '!') {
      const end = isIdStart(s[i + 1] ?? '') ? idEnd(s, i + 1) : i + 1
      push('constant', i, end)
      i = end
      continue
    }
    if (c === '#') {
      let end = i + 1
      while (end < n && isIdPart(s[end])) end += 1
      push('number', i, end)
      i = end
      continue
    }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      let end = numEnd(s, i)
      while (end < n && isIdPart(s[end])) end += 1 // units: 12px, 1.5rem
      if (s[end] === '%') end += 1
      push('number', i, end)
      i = end
      continue
    }
    if (isIdStart(c)) {
      const end = idEnd(s, i)
      const next = s[skipSpace(s, end)]
      out.push({
        text: s.slice(i, end),
        kind: next === ':' ? 'keyword' : next === '(' ? 'function' : 'plain',
      })
      i = end
      continue
    }
    const end = punctEnd(s, i)
    if (end > i) {
      push('punctuation', i, end)
      i = end
      continue
    }
    // Prose: spaces, and any character no branch above claims. Guarantees the
    // cursor advances on every iteration.
    const plain = plainEnd(s, i)
    push('plain', i, plain)
    i = plain
  }
  return out
}

/** Markdown-ish: fences, headings, list/quote markers, inline code, link marks. */
function scanMd(s, state) {
  const out = []
  const push = (kind, a, b) => { if (b > a) out.push({ text: s.slice(a, b), kind }) }
  const at = s.search(/\S/)
  const lead = at < 0 ? s.length : at
  if ((s.startsWith('```', lead) || s.startsWith('~~~', lead))) {
    let i = lead
    const mark = s[i]
    while (s[i] === mark) i += 1
    push('plain', 0, lead)
    push('keyword', lead, i)
    push('string', i, s.length)
    state.fence = state.fence !== true
    return out
  }
  if (state.fence === true) { push('string', 0, s.length); return out }
  push('plain', 0, lead)
  if (s[lead] === '#') {
    let end = lead
    while (s[end] === '#') end += 1
    push('keyword', lead, end)
    push('plain', end, s.length)
    return out
  }
  // A block quote or list marker is punctuation; the rest is prose.
  const marker = /^(?:[-*+]|\d+[.)])\s/.exec(s.slice(lead))
  let i = lead
  if (s[i] === '>') { push('punctuation', i, i + 1); i += 1 }
  else if (marker !== null) { push('punctuation', i, i + marker[0].length); i += marker[0].length }
  let from = i
  while (i < s.length) {
    const c = s[i]
    if (c === '`') {
      push('plain', from, i)
      const end = strEnd(s, i, '`')
      push('string', i, end)
      i = end
      from = i
      continue
    }
    if ('*_[]()'.includes(c)) {
      push('plain', from, i)
      push('punctuation', i, i + 1)
      i += 1
      from = i
      continue
    }
    i += 1
  }
  push('plain', from, s.length)
  return out
}

/**
 * Scan one line into contiguous tokens.
 *
 * @param {unknown} text the line to scan
 * @param {string} [language] the scan profile (`js`, `json`, `css`, `md`)
 * @param {{ block?: boolean, fence?: boolean }} [state] carried across lines
 * @returns {Array<{ text: string, kind: string }>} tokens covering the whole line
 */
export function scanTokens(text, language, state) {
  if (typeof text !== 'string' || text === '') return []
  const carried = state !== null && typeof state === 'object' ? state : {}
  try {
    if (language === 'js') return scanCode(text, carried, false)
    if (language === 'json') return scanCode(text, carried, true)
    if (language === 'css') return scanCss(text, carried)
    if (language === 'md') return scanMd(text, carried)
  } catch (error) {
    // The scanner is written not to throw; this guard keeps a future edit's bug
    // from taking the conversation down with it.
  }
  return [{ text, kind: 'plain' }]
}

/**
 * Scan consecutive lines, carrying block state between them.
 *
 * @param {string[]} lines the lines of one hunk, in order
 * @param {string} language the scan profile
 * @returns {Array<Array<{ text: string, kind: string }>>} one token list per line
 */
export function scanLines(lines, language) {
  const state = { block: false, fence: false }
  const out = []
  for (const line of Array.isArray(lines) ? lines : []) out.push(scanTokens(line, language, state))
  return out
}