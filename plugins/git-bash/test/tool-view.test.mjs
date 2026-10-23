/**
 * The `run_shell` tool card: pure pieces and the row's own tree.
 *
 * The React view itself is exercised on the real renderer (screenshots under
 * `.work/shots/toolrows/`); what can be pinned in Node is the part that decides
 * WHAT the card says — the tokenizer, the argument reader and the result
 * flattener — plus the SHAPE of the expanded body, which is where the
 * trajectory entrance lives.
 *
 * THE ROW IS RENDERED WITH A MINIMAL REACT STAND-IN, the same way
 * `settings-row.test.mjs` does it. The fake implements only `createElement` and
 * the three hooks the copy control reaches for, so if the row starts relying on
 * anything else these tests fail loudly instead of silently exercising a
 * different React. Function components are invoked by the local `render` helper;
 * hooks are never actually mounted, which is enough to read the tree.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tokenizeShell, readArguments, resultText, displayText, sandboxNote, createRunShellRow } from '../client/src/tool-view.js'
import { en, zh } from '../client/src/locales.js'

test('the command name, its flags and its arguments get different colours', function () {
  const tokens = tokenizeShell('grep -rn "box-shadow" src')
  const kinds = tokens.filter(function (token) { return token.kind !== 'plain' }).map(function (token) {
    return token.kind + ':' + token.text
  })
  assert.deepEqual(kinds, ['command:grep', 'flag:-rn', 'string:"box-shadow"', 'arg:src'])
})

test('a pipe starts a new command word', function () {
  const tokens = tokenizeShell('ls | head -3')
  const kinds = tokens.filter(function (token) { return token.kind !== 'plain' }).map(function (token) {
    return token.kind + ':' + token.text
  })
  assert.deepEqual(kinds, ['command:ls', 'operator:|', 'command:head', 'flag:-3'])
})

test('`&&` and `;` both reset the command position', function () {
  const tokens = tokenizeShell('cd x && pwd; echo done')
  const commands = tokens.filter(function (token) { return token.kind === 'command' }).map(function (token) { return token.text })
  assert.deepEqual(commands, ['cd', 'pwd', 'echo'])
})

test('an empty or malformed command yields no tokens', function () {
  assert.deepEqual(tokenizeShell(''), [])
  assert.deepEqual(tokenizeShell(undefined), [])
  assert.deepEqual(tokenizeShell(null), [])
})

test('arguments parse only when they are complete JSON', function () {
  assert.deepEqual(readArguments('{"command":"ls","description":"List"}'), { command: 'ls', description: 'List' })
  // A partially streamed payload is NOT an argument object yet.
  assert.equal(readArguments('{"command":"ls'), null)
  assert.equal(readArguments(''), null)
  assert.equal(readArguments(undefined), null)
})

test('the result flattens text blocks, JSON blocks and a bare error', function () {
  assert.equal(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'a\nb')
  assert.equal(resultText({ content: [{ type: 'image', data: 'x' }] }), '{\n  "type": "image",\n  "data": "x"\n}')
  // No content at all on a failed call still renders the structured reason.
  assert.equal(resultText({ content: [], error: { name: 'HarnessError', code: 'E_SHELL' } }), 'HarnessError: E_SHELL')
  assert.equal(resultText({ content: [] }), '')
})

// ---------------------------------------------------------------- the row

/** A React stand-in covering what the shell row reaches for. */
function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child != null) }
    },
    useState(initial) { return [initial, function set() {}] },
    useRef(initial) { return { current: initial } },
    useEffect() {},
    // The note line's visibility comes from a store, so the stand-in has to
    // answer like `useSyncExternalStore` — read the snapshot, ignore subscribing.
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
  }
}

/** `t` with the host's `{param}` interpolation, missing keys made obvious. */
function translate(dictionary) {
  return function t(key, params) {
    const text = dictionary[key] ?? 'MISSING:' + key
    return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')
  }
}

/**
 * Expand function components so the tree carries real host elements.
 *
 * @param {object} node an element, an array or a string
 * @returns {object} the same node with component children resolved
 */
function render(node) {
  if (Array.isArray(node)) return node.map(render)
  if (node === null || typeof node !== 'object') return node
  if (typeof node.type === 'function') {
    const expanded = node.type(node.props)
    return render(expanded)
  }
  return { type: node.type, props: node.props, children: render(node.children) }
}

/** Every descendant node whose className token list contains `name`. */
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

/** The first descendant carrying an attribute. */
function byAttr(node, name) {
  let hit = null
  const walk = function walk(current) {
    if (hit !== null || current === null || typeof current !== 'object') return
    if (current.props?.[name] !== undefined) { hit = current; return }
    for (const child of current.children ?? []) walk(child)
  }
  walk(node)
  return hit
}

