/**
 * 「外观 / Appearance」 is a real settings SECTION, not a container inside 通用.
 *
 * The user's correction this file pins: 「外观」 must be a nav entry at the same
 * level as 「通用」 and 「账户」, with its own page.
 *
 * The host mechanisms exercised here are the shipped ones (verified in the
 * installed `app.asar`; `client/src/section.js` carries the file:line
 * citations):
 *
 *   - `settings.section` is a list slot the settings shell declares, ordered by
 *     `order` and labelled through `resolveSlotLabel` (a thunk);
 *   - a section that declares `children` receives `renderSlot` as an injected
 *     prop — the renderer's standard kit
 *     (`dsh-client-ui-renderer/lib/client.js:753-755`), not a Plugins-page
 *     special case;
 *   - `SlotCore.register` declares a section's children and notifies their
 *     listeners SYNCHRONOUSLY inside the same call, which is what makes the
 *     placement decision available without polling;
 *   - `ctx.slots.inject(key, cb)` runs `cb` when `key` is declared.
 *
 * The fake slot service below reproduces those properties and nothing else, so
 * the tests read like the host contract.
 *
 *   node test/section.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { createPanel } from '../client/src/panel.js'
import { sanitize } from '../client/src/constants.js'
import { en, zh, LOCALE_NS, makeTranslator } from '../client/src/locales.js'
import {
  SECTION_NAME, APPEARANCE_SECTION_ID, APPEARANCE_SECTION_ORDER, APPEARANCE_SLOT,
  GENERAL_SLOT, SECTION_ATTR, SECTION_WAIT_MS, appearanceSectionOptions,
  createAppearanceSection, registerSettingsRows,
} from '../client/src/section.js'

// ------------------------------------------------------------- harness

/** A React stand-in: createElement plus the one hook panel.js uses. */
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
    useSyncExternalStore(subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
}

function fakeSettings() {
  const state = sanitize({})
  return {
    getState() { return state },
    subscribe() { return function () {} },
    setState() {},
  }
}

function createRowPanel() {
  return createPanel({
    React: fakeReact(),
    primitives: { IconCheckOutlineRegular: function IconCheck() { return null } },
    settings: fakeSettings(),
  })
}

/**
 * The host slot service, reduced to the contract this plugin depends on.
 *
 * Faithful to the parts that matter:
 *   - `register` REFUSES a key nothing declared (the real `SlotCore` throws);
 *   - `register` on a section declares that section's `children` and notifies
 *     their listeners INSIDE the same call;
 *   - a `declare` outside a register (the settings shell mounting) notifies the
 *     declaration listeners too;
 *   - `inject(key, cb)` runs `cb` when the key is declared, immediately if it
 *     already is;
 *   - removing a section un-declares its children and drops their rows.
 */
function fakeSlots(config) {
  const cfg = config || {}
  const declared = new Set()
  const rows = new Map()        // slot key → [{ name, id, order, component }]
  const listeners = new Map()   // slot key → [callback]
  const declarations = []       // every options object that reached register()

  function fire(key) {
    for (const callback of (listeners.get(key) || []).slice()) {
      const made = callback()
      for (const off of (Array.isArray(made) ? made : [])) {
        if (typeof off === 'function') (off.__keys || []).push(key)
      }
    }
  }

  const api = {
    declarations,
    entries(key) {
      return (rows.get(key) || []).map(function (row) { return { options: row } })
    },
    ids(key) {
      return (rows.get(key) || []).map(function (row) { return row.id })
    },
    isDeclared(key) { return declared.has(key) },
    spec(key) {
      return declared.has(key) ? { kind: 'list', scope: 'root' } : undefined
    },
    /** Declare a slot the way the settings shell does on mount. */
    declare(key) {
      declared.add(key)
      fire(key)
      return function () {
        declared.delete(key)
        rows.delete(key)
        fire(key)
      }
    },
    register(options, component) {
      if (options === undefined || options.name === undefined) {
        throw new Error('register requires a name')
      }
      if (!declared.has(options.name)) {
        throw new Error('slot "' + options.name + '" is not declared')
      }
      if (cfg.refuseRegister === options.name) {
        throw new Error('single slot "' + options.name + '" already has a registration')
      }
      if ((rows.get(options.name) || []).some(function (row) { return row.id === options.id })) {
        throw new Error('list slot "' + options.name + '" already has an entry with id "'
          + options.id + '"')
      }
      const row = { name: options.name, id: options.id, order: options.order, component }
      rows.set(options.name, (rows.get(options.name) || []).concat([row]))
      // `component` is the second argument to `register` (the host stores it on
      // the entry, not on the options object), so keep it beside the options.
      declarations.push(Object.assign({ component: component }, options))

      const children = Object.keys(options.children || {})
      for (const key of children) declared.add(key)
      if (cfg.onSection !== undefined && options.name === SECTION_NAME) cfg.onSection(options)
      // The host notifies the child listeners INSIDE this call.
      for (const key of children) fire(key)

      let live = true
      return function () {
        if (!live) return
        live = false
        rows.set(options.name, (rows.get(options.name) || []).filter(function (r) {
          return r !== row
        }))
        for (const key of children) {
          declared.delete(key)
          rows.delete(key)
          fire(key)
        }
      }
    },
    inject(key, callback) {
      const run = function () {
        const made = callback()
        return Array.isArray(made) ? made : [made]
      }
      if (declared.has(key)) {
        const offs = run()
        return function () {
          for (const off of offs) if (typeof off === 'function') off()
        }
      }
      const list = listeners.get(key) || []
      list.push(callback)
      listeners.set(key, list)
      return function () {
        listeners.set(key, (listeners.get(key) || []).filter(function (cb) {
          return cb !== callback
        }))
      }
    },
  }
  return api
}

