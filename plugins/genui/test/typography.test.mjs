/**
 * The stylesheet's typography, checked against the host's own token model.
 *
 * THE BUG THIS PINS. `--dsw-font-s-14` is not a size — it is a full CSS `font`
 * shorthand (`14px/22px "anthropic-sans", …`). Used as a `font-size` value it is
 * invalid, the declaration is dropped silently, and the element inherits
 * whatever the document happens to use. That produced a 16px card beside 14px
 * reply text: the answer looked like a foreign block.
 *
 * THE SECOND BUG, which the first fix walked into. "Just inherit" does not work
 * either: the chat flow's containers never set a font size, so inheritance gives
 * the document's 16px. Only the markdown renderer, further in, applies the
 * host's content size. So the answer must NAME that token.
 *
 * These are source-level assertions because a browser silently ignoring an
 * invalid declaration cannot be caught from Node.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { CARD_CSS } = await import('../client/src/styles.js')

/**
 * Split a stylesheet into `{ selector, body }` pairs.
 *
 * Comments are stripped FIRST: this sheet documents itself inline, and prose
 * containing a brace would otherwise look like a rule boundary.
 *
 * @param {string} css stylesheet text
 * @returns {Array<{ selector: string, body: string }>} one entry per rule
 */
function rules(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (const match of stripped.matchAll(re)) {
    const selector = match[1].trim().replace(/\s+/g, ' ')
    out.push({ selector, body: match[2] })
  }
  return out
}

/** The declared `font-size` for one selector, or undefined. */
function fontSizeOf(css, selector) {
  const rule = rules(css).find((entry) => entry.selector === selector)
  if (rule === undefined) return undefined
  const match = /font-size:\s*([^;]+);/.exec(rule.body)
  return match === null ? undefined : match[1].trim()
}

test('no font-size uses a --dsw-font-* shorthand', function () {
  const offenders = []
  for (const rule of rules(CARD_CSS)) {
    const match = /font-size:\s*([^;]+);/.exec(rule.body)
    if (match !== null && /var\(--dsw-font-[^)]*\)/.test(match[1])) {
      offenders.push({ selector: rule.selector, value: match[1].trim() })
    }
  }
  assert.deepEqual(offenders, [],
    'a --dsw-font-* token is a full font shorthand; in font-size the declaration is '
    + 'invalid and silently dropped. Use --dsh-content-font-size* for sizes.')
})

test('the answer body names the host content size', function () {
  // Inheritance is NOT the fix: the chat containers leave the document's 16px in
  // place, and only the markdown renderer applies the content size. Naming the
  // token is what makes the answer match the prose beside it.
  const size = fontSizeOf(CARD_CSS, '.dsh-genui-body')
  assert.ok(size !== undefined, 'the body must declare a size')
  assert.ok(size.includes('--dsh-content-font-size'),
    `the body must use the host content-size token; found ${size}`)
})

test('the title is the body size, differentiated by weight', function () {
  // ZCode's typography rule: "h1 is body +4px, h2 +2px, h3–h6 the body size".
  // A visual's heading is an h3, so it stays at body size and earns emphasis
  // from weight. A LARGER title competes with the answer it belongs to.
  const size = fontSizeOf(CARD_CSS, '.dsh-genui-title')
  assert.ok(size !== undefined, 'the title must declare a size')
  assert.ok(size.includes('--dsh-content-font-size'),
    `the title must use the body size token; found ${size}`)
  assert.ok(!/xl|24px|20px|18px/.test(size),
    'a title larger than body copy is the oversized-title bug')
  const titleRule = rules(CARD_CSS).find((entry) => entry.selector === '.dsh-genui-title')
  assert.match(titleRule.body, /font-weight:\s*600/,
    'emphasis comes from weight, not size')
})

test('captions use host caption tokens, never a bare pixel size', function () {
  for (const selector of ['.dsh-genui-badge', '.dsh-genui-rationale', '.dsh-genui-sent',
    '.dsh-genui-pending', '.dsh-genui-failure-detail']) {
    const size = fontSizeOf(CARD_CSS, selector)
    assert.ok(size !== undefined, `${selector} declares a size`)
    assert.ok(size.includes('var(--dsh-content-font-size'),
      `${selector} must use a host size token; found ${size}`)
  }
})

test('the only literal sizes are var() fallbacks', function () {
  for (const rule of rules(CARD_CSS)) {
    const match = /font-size:\s*([^;]+);/.exec(rule.body)
    if (match === null) continue
    const bare = match[1].replace(/var\([^)]*\)/g, '').trim()
    assert.equal(bare, '', `${rule.selector} has a bare size literal: ${match[1].trim()}`)
  }
})

test('the conversation decides the answer width, not the stylesheet', function () {
  // ZCode: "The host sizes the frame to its content … avoid fixed outer widths."
  // A max-width here would letterbox the answer inside a column that already has
  // a width, and it would fight the host's own content-width setting.
  const cardRule = rules(CARD_CSS).find((entry) => entry.selector === '.dsh-genui-card')
  assert.ok(cardRule !== undefined)
  // `min-width: 0` is the one legal width: it lets a flex/grid child shrink below
  // its content's intrinsic width, which is what prevents overflow. A
  // `width`/`max-width` would pin the answer to a size the transcript did not ask
  // for and fight the host's content-width setting.
  assert.ok(!/(^|[^-])width:/.test(cardRule.body),
    'the card must not impose a width — the transcript column owns it')
  assert.ok(!/max-width:/.test(cardRule.body),
    'and no max-width: the host sizes the frame to its content')
})

test('no rule paints ink or a border with a translucent fill token', function () {
  // THE BUG, IN THE PLUGIN'S OWN SHEET. `--dsw-alias-code-diff-deleted` is
  // rgba(186, 39, 35, 0.08) — a tint for diff lines. The failure panel's left
  // edge used it as a border colour, so the 2px rule rendered at eight percent
  // opacity, i.e. invisible. That is the same class of mistake that made a
  // generated "99.5%" headline unreadable (`legibility.js` repairs the card
  // content; this test keeps the frame from reintroducing it).
  //
  // The fill tokens are named explicitly because they are the ones whose NAME
  // reads like ink. A token that legitimately appears as a fill — a background,
  // a shadow — is not covered by this rule and should not be.
  const FILL_TOKENS = [
    '--dsw-alias-code-diff-added',
    '--dsw-alias-code-diff-deleted',
    '--dsw-alias-file-diff-added-bg',
    '--dsw-alias-file-diff-deleted-bg',
    '--dsw-alias-interactive-bg-hover-danger',
  ]
  const offenders = []
  for (const rule of rules(CARD_CSS)) {
    for (const token of FILL_TOKENS) {
      if (!rule.body.includes(`var(${token})`)) continue
      // Only declarations that put a colour on TEXT or an EDGE are suspect.
      // `background*` is the legitimate use of a fill and is left alone.
      for (const match of rule.body.matchAll(/(^|;)\s*([a-z-]+)\s*:\s*([^;]*)/g)) {
        const property = match[2]
        if (!match[3].includes(`var(${token})`)) continue
        if (/^background/.test(property)) continue
        offenders.push({ selector: rule.selector, property, token })
      }
    }
  }
  assert.deepEqual(offenders, [],
    'a translucent fill token used as ink or a border renders at 5–14% opacity. '
    + 'Use the opaque sibling (e.g. --dsw-alias-state-error-primary) instead.')
})
