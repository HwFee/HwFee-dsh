/**
 * The browser half of `@hwfee/dsh-genui`.
 *
 * It registers one occupant of `tool.call.toolview` under the key `render_ui`.
 * A keyed hit REPLACES the generic tool row, so the user sees a live card where
 * the call would otherwise be a collapsed "Render UI" line.
 *
 * Sources live beside this file; `npm run build` bundles them into
 * `client/client.js` in the host's module-loader format.
 *
 * WHAT SURVIVES A RELOAD. The card is not held in plugin memory — it is
 * re-derived from the committed tool call's arguments on every mount. That is
 * why `lib/spec.js` and the arg parser are shared with the Host half instead of
 * being duplicated here: a forked or replayed session must render the same card
 * from the same bytes.
 */

import { PLUGIN_ID, TOOL_NAME } from './constants.js'
import { createLifecycle } from './lifecycle.js'

export const name = PLUGIN_ID

/**
 * `slots` is required — this plugin is a slot occupant. `locale` supplies the
 * `t` prop; the lifecycle falls back to the bundled English dictionary when a
 * host omits it, so it is listed but never assumed to be present at render time.
 *
 * `uiConversation` is what makes a card the ANSWER rather than a tool row: the
 * answer node registers a Conversation event definition through it. It is listed
 * here because the host requires a service touched as a property (`ctx.<name>`)
 * to be declared, and an undeclared one throws inside `apply` — which the host
 * reports only as "@hwfee/dsh-genui: failed", with no field name. This entry is
 * not optional: without it the web boot fails outright.
 *
 * `sessions` is NOT listed: the conversation bridge reaches it through
 * `ctx.get('sessions')`, which returns undefined instead of throwing, so a host
 * without it degrades to a card that cannot send instead of a plugin that
 * cannot load.
 */
export const inject = ['slots', 'locale', 'uiConversation']

// React comes from the host's frozen platform module table. It is absent in a
// non-browser context (a unit test importing this file for its `name`), so the
// entry point degrades to a no-op apply instead of throwing at import time.
let React = null
try { React = require('react') } catch (error) { React = null }

// The host's UI primitives, for the settings row's menu. OPTIONAL by design: a
// host that does not expose them still gets the row, rendered as a plain select.
// Same shape as the sibling plugins — a hard require here would take the whole
// card down for a preference control.
let primitives = null
try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { primitives = null }

export const apply = React === null
  ? function applyWithoutReact() {}
  : createLifecycle({ React, toolName: TOOL_NAME, primitives })
