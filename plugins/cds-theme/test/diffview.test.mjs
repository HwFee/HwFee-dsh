/**
 * The rendered diff card: rows, gutters, states and the expander.
 *
 * These are DOM-level assertions on the element tree the component returns, not
 * on the model: the model can be right while the card prints the wrong number
 * or renders no rows at all. The fake React evaluates components during
 * `createElement`, which is enough to walk the tree the host would mount.
 *
 *   node test/diffview.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createDiffView, buildDiffModel, diffText, LINE_LIMIT, displayPath, baseName,
  callPath, scanArgumentPath, rowTarget,
} from '../client/src/diffview.js'
import { makeT, makeTranslator, zh } from '../client/src/locales.js'

// ---------------------------------------------------------------- harness

function fakeReact() {
  return {
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      if (typeof type === 'function') {
        return type(Object.assign({}, props || {}, { children }))
      }
      return { type, props: props || {}, children }
    },
    useMemo(fn) { return fn() },
    useState(initial) { return [typeof initial === 'function' ? initial() : initial, function noop() {}] },
    useEffect() {},
  }
}

/** Render one block through the registered component. */
function render(block, options) {
  const view = createDiffView({ React: fakeReact() })
  const config = options || {}
  return view({
    block,
    toolName: config.toolName || 'edit',
    cwd: config.cwd,
    t: config.t,
    inspect: config.inspect,
    useDisclosure: function useDisclosure() {
      return { expanded: config.expanded !== false, toggle: function toggle() {} }
    },
  })
}

/** Every node in the tree whose props carry `hook`. */
function findAll(node, hook) {
  const out = []
  const walk = function (current) {
    if (current === null || typeof current !== 'object') return
    if (Array.isArray(current)) { current.forEach(walk); return }
    if (current.props !== undefined && Object.hasOwn(current.props, hook)) out.push(current)
    for (const child of current.children || []) walk(child)
  }
  walk(node)
  return out
}

/** Concatenated text of a node. */
function flat(node) {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(flat).join('')
  if (node === null || typeof node !== 'object') return ''
  return (node.children || []).map(flat).join('')
}

/** The rows of one rendered card: `{ kind, number, text }` in document order. */
function rows(tree) {
  return findAll(tree, 'data-cds-diff-row').map(function (node) {
    return {
      kind: node.props['data-kind'],
      number: flat(node.children[0]),
      text: flat(node.children[2]),
    }
  })
}

/** A settled `edit` result carrying one metadata hunk. */
function editBlock(hunk, extra) {
  return Object.assign({
    kind: 'tool-result',
    call: {
      name: 'edit',
      argsRaw: JSON.stringify({ file_path: 'C:\\work\\src\\a.js', old_string: 'x', new_string: 'y' }),
    },
    content: [{ type: 'text', text: 'Edited a.js' }],
    isError: false,
    error: null,
    meta: { path: 'C:\\work\\src\\a.js', diffs: [hunk] },
  }, extra)
}

const THREE_LINES = { path: 'C:\\work\\src\\a.js', oldText: 'a\nb\nc', newText: 'a\nB\nc' }

test('trace control keeps the Host callback, stays beside copy, and respects disclosure/availability', () => {
  let calls = 0
  const inspect = () => { calls++ }
  const tree = render(editBlock(THREE_LINES), { inspect })
  const button = findAll(tree, 'data-cds-tool-inspect')[0]
  assert.equal(button.props['aria-label'], 'View in trajectory')
  button.props.onClick()
  assert.equal(calls, 1)
  assert.ok(tree.children.includes(button))
  assert.equal(findAll(findAll(tree, 'data-cds-diffcard')[0], 'data-cds-tool-inspect').length, 0)
  assert.equal(findAll(tree, 'data-cds-tool-inspect').length, 1)
  assert.equal(findAll(render(editBlock(THREE_LINES)), 'data-cds-tool-inspect').length, 0)
  assert.equal(findAll(render(editBlock(THREE_LINES), { inspect, expanded: false }), 'data-cds-tool-inspect').length, 0)
})

