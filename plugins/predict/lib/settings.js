/**
 * The two settings, as one small service the other halves read.
 *
 * WHY A SERVICE AND NOT CONFIG. The values change at runtime from the settings
 * page, and the Host half must see the change on the NEXT turn without a reload.
 * A Cordis service with plain getters is the smallest thing with that property.
 *
 * The client writes through `set()`, which persists to `localStorage` — the
 * browser owns the user's preference, as it does for every other plugin here.
 *
 * @module settings
 */

import { PLUGIN_ID } from './constants.js'

/** Where the values live in `localStorage`. Renaming loses every user's choice. */
export const ENABLED_KEY = PLUGIN_ID + ':enabled'
export const PINNED_MODEL_KEY = PLUGIN_ID + ':pinnedModel'

/** Defaults. Enabled, and the current model (the empty string means "current"). */
export const DEFAULT_ENABLED = true
export const DEFAULT_PINNED_MODEL = ''

/**
 * Read the enabled flag.
 *
 * Only the literal `'false'` turns it off; anything else keeps the default.
 *
 * @param {Storage | undefined} storage the storage object
 * @returns {boolean} whether predictions are on
 */
export function readEnabled(storage) {
  if (storage === null || storage === undefined) return DEFAULT_ENABLED
  try {
    return storage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return DEFAULT_ENABLED
  }
}

/**
 * Read the pinned model.
 *
 * An empty string means "use the current model", which is the default and the
 * common case. A malformed value (no slash) is ignored rather than passed on,
 * because a route the host cannot parse would fail every prediction silently.
 *
 * @param {Storage | undefined} storage the storage object
 * @returns {string} `"provider/model"`, or `''` for the current model
 */
export function readPinnedModel(storage) {
  if (storage === null || storage === undefined) return DEFAULT_PINNED_MODEL
  let raw
  try {
    raw = storage.getItem(PINNED_MODEL_KEY)
  } catch {
    return DEFAULT_PINNED_MODEL
  }
  if (typeof raw !== 'string') return DEFAULT_PINNED_MODEL
  const slash = raw.indexOf('/')
  return slash > 0 && slash < raw.length - 1 ? raw : DEFAULT_PINNED_MODEL
}

/**
 * Persist a value, ignoring a storage that throws.
 *
 * @param {Storage | undefined} storage the storage object
 * @param {string} key the key
 * @param {string} value the value
 * @returns {boolean} whether the write landed
 */
export function persist(storage, key, value) {
  if (storage === null || storage === undefined) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
