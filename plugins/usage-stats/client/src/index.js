/**
 * dsh-usage-stats client bundle.
 *
 * Sources live in `client/src/`; `npm run build` bundles them into
 * `client/client.js` in the host's module-loader format
 * (`window.__ModuleLoader__.load`).
 *
 * WHAT IT DOES: renders one panel on the blank-session hero — the screen the
 * user lands on when they click "New Session", below the "Into the Unknown"
 * headline and above the composer. The panel carries six numbers (sessions,
 * messages, total tokens, active days, peak hour, favourite model), an activity
 * heatmap, and one line comparing the token spend against a Chinese novel.
 *
 * WHERE THE NUMBERS COME FROM: the Host half aggregates the session logs under
 * `~/.dsh/sessions` and serves them at `/dsh-usage-stats/summary`. The browser
 * cannot read those files and the logs are zstd-framed, so this is a Node job.
 * The panel is pure presentation; all the arithmetic the user sees (ranges,
 * formatting, the heatmap grid, the book comparison) lives in `stats.js` and is
 * unit-tested without a DOM.
 *
 * WHEN IT SHOWS: only while the conversation is blank — the same predicate the
 * host uses to draw the hero itself (`session.blank && !session.running &&
 * !session.promptAttempted`). Once the first turn starts the panel is gone, so
 * it never clutters an active conversation.
 *
 * HOW IT LOADS: the summary is fetched through one shared short-TTL cache
 * (`summary-cache.js`). Reopening the panel — which happens on every blank
 * session — paints the last answer immediately from `peek()` and only asks the
 * browser/Host again when the cached copy is stale; an ordinary open never sends
 * `?refresh=1`, so the Host's persistent per-file cache stays useful. The Host
 * marks a response `stale` when it reused a parse for a log that was still being
 * written; the panel then asks again once with `{ refresh: true }` (incremental,
 * not forced), so a transient undercount corrects itself without user action.
 *
 * SETTINGS ROWS: the plugin contributes TWO entries that moved together to the
 * 主题定制 / Theme page (`settings.appearance.item`, hosted by cds-theme) with a
 * bounded-wait fallback to General (`settings.general.item`): the panel body
 * height (id `dsh-usage-stats-panel-height`, order 40) and the number-unit mode
 * (id `dsh-usage-stats-units`, order 41). The policy and its tests live in
 * `settings-slot.js`. The height lives in localStorage
 * (`dsh-usage-stats/settings`), is clamped to the slider's 240–520 px range, and
 * reaches the stylesheet as the `--dus-body-height` custom property that the
 * shared tab body `.dus-body` consumes — a drag resizes BOTH tabs live. The
 * unit mode (`auto` | `short` | `myriad`) is stored beside it; `auto` is
 * resolved per render from the active locale, and every number the panel prints
 * — cards, model rows, heatmap text and aria text, book line — goes through the
 * same formatter (`stats.formatNumber`), so a mode or language switch
 * re-formats the whole panel without a reload.
 */

import { PLUGIN_ID, USAGE_PATH, USAGE_MARKER_HEADER, USAGE_MARKER_VALUE } from './constants.js'
import { createPanel } from './panel.js'
import { createLifecycle } from './lifecycle.js'
import { createSettingsStore } from './settings.js'
import { createSummaryCache } from './summary-cache.js'

// React comes from the host's frozen platform module table. It is absent in a
// non-browser context, so every entry point guards on it instead of assuming it.
let React = null
try { React = require('react') } catch (error) { React = null }

// The panel is built from plain elements and host tokens; the barrel is loaded
// only so the registration can refuse to run in a client that lacks it.
let primitives = null
try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { primitives = null }

/**
 * Default summary source, and the only place this plugin touches the network.
 *
 * It is a plain dependency of the lifecycle rather than a module-level fetch
 * inside the panel, so the panel renders in a test with a stub and no server.
 * An ORDINARY open never forces: the route's response is `no-store`, so there is
 * nothing to gain from a query parameter, and `?refresh=1` would bypass the
 * Host's parse cache and re-decompress the whole corpus. `force` is reserved for
 * an explicit refresh and is the only thing that appends the parameter.
 */
async function fetchSummaryFromHost(options) {
  const force = Boolean(options && options.force)
  const url = force ? USAGE_PATH + '?refresh=1' : USAGE_PATH
  // The Host refuses any request without this header (see `lib/usage-route.js`).
  // Same-origin, so it never triggers a CORS preflight.
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      [USAGE_MARKER_HEADER]: USAGE_MARKER_VALUE,
    },
  })
  if (!response.ok) {
    throw new Error('dsh-usage-stats: summary request failed with status ' + response.status)
  }
  return response.json()
}

// One shared short-TTL cache: the panel reopens on every blank session, and a
// summary fetched seconds ago is still good. `peek()` lets the panel paint it on
// its first frame instead of flashing the loading row.
const summaryCache = createSummaryCache({ fetcher: fetchSummaryFromHost })

// The panel's one preference (body height) is persisted in localStorage and
// shared by the hero panel and the General-settings row through this store.
// Reading it here means a remount or a page reload picks the value back up.
// 面板高度偏好存在 localStorage，由 hero 面板与通用设置行共享。
let storage = null
try { storage = typeof window === 'undefined' ? null : window.localStorage } catch (error) { storage = null }

const settings = createSettingsStore(storage)
const panel = createPanel({ React, primitives, settings })
const uiReady = Boolean(React) && Boolean(primitives)

// Warned at module scope so a host without the renderer gets exactly one line
// rather than one per apply attempt.
if (!uiReady) {
  console.warn('dsh-usage-stats: react/primitives unavailable; usage panel not registered')
}

export const name = PLUGIN_ID

/**
 * `slots` is required — the panel is a slot occupant. `locale` supplies the
 * `t` prop on the registration and is required too: it is part of the host
 * client surface, and the lifecycle still degrades to English if a host omits
 * it. `theme` stays unused: the panel reads theme tokens through CSS
 * variables, which work with or without the CDS theme plugin installed.
 */
export const inject = ['slots', 'locale']

/**
 * The plugin body. Without React or the primitives barrel there is nothing to
 * mount, so the exported `apply` is a no-op instead of a lifecycle that would
 * fail on its first render.
 */
export const apply = uiReady
  ? createLifecycle({
    React,
    primitives,
    panel,
    fetchSummary: summaryCache.load,
    peekSummary: summaryCache.peek,
    settings,
  })
  : function applyWithoutClientUi() {}