/**
 * Render the card for one call.
 *
 * @param {object} [options]
 * @param {boolean} [options.expanded] the disclosure state
 * @param {boolean} [options.disclosure] whether the host forwards `useDisclosure`
 * @param {Function} [options.inspect] the host's trajectory callback
 * @param {object} [options.dictionary] the locale table (`en` by default)
 * @param {object} [options.meta] the settled result's `data.meta`
 * @param {object} [options.noteStore] the showSandboxNote store
 * @returns {object} the rendered tree
 */
function renderCard({ expanded = true, disclosure = true, inspect, dictionary = en, meta, noteStore } = {}) {
  const React = fakeReact()
  const RunShellRow = createRunShellRow({ React })
  const toggleCalls = []
  const tree = RunShellRow({
    toolName: 'run_shell',
    phase: 'result',
    block: {
      kind: 'result',
      call: { name: 'run_shell', argsRaw: JSON.stringify({ command: 'git status --short' }) },
      content: [{ type: 'text', text: ' M client/src/styles.js' }],
      ...(meta === undefined ? {} : { meta }),
    },
    ...(noteStore === undefined ? {} : { noteStore }),
    ...(disclosure
      ? {
        useDisclosure: function useDisclosure() {
          return {
            expanded,
            toggle: function toggle() { toggleCalls.push('toggle') },
          }
        },
      }
      : {}),
    ...(inspect === undefined ? {} : { inspect }),
    t: translate(dictionary),
  })
  return { tree: render(tree), toggleCalls }
}

/** A store that answers one fixed value and ignores subscribers. */
function fixedStore(shown) {
  const writes = []
  return {
    writes,
    getSnapshot: () => shown,
    subscribe: () => () => {},
    set: (next) => writes.push(next),
  }
}

const NOTE = 'Ran directly: the session grants danger-full-access, so this command did not cross the sandbox.'

test('the expanded card carries the host trajectory entrance in the command box', function () {
  const calls = []
  const { tree } = renderCard({ inspect: function inspect() { calls.push('inspect') } })
  const request = byClass(tree, 'dsh-gb-tool-request')[0]
  assert.ok(request, 'the command box must be rendered')

  const buttons = byClass(tree, 'dsh-gb-inspect')
  assert.equal(buttons.length, 1, 'exactly one trajectory entrance per card')
  // INSIDE THE COMMAND BOX, not under the card: it floats over the fence beside
  // the copy control, so it adds no row and no height.
  assert.ok(request.children.includes(buttons[0]),
    'the entrance must be a child of the command box, not a sibling of it')

  buttons[0].props.onClick()
  assert.deepEqual(calls, ['inspect'], 'the click must reach the host callback')
})

test('the entrance is absent when the host offers no inspect callback', function () {
  // Older hosts, and any card rendered outside a trajectory-aware tree, pass
  // nothing. A button that does nothing is worse than no button.
  const { tree } = renderCard({})
  assert.deepEqual(byClass(tree, 'dsh-gb-inspect'), [])
  assert.equal(byAttr(tree, 'data-cds-tool-inspect'), null)
})

test('the entrance is absent while the row is collapsed', function () {
  const { tree } = renderCard({ expanded: false, inspect: function inspect() {} })
  assert.deepEqual(byClass(tree, 'dsh-gb-tool-body'), [], 'a collapsed row renders no body')
  assert.deepEqual(byClass(tree, 'dsh-gb-inspect'), [])
})

test('the entrance disappears when the host forwards no disclosure control', function () {
  // Without `useDisclosure` the row has no body at all, so there is nowhere for
  // the entrance to sit — and rendering it would put a control on a header that
  // cannot be opened.
  const { tree } = renderCard({ disclosure: false, inspect: function inspect() {} })
  assert.deepEqual(byClass(tree, 'dsh-gb-inspect'), [])
})

test('the entrance is a labelled, theme-hookable glyph', function () {
  const { tree } = renderCard({ inspect: function inspect() {} })
  const button = byClass(tree, 'dsh-gb-inspect')[0]
  // The stable hook the shared tool chrome keys on, present whether or not the
  // theme is installed.
  assert.equal(button.props['data-cds-tool-inspect'], '')
  assert.equal(button.props.type, 'button')
  assert.equal(button.props.title, 'View in trajectory')
  assert.equal(button.props['aria-label'], 'View in trajectory')

  const svg = button.children[0]
  assert.equal(svg.type, 'svg')
  assert.equal(svg.props.viewBox, '0 0 16 16')
  assert.equal(svg.props.width, 12)
  assert.equal(svg.props.height, 12)
  assert.equal(svg.props['aria-hidden'], 'true')
  const path = svg.children[0]
  assert.equal(path.props.d,
    'M6.5 2.5H3a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V9.5M9 2.5h4.5V7M13.5 2.5l-7 7')
  assert.equal(path.props.stroke, 'currentColor')
  assert.equal(path.props.strokeWidth, 1.2)
  assert.equal(path.props.strokeLinecap, 'round')
  assert.equal(path.props.strokeLinejoin, 'round')
  assert.equal(path.props.fill, 'none')
})

