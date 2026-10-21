/**
 * The answer-node contract: what makes a card the turn's answer instead of a
 * tool row.
 *
 * These tests drive the DEFINITION OBJECT directly — the same value the host's
 * assembler consumes — because every claim here is about fields the assembler
 * reads and nothing else:
 *
 *   - `match().exclusive` is what removes the generic tool-call row. Without it
 *     the card would render TWICE (once as a node, once as a tool row).
 *   - `buildViewNode().groupTree` is what keeps the card out of the process fold.
 *     DEPTH is `{ exchange: 0, input: 1, turn: 2, process: 3 }` and the host's
 *     `isAtOrOutside(node, 'process')` compares depths, so only a tree OUTSIDE
 *     process (a smaller or equal depth) escapes the group. `turn` is outside;
 *     `process` is not.
 *   - `start`/`update` must fold the committed call into renderable data, because
 *     the view is a pure function of it and a replay must draw the same card.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { createRenderUiNodeDefinition } = await import('../client/src/render-ui-node.js')
const { NODE_KIND, TOOL_NAME } = await import('../client/src/constants.js')

const HERE = dirname(fileURLToPath(import.meta.url))
const clientIndex = await import('../client/src/index.js')
const manifest = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'))

const definition = createRenderUiNodeDefinition()

/** A minimal `tool/call` event, shaped as the session log stores it. */
function callEvent({ callId = 'call_1', name = TOOL_NAME, argsRaw, seq = 10 } = {}) {
  return {
    type: 'tool/call',
    seq,
    time: 1,
    data: { callId, name, arguments: argsRaw },
  }
}

/** A minimal `tool/result` event for the same call. */
function resultEvent({ callId = 'call_1', isError = false, text = '', seq = 11 } = {}) {
  return {
    type: 'tool/result',
    seq,
    time: 2,
    data: {
      isError,
      message: {
        role: 'tool',
        source: { kind: 'tool', callId },
        toolCallId: callId,
        content: [{ type: 'text', text }],
      },
    },
  }
}

const GOOD_ARGS = JSON.stringify({ title: 'Weekly focus', code: 'return h("div")' })

test('the node kind is its own kind, not the host\'s tool-call row', function () {
  // Registering a SECOND definition under `tool-call` would throw at startup
  // ("is already registered") and take the whole client boot down.
  assert.equal(NODE_KIND, 'render-ui')
  assert.notEqual(NODE_KIND, 'tool-call')
  assert.equal(NODE_KIND, createRenderUiNodeDefinition().kind)
})

test('a render_ui call is claimed exclusively so no tool row renders too', function () {
  const match = definition.match(callEvent({ argsRaw: GOOD_ARGS }))
  assert.deepEqual(match, { id: 'call_1', role: 'start', exclusive: true },
    'exclusive is the field the assembler uses to drop the generic tool-call row')
})

test('every other tool is left alone', function () {
  // The definition receives EVERY tool/call event. Claiming one by mistake would
  // delete that tool's normal row from every conversation.
  for (const name of ['bash', 'read', 'todo_write', 'render_ui_other', '']) {
    assert.equal(definition.match(callEvent({ name, argsRaw: GOOD_ARGS })), null,
      `"${name}" must not be claimed by the card`)
  }
  assert.equal(definition.match({ type: 'assistant/message', seq: 1, data: {} }), null)
})

test('a result is folded in WITHOUT claiming it away from the host', function () {
  // THE BUG THIS PINS, and it shipped: `exclusive` is not a hint scoped to this
  // definition. The assembler drops every OTHER non-exclusive definition on the
  // same target as soon as one definition claims the event
  // (`dsh-client-ui-conversation` `dispatchInput`). This `match` answers for any
  // `tool/result` that carries a callId, so `exclusive: true` here stole the
  // results of pwsh, read, grep — every tool in the conversation. The host's own
  // `toolDefinition` (target `chat`) then never folded a result into its row, and
  // a closed step projects each call as a synthetic `interrupted` tool-result:
  // the row renders `state: 'stopped'` and the summary turns amber
  // (`--dsw-alias-state-warn-label`). The card only needs the UPDATE, not the
  // event: the START claim already prevented the host from creating a row.
  //
  // An update with no source callId stays ignored — there is no Context to fold
  // it into and claiming it would fabricate a node out of nothing.
  assert.equal(definition.match({
    type: 'tool/result',
    seq: 12,
    data: { message: { content: [] } },
  }), null)
  assert.deepEqual(
    definition.match(resultEvent({ callId: 'call_1' })),
    { id: 'call_1', role: 'update' },
    'no exclusive flag: the host tool row must still receive its own result',
  )
  assert.notEqual(definition.match(resultEvent({ callId: 'call_1' })).exclusive, true)
})

