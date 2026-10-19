/**
 * The Claude typography ladder as it reaches `ctx.theme.overrideTokens`.
 *
 * Target values come from
 * `.reference/open-claude-ui/docs/v1/01-设计哲学与设计令牌体系.md`:
 *   :341-380  the 7-tier size/leading ladder
 *   :427-456  the content-to-typography matrix (element values)
 *   :531-547  the semantic atom classes (per-role weights)
 *   :383-414  dark-mode retinal-irradiation compensation (460 / 550 pairs)
 *
 * The greeting display row is `.font-display` at :547 (the css file's line 547
 * is a timeline rule, not the display row).
 *
 *   node test/typography.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  WEIGHTS, TYPOGRAPHY_ROLES, TYPOGRAPHY_TOKEN_NAMES, buildTypographyTokens,
  GREETING_DISPLAY, UI_ROLE_TOKENS, ELEMENT_WEIGHTS,
} from '../client/src/typography.js'
import { buildTokens, NON_COLOR_TOKENS } from '../client/src/tokens.js'
import { sanitize } from '../client/src/constants.js'
import { buildCssFor } from '../client/src/styles.js'

const TEXT = 'var(--dsw-font-family)'
const CODE = 'var(--ds-font-family-code)'
const content = function (px) { return 'calc(' + px + 'px + var(--dsh-content-font-delta))' }
const code = function (px) { return 'calc(' + px + 'px + var(--dsh-code-font-delta))' }

/**
 * The expected row per role. Every value is the matrix row cited beside it;
 * "derived" rows are interpolated within the ladder and say which rows they
 * interpolate (see the typography.js table).
 */
const EXPECTED = {
  base: { size: content(14), leading: content(20), weight: 'regular', family: TEXT }, // :436
  'base-italic': { size: content(14), leading: content(20), weight: 'regular', family: TEXT },
  'base-strong': { size: content(14), leading: content(20), weight: 'bold', family: TEXT }, // :394
  'base-strong-italic': { size: content(14), leading: content(20), weight: 'bold', family: TEXT },
  h1: { size: content(20), leading: content(25), weight: 'semibold', family: TEXT }, // title :353 + :452
  h2: { size: content(15), leading: content(20), weight: 'semibold', family: TEXT }, // heading :352 + :452
  h3: { size: content(15), leading: content(20), weight: 'semibold', family: TEXT },
  h4: { size: content(14), leading: content(18), weight: 'semibold', family: TEXT }, // heading :352 @14
  code: { size: code(12), leading: code(14), weight: 'medium', family: CODE }, // :447
  'code-block': { size: code(12), leading: code(17.5), weight: 'regular', family: CODE }, // :446
  'code-block-small': { size: code(11.5), leading: code(16), weight: 'regular', family: CODE }, // :440
  small: { size: '12px', leading: '16px', weight: 'regular', family: TEXT }, // :433/:438/:453
  'small-italic': { size: '12px', leading: '16px', weight: 'regular', family: TEXT },
  'small-strong': { size: '12px', leading: '16px', weight: 'bold', family: TEXT },
  'small-strong-italic': { size: '12px', leading: '16px', weight: 'bold', family: TEXT },
  table: {
    size: content(14),
    leading: content(20),
    weight: 'regular', family: TEXT,
  }, // no step down: the reference pins no table row, and its storybook is
  // inconsistent (one demo table is text-xs, one inherits prose); the user's
  // verdict on 12/16 was that tables read smaller than their own paragraphs
  'table-head': {
    size: content(14),
    leading: content(20),
    weight: 'medium', family: TEXT,
  },
}

// ------------------------------------------------------------- the rungs

test('the four weight rungs are the compensation table values', function () {
  assert.deepEqual(WEIGHTS.regular, { light: '400', dark: '360' })
  assert.deepEqual(WEIGHTS.medium, { light: '500', dark: '460' })
  assert.deepEqual(WEIGHTS.semibold, { light: '580', dark: '550' })
  // Bold: the reference lists the axis value 660 in BOTH palettes (:394);
  // the faces are variable, so 660 maps onto wght with no static snap.
  assert.deepEqual(WEIGHTS.bold, { light: '660', dark: '660' })
})

