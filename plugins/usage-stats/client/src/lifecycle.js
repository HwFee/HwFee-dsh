/**
 * Registers the usage panel as an occupant of the conversation input dock.
 *
 * The dock is the list slot that renders between the hero's workspace row and
 * the composer, so an occupant appears on the blank-session screen directly
 * above the input box. Everything the panel needs from the outside — React, the
 * primitives barrel, the component factory and the summary fetcher — arrives as
 * a dependency, which is what makes the panel testable without a network.
 */

import { installPanelCss, removePanelCss } from './styles.js'
import { LOCALE_NS, en, zh } from './locales.js'
import { unitsForSwitch, unitsIsOn } from './settings.js'
import { registerSettingsRows } from './settings-slot.js'
import {
  STYLE_ROW_ID, STYLE_ROW_ORDER, UNITS_ROW_ID, UNITS_ROW_ORDER,
} from './constants.js'

/**
 * Minimal `t` for a seat that cannot inject one (a host without a locale face,
 * a bare test): the plugin's own English dictionary, same `{param}`
 * interpolation as the slot-injected translator.
 */
function fallbackTranslate(key, params) {
  const template = en[key] ?? key
  return String(template).replace(/\{(\w+)\}/g, function (match, name) {
    return params && name in params ? String(params[name]) : match
  })
}

/**
 * @param {object} deps
 * @param {object} deps.React host React, or null when the module table lacks it
 * @param {object} deps.primitives host primitives barrel, or null
 * @param {{ Panel: Function }} deps.panel result of `createPanel`
 * @param {(options?: { force?: boolean }) => Promise<object>} deps.fetchSummary
 *        injected summary source (the shared short-TTL cache's `load`)
 * @param {() => object|null} [deps.peekSummary] cache `peek`; lets the panel
 *        paint the last summary on its first frame
 * @param {object} deps.settings the shared body-height store (see settings.js)
 * @returns {(ctx: object) => void} the plugin's `apply`
 */
