import { LOCALE_NS, makeT } from './locales.js'

/**
 * The 「外观 / Appearance」 settings page, and the policy for where the theme's
 * rows live.
 *
 * WHAT THE HOST ALLOWS (verified in the installed `app.asar`, not guessed):
 *
 *   1. A settings page is a `settings.section` contribution. The settings shell
 *      declares that key as a list — `dsh-client-ui-settings-general/lib/
 *      client.js:1258-1261` puts `"settings.section": { kind: "list", scope:
 *      "root" }` in the `sidebar.settings` children table — and renders the nav
 *      from `ctx.slots.entries("settings.section")` sorted by `order`, with the
 *      label resolved through `resolveSlotLabel` (`:1145-1150`). That resolver
 *      calls a thunk (`function CI(e){return typeof e=="function"?e():e}`), and
 *      the snapshot is invalidated by the locale revision, so a label thunk
 *      re-runs on a language switch.
 *
 *   2. Shipping section orders: account -10, general 0, models 10, plugins 15,
 *      agent-presets 20. Order 1 therefore seats 「外观」 directly after 「通用」.
 *
 *   3. A section that declares its own `children` receives a `renderSlot` PROP.
 *      That is the renderer's standard kit, not a Plugins-page special case —
 *      `dsh-client-ui-renderer/lib/client.js:753-755`:
 *
 *          if (entry.children !== void 0) {
 *            kit["renderSlot"] = boundRenderSlot(host, entry);
 *            ...
 *          }
 *
 *      and `boundRenderSlot` (`:342-355`) renders a `<SlotOutlet>` for a key
 *      this entry declared, throwing `SlotOwnershipError` for any other. The
 *      host's own minimal section is `GeneralSection`
 *      (`ui-settings-general:635-639`):
 *
 *          function GeneralSection({ renderSlot }) {
 *            return <div className={…}>{renderSlot('settings.general.item', {})}</div>
 *          }
 *
 *      So a plugin-declared child ledger is supported and no DOM relocation is
 *      involved. The section body below is the same shape.
 *
 * WHERE THE ROWS GO. Two modes, and the set of rows is always complete:
 *
 *   - `section`: our section registered AND every appearance row landed on
 *     `settings.appearance.item`; only the master switch stays in General;
 *   - `flat`: the section ledger did not materialise (no settings shell, a
 *     refused registration, or a section whose child slot did not take the
 *     rows). Every row registers into `settings.general.item` — exactly the
 *     pre-section behaviour — and a warning is emitted.
 *
 * A downgrade from `section` to `flat` moves the appearance rows back to
 * General, so no row is ever left on a slot nobody renders.
 *
 * WHY A BOUNDED WAIT. `ctx.slots.inject(key, cb)` runs `cb` when `key` is
 * declared, and `settings.section` is declared by the settings shell, whose
 * mount order relative to this plugin is not guaranteed. The section route is
 * therefore inherently deferred, and a declaration that never arrives must not
 * strand the rows — hence the bounded wait, cancelled the moment the section
 * mounts (and on dispose). It is the only timer in the plugin.
 */

export const SECTION_NAME = 'settings.section'
export const APPEARANCE_SECTION_ID = 'appearance'
export const APPEARANCE_SECTION_ORDER = 1
export const APPEARANCE_SLOT = 'settings.appearance.item'
export const GENERAL_SLOT = 'settings.general.item'
/** Marks the section wrapper; the theme's sheet and the tests read it. */
export const SECTION_ATTR = 'data-cds-appearance-section'

/** How long the section declaration may take before the flat list is used. */
export const SECTION_WAIT_MS = 3000

/**
 * The `settings.section` registration for 「外观」.
 *
 * `label` is the locale-following thunk the nav re-resolves on every revision
 * bump, so a language switch renames the entry with no re-registration.
 * `locale` is what injects `t` into the section component (the same namespace
 * the rows use). `children` is what makes `renderSlot(APPEARANCE_SLOT)` legal
 * from inside our own component.
 *
 * @param t a translator for LOCALE_NS (the fallback English table is used when
 *        the host has no locale service).
 */
