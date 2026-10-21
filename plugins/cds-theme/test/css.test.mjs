import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildCss, buildCssFor } from '../client/src/styles.js'
import { buildGlow } from '../client/src/theme.js'
import { buildTokens } from '../client/src/tokens.js'
import { sanitize } from '../client/src/constants.js'
import { CODE_SURFACE, EASING, ACCENT_PRESETS } from '../client/src/palette.js'
import {
  CODE_BLOCK_RULES, MARKDOWN_BODY_RULES, CODE_BLOCK_RULE_COUNT, MARKDOWN_BODY_RULE_COUNT,
  A_TIER_RULES, B_TIER_RULES,
} from './rule-baseline.mjs'

const glow = function (state) { return buildGlow(state) }

/**
 * The emitted text of one comment-delimited block, marker line included.
 * Blocks are separated by the `/* ---- … *\/` markers `buildCss` emits.
 */
function blockOf(css, prefix) {
  const re = /\/\* ----[^\n]*\*\//g
  const marks = [...css.matchAll(re)].map(function (m) { return { text: m[0], index: m.index } })
  for (let i = 0; i < marks.length; i += 1) {
    if (!marks[i].text.startsWith(prefix)) continue
    const end = i + 1 < marks.length ? marks[i + 1].index : css.length
    return css.slice(marks[i].index, end)
  }
  return null
}

/** A minimal CSS parser: selector → declaration block, ignoring @media nesting. */
function parseRules(css) {
  const rules = []
  // Strip comments so their prose cannot look like a selector.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match = re.exec(text)
  while (match !== null) {
    rules.push({
      selector: match[1].trim().replace(/\s+/g, ' '),
      body: match[2].trim(),
    })
    match = re.exec(text)
  }
  return rules
}

function hasRule(css, selectorPattern, bodyPattern) {
  return parseRules(css).some(function (rule) {
    return selectorPattern.test(rule.selector)
      && (bodyPattern === undefined || bodyPattern.test(rule.body))
  })
}

// ------------------------------------------------------------ structure

test('the stylesheet is balanced and non-empty', function () {
  const css = buildCssFor(sanitize({}))
  assert.ok(css.length > 2000, 'expected a substantive stylesheet')
  const open = (css.match(/\{/g) || []).length
  const close = (css.match(/\}/g) || []).length
  assert.equal(open, close, 'every block must be closed')
  assert.ok(parseRules(css).length > 15, 'expected a real rule set')
})

test('the stylesheet never targets a hashed CSS-Modules class', function () {
  // The host salts its class names on every build (`.RlGAzG_card`,
  // `._markdown_1ypvv_5`). Keying on one would break silently on upgrade, so
  // the sheet must use data-* hooks or the salted-name-tolerant
  // `[class*="markdown"]` form only.
  const css = buildCssFor(sanitize({}))
  const rules = parseRules(css)
  for (const rule of rules) {
    // A hash class looks like `.<alnum>_` or `._name_abc12_3`.
    const hashed = /\.(?:_?[A-Za-z0-9]+)_[A-Za-z0-9]+_\d+/.test(rule.selector)
    assert.ok(!hashed, 'hashed class selector found: ' + rule.selector)
    const scoped = /\.(?:[A-Za-z0-9]{6})_[a-z]/.test(rule.selector)
    assert.ok(!scoped, 'salted class selector found: ' + rule.selector)
  }
})

test('component rules key on stable data-* hooks', function () {
  const css = buildCssFor(sanitize({}))
  for (const hook of ['data-composer-card', 'data-composer-input', 'data-code-block-banner', 'data-menu-material']) {
    assert.ok(css.includes('[' + hook + ']'), 'expected a rule for [' + hook + ']')
  }
})

// ------------------------------------------------------------- elevation

test('elevation tokens are emitted for body AND body *', function () {
  // The host declares these on `body, body *`; an inline style on `body` (the
  // way the presenter writes tokens) cannot override a descendant's own
  // declaration, so the sheet has to carry them with !important.
  const state = sanitize({})
  const css = buildCssFor(state)
  const rules = parseRules(css)
  const bodyRule = rules.find(function (rule) { return rule.selector === 'body, body *' })
  assert.ok(bodyRule, 'expected a `body, body *` rule')
  for (const token of ['--dsw-elevation-panel', '--dsw-elevation-prominent', '--dsw-elevation-soft']) {
    assert.ok(bodyRule.body.includes(token), 'expected ' + token + ' in the body,body * rule')
    assert.ok(/!\s*important/.test(bodyRule.body), token + ' must be !important to beat the host')
  }
})

test('elevation has a dark counterpart', function () {
  const state = sanitize({})
  const css = buildCssFor(state)
  const rules = parseRules(css)
  const dark = rules.find(function (rule) {
    return rule.selector === 'body[data-ds-dark-theme], body[data-ds-dark-theme] *'
  })
  assert.ok(dark, 'expected a dark elevation rule')
  assert.ok(dark.body.includes('--dsw-elevation-soft'))
})

test('elevation strength reaches the emitted shadows', function () {
  const state = sanitize({ elevation: 0 })
  const css = buildCssFor(state)
  const rules = parseRules(css)
  const bodyRule = rules.find(function (rule) { return rule.selector === 'body, body *' })
  assert.ok(/rgba\(0, 0, 0, 0\)/.test(bodyRule.body), 'elevation 0 should zero the shadow alphas')
})

// ---------------------------------------------------------------- focus

test('the focus ring is a three-layer clay shadow, not an outline', function () {
  const state = sanitize({})
  const css = buildCssFor(state)
  // Pick the body-wide rule specifically: the selected-cube rule is also a
  // :focus-visible box-shadow, and matching it would test the wrong thing.
  const rule = parseRules(css).find(function (r) {
    return r.selector === 'body :focus-visible:not(:read-write)'
  })
  assert.ok(rule, 'expected the body-wide focus-visible rule')
  assert.ok(rule.body.includes('var(--dsw-focus-ring-color)'), 'ring must use the accent token')
  // Three layers: the inset separator, the solid core, the glow.
  const layers = rule.body.split('box-shadow:')[1].split('!important')[0]
  assert.ok((layers.match(/,/g) || []).length >= 2, 'expected three shadow layers')
  assert.ok(rule.body.includes('--dsw-focus-ring-glow'), 'expected the accent glow layer')
})

test('pointer modality still suppresses the ring', function () {
  // focus.css zeroes the ring colour for mouse input; a box-shadow rule must
  // honour that or a click would paint a ring the host deliberately hides.
  const state = sanitize({})
  const css = buildCssFor(state)
  const rule = parseRules(css).find(function (r) {
    return r.selector.includes("data-input-modality='pointer'")
  })
  assert.ok(rule, 'expected a pointer-modality rule')
  assert.match(rule.body, /box-shadow:\s*none/)
})

// ------------------------------------------------------------- composer

test('the composer keeps its 20px CDS radius and gains three states', function () {
  const state = sanitize({})
  const css = buildCssFor(state)
  const card = parseRules(css).find(function (r) { return r.selector === '[data-composer-card]' })
  assert.ok(card, 'expected a composer card rule')
  assert.ok(card.body.includes('var(--dsw-radius-panel)'), 'radius must follow the token')
  assert.ok(card.body.includes('box-shadow'), 'expected a resting shadow')
  assert.ok(hasRule(css, /\[data-composer-card\].*:hover/, /--dsw-elevation-stroke-color/), 'expected a hover state')
  assert.ok(hasRule(css, /\[data-composer-card\].*:focus-within/, /--dsw-elevation-stroke-color/), 'expected a focus state')
})

test('composer hover/focus move the stroke variable instead of replacing the shadow', function () {
  // THE REGRESSION: hover/focus replaced the whole box-shadow with a fixed
  // `border-l3` inset ring. The workspace-picker variant of the card sets
  // `--dsw-elevation-stroke-color: transparent` and paints its own dashed
  // `:after` border, so the fixed ring stacked a solid line on top of it.
  const css = buildCssFor(sanitize({}))
  const states = parseRules(css).filter(function (r) {
    return /\[data-composer-card\]/.test(r.selector) && /:(hover|focus-within)/.test(r.selector)
  })
  assert.ok(states.length >= 2, 'expected hover and focus rules')

  for (const rule of states) {
    assert.ok(!/box-shadow\s*:/.test(rule.body),
      'state rule must not replace the shadow: ' + rule.selector)
    assert.ok(/--dsw-elevation-stroke-color\s*:/.test(rule.body),
      'state rule must raise the stroke variable: ' + rule.selector)
    assert.ok(rule.selector.includes('cardWorkspaceTrigger'),
      'state rule must exclude the workspace-trigger variant: ' + rule.selector)
  }
})

test('the composer interior adds no second ring', function () {
  // Single-stroke discipline: the shell already owns the ring.
  const state = sanitize({})
  const css = buildCssFor(state)
  const rule = parseRules(css).find(function (r) { return r.selector === '[data-composer-input]:focus, [data-composer-input]:focus-visible' })
  assert.ok(rule, 'expected an inner-input rule')
  assert.match(rule.body, /outline:\s*none/)
  assert.match(rule.body, /box-shadow:\s*none/)
})

// ----------------------------------------------------------------- code

test('code content is padded evenly inside the block', function () {
  // The host pads the pre 6px top / 20px bottom / 22px sides, which pins the
  // code to the top edge and leaves a band below it. The real app centres the
  // text; the theme mirrors that with symmetric padding.
  const rules = parseRules(buildCssFor(sanitize({})))
  const pre = rules.find(function (r) {
    return r.selector.includes('.md-code-block pre')
  })
  assert.ok(pre, 'expected a code-content padding rule')
  assert.match(pre.body, /padding:\s*14px 18px\s*!important/)
})

