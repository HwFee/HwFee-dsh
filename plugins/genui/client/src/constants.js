/**
 * The package's own name — and therefore the only id this client half may
 * register under.
 *
 * The host composes one client-module graph row per package, keyed by the
 * package name, and a bundle that registers anything else never satisfies its
 * own row: the loader retries it through the one-resource URL, the bundle
 * executes twice, and web boot dies with
 * `client-modules: duplicate factory registration`.
 *
 * `tools/build-client.mjs` reads the name from package.json rather than
 * hardcoding it, and `test/manifest.test.mjs` pins the shipped artifact, so a
 * rename cannot half-apply.
 */
export const PLUGIN_ID = '@hwfee/dsh-genui'

/**
 * The slot this plugin occupies, and the wire tool name it keys on.
 *
 * The slot string is the literal the host declares when it builds the tool
 * call tree; a typo here registers into nothing and the card never appears.
 */
export const SLOT = 'tool.call.toolview'

/** Re-exported so the card and the lifecycle agree on one constant. */
export { TOOL_NAME } from '../../lib/spec.js'

/** Locale namespace for the card's own strings. */
export const LOCALE_NS = 'dsh-genui'

/**
 * The Chat node kind that carries a card as the ANSWER.
 *
 * Registered twice, under the same string: once as a Conversation event
 * definition (which claims the call and spaces its `groupTree`), once as an
 * occupant of the `conversation.chat.node` slot (which renders the card). One
 * constant so the two cannot disagree — a mismatch would leave the host holding
 * a node with no renderer, i.e. the card silently vanishes.
 */
export const NODE_KIND = 'render-ui'
