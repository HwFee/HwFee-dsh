/**
 * The prediction rules: parsing, context shaping, and when to stay quiet.
 *
 * THE PARSING IS THE RISKY PART. Whatever this returns lands as grey text in the
 * user's composer, which is the most intimate surface in the app. A model that
 * wraps its answer in quotes, prefixes it with "Suggestion:", writes three
 * paragraphs, or replies "I cannot predict that" must all produce NOTHING rather
 * than something the user has to delete.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  CONTEXT_TURNS, COOLDOWN_TURNS, FAILURE_BACKOFF, MESSAGE_CHAR_LIMIT, MAX_SUGGESTION_CHARS,
  SKIP_AFTER_DISMISS, afterAttempt, buildMessages, parseSuggestion, shouldPredict,
  truncate, PREDICTION_PROMPT,
} = await import('../lib/predict.js')

// ------------------------------------------------------------------ parsing

test('a plain line is returned as-is', function () {
  assert.equal(parseSuggestion('先把 C 那一行的时间序列补齐'), '先把 C 那一行的时间序列补齐')
})

test('wrapping quotes are stripped in every style a model uses', function () {
  for (const raw of ['"do the same for B"', "'do the same for B'", '`do the same for B`',
    '「do the same for B」', '『do the same for B』']) {
    assert.equal(parseSuggestion(raw), 'do the same for B', `failed on ${raw}`)
  }
})

test('a label prefix is dropped', function () {
  // Models prepend the field name even when told not to; the label is not part
  // of what the user would type.
  for (const raw of ['Suggestion: 继续', 'Next message: 继续', 'Next: 继续', 'User: 继续']) {
    assert.equal(parseSuggestion(raw), '继续', `failed on ${raw}`)
  }
})

test('only the first non-empty line is used', function () {
  // A multi-paragraph answer is not a completion.
  assert.equal(parseSuggestion('\n\n先看 C\n\n然后我们再看 B\n'), '先看 C')
})

test('a refusal produces nothing', function () {
  for (const raw of ['I cannot predict that.', "I can't know", "Sorry, I don't have enough context",
    '无法预测', '抱歉，信息不足']) {
    assert.equal(parseSuggestion(raw), null, `should have refused: ${raw}`)
  }
})

test('empty and non-string input produce nothing', function () {
  for (const raw of ['', '   ', '\n\n', null, undefined, 42, {}]) {
    assert.equal(parseSuggestion(raw), null, `should have refused: ${JSON.stringify(raw)}`)
  }
})

test('an over-long suggestion is cut, not rejected', function () {
  // A long line is still a usable completion once trimmed; dropping it would
  // lose a prediction the user could have accepted the beginning of.
  const long = 'a'.repeat(MAX_SUGGESTION_CHARS + 100)
  const out = parseSuggestion(long)
  assert.equal(out.length, MAX_SUGGESTION_CHARS + 1, 'cut to the cap plus the ellipsis')
  assert.ok(out.endsWith('…'))
})

// ------------------------------------------------------------------ context

test('context keeps the last turns only', function () {
  // A long session must not send its whole history to a background request.
  const turns = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: 'turn ' + index,
  }))
  const messages = buildMessages(turns)
  assert.equal(messages.length, CONTEXT_TURNS)
  assert.match(messages.at(-1).content[0].text, /turn 19/, 'the newest turn is last')
})

test('a long message is truncated, with a marker', function () {
  const long = 'x'.repeat(MESSAGE_CHAR_LIMIT + 500)
  const messages = buildMessages([{ role: 'user', text: long }])
  const text = messages[0].content[0].text
  assert.equal(text.length, MESSAGE_CHAR_LIMIT + 1)
  assert.ok(text.endsWith('…'), 'the cut must be visible, not silent')
})

test('messages are shaped the way ctx.llm expects', function () {
  const messages = buildMessages([{ role: 'user', text: 'hi' }])
  assert.deepEqual(messages, [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
})

test('an unknown role is sent as user rather than dropped', function () {
  // A system or tool message in the window should not silently vanish; the
  // prediction prompt is about the user's intent, and `user` is the safe side.
  const messages = buildMessages([{ role: 'tool', text: 'result' }])
  assert.equal(messages[0].role, 'user')
})

test('truncate keeps short text untouched', function () {
  assert.equal(truncate('short', 100), 'short')
  assert.equal(truncate('', 100), '')
  assert.equal(truncate(null, 100), '', 'non-strings become empty, not "null"')
})

// ------------------------------------------------------- when to stay quiet

test('it predicts on a normal completed turn', function () {
  assert.deepEqual(
    shouldPredict({ enabled: true, dismissedLastTurn: false, turnFailed: false, userTurns: 2 }),
    { ok: true },
  )
})

test('it stays quiet when disabled', function () {
  assert.equal(shouldPredict({ enabled: false, dismissedLastTurn: false, turnFailed: false, userTurns: 2 }).reason,
    'disabled')
})

test('it skips one turn after a dismissal', function () {
  // The throttle both shipped implementations have. One turn is enough that the
  // same suggestion is not immediately re-offered.
  assert.equal(shouldPredict({ enabled: true, dismissedLastTurn: true, turnFailed: false, userTurns: 2 }).reason,
    'dismissed-last-turn')
  assert.equal(SKIP_AFTER_DISMISS, 1)
})

test('it stays quiet after a failed turn', function () {
  // The user is about to retry, not to type something new.
  assert.equal(shouldPredict({ enabled: true, dismissedLastTurn: false, turnFailed: true, userTurns: 2 }).reason,
    'turn-failed')
})

test('a NEW conversation gets no prediction until the user has replied once', function () {
  // The first user message is the request; guessing what they say next before
  // they have said anything is guessing. Both shipped implementations only offer
  // a suggestion once a turn has completed in the session.
  const base = { enabled: true, dismissedLastTurn: false, turnFailed: false, cooldownTurns: 0 }
  assert.equal(shouldPredict({ ...base, userTurns: 0 }).reason, 'first-turn')
  assert.equal(shouldPredict({ ...base, userTurns: 1 }).reason, 'first-turn',
    'one user message means this is still the opening turn')
  assert.deepEqual(shouldPredict({ ...base, userTurns: 2 }), { ok: true },
    'the second user message means the conversation is under way')
})

test('a cooldown suppresses predictions', function () {
  assert.equal(shouldPredict({
    enabled: true, dismissedLastTurn: false, turnFailed: false, userTurns: 3, cooldownTurns: 4,
  }).reason, 'cooldown')
})

test('failures back off, then resume', function () {
  // THE COST GUARD. A failed prediction is invisible by design, so without this
  // a broken route would cost one request per turn forever with nothing to show.
  let state = { failures: 0, cooldownTurns: 0 }
  for (let attempt = 1; attempt < FAILURE_BACKOFF; attempt += 1) {
    state = afterAttempt({ ...state, succeeded: false })
    assert.equal(state.cooldownTurns, 0, `attempt ${attempt} is below the threshold`)
  }
  state = afterAttempt({ ...state, succeeded: false })
  assert.equal(state.cooldownTurns, COOLDOWN_TURNS, 'the threshold arms the cooldown')
  assert.equal(state.failures, 0, 'the counter restarts, so one later failure is not immediately fatal')
})

test('a success clears the failure count and spends one cooldown turn', function () {
  const after = afterAttempt({ failures: 2, cooldownTurns: 5, succeeded: true })
  assert.deepEqual(after, { failures: 0, cooldownTurns: 4 })
})

test('a declined prediction (no suggestion) counts as a failure', function () {
  // The model answering "nothing to predict" is not an error, but it IS a
  // request that cost tokens and produced nothing to show; repeated declines
  // should back off the same way.
  const after = afterAttempt({ failures: FAILURE_BACKOFF - 1, cooldownTurns: 0, succeeded: false })
  assert.equal(after.cooldownTurns, COOLDOWN_TURNS)
})

test('the prompt forbids the things that would reach the composer', function () {
  // Each rule maps to a parse failure the tests above cover; if the prompt stops
  // saying them, the parser is doing all the work and the model is fighting it.
  assert.match(PREDICTION_PROMPT, /ONLY that line/)
  assert.match(PREDICTION_PROMPT, /No quotes/)
  assert.match(PREDICTION_PROMPT, /output nothing/)
  assert.match(PREDICTION_PROMPT, /same language/i)
})
