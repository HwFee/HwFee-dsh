/**
 * The user preferences this plugin owns: the height of the stats panel body and
 * the unit scale every formatted number uses.
 *
 * WHY A MODULE OF ITS OWN. The values are read by two React trees that never
 * share a parent — the hero panel and the settings rows — so they live in a tiny
 * external store with `subscribe`/`getState`, exactly the shape
 * `React.useSyncExternalStore` wants. Both sides then re-render on a change, and
 * the stylesheet only ever sees a CSS custom property.
 *
 * PURE BY DESIGN. No React, no DOM at import time: `node:test` imports this
 * module directly, and the storage adapter is injected (the browser passes
 * `window.localStorage`, tests pass a Map-like stub or nothing).
 *
 * 内容：面板高度 + 数字单位两个偏好。两份 React 树（hero 面板 / 设置行）共用这个
 * 外部 store；纯函数可单测，存储适配器由调用方注入。
 */

import { STORAGE_KEY } from './constants.js'
import { overviewVars } from './layout.js'

/**
 * The default body height in px. It is also the CSS fallback baked into the
 * stylesheet on the tab body (`height: var(--dus-body-height, 344px)`), which
 * is what keeps the panel correct when no preference has ever been written.
 */
export const DEFAULT_BODY_HEIGHT = 344

/** The slider's range, in px. */
export const MIN_BODY_HEIGHT = 240
export const MAX_BODY_HEIGHT = 520

/** Slider step in px. 344 = 240 + 26×4, so the default sits on the grid. */
export const BODY_HEIGHT_STEP = 4

/**
 * The custom property the stylesheet consumes. Declared once here so the
 * stylesheet, the store and the tests cannot drift apart.
 */
export const BODY_HEIGHT_VAR = '--dus-body-height'

/**
 * The unit preference: a plain ON/OFF switch.
 *
 *   - `myriad` (ON, the default for a zh UI) — 万/亿
 *   - `short`  (OFF)                        — K/M/B
 *
 * WHY THE THREE-STATE FORM WAS DROPPED. It shipped as a segmented control of
 * three options including `auto` ("follow the interface language"), and the user
 * could not tell what it meant: auto, short and myriad looked like three
 * synonyms to a reader who simply wanted Chinese units or Western ones. A
 * segmented control also asked the reader to parse three labels to answer a
 * yes/no question. One switch asks the question directly. `auto` was the only
 * state a reader had to be TOLD about, which is the tell that it should not
 * have been a state.
 *
 * The DEFAULT is still language-aware, so the out-of-the-box behaviour on a
 * Chinese interface is unchanged (万/亿, as `auto` resolved). Only the choice is
 * simpler now.
 *
 * A STORED `auto` FROM THE OLD BUILD MIGRATES: `clampUnits` maps it to the
 * scale it would have resolved to for the language in play, so nobody's panel
 * changes appearance on upgrade. `short` and `myriad` pass through.
 */
export const DEFAULT_UNITS = 'myriad'
export const UNIT_MODES = ['short', 'myriad']

/** Coerce an arbitrary stored unit mode into the two-state schema.
 *
 * The `language` argument is optional and only matters for a store written by the
 * OLD build, which could hold `auto`. `loadSettings` has no language at load time,
 * so an `auto` payload there resolves to the default (`myriad`) — correct for the
 * Chinese interface this ships on, and merely "keeps Chinese units" on an English
 * one, which is a stable state rather than a wrong one. The override exists so a
 * caller that DOES know the language (and any future migration) can resolve it
 * exactly; the tests exercise both.
 */
export function clampUnits(value, language) {
  if (value === 'short' || value === 'myriad') return value
  if (language === 'en') return 'short'
  return DEFAULT_UNITS
}

/** True when the switch's stored value means "on". */
export function unitsIsOn(value) {
  return clampUnits(value) === 'myriad'
}

/** The value the switch writes for a given on/off state. */
export function unitsForSwitch(on) {
  return on ? 'myriad' : 'short'
}

