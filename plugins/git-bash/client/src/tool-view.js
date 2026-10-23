/**
 * The `run_shell` tool view: Claude Code's Bash card.
 *
 * WHY THIS EXISTS IN THE *CLIENT* HALF OF THE SHELL PLUGIN. `run_shell` is a
 * third-party wire tool: the host renders every tool it has no view for through
 * its generic card, which is an *input/output* grid — a `输入` label, the raw
 * argument JSON, a divider, an `输出` label, and the result — two labelled rows
 * inside one box. The reference (Claude Code desktop, 2.42304.2) renders a shell
 * call instead as:
 *
 *   1. a plain description row with a chevron ("Checked baselines for …");
 *   2. a boxed, syntax-coloured command line prefixed with `$`;
 *   3. the captured output as BARE flowing text underneath — no label, no box.
 *
 * The host's `tool.call.toolview` slot is the supported place for exactly this:
 * a business package registers its own wire tool name and owns the card. The
 * reference's own JSX (`ion-dist/assets/v1/cc1aae219-*.js`) draws the command
 * through `Pw` (the code block) and the result through `Pw bare` without a
 * title, which is why the output has no frame around it.
 *
 * @module tool-view
 */

/** Shell separators that start a new command word. */
const OPERATORS = ['&&', '||', '|', ';', '>>', '>', '<']

/** Characters that end an unquoted word. */
const WORD_BREAK = new Set([' ', '\t', '\n', '|', ';', '>', '<', '"', "'"])

/**
 * Split one shell command into coloured runs.
 *
 * Deliberately small: it recognises quoted strings, redirection/pipes and the
 * three word roles the reference colours — the command name, its flags and its
 * arguments. It does not try to be a shell parser; an unknown construct stays
 * `plain` and therefore keeps the card's ink.
 *
 * @param {string} command the command line as the model wrote it
 * @returns {Array<{ text: string, kind: 'plain' | 'command' | 'flag' | 'arg' | 'string' | 'operator' }>}
 */
export function tokenizeShell(command) {
  const tokens = []
  if (typeof command !== 'string' || command === '') return tokens
  let i = 0
  let expectCommand = true
  while (i < command.length) {
    const ch = command[i]
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      const start = i
      while (i < command.length && (command[i] === ' ' || command[i] === '\t' || command[i] === '\n')) i += 1
      tokens.push({ text: command.slice(start, i), kind: 'plain' })
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      while (j < command.length) {
        if (quote === '"' && command[j] === '\\') { j += 2; continue }
        if (command[j] === quote) { j += 1; break }
        j += 1
      }
      tokens.push({ text: command.slice(i, j), kind: 'string' })
      i = j
      expectCommand = false
      continue
    }
    const operator = OPERATORS.find(function (candidate) { return command.startsWith(candidate, i) })
    if (operator !== undefined) {
      tokens.push({ text: operator, kind: 'operator' })
      i += operator.length
      expectCommand = true
      continue
    }
    let j = i
    while (j < command.length && !WORD_BREAK.has(command[j])) j += 1
    const word = command.slice(i, j)
    if (expectCommand) {
      tokens.push({ text: word, kind: 'command' })
      expectCommand = false
    } else {
      tokens.push({ text: word, kind: word.startsWith('-') ? 'flag' : 'arg' })
    }
    i = j
  }
  return tokens
}

/**
 * Parse a tool call's raw argument JSON.
 *
 * @param {unknown} argsRaw the streamed argument text, possibly incomplete
 * @returns {{ command?: unknown, description?: unknown } | null}
 */
export function readArguments(argsRaw) {
  if (typeof argsRaw !== 'string' || argsRaw === '') return null
  try {
    const value = JSON.parse(argsRaw)
    return typeof value === 'object' && value !== null ? value : null
  } catch (error) {
    return null
  }
}

/**
 * Flatten a settled result's content into display text.
 *
 * Same rule the host uses for its generic card: text blocks verbatim, any other
 * block as pretty JSON, and a structured error line when there is no content at
 * all — so a failed call never renders an empty card.
 *
 * @param {object} block the settled Tool result block
 * @returns {string}
 */