/** A timer pair the tests fire by hand. */
function manualTimers() {
  const pending = new Map()
  let seq = 0
  return {
    pending,
    setTimeout(fn, ms) {
      const id = ++seq
      pending.set(id, { fn, ms })
      return id
    },
    clearTimeout(id) { pending.delete(id) },
    flush() {
      const list = [...pending.values()]
      pending.clear()
      for (const entry of list) entry.fn()
    },
  }
}

function sectionOf() {
  return {
    options: appearanceSectionOptions(makeTranslator(en)),
    component: createAppearanceSection({ React: fakeReact() }),
  }
}

function createRows(options) {
  const slots = options.slots
  const panel = options.panel || createRowPanel()
  const warnings = []
  // The settings shell always declares `settings.general.item` (it owns the 通用
  // page), so a composed host has it from boot. Tests that model a host missing
  // it pass `general: false`.
  if (options.general !== false && typeof slots.declare === 'function') {
    slots.declare(GENERAL_SLOT)
  }
  const controller = registerSettingsRows({
    slots,
    panel,
    section: options.section === undefined ? sectionOf() : options.section,
    warn: function (message) { warnings.push(message) },
    waitMs: options.waitMs === undefined ? 0 : options.waitMs,
    timers: options.timers || manualTimers(),
  })
  return { controller, panel, warnings }
}

const APPEARANCE_ROW_IDS = [
  'dsh-cds-theme-mode',
  'dsh-cds-theme-accent',
  'dsh-cds-theme-warmth',
  'dsh-cds-theme-radius',
  'dsh-cds-theme-elevation',
  'dsh-cds-theme-refine',
  'dsh-cds-theme-thinking-blue',
  'dsh-cds-theme-paste-as-file',
  'dsh-cds-theme-prefer-theme-cjk',
  'dsh-cds-theme-hero-ripple',
  // The two opt-in looks of this wave: the assistant markdown scope (45) and the
  // view-tabs pill (46). Both ship OFF.
  'dsh-cds-theme-markdown-scope',
  'dsh-cds-theme-view-tabs-pill',
  'dsh-cds-theme-composer-split',
]

// The flat fallback concatenates the two ledgers: appearance rows first (in
// their own order), then the General master switch. This is NOT `panel.slots`,
// which is the union sorted by `order` for display.
const ALL_ROW_IDS = APPEARANCE_ROW_IDS.concat(['dsh-cds-theme-enabled'])

/**
 * Rows deleted once the user verified those looks. By the standing convention
 * (docs/replication-toggles.md) the switch goes and the behaviour stays, so these
 * ids must never reappear on either slot.
 */