// ------------------------------------------------------------- numbering

test('a unified gutter prints the new number, and a deleted row the old one', function () {
  const tree = render(editBlock(Object.assign({ oldStart: 5, newStart: 5 }, THREE_LINES)))
  assert.deepEqual(rows(tree), [
    { kind: 'ctx', number: '5', text: 'a' },
    { kind: 'del', number: '6', text: 'b' },
    { kind: 'add', number: '6', text: 'B' },
    { kind: 'ctx', number: '7', text: 'c' },
  ])
  // The hunk says it knew where it sits in the file.
  assert.equal(findAll(tree, 'data-cds-diff-hunk')[0].props['data-numbered'], 'true')
})

test('without oldStart/newStart the gutter counts 1..n and says so', function () {
  // The shipped archive carries neither field (patch 1 is not installed), so
  // this is the path every real conversation takes today.
  const tree = render(editBlock(THREE_LINES))
  assert.deepEqual(rows(tree).map(function (row) { return row.number }), ['1', '2', '2', '3'])
  assert.equal(findAll(tree, 'data-cds-diff-hunk')[0].props['data-numbered'], 'false')
})

test('a pure insertion numbers from its newStart and has no old side', function () {
  const tree = render(editBlock({
    path: 'C:\\work\\src\\a.js',
    oldText: null,
    newText: 'first\nsecond',
    newStart: 42,
  }))
  assert.deepEqual(rows(tree), [
    { kind: 'add', number: '42', text: 'first' },
    { kind: 'add', number: '43', text: 'second' },
  ])
})

test('one published side seeds both counters', function () {
  const tree = render(editBlock(Object.assign({ newStart: 10 }, THREE_LINES)))
  assert.deepEqual(rows(tree).map(function (row) { return row.number }), ['10', '11', '11', '12'])
  assert.equal(findAll(tree, 'data-cds-diff-hunk')[0].props['data-numbered'], 'true')
})

// ----------------------------------------------------------- token spans

test('row text is tokenised, and the changed token is the one marked', function () {
  const tree = render(editBlock({
    path: 'C:\\work\\src\\a.js',
    oldText: 'const answer = 41',
    newText: 'const answer = 42',
  }))
  const spans = findAll(tree, 'data-cds-tok')
  assert.ok(spans.length > 0, 'the card renders token spans')
  assert.ok(spans.some(function (span) { return span.props['data-cds-tok'] === 'keyword' }))
  assert.ok(spans.some(function (span) { return span.props['data-cds-tok'] === 'number' }))
  const marked = spans.filter(function (span) { return 'data-cds-tok-diff' in span.props })
  assert.deepEqual(marked.map(function (span) { return flat(span) }), ['41', '42'])
  assert.deepEqual(marked.map(function (span) { return span.props['data-cds-tok-diff'] }), ['del', 'add'])
})

// ------------------------------------------------------- failure / edges

test('an error card shows the message and no rows', function () {
  const block = editBlock(THREE_LINES, {
    isError: true,
    content: [{ type: 'text', text: 'String to replace not found in file.' }],
  })
  const tree = render(block)
  assert.equal(rows(tree).length, 0, 'a failed call renders no diff rows')
  const error = findAll(tree, 'data-cds-diff-error')
  assert.equal(error.length, 1)
  assert.match(flat(error[0]), /String to replace not found/)
  // The row title reads as a failure, not as a completed edit.
  assert.match(flat(findAll(tree, 'data-cds-diffrow-title')[0]), /^Failed to edit a\.js$/u)
  assert.equal(findAll(tree, 'data-cds-diffrow')[0].props['data-state'], 'error')
})

test('a stopped call says so in the title and the state', function () {
  const block = editBlock(THREE_LINES, { error: { code: 'interrupted' } })
  const tree = render(block)
  assert.match(flat(findAll(tree, 'data-cds-diffrow-title')[0]), /^Stopped editing a\.js$/u)
  assert.equal(findAll(tree, 'data-cds-diffrow')[0].props['data-state'], 'stopped')
})

