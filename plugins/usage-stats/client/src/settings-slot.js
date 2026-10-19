/**
 * Where this plugin's settings rows register.
 *
 * The rows used to live only in the host's General list. The user asked for them
 * on the 主题定制 / Theme page instead, which `cds-theme` hosts as the settings
 * section `id: "appearance"` with the child ledger `settings.appearance.item`
 * (`cds-theme/client/src/section.js` — same slot contract, same bounded-wait
 * fallback shape as this module). Both of this plugin's rows — panel height and
 * number units — move together: they are registered as one list, so they can
 * never end up half on one page and half on the other.
 *
 * TWO MODES, never both:
 *   - `appearance`: `settings.appearance.item` was declared → the rows sit on the
 *     theme page with their own orders (40 and 41, after every current theme
 *     row; the page is still growing, so a mid-ladder value would collide);
 *   - `general`: the declaration never arrived (cds-theme absent, disabled or
 *     degraded) → both rows fall back to `settings.general.item`, i.e. exactly
 *     the pre-move behaviour, and a warning is emitted.
 *
 * WHY A BOUNDED WAIT. `ctx.slots.inject(key, cb)` runs only once `key` has been
 * declared, and the theme section's mount order relative to this plugin is not
 * guaranteed. Waiting forever would strand the rows; waiting a few seconds and
 * then falling back keeps them reachable. The timer is cancelled the moment the
 * slot appears. `waitMs <= 0` means "decide with what exists right now", which
 * is what the tests use.
 *
 * DOWNGRADES ARE HANDLED. If the appearance slot is later undeclared (the user
 * disables cds-theme), the registered rows' disposer runs; the rows are then
 * re-registered into General rather than disappearing. A late appearance
 * declaration after a fallback decision is ignored — registering in both places
 * would show each row twice.
 */

import { LOCALE_NS } from './locales.js'

export const APPEARANCE_SLOT = 'settings.appearance.item'
export const GENERAL_SLOT = 'settings.general.item'

/** How long the theme page's slot may take before the General fallback wins. */
export const SLOT_WAIT_MS = 3000

/** One list-slot registration, carrying the locale so the outlet injects `t`. */
export function rowRegistration(slot, row) {
  return {
    name: slot,
    id: row.id,
    order: row.order,
    // The outlet then injects `t(key, params)` and re-renders the row when the
    // host language changes — the same namespace the panel uses.
    locale: LOCALE_NS,
  }
}

/**
 * Place every row, preferring the theme page.
 *
 * @param options.slots the `ctx.slots` service (inject + register)
 * @param options.rows `[{ id, order, component }]`, one per settings row
 * @param options.warn warning sink; the caller prefixes the plugin name
 * @param options.waitMs theme-slot wait; defaults to SLOT_WAIT_MS
 * @param options.timers `{ setTimeout, clearTimeout }` override (tests)
 * @returns `{ mode, reason(), rows(), dispose() }`; `mode` is `pending` until
 *          decided.
 */
export function registerSettingsRows(options) {
  const slots = options.slots
  const rows = Array.isArray(options.rows) ? options.rows : []
  const warn = typeof options.warn === 'function' ? options.warn : function () {}
  const timers = options.timers || {
    setTimeout: function (fn, ms) { return setTimeout(fn, ms) },
    clearTimeout: function (handle) { clearTimeout(handle) },
  }
  const waitMs = options.waitMs === undefined ? SLOT_WAIT_MS : options.waitMs

  let mode = 'pending'
  let reason = null
  let timer = null
  const disposers = []
  let appearanceDisposers = []
  let generalDisposers = []

  function cancelWait() {
    if (timer === null) return
    timers.clearTimeout(timer)
    timer = null
  }

  function disposeAll(list) {
    for (const off of list) {
      try { off() } catch (ignored) { /* one broken disposer must not strand a row */ }
    }
    return []
  }

  function disposeGeneral() {
    generalDisposers = disposeAll(generalDisposers)
  }

  function disposeAppearance() {
    appearanceDisposers = disposeAll(appearanceDisposers)
  }

  /**
   * Register every row on `slot`; returns their disposers, or null when the host
   * refuses one. A partial list is unwound before returning so a refusal cannot
   * leave half the rows behind.
   */
  function place(slot) {
    const made = []
    try {
      for (const row of rows) {
        made.push(slots.register(rowRegistration(slot, row), row.component))
      }
      return made
    } catch (error) {
      warn('dsh-usage-stats: the host refused the settings rows on ' + slot
        + ' (' + String(error && error.message) + ')')
      disposeAll(made)
      return null
    }
  }

  function fallBack(why) {
    if (mode !== 'pending') return
    mode = 'general'
    reason = why
    cancelWait()
    warn('dsh-usage-stats: theme page unavailable — ' + why
      + '; the usage-stats settings rows fall back to the General list')
    const made = place(GENERAL_SLOT)
    if (made !== null) generalDisposers = made
  }

  // Wait for the theme page's child ledger. If it is declared before the timer,
  // the rows are seated there and the fallback is cancelled.
  const stopWaiting = slots.inject(APPEARANCE_SLOT, function () {
    if (mode !== 'pending') return function () { /* the fallback already owns the rows */ }
    const made = place(APPEARANCE_SLOT)
    if (made === null) {
      fallBack('the host refused the appearance-slot registration')
      return function () {}
    }
    appearanceDisposers = made
    mode = 'appearance'
    reason = null
    cancelWait()
    return function () {
      disposeAppearance()
      // The theme page is going away while we own its slot: move the rows back
      // to General so they never become unreachable.
      if (mode === 'appearance') {
        mode = 'pending'
        fallBack('the theme page was removed')
      }
    }
  })
  if (typeof stopWaiting === 'function') disposers.push(stopWaiting)

  // ARM THE BACKSTOP ONLY IF WE ARE STILL WAITING.
  //
  // `slots.inject(key, cb)` runs `cb` SYNCHRONOUSLY on the shipped host, so by
  // this line `mode` may already have left `pending` — and `cancelWait()` ran
  // while `timer` was still null, so it had nothing to clear. The previous shape
  // armed the timer regardless, and nothing ever cleared it: the callback fired
  // 3 s later, found the work already done and returned. Harmless in a browser,
  // but it kept the Node process alive for the full wait — measured at 3.7 s of
  // this repo's 19.3 s test wall time, from one leaked no-op timer.
  if (waitMs > 0 && mode === 'pending') {
    timer = timers.setTimeout(function () {
      timer = null
      // A declaration may still arrive between arming and firing.
      if (mode !== 'pending') return
      fallBack('no declaration arrived within ' + String(waitMs) + 'ms')
    }, waitMs)
  } else if (waitMs <= 0 && mode === 'pending') {
    fallBack('no declaration is available')
  }

  return {
    get mode() { return mode },
    reason() { return reason },
    rows() { return rows.length },
    dispose() {
      cancelWait()
      disposeAppearance()
      disposeGeneral()
      for (const off of disposers) {
        try { off() } catch (ignored) { /* one broken disposer must not stop the rest */ }
      }
      disposers.length = 0
    },
  }
}
