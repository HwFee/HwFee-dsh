/**
 * The panel body: the six metric cards, the activity heatmap and the model
 * breakdown, rendered as a dock occupant on the blank-session hero.
 *
 * WHY A FACTORY. `React` and `primitives` arrive as arguments instead of module
 * imports because the browser only has the host's frozen module table; passing
 * them in also means the panel renders under a test's own React with no host
 * around it.
 *
 * WHY NO JSX. The bundle is built by esbuild without a JSX transform, so every
 * element is `React.createElement`.
 *
 * ARITHMETIC LIVES ELSEWHERE. Everything the user reads as a number — range
 * trimming, token and count formatting, the heatmap grid — comes from
 * `stats.js`, which is pure and unit-tested without a DOM. This file only
 * arranges that output.
 */

import { DEFAULT_STATE, RANGES } from './constants.js'
import { attachInputBudget } from './input-budget.js'
import { TIP_INSET, TIP_MAX_WIDTH, tipCentre } from './layout.js'
import { en as FALLBACK_DICT } from './locales.js'
import {
  DEFAULT_UNITS, bodyHeightOf, bodyHeightStyle, createSettingsStore, isCompact,
} from './settings.js'
import { STALE_RETRY_MS } from './summary-cache.js'
import {
  buildHeatmap, favoriteModel, formatHour, formatNumber, resolveUnitScale, summarize,
} from './stats.js'

/**
 * Tab ids are the values `DEFAULT_STATE.tab` accepts, so the first render
 * needs no mapping. The pill text is `tab.<id>` in the locale dictionary.
 */
const TABS = [
  { id: 'overview' },
  { id: 'models' },
]

/**
 * Copy for callers that render without a locale seat — tests, and any host
 * that slots the panel in without a `t` prop. English is the mirror-language
 * of the dictionaries because `locales.js` already keeps `en` complete.
 */
const FALLBACK_T = function (key, params) {
  const template = FALLBACK_DICT[key] ?? key
  return String(template).replace(/\{(\w+)\}/g, function (match, name) {
    return params && name in params ? String(params[name]) : match
  })
}

/**
 * The render predicate, kept exported so it can be exercised on its own.
 *
 * It is the host's own hero condition (`conversationPhase()` reaches "blank"
 * only on this combination), so the panel appears and clears in the same frame
 * as the headline above it — including for a session whose first prompt was
 * typed but never sent.
 */
export function isBlankSession(session) {
  return Boolean(session) && session.blank === true && !session.running && !session.promptAttempted
}

/**
 * Re-seats `.dus-root` between the hero shell and the hero workspace row.
 *
 * WHY A DOM MOVE. The dock outlet wrapper is `display: contents`, so the
 * composer stack (a column flex) treats `.dus-root` as its own flex item — but
 * CSS `order` can only send it to the very front of the stack, above the
 * headline, because no integer order lands between two `order:0` DOM siblings.
 * The layout the design wants is headline → panel → mode-chip row → composer,
 * which only a real reparenting expresses. The workspace row is found by the
 * `[data-slot="conversation.hero.workspace"]` anchor it wraps — a stable hook
 * the host publishes on purpose, unlike its salted module class.
 *
 * WHY IT IS SAFE. The move runs once per mount inside an effect, after the
 * first commit, and only when the row actually precedes the outlet in the same
 * parent — every other seat leaves the panel in its natural dock position.
 * The cleanup puts the node back so a blank→live→blank flip never strands it.
 */
function hoistAboveWorkspaceRow(rootEl) {
  if (rootEl === null || rootEl.parentNode === null) return undefined
  const outlet = rootEl.parentNode
  const stack = outlet.parentNode
  if (stack === null) return undefined
  const workspaceRow = Array.prototype.find.call(stack.children, function (child) {
    return child !== outlet && typeof child.querySelector === 'function'
      && child.querySelector('[data-slot="conversation.hero.workspace"]') !== null
  })
  if (workspaceRow === undefined || workspaceRow === outlet.nextSibling) return undefined
  stack.insertBefore(outlet, workspaceRow)
  return function () {
    // Restore DOM order so a remount or seat change doesn't leak the hoisted
    // outlet; insertBefore on the same node is a no-op if it is already home.
    if (outlet.parentNode === stack && workspaceRow.parentNode === stack) {
      stack.insertBefore(outlet, workspaceRow.nextSibling)
    }
  }
}

