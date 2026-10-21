import { test } from 'node:test'
import assert from 'node:assert/strict'

const { buildRequestMessages } = await import('../lib/request.js')
const { PREDICTION_PROMPT, CONTEXT_TURNS, buildMessages } = await import('../lib/predict.js')

const turn = (role, text, source) => ({ role, text, source })

test('the first message is the system prompt, byte for byte', function () {
  const messages = buildRequestMessages([], { provider: 'p', model: 'm' })
  assert.equal(messages[0].role, 'system')
  assert.equal(messages[0].content[0].text, PREDICTION_PROMPT)
  assert.equal(messages.length, 1)
})

test('every message carries a string id and an object source', function () {
  const messages = buildRequestMessages([
    turn('user', 'hi', { kind: 'user' }),
    turn('assistant', 'ok', { kind: 'model', provider: 'a', model: 'b' }),
  ], { provider: 'p', model: 'm' })
  for (const message of messages) {
    assert.equal(typeof message.id, 'string')
    assert.notEqual(message.id, '')
    assert.equal(typeof message.source, 'object')
    assert.notEqual(message.source, null)
  }
})

test('assistant messages keep their original provider/model under a pinned route', function () {
  const messages = buildRequestMessages([
    turn('assistant', 'reply', { kind: 'model', provider: 'orig-p', model: 'orig-m' }),
  ], { provider: 'pin', model: 'pinned' })
  const assistant = messages[1]
  assert.equal(assistant.role, 'assistant')
  assert.equal(assistant.source.provider, 'orig-p')
  assert.equal(assistant.source.model, 'orig-m')
})

test('replayState never reaches the request', function () {
  const messages = buildRequestMessages([
    turn('assistant', 'reply', { kind: 'model', provider: 'a', model: 'b', replayState: { x: 1 } }),
    turn('user', 'hi', { kind: 'user', replayState: { y: 2 } }),
  ], { provider: 'p', model: 'm' })
  for (const message of messages) {
    if (message.role === 'assistant') {
      assert.equal('replayState' in message.source, false)
    }
  }
})

test('the window and truncation match the existing buildMessages contract', function () {
  const turns = []
  for (let i = 0; i < CONTEXT_TURNS + 4; i += 1) {
    turns.push(turn('user', 'u' + i, { kind: 'user' }))
  }
  const fresh = buildRequestMessages(turns, { provider: 'p', model: 'm' })
  const legacy = buildMessages(turns)
  assert.equal(fresh.length, 1 + legacy.length)
  const legacyLast = legacy.at(-1).content[0].text
  assert.equal(fresh.at(-1).content[0].text, legacyLast)
  const long = 'x'.repeat(10_000)
  const truncated = buildRequestMessages([turn('user', long, { kind: 'user' })], { provider: 'p', model: 'm' })
  const legacyTruncated = buildMessages([turn('user', long, { kind: 'user' })])
  assert.equal(truncated.at(-1).content[0].text, legacyTruncated.at(-1).content[0].text)
})
