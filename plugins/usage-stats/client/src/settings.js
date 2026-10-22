/**
 * The user preferences this plugin owns: the panel style, the height of the
 * stats panel body, and the unit scale every formatted number uses.
 *
 * WHY A MODULE OF ITS OWN. The values are read by two React trees that never
 * share a parent — the hero panel and the settings rows — so they live in a tiny
 * external store with `subscribe`/`getState`, exactly the shape
 * `React.useSyncExternalStore` wants. Both sides then re-render on a change, and
 * the stylesheet only ever sees CSS custom properties.
 *
 * PURE BY DESIGN. No React, no DOM at import time: `node:test` imports this
 * module directly, and the storage adapter is injected (the browser passes
 * `window.localStorage`, tests pass a Map-like stub or nothing).
 *
 * 内容：面板样式 + 面板高度 + 数字单位三个偏好。两份 React 树（hero 面板 / 设置行）
 * 共用这个外部 store；纯函数可单测，存储适配器由调用方注入。高度**按样式分别存储**，
 * 所以切换样式不会改写另一种样式的高度。
 */

import { STORAGE_KEY } from './constants.js'
import { COMPACT_DEFAULT_BODY_HEIGHT, compactVars } from './compact-layout.js'
import { overviewVars } from './layout.js'

/**
 * The default body height in px, for the CLASSIC (shipped) style. It is also the
 * CSS fallback baked into the stylesheet on the tab body
 * (`height: var(--dus-body-height, 344px)`), which is what keeps the panel
 * correct when no preference has ever been written.
 */
export const DEFAULT_BODY_HEIGHT = 344

/** The slider's range, in px. Shared by both panel styles. */
export const MIN_BODY_HEIGHT = 240
export const MAX_BODY_HEIGHT = 520

/** Slider step in px. 344 = 240 + 26×4, so the default sits on the grid. */
export const BODY_HEIGHT_STEP = 4

/**
 * The two selectable panel styles.
 *
 *   `classic` — the shipped panel: width follows the composer, filled metric
 *               tiles, a heat band on its own surface, a hairline above the
 *               caption. It is the DEFAULT so an upgrade changes nothing.
 *   `compact` — the reference's usage panel: a 480px plain card, flat metric
 *               tiles one tone deeper than the wash, the heat grid directly on
 *               the card, no divider above the caption.
 *
 * The style is a stored preference, not two builds: both render the same
 * components and the same numbers, and only the stylesheet's scoped block
 * differs, so switching is instant and neither needs a reload.
 */
export const DEFAULT_STYLE = 'classic'
export const PANEL_STYLES = ['classic', 'compact']

/** The custom property the stylesheet consumes. Declared once here so the
 *  stylesheet, the store and the tests cannot drift apart. */
export const BODY_HEIGHT_VAR = '--dus-body-height'

/**
 * Coerce an arbitrary stored value into one of the two styles.
 *
 * A payload written before the style existed has no field, and hand-edited or
 * corrupt values are equally possible; both mean `classic`, which is the
 * behaviour the panel had before the option existed.
 */
export function clampStyle(value) {
  return PANEL_STYLES.indexOf(value) >= 0 ? value : DEFAULT_STYLE
}

/** True for the compact style — the one place the string is compared. */
export function isCompact(style) {
  return clampStyle(style) === 'compact'
}

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
 * Malformed or missing data falls back to the default for the style in hand (an
 * install upgrading from a build without this setting, a hand-edited
 * localStorage, a `null` from a failed read). Numeric values are clamped into the
 * slider range AND snapped to its step grid, so a hand-written 347 still lands on
 * a control position and the readout never shows a value the slider cannot
 * express.
 *
 * `style` decides which default a malformed value falls back to: the classic
 * style keeps 344, the compact style its own natural 252. Both are on the grid.
 */
export function clampBodyHeight(value, style) {
  const fallback = isCompact(style) ? COMPACT_DEFAULT_BODY_HEIGHT : DEFAULT_BODY_HEIGHT
  // Only a number or a numeric string is a height; booleans, arrays, objects
  // and null all mean "no usable value" (Number() would happily coerce them).
  let n = Number.NaN
  if (typeof value === 'number') n = value
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const clamped = Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, Math.round(n)))
  const snapped = MIN_BODY_HEIGHT + Math.round((clamped - MIN_BODY_HEIGHT) / BODY_HEIGHT_STEP) * BODY_HEIGHT_STEP
  return Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, snapped))
}

/**
 * Coerce an arbitrary settings object into the schema. Unknown fields drop.
 *
 * HEIGHT IS STORED PER STYLE (`bodyHeight` for classic, `compactBodyHeight` for
 * compact). One shared number would mean the setting silently rewrites the other
 * style's look: picking compact would either squash the user's classic panel or
 * force the compact card to classic's 344px, which is exactly the "offers a
 * height control but ignores it" failure the option must avoid. Keeping two
 * fields makes the slider always edit the style in view, and switching back
 * restores what that style had.
 */
export function sanitizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const style = clampStyle(source.style)
  return {
    style: style,
    bodyHeight: clampBodyHeight(source.bodyHeight, 'classic'),
    compactBodyHeight: clampBodyHeight(source.compactBodyHeight, 'compact'),
    // An old payload (from before the unit row existed) has no field → auto.
    units: clampUnits(source.units),
  }
}

/**
 * The body height the style in view actually uses.
 *
 * Both the panel and the height row go through this, so the slider's readout and
 * the rendered box can never name different numbers.
 */
export function bodyHeightOf(state) {
  const source = state && typeof state === 'object' ? state : {}
  return isCompact(source.style) ? source.compactBodyHeight : source.bodyHeight
}

/** The state key the height row writes for the style in view. */
export function bodyHeightKey(style) {
  return isCompact(style) ? 'compactBodyHeight' : 'bodyHeight'
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
 * The shrink arithmetic lives in the two layout modules (pure, unit-tested): CSS
 * cannot divide a length by a length, and `container-type: size` + `cqh` cannot
 * express the tiered shrink order or be asserted without a browser.
 *
 * ONLY THE ACTIVE STYLE'S LENGTHS ARE EMITTED. Writing both sets would let a
 * stale `--dus-heat-cell-max` from the other style leak into the one on screen
 * through a rule that forgot to scope it. `viewportWidth` is what decides
 * whether the classic card grid has two rows or three (the stylesheet wraps it
 * under 560px), so the caller passes the live width; the compact grid is
 * width-independent and takes the height alone.
 */
export function bodyHeightStyle(height, viewportWidth, style) {
  const compact = isCompact(style)
  const clamped = clampBodyHeight(height, compact ? 'compact' : 'classic')
  const derived = compact
    ? compactVars(clamped)
    : overviewVars(clamped, { viewportWidth: viewportWidth })
  return Object.assign({ [BODY_HEIGHT_VAR]: clamped + 'px' }, derived)
}

/**
 * The external store shared by the panel and the settings rows.
 *
 * `getState()` returns a frozen snapshot (same reference until a write), which
 * is exactly what `useSyncExternalStore` compares to decide on a re-render.
 * Every setter clamps, persists and notifies only on an actual change, so a drag
 * that stays on one step — or clicking the already-selected unit mode — does not
 * churn either tree.
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

    /** Switch the panel style; returns the value actually stored. */
    setStyle(style) {
      const next = clampStyle(style)
      if (next === state.style) return next
      commit(Object.assign({}, state, { style: next }))
      return next
    },

    /**
     * Clamp + persist + notify; returns the value actually stored.
     *
     * The write lands on the field of the style in view unless `forStyle` names
     * one explicitly, so a slider dragged while compact is showing edits
     * `compactBodyHeight` and leaves the classic height alone. A caller that
     * knows the target style (the settings row does) passes it, which keeps the
     * write correct even if the two trees ever disagree about the current style
     * for a frame.
     */
    setBodyHeight(height, forStyle) {
      const style = clampStyle(forStyle === undefined ? state.style : forStyle)
      const key = bodyHeightKey(style)
      const next = clampBodyHeight(height, style)
      if (next === state[key]) return next
      const patch = {}
      patch[key] = next
      commit(Object.assign({}, state, patch))
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
