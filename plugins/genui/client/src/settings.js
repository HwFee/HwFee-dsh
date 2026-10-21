/**
 * The user's title-placement preference.
 *
 * WHERE A TITLE GOES IS A TASTE CALL, not a correctness one, so it is a setting
 * rather than a constant. Three positions, which cover the three things people
 * actually want:
 *
 *   left    the original: the title leads the content, left-aligned, sharing its
 *           line with the source affordance
 *   above   centred over the content — the default, and what a figure or chart
 *           wants, because a block with its own optical centre reads better
 *           under a centred label
 *   below   centred under the content, for readers who prefer the answer to lead
 *
 * Storage is `localStorage` under a key this plugin owns. That is deliberate and
 * differs from the snippet sandbox, which BLOCKS storage: a snippet must not
 * touch the host's settings, but this is the plugin's own preference, written
 * through its own code, and it has to survive a reload.
 *
 * @module settings
 */

import { PLUGIN_ID } from './constants.js'

/** The storage key. Renaming it loses every user's choice — never do that. */
export const STORAGE_KEY = PLUGIN_ID + ':titlePlacement'

/** Where a card's title sits. */
export const PLACEMENTS = ['left', 'above', 'below']

/** What a fresh install uses. */
export const DEFAULT_PLACEMENT = 'above'

/** The settings row id, referenced by the host's settings page. */
export const SETTINGS_ROW_ID = PLUGIN_ID + '-title-placement'

/** Placement → the label key in this plugin's dictionaries. */
export const PLACEMENT_LABELS = {
  left: 'setting.titlePlacement.left',
  above: 'setting.titlePlacement.above',
  below: 'setting.titlePlacement.below',
}

/**
 * Placement values this plugin used to write.
 *
 * `inline` was the first version's name for what is now `left`. A user who ran
 * that build has it in storage; mapping it keeps their choice instead of
 * silently resetting them to the default.
 */
const LEGACY_ALIASES = { inline: 'left' }

/**
 * Read the stored placement.
 *
 * Every failure path returns the default: private mode throws on the property
 * READ itself (before any method runs), a stale value from an older version may
 * not be in `PLACEMENTS`, and storage may be disabled entirely. A card must
 * render regardless — the preference is cosmetic.
 *
 * @param {Storage | undefined} storage the storage object, or undefined
 * @returns {'left' | 'above' | 'below'} the placement in force
 */
export function readPlacement(storage) {
  if (storage === null || storage === undefined) return DEFAULT_PLACEMENT
  let raw
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return DEFAULT_PLACEMENT
  }
  if (Object.hasOwn(LEGACY_ALIASES, raw)) return LEGACY_ALIASES[raw]
  return PLACEMENTS.includes(raw) ? raw : DEFAULT_PLACEMENT
}

/**
 * Persist a placement.
 *
 * Silent on failure: quota-exceeded and private-mode throws must not break the
 * settings page the user is clicking through.
 *
 * @param {Storage | undefined} storage the storage object, or undefined
 * @param {string} placement the chosen placement
 * @returns {boolean} whether the write landed
 */
export function writePlacement(storage, placement) {
  if (storage === null || storage === undefined) return false
  if (!PLACEMENTS.includes(placement)) return false
  try {
    storage.setItem(STORAGE_KEY, placement)
    return true
  } catch {
    return false
  }
}

/**
 * The store every card reads and the settings row writes.
 *
 * Shape matches the host's `hooks` contract: `getSnapshot()` returns the current
 * value and `subscribe(listener)` returns an unsubscribe. That is what lets a
 * registration expose `titlePlacement` as a hook prop, so a mounted card
 * re-renders on a settings change instead of waiting for its next mount.
 *
 * `set` writes storage first and only then notifies. If the write fails (private
 * mode, quota) the value still changes for this session — the user just made the
 * choice and expects to SEE it — but nothing is persisted, and the next launch
 * falls back to the default.
 *
 * @param {Storage | undefined} storage the storage object, or undefined
 * @returns {{ getSnapshot: () => string, subscribe: (fn: () => void) => () => void, set: (value: string) => void, dispose: () => void }}
 */
export function createPlacementStore(storage) {
  let current = readPlacement(storage)
  const listeners = new Set()

  return {
    getSnapshot() {
      return current
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(value) {
      if (!PLACEMENTS.includes(value) || value === current) return
      current = value
      writePlacement(storage, value)
      for (const listener of listeners) listener()
    },
    dispose() {
      listeners.clear()
    },
  }
}
