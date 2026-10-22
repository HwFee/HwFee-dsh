/**
 * Level arithmetic and snapshot readers — pure functions, no DOM, no React.
 *
 * These mirror the host's own semantics:
 *   - the level list is `model.reasoning.efforts` (`id` + display `name`),
 *   - the effective level is `current.reasoningEffort ?? reasoning.defaultEffort`,
 * exactly as `syncInputs()` computes it in `dsh-client-ui-model-selection`.
 */

/** The snapshot shape a directory store returns before it has loaded anything. */
export const EMPTY_SNAPSHOT = Object.freeze({
  current: null,
  groups: [],
  failures: [],
  status: 'idle',
  pending: null,
  error: null,
  retainedEffort: undefined,
})

/**
 * Find the currently selected model entry inside `groups[].models[]`.
 *
 * @param {object} state directory snapshot
 * @returns {object | null} the model, or null when the catalog does not know it
 */
export function modelOf(state) {
  const current = state && state.current
  if (!current || typeof current.provider !== 'string' || typeof current.model !== 'string') return null
  const groups = state && Array.isArray(state.groups) ? state.groups : []
  for (const group of groups) {
    if (!group || group.id !== current.provider) continue
    const models = Array.isArray(group.models) ? group.models : []
    for (const model of models) {
      if (model && model.id === current.model) return model
    }
  }
  return null
}

/**
 * The levels this exact model actually offers, in catalog order.
 *
 * An entry without a usable `id` is dropped rather than guessed at: writing an
 * unknown effort id back to the host is rejected by the adapter, so showing a
 * level we cannot commit would only produce a slider that lies.
 *
 * @param {object} state directory snapshot
 * @returns {Array<{ id: string, name: string }>}
 */
export function levelsOf(state) {
  const model = modelOf(state)
  const efforts = model && model.reasoning && Array.isArray(model.reasoning.efforts) ? model.reasoning.efforts : []
  const out = []
  for (const effort of efforts) {
    if (!effort || typeof effort.id !== 'string' || effort.id.length === 0) continue
    out.push({
      id: effort.id,
      name: typeof effort.name === 'string' && effort.name.length > 0 ? effort.name : effort.id,
    })
  }
  return out
}

/**
 * Does the current model advertise reasoning AT ALL?
 *
 * This is the third answer an empty level list can have, and it is the one that used
 * to be guessed wrong:
 *   `true`  — the catalog knows the model and it carries a `reasoning` block;
 *   `false` — the catalog knows the model and it has NO `reasoning` block. DEFINITIVE:
 *             this model offers no effort, so no control must be rendered;
 *   `null`  — the catalog does not know the model (yet). Transient, so the cache is a
 *             legitimate fallback.
 *
 * Without this distinction "efforts are momentarily empty" and "this model has no
 * efforts" are indistinguishable, both look like `[]`, and the cache answered the
 * second one with the PREVIOUS model's levels: the slider kept rendering four rungs
 * for a model that has none, and a drag would write an effort id that model rejects.
 *
 * @param {object} state directory snapshot
 * @returns {boolean | null}
 */
export function reasoningSupport(state) {
  const current = state && state.current
  if (!current || typeof current.provider !== 'string' || typeof current.model !== 'string') return null
  const model = modelOf(state)
  if (model === null) return null
  return !!(model.reasoning && typeof model.reasoning === 'object')
}

/**
 * Pick the level list to render, falling back to the cache when the live list is
 * momentarily empty.
 *
 * WHY THE CACHE EXISTS. The host transiently drops `model.reasoning.efforts`
 * while a model is being switched or the catalog refreshed. A release landing in
 * that window computed `levelCount = 0`, aborted the write-back, and the display
 * snapped back to the old level — the "it pauses then jumps a notch" report. The
 * level list is static per model, so an empty list is not information.
 *
 * The cache is keyed by model identity, so a REAL model change never reuses it. Two
 * gates, because identity alone was not enough:
 *   · an UNKNOWN identity (`liveKey === null`) must never reuse anything — with no
 *     identity there is no evidence the cached list belongs to the model in force;
 *   · a DEFINITIVE "no reasoning" (`reasoning === false`) must never reuse anything
 *     either, even when the identity matches: that is not a transient gap, it is the
 *     model's own answer.
 *
 * @param {Array} liveLevels levels from the current snapshot
 * @param {string | null} liveKey `provider\0model`, or null when unknown
 * @param {{ key: string | null, levels: Array }} cache mutated in place
 * @param {boolean | null} [reasoning] {@link reasoningSupport}; omitted means unknown
 * @returns {Array}
 */
export function resolveLevels(liveLevels, liveKey, cache, reasoning) {
  if (liveLevels.length > 0) {
    cache.key = liveKey
    cache.levels = liveLevels
    return liveLevels
  }
  // The catalog answered for THIS model: it has no reasoning, so there is nothing to
  // show and nothing to reuse. Returning the live (empty) list is the whole point.
  if (reasoning === false) return liveLevels
  // No identity, or a different one: the cached list describes some other model.
  if (liveKey === null || cache.key !== liveKey) return liveLevels
  return cache.levels.length > 0 ? cache.levels : liveLevels
}

/**
 * The level id actually in force: an explicit choice wins, otherwise the model's
 * default (the host's own `effort = intended.reasoningEffort ?? reasoning.defaultEffort`).
 *
 * @param {object} state directory snapshot
 * @returns {string | null}
 */
export function effectiveEffortId(state) {
  const current = state && state.current
  if (current && typeof current.reasoningEffort === 'string' && current.reasoningEffort.length > 0) {
    return current.reasoningEffort
  }
  const model = modelOf(state)
  const fallback = model && model.reasoning && model.reasoning.defaultEffort
  return typeof fallback === 'string' && fallback.length > 0 ? fallback : null
}

/** Index of `id` in `levels`, or -1. */
export function indexOfLevel(levels, id) {
  if (typeof id !== 'string') return -1
  for (let i = 0; i < levels.length; i += 1) if (levels[i].id === id) return i
  return -1
}

/** Clamp to [0, 1]; also swallows NaN (a NaN position would freeze the knob). */
export function clamp01(value) {
  if (!(value > 0)) return 0
  return value > 1 ? 1 : value
}

/**
 * Percentage → nearest level index. The track is continuous, the levels are not,
 * so every position must snap to one of them.
 */
export function indexFromPct(pct, count) {
  if (count <= 1) return 0
  return Math.max(0, Math.min(count - 1, Math.round(clamp01(pct) * (count - 1))))
}

/**
 * Level index → its percentage along the track (ticks and knob always agree).
 *
 * A SINGLE LEVEL PINS THE KNOB TO THE RIGHT (upstream issue #7): that one level is
 * the maximum, not "leftmost/off". An empty list still returns 0, so a
 * not-yet-loaded catalog cannot fling the knob to the far right.
 */
export function pctFromIndex(index, count) {
  if (count <= 0) return 0
  if (count === 1) return 1
  const safe = Math.max(0, Math.min(count - 1, index))
  return safe / (count - 1)
}

/** One-notch-at-a-time threshold for the "fast" (Codex) feel: +1/3 forward, -2/3 back. */
export const DETENT_THIRD = 1 / 3

/**
 * Detent decision for the "fast" motion mode (pure, so it is unit-testable):
 *   `pos` in level coordinates 0…count-1, `cur` the notch we are parked on.
 * Advancing requires `pos >= cur + 1/3` (a fast drag may cross several at once);
 * retreating requires `pos <= cur - 2/3`. Hysteresis is what stops a wobble at
 * the boundary from flickering between two levels.
 */
export function detentTargetIndex(pos, cur, count, third) {
  if (count <= 1) return 0
  const th = typeof third === 'number' && third > 0 && third < 0.5 ? third : 1 / 3
  const lo = Math.max(0, Math.min(count - 1, typeof cur === 'number' ? cur : 0))
  const p = Math.max(0, Math.min(count - 1, pos))
  if (p >= lo + th) return Math.min(count - 1, Math.max(lo + 1, Math.round(p)))
  if (p <= lo - (1 - th)) return Math.max(0, Math.min(lo - 1, Math.round(p)))
  return lo
}
