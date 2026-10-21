/**
 * The card as THE ANSWER, not as a tool row.
 *
 * WHAT THIS FILE REPLACES. Until this node existed, a card was a `tool.call.toolview`
 * occupant: it rendered inside the tool-call row, which the host then folded into
 * "Completed in Ns → Called tools" as soon as the turn closed. The card — the one
 * thing the user asked for — was behind a disclosure. That is a category error:
 * in every host that ships this feature the generated UI *is* the answer (ZCode's
 * Gen UI doc states it directly: the page is shown once the answer completes,
 * separate from the work steps).
 *
 * HOW A NODE BECOMES THE ANSWER.
 *
 *   1. `uiConversation.events.register` claims the `render_ui` call. The match
 *      result carries `exclusive: true`, which the assembler uses to reject every
 *      other definition for that `(event, target)`: the generic `tool-call` row
 *      therefore never materializes for this call, and no duplicate row appears.
 *      (`dsh-client-ui-conversation` `acceptEvent`: an exclusive claim is recorded
 *      first, and non-exclusive results on the same target are skipped.)
 *   2. `buildViewNode` publishes a node of its own kind. The Chat flow renders it
 *      through the `conversation.chat.node` slot we register under that kind.
 *   3. The node declares `groupTree: 'turn'`. DEPTH is
 *      `{ exchange: 0, input: 1, turn: 2, process: 3 }` and a node joins the
 *      process group only when `isAtOrOutside(node, 'process')` is false — i.e.
 *      only when its own tree is *inside* process. `turn` is outside process, so
 *      the card interrupts the group: the steps above it fold on their own, the
 *      card stays visible, and the turn's remaining rows continue after it.
 *
 * WHY THE VIEW IS A SLOT ENTRY AND NOT A FUNCTION HERE. The card itself already
 * exists as one component (`card.js`); this node only decides WHERE it renders.
 * The view is registered in `lifecycle.js` against the same `render-ui` key so the
 * two halves cannot drift.
 *
 * RELATION TO THE TOOLVIEW. Both registrations stay. The node path is what normal
 * sessions use; the toolview remains for hosts (or older profiles) that reject a
 * business node, and for the trajectory/inspect views that render tool calls by
 * kind. They never both render in the Chat flow, because the exclusive claim
 * removes the tool-call row this node replaces.
 *
 * @module render-ui-node
 */

import { readUiSpec } from '../../lib/spec.js'
import { NODE_KIND } from './constants.js'

/**
 * Build the Conversation node definition.
 *
 * The card is derived from the COMMITTED call's `argsRaw`, exactly like the
 * toolview: a replayed or forked session must draw the same card from the same
 * bytes, so nothing here holds live plugin memory.
 *
 * `start` runs on `tool/call` (arguments complete enough to name a title) and
 * `update` folds the `tool/result` that settles it. The node's `data` carries the
 * parsed spec plus the two failure strings the card already knows how to render,
 * so the view stays a pure function of node data.
 *
 * @returns {object} the definition `ctx.uiConversation.events.register` accepts
 */
export function createRenderUiNodeDefinition() {
  return {
    kind: NODE_KIND,
    target: 'chat',

    /**
     * Claim this call for our target.
     *
     * `exclusive` on the START is what removes the generic tool row; without it
     * both would render. The id is the callId, so a replayed session reuses the
     * same Context and a forked one starts a fresh node.
     *
     * THE RESULT IS DELIBERATELY **NOT** EXCLUSIVE. Making it exclusive was the
     * bug behind "every tool row turns amber and says interrupted": an exclusive
     * claim is not read by this definition alone — `dispatchInput` rejects EVERY
     * other non-exclusive definition on the same target
     * (`dsh-client-ui-conversation/lib/client.js:2838`). This `match` answers for
     * any `tool/result` that carries a callId, so it claimed the results of
     * pwsh, read, grep — every tool in the conversation. The host's own
     * `toolDefinition` (target `chat`, `dsh-client-ui-chat/lib/client.js:10388`)
     * therefore never folded a result into its row; once the step closed,
     * `interruption()` + `projectBlock` replaced the missing result with a
     * synthetic `{ isError: true, error: { code: 'interrupted' } }`
     * (`:10312`, `:10351`), which the row renders as `state: 'stopped'` and
     * paints with `--dsw-alias-state-warn-label`.
     *
     * Dropping `exclusive` here costs nothing: the START claim already kept the
     * host from creating a row for our call, so its result has no Context to
     * update, and `buildViewNode` returns null for an update-only one.
     */
    match(event) {
      if (event.type === 'tool/call') {
        if (event.data?.name !== 'render_ui') return null
        return { id: String(event.data.callId), role: 'start', exclusive: true }
      }
      if (event.type === 'tool/result') {
        const callId = event.data?.message?.source?.callId
        if (typeof callId !== 'string') return null
        return { id: callId, role: 'update' }
      }
      return null
    },

    start(_context, match) {
      if (match.event.type !== 'tool/call') {
        throw new Error('render-ui node start requires tool/call')
      }
      const { callId, arguments: argsRaw } = match.event.data
      const spec = readUiSpec(argsRaw)
      return {
        seq: match.event.seq,
        callId: String(callId),
        argsRaw: typeof argsRaw === 'string' ? argsRaw : '',
        // `null` means "the payload is unreadable"; the view then renders the
        // invalid state rather than an empty card.
        spec,
        errorText: '',
      }
    },

    update(context, match) {
      if (match.event.type !== 'tool/result') return context.state
      const message = match.event.data.message
      const isError = match.event.data.isError === true
      return {
        ...context.state,
        errorText: isError ? contentText(message) : '',
      }
    },

    buildViewNode(context) {
      if (context.state === undefined) return null
      const { seq, ...data } = context.state
      return {
        key: context.key,
        kind: NODE_KIND,
        id: context.id,
        target: 'chat',
        anchorSeq: seq,
        location: context.start?.location ?? { kind: 'unresolved' },
        visibility: 'visible',
        // Outside `process`: the card interrupts the fold instead of joining it.
        groupTree: 'turn',
        data,
      }
    },
  }
}

/**
 * Flatten a result message's content to text.
 *
 * The same rule the toolview uses (`blockContentText` in card.js): text blocks
 * are the only content a tool error reliably carries. Duplicated rather than
 * imported because the two run in different shapes — a block there, a message
 * here — and a shared helper would have to branch on which.
 *
 * @param {object} message the tool result message
 * @returns {string} joined text, or '' when none
 */
function contentText(message) {
  const content = Array.isArray(message?.content) ? message.content : []
  return content
    .filter((part) => part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim()
}