test('the three thinned rungs differ light vs dark, bold does not', function () {
  assert.notEqual(WEIGHTS.regular.light, WEIGHTS.regular.dark)
  assert.notEqual(WEIGHTS.medium.light, WEIGHTS.medium.dark)
  assert.notEqual(WEIGHTS.semibold.light, WEIGHTS.semibold.dark)
  assert.equal(WEIGHTS.bold.light, WEIGHTS.bold.dark)
})

// ------------------------------------------------------------- the roles

test('every host markdown role is covered exactly once', function () {
  const names = TYPOGRAPHY_ROLES.map(function (role) { return role.name })
  assert.deepEqual(names.slice().sort(), Object.keys(EXPECTED).sort(),
    'a role the host consumes would otherwise keep the DeepSeek default')
  assert.equal(new Set(names).size, names.length, 'duplicate role name')
})

test('each role carries the matrix size, leading, weight and family', function () {
  const tokens = buildTypographyTokens()
  for (const role of TYPOGRAPHY_ROLES) {
    const expected = EXPECTED[role.name]
    const base = '--dsw-font-markdown-' + role.name
    assert.equal(tokens[base + '-font-size'].light, expected.size, role.name + ' size')
    assert.equal(tokens[base + '-font-size'].dark, expected.size, role.name + ' dark size')
    assert.equal(tokens[base + '-line-height'].light, expected.leading, role.name + ' leading')
    assert.equal(tokens[base + '-line-height'].dark, expected.leading, role.name + ' dark leading')
    assert.equal(tokens[base + '-font-family'].light, expected.family, role.name + ' family')
    assert.equal(tokens[base + '-font-weight'].light, WEIGHTS[expected.weight].light, role.name + ' light weight')
    assert.equal(tokens[base + '-font-weight'].dark, WEIGHTS[expected.weight].dark, role.name + ' dark weight')
  }
})

test('every role emits the six tokens the host theme declares', function () {
  const tokens = buildTypographyTokens()
  for (const role of TYPOGRAPHY_ROLES) {
    const base = '--dsw-font-markdown-' + role.name
    for (const suffix of ['', '-font-family', '-font-size', '-font-weight', '-font-style', '-line-height']) {
      assert.ok(Object.hasOwn(tokens, base + suffix), 'missing ' + base + suffix)
    }
  }
  // 17 roles × 6 tokens + the two family roles + 13 UI steps × 2 tokens.
  assert.equal(Object.keys(tokens).length, 17 * 6 + 2 + 13 * 2)
  assert.ok(TYPOGRAPHY_TOKEN_NAMES.length === Object.keys(tokens).length)
})

// ---------------------------------------------- requirement: exact values

test('body is 14px/20px regular, 400 light / 360 dark', function () {
  const tokens = buildTokens(sanitize({}))
  assert.equal(tokens['--dsw-font-markdown-base-font-size'].light, content(14))
  assert.equal(tokens['--dsw-font-markdown-base-line-height'].light, content(20))
  assert.equal(tokens['--dsw-font-markdown-base-font-weight'].light, '400')
  assert.equal(tokens['--dsw-font-markdown-base-font-weight'].dark, '360')
  // The shorthand omits weight 400 (the host's own spelling) but the thinned
  // 360 MUST be spelled out.
  assert.equal(tokens['--dsw-font-markdown-base'].light,
    content(14) + '/' + content(20) + ' ' + TEXT)
  assert.equal(tokens['--dsw-font-markdown-base'].dark,
    '360 ' + content(14) + '/' + content(20) + ' ' + TEXT)
})

test('markdown headings are semibold 580 light / 550 dark', function () {
  const tokens = buildTokens(sanitize({}))
  for (const role of ['h1', 'h2', 'h3', 'h4']) {
    assert.equal(tokens['--dsw-font-markdown-' + role + '-font-weight'].light, '580', role)
    assert.equal(tokens['--dsw-font-markdown-' + role + '-font-weight'].dark, '550', role)
    assert.ok(tokens['--dsw-font-markdown-' + role].light.startsWith('580 '), role + ' shorthand')
    assert.ok(tokens['--dsw-font-markdown-' + role].dark.startsWith('550 '), role + ' dark shorthand')
  }
})