export function resultText(block) {
  const parts = []
  const content = Array.isArray(block?.content) ? block.content : []
  for (const part of content) {
    if (part?.type === 'text') parts.push(part.text)
    else parts.push(JSON.stringify(part, null, 2))
  }
  const error = block?.error
  if (parts.length === 0 && error !== undefined && error !== null) {
    parts.push(String(error.name ?? 'Error') + ': ' + String(error.code ?? ''))
  }
  return parts.join('\n')
}

/**
 * The result text as the CARD shows it.
 *
 * THE HEADER LINE IS METADATA, NOT OUTPUT. `[gitbash · C:/…/bash.exe] exit 0` is
 * the interpreter and exit status the MODEL needs — it tells the model which
 * shell parsed the command and whether it succeeded. The reader already sees both
 * without it: the command box above the output names the shell, and a failure
 * shows up as the error state plus the stderr the command printed. So the card
 * drops that whole first line and shows only what the command produced.
 *
 * A NON-ZERO EXIT IS KEPT. Silently hiding "exit 1" would make a failed command
 * look like it produced exactly what is on screen, which is the one thing a
 * result card must never do. Only the success header disappears.
 *
 * THE MODEL'S COPY IS UNTOUCHED. `content` keeps the full header including the
 * `· direct (unsandboxed)` marker; `resultText` is what the provider receives.
 *
 * @param {object} block the settled Tool result block
 * @param {boolean} sandboxShown the disclosure switch
 * @returns {string} the display text
 */
export function displayText(block, sandboxShown) {
  const text = resultText(block)
  const HEADER = /^\[[^\]\n]*?\] exit (\d+)(?: · (?:host|direct)(?: \(unsandboxed\))?)?(?:\n|$)/
  const match = HEADER.exec(text)
  if (match === null) return text
  const success = match[1] === '0'
  // The switch only ever governed the sandbox words. A successful header is now
  // dropped for everyone; a failed one stays so the card still reports failure.
  const drop = success
  if (!drop) {
    return sandboxShown === false ? text.replace(' · direct (unsandboxed)', '') : text
  }
  return text.slice(match[0].length)
}

/**
 * The sandbox sentence the host put on the result's `meta`, if any.
 *
 * WHY IT COMES FROM `meta` AND NOT FROM THE CONTENT. The sentence used to be the
 * second line of the tool result, which the model paid for on every request. It
 * is now `output.presentationMeta` — the registry hands that object to the page
 * as `data.meta` and never to the provider — so the card can keep stating
 * "this ran outside the sandbox" at no context cost. The model still gets the
 * marker (`· direct (unsandboxed)`) inside the content, always.
 *
 * @param {object} block the settled Tool result block
 * @returns {string} the sentence, or an empty string
 */
export function sandboxNote(block) {
  const note = block?.meta !== null && typeof block?.meta === 'object' ? block.meta.note : undefined
  return typeof note === 'string' ? note.trim() : ''
}

/** A subscription that never fires, for a row rendered without the preference. */
const NO_SUBSCRIPTION = function subscribe() { return function unsubscribe() {} }

/** The default when no preference store reaches the row: the line is SHOWN. */
const ALWAYS_SHOWN = function getSnapshot() { return true }

/**
 * Build the `run_shell` row.
 *
 * @param {object} deps
 * @param {object} deps.React the host React
 * @returns {Function} the slot occupant
 */
