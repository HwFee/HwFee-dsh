/**
 * Registration: one row in Settings → General.
 *
 * WHERE IT GOES. `settings.general.item` today, with its own id and order, so
 * it works independently of any other plugin. The natural long-term home is the
 * 外观 / Appearance page; moving it there is a one-line change — swap the slot
 * name in `settingsRow()` below for `settings.appearance.item` once that page
 * exists in the installed host. Nothing else about this plugin assumes General.
 *
 * DEGRADATION, in order:
 *   - no `slots` service → nothing to mount, one warning, no throw;
 *   - no `sessions`, `remote` or `remote.session` service → the row is not
 *     registered (a slider that cannot write is worse than none). The dotted
 *     `remote.session` name is its own Cordis service, not a property of
 *     `remote`; see the comment on the inject below;
 *   - no `modelCatalog` method or no advertised levels → the row renders
 *     nothing (see the N === 0 branch in panel.js);
 *   - a failed catalog read → recorded and shown, never swallowed;
 *   - a failed write → the error line, thumb untouched.
 *
 * The stylesheet is installed with the registration and removed with it, so a
 * disabled plugin leaves no tag behind in the host document.
 */

import { LOCALE_NS, en, zh } from './locales.js'
import { installPanelCss, removePanelCss } from './styles.js'
import { createEffortController } from './controller.js'
import { createPanel } from './panel.js'
import { SETTINGS_ROW_ID, SETTINGS_ROW_ORDER } from './constants.js'

/**
 * @param {object} deps
 * @param {object} deps.React host React, or null when the module table lacks it
 * @param {object} deps.primitives host primitives barrel, or null
 * @returns {(ctx: object) => void} the plugin's `apply`
 */
export function createLifecycle({ React, primitives }) {
  const uiReady = Boolean(React) && Boolean(primitives)
  let applied = false
  let warned = false

  function warnOnce(message) {
    if (warned) return
    warned = true
    console.warn(message)
  }

  function apply(ctx) {
    if (!ctx || applied) return
    if (!uiReady) {
      warnOnce('dsh-reasoning-effort: react/primitives unavailable; the effort row is not registered')
      return
    }
    const slots = ctx.slots
    if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
      warnOnce('dsh-reasoning-effort: slots service unavailable; the effort row is not registered')
      return
    }

    applied = true

    // Copy rides the host locale service like every host bundle does. Optional:
    // without it the row falls back to the embedded English table.
    //
    // The disposer is RETURNED, not discarded. `register` rejects a second
    // dictionary under a namespace that is still registered, so dropping it
    // means a disable/enable cycle leaves the dictionaries behind and the
    // re-enabled plugin comes back with no translations at all (cds-theme
    // lifecycle.js does the same thing for the same reason).
    if (ctx.locale && typeof ctx.locale.register === 'function') {
      ctx.effect(function () {
        return ctx.locale.register(LOCALE_NS, { en: en, zh: zh })
      }, 'dsh-reasoning-effort: locale dictionaries')
    }

    ctx.effect(function () {
      installPanelCss()
      return function () {
        applied = false
        removePanelCss()
      }
    }, 'dsh-reasoning-effort: row styles')

    // The row reads/writes three host services.
    //
    // `remote.session` MUST be named as its own dependency. `api-gateway` mounts
    // each Remote namespace as a SEPARATE Cordis service
    // (`RemoteNamespaceService` -> `super(ctx, 'remote.' + name)`), so
    // `remote.session` is not a property of `remote`: reading it from a fiber
    // that did not inject `'remote.session'` throws
    // `cannot get property "remote.session" without inject`. Injecting the name
    // also makes the plugin wait until the namespace is actually mounted, which
    // the gateway does asynchronously after `remote` itself registers — without
    // it the first catalog read could race the mount as well.
    //
    // The host's own model-selection package declares exactly the same pair:
    // `inject = [..., 'remote', 'remote.session']`.
    ctx.inject(['sessions', 'remote', 'remote.session'], function (scope) {
      const remote = scope.get('remote')
      const controller = createEffortController({
        remote: remote,
        remoteSession: scope.get('remote.session'),
        sessions: scope.get('sessions'),
      })
      const panel = createPanel({ React: React, controller: controller })

      controller.start()
      scope.effect(function () {
        return function () { controller.dispose() }
      }, 'dsh-reasoning-effort: effort controller')

      // `slots` comes from the OUTER context (the module's own `inject`
      // declares it). Reading it off the nested inject scope happens to work
      // through Cordis inheritance, but the outer reference is the one this
      // file already validated above.
      slots.inject('settings.general.item', function () {
        return slots.register({
          name: 'settings.general.item',
          id: SETTINGS_ROW_ID,
          order: SETTINGS_ROW_ORDER,
          locale: LOCALE_NS,
        }, panel.EffortRow)
      })
    })
  }

  return apply
}