test('inline code is 12px/14px medium, 500 light / 460 dark', function () {
  const tokens = buildTokens(sanitize({}))
  assert.equal(tokens['--dsw-font-markdown-code-font-size'].light, code(12))
  assert.equal(tokens['--dsw-font-markdown-code-line-height'].light, code(14))
  assert.equal(tokens['--dsw-font-markdown-code-font-weight'].light, '500')
  assert.equal(tokens['--dsw-font-markdown-code-font-weight'].dark, '460')
  assert.equal(tokens['--dsw-font-markdown-code-font-family'].light, CODE)
})

test('code blocks are 12px/17.5px regular with tabular numerals', function () {
  const tokens = buildTokens(sanitize({}))
  assert.equal(tokens['--dsw-font-markdown-code-block-font-size'].light, code(12))
  assert.equal(tokens['--dsw-font-markdown-code-block-line-height'].light, code(17.5))
  assert.equal(tokens['--dsw-font-markdown-code-block-font-weight'].light, '400')
  assert.equal(tokens['--dsw-font-markdown-code-block-font-weight'].dark, '360')
  assert.equal(tokens['--dsw-font-markdown-code-block-font-family'].light, CODE)

  // `tabular-nums` is a property, not a font token — it lives in the sheet.
  const css = buildCssFor(sanitize({}))
  const blocks = css.split('}')
  const tabular = blocks.find(function (block) {
    return block.includes('font-variant-numeric: tabular-nums') && block.includes('.md-code-block')
  })
  assert.ok(tabular, 'the code block rule must carry tabular-nums')
})

test('the app text and code families resolve through the embedded stacks', function () {
  const tokens = buildTokens(sanitize({}))
  // The Anthropic faces are the DEFAULT, not a hard override: the host's own
  // preference variable comes first, so a family picked in Settings wins and
  // the picker can never silently disagree with the screen. This mirrors the
  // host's own expression (ar(--dsh-font-family-text, <default stack>)).
  assert.equal(tokens['--dsw-font-family'].light,
    'var(--dsh-font-family-text, var(--font-anthropic-sans))')
  assert.equal(tokens['--dsw-font-family'].dark,
    'var(--dsh-font-family-text, var(--font-anthropic-sans))')
  assert.equal(tokens['--ds-font-family-code'].light,
    'var(--dsh-font-family-code, var(--font-anthropic-mono))')
  assert.equal(tokens['--ds-font-family-code'].dark,
    'var(--dsh-font-family-code, var(--font-anthropic-mono))')
  // And those custom properties are the reference chains declared by fonts.js.
  const css = buildCssFor(sanitize({}))
  assert.ok(css.includes('--font-anthropic-sans: "anthropic-sans", var(--font-sans-fallbacks);'))
  // The mono chain now names a Windows-available monospace before the CJK rung,
  // and the CJK fallback is the shipped shifted face rather than bare `monospace`.
  assert.ok(css.includes('--font-anthropic-mono: "anthropic-mono", ui-monospace,'))
  assert.ok(css.includes('"Cascadia Mono"'),
    'the mono chain must name a monospace Windows actually ships')
  assert.ok(css.includes('var(--font-cjk-sans)'),
    'the mono chain must reach the shipped CJK face, not the raw system default')
  // Text roles read the sans token; code roles read the mono token.
  assert.equal(tokens['--dsw-font-markdown-base-font-family'].light, TEXT)
  assert.equal(tokens['--dsw-font-markdown-code-font-family'].light, CODE)
})

// --------------------------------------------------------------- pairs