export function appearanceSectionOptions(t) {
  const translate = typeof t === 'function' ? t : makeT(null)
  return {
    name: SECTION_NAME,
    id: APPEARANCE_SECTION_ID,
    order: APPEARANCE_SECTION_ORDER,
    label: function () { return translate('appearance.nav') },
    locale: LOCALE_NS,
    children: { [APPEARANCE_SLOT]: { kind: 'list', scope: 'root' } },
  }
}

/**
 * The section body: one intro paragraph, then the child ledger.
 *
 * `renderSlot` is an injected prop (see the module comment) and is the only
 * supported way for a section to project its children. The no-`renderSlot`
 * branch keeps a broken composition from crashing the settings dialog; the
 * registration path in `registerSettingsRows` drops a section that cannot
 * project its ledger, so that branch is unreachable on the shipped host.
 */
export function createAppearanceSection({ React }) {
  function AppearanceSection(props) {
    const t = makeT(props.t)
    const renderSlot = props.renderSlot
    let body = null
    if (typeof renderSlot === 'function') {
      body = renderSlot(APPEARANCE_SLOT, {})
    } else if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('dsh-cds-theme: the appearance section got no renderSlot; its rows cannot render')
    }
    return React.createElement('div', {
      className: 'dct-section',
      [SECTION_ATTR]: '',
    },
    React.createElement('p', { className: 'dct-section-intro' }, t('appearance.intro')),
    body)
  }
  return AppearanceSection
}

/** One list-slot registration, carrying the locale so the outlet injects `t`. */
function rowOptions(name, slot) {
  return { name: name, id: slot.id, order: slot.order, locale: LOCALE_NS }
}

/**
 * Register the section and place every row, with a tested fallback.
 *
 * @param options.slots the `ctx.slots` service.
 * @param options.panel `createPanel(...)`'s result (`appearanceSlots` /
 *        `generalSlots`, one `{ id, order, component }` per row).
 * @param options.section `{ options, component }`, or null to force flat mode.
 * @param options.warn warning sink; the caller prefixes the plugin name.
 * @param options.waitMs section-declaration wait; defaults to SECTION_WAIT_MS
 *        (0 disables the wait, which is what the deterministic tests use).
 * @param options.timers `{ setTimeout, clearTimeout }` override.
 * @returns a controller: `mode` (live getter), `appearanceRows()` /
 *          `generalRows()` / `reason()` readers, and `dispose()`.
 */