export function createRunShellRow({ React }) {
  const h = React.createElement

  /**
   * A copy control for the command box.
   *
   * The reference puts a ghost copy button INSIDE the code surface (its rail is
   * `absolute inset-y-0 right-1.75`, revealed with the card), so the shell card
   * gets its own rather than borrowing a banner: the command is what a reader
   * copies, not the whole card.
   *
   * @param {object} props
   * @param {string} props.text command text to write to the clipboard
   * @param {string} props.label localised accessible label
   * @returns {object} the button
   */
  function CopyCommandButton({ text, label }) {
    const [copied, setCopied] = React.useState(false)
    const timer = React.useRef(null)
    React.useEffect(function clearOnUnmount() {
      return function clear() {
        if (timer.current !== null) clearTimeout(timer.current)
      }
    }, [])
    const copy = function copy() {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
      if (clipboard === undefined || typeof clipboard.writeText !== 'function') return
      void clipboard.writeText(text).then(function done() {
        setCopied(true)
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = setTimeout(function decay() { setCopied(false) }, 1000)
      }, function failed() {})
    }
    return h('button', {
      type: 'button',
      className: 'dsh-gb-copy',
      'aria-label': label,
      'data-copied': copied ? 'true' : undefined,
      onClick: copy,
    },
    // THE HOST'S OWN COPY GLYPH, not a character stand-in. The two-rect mark
    // below is the exact SVG the banner renders (`_action_1pq26_43` button,
    // `aria-label="Copy"`), copied so the command card's control is visually
    // the same control the read and edit cards show — same 14px box, same 1px
    // stroke, same fill rule. A `⧉` character rendered at a different weight
    // and optical size, which is what this replaced.
    copied
      ? h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, h('path', { d: 'M3.5 8.5l3 3 6-6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }))
      : h('svg', {
        // 12px inside an 18px box: the command box is a small surface, and the
        // 14px glyph the banner uses looked heavy in it.
        width: 12,
        height: 12,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        strokeWidth: 1,
      },
      h('rect', { x: 1.52075, y: 4.07373, width: 10.3932, height: 10.3932, rx: 2, stroke: 'currentColor' }),
      h('path', {
        d: 'M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z',
        fill: 'currentColor',
      })))
  }

  /**
   * The trajectory entrance for this call.
   *
   * A FLOATING GLYPH, NOT A LINE OF ITS OWN. The host hands every tool row an
   * `inspect` callback (`ToolCall` builds it from `inspectCall(callId)`), and its
   * own cards draw it as a labelled button under the payload — which pushes the
   * card one row taller for an action nobody asks for until they want it. The
   * copy control in this same box already establishes the pattern the user
   * asked to match: an absolutely positioned glyph in the command box's corner,
   * invisible and unclickable until the box is hovered, revealed by
   * `:focus-visible` for the keyboard.
   *
   * @param {object} props
   * @param {() => void} props.onInspect the host's callback
   * @param {string} props.label localised accessible label and tooltip
   * @returns {object} the button
   */
  function InspectButton({ onInspect, label }) {
    return h('button', {
      type: 'button',
      className: 'dsh-gb-inspect',
      // The stable hook the theme's shared tool chrome keys on. Kept even when
      // the theme is absent: this plugin's own stylesheet styles it alone.
      'data-cds-tool-inspect': '',
      title: label,
      'aria-label': label,
      onClick: onInspect,
    }, h('svg', {
      width: 12,
      height: 12,
      viewBox: '0 0 16 16',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': 'true',
    }, h('path', {
      d: 'M6.5 2.5H3a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V9.5M9 2.5h4.5V7M13.5 2.5l-7 7',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      fill: 'none',
    })))
  }

  /**
   * @param {object} props slot owner props: `block`, `phase`, `useDisclosure`, `t`, `inspect`
   * @returns {object} the row
   */
  function RunShellRow(props) {
    const t = typeof props.t === 'function' ? props.t : function untranslated(key) { return key }
    const block = props.block
    const done = block !== null && typeof block === 'object' && 'kind' in block
    const call = done ? block.call : block
    const args = readArguments(done ? call?.argsRaw : block?.argsRaw)
    const command = typeof args?.command === 'string' ? args.command : ''
    const description = typeof args?.description === 'string' ? args.description.trim() : ''
    // THE SWITCH GOVERNS EVERY SANDBOX WORD ON THE CARD, not just the sentence
    // under the output. Turning it off used to hide the note line and leave the
    // `(unsandboxed)` marker in the header, which reads as a switch that does
    // nothing — the user still saw sandbox copy. Off now strips BOTH: the header
    // marker and the note line. The model's copy is never touched either way.
    const noteStore = props.noteStore !== null && typeof props.noteStore === 'object' ? props.noteStore : null
    const sandboxShown = React.useSyncExternalStore(
      noteStore === null ? NO_SUBSCRIPTION : noteStore.subscribe,
      noteStore === null ? ALWAYS_SHOWN : noteStore.getSnapshot,
    ) === true
    const output = done ? displayText(block, sandboxShown) : ''
    const note = done && sandboxShown ? sandboxNote(block) : ''
    const interrupted = done && block.error?.code === 'interrupted'
    const state = !done
      ? (block?.phase === 'preparing' ? 'preparing' : 'running')
      : interrupted ? 'stopped' : block.isError ? 'error' : 'ok'
    const disclosure = typeof props.useDisclosure === 'function' ? props.useDisclosure() : null
    const expanded = disclosure !== null && disclosure.expanded === true
    const toggle = disclosure === null ? null : disclosure.toggle
    // THE HOST'S TRAJECTORY ENTRANCE, WHEN IT OFFERS ONE. `inspect` is absent on
    // hosts that predate it and on cards rendered outside a trajectory-aware
    // tree, so the control appears only when there is something to call — a
    // button that does nothing is worse than no button.
    const inspect = typeof props.inspect === 'function' ? props.inspect : undefined
    const canExpand = command !== '' || output !== ''
    const title = description !== ''
      ? description
      : state === 'stopped' ? t('run.stopped')
        : state === 'running' || state === 'preparing' ? t('run.running')
          : t('run.done')

    const activate = canExpand && toggle !== null ? toggle : undefined
    const onKeyDown = canExpand && toggle !== null
      ? function onKeyDown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        toggle()
      }
      : undefined

    return h('div', {
      className: 'dsh-gb-tool',
      // The wire name that dispatched this row: run_shell, pwsh or bash. It
      // stays on the DOM because the theme and the E2E probes key on
      // `[data-tool]`, exactly like the host's own rows.
      'data-tool': typeof props.toolName === 'string' && props.toolName !== '' ? props.toolName : 'run_shell',
      'data-state': state,
      'data-expanded': expanded ? 'true' : 'false',
    },
    h('div', {
      className: 'dsh-gb-tool-head' + (canExpand ? ' is-expandable' : ''),
      role: canExpand ? 'button' : undefined,
      tabIndex: canExpand ? 0 : undefined,
      'aria-expanded': canExpand ? expanded : undefined,
      onClick: activate,
      onKeyDown,
    },
    h('span', { className: 'dsh-gb-tool-chevron', 'aria-hidden': 'true' },
      h('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        strokeWidth: 1,
      }, h('path', {
        // One down-chevron; the stylesheet rotates it while the row is closed.
        d: 'M4 6L7.29289 9.29289C9.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6',
        stroke: 'currentColor',
      }))),
    h('span', { className: 'dsh-gb-tool-title' }, title)),
    canExpand && expanded
      ? h('div', { className: 'dsh-gb-tool-body' },
        h('div', {
          className: 'dsh-gb-tool-request',
          // THE BOX KNOWS WHETHER IT HAS A CORNER PAIR. Two glyphs need more
          // right padding than one, and the reserve has to be static — a
          // reserve that appeared on hover would reflow the command every time
          // the pointer crossed the box. Declaring the fact here keeps the
          // stylesheet from guessing: `[data-inspect]` on the box, not a
          // selector engine feature the renderer may not support.
          'data-inspect': inspect === undefined ? undefined : '',
        },
        h('span', { className: 'dsh-gb-tool-prompt', 'aria-hidden': 'true' }, '$'),
          h('code', { className: 'dsh-gb-tool-command' },
            tokenizeShell(command).map(function (token, index) {
              return h('span', { key: index, 'data-token': token.kind }, token.text)
            })),
          // A HOOK COMPONENT, NOT A HELPER CALL. `CopyCommandButton` uses
          // useState/useRef/useEffect, so calling it as a plain function would
          // add hooks only while the row is expanded — the hook count would
          // change between renders and React would throw, dropping the whole
          // row. `h(...)` gives it its own component instance, mounted and
          // unmounted with the body.
          inspect === undefined ? null : h(InspectButton, { onInspect: inspect, label: t('run.inspect') }),
          h(CopyCommandButton, { text: command, label: t('run.copy') })),
        output !== ''
          ? h('pre', { className: 'dsh-gb-tool-respond' }, output)
          : null,
        // THE SANDBOX SENTENCE, ON ITS OWN LINE UNDER THE OUTPUT.
        //
        // It used to live inside the result content, which the model paid for on
        // every request. The host now sends it as `data.meta.note` and this row
        // renders it — same words, no context cost. The same switch that hides it
        // also strips the header marker (see `displayText`), so "off" really means
        // no sandbox copy on the card. Its own class, because it is a note and not
        // captured output: no code face, no pre-wrap of a command.
        note === ''
          ? null
          : h('div', { className: 'dsh-gb-tool-note', 'data-sandbox-note': '' }, note))
      : null)
  }

  return RunShellRow
}