test('missing metadata falls back to the result text', function () {
  const block = {
    kind: 'tool-result',
    // No `meta.diffs`, and arguments that carry no content field either.
    call: { name: 'edit', argsRaw: JSON.stringify({ file_path: 'C:\\work\\src\\a.js' }) },
    content: [{ type: 'text', text: 'Something happened' }],
    isError: false,
    error: null,
    meta: {},
  }
  const tree = render(block)
  assert.equal(rows(tree).length, 0)
  assert.equal(flat(findAll(tree, 'data-cds-diff-plain')[0]), 'Something happened')
})

test('a new-file write renders its argument content as additions', function () {
  // `presentationMeta` reports `diffs: []` for a file that did not exist, so the
  // metadata is empty BY DESIGN; the host itself falls back to the arguments.
  const block = {
    kind: 'tool-result',
    call: {
      name: 'write',
      argsRaw: JSON.stringify({ file_path: 'C:\\work\\src\\new.js', content: 'one\ntwo\n' }),
    },
    content: [{ type: 'text', text: 'Wrote 3 lines to C:\\work\\src\\new.js' }],
    isError: false,
    error: null,
    meta: { diffs: [] },
  }
  const tree = render(block, { toolName: 'write' })
  assert.deepEqual(rows(tree), [
    { kind: 'add', number: '1', text: 'one' },
    { kind: 'add', number: '2', text: 'two' },
  ])
  assert.match(flat(findAll(tree, 'data-cds-diffrow-title')[0]), /^Wrote new\.js$/u)
})

test('a start-phase block keeps the header without inventing rows', function () {
  const tree = render({
    phase: 'start',
    name: 'edit',
    argsRaw: JSON.stringify({ file_path: 'C:\\work\\src\\a.js', old_string: 'a', new_string: 'b' }),
  })
  assert.match(flat(findAll(tree, 'data-cds-diffrow-title')[0]), /^Editing a\.js$/u)
  assert.equal(findAll(tree, 'data-cds-diffrow')[0].props['data-state'], 'running')
})

// --------------------------------------------------- in-flight row titles
//
// REGRESSION, reported from a live conversation. While a call was still
// streaming, the row read `Editing edit` / `Writing write`. Cause: `argsRaw` is
// PARTIAL JSON during a stream, `JSON.parse` threw, the path came back empty,
// and the title fell back to `props.toolName` — the wire tool name. These four
// cases fail on that code and pass on the current one: partial raw text, the
// host's streaming argument view, the preparing phase with no arguments at all,
// and the localised (Chinese) form. The completed and failed sentences are
// pinned too, so the fix cannot have traded one state for another.

/** Argument text exactly as a stream hands it over: truncated mid-member. */
const PARTIAL_EDIT_ARGS = '{"file_path":"C:\\\\work\\\\src\\\\a.js","old_string":"a","new_s'

/** The host's streaming argument view (`block.args`), which answers early. */
function argView(values) {
  return {
    text: function text(field) { return values[field] },
    complete: function complete(field) { return Object.hasOwn(values, field) },
    has: function has(field) { return Object.hasOwn(values, field) },
    stringLength: function stringLength(field) {
      return typeof values[field] === 'string' ? values[field].length : undefined
    },
  }
}

test('an in-flight edit names the workspace-relative file, never the tool', function () {
  assert.throws(function () { JSON.parse(PARTIAL_EDIT_ARGS) }, 'the fixture really is unparseable')
  const tree = render({ phase: 'start', name: 'edit', argsRaw: PARTIAL_EDIT_ARGS }, { cwd: 'C:\\work' })
  const title = flat(findAll(tree, 'data-cds-diffrow-title')[0])
  assert.equal(title, 'Editing src\\a.js')
  // The bug's signature, stated as its own assertion: the wire name printed as
  // the target.
  assert.doesNotMatch(title, /\b(?:Editing|Writing)\s+(?:edit|write)\b/u)
  assert.equal(findAll(tree, 'data-cds-diffrow')[0].props['data-state'], 'running')
})

