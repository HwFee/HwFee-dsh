/**
 * The turn-changes hover preview (`changes-preview-styles.js`).
 *
 * WHAT THIS GUARDS. The host's deliverables package owns the panel that opens
 * when a file row in the end-of-turn "Edited N files" card is hovered. The theme
 * does not re-render it — it aligns the panel's surface, type and row rhythm to
 * its own edit diff card (`[data-cds-diffcard]`) with CSS only. Four things have
 * gone wrong or would go wrong silently here:
 *
 *   1. THE ROOT NEVER MATCHED. The block was scoped to
 *      `[data-conversation-content]`, but the host renders the panel through
 *      `createPortal(..., document.body)`. Measured in the running app:
 *      `panel.matches('[data-conversation-content] [data-changes-hover-preview]')`
 *      is FALSE. Every rule was dead while the tests and the build stayed green.
 *      The first test below pins the scope to `body`.
 *   2. THE THEME'S OWN VARIABLES ARRIVE EMPTY. `--cds-card-surface` and the two
 *      `--cds-bg-git-*` washes are declared on `[data-conversation-content]`;
 *      inside the portal they read back as `""`, so a bare `var(--cds-…)` was
 *      dropped and the host's own colours stayed on screen. Each use therefore
 *      carries a fallback, and there is a test per variable.
 *   3. THE SWITCH. `diffPreview: false` must remove the whole block and nothing
 *      else — the edit card is the turn's record and stays.
 *   4. STATIC COLOUR AND SALTED CLASSES. Both are repository-wide rules; the
 *      `[class*="_…"]` hooks are the one place they need an argument each, which
 *      the salt test spells out per hook.
 *
 *   node --test test/changes-preview.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CHANGES_PREVIEW_ROOT,
  changesPreviewRules,
} from '../client/src/changes-preview-styles.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize, DEFAULT_STATE } from '../client/src/constants.js'
import { en, zh } from '../client/src/locales.js'
import { createPanel } from '../client/src/panel.js'

// --------------------------------------------------------------- helpers

/** The CSS text split into `selector -> body` pairs, comments removed. */
function rules(text) {
  const clean = String(text).replace(/\/\*[\s\S]*?\*\//g, '')
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(function (m) { return { selector: m[1].trim().replace(/\s+/g, ' '), body: m[2].trim() } })
}

/** The declarations of one rule, keyed by property (last one wins). */
function declarations(body) {
  const out = new Map()
  for (const part of body.split(';')) {
    const at = part.indexOf(':')
    if (at < 0) continue
    out.set(part.slice(0, at).trim(), part.slice(at + 1).trim())
  }
  return out
}

/** Every declared value in the block, for the static-colour sweep. */
function values(text) {
  return rules(text).flatMap(function (rule) {
    return [...declarations(rule.body).values()]
  })
}

/** A React stand-in: the row renderer only needs createElement + one hook. */
function fakeReact() {
  return {
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      const nextProps = props || {}
      if (typeof type === 'function') {
        return type(Object.assign({}, nextProps, {
          children: children.length > 0 ? children : nextProps.children,
        }))
      }
      return { type, props: nextProps, children }
    },
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() },
  }
}

function createRowPanel() {
  const state = sanitize({})
  return createPanel({
    React: fakeReact(),
    primitives: {
      IconCheckOutlineRegular: function IconCheck() { return null },
      IconLightOutlineMedium: function IconLight() { return null },
      IconDarkOutlineMedium: function IconDark() { return null },
      IconFollowsystemOutlineMedium: function IconSystem() { return null },
    },
    settings: {
      getState() { return state },
      subscribe() { return function () {} },
      setState() {},
    },
    themeMode: {
      available() { return true },
      getPreference() { return 'system' },
      setPreference() { return true },
      subscribe() { return function () {} },
    },
  })
}

// ------------------------------------------------------------ the switch