const RETIRED_ROW_IDS = [
  'dsh-cds-theme-code-block-details',
  'dsh-cds-theme-markdown-body',
  // The hero-compaction switch went with its runtime (the measured seat fed its
  // own collapse); the new-session layout is CSS-only and has no row.
  'dsh-cds-theme-compact-hero',
]

/**
 * The HOST's own row title for `settings.general.item` id `appearance` — the
 * 浅色 / 深色 / 跟随系统 cubes. Copied from the shipped dictionary
 * (`dsh-client-ui-theme/lib/client.js`, `appearance.title`); it is here so the
 * disambiguation test compares against the real word, not a paraphrase.
 */
function hostAppearanceTitle(locale) {
  return locale === 'zh' ? '外观' : 'Appearance'
}

// ------------------------------------------------- section registration

test('the section registers as a settings.section with id appearance and order 1', function () {
  const slots = fakeSlots()
  slots.declare(SECTION_NAME)
  const rows = createRows({ slots })

  assert.equal(rows.controller.mode, 'section')
  const section = slots.declarations.find(function (opts) { return opts.name === SECTION_NAME })
  assert.ok(section, 'expected a settings.section registration')
  assert.equal(section.id, APPEARANCE_SECTION_ID)
  assert.equal(section.id, 'appearance')
  assert.equal(section.order, APPEARANCE_SECTION_ORDER)
  assert.equal(section.order, 1, 'order 1 seats 外观 between 通用 (0) and 模型 (10)')
  assert.equal(section.locale, LOCALE_NS, 'the locale namespace is what injects t')
})

test('the section declares its own child ledger', function () {
  const slots = fakeSlots()
  slots.declare(SECTION_NAME)
  createRows({ slots })

  const section = slots.declarations.find(function (opts) { return opts.name === SECTION_NAME })
  assert.deepEqual(section.children, { [APPEARANCE_SLOT]: { kind: 'list', scope: 'root' } })
  assert.equal(APPEARANCE_SLOT, 'settings.appearance.item')
  assert.ok(slots.isDeclared(APPEARANCE_SLOT), 'the section declares the child slot')
})

test('the section label is a locale-following thunk in both languages', function () {
  const english = appearanceSectionOptions(makeTranslator(en))
  const chinese = appearanceSectionOptions(makeTranslator(zh))
  assert.equal(typeof english.label, 'function', 'a thunk, so the nav can re-resolve it')
  assert.equal(english.label(), en['appearance.nav'])
  assert.equal(english.label(), 'Theme')
  assert.equal(chinese.label(), zh['appearance.nav'])
  assert.equal(chinese.label(), '主题定制')
  assert.notEqual(english.label(), chinese.label())

  // One options object, dictionary swapped: the nav renames itself.
  let dict = en
  const live = appearanceSectionOptions(function (key) { return dict[key] })
  assert.equal(live.label(), 'Theme')
  dict = zh
  assert.equal(live.label(), '主题定制', 'switching the dictionary renames the nav entry')
})

test('the section falls back to English when the host injects no t', function () {
  assert.equal(appearanceSectionOptions(undefined).label(), en['appearance.nav'])
})

test('the section body renders its child ledger through the injected renderSlot', function () {
  const AppearanceSection = createAppearanceSection({ React: fakeReact() })
  const calls = []
  const tree = AppearanceSection({
    t: function (key) { return en[key] },
    renderSlot: function (key, props, opts) {
      calls.push({ key, props, opts })
      return { type: 'slot-outlet', props: { key }, children: [] }
    },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].key, APPEARANCE_SLOT)
  assert.deepEqual(calls[0].props, {})
  assert.equal(tree.props[SECTION_ATTR], '', 'the wrapper is marked for the sheet and the tests')
  assert.equal(tree.props.className, 'dct-section')
  // Intro copy first, ledger second.
  assert.equal(tree.children.length, 2)
  assert.ok(JSON.stringify(tree.children[0]).includes(en['appearance.intro']))
  assert.equal(tree.children[1].props.key, APPEARANCE_SLOT)
})

test('a section without renderSlot warns instead of crashing', function () {
  const warnings = []
  const original = console.warn
  console.warn = function (message) { warnings.push(String(message)) }
  try {
    const AppearanceSection = createAppearanceSection({ React: fakeReact() })
    const tree = AppearanceSection({ t: function (key) { return en[key] } })
    assert.ok(tree, 'the dialog must not crash')
    assert.equal(tree.children[1], null, 'no ledger to render')
  } finally {
    console.warn = original
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /renderSlot/)
})

