/**
 * The settings row's rendering, driven with a minimal React stand-in.
 *
 * WHY THIS FILE EXISTS. The row is the only place a user can see what `auto`
 * chose, and it had already drifted twice while every other test stayed green:
 * once it read the boot-time record so the status line contradicted the menu,
 * and once it hid the path whenever resolution succeeded, which made the mode
 * unverifiable. Both were invisible to the store and resolver suites because
 * neither renders a component.
 *
 * The fake below implements only the three React calls the row makes. That is
 * deliberate: if the row starts relying on anything else, these tests fail
 * loudly rather than silently exercising a different React.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const base = new URL('../client/src/', import.meta.url)
const { createSettingsRow } = await import(new URL('settings-row.js', base))
const { createModeStore, createShellInfoStore, SHELL_GLOBAL } = await import(new URL('store.js', base))
const { en } = await import(new URL('locales.js', base))

/** A React stand-in: elements, external stores, and a settable useState. */
function fakeReact() {
  const state = { value: undefined, setter: null }
  return {
    state,
    React: {
      createElement(type, props, ...children) {
        return { type, props: props ?? {}, children: children.flat(Infinity).filter((c) => c != null) }
      },
      useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
      useState(initial) { state.value = initial; return [initial, (next) => { state.setter = next }] },
    },
  }
}

const primitives = {
  Menu: function Menu() {},
  MenuItemButton: function MenuItemButton() {},
  IconChevronDownOutlineRegular: function Chevron() {},
  IconCheckOutlineRegular: function Check() {},
}

/** Locale lookup with `{param}` interpolation, like the host's `t`. */
function translate(key, params) {
  const text = en[key] ?? 'MISSING:' + key
  return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')
}

/** The injected payload a current host sends: all three modes. */
const BY_MODE = {
  auto: { mode: 'auto', path: 'C:/Program Files/Git/bin/bash.exe', kind: 'gitbash', source: 'git --exec-path (auto)', reason: null },
  pwsh: { mode: 'pwsh', path: 'C:/Program Files/PowerShell/7/pwsh.exe', kind: 'pwsh', source: 'known path', reason: null },
  gitbash: { mode: 'gitbash', path: 'C:/Program Files/Git/bin/bash.exe', kind: 'gitbash', source: 'git --exec-path', reason: null },
}

/**
 * Render the row for one mode.
 *
 * @param {string} mode the stored mode
 * @param {object} [payload] the injected global's value
 */
function render(mode, payload = { byMode: BY_MODE }) {
  const { React } = fakeReact()
  const Row = createSettingsRow({ React, primitives })
  const storage = { data: { '@hwfee/dsh-git-bash:mode': mode }, getItem(k) { return this.data[k] ?? null }, setItem(k, v) { this.data[k] = v } }
  const writes = []
  const tree = Row({
    modeStore: createModeStore(storage),
    shellInfoStore: createShellInfoStore({ [SHELL_GLOBAL]: payload }),
    setMode: (value) => writes.push(value),
    t: translate,
  })
  return { tree, writes }
}

/** All text under a node, in document order. */
function textOf(node) {
  if (typeof node === 'string') return node
  return (node.children ?? []).map(textOf).join('\n')
}

/** Find the first descendant whose className contains `name`. */
function byClass(node, name) {
  if (typeof node === 'string') return null
  if (typeof node.props?.className === 'string' && node.props.className.split(/\s+/).includes(name)) return node
  for (const child of node.children ?? []) {
    const hit = byClass(child, name)
    if (hit !== null) return hit
  }
  return null
}

/**
 * The trigger button.
 *
 * It is NOT a child: `Menu` takes it as its `anchor` PROP and renders it itself
 * (passing an already-rendered node made it appear twice). So a test that only
 * walks children never sees the control the user clicks.
 */
function triggerOf(tree) {
  const menu = tree.children.find((child) => typeof child.type === 'function')
  return menu.props.anchor
}

test('the row offers exactly the three modes, in order', function () {
  const { tree } = render('auto')
  const menu = tree.children.find((child) => typeof child.type === 'function')
  const items = menu.children.map((item) => textOf(item).split('\n')[0]).filter((text) => text !== '')
  assert.deepEqual(items, ['Automatic', 'Windows PowerShell', 'Git Bash'])
})

test('the trigger states the current mode', function () {
  assert.equal(textOf(byClass(triggerOf(render('auto').tree), 'dsh-git-bash-value')), 'Automatic')
  assert.equal(textOf(byClass(triggerOf(render('pwsh').tree), 'dsh-git-bash-value')), 'Windows PowerShell')
  assert.equal(textOf(byClass(triggerOf(render('gitbash').tree), 'dsh-git-bash-value')), 'Git Bash')
})

