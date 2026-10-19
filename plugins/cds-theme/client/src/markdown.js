/**
 * The markdown body's table hook.
 *
 * WHY THIS FILE EXISTS. The chat markdown renderer draws every table inside a
 * scroll wrapper whose class (`_tableScroll_1ypvv_192`) is a salted CSS-Modules
 * name — forbidden as a selector, and it changes between host builds. The
 * literal classes are conditional, not a landing pad: `md-table-wide` only
 * appears on tables with four or more columns (and the wide variant's CSS also
 * re-sizes the wrapper), while the `md-table-fill` class name has NO rule in
 * the shipped stylesheet at all. The markdown root itself is salted
 * (`_markdown_1ypvv_5`). So there is no stable selector for "the table's
 * wrapper". The legal path is the one hero.js already takes for the greeting:
 * FIND the table from the stable `[data-chat-flow]` hook, MARK its wrapper with
 * this theme's own `data-cds-table` attribute, and let the plugin stylesheet
 * paint `[data-cds-table]`.
 *
 * THE STRUCTURE (web-frontend-index.js, the table view):
 *
 *   div[data-chat-flow]                         (the message flow column)
 *   └ div …                                     (row / markdown body)
 *      └ div.<hashed markdown root>             (full variant; the compact
 *         │                                       variant also carries
 *         │                                       data-markdown-variant)
 *         └ div.<hashed tableScroll>[.md-table-wide]   ← THIS is marked
 *            └ table > thead/tbody > th/td
 *
 *   The wrapper is emitted as
 *     jsx("div", { className: tableScroll + (wide ? "md-table-wide" : tableFill),
 *                  tabIndex: wide ? 0 : undefined, children: jsx("table", …) })
 *   so its signature is "the table's parent holds exactly one element child —
 *   the table itself". The host publishes no attribute on it, which is why the
 *   theme writes one.
 *
 * FAILURE MODES. The mark is a pure attribute write:
 *   - idempotent — a wrapper that already carries the mark gets no write;
 *   - reversible — `stop()` removes every mark it could still find;
 *   - graceful — a table whose parent is not a dedicated one-child wrapper (a
 *     future host that renders the table straight into the markdown root) is
 *     left alone: framing the whole message would be worse than the host's own
 *     table look. Tables outside `[data-chat-flow]` (artifact previews,
 *     settings copy, plugin READMEs) are never marked — this item is the chat
 *     markdown body only.
 *
 * A MutationObserver re-runs the sweep because React creates the table subtree
 * on demand as a response streams. The observer is cheaper than hero.js's:
 * streaming rewrites text and attribute state constantly, so only ADDED
 * element nodes that can contain a table schedule a sweep, and sweeps are
 * coalesced onto one animation frame. A callback without records (a hand-built
 * host, a test double) still sweeps.
 */

/** The attribute this plugin owns. Never target the host's classes. */
export const TABLE_ATTR = 'data-cds-table'

/**
 * The stable chat-flow hook (`docs/host-hooks.md` §4.2: the flow column is
 * `div[data-chat-flow]`, published on purpose). The wrapper class is salted;
 * this attribute is not.
 */
export const FLOW_ANCHOR = '[data-chat-flow]'

/** `querySelectorAll` for the marks currently in the tree. */
function markedIn(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  return Array.prototype.slice.call(root.querySelectorAll('[' + TABLE_ATTR + ']'))
}

/**
 * The wrapper signature. The host's table view renders the table as the ONLY
 * element child of its scroll wrapper, so a parent with one child that is the
 * table is a wrapper this theme understands. A parent with siblings is the
 * markdown root (or some other layout) — reframing that would be a whole-
 * message border, so it is deliberately not marked.
 */
export function isTableWrapper(parent, table) {
  if (!parent || typeof parent !== 'object') return false
  const children = parent.children
  if (!children || typeof children.length !== 'number') return false
  return children.length === 1 && children[0] === table
}

/**
 * Locate every table wrapper inside a chat flow column. Takes anything with
 * `querySelectorAll`, so it is testable without a DOM.
 */
export function findTableWrappers(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  const out = []
  const flows = Array.prototype.slice.call(root.querySelectorAll(FLOW_ANCHOR))
  for (const flow of flows) {
    if (!flow || typeof flow.querySelectorAll !== 'function') continue
    const tables = Array.prototype.slice.call(flow.querySelectorAll('table'))
    for (const table of tables) {
      const wrapper = table.parentElement
      if (!wrapper || wrapper === flow) continue
      if (!isTableWrapper(wrapper, table)) continue
      if (out.indexOf(wrapper) < 0) out.push(wrapper)
    }
  }
  return out
}

/**
 * One marking pass: mark every current wrapper, drop marks anywhere else.
 * Returns the wrappers that are marked after the pass — the whole operation is
 * idempotent.
 */
export function sweepMarkdownTables(root) {
  const wrappers = findTableWrappers(root)
  for (const el of markedIn(root)) {
    if (wrappers.indexOf(el) < 0 && typeof el.removeAttribute === 'function') {
      el.removeAttribute(TABLE_ATTR)
    }
  }
  for (const el of wrappers) {
    if (typeof el.setAttribute !== 'function') continue
    if (typeof el.hasAttribute !== 'function' || !el.hasAttribute(TABLE_ATTR)) {
      el.setAttribute(TABLE_ATTR, '')
    }
  }
  return wrappers
}

/**
 * True when an added node can bring a table into the tree. Text nodes (and
 * mutation records without nodes) cannot; React appends element subtrees, so
 * one `querySelector('table')` on the added node is the cheap pre-filter.
 */
function containsTable(node) {
  if (!node || typeof node !== 'object') return false
  if (node.nodeType === 3) return false
  if (typeof node.tagName === 'string' && node.tagName.toUpperCase() === 'TABLE') return true
  if (typeof node.querySelector === 'function') {
    return node.querySelector('table') !== null
  }
  return false
}

/**
 * Own the mark for one plugin lifetime.
 *
 * `Observer` is injectable so the sweep logic is testable without a DOM; in
 * the browser it defaults to the real MutationObserver and re-sweeps on child-
 * list additions under `document.body`. `requestAnimationFrame` is read from
 * `doc.defaultView`, with a `setTimeout(0)` fallback for non-window documents.
 */
export function createTableMarker(doc, Observer) {
  const ObserverImpl = Observer === undefined
    ? (typeof MutationObserver === 'function' ? MutationObserver : null)
    : Observer
  const view = doc && doc.defaultView ? doc.defaultView : null
  let observer = null
  let started = false
  let scheduled = false

  function sweep() {
    if (!started) return
    sweepMarkdownTables(doc)
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

  /**
   * Only an addition that can contain a table justifies a sweep. Streamed
   * tokens add text and re-set attributes, and neither can create a table.
   */
  function onMutations(records) {
    if (!started) return
    if (!records) {
      schedule()
      return
    }
    for (const record of records) {
      const added = record && record.addedNodes ? record.addedNodes : []
      for (const node of added) {
        if (containsTable(node)) {
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
        observer.observe(doc.body, { childList: true, subtree: true })
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
        if (typeof el.removeAttribute === 'function') el.removeAttribute(TABLE_ATTR)
      }
    },
    sweep,
    get started() { return started },
  }
}
