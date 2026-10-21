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
   * @param {object} props slot owner props: `block`, `phase`, `useDisclosure`, `t`
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
    const output = done ? resultText(block) : ''
    const interrupted = done && block.error?.code === 'interrupted'
    const state = !done
      ? (block?.phase === 'preparing' ? 'preparing' : 'running')
      : interrupted ? 'stopped' : block.isError ? 'error' : 'ok'
    const disclosure = typeof props.useDisclosure === 'function' ? props.useDisclosure() : null
    const expanded = disclosure !== null && disclosure.expanded === true
    const toggle = disclosure === null ? null : disclosure.toggle
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
        h('div', { className: 'dsh-gb-tool-request' },
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
          h(CopyCommandButton, { text: command, label: t('run.copy') })),
        output !== ''
          ? h('pre', { className: 'dsh-gb-tool-respond' }, output)
          : null)
      : null)
  }

  return RunShellRow
}