test('every typography token is a non-empty { light, dark } pair', function () {
  const tokens = buildTypographyTokens()
  for (const name of Object.keys(tokens)) {
    assert.equal(typeof tokens[name].light, 'string', name)
    assert.equal(typeof tokens[name].dark, 'string', name)
    assert.ok(tokens[name].light.length > 0, name + ' light')
    assert.ok(tokens[name].dark.length > 0, name + ' dark')
  }
  // The typography half rides the same override map as the palette.
  const all = buildTokens(sanitize({}))
  for (const name of TYPOGRAPHY_TOKEN_NAMES) {
    assert.ok(Object.hasOwn(all, name), name + ' missing from the override map')
  }
  assert.ok(NON_COLOR_TOKENS.includes('--dsw-font-family'))
  assert.ok(NON_COLOR_TOKENS.includes('--ds-font-family-code'))
})

test('light and dark shorthands differ only in the weight they carry', function () {
  const tokens = buildTypographyTokens()
  for (const role of TYPOGRAPHY_ROLES) {
    const base = '--dsw-font-markdown-' + role.name
    const light = tokens[base].light
    const dark = tokens[base].dark
    const rung = WEIGHTS[role.weight]
    const strip = function (value) {
      // Remove the leading style/weight words, leaving the size/leading/family.
      return value.replace(/^(?:italic )?(?:\d+ )?/, '')
    }
    assert.equal(strip(light), strip(dark), role.name + ': palettes may only differ in weight')
    if (rung.light !== rung.dark) {
      assert.notEqual(light, dark, role.name + ' must thin in dark mode')
      assert.match(dark, new RegExp('^(?:italic )?' + rung.dark + ' '),
        role.name + ' dark shorthand weight')
    }
  }
})

// --------------------------------------------- UI-chrome weight tokens

/** The thirteen non-markdown steps the host theme declares (theme-client.js). */
const HOST_UI_STEPS = [
  '--dsw-font-xxxs-11', '--dsw-font-xxxs-strong-11',
  '--dsw-font-xxs-12', '--dsw-font-xxs-strong-12',
  '--dsw-font-xs-13', '--dsw-font-xs-strong-13',
  '--dsw-font-s-14', '--dsw-font-s-strong-14',
  '--dsw-font-base-16', '--dsw-font-base-strong-16',
  '--dsw-font-m-18', '--dsw-font-l-20', '--dsw-font-xl-24',
]

function uiShorthand(step, weightValue) {
  return (weightValue === '400' ? '' : weightValue + ' ')
    + step.size + '/' + step.leading + ' ' + TEXT
}

test('all thirteen host UI-chrome steps are remapped', function () {
  assert.deepEqual(UI_ROLE_TOKENS.map(function (step) { return step.token }).sort(),
    HOST_UI_STEPS.slice().sort(),
    'a host step that keeps its 400/500 weight would not follow the reference')
  assert.equal(new Set(UI_ROLE_TOKENS.map(function (step) { return step.token })).size,
    UI_ROLE_TOKENS.length, 'duplicate step')
})

test('each UI step carries its reference rung in both palettes', function () {
  const tokens = buildTypographyTokens()
  for (const step of HOST_UI_STEPS.map(function (token) {
    return UI_ROLE_TOKENS.find(function (entry) { return entry.token === token })
  })) {
    const rung = WEIGHTS[step.weight]
    const expectedLight = uiShorthand(step, rung.light)
    const expectedDark = uiShorthand(step, rung.dark)
    assert.equal(tokens[step.token].light, expectedLight, step.token + ' light shorthand')
    assert.equal(tokens[step.token].dark, expectedDark, step.token + ' dark shorthand')
    assert.equal(tokens[step.token + '-font-weight'].light, rung.light, step.token + ' light weight')
    assert.equal(tokens[step.token + '-font-weight'].dark, rung.dark, step.token + ' dark weight')
    // Weight-only pass: the host's size/leading/family are not re-declared.
    for (const suffix of ['-font-size', '-font-family', '-line-height', '-font-style']) {
      assert.ok(!Object.hasOwn(tokens, step.token + suffix),
        step.token + suffix + ' must stay the host value')
    }
  }
})

test('UI steps thin in dark mode exactly where the reference table does', function () {
  const tokens = buildTypographyTokens()
  for (const step of UI_ROLE_TOKENS) {
    const rung = WEIGHTS[step.weight]
    if (rung.light === rung.dark) continue
    assert.notEqual(tokens[step.token].light, tokens[step.token].dark, step.token + ' must thin')
    assert.notEqual(tokens[step.token + '-font-weight'].light,
      tokens[step.token + '-font-weight'].dark, step.token + ' weight pair')
  }
})