// ------------------------------------------------------ the row migration

test('every appearance row lands on the new slot and only enabled stays in General', function () {
  const slots = fakeSlots()
  slots.declare(SECTION_NAME)
  const rows = createRows({ slots })

  assert.equal(rows.controller.mode, 'section')
  const onSection = slots.ids(APPEARANCE_SLOT)
  const onGeneral = slots.ids(GENERAL_SLOT)

  assert.deepEqual(onSection, APPEARANCE_ROW_IDS, 'the theme-mode row plus the twelve remaining appearance controls')
  assert.deepEqual(onGeneral, ['dsh-cds-theme-enabled'],
    'the master switch is a plugin on/off switch, not an appearance knob')

  const overlap = onSection.filter(function (id) { return onGeneral.indexOf(id) >= 0 })
  assert.deepEqual(overlap, [], 'no row may be registered twice')
  assert.equal(onSection.length + onGeneral.length, rows.panel.slots.length,
    'every row is placed exactly once')
})

test('the row orders are the same numbers on the new page', function () {
  const slots = fakeSlots()
  slots.declare(SECTION_NAME)
  createRows({ slots })

  const orders = slots.entries(APPEARANCE_SLOT).map(function (entry) { return entry.options.order })
  assert.deepEqual(orders, [10, 18, 19, 22, 24, 26, 29, 44, 39, 43, 45, 46, 47].sort(function (a, b) { return a - b }),
    'the theme-mode row takes order 10; the knobs keep 18-29; the feature rows take 39/43/45/46 and the backdrop 44 (40/41 are usage-stats on this page, 42 is vacated)')
  const generalOrders = slots.entries(GENERAL_SLOT).map(function (entry) { return entry.options.order })
  assert.deepEqual(generalOrders, [30])
})

test('the rows keep their components and locale namespace on the new slot', function () {
  const slots = fakeSlots()
  slots.declare(SECTION_NAME)
  const rows = createRows({ slots })

  const registered = slots.declarations.filter(function (opts) {
    return opts.name === APPEARANCE_SLOT || opts.name === GENERAL_SLOT
  })
  assert.equal(registered.length, 14)
  for (const options of registered) {
    assert.equal(options.locale, LOCALE_NS, options.id + ' must inject t')
    assert.equal(typeof options.component, 'function', options.id + ' must render')
  }
  for (const row of rows.panel.appearanceSlots.concat(rows.panel.generalSlots)) {
    const options = registered.find(function (opts) { return opts.id === row.id })
    assert.equal(options.component, row.component, row.id + ' kept its component')
  }
})

// ------------------------------------------------------------ the fallback

test('without a settings.section ledger all ten rows use the General list', function () {
  const slots = fakeSlots()
  slots.declare(GENERAL_SLOT)   // a host without the settings shell
  const rows = createRows({ slots })

  assert.equal(rows.controller.mode, 'flat')
  assert.equal(rows.controller.appearanceRows(), 0)
  assert.equal(rows.controller.generalRows(), 14)
  assert.match(rows.controller.reason(), /settings\.section/)
  assert.equal(rows.warnings.length, 1)
  assert.match(rows.warnings[0], /fall back to the General list/)

  assert.deepEqual(slots.ids(GENERAL_SLOT), ALL_ROW_IDS,
    'the whole block, in display order, exactly as before the section existed')
  assert.deepEqual(slots.ids(APPEARANCE_SLOT), [],
    'nothing may be left on a slot nobody renders')
})

test('a host that refuses the section registration falls back to General', function () {
  const slots = fakeSlots({ refuseRegister: SECTION_NAME })
  slots.declare(SECTION_NAME)
  slots.declare(GENERAL_SLOT)
  const rows = createRows({ slots })

  assert.equal(rows.controller.mode, 'flat')
  assert.match(rows.controller.reason(), /refused the section registration/)
  assert.equal(rows.warnings.length, 1)
  assert.deepEqual(slots.ids(GENERAL_SLOT), ALL_ROW_IDS)
  assert.deepEqual(slots.ids(APPEARANCE_SLOT), [], 'the refused section leaves no rows behind')
  assert.deepEqual(slots.entries(SECTION_NAME), [], 'nor a nav entry with nothing on it')
})