test('the default state emits the block, and diffPreview: false emits only the hide rule', function () {
  const on = changesPreviewRules(sanitize({}))
  assert.ok(on.length > 0, 'the default state must emit the rules')
  assert.ok(on.includes(CHANGES_PREVIEW_ROOT), 'the block must be scoped by the root')

  // OFF MUST ACTUALLY REMOVE THE PANEL. The panel is mounted by the host's own
  // HoverCard portal, so an empty sheet leaves it appearing untouched — measured:
  // a 500ms hover still opened it. The setting's copy promises the panel goes
  // away, so the off branch emits one hide rule and no styling at all.
  const off = changesPreviewRules(sanitize({ diffPreview: false }))
  assert.match(off, /display:\s*none\s*!important/, 'off must hide the panel')
  assert.ok(off.includes(CHANGES_PREVIEW_ROOT), 'the hide rule still names the root')
  for (const styling of ['border-radius', 'box-sizing', 'font-family', 'background', 'line-height']) {
    assert.ok(!off.includes(styling), 'off must carry no styling, found ' + styling)
  }

  // A missing argument is the default-on path, not an accidental off.
  assert.ok(changesPreviewRules().length > 0, 'no state means default on')
  assert.ok(changesPreviewRules(undefined).length > 0)
  assert.ok(changesPreviewRules(null).length > 0)
  assert.ok(!changesPreviewRules().includes('display: none'), 'the on path never hides the panel')
})

test('the switch reaches the built sheet: off replaces the block with the hide rule', function () {
  const on = buildCssFor(sanitize({}))
  const off = buildCssFor(sanitize({ diffPreview: false }))

  assert.ok(on.includes(CHANGES_PREVIEW_ROOT), 'the default sheet must carry the block')
  // The root still appears in the off sheet — as a hide rule, not as styling.
  // Scope the comparison to THIS module's output: `--dsw-radius-lg` and the rest
  // appear throughout the sheet, so only the block's own text can settle it.
  const offBlock = changesPreviewRules(sanitize({ diffPreview: false }))
  assert.match(offBlock, /body \[data-changes-hover-preview\] \{ display: none !important; \}/,
    'the off block must be exactly one hide rule')
  assert.ok(!offBlock.includes('--dsw-radius-lg'), 'the off block must not carry the frame')
  assert.ok(!offBlock.includes('box-sizing'), 'the off block must not carry the geometry')

  // The edit card is the turn's record; the switch is named after the PREVIEW and
  // must not take the card with it.
  assert.ok(off.includes('[data-cds-diffcard]'),
    'turning the preview off must leave the edit diff card in place')
})

test('the mode switch is not tied to refine: refine on and off both emit it', function () {
  // The panel is a component refinement, so `refine: false` DOES drop it — that
  // is deliberate and is asserted here so a future "make it unconditional" edit
  // has to change this test on purpose.
  assert.ok(buildCssFor(sanitize({ refine: true })).includes(CHANGES_PREVIEW_ROOT))
  assert.ok(!buildCssFor(sanitize({ refine: false })).includes(CHANGES_PREVIEW_ROOT),
    'the preview is a refinement, so the master refinement switch removes it')
  // The master switch removes everything.
  assert.ok(!buildCssFor(sanitize({ enabled: false })).includes(CHANGES_PREVIEW_ROOT))
})

// ------------------------------------------------------- state sanitizing

test('sanitize keeps the diffPreview key: default true, explicit false survives', function () {
  const empty = sanitize({})
  assert.ok(Object.hasOwn(empty, 'diffPreview'),
    'sanitize rebuilds the whole state object — a key it does not list is silently dropped on every save')
  assert.equal(empty.diffPreview, true)
  assert.equal(empty.diffPreview, DEFAULT_STATE.diffPreview)

  // The three shapes a stored payload can take.
  assert.equal(sanitize({ diffPreview: false }).diffPreview, false)
  assert.equal(sanitize({ diffPreview: true }).diffPreview, true)
  assert.equal(sanitize({ diffPreview: undefined }).diffPreview, true,
    'an old payload without the field adopts the default')
  // Only a boolean false opts out; a truthy-string must not turn it off.
  assert.equal(sanitize({ diffPreview: 'false' }).diffPreview, true,
    'a non-boolean false-ish string is not the off state')

  // Round trip: what sanitize produces must be what the rules read.
  assert.match(changesPreviewRules(sanitize({ diffPreview: false })), /display:\s*none/,
    'the sanitized off state must reach the builder as off')
  assert.ok(changesPreviewRules(sanitize({})).length > 0)
})

test('every DEFAULT_STATE key survives sanitize, diffPreview included', function () {
  // The generic shape of the bug that bit `uiFontFamily`: a key added to the
  // default but not to the whitelist disappears on the first save, and the row
  // that reads it re-renders forever.
  const state = sanitize({})
  for (const key of Object.keys(DEFAULT_STATE)) {
    assert.ok(Object.hasOwn(state, key), 'sanitize drops the default key ' + key)
  }
})

// ------------------------------------------------------------- the scope