test('an in-flight write names the file too, not "Writing write"', function () {
  const tree = render({
    phase: 'start',
    name: 'write',
    argsRaw: '{"file_path":"C:\\\\work\\\\src\\\\new.js","content":"one',
  }, { cwd: 'C:\\work', toolName: 'write' })
  const title = flat(findAll(tree, 'data-cds-diffrow-title')[0])
  assert.equal(title, 'Writing src\\new.js')
  assert.doesNotMatch(title, /Writing\s+write\b/u)
})

test('the streaming argument view supplies the path before the raw JSON parses', function () {
  // `block.args` is the contract the host's own rows read; it resolves a field
  // while the call is still arriving, which is the whole in-flight window.
  const tree = render({
    phase: 'start',
    name: 'edit',
    argsRaw: '',
    args: argView({ file_path: 'C:\\work\\src\\b.js' }),
  }, { cwd: 'C:\\work' })
  assert.equal(flat(findAll(tree, 'data-cds-diffrow-title')[0]), 'Editing src\\b.js')
})

test('the preparing phase shows the operation alone, never a repeated tool name', function () {
  for (const toolName of ['edit', 'write']) {
    const tree = render({ phase: 'preparing', callId: 'c1' }, { toolName })
    const title = flat(findAll(tree, 'data-cds-diffrow-title')[0])
    assert.equal(title, toolName === 'write' ? 'Writing' : 'Editing')
    assert.doesNotMatch(title, new RegExp('\\b' + toolName + '\\b', 'u'))
    assert.equal(findAll(tree, 'data-cds-diffrow')[0].props['data-state'], 'preparing')
  }
})

test('the in-flight title is localised: 正在编辑 / 正在写入 with the relative path', function () {
  const zhT = makeT(makeTranslator(zh))
  const edit = render({ phase: 'start', name: 'edit', argsRaw: PARTIAL_EDIT_ARGS },
    { cwd: 'C:\\work', t: zhT })
  assert.equal(flat(findAll(edit, 'data-cds-diffrow-title')[0]), '正在编辑 src\\a.js')
  const write = render({
    phase: 'start',
    name: 'write',
    argsRaw: '{"file_path":"C:\\\\work\\\\src\\\\new.js","content":"one',
  }, { cwd: 'C:\\work', toolName: 'write', t: zhT })
  assert.equal(flat(findAll(write, 'data-cds-diffrow-title')[0]), '正在写入 src\\new.js')
  // The same dictionary, with no target to name: the placeholder gap collapses
  // instead of leaving a dangling `正在编辑 ` or the wire name.
  const bare = render({ phase: 'preparing', callId: 'c9' }, { t: zhT })
  assert.equal(flat(findAll(bare, 'data-cds-diffrow-title')[0]), '正在编辑')
})

test('completed and failed sentences keep their own verb and target', function () {
  // A settled edit: "Edited", a settled write: "Wrote", a rejected write:
  // "Failed to write". None of them gains or loses a word from the fix above.
  const cwd = { cwd: 'C:\\work' }
  assert.equal(flat(findAll(render(editBlock(THREE_LINES), cwd), 'data-cds-diffrow-title')[0]),
    'Edited src\\a.js')
  const wrote = {
    kind: 'tool-result',
    call: { name: 'write', argsRaw: JSON.stringify({ file_path: 'C:\\work\\src\\new.js', content: 'one\n' }) },
    content: [{ type: 'text', text: 'Wrote 1 line' }],
    isError: false,
    error: null,
    meta: { diffs: [] },
  }
  assert.equal(flat(findAll(render(wrote, { toolName: 'write', cwd: 'C:\\work' }), 'data-cds-diffrow-title')[0]),
    'Wrote src\\new.js')
  const failed = render(Object.assign({}, wrote, {
    isError: true,
    content: [{ type: 'text', text: 'EACCES: permission denied' }],
  }), { toolName: 'write', cwd: 'C:\\work' })
  assert.equal(flat(findAll(failed, 'data-cds-diffrow-title')[0]), 'Failed to write src\\new.js')
  assert.doesNotMatch(flat(findAll(failed, 'data-cds-diffrow-title')[0]), /Failed to write write/u)
})

