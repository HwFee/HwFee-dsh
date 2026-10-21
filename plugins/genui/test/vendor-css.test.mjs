/**
 * The ported ZCode design system.
 *
 * WHY THESE ASSERTIONS. The port is generated, but three things can still go
 * wrong and none of them would be visible until a card looked wrong:
 *
 *   1. THE TOKEN LAYER DRIFTS OFF DSH. If a `--dsw-alias-*` mapping reverts to a
 *      literal or to a ZCode `--color-*` host variable, the component renders in
 *      whatever colour the fallback happens to be — correct in one theme, wrong
 *      in the other, and invisible to every other test.
 *   2. A CLASS DISAPPEARS. The skill tells the model to use `viz-grid`,
 *      `table-responsive` and so on; a class missing from the sheet is a model
 *      instruction that silently does nothing.
 *   3. THE SHEET IS NEVER INSTALLED. It lives in a separate style tag, so a
 *      regression in the installer would leave every class inert.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { VENDOR_CSS } = await import('../client/src/vendor/visualize.css.js')
const { CARD_CSS, installCardCss } = await import('../client/src/styles.js')

/** Every class name the skill tells the model it may use. */
const DOCUMENTED = [
  'card', 'btn', 'btn-primary', 'btn-secondary', 'btn-ghost', 'btn-xs', 'btn-sm', 'btn-lg',
  'viz-stat', 'viz-stat-value', 'viz-grid', 'viz-row', 'viz-controls',
  'form-label', 'form-control', 'form-select', 'form-check', 'form-switch', 'form-range',
  'nav', 'nav-pills', 'nav-link', 'progress', 'progress-bar',
  'table', 'table-sm', 'table-responsive',
  'text-small', 'text-muted', 'text-destructive', 'tabular-nums',
  'viz-badge', 'viz-tile', 'sr-only', 'viz-dotted-background', 'cursor-interaction',
]

test('every class the skill documents exists in the sheet', function () {
  const missing = DOCUMENTED.filter((name) => !new RegExp(`\\.${name}(?![\\w-])`).test(VENDOR_CSS))
  assert.deepEqual(missing, [],
    'the skill tells the model to use these classes; a missing one is an instruction '
    + 'that silently does nothing')
})

/** The token block, isolated from the component rules below it. */
function tokenLayer() {
  // The block opens with a `.dsh-genui-card {` rule that starts a line; the
  // prose above it also names the selector, so the anchor is the line start.
  const start = VENDOR_CSS.indexOf('\n.dsh-genui-card {')
  assert.ok(start !== -1, 'the sheet must open with the card-scoped token block')
  const end = VENDOR_CSS.indexOf('\n/* ---------- component rules', start)
  assert.ok(end !== -1, 'the token block must be followed by the component marker')
  return VENDOR_CSS.slice(start, end)
}

test('the token layer resolves through DSH aliases, never literals', function () {
  // Every ZCode surface/text/action variable must map to a --dsw-* token (or to
  // `transparent`, the deliberate "no surface" value).
  const layer = tokenLayer()
  const CORE = ['background', 'foreground', 'card', 'card-border', 'card-foreground',
    'popover', 'popover-foreground', 'primary', 'secondary', 'muted', 'muted-foreground',
    'accent', 'border', 'input', 'ring', 'destructive']
  for (const name of CORE) {
    const decl = new RegExp(`--${name}:\\s*([^;]+);`).exec(layer)
    assert.ok(decl !== null, `--${name} must be declared`)
    const value = decl[1].trim()
    assert.ok(value === 'transparent' || value.includes('var(--dsw-'),
      `--${name} must resolve through a DSH alias; found ${value}`)
  }
})

test('no light-dark() call survives anywhere in the sheet', function () {
  // DSH switches themes on `body[data-ds-dark-theme]`, not `prefers-color-scheme`.
  // The token layer and the component rules both had `light-dark()` calls; the
  // port removes both, because on a light-themed app in a dark OS they disagree
  // with the app's own choice. Comments mentioning the function are fine.
  const withoutComments = VENDOR_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/light-dark\(/.test(withoutComments),
    'no rule may keep a prefers-color-scheme fallback')
})

test('the radius ladder is defined, or every component renders square', function () {
  // Upstream inherits --radius-* from the ZCode page; this sheet lives in an
  // answer, so nothing defines them. Before this check existed the buttons had
  // `border-radius: var(--radius-md)` resolving to nothing and rendered square
  // while the stylesheet looked correct.
  for (const name of ['--radius-sm', '--radius-md', '--radius-lg', '--radius-full']) {
    const decl = new RegExp(`${name}:\s*([^;]+);`).exec(VENDOR_CSS)
    assert.ok(decl !== null, `${name} must be defined`)
    assert.ok(decl[1].includes('var(--dsw-radius') || decl[1].includes('999px'),
      `${name} must resolve through a DSH radius; found ${decl[1].trim()}`)
  }
})

test('no rule still keys on #widget, which does not exist here', function () {
  // Upstream's root id. Left as-is it is dead CSS: the model's own root element
  // keeps whatever border it drew.
  const withoutComments = VENDOR_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/#widget/.test(withoutComments),
    'every #widget reference must be retargeted at the card or the body')

  // And the direct-child strip must target the BODY: on the card root it would
  // also hit the plugin's own header and wrapper.
  assert.match(VENDOR_CSS, /\.dsh-genui-body > :not\(/,
    'the "strip chrome from the snippet root" rule belongs on the body element')
})

