import {
  createAssistantMessage, createSystemMessage, createUserMessage,
} from '@deepseek-ai/dsh-llm'
import {
  CONTEXT_TURNS, MESSAGE_CHAR_LIMIT, PREDICTION_PROMPT, truncate,
} from './predict.js'

export function buildRequestMessages(turns, route) {
  return [
    createSystemMessage(PREDICTION_PROMPT),
    ...turns.slice(-CONTEXT_TURNS).map((turn) => {
      const content = [{ type: 'text', text: truncate(turn.text, MESSAGE_CHAR_LIMIT) }]
      return turn.role === 'assistant'
        ? createAssistantMessage({
          content,
          source: {
            provider: turn.source?.provider ?? route.provider,
            model: turn.source?.model ?? route.model,
          },
        })
        : createUserMessage({ content, source: turn.source ?? { kind: 'user' } })
    }),
  ]
}
