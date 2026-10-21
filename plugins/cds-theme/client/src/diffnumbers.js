/**
 * Real file line numbers for the edit / write diff card.
 *
 * THE PROBLEM. The diff card is the host's `DiffBlock` (primitive, rendered from
 * `dsh-client-ui-tool`'s `diffCardModel`). Its rows are built by `gF(diffs)`
 * from `{ path, oldText, newText }` per hunk — the server drops the `@@` header,
 * so the host never learns where a hunk starts in the file. The theme therefore
 * drew a PURE CSS counter (`counter-reset: cds-diff-line` on the body,
 * `counter-increment` per row), i.e. hunk-relative 1, 2, 3… That is the contrast
 * with the READ card, whose host meta carries `lines: [{ number, text }]` and
 * whose gutter prints the REAL number (`docs/tool-cards-read.md` §4.1): two
 * cards with a number column, one measured, one counted.
 *
 * WHY A DOM MODULE AND NOT PROPS. We do not own `DiffBlock`; a client plugin
 * cannot read its React props. The DOM is the only channel, so this module:
 *
 *   1. finds every diff body inside a tool row —
 *      `[data-slot="tool.call.toolview"] [data-diff] > [class*="_body_"]` —
 *      the same scope the stylesheet paints;
 *   2. reads a start line from attributes on the row or the card, when anything
 *      publishes one;
 *   3. writes back `data-cds-diff-start`, `data-cds-diff-old-start`,
 *      `data-cds-diff-numbered`, and the two counter seeds
 *      (`--cds-diff-reset` / `--cds-diff-old-reset` = start − 1), so the
 *      stylesheet's counters start at the file's line instead of 1.
 *
 * WHAT THE DOM CARRIES TODAY, and why that makes this a no-op. The shipped
 * `DiffBlock` (`web-frontend-index.js`, `yF(…)`) renders exactly two attributes
 * on the card — `data-diff=""` and `data-code-wrap` — and none on the body: the
 * body div is `{ className: Nn.body }` with no attrs, and each row is
 * `{ className: de(Nn.line, F8[kind]) }` with none either. The hunk start never
 * reaches the DOM, so this module finds the bodies, finds no start, and writes
 * NOTHING. The CSS keeps its sequential counter, which is honest hunk-relative
 * numbering rather than a confidently wrong file number. A second agent is
 * adding `oldStart` / `newStart` to the persisted meta; when the host surfaces
 * them the module lights up with no edit here — the attribute names live in one
 * place (`NEW_START_ATTRS` / `OLD_START_ATTRS`) so widening them is one line.
 *
 * TWO COUNTERS, because the reference's unified view shows the NEW line number
 * and falls back to the OLD one on a deleted row (`docs/tool-cards-diff.md`
 * §2.4). One counter cannot express that: a hunk alternates deletions and
 * additions, and a deletion must not advance the new-file numbering. Seed mode
 * therefore advances `cds-diff-line` on context/addition rows, `cds-diff-line-old`
 * on every row, and a deleted row prints the old one.
 *
 * TWO MARKING MODES, because one card can hold several hunks. `gF` emits one
 * `_gap_` row (`⋯`) between consecutive hunks of one file and one `_path_` row
 * between files, so a card with gaps covers discontinuous file regions:
 *   - BODY mode — one contiguous card (a `write`, or a single-hunk `edit`): the
 *     card/body start seeds the counters for the whole body;
 *   - ROW mode — a card with gaps: every segment's first code row must publish
 *     its own start, and each one re-seeds the counters. If any segment's start
 *     is missing the card is left ALONE rather than numbered with a guess —
 *     numbers that skip a region of the file and do not say so are worse than
 *     row numbers that obviously restart at 1.
 *
 * FAILURE MODES, all deliberate:
 *   - never throws — every attribute/style write is guarded, because a host that
 *     re-renders mid-sweep can detach a node between two lines;
 *   - never touches React-owned text or children: attributes plus one inline
 *     custom-property pair, and the host's diff body and rows carry no `style`
 *     prop, so a re-render does not fight it;
 *   - idempotent — same-value `setAttribute` / `setProperty` and an unchanged
 *     `class` write are no-ops, so the observer cannot feed itself;
 *   - reversible — `stop()` removes every mark and both properties;
 *   - scoped — cards outside `[data-slot="tool.call.toolview"]` are ignored (the
 *     deliverables package has its own `data-diff-line` diff component, and it
 *     must not be touched);
 *   - never numbers a row that is not a code row: the `… N more lines` expander
 *     is a `<button>` with only `_expand_`, and the hidden path / `⋯` rows are
 *     excluded by class as well, so the rule does not depend on `display: none`
 *     removing them from the counter.
 */