// -------------------------------------------------------------- expander

test('a long hunk collapses to the host limit and offers an expander', function () {
  const lines = []
  for (let i = 0; i < 40; i += 1) lines.push('line ' + i)
  const tree = render(editBlock({ path: 'C:\\work\\src\\a.js', oldText: null, newText: lines.join('\n') }))
  assert.equal(LINE_LIMIT, 16, 'the host diff card default')
  const rendered = rows(tree)
  assert.equal(rendered.length, LINE_LIMIT, 'the collapsed card renders exactly the limit')
  const more = findAll(tree, 'data-cds-diff-more')
  assert.equal(more.length, 1)
  assert.equal(flat(more[0]), '… 24 more lines')
  assert.equal(more[0].props['aria-expanded'], false)
  // Head and tail of the hunk are both visible, as in the host's own card.
  assert.deepEqual([rendered[0].text, rendered[rendered.length - 1].text], ['line 0', 'line 39'])
})

test('a short hunk renders whole and has no expander', function () {
  const tree = render(editBlock(THREE_LINES))
  assert.equal(rows(tree).length, 4)
  assert.equal(findAll(tree, 'data-cds-diff-more').length, 0)
})

// --------------------------------------------------------- row structure

test('the card is only mounted while the row is open, and the copy control with it', function () {
  const closed = render(editBlock(THREE_LINES), { expanded: false })
  assert.equal(findAll(closed, 'data-cds-diffcard').length, 0)
  assert.equal(findAll(closed, 'data-cds-diff-copy').length, 0)
  assert.equal(findAll(closed, 'data-cds-diffrow')[0].props['data-expanded'], 'false')

  const open = render(editBlock(THREE_LINES))
  assert.equal(findAll(open, 'data-cds-diffcard').length, 1)
  assert.equal(findAll(open, 'data-cds-diff-copy').length, 1)
  assert.equal(findAll(open, 'data-cds-diffrow')[0].props['data-expanded'], 'true')
})

test('the row header carries the stats and the disclosure semantics', function () {
  const tree = render(editBlock(THREE_LINES))
  const head = findAll(tree, 'data-cds-diffrow-head')[0]
  assert.equal(head.props.role, 'button')
  assert.equal(head.props.tabIndex, 0)
  assert.equal(head.props['aria-expanded'], true)
  const stats = findAll(tree, 'data-cds-diff-stat').map(function (node) { return flat(node) })
  assert.deepEqual(stats, ['+1', '−1'])
})

test('two hunks are separated by a gap row', function () {
  const tree = render(editBlock(THREE_LINES, {
    meta: {
      diffs: [
        { path: 'C:\\work\\src\\a.js', oldText: 'a', newText: 'A' },
        { path: 'C:\\work\\src\\a.js', oldText: 'z', newText: 'Z' },
      ],
    },
  }))
  assert.equal(findAll(tree, 'data-cds-diff-hunk').length, 2)
  assert.equal(findAll(tree, 'data-cds-diff-gap').length, 1)
})

// --------------------------------------------------------------- helpers

test('the model totals what the rows say', function () {
  const model = buildDiffModel(editBlock(THREE_LINES))
  assert.deepEqual(model.totals, { add: 1, del: 1 })
  assert.equal(model.path, 'C:\\work\\src\\a.js')
  assert.equal(diffText(model), '  a\n- b\n+ B\n  c')
})

test('paths are shown relative to the session workspace when possible', function () {
  assert.equal(displayPath('C:\\work\\src\\a.js', 'C:\\work'), 'src\\a.js')
  assert.equal(displayPath('C:\\other\\a.js', 'C:\\work'), 'C:\\other\\a.js')
  assert.equal(displayPath('C:\\work', 'C:\\work'), 'C:\\work')
  assert.equal(displayPath('', 'C:\\work'), '')
  assert.equal(baseName('C:\\work\\src\\a.js'), 'a.js')
  assert.equal(baseName('/w/a.js'), 'a.js')
  assert.equal(baseName('noext'), 'noext')
})

