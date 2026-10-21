/**
 * The `render_ui` contract: validation, byte accounting, and arg recovery.
 *
 * These are the rules both halves depend on, so every branch here has a
 * downstream consequence:
 *
 *   - a missing `title` or `code` must reach the MODEL as a tool error, with a
 *     message it can act on, instead of committing a card that renders blank;
 *   - the byte ceiling must count UTF-8 bytes, not UTF-16 units, or a CJK card
 *     passes at 3× its real wire size;
 *   - `readUiSpec` must return null rather than throw, because it runs during
 *     render on a replayed session where the arguments are untrusted.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUiSpec, readUiSpec, utf8Length, MAX_CODE_BYTES, TOOL_NAME,
} from '../lib/spec.js'
import { apply } from '../lib/index.js'

/**
 * Register the plugin against a stub host and hand back the definition the
 * tool registry received.
 *
 * `ctx.tools.register` is captured rather than called because the real
 * registry lives in the host process, not here — what can be checked in Node is
 * the DEFINITION, which is exactly where the wire-schema bug lived.
 *
 * @returns {object} the tool definition `apply` registered
 */
function registeredTool() {
  let captured
  const disposal = function noop() {}
  const ctx = {
    tools: { register(definition) { captured = definition; return disposal } },
    effect(callback) { callback() },
    get() { return undefined },
  }
  apply(ctx)
  assert.ok(captured !== undefined, 'apply registered no tool')
  return captured
}

test('the tool name is the one the card registers under', function () {
  // The client registers a keyed toolview with `key: TOOL_NAME`. A mismatch is
  // silent: the call renders the generic row and no card ever appears.
  assert.equal(TOOL_NAME, 'render_ui')
})

test('a well-formed call is normalized to title, code and bytes', function () {
  const spec = buildUiSpec({ title: '  Token usage  ', code: 'return h("div")', rationale: 'ignored' })
  assert.equal(spec.title, 'Token usage', 'the title is trimmed for display')
  assert.equal(spec.code, 'return h("div")')
  assert.equal(spec.bytes, 15)
  // `rationale` is not part of the wire result: the Host returns the minimum the
  // card needs, and the client reads the rationale back out of the raw args.
  assert.equal('rationale' in spec, false)
})

test('a missing or blank title is rejected with a message the model can act on', function () {
  for (const args of [{}, { title: '' }, { title: '   ' }, { title: 42 }, null, undefined, 'nope']) {
    assert.throws(
      () => buildUiSpec(args === undefined ? {} : { code: 'return null', ...(typeof args === 'object' && args !== null ? args : {}) }),
      /needs a non-empty `title`/,
      `expected a title rejection for ${JSON.stringify(args)}`,
    )
  }
})

test('an over-long title is rejected', function () {
  assert.throws(() => buildUiSpec({ title: 'x'.repeat(121), code: 'return null' }), /120 characters or fewer/)
  // The boundary itself is allowed.
  assert.equal(buildUiSpec({ title: 'x'.repeat(120), code: 'return null' }).title.length, 120)
})

test('a missing or blank body is rejected', function () {
  for (const code of [undefined, '', '   \n\t ']) {
    assert.throws(() => buildUiSpec({ title: 'T', code }), /needs `code`/)
  }
})

test('the byte ceiling counts UTF-8 bytes, not UTF-16 code units', function () {
  // THE BUG THIS PREVENTS. A CJK card is three bytes per glyph. A `.length`
  // check would accept three times the intended payload, and the snippet is
  // re-evaluated on every mount.
  const cjk = '好'.repeat(20)
  assert.equal(cjk.length, 20, 'sanity: 20 UTF-16 code units')
  assert.equal(utf8Length(cjk), 60, 'but 60 UTF-8 bytes')

  // A four-byte character counts as four, and as one consumed surrogate pair.
  assert.equal(utf8Length('😀'), 4)
  assert.equal(utf8Length('a😀b'), 6)

  // Exactly at the ceiling passes; one byte over fails.
  const atLimit = 'a'.repeat(MAX_CODE_BYTES)
  assert.equal(buildUiSpec({ title: 'T', code: atLimit }).bytes, MAX_CODE_BYTES)
  assert.throws(
    () => buildUiSpec({ title: 'T', code: atLimit + 'a' }),
    /over the \d+ byte limit/,
  )
})

test('a lone surrogate is counted as one replacement character, not a crash', function () {
  // Slicing a string mid-surrogate is a real way to get here; utf8Length must
  // stay total instead of throwing on it.
  assert.equal(utf8Length('\ud800'), 3)
  assert.equal(utf8Length('a\ud800b'), 5)
})

