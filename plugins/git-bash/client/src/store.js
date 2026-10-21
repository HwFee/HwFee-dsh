/**
 * The settings row's state: the chosen mode, and what the host resolved it to.
 *
 * WHY PLAIN STORES AND NOT `hooks`. The slot registration can expose a store as
 * `hooks: { name: store }`, which the framework turns into a `useName(selector)`
 * prop for the occupant. A plain function component reads props and never
 * receives that prop — the genui plugin lost an afternoon to exactly this — so
 * the stores are passed as ORDINARY props and the row subscribes with
 * `React.useSyncExternalStore`, which is a contract React guarantees.
 *
 * @module store
 */

import {
  DEFAULT_MODE, KIND_LABELS, MODES, REASON_LABELS, migrateLegacyMode, readMode, writeMode,
} from '../../lib/mode.js'
import { PLUGIN_ID } from './constants.js'

/** Where the user's mode lives. Renaming it loses every user's choice. */
export const MODE_KEY = PLUGIN_ID + ':mode'

/** The boot global the host publishes (mirrors `SHELL_GLOBAL` in lib/index.js). */
export const SHELL_GLOBAL = '__dshGitBash'

/**
 * A store over the host-published shell resolution.
 *
 * The value is a boot global, so it does not change while the page lives. It
 * exists so the row has the same `{ getSnapshot, subscribe }` shape as the
 * editable store, and one code path reads both.
 *
 * @param {object | undefined} carrier the global object
 * @returns {{ getSnapshot: () => object, subscribe: () => () => void, dispose: () => void }}
 */
export function createShellInfoStore(carrier) {
  const raw = carrier === undefined ? undefined : carrier[SHELL_GLOBAL]
  const valid = raw !== null && typeof raw === 'object'

  /**
   * Normalize one resolution record.
   *
   * @param {unknown} record one entry from the injected payload
   * @returns {{ path: string|null, kind: string|null, source: string|null, reason: string|null }}
   */
  const normalize = (record) => {
    const entry = record !== null && typeof record === 'object' ? record : {}
    return {
      path: typeof entry.path === 'string' ? entry.path : null,
      kind: typeof entry.kind === 'string' ? entry.kind : null,
      source: typeof entry.source === 'string' ? entry.source : null,
      reason: typeof entry.reason === 'string' ? entry.reason : null,
    }
  }

  // BOTH SHAPES ARE ACCEPTED. An older build injected a single record; a current
  // one injects `{ active, byMode }`. Reading either keeps the row working
  // across a page that was served just before an upgrade.
  const byMode = valid && raw.byMode !== null && typeof raw.byMode === 'object' ? raw.byMode : null
  const active = valid && raw.active !== null && typeof raw.active === 'object' ? raw.active : raw
  const single = normalize(active)

  // NORMALIZED ONCE, NOT PER CALL.
  //
  // `forMode` used to build a fresh object on every call. That object is the
  // value `useSyncExternalStore` compares for change detection, so a new
  // identity every render looks like "the store changed" and React re-renders
  // forever — error #185, maximum update depth, which crashed the whole
  // settings slot. The snapshot for each mode is now computed once at
  // construction.
  const snapshots = byMode === null
    ? null
    : Object.fromEntries(Object.entries(byMode).map(([key, value]) => [key, normalize(value)]))

  return {
    /**
     * The resolution for one mode.
     *
     * Falls back to the active record when the mode is unknown, so a stale or
     * future value still shows SOMETHING rather than an empty row.
     *
     * @param {string} mode one of the three modes
     * @returns {object} the resolution
     */
    forMode(mode) {
      if (snapshots === null) return single
      return snapshots[mode] ?? single
    },
    getSnapshot: () => single,
    subscribe: () => () => {},
    dispose: () => {},
  }
}

/**
 * The editable mode.
 *
 * Writing notifies, and the lifecycle republishes to the host, so a change
 * applies to the NEXT tool call rather than after a reload.
 *
 * THE OLD BOOLEAN PREFERENCE IS MIGRATED HERE, before the first read. The
 * previous build asked a different question ("keep the platform shell tool"),
 * and a user who turned it OFF asked for Git Bash to be the only way commands
 * run — so that one case becomes `gitbash`. `migrateLegacyMode` never overwrites
 * a value already stored under the new key, so this runs at most once and a
 * newer choice always wins.
 *
 * @param {Storage | undefined} storage the storage object
 * @returns {object} the store
 */
export function createModeStore(storage) {
  migrateLegacyMode(storage, MODE_KEY)
  let current = readMode(storage, MODE_KEY)
  const listeners = new Set()

  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(value) {
      if (!MODES.includes(value) || value === current) return
      current = value
      writeMode(storage, MODE_KEY, value)
      for (const listener of listeners) listener()
    },
    dispose() { listeners.clear() },
  }
}

/**
 * The sentence the row shows for a resolution.
 *
 * A failure is not a blank: the reason is what tells the user which of three
 * configuration facts is wrong, and it names the fix.
 *
 * The KIND is localized too, because the kinds are not the modes: `pwsh` covers
 * both PowerShell 7 and 5.1, and `gitbash` resolves to `posix-bash` away from
 * Windows. Naming the family is how a user learns which of the two PowerShells
 * `auto` picked.
 *
 * @param {object} info the resolution record for the chosen mode
 * @param {Function} t locale lookup
 * @returns {string} the text
 */
export function describeShell(info, t) {
  if (info.path === null) {
    return t(info.reason === null ? 'shell.notFound' : (REASON_LABELS[info.reason] ?? 'shell.notFound'))
  }
  const kind = info.kind === null ? '' : t(KIND_LABELS[info.kind] ?? info.kind)
  return t('shell.current', { path: info.path, kind })
}