test('the trigger is the menu anchor, so it is not rendered twice', function () {
  // The duplicated-row bug: the host's `Menu` renders `anchor` itself, so an
  // anchor that we ALSO put in the tree shows the control twice.
  const tree = render('auto').tree
  assert.equal(byClass(tree, 'dsh-git-bash-trigger'), null,
    'the trigger must exist only inside the Menu anchor prop')
  assert.ok(triggerOf(tree) !== undefined && triggerOf(tree) !== null)
})

test('a successful resolution adds NO second line', function () {
  // ONE LINE, as asked. The path repeated what the choice implies and read like
  // a diagnostic; the tool result names the executable per call, which is where
  // that fact matters. This is the counterpart of the failure test below: the
  // row grows a second line ONLY when something is wrong.
  const tree = render('auto').tree
  assert.equal(byClass(tree, 'dsh-git-bash-status'), null,
    'no status line while the shell resolved')
  const text = textOf(tree)
  assert.doesNotMatch(text, /bash\.exe/, 'and no path anywhere in the row')
  assert.match(text, /Automatic/, 'the mode is still stated, by the trigger')
})

test('the hint stays to one short line', function () {
  // The earlier version carried a paragraph explaining what `auto` resolved to;
  // a settings row is not the place for it.
  const hint = textOf(byClass(render('auto').tree, 'dsh-git-bash-hint'))
  assert.ok(hint.length <= 60, `the hint is too long (${hint.length}): ${hint}`)
})

test('a failed resolution explains itself and is marked as an error', function () {
  const payload = {
    byMode: {
      ...BY_MODE,
      gitbash: { mode: 'gitbash', path: null, kind: null, source: null, reason: 'gitbash-not-found' },
    },
  }
  const tree = render('gitbash', payload).tree
  const status = byClass(tree, 'dsh-git-bash-status')
  assert.ok(status.props.className.includes('dsh-git-bash-missing'),
    'a failure must be visually distinct from a resolved shell')
  assert.match(textOf(status), /Git Bash not found/)
  assert.match(textOf(status), /DSH_GIT_BASH/, 'and must name the fix')
})

test('a failure shows the reason, not a substitute shell', function () {
  // `gitbash` missing is not a condition to work around: the STATUS LINE says it
  // failed rather than presenting a fallback, matching the tool's refusal to run
  // in any other shell. (The menu still lists every mode — that is the choice,
  // not a claim about this machine.)
  const payload = { byMode: { ...BY_MODE, gitbash: { mode: 'gitbash', path: null, kind: null, source: null, reason: 'gitbash-not-found' } } }
  const status = textOf(byClass(render('gitbash', payload).tree, 'dsh-git-bash-status'))
  assert.doesNotMatch(status, /PowerShell/)
  assert.doesNotMatch(status, /bash\.exe/, 'no path may appear for a shell that was not found')
})

test('an older payload with a single record still renders', function () {
  // A page served just before an upgrade injects the old shape. It must degrade
  // to the same decisions, not throw or render an empty row — and a resolved
  // record still means no second line.
  const { tree } = render('auto', { mode: 'auto', path: '/usr/bin/bash', kind: 'posix-bash', source: 'PATH (auto)', reason: null })
  assert.equal(byClass(tree, 'dsh-git-bash-status'), null)
  assert.match(textOf(tree), /Automatic/)
})

test('a missing global renders the failure line rather than crashing', function () {
  // The exception to "one line": no global means no resolution, which is a
  // failure, and the sentence is the whole point of the row then.
  const { React } = fakeReact()
  const Row = createSettingsRow({ React, primitives })
  const storage = { data: {}, getItem: () => null, setItem: () => {} }
  const tree = Row({
    modeStore: createModeStore(storage),
    shellInfoStore: createShellInfoStore({}),
    setMode: () => {},
    t: translate,
  })
  assert.match(textOf(byClass(tree, 'dsh-git-bash-status')), /No shell resolved/)
})

test('choosing a mode calls the writer with the value', function () {
  const { tree, writes } = render('auto')
  const menu = tree.children.find((child) => typeof child.type === 'function')
  for (const item of menu.children) item.props.onSelect()
  assert.deepEqual(writes, ['auto', 'pwsh', 'gitbash'])
})

test('without the host primitives the row degrades to a native select', function () {
  // A settings page that throws takes the whole section with it, so the control
  // must survive a host without `Menu`.
  const { React } = fakeReact()
  const Row = createSettingsRow({ React, primitives: null })
  const tree = Row({
    modeStore: createModeStore({ data: {}, getItem: () => null, setItem: () => {} }),
    shellInfoStore: createShellInfoStore({ [SHELL_GLOBAL]: { byMode: BY_MODE } }),
    setMode: () => {},
    t: translate,
  })
  const select = byClass(tree, 'dsh-git-bash-select')
  assert.ok(select !== null, 'the fallback control must exist')
  assert.deepEqual(select.children.map((option) => option.props.value), ['auto', 'pwsh', 'gitbash'])
})