test('every emitted weight sits inside the embedded faces wght axis', function () {
  // Probed fvar: all six faces expose wght 300–800. A value outside it would
  // clamp instead of interpolating, which is exactly the failure the reference
  // weight replica must avoid.
  const AXIS_MIN = 300
  const AXIS_MAX = 800
  const tokens = buildTypographyTokens()
  const values = new Set()
  for (const rung of Object.values(WEIGHTS)) { values.add(rung.light); values.add(rung.dark) }
  values.add(GREETING_DISPLAY.weight)
  for (const name of Object.keys(tokens)) {
    const match = /-font-weight$/.exec(name)
    if (match === null) continue
    values.add(tokens[name].light)
    values.add(tokens[name].dark)
  }
  for (const value of values) {
    const numeric = Number(value)
    assert.ok(Number.isFinite(numeric), 'non-numeric weight: ' + value)
    assert.ok(numeric >= AXIS_MIN && numeric <= AXIS_MAX,
      value + ' is outside the variable wght axis ' + AXIS_MIN + '–' + AXIS_MAX)
  }
})

// --------------------------------------------- element → weight table

/** Reference file:line is the matrix (:433-456) or the display row (:547). */
const REFERENCE_ELEMENT_WEIGHTS = {
  'assistant identity name': ['580', '550'],
  'model version badge': ['500', '460'],
  'message timestamp': ['400', '360'],
  'assistant body paragraph': ['400', '360'],
  'user bubble text': ['400', '360'],
  'message action buttons': ['500', '460'],
  'thinking accordion trigger': ['500', '460'],
  'raw thought log': ['400', '360'],
  'composer textarea': ['400', '360'],
  'composer placeholder': ['400', '360'],
  'composer footer action': ['500', '460'],
  'model selector': ['500', '460'],
  'send button': ['580', '550'],
  'code block': ['400', '360'],
  'inline code': ['500', '460'],
  'artifact title': ['580', '550'],
  'code language tag': ['500', '460'],
  'attachment file name': ['500', '460'],
  'attachment file size': ['400', '360'],
  'modal title': ['580', '550'],
  'segmented tab': ['400', '360'],
  'buttons SM/MD': ['500', '460'],
  'keyboard shortcut cap': ['580', '550'],
  'hero greeting': ['330', '330'],
}

const ALLOWED_CARRIERS = [
  'token', 'variable', 'plugin-hook', 'inherited', 'not-addressable', 'none',
]

function expectedPair(row) {
  if (row.rung === 'display') return [GREETING_DISPLAY.weight, GREETING_DISPLAY.weight]
  const rung = WEIGHTS[row.rung]
  return [rung.light, rung.dark]
}

test('the element table covers every element the reference matrix pins', function () {
  assert.deepEqual(ELEMENT_WEIGHTS.map(function (row) { return row.element }).sort(),
    Object.keys(REFERENCE_ELEMENT_WEIGHTS).sort(),
    'an element the reference pins would otherwise keep a host weight')
  for (const row of ELEMENT_WEIGHTS) {
    assert.match(row.reference, /^:(?:\d+)(?:-\d+)?$/, row.element + ' needs a reference line')
    assert.ok(ALLOWED_CARRIERS.includes(row.carrier),
      row.element + ' has an unknown carrier ' + row.carrier)
    assert.deepEqual(expectedPair(row).map(String),
      REFERENCE_ELEMENT_WEIGHTS[row.element],
      row.element + ' must carry the reference pair at ' + row.reference)
  }
})