test('the entrance label follows the page language', function () {
  const english = byClass(renderCard({ inspect: function inspect() {} }).tree, 'dsh-gb-inspect')[0]
  assert.equal(english.props['aria-label'], 'View in trajectory')
  const chinese = byClass(renderCard({ inspect: function inspect() {}, dictionary: zh }).tree, 'dsh-gb-inspect')[0]
  assert.equal(chinese.props['aria-label'], '在轨迹中查看')
  // Both dictionaries must carry the key: a missing `zh` entry falls through to
  // English inside a Chinese page.
  assert.equal(typeof en['run.inspect'], 'string')
  assert.equal(typeof zh['run.inspect'], 'string')
})

// ------------------------------------------------------- the sandbox note

test('sandboxNote reads meta.note and ignores everything else', function () {
  // The sentence arrives as data.meta, never as content — that is the change
  // that took it out of the model's context.
  assert.equal(sandboxNote({ meta: { note: '  hello  ' } }), 'hello')
  assert.equal(sandboxNote({ meta: { note: 42 } }), '')
  assert.equal(sandboxNote({ meta: null }), '')
  assert.equal(sandboxNote({ meta: 'note' }), '', 'a string meta is not an object of fields')
  assert.equal(sandboxNote({}), '')
  assert.equal(sandboxNote(null), '')
})

test('the card renders the sandbox note from meta, on its own line', function () {
  const { tree } = renderCard({ meta: { note: NOTE } })
  const note = byClass(tree, 'dsh-gb-tool-note')
  assert.equal(note.length, 1)
  assert.equal(note[0].children.join(''), NOTE)
  // A hook the E2E probes and the theme can both key on.
  assert.equal(note[0].props['data-sandbox-note'], '')
  // Under the output, inside the body: it is a remark about the result, so it
  // must not be painted as captured output (that is `.dsh-gb-tool-respond`).
  assert.deepEqual(byClass(tree, 'dsh-gb-tool-respond').length, 1)
})

test('no meta means no note line at all', function () {
  // A delegated `pwsh` result crosses the sandbox; it carries no note, and an
  // empty row under every command would be noise on the majority of cards.
  const { tree } = renderCard({})
  assert.deepEqual(byClass(tree, 'dsh-gb-tool-note'), [])
})

test('THE PREFERENCE HIDES ALL SANDBOX COPY ON THE CARD, NEVER THE MODEL MARKER', function () {
  // THE MOST IMPORTANT ASSERTION IN THIS FILE. Turning the switch off removes
  // every sandbox word the user can see: the note line AND the `(unsandboxed)`
  // marker in the header. Hiding only the note left the header saying
  // "unsandboxed", which reads as a switch that does nothing.
  //
  // The model is unaffected: its disclosure lives in `content`, which is what the
  // provider receives, and no store is consulted there.
  const shown = renderCard({ meta: { note: NOTE }, noteStore: fixedStore(true) }).tree
  assert.equal(byClass(shown, 'dsh-gb-tool-note').length, 1, 'default ON shows the line')

  const hidden = renderCard({ meta: { note: NOTE }, noteStore: fixedStore(false) }).tree
  assert.deepEqual(byClass(hidden, 'dsh-gb-tool-note'), [], 'OFF hides the line')

  // THE HEADER LINE IS METADATA AND IS GONE FROM THE CARD. `[gitbash · …] exit 0`
  // tells the MODEL which shell ran the command and whether it succeeded; the
  // reader sees the shell in the command box and a failure in the error state plus
  // stderr. So a successful header is dropped for everyone, whatever the switch.
  const header = '[gitbash · /bin/bash] exit 0 · direct (unsandboxed)\nok'
  for (const shownSwitch of [true, false]) {
    const card = displayText({ content: [{ type: 'text', text: header }] }, shownSwitch)
    assert.equal(card, 'ok', 'the success header must not reach the card')
    assert.doesNotMatch(card, /unsandboxed/i)
  }

  // A NON-ZERO EXIT STAYS. Hiding "exit 1" would make a failed command look like it
  // produced exactly what is on screen — the one thing a result card must not do.
  const failed = '[gitbash · /bin/bash] exit 1 · direct (unsandboxed)\nboom'
  assert.match(displayText({ content: [{ type: 'text', text: failed }] }, true),
    /^\[gitbash · \/bin\/bash\] exit 1/, 'a failure keeps its exit status')
  assert.doesNotMatch(displayText({ content: [{ type: 'text', text: failed }] }, false), /unsandboxed/i,
    'the switch still governs the sandbox words on a failure line')

  // The model's copy is byte-identical in every case.
  assert.match(resultText({ content: [{ type: 'text', text: header }] }), /exit 0 · direct \(unsandboxed\)/)
})

test('an absent preference store shows the line', function () {
  // An older host, or a card outside the settings tree, passes no store. The
  // default direction for a disclosure is SHOWN — the same reading a missing
  // storage key gets in createSandboxNoteStore.
  const { tree } = renderCard({ meta: { note: NOTE } })
  assert.equal(byClass(tree, 'dsh-gb-tool-note').length, 1)
})
