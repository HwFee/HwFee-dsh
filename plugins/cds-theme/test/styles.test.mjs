/**
 * The DOM write layer: static font sheet vs state-dependent rules.
 *
 * Regression this file exists for: `createStyles().apply()` used to put the
 * WHOLE sheet — including six `@font-face` blocks whose browser `src` values
 * are ~880 KB of inlined `data:font/woff2` base64 — into one <style> tag and
 * rewrite it on every settings change. The browser then rebuilt and re-parsed
 * the whole sheet (and re-registered six faces) per toggle. The font block has
 * no state dependency, so it now lives in its own tag written once.
 *
 *   node test/styles.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { createStyles, buildCssFor, fontSheet } from '../client/src/styles.js'
import { sanitize } from '../client/src/constants.js'
import { STYLE_ID, FONT_STYLE_ID } from '../client/src/constants.js'
import { CJK_FACES, FONT_FACES, fontCss } from '../client/src/fonts.js'

// ------------------------------------------------------------- fake DOM

/** A minimal element whose `textContent` writes are counted. */
function makeElement(tagName) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    dataset: {},
    parentNode: null,
    children: [],
    writes: 0,
    appendChild(child) {
      child.parentNode = node
      node.children.push(child)
      return child
    },
    removeChild(child) {
      const index = node.children.indexOf(child)
      if (index >= 0) node.children.splice(index, 1)
      child.parentNode = null
      return child
    },
  }
  let text = ''
  Object.defineProperty(node, 'textContent', {
    enumerable: true,
    get() { return text },
    set(value) {
      text = String(value)
      node.writes += 1
    },
  })
  return node
}

function fakeDocument() {
  const head = makeElement('head')
  return {
    head,
    body: makeElement('body'),
    documentElement: makeElement('html'),
    createElement(tagName) { return makeElement(tagName) },
    getElementById(id) {
      return head.children.find(function (node) { return node.id === id }) || null
    },
  }
}

/** Install a fake document for the duration of `fn`, then restore it. */
function withDocument(fn) {
  const doc = fakeDocument()
  const previous = globalThis.document
  globalThis.document = doc
  try {
    return fn(doc)
  } finally {
    if (previous === undefined) delete globalThis.document
    else globalThis.document = previous
  }
}

/** `createStyles` closes over the global document; this wires one state store. */
function createUi() {
  let state = sanitize({})
  const styles = createStyles({ getState: function () { return state } })
  return {
    styles,
    getState() { return state },
    setState(next) { state = sanitize(next) },
  }
}

/**
 * The rules tag content `apply()` should produce for one state.
 *
 * `apply()` no longer slices the static block out of a full string — it asks
 * `buildCssFor` for the rules alone (`omitFonts: true`), which is what removes a
 * 948 KB concatenation and a 948 KB `indexOf` from every settings change (the
 * elevation slider interpolates into real CSS, so that cost was paid per drag
 * step: measured 24.4 ms/step at 9,380 elements). This helper mirrors the same
 * call, and cross-checks that the omission changes nothing else: the full
 * string with the block cut out must equal the omitted version byte for byte.
 */
function expectedRules(state) {
  const omitted = buildCssFor(state === undefined ? sanitize({}) : state, { omitFonts: true })
  const full = buildCssFor(state === undefined ? sanitize({}) : state)
  const staticCss = fontSheet()
  const at = full.indexOf(staticCss)
  assert.ok(at >= 0, 'the full sheet must contain the cached font block')
  const sliced = full.slice(0, at) + full.slice(at + staticCss.length)
  assert.equal(omitted, sliced,
    'omitFonts must produce the same rules as slicing the block out of the full sheet')
  assert.ok(omitted.indexOf('@font-face') < 0, 'the rules must carry no @font-face')
  return omitted
}

// ------------------------------------------------------------- the split

test('the font sheet is static, cached and separate from the rules', function () {
  const sheet = fontSheet()
  assert.equal(sheet, fontSheet(), 'the font block is cached at module scope')
  // Byte-identical to the old inline `fontRules()` construction.
  assert.equal(sheet, [
    '/* ---- fonts: Anthropic faces + the reference stacks ----------------- */',
    fontCss(),
  ].join('\n'), 'the cached block must equal the previous fontRules() output')
  // Six Anthropic faces + two shifted CJK fallbacks. Derived from the
  // declaration lists so adding a face does not need a second edit here.
  assert.equal((sheet.match(/@font-face/g) || []).length, FONT_FACES.length + CJK_FACES.length)
  // And it is the block `buildCssFor` embeds, unchanged.
  const full = buildCssFor(sanitize({}))
  assert.ok(full.indexOf(sheet) > 0, 'buildCssFor still contains the font block')
  assert.ok(full.startsWith('/* dsh-cds-theme'), 'the full sheet keeps the plugin banner first')
})