test('terminal line-heights are FIXED (only inline code follows the setting)', function () {
  // The host pins the terminal line-height in px (22px chat command block,
  // 18px tool row). These are now pinned on purpose: the code-size setting was
  // narrowed to the inline chip only, so a terminal cannot drift with it.
  const rules = parseRules(buildCssFor(sanitize({})))
  const chat = rules.find(function (r) { return r.selector === '[data-terminal]' })
  const tool = rules.find(function (r) { return r.selector === '[class*="terminalBody"]' })
  assert.ok(chat, 'expected the chat terminal rule')
  assert.ok(tool, 'expected the tool-row terminal rule')
  assert.match(chat.body, /line-height: 22px/)
  assert.match(tool.body, /line-height: 18px/)
})

test('code blocks pair their surface with the palette, in both modes', function () {
  // Values taken from the installed Claude desktop app (2.42304.2,
  // `ion-dist/js/c5d464fa3-Dlv8sG-j.js` `claude-light` / `claude-dark`):
  // a white block on the warm light canvas, #1a1a19 in dark mode.
  const css = buildCssFor(sanitize({}))

  const light = parseRules(css).find(function (r) { return r.selector === '.md-code-block' })
  assert.ok(light, 'expected a light-mode code-block rule')
  assert.ok(light.body.includes(CODE_SURFACE.light), 'light block must use the light surface')

  const dark = parseRules(css).find(function (r) {
    return r.selector === 'body[data-ds-dark-theme] .md-code-block'
  })
  assert.ok(dark, 'expected a dark-mode code-block rule')
  assert.ok(dark.body.includes(CODE_SURFACE.dark), 'dark block must use the dark surface')

  assert.equal(CODE_SURFACE.light, '#ffffff', 'Claude light block is white')
  assert.equal(CODE_SURFACE.dark, '#1a1a19', 'Claude dark block is #1a1a19, not the reconstruction #0d0d0c')
})

test('code blocks carry the Claude app syntax palette', function () {
  // The host renders token colours as var(--shiki-token-*), so these
  // declarations are the actual switch. Values are the app's `claude-light`
  // and `claude-dark` palettes; see docs/cds-spec.md §8.5.
  const css = buildCssFor(sanitize({}))
  const rules = parseRules(css)
  const light = rules.find(function (r) { return r.selector === '.md-code-block' })
  const dark = rules.find(function (r) { return r.selector === 'body[data-ds-dark-theme] .md-code-block' })
  assert.ok(light && dark)

  for (const [expect, rule, name] of [
    // Values from the app's real Shiki theme (claude-chat-light / -dark, 12
    // palette slots). The old hex values here were an approximation that had
    // drifted from it; these are transcribed from the theme factory.
    ['--shiki-foreground: hsl(220, 20%, 10%)', light, 'light foreground'],
    ['--shiki-token-keyword: hsl(280, 100%, 38%)', light, 'light keyword'],
    ['--shiki-token-string: hsl(120, 100%, 25%)', light, 'light string'],
    ['--shiki-token-constant: hsl(180, 100%, 25%)', light, 'light constant'],
    ['--shiki-foreground: hsl(220, 15%, 93%)', dark, 'dark foreground'],
    ['--shiki-token-keyword: hsl(280, 85%, 72%)', dark, 'dark keyword'],
    ['--shiki-token-string: hsl(95, 75%, 65%)', dark, 'dark string'],
    ['--shiki-token-constant: hsl(180, 80%, 65%)', dark, 'dark constant'],
  ]) {
    assert.ok(rule.body.includes(expect), name + ' missing')
  }
})

test('the code block never pins a literal text colour', function () {
  // Themed code text comes from var(--shiki-foreground) and the per-token
  // var(--shiki-token-*); a literal hex would survive a palette change and
  // reappear as the original light-on-light bug.
  const css = buildCssFor(sanitize({}))
  for (const rule of parseRules(css)) {
    if (!rule.selector.includes('md-code-block')) continue
    assert.ok(!/(^|[^-])color:\s*#(?:[0-9a-f]{6})/i.test(rule.body),
      'code block rule must not pin a literal text colour: ' + rule.selector)
  }
})

test('shiki variables are scoped to the code block', function () {
  // The overrides are what recolour the syntax; they must not leak into the
  // rest of the app (inline code, tool summaries, terminal elsewhere).
  //
  // TWO SURFACES ARE ALLOWED, and only two. The markdown block was the first;
  // the theme's own edit/write diff card (`diffview.js`) is the second, because
  // it renders token spans by the same mechanism and would otherwise fall back
  // to the host's palette. Any third site is still a leak.
  const css = buildCssFor(sanitize({}))
  const rules = parseRules(css).filter(function (r) { return r.body.includes('--shiki-token-') })
  assert.ok(rules.length > 0, 'expected Shiki token overrides')
  for (const rule of rules) {
    assert.ok(rule.selector.includes('md-code-block') || rule.selector.includes('data-cds-diffcard'),
      'Shiki variables leaked outside the block: ' + rule.selector)
  }
})

test('code blocks go through the host’s own --dsl-code-block-* seam', function () {
  // The host declares these variables ON .md-code-block, so a descendant
  // selector cannot reach them. Driving them is the supported path; matching
  // the hashed `_block_7gxqk_4` is not.
  const state = sanitize({})
  const css = buildCssFor(state)
  const rule = parseRules(css).find(function (r) { return r.selector === '.md-code-block' })
  assert.ok(rule.body.includes('--dsl-code-block-background'), 'expected the host seam variable')
  assert.ok(rule.body.includes('--dsl-code-block-border-radius'), 'expected the radius seam')
})

// ------------------------------------------------------------ selection

test('the appearance picker marks the selected cube', function () {
  // THE REGRESSION: the host marks it with `.selected { border-color:
  // var(--dsw-static-neutral-bluish-400) }` — a STATIC token the theme never
  // overrides — plus a fill that equals the unselected card in light mode. The
  // result was "跟随系统" looking like nothing was selected.
  const css = buildCssFor(sanitize({}))
  const selected = parseRules(css).filter(function (r) {
    return r.selector.includes('selected')
      && !r.selector.includes(':focus-visible')
  })
  assert.ok(selected.length >= 2, 'expected light and dark selected-state rules')

  for (const rule of selected) {
    assert.ok(/border-color:/.test(rule.body), 'selected state needs a visible border: ' + rule.selector)
    assert.ok(/background:/.test(rule.body), 'selected state needs a visible fill: ' + rule.selector)
    assert.ok(!rule.body.includes('--dsw-static-'), 'must not lean on a static palette token')
  }
})

test('the agent-preset active card is marked the same way', function () {
  // Same defect as the appearance picker, second site: `.cardActive` reads
  // `--dsw-static-neutral-bluish-400` for its border. That page is not inside
  // the General item slot, so the rule must name the card by its stable
  // `data-agent-preset-id` hook rather than lean on the slot scope.
  const css = buildCssFor(sanitize({}))
  const rule = parseRules(css).find(function (r) {
    return r.selector.includes('[data-agent-preset-id][class*="cardActive"]')
      && !r.selector.includes('data-ds-dark-theme')
  })
  assert.ok(rule, 'expected an active-preset-card rule')
  assert.ok(/border-color:/.test(rule.body), 'needs a visible border')
  assert.ok(!rule.body.includes('--dsw-static-'), 'must not lean on a static token')
})

