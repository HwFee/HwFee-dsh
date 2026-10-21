/**
 * The prediction itself: what to ask, how to read the answer, when to stay quiet.
 *
 * WHY THIS MODULE IS PURE. Everything here is decided from data — the recent
 * turns, the settings, the cost budget — with no I/O. The Host half does the
 * calling and the Client half does the drawing; both share these rules so a
 * prediction cannot be "good enough to show" in one place and not the other.
 *
 * THE BEHAVIOUR THIS MATCHES, from the shipped implementations:
 *
 *   - OpenAI's composer predictions and Claude Code's prompt suggestions both
 *     SKIP more often than they fire: "A prediction won't appear after every
 *     response." A suggestion on every turn reads as noise, and the cost adds up.
 *   - Both produce ONE COMPLETE next message, not word-by-word completion.
 *   - Both accept with Tab and put the text in the box; neither sends.
 *   - Failures are silent. None of them surface an error for a missing
 *     prediction — the user did not ask for one.
 *
 * @module predict
 */

/**
 * How many prior turns to send as context.
 *
 * Small on purpose. Claude Code reuses the session's prompt cache, which only
 * pays off for a short suffix; OpenAI's docs say a prediction uses "the
 * conversation in your current thread" without promising it reads everything.
 * Six turns is enough to see what the user is working on and short enough that
 * the request stays cheap and the cache warm.
 */
export const CONTEXT_TURNS = 6

/**
 * Characters of any single message kept in the context window.
 *
 * A 20 KB file paste is not a hint about what the user will say next, and it
 * costs the most. Truncating keeps the SHAPE of the conversation (what was
 * asked, what came back) rather than its literal content.
 */
export const MESSAGE_CHAR_LIMIT = 600

/**
 * The ceiling on one prediction, in characters.
 *
 * A suggestion is a line the user could have typed. Past a couple hundred
 * characters it stops being a completion and starts being an answer, and the
 * ghost text would cover the composer.
 */
export const MAX_SUGGESTION_CHARS = 220

/**
 * Consecutive failures after which the plugin backs off.
 *
 * A prediction that fails is invisible by design, which means a broken route or
 * an exhausted quota would burn a request after every single turn forever with
 * nothing to show for it. After this many failures in a row the plugin stops
 * trying for {@link COOLDOWN_TURNS} turns, then resumes — a suggestion that
 * silently costs money on every turn is worse than no suggestion.
 */
export const FAILURE_BACKOFF = 3

/** Turns to stay quiet after {@link FAILURE_BACKOFF} failures in a row. */
export const COOLDOWN_TURNS = 10

/**
 * Turns to skip after the user IGNORES a prediction.
 *
 * Both shipped implementations throttle. Claude Code reduces frequency after 20
 * consecutive unused suggestions and tells the user; OpenAI simply may skip.
 * This plugin skips ONE turn after a dismissal — enough that the suggestion is
 * not re-offered immediately, without a hidden knob nobody can see.
 */
export const SKIP_AFTER_DISMISS = 1

/**
 * The system prompt for the prediction request.
 *
 * Written for a model that has just finished answering: it must produce the
 * USER's next line, not continue its own. The three rules that matter are
 * "one line", "no quotes", and "empty is fine" — an empty answer is how the
 * model declines, and the plugin treats it as "no prediction".
 */
export const PREDICTION_PROMPT = [
  'You predict the user\'s next message in a chat with a coding agent.',
  'Read the conversation and write the single line the user is most likely to type next.',
  '',
  'Rules:',
  '- Output ONLY that line. No quotes, no prefix, no explanation, no Markdown.',
  '- One sentence, under 120 characters, phrased as the user would say it.',
  '- Write the user\'s intent, not your answer to it. "now do the same for the other file" — not "I will now edit...".',
  '- Use the same language as the user\'s recent messages.',
  '- If the next step is genuinely unclear, or the user is likely to stop, output nothing at all.',
].join('\n')

/**
 * Build the message list for one prediction request.
 *
 * @param {Array<{ role: string, text: string }>} turns the recent conversation,
 *        oldest first; `role` is `user` or `assistant`
 * @returns {Array<{ role: string, content: Array<{ type: string, text: string }> }>}
 *          messages in the wire shape `ctx.llm` accepts
 */
export function buildMessages(turns) {
  const recent = turns.slice(-CONTEXT_TURNS)
  return recent.map((turn) => ({
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    content: [{ type: 'text', text: truncate(turn.text, MESSAGE_CHAR_LIMIT) }],
  }))
}