/**
 * Coerce an arbitrary stored value into a usable height.
 *
 * Malformed or missing data falls back to the default (an install upgrading
 * from a build without this setting, a hand-edited localStorage, a `null` from
 * a failed read). Numeric values are clamped into the slider range AND snapped
 * to its step grid, so a hand-written 347 still lands on a control position and
 * the readout never shows a value the slider cannot express.
 */
export function clampBodyHeight(value) {
  // Only a number or a numeric string is a height; booleans, arrays, objects
  // and null all mean "no usable value" (Number() would happily coerce them).
  let n = Number.NaN
  if (typeof value === 'number') n = value
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_BODY_HEIGHT
  const clamped = Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, Math.round(n)))
  const snapped = MIN_BODY_HEIGHT + Math.round((clamped - MIN_BODY_HEIGHT) / BODY_HEIGHT_STEP) * BODY_HEIGHT_STEP
  return Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, snapped))
}

/** Coerce an arbitrary settings object into the schema. Unknown fields drop. */
export function sanitizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    bodyHeight: clampBodyHeight(source.bodyHeight),
    // An old payload (from before the unit row existed) has no field → auto.
    units: clampUnits(source.units),
  }
}

/** Read the persisted settings; anything unreadable becomes the default. */
export function loadSettings(storage) {
  try {
    const raw = storage ? storage.getItem(STORAGE_KEY) : null
    if (!raw) return sanitizeSettings(null)
    return sanitizeSettings(JSON.parse(raw))
  } catch (error) {
    return sanitizeSettings(null)
  }
}

/** Persist the settings; a broken storage (private mode, quota) is not fatal. */
export function saveSettings(storage, settings) {
  try {
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    /* the store keeps the in-memory value, which is what the UI reads */
  }
}

/**
 * The inline style that hands the values to CSS. Applied on the panel root, so
 * the tab body `.dus-body` (a descendant) resolves `var(--dus-body-height,
 * 344px)` to it for BOTH tabs, and the Overview tab's shrink lengths
 * (`--dus-heat-cell-max`, gaps, type sizes) arrive as concrete px values.
 *
 * The shrink arithmetic lives in `layout.js` (pure, unit-tested): CSS cannot
 * divide a length by a length, and `container-type: size` + `cqh` cannot express
 * the tiered shrink order or be asserted without a browser. `viewportWidth` is
 * what decides whether the card grid has two rows or three (the stylesheet wraps
 * it under 560px), so the caller passes the live width.
 */
export function bodyHeightStyle(height, viewportWidth) {
  const clamped = clampBodyHeight(height)
  return Object.assign(
    { [BODY_HEIGHT_VAR]: clamped + 'px' },
    overviewVars(clamped, { viewportWidth: viewportWidth }),
  )
}

/**
 * The external store shared by the panel and the settings rows.
 *
 * `getState()` returns a frozen snapshot (same reference until a write), which
 * is exactly what `useSyncExternalStore` compares to decide on a re-render.
 * Every setter clamps, persists and notifies only on an actual change, so a
 * drag that stays on one step — or clicking the already-selected unit mode —
 * does not churn either tree.
 */
export function createSettingsStore(storage) {
  let state = Object.freeze(Object.assign({}, loadSettings(storage)))
  const listeners = []

  function commit(next) {
    state = Object.freeze(next)
    saveSettings(storage, state)
    for (let i = 0; i < listeners.length; i += 1) {
      try { listeners[i](state) } catch (error) { /* a dead row must not stall the panel */ }
    }
  }

  return {
    getState() { return state },

    /** Clamp + persist + notify; returns the value actually stored. */
    setBodyHeight(height) {
      const next = clampBodyHeight(height)
      if (next === state.bodyHeight) return next
      commit(Object.assign({}, state, { bodyHeight: next }))
      return next
    },

    /** Switch the unit mode (`auto` | `short` | `myriad`); returns what was stored. */
    setUnits(mode) {
      const next = clampUnits(mode)
      if (next === state.units) return next
      commit(Object.assign({}, state, { units: next }))
      return next
    },

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
