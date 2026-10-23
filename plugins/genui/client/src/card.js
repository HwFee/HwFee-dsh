/**
 * The card component: the host side of a sandboxed frame.
 *
 * THE ISOLATION IS THE IFRAME, not a list of hidden names. The snippet runs in a
 * document with `sandbox="allow-scripts"` and NO `allow-same-origin`, which gives
 * it an opaque origin: it cannot read `parent.document`, `localStorage`, cookies
 * or the host's RPC surface. The meta CSP in that document additionally constrains
 * the web APIs a card may call — the fetch family, remote images, forms, nested
 * frames — and it is a constraint on those declared APIs, not a claim that no
 * network is reachable. The previous version evaluated the snippet in this realm
 * and tried to mask dangerous globals by parameter shadowing; that was a footgun
 * guard, it was bypassable in one property hop
 * (`h.constructor("return localStorage")()`), and it is gone — `sandbox.js` no
 * longer exists. The measurement lives in `.work/genui-isolation-report.md`.
 *
 * WHAT THE HOST OWNS HERE:
 *
 *   1. the frame element and its height;
 *   2. the theme snapshot handed to the frame, and its updates;
 *   3. THE ONLY SEND PATH. A card's `interact(text)` arrives as a REQUEST. The
 *      host renders its own button outside the frame; only a click on that
 *      button — a trusted event the frame cannot synthesize — calls
 *      `conversation.send`. The request text is rendered as text, never HTML.
 *
 * The frame is not trusted to be well-behaved, so every message is validated by
 * `frame-bridge.js` before it is looked at, and a frame that never loads leaves a
 * visible sentence rather than an empty box.
 *
 * @module card
 */

import {
  createInteractGate, validateFrameMessage, MAX_INTERACT_CHARS,
} from './frame-bridge.js'
import { buildFrameDocument, createNonce } from './frame-html.js'
import { observeTheme, readThemeSnapshot } from './theme-snapshot.js'

/** Class on the frame element, so the host sheet can size it. */
const FRAME_CLASS = 'dsh-genui-frame'

/** Default height before the frame reports its own, in CSS pixels. */
const INITIAL_HEIGHT = 48

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
 * @param {(argsRaw: string | null | undefined) => object | null} deps.readSpec
 *        the shared validator/parser from `lib/spec.js`
 * @returns {Function} the React component registered into `tool.call.toolview`
 */
