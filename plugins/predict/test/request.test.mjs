import { test } from 'node:test'
import assert from 'node:assert/strict'

const { buildRequestMessages, assistantTail, anchorLines } = await import('../lib/request.js')
const {
  PREDICTION_PROMPT, ASSISTANT_TAIL_CHARS, ANCHOR_LIMIT, MESSAGE_CHAR_LIMIT,
} = await import('../lib/predict.js')

const turn = (role, text, source) => ({ role, text, source })

test('an empty conversation produces no request at all', function () {
  // Predicting from nothing is how an unrelated suggestion gets invented.
  assert.equal(buildRequestMessages([], { provider: 'p', model: 'm' }), null)
  assert.equal(buildRequestMessages([turn('assistant', '', {})], { provider: 'p', model: 'm' }), null)
})

test('the first message is the system prompt, byte for byte', function () {
  const messages = buildRequestMessages([turn('assistant', 'ok', {})], { provider: 'p', model: 'm' })
  assert.equal(messages[0].role, 'system')
  assert.equal(messages[0].content[0].text, PREDICTION_PROMPT)
})

test('the transcript is not replayed: system plus one user message', function () {
  const messages = buildRequestMessages([
    turn('user', 'first', { kind: 'user' }),
    turn('assistant', 'second', {}),
    turn('user', 'third', { kind: 'user' }),
    turn('assistant', 'fourth', {}),
  ], { provider: 'p', model: 'm' })
  assert.equal(messages.length, 2)
  assert.equal(messages[1].role, 'user')
})

test('the assistant TAIL is the subject, and the head is dropped', function () {
  const body = 'H'.repeat(200) + 'TAIL-MARKER'
  const messages = buildRequestMessages([turn('assistant', body, {})], { provider: 'p', model: 'm' })
  const text = messages[1].content[0].text
  assert.ok(text.includes('TAIL-MARKER'), 'the conclusion survives')
  assert.ok(text.includes('The assistant replied'))
})

test('a long assistant message is cut to ASSISTANT_TAIL_CHARS from the end', function () {
  const long = 'a'.repeat(ASSISTANT_TAIL_CHARS) + 'z'.repeat(500)
  const tail = assistantTail(long)
  assert.equal(tail.length, ASSISTANT_TAIL_CHARS + 1, 'ellipsis plus the cap')
  assert.ok(tail.endsWith('z'), 'the end is kept')
  assert.ok(tail.startsWith('…'), 'the cut is marked')
})

test('the last user line is carried and truncated', function () {
  const messages = buildRequestMessages([turn('user', 'x'.repeat(5000), { kind: 'user' })], { provider: 'p', model: 'm' })
  const text = messages[1].content[0].text
  assert.ok(text.includes('The user just said'))
  assert.ok(text.length < MESSAGE_CHAR_LIMIT + ASSISTANT_TAIL_CHARS + 200, 'the user line is capped')
})

test('anchors make an anaphoric next line answerable', function () {
  const messages = buildRequestMessages([
    turn('assistant', 'done', {}),
    turn('anchor', 'edit plugins/cds-theme/client/src/styles.js'),
  ], { provider: 'p', model: 'm' })
  const text = messages[1].content[0].text
  assert.ok(text.includes('Actions in that turn'))
  assert.ok(text.includes('plugins/cds-theme/client/src/styles.js'))
})

test('anchors are de-duplicated, newest-first, and capped', function () {
  const turns = []
  for (let i = 0; i < ANCHOR_LIMIT + 5; i += 1) turns.push(turn('anchor', 'edit f' + i))
  turns.push(turn('anchor', 'edit f' + (ANCHOR_LIMIT + 4)))
  const lines = anchorLines(turns)
  assert.ok(lines.length <= ANCHOR_LIMIT)
  assert.equal(new Set(lines).size, lines.length, 'no duplicates')
})

test('replayState never reaches the request', function () {
  const messages = buildRequestMessages([
    turn('assistant', 'reply', { kind: 'model', provider: 'a', model: 'b', replayState: { x: 1 } }),
    turn('user', 'hi', { kind: 'user', replayState: { y: 2 } }),
  ], { provider: 'p', model: 'm' })
  for (const message of messages) {
    assert.equal('replayState' in message.source, false)
  }
})