test('the node sits OUTSIDE the process group, so it interrupts the fold', function () {
  // The whole point of this file. `isAtOrOutside(node, 'process')` is
  // `DEPTH[groupTree] <= DEPTH.process`, and a node JOINS the group only when
  // that is false. DEPTH is exchange 0 / input 1 / turn 2 / process 3.
  const DEPTH = { exchange: 0, input: 1, turn: 2, process: 3 }
  let state
  const start = definition.start(undefined, { event: callEvent({ argsRaw: GOOD_ARGS }) })
  state = start
  const node = definition.buildViewNode({
    key: 'render-ui:call_1',
    id: 'call_1',
    state,
    start: { location: { kind: 'step', turn: 1, step: 2 } },
  })
  assert.equal(node.groupTree, 'turn')
  assert.ok(DEPTH[node.groupTree] <= DEPTH.process,
    'a groupTree at or outside `process` is what keeps the card out of the folded group')
  assert.notEqual(node.groupTree, 'process', '`process` would bury the card in the fold')
  assert.equal(node.kind, NODE_KIND)
  assert.equal(node.target, 'chat')
  assert.equal(node.visibility, 'visible')
  assert.equal(node.key, 'render-ui:call_1', 'the React-facing identity is preserved')
})

test('the committed call is parsed once, into the data the view renders', function () {
  const state = definition.start(undefined, { event: callEvent({ argsRaw: GOOD_ARGS }) })
  assert.equal(state.seq, 10)
  assert.equal(state.callId, 'call_1')
  assert.equal(state.spec.title, 'Weekly focus')
  assert.equal(state.spec.code, 'return h("div")')
  assert.equal(state.argsRaw, GOOD_ARGS, 'the raw text is kept so the source view can show it verbatim')
  assert.equal(state.errorText, '')
})

test('an unreadable payload yields null spec, which the view renders as its invalid state', function () {
  // A historical call that no longer validates must not throw inside the
  // assembler; it must reach the card as "could not be read".
  const state = definition.start(undefined, { event: callEvent({ argsRaw: '{"title":"x"' }) })
  assert.equal(state.spec, null)
  assert.equal(definition.buildViewNode({ key: 'k', id: 'i', state, start: undefined }).data.spec, null)
})

test('a failed call carries the Host message to the card', function () {
  const start = definition.start(undefined, { event: callEvent({ argsRaw: GOOD_ARGS }) })
  const updated = definition.update({ state: start }, { event: resultEvent({ isError: true, text: '  over the limit  ' }) })
  assert.equal(updated.errorText, 'over the limit', 'the tool error is trimmed and shown')
  // A successful result adds nothing: the card is the answer, not a log.
  const ok = definition.update({ state: start }, { event: resultEvent({ text: 'Rendered UI card' }) })
  assert.equal(ok.errorText, '')
})

test('update ignores events that are not its own result', function () {
  const start = definition.start(undefined, { event: callEvent({ argsRaw: GOOD_ARGS }) })
  const same = definition.update({ state: start }, { event: callEvent({ argsRaw: GOOD_ARGS }) })
  assert.equal(same, start, 'a foreign event returns the state unchanged')
})

test('no node is published before the start is loaded', function () {
  // Update-only windows exist: a page can open with the result but not the call.
  assert.equal(definition.buildViewNode({ key: 'k', id: 'i', state: undefined, start: undefined }), null)
})

test('the client half never reads an undeclared service off `ctx`', async function () {
  // THE CRASH THIS PINS. `ctx.uiConversation` was read directly to register the
  // node. In the host, a service reached as a property must appear in the
  // plugin's `inject` list; an undeclared one throws inside `apply`, and the ONLY
  // surfaced message is:
  //
  //   Error: web boot: 1 entry did not activate
  //   @hwfee/dsh-genui: failed
  //
  // No stack, no field name — the plugin simply stops existing. It took a real
  // boot failure to find it, so the shape is asserted statically from here on.
  const files = ['index.js', 'lifecycle.js', 'card.js', 'render-ui-node.js', 'sandbox.js', 'styles.js']
  const declared = clientIndex.inject

  for (const file of files) {
    const source = readFileSync(join(HERE, '..', 'client', 'src', file), 'utf8')
    // Strip comments so prose about the rule does not trip the rule.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const reads = [...code.matchAll(/\bctx\.([a-zA-Z_$][\w$]*)/g)].map((m) => m[1])
    const allowed = new Set(['get', 'effect', 'slots', 'locale', 'plugin', 'on', 'inject', 'provide', 'getSnapshot'])
    const suspicious = reads.filter((name) => !allowed.has(name))
    for (const name of suspicious) {
      assert.ok(Array.isArray(declared) && declared.includes(name),
        `${file} reads ctx.${name} without it being in client/src/index.js inject — `
        + 'the panel would fail to activate with no useful error. Use ctx.get() instead.')
    }
  }
})

