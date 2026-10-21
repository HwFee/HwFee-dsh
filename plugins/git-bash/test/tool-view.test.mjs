/**
 * The `run_shell` tool card: pure pieces.
 *
 * The React view itself is exercised on the real renderer (screenshots under
 * `.work/shots/toolrows/`); what can be pinned in Node is the part that decides
 * WHAT the card says — the tokenizer, the argument reader and the result
 * flattener. Those three are where a wrong answer is silent: a mis-split
 * command only shows up as a missing colour, and an unflattened result only
 * shows up as an empty card.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tokenizeShell, readArguments, resultText } from '../client/src/tool-view.js'

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