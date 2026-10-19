/**
 * The settings row: one slider whose stop count is whatever the model offers.
 *
 * RENDERING RULES, in the order the component applies them (each one is a real
 * case in the user's own profile, not a hypothetical):
 *
 *   no session            → the row explains it and renders no control;
 *   catalog loading/error → a quiet state line, never a slider with no levels;
 *   N === 0 advertised    → NOTHING. The host's contract is explicit: "An
 *                           adapter without reasoning metadata leaves the Effort
 *                           row absent; there is no arbitrary effort input."
 *                           `xiaomi/mimo-v2.6-pro` in the shipped profile
 *                           declares no `reasoningEfforts`, so this is the
 *                           branch that keeps it honest;
 *   N === 1 advertised    → a read-only LABEL naming that level. One position
 *                           is not a slider: a 1-stop range input is a dead
 *                           control that looks interactive and does nothing;
 *   N >= 2                → the real thing: N discrete stops, index 0..N-1,
 *                           `aria-valuetext` carrying the level's name, the
 *                           selected level's name + description under the
 *                           track, a Default badge when the level equals the
 *                           catalog's `defaultEffort`, and the reference's
 *                           amber warning only on `max`.
 *
 * THE THUMB NEVER LIES. `setEffort` is optimistic-free: the value rendered is
 * the durable projection (`modelSelection.next.reasoningEffort`), and a failed
 * write reverts the thumb by simply not advancing it and printing the host's
 * error. There is no local "selected" state to drift.
 *
 * The component is a pure function of (controller snapshot, t). It owns no
 * listeners beyond one `useSyncExternalStore`, so a test can drive it with a
 * fake React and a plain object.
 */

import { buildLevelModel, isAdvertised, stopAt } from './levels.js'
import { makeT } from './locales.js'

/**
 * The tick marks: one per advertised stop, evenly spaced.
 *
 * A range input's stops are at `i / (N - 1)` of the track width; the thumb is
 * 14px wide, so the marks are offset by half a thumb to sit under its centre.
 * They are decorative (`aria-hidden`) — the input itself is the control.
 */
function Ticks(React, stops, index) {
  if (stops.length < 2) return null
  const marks = stops.map(function (stop, at) {
    const percent = (at / (stops.length - 1)) * 100
    return React.createElement('span', {
      key: stop.id,
      className: 'dre-tick',
      'data-past': at <= index ? 'true' : 'false',
      style: { left: percent + '%' },
    })
  })
  return React.createElement('div', { className: 'dre-ticks', 'aria-hidden': 'true' }, ...marks)
}

/**
 * Build the row components against the host's React.
 *
 * @param {object} deps
 * @param {object} deps.React host React
 * @param {object} deps.controller the effort controller (see controller.js)
 * @returns {{ EffortRow: Function, Warning: Function }}
 */
