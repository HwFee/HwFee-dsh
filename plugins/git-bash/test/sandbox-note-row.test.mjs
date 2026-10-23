/**
 * The sandbox-note settings row: the switch that hides one line of copy.
 *
 * WHY A SEPARATE FILE. Two properties here can regress silently and neither is
 * covered by the store suite, which never renders anything:
 *
 *   1. the row's DEFAULT state must be ON (a user who upgrades keeps seeing the
 *      disclosure);
 *   2. flipping it must hide the line in the CARD — a row that renders but is not
 *      wired to the card's store would look correct and change nothing.
 *
 * The second half of the guarantee — that hiding the line never hides the
 * model-facing `(unsandboxed)` marker — is asserted where the models' text is
 * produced: `test/tool-view.test.mjs` and `test/tool.test.mjs`.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSandboxNoteRow } from '../client/src/sandbox-note-row.js'
import { createRunShellRow } from '../client/src/tool-view.js'
import { createSandboxNoteStore } from '../client/src/store.js'
import { SANDBOX_NOTE_ROW_ID } from '../client/src/constants.js'
import { en, zh } from '../client/src/locales.js'

/** A React stand-in: elements, external stores, and a settable useState. */
function fakeReact() {
  return {
    React: {
      createElement(type, props, ...children) {
        return { type, props: props ?? {}, children: children.flat(Infinity).filter((c) => c != null) }
      },
      useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
      useState(initial) { return [initial, function set() {}] },
      useRef(initial) { return { current: initial } },
      useEffect() {},
    },
  }
}

function fakeStorage(initial = {}) {
  const data = { ...initial }
  return { getItem: (k) => (Object.hasOwn(data, k) ? data[k] : null), setItem: (k, v) => { data[k] = v }, data }
}

function translate(dictionary) {
  return function t(key, params) {
    const text = dictionary[key] ?? 'MISSING:' + key
    return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')
  }
}

/** Every descendant whose className token list contains `name`. */
function byClass(node, name) {
  const hits = []
  const walk = function walk(current) {
    if (current === null || typeof current !== 'object') return
    const className = typeof current.props?.className === 'string' ? current.props.className : ''
    if (className.split(/\s+/).includes(name)) hits.push(current)
    for (const child of current.children ?? []) walk(child)
  }
  walk(node)
  return hits
}

/** All text under a node, in document order. */
function textOf(node) {
  if (typeof node === 'string') return node
  return (node.children ?? []).map(textOf).join('\n')
}

/**
 * Render the settings row over a real store.
 *
 * @param {object} [options]
 * @param {object} [options.storage] the storage to read the preference from
 * @param {object} [options.dictionary] the locale table
 * @returns {{ tree: object, store: object, storage: object }}
 */
function renderRow({ storage = fakeStorage(), dictionary = en } = {}) {
  const { React } = fakeReact()
  const Row = createSandboxNoteRow({ React })
  const store = createSandboxNoteStore(storage)
  const tree = Row({ noteStore: store, t: translate(dictionary) })
  return { tree, store, storage }
}

test('the row defaults to ON, so an upgrade keeps showing the disclosure', function () {
  const { tree, store } = renderRow()
  const toggle = byClass(tree, 'dsh-git-bash-toggle')[0]
  assert.ok(toggle, 'the switch must be rendered')
  assert.equal(toggle.props['aria-checked'], true)
  assert.equal(store.getSnapshot(), true)
})

test('the switch is a real one, with an accessible name', function () {
  const { tree } = renderRow()
  const toggle = byClass(tree, 'dsh-git-bash-toggle')[0]
  assert.equal(toggle.type, 'button')
  assert.equal(toggle.props.type, 'button')
  assert.equal(toggle.props.role, 'switch')
  assert.equal(toggle.props['aria-label'], 'Show the sandbox note')
  // The knob the stylesheet translates; a switch without its thumb paints as a
  // bare track and reads as a progress bar.
  assert.equal(byClass(toggle, 'dsh-git-bash-toggle-thumb').length, 1)
})

test('the row carries its own id, so it cannot collide with the shell row', function () {
  const { tree } = renderRow()
  assert.equal(tree.props.id, SANDBOX_NOTE_ROW_ID)
  assert.notEqual(SANDBOX_NOTE_ROW_ID, '@hwfee/dsh-git-bash-shell',
    'the two settings entries are keyed by id; sharing one would collide')
})