test('readUiSpec recovers a committed call and refuses everything else', function () {
  const good = JSON.stringify({ title: 'T', code: 'return null' })
  assert.deepEqual(readUiSpec(good), { title: 'T', code: 'return null', bytes: 11 })

  // Every one of these appears in a real session: an absent raw string on a
  // preparing call, a truncated stream, a payload that no longer validates.
  for (const bad of [null, undefined, '', 'not json', '{', 'null', '[]', '{"title":"T"}', '{"title":"","code":"x"}']) {
    assert.equal(readUiSpec(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
})

test('readUiSpec applies the same rules as buildUiSpec', function () {
  // An old session whose arguments would fail validation today must not render
  // a card just because it was once accepted.
  const oversized = JSON.stringify({ title: 'T', code: 'a'.repeat(MAX_CODE_BYTES + 1) })
  assert.equal(readUiSpec(oversized), null)
})

test('the registered parameters are a raw JSON Schema, not the defineTool spec', function () {
  // THE REGRESSION THIS PINS, and it took the whole feature down silently.
  //
  // `ctx.tools.register()` stores `parameters` as THE WIRE SCHEMA and hands it
  // to the model provider untouched. The `{ name: { type, required: true } }`
  // property map is only legal inside `defineTool()`, which compiles it first.
  // The plugin originally passed the property map, so every request failed
  // before the model could call anything:
  //
  //   Invalid schema for function 'render_ui':
  //   {"description":"…","required":true,"type":"string"} is not of type "object"
  //
  // A card was therefore unreachable — the tool was never callable at all. The
  // assertion is on the ROOT shape because that is what the provider rejected.
  const { parameters } = registeredTool()
  assert.equal(parameters.type, 'object',
    'the wire schema must be an object-rooted JSON Schema; the defineTool property map has no root type')
  assert.equal(parameters.additionalProperties, false,
    'unknown arguments must be refused rather than silently ignored')
  assert.deepEqual([...parameters.required].sort(), ['code', 'title'],
    'title and code are the two arguments a card cannot be drawn without')
  assert.deepEqual(Object.keys(parameters.properties).sort(), ['code', 'rationale', 'title'])

  // No property may carry the author-only `required: true` flag — under the raw
  // dialect, requiredness is the root array, and a per-property boolean is what
  // the provider refused.
  for (const [name, schema] of Object.entries(parameters.properties)) {
    assert.equal(schema.type, 'string', `${name} must declare a JSON Schema type`)
    assert.equal('required' in schema, false,
      `${name} must not carry the author-only \`required\` flag; the root array owns requiredness`)
    assert.equal(typeof schema.description, 'string', `${name} needs a description for the model`)
  }
})

test('every schema keyword the tool sends is in the host-supported subset', function () {
  // The host validates schemas against a closed subset
  // (`assertSupportedJsonSchema`) whose members are exactly these. A keyword
  // outside it aborts registration, which the plugin would only discover as a
  // tool that never appears.
  const CONSTRAINT = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const'])
  const ANNOTATION = new Set(['description', 'title', 'default', 'examples'])
  const { parameters, output } = registeredTool()
  const seen = new Set()
  const stack = [parameters, output.schema]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === null || typeof node !== 'object' || seen.has(node)) continue
    seen.add(node)
    for (const [key, value] of Object.entries(node)) {
      assert.ok(CONSTRAINT.has(key) || ANNOTATION.has(key),
        `"${key}" is outside the enforced JSON Schema subset (constraints + annotations)`)
      if (key === 'properties') {
        assert.equal(typeof value, 'object', 'properties must be a map')
        for (const child of Object.values(value)) stack.push(child)
      } else if (key === 'items') {
        stack.push(value)
      }
    }
  }
  assert.ok(seen.size >= 4, 'the walk visited implausibly few schema nodes')
})

test('the tool reports the same arguments it validated, and a result the model can trust', async function () {
  const tool = registeredTool()
  assert.equal(tool.name, TOOL_NAME, 'the definition is registered under the card\'s key')

  const value = await tool.execute({ title: ' Usage ', code: 'return h("div")', rationale: 'shows a bar' })
  assert.deepEqual(value, { title: 'Usage', code: 'return h("div")', bytes: 15 },
    'execute returns the normalized spec, and NOT the rationale, which is not part of the wire result')

  // The model sees this text as the tool result; it must confirm the card is
  // visible, or a crash would read as success.
  const rendered = tool.output.render({ title: 'Usage' }, value)
  assert.equal(rendered.length, 1)
  assert.equal(rendered[0].type, 'text')
  assert.match(rendered[0].text, /"Usage"/)
  assert.match(rendered[0].text, /visible to the user/)
  assert.match(rendered[0].text, /do not repeat/i)
})

test('presentCall speaks the render-intent vocabulary the host defines', function () {
  const tool = registeredTool()
  const intent = tool.presentCall({ title: 'Token usage' })
  assert.equal(intent.card, 'generic')
  assert.equal(intent.title, 'Token usage')
  assert.ok(Object.values(['other', 'read', 'search', 'execute']).includes(intent.kind),
    'kind must be one of the host\'s render-intent kinds')
  // A call whose title has not arrived yet still needs a row label.
  assert.equal(tool.presentCall({}).title, 'Render UI')
  assert.equal(tool.presentCall(undefined).title, 'Render UI')
})
