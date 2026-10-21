import {
  createAssistantMessage, createSystemMessage, createUserMessage,
} from '@deepseek-ai/dsh-llm'
import {
  ANCHOR_LIMIT, ASSISTANT_TAIL_CHARS, CONTEXT_TURNS, MESSAGE_CHAR_LIMIT,
  PREDICTION_PROMPT, truncate,
} from './predict.js'

/**
 * The assistant tail is the thing being continued.
 *
 * WHY THE TAIL AND NOT A TRANSCRIPT. Two independent products converged on
 * this: supi's ADR 0011 sends *only* the last assistant message (its last
 * 8,000 characters) plus a package-owned prompt, and explicitly sends no
 * transcript, no tool output, no file contents; Cursor's Tab write-up goes the
 * other way on volume (13k tokens) but for the same reason — what matters is
 * the CURRENT state, not the history that produced it.
 *
 * Our previous request sent six turns of truncated history, and because a
 * coding-agent turn is usually tool calls with no prose, `turns` often held no
 * assistant text at all: the model saw a few fragmentary user lines and
 * invented something unrelated. The last assistant message is the one piece
 * that always exists at `turn/end` and always states what just happened.
 */
export function assistantTail(text, limit = ASSISTANT_TAIL_CHARS) {
  const value = typeof text === 'string' ? text : ''
  if (value.length <= limit) return value
  // Keep the END: a reply's conclusion is what the user reacts to.
  return '…' + value.slice(value.length - limit)
}

/**
 * The anchors: what the turn actually touched.
 *
 * This is our stand-in for the "editor state" Cursor added when it went from
 * 5,500 to 13,000 tokens. File paths are cheap (a few dozen bytes each) and
 * carry most of the topic signal a suggestion needs — "now do the same for the
 * other file" only makes sense if the model knows which file was just edited.
 */
export function anchorLines(turns, limit = ANCHOR_LIMIT) {
  const out = []
  for (let index = turns.length - 1; index >= 0 && out.length < limit; index -= 1) {
    const turn = turns[index]
    if (turn?.role !== 'anchor' || typeof turn.text !== 'string' || turn.text === '') continue
    if (out.includes(turn.text)) continue
    out.unshift(turn.text)
  }
  return out
}

export function buildRequestMessages(turns, route) {
  const list = Array.isArray(turns) ? turns : []

  // The last assistant message with prose is the subject; everything older is
  // history that only costs latency.
  let assistant = ''
  let user = ''
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const turn = list[index]
    if (turn?.role === 'assistant' && assistant === '' && typeof turn.text === 'string') {
      assistant = turn.text
    }
    if (turn?.role === 'user' && user === '' && typeof turn.text === 'string') {
      user = turn.text
    }
    if (assistant !== '' && user !== '') break
  }

  const anchors = anchorLines(list)
  const parts = []
  if (user !== '') parts.push('The user just said:\n' + truncate(user, MESSAGE_CHAR_LIMIT))
  if (assistant !== '') parts.push('The assistant replied:\n' + assistantTail(assistant))
  if (anchors.length > 0) parts.push('Actions in that turn:\n' + anchors.join('\n'))

  // Nothing to continue from: do not call the model at all. A prediction made
  // from an empty prompt is exactly the "completely unrelated" suggestion.
  const body = parts.join('\n\n')
  if (body === '') return null

  return [
    createSystemMessage(PREDICTION_PROMPT),
    createUserMessage({ content: [{ type: 'text', text: body }], source: { kind: 'user' } }),
  ]
}