test('a section that never declares its child slot is dropped, rows go to General', function () {
  // A host whose section registration does not declare children at all: the
  // real slot core would throw for an undeclared `renderSlot`, so the plugin
  // must not keep such a section.
  const slots = fakeSlots()
  slots.declare(SECTION_NAME)
  slots.declare(GENERAL_SLOT)
  const broken = sectionOf()
  delete broken.options.children

  const rows = createRows({ slots, section: broken })
  assert.equal(rows.controller.mode, 'flat')
  assert.match(rows.controller.reason(), /did not declare settings\.appearance\.item/)
  assert.equal(rows.warnings.length, 1)
  assert.deepEqual(slots.ids(GENERAL_SLOT), ALL_ROW_IDS)
  assert.deepEqual(slots.entries(SECTION_NAME), [], 'the empty page is not left registered')
})

test('passing no section at all keeps the pre-section flat list', function () {
  const slots = fakeSlots()
  slots.declare(GENERAL_SLOT)
  const rows = createRows({ slots, section: null })
  assert.equal(rows.controller.mode, 'flat')
  assert.match(rows.controller.reason(), /no appearance-section definition/)
  assert.deepEqual(slots.ids(GENERAL_SLOT), ALL_ROW_IDS)
})

test('a host that never declares the section gives up after the bounded wait', function () {
  const slots = fakeSlots()
  slots.declare(GENERAL_SLOT)
  const timers = manualTimers()
  const rows = createRows({ slots, timers, waitMs: SECTION_WAIT_MS })

  assert.equal(rows.controller.mode, 'pending', 'the settings shell may still mount')
  assert.deepEqual(slots.ids(GENERAL_SLOT), [],
    'rows must not be pre-registered into General while the section is still possible')
  assert.equal(timers.pending.size, 1, 'exactly one bounded wait')

  timers.flush()
  assert.equal(rows.controller.mode, 'flat')
  assert.match(rows.controller.reason(), new RegExp('within ' + SECTION_WAIT_MS + 'ms'))
  assert.deepEqual(slots.ids(GENERAL_SLOT), ALL_ROW_IDS)
})

test('a section declared inside the wait cancels it and takes the rows', function () {
  const slots = fakeSlots()
  slots.declare(GENERAL_SLOT)
  const timers = manualTimers()
  const rows = createRows({ slots, timers, waitMs: SECTION_WAIT_MS })
  assert.equal(rows.controller.mode, 'pending')
  assert.equal(timers.pending.size, 1)

  // The settings shell mounts late and declares the key; the fake fires the
  // pending inject callback the way the host's subscribeDeclaration does.
  slots.declare(SECTION_NAME)
  assert.equal(rows.controller.mode, 'section')
  assert.equal(timers.pending.size, 0, 'the wait is cancelled the moment the section mounts')
  assert.equal(rows.warnings.length, 0, 'a healthy host must never warn')
  assert.deepEqual(slots.ids(APPEARANCE_SLOT), APPEARANCE_ROW_IDS)
  assert.deepEqual(slots.ids(GENERAL_SLOT), ['dsh-cds-theme-enabled'])
})

test('a late appearance declaration after the fallback does not double-register', function () {
  const slots = fakeSlots({ refuseRegister: SECTION_NAME })
  slots.declare(GENERAL_SLOT)
  const rows = createRows({ slots })
  assert.equal(rows.controller.mode, 'flat')
  assert.equal(slots.ids(GENERAL_SLOT).length, 14)

  // The host finally declares the child slot; the flat list already owns the
  // rows, so the appearance mount must stay a no-op (duplicate ids would throw
  // inside the outlet).
  assert.doesNotThrow(function () { slots.declare(APPEARANCE_SLOT) })
  assert.equal(slots.ids(GENERAL_SLOT).length, 14, 'still exactly one copy of every row')
  assert.deepEqual(slots.ids(APPEARANCE_SLOT), [])
})

// ---------------------------------------------------------------- parity

test('the appearance copy exists in both locales with identical keys', function () {
  for (const key of ['appearance.nav', 'appearance.intro']) {
    assert.ok(Object.hasOwn(en, key), 'missing en ' + key)
    assert.ok(Object.hasOwn(zh, key), 'missing zh ' + key)
    assert.ok(en[key].trim().length > 0, key + ' en is empty')
    assert.ok(zh[key].trim().length > 0, key + ' zh is empty')
  }
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), 'key parity')
})