/** The attribute this plugin owns on the diff body or a segment-start row. */
export const START_ATTR = 'data-cds-diff-start'

/** Old-file counterpart, for the deleted row's number. */
export const OLD_START_ATTR = 'data-cds-diff-old-start'

/** Marks a row this module numbers; the stylesheet's seeded-mode switch. */
export const NUMBERED_ATTR = 'data-cds-diff-numbered'

/** The seeded counter values (`start - 1`: a row increments on top of them). */
export const RESET_VAR = '--cds-diff-reset'
export const OLD_RESET_VAR = '--cds-diff-old-reset'

/** The tool row that hosts the card — the same scope the stylesheet uses. */
export const TOOL_VIEW = '[data-slot="tool.call.toolview"]'

/** The card root the host renders for edit / write (`data-diff=""`). */
export const DIFF_CARD = '[data-diff]'

/**
 * Where a start line may come from, in priority order.
 *
 * `data-diff-new-start` / `data-diff-old-start` are the names the host patch
 * would naturally publish (they mirror the `oldStart` / `newStart` field names
 * the server side is gaining). The shorter aliases are accepted in case the
 * patch renames them, and `data-diff-start` is the single-number fallback for a
 * hunk whose two sides begin on the same line — the common `-N,M +N,K` case.
 *
 * Our OWN attributes are deliberately not in these lists: reading them back
 * would make every sweep its own input.
 */
export const NEW_START_ATTRS = ['data-diff-new-start', 'data-new-start', 'data-diff-start']
export const OLD_START_ATTRS = ['data-diff-old-start', 'data-old-start', 'data-diff-start']

/** Every attribute the observer wakes for, as one frozen list. */
const WATCH_ATTRS = NEW_START_ATTRS.concat(OLD_START_ATTRS)

/**
 * Normalise whatever was read into a usable 1-based line number.
 *
 * 1 is the documented default, not an error sentinel: a missing attribute, a
 * zero, a negative, a float, a hex string or an unparseable value all mean "the
 * card does not know where the hunk starts", and 1 is the honest rendering of
 * that (a hunk that begins at the top of a file). Callers that must distinguish
 * "absent" from "1" look for the attribute themselves — `resolveStart` returns
 * null when neither side is present.
 *
 * @param {unknown} value the raw attribute value or a number
 * @returns {number} a positive safe integer, else 1
 */
export function normalizeStartLine(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : 1
  }
  if (typeof value === 'string') {
    const text = value.trim()
    // Digits only: `12.5`, `0x10`, `+12`, `1e3` and `12px` are not line numbers.
    if (/^\d+$/.test(text) === false) return 1
    const parsed = Number(text)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
  }
  return 1
}

/** Read the first present, non-blank attribute in `names` from one element. */
function readStart(el, names) {
  if (!el || typeof el.getAttribute !== 'function') return undefined
  for (const name of names) {
    const value = el.getAttribute(name)
    if (value === null || value === undefined) continue
    if (String(value).trim() === '') continue
    return value
  }
  return undefined
}

/**
 * Resolve both start lines from one element (a segment-start row, a body, or a
 * card). Returns null when NEITHER side carries a start — that is the signal to
 * write nothing and let the stylesheet count rows, which is today's behaviour
 * on the shipped host.
 *
 * When only one side is published the other mirrors it. That is exact for a
 * hunk whose two sides begin on the same line and a one-offset approximation
 * otherwise; it is never worse than 1.
 *
 * @param {Element|null} el the element to read from
 * @returns {{ newStart: number, oldStart: number }|null}
 */