/**
 * The six cards in fixed contract order. `favoriteModel` returns null on an
 * empty log; the card then shows a dash instead of collapsing, so the 3 × 2
 * grid keeps its height between ranges.
 */
function metricCards(view, t, unitScale) {
  const favourite = favoriteModel(view.perModel)
  return [
    { key: 'sessions', label: t('card.sessions'), value: formatNumber(view.sessions, unitScale) },
    { key: 'messages', label: t('card.messages'), value: formatNumber(view.messages, unitScale) },
    { key: 'tokens', label: t('card.tokens'), value: formatNumber(view.totalTokens, unitScale) },
    { key: 'days', label: t('card.days'), value: formatNumber(view.activeDays, unitScale) },
    { key: 'peak', label: t('card.peak'), value: formatHour(view.peakHour) },
    { key: 'model', label: t('card.model'), value: favourite === null ? '—' : favourite.id },
  ]
}

/**
 * Rows for the model tab, heaviest first.
 *
 * The share uses the same denominator as `favoriteModel`, so the bar order and
 * the favourite card can never disagree about which model leads.
 */
function modelRows(perModel, totalTokens) {
  const rows = []
  for (const id of Object.keys(perModel)) {
    const entry = perModel[id]
    rows.push({
      id: id,
      tokens: entry.tokens,
      share: totalTokens > 0 ? entry.tokens / totalTokens : 0,
    })
  }
  rows.sort(function (left, right) { return right.tokens - left.tokens })
  return rows
}

/**
 * One label for the share, used for both the printed percentage and the bar
 * width, so the number and the bar can never round apart.
 */
function shareLabel(share) {
  return (share * 100).toFixed(1) + '%'
}

/**
 * The Overview tab's body: the cards and the heat band inside ONE
 * `.dus-overview` element.
 *
 * Exported because the equal-height contract is a structure+CSS pair, not a
 * number: `.dus-body` owns the fixed height both tabs share, and this wrapper is
 * what makes the Overview tab fill it (`height:100%`) with the heat band as its
 * only flexible child — the band takes up whatever the fixed body leaves, so the
 * tab's outer box is exactly the body height at every setting. The test suite
 * asserts this wrapper and its child order without needing a DOM.
 */
export function overviewElement(React, cards, heat) {
  return React.createElement('div', { className: 'dus-overview' }, cards, heat)
}

/**
 * Builds the panel component.
 *
 * `primitives` is part of the fixed factory signature but stays unused: the
 * panel is plain elements plus host tokens, and pulling a control from the
 * primitive set would make its visuals depend on a package this plugin does not
 * otherwise need.
 *
 * `settings` is the shared store for the one preference this plugin owns (the
 * body height). The panel subscribes to it and writes the value as the
 * `--dus-body-height` custom property on its root, so dragging the General row
 * resizes the ONE tab body both tabs share — the slider moves the whole panel
 * height live, and no reload is needed. A store-less call gets a private,
 * default-valued one — the panel still renders in a bare test seat.
 */