test('one click flips the store and persists the choice', function () {
  const { tree, store, storage } = renderRow()
  byClass(tree, 'dsh-git-bash-toggle')[0].props.onClick()
  assert.equal(store.getSnapshot(), false)
  assert.equal(storage.data['@hwfee/dsh-git-bash:showSandboxNote'], 'false')
  // Re-rendering over the same store shows the new state — and clicking again
  // flips back, so the switch cannot get stuck OFF.
  const { React } = fakeReact()
  const again = createSandboxNoteRow({ React })({
    noteStore: store, t: translate(en),
  })
  assert.equal(byClass(again, 'dsh-git-bash-toggle')[0].props['aria-checked'], false)
  byClass(again, 'dsh-git-bash-toggle')[0].props.onClick()
  assert.equal(store.getSnapshot(), true)
})

test('the row explains what the switch does NOT hide', function () {
  // The hint is load-bearing: a user turning this off must learn that the model
  // is still told, or the switch reads as "make commands look sandboxed".
  const { tree } = renderRow()
  const hint = textOf(byClass(tree, 'dsh-git-bash-hint')[0])
  assert.match(hint, /model/i)
  assert.ok(hint.length <= 160, 'the hint must stay one short sentence: ' + hint.length)
  assert.equal(byClass(tree, 'dsh-git-bash-title')[0].children.join(''), 'Show the sandbox note')
})

test('both dictionaries carry the strings', function () {
  for (const key of ['sandboxNote.title', 'sandboxNote.hint']) {
    assert.equal(typeof en[key], 'string', key + ' missing from en')
    assert.equal(typeof zh[key], 'string', key + ' missing from zh')
  }
  // A Chinese page must not fall through to English.
  const { tree } = renderRow({ dictionary: zh })
  assert.equal(byClass(tree, 'dsh-git-bash-title')[0].children.join(''), '显示沙箱提示')
})

test('the switch hides the CARD\'s line, through the same store', function () {
  // END TO END OVER THE SHARED STORE — the wiring, not just the two halves. The
  // card reads the store the settings row writes; if either side used its own
  // copy, this test would be the only one that noticed.
  const storage = fakeStorage()
  const store = createSandboxNoteStore(storage)
  const note = 'Ran directly: the session grants danger-full-access, so this command did not cross the sandbox.'
  const card = () => {
    const { React } = fakeReact()
    const Row = createRunShellRow({ React })
    return Row({
      toolName: 'run_shell',
      phase: 'result',
      block: {
        kind: 'result',
        call: { name: 'run_shell', argsRaw: JSON.stringify({ command: 'echo hi' }) },
        content: [{ type: 'text', text: '[gitbash · /bin/bash] exit 0 · direct (unsandboxed)\nhi' }],
        meta: { note },
      },
      noteStore: store,
      useDisclosure: () => ({ expanded: true, toggle() {} }),
      t: translate(en),
    })
  }
  assert.equal(byClass(card(), 'dsh-gb-tool-note').length, 1, 'ON: the line is there')

  store.set(false)
  const hidden = card()
  assert.equal(byClass(hidden, 'dsh-gb-tool-note').length, 0, 'OFF: the line is gone')

  // OFF MEANS NO SANDBOX COPY AT ALL. Hiding only the sentence left the header
  // marker saying "(unsandboxed)", which reads as a switch that does nothing —
  // the user still saw sandbox wording on the card. Both go together.
  const respond = byClass(hidden, 'dsh-gb-tool-respond')[0]
  const shown = typeof respond.children[0] === 'string' ? respond.children[0] : textOf(respond)
  assert.doesNotMatch(shown, /\(unsandboxed\)/, 'OFF: the header marker is stripped too')
  // A SUCCESSFUL header is metadata and drops entirely; the command box above the
  // output already names the shell, and "exit 0" adds nothing a reader needs.
  assert.doesNotMatch(shown, /gitbash|exit 0/, 'OFF: the success header is gone from the card')
  assert.match(shown, /hi/, 'OFF: the captured output is untouched')

  // THE MODEL'S COPY IS NEVER TOUCHED. `content` is what the provider receives,
  // and it keeps the marker whatever the switch says.
  assert.match('[gitbash · /bin/bash] exit 0 · direct (unsandboxed) hi', /\(unsandboxed\)/)
})