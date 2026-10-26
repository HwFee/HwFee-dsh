/**
 * dsh-context-rail client bundle.
 *
 * WHAT IT IS. A session rail that lives INSIDE the conversation page, the way
 * Claude Code's session rail does: a toggle in the conversation header's
 * utility row, a fixed-width column at the conversation column's right edge,
 * auto-opened once the window is wide enough.
 *
 * WHY NOT THE HOST'S RIGHT SIDEBAR. That column already has an occupant model
 * (tabs, splits, floats) and it is where file previews, the file tree, the
 * browser and terminals open. Putting the rail there would make it compete for
 * the same space and would close whenever a file preview opened. This rail lives
 * inside the conversation column instead and reserves its width with padding.
 *
 * WHERE THE NUMBERS COME FROM. The toggle is registered in a session-scoped
 * slot, so the framework hands it the standard `useProjection` and `useSessions`
 * hooks. Those read the host's live projection store: `contextPressure`,
 * `contextBreakdown`, `tokenUsage`, `modelSelection`, `workingDirectory`,
 * `title`. Nothing is recomputed from logs and nothing polls.
 *
 * GEOMETRY. The rail is positioned from the measured rectangle of the
 * conversation scroller, shifted left by the scroller's own scrollbar gutter, so
 * the scrollbar stays outside the rail. When the native right sidebar opens the
 * conversation column shrinks, the measurement shrinks with it, and the rail
 * follows. The only condition that hides it is a column too narrow to hold the
 * rail plus a readable text column.
 */

import { createPanel, translator } from './panel.js'
import { installCss } from './styles.js'
import { NS, en, zh } from './locales.js'

// React and ReactDOM come from the host's frozen platform module table. Both
// are absent in a non-browser context, so registration guards on them.
let React = null
let ReactDOM = null
try {
  React = require('react')
  ReactDOM = require('react-dom')
} catch (error) {
  React = null
  ReactDOM = null
}

/** Service names this plugin reads; both provided by the host. */
export const inject = ['slots', 'locale']

/** Rail width in CSS pixels. The content padding uses the same constant. */
export const RAIL_WIDTH = 328

/** Windows narrower than this keep the rail closed until the user asks for it. */
export const AUTO_OPEN_MIN_WIDTH = 1180

/** Content left beside the rail before the rail gives up its place entirely. */
export const MIN_CONTENT_WIDTH = 240

/**
 * Whether the conversation column can hold the rail at all.
 * @param {number} columnWidth - the scroller's border-box width
 * @returns {boolean}
 */
export function railFits(columnWidth) {
  return typeof columnWidth === 'number' && columnWidth >= RAIL_WIDTH + MIN_CONTENT_WIDTH
}

/** The user's explicit choice survives restarts; absence means "follow width". */
export const STORAGE_KEY = 'dsh-context-rail/open'

/**
 * Read the stored preference.
 * @returns {boolean | null} null when the user has never toggled
 */
function readStored() {
  try { const value = window.localStorage.getItem(STORAGE_KEY); return value === '1' ? true : value === '0' ? false : null } catch (error) { return null }
}

/**
 * Persist one explicit choice.
 * @param {boolean} open
 */