export function resolveStart(el) {
  const newRaw = readStart(el, NEW_START_ATTRS)
  const oldRaw = readStart(el, OLD_START_ATTRS)
  if (newRaw === undefined && oldRaw === undefined) return null
  return {
    newStart: normalizeStartLine(newRaw === undefined ? oldRaw : newRaw),
    oldStart: normalizeStartLine(oldRaw === undefined ? newRaw : oldRaw),
  }
}

/** The salted-class-tolerant test the stylesheet also uses: `_body_`, `_line_`… */
function hasLocalClass(el, local) {
  if (!el || typeof el.getAttribute !== 'function') return false
  const value = el.getAttribute('class')
  if (typeof value !== 'string') return false
  return value.split(/\s+/).some(function (name) { return name.indexOf(local) >= 0 })
}

/**
 * A row that carries CODE. Every row the host draws is
 * `de(Nn.line, F8[kind])`, so all five kinds carry `_line_`; `_path_` (hidden)
 * and `_gap_` (`⋯`) are separators, and the expander is a `<button>` with only
 * `_expand_`. Numbering a separator would shift every row after it.
 */
export function isCodeRow(el) {
  if (!hasLocalClass(el, '_line_')) return false
  if (hasLocalClass(el, '_path_') || hasLocalClass(el, '_gap_')) return false
  return true
}

/** A separator row: the hidden path, or the `⋯` between hunks. */
function isSeparatorRow(el) {
  return hasLocalClass(el, '_path_') || hasLocalClass(el, '_gap_')
}

/** Is this card inside a tool row? The stylesheet's own scope. */
function insideToolView(card) {
  if (!card) return false
  if (typeof card.closest === 'function') return card.closest(TOOL_VIEW) !== null
  let node = card.parentElement
  while (node) {
    if (typeof node.matches === 'function' && node.matches(TOOL_VIEW)) return true
    node = node.parentElement
  }
  return false
}

/** The body element of one card: a direct `_body_` child, else the first inside. */
function bodyOf(card) {
  const children = card && card.children ? card.children : []
  for (let i = 0; i < children.length; i += 1) {
    if (hasLocalClass(children[i], '_body_')) return children[i]
  }
  if (card && typeof card.querySelector === 'function') {
    const nested = card.querySelector('[class*="_body_"]')
    if (nested && nested !== card) return nested
  }
  return null
}

/**
 * Every diff body this plugin may number, in document order.
 *
 * Takes anything with `querySelectorAll`, so the sweep is testable without a
 * DOM. Cards outside a tool row are skipped on purpose (see the module header).
 */
export function findDiffBodies(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  const out = []
  for (const card of Array.prototype.slice.call(root.querySelectorAll(DIFF_CARD))) {
    if (!insideToolView(card)) continue
    const body = bodyOf(card)
    if (body === null || out.indexOf(body) >= 0) continue
    out.push(body)
  }
  return out
}

/**
 * Split a body's rows into contiguous segments.
 *
 * A segment starts at the first code row and again after every separator (the
 * `⋯` between hunks of one file, the path row between files). Each segment is a
 * run of file lines the counter can number without a break.
 *
 * @returns {{ rows: Element[], startRow: Element|null }[]}
 */
export function segmentsOf(body) {
  const children = body && body.children ? Array.prototype.slice.call(body.children) : []
  const segments = []
  let current = null
  let pendingBoundary = true
  for (const child of children) {
    if (isSeparatorRow(child)) {
      pendingBoundary = true
      continue
    }
    if (!isCodeRow(child)) continue
    if (pendingBoundary) {
      current = { rows: [], startRow: child }
      segments.push(current)
      pendingBoundary = false
    }
    current.rows.push(child)
  }
  return segments
}

