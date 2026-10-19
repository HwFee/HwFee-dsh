/**
 * The 「主题模式 / Theme mode」 row: light / dark / system, driven through the
 * host's own theme service.
 *
 * WHY THIS ROW EXISTS. The 浅色 / 深色 / 跟随系统 cubes are a HOST row
 * (`dsh-client-ui-theme` registers `settings.general.item` with id `appearance`).
 * A foreign registration cannot move another entry's contribution — `renderSlot`
 * only projects child slots the entry itself declared, and `SlotCore.register`
 * refuses a second declaration of the same child key — so the cubes cannot be
 * lifted onto our page. They can be REBUILT, though, and that is what this is:
 * the same three preferences, the same durable write path, on our own page.
 *
 * THE WRITE PATH IS THE HOST'S OWN. `ui-theme/lib/client.js:2029` does
 * `ctx.provide("theme", theme)` with the whole `ThemeRuntime` instance, so:
 *
 *   read      `theme.getTheme().preference`   (`:1693`; the snapshot is
 *             `{ preference, fontSizes, fontFamilies, active, themes, revision }`)
 *   write     `theme.setTheme(id)`            (`:1712`; "the only user preference
 *             write entry" — it writes through the settings scope and publishes)
 *   subscribe `ctx.on("theme/change", …)`     (`publish()` emits it, `:…`)
 *
 * Because the write goes through `setTheme`, the host row (when it is visible)
 * and our row read the SAME `preference` field — the state cannot fork, and a
 * change made in either place is seen by both. `setTheme` also rejects an
 * unregistered id with a throw, so an unknown value can never be persisted.
 *
 * NOTE ON THE SNAPSHOT. `preference` is the PERSISTED choice (`light` / `dark` /
 * `system`); `active` is the RESOLVED theme (with `system`, one of light/dark,
 * decided by `prefers-color-scheme`). The row must show `preference` — showing
 * `active` would make the 跟随系统 cube never look selected.
 *
 * DEGRADATION. Without the service there is no read, no write and no way to
 * keep the two rows honest, so the row does not render AND the stylesheet does
 * not hide the host's cubes (`themeMode.available()` gates both). The worst case
 * is therefore "the host row stays exactly where it was", never two selectors
 * fighting over one preference.
 */

/** The three preferences, in the host's own order (`ui-theme` CUBES). */
export const THEME_MODES = ['light', 'dark', 'system']

/** Locale keys, one per cube. */
export const THEME_MODE_LABELS = {
  light: 'modeRow.light',
  dark: 'modeRow.dark',
  system: 'modeRow.system',
}

/** The fallback preference when nothing has been read yet. */
export const DEFAULT_PREFERENCE = 'system'

/**
 * A tiny observable over the host theme service.
 *
 * The panel row reads `getPreference` through `useSyncExternalStore`, and the
 * lifecycle re-publishes on `theme/change`, so a change made elsewhere (the host
 * row, a keyboard shortcut, another window) re-renders our cubes.
 *
 * `getSnapshot` returns a string, so React's identity check is value equality —
 * an unrelated `theme/change` (a font-size write also publishes one) does not
 * re-render the cubes.
 */
export function createThemeModeStore() {
  let service = null
  const listeners = []

  function notify() {
    for (const listener of listeners.slice()) {
      try { listener() } catch (error) { /* one throwing subscriber must not stop the rest */ }
    }
  }

  return {
    /** Bind (or clear) the host theme service; the lifecycle owns this. */
    setService(next) {
      service = next === undefined ? null : next
      notify()
    },
    /** True when a theme service is available — gates the row AND the hide rule. */
    available() {
      return service !== null && typeof service.getTheme === 'function'
    },
    /** The PERSISTED preference (`light` / `dark` / `system`). */
    getPreference() {
      if (service === null || typeof service.getTheme !== 'function') return DEFAULT_PREFERENCE
      const snapshot = service.getTheme()
      const preference = snapshot === undefined || snapshot === null ? undefined : snapshot.preference
      return THEME_MODES.indexOf(preference) >= 0 ? preference : DEFAULT_PREFERENCE
    },
    /**
     * Write one preference through the host's own entry point.
     * @returns true when the write was accepted.
     */
    setPreference(id) {
      if (THEME_MODES.indexOf(id) < 0) return false
      if (service === null || typeof service.setTheme !== 'function') return false
      try {
        service.setTheme(id)
      } catch (error) {
        // `setTheme` throws for an unregistered theme id; report and keep the
        // previous value rather than pretending the click worked.
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('dsh-cds-theme: could not switch the theme preference', error)
        }
        return false
      }
      // The service publishes `theme/change`, which the lifecycle forwards here;
      // notifying directly too keeps a context without that event listener live.
      notify()
      return true
    },
    /** Forward an external `theme/change` (or any republish) to the readers. */
    notify,
    /** Subscribe for `useSyncExternalStore`. */
    subscribe(listener) {
      listeners.push(listener)
      return function unsubscribe() {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    listenerCount() { return listeners.length },
  }
}