export function registerSettingsRows(options) {
  const slots = options.slots
  const panel = options.panel
  const section = options.section === undefined ? null : options.section
  const warn = typeof options.warn === 'function' ? options.warn : function () {}
  const appearance = panel.appearanceSlots
  const general = panel.generalSlots
  const timers = options.timers || {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms) },
    clearTimeout: function (handle) { clearTimeout(handle) },
  }
  const waitMs = options.waitMs === undefined ? SECTION_WAIT_MS : options.waitMs

  let mode = 'pending'
  let reason = null
  let placed = 0
  let timer = null
  const appearanceDisposers = []
  let generalDisposers = []
  let generalList = null

  function cancelWait() {
    if (timer === null) return
    timers.clearTimeout(timer)
    timer = null
  }

  /** Mount one row list onto one slot; re-runs when that slot is declared. */
  function mount(name, list) {
    return slots.inject(name, function () {
      // A late appearance declaration must not double-register rows the flat
      // fallback already owns — the duplicate ids would throw in the outlet.
      if (mode === 'flat' && name === APPEARANCE_SLOT) return function () {}
      const made = list.map(function (row) {
        return slots.register(rowOptions(name, row), row.component)
      })
      if (name === APPEARANCE_SLOT) placed = made.length
      return made
    })
  }

  /**
   * (Re)seat the General rows. In `section` mode that is the master switch
   * alone; in `flat` mode it is everything. A mode change therefore MOVES rows
   * instead of leaving a partial list behind.
   */
  function placeGeneral(list) {
    if (generalList === list && generalDisposers.length > 0) return
    for (const off of generalDisposers) {
      try { off() } catch (ignored) { /* one broken disposer must not stop the rest */ }
    }
    generalList = list
    generalDisposers = [mount(GENERAL_SLOT, list)]
  }

  function flat(why) {
    if (mode === 'flat') return
    const wasPending = mode === 'pending'
    mode = 'flat'
    reason = why
    if (wasPending) cancelWait()
    warn('appearance section unavailable — ' + why + '; all '
      + String(appearance.length + general.length) + ' rows fall back to the General list')
    placeGeneral(appearance.concat(general))
  }

  if (section === null) {
    flat('no appearance-section definition was provided')
  } else {
    // The child-row mount goes in BEFORE the section: `slots.register` declares
    // a section's children and notifies their listeners inside the same call,
    // so this callback has already run by the time `register` returns — which
    // is what makes the decision below synchronous, with no polling.
    appearanceDisposers.push(mount(APPEARANCE_SLOT, appearance))

    appearanceDisposers.push(slots.inject(SECTION_NAME, function () {
      let dispose = null
      placed = 0
      // A flat decision is final: leaving it would create a nav entry with
      // nothing on it, because the rows then belong to General.
      if (mode === 'flat') return function () {}
      try {
        dispose = slots.register(section.options, section.component)
      } catch (error) {
        flat('the host refused the section registration ('
          + String(error && error.message) + ')')
        return function () {}
      }
      if (placed !== appearance.length) {
        // Registered, but its declared child slot never took our rows: drop the
        // section rather than leave an empty page behind.
        try { dispose() } catch (ignored) { /* already unwound */ }
        flat('the section did not declare ' + APPEARANCE_SLOT)
        return function () {}
      }
      mode = 'section'
      reason = null
      cancelWait()
      // The master switch keeps its General seat in section mode too.
      placeGeneral(general)
      return dispose
    }))

    // A host without a settings shell never declares the key. Waiting forever
    // for it is the one failure that would strand every row, so the wait is
    // bounded and cancelled the moment the section mounts. A non-positive
    // `waitMs` means "do not wait": decide with what is declared right now,
    // which is what the deterministic tests and a synchronous host need.
    //
    // ONLY ARM THE TIMER IF WE ARE STILL PENDING. `slots.inject(key, cb)` runs
    // `cb` synchronously on the shipped host, so `cancelWait()` above may have
    // run while `timer` was still null and cleared nothing; arming anyway left a
    // 3 s timer that nothing could clear, keeping the Node process (and so
    // `npm test`) alive for the full wait. Same fix as
    // `plugins/usage-stats/client/src/settings-slot.js`.
    if (waitMs > 0 && mode === 'pending') {
      timer = timers.setTimeout(function () {
        timer = null
        // A declaration may still arrive between arming and firing.
        if (mode !== 'pending') return
        flat('no settings.section declaration arrived within ' + String(waitMs) + 'ms')
      }, waitMs)
    } else if (waitMs <= 0 && mode === 'pending') {
      flat('no settings.section declaration is available')
    }
  }

  return {
    get mode() { return mode },
    appearanceRows() { return mode === 'section' ? placed : 0 },
    generalRows() {
      return mode === 'section' ? general.length : appearance.length + general.length
    },
    reason() { return reason },
    dispose() {
      cancelWait()
      for (const off of appearanceDisposers.concat(generalDisposers)) {
        try { off() } catch (ignored) { /* one broken disposer must not stop the rest */ }
      }
      appearanceDisposers.length = 0
      generalDisposers = []
      generalList = null
    },
  }
}
