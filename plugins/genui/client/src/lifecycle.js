/**
 * Registers the card as an occupant of `tool.call.toolview`.
 *
 * REGISTRATION SHAPE, taken from the host's own registrants
 * (`ask-question-toolview` in `@deepseek-ai/dsh-client-ui-tool`):
 *
 *   ctx.slots.inject('<slot>', () => ctx.slots.register({ name, key, locale }, Component))
 *
 * `key` is the wire tool name, matched against `entryKey` when the owner
 * dispatches; a keyed hit REPLACES the generic tool row. There is no `order` or
 * `priority` option on this slot — the key is the whole address.
 *
 * WHY THE REGISTRATION IS INSIDE `inject`. The factory's registrations are
 * disposed when the owning declaration collapses and reinstalled when it comes
 * back. Registering at `apply` time instead would leave the entry pointing at a
 * slot that no longer exists after a layout change.
 *
 * @module lifecycle
 */

import { createCard } from './card.js'
import { installCardCss } from './styles.js'
import { en, zh } from './locales.js'
import { LOCALE_NS, NODE_KIND, SLOT } from './constants.js'
import { readUiSpec } from '../../lib/spec.js'
import { createRenderUiNodeDefinition } from './render-ui-node.js'
import { createPlacementStore, SETTINGS_ROW_ID } from './settings.js'
import { createSettingsRow } from './settings-row.js'

/**
 * Build the function a card calls to answer the model, or null when the host
 * offers no such path.
 *
 * `conversation.send(text)` is the host's own composer path: it validates,
 * queues, and admits a user message exactly as if it had been typed. Reaching
 * it requires a SESSION SCOPE (`sessions.scope(id)`), which is why this runs in
 * the registration's `inject` factory rather than inside the component.
 *
 * The bridge is optional at every step: an older host, a profile without the
 * conversation plugin, or a session that has no binding all yield null, and the
 * card then renders without a send path — degraded, not broken. It is only ever
 * invoked from the confirmation button the CARD renders outside the frame (see
 * `card.js`), never from a message the frame sent.
 *
 * @param {object} ctx the plugin's client context
 * @param {unknown} sessionId the scope id the slot handed us
 * @returns {((text: string) => Promise<void>) | null} the bridge
 */
export function createConversationBridge(ctx, sessionId) {
  const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
  if (sessions === undefined || typeof sessions.scope !== 'function') return null
  let scoped
  try {
    scoped = sessions.scope(sessionId)
  } catch {
    return null
  }
  if (scoped === undefined || typeof scoped.get !== 'function') return null
  const conversation = scoped.get('conversation')
  if (conversation === undefined || typeof conversation.send !== 'function') return null

  return async function sendMessage(text) {
    const message = typeof text === 'string' ? text.trim() : ''
    if (message === '') throw new Error('interact() needs a non-empty message')
    await conversation.send(message)
  }
}

/**
 * Build the plugin's `apply`.
 *
 * Every dependency that has a side effect or a host binding — React, the slot
 * registry, the stylesheet, the locale table — is reached through the context
 * inside `apply`, so a disabled plugin leaves nothing behind.
 *
 * @param {object} deps
 * @param {object} deps.React host React
 * @param {string} deps.toolName the wire tool name this card answers
 * @returns {(ctx: object) => void} the plugin's `apply`
 */
