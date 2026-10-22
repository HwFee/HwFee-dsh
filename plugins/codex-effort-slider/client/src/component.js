/**
 * The slider component.
 *
 * It lives in the `conversation.input.right` slot as an INVISIBLE anchor, and
 * renders the actual control through a portal into the host's effort row. One
 * component instance therefore owns: the anchor (which gives it the session id and
 * its own composer), the DOM bridge, the motion engine, and the React tree.
 *
 * WHY EVERYTHING IN ONE COMPONENT. Hook order has to be constant across renders;
 * splitting the anchor and the control across two components that mount and
 * unmount independently is how "hooks called conditionally" bugs get written. The
 * upstream version avoided that with a module-level ownership flag and an early
 * `return null` — which branched around hooks for non-owners. The row itself now
 * carries the ownership marker (see `bridge.js`), so this component always runs the
 * same hook sequence.
 *
 * RENDER-TIME DISCIPLINE
 *   · positions come from a motion engine stepped in `requestAnimationFrame`, not
 *     from React state on every pointer event;
 *   · `publishMotion` compares before calling `setState`, so holding the pointer
 *     still does not re-render the four visual layers and 22 star nodes 60×/s.
 */

import {
  COMMIT_DEADLINE_MS,
  COMMIT_THROTTLE_MS,
  KNOB_RADIUS,
} from './constants.js'
import {
  EMPTY_SNAPSHOT,
  DETENT_THIRD,
  detentTargetIndex,
  effectiveEffortId,
  indexFromPct,
  indexOfLevel,
  levelsOf,
  pctFromIndex,
  reasoningSupport,
  resolveLevels,
} from './levels.js'
import {
  MOTION,
  MOTION_FAST,
  MOTION_REDUCED,
  MAX_FRAME_DT,
  POINTER_SPEED_EMA,
  POINTER_STALE_S,
  POINTER_SPEED_TAU,
  cancelFrame,
  clampAbs,
  createTrackMetrics,
  decayPointerSpeed,
  motionSettled,
  motionStep,
  nowMs,
  releaseIndexFor,
  scheduleFrame,
} from './motion.js'
import {
  PARTICLES,
  energyFor,
  fillBackgroundFor,
  knobOffsetOf,
  speedFor,
  starBrightnessFor,
  starCountFor,
  starDelayFor,
  starDurationFor,
  starLayerOpacityFor,
  valueColorFor,
} from './energy.js'
import { createMenuBridge } from './bridge.js'
import { createDirectoryAccess } from './directory.js'

/**
 * The transient level-list cache, keyed by model identity.
 *
 * Module scope on purpose: it survives a component remount (the host re-renders the
 * composer on every conversation switch) and it is what makes a momentary empty
 * `efforts` list harmless.
 */
const levelsCache = { key: null, levels: [] }

/** The last N drag samples, for the "copy diagnostics" action. */
const TRACE_LIMIT = 400

/**
 * @param {object} deps
 * @param {object} deps.React host React
 * @param {object} deps.ReactDOM host ReactDOM (`createPortal`)
 * @param {object} deps.ctx host context
 * @param {object} deps.settings the settings store
 * @param {() => boolean} deps.reducedMotion does the SYSTEM ask for reduced motion
 * @param {(entry: object) => void} deps.trace diagnostics sink
 */