export function createLifecycle({ React, primitives, panel, fetchSummary, peekSummary, settings }) {
  const uiReady = Boolean(React) && Boolean(primitives)
    && Boolean(panel) && typeof panel.Panel === 'function'
  let applied = false
  let warned = false

  /**
   * The panel is one of several plugins in the tree, so a missing dependency
   * gets a single line and a skipped registration rather than a throw that
   * would take the whole client down.
   */
  function warnOnce(message) {
    if (warned) return
    warned = true
    console.warn(message)
  }

  /**
   * The registered component. It exists to close over `fetchSummary` /
   * `peekSummary`, keeping the panel itself a pure function of its own props.
   * The dock's `input` half of the zone is deliberately dropped: the panel only
   * reads, and the input model is observably expensive to hold. `t` comes from
   * the registration's `locale:` field and is forwarded as a prop — the outlet
   * already re-renders the entry on a locale switch, so no subscription lives
   * here.
   */
  function UsagePanel(props) {
    return React.createElement(panel.Panel, {
      session: props.session,
      fetchSummary: fetchSummary,
      peekSummary: peekSummary,
      t: props.t,
    })
  }

  /**
   * The style row: two flat buttons, `classic` and `compact`.
   *
   * A segmented pair rather than a switch, because the two looks are peer
   * choices a reader compares — "on/off" would name neither. The chosen one
   * carries `data-active` and `aria-pressed`, and the store write re-renders the
   * hero panel in the same frame: switching is immediate, persists in
   * localStorage, and never reloads anything.
   *
   * The style row is registered FIRST (order 39) so the page reads "pick a
   * style, then size it" — the height row below it sizes whichever style is
   * selected.
   */
  function StyleRow(props) {
    const t = typeof props.t === 'function' ? props.t : fallbackTranslate
    const state = React.useSyncExternalStore(settings.subscribe, settings.getState)
    const current = state.style
    const options = [
      { id: 'classic', label: t('settings.style.classic') },
      { id: 'compact', label: t('settings.style.compact') },
    ]
    return React.createElement('div', { className: 'dus-row' },
      React.createElement('div', { className: 'dus-row-text' },
        React.createElement('div', { className: 'dus-row-title' }, t('settings.style.title')),
        React.createElement('div', { className: 'dus-row-desc' }, t('settings.style.desc'))),
      React.createElement('div', { className: 'dus-row-control' },
        React.createElement('div', {
          className: 'dus-seg',
          role: 'group',
          'aria-label': t('settings.style.aria'),
        }, options.map(function (option) {
          const active = option.id === current
          return React.createElement('button', {
            key: option.id,
            type: 'button',
            className: 'dus-seg-btn',
            'data-active': active ? 'true' : 'false',
            'data-style': option.id,
            'aria-pressed': active,
            onClick: function () { settings.setStyle(option.id) },
          }, option.label)
        }))))
  }

  /**
   * The unit row: ONE SWITCH, not a three-way choice.
   *
   * It shipped as a segmented control with three options including `auto`
   * ("follow the interface language"), and that was a usability failure: three
   * labels to answer a yes/no question, and `auto` was the only state a reader
   * had to be TOLD about — which is the tell that it should not have been a
   * state at all. The user's words were 「我希望做成一个开关 什么叫短式 OK啊」.
   *
   *   ON  → 万 / 亿      (Chinese units)
   *   OFF → K / M / B    (Western suffixes)
   *
   * The switch's OFF position writes `short` rather than relying on a default,
   * so the stored value always names the scale actually in use; nothing has to
   * be re-resolved against the language at render time any more.
   */
  function UnitRow(props) {
    const t = typeof props.t === 'function' ? props.t : fallbackTranslate
    const state = React.useSyncExternalStore(settings.subscribe, settings.getState)
    const on = unitsIsOn(state.units)
    return React.createElement('div', { className: 'dus-row' },
      React.createElement('div', { className: 'dus-row-text' },
        React.createElement('div', { className: 'dus-row-title' }, t('units.title')),
        React.createElement('div', { className: 'dus-row-desc' }, t('units.desc'))),
      React.createElement('div', { className: 'dus-row-control' },
        React.createElement('button', {
          type: 'button',
          role: 'switch',
          className: 'dct-toggle',
          'aria-checked': on,
          'aria-label': t('units.title'),
          'data-on': on ? 'true' : 'false',
          onClick: function () { settings.setUnits(unitsForSwitch(!on)) },
        }, React.createElement('span', { className: 'dct-toggle-knob' }))))
  }

  function apply(ctx) {
    if (!ctx || applied) return
    if (!uiReady) {
      warnOnce('dsh-usage-stats: react/primitives unavailable; usage panel not registered')
      return
    }
    const slots = ctx.slots
    if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
      warnOnce('dsh-usage-stats: slots service unavailable; usage panel not registered')
      return
    }

    applied = true

    // Panel copy rides the host locale service, the same way the host's own
    // bundles register dictionaries. It is optional: a host without `locale`
    // leaves the registration's `t` prop undefined and the panel falls back to
    // its embedded English table, so this is guarded rather than fatal.
    //
    // `register` RETURNS THE DISPOSER, and it is handed back to `ctx.effect`
    // (cds-theme's `lifecycle.js:114-119` does the same). Dropping it — which
    // this call used to do — means the two dictionaries survive a plugin
    // disable, and the next enable trips the locale service's duplicate-
    // namespace check: the plugin comes back with no translations and logs a
    // collision. `tools/audit.mjs` fails the build on a discarded result.
    if (ctx.locale && typeof ctx.locale.register === 'function') {
      ctx.effect(function () {
        return ctx.locale.register(LOCALE_NS, { en: en, zh: zh })
      }, 'dsh-usage-stats: locale dictionaries')
    }

    // Styles are installed with the registration and dropped with it, so a
    // disabled plugin leaves no style tag behind in the host document.
    ctx.effect(function () {
      installPanelCss()
      return function () {
        applied = false
        removePanelCss()
      }
    }, 'dsh-usage-stats: panel styles')

    // `inject` defers the registration until the conversation package has
    // declared the dock, and the returned disposer is what Cordis uses to
    // collapse the occupant when that owner unmounts.
    slots.inject('conversation.input.dock', function () {
      return slots.register({
        name: 'conversation.input.dock',
        id: 'usage-stats',
        order: 5,
        // Gives every entry of this registration a `t(key, params)` prop backed
        // by the dictionaries registered above; the outlet re-renders it on a
        // locale switch for free.
        locale: LOCALE_NS,
      }, UsagePanel)
    })

    // All three settings rows prefer the 主题定制 / Theme page (`cds-theme` hosts
    // it as the `appearance` settings section with the `settings.appearance.item`
    // ledger) and fall back to the host's General list with a bounded wait when
    // that page is absent — see `settings-slot.js` for the full policy. They are
    // registered as ONE list, so they always land on the same page (never split
    // across both), with ids/orders 39 (style), 40 (height) and 41 (units). The
    // stylesheet installed above supplies the `.dus-row` geometry (the host's row
    // recipe: 14/22 title, 12/18 description, 16px padding, .5px hairline,
    // control on the right) and the `.dus-seg` control of the style row.
    if (settings) {
      ctx.effect(function () {
        const placement = registerSettingsRows({
          slots: slots,
          // The height row is deliberately absent: both styles are FIXED at
          // their designed heights (classic 344px, compact 252px). A slider let
          // the reader shrink the card until the heat band lost rows or the
          // caption clipped, and those failures were silent; the number is now
          // the style's own contract, not a preference.
          rows: [
            { id: STYLE_ROW_ID, order: STYLE_ROW_ORDER, component: StyleRow },
            { id: UNITS_ROW_ID, order: UNITS_ROW_ORDER, component: UnitRow },
          ],
          warn: warnOnce,
        })
        return function () { placement.dispose() }
      }, 'dsh-usage-stats: settings rows')
    }
  }

  return apply
}