/** Write the seeded counters onto a body or a segment-start row. */
function seed(el, start) {
  try {
    el.setAttribute(START_ATTR, String(start.newStart))
    el.setAttribute(OLD_START_ATTR, String(start.oldStart))
    const style = el.style
    if (style && typeof style.setProperty === 'function') {
      style.setProperty(RESET_VAR, String(start.newStart - 1))
      style.setProperty(OLD_RESET_VAR, String(start.oldStart - 1))
    }
  } catch (error) {
    // A node that refuses writes keeps the stylesheet's sequential numbering.
  }
}

/** Drop the seed from one element. */
function unseed(el) {
  try {
    if (typeof el.removeAttribute === 'function') {
      el.removeAttribute(START_ATTR)
      el.removeAttribute(OLD_START_ATTR)
    }
    const style = el.style
    if (style && typeof style.removeProperty === 'function') {
      style.removeProperty(RESET_VAR)
      style.removeProperty(OLD_RESET_VAR)
    }
  } catch (error) {
    // Detached or exotic node: nothing left to clear.
  }
}

/** Mark one row as numbered (idempotent). */
function markRow(row) {
  try {
    if (typeof row.setAttribute === 'function' && row.hasAttribute
      && row.hasAttribute(NUMBERED_ATTR) === false) {
      row.setAttribute(NUMBERED_ATTR, '')
    }
  } catch (error) {
    // Ignored: the row simply keeps the sequential number.
  }
}

/**
 * Number one body. Returns a short outcome string, which is what the tests and
 * any future debugging log read.
 *
 * @returns {'body'|'rows'|'none'}
 */
export function numberBody(body) {
  const card = body && body.parentElement ? body.parentElement : null

  // Everything this module might have written, cleared first: the pass is a
  // recompute, and a card that lost its hunk metadata must lose the numbers too.
  for (const el of seededIn(body)) unseed(el)

  const segments = segmentsOf(body)
  if (segments.length === 0) return 'none'

  // ROW MODE — a card with separators can only be exact when every segment
  // declares its own start. Any missing start means the numbers would silently
  // skip a region of the file, so the whole card is left alone.
  if (segments.length > 1) {
    const starts = segments.map(function (segment) { return resolveStart(segment.startRow) })
    if (starts.some(function (start) { return start === null })) return 'none'
    for (let i = 0; i < segments.length; i += 1) {
      seed(segments[i].startRow, starts[i])
      for (const row of segments[i].rows) markRow(row)
    }
    return 'rows'
  }

  // BODY MODE — one contiguous card. The row's own start wins over the card's,
  // because the host is likelier to publish it next to the code it describes.
  const start = resolveStart(segments[0].startRow)
    || resolveStart(body)
    || (card !== null ? resolveStart(card) : null)
  if (start === null) return 'none'
  seed(body, start)
  for (const row of segments[0].rows) markRow(row)
  return 'body'
}

/** Seed-bearing elements under (and including) one body. */
function seededIn(body) {
  if (!body) return []
  const out = []
  try {
    if (typeof body.hasAttribute === 'function' && body.hasAttribute(START_ATTR)) out.push(body)
    if (typeof body.querySelectorAll === 'function') {
      for (const el of Array.prototype.slice.call(body.querySelectorAll('[' + START_ATTR + ']'))) {
        out.push(el)
      }
      for (const el of Array.prototype.slice.call(body.querySelectorAll('[' + NUMBERED_ATTR + ']'))) {
        if (typeof el.removeAttribute === 'function') el.removeAttribute(NUMBERED_ATTR)
      }
    }
  } catch (error) {
    return out
  }
  return out
}

/** `querySelectorAll` for the elements this module has numbered. */
function markedIn(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  return Array.prototype.slice.call(root.querySelectorAll('[' + NUMBERED_ATTR + '], [' + START_ATTR + ']'))
}

/**
 * One numbering pass: number every body that knows its start, clear everything
 * else. Idempotent — a second pass writes the same values and mutates nothing.
 *
 * @returns {Element[]} the bodies visited in this pass
 */