test('the toast link is readable on a toast surface that is dark in BOTH palettes', function () {
  // `--dsw-alias-toast-bg` is #151515 in light and #2c2c2a in dark. The palette-
  // aware `--dsw-alias-link` is the dark-on-white value in light mode (3.73:1
  // on #151515), so the toast needs the light-on-dark accent in both.
  const css = buildCssFor(sanitize({}))
  const rule = parseRules(css).find(function (r) { return r.selector === '[class*="toast"] button' })
  assert.ok(rule, 'expected a toast link rule')
  assert.ok(!rule.body.includes('--dsw-alias-link'), 'must not use the palette-aware link token')
  assert.match(rule.body, /color:\s*#[0-9a-f]{6}/i, 'expected a fixed light-on-dark colour')
})

test('the selected accent follows the chosen preset', function () {
  const clay = buildCssFor(sanitize({ accent: 'clay' }))
  const graphite = buildCssFor(sanitize({ accent: 'graphite' }))
  const preset = ACCENT_PRESETS.find(function (e) { return e.id === 'graphite' })
  assert.ok(graphite.includes(preset.light), 'expected the graphite accent in the sheet')
  assert.notEqual(
    parseRules(clay).filter(function (r) { return r.selector.includes('selected') })[0].body,
    parseRules(graphite).filter(function (r) { return r.selector.includes('selected') })[0].body,
  )
})

test('no rule keys on the collapsed-sidebar attribute', function () {
  // `data-sidebar-collapsed` lives on the AppFrame ROOT, not on the sidebar, so
  // a rule scoped to it would match nearly every element in the app.
  const state = sanitize({})
  const css = buildCssFor(state)
  assert.ok(!css.includes('data-sidebar-collapsed'),
    'data-sidebar-collapsed is an app-frame attribute and must not scope component rules')
})

test('the code banner is a floating copy control, not a header strip', function () {
  // The real Claude app has no header: the copy control floats in the
  // top-right and appears on hover. The host always renders a banner, so the
  // wrapper is collapsed, the language label hidden, and only the actions kept
  // as an overlay — deleting the banner would also delete the copy button.
  const rules = parseRules(buildCssFor(sanitize({})))
  const banner = rules.find(function (r) {
    return r.selector === '.md-code-block [data-code-block-banner]'
  })
  assert.ok(banner, 'expected a banner rule')
  assert.match(banner.body, /position:\s*absolute/)
  assert.match(banner.body, /background:\s*transparent/)
  assert.ok(!/border-bottom/.test(banner.body), 'a floating control draws no header seam')

  const label = rules.find(function (r) {
    return r.selector === '.md-code-block [data-code-block-banner] > :first-child'
  })
  assert.ok(label && /display:\s*none/.test(label.body), 'the language label is hidden')

  const reveal = rules.find(function (r) {
    return r.selector.includes(':hover [data-code-block-banner]')
  })
  assert.ok(reveal && /opacity:\s*1/.test(reveal.body), 'the control appears on hover')

  // The wrapper must collapse, or a blank band remains above the code.
  const wrap = rules.find(function (r) { return r.selector.includes('bannerWrap') })
  assert.ok(wrap, 'expected a bannerWrap rule')
  assert.match(wrap.body, /position:\s*static/)
  assert.match(wrap.body, /background:\s*transparent/)
  assert.match(wrap.body, /min-height:\s*0/)
})

test('inline code is not painted with the block surface', function () {
  // Only fenced blocks are terminals; inline code sits in prose and must not
  // punch a block-coloured hole in it.
  const state = sanitize({})
  const css = buildCssFor(state)
  const rule = parseRules(css).find(function (r) { return r.selector.includes(':not(pre) > code') })
  assert.ok(rule, 'expected an inline-code rule')
  for (const surface of [CODE_SURFACE.light, CODE_SURFACE.dark]) {
    assert.ok(!rule.body.includes(surface), 'inline code must not use a block surface')
  }
})

test('inline code keeps the app chip geometry and fill', function () {
  // Measured from the installed Claude app: alpha-1 fill (#f0f0ef over the
  // light canvas), half-pixel alpha-3 edge, 4px radius, 1px 4px padding, and
  // RED letters. The old 1px inset ring was nearly invisible on the warm
  // canvas.
  const rule = parseRules(buildCssFor(sanitize({})))
    .find(function (r) { return r.selector.includes(':not(pre) > code') })
  assert.ok(rule, 'expected an inline-code rule')
  assert.ok(rule.body.includes('background-color: #f0f0ef'),
    'the chip fill is the app alpha-1 composite')
  assert.ok(rule.body.includes('border-radius: 4px'),
    'the chip radius is 4px in the chat markdown rule')
  assert.ok(rule.body.includes('padding: 1px 4px'),
    'the chip padding is 1px 4px')
  assert.ok(rule.body.includes('border: .5px solid hsla(0, 0%, 8%, 0.10)'),
    'the chip edge is a half-pixel alpha-3 line')
  assert.ok(rule.body.includes('box-shadow: none'),
    'the inset ring is gone; it read as an invisible hairline')
  // The host appends `font-size: .875em !important` (12.25px at 14px body);
  // the chip must use the code-size token instead.
  assert.ok(rule.body.includes('font-size: var(--dsw-font-markdown-code-font-size)'),
    'the chip font size is the code-size token, not the host .875em')
  assert.ok(rule.selector.includes(':not(:where(h1, h2, h3, h4, h5, h6) code)'),
    'heading code keeps the host inheritance')
  // Dark mode shifts the fill/edge and the ink together.
  const dark = parseRules(buildCssFor(sanitize({}))).find(function (r) {
    return r.selector.startsWith('body[data-ds-dark-theme]') && r.selector.includes(':not(pre) > code')
  })
  assert.ok(dark, 'expected a dark-mode chip rule')
  assert.ok(dark.body.includes('background-color: #262625'))
})

test('inline code letters are the app code-chip ink, not body ink', function () {
  // REGRESSION: the chip once set fill and edge but not `color`, so it
  // inherited the body's near-black ink. The real app paints these letters
  // with `--cds-text-danger` — red-600 #8e2626 light, red-300 #ec7e7e dark —
  // and a transcript screenshot measures every chip at exactly rgb(142,38,38)
  // against #0b0b0b body text. Unset `color` is the bug this pins: if the
  // declaration disappears again, the light and dark rules below go red.
  const rules = parseRules(buildCssFor(sanitize({})))
  const light = rules.find(function (r) {
    return !r.selector.startsWith('body[data-ds-dark-theme]') && r.selector.includes(':not(pre) > code')
  })
  assert.ok(light, 'expected the light inline-code rule')
  assert.match(light.body, /color:\s*#8e2626\s*!important/,
    'the chip letters are red-600, not the inherited body ink')

  const dark = rules.find(function (r) {
    return r.selector.startsWith('body[data-ds-dark-theme]') && r.selector.includes(':not(pre) > code')
  })
  assert.ok(dark, 'expected the dark inline-code rule')
  assert.match(dark.body, /color:\s*#ec7e7e\s*!important/,
    'dark mode takes red-300 so the chip stays legible on #262625')
})

// ---------------------------------------------------------------- motion

test('CDS easing replaces the host default without touching durations', function () {
  const state = sanitize({})
  const css = buildCssFor(state)
  // More than one rule targets :root (easing, file-type icon colour), so pick
  // the one that carries the easing rather than the first match.
  const rule = parseRules(css).find(function (r) {
    return r.selector === ':root' && r.body.includes('--ds-ease-in-out')
  })
  assert.ok(rule, 'expected a :root rule carrying the easing tokens')
  assert.ok(rule.body.includes('--ds-ease-in-out: ' + EASING.inOut), 'expected the CDS in-out curve')
  assert.ok(rule.body.includes('--ds-ease-swift'), 'expected the swift curve')
})

test('stock blue leftovers are rebound through seams, not the static layer', function () {
  const css = buildCssFor(sanitize({}))
  // The icon-colour variable is assigned (it outranks every per-type default).
  assert.ok(css.includes('--dsh-file-type-icon-color'), 'file-type icon seam missing')
  // The static palette is never redeclared: that would recolour every consumer.
  assert.ok(!/--dsw-static-[a-z0-9-]+\s*:/.test(css), 'must not override --dsw-static-* tokens')
})

test('dark plan/schedule/deliverables cards follow the themed ladder', function () {
  // Their stock fill is --dsw-static-neutral-850 (#212123, hue 240): a blue-tinted
  // graphite beside this theme's neutral dark surfaces.
  const css = buildCssFor(sanitize({}))
  const rule = parseRules(css).find(function (r) {
    return r.selector === 'body[data-ds-dark-theme]' && r.body.includes('--plan-card-fill')
  })
  assert.ok(rule, 'expected the dark card rebinding rule')
  for (const name of ['--plan-card-fill', '--card-fill', '--changes-fill']) {
    assert.ok(rule.body.includes(name), name + ' not rebound')
  }
  assert.ok(!rule.body.includes('--dsw-static-'), 'cards must not lean on a static token')
})

test('no rule uses a linear or generic-ease transition', function () {
  // CDS forbids `transition: all .3s linear` and friends.
  const state = sanitize({})
  const css = buildCssFor(state)
  assert.ok(!/transition[^;{}]*\blinear\b/.test(css), 'linear transition found')
  assert.ok(!/transition:\s*all\b/.test(css), '`transition: all` found')
  assert.ok(!/ease-in-out;/.test(css), 'generic ease-in-out found')
})

// -------------------------------------------------------------- switches

test('refine=false drops the component half but keeps the tokens', function () {
  const on = buildCssFor(sanitize({ refine: true }))
  const off = buildCssFor(sanitize({ refine: false }))

  assert.ok(off.length < on.length, 'the refined sheet should be the larger one')
  // The elevation tier is not part of `refine` — it is required for the
  // palette to look correct, so it survives.
  assert.ok(off.includes('--dsw-elevation-panel'), 'elevation must survive refine=false')
  assert.ok(off.includes('--dsw-focus-ring-glow'), 'the glow variable must survive')
  // The component rules do not. The new-session layout's ONLY hook on the
  // composer is the host variable `--dsh-composer-text-max-height` (layout
  // safety, not a look — see its own test), so the refined three-state shadow
  // and focus treatment must be gone while that one declaration stays.
  assert.ok(!off.includes('[data-composer-card]:not('), 'composer states must be dropped')
  assert.ok(!off.includes('box-shadow: var(--dsw-elevation-soft) !important;'),
    'the composer resting shadow must be dropped')
  assert.ok(off.includes('--dsh-composer-text-max-height'), 'the new-session cap is layout, not refinement')
  assert.ok(!off.includes('md-code-block'), 'code rules must be dropped')
})

test('disabling the theme emits no stylesheet at all', function () {
  // The bridge releases the token layer; if the stylesheet survived, the
  // elevation tier and focus ring would keep a "disabled" theme half-applied.
  const state = sanitize({ enabled: false })
  assert.equal(buildCssFor(state), '')
})

test('the stylesheet is deterministic for a given state', function () {
  const a = buildCssFor(sanitize({}))
  const b = buildCssFor(sanitize({}))
  assert.equal(a, b)
})

test('changing the accent changes the glow in the emitted sheet', function () {
  const clay = sanitize({ accent: 'clay' })
  const graphite = sanitize({ accent: 'graphite' })
  const a = buildCssFor(clay)
  const b = buildCssFor(graphite)
  assert.notEqual(a, b)
})

// ------------------------------------------------------------- hygiene

test('every rule is scoped — nothing targets bare html or a wildcard root', function () {
  const state = sanitize({})
  const css = buildCssFor(state)
  for (const rule of parseRules(css)) {
    assert.ok(rule.selector !== '*', 'a bare `*` rule would restyle every element')
    assert.ok(rule.selector !== 'html', 'a bare `html` rule would fight the host root')
  }
})

test('no rule hard-codes pure black or pure white as a surface', function () {
  // CDS forbids #000/#fff surfaces. The code block is the one documented
  // exception: the real Claude light palette makes it #ffffff (docs §8.5), so
  // the guard must see that value (`#ffffff` did not match the old `#fff\b`)
  // and exempt exactly that block rather than passing it by accident.
  const state = sanitize({})
  const css = buildCssFor(state)
  const surfaces = parseRules(css).filter(function (rule) {
    return /(^|[^-])background(-color)?:/.test(rule.body)
  })
  for (const rule of surfaces) {
    const codeBlock = rule.selector.includes('md-code-block')
    assert.ok(!/background(-color)?:\s*#000(?:000)?\b/i.test(rule.body), 'pure black surface in ' + rule.selector)
    if (!codeBlock) {
      assert.ok(!/background(-color)?:\s*#(?:fff|ffffff)\b/i.test(rule.body), 'pure white surface in ' + rule.selector)
    }
  }
})

// ------------------------------------------------------ thinking shimmer

test('the thinking shimmer is a clay breathing glint on the stable hook', function () {
  // The host's sweep paints a hard `currentColor` band; this rule replaces the
  // decoration's fill with a clay sheen and the host's stepped timing with the
  // reference pulse curve. Only data-* hooks: the sweep and text classes are
  // salted.
  //
  // REGRESSION GUARD — no `filter`, no `opacity`. Both were here once (a 1px
  // blur at 60%) and both caused the reported artefact: the row's text is
  // re-rendered while a response streams, and the blurred translucent layer kept
  // landing over the 「思考」 glyphs for a frame at a time, so the label looked
  // smeared or covered DURING output. The element is `aria-hidden` decoration, so
  // softening it bought no information and cost the label beside it. This test
  // previously ASSERTED the opacity — i.e. it pinned the bug as correct behaviour
  // — which is why the two assertions below are inverted rather than deleted.
  const css = buildCssFor(sanitize({}))
  const rule = parseRules(css).find(function (r) { return r.selector === '[data-shimmer-decoration]' })
  assert.ok(rule, 'expected a [data-shimmer-decoration] rule')
  assert.ok(rule.body.includes(
    'background: linear-gradient(90deg, transparent 0%, var(--dsw-alias-label-deep-diving-shimmer) 50%, transparent 100%) !important;'),
  'expected the clay gradient sheen, !important')
  assert.ok(!/(^|[;\s])opacity\s*:/.test(rule.body),
    'no opacity: a translucent layer over the streaming label is what covered it')
  assert.ok(!/(^|[;\s])filter\s*:/.test(rule.body),
    'no filter: blurring a decoration that overlaps re-rendered text smears the label')
  assert.match(rule.body, /animation-timing-function:\s*var\(--cds-ease-pulse\)\s*!important/)
  // Geometry is the host's: none of these may appear in this rule.
  for (const property of ['animation-name', 'animation-duration', 'animation-delay',
    'animation-iteration-count', 'transform', 'mask-image', 'keyframes']) {
    assert.ok(!new RegExp('(^|[;\\s])' + property + '\\s*:').test(rule.body),
      property + ' would change the sweep geometry')
  }
  // No salted class anywhere in the selector.
  assert.ok(!/_\w+_\d+/.test(rule.selector), 'salted class in the shimmer selector')
})

test('the pulse curve exists as the reference token', function () {
  const css = buildCssFor(sanitize({}))
  const rule = parseRules(css).find(function (r) {
    return r.selector === ':root' && r.body.includes('--cds-ease-pulse')
  })
  assert.ok(rule, 'expected --cds-ease-pulse in the :root motion block')
  assert.ok(rule.body.includes('--cds-ease-pulse: cubic-bezier(0.4, 0, 0.2, 1);'),
    'the reference curve is cubic-bezier(.4, 0, .2, 1)')
})

test('the shimmer rule degrades to no rule when the hook is absent', function () {
  // A CSS rule cannot run without its selector; the contract is that the sheet
  // only ever paints the data-* hook (nothing else implies the decoration).
  const css = buildCssFor(sanitize({}))
  const selectors = parseRules(css)
    .filter(function (rule) { return /shimmer-decorat/.test(rule.selector) })
    .map(function (rule) { return rule.selector })
  assert.deepEqual(selectors, ['[data-shimmer-decoration]'])
})

// ------------------------------------------- thinking-label colour switch

test('the thinking-label switch never repaints the focus ring or the accent', function () {
  // The switch owns two TOKENS (label + shimmer); no stylesheet state may
  // follow it. Clay glow and the clay ring stay in both states.
  const off = buildCssFor(sanitize({}))
  const on = buildCssFor(sanitize({ thinkingLabelBlue: true }))
  assert.ok(off.includes('--dsw-focus-ring-glow: rgba(217, 119, 87, 0.25)'))
  assert.ok(on.includes('--dsw-focus-ring-glow: rgba(217, 119, 87, 0.25)'),
    'the ring glow is not part of the thinking-label switch')
  const selectedOff = parseRules(off).find(function (rule) {
    return rule.selector.includes('[class*="selected"]') && !rule.selector.includes('dark-theme')
  })
  const selectedOn = parseRules(on).find(function (rule) {
    return rule.selector.includes('[class*="selected"]') && !rule.selector.includes('dark-theme')
  })
  assert.equal(selectedOn.body, selectedOff.body,
    'selection states stay on the accent preset, not the thinking-label switch')
})

// ------------------------------- replication item: hover-revealed actions

test('hover-revealed actions: CDS curve + colours, host geometry untouched', function () {
  // The host already fades the bar on row hover (opacity 0→1, 80ms) with no
  // layout shift; this replication item only swaps the curve and the label
  // colour/type, reaching the bar ONLY through the published data-* hook.
  const css = buildCssFor(sanitize({}))
  const rules = parseRules(css)
  const bar = rules.find(function (rule) {
    return rule.selector === '[data-actions-reveal] > :last-child'
  })
  assert.ok(bar, 'expected the fade rule on the data-actions-reveal hook')
  assert.match(bar.body, /transition-timing-function:\s*cubic-bezier\(0\.16, 1, 0\.3, 1\)\s*!important/)
  for (const property of ['transform', 'width', 'height', 'margin', 'padding',
    'animation-name', 'animation-duration', 'animation-delay']) {
    assert.ok(!new RegExp('(^|[;\\s])' + property + '\\s*:').test(bar.body),
      property + ' would change the host geometry')
  }

  const button = rules.find(function (rule) {
    return rule.selector === '[data-actions-reveal] > :last-child :where(button)'
  })
  assert.ok(button, 'expected the action-button colour rule')
  assert.match(button.body, /color:\s*var\(--dsw-alias-label-secondary\)\s*!important/)
  assert.match(button.body, /font-size:\s*12px/)
  assert.match(button.body, /line-height:\s*16px/)
  assert.match(button.body, /font-weight:\s*500/)
  const hover = rules.find(function (rule) {
    return rule.selector.endsWith(':where(button):hover')
  })
  assert.ok(hover)
  assert.match(hover.body, /color:\s*var\(--dsw-alias-label-primary\)\s*!important/)

  // REGRESSION GUARD — these selectors once read `[data-actions-reveal="hover"]`,
  // and the value is "always" on the tail that ends a response. Only the newest
  // turn tail stays mounted, so the rule styled NOTHING the reader could see: a
  // live probe found one such element, value "always", its four buttons computed
  // 13.33px/400 in the primary colour. Matching the hook by value can only
  // re-break this, so no rule may qualify it.
  for (const rule of rules) {
    if (!rule.selector.includes('data-actions-reveal')) continue
    assert.ok(!/data-actions-reveal\s*=/.test(rule.selector),
      'the reveal hook must not be qualified by value: ' + rule.selector)
    assert.ok(!/_\w+_\d+/.test(rule.selector), 'salted class in ' + rule.selector)
  }
})

// ------------------------------------- replication item: scroll fade masks

test('the step body feathers its bottom edge and never its top edge', function () {
  const css = buildCssFor(sanitize({}))
  const rules = parseRules(css)
  const top = rules.find(function (rule) { return rule.selector === '[data-step-process-body][data-scroll-up]' })
  const bottom = rules.find(function (rule) { return rule.selector === '[data-step-process-body][data-scroll-down]' })
  const both = rules.find(function (rule) {
    return rule.selector === '[data-step-process-body][data-scroll-up][data-scroll-down]'
  })
  assert.ok(top && bottom && both)

  // REGRESSION GUARD — the top edge used to carry the reference's 24px ladder.
  // It landed on the pinned reasoning header: rows in this body are 24px tall,
  // and an expanded reasoning row puts its `[data-disclosure-header]` at
  // `position:sticky; top:0` INSIDE the very element the mask is applied to, so
  // the 「思考」 label and the first line under it were feathered while a
  // response streamed. A mask cannot exempt a descendant, so the top edge gets
  // no fade at all — and this rule must stay a plain `none` so it also cancels
  // the host's own `.fadeTop` class (0,2,0 attribute selector vs 0,1,0 class).
  // This test previously ASSERTED the top gradient — i.e. it pinned the bug as
  // correct behaviour — which is why it is rewritten rather than deleted.
  assert.equal(top.body.trim(), 'mask-image: none;',
    'the top edge must not be masked: it is where the reasoning header pins')

  // Bottom: opaque → d9 → b3 → 80 → 4d → 26 → 0d → transparent (mirrored),
  // evaluated at the reference's 28px fade size (C12).
  const ladder = ['#0000000d', '#00000026', '#0000004d', '#00000080', '#000000b3', '#000000d9']
  for (const [rule, expected] of [[bottom, ladder.slice().reverse()]]) {
    assert.match(rule.body, /mask-image:\s*linear-gradient\(to bottom,/)
    assert.match(rule.body, /calc\(100% - 28px \* \.15\)/)
    assert.match(rule.body, /calc\(100% - 28px \* \.87\)/)
    let previous = -1
    for (const alpha of expected) {
      const at = rule.body.indexOf(alpha)
      assert.ok(at > previous, alpha + ' out of order in ' + rule.body)
      previous = at
    }
  }
  assert.match(bottom.body, /transparent 100%\)/)
  assert.match(bottom.body, /calc\(100% - 28px\)/)
  // Both edges scrollable: still one gradient, and it is the bottom one.
  assert.match(both.body, /mask-image:\s*linear-gradient\(to bottom, #000 0,/,
    'both-scrollable keeps the bottom ladder only')
  assert.ok(!/transparent 0,/.test(both.body), 'no top gradient when both edges scroll')

  // No rule anywhere in the sheet may put a top-edge gradient on this body.
  for (const rule of rules) {
    if (!/data-step-process-body/.test(rule.selector)) continue
    assert.ok(!/transparent 0,/.test(rule.body),
      'a top-edge fade would land on the pinned 「思考」 header: ' + rule.selector)
  }

  // Degrade: every mask rule in the sheet is attributed to a scroll hook.
  for (const rule of rules) {
    if (!/mask-image:/.test(rule.body)) continue
    assert.ok(rule.selector.includes('data-scroll-'),
      'unconditional mask rule would clip permanently: ' + rule.selector)
  }
  // `data-overflow-below` is the input-trigger MENU hook on a non-scrolling
  // box; masking it would fade the menu chrome, so it is intentionally absent.
  assert.ok(!css.includes('data-overflow-below'))
})

// ------------------- the two B-group effects are unconditional under refine

test('hover-reveal and scroll-fade rules are always emitted under refine', function () {
  // User decision: the effects stay, the per-item switches are gone. Both rule
  // sets are part of the component refinement and appear whenever `refine` is
  // true, for every other setting combination.
  const variants = [
    sanitize({}),
    sanitize({ accent: 'graphite', warmth: 0, radiusScale: 0.5, elevation: 0 }),
    sanitize({ thinkingLabelBlue: true }),
    sanitize({ enabled: true, refine: true }),
  ]
  const expectedActions = [
    '[data-actions-reveal] > :last-child',
    '[data-actions-reveal] > :last-child :where(button)',
    '[data-actions-reveal] > :last-child :where(button):hover',
  ]
  const expectedFades = [
    '[data-step-process-body][data-scroll-down]',
    '[data-step-process-body][data-scroll-up]',
    '[data-step-process-body][data-scroll-up][data-scroll-down]',
  ]
  for (const state of variants) {
    const css = buildCssFor(state)
    const selectors = parseRules(css).map(function (rule) { return rule.selector })
    for (const selector of expectedActions.concat(expectedFades)) {
      assert.ok(selectors.includes(selector),
        selector + ' must always be emitted under refine')
    }
  }

  // `refine` is the only gate: with it off the rules are gone.
  const noRefine = buildCssFor(sanitize({ refine: false }))
  assert.ok(!noRefine.includes('data-actions-reveal'))
  assert.ok(!noRefine.includes('data-step-process-body'))

  // A legacy payload carrying the retired switch fields loads and is ignored:
  // the effects are still emitted (no per-item switch exists any more).
  const legacy = sanitize({ revealActions: false, scrollFades: false })
  assert.equal(Object.hasOwn(legacy, 'revealActions'), false)
  assert.equal(Object.hasOwn(legacy, 'scrollFades'), false)
  const legacyCss = buildCssFor(legacy)
  assert.ok(legacyCss.includes('data-actions-reveal'))
  assert.ok(legacyCss.includes('data-step-process-body'))
})

// ------------------------- B-group item 3: code-block details (own switch)

test('code-block details: no banner label, disclosure intact', function () {
  const css = buildCssFor(sanitize({}))
  const rules = parseRules(css)

  // The banner is a floating copy control now (codeRules): the language label
  // is hidden and there is no header seam to draw — the real app has no header.
  const label = rules.find(function (rule) {
    return rule.selector === '.md-code-block [data-code-block-banner] > :first-child'
  })
  assert.ok(label, 'expected the label-hiding rule')
  assert.match(label.body, /display:\s*none/)
  assert.ok(!rules.some(function (rule) {
    return rule.selector.includes('data-code-block-banner')
      && /border-bottom:\s*\.5px solid var\(--dsw-alias-border-l2\)/.test(rule.body)
  }), 'the floating control has no header seam')

  // No line-number rules: the host mounts `data-line-numbers` only for its own
  // `numbered` code-block variant, which the chat markdown renderer never
  // enables, so a gutter rule would be unreachable. The theme does not fake
  // line numbers.
  assert.ok(!css.includes('data-line-numbers'), 'line-number rules must be gone')

  // Disclosure row: 14/20 Regular in the TEXT family, secondary → primary on
  // hover, swift curve. This is the reference's tool-row root type
  // (`font-sans text-body font-normal text-secondary`, c734f318c) — the row is
  // prose, not code; only the terminal card goes monospace.
  const header = rules.find(function (rule) { return rule.selector === '[data-disclosure-header]' })
  assert.ok(header)

  assert.match(header.body, /font-size:\s*12px/)
  assert.match(header.body, /line-height:\s*16px/)
  assert.match(header.body, /font-weight:\s*500/)
  assert.match(header.body, /color:\s*var\(--dsw-alias-label-secondary\)/)
  assert.match(header.body, /transition:\s*color 120ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  const hover = rules.find(function (rule) {
    return rule.selector === '[data-disclosure-header]:hover, [data-disclosure-header]:focus-within'
  })
  assert.ok(hover, 'expected the disclosure hover rule')
  assert.match(hover.body, /color:\s*var\(--dsw-alias-label-primary\)/)

  // Hook-scoped: every selector carries a published data hook, no salted class.
  for (const rule of rules) {
    if (!/(data-code-block-banner|data-disclosure-header)/.test(rule.selector)) continue
    assert.ok(!/_\w+_\d+/.test(rule.selector), 'salted class in ' + rule.selector)
  }
})

test('code-block details are ALWAYS emitted (the switch was removed)', function () {
  // The item was user-verified, so its comparison switch is gone and the rules
  // are unconditional inside `refine`. A legacy payload that still carries
  // `codeBlockDetails: false` must NOT be able to hide them.
  const alwaysOn = [
    '[data-disclosure-header]',
    '[data-disclosure-header] :where(span, div, button)',
    '[data-disclosure-header]:hover, [data-disclosure-header]:focus-within',
  ].sort()

  const present = parseRules(buildCssFor(sanitize({}))).map(function (rule) { return rule.selector })
  for (const selector of alwaysOn) {
    assert.ok(present.indexOf(selector) >= 0, 'expected the always-on rule: ' + selector)
  }

  // The retired key must not reach state, and must not change the sheet at all.
  const legacy = sanitize({ codeBlockDetails: false })
  assert.equal(Object.hasOwn(legacy, 'codeBlockDetails'), false,
    'sanitize must drop the retired switch field')
  assert.equal(buildCssFor(legacy), buildCssFor(sanitize({})),
    'a stored `false` must emit a byte-identical sheet — no invisible mode')
  // The always-on code surface from codeRules() is untouched either way.
  assert.ok(buildCssFor(legacy).includes('--dsl-code-block-background'))
})

// ------------------------- B-group item 3 is refine-gated (no own switch)

test('the code-block detail rules follow refine and the titlebar switch is gone', function () {
  // No per-item switch exists any more: the only gate is `refine`.
  const noRefine = buildCssFor(sanitize({ refine: false }))
  for (const marker of ['data-code-block-banner', 'data-disclosure-header', 'data-line-numbers']) {
    assert.ok(!noRefine.includes(marker), marker + ' must disappear with refine=false')
  }
  // ...and with refine on they are present, with nothing in between.
  const refined = buildCssFor(sanitize({ refine: true }))
  for (const marker of ['[data-code-block-banner] > :first-child', 'data-disclosure-header']) {
    assert.ok(refined.includes(marker), marker + ' must be present under refine')
  }
  assert.ok(refined.includes('--dsl-code-block-background'),
    'the code surface from codeRules() is always on')

  // The desktop-titlebar switch and its three rules are gone. A legacy payload
  // carrying the field must still load, with the field dropped by sanitize, and
  // it must not resurrect a Windows-gated rule.
  let legacy
  assert.doesNotThrow(function () { legacy = sanitize({ desktopTitlebar: false }) })
  assert.equal(Object.hasOwn(legacy, 'desktopTitlebar'), false,
    'sanitize must drop the retired field')
  assert.equal(Object.hasOwn(sanitize({}), 'desktopTitlebar'), false)
  assert.ok(!buildCssFor(legacy).includes('data-windows-titlebar'),
    'no Windows-titlebar rule may be emitted any more')
  assert.ok(!buildCssFor(legacy).includes('data-windows-menu'))
})

// ---------------------------------- markdown body: tables + quote rhythm

test('markdown body: closed frame, header band and restored cell insets', function () {
  // THE COMPLAINT: the host's own table CSS draws no outer frame, no header
  // fill, zeroes first-column/last-column padding and leaves a hairline under
  // every row. This item frames the marker the plugin wrote (data-cds-table),
  // because the host's wrapper class is a salted CSS-Modules name.
  const rules = parseRules(buildCssFor(sanitize({})))

  const frame = rules.find(function (rule) { return rule.selector === '[data-cds-table]' })
  assert.ok(frame, 'expected the table frame rule')
  assert.match(frame.body, /border:\s*\.5px solid var\(--dsw-alias-border-l1\)/)
  assert.match(frame.body, /border-radius:\s*var\(--dsw-radius-md\)/)
  assert.match(frame.body, /background:\s*var\(--dsw-alias-bg-base\)/)
  assert.match(frame.body, /box-sizing:\s*border-box/,
    'a half-pixel border must not add width to the column')

  // REGRESSION (user-reported): the wrapper is a full-width block and the host
  // sizes the table to `max-content` inside a wide-table variant that HIDES its
  // overflow, so the first version of this item framed a box wider than the
  // columns and cut the last column mid-glyph. The frame must fit the table and
  // must never clip silently.
  assert.match(frame.body, /overflow-x:\s*auto\s*!important/,
    'the frame scrolls rather than hiding overflow')

  // The host bleeds a wide-table wrapper out of the prose column
  // (`.v5IAXa_body .md-table-wide`: negative margin-left + matching
  // padding-left). A frame drawn on that wrapper hangs left of the text with an
  // empty gutter inside, so the bleed must be cancelled.
  assert.match(frame.body, /width:\s*100%\s*!important/)
  assert.match(frame.body, /max-width:\s*100%\s*!important/)
  assert.match(frame.body, /margin-left:\s*0\s*!important/)
  assert.match(frame.body, /padding-left:\s*0\s*!important/)

  const fitted = rules.find(function (rule) { return rule.selector === '[data-cds-table] table' })
  assert.ok(fitted, 'expected the table-fit rule')
  assert.match(fitted.body, /width:\s*100%\s*!important/)
  assert.match(fitted.body, /max-width:\s*100%\s*!important/)

  const header = rules.find(function (rule) { return rule.selector === '[data-cds-table] th' })
  assert.ok(header, 'expected the header band rule')
  assert.match(header.body, /background:\s*var\(--dsw-alias-bg-module-platform\)/)
  assert.match(header.body, /border-bottom:\s*\.5px solid var\(--dsw-alias-border-l1\)\s*!important/)
  // The host's table-head font token stays the only thing deciding header type.
  assert.ok(!/(^|[;\s])(?:font|font-size|font-weight|font-family|line-height)\s*:/.test(header.body),
    'the header band is surface only; the host font token must stay untouched')

  const insets = rules.find(function (rule) {
    return rule.selector === '[data-cds-table] th, [data-cds-table] td'
  })
  assert.ok(insets, 'expected the cell-inset rule')
  assert.match(insets.body, /padding:\s*10px 14px\s*!important/)
  // The host caps every column at `min(30vw, 320px)`; with the table fitted to
  // the frame those caps would leave the frame wider than the table again.
  assert.match(insets.body, /max-width:\s*none\s*!important/)
  assert.match(insets.body, /overflow-wrap:\s*anywhere/)

  const first = rules.find(function (rule) {
    return rule.selector === '[data-cds-table] th:first-child, [data-cds-table] td:first-child'
  })
  assert.ok(first, 'expected the first-column inset override')
  assert.match(first.body, /padding-left:\s*14px\s*!important/)

  const last = rules.find(function (rule) {
    return rule.selector === '[data-cds-table] th:last-child, [data-cds-table] td:last-child'
  })
  assert.ok(last, 'expected the last-column inset override')
  assert.match(last.body, /padding-right:\s*14px\s*!important/)

  // The frame supplies the closing edge; the last row must not draw a second
  // line on top of it.
  const closing = rules.find(function (rule) {
    return rule.selector === '[data-cds-table] tbody tr:last-child td'
  })
  assert.ok(closing)
  assert.match(closing.body, /border-bottom:\s*none/)

  // Reference: tabular numerals in counting regions, tables included
  // (docs/v1/01-…md:497-505).
  const numerals = rules.find(function (rule) { return rule.selector === '[data-cds-table] td' })
  assert.ok(numerals)
  assert.match(numerals.body, /font-variant-numeric:\s*tabular-nums/)

  // The host hard-codes 11px for code inside a table; at body size that reads as
  // a caption, so the chip follows the host's own inline-code ratio instead.
  const tableCode = rules.find(function (rule) {
    return rule.selector === '[data-cds-table] table code'
  })
  assert.ok(tableCode, 'expected the table-code rule')
  assert.match(tableCode.body, /font-size:\s*\.875em\s*!important/)

  // Only the plugin's own attribute carries the styling: no salted module class
  // and no conditional literal class (`md-table-wide` is emitted on wide tables
  // only; `md-table-fill` has no rule in the shipped CSS at all).
  for (const rule of rules) {
    if (!rule.selector.includes('data-cds-table')) continue
    assert.ok(!/_\w+_\d+/.test(rule.selector), 'salted class in ' + rule.selector)
    assert.ok(!/tableScroll|tableFill|md-table/.test(rule.selector),
      'conditional host class in ' + rule.selector)
  }
})

test('markdown body: the quote gains its missing bottom margin', function () {
  const rules = parseRules(buildCssFor(sanitize({})))
  const quote = rules.find(function (rule) { return rule.selector === '[data-chat-flow] blockquote' })
  assert.ok(quote, 'expected the quote rhythm rule on the stable flow hook')
  assert.match(quote.body, /margin:\s*16px 0\s*!important/)

  // Nothing else in the sheet touches quotes: hr / lists / li stay host-owned.
  const quoteSelectors = rules
    .filter(function (rule) { return /blockquote/.test(rule.selector) })
    .map(function (rule) { return rule.selector })
  assert.deepEqual(quoteSelectors, ['[data-chat-flow] blockquote'])
})

test('the markdown-body rules are ALWAYS emitted (the switch was removed)', function () {
  // The item was user-verified, so its comparison switch is gone and the 10
  // rules are unconditional inside `refine`. A legacy payload that still carries
  // `markdownBody: false` must NOT be able to hide them.
  const alwaysOn = [
    '[data-cds-table]',
    '[data-cds-table] table',
    '[data-cds-table] table code',
    '[data-cds-table] th',
    '[data-cds-table] th, [data-cds-table] td',
    '[data-cds-table] th:first-child, [data-cds-table] td:first-child',
    '[data-cds-table] th:last-child, [data-cds-table] td:last-child',
    '[data-cds-table] tbody tr:last-child td',
    '[data-cds-table] td',
    '[data-chat-flow] blockquote',
  ].sort()

  const present = parseRules(buildCssFor(sanitize({}))).map(function (rule) { return rule.selector })
  for (const selector of alwaysOn) {
    assert.ok(present.indexOf(selector) >= 0, 'expected the always-on rule: ' + selector)
  }

  // The retired key must not reach state, and must not change the sheet at all.
  const legacy = sanitize({ markdownBody: false })
  assert.equal(Object.hasOwn(legacy, 'markdownBody'), false,
    'sanitize must drop the retired switch field')
  assert.equal(buildCssFor(legacy), buildCssFor(sanitize({})),
    'a stored `false` must emit a byte-identical sheet — no invisible mode')
})

test('the markdown-body item follows refine and never survives a disabled theme', function () {
  const noRefine = buildCssFor(sanitize({ refine: false }))
  assert.ok(!noRefine.includes('data-cds-table'), 'refine=false must drop the table rules')
  assert.ok(!noRefine.includes('blockquote'), 'refine=false must drop the quote rhythm')

  assert.equal(buildCssFor(sanitize({ enabled: false })), '')

  // No per-item gate remains: with refine on, the table rules are there.
  const refined = buildCssFor(sanitize({ refine: true }))
  assert.ok(refined.includes('[data-composer-card]'), 'the rest of refine is present too')
  assert.ok(refined.includes('[data-cds-table]'), 'and so is the markdown body')
})

test('the always-on rule sets are byte-identical to the verified sheet', function () {
  // THE BYTE-IDENTITY PIN. When the two comparison switches were deleted
  // (`codeBlockDetails`, `markdownBody`) the rule TEXT was not touched — only the
  // `if (state.X !== false)` guards around it. This compares both emitted blocks
  // against a snapshot taken from the sheet BEFORE the removal, so any accidental
  // word, value or selector edit fails here. `test/rule-baseline.mjs` is not to be
  // regenerated to turn this green: a diff means the rules changed.
  const css = buildCssFor(sanitize({}))
  assert.equal(blockOf(css, '/* ---- code artefact details'), CODE_BLOCK_RULES,
    'the code-block detail rules must be byte-identical to the verified sheet')
  assert.equal(blockOf(css, '/* ---- markdown body'), MARKDOWN_BODY_RULES,
    'the markdown-body rules must be byte-identical to the verified sheet')

  // Rule counts, so a block that silently grew or shrank is caught too.
  const countRules = function (text) {
    return (text.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g) || []).length
  }
  assert.equal(countRules(CODE_BLOCK_RULES), CODE_BLOCK_RULE_COUNT)
  assert.equal(countRules(MARKDOWN_BODY_RULES), MARKDOWN_BODY_RULE_COUNT)
  assert.equal(CODE_BLOCK_RULE_COUNT, 3)
  assert.equal(MARKDOWN_BODY_RULE_COUNT, 10)
})

// ------------------------------------------------ A-tier replication items
//
// These three items each shipped with a switch, were accepted, and the switch was
// then removed per docs/replication-toggles.md: the look stays, unconditionally.
// What must hold now is the opposite of the old contract — the block is present in
// EVERY state except the master switch, and a stale `false` in an old payload
// changes nothing.

/** Each solidified item's emitted block, keyed by its old state key. */
const A_TIER_BLOCKS = {
  footnotes: A_TIER_RULES.footnotes,
  buttonSpring: A_TIER_RULES.buttonSpring,
}

/** The block text as emitted — `parts.join('\n\n')` adds the separator, not the block. */
function cleanBlock(text) {
  return String(text).replace(/\n\n$/, '')
}

for (const [key, block] of Object.entries(A_TIER_BLOCKS)) {
  test(key + ' is unconditional now that its switch is gone', function () {
    const on = buildCssFor(sanitize({}))
    assert.ok(on.includes(cleanBlock(block)), key + ' block must be in the default sheet')

    // A stale `false` from a payload written before the switch was removed must
    // not change one byte of the sheet.
    assert.equal(buildCssFor(sanitize({ [key]: false })), on,
      key + ' must be inert: the field is no longer state')

    // It is not component refinement, so `refine: false` keeps it.
    assert.ok(buildCssFor(sanitize({ refine: false })).includes(cleanBlock(block)),
      key + ' must survive refine=false')

    // Only the master switch removes it.
    assert.equal(buildCssFor(sanitize({ enabled: false })), '',
      key + ' leaves with the master switch')

    // And no token may move with a stylesheet-only item.
    assert.deepEqual(buildTokensFor({ [key]: false }), buildTokensFor({}),
      key + ' must never re-register the token layer')
  })
}


test('the three motion curves are tokens: unconditional and exact', function () {
  // They are vocabulary, not a look: unconditional in every state that produces a
  // sheet at all. `buttonSpring` no longer exists as a switch (the press rules it
  // gated are now unconditional too), so the interesting assertion is that a
  // stale `false` from an old payload changes nothing.
  const expected = [
    '--cds-btn-spring: linear(0, .2459, .6526, .9468, 1.0764, 1.0915, 1.0585, 1.0219, .9993, .9914, .9921, .9957, .9988, 1.0004, 1);',
    '--cds-ease-rise: cubic-bezier(.3, .7, .4, 1);',
    '--cds-ease-fall: cubic-bezier(0, 0, .2, 1);',
  ]
  for (const declaration of expected) {
    assert.ok(buildCssFor(sanitize({})).includes(declaration), 'missing: ' + declaration)
    assert.ok(buildCssFor(sanitize({ buttonSpring: false })).includes(declaration),
      'the curve must be inert to a stale buttonSpring: ' + declaration)
    assert.ok(buildCssFor(sanitize({ refine: false })).includes(declaration),
      'the curve must survive refine=false: ' + declaration)
  }
  // Byte-identical to the captured block.
  assert.equal(blockOf(buildCssFor(sanitize({})), '/* ---- motion tokens:'),
    A_TIER_RULES.motionTokens)
  // The press rules are unconditional now, and identical whether or not a stale
  // `buttonSpring: false` is in the payload.
  const withSpring = buildCssFor(sanitize({}))
  assert.ok(withSpring.includes('scale(.96)'), 'the press transform is part of the sheet')
  assert.equal(buildCssFor(sanitize({ buttonSpring: false })), withSpring,
    'a retired switch field must change nothing')
})

test('the UI font role is unconditional, master-switched and excludes code', function () {
  const ui = 'body {\n  font-family: var(--dsw-font-family-ui) !important;\n}'
  const text = '[data-conversation-content],\n[data-conversation-content] :not(code):not(pre):not(kbd):not(samp) {\n  font-family: var(--dsw-font-family) !important;\n}'
  for (const state of [{}, { refine: false }]) {
    const sheet = buildCssFor(sanitize(state))
    assert.ok(sheet.includes(ui), 'chrome must take the UI family: ' + JSON.stringify(state))
    assert.ok(sheet.includes(text), 'conversation content must keep the text family: ' + JSON.stringify(state))
  }
  assert.equal(buildCssFor(sanitize({ enabled: false })), '')
  assert.ok(hasRule(buildCssFor(sanitize({})),
    /:not\(code\):not\(pre\):not\(kbd\):not\(samp\)/,
    /font-family: var\(--dsw-font-family\)/),
    'code, pre, kbd and samp must be excluded from the text-role rule')
})

test('the button-spring rules only reach controls this plugin owns', function () {
  const block = cleanBlock(A_TIER_RULES.buttonSpring)
  const selectors = block.split('\n')
    .filter(function (line) { return line.endsWith('{') })
    .map(function (line) { return line.replace('{', '').trim() })
  assert.ok(selectors.length >= 2)
  for (const selector of selectors) {
    for (const part of selector.split(',')) {
      assert.match(part.trim(), /^\.dct-[a-z-]+(?::active)?$/,
        'button spring must stay on our own controls: ' + part.trim())
    }
  }
  // The host's markdown buttons are salted classes; the block must not name any.
  assert.ok(!/_markdown_|_prose_|\.md-/.test(block), 'no host markdown class may appear')
})

test('no A-tier rule names a salted class or a literal palette colour', function () {
  for (const [key, block] of Object.entries(A_TIER_BLOCKS)) {
    const text = cleanBlock(block)
    assert.ok(!/_\w+_\d+/.test(text), key + ' names a salted class')
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(text), key + ' hard-codes a colour')
  }
})

// ------------------------------------------------ helpers for the above

/** The cascade result for a selector: every matching rule, later declarations win. */
function effectiveDeclarations(css, selector) {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  const declarations = {}
  let match = re.exec(text)
  while (match !== null) {
    if (match[1].trim().replace(/\s+/g, ' ') === selector) {
      for (const line of match[2].split(';')) {
        const at = line.indexOf(':')
        if (at > 0) declarations[line.slice(0, at).trim()] = line.slice(at + 1).trim()
      }
    }
    match = re.exec(text)
  }
  return declarations
}

/** Last emitted body for a selector (later rules win, so last is what applies). */
function lastRuleFor(css, selector) {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match = re.exec(text)
  let found = null
  while (match !== null) {
    if (match[1].trim().replace(/\s+/g, ' ') === selector) found = match[2].trim()
    match = re.exec(text)
  }
  return found
}

/** The emitted radius ladder at scale 1, read back from the token layer. */
function radiusTokens() {
  const tokens = buildTokensFor({})
  const read = function (name) {
    const pair = tokens[name]
    const value = typeof pair === 'string' ? pair : (pair && pair.light)
    return parseInt(String(value), 10)
  }
  return { sm: read('--dsw-radius-sm'), lg: read('--dsw-radius-lg') }
}

/** `buildTokens` for a state patch; cached because it is a pure function. */
const TOKEN_CACHE = new Map()
function buildTokensFor(patch) {
  const key = JSON.stringify(patch)
  if (!TOKEN_CACHE.has(key)) TOKEN_CACHE.set(key, buildTokens(sanitize(patch)))
  return TOKEN_CACHE.get(key)
}

// ------------------------------------------------ B-tier replication items
//
// Same situation as the A-tier: the item shipped with a switch, was accepted, and
// the switch was removed. The block is unconditional now.

const B_TIER_BLOCKS = {
  statTypography: B_TIER_RULES.statTypography,
}

for (const [key, block] of Object.entries(B_TIER_BLOCKS)) {
  test(key + ' is unconditional now that its switch is gone', function () {
    const on = buildCssFor(sanitize({}))
    const captured = cleanBlock(block)
    assert.ok(on.includes(captured), key + ' block must be in the default sheet')
    // A stale `false` in an old payload changes nothing, `refine: false` keeps it
    // (it is type vocabulary, not component refinement), and only the master
    // switch removes it.
    assert.equal(buildCssFor(sanitize({ [key]: false })), on,
      key + ' must be inert: the field is no longer state')
    assert.ok(buildCssFor(sanitize({ refine: false })).includes(captured),
      key + ' must survive refine=false')
    assert.equal(buildCssFor(sanitize({ enabled: false })), '',
      key + ' leaves with the master switch')
    assert.deepEqual(buildTokensFor({ [key]: false }), buildTokensFor({}),
      key + ' must never re-register the token layer')
  })
}

test('the new-session input cap is CSS-only, hero-scoped and survives every setting', function () {
  // WHAT THIS PINS. The retired compaction runtime collapsed the greeting when
  // the composer seat grew; the seat wraps the whole hero stack, so collapsing
  // the greeting lowered the seat it had just measured — a feedback loop. The
  // replacement does not measure anything: it lowers the host's own
  // `--dsh-composer-text-max-height` on a NEW session only, so the host's
  // `[data-input-scroll]` stays the single text scrollport.
  const css = buildCssFor(sanitize({}))
  const block = blockOf(css, '/* ---- new-session input')
  assert.ok(block !== null, 'the new-session layout block must be emitted')

  // 1. Every rule is scoped to the host's hero phase — an active conversation
  //    must not receive one byte of it.
  const rules = parseRules(block)
  assert.ok(rules.length >= 3, 'expected the page, seat and variable rules')
  for (const rule of rules) {
    assert.match(rule.selector, /\[data-content-phase="hero"\]/,
      'a new-session rule escaped the hero phase: ' + rule.selector)
    assert.ok(!/\[data-content-phase="active"\]|:not\(\[data-content-phase/.test(rule.selector),
      'the cap must never be expressed against the active phase')
  }

  // 2. The cap itself: eight host line heights or 30vh, whichever is smaller,
  //    written onto the host variable the input's scrollport already reads.
  const capRule = rules.find(function (rule) {
    return rule.body.includes('--dsh-composer-text-max-height')
  })
  assert.ok(capRule, 'the cap must be a variable declaration')
  assert.equal(capRule.body,
    '--dsh-composer-text-max-height: min(30vh, calc(192px + 8 * var(--dsh-content-font-delta, 0px)));')
  // 8 lines × 24px = 192px, and the theme's per-line delta keeps the cap in
  // step with its own line height.
  assert.match(capRule.body, /8 \* var\(--dsh-content-font-delta/)
  // The cap is a max-height for text, never a whole-card height.
  assert.ok(!/^\s*max-height\s*:/m.test(block), 'the block must only lower the text cap')

  // 3. The page owns overflow; the seat stays in normal flow at its natural
  //    height. The page selector ties the host's hero rule on specificity
  //    (0,3,0 vs 0,3,0: `.root[data-phase=hero] .scrollBody` and
  //    `.embeddedBody[data-content-phase=hero] .scrollBody`), so its two
  //    justify-content declarations carry `!important` to stop the winner from
  //    depending on stylesheet order. The seat rule needs no `!important`: the
  //    host's sticky seat is active-phase only, so `position: static` merely
  //    holds the host's own hero-phase default.
  const pageRule = rules.find(function (rule) {
    return /\[data-conversation-scroll\]$/.test(rule.selector)
  })
  assert.ok(pageRule, 'the page scrollport must be addressed')
  assert.match(pageRule.body, /justify-content: flex-start !important;/,
    'flex-start is the fallback where safe centring is unsupported, and it must be !important')
  assert.match(pageRule.body, /justify-content: safe center !important;/,
    'safe centring keeps both edges reachable when the stack overflows, and it must be !important')
  assert.match(pageRule.body, /overflow-y: auto;/,
    'overflow-y only restates the host hero value; it must not be raised to !important')
  assert.ok(!/overflow-y: auto !important/.test(pageRule.body),
    'overflow-y must stay non-important: the minimum necessary change')
  assert.equal((pageRule.body.match(/!important/g) || []).length, 2,
    'exactly the two justify-content declarations may be !important')
  assert.ok(pageRule.body.indexOf('flex-start') < pageRule.body.indexOf('safe center'),
    'the fallback must precede the prefered value so the supported one wins')

  const seatRule = rules.find(function (rule) { return /\[data-composer-seat\]$/.test(rule.selector) })
  assert.ok(seatRule, 'the composer seat must be held in normal flow')
  assert.match(seatRule.body, /flex: 0 0 auto;/)
  assert.match(seatRule.body, /position: static;/)
  assert.ok(!seatRule.body.includes('!important'),
    'the seat rule holds the host hero default; it must not outrank the host')

  // 4. Nothing left of the retired runtime: no plugin-owned hero/dock marks, no
  //    transition-driven collapse, no extra scroll container.
  assert.ok(!css.includes('data-cds-hero-compact'), 'the compaction mark must be gone')
  assert.ok(!css.includes('data-cds-dock-compact'), 'the dock-compaction mark must be gone')
  assert.ok(!css.includes('cds-hero-height'), 'the retired hero height variable must be gone')
  assert.ok(!block.includes('data-input-scroll {'), 'the text scrollport itself is the host\'s')
  assert.ok(!/overflow[^;]*;\s*\n\s*overflow/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')),
    'no second scroll container may be introduced')

  // 5. It is layout safety, not a look or a preference: it rides neither
  //    `refine` nor any stored field, and only the master switch removes it.
  assert.ok(buildCssFor(sanitize({ refine: false })).includes(block),
    'the layout must survive refine=false')
  assert.equal(buildCssFor(sanitize({ enabled: false })), '',
    'only the master switch removes everything')
  // A leftover `compactHero` key in an old payload is inert and dropped.
  const legacy = sanitize({ compactHero: false })
  assert.equal(Object.hasOwn(legacy, 'compactHero'), false,
    'sanitize must drop the retired compaction field')
  assert.equal(buildCssFor(legacy), css, 'the stored field must change nothing')
  assert.deepEqual(buildTokensFor({ compactHero: false }), buildTokensFor({}),
    'a stylesheet item must not re-register tokens')
})

test('the usage-number item counts with tabular figures and never gauges', function () {
  const css = buildCssFor(sanitize({}))
  // The reachable part: tabular numerals on the pill and on every dd.
  assert.ok(css.includes('[data-composer-stat] {\n  font-variant-numeric: tabular-nums;'))
  for (const hook of ['data-session-stats-details', 'data-turn-usage-details']) {
    assert.ok(css.includes('[' + hook + ']'), hook + ' must be styled')
  }
  // The two hooks are one rule set, so a popover cannot drift from the pill.
  assert.ok(css.includes('[data-session-stats-details] dt, [data-turn-usage-details] dt'))
  assert.ok(css.includes('[data-session-stats-details] dd, [data-turn-usage-details] dd'))
  // The four-colour gauge is NOT attempted — no svg/currentColor machinery here.
  const block = cleanBlock(B_TIER_RULES.statTypography)
  assert.ok(!/<svg|viewBox|stroke=/.test(block), 'the gauge has no mount point; it must not be faked')
  // The pill keeps the host's geometry: no padding/size changes on it.
  assert.ok(!/\.anchor|\.pill|border-radius/.test(block), 'only number typography may change')
})

test('no markdown-body rule hard-codes a host surface or a Windows hook', function () {
  const css = buildCssFor(sanitize({}))
  const rules = parseRules(css).filter(function (rule) {
    return rule.selector.includes('data-cds-table') || rule.selector.includes('blockquote')
  })
  assert.ok(rules.length >= 10, 'expected the whole item')
  for (const rule of rules) {
    // Surfaces and hairlines come from the theme's own {light,dark} tokens.
    assert.ok(!/--dsw-static-/.test(rule.body), 'static palette token in ' + rule.selector)
    assert.ok(!/data-windows-/.test(rule.selector), 'Windows hook in ' + rule.selector)
  }
  assert.ok(!css.includes('data-windows-titlebar') && !css.includes('data-windows-menu'))
})

// ------------------------------------------------ settings row hairlines

/**
 * THE "THICK LINE" REGRESSION. The host replaces a slot entry that threw with an
 * EMPTY `div[data-slot-error]`. That div is still a direct child of the settings
 * outlet and it is zero-height, so a `> *` hairline painted a second 0.5px line
 * one device pixel under the row above. Measured on a real screenshot, that
 * turned the line under 「默认 shell」 into two device rows of full-strength ink
 * while every other separator was one — the user reports it as "a thick line".
 *
 * The rule must therefore claim only cells that hold a row. The last-cell
 * clearing rule stays `> *:last-child` — the host's own wording — so this sheet
 * keeps exactly one `:has()` discipline (child-scoped hiders), which
 * `thememode.test.mjs` pins.
 */
test('the settings hairline only claims cells that hold a row', function () {
  const rules = parseRules(buildCssFor(sanitize({})))
  for (const slot of ['settings.general.item', 'settings.appearance.item']) {
    const selector = '[data-slot="' + slot + '"] > *'
    const painted = rules.filter(function (rule) {
      return rule.selector.includes(selector) && /border-bottom:\s*0?\.5px/.test(rule.body)
    })
    assert.equal(painted.length, 1, slot + ' must have exactly one hairline rule, got ' + painted.length)
    assert.match(painted[0].selector, /> \*:where\(:not\(:empty\)/,
      'an empty slot cell must not inherit the row hairline: ' + painted[0].selector)
    assert.match(painted[0].selector, /:not\(\[data-slot-error\]\)/,
      'a crashed occupant must not claim row spacing: ' + painted[0].selector)
    // The guard must stay inside `:where()`, or its specificity beats the
    // last-cell rule and every section grows a bottom line.
    assert.ok(!/> \*:not\(/.test(painted[0].selector),
      'the hairline guard must not raise specificity: ' + painted[0].selector)

    const cleared = rules.filter(function (rule) {
      return rule.selector.includes(selector) && /border-bottom:\s*none/.test(rule.body)
    })
    assert.equal(cleared.length, 1, slot + ' must clear the hairline on its last cell')
    assert.match(cleared[0].selector, /> \*:last-child/,
      'the last cell keeps the host\'s own clearing rule: ' + cleared[0].selector)
  }
})

// ------------------------------------------------- tool rows and wrapping

/**
 * The theme's wrap decision: every code surface wraps, and the host's per-block
 * wrap toggle is gone. The toggle is the ONLY banner button with
 * `aria-pressed`; the copy button has none, which is what keeps the rule
 * language-independent (the aria-label is localised).
 */
test('code blocks wrap by default and the wrap toggle is removed', function () {
  const rules = parseRules(buildCssFor(sanitize({})))
  const pre = rules.find(function (rule) {
    return rule.selector.includes('.md-code-block pre') && /white-space:\s*pre-wrap/.test(rule.body)
  })
  assert.ok(pre, 'expected the markdown code block to wrap')
  assert.match(pre.body, /overflow-wrap:\s*anywhere/, 'wrapped code must break long tokens')

  const lines = rules.find(function (rule) {
    return rule.selector.includes('[data-code-wrap] [class*="_line_"]') && /white-space:\s*pre-wrap/.test(rule.body)
  })
  assert.ok(lines, 'diff/read line rows are not <pre>, so they need their own wrap rule')

  const toggle = rules.find(function (rule) {
    return rule.selector.includes('[data-code-block-banner] button[aria-pressed]')
  })
  assert.ok(toggle, 'expected a rule for the wrap toggle')
  assert.match(toggle.body, /display:\s*none/, 'the wrap toggle must be hidden')
})

/** One inset card: labels gone, the request boxed, the response flowing. */
test('tool cards: generic labels removed, request boxed, response bare', function () {
  const rules = parseRules(buildCssFor(sanitize({})))
  const label = rules.find(function (rule) { return rule.selector.includes('[class*="_ioLabel"]') })
  assert.ok(label, 'expected the generic input/output labels to be addressed')
  assert.match(label.body, /display:\s*none/)

  const divider = rules.find(function (rule) { return rule.selector.includes('[class*="_ioDivider"]') })
  assert.ok(divider, 'expected the divider between input and output to be addressed')

  const request = rules.find(function (rule) {
    return rule.selector.includes('[class*="_ioSection"]:first-of-type')
  })
  assert.ok(request, 'expected the request section to be styled')
  assert.match(request.body, /border-radius:\s*var\(--dsw-radius-lg\)/)
  assert.match(request.body, /background:\s*var\(--dsw-alias-markdown-code-block\)/)

  const seat = rules.find(function (rule) { return rule.selector.includes('[class*="_bodyWrap"]') })
  assert.ok(seat, 'expected the expanded body to be inset under the row')
  assert.match(seat.body, /margin:\s*4px 0 8px 22px/)
})

/**
 * The diff card matches the reference's payload card: full-bleed hunk rows and
 * a numbered gutter. It does NOT repeat the file path — the tool row above it
 * already names the file for edit, write and read alike.
 */
test('diff card: no path line, full bleed, numbered gutter', function () {
  const rules = parseRules(buildCssFor(sanitize({})))
  const path = rules.find(function (rule) {
    return rule.selector.includes('[data-diff] [class*="_path_"]')
      && rule.selector.includes('[data-read] [class*="_path_"]')
      && /display:\s*none/.test(rule.body)
  })
  assert.ok(path, 'the in-card path line must be hidden for edit and read alike')

  const body = rules.find(function (rule) {
    return rule.selector.includes('[data-diff] > [class*="_body_"]')
  })
  assert.ok(body, 'expected the diff body to be styled')
  assert.match(body.body, /grid-template-columns:\s*minmax\(0, 1fr\)/,
    'the max-content grid column must be pinned or wrapped lines overflow')
  assert.match(body.body, /counter-reset:\s*cds-diff-line/)

  const number = rules.find(function (rule) {
    // The selector now carries `:not([class*="_path_"]):not([class*="_gap_"])`
    // between the row class and `::after` — a separator must not be numbered —
    // so this matches the same rule without pinning the two names adjacent.
    return /\[data-diff\] \[class\*="_line_"\]/.test(rule.selector)
      && /::after/.test(rule.selector)
      && /content:\s*counter\(cds-diff-line\)/.test(rule.body)
  })
  assert.ok(number, 'expected the line-number gutter')
  assert.match(number.body, /content:\s*counter\(cds-diff-line\)/)
  assert.match(number.body, /text-align:\s*right/)
})
