/**
 * The card component.
 *
 * It also owns the card's LEGIBILITY PASS, wired in `CardBodyFrame` below: the
 * model writes the snippet's colours, the host's palette contains translucent
 * fill tokens that look like ink by name, and choosing one paints an invisible
 * answer. `legibility.js` measures what was actually painted and restores the
 * alpha; this module only decides WHEN to measure (on mount, and once per frame
 * while the snippet re-renders).
 *
 * It receives the standard `tool.call.toolview` props — `phase`, `block`,
 * `toolName`, `useDisclosure`, `t` — and renders one of four states:
 *
 *   preparing  the model is still emitting arguments; a quiet placeholder
 *   failed     the snippet did not parse, or the card threw while rendering
 *   invalid    the committed arguments are missing or rejected by `spec.js`
 *   ready      the card
 *
 * WHY THE ERROR BOUNDARY IS HERE AND NOT IN THE SNIPPET. A snippet that throws
 * during render would otherwise take out the whole tool row (React unmounts the
 * subtree and the host logs `slot entry crashed`). Catching it locally keeps the
 * failure visible where it happened, with the source one click away.
 *
 * The boundary is a class: `getDerivedStateFromError` has no function-component
 * equivalent in React 18, and the host ships React 18.
 *
 * @module card
 */

import { observeInvisibleText } from './legibility.js'

/**
 * Create the card component bound to one React instance.
 *
 * React arrives as an argument rather than an import so this module stays
 * testable in Node and so the plugin honours the host's frozen module table
 * instead of bundling a second React.
 *
 * @param {object} deps
 * @param {object} deps.React the host React
 * @param {string} deps.toolName the wire tool name this card answers
 * @param {(options: { React: object, code: string }) => { ok: true, Component: Function } | { ok: false, message: string }} deps.tryCompile
 *        snippet compiler (injected so tests can drive the failure path)
 * @param {(argsRaw: string | null | undefined) => object | null} deps.readSpec
 *        the shared validator/parser from `lib/spec.js`
 * @returns {Function} the React component registered into `tool.call.toolview`
 */