test('the root is scoped to body, because the host portals the panel there', function () {
  // REGRESSION GUARD. The block was once scoped to [data-conversation-content]
  // and matched nothing: HoverCard renders through createPortal(..., body), and
  // the measured parent chain is panel -> div._card_*_preview -> BODY. A scoped
  // selector here is a silent total failure, so it is pinned.
  assert.equal(CHANGES_PREVIEW_ROOT, 'body [data-changes-hover-preview]')
  assert.ok(!CHANGES_PREVIEW_ROOT.includes('data-conversation-content'),
    'the conversation scope can never match a portaled panel — it was the bug')
  assert.match(CHANGES_PREVIEW_ROOT, /^body /, 'keep a body scope so a detached fragment cannot match')

  // The host hook itself, not a class.
  const hook = CHANGES_PREVIEW_ROOT.match(/\[data-[a-z-]+(?:="[^"]*")?\]/g)
  assert.ok(hook !== null, 'the root must key on a data hook')
  assert.ok(hook.length >= 1)
  assert.doesNotMatch(CHANGES_PREVIEW_ROOT, /[.#][A-Za-z0-9]+_[a-z]/,
    'a hashed CSS-Modules class in the root would break on the next host build')
})

test('every selector stays under the root and drives no layout of its own', function () {
  const text = changesPreviewRules(sanitize({}))
  const entries = rules(text)
  assert.ok(entries.length >= 14, 'the block restyles the whole panel, not one line')

  for (const rule of entries) {
    for (const selector of rule.selector.split(',').map(function (s) { return s.trim() })) {
      assert.ok(selector.startsWith(CHANGES_PREVIEW_ROOT),
        'every selector must start at the root, found: ' + selector)
    }
  }
  // Placement and hit-testing belong to the host's portal; touching them here
  // would fight its collision handling and its own fade.
  assert.doesNotMatch(text, /(?:^|\s)(?:position|display|visibility|z-index|pointer-events|opacity)\s*:/m,
    'the block must not drive placement or hit testing')
  assert.doesNotMatch(text, /:\w*root\w*|svg\s*\{|\*\s*\{/,
    'no descendant wildcard and no re-styling of nested roots')
})

// ---------------------------------------------- static colour and salt

test('the block declares no static colour: every value is a token or a var', function () {
  const text = changesPreviewRules(sanitize({}))
  const blocked = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i
  for (const value of values(text)) {
    assert.doesNotMatch(value, blocked, 'a literal colour would pin one mode: ' + value)
  }
  // And the two colours the host used to paint, which must not survive anywhere.
  assert.doesNotMatch(text, /#2C2C2E|#cfd3d6|tooltip-bg|dsw-hovercard-bg/i,
    'the host dark fill and its cold greys must be replaced by CDS roles')
  // Sanity: the sweep above can actually see a literal, so a passing run means
  // something. (A regex that never matches would make the assertion vacuous.)
  assert.match('#ffffff', blocked)
  assert.match('rgba(0, 0, 0, 0.5)', blocked)
})

test('the theme tokens this block consumes exist in both modes', function () {
  // `--cds-*` are declared on the conversation content, so inside the portal they
  // resolve to nothing — every use needs a fallback. The fallback is what is
  // asserted here, not the theme value.
  const text = changesPreviewRules(sanitize({}))
  for (const name of ['--cds-card-surface', '--cds-bg-git-added', '--cds-bg-git-removed']) {
    const pattern = new RegExp('var\\(' + name + '\\s*,\\s*var\\(--[a-z0-9-]+\\)\\)')
    assert.match(text, pattern,
      name + ' must carry a host-token fallback: inside the portal the theme variable is empty')
  }
})

test('no salt in any class hook, and each hook is justified as a semantic suffix', function () {
  const text = changesPreviewRules(sanitize({}))

  // A salt looks like `_name_1ypvv_5` — an underscore-delimited name with a
  // hash and a line number. That is the host's per-build hash and must never be
  // named. `[class*="_add"]` is NOT that: it contains no hash and no digits, so
  // it keeps matching when the host rebuilds.
  const salted = /_\w+_\d+/g
  assert.doesNotMatch(text, salted, 'a salted CSS-Modules class would break on the next host build')

  // Each hook, and why it is allowed to stay:
  const hooks = [...new Set([...text.matchAll(/\[class\*="([^"]+)"\]/g)].map(function (m) { return m[1] }))]
  assert.ok(hooks.length > 0, 'the block must still hook the host markup somehow')

  const justified = {
    // FileDiff body / rows. The host's names are `_0SbxAa_body`, `_0SbxAa_line`,
    // `_0SbxAa_sideLine`, `_0SbxAa_splitLine`: the hash comes BEFORE the name, so
    // a substring test on the semantic tail ("_body", "_line") matches in any
    // build. Measured on the live panel: every one of these matched.
    '_body': 'FileDiff scroll body',
    '_line': 'unified diff row',
    '_sideLine': 'split-view diff row',
    '_splitLine': 'split-view line pair',
    // Hunks and their headers.
    '_hunk': 'hunk block',
    '_hunkHeader': 'the @@ header of a hunk',
    // The gutter.
    '_number': 'a line-number cell',
    '_sign': 'the +/- glyph cell',
    // Row kinds. These are the semantic names the host itself uses for a row's
    // state, and the same tails `styles.js` already keys on for the tool rows.
    '_add': 'an added row',
    '_del': 'a deleted row',
    '_context': 'an unchanged row',
    '_text': 'the code text cell',
    '_note': 'the truncation note',
  }
  for (const hook of hooks) {
    assert.ok(Object.hasOwn(justified, hook),
      'a new [class*="…"] hook needs its own justification: ' + hook + ' — add it with a reason, ' +
      'or replace it with a data-* hook the host publishes')
    assert.doesNotMatch(hook, /\d/, 'a digit in the hook means it is salted: ' + hook)
    assert.doesNotMatch(hook, /^_[A-Za-z0-9]{5,}_/, 'a hash segment in the hook: ' + hook)
    assert.ok(justified[hook].length > 0)
  }
})

// --------------------------------------------------- bilingual settings

test('the settings row has a title and a description in both locales', function () {
  for (const suffix of ['title', 'desc']) {
    const key = 'diffPreview.' + suffix
    assert.ok(Object.hasOwn(en, key), 'missing en ' + key)
    assert.ok(Object.hasOwn(zh, key), 'missing zh ' + key)
    assert.ok(en[key].trim().length > 0, 'en ' + key + ' is empty')
    assert.ok(zh[key].trim().length > 0, 'zh ' + key + ' is empty')
  }
  // en is English and zh is Chinese — the same rule the locale suite applies to
  // every row, repeated here so this file fails on its own terms.
  assert.doesNotMatch(en['diffPreview.title'] + en['diffPreview.desc'], /[\u4e00-\u9fff]/)
  assert.match(zh['diffPreview.title'] + zh['diffPreview.desc'], /[\u4e00-\u9fff]/)
  // The copy has to say what the switch does NOT do, because the row sits next
  // to the edit-card rows and "off" could be read as removing the diff entirely.
  assert.match(en['diffPreview.desc'], /edit card/i,
    'the English copy must say the edit card is unaffected')
  assert.match(zh['diffPreview.desc'], /编辑卡片/,
    'the Chinese copy must say the edit card is unaffected')
})

test('the panel registers the row and it points at the diffPreview key', function () {
  const panel = createRowPanel()
  const slot = panel.slots.find(function (s) { return s.id === 'dsh-cds-theme-diff-preview' })
  assert.ok(slot, 'the settings row must be registered')
  assert.equal(slot.key, 'diffPreview')
  assert.equal(slot.titleKey, 'diffPreview.title')
  assert.equal(slot.descKey, 'diffPreview.desc')
  assert.equal(typeof slot.order, 'number')
  const orders = panel.slots.map(function (s) { return s.order })
  assert.deepEqual(orders, orders.slice().sort(function (a, b) { return a - b }),
    'the row must keep the block in a stable visual order')
  // The key it toggles is one sanitize keeps, so the toggle can actually persist.
  assert.ok(Object.hasOwn(sanitize({}), slot.key))
})

// --------------------------------------------------------- the alignment

test('forked from the edit card: the frame, the type and the row rhythm', function () {
  // The reference values, read out of the live stylesheet by placing a node that
  // carries the real attributes inside the conversation content:
  //   card   12px / 17px (1.6), radius 12px, code family, padding 8px 0
  //   row    17px (1lh), full-bleed wash on the row, not the cell
  //   number 11px, state colour, right-aligned, 0 8px 0 2px, no cell fill
  const map = new Map(rules(changesPreviewRules(sanitize({}))).map(function (r) {
    return [r.selector, declarations(r.body)]
  }))
  const root = map.get(CHANGES_PREVIEW_ROOT)
  assert.ok(root, 'the root rule must exist')

  const surface = root.get('background')
  assert.ok(surface.includes('var(--cds-card-surface'), surface)
  assert.ok(!/#[0-9a-f]{3,8}/i.test(surface), 'no literal surface: dark mode would stay light')
  assert.equal(root.get('border-radius'), 'var(--dsw-radius-lg) !important')
  assert.equal(root.get('color'), 'var(--dsw-alias-label-primary) !important')
  assert.equal(root.get('font-family'), 'var(--ds-font-family-code) !important')
  // The TYPE comes from the same shorthand the edit card uses. The token resolves
  // to 12px/17px in the running app, so the old hand-written 12px/1.6 rendered
  // every row at 19.2px — 2.2px taller than the card being compared against.
  const font = root.get('font')
  assert.ok(font.startsWith('var(--dsw-font-markdown-code-block-small,'),
    'the type must come from the edit card\'s own token: ' + font)
  assert.equal(root.get('font-size'), undefined,
    'a separate font-size would fight the shorthand and reintroduce the drift')
  assert.equal(root.get('line-height'), undefined,
    'a separate line-height would fight the shorthand and reintroduce the drift')
  // Same height cap as the edit card, so a long file cannot push the page.
  assert.equal(root.get('max-height'), '280px')
  assert.match(root.get('border'), /^0\.5px solid var\(--dsw-alias-border-l2\) !important$/)

  // The washes are RE-DECLARED on the card, because the theme declares them on
  // the conversation content and this panel lives outside it.
  assert.match(root.get('--cds-bg-git-added'), /^color-mix\(in srgb, var\(--dsw-alias-state-success-primary\) 12%, transparent\)$/)
  assert.match(root.get('--cds-bg-git-removed'), /^color-mix\(in srgb, var\(--dsw-alias-state-error-primary\) 12%, transparent\)$/)

  // Rows: the card's `1lh` rhythm, and the wash on the row rather than the cell.
  const line = map.get(CHANGES_PREVIEW_ROOT + ' [class*="_line"], ' +
    CHANGES_PREVIEW_ROOT + ' [class*="_sideLine"], ' +
    CHANGES_PREVIEW_ROOT + ' [class*="_splitLine"]')
  assert.ok(line, 'the unified / split rows must be re-rhythmed')
  assert.equal(line.get('min-height'), '1lh !important')
  assert.equal(line.get('line-height'), '1lh !important')

  const add = map.get(CHANGES_PREVIEW_ROOT + ' [class*="_add"]')
  assert.match(add.get('background'), /var\(--cds-bg-git-added,/)
  const del = map.get(CHANGES_PREVIEW_ROOT + ' [class*="_del"]')
  assert.match(del.get('background'), /var\(--cds-bg-git-removed,/)

  // The gutter keeps its numbers on the surface: the host's cell wash and its
  // 3px inset marker read as a second surface inside this card.
  const number = map.get(CHANGES_PREVIEW_ROOT + ' [class*="_number"]')
  assert.equal(number.get('background'), 'transparent !important')
  assert.equal(number.get('box-shadow'), 'none !important')
  assert.equal(number.get('padding'), '0 8px 0 2px !important',
    'the same gutter padding the edit card uses')
  assert.equal(number.get('font-size'), '11px !important')
  assert.equal(number.get('text-align'), undefined,
    'the host already right-aligns; re-declaring it would be noise')
  assert.equal(number.get('color'), 'var(--dsw-alias-label-caption) !important')

  const addNumber = map.get(CHANGES_PREVIEW_ROOT + ' [class*="_add"] [class*="_number"]')
  assert.equal(addNumber.get('color'), 'var(--dsw-alias-state-success-primary) !important')
  const delNumber = map.get(CHANGES_PREVIEW_ROOT + ' [class*="_del"] [class*="_number"]')
  assert.equal(delNumber.get('color'), 'var(--dsw-alias-state-error-primary) !important')
})

test('the block never declares the Shiki palette on a surface with no token spans', function () {
  // `test/css.test.mjs` allows --shiki-token-* on exactly two surfaces. The host's
  // rows are plain text, so this panel has nothing to paint them on.
  assert.doesNotMatch(changesPreviewRules(sanitize({})), /--shiki-/,
    'the preview has no token spans; declaring the palette here would be a third site')
})

test('the module can be imported and emitted twice without drifting', function () {
  // The builder may be called on every state change; the text must be a pure
  // function of the state, not of call order.
  const a = changesPreviewRules(sanitize({}))
  const b = changesPreviewRules(sanitize({}))
  assert.equal(a, b, 'the rule text must be deterministic')
  assert.equal(changesPreviewRules(sanitize({ diffPreview: false })), changesPreviewRules(sanitize({ diffPreview: false })))
})
