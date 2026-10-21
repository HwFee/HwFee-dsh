/**
 * The client half: one settings row, and the mode it edits.
 *
 * @module lifecycle
 */

import { en, zh } from './locales.js'
import { LOCALE_NS, SETTINGS_ROW_ID } from './constants.js'
import { createSettingsRow } from './settings-row.js'
import { createRunShellRow } from './tool-view.js'
import { createModeStore, createShellInfoStore } from './store.js'
import { installCss } from './styles.js'

/** The Cordis event the mode is published on. Mirrors `MODE_EVENT` in lib/index.js. */
export const MODE_EVENT = 'git-bash/mode'

/**
 * The host route that carries the mode across the process boundary.
 *
 * Mirrors `MODE_PATH` / `MODE_MARKER_HEADER` in `lib/mode-route.js`. The page
 * and the host are separate processes: `ctx.emit` below reaches browser
 * listeners only, so the POST is the channel the host actually reads.
 */
export const MODE_PATH = '/dsh-git-bash/mode'
export const MODE_MARKER_HEADER = 'x-dsh-git-bash'

/**
 * Build the plugin's `apply`.
 *
 * @param {object} deps
 * @param {object} deps.React the host React
 * @param {object | null} deps.primitives the host's ui-primitives, or null
 * @returns {(ctx: object) => void} the plugin's `apply`
 */
export function createLifecycle({ React, primitives }) {
  const ShellRow = createSettingsRow({ React, primitives })
  const RunShellRow = createRunShellRow({ React })

  return function apply(ctx) {
    // BLOCK BODY, NOT A CONCISE ARROW. `register` returns the disposer that
    // drops these dictionaries; handing it back to `ctx.effect` is what lets a
    // disable/enable cycle re-register without tripping the service's duplicate
    // check. The audit recognises the explicit `return` shape only — see
    // `checkLocaleDisposers` in tools/audit.mjs.
    ctx.effect(() => {
      return ctx.locale.register(LOCALE_NS, { en, zh })
    }, 'dsh-git-bash: strings')

    ctx.effect(
      () => installCss(typeof document === 'undefined' ? undefined : document),
      'dsh-git-bash: row stylesheet',
    )

    const storage = typeof localStorage === 'undefined' ? undefined : localStorage

    // WHERE THE SHELL PATH COMES FROM. The host publishes it as a boot global
    // (see `SHELL_GLOBAL` in lib/index.js) because it can probe the filesystem
    // and the browser cannot. A missing global — an older build, or a page
    // served before resolution finished — reads as "not found" rather than
    // throwing.
    const shellInfo = createShellInfoStore(
      typeof globalThis === 'undefined' ? undefined : globalThis,
    )
    ctx.effect(() => () => shellInfo.dispose(), 'dsh-git-bash: shell info store')

    // The mode. The page owns the preference (it has the settings UI), so every
    // write republishes to the host, and the NEXT tool call uses the new shell
    // rather than waiting for a reload.
    const modeStore = createModeStore(storage)
    ctx.effect(() => () => modeStore.dispose(), 'dsh-git-bash: mode store')

    const publish = () => {
      const mode = modeStore.getSnapshot()
      // In-process listeners (tests, an embedding host) read the Cordis event…
      ctx.emit(MODE_EVENT, { mode })
      // …and the HOST reads this POST. Host and client are two processes; a
      // Cordis event never crosses. Before the route existed, picking
      // "Windows PowerShell" repainted the row while every command still ran in
      // Git Bash. `keepalive` keeps a last-moment switch from being cancelled by
      // a reload; a failure is silent because the row's own state is already
      // committed and the next publish retries.
      if (typeof fetch !== 'function') return
      try {
        void fetch(MODE_PATH, {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: {
            'content-type': 'application/json',
            [MODE_MARKER_HEADER]: '1',
          },
          body: JSON.stringify({ mode }),
        }).catch(() => {})
      } catch (error) { /* a refusing host keeps the previous mode */ }
    }
    publish()
    ctx.effect(() => modeStore.subscribe(publish), 'dsh-git-bash: publish mode')

    ctx.slots.inject('settings.general.item', () => ctx.slots.register({
      name: 'settings.general.item',
      id: SETTINGS_ROW_ID,
      order: 43,
      locale: LOCALE_NS,
      // The stores as ORDINARY props, not a `hooks` entry: a function component
      // receives props, while `hooks:` builds a `useName(selector)` prop that
      // only a framework-aware occupant reads. See `store.js`.
      inject: () => ({
        modeStore,
        shellInfoStore: shellInfo,
        setMode: (value) => modeStore.set(value),
      }),
    }, ShellRow))

    // THE TOOL'S OWN CARD. Every command-shaped tool renders through this one
// view so the conversation reads the same whichever shell ran:
//
//   run_shell — this package's wire tool (generic card without a view);
//   pwsh      — the Windows host shell tool (also generic);
//   bash      — the POSIX host shell tool, which the host DOES draw with its
//               terminal card, so the registration below outranks it
//               (`priority` — the host renders the first live entry of the
//               keyed cell in priority order).
//
// The host's supported seam is `tool.call.toolview`, keyed by wire tool name;
// an uninstalled plugin simply leaves the host's own cards in place.
    for (const wireName of ['run_shell', 'pwsh', 'bash']) {
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: wireName,
        priority: 100,
        locale: LOCALE_NS,
      }, RunShellRow))
    }
  }
}
