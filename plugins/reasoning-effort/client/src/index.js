/**
 * dsh-reasoning-effort client bundle.
 *
 * Sources live in `client/src/`; `npm run build` bundles them into
 * `client/client.js` in the host's module-loader format
 * (`window.__ModuleLoader__.load`).
 *
 * WHAT IT DOES. One settings row: a discrete slider over the current model's
 * reasoning-effort levels. Moving it re-submits the current provider/model with
 * the new effort through `session.selectModel` — the same Host call the
 * composer's own effort pane makes — so the change applies to the next request
 * exactly as if the user had picked the level from the model menu.
 *
 * WHAT IT DELIBERATELY IS NOT. It is not a fixed five-stop control. The stop
 * count is the length of `reasoning.efforts[]` in the live catalog for the
 * selected model: two levels → two stops, three → three, none → no row at all,
 * one → a read-only label (a one-position slider is a dead control). The
 * reference component this design is ported from hardcodes Claude's five
 * levels; that list is used here only as a copy table keyed by id.
 *
 * READS.  the active session (`sessions.list` → `retainedBy.mainView`), its
 *         durable selection (`projections.faceOf('modelSelection')`), and the
 *         Host model catalog (`remote.session.modelCatalog()`).
 * WRITES. `remote.session.selectModel({ sessionId, provider, model,
 *         reasoningEffort })`, with the CURRENT provider/model plus the chosen
 *         level. An id the model does not advertise is refused locally.
 *
 * Live: the catalog reloads on the same four Host events the host's own model
 * seat listens to, and the session list and selection projection are subscribed
 * directly, so a model switch changes the stop count immediately and clamps the
 * current value.
 */

import { PLUGIN_ID } from './constants.js'
import { createLifecycle } from './lifecycle.js'

// React and the primitives barrel come from the host's frozen platform module
// table. Both are absent in a non-browser context, so the exported `apply`
// degrades to a no-op instead of throwing on its first render.
let React = null
try { React = require('react') } catch (error) { React = null }

let primitives = null
try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { primitives = null }

export const name = PLUGIN_ID

/**
 * `slots` and `locale` are the services this plugin cannot render without, so
 * they are declared here. `sessions` and `remote` are waited for inside
 * `apply` and are deliberately NOT hard dependencies: a composition without them
 * should load the plugin and register no row, not fail to start.
 */
export const inject = ['slots', 'locale']

export const apply = createLifecycle({ React, primitives })
