import { installPanelCss, removePanelCss } from './panel.js'
import { LOCALE_NS, en, zh, makeT } from './locales.js'
import { createGreetingMarker } from './hero.js'
import { createTableMarker } from './markdown.js'
import { createAppearanceIconMarker } from './navicon.js'
import { createPasteConverter } from './paste.js'
import { createHeroRipple } from './ripple.js'
import { createDiffNumberMarker } from './diffnumbers.js'
import { installVariantHooks } from './varianthooks.js'
import { createNativeCopyMarker } from './native-copy.js'
import { createDiffView } from './diffview.js'
import {
  appearanceSectionOptions, createAppearanceSection, registerSettingsRows,
} from './section.js'

// ------------------------------------------------------------ lifecycle

export function createLifecycle({ settings, bridge, styles, panel, React, primitives, themeMode, bindTheme }) {
  let applied = false

  /**
   * Re-apply shortly after mount.
   *
   * The theme service publishes its snapshot on registration and the presenter
   * applies it on the next `theme/change`; our layer is composed into that same
   * snapshot, so normally one pass is enough. The deferred pass covers the case
   * where the host's own sheets land after ours (a late `body` attribute swap
   * re-selects our dark rules) and costs nothing when nothing changed —
   * `buildCss` is pure and the tag is only rewritten when the text differs.
   */
  function scheduleReapply() {
    if (typeof window === 'undefined') return function () {}
    let stopped = false
    const run = function () {
      if (stopped) return
      bridge.sync()
      styles.apply()
    }
    const cancel = []
    if (typeof window.requestAnimationFrame === 'function') {
      const id = window.requestAnimationFrame(run)
      if (typeof window.cancelAnimationFrame === 'function') {
        cancel.push(function () { window.cancelAnimationFrame(id) })
      }
    } else {
      const id = setTimeout(run, 16)
      cancel.push(function () { clearTimeout(id) })
    }
    const late = setTimeout(run, 300)
    cancel.push(function () { clearTimeout(late) })
    return function () {
      stopped = true
      for (const c of cancel) c()
    }
  }

  function apply(ctx) {
    if (applied || !ctx) return
    applied = true

    // The theme service is a HARD dependency, declared in the module's `inject`
    // export, so by the time this body runs it exists. It is still read through
    // a guard: `ctx.inject` as an export makes Cordis wait, but a composition
    // that loses the service later (or a hand-built test context) must not
    // crash the plugin — the bridge degrades to stylesheet-only in that case.
    //
    // The previous version read it with `ctx.get('theme')` as an OPTIONAL
    // service. That is the trap: at apply time the service had not registered
    // yet, the read returned undefined, and because the bridge caches its
    // "unavailable" verdict it never retried — the plugin went live with its
    // settings rows and its stylesheet but applied none of its tokens. Declaring
    // the dependency is what makes Cordis order the activation correctly.
    const themed = ctx.theme === undefined ? null : ctx.theme
    const theme = themed === null && typeof ctx.get === 'function' ? ctx.get('theme') : themed
    const service = theme === undefined ? null : theme
    if (bindTheme) bindTheme(service)

    // A hand-built test context may omit the store; the row then simply never
    // renders (its `available()` is false) and the host row stays visible.
    const modes = themeMode === undefined || themeMode === null
      ? { notify: function () {}, available: function () { return false } }
      : themeMode

    ctx.effect(function () {
      styles.activate()
      installPanelCss()
      bridge.sync()
      styles.apply()
      return function () {
        applied = false
        removePanelCss()
        styles.teardown()
        bridge.release()
        if (bindTheme) bindTheme(null)
        modes.notify()
      }
    }, 'dsh-cds-theme: activation state')

    // Settings changes re-push the token layer and rebuild the stylesheet.
    ctx.effect(function () {
      return settings.subscribe(function () {
        bridge.sync()
        styles.apply()
      })
    }, 'dsh-cds-theme: settings subscription')

    // The user can flip light/dark at any time. Our token layer carries both
    // palettes so the service recomposes on its own, but re-syncing on
    // `theme/change` keeps the accent glow and any palette-dependent
    // derivation honest.
    //
    // The SAME event also feeds the 「主题模式」 row: `publish()` emits it on every
    // accepted `setTheme`, so a change made in the host's own row (or by a
    // shortcut, or in another window) re-paints our cubes without either row
    // owning the other's state.
    ctx.effect(function () {
      if (service === null || typeof ctx.on !== 'function') return function () {}
      return ctx.on('theme/change', function () {
        bridge.sync()
        modes.notify()
      })
    }, 'dsh-cds-theme: theme change')

    ctx.effect(scheduleReapply, 'dsh-cds-theme: deferred reapply')

    // Settings copy rides the host locale service, the same way usage-stats
    // registers its panel dictionaries: `ctx.locale.register(ns, { en, zh })`,
    // then `locale: ns` on the slot registration below injects `t(key, params)`
    // into every row and the outlet re-renders them on a language switch. The
    // service is optional — a host without `ctx.locale` leaves `t` undefined and
    // the rows fall back to the embedded English table (locales.js `makeT`).
    if (ctx.locale && typeof ctx.locale.register === 'function') {
      ctx.effect(function () {
        // `register` returns the disposer that drops exactly these two
        // dictionaries; handing it back to ctx.effect keeps a disable/enable
        // cycle from tripping the service's duplicate-locale check.
        return ctx.locale.register(LOCALE_NS, { en: en, zh: zh })
      }, 'dsh-cds-theme: locale dictionaries')
    }

    // The hero greeting serif: structurally mark the headline and let the
    // stylesheet's [data-cds-greeting] rule paint it. The marker is idempotent
    // and removes every mark on dispose (hero.js).
    ctx.effect(function () {
      if (typeof document === 'undefined') return function () {}
      const marker = createGreetingMarker(document)
      marker.start()
      return function () { marker.stop() }
    }, 'dsh-cds-theme: hero greeting mark')

    // Long plain-text pastes become .txt attachments through the host's own
    // file-intake path (paste.js explains the verified PASTE_COMMAND shape).
    // The translator is the same `ctx.locale.bind(LOCALE_NS)` binding the
    // section label uses, so the file name follows the active UI language.
    // The switch is read at paste time, so flipping it needs no re-install.
    ctx.effect(function () {
      if (typeof document === 'undefined') return function () {}
      const localeService = ctx.locale === undefined || ctx.locale === null ? null : ctx.locale
      const translate = localeService !== null && typeof localeService.bind === 'function'
        ? localeService.bind(LOCALE_NS)
        : makeT(undefined)
      const converter = createPasteConverter({
        doc: document,
        getState: settings.getState,
        translate: translate,
      })
      converter.start()
      return function () { converter.stop() }
    }, 'dsh-cds-theme: long-paste attachment')

    // The markdown body's table hook: `markdown.js` marks the scroll wrapper of
    // every table inside the chat flow, and the stylesheet paints
    // [data-cds-table]. This item was user-verified and its comparison switch was
    // removed, so the mark now follows `enabled && refine` only — the same gate
    // its rules use. The retired `markdownBody` term used to be here; it is gone
    // rather than pinned `true`, so there is no remaining code path that could
    // switch the table frame off. The marker is idempotent and removes every mark
    // on dispose.
    ctx.effect(function () {
      if (typeof document === 'undefined') return function () {}
      const marker = createTableMarker(document)
      const wanted = function () {
        const state = settings.getState()
        return state.enabled !== false && state.refine !== false
      }
      const sync = function () {
        if (wanted()) marker.start()
        else marker.stop()
      }
      sync()
      const unsubscribe = typeof settings.subscribe === 'function' ? settings.subscribe(sync) : null
      return function () {
        if (typeof unsubscribe === 'function') unsubscribe()
        marker.stop()
      }
    }, 'dsh-cds-theme: markdown body mark')

    // THE TWO HOOKS THE TOOL-CARD RULES EXPECT. `data-read` and `data-diff` do
    // not exist in the shipped DOM (a live probe: 47 rows with `data-variant`,
    // 0 with either of those), so `varianthooks.js` stamps the cards from
    // `data-variant`. Same gate as the rules that consume them — a mark with no
    // rules is a no-op either way.
    ctx.effect(function () {
      if (typeof document === 'undefined') return function () {}
      let dispose = null
      const sync = function () {
        const state = settings.getState()
        const wanted = state.enabled !== false && state.refine !== false
        if (wanted && dispose === null) dispose = installVariantHooks(document)
        else if (!wanted && dispose !== null) { dispose(); dispose = null }
      }
      sync()
      const unsubscribe = settings.subscribe(sync)
      return function () {
        unsubscribe()
        if (dispose !== null) { dispose(); dispose = null }
      }
    }, 'dsh-cds-theme: payload card variant hooks')

    // Legacy tool primitives have text-copy controls outside the code banner.
    ctx.effect(function () {
      if (typeof document === 'undefined') return function () {}
      const marker = createNativeCopyMarker(document)
      const sync = function () {
        const state = settings.getState()
        if (state.enabled !== false && state.refine !== false) marker.start()
        else marker.stop()
      }
      sync()
      const unsubscribe = settings.subscribe(sync)
      return function () { unsubscribe(); marker.stop() }
    }, 'dsh-cds-theme: native tool copy controls')

    // The diff card's line numbers: `diffnumbers.js` re-seeds the CSS counters
    // from a hunk start when the card publishes one, and does nothing when it
    // does not. The rules that paint the gutter are inside `refine`, so the
    // marker follows the same gate — a marker with no rules would write
    // attributes nothing reads. The marker is idempotent and removes every mark
    // on dispose, including the two inline custom properties.
    ctx.effect(function () {
      if (typeof document === 'undefined') return function () {}
      const marker = createDiffNumberMarker(document)
      const wanted = function () {
        const state = settings.getState()
        return state.enabled !== false && state.refine !== false
      }
      const sync = function () {
        if (wanted()) marker.start()
        else marker.stop()
      }
      sync()
      const unsubscribe = typeof settings.subscribe === 'function' ? settings.subscribe(sync) : null
      return function () {
        if (typeof unsubscribe === 'function') unsubscribe()
        marker.stop()
      }
    }, 'dsh-cds-theme: diff line numbers')

    // The blank-session backdrop (ripple.js). One switch, one module, and the
    // stylesheet's layer promotion follows the same switch (styles.js
    // `heroRippleRules`), so a canvas can never outlive the rules that keep it
    // behind the greeting. Mounted BEFORE the slots guard below: this effect
    // needs no React and no slot, so a composition with no settings shell still
    // gets the backdrop.
    //
    // `theme/change` and a settings change both refresh the palette, because the
    // accent it paints with is a token the user can move while the field is up.
    ctx.effect(function () {
      if (typeof document === 'undefined') return function () {}
      const ripple = createHeroRipple({ doc: document })
      const wanted = function () {
        const state = settings.getState()
        return state.enabled !== false && state.heroRipple !== false
      }
      const sync = function () {
        if (wanted()) {
          ripple.start()
          ripple.refresh()
        } else {
          ripple.stop()
        }
      }
      sync()
      const unsubscribe = typeof settings.subscribe === 'function' ? settings.subscribe(sync) : null
      const onThemeChange = service !== null && typeof ctx.on === 'function'
        ? ctx.on('theme/change', function () { ripple.refresh() })
        : null
      return function () {
        if (typeof unsubscribe === 'function') unsubscribe()
        if (typeof onThemeChange === 'function') onThemeChange()
        ripple.stop()
      }
    }, 'dsh-cds-theme: blank-session backdrop')

    const slots = ctx.slots
    const uiReady = React && primitives && primitives.IconCheckOutlineRegular
    if (!uiReady || !slots || typeof slots.inject !== 'function') {
      console.warn('dsh-cds-theme: slots/react/primitives unavailable; theme rows not registered')
      return
    }

    // ------------------------------------------------- the diff card view
    //
    // `edit` and `write` are the two tools whose host card is the diff the
    // theme cannot colour (see `diffview.js`). Registering their
    // `tool.call.toolview` cells is what puts this plugin's card in the
    // transcript; `priority: 100` outranks the host's own `FileMutationRow`,
    // which registers without a rank.
    //
    // WHY IT FOLLOWS `refine`. The card's rules live in `diffCardRules()`,
    // inside the component half of the sheet. A view that stayed registered
    // with its rules switched off would REPLACE the host's styled card with a
    // bare one — strictly worse than not having the view. So the registration
    // and the rules travel on the same switch, and turning refinement off
    // hands the conversation back to the host's card.
    //
    // The disposer from `slots.inject` removes both cells, so a disable/enable
    // cycle cannot leave two registered occupants on one key.
    ctx.effect(function () {
      const DiffView = createDiffView({ React: React })
      const wireNames = ['edit', 'write']
      let off = null
      const sync = function () {
        const state = settings.getState()
        const wanted = state.enabled !== false && state.refine !== false
        if (wanted === (off !== null)) return
        if (wanted) {
          off = slots.inject('tool.call.toolview', function () {
            return wireNames.map(function (key) {
              return slots.register({
                name: 'tool.call.toolview',
                key: key,
                // LOW WINS. The keyed seat elects by ASCENDING priority and keeps
                // the first live entry, so a LOWER number shadows a higher one.
                // The host's own FileMutationRow sits at 0; registering at 100
                // lost to it (measured in the live registry: ours listed at
                // priority 100 with active false, the host at 0 with active true,
                // and no diff card ever rendered). -1 sorts ahead of it.
                priority: -1,
              }, DiffView)
            })
          })
          return
        }
        const stop = off
        off = null
        if (typeof stop === 'function') stop()
      }
      sync()
      const unsubscribe = typeof settings.subscribe === 'function' ? settings.subscribe(sync) : null
      return function () {
        if (typeof unsubscribe === 'function') unsubscribe()
        if (typeof off === 'function') off()
        off = null
      }
    }, 'dsh-cds-theme: diff card view')

    // ------------------------------------------------------ settings rows
    //
    // The eight appearance knobs move onto their own settings PAGE
    // (「外观 / Appearance」, a real `settings.section` sibling of 「通用」), and
    // the master switch stays in 「通用」. See `section.js` for the host contract
    // that makes a plugin-declared child ledger legal, and for the fallback:
    // when the section ledger is unavailable every row registers into
    // `settings.general.item`, which is exactly the previous behaviour.
    //
    // The label thunk reads the host locale at NAV-RENDER time, so a language
    // switch renames the nav entry without re-registering anything. `ctx.locale`
    // is a declared dependency, but the read is still guarded: a hand-built test
    // context or a composition without the service must not crash the plugin,
    // and `appearanceSectionOptions` falls back to the English table.
    const locale = ctx.locale === undefined || ctx.locale === null ? null : ctx.locale
    const t = locale !== null && typeof locale.bind === 'function' ? locale.bind(LOCALE_NS) : null
    const section = {
      options: appearanceSectionOptions(t),
      component: createAppearanceSection({ React: React }),
    }
    ctx.effect(function () {
      const rows = registerSettingsRows({
        slots: slots,
        panel: panel,
        section: section,
        warn: function (message) { console.warn('dsh-cds-theme: ' + message) },
      })
      return function () { rows.dispose() }
    }, 'dsh-cds-theme: settings rows')

    // The settings NAV icon. The host draws nav glyphs from a hardcoded
    // if-chain (`ui-settings-general:244-266`) and falls back to a gear for any
    // id it does not know, so our page currently shows the same glyph as
    // 「通用」. A registration cannot supply an icon, so `navicon.js` finds the
    // button structurally (settings dialog → nav button whose label is ours),
    // inserts this plugin's own SVG and hides the host's — restoring it on
    // dispose. Both language labels are passed so a switch back and forth keeps
    // finding the button; a host that renames or omits the nav simply leaves the
    // host glyph in place.
    ctx.effect(function () {
      if (typeof document === 'undefined') return function () {}
      const marker = createAppearanceIconMarker(document)
      const labels = [en['appearance.nav'], zh['appearance.nav']]
      marker.start(function () {
        return labels
      })
      return function () { marker.stop() }
    }, 'dsh-cds-theme: nav icon')
  }

  return apply
}