export function createPanel({ React, primitives, settings }) {
  const store = settings || createSettingsStore(null)
  function renderHead(t, tab, onTab, rangeId, onRange) {
    const tabs = TABS.map(function (entry) {
      const active = entry.id === tab
      return React.createElement('button', {
        key: entry.id,
        type: 'button',
        role: 'tab',
        className: 'dus-tab',
        'data-active': active ? 'true' : 'false',
        'aria-selected': active,
        onClick: function () { onTab(entry.id) },
      }, t('tab.' + entry.id))
    })
    const ranges = RANGES.map(function (entry) {
      const active = entry.id === rangeId
      return React.createElement('button', {
        key: entry.id,
        type: 'button',
        className: 'dus-range',
        'data-active': active ? 'true' : 'false',
        'aria-pressed': active,
        title: entry.days === 0 ? t('range.all.hint') : t('range.days.hint', { days: entry.days }),
        onClick: function () { onRange(entry.id) },
      }, t('range.' + entry.id))
    })
    return React.createElement('div', { className: 'dus-head' },
      React.createElement('div', { className: 'dus-tabs', role: 'tablist', 'aria-label': t('aria.tabs') }, tabs),
      React.createElement('div', { className: 'dus-head-spacer', 'aria-hidden': 'true' }),
      React.createElement('div', { className: 'dus-ranges', role: 'group', 'aria-label': t('aria.ranges') }, ranges))
  }

  function renderCards(view, t, unitScale) {
    const cards = metricCards(view, t, unitScale).map(function (card) {
      // `data-card` names the metric. The compact style reads it to set the
      // model tile at the label weight (a name is not a figure), and it is also
      // what makes a metric findable in a test without matching on its text.
      return React.createElement('div', {
        className: 'dus-card', key: card.key, 'data-card': card.key,
      },
        React.createElement('div', { className: 'dus-card-label' }, card.label),
        React.createElement('div', { className: 'dus-card-value', title: card.value }, card.value))
    })
    return React.createElement('div', { className: 'dus-grid' }, cards)
  }

  function renderHeat(allView, t, tips, unitScale) {
    // The heatmap is a CALENDAR and must not reflow when the range pills
    // switch: it always draws the same unfiltered window. Only the numbers
    // above the grid respond to All/30d/7d.
    //
    // `buildHeatmap` anchors the grid at TODAY and counts backward in columns
    // of seven days, so every column is full and the bottom-right cell is
    // today. Each week array therefore holds exactly seven cells; the renderer
    // just draws them in order.
    const grid = buildHeatmap(allView.perDay, 0)
    // An activity-free window has no grid at all; a line of text keeps the
    // panel from ending in an unexplained gap.
    if (grid.weeks.length === 0) {
      return React.createElement('div', { className: 'dus-note' }, t('note.noActivity'))
    }
    // Every square is a real day and shows its date on hover — that is the
    // point of a calendar. `buildHeatmap` marks the days BEFORE the first
    // active day `pad: true` (the All floor's quiet columns): they are grid
    // padding rather than logged days, so they stay out of the a11y tree, but
    // the date still appears on hover.
    //
    // The sentence goes to `aria-label` (the accessibility tree) AND to a
    // styled bubble; the native `title` is gone on purpose — it is the OS
    // tooltip, so it arrives after the platform delay with the system font and
    // colours, which reads as a foreign object inside a CDS panel.
    const cell = function (key, text, extra) {
      return React.createElement('span', Object.assign({
        key: key,
        className: 'dus-heat-cell',
        'aria-label': text,
        onMouseEnter: function (event) { tips.show(event.currentTarget, text) },
        onMouseLeave: function () { tips.hide() },
      }, extra))
    }
    const weeks = grid.weeks.map(function (week, index) {
      const cells = week.map(function (entry) {
        if (entry.pad) {
          return cell(entry.key, t('heat.cell.zero', { date: entry.key }),
            { 'data-level': '0', 'aria-hidden': 'true' })
        }
        // A quiet day inside the window is still a real date with a real zero,
        // so it keeps its tooltip: the grid is a calendar, not a bar chart of
        // busy days.
        if (entry.count === 0) {
          return cell(entry.key, t('heat.cell.zero', { date: entry.key }), { 'data-level': '0' })
        }
        return cell(entry.key,
          t(entry.count === 1 ? 'heat.cell.one' : 'heat.cell',
            { date: entry.key, count: formatNumber(entry.count, unitScale) }),
          { 'data-level': String(entry.level) })
      })
      return React.createElement('div', { className: 'dus-heat-week', key: 'week-' + index }, cells)
    })
    return React.createElement('div', {
      className: 'dus-heat',
      role: 'img',
      'aria-label': t('aria.heatmap', { weeks: grid.weeks.length, max: formatNumber(grid.max, unitScale) }),
    }, weeks)
  }

  function renderModels(view, t, unitScale) {
    const rows = modelRows(view.perModel, view.totalTokens)
    if (rows.length === 0) {
      return React.createElement('div', { className: 'dus-note' }, t('note.noModels'))
    }
    return React.createElement('div', { className: 'dus-models' },
      rows.map(function (row) {
        const share = shareLabel(row.share)
        return React.createElement('div', { className: 'dus-model', key: row.id },
          React.createElement('div', { className: 'dus-model-head' },
            React.createElement('span', { className: 'dus-model-id', title: row.id }, row.id),
            React.createElement('span', { className: 'dus-model-tokens' }, formatNumber(row.tokens, unitScale)),
            React.createElement('span', { className: 'dus-model-share' }, share)),
          React.createElement('div', { className: 'dus-model-track' },
            React.createElement('div', { className: 'dus-model-fill', style: { width: share } })))
      }))
  }

  function Panel(props) {
    const visible = isBlankSession(props.session)
    const loadSummary = props.fetchSummary
    const peekSummary = props.peekSummary
    // `t` is injected by the slot registration's `locale:` field. The fallback
    // keeps the panel renderable for tests and for any host seat that leaves it
    // out, printing the key path verbatim rather than crashing the dock.
    const t = typeof props.t === 'function' ? props.t : FALLBACK_T

    // The body-height and unit preferences live in one external store shared
    // with the settings rows. Reading it through `useSyncExternalStore` keeps
    // both LIVE: dragging the slider re-renders this component and the custom
    // property below is rewritten on the spot, and picking a unit mode
    // re-formats every number without a reload. Called unconditionally, before
    // any early return, to keep hook order safe.
    const settingsState = React.useSyncExternalStore(store.subscribe, store.getState)

    // The stored value now names the scale directly (`short` | `myriad`). A store
    // written by the OLD build may still hold `auto`; `resolveUnitScale` maps that
    // to the scale it used to resolve to for this language, so an upgrade does not
    // change what the panel shows. `book.lang` is the dictionary's self-reporting
    // locale marker — it stays because it is the only language signal `t` exposes,
    // and it is what makes `auto` pick K/M/B here and 万/亿 there.
    const unitMode = settingsState.units === undefined ? DEFAULT_UNITS : settingsState.units
    const unitScale = resolveUnitScale(unitMode, t('book.lang'))

    // Tab and range are view state. Neither survives past this component and
    // neither reaches the network: changing the range re-derives the numbers
    // from the summary already in memory.
    const tabState = React.useState(DEFAULT_STATE.tab)
    const tab = tabState[0]
    const setTab = tabState[1]
    const rangeState = React.useState(DEFAULT_STATE.range)
    const rangeId = rangeState[0]
    const setRangeId = rangeState[1]
    // Seed the first frame from the shared short-TTL cache. Reopening the panel
    // — which happens on EVERY blank session — then paints the last answer
    // immediately instead of flashing the loading row while a warm request
    // repeats work the browser already has. A miss falls back to `loading`.
    const dataState = React.useState(function () {
      const cached = typeof peekSummary === 'function' ? peekSummary() : null
      return cached === null
        ? { status: 'loading', summary: null }
        : { status: 'ready', summary: cached }
    })
    const load = dataState[0]
    const setLoad = dataState[1]

    // The viewport width decides whether the six cards sit in two rows (three
    // across) or three rows (two across, under the stylesheet's 560px
    // breakpoint), and that changes how much height the heat band is allowed —
    // so the layout arithmetic needs it. Kept in state and refreshed on resize;
    // `useState` + an effect rather than a direct read keeps the first render
    // deterministic in a test seat with no `window`.
    //
    // ONLY A BAND CROSSING IS A LAYOUT CHANGE. The width is consumed solely
    // through this breakpoint, so storing the exact pixel made every resize
    // event re-render the whole panel — six cards, the heat band, the tooltip
    // layer — on every frame of a window drag, which is what made resizing feel
    // stuck. The state now holds the BAND, so a drag that stays on one side of
    // 560px re-renders zero times, and the value only changes when the layout
    // it feeds actually would.
    const NARROW_VIEWPORT_PX = 560

    const bandFor = function (width) {
      return typeof width === 'number' && width > 0 && width < NARROW_VIEWPORT_PX ? 'narrow' : 'wide'
    }

    const widthState = React.useState(function () {
      return bandFor(typeof window === 'undefined' ? undefined : window.innerWidth)
    })
    const viewportBand = widthState[0]
    const setViewportBand = widthState[1]
    React.useEffect(function () {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
        return undefined
      }
      // `setState` with an unchanged value is already a no-op in React, but the
      // listener itself is left cheap: it compares the band and only calls in
      // when it differs, so a drag never re-enters the renderer.
      const onResize = function () {
        setViewportBand(function (previous) {
          const next = bandFor(window.innerWidth)
          return next === previous ? previous : next
        })
      }
      window.addEventListener('resize', onResize)
      return function () { window.removeEventListener('resize', onResize) }
    }, [])

    // `layout.js` and `compact-layout.js` compare the width against the same
    // breakpoint, so they only need a representative width per band; passing the
    // band's own midpoint keeps the layout modules' contract (a number) unchanged.
    const viewportWidth = viewportBand === 'narrow' ? NARROW_VIEWPORT_PX - 1 : NARROW_VIEWPORT_PX + 1

    // THE PANEL STYLE. `classic` is the shipped look and the default; `compact`
    // is the reference's 480px card. It rides `data-dus-style` on the root, and
    // the stylesheet keeps every compact rule inside `[data-dus-style="compact"]`
    // — so the classic rules are byte-identical to what shipped, and switching is
    // one attribute flip with no remount and no reload.
    const styleId = settingsState.style
    const compact = isCompact(styleId)
    // The height the style in view actually uses. Each style keeps its own value
    // (see `sanitizeSettings`), so switching never rewrites the other one.
    const bodyHeight = bodyHeightOf(settingsState)

    // Hover bubble for the heatmap. Positioned inside `.dus-panel` (not
    // `position: fixed`, which a transformed ancestor would re-anchor) and
    // OUTSIDE `.dus-heat`, whose `overflow-x: auto` would clip it. It must never
    // leave the panel either — see `tipCentre()`.
    const panelRef = React.useRef(null)
    const tipState = React.useState(null)
    const tip = tipState[0]
    const setTip = tipState[1]
    // The previous bubble's width: the clamp is horizontal only and the width
    // changes with the text, so the last one is a good first estimate.
    const tipWidthRef = React.useRef(0)
    const tips = React.useMemo(function () {
      return {
        show: function (element, text) {
          const panel = panelRef.current
          if (panel === null || element === null || text === undefined) return
          const box = panel.getBoundingClientRect()
          const cellBox = element.getBoundingClientRect()
          if (box.width === 0) return
          const centre = cellBox.left - box.left + cellBox.width / 2
          // Provisional; the layout effect below corrects it before paint.
          setTip({
            text: text,
            centre: centre,
            left: tipCentre(centre, tipWidthRef.current || TIP_MAX_WIDTH, box.width, TIP_INSET),
            top: cellBox.top - box.top,
          })
        },
        hide: function () { setTip(null) },
      }
    }, [])

    // Measure and place the bubble exactly, BEFORE paint. Written to the node's
    // style directly: re-rendering for a sub-pixel correction would cost a render
    // pass per hover.
    const useBeforePaint = typeof React.useLayoutEffect === 'function'
      ? React.useLayoutEffect
      : React.useEffect
    const bubbleRef = React.useRef(null)
    useBeforePaint(function () {
      const bubble = bubbleRef.current
      const panel = panelRef.current
      if (tip === null || bubble === null) return
      const width = bubble.getBoundingClientRect().width
      if (width > 0) tipWidthRef.current = width
      if (panel === null) return
      const panelWidth = panel.clientWidth
      if (panelWidth <= 0) return
      bubble.style.left = tipCentre(tip.centre, width, panelWidth, TIP_INSET) + 'px'
    }, [tip])

    React.useEffect(function () {
      // No fetch for a live conversation: the occupant stays mounted across the
      // session's whole life, and only the blank phase renders anything.
      if (!visible) return undefined
      let cancelled = false
      let retry = null
      let retried = false

      const fail = function () {
        if (cancelled) return
        // Only a first load with nothing to show becomes the one-line error. A
        // failed background refresh keeps the cached summary on screen — the
        // numbers did not become wrong just because one request did.
        setLoad(function (previous) {
          return previous.summary === null ? { status: 'error', summary: null } : previous
        })
      }

      const accept = function (summary) {
        if (cancelled) return
        setLoad({ status: 'ready', summary: summary })
        // The Host served a parse it reused while a log was still being written
        // (it marks the response `stale`). Ask again once that grace window has
        // passed so the transient undercount corrects itself. Once per mount:
        // a Host that keeps answering stale (a log under continuous write) must
        // not turn this into a polling loop.
        if (summary !== null && typeof summary === 'object' && summary.stale === true
          && !retried && retry === null) {
          retried = true
          retry = setTimeout(function () {
            retry = null
            if (!cancelled) read({ refresh: true })
          }, STALE_RETRY_MS)
        }
      }

      const read = function (options) {
        let request
        try {
          request = loadSummary(options)
        } catch (error) {
          // An injected dependency may throw before returning a promise; that is
          // the same single failure line as a rejection, not a render crash.
          fail()
          return
        }
        Promise.resolve(request).then(accept, fail)
      }

      read()
      return function () {
        cancelled = true
        if (retry !== null) {
          clearTimeout(retry)
          retry = null
        }
      }
    }, [visible, loadSummary])

    const range = RANGES.filter(function (entry) { return entry.id === rangeId })[0] || RANGES[0]

    // Keyed on the range so switching tabs does not redo the aggregation.
    const view = React.useMemo(function () {
      return load.summary === null ? null : summarize(load.summary, range.days)
    }, [load.summary, range.days])

    // The heatmap is ALL-TIME on purpose. The grid is a calendar — switching
    // All/30d/7d must not reflow it — so it reads a second, unfiltered summary.
    // Only the numbers (cards, model list) respond to the range pills.
    const allView = React.useMemo(function () {
      return load.summary === null ? null : summarize(load.summary, 0)
    }, [load.summary])

    // Hooks run before this return on purpose: a conversation can turn blank
    // without the occupant remounting, and a conditional hook order would throw.
    const rootRef = React.useRef(null)
    React.useEffect(function () {
      if (!visible) return undefined
      return hoistAboveWorkspaceRow(rootRef.current)
    }, [visible])

    // The input's height budget, on the same condition as the panel itself: it
    // exists only while the hero panel is on screen, and its disposer removes
    // every attribute, custom property and observer it added. `bodyHeight` is a
    // dependency because resizing the panel changes the chrome the budget is
    // measured against — re-attaching re-measures immediately instead of waiting
    // for the next resize.
    React.useEffect(function () {
      if (!visible) return undefined
      return attachInputBudget(rootRef.current)
    }, [visible, bodyHeight])

    // ---- the two tab bodies are ELEMENTS, memoised.
    //
    // WHY THIS IS A PERFORMANCE RULE. The tooltip is `useState` on this
    // component, so ONE `setTip` — fired by one heat cell's `mouseenter` —
    // re-renders the entire panel. Dragging the pointer across the grid fires
    // one `mouseenter` per cell crossed, and every one of those renders used to
    // rebuild the heat grid: 182 elements for a fresh log, 371 for a year, 1099
    // for three years (measured: tools/bench-usage-render.mjs, before 2.48 ms of
    // JS per hover at three years).
    //
    // Returning the SAME element object is what lets React bail out: when a
    // child element is reference-identical between renders, React skips that
    // subtree entirely — no reconciliation, no props diff, no child elements
    // constructed. Dependencies are exactly the inputs that can change the
    // markup: the derived views, the translator (a language switch), the
    // resolved unit scale (a unit-mode change, or `auto` following a language
    // switch) and the tooltip handlers (stable, `useMemo([])` above).
    // THE GRID DOES NOT DEPEND ON THE RANGE, SO IT GETS ITS OWN MEMO.
    //
    // A single memo for the whole Overview body would key its deps on `view`,
    // and `view` is keyed on the selected range. So clicking
    // All / 30d / 7d threw away the whole subtree and rebuilt the heat grid, even
    // though the grid reads `allView` (unfiltered) on purpose. The performance
    // review measured it: **1,306 elements rebuilt, 4.1 ms per range click** at a
    // three-year history. Splitting the memo means a range click rebuilds only
    // the cards; the grid's element identity survives, React bails out of that
    // subtree, and nothing about its behaviour changes.
    const cardsBody = React.useMemo(function () {
      if (view === null) return null
      return renderCards(view, t, unitScale)
    }, [view, t, unitScale])

    const heatBody = React.useMemo(function () {
      if (allView === null) return null
      return renderHeat(allView, t, tips, unitScale)
    }, [allView, t, tips, unitScale])

    const overviewBody = React.useMemo(function () {
      if (cardsBody === null || heatBody === null) return null
      return overviewElement(React, cardsBody, heatBody)
    }, [cardsBody, heatBody])

    const modelsBody = React.useMemo(function () {
      if (view === null) return null
      return renderModels(view, t, unitScale)
    }, [view, t, unitScale])

    if (!visible) return null

    let body
    if (load.status === 'error') {
      body = React.createElement('div', { className: 'dus-note' }, t('note.unavailable'))
    } else if (view === null) {
      body = React.createElement('div', { className: 'dus-note' }, t('note.loading'))
    } else if (tab === 'models') {
      body = modelsBody
    } else {
      body = overviewBody
    }

    // The body is keyed on the tab and carries a slide direction, so switching
    // tabs remounts it and re-fires the horizontal slide — Overview drifts in
    // from the left, Models from the right. `view === null` (loading/error)
    // renders its note inside the same wrapper so the swap stays animated.
    const sliding = React.createElement('div', {
      key: tab,
      className: 'dus-body',
      'data-dir': tab === 'models' ? 'fwd' : 'back',
    }, body)

    // Last in the panel so it paints above the grid, and purely visual
    // (`aria-hidden`): the same sentence already rides on the cell's `aria-label`.
    // The always-present clip layer keeps the coordinates panel-relative while
    // clipping whatever the clamp cannot keep inside, so no ancestor scroll
    // container can ever see the bubble (`styles.js`).
    const bubble = React.createElement('div', {
      className: 'dus-tip-layer',
      'aria-hidden': 'true',
    }, tip === null ? null : React.createElement('div', {
      className: 'dus-tip',
      ref: bubbleRef,
      style: { left: tip.left + 'px', top: tip.top + 'px' },
    }, tip.text))

    return React.createElement('div', {
      className: 'dus-root',
      ref: rootRef,
      // The style switch rides ONE attribute. Every compact rule in `styles.js`
      // is scoped to `[data-dus-style="compact"]`, so the classic look and its
      // own rules are untouched by the option existing.
      'data-dus-style': compact ? 'compact' : 'classic',
    },
      React.createElement('div', {
        className: 'dus-panel',
        ref: panelRef,
        // `--dus-body-height` is what `.dus-body` consumes
        // (`height: var(--dus-body-height, 344px)`); setting it on the panel
        // root means both tabs resolve the live preference, so the panel is one
        // fixed height no matter which tab is showing. The style's own derived
        // lengths ride the same inline object (the layout modules), so a shorter
        // setting draws smaller graphics instead of a scrollbar.
        style: bodyHeightStyle(bodyHeight, viewportWidth, styleId),
      },
        renderHead(t, tab, setTab, range.id, setRangeId),
        sliding,
        bubble))
  }

  return { Panel: Panel }
}