/**
 * Cut a string to a limit, marking the cut.
 *
 * @param {string} text the input
 * @param {number} limit characters to keep
 * @returns {string} the text, possibly truncated
 */
export function truncate(text, limit) {
  const value = typeof text === 'string' ? text : ''
  if (value.length <= limit) return value
  return value.slice(0, limit) + '…'
}

/**
 * Turn the model's raw output into a suggestion, or `null`.
 *
 * THE PARSING IS THE DEFENSIVE PART. Models wrap answers in quotes, prefix them
 * with "Suggestion:", emit several lines, or answer with a refusal. Every one of
 * those reaching the composer as ghost text is worse than showing nothing, so
 * this function has one job: return either a clean single line or null.
 *
 * @param {string} raw the assistant text
 * @returns {string | null} the suggestion, or null when there is nothing to show
 */
export function parseSuggestion(raw) {
  if (typeof raw !== 'string') return null

  // A model that answers the QUESTION instead of predicting the next message
  // usually does it in the first line after a label; drop common labels.
  let text = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => line.replace(/^(suggestion|next message|next|user)\s*:\s*/i, ''))
    .filter((line) => line !== '')

  if (text.length === 0) return null

  // One line only: a multi-paragraph answer is not a completion.
  let first = text[0]

  // Strip wrapping quotes — straight, curly, and backticks. Models add them
  // even when told not to, and they read as part of the text in a composer.
  first = first.replace(/^["'`「『]+/, '').replace(/["'`」』]+$/, '').trim()

  if (first === '') return null
  // A refusal is not a suggestion.
  if (/^(i (cannot|can't|don't)|sorry|无法|抱歉)/i.test(first)) return null

  return truncate(first, MAX_SUGGESTION_CHARS)
}

/**
 * Whether a prediction should be requested for this turn.
 *
 * THE SKIPS ARE THE FEATURE. A suggestion after every response is noise; these
 * rules encode the cases where a suggestion is either useless or expensive:
 *
 *   - the user turned it off;
 *   - the previous prediction was dismissed (skip a turn);
 *   - the turn ended in an error (the user is about to retry, not to chat);
 *   - the conversation has no user message yet (nothing to predict from).
 *
 * @param {object} state
 * @param {boolean} state.enabled the user's setting
 * @param {boolean} state.dismissedLastTurn whether the previous suggestion was ignored
 * @param {boolean} state.turnFailed whether the turn ended with an error
 * @param {number} state.userTurns how many user messages the conversation has
 * @returns {{ ok: true } | { ok: false, reason: string }} the decision
 */
export function shouldPredict(state) {
  if (state.enabled !== true) return { ok: false, reason: 'disabled' }
  // A NEW conversation gets no prediction. Before the user has replied once
  // there is no pattern to predict from: the first message was the user's
  // request, and guessing what they say next is guessing what they say before
  // they have said anything. Claude Code and Codex both only offer a suggestion
  // once a turn has completed in this session.
  if (!(state.userTurns >= 2)) return { ok: false, reason: 'first-turn' }
  if (state.cooldownTurns > 0) return { ok: false, reason: 'cooldown' }
  if (state.dismissedLastTurn === true) return { ok: false, reason: 'dismissed-last-turn' }
  if (state.turnFailed === true) return { ok: false, reason: 'turn-failed' }
  return { ok: true }
}

/**
 * Update the failure bookkeeping after one attempt.
 *
 * Kept pure and separate so the state machine can be tested without a model.
 *
 * @param {object} state
 * @param {number} state.failures consecutive failures so far
 * @param {number} state.cooldownTurns turns left in the current cooldown
 * @param {boolean} state.succeeded whether this attempt produced a suggestion
 * @returns {{ failures: number, cooldownTurns: number }} the next counters
 */
export function afterAttempt(state) {
  if (state.succeeded === true) {
    return { failures: 0, cooldownTurns: Math.max(0, state.cooldownTurns - 1) }
  }
  const failures = state.failures + 1
  if (failures >= FAILURE_BACKOFF) {
    // Back off, then start counting again: a single later failure should not
    // immediately re-arm a ten-turn silence.
    return { failures: 0, cooldownTurns: COOLDOWN_TURNS }
  }
  return { failures, cooldownTurns: Math.max(0, state.cooldownTurns - 1) }
}