export function createLifecycle({ React, toolName, primitives }) {
  const Card = createCard({ React, toolName, readSpec: readUiSpec })
  const SettingsRow = createSettingsRow({ React, primitives })

  return function apply(ctx) {
    // Dictionaries first: the registration below names this namespace, and a
    // namespace that does not exist yet yields raw keys for one render frame.
    //
    // The `return` is INLINE (`return ctx.locale.register(…)`) rather than a
    // `const off = …` pair. Both dispose correctly, but the repository audit
    // recognises only the shapes it can prove from source, and a check that
    // cries wolf gets switched off — see `checkLocaleDisposers` in
    // tools/audit.mjs. A discarded result here would mean the dictionaries can
    // never be unregistered and the next enable trips a duplicate check.
    ctx.effect(() => {
      return ctx.locale.register(LOCALE_NS, { en, zh })
    }, 'dsh-genui: card strings')

    // The stylesheet is one tag for every card. `document` is read here rather
    // than at module scope so a non-browser import stays harmless.
    ctx.effect(
      () => installCardCss(typeof document === 'undefined' ? undefined : document),
      'dsh-genui: card stylesheet',
    )

    // THE ANSWER NODE. The card claims its call exclusively and renders as a
    // `conversation.chat.node` at `groupTree: 'turn'`, so it interrupts the
    // host's process fold instead of being buried inside it. See
    // `render-ui-node.js` for the mechanism and the DEPTH table it relies on.
    //
    // Registered before the toolview below because it is the primary path; the
    // toolview is the fallback for hosts that reject a business node and for the
    // trajectory view, which renders calls by kind rather than by claim.
    //
    // `uiConversation` is declared in this plugin's `inject`, so the property
    // read is legal. Two independent things had to be true for that, and the
    // first version got both wrong — the whole web boot died with only
    // "@hwfee/dsh-genui: failed" printed:
    //
    //   1. `client/src/index.js` must list `uiConversation` in `inject`.
    //   2. `package.json` `dsh.client.inject` must list the PACKAGE
    //      `@deepseek-ai/dsh-client-ui-conversation` — that list is package ids,
    //      not service names, and it is what loads the module that provides the
    //      service in the first place.
    //
    // `test/answer-node.test.mjs` now asserts both halves.
    const uiConversation = ctx.uiConversation
    if (typeof uiConversation?.events?.register === 'function') {
      ctx.effect(
        () => uiConversation.events.register(createRenderUiNodeDefinition()),
        'dsh-genui: render_ui answer node',
      )
    }

    // THE TITLE PLACEMENT, as one shared store.
    //
    // A single source of truth read by (a) every mounted card and (b) the
    // settings row. Writing through `set()` updates storage AND notifies, so the
    // cards already on screen move the moment the user picks a new position —
    // a preference that only applies to the next card would look broken.
    const placementStore = createPlacementStore(
      typeof localStorage === 'undefined' ? undefined : localStorage,
    )
    ctx.effect(() => () => placementStore.dispose(), 'dsh-genui: title placement store')

    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
      name: 'conversation.chat.node',
      key: NODE_KIND,
      locale: LOCALE_NS,
      inject: (sessionId) => {
        const sendMessage = createConversationBridge(ctx, sessionId)
        return {
          ...sendMessage === null ? {} : { sendMessage },
          // The store ITSELF, not a `hooks` entry.
          //
          // `hooks: { name: store }` makes the framework build a
          // `useName(selector)` prop for the OCCUPANT, and a plain function
          // component that reads props never receives it — so the setting
          // appeared to do nothing to cards already on screen. Passing the store
          // lets the card call React.useSyncExternalStore directly, which React
          // guarantees and which the card can also be tested for.
          titlePlacementStore: placementStore,
        }
      },
    }, Card))

    // THE SETTINGS ROW. Registered through the host's general-settings slot so
    // the preference lives where the user expects it, next to the other
    // appearance controls, and not in a plugin-owned page.
    ctx.slots.inject('settings.general.item', () => ctx.slots.register({
      name: 'settings.general.item',
      id: SETTINGS_ROW_ID,
      order: 42,
      locale: LOCALE_NS,
      inject: () => ({
        hooks: { titlePlacement: placementStore },
        setTitlePlacement: (value) => placementStore.set(value),
      }),
    }, SettingsRow))

    ctx.slots.inject(SLOT, () => ctx.slots.register({
      name: SLOT,
      key: toolName,
      locale: LOCALE_NS,
      // A card that can only be READ is a picture. The host's own composer sends
      // through `conversation.send`, addressed by session scope; the card gets
      // that same capability as `interact(text)` inside the snippet, so a button
      // the model drew can answer the model.
      //
      // WHY THE LOOKUP IS HERE AND NOT IN THE COMPONENT. The `inject` factory
      // runs in the plugin's `apply` world with the session id already resolved,
      // which is the only place `sessions.scope(id)` is legal. A component cannot
      // reach a service; it can only receive one.
      inject: (sessionId) => {
        const sendMessage = createConversationBridge(ctx, sessionId)
        return sendMessage === null ? {} : { sendMessage }
      },
    }, Card))
  }
}
