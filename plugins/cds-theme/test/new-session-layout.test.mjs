/**
 * New-session layout: the CSS-only replacement for the retired hero compactor.
 *
 * WHAT WENT WRONG. The compactor measured `[data-composer-seat]` on a blank
 * session and hid the greeting when the seat grew past a resting height. The
 * seat wraps the WHOLE hero composerStack (greeting, usage dock, workspace row,
 * input), so hiding the greeting lowered the seat it had just measured, which
 * brought the greeting back, which raised it again — a self-feeding layout
 * loop. The runtime, the `compactHero` setting, the settings row and its copy
 * are gone; a leftover `localStorage` key is inert and dropped by `sanitize()`.
 *
 * WHAT REPLACED IT — nothing that measures, observes or retries:
 *
 *   1. On the host's own `[data-content-phase="hero"]` (a NEW session; the host
 *      sets `hero = shellPhase === 'blank'`, `dsh-client-ui-conversation.js`
 *      ~17536-17546) the composer card lowers the host variable
 *      `--dsh-composer-text-max-height` to `min(30vh, 8 lines)`.
 *   2. The host's `[data-input-scroll]` is the ONE text scrollport — its
 *      `_scroll` class already reads that variable as `max-height`
 *      (08-InputBar.module.css) — so no wrapper, no JS and no second scroller
 *      are introduced.
 *   3. `[data-conversation-scroll]` keeps `overflow-y: auto` and centres with
 *      `justify-content: safe center`, falling back to `flex-start` where
 *      `safe` is unsupported, so every edge stays reachable when the remaining
 *      stack still does not fit. The page selector ties the host's hero rule on
 *      specificity — ours is `[data-conversation-content][data-content-phase=
 *      "hero"] > [data-conversation-scroll]` (0,3,0), the host's is
 *      `.root[data-phase=hero] .scrollBody` / `.embeddedBody[data-content-phase=
 *      hero] .scrollBody` (0,3,0) — so BOTH justify-content declarations are
 *      `!important`; with equal specificity the winner would otherwise be
 *      whichever stylesheet the host happens to load last.
 *   4. `[data-composer-seat]` is held in normal flow (`flex: 0 0 auto`,
 *      `position: static`) so the page, not the seat, owns overflow. This is a
 *      DEFENSIVE default: the host makes the seat sticky only under
 *      `[data-phase=active]`, so a hero session is already static and the rule
 *      overrides nothing today.
 *   5. An ACTIVE conversation is never touched.
 *
 * These tests parse the emitted rules and assert the properties above. They do
 * not render a page: browser behaviour (that the host scrollport actually
 * scrolls, that safe centring keeps the top reachable) needs the live UI.
 *
 *   node test/new-session-layout.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildCssFor } from '../client/src/styles.js'
import { sanitize, DEFAULT_STATE } from '../client/src/constants.js'
import { createPanel } from '../client/src/panel.js'
import { en, zh } from '../client/src/locales.js'

/** The emitted text of one comment-delimited block, marker line included. */
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
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match = re.exec(text)
  while (match !== null) {
    rules.push({ selector: match[1].trim().replace(/\s+/g, ' '), body: match[2].trim() })
    match = re.exec(text)
  }
  return rules
}

const LAYOUT_BLOCK = '/* ---- new-session input'
/** The host's content root, which carries the phase attribute. */
const HOST_ROOT = '[data-conversation-content]'
const HERO = '[data-content-phase="hero"]'

function layoutRules() {
  const css = buildCssFor(sanitize({}))
  const block = blockOf(css, LAYOUT_BLOCK)
  assert.ok(block !== null, 'the new-session layout block must be emitted')
  return { css, block, rules: parseRules(block) }
}

function ruleFor(rules, selectorEnd) {
  const rule = rules.find(function (entry) { return entry.selector.endsWith(selectorEnd) })
  assert.ok(rule, 'expected a rule ending in ' + selectorEnd)
  return rule
}

// ------------------------------------------------------- the layout rules

test('the new-session layout is hero-scoped and never reaches an active conversation', function () {
  const { rules } = layoutRules()
  assert.equal(rules.length, 3, 'exactly the page, seat and text-cap rules are emitted')
  for (const rule of rules) {
    assert.ok(rule.selector.includes(HERO),
      'every new-session rule rides the host hero phase: ' + rule.selector)
    assert.ok(!rule.selector.includes(HERO + ' [data-composer-seat] [data-input-scroll]'),
      'the text scrollport is the host\'s; it must not be restyled')
  }
})

