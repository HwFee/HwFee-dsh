/**
 * The `edit` / `write` tool card: a real diff, drawn by the theme.
 *
 * WHY A VIEW. The host renders these two tools with its own `DiffBlock`, which
 * re-diffs `oldText`/`newText` and emits rows as `{ kind, text }` — plain text
 * nodes (`dsh-client-ui-tool`, `gF`/`yF`). There is no token structure in the
 * DOM, so CSS can tint a row and nothing else: it cannot colour a keyword, a
 * string or a number, and it cannot say WHICH token changed. Both are the point
 * of this card, so the theme owns the view, through the same `tool.call.toolview`
 * seam the git-bash plugin uses.
 *
 * WHERE THE DATA COMES FROM. `block.meta.diffs` is an array of
 * `{ path, oldText, newText, oldStart?, newStart? }` hunks:
 *
 *   - `oldText` is `null` for a pure insertion (a new file); `newText` is always
 *     a string;
 *   - `oldStart` / `newStart` are 1-based FILE line numbers, present only when
 *     the asar patch (`patches/dsh-tool-fs-hunk-lines.patch`) is installed. The
 *     shipped archive has neither, so the card falls back to hunk-relative
 *     1..n and says so with `data-numbered="false"` on the hunk.
 *
 * WHAT IS RENDERED, per hunk: a gutter with the file line number, the
 * `+`/`-`/space glyph, and the line text split into `data-cds-tok` spans whose
 * colours come from the theme's `--shiki-token-*` variables. A replacement line
 * (a run of `-` rows immediately followed by a run of `+` rows) is paired row
 * by row, and its differing tokens carry `data-cds-tok-diff="add"|"del"`, so two
 * similar-looking lines show the one token that actually moved.
 *
 * FAILURE AND EDGE STATES. `isError` renders the tool's own error text and no
 * rows; missing metadata falls back to an argument-derived diff (what the host
 * itself does for a new file) and then to the plain result text; a hunk longer
 * than `LINE_LIMIT` collapses to head + tail with a localised expander.
 *
 * @module diffview
 */

import { languageForPath, scanLines } from './tokenscan.js'
import { makeT } from './locales.js'

/**
 * Rows shown per hunk before the expander appears.
 *
 * The host's own diff card uses `maxLines = 16` (`yF` in the web frontend,
 * default parameter) and splits it `ceil(16/2)` head + `floor(16/2)` tail.
 * Matching that keeps the expanded card the same height either way.
 */
export const LINE_LIMIT = 16

/**
 * Longest line, in characters, that still gets a token-level diff — the same
 * 1000-character ceiling the reference uses (`maxLineDiffLength`,
 * `docs/tool-cards-diff.md` §3.1). Above it the line is minified or data, and
 * per-token emphasis would be noise.
 */
export const MAX_TOKEN_DIFF_CHARS = 1000

/** LCS budgets: 400 x 100 tokens, and 500 x 400 lines. */
const TOKEN_CELLS = 40000
const LINE_CELLS = 200000

/** The empty per-hunk expansion map; never mutated. */
const NO_HUNKS = Object.freeze({})

/**
 * Split file text into lines the way the host does: a trailing newline is a
 * terminator, not an empty last line.
 *
 * @param {unknown} text the file text
 * @returns {string[]} the lines
 */
export function splitLines(text) {
  if (typeof text !== 'string' || text === '') return []
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
}

/**
 * Resolve a hunk's two start lines, mirroring one side onto the other.
 *
 * Same rule as `diffnumbers.resolveStart`: a header that published only one
 * side is exact for the common `-N,M +N,K` case, an approximation otherwise,
 * and never worse than 1. Returning null keeps "the card does not know"
 * distinct from "the hunk starts at line 1".
 *
 * @param {object} hunk a metadata hunk
 * @returns {{ oldStart: number, newStart: number } | null}
 */
export function resolveStarts(hunk) {
  const line = (value) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null)
  const oldStart = line(hunk?.oldStart)
  const newStart = line(hunk?.newStart)
  if (oldStart === null && newStart === null) return null
  return { oldStart: oldStart ?? newStart, newStart: newStart ?? oldStart }
}