test('apply writes the font tag once and only rewrites the rules tag', function () {
  withDocument(function (doc) {
    const ui = createUi()
    ui.styles.activate()
    ui.styles.apply()

    const fontTag = doc.getElementById(FONT_STYLE_ID)
    const rulesTag = doc.getElementById(STYLE_ID)
    assert.ok(fontTag, 'the fonts tag exists (id STYLE_ID + /fonts)')
    assert.ok(rulesTag, 'the rules tag exists')
    assert.equal(fontTag.id, STYLE_ID + '/fonts')
    assert.equal(fontTag.textContent, fontSheet(), 'fonts tag carries the static sheet')
    assert.equal((fontTag.textContent.match(/@font-face/g) || []).length,
    FONT_FACES.length + CJK_FACES.length)
    assert.ok(!rulesTag.textContent.includes('@font-face'),
      'the rules tag must not contain any @font-face block')
    assert.equal(fontTag.writes, 1, 'font tag written once')
    assert.equal(rulesTag.writes, 1)
    assert.equal(rulesTag.textContent, expectedRules(ui.getState()))

    const firstRules = rulesTag.textContent

    // A TOKEN-ONLY toggle (the thinking-label colour) changes no CSS at all:
    // the rules tag must not even be rewritten, and the fonts tag stays put.
    ui.setState({ thinkingLabelBlue: true })
    ui.styles.apply()
    assert.equal(fontTag.writes, 1, 'fonts tag must NOT be rewritten on a toggle')
    assert.equal(rulesTag.writes, 1,
      'a token-only setting must not rewrite the rules tag (identical CSS)')
    assert.equal(rulesTag.textContent, firstRules)

    // A palette toggle DOES change rules (selection tint + ring glow), so the
    // rules tag is rewritten — still without touching the fonts tag.
    ui.setState({ accent: 'graphite' })
    ui.styles.apply()
    assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag, 'same fonts tag node')
    assert.equal(fontTag.writes, 1, 'fonts tag must NOT be rewritten on a toggle')
    assert.equal(rulesTag.writes, 2, 'rules tag is rewritten')
    assert.notEqual(rulesTag.textContent, firstRules)
    assert.equal(rulesTag.textContent, expectedRules(ui.getState()))
    assert.ok(!rulesTag.textContent.includes('@font-face'))

    // A stylesheet-only toggle (refine) also keeps the fonts tag untouched.
    ui.setState({ refine: false })
    ui.styles.apply()
    assert.equal(fontTag.writes, 1)
    assert.equal(rulesTag.writes, 3)

    // Disabling the theme MUST leave the fonts tag alone.
    //
    // Removing the @font-face rules would drop every glyph in the document to
    // a system fallback and force a full-document font re-layout — that was
    // the lag on "turn theme off". With the theme disabled the family tokens
    // revert to the host defaults, so the faces are simply unreferenced.
    ui.setState({ enabled: false })
    ui.styles.apply()
    assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag,
      'font tag survives enabled=false')
    assert.equal(fontTag.writes, 1, 'disabling must not write the font tag')
    assert.equal(fontTag.textContent, fontSheet())
    assert.equal(doc.getElementById(STYLE_ID), rulesTag, 'rules tag is reused')
    assert.equal(rulesTag.textContent, '', 'rules tag is emptied (cheap)')
    assert.equal(rulesTag.writes, 4)

    // Re-enabling re-populates the rules tag and still never touches the faces.
    ui.setState({ enabled: true })
    ui.styles.apply()
    assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag, 'same fonts tag node')
    assert.equal(fontTag.writes, 1, 're-enabling must not rewrite the font tag')
    assert.equal(rulesTag.writes, 5)
    assert.equal(rulesTag.textContent, expectedRules(ui.getState()))

    // Teardown — the only place that removes the font tag — clears BOTH.
    ui.styles.teardown()
    assert.equal(doc.getElementById(FONT_STYLE_ID), null)
    assert.equal(doc.getElementById(STYLE_ID), null)
  })
})

test('toggle-style switches never touch the fonts tag', function () {
  // Per the replication-toggle convention every switch is apply-path-only: a flip
  // rewrites the rules tag, and the cached 880 KB font sheet is never rebuilt.
  // The two verified replication switches are gone now, so the remaining live
  // ones are used here — and the retired fields are shown to cause NO rewrite at
  // all (they are no longer state).
  withDocument(function (doc) {
    const ui = createUi()
    ui.styles.activate()
    ui.styles.apply()
    const fontTag = doc.getElementById(FONT_STYLE_ID)
    const rulesTag = doc.getElementById(STYLE_ID)
    assert.equal(fontTag.writes, 1)
    assert.equal(rulesTag.writes, 1)

    const flips = [
      { refine: false },
      { refine: true },
    ]
    for (const patch of flips) {
      ui.setState(patch)
      ui.styles.apply()
      assert.equal(fontTag.writes, 1, 'font sheet untouched by ' + JSON.stringify(patch))
      assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag)
      assert.equal(rulesTag.textContent, expectedRules(ui.getState()))
      assert.ok(!rulesTag.textContent.includes('@font-face'))
    }
    assert.equal(rulesTag.writes, 3, 'one rules-tag write per flip')
    const afterFlips = rulesTag.writes
    const afterText = rulesTag.textContent

    // The retired replication fields are not state any more: carrying them in a
    // setState patch changes nothing, so the tag is not rewritten at all.
    for (const patch of [{ codeBlockDetails: false }, { markdownBody: false }]) {
      ui.setState(patch)
      ui.styles.apply()
      assert.equal(rulesTag.writes, afterFlips,
        'a retired field must not trigger a rewrite: ' + JSON.stringify(patch))
      assert.equal(rulesTag.textContent, afterText,
        'and must not change the emitted rules: ' + JSON.stringify(patch))
      assert.equal(fontTag.writes, 1)
    }
    ui.styles.teardown()
  })
})