test('appearance.nav is a distinct name in both languages', function () {
  // THE COLLISION this pin exists for: the HOST registers a `settings.general.item`
  // with id `appearance` and title 「外观」 / “Appearance” — the light/dark/system
  // cubes (`ui-theme/lib/client.js:2046`). Our section also used to be called
  // 外观/Appearance, so the dialog showed two different “appearance” things.
  assert.equal(zh['appearance.nav'], '主题定制')
  assert.equal(en['appearance.nav'], 'Theme')
  for (const dictionary of [en, zh]) {
    assert.notEqual(dictionary['appearance.nav'], hostAppearanceTitle(dictionary === zh ? 'zh' : 'en'),
      'the nav entry must not read the same as the host light/dark row')
  }
})

test('the intro names light/dark, which now live on this page', function () {
  // The host's cubes used to be unreachable (a foreign registration cannot
  // relocate another entry's contribution), so the copy pointed at 通用. The
  // 主题模式 row now rebuilds them HERE, through the host's own write path, and
  // the stylesheet hides the host's duplicate — so the intro must describe this
  // page instead of redirecting the reader elsewhere.
  assert.ok(zh['appearance.intro'].includes('浅色') && zh['appearance.intro'].includes('深色'),
    'the zh intro names the two palettes it controls')
  assert.match(en['appearance.intro'], /light or dark/i)
  assert.ok(!/仍在「通用」/.test(zh['appearance.intro']),
    'the intro must no longer send the reader to 通用 for the light/dark switch')
  assert.ok(!/stay in General/.test(en['appearance.intro']),
    'the English intro must no longer send the reader to General')
})

// ------------------------------------------------------------- lifecycle

test('dispose removes both the section and every row', function () {
  const slots = fakeSlots()
  slots.declare(SECTION_NAME)
  slots.declare(GENERAL_SLOT)
  const rows = createRows({ slots })
  assert.equal(rows.controller.mode, 'section')
  assert.equal(slots.entries(SECTION_NAME).length, 1)

  rows.controller.dispose()
  assert.deepEqual(slots.entries(SECTION_NAME), [], 'the nav entry is removed')
  assert.deepEqual(slots.entries(APPEARANCE_SLOT), [], 'its rows are removed')
  assert.deepEqual(slots.entries(GENERAL_SLOT), [], 'the master switch is removed')
})

test('dispose of a flat fallback leaves the General list empty', function () {
  const slots = fakeSlots()
  slots.declare(GENERAL_SLOT)
  const rows = createRows({ slots, section: null })
  assert.equal(slots.ids(GENERAL_SLOT).length, 14)
  rows.controller.dispose()
  assert.deepEqual(slots.ids(GENERAL_SLOT), [])
})

test('the bounded wait is cleared on dispose', function () {
  const slots = fakeSlots()
  const timers = manualTimers()
  const rows = createRows({ slots, timers, waitMs: SECTION_WAIT_MS })
  assert.equal(timers.pending.size, 1)
  rows.controller.dispose()
  assert.equal(timers.pending.size, 0, 'no timer may outlive the plugin')
})

// -------------------------------------------------------------- source guard