export function createPanel({ React, controller }) {
  /**
   * The row. `t` arrives from the slot registration's `locale:` field and is
   * re-injected on a language switch; a host without the locale service leaves
   * it undefined and `makeT` falls back to the embedded English table.
   */
  function EffortRow(props) {
    const t = makeT(props && props.t)
    const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    const [pending, setPending] = React.useState(null)
    const [failure, setFailure] = React.useState(null)

    // A model switch can shorten the list under an in-flight write; the pending
    // marker is keyed on the level it was started for, so it clears itself
    // rather than sticking to an unrelated level.
    React.useEffect(function () {
      if (pending === null) return undefined
      const model = buildLevelModel({ reasoning: state.reasoning, selected: state.selected, t })
      if (!isAdvertised(model.stops, pending)) setPending(null)
      return undefined
    }, [state.provider, state.modelId, pending])

    function commit(id) {
      if (pending !== null) return
      setFailure(null)
      setPending(id)
      controller.setEffort(id).then(function (result) {
        setPending(null)
        if (result.ok) return
        // REVERT: nothing was advanced locally, so the thumb is already back on
        // the durable value. The error is what the user needed to see.
        setFailure(result.error === 'effort not advertised'
          ? t('error.notAdvertised')
          : t('error.write', { message: result.error === undefined ? '' : result.error }))
      }).catch(function (error) {
        setPending(null)
        setFailure(t('error.write', { message: error instanceof Error ? error.message : String(error) }))
      })
    }

    const title = React.createElement('div', { className: 'dre-title' }, t('row.title'))
    const description = React.createElement('div', { className: 'dre-desc' }, t('row.desc'))

    function shell(control) {
      return React.createElement('div', { className: 'dre-row' },
        React.createElement('div', { className: 'dre-row-text' }, title, description),
        control)
    }

    // No session: say so once, with no control.
    if (state.phase === 'no-session') {
      return shell(React.createElement('div', { className: 'dre-control' },
        React.createElement('div', { className: 'dre-pending' }, t('row.sessionless'))))
    }

    if (state.phase === 'loading' || state.phase === 'idle') {
      return shell(React.createElement('div', { className: 'dre-control' },
        React.createElement('div', { className: 'dre-pending' }, t('state.loading'))))
    }

    if (state.phase === 'error') {
      return shell(React.createElement('div', { className: 'dre-control' },
        React.createElement('div', { className: 'dre-error' },
          state.error === undefined ? t('state.unavailable') : t('error.write', { message: state.error }))))
    }

    // No model catalog on this host: there is no level list to draw, so the row
    // removes itself rather than pretending to load forever.
    if (state.phase === 'unsupported') return null

    const model = buildLevelModel({ reasoning: state.reasoning, selected: state.selected, t })

    // N === 0: the adapter advertised nothing. Render nothing at all — not even
    // an empty row — because a row that cannot do anything is noise in a list
    // of settings that can.
    if (model.mode === 'none') return null

    const active = model.stops[model.index]

    const valueLine = React.createElement('div', { className: 'dre-value' },
      React.createElement('span', null, active.name),
      active.isDefault
        ? React.createElement('span', { className: 'dre-badge' }, t('badge.default'))
        : null)

    // N === 1: a label, not a slider. There is nothing to slide to.
    if (model.mode === 'label') {
      return shell(React.createElement('div', { className: 'dre-control' },
        React.createElement('div', {
          className: 'dre-single',
          'aria-label': t('aria.single', { name: active.name }),
        }, active.name,
        active.isDefault
          ? React.createElement('span', { className: 'dre-badge' }, t('badge.default'))
          : null),
        active.description === undefined
          ? null
          : React.createElement('div', { className: 'dre-pending' }, active.description)))
    }

    const fill = model.stops.length > 1
      ? Math.round((model.index / (model.stops.length - 1)) * 100)
      : 0

    const control = React.createElement('div', { className: 'dre-control' },
      valueLine,
      React.createElement('input', {
        type: 'range',
        className: 'dre-slider',
        // The range is the advertised list, 0..N-1 — never a fixed 1..5.
        min: 0,
        max: model.stops.length - 1,
        step: 1,
        value: model.index,
        // The accessible name and value are the level's own, not "3".
        'aria-label': t('row.title'),
        'aria-valuetext': t('aria.label', {
          name: active.name,
          index: model.index + 1,
          count: model.stops.length,
        }),
        disabled: pending !== null,
        style: { '--dre-fill': fill + '%' },
        onChange: function (event) {
          const stop = stopAt(model.stops, parseInt(event.target.value, 10))
          // A drag that lands on the level already in force is not a write.
          if (stop === undefined || stop.id === model.selected) return
          commit(stop.id)
        },
      }),
      Ticks(React, model.stops, model.index),
      active.description === undefined
        ? null
        : React.createElement('div', { className: 'dre-pending' }, active.description),
      model.warning
        ? React.createElement('div', { className: 'dre-warning', role: 'note' },
          React.createElement('span', { className: 'dre-warning-mark', 'aria-hidden': 'true' }, '⚠️'),
          React.createElement('span', null, t('level.max.warning')))
        : null,
      pending !== null
        ? React.createElement('div', { className: 'dre-pending' }, t('note.pending'))
        : null,
      failure !== null
        ? React.createElement('div', { className: 'dre-error', role: 'alert' }, failure)
        : null)

    return shell(control)
  }

  return { EffortRow }
}