export function createCard({ React, toolName, tryCompile, readSpec }) {
  const h = React.createElement

  /**
   * Catches a snippet that throws while rendering, and shows the message.
   *
   * Resetting on `resetKey` matters: the row is recycled as the user scrolls,
   * and without the reset a once-broken card would stay broken for the next
   * call rendered through the same instance.
   */
  class CardErrorBoundary extends React.Component {
    constructor(props) {
      super(props)
      this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
      return { error }
    }

    componentDidUpdate(prevProps) {
      if (prevProps.resetKey !== this.props.resetKey && this.state.error !== null) {
        this.setState({ error: null })
      }
    }

    /**
     * Stop the snippet's timers when the card leaves the DOM.
     *
     * A recycled row unmounts constantly, and a `setInterval` a snippet started
     * has no other owner. Guarded because `onUnmount` is optional.
     */
    componentWillUnmount() {
      if (typeof this.props.onUnmount === 'function') this.props.onUnmount()
    }

    render() {
      if (this.state.error !== null) {
        return this.props.renderFailure(this.state.error)
      }
      return this.props.children
    }
  }

  /**
   * The rendered card body: compile (once, memoized on the code) then mount.
   *
   * `tryCompile` is called through `useMemo` keyed on the code string, so a
   * re-render from a parent (a theme switch, an expansion toggle) does not
   * re-evaluate the snippet. That is the whole cost model: evaluation happens
   * when the source changes, not when the component does.
   */
  function CardBody({ spec, t, send, sent, sendFailed }) {
    const compiled = React.useMemo(
      // `send` is part of the key: the bridge identity is stable per card, and a
      // compiled component that captured a stale bridge would send into the
      // wrong session after the row is recycled.
      () => tryCompile({ React, code: spec.code, interact: send }),
      [spec.code, send],
    )

    if (!compiled.ok) {
      return h(Failure, { t, title: t('card.failed'), detail: compiled.message })
    }

    const Rendered = compiled.Component
    return h(CardErrorBoundary, {
      resetKey: spec.code,
      // The compiled card owns its timers; unmounting it is the moment to stop
      // them. `dispose` is optional so a component compiled by an older build
      // (a cached artifact) still renders.
      onUnmount: typeof Rendered.dispose === 'function' ? Rendered.dispose : undefined,
      renderFailure: (error) => h(Failure, {
        t,
        title: t('card.failed'),
        detail: error instanceof Error ? error.message : String(error),
      }),
    },
    h(Rendered),
    // Delivery feedback lives OUTSIDE the card's own tree so a snippet cannot
    // style it away, and below the card so it does not shift the layout the
    // snippet computed.
    sent ? h('div', { className: 'dsh-genui-sent', role: 'status' }, t('card.sent')) : null,
    sendFailed !== '' ? h(Failure, { t, title: t('card.sendFailed'), detail: sendFailed }) : null)
  }

  /**
   * The answer surface.
   *
   * It used to be a scroll box with an overflow fade, because the card had a
   * fixed max height. Both are gone: a generated answer grows with the
   * transcript and lets the conversation scroll, which is what every other block
   * of content does. Keeping the wrapper as a plain element preserves the class
   * the stylesheet and the e2e suite select on.
   */
  function CardBodyFrame({ t, spec, send, sent, sendFailed }) {
    const body = React.useRef(null)
    // THE LEGIBILITY PASS, keyed on the snippet so a re-compile re-observes the
    // new subtree. It runs AFTER the commit (an effect, not during render), so
    // the measurement sees the colours the browser actually resolved — a token
    // that resolves to 8% alpha can only be caught after it has been resolved.
    //
    // The disposer is returned by the effect, which is what disconnects the
    // observer when the row is recycled: this card unmounts on every scroll.
    React.useEffect(() => {
      if (body.current === null) return undefined
      return observeInvisibleText(body.current)
    }, [spec.code])
    return h('div', { className: 'dsh-genui-body', ref: body },
      h(CardBody, { spec, t, send, sent, sendFailed }))
  }

  /** The failure panel: what broke, in the model's own error text. */
  function Failure({ t, title, detail }) {
    return h('div', { className: 'dsh-genui-failure', role: 'alert' },
      h('div', { className: 'dsh-genui-failure-title' }, title),
      h('div', { className: 'dsh-genui-failure-detail' }, detail))
  }

  /** The sentence the plugin shows when the committed args cannot be read at all. */
  function Invalid({ t }) {
    return h('div', { className: 'dsh-genui-body' },
      h('div', { className: 'dsh-genui-failure-detail' }, t('card.invalid')))
  }

  /** A quiet placeholder while the model is still emitting the call. */
  function Pending({ t }) {
    return h('div', { className: 'dsh-genui-card' },
      h('div', { className: 'dsh-genui-pending' }, t('card.preparing')))
  }

  /**
   * The registered component.
   *
   * ARGUMENT PATHS, which are phase-dependent and are the single easiest thing
   * to get wrong here: `start` carries `block.argsRaw`; `result` carries
   * `block.call.argsRaw`; `preparing` carries no raw text at all. Both are
   * parsed by the shared `readSpec`, so the card cannot disagree with the Host
   * about what a valid call is.
   */
  return function RenderUiCard(props) {
    const { phase, block, useDisclosure } = props
    const t = typeof props.t === 'function' ? props.t : fallbackTranslate
    // `useDisclosure` is supplied by the owner for every keyed toolview; the
    // fallback keeps the card usable if a future host stops doing that.
    const disclosure = typeof useDisclosure === 'function'
      ? useDisclosure()
      : { expanded: false, toggle: function noop() {} }
    const showSource = disclosure.expanded === true
    const toggle = disclosure.toggle

    // THE BRIDGE. `interact(text)` is the one thing a card can do that outlives
    // it: it hands a sentence to the conversation, which is how the next turn
    // learns what the user chose in the UI. Official MCP Apps draw the same line
    // as `ui/message` (a view adds a message to the conversation); this is that
    // capability expressed through the host's own `conversation.send`.
    //
    // Delivery state is local, and `mounted` guards the state update: the row is
    // recycled as the user scrolls, so a send that resolves after unmount would
    // otherwise set state on a dead component.
    // `sent` is a MOMENT, not a state: the confirmation explains the click, and
    // once the user's own message appears below the card the line is redundant.
    // It expires on its own rather than accumulating one line per click.
    //
    // The timer is the one place this plugin uses one, and it is cleared on
    // unmount — the repository audit's observer/storage rules exist because
    // leaked timers outlive a recycled row.
    const [sent, setSent] = React.useState(false)
    const [sendFailed, setSendFailed] = React.useState('')
    const mounted = React.useRef(true)
    React.useEffect(() => () => { mounted.current = false }, [])

    React.useEffect(() => {
      if (!sent) return undefined
      const timer = globalThis.setTimeout(() => { if (mounted.current) setSent(false) }, 4000)
      return () => { globalThis.clearTimeout(timer) }
    }, [sent])

    // The sandbox owns what counts as a valid message; this layer owns the
    // feedback. It re-reports success and failure as state and rethrows so the
    // snippet's own `await interact(...)` sees the rejection too.
    const send = React.useCallback(async (message) => {
      if (typeof props.sendMessage !== 'function') {
        throw new Error('this card cannot send a message: no conversation bridge was injected')
      }
      try {
        await props.sendMessage(message)
        if (mounted.current) {
          setSent(true)
          setSendFailed('')
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        if (mounted.current) setSendFailed(detail)
        throw error
      }
    }, [props.sendMessage])

    if (phase === 'preparing') return h(Pending, { t })

    // TWO PROP SHAPES, ONE COMPONENT.
    //
    //   toolview:  { phase, block }  — arguments arrive on the call block and the
    //                                  payload must be parsed here
    //   chat node: { node }          — `render-ui-node.js` already parsed the
    //                                  committed call and folded the tool's error
    //
    // Both end at the same three values, so every state below is written once.
    // The node path is preferred in a Chat flow because it is what makes the card
    // the turn's answer; the toolview path is the fallback (see lifecycle.js).
    const isNode = props.node !== undefined && props.node !== null
    const raw = isNode
      ? props.node.data.argsRaw
      : phase === 'result' ? block?.call?.argsRaw : block?.argsRaw
    const spec = isNode ? props.node.data.spec : readSpec(raw)

    // A result-phase error means the TOOL failed (validation rejected the
    // snippet), so the message from the Host is the most useful thing to show.
    const toolError = isNode
      ? (props.node.data.errorText ?? '')
      : phase === 'result' && block?.isError === true
        ? blockContentText(block)
        : ''

    if (spec === null) {
      // Distinguish "the tool rejected it" from "this payload is unreadable":
      // the first is the model's error and the second is a replay artifact, and
      // the user can act on the first.
      return h('div', { className: 'dsh-genui-card' },
        h('div', { className: 'dsh-genui-head' }, h('div', { className: 'dsh-genui-title' }, t('card.title'))),
        h(Invalid, { t }),
        toolError !== '' ? h(Failure, { t, title: t('card.failed'), detail: toolError }) : null)
    }

    const rationale = readRationale(raw)

    // NO CARD CHROME. What used to be a header bar, a byte badge, a source
    // toggle and a "why a card" footer is now: a title line, the answer, and an
    // optional footnote.
    //
    // The rationale moved from a visible footer into the title's tooltip
    // (`title` attribute on the heading). It explains the MODEL's choice, which
    // is useful when you wonder "why did it draw this instead of answering?" but
    // is not something to read on every card — and in a transcript it read as
    // the app talking about itself.
    //
    // TITLE PLACEMENT IS A SETTING, because it is taste rather than correctness.
    // `above` (the default) puts the heading over the content, centred — the
    // shape a chart or a figure wants, and what ZCode's visuals do. `below` is
    // for readers who want the content to lead. `inline` keeps the original
    // left-aligned heading in the same line as the source affordance.
    // React's own contract for an external store, rather than a framework-built
    // hook prop: `useSyncExternalStore(subscribe, getSnapshot)` is guaranteed to
    // re-render this component when the settings row writes.
    const store = props.titlePlacementStore
    const subscribed = typeof React.useSyncExternalStore === 'function' && store !== undefined
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the guard is a
    // build-time constant for a given host, so the hook order never changes.
    const fromStore = subscribed
      ? React.useSyncExternalStore(store.subscribe, store.getSnapshot)
      : undefined
    const placement = fromStore ?? props.titlePlacement ?? 'above'
    const heading = h('div', {
      className: 'dsh-genui-title',
      title: rationale !== '' ? rationale : spec.title,
    }, spec.title)
    const sourceToggle = h('button', {
      type: 'button',
      className: 'dsh-genui-toggle',
      'aria-pressed': showSource,
      'aria-label': t('aria.toggleSource'),
      title: showSource ? t('card.hideSource') : t('card.showSource'),
      onClick: toggle,
    }, h('span', { 'aria-hidden': 'true' }, showSource ? '×' : '⌥'))

    // The heading row.
    //
    //   left   above the content, left-aligned, sharing its line with the toggle
    //   above  over the content, centred (the toggle moves to a trailing row,
    //          because a control beside a centred heading breaks the centring)
    //   below  under the content, centred
    const head = (extraClass) => h('div', { className: 'dsh-genui-head ' + extraClass },
      heading,
      placement === 'left' ? sourceToggle : null)

    return h('div', {
      className: 'dsh-genui-card',
      'data-dsh-genui-card': '',
      'data-title-placement': placement,
      'aria-label': t('aria.card'),
    },
    // `left` and `above` both put the heading first; only the alignment differs,
    // and the CSS class carries that.
    placement === 'above' ? head('dsh-genui-head-centered') : null,
    placement === 'left' ? head('dsh-genui-head-left') : null,
    h(CardBodyFrame, { t, spec, send, sent, sendFailed }),
    placement === 'below' ? head('dsh-genui-head-centered dsh-genui-head-below') : null,
    placement !== 'left' ? h('div', { className: 'dsh-genui-actions' }, sourceToggle) : null,
    showSource
      ? h('pre', { className: 'dsh-genui-source', tabIndex: 0, 'aria-label': t('card.sourceLabel') }, spec.code)
      : null)
  }
}

/**
 * Flatten a result block's content to text.
 *
 * The host's own toolview components do the same (`resultText` in
 * `dsh-client-ui-tool`), for the same reason: text blocks are the only content
 * a tool error reliably carries, and the card wants exactly that string.
 *
 * @param {object} block result-phase block
 * @returns {string} joined text, or '' when the block carries none
 */
function blockContentText(block) {
  const content = Array.isArray(block?.content) ? block.content : []
  const parts = []
  for (const part of content) {
    if (part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') {
      parts.push(part.text)
    }
  }
  return parts.join('\n').trim()
}

/**
 * Read the optional `rationale` field back out of the committed arguments.
 *
 * `buildUiSpec` deliberately drops it — it is not part of what the card needs to
 * draw, and a Host result must stay minimal — so it is read here from the same
 * parsed payload instead of being added to the wire contract.
 *
 * @param {string | null | undefined} argsRaw committed arguments
 * @returns {string} the rationale, or '' when absent
 */
function readRationale(argsRaw) {
  if (typeof argsRaw !== 'string' || argsRaw === '') return ''
  try {
    const parsed = JSON.parse(argsRaw)
    return parsed !== null && typeof parsed === 'object' && typeof parsed.rationale === 'string'
      ? parsed.rationale.trim()
      : ''
  } catch {
    return ''
  }
}

/**
 * Human byte size for the header badge.
 *
 * The badge exists so a reader can tell "this is a big card" from "this is a
 * line of markup" without opening the source.
 *
 * @param {number} bytes size in bytes
 * @returns {string} e.g. `820 B`, `3.1 KB`
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(1) + ' KB'
}

/**
 * English fallback for a host that injects no `t`.
 *
 * Duplicated from `locales.js` on purpose: this module must not import the
 * dictionary table, because the card is also rendered by a test that supplies
 * no locale service at all.
 */
function fallbackTranslate(key) {
  return key
}