test('the lifecycle registers the section instead of the flat General list', function () {
  const source = readFileSync(new URL('../client/src/lifecycle.js', import.meta.url), 'utf8')
  assert.ok(source.includes('registerSettingsRows'), 'the lifecycle must delegate placement')
  assert.ok(source.includes('appearanceSectionOptions'), 'it must build the section options')
  assert.ok(source.includes('createAppearanceSection'), 'it must render the section body')
  assert.ok(!/slots\.inject\('settings\.general\.item'/.test(source),
    'the flat registration must go through registerSettingsRows now')
})

test('the panel splits the rows the way the section expects', function () {
  const panel = createRowPanel()
  assert.equal(panel.appearanceSlots.length, 13, 'theme-mode row + thirteen controls')
  assert.equal(panel.generalSlots.length, 1)
  assert.equal(panel.generalSlots[0].id, 'dsh-cds-theme-enabled')
  assert.equal(panel.modeSlot.id, 'dsh-cds-theme-mode')
  assert.equal(panel.modeSlot.order, 10, 'the cube row reads first, like the host row it replaces')
  assert.equal(panel.appearanceSlots.length + panel.generalSlots.length, panel.slots.length)
  // `slots` keeps display order, so the fallback list reads top to bottom.
  const orders = panel.slots.map(function (slot) { return slot.order })
  assert.deepEqual(orders, [10, 18, 19, 22, 24, 26, 29, 30, 39, 43, 44, 45, 46, 47])
})

test('the two verified replication rows are gone from every slot', function () {
  // The user verified 代码块细节 and Markdown 正文, so their switches were deleted
  // and the rules kept. Their ids must not be registered anywhere — a row that
  // came back would be a switch over behaviour that no longer has an off state.
  const panel = createRowPanel()
  const ids = panel.slots.map(function (slot) { return slot.id })
  for (const retired of RETIRED_ROW_IDS) {
    assert.equal(ids.indexOf(retired), -1, retired + ' must not be a registered row any more')
  }
  // And the source no longer defines them either.
  const panelSource = readFileSync(new URL('../client/src/panel.js', import.meta.url), 'utf8')
  for (const retired of RETIRED_ROW_IDS) {
    assert.ok(!panelSource.includes("'" + retired + "'"), retired + ' must be gone from panel.js')
  }
})

test('the rejected row is gone everywhere and its order stays vacated', function () {
  // Every order that ever held a replication row is asserted vacated, because a
  // future row taking one would silently reorder the page against the layout the
  // user reviewed. The reviewed layout is
  // (10, 18, 19, 22, 24, 26, 29, 30, 39).
  //
  // Retired in four waves:
  //   27/28       — the two switches deleted after the user verified them
  //   32          — the segmented-control item the user rejected outright
  //   31/34/35/38 — the four rows whose effects could not be seen
  //   33/36/37    — the three rows solidified into unconditional rules
  //   42          — the hero-compaction switch, retired with its runtime
  const panel = createRowPanel()
  const orders = panel.slots.map(function (slot) { return slot.order })
  assert.equal(orders.indexOf(27), -1, 'order 27 is retired with code-block-details')
  assert.equal(orders.indexOf(28), -1, 'order 28 is retired with markdown-body')
  assert.equal(orders.indexOf(32), -1,
    'order 32 is retired with the segmented-control item the user rejected')
  for (const dropped of [31, 34, 35, 38]) {
    assert.equal(orders.indexOf(dropped), -1,
      'order ' + dropped + ' is retired with a row whose effect could not be seen')
  }
  for (const solidified of [33, 36, 37]) {
    assert.equal(orders.indexOf(solidified), -1,
      'order ' + solidified + ' is retired with a row that became an unconditional rule')
  }
  assert.equal(orders.indexOf(42), -1,
    'order 42 is retired with the hero-compaction switch')
  // 40 and 41 belong to dsh-usage-stats on this same page. They are deliberately
  // NOT asserted vacated here: usage-stats is free to renumber its own rows, and
  // a vacancy assertion in this plugin would block that for no reason. What this
  // plugin must assert is only that it does not TAKE them.
  for (const theirs of [40, 41]) {
    assert.equal(orders.indexOf(theirs), -1, 'order ' + theirs + ' is not ours to take')
  }

  // The rejection was complete: the row, its state key and its rules are gone —
  // not merely switched off.
  assert.equal(
    panel.slots.some(function (slot) { return slot.id === 'dsh-cds-theme-segmented-thumb' }),
    false, 'the segmented-control row must not be registered')
  const panelSource = readFileSync(new URL('../client/src/panel.js', import.meta.url), 'utf8')
  assert.ok(!panelSource.includes('dsh-cds-theme-segmented-thumb'))
  assert.ok(!panelSource.includes('segmentedThumb'))
  const stylesSource = readFileSync(new URL('../client/src/styles.js', import.meta.url), 'utf8')
  assert.ok(!stylesSource.includes('segmentedThumbRules'), 'the rule function must be deleted')
  assert.ok(!stylesSource.includes('data-conversation-tabs'),
    'no rule may still target the Chat / Trajectory tabs')
  assert.equal(Object.hasOwn(sanitize({}), 'segmentedThumb'), false, 'it is not state any more')
})