export function createCard({ React, toolName, readSpec }) {
  const h = React.createElement

  /**
   * The sandboxed frame plus everything the host owns around it.
   *
   * WHY THE DOCUMENT IS BUILT IN AN EFFECT, NOT DURING RENDER. `srcdoc` is an
   * attribute: writing a new one reloads the document, which would restart the
   * snippet on every re-render of the surrounding row (a theme flip, a scroll
   * recycle, a disclosure toggle). One build per `spec.code`, then theme updates
   * travel over `postMessage`.
   *
   * @param {object} props
   * @param {object} props.spec the validated call
   * @param {Function} props.t locale lookup
   * @param {(text: string) => Promise<void>} [props.sendMessage] the conversation bridge
   */
  function CardFrame({ spec, t, sendMessage }) {
    const frame = React.useRef(null)
    const tokenRef = React.useRef('')
    const gateRef = React.useRef(null)
    const [height, setHeight] = React.useState(INITIAL_HEIGHT)
    const [pending, setPending] = React.useState(null)
    const [sent, setSent] = React.useState(false)
    const [sendFailed, setSendFailed] = React.useState('')
    const [frameFailed, setFrameFailed] = React.useState('')

    // The effect below is keyed on `spec.code` only — rebuilding the frame on a
    // locale change would reload the card and restart the snippet — so the
    // translator is read through a ref that always holds the current one.
    const tRef = React.useRef(t)
    tRef.current = t

    // The gate is per mounted card: one pending request, rate limited, capped.
    if (gateRef.current === null) gateRef.current = createInteractGate()

    React.useEffect(() => {
      const element = frame.current
      if (element === null) return undefined
      const view = element.ownerDocument?.defaultView
      if (view === undefined || view === null) return undefined

      const token = createNonce(view.crypto)
      tokenRef.current = token
      const gate = gateRef.current
      gate.clear()
      setPending(null)

      const theme = readThemeSnapshot(view)
      // Match the embedded document's scheme, keeping its transparent canvas
      // transparent in Chromium when the host changes between light and dark.
      element.style.colorScheme = theme.dark === true ? 'dark' : 'light'

      /**
       * THE FRAME MAY TRY TO NAVIGATE ITSELF, and the CSP is what stops it.
       *
       * Measured in Chrome, same snippet and same URL in both frames: with the
       * shipped CSP the frame's document is NOT replaced (one `load`); with the
       * same document minus the CSP meta it IS replaced (two `load`s). So the
       * policy does the work here, and the response is not pretending otherwise.
       *
       * The counter below is a BACKSTOP, not the mechanism: if a future engine
       * ever lets a self-navigation through, a second `load` unloads the frame
       * instead of leaving a remote page sitting in the conversation styled as
       * the answer. It cannot leak host data either way — the frame has no read
       * access to this page — but a stranger's page presented as the answer is
       * its own kind of wrong.
       *
       * The listener is attached BEFORE `srcdoc` so the first load cannot outrun
       * it.
       */
      let loads = 0
      const onLoad = () => {
        loads += 1
        if (loads <= 1) return
        element.removeAttribute('srcdoc')
        setFrameFailed(tRef.current('card.frameNavigated'))
      }
      element.addEventListener('load', onLoad)
      element.setAttribute('srcdoc', buildFrameDocument({ code: spec.code, token, theme }))

      /**
       * One inbound message.
       *
       * `validateFrameMessage` rejects anything that is not this frame, not this
       * token, or not a whitelisted shape. A rejection is silent by design: a
       * sibling card's frame and a stale frame after unmount both land here, and
       * neither is something the user should read about.
       */
      const onMessage = (event) => {
        const verdict = validateFrameMessage(event, {
          source: element.contentWindow,
          token: tokenRef.current,
        })
        if (!verdict.ok) return

        if (verdict.type === 'height') {
          setHeight(verdict.height)
          return
        }
        if (verdict.type === 'failed') {
          if (verdict.detail !== '') setFrameFailed(verdict.detail)
          return
        }
        // `interact` becomes a PENDING REQUEST. Nothing is sent here.
        const outcome = gate.request(verdict.text)
        if (!outcome.ok) return
        setPending({ text: verdict.text })
        setSent(false)
        setSendFailed('')
      }

      view.addEventListener('message', onMessage)
      const stopTheme = observeTheme(view, (snapshot) => {
        element.style.colorScheme = snapshot.dark === true ? 'dark' : 'light'
        const target = element.contentWindow
        if (target === null) return
        target.postMessage({ type: 'theme', token: tokenRef.current, theme: snapshot }, '*')
      })

      return function dispose() {
        element.removeEventListener('load', onLoad)
        view.removeEventListener('message', onMessage)
        stopTheme()
        gate.clear()
        tokenRef.current = ''
      }
    }, [spec.code])

    /**
     * Send, from the host's own button.
     *
     * This is the only place a card can reach the conversation, and it runs in
     * response to a click on an element that lives in the HOST document. A frame
     * cannot produce that click: it cannot reach this DOM, and a `postMessage`
     * carries no user gesture. The event handler is therefore the trust boundary,
     * not the message.
     */
    const accept = React.useCallback(async () => {
      const text = gateRef.current?.accept()
      if (text === null || text === undefined) return
      setPending(null)
      if (typeof sendMessage !== 'function') {
        setSendFailed('this card cannot send a message: no conversation bridge was injected')
        return
      }
      try {
        await sendMessage(text)
        setSent(true)
        setSendFailed('')
      } catch (error) {
        setSendFailed(error instanceof Error ? error.message : String(error))
      }
    }, [sendMessage])

    const dismiss = React.useCallback(() => {
      gateRef.current?.clear()
      setPending(null)
    }, [])

    // The confirmation line expires on its own: once the user's message appears
    // below the card, a "sent" badge would be reading back what they can see.
    React.useEffect(() => {
      if (!sent) return undefined
      const timer = globalThis.setTimeout(() => setSent(false), 4000)
      return () => { globalThis.clearTimeout(timer) }
    }, [sent])

    return h('div', { className: 'dsh-genui-body' },
      h('iframe', {
        ref: frame,
        className: FRAME_CLASS,
        sandbox: 'allow-scripts',
        title: spec.title,
        // No `allow` entry grants the frame any additional permission: camera,
        // microphone, geolocation, clipboard and fullscreen are not delegated to
        // it. What that means concretely is the browser's to enforce per feature;
        // this attribute is the absence of a grant, not a promise that every
        // related API is switched off.
        referrerPolicy: 'no-referrer',
        // A fixed height set from the frame's own report. `scrolling="no"`
        // keeps a nested scrollbar out of the transcript.
        style: { height: height + 'px' },
        scrolling: 'no',
      }),
      pending !== null
        ? h('div', { className: 'dsh-genui-pending-send' },
          h('div', { className: 'dsh-genui-pending-text' }, pending.text.slice(0, MAX_INTERACT_CHARS)),
          h('div', { className: 'dsh-genui-pending-actions' },
            h('button', {
              type: 'button',
              className: 'dsh-genui-confirm',
              onClick: accept,
            }, t('card.sendChoice')),
            h('button', {
              type: 'button',
              className: 'dsh-genui-dismiss',
              onClick: dismiss,
            }, t('card.dismissChoice'))))
        : null,
      sent ? h('div', { className: 'dsh-genui-sent', role: 'status' }, t('card.sent')) : null,
      sendFailed !== '' ? h(Failure, { t, title: t('card.sendFailed'), detail: sendFailed }) : null,
      frameFailed !== ''
        ? h(Failure, { t, title: t('card.failed'), detail: frameFailed })
        : null)
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
    h(CardFrame, { spec, t, sendMessage: props.sendMessage }),
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
 * The badge exists so a reader can tell "this is a big card" from "a line of
 * markup" without opening the source.
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