test('the six chart series are declared and start with the brand accent', function () {
  for (let index = 1; index <= 6; index += 1) {
    assert.ok(new RegExp(`--viz-series-${index}:`).test(VENDOR_CSS),
      `--viz-series-${index} must exist — the skill documents the whole ladder`)
  }
  assert.match(VENDOR_CSS, /--viz-series-1:\s*var\(--dsw-alias-brand-primary\)/,
    'series 1 is the primary measure, so it must be the app accent')
})

test('the type scale uses the host content-size tokens', function () {
  assert.match(VENDOR_CSS, /--font-size-normal:\s*var\(--dsh-content-font-size[,)]/,
    'body text must use the host content size, or the visual is larger than the reply')
  assert.match(VENDOR_CSS, /--font-size-small:\s*var\(--dsh-content-font-size-secondary[,)]/)
})

test('the sheet is installed as its own tag, and the frame keeps its own', function () {
  // Two tags, not one concatenation: a re-port replaces the vendor sheet wholesale
  // and must not be able to drop the hand-maintained frame rules with it.
  const tags = []
  const doc = {
    createElement: () => {
      const tag = { attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v }, remove() { this.removed = true } }
      tags.push(tag)
      return tag
    },
    querySelector: () => null,
    head: { append(tag) { tag.appended = true } },
  }
  const dispose = installCardCss(doc)
  assert.equal(tags.length, 2, 'the frame and the vendor sheet are separate style tags')
  assert.ok(tags.some((t) => t.textContent === CARD_CSS), 'the frame sheet is installed')
  assert.ok(tags.some((t) => t.textContent === VENDOR_CSS), 'the vendor sheet is installed')
  dispose()
  assert.ok(tags.every((t) => t.removed === true), 'both tags are removed on dispose')
})

test('installing twice replaces rather than duplicates', function () {
  // The installer runs on every activation and on HMR reload; a duplicated sheet
  // doubles every rule and makes the cascade order depend on load history.
  let removed = 0
  const doc = {
    createElement: () => ({ setAttribute() {}, textContent: '', remove() {} }),
    querySelector: () => ({ remove() { removed += 1 } }),
    head: { append() {} },
  }
  installCardCss(doc)
  assert.equal(removed, 2, 'a stale tag for EACH sheet is removed before installing the new one')
})

/**
 * Every selector in a stylesheet, walking nested at-rules.
 *
 * `@keyframes` / `@font-face` / `@property` / `@page` bodies contain frames and
 * descriptors, not selectors, so they are skipped. `@media`, `@supports`,
 * `@layer` and `@container` bodies ARE rule lists and are walked.
 */
function allSelectors(css, suppressed = false) {
  const out = []
  let i = 0
  let start = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    const prelude = css.slice(start, open).trim()
    let depth = 1
    let end = open + 1
    while (end < css.length && depth > 0) {
      if (css[end] === '{') depth += 1
      else if (css[end] === '}') depth -= 1
      end += 1
    }
    if (prelude.startsWith('@')) {
      const frames = /^@(?:-webkit-)?keyframes\b|^@font-face\b|^@property\b|^@page\b/.test(prelude)
      if (!frames) out.push(...allSelectors(css.slice(open + 1, end - 1), suppressed))
    } else if (!suppressed) {
      out.push(prelude)
    }
    i = end
    start = end
  }
  return out
}

/** Split a selector list on TOP-LEVEL commas only (`:is(a, b)` stays whole). */
function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== '') {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth -= 1
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

test('EVERY selector is scoped to the card — nothing may reach the host page', function () {
  // THE BUG THIS PINS, and it shipped twice. Upstream styles a whole page, so it
  // writes `svg`, `h1`, `th`, `code`, `.table`, `.text-warning` unqualified.
  // This sheet is injected into the HOST'S page: the first shipped version's
  // `svg { display: block }` broke every inline icon, and page classes such as
  // `.text-warning` or `.table` can restyle host content — the amber "stopped
  // tool" summary was reported as a genui takeover. A hand-maintained BARE list
  // missed the classes; this walks every selector in the file.
  const stripped = VENDOR_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const offenders = []
  for (const prelude of allSelectors(stripped)) {
    for (const selector of splitTopLevel(prelude)) {
      const value = selector.trim()
      if (value === '') continue
      if (!value.startsWith('.dsh-genui-card')) offenders.push(value)
    }
  }
  assert.deepEqual(offenders, [],
    'an unscoped selector leaks into the host page; prefix it with .dsh-genui-card')
})

test('the svg rule exists and is scoped', function () {
  // Spot-check the exact rule that caused the shipped bug, so a re-port that
  // unscopes only this one still fails.
  assert.match(VENDOR_CSS, /\.dsh-genui-card svg\s*\{/,
    'the svg rule must be scoped to the card')
  // A rule may only start an `svg` selector at the beginning of a line; any
  // other occurrence must be preceded by the card scope.
  for (const line of VENDOR_CSS.split(String.fromCharCode(10))) {
    assert.ok(!/^svg\s*\{/.test(line.trim()),
      'an unscoped `svg {` would restyle every icon in the application')
  }
})