export function createSliderComponent(deps) {
  const React = deps.React
  const ReactDOM = deps.ReactDOM
  const ctx = deps.ctx
  const settings = deps.settings
  const prefersReduced = deps.reducedMotion
  const trace = deps.trace
  const h = React.createElement

  function motionParamsFor(mode) {
    if (mode === 'quick') return MOTION_REDUCED
    if (mode === 'fast') return MOTION_FAST
    return MOTION
  }

  return function CodexEffortSlider(props) {
    const sessionId = typeof props.sessionId === 'string' && props.sessionId.length > 0 ? props.sessionId : null
    const locked = props.locked === true

    /**
     * REDUCED MOTION MEANS STOPPED, NOT SLOWER.
     *
     * This is the repo's rule (AGENTS.md §五: "尊重 prefers-reduced-motion：不是
     * 「慢一点」，而是不动"), and it is where this port deliberately diverges from
     * upstream, which slowed the starfield by 2.6×. When the system asks for
     * reduced motion: no particles are rendered at all, the sweep is disabled by
     * the media query in the sheet, and the knob jumps instead of interpolating.
     * The knob still TRACKS the pointer — that is the control's state, not
     * decoration — and the colour/energy still follow the position, so the feature
     * remains fully usable.
     */
    const reduced = prefersReduced()
    const mode = reduced ? 'reduced' : (function () {
      const stored = settings.read().motion
      return stored === 'quick' || stored === 'fast' ? stored : 'full'
    })()

    // Re-render when the settings popover writes anything.
    const [, setSettingsTick] = React.useState(0)

    const anchorRef = React.useRef(null)
    const trackRef = React.useRef(null)
    const settingsRef = React.useRef(settings)
    settingsRef.current = settings

    const access = React.useMemo(function () {
      if (sessionId === null || !ctx) return null
      return createDirectoryAccess({
        ctx,
        sessionId,
        timers: {
          set: function (fn, delay) { return setTimeout(fn, delay) },
          clear: function (handle) { clearTimeout(handle) },
        },
      })
    }, [ctx, sessionId])

    React.useEffect(function () {
      const bump = function () { setSettingsTick(function (n) { return n + 1 }) }
      settingsRef.current = settings
      let remove = null
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener(settings.event, bump)
        remove = function () { window.removeEventListener(settings.event, bump) }
      }
      // A settings change also invalidates the shared cache (another window may
      // have written it), so a fresh read reflects reality.
      return function () {
        if (remove !== null) remove()
      }
    }, [settings])

    React.useEffect(function () {
      return function () {
        if (access !== null) access.dispose()
      }
    }, [access])

    const subscribe = React.useCallback(function (onChange) {
      return access === null ? function () {} : access.subscribe(onChange)
    }, [access])
    const getSnapshot = React.useCallback(function () {
      return access === null ? EMPTY_SNAPSHOT : access.getSnapshot()
    }, [access])
    const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    const liveLevels = levelsOf(state)
    const liveKey = state && state.current && typeof state.current.provider === 'string' && typeof state.current.model === 'string'
      ? state.current.provider + '\u0000' + state.current.model
      : null
    const levels = resolveLevels(liveLevels, liveKey, levelsCache, reasoningSupport(state))
    const effectiveId = effectiveEffortId(state)
    const committedIndex = indexOfLevel(levels, effectiveId)
    const levelCount = levels.length

    const draftState = React.useState(null)
    const draft = draftState[0]
    const setDraft = draftState[1]
    const optimisticState = React.useState(null)
    const optimistic = optimisticState[0]
    const setOptimistic = optimisticState[1]
    const errorState = React.useState(null)
    const errorText = errorState[0]
    const setError = errorState[1]
    const busyState = React.useState(false)
    const busy = busyState[0]
    const setBusy = busyState[1]
    const hostState = React.useState(null)
    const host = hostState[0]
    const setHost = hostState[1]

    const optimisticIdRef = React.useRef(null)
    const draftRef = React.useRef(null)
    const commitRef = React.useRef({ timer: null, inFlight: false, queued: null, safetyTimer: null })
    const draggingRef = React.useRef(false)
    const buttonDownRef = React.useRef(false)
    const levelCountRef = React.useRef(0)
    const levelsRef = React.useRef([])
    const lastValidIndexRef = React.useRef(0)
    const lastCommittedIndexRef = React.useRef(-1)
    const seatNamesRef = React.useRef([])
    const effectivePctRef = React.useRef(0)
    const holdFramesRef = React.useRef(0)
    const detentIndexRef = React.useRef(-1)
    const snapIndexRef = React.useRef(null)
    const bridgeRef = React.useRef(null)
    const metricsRef = React.useRef(null)
    const endDragRef = React.useRef(null)
    const motionRef = React.useRef(null)
    const frameRef = React.useRef(null)
    const lastTsRef = React.useRef(0)
    const lastPtrPctRef = React.useRef(null)
    const lastPointerAtRef = React.useRef(0)

    levelCountRef.current = levelCount
    levelsRef.current = levels

    // A model with no reasoning metadata, or a catalog that has not loaded, must
    // produce NO control at all — an inert slider would lie about what it can do.
    const canRender = levelCount > 0

    /* ── derived display state ─────────────────────────────────────────────── */

    const optimisticId = optimistic !== null && typeof optimistic.id === 'string' ? optimistic.id : null
    const optimisticIndex = optimisticId === null ? -1 : indexOfLevel(levels, optimisticId)

    if (committedIndex >= 0) lastValidIndexRef.current = committedIndex
    // Never fall back to 0: index 0 is `off`/leftmost, so a momentarily empty list
    // would visibly snap the display to the far left. Use the last valid index, or
    // the middle of the current list (upstream issue #6's convention).
    const midIndex = Math.max(0, Math.min(Math.max(0, levelCount - 1), Math.floor((levelCount - 1) / 2)))
    const lastIdx = lastValidIndexRef.current
    const fallbackIndex = typeof lastIdx === 'number' && lastIdx >= 0 && lastIdx < levelCount ? lastIdx : midIndex
    let effectiveIndex = committedIndex >= 0 ? committedIndex : fallbackIndex
    if (optimisticIndex >= 0) effectiveIndex = optimisticIndex
    const effectivePct = pctFromIndex(effectiveIndex, levelCount)
    effectivePctRef.current = effectivePct
    const effectiveLevel = levels[effectiveIndex] || null

    const seatNames = []
    for (const level of levels) {
      if (level && typeof level.name === 'string' && level.name.length > 0) seatNames.push(level.name)
    }
    seatNamesRef.current = seatNames

    const shownIndex = draft !== null ? draft.index : effectiveIndex
    const shownPct = draft !== null && typeof draft.pct === 'number' ? draft.pct : effectivePct
    const shownLevel = levels[shownIndex] || null
    const energy = energyFor(shownPct)
    const energyOn = energy > 0
    const fillBackground = fillBackgroundFor(shownPct)
    const knobOffset = knobOffsetOf(shownPct)

    /* ── engine helpers (declared before the effects that call them) ────────── */

    function motionParams() {
      return motionParamsFor(mode)
    }

    function ensureMotion() {
      if (motionRef.current === null) {
        // Start from where the knob is DISPLAYED, not from 0 and not from a level.
        const x0 = draftRef.current !== null && typeof draftRef.current.pct === 'number'
          ? draftRef.current.pct
          : shownPct
        motionRef.current = { x: x0, v: 0, a: 0, target: x0, vPtr: 0 }
      }
      return motionRef.current
    }

    function draftIndexFor(m) {
      if (draggingRef.current) return indexFromPct(m.x, levelCountRef.current)
      return snapIndexRef.current !== null ? snapIndexRef.current : indexFromPct(m.x, levelCountRef.current)
    }

    function publishMotion(m) {
      const next = { pct: m.x, index: draftIndexFor(m) }
      const prev = draftRef.current
      if (prev !== null && prev.pct === next.pct && prev.index === next.index) return
      draftRef.current = next
      setDraft(next)
    }

    /* ── effects ────────────────────────────────────────────────────────────── */

    // The row's own outline: violet while energised, restored on the way out.
    React.useEffect(function () {
      if (host === null || !host.row || !host.row.style) return
      host.row.style.boxShadow = energyOn
        ? 'inset 0 0 0 1px rgba(168,85,247,' + (0.16 + 0.34 * energy).toFixed(2) + ')'
        : ''
    }, [host, energyOn, energy])

    // The host's own value text follows the position. Only the colour is written.
    React.useEffect(function () {
      if (host === null || !host.value || !host.value.style) return
      host.value.style.color = valueColorFor(shownPct, shownLevel)
    }, [host, shownPct, shownLevel])

    // ...and so does the collapsed seat, using the COMMITTED level (that is what the
    // seat shows; a mid-drag draft is not what the host is set to yet).
    React.useEffect(function () {
      if (bridgeRef.current === null) return
      bridgeRef.current.setSeatColor(valueColorFor(effectivePct, effectiveLevel))
    }, [levelCount, effectivePct, effectiveLevel])

    // The host caught up with the optimistic value: drop it and trust the directory.
    React.useEffect(function () {
      if (optimisticId !== null && effectiveId === optimisticId) setOptimistic(null)
    }, [effectiveId, optimisticId])

    // Roll the optimistic value back if the host never reports.
    React.useEffect(function () {
      if (optimisticId === null) return undefined
      const handle = setTimeout(function () {
        if (optimisticIdRef.current === optimisticId) {
          optimisticIdRef.current = null
          setOptimistic(null)
          setError('档位切换超时，宿主未回报结果（已回滚显示）')
        }
      }, COMMIT_DEADLINE_MS)
      return function () { clearTimeout(handle) }
    }, [optimisticId])

    // Unmount: no timer may write to the host after this.
    React.useEffect(function () {
      return function () {
        const pending = commitRef.current
        if (pending.timer !== null) { clearTimeout(pending.timer); pending.timer = null }
        if (pending.safetyTimer !== null) { clearTimeout(pending.safetyTimer); pending.safetyTimer = null }
        pending.queued = null
      }
    }, [])

    // The window-level release safety net (a pointerup outside the track is lost
    // otherwise). Bound once; it calls the LATEST endDrag through a ref, because the
    // first render's closure still has levelCount = 0 and would abort every write.
    React.useEffect(function () {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
      const stopDrag = function () {
        buttonDownRef.current = false
        if (draggingRef.current && typeof endDragRef.current === 'function') endDragRef.current()
      }
      window.addEventListener('pointerup', stopDrag, true)
      window.addEventListener('pointercancel', stopDrag, true)
      return function () {
        window.removeEventListener('pointerup', stopDrag, true)
        window.removeEventListener('pointercancel', stopDrag, true)
      }
    }, [])

    // The bridge: find the host row and mount into it.
    React.useEffect(function () {
      if (sessionId === null || !ctx) return undefined
      const bridge = createMenuBridge({
        doc: typeof document === 'undefined' ? null : document,
        win: typeof window === 'undefined' ? null : window,
        anchor: function () { return anchorRef.current },
        active: function () { return levelCountRef.current > 0 },
        onChange: function (next) { setHost(next) },
        seatLabels: function () { return seatNamesRef.current },
      })
      if (bridge === null) return undefined
      bridgeRef.current = bridge
      bridge.start()
      return function () {
        bridgeRef.current = null
        bridge.dispose()
      }
    }, [ctx, sessionId])

    /**
     * Track geometry, measured at drag start and on resize — not on every pointer
     * move. See `createTrackMetrics` for why this replaces a per-event rect read.
     */
    React.useEffect(function () {
      if (host === null) return undefined
      const metrics = createTrackMetrics({
        track: function () { return trackRef.current },
        SizeWatcherImpl: typeof ResizeObserver === 'function' ? ResizeObserver : null,
      })
      metricsRef.current = metrics
      metrics.start()
      return function () {
        metricsRef.current = null
        metrics.dispose()
      }
    }, [host])

    // Levels arrive AFTER the menu does (the catalog loads late). Nothing in the DOM
    // changes at that moment, so the observer stays quiet — without this rescan the
    // slider would never mount after a late catalog.
    React.useEffect(function () {
      if (bridgeRef.current !== null) bridgeRef.current.scan()
    }, [levelCount])

    /**
     * Keep the engine aligned with the COMMITTED level whenever it is idle.
     *
     * Without this: drag to max (engine x = 1), change the level through the host's
     * own effort pane (display shows via effectivePct, engine still x = 1), then
     * touch the slider — the engine is already at its target, settles in one frame,
     * and the display jumps 66%. Aligning only when idle keeps user input in charge
     * while it is happening.
     */
    React.useEffect(function () {
      const m = motionRef.current
      if (m === null) return
      if (draftRef.current !== null) return // dragging or settling: user wins
      m.x = effectivePct
      m.v = 0
      m.a = 0
      m.target = effectivePct
      m.vPtr = 0
    }, [effectivePct])

    /**
     * MODEL SWITCH: start over.
     *
     * The level ids belong to the model that advertised them, so carrying any of
     * this across a switch is wrong:
     *   · `draft` would show a position that means nothing on the new list;
     *   · the optimistic value would claim a level the new model may not have;
     *   · the pending/queued write was addressed to the old provider/model — a
     *     write sent now (or worse, after the host reports the new selection) would
     *     set an effort the user never chose. Dropping it is the correct action:
     *     the user's later intent, if any, produces a new request;
     *   · the motion engine's position has to be re-anchored, which the effect above
     *     does once `draft` is gone.
     *
     * Runs on identity change only, so an in-place snapshot update (a new
     * `pending` or `status`) does not disturb a drag in progress.
     */
    const modelIdentity = liveKey
    React.useEffect(function () {
      const pending = commitRef.current
      if (pending.timer !== null) { clearTimeout(pending.timer); pending.timer = null }
      if (pending.safetyTimer !== null) { clearTimeout(pending.safetyTimer); pending.safetyTimer = null }
      pending.queued = null
      optimisticIdRef.current = null
      setOptimistic(null)
      setBusy(false)
      setError(null)
      setDraft(null)
      draftRef.current = null
      snapIndexRef.current = null
      detentIndexRef.current = -1
      holdFramesRef.current = 0
      lastValidIndexRef.current = 0
      lastCommittedIndexRef.current = -1
      draggingRef.current = false
      buttonDownRef.current = false
      cancelFrame(frameRef.current)
      frameRef.current = null
      const m = motionRef.current
      if (m !== null) {
        // Re-anchor on the NEW model's committed level, using this render's own
        // effectivePct rather than the alignment effect: if both models happen to sit
        // at the same percentage, that effect's dependency would not change and the
        // engine would keep a position that belongs to the old list.
        m.x = effectivePct
        m.v = 0
        m.a = 0
        m.target = effectivePct
        m.vPtr = 0
      }
      trace({ k: 'model-reset', identity: modelIdentity })
    }, [modelIdentity])

    // Unmount: stop the frame loop so it cannot setState into a dead component
    // (the host re-renders the composer constantly while a reply streams).
    React.useEffect(function () {
      return function () {
        cancelFrame(frameRef.current)
        frameRef.current = null
      }
    }, [])

    /* ── write-back ─────────────────────────────────────────────────────────── */

    function currentState() {
      return access === null ? EMPTY_SNAPSHOT : access.getSnapshot()
    }

    function flush() {
      const pending = commitRef.current
      if (pending.timer !== null) { clearTimeout(pending.timer); pending.timer = null }
      const queued = pending.queued
      pending.queued = null
      if (pending.safetyTimer !== null) { clearTimeout(pending.safetyTimer); pending.safetyTimer = null }
      trace({ k: 'flush', id: queued === null ? null : queued.levelId })
      if (queued === null || queued === undefined || access === null) return

      // Resolve the directory BEFORE reading the snapshot, so the level check and the
      // write go through the SAME directory snapshot. Resolving afterwards could hand the
      // write to a freshly swapped directory whose catalog differs from the one the check
      // just validated.
      const directory = access.directory()
      const snapshot = currentState()
      const current = snapshot && snapshot.current
      if (!current || typeof current.provider !== 'string' || typeof current.model !== 'string') {
        setError('模型目录尚未就绪，无法写入档位')
        return
      }

      // THE WRITE IS BOUND TO THE MODEL IT WAS REQUESTED FOR: a queued write can be up to
      // COMMIT_THROTTLE_MS old, and the user may have switched models in that window.
      // Sending the old level id against the new provider/model is not a no-op — `low` may
      // not exist there, or may be a different rung. Either failure DISCARDS the write.
      if (queued.provider !== current.provider || queued.model !== current.model) {
        trace({ k: 'flush-drop', why: 'model-changed', id: queued.levelId, queuedFor: queued.model, now: current.model })
        return
      }
      // Check the level against THIS render's list, not the list captured at request time:
      // the queued copy describes the catalog as it was, and what matters is whether the
      // id is still valid now. A transiently empty live list falls back to the same-model
      // cache, which is exactly what the component renders from.
      const currentLevels = levelsRef.current
      const knownLevels = currentLevels.length > 0 ? currentLevels : []
      const listed = knownLevels.length > 0
        ? knownLevels.some(function (level) { return level.id === queued.levelId })
        : queued.levels !== null && queued.levels.indexOf(queued.levelId) >= 0
      if (!listed) {
        trace({ k: 'flush-drop', why: 'level-gone', id: queued.levelId })
        return
      }
      // Second dedupe gate: the host may already be on this level.
      if (effectiveEffortId(snapshot) === queued.levelId) { trace({ k: 'flush-skip', id: queued.levelId, why: 'dedupe' }); return }

      const levelId = queued.levelId
      if (directory === null || typeof directory.select !== 'function') {
        setError('模型目录不可用，档位未写入')
        return
      }

      pending.inFlight = true
      optimisticIdRef.current = levelId
      setOptimistic({ id: levelId })
      setError(null)
      setBusy(true)

      let result
      try {
        result = directory.select({ provider: current.provider, model: current.model, reasoningEffort: levelId })
      } catch (error) {
        result = Promise.reject(error)
      }

      Promise.resolve(result).then(
        function (outcome) {
          pending.inFlight = false
          trace({ k: outcome && outcome.ok === false ? 'commit-fail' : 'commit-ok' })
          if (outcome && outcome.ok === false) {
            optimisticIdRef.current = null
            setOptimistic(null)
            setError(errorTextOf(outcome.error))
          }
        },
        function (error) {
          pending.inFlight = false
          optimisticIdRef.current = null
          setOptimistic(null)
          setError(errorTextOf(error))
        },
      ).then(function () {
        setBusy(false)
        // Coalescing: send whatever was queued while that call was in flight.
        if (pending.queued !== null) flush()
      })
    }

    /** Request a write-back: dedupe, coalesce, rate-limit. `immediate` = release / keyboard. */
    function requestCommit(levelId, immediate) {
      if (levelId === null || levelId === undefined) return
      const pending = commitRef.current
      const snapshot = currentState()
      if (effectiveEffortId(snapshot) === levelId && pending.queued === null && !pending.inFlight) return
      // BIND THE QUEUE TO THE MODEL. See flush(): a write requested while model A was
      // current must never be sent after the user switched to model B.
      const current = snapshot && snapshot.current
      const ids = []
      for (const level of levelsRef.current) ids.push(level.id)
      pending.queued = {
        levelId,
        provider: current && typeof current.provider === 'string' ? current.provider : null,
        model: current && typeof current.model === 'string' ? current.model : null,
        levels: ids,
      }
      trace({ k: 'req', id: levelId, imm: immediate === true, inFlight: pending.inFlight })
      if (pending.inFlight) {
        // Do NOT return here. The in-flight call's tail may already have run (a
        // microtask can complete before this synchronous call), leaving the queued
        // value stranded — the measured cause of "the effective level never
        // updates". Poll with a bound until it can be sent.
        if (pending.safetyTimer === null) {
          const armSafety = function () {
            pending.safetyTimer = setTimeout(function () {
              pending.safetyTimer = null
              if (pending.queued === null) return
              if (pending.inFlight) { armSafety(); return }
              trace({ k: 'safety-flush', id: pending.queued.levelId })
              flush()
            }, 50)
          }
          armSafety()
        }
        return
      }
      if (immediate === true) { flush(); return }
      if (pending.timer !== null) return
      pending.timer = setTimeout(function () {
        pending.timer = null
        flush()
      }, COMMIT_THROTTLE_MS)
    }

    /* ── engine wiring ──────────────────────────────────────────────────────── */

    function startFrames() {
      if (frameRef.current !== null) return
      lastTsRef.current = nowMs()
      const step = function (ts) {
        frameRef.current = null
        const m = motionRef.current
        if (m === null) return
        const p = motionParams()
        const dt = Math.min(MAX_FRAME_DT, Math.max(0.001, (ts - lastTsRef.current) / 1000))
        lastTsRef.current = ts
        // Age the pointer velocity FIRST, using the real elapsed time since the last
        // pointermove (not the frame dt — that is reset every frame and would never
        // cross the staleness window, so the decay would never happen).
        const sincePointer = (ts - lastPointerAtRef.current) / 1000
        m.vPtr = decayPointerSpeed(m.vPtr, sincePointer, POINTER_STALE_S, POINTER_SPEED_TAU)
        motionStep(m, dt, p)
        if (motionSettled(m, p)) {
          m.x = m.target
          m.v = 0
          m.a = 0
          if (draggingRef.current) {
            // "Settled" during a drag only means "caught up with the pointer": the
            // finger is still down, so keep the draft. And keep scheduling — stopping
            // here makes the next move restart the loop with a near-zero dt, which
            // shows up as a stutter that only slow drags hit.
            publishMotion(m)
            frameRef.current = scheduleFrame(step)
            return
          }
          // Handing control back to `effectivePct` before the write-back lands is
          // what made the display flash the OLD level. Hold until it catches up,
          // with a bounded fallback (~0.75s).
          if (Math.abs(effectivePctRef.current - m.target) > 0.001 && holdFramesRef.current < 45) {
            holdFramesRef.current += 1
            draftRef.current = { pct: m.target, index: snapIndexRef.current }
            publishMotion(m)
            frameRef.current = scheduleFrame(step)
            return
          }
          holdFramesRef.current = 0
          draftRef.current = null
          snapIndexRef.current = null
          setDraft(null)
          return
        }
        publishMotion(m)
        frameRef.current = scheduleFrame(step)
      }
      frameRef.current = scheduleFrame(step)
    }

    /** Land immediately (reduced motion): no interpolation at all. */
    function jumpTo(targetPct) {
      const m = ensureMotion()
      m.target = targetPct
      m.x = targetPct
      m.v = 0
      m.a = 0
      m.vPtr = 0
    }

    function pctAt(clientX) {
      const metrics = metricsRef.current
      if (metrics === null) return null
      return metrics.pctAt(clientX, KNOB_RADIUS)
    }

    /** The track lives inside the host's <button>; a drag must never click through. */
    function swallow(event) {
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
    }

    function moveTo(clientX) {
      if (levelCount === 0) return
      const pct = pctAt(clientX)
      if (pct === null) return
      const m = ensureMotion()
      const now = nowMs()
      const dtPtr = (now - lastPointerAtRef.current) / 1000
      if (lastPtrPctRef.current !== null && dtPtr > 0.001) {
        const raw = (pct - lastPtrPctRef.current) / dtPtr
        m.vPtr = m.vPtr * (1 - POINTER_SPEED_EMA) + clampAbs(raw, MOTION.vmax) * POINTER_SPEED_EMA
      }
      lastPtrPctRef.current = pct
      lastPointerAtRef.current = now

      const fastMode = mode === 'fast'
      if (fastMode) {
        // The "fast" feel does not follow the pointer: the knob sits on a detent and
        // advances one notch when the pointer crosses the hysteresis lines.
        const pos = pct * Math.max(1, levelCount - 1)
        let cur = detentIndexRef.current
        if (!(cur >= 0)) cur = indexFromPct(m.target, levelCount)
        cur = detentTargetIndex(pos, cur, levelCount, DETENT_THIRD)
        detentIndexRef.current = cur
        m.target = pctFromIndex(cur, levelCount)
      } else {
        m.target = pct // the only thing written
      }

      // Switching the level as you cross it: only ONCE per crossing.
      const nowIndex = fastMode ? detentIndexRef.current : indexFromPct(pct, levelCount)
      if (nowIndex >= 0 && nowIndex !== lastCommittedIndexRef.current) {
        lastCommittedIndexRef.current = nowIndex
        requestCommit(levels[nowIndex].id, false)
      }

      if (mode === 'reduced') {
        jumpTo(m.target)
        draftRef.current = { pct: m.target, index: indexFromPct(m.target, levelCount) }
        setDraft(draftRef.current)
        return
      }
      startFrames()
    }

    function endDrag() {
      if (!draggingRef.current) return
      draggingRef.current = false
      const m = ensureMotion()
      // Read the LATEST levels through refs: this function is also called from the
      // window safety net, whose closure dates from mount (levelCount = 0 there).
      const levelCountNow = levelCountRef.current
      const levelsNow = levelsRef.current
      if (!(levelCountNow > 0) || !levelsNow || levelsNow.length < levelCountNow) {
        trace({ k: 'release-abort', why: 'levelCount=0' })
        return
      }

      let idx
      if (mode === 'fast') {
        // In fast mode the target is already on a detent; no projection, no settle.
        idx = detentIndexRef.current >= 0 ? detentIndexRef.current : indexFromPct(m.target, levelCountNow)
        idx = Math.max(0, Math.min(levelCountNow - 1, idx))
        m.vPtr = 0
        m.target = pctFromIndex(idx, levelCountNow)
      } else {
        // The landing decision is independent of the animation: always project from
        // pointer velocity (accessibility changes HOW it moves, never WHERE it lands).
        idx = releaseIndexFor(m.target, m.vPtr, levelCountNow)
        m.vPtr = 0
        if (mode === 'reduced') {
          jumpTo(pctFromIndex(idx, levelCountNow))
        } else {
          // Inherit the velocity: drag → snap is one continuous motion, not a replay.
          m.target = pctFromIndex(idx, levelCountNow)
        }
      }
      snapIndexRef.current = idx
      if (idx >= 0 && idx < levelCountNow) requestCommit(levelsNow[idx].id, true)
      trace({ k: 'release', idx, x: m.x, target: m.target })

      if (mode === 'reduced') {
        draftRef.current = null
        snapIndexRef.current = null
        setDraft(null)
        return
      }
      publishMotion(m)
      startFrames()
    }

    endDragRef.current = endDrag

    function onTrackPointerDown(event) {
      if (locked || levelCount === 0) return
      swallow(event)
      draggingRef.current = true
      buttonDownRef.current = true
      lastCommittedIndexRef.current = -1
      detentIndexRef.current = -1
      // MEASURE HERE, once, for the whole drag.
      if (metricsRef.current !== null) metricsRef.current.measure()
      if (mode === 'fast') {
        const p0 = pctAt(event.clientX)
        if (p0 !== null && levelCount > 0) detentIndexRef.current = indexFromPct(p0, levelCount)
      }
      holdFramesRef.current = 0
      snapIndexRef.current = null
      try {
        if (event.currentTarget && typeof event.currentTarget.setPointerCapture === 'function' && event.pointerId !== undefined) {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      } catch (error) {
        /* capture is a nicety */
      }
      // A press is a SUMMON: the target moves to the pointer, the motion state stays.
      lastPtrPctRef.current = null
      moveTo(event.clientX)
    }

    function onTrackPointerMove(event) {
      if (!draggingRef.current) return
      // No button held: this is a merged event or a lost pointerup. Ignore it, do
      // not end the drag (ending here produces a "left then back" twitch).
      if (event && event.buttons === 0 && buttonDownRef.current !== true) return
      swallow(event)
      moveTo(event.clientX)
    }

    function onKeyDown(event) {
      if (locked || levelCount === 0) return
      const index = draftRef.current !== null ? draftRef.current.index : shownIndex
      let next = null
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, index - 1)
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(levelCount - 1, index + 1)
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = levelCount - 1
      else return // Escape / Enter / Tab belong to the host's menu
      swallow(event)
      if (typeof event.preventDefault === 'function') event.preventDefault()
      const targetPct = pctFromIndex(next, levelCount)
      if (mode === 'reduced') {
        jumpTo(targetPct)
        snapIndexRef.current = null
        draftRef.current = null
        setDraft(null)
      } else {
        const m = ensureMotion()
        snapIndexRef.current = next
        m.target = targetPct
        m.vPtr = 0
        publishMotion(m)
        startFrames()
      }
      requestCommit(levels[next].id, true)
    }

    /* ── render ─────────────────────────────────────────────────────────────── */

    let portal = null
    if (host !== null && host.container && canRender) {
      const tickNodes = []
      for (let t = 0; t < levelCount; t += 1) {
        tickNodes.push(h('span', {
          key: 'tick-' + levels[t].id,
          className: 'ces-tick',
          'data-ces-part': 'tick',
          'data-on': t <= shownIndex ? '1' : '0',
          style: { left: knobOffsetOf(pctFromIndex(t, levelCount)) },
        }))
      }

      const positionSpeed = speedFor(shownPct)
      // NO PARTICLES AT ALL under reduced motion: the repository rule is "not
      // slower, not moving", so building animated nodes that the media query then
      // hides would be wasted work that also lies about intent.
      const starCount = reduced ? 0 : starCountFor(shownPct)
      const starLayerOpacity = starLayerOpacityFor(shownPct)
      const particleNodes = []
      for (let s = 0; s < starCount; s += 1) {
        const brightness = starBrightnessFor(s)
        // Duration and PHASE are inline: as CSS variables a negative phase does not
        // apply in the real host (see the note in styles.js).
        const duration = starDurationFor(s, positionSpeed)
        particleNodes.push(h('span', {
          key: 'star-' + s,
          className: 'ces-star',
          'data-ces-part': 'star',
          style: {
            top: PARTICLES[s].y + '%',
            animationDuration: duration.toFixed(3) + 's',
            animationDelay: starDelayFor(s, duration).toFixed(3) + 's',
          },
        }, h('span', {
          className: 'ces-star__dot',
          'data-ces-part': 'particle',
          'data-brightness': brightness.toFixed(3),
          style: { '--ces-b': brightness.toFixed(3) },
        })))
      }

      const track = h('div', {
        ref: trackRef,
        className: 'ces-track',
        'data-ces-part': 'track',
        role: 'slider',
        tabIndex: locked ? -1 : 0,
        'aria-label': '推理等级',
        'aria-valuemin': 0,
        'aria-valuemax': Math.max(0, levelCount - 1),
        'aria-valuenow': shownIndex,
        'aria-valuetext': shownLevel !== null ? shownLevel.name : '',
        'aria-disabled': locked ? 'true' : undefined,
        title: '推理等级' + (shownLevel !== null ? '：' + shownLevel.name : ''),
        onPointerDown: onTrackPointerDown,
        onPointerMove: onTrackPointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onKeyDown: onKeyDown,
        onClick: swallow,
      },
      // Fill: width reaches the knob CENTRE (not the whole track), background is
      // "blue on the left → this position's colour on the right".
      h('div', {
        className: 'ces-fill',
        'data-ces-part': 'fill',
        style: { width: knobOffset, background: fillBackground },
      }),
      // Energy layer (nebula + sweep): opacity = energy, which is what fades it in.
      h('div', { className: 'ces-energy', 'data-ces-part': 'energy', style: { width: knobOffset } },
        h('div', { className: 'ces-energy__sweep', 'data-ces-part': 'sweep' })),
      // Stars on their own layer: they must not fade in with the nebula.
      h('div', {
        className: 'ces-stars',
        'data-ces-part': 'stars',
        style: { width: knobOffset, opacity: starLayerOpacity.toFixed(3) },
      }, particleNodes),
      tickNodes,
      h('div', { className: 'ces-knob', 'data-ces-part': 'knob', style: { left: knobOffset } }),
      )

      portal = ReactDOM.createPortal(
        h('div', {
          className: 'ces-inline',
          'data-ces-part': 'root',
          'data-energy': energyOn ? '1' : '0',
          'data-motion': mode,
          'data-reached-ticks': settings.read().reachedTicks,
          'data-busy': busy ? '1' : '0',
          style: { '--ces-energy': String(energy) },
        },
        track,
        errorText !== null
          ? h('div', { className: 'ces-error', 'data-ces-part': 'error', role: 'status' }, errorText)
          : null,
        ),
        host.container,
      )
    }

    // The anchor: invisible, no layout box, and the only reason this component is
    // in the slot at all (session id + "which composer is mine").
    return h('span', {
      ref: anchorRef,
      hidden: true,
      'data-ces-part': 'anchor',
      'aria-hidden': 'true',
    }, portal)
  }
}

/** `error.message` / `error.code` / the string itself, whichever is useful. */
function errorTextOf(error) {
  if (error === null || error === undefined) return '档位切换失败'
  if (typeof error === 'string') return error
  if (typeof error.message === 'string' && error.message.length > 0) return error.message
  if (typeof error.code === 'string' && error.code.length > 0) return error.code
  return String(error)
}

/** A bounded ring buffer for the diagnostics export. */
export function createTrace() {
  const buffer = []
  const push = function (entry) {
    try {
      buffer.push(entry)
      if (buffer.length > TRACE_LIMIT) buffer.splice(0, buffer.length - TRACE_LIMIT)
    } catch (error) {
      /* diagnostics must never affect the feature */
    }
  }
  return {
    push,
    clear() { buffer.length = 0 },
    size() { return buffer.length },
    dump() {
      try {
        const lines = ['=== 推理等级滑条诊断 ' + new Date().toISOString() + ' ===']
        lines.push('记录 ' + buffer.length + ' 条')
        for (const entry of buffer.slice(-TRACE_LIMIT)) lines.push(JSON.stringify(entry))
        return lines.join('\n')
      } catch (error) {
        return '诊断生成失败: ' + String(error)
      }
    },
  }
}