export function sweepDiffNumbers(root) {
  const bodies = findDiffBodies(root)
  for (const el of markedIn(root)) {
    const owner = typeof el.closest === 'function' ? el.closest(DIFF_CARD) : null
    const body = owner === null ? null : bodyOf(owner)
    if (body !== null && bodies.indexOf(body) >= 0) continue
    unseed(el)
    try {
      if (typeof el.removeAttribute === 'function') el.removeAttribute(NUMBERED_ATTR)
    } catch (error) {
      // Nothing left to clear.
    }
  }
  for (const body of bodies) numberBody(body)
  return bodies
}

/** True when a node can bring a diff card into the tree. */
function containsDiff(node) {
  if (!node || typeof node !== 'object') return false
  if (node.nodeType === 3 || node.nodeType === 8) return false
  for (const selector of [TOOL_VIEW, DIFF_CARD]) {
    if (typeof node.matches === 'function' && node.matches(selector)) return true
  }
  if (typeof node.querySelector === 'function') {
    for (const selector of [TOOL_VIEW, DIFF_CARD]) {
      if (node.querySelector(selector) !== null) return true
    }
  }
  return false
}

/**
 * Own the numbering for one plugin lifetime.
 *
 * `Observer` is injectable so the sweep is testable without a DOM; in the
 * browser it defaults to the real MutationObserver. It watches `document.body`
 * because a tool row is created, expanded and torn down by React — an observer
 * attached to the slots would miss the row that does not exist yet — but the
 * SWEEP only ever visits `[data-slot="tool.call.toolview"] [data-diff]` bodies,
 * and the record filter ignores everything that cannot change the answer:
 * text-node churn from streaming, and rows appearing inside a card whose start
 * is already known are both free to skip… except that a card's rows can arrive
 * before its metadata, so an added element that can hold a card still wakes the
 * sweep, while a text node never does.
 *
 * Attribute records are filtered to the start attributes (`attributeFilter`), so
 * our own writes — `data-cds-diff-start`, `data-cds-diff-numbered`, the inline
 * custom properties — never wake it. Sweeps coalesce onto one animation frame.
 */
export function createDiffNumberMarker(doc, Observer) {
  const ObserverImpl = Observer === undefined
    ? (typeof MutationObserver === 'function' ? MutationObserver : null)
    : Observer
  const view = doc && doc.defaultView ? doc.defaultView : null
  let observer = null
  let started = false
  let scheduled = false

  function sweep() {
    if (!started) return
    sweepDiffNumbers(doc)
  }

  function schedule() {
    if (!started || scheduled) return
    scheduled = true
    const run = function () {
      scheduled = false
      sweep()
    }
    if (view && typeof view.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(run)
    } else {
      setTimeout(run, 0)
    }
  }

  function onMutations(records) {
    if (!started) return
    // A callback with no records (a hand-built host, a test double) still
    // sweeps: degradation over silence.
    if (!records) {
      schedule()
      return
    }
    for (const record of records) {
      // Only the start attributes are observed, so any attribute record is
      // exactly the case worth re-reading.
      if (record && record.type === 'attributes') {
        schedule()
        return
      }
      const added = record && record.addedNodes ? record.addedNodes : []
      for (const node of added) {
        if (containsDiff(node)) {
          schedule()
          return
        }
      }
    }
  }

  return {
    start() {
      if (started || !doc) return
      started = true
      sweep()
      if (ObserverImpl && doc.body && typeof ObserverImpl === 'function') {
        observer = new ObserverImpl(onMutations)
        observer.observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: WATCH_ATTRS,
        })
      }
    },
    stop() {
      if (!started) return
      started = false
      scheduled = false
      if (observer) {
        observer.disconnect()
        observer = null
      }
      for (const el of markedIn(doc)) {
        unseed(el)
        try {
          if (typeof el.removeAttribute === 'function') el.removeAttribute(NUMBERED_ATTR)
        } catch (error) {
          // Detached node.
        }
      }
    },
    sweep,
    get started() { return started },
  }
}