test('the page scrollport owns overflow with safe centring and a flex-start fallback', function () {
  const { rules } = layoutRules()
  const page = ruleFor(rules, '[data-conversation-scroll]')
  assert.equal(page.selector,
    HOST_ROOT + HERO + ' > [data-conversation-scroll]',
    'the page rule must target the host scroll body, not a descendant')
  // Order independence: our selector and the host's hero rule are both
  // (0,3,0), so nothing here may rely on this stylesheet loading last.
  assert.match(page.body, /justify-content: flex-start !important;/,
    'flex-start is the explicit fallback where `safe` is unsupported, and it must be !important')
  assert.match(page.body, /justify-content: safe center !important;/,
    'safe centring keeps the top and bottom reachable when the stack overflows, and it must be !important')
  assert.equal((page.body.match(/!important/g) || []).length, 2,
    'the two justify-content declarations are !important together; nothing else in this rule is')
  assert.match(page.body, /overflow-y: auto;/,
    'the page itself must be scrollable — the host already declares this in the hero phase')
  assert.ok(!/overflow-y: auto !important/.test(page.body),
    'overflow-y stays non-important: it restates the host value, so the minimum change wins')
  assert.ok(page.body.indexOf('justify-content: flex-start !important;')
    < page.body.indexOf('justify-content: safe center !important;'),
    'the fallback must be declared first so a supporting browser keeps `safe center`')
})

test('the page rule does not depend on stylesheet load order', function () {
  // The host's hero rules are `.root[data-phase=hero] .scrollBody` and
  // `.embeddedBody[data-content-phase=hero] .scrollBody` — both (0,3,0), the
  // same specificity as our page selector. The plugin stylesheet cannot control
  // whether it is inserted before or after the host's, so every declaration
  // that must beat the host's hero rule carries `!important`. This is a static
  // check on the emitted text; it renders no page.
  const { rules, css } = layoutRules()
  const page = ruleFor(rules, '[data-conversation-scroll]')
  const declarations = page.body.split(';')
    .map(function (entry) { return entry.trim() })
    .filter(function (entry) { return entry.indexOf('justify-content:') === 0 })
  assert.deepEqual(declarations, [
    'justify-content: flex-start !important',
    'justify-content: safe center !important',
  ], 'both justify-content values ship important, fallback first')
  assert.ok(css.includes('  justify-content: flex-start !important;\n'
    + '  justify-content: safe center !important;'),
  'the emitted block itself must carry the two important declarations in fallback order')
})

test('the composer seat stays in normal flow at its natural height', function () {
  const { rules } = layoutRules()
  const seat = ruleFor(rules, '[data-composer-seat]')
  assert.equal(seat.selector, HOST_ROOT + HERO + ' > [data-conversation-scroll] > [data-composer-seat]',
    'the seat must be addressed exactly where the host renders it')
  assert.match(seat.body, /flex: 0 0 auto;/,
    'the seat must keep its natural height; the page owns overflow')
  assert.match(seat.body, /position: static;/,
    'defensive only: the host hero seat is already static (its sticky seat is active-phase), '
    + 'and this rule keeps it that way without outranking the host')
  assert.ok(!seat.body.includes('!important'),
    'holding a host default needs no !important')
})

test('the text cap is eight host lines or 30vh on the host\'s own variable', function () {
  const { rules } = layoutRules()
  const cap = ruleFor(rules, '[data-composer-card]')
  assert.equal(cap.selector, HOST_ROOT + HERO + ' [data-composer-card]')
  assert.equal(cap.body,
    '--dsh-composer-text-max-height: min(30vh, calc(192px + 8 * var(--dsh-content-font-delta, 0px)));',
    'the host declares 336px on the seat; the hero cap must shrink it')
  // Eight host line heights: the card's own line-height is
  // `calc(24px + var(--dsh-content-font-delta, 0px))`, so the cap follows the
  // theme's line height instead of a frozen pixel count.
  assert.match(cap.body, /8 \* var\(--dsh-content-font-delta/)
  assert.match(cap.body, /min\(30vh,/, 'on a short window 30vh must win')
  assert.ok(!/^\s*max-height:/m.test(cap.body),
    'the cap belongs to the host scrollport, not to the whole card')})

test('no leftover scroll container or retired compaction hook is emitted', function () {
  const { css, block } = layoutRules()
  for (const gone of ['data-cds-hero-compact', 'data-cds-dock-compact', 'cds-hero-height',
    'data-cds-hero-shell', 'data-cds-dock-shell']) {
    assert.ok(!css.includes(gone), gone + ' must be gone from the sheet')
  }
  // Exactly one overflow rule in the block: the page's. Anything else would be
  // a second scroll container nested inside the host's.
  const overflowY = (block.match(/overflow-y\s*:/g) || []).length
  assert.equal(overflowY, 1, 'the page must be the only scroll container this block adds')
  // The text cap must stay a VARIABLE. Declaring `max-height` here would cap
  // the whole card and cut off the toolbar row under the editor.
  assert.ok(!/^\s*max-height\s*:/m.test(block),
    'the block must only lower the host variable, never cap the card')
})

// ------------------------------------------- independence from settings

test('the layout rides neither refine nor a stored field', function () {
  const { block } = layoutRules()
  assert.ok(buildCssFor(sanitize({ refine: false })).includes(block),
    'refine is the component escape hatch; layout safety must survive it')
  assert.equal(buildCssFor(sanitize({ enabled: false })), '',
    'the master switch still releases everything')
  // A pre-existing storage payload carries `compactHero`; it is not state any
  // more and must not change a byte of the sheet.
  const legacy = sanitize({ compactHero: false, enabled: true })
  assert.equal(Object.hasOwn(legacy, 'compactHero'), false,
    'sanitize must drop the retired compaction field')
  assert.equal(Object.hasOwn(DEFAULT_STATE, 'compactHero'), false,
    'the retired field must not return to the defaults')
  assert.equal(buildCssFor(legacy), buildCssFor(sanitize({})),
    'a stored compactHero value must be inert')
})

test('the compaction runtime, its row and its copy are gone', function () {
  const read = function (name) {
    return readFileSync(new URL('../client/src/' + name, import.meta.url), 'utf8')
  }
  // The runtime modules no longer exist at all.
  for (const module of ['compact.js', 'compact-resize.js']) {
    assert.throws(function () { read(module) }, /ENOENT/,
      module + ' must be deleted, not emptied')
  }
  const lifecycle = read('lifecycle.js')
  assert.ok(!/compact/i.test(lifecycle.replace(/\/\*[\s\S]*?\*\//g, '')),
    'lifecycle.js must not install a compactor or a resize observer')
  assert.ok(!/ResizeObserver/.test(lifecycle), 'no resize observer may be installed')
  const index = read('index.js')
  assert.ok(!index.includes("from './compact.js'"), 'index.js must not import the retired module')
  assert.ok(!index.includes('createHeroCompactor'), 'index.js must not re-export the compactor')
  // The settings row and both dictionaries are gone.
  assert.equal(Object.hasOwn(en, 'compactHero.title'), false)
  assert.equal(Object.hasOwn(zh, 'compactHero.title'), false)
  const source = read('panel.js')
  assert.ok(!source.includes('compactHero'), 'panel.js must not define the row')
})

test('the panel no longer offers a compaction row', function () {
  const React = {
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      const next = props || {}
      if (typeof type === 'function') {
        return type(Object.assign({}, next, { children: children.length ? children : next.children }))
      }
      return { type, props: next, children }
    },
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() },
  }
  const panel = createPanel({
    React,
    primitives: {
      IconCheckOutlineRegular: function Check() { return null },
      IconLightOutlineMedium: function Light() { return null },
      IconDarkOutlineMedium: function Dark() { return null },
      IconFollowsystemOutlineMedium: function System() { return null },
    },
    settings: {
      getState() { return sanitize({}) },
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
  const keys = panel.slots.map(function (slot) { return slot.key })
  assert.equal(keys.indexOf('compactHero'), -1, 'no row may carry the retired key')
  assert.equal(panel.slots.some(function (slot) { return slot.id === 'dsh-cds-theme-compact-hero' }), false,
    'no row may carry the retired id')
  assert.equal(panel.slots.some(function (slot) { return slot.order === 42 }), false,
    'order 42 stays vacated')
})