test('every service the client declares is backed by an injected package', function () {
  // THE SECOND HALF OF THE SAME BOOT FAILURE. `dsh.client.inject` in package.json
  // is a list of PACKAGE ids, not service names: it is what causes the module
  // that provides the service to load. Declaring `uiConversation` in the plugin's
  // own `inject` while forgetting `@deepseek-ai/dsh-client-ui-conversation` here
  // leaves the property undefined, and `.events` on undefined throws inside
  // `apply` — again surfacing only as "@hwfee/dsh-genui: failed".
  //
  // The map is the services this client half touches as properties → the package
  // that provides them. A new property read needs a row here, and a reviewer can
  // check the row against the host's own manifest.
  const REQUIREMENTS = {
    uiConversation: '@deepseek-ai/dsh-client-ui-conversation',
  }
  const packages = manifest.dsh?.client?.inject ?? []
  const services = clientIndex.inject ?? []

  for (const service of services) {
    const pkg = REQUIREMENTS[service]
    if (pkg === undefined) continue // a service provided by an already-injected package or by the renderer
    assert.ok(packages.includes(pkg),
      `client/src/index.js declares the "${service}" service but package.json dsh.client.inject `
      + `does not list ${pkg} — the service would be undefined and the plugin would fail to activate`)
  }
  // And the package list must still carry the two the slots come from.
  for (const pkg of ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-tool']) {
    assert.ok(packages.includes(pkg), `dsh.client.inject must keep ${pkg}`)
  }
})

test('the stylesheet and skill body are template-safe', function () {
  // A backtick inside a template literal closes it. Three separate comment edits
  // in this repository's history did exactly that — the CSS landed, then esbuild
  // failed with a bewildering "Expected ';' but found …" pointing at prose. The
  // rule is mechanical, so it is checked mechanically: every backtick inside the
  // CSS and the skill body must be ESCAPED.
  //
  // `styles.js` exports the same string the build inlines, so reading the module
  // proves the parse succeeded; this test adds the part the build cannot see —
  // that no UNESCAPED tick survives into the emitted text (which would truncate
  // the stylesheet at that point without failing the build).
  const samples = [
    ['client/src/styles.js', readFileSync(join(HERE, '..', 'client', 'src', 'styles.js'), 'utf8')],
    ['lib/skill.js', readFileSync(join(HERE, '..', 'lib', 'skill.js'), 'utf8')],
  ]
  for (const [file, source] of samples) {
    // Locate the template literal by its opening backtick and stop at the closing
    // one, so ordinary comments OUTSIDE the literal are not inspected.
    const open = source.indexOf('= `')
    assert.ok(open !== -1, `${file} must contain a template literal`)
    const lines = source.slice(open + 3).split('\n')
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n]
      let i = 0
      for (; i < line.length; i++) {
        if (line[i] === '\\') { i += 1; continue }
        if (line[i] !== '`') continue
        // Any tick inside the body is the terminator. It is legitimate only when
        // what follows on that line is just the statement end (or nothing), i.e.
        // when this really is the closing delimiter.
        const rest = line.slice(i + 1).trim()
        if (!/^([;,)\s]*)$/.test(rest)) {
          assert.fail(`${file}:${n + 1} — an unescaped backtick closes the template early. `
            + 'Escape it as \\` or rephrase the text.')
        }
        return // reached the real closing delimiter
      }
    }
  }
})

test('the definition does not carry live plugin memory', function () {
  // Replay correctness: everything the view draws is derived from the committed
  // arguments, so a fork or a reload produces the same card from the same bytes.
  const source = createRenderUiNodeDefinition.toString()
  assert.ok(!/Map\(|Set\(|new WeakMap/.test(source),
    'a definition holding mutable state would make a replayed session disagree with a live one')
})