test('addressable elements carry their reference weight in the emitted map', function () {
  const tokens = buildTypographyTokens()
  const css = buildCssFor(sanitize({}))
  for (const row of ELEMENT_WEIGHTS) {
    const pair = expectedPair(row)
    if (row.carrier === 'token') {
      assert.ok(Array.isArray(row.tokens) && row.tokens.length > 0,
        row.element + ' must name its token carrier')
      for (const token of row.tokens) {
        assert.equal(tokens[token + '-font-weight'].light, pair[0], row.element + ' light weight')
        assert.equal(tokens[token + '-font-weight'].dark, pair[1], row.element + ' dark weight')
      }
    }
    if (row.carrier === 'variable') {
      // The language tag rides the host's own banner-font variable.
      const light = css.split('.md-code-block {')[1]
      const dark = css.split('body[data-ds-dark-theme] .md-code-block {')[1]
      assert.ok(light.includes('--dsl-code-block-banner-font: '
        + pair[0] + ' 11px/18px var(--dsw-font-family);'), row.element + ' light banner font')
      assert.ok(dark.includes('--dsl-code-block-banner-font: '
        + pair[1] + ' 11px/18px var(--dsw-font-family);'), row.element + ' dark banner font')
    }
    if (row.carrier === 'plugin-hook') {
      const body = css.split('[data-cds-greeting] {')[1].split('}')[0]
      assert.match(body, new RegExp('font-weight: ' + pair[0] + ' !important;'), row.element)
    }
  }
})

test('elements DSH cannot address are documented, never invented', function () {
  const rows = ELEMENT_WEIGHTS.filter(function (row) {
    return row.carrier === 'not-addressable' || row.carrier === 'none'
  })
  assert.ok(rows.length >= 12, 'expected the not-addressable list to be real')
  for (const row of rows) {
    assert.equal(typeof row.detail, 'string')
    assert.ok(row.detail.length > 10, row.element + ' needs a reason')
    assert.ok(!Object.hasOwn(row, 'tokens'), row.element + ' must not claim a token')
    assert.ok(!Object.hasOwn(row, 'variable'), row.element + ' must not claim a variable')
  }
  // The complete "no DSH token" list the report names.
  const names = rows.map(function (row) { return row.element }).sort()
  assert.deepEqual(names, [
    'artifact title', 'assistant identity name', 'attachment file name',
    'attachment file size', 'buttons SM/MD', 'composer footer action',
    'composer placeholder', 'composer textarea', 'keyboard shortcut cap',
    'message action buttons', 'message timestamp', 'modal title',
    'model selector', 'model version badge', 'segmented tab', 'send button',
    'thinking accordion trigger',
  ].sort())
})

test('the segmented-tab row keeps its two-state note', function () {
  const row = ELEMENT_WEIGHTS.find(function (entry) { return entry.element === 'segmented tab' })
  assert.ok(row)
  assert.match(row.note, /inactive 400 \/ active 500/)
})

// ---------------------------------------------- the greeting display row

test('the greeting display constants are the reference .font-display row', function () {
  assert.equal(GREETING_DISPLAY.size, '38px') // 2.375rem, :547
  assert.equal(GREETING_DISPLAY.lineHeight, '1.2')
  assert.equal(GREETING_DISPLAY.weight, '330') // Light wght, NOT 500/580
  assert.equal(GREETING_DISPLAY.variationSettings, '"opsz" 48')
  assert.match(GREETING_DISPLAY.reference, /:547/)
})

test('the shipped greeting rule carries the reference display row exactly', function () {
  const css = buildCssFor(sanitize({}))
  const body = css.split('[data-cds-greeting] {')[1].split('}')[0]
  assert.match(body, /font-family: var\(--font-anthropic-serif\)/)
  assert.match(body, /font-size: 38px !important;/)
  assert.match(body, /line-height: 1\.2 !important;/)
  assert.match(body, /font-weight: 330 !important;/)
  assert.match(body, /font-variation-settings: "opsz" 48;/)
  // The host headline's 500 and a semibold 580 are both wrong for this row.
  assert.ok(!/font-weight: (?:500|550|580) !important;/.test(body),
    'the greeting must keep the reference display weight, not a title rung')
})

test('the family roles are palette-independent', function () {
  const tokens = buildTypographyTokens()
  assert.equal(tokens['--dsw-font-family'].light, tokens['--dsw-font-family'].dark)
  assert.equal(tokens['--ds-font-family-code'].light, tokens['--ds-font-family-code'].dark)
})