test('the Chinese-font switch rewrites only small rules, never font faces', function () {
  withDocument(function (doc) {
    const ui = createUi()
    ui.styles.activate()
    ui.styles.apply()
    const fontTag = doc.getElementById(FONT_STYLE_ID)
    const rulesTag = doc.getElementById(STYLE_ID)
    const originalFaces = fontTag.textContent
    const onRules = rulesTag.textContent
    assert.ok(onRules.includes('preferred Chinese fonts'))
    ui.setState({ preferThemeCjk: false })
    ui.styles.apply()
    assert.ok(!rulesTag.textContent.includes('preferred Chinese fonts'))
    assert.equal(fontTag.textContent, originalFaces)
    assert.equal(fontTag.writes, 1)
    ui.setState({ preferThemeCjk: true })
    ui.styles.apply()
    assert.equal(rulesTag.textContent, onRules)
    assert.equal(rulesTag.writes, 3, 'one small rule rewrite per actual flip')
    assert.equal(fontTag.writes, 1, 'no font-face reparse during either flip')
    assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag)
    assert.ok(!rulesTag.textContent.includes('@font-face'))
    ui.styles.teardown()
  })
})

test('disabling does not touch the fonts tag, teardown is the only remover', function () {
  withDocument(function (doc) {
    const ui = createUi()
    ui.styles.activate()
    ui.styles.apply()
    const fontTag = doc.getElementById(FONT_STYLE_ID)
    assert.ok(fontTag)
    assert.equal(fontTag.writes, 1)

    // Off → on → off: the font tag is never written or re-created.
    ui.setState({ enabled: false })
    ui.styles.apply()
    assert.equal(fontTag.writes, 1, 'no write on disable')
    assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag)

    ui.setState({ enabled: true })
    ui.styles.apply()
    assert.equal(fontTag.writes, 1, 'no write on re-enable')
    assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag)

    ui.setState({ enabled: false })
    ui.styles.apply()
    assert.equal(fontTag.writes, 1, 'no write on a second disable')
    assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag)

    // Only dispose removes it.
    ui.styles.teardown()
    assert.equal(doc.getElementById(FONT_STYLE_ID), null, 'teardown removes the font tag')
    assert.equal(doc.getElementById(STYLE_ID), null, 'teardown removes the rules tag')
  })
})

test('apply after teardown does nothing until re-activated', function () {
  withDocument(function (doc) {
    const ui = createUi()
    ui.styles.activate()
    ui.styles.apply()
    ui.styles.teardown()
    ui.styles.apply()
    assert.equal(doc.head.children.length, 0, 'no tag may be re-created while inactive')
    ui.styles.activate()
    ui.styles.apply()
    assert.ok(doc.getElementById(FONT_STYLE_ID))
    assert.ok(doc.getElementById(STYLE_ID))
    ui.styles.teardown()
  })
})

test('the live path never builds the font block (the expensive route is gone)', function () {
  // THE PERFORMANCE CONTRACT. `apply()` must ask for the rules ALONE. If it ever
  // goes back to building the full sheet and slicing the block out, every
  // elevation-slider step pays a ~950 KB concatenation plus a ~950 KB `indexOf`
  // again (measured 24.4 ms/step at 9,380 elements).
  //
  // This is asserted on the SOURCE, because the cost is invisible in the output:
  // both routes produce the same string, which is exactly why a byte-comparison
  // test alone would not catch the regression.
  const source = readFileSync(new URL('../client/src/styles.js', import.meta.url), 'utf8')
  const applyBody = source.slice(source.indexOf('function apply() {'))
  const body = applyBody.slice(0, applyBody.indexOf('\n  function teardown'))
  assert.ok(/omitFonts:\s*true/.test(body),
    'apply() must pass omitFonts: true — otherwise the hot path rebuilds the font block')
  assert.ok(!/indexOf\(/.test(body),
    'apply() must not slice the font block out with indexOf (that was the 948 KB scan)')
  // The rules tag it writes therefore cannot contain the faces.
  withDocument(function (doc) {
    const ui = createUi()
    ui.styles.activate()
    ui.styles.apply()
    const rules = doc.getElementById(STYLE_ID).textContent
    assert.ok(!rules.includes('@font-face'), 'the rules tag never carries the faces')
    assert.ok(doc.getElementById(FONT_STYLE_ID).textContent.includes('@font-face'),
      'the faces live in their own tag, written once')
    ui.styles.teardown()
  })
})