function writeStored(open) {
  try { window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0') } catch (error) { /* private mode: the rail still works for this window */ }
}

/** @returns {boolean} whether the window is wide enough to open by default */
function wideEnough() {
  return typeof window !== 'undefined' && window.innerWidth >= AUTO_OPEN_MIN_WIDTH
}

/** The rail body built once; the factory only closes over React. */
const Panel = React === null ? null : createPanel({ React }).Panel

/**
 * Keeps a failure inside the rail from taking the header toggle with it.
 *
 * The rail is the part that measures the DOM and reads projections; the toggle
 * is a plain button. A throw in the rail's render must not cost the user the
 * only way back in, so it is caught here and reported to the console.
 */
class RailBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('dsh-context-rail: rail render failed', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Toggle glyph: a page with its right column marked. */
function RailIcon() {
  return React.createElement('svg', {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  },
  React.createElement('rect', { x: 2.25, y: 2.75, width: 11.5, height: 10.5, rx: 2 }),
  React.createElement('path', { d: 'M10 3v10' }))
}

/**
 * The registered component: the header toggle and, while open, the rail.
 *
 * Standard session-scope props arrive here: `sessionId`, `useProjection`
 * (keyed hook over the live projection store), `useSessions` (selector over the
 * session list) and `t` from this registration's locale namespace.
 */
function RailToggle(props) {
  const { sessionId, useProjection, useSessions } = props
  // The locale seat is optional in every other plugin of this repository; a
  // missing seat must not throw inside a header row that the host then drops.
  const t = typeof props.t === 'function' ? props.t : translator(undefined)
  const projection = typeof useProjection === 'function' ? useProjection : () => undefined
  const sessions = typeof useSessions === 'function' ? useSessions : () => undefined

  const [stored, setStored] = React.useState(readStored)
  const [wide, setWide] = React.useState(wideEnough)
  const [geometry, setGeometry] = React.useState(null)

  const wanted = stored === null ? wide : stored

  React.useEffect(() => {
    const update = () => setWide(wideEnough())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Measure the conversation body and its scroller. Both are watched because
  // the window, the left sidebar, the right column and the conversation can all
  // change width without a window resize event.
  React.useEffect(() => {
    if (!wanted) {
      setGeometry(null)
      return undefined
    }
    let cancelled = false
    let retry = null
    let stopWatching = () => {}

    const start = () => {
      if (cancelled) return
      const content = document.querySelector('[data-conversation-content]')
      // The header can mount before the conversation body (a fresh session, an
      // entry page). Poll until it exists rather than latching an empty rail.
      if (content === null) {
        retry = window.setTimeout(start, 300)
        return
      }
      const scroller = content.querySelector('[data-conversation-scroll]')
      const measure = () => {
        const rect = content.getBoundingClientRect()
        const scroll = scroller === null ? null : scroller.getBoundingClientRect()
        const bar = scroller === null ? 0 : Math.max(0, scroller.offsetWidth - scroller.clientWidth)
        setGeometry({
          top: Math.max(0, rect.top),
          height: Math.max(0, rect.height),
          width: Math.max(0, (scroll === null ? rect : scroll).width),
          right: Math.max(0, window.innerWidth - (scroll === null ? rect.right : scroll.right) + bar),
        })
      }
      measure()
      const observer = new ResizeObserver(measure)
      observer.observe(content)
      if (scroller !== null) observer.observe(scroller)
      window.addEventListener('resize', measure)
      stopWatching = () => {
        observer.disconnect()
        window.removeEventListener('resize', measure)
      }
    }

    start()
    return () => {
      cancelled = true
      if (retry !== null) window.clearTimeout(retry)
      stopWatching()
    }
  }, [wanted])

  // The native right sidebar is NOT a reason to hide: when it opens the
  // conversation column shrinks, the measured rectangle shrinks with it, and the
  // rail follows. Only a column too narrow to hold both the rail and a readable
  // text column takes the rail away.
  const visible = wanted && geometry !== null && railFits(geometry.width)

  // Reserve the rail's width so text and the composer reflow instead of sliding
  // under it. The reservation is a body attribute plus a custom property rather
  // than an inline style on the host's node: a host re-render that replaces that
  // node must not drop the reservation, and removal is one attribute.
  React.useEffect(() => {
    if (!visible) return undefined
    const body = document.body
    body.dataset.dcrOpen = 'true'
    body.style.setProperty('--dcr-rail-width', RAIL_WIDTH + 'px')
    return () => {
      delete body.dataset.dcrOpen
      body.style.removeProperty('--dcr-rail-width')
    }
  }, [visible])

  const pressure = projection('contextPressure')
  const breakdown = projection('contextBreakdown')
  const usage = projection('tokenUsage')
  const projectedTitle = projection('title')
  const projectedCwd = projection('workingDirectory')
  const modelSelection = projection('modelSelection')
  const row = sessions((state) => (sessionId === undefined ? undefined : state?.byId?.[sessionId]))
  const model = modelSelection?.lastUsed?.model ?? modelSelection?.next?.model

  const toggle = React.createElement('button', {
    type: 'button',
    className: 'dcr-toggle',
    'data-dcr-toggle': true,
    'aria-pressed': wanted,
    'aria-label': t('toggle.title'),
    title: t('toggle.title'),
    onClick: () => {
      const next = !wanted
      setStored(next)
      writeStored(next)
    },
  }, React.createElement(RailIcon))

  if (!visible) return toggle

  const rail = React.createElement('aside', {
    className: 'dcr-rail',
    'data-dcr-rail': true,
    style: {
      width: RAIL_WIDTH + 'px',
      top: geometry.top + 'px',
      right: geometry.right + 'px',
      height: geometry.height + 'px',
    },
  }, React.createElement(Panel, {
    pressure: pressure,
    breakdown: breakdown,
    usage: usage,
    model: typeof model === 'string' ? model : '',
    cwd: typeof projectedCwd === 'string' && projectedCwd !== '' ? projectedCwd : row?.cwd,
    title: typeof projectedTitle === 'string' && projectedTitle !== '' ? projectedTitle : row?.displayTitle,
    running: row?.running === true,
    t: t,
  }))

  return React.createElement(React.Fragment, null, toggle,
    React.createElement(RailBoundary, null, ReactDOM.createPortal(rail, document.body)))
}

/**
 * Register the toggle with the conversation header.
 * @param ctx - client root context carrying slots and locale
 */
export function apply(ctx) {
  if (React === null || ReactDOM === null) {
    console.warn('dsh-context-rail: react/react-dom unavailable; rail not registered')
    return
  }
  if (!ctx || !ctx.slots) {
    console.warn('dsh-context-rail: slots service unavailable; rail not registered')
    return
  }

  const t = typeof ctx.locale?.bind === 'function' ? ctx.locale.bind(NS) : translator(undefined)

  if (ctx.locale && typeof ctx.locale.register === 'function') {
    ctx.effect(function () {
      return ctx.locale.register(NS, { zh: zh, en: en })
    }, 'dsh-context-rail: dictionaries')
  }

  ctx.effect(() => installCss(), 'dsh-context-rail: rail styles')

  // The header's utility row is a list, so this entry sits beside the host's own
  // buttons instead of taking a single seat from them. `inject` waits for the
  // conversation package to declare the slot and releases with this plugin.
  ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'context-rail',
    order: 10,
    locale: NS,
  }, RailToggle)), 'dsh-context-rail: header toggle')
}