test('a workspace prefix is matched on a directory boundary, not on characters', function () {
  // `C:\work-other` STARTS WITH `C:\work` but is a sibling directory. The bare
  // `startsWith` this replaces printed `-other\a.js` as if it were inside.
  assert.equal(displayPath('C:\\work-other\\a.js', 'C:\\work'), 'C:\\work-other\\a.js')
  assert.equal(displayPath('C:\\workshop\\a.js', 'C:\\work'), 'C:\\workshop\\a.js')
  assert.equal(displayPath('/work-other/a.js', '/work'), '/work-other/a.js')
  // A real child, in both separator spellings and both cases.
  assert.equal(displayPath('C:\\work\\src\\a.js', 'C:\\work\\'), 'src\\a.js')
  assert.equal(displayPath('C:/work/src/a.js', 'C:\\work'), 'src/a.js')
  assert.equal(displayPath('c:\\Work\\src\\a.js', 'C:\\work'), 'src\\a.js')
  assert.equal(displayPath('C:\\WORK', 'C:\\work'), 'C:\\WORK')
  // No workspace root: nothing is shortened.
  assert.equal(displayPath('C:\\work\\src\\a.js', undefined), 'C:\\work\\src\\a.js')
  assert.equal(displayPath('C:\\work\\src\\a.js', ''), 'C:\\work\\src\\a.js')
})

test('a relative path keeps its directories in the row title', function () {
  // THE TARGET IS THE PATH THE READER CAN ACT ON. A model-written relative
  // `src/foo.js` must not collapse to `foo.js`: that names a file somewhere
  // else in the workspace. Only an absolute path is ever shortened, and only to
  // its bare name when it is not under the workspace root.
  assert.equal(rowTarget('src/foo.js', 'C:\\work'), 'src/foo.js')
  assert.equal(rowTarget('src\\foo.js', 'C:\\work'), 'src\\foo.js')
  assert.equal(rowTarget('src/foo.js', undefined), 'src/foo.js')
  assert.equal(rowTarget('C:\\work\\src\\foo.js', 'C:\\work'), 'src\\foo.js')
  assert.equal(rowTarget('C:\\other\\deep\\foo.js', 'C:\\work'), 'foo.js')
  assert.equal(rowTarget('', 'C:\\work'), '')
  // And the title the component renders carries the directory through.
  const tree = render({
    phase: 'start',
    name: 'edit',
    argsRaw: JSON.stringify({ file_path: 'src/foo.js', old_string: 'a', new_string: 'b' }),
  }, { cwd: 'C:\\work' })
  assert.equal(flat(findAll(tree, 'data-cds-diffrow-title')[0]), 'Editing src/foo.js')
})

test('a partial argument string yields its completed path and nothing else', function () {  // The recovery read only claims a COMPLETE `"file_path": "…"` member; an
  // unfinished value must stay silent rather than guess half a path.
  assert.equal(scanArgumentPath(PARTIAL_EDIT_ARGS), 'C:\\work\\src\\a.js')
  assert.equal(scanArgumentPath('{"file_path":"C:\\\\wo'), '')
  assert.equal(scanArgumentPath('{"content":"x'), '')
  assert.equal(scanArgumentPath('{"file_path":"C:\\\\a\\\\b.js\\"'), '')
  assert.equal(scanArgumentPath(''), '')
  assert.equal(scanArgumentPath(null), '')
  assert.equal(callPath({ phase: 'start', name: 'edit', argsRaw: PARTIAL_EDIT_ARGS }), 'C:\\work\\src\\a.js')
  assert.equal(callPath({ phase: 'preparing' }), '')
})

test('an unreadable block degrades to an empty card instead of throwing', function () {
  const t = makeT(undefined)
  for (const block of [null, undefined, {}, { kind: 'tool-result' }, { phase: 'preparing' }]) {
    assert.doesNotThrow(function () { render(block, { t }) })
  }
})