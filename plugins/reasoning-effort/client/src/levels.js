/**
 * Levels and copy: everything this plugin knows about a reasoning effort.
 *
 * THE ONE RULE. The stop list is whatever the catalog advertises, in catalog
 * order. This module never invents a level, never pads to five, and never
 * filters one out. `EFFORT_META` from the reference repo is used as a lookup
 * table *by id* for the copy of the ids it happens to cover.
 *
 * WHY. The reference component hardcodes `effortLevels: ['low','medium','high',
 * 'xhigh','max']`. That is Claude's catalogue, not DeepSeek Harness's: a
 * provider here can advertise three levels, two, or none at all
 * (`xiaomi/mimo-v2.6-pro` in the user's own profile declares no
 * `reasoningEfforts`). A slider with a fixed stop count would either show
 * levels the provider cannot serve or hide ones it can.
 *
 * COPY RESOLUTION, per advertised level:
 *   1. the id matches a known reference id (`low`…`max`) → the reference's
 *      name+description, translated into the active language by the caller;
 *   2. any other id (`minimal`, `off`, a custom `cordis.patch.yml` key) → the
 *      catalog's own `name`, and NO description.
 *
 * "DEFAULT" REPLACES "RECOMMENDED". The reference hardcodes
 * `recommended: 'high'`; nothing in this codebase may. The marker rides the
 * catalog's real `reasoning.defaultEffort` and is called 默认 / Default.
 */

import { LEVEL_META_IDS, LEVEL_ORDER, WARNING_LEVEL_ID } from './constants.js'

/** Whether an id is one the reference describes. */
export function isKnownLevelId(id) {
  return LEVEL_META_IDS.indexOf(id) !== -1
}

/**
 * Sort an advertised list into escalation order without dropping or adding
 * anything.
 *
 * The catalog normally arrives already ordered, but an adapter is free to
 * declare its `reasoningEfforts` in any order (the pi-ai route rebuilds them by
 * walking a fixed id list, but a differently-built adapter need not). Known ids
 * sort by the canonical ladder position; an unknown id is placed after every
 * known id, keeping its catalog order among its peers. `Array.prototype.sort`
 * is stable in every engine this ships to.
 *
 * @param {Array<{id: string, name?: string}>} efforts advertised levels
 * @returns {Array<{id: string, name?: string}>} a new, ordered array
 */
export function orderEfforts(efforts) {
  if (!Array.isArray(efforts)) return []
  return efforts
    .map(function (effort, index) {
      const rank = LEVEL_ORDER.indexOf(effort && effort.id)
      return { effort: effort, index: index, rank: rank === -1 ? LEVEL_ORDER.length : rank }
    })
    .sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank
      return a.index - b.index
    })
    .map(function (entry) { return entry.effort })
}

/**
 * Build the slider model for one session state.
 *
 * @param {object} input
 * @param {object|null|undefined} input.reasoning the model's `reasoning` record
 *        from the catalog: `{ efforts: [{id,name}], defaultEffort?: string }`.
 *        Absent means the adapter advertised no reasoning metadata — the legal
 *        case that must render NOTHING.
 * @param {string|undefined} input.selected the session's current effort id
 *        (`modelSelection.next.reasoningEffort`), if any.
 * @param {(key: string, params?: object) => string} [input.t] translator for
 *        the reference copy; a bare-key identity fallback is used when absent.
 * @returns {{
 *   mode: 'none'|'label'|'slider',
 *   stops: Array<object>,
 *   index: number,
 *   selected: string|undefined,
 *   defaultId: string|undefined,
 *   warning: boolean,
 *   description: string|undefined,
 * }}
 *   `mode: 'none'`   no advertised level → the row must not render;
 *   `mode: 'label'`  exactly one level → a read-only label, not a 1-stop slider;
 *   `mode: 'slider'` two or more → a real discrete slider.
 */
export function buildLevelModel(input) {
  const source = input && typeof input === 'object' ? input : {}
  const t = typeof source.t === 'function' ? source.t : function identity(key) { return key }
  const reasoning = source.reasoning && typeof source.reasoning === 'object' ? source.reasoning : null
  const advertised = reasoning !== null && Array.isArray(reasoning.efforts) ? reasoning.efforts : []
  const efforts = orderEfforts(advertised.filter(function (effort) {
    return effort !== null && typeof effort === 'object'
      && typeof effort.id === 'string' && effort.id !== ''
  }))

  if (efforts.length === 0) {
    return {
      mode: 'none', stops: [], index: -1, selected: undefined,
      defaultId: undefined, warning: false, description: undefined,
    }
  }

  const defaultId = reasoning !== null && typeof reasoning.defaultEffort === 'string'
    ? reasoning.defaultEffort
    : undefined

  const stops = efforts.map(function (effort, index) {
    const known = isKnownLevelId(effort.id)
    // A known id gets the reference copy; an unknown one gets only what the
    // provider stated. `name` is the catalog's own display name when present.
    const name = known
      ? t('level.' + effort.id + '.name')
      : (typeof effort.name === 'string' && effort.name !== '' ? effort.name : effort.id)
    const description = known ? t('level.' + effort.id + '.desc') : undefined
    return {
      id: effort.id,
      index: index,
      name: name,
      description: description,
      known: known,
      isDefault: effort.id === defaultId,
      warning: effort.id === WARNING_LEVEL_ID,
    }
  })

  // The active stop: the session's own choice when the provider still offers
  // it, otherwise the provider's default, otherwise the first advertised stop.
  // This is the clamp that makes a model switch safe: switching to a model with
  // a shorter list can never leave the thumb pointing past the end.
  let index = -1
  if (typeof source.selected === 'string') {
    index = stops.findIndex(function (stop) { return stop.id === source.selected })
  }
  if (index === -1 && defaultId !== undefined) {
    index = stops.findIndex(function (stop) { return stop.id === defaultId })
  }
  if (index === -1) index = 0

  const active = stops[index]

  return {
    mode: stops.length === 1 ? 'label' : 'slider',
    stops: stops,
    index: index,
    selected: active.id,
    defaultId: defaultId,
    // The reference's warning block is keyed on the `max` id AND shown only
    // while that stop is the selected one.
    warning: active.id === WARNING_LEVEL_ID && active.description !== undefined,
    description: active.description,
  }
}

/**
 * The level at a slider index, clamped into range. A range input can emit an
 * out-of-range or non-integer value (a stale `max` after a model switch, a
 * hand-edited DOM), and this is the one place that decides what an index means.
 *
 * @param {Array<object>} stops
 * @param {number} raw
 * @returns {object|undefined}
 */
export function stopAt(stops, raw) {
  if (!Array.isArray(stops) || stops.length === 0) return undefined
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return stops[0]
  return stops[Math.min(stops.length - 1, Math.max(0, n))]
}

/**
 * Whether a write is allowed. The chosen id has to be one the provider actually
 * advertised; a stale id from the previous model is refused rather than sent.
 *
 * @param {Array<object>} stops
 * @param {string} id
 * @returns {boolean}
 */
export function isAdvertised(stops, id) {
  if (!Array.isArray(stops) || typeof id !== 'string') return false
  return stops.some(function (stop) { return stop.id === id })
}