/**
 * Build one hunk: align, number, pair.
 *
 * A common prefix and suffix are trimmed before the LCS, which keeps a
 * 2000-line file with one edited line from building a 4-million-cell table.
 * What remains is LCS-matched when it fits `LINE_CELLS`; above that the middle
 * is emitted as one deletion run followed by one addition run — still a correct
 * unified diff (every old line shown removed, every new line added), just not a
 * minimal one, and the only honest rendering for a change no row-wise algorithm
 * can align in the time a render may take.
 *
 * Numbering is the reference's unified rule: the gutter prints the NEW number
 * and a deleted row falls back to the OLD one (`docs/tool-cards-diff.md` §2.4),
 * because a deleted line has no new-file number at all. Without start lines both
 * counters begin at 1, which is hunk-relative numbering.
 *
 * @param {object} hunk a metadata hunk (`path`, `oldText`, `newText`, starts)
 * @returns {object} the hunk with `rows`, `starts` and `language`
 */
export function buildHunk(hunk) {
  const starts = resolveStarts(hunk)
  const at = splitLines(hunk.oldText)
  const bt = splitLines(hunk.newText)
  const rows = []
  let head = 0
  while (head < at.length && head < bt.length && at[head] === bt[head]) head += 1
  let endA = at.length
  let endB = bt.length
  while (endA > head && endB > head && at[endA - 1] === bt[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  for (let i = 0; i < head; i += 1) rows.push({ kind: 'ctx', text: at[i] })
  const m = endA - head
  const n = endB - head
  if (m === 0 || n === 0 || m * n > LINE_CELLS) {
    for (let i = head; i < endA; i += 1) rows.push({ kind: 'del', text: at[i] })
    for (let j = head; j < endB; j += 1) rows.push({ kind: 'add', text: bt[j] })
  } else {
    const width = n + 1
    const table = new Uint32Array((m + 1) * width)
    for (let i = m - 1; i >= 0; i -= 1) {
      for (let j = n - 1; j >= 0; j -= 1) {
        table[i * width + j] = at[head + i] === bt[head + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < m && j < n) {
      if (at[head + i] === bt[head + j]) {
        rows.push({ kind: 'ctx', text: at[head + i] })
        i += 1
        j += 1
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        rows.push({ kind: 'del', text: at[head + i] })
        i += 1
      } else {
        rows.push({ kind: 'add', text: bt[head + j] })
        j += 1
      }
    }
    while (i < m) { rows.push({ kind: 'del', text: at[head + i] }); i += 1 }
    while (j < n) { rows.push({ kind: 'add', text: bt[head + j] }); j += 1 }
  }
  for (let i = endA; i < at.length; i += 1) rows.push({ kind: 'ctx', text: at[i] })

  let oldNo = starts === null ? 1 : starts.oldStart
  let newNo = starts === null ? 1 : starts.newStart
  for (const row of rows) {
    row.pair = null
    if (row.kind === 'del') {
      row.number = oldNo
      row.side = 'old'
      oldNo += 1
      continue
    }
    row.number = newNo
    row.side = 'new'
    newNo += 1
    if (row.kind === 'ctx') oldNo += 1
  }
  // Pair each deletion run with the addition run that follows it. An unpaired
  // row is entirely new or gone, so the renderer marks the whole line.
  let i = 0
  while (i < rows.length) {
    if (rows[i].kind !== 'del') { i += 1; continue }
    let delEnd = i
    while (delEnd < rows.length && rows[delEnd].kind === 'del') delEnd += 1
    let addEnd = delEnd
    while (addEnd < rows.length && rows[addEnd].kind === 'add') addEnd += 1
    const pairs = Math.min(delEnd - i, addEnd - delEnd)
    for (let p = 0; p < pairs; p += 1) {
      rows[i + p].pair = delEnd + p
      rows[delEnd + p].pair = i + p
    }
    i = addEnd
  }
  return {
    path: typeof hunk.path === 'string' ? hunk.path : '',
    oldText: typeof hunk.oldText === 'string' ? hunk.oldText : null,
    newText: typeof hunk.newText === 'string' ? hunk.newText : '',
    starts,
    language: languageForPath(hunk.path),
    rows,
  }
}

/**
 * Read a settled result's text content.
 *
 * @param {object} block the result block
 * @returns {string} the text blocks joined, or the error's own label
 */
export function resultText(block) {
  const parts = []
  for (const part of Array.isArray(block?.content) ? block.content : []) {
    if (part?.type === 'text' && typeof part.text === 'string') parts.push(part.text)
  }
  if (parts.length === 0 && block?.error !== undefined && block?.error !== null) {
    parts.push(String(block.error.name ?? 'Error') + ': ' + String(block.error.code ?? ''))
  }
  return parts.join('\n')
}

/** The call behind a block: the result's `call`, or the block during start. */
const callOf = (block) => (block !== null && typeof block === 'object'
  ? ('kind' in block ? block.call ?? null : block)
  : null)

/** Parse the call's raw argument JSON, or null. */
function argsOf(block) {
  const raw = callOf(block)?.argsRaw
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const value = JSON.parse(raw)
    return typeof value === 'object' && value !== null && Array.isArray(value) === false ? value : null
  } catch (error) {
    return null
  }
}

/**
 * Derive a diff from the call's own arguments.
 *
 * This is the host's fallback for a `write`: its `presentationMeta` reports
 * `diffs: []` when the file did not exist before, so a brand-new file has no
 * metadata diff BY DESIGN and the whole content is one addition. For an `edit`
 * it keeps a half-streamed or unpatched call readable instead of degrading
 * straight to a text blob.
 *
 * @param {object} block the tool block
 * @returns {object | null} one hunk, or null when the arguments cannot express it
 */
export function argumentDiff(block) {
  const call = callOf(block)
  const args = argsOf(block)
  if (call === null || args === null) return null
  const path = typeof args.file_path === 'string' ? args.file_path : ''
  if (path === '') return null
  if (call.name === 'write') {
    return typeof args.content === 'string' ? { path, oldText: null, newText: args.content } : null
  }
  if (call.name !== 'edit') return null
  if (typeof args.old_string !== 'string' || typeof args.new_string !== 'string') return null
  return { path, oldText: args.old_string === '' ? null : args.old_string, newText: args.new_string }
}

/** The file name of a path, for the row title. */
export function baseName(path) {
  if (typeof path !== 'string' || path === '') return ''
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}

/**
 * The path as the reader thinks of it: workspace-relative when it sits under
 * the session's `cwd`, absolute otherwise — the same short form the host's own
 * tool rows use for their summary.
 *
 * @param {string} path a recorded or argument path
 * @param {string | undefined} cwd the session workspace root
 * @returns {string}
 */
export function displayPath(path, cwd) {
  if (typeof path !== 'string' || path === '') return ''
  if (typeof cwd !== 'string' || cwd === '' || path.startsWith(cwd) === false) return path
  const rest = path.slice(cwd.length).replace(/^[\\/]+/, '')
  return rest === '' ? path : rest
}

/**
 * Build the whole card model.
 *
 * @param {object} block the tool block for the current phase
 * @returns {object} the model every renderer and test reads
 */
export function buildDiffModel(block) {
  const done = block !== null && typeof block === 'object' && 'kind' in block
  const call = callOf(block)
  const args = argsOf(block)
  const argPath = typeof args?.file_path === 'string' ? args.file_path : ''
  let raw = []
  const recorded = done && block.meta !== null && typeof block.meta === 'object' ? block.meta.diffs : null
  for (const hunk of Array.isArray(recorded) ? recorded : []) {
    if (hunk === null || typeof hunk !== 'object') continue
    if (typeof hunk.newText !== 'string') continue
    if (hunk.oldText !== null && typeof hunk.oldText !== 'string') continue
    raw.push(hunk)
  }
  if (raw.length === 0) {
    const intended = argumentDiff(block)
    if (intended !== null) raw = [intended]
  }
  const hunks = raw.map(buildHunk)
  let add = 0
  let del = 0
  let numbered = hunks.length > 0
  for (const hunk of hunks) {
    if (hunk.starts === null) numbered = false
    for (const row of hunk.rows) {
      if (row.kind === 'add') add += 1
      else if (row.kind === 'del') del += 1
    }
  }
  return {
    tool: typeof call?.name === 'string' ? call.name : '',
    done,
    path: argPath === '' && hunks.length > 0 ? hunks[0].path : argPath,
    hunks,
    totals: { add, del },
    numbered,
    failed: done && block.isError === true,
    stopped: done && block.error?.code === 'interrupted',
    text: done ? resultText(block) : '',
  }
}

/**
 * Unified diff text, for the copy control.
 *
 * @param {object} model the card model
 * @returns {string} rows with `+`/`-`/two-space prefixes, hunks separated
 */
export function diffText(model) {
  const out = []
  for (const hunk of model.hunks) {
    if (out.length > 0) out.push('')
    for (const row of hunk.rows) {
      out.push((row.kind === 'add' ? '+ ' : row.kind === 'del' ? '- ' : '  ') + row.text)
    }
  }
  return out.join('\n')
}

/**
 * LCS over two token lists, returning the indices that did NOT match.
 *
 * Skipped (null) for a line longer than `MAX_TOKEN_DIFF_CHARS` or a pair whose
 * token product exceeds `TOKEN_CELLS`; the caller then marks the whole line,
 * which is the reference's degradation for a line diff it declines to compute.
 *
 * @param {Array<{ text: string }>} before old line tokens
 * @param {Array<{ text: string }>} after new line tokens
 * @returns {{ del: number[], add: number[] } | null}
 */
export function diffTokens(before, after) {
  const m = before.length
  const n = after.length
  if (m * n > TOKEN_CELLS) return null
  const chars = (list) => list.reduce((sum, token) => sum + token.text.length, 0)
  if (chars(before) > MAX_TOKEN_DIFF_CHARS || chars(after) > MAX_TOKEN_DIFF_CHARS) return null
  const width = n + 1
  const table = m === 0 || n === 0 ? null : new Uint16Array((m + 1) * width)
  if (table !== null) {
    for (let i = m - 1; i >= 0; i -= 1) {
      for (let j = n - 1; j >= 0; j -= 1) {
        table[i * width + j] = before[i].text === after[j].text
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
      }
    }
  }
  const del = []
  const add = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (before[i].text === after[j].text) {
      i += 1
      j += 1
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      del.push(i)
      i += 1
    } else {
      add.push(j)
      j += 1
    }
  }
  while (i < m) { del.push(i); i += 1 }
  while (j < n) { add.push(j); j += 1 }
  return { del, add }
}

/**
 * Tokenise a hunk and mark the changed tokens of every replacement pair.
 *
 * The scan runs over the hunk's rows in order with one carried state, so a block
 * comment or a markdown fence spanning rows is scanned as one region rather than
 * as unrelated lines.
 *
 * @param {object} hunk a built hunk
 * @returns {{ tokens: Array<Array<object>>, marks: Array<object | null> }}
 *          one token list and one mark per row; a mark is `{ all: true }` or
 *          `{ indexes: Set<number> }`, and null marks nothing
 */
export function decorateHunk(hunk) {
  const tokens = scanLines(hunk.rows.map((row) => row.text), hunk.language)
  const marks = hunk.rows.map(() => null)
  for (let i = 0; i < hunk.rows.length; i += 1) {
    const row = hunk.rows[i]
    if (row.kind === 'ctx') continue
    if (row.pair === null) {
      marks[i] = { all: true }
      continue
    }
    if (row.pair < i) continue // both rows are marked when the deletion is visited
    const partner = row.pair
    const result = diffTokens(tokens[i], tokens[partner])
    if (result === null) {
      marks[i] = { all: true }
      marks[partner] = { all: true }
      continue
    }
    if (result.del.length > 0) marks[i] = { indexes: new Set(result.del) }
    if (result.add.length > 0) marks[partner] = { indexes: new Set(result.add) }
  }
  return { tokens, marks }
}

/**
 * Build the slot occupant for one React instance.
 *
 * @param {object} deps
 * @param {object} deps.React the host React
 * @returns {Function} the `tool.call.toolview` component
 */
export function createDiffView({ React }) {
  const h = React.createElement

  /** One row: gutter number, glyph, tokenised text. */
  function rowNode(key, row, tokens, mark) {
    const spans = []
    for (let at = 0; at < tokens.length; at += 1) {
      const props = { key: at, 'data-cds-tok': tokens[at].kind }
      if (mark !== null && (mark.all === true || mark.indexes.has(at))) {
        props['data-cds-tok-diff'] = row.kind === 'del' ? 'del' : 'add'
      }
      spans.push(h('span', props, tokens[at].text))
    }
    return h('div', {
      key,
      'data-cds-diff-row': '',
      'data-kind': row.kind,
      // Which file side the printed number came from: `old` on a deleted row,
      // `new` everywhere else. The gutter's COLOUR follows the row kind (the
      // reference colours a change, not a side); this attribute is the probe
      // hook for "is that number a file line or a hunk-relative count".
      'data-side': row.side,
    },
    h('span', { 'data-cds-diff-num': '', 'aria-hidden': 'true' }, String(row.number)),
    h('span', { 'data-cds-diff-glyph': '', 'aria-hidden': 'true' },
      row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '),
    h('code', { 'data-cds-diff-text': '' }, spans))
  }

  /**
   * The registered component.
   *
   * @param {object} props the slot owner props
   * @returns {object} the row
   */
  return function DiffView(props) {
    const t = makeT(props.t)
    const block = props.block
    const disclosure = typeof props.useDisclosure === 'function' ? props.useDisclosure() : null
    const expanded = disclosure !== null && disclosure.expanded === true
    const toggle = disclosure === null ? null : disclosure.toggle
    const model = React.useMemo(function build() { return buildDiffModel(block) }, [block])
    // ONE decode for every hunk, keyed on the model AND the open state: a
    // collapsed card scans nothing (a 2000-line write would otherwise be
    // tokenised on mount for a card nobody opened), and a re-render from a
    // hover or a copy confirmation reuses the tokens instead of rescanning.
    const decorated = React.useMemo(function decorate() {
      return expanded ? model.hunks.map(function (hunk) { return decorateHunk(hunk) }) : []
    }, [model, expanded])
    const [openHunks, setOpenHunks] = React.useState(NO_HUNKS)
    const [copied, setCopied] = React.useState(false)
    React.useEffect(function clearCopied() {
      if (copied !== true) return undefined
      const timer = setTimeout(function decay() { setCopied(false) }, 1000)
      return function cancel() { clearTimeout(timer) }
    }, [copied])

    // A row state is PHASE-driven, not content-driven: a call whose arguments
    // already express a diff is still running until its result lands.
    const state = model.done === false
      ? (block?.phase === 'preparing' ? 'preparing' : 'running')
      : model.stopped ? 'stopped' : model.failed ? 'error' : 'ok'
    const kind = props.toolName === 'write' ? 'write' : 'edit'
    const name = baseName(model.path) || props.toolName
    const title = model.failed
      ? t('diff.' + kind + '.failed', { name })
      : model.stopped ? t('diff.stopped', { name })
        : t('diff.' + kind + (state === 'ok' ? '.done' : '.running'), { name })

    const stats = []
    // A settled-with-cue row (failed, stopped) shows the cue, not a diff stat:
    // the host's own rows suppress their `+N -M` for the same reason. A stat
    // beside "Failed to edit" invites the reader to trust a diff that never
    // landed.
    const settledWithCue = state === 'error' || state === 'stopped'
    if (!settledWithCue && model.totals.add > 0) {
      stats.push(h('span', { key: 'add', 'data-cds-diff-stat': 'add' }, '+' + model.totals.add))
    }
    if (!settledWithCue && model.totals.del > 0) {
      stats.push(h('span', { key: 'del', 'data-cds-diff-stat': 'del' }, '−' + model.totals.del))
    }

    const body = []
    if (expanded) {
      if (model.failed) {
        body.push(h('div', { key: 'error', 'data-cds-diff-error': '', role: 'alert' },
          model.text === '' ? t('diff.empty') : model.text))
      } else if (model.hunks.length === 0) {
        body.push(h('pre', { key: 'plain', 'data-cds-diff-plain': '' },
          model.text === '' ? t('diff.empty') : model.text))
      } else {
        model.hunks.forEach(function (hunk, index) {
          // A `⋯` between two hunks of the same file: the reference marks the
          // discontinuity rather than letting two regions read as contiguous.
          if (index > 0) body.push(h('div', { key: 'gap' + index, 'data-cds-diff-gap': '' }, '⋯'))
          const rows = hunk.rows
          const decoded = decorated[index]
          const nodes = []
          const hidden = rows.length - LINE_LIMIT
          const open = openHunks[index] === true
          const push = (at) => nodes.push(rowNode(at, rows[at], decoded.tokens[at], decoded.marks[at]))
          if (open || hidden <= 0) {
            for (let at = 0; at < rows.length; at += 1) push(at)
          } else {
            const head = Math.ceil(LINE_LIMIT / 2)
            for (let at = 0; at < head; at += 1) push(at)
            nodes.push(h('button', {
              key: 'more',
              type: 'button',
              'data-cds-diff-more': '',
              'aria-expanded': false,
              'aria-label': t('diff.expandAria', { count: hidden }),
              onClick: function more() { toggleHunk(index) },
            }, t('diff.expand', { count: hidden })))
            for (let at = rows.length - (LINE_LIMIT - head); at < rows.length; at += 1) push(at)
          }
          if (open && hidden > 0) {
            nodes.push(h('button', {
              key: 'less',
              type: 'button',
              'data-cds-diff-more': '',
              'aria-expanded': true,
              onClick: function less() { toggleHunk(index) },
            }, t('diff.collapse')))
          }
          body.push(h('div', {
            key: 'hunk' + index,
            'data-cds-diff-hunk': '',
            'data-numbered': hunk.starts === null ? 'false' : 'true',
          }, nodes))
        })
      }
    }

    function toggleHunk(index) {
      setOpenHunks(function flip(previous) {
        const next = { ...previous }
        if (next[index] === true) delete next[index]
        else next[index] = true
        return next
      })
    }

    return h('div', {
      'data-cds-diffrow': '',
      'data-tool': props.toolName,
      'data-state': state,
      'data-expanded': expanded ? 'true' : 'false',
      'data-inspect': expanded && body.length > 0 && typeof props.inspect === 'function' ? '' : undefined,
    },
    expanded && body.length > 0 && typeof props.inspect === 'function' ? h('button', {
      type: 'button', 'data-cds-tool-inspect': '',
      title: t('diff.inspect'), 'aria-label': t('diff.inspect'), onClick: props.inspect,
    }, h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
      h('path', { d: 'M6.5 2.5H3a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V9.5M9 2.5h4.5V7M13.5 2.5l-7 7', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }))) : null,
    // The copy control is a SIBLING of the disclosure header, not a child: a
    // button inside a role="button" row is a nested control, and the host's own
    // rail solves it the same way (absolutely positioned in the row's corner).
    expanded && model.failed === false && model.hunks.length > 0
      ? h('button', {
        type: 'button',
        'data-cds-diff-copy': '',
        'data-copied': copied ? 'true' : undefined,
        'aria-label': t('diff.copy'),
        title: copied ? t('diff.copied') : t('diff.copy'),
        onClick: function copy() {
          const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
          if (clipboard === undefined || typeof clipboard.writeText !== 'function') return
          void clipboard.writeText(diffText(model)).then(function done() { setCopied(true) }, function failed() {})
        },
      },
      // THE HOST'S OWN COPY GLYPH, not a character stand-in: the two-rect mark
      // below is the exact SVG the code banner renders, copied so this control
      // is visually the same control the read and write cards show.
      copied
        ? h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, h('path', { d: 'M3.5 8.5l3 3 6-6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }))
        : h('svg', {
          width: 12,
          height: 12,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': 'true',
          strokeWidth: 1,
        },
        h('rect', { x: 1.52075, y: 4.07373, width: 10.3932, height: 10.3932, rx: 2, stroke: 'currentColor' }),
        h('path', {
          d: 'M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z',
          fill: 'currentColor',
        })))
      : null,
    h('div', {
      'data-cds-diffrow-head': '',
      role: 'button',
      tabIndex: 0,
      'aria-expanded': expanded,
      onClick: typeof toggle === 'function' ? toggle : undefined,
      onKeyDown: typeof toggle === 'function'
        ? function onKeyDown(event) {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          toggle()
        }
        : undefined,
    },
    h('span', { 'data-cds-diff-chevron': '', 'aria-hidden': 'true' },
      h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', strokeWidth: 1 },
        h('path', { d: 'M6 4l4 4-4 4', stroke: 'currentColor' }))),
    h('span', {
      'data-cds-diffrow-title': '',
      title: displayPath(model.path, props.cwd) === '' ? undefined : displayPath(model.path, props.cwd),
    }, title),
    stats.length > 0 ? h('span', { 'data-cds-diffrow-stats': '' }, stats) : null),
    body.length > 0 ? h('div', { 'data-cds-diffcard': '' }, body) : null)
  }
}