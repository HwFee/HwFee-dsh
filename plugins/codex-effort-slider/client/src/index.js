/**
 * The browser half of `@hwfee/dsh-codex-effort-slider`.
 *
 * What it does, in one sentence: it finds the host model menu's own 推理等级 row and
 * grows it to host a Codex-style continuous effort slider, whose fill runs blue →
 * violet and lights up a violet nebula with starfield particles at the high end.
 *
 * WHAT IT DOES NOT DO — each of these is a decision, not an omission:
 *   · it adds nothing to the composer's tool row (no pill, no floating chip);
 *   · it never injects a message, listens to a turn event, or builds conversation
 *     content. There is structurally no path to do so;
 *   · it never touches a menu that is not the model root panel of ITS OWN composer
 *     (`bridge.js` proves the panel by its model row before decorating anything);
 *   · it renders no control at all when the current model advertises no reasoning
 *     levels, or when the catalog has not loaded — an inert slider would lie.
 *
 * LIFECYCLE. Everything installed is disposed by the same `ctx.effect` that
 * installed it: the slot registration, the stylesheet, the popover and its document
 * listeners, the DOM bridge (observer included), and the directory accessors.
 * Disabling the plugin therefore leaves the host's menu exactly as it found it.
 *
 * PORTED FROM `Microqian2th/dsh-codex-effort-slider` (MIT). The attribution and the
 * exact list of modifications live in `licenses/NOTICE.md` and `README.md`.
 */

import { PLUGIN_ID, SLOT_NAME, ENTRY_ID, ENTRY_ORDER } from './constants.js'
import { installStyles } from './styles.js'
import { createSettingsStore, createSettingsUi } from './settings.js'
import { createSliderComponent, createTrace } from './component.js'

export const name = PLUGIN_ID

/**
 * Services this plugin uses.
 *
 * `remote` and `remote.session` are declared because the DIRECTORY RESOLUTION runs
 * on the caller's own context: `modelDirectories.directoryFor(sessionId)` builds a
 * per-session directory that reaches through `ctx.remote.session` (the host
 * service's own `static inject` is `['sessions', 'remote', 'remote.session']`,
 * `dsh-client-ui-model-selection/lib/client.js:986-999`). Without those two names,
 * resolution keeps failing with "session resolved no scope" long enough that the
 * level list stays empty (`levelCount = 0`), and every release aborts its
 * write-back — which the user feels as "it pauses, then jumps a level".
 *
 * Deliberately NOT injected: `locale` and `theme`. Declaring a service that is not
 * provided leaves the fiber PENDING, which costs more than two lines of copy.
 */
export const inject = ['slots', 'sessions', 'modelDirectories', 'remote', 'remote.session']

const React = (function requireReact() {
  try {
    return require('react')
  } catch (error) {
    return null
  }
})()

const ReactDOM = (function requireReactDOM() {
  try {
    return require('react-dom')
  } catch (error) {
    return null
  }
})()

/** Wire the plugin. Safe to call with no React (a Node import of this module). */
export const apply = React === null || ReactDOM === null
  ? function applyWithoutReact() {}
  : function apply(ctx) {
    const doc = typeof document === 'undefined' ? null : document
    const win = typeof window === 'undefined' ? null : window

    // One `ctx.effect` owns every install/teardown pair, so the ordering is obvious
    // and a partial failure cannot leave half a plugin mounted.
    ctx.effect(function () {
      const styles = installStyles(doc)

      let storage
      try {
        // A storage access throws synchronously in private mode / over quota, so it
        // is read inside a try and degrades to in-memory defaults.
        storage = win && win.localStorage ? win.localStorage : undefined
      } catch (error) {
        storage = undefined
      }
      const settings = createSettingsStore({ storage, win })
      const trace = createTrace()
      const settingsUi = createSettingsUi({
        doc,
        win,
        store: settings,
        copy: function (text) {
          if (!win || !win.navigator || !win.navigator.clipboard) throw new Error('no clipboard')
          return win.navigator.clipboard.writeText(text)
        },
        diagnostics: function () { return trace.dump() },
      })
      settingsUi.install()

      /** Does the SYSTEM ask for reduced motion? Checked per render, so it updates with the OS setting. */
      function reducedMotion() {
        try {
          return !!(win && typeof win.matchMedia === 'function'
            && win.matchMedia('(prefers-reduced-motion: reduce)').matches === true)
        } catch (error) {
          return false
        }
      }

      const Component = createSliderComponent({
        React,
        ReactDOM,
        ctx,
        settings,
        reducedMotion,
        trace: function (entry) { trace.push(entry) },
      })

      /** Registration disposer, when the host's slot service returns one. */
      let removeSlot = null
      try {
        ctx.slots.inject(SLOT_NAME, function () {
          const registration = ctx.slots.register(
            {
              name: SLOT_NAME,
              id: ENTRY_ID,
              order: ENTRY_ORDER,
              label: function () { return 'Reasoning effort' },
              // A second source for the session id (standard props usually carry it;
              // both paths agree on `props.sessionId`).
              inject: function (sessionId) { return { sessionId } },
            },
            function SlotComponent(props) {
              return React.createElement(Component, props)
            },
          )
          if (registration && typeof registration.dispose === 'function') removeSlot = function () { registration.dispose() }
          return registration
        })
      } catch (error) {
        // A failed registration only means no control; the host composer is untouched.
        try {
          console.error('[codex-effort-slider] 插槽注册失败，滑条不会出现：', error)
        } catch (inner) { /* ignore */ }
      }

      return function dispose() {
        // Reverse order: the popover's listeners must not outlive the sheet or store.
        if (removeSlot !== null) {
          try { removeSlot() } catch (error) { /* ignore */ }
          removeSlot = null
        }
        settingsUi.dispose()
        styles.dispose()
        trace.clear()
      }
    }, 'dsh-codex-effort-slider: effort slider')
  }
