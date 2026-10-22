/**
 * The DOM bridge: find the host's effort row, mount the slider into it, and undo
 * everything on the way out.
 *
 * WHAT THE HOST ACTUALLY RENDERS (verified against the installed app.asar, not
 * against the upstream plugin's assumptions):
 *
 *   seat    <button aria-haspopup="menu" aria-expanded aria-controls={`${id}-menu`}>
 *             span.triggerLabel  model name
 *             span.triggerEffort level name          <- we tint this one
 *   menu    <... role={pane === 'model' ? 'group' : 'menu'} id={`${id}-menu`}>
 *             <button role="menuitem"> 模型 <span>value</span> <svg/> </button>
 *             <button role="menuitem"> 推理等级 <span>value</span> <svg/> </button>   <- target
 *           Sub-panes (model list / effort list) use role="menuitemradio", so
 *           `button[role="menuitem"]` is exactly the two root rows.
 *
 *   Source: `dsh-client-ui-model-selection/lib/client.js:1496-1570`.
 *
 * THREE DISCIPLINES
 *   1. TOUCH ONE ROW ONLY: four inline styles (height / flex-wrap / padding-block)
 *      plus one appended container. Everything is restored individually.
 *   2. FAIL OPEN: any step that does not resolve does NOTHING. The host menu keeps
 *      working; it is never worth a working menu for a slider.
 *   3. NEVER INJECT INTO AN UNRELATED MENU. See {@link findEffortRow}.
 */

import { EFFORT_ROW_LABELS, MODEL_ROW_LABELS, ROW_PADDING_BLOCK } from './constants.js'

/** Text of the row's first non-empty span (the label cell). */
export function firstSpanText(row) {
  try {
    const spans = row.querySelectorAll('span')
    for (const span of spans) {
      const text = span.textContent
      if (typeof text === 'string' && text.length > 0) return text
    }
  } catch (error) {
    /* unreadable: the caller falls back to the structural check */
  }
  return ''
}

/** Normalise a label for comparison (the host may pad with whitespace). */
export function flattenLabel(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, '') : ''
}

/** Is this text one of the known labels? */
export function isLabel(text, labels) {
  const flat = flattenLabel(text)
  if (flat.length === 0) return false
  return labels.some(function (label) { return flattenLabel(label) === flat })
}

/**
 * The host row's value span ("Max" / "High").
 *
 * `.cellValue` is a hashed-class sibling in the real DOM (`wq12jW_cellValue`); the
 * substring match is a convenience, NOT the contract — when it fails the structural
 * fallback takes the last span with non-empty text, which is where the value sits
 * (label, then value, then the chevron `<svg>`). Only the COLOUR is ever written;
 * not one character of the text is touched.
 */
export function findValueElement(row) {
  if (!row || typeof row.querySelectorAll !== 'function') return null
  try {
    const byClass = row.querySelectorAll('span[class*="cellValue"]')
    if (byClass.length > 0) return byClass[byClass.length - 1]
    const spans = row.querySelectorAll('span')
    let found = null
    for (const span of spans) {
      const text = span.textContent
      if (typeof text === 'string' && text.replace(/\s+/g, '').length > 0) found = span
    }
    return found
  } catch (error) {
    return null
  }
}

/**
 * The level name inside OUR composer's collapsed model seat.
 *
 * The host renders it with a hashed class (`wq12jW_triggerEffort`), so it is
 * identified by TEXT: the seat shows a level `name`, and those names are the same
 * data we read from the directory.
 *
 * All known names are passed, not just the current one: right after a switch the
 * host has not re-rendered the seat yet, so the text is still the PREVIOUS level
 * name — matching only the current one would drop the tint for a frame and it would
 * visibly flicker. No known name → null, and nothing is touched.
 *
 * @param {Document} doc
 * @param {Element} composer
 * @param {string[]} expectedLabels every level name we know
 */
export function findSeatEffort(doc, composer, expectedLabels) {
  if (!doc || !composer || typeof doc.querySelectorAll !== 'function') return null
  const list = typeof expectedLabels === 'string' ? [expectedLabels] : expectedLabels
  if (Object.prototype.toString.call(list) !== '[object Array]') return null
  const wanted = []
  for (const candidate of list) {
    const name = flattenLabel(candidate)
    if (name.length > 0 && wanted.indexOf(name) < 0) wanted.push(name)
  }
  if (wanted.length === 0) return null
  try {
    const seats = doc.querySelectorAll('button[aria-haspopup="menu"]')
    for (const seat of seats) {
      if (!composer.contains(seat)) continue
      for (const span of seat.querySelectorAll('span')) {
        const text = span.textContent
        if (typeof text === 'string' && wanted.indexOf(flattenLabel(text)) >= 0) return span
      }
    }
  } catch (error) {
    return null
  }
  return null
}

/**
 * The open model seat inside `composer`, or null.
 *
 * Scoped to our own composer on purpose: the containment test would reject an outside
 * seat anyway, so querying the whole document first is pure cost on a path the mutation
 * observer can reach.
 */
function openSeatOf(composer) {
  if (!composer || typeof composer.querySelectorAll !== 'function') return null
  try {
    const seats = composer.querySelectorAll('button[aria-haspopup="menu"][aria-expanded="true"]')
    return seats.length > 0 ? seats[0] : null
  } catch (error) {
    return null
  }
}

/**
 * Find the effort row of the menu opened by OUR composer's model seat.
 *
 * WHY THE SEMANTIC CHECK EXISTS (this is a deliberate hardening over the upstream
 * shape). Upstream located the menu by "the open seat inside my composer" and then
 * accepted `items[1]` whenever the count was two. That is not enough:
 *
 *   · any OTHER dropdown anchored in the composer that also renders two menuitems
 *     would be mistaken for the model panel — a permission menu, a plan menu, an
 *     attachment menu. Injecting a reasoning slider into one of those is worse than
 *     showing nothing;
 *   · the effort row only exists when the current model advertises reasoning at all
 *     (the host renders that second row conditionally, `:1557`), so a model without
 *     reasoning metadata MUST produce no slider rather than a decorative one.
 *
 * So the identification is anchored on the MODEL row label: a panel whose first
 * menuitem says 模型/Model is the model root panel, and only then is the second row
 * treated as the effort row. If the labels are unreadable (locale changed, DOM
 * reshaped) this returns null and the host menu stays exactly as it was — that is
 * the intended failure mode, not a missed opportunity.
 *
 * @param {Document} doc
 * @param {Element} composer our own composer card
 * @returns {Element | null}
 */
export function findEffortRow(doc, composer) {
  if (!doc || !composer || typeof composer.querySelectorAll !== 'function') return null
  const seat = openSeatOf(composer)
  if (seat === null) return null

  const menuId = typeof seat.getAttribute === 'function' ? seat.getAttribute('aria-controls') : null
  if (!menuId) return null
  const menu = typeof doc.getElementById === 'function' ? doc.getElementById(menuId) : null
  if (!menu) return null

  const items = menu.querySelectorAll('button[role="menuitem"]')
  // The root panel has exactly two rows. Sub-panes use menuitemradio, so anything
  // else here is not the shape we know how to decorate.
  if (items.length !== 2) return null

  const first = flattenLabel(firstSpanText(items[0]))
  const second = flattenLabel(firstSpanText(items[1]))
  const secondIsEffort = isLabel(second, EFFORT_ROW_LABELS)
  // THE ANCHOR: the first row must prove this panel is the model root panel. A
  // readable effort label alone is not enough — some other menu could use the same
  // word — but model-then-effort is the host's own fixed pair.
  const firstIsModel = isLabel(first, MODEL_ROW_LABELS)
  if (!firstIsModel) return null
  // With the model row proven, an unreadable effort label is still acceptable (the
  // locale may have changed only on that string); a DIFFERENT readable label is not.
  if (!secondIsEffort && second.length > 0) return null
  return items[1]
}

/**
 * Watch the document and mount the slider container into the host's effort row.
 *
 * @param {object} options
 * @param {Document} options.doc host document
 * @param {Window} options.win host window (a `resize` is dispatched so the host re-measures its menu)
 * @param {() => Element | null} options.anchor our invisible slot node (which composer is ours)
 * @param {() => boolean} options.active is decorating worthwhile right now
 * @param {(host: object | null) => void} options.onChange called whenever the mount changes
 * @param {() => string[]} options.seatLabels every level name we know
 */
export function createMenuBridge(options) {
  const doc = options.doc
  const win = options.win
  const anchor = options.anchor
  const active = options.active
  const onChange = options.onChange
  const seatLabels = options.seatLabels
  if (!doc || typeof doc.createElement !== 'function') return null

  let current = null
  let seat = null
  let seatColor = ''
  let observer = null
  let timer = null
  let disposed = false
  /** Handle of the single coalesced scan frame (see {@link scheduleScan}). */
  let scanFrame = null
  /**
   * This bridge's own identity, tagged on the row as `row.__cesOwner`.
   *
   * WHY not a module-level "am I the owner" flag (the upstream shape). That guard
   * existed because the upstream bundle could be evaluated twice; here the id is
   * pinned by the build and by `test/manifest.test.mjs`, so a double evaluation
   * cannot happen. What CAN happen is two component instances (two composers, or a
   * React remount racing the old one) both resolving the same row — and the honest
   * place to arbitrate that is the row itself: whoever set `__cesOwner` owns it, and
   * detaching deletes the marker so a later instance can take over. The upstream
   * global lock also had to branch around hook calls, which violates the rules of
   * hooks; this has no such problem.
   */
  const ownerToken = {}

  /** Our own composer card: walk up from the anchor to the host's stable attribute. */
  function composerOf() {
    const node = anchor()
    if (!node) return null
    let el = node
    while (el && el.nodeType === 1) {
      if (typeof el.getAttribute === 'function' && el.getAttribute('data-composer-card') !== null) return el
      el = el.parentNode
    }
    return null
  }

  /** Remove our node and restore every inline style we wrote. */
  function detach() {
    if (current === null) return
    const { row, container, previous } = current
    try {
      if (container && container.parentNode) container.parentNode.removeChild(container)
    } catch (error) {
      /* the host may have removed the row already */
    }
    try {
      if (row && row.style) {
        // `''` is "no inline value", which is what an absent inline property reads
        // as. Writing the literal "undefined" would be an invalid value and leave
        // our extra height behind.
        row.style.height = previous.height
        row.style.flexWrap = previous.flexWrap
        row.style.paddingTop = previous.paddingTop
        row.style.paddingBottom = previous.paddingBottom
        row.style.boxShadow = previous.boxShadow
      }
      if (current.value && current.value.style) current.value.style.color = previous.valueColor
      if (row && row.__cesOwner === ownerToken) delete row.__cesOwner
    } catch (error) {
      /* a failed restore still leaves the host menu itself intact */
    }
    current = null
    onChange(null)
  }

  /** Restore the collapsed seat's text colour. */
  function releaseSeat() {
    if (seat === null) return
    try {
      if (seat.el && seat.el.style) seat.el.style.color = seat.previousColor
    } catch (error) {
      /* element already unmounted */
    }
    seat = null
  }

  /**
   * Keep the collapsed seat's level text tinted.
   *
   * A re-grab only happens when the ELEMENT changed (the host re-rendered a new
   * node) or was never found. The text changing does not change the element, so
   * switching levels cannot cause a "restore then recolour" flash.
   *
   * TWO WAYS THE HELD ELEMENT GOES STALE, and `parentNode !== null` catches neither:
   *   · the host replaces the WHOLE model-label block (the seat's parent container):
   *     the old span keeps a parent — the detached block — so a parent-based check
   *     says "still attached" and the NEW collapsed level label never gets its
   *     colour. The tint silently stops following the level after the first such
   *     re-render;
   *   · the host re-renders a different composer's seat.
   * So the test is `isConnected` (in the document) AND still inside THIS composer.
   * When either fails the old tint is restored on the way out and the seat is
   * re-resolved from scratch.
   */
  function syncSeat(composer) {
    const target = composer === undefined ? composerOf() : composer
    if (target === null || active() !== true) { releaseSeat(); return }
    if (seat !== null && seat.el) {
      const stillOurs = isConnected(seat.el) && ((typeof target.contains === 'function' && target.contains(seat.el))
        || seat.el === target)
      if (stillOurs) {
        // the host may have cleared our inline colour on a re-render; put it back
        if (seatColor && seat.el.style) seat.el.style.color = seatColor
        return
      }
    }
    releaseSeat()
    const wanted = typeof seatLabels === 'function' ? seatLabels() : null
    const el = findSeatEffort(doc, target, wanted)
    if (el === null || !el.style) return
    seat = { el, previousColor: el.style.color || '' }
    if (seatColor) el.style.color = seatColor
  }

  /**
   * Cheap gate for the mutation callback — NO TREE QUERY ALLOWED HERE.
   *
   * Why this is not just `scan()`: the callback fires on every childList change under
   * `body`, and `scan()` resolves our composer and queries it. During a streaming reply
   * the host inserts nodes many times per token, so a naive callback becomes a
   * synchronous query storm on the main thread while the answer is being written.
   *
   * This inspects ONLY the records the observer handed us — no traversal, no selector
   * engine — and answers one question: could this batch have changed what we care
   * about? Three signals are enough:
   *   · one of the removals is the row we decorate → we must restore;
   *   · a node was added with `role="menu"` (the host's panel root) → maybe a menu;
   *   · a node was added that contains a `aria-haspopup` button → maybe a new composer.
   * Everything else (text nodes, message bubbles, token-level spans) is ignored.
   *
   * When the signal is ambiguous the caller still pays at most ONE scan per frame, via
   * {@link scheduleScan}.
   */
  function batchMatters(records) {
    if (disposed) return false
    if (!records || records.length === 0) return false
    for (const record of records) {
      if (!record || record.type !== 'childList') continue
      const added = record.addedNodes || []
      const removed = record.removedNodes || []
      for (const node of removed) {
        if (current !== null && node === current.row) return true
        if (current !== null && node === current.container) return true
      }
      for (const node of added) {
        if (!node || node.nodeType !== 1) continue
        const role = typeof node.getAttribute === 'function' ? node.getAttribute('role') : null
        if (role === 'menu' || role === 'group') return true
        const popup = typeof node.getAttribute === 'function' ? node.getAttribute('aria-haspopup') : null
        if (popup !== null) return true
      }
    }
    return false
  }

  /**
   * Run at most ONE scan per animation frame.
   *
   * `requestAnimationFrame` where available (the host always has it), with a
   * `setTimeout(0)` fallback for a test double. The handle is kept so `dispose()` can
   * cancel it: a pending frame that ran after disposal would scan a DOM we had already
   * restored, and would keep a dead component's closure alive.
   */
  function scheduleScan() {
    if (scanFrame !== null || disposed) return
    const run = function () {
      scanFrame = null
      if (disposed) return
      scan()
    }
    if (win && typeof win.requestAnimationFrame === 'function') {
      scanFrame = { kind: 'raf', id: win.requestAnimationFrame(run) }
      return
    }
    scanFrame = { kind: 'timeout', id: setTimeout(run, 0) }
  }

  function cancelScheduledScan() {
    if (scanFrame === null) return
    const handle = scanFrame
    scanFrame = null
    try {
      if (handle.kind === 'raf') {
        if (win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(handle.id)
      } else {
        clearTimeout(handle.id)
      }
    } catch (error) {
      /* ignore */
    }
  }

  /**
   * Is this node actually IN the document?
   *
   * `node.parentNode !== null` CANNOT answer this, and the difference is a real bug:
   * when the host removes a whole menu block, our row keeps a parent (the detached menu)
   * while the menu itself is no longer in the document. A parent-based check then reports
   * "still attached" forever, so the bridge keeps the old host and never mounts into the
   * NEW menu — the slider silently stops appearing after the first menu teardown.
   *
   * `Element.isConnected` is the platform's own answer to exactly this question. The
   * fallback exists for test doubles that do not implement it: there, containment in
   * `documentElement` is the equivalent test.
   */
  function isConnected(node) {
    if (!node) return false
    if (typeof node.isConnected === 'boolean') return node.isConnected
    return !!(doc.documentElement && doc.documentElement.contains(node))
  }

  /** One pass: keep the seat in sync, then mount or unmount the row decoration. */
  function scan() {
    if (disposed) return
    const composer = composerOf()
    // The seat and the menu row are independent: a failure in one must not cost the other.
    try { syncSeat(composer) } catch (error) { /* ignore */ }
    try {
      if (composer === null || active() !== true) { detach(); return }
      // Already mounted: nothing to do UNLESS the menu that hosted us has gone. Two
      // signals, both cheap attribute/property reads rather than queries:
      //   · the row is no longer connected (the host tore the menu down), or
      //   · the seat says the menu is closed.
      if (current !== null && current.row && isConnected(current.row)) {
        const expanded = current.seat && typeof current.seat.getAttribute === 'function'
          ? current.seat.getAttribute('aria-expanded')
          : null
        if (expanded !== 'false') return
        detach()
        return
      }

      const row = findEffortRow(doc, composer)
      if (row === null) { detach(); return }
      // Someone else is already decorating this row: leave it alone rather than
      // fighting over the same inline styles (two live composers, or a remount
      // whose predecessor has not been disposed yet).
      if (row.__cesOwner !== undefined && row.__cesOwner !== ownerToken) { detach(); return }
      detach()

      const value = findValueElement(row)
      const previous = {
        height: row.style.height || '',
        flexWrap: row.style.flexWrap || '',
        paddingTop: row.style.paddingTop || '',
        paddingBottom: row.style.paddingBottom || '',
        boxShadow: row.style.boxShadow || '',
        valueColor: value && value.style ? value.style.color || '' : '',
      }
      // Grow the row and let it wrap, so the slider drops onto a second line that
      // spans the full width. Nothing else about the row changes.
      row.style.height = 'auto'
      row.style.flexWrap = 'wrap'
      row.style.paddingTop = ROW_PADDING_BLOCK
      row.style.paddingBottom = ROW_PADDING_BLOCK

      const container = doc.createElement('div')
      container.className = 'ces-inline'
      container.setAttribute('data-ces-part', 'host')
      row.appendChild(container)

      current = { row, container, value, previous, seat: openSeatOf(composer) }
      row.__cesOwner = ownerToken
      onChange(current)

      // The host's menu is measured then fixed-positioned. Growing the row would
      // leave it clipped, so ask it to re-measure. (`resize` is the host's own
      // re-measure trigger; it re-clamps to the viewport itself.)
      try {
        win.dispatchEvent(new win.Event('resize'))
      } catch (error) {
        /* no Event constructor: the host also re-measures on state changes */
      }
    } catch (error) {
      try { detach() } catch (inner) { /* swallow */ }
    }
  }

  function start() {
    scan()
    const ObserverImpl = win && (win.MutationObserver || (typeof MutationObserver === 'function' ? MutationObserver : null))
    if (typeof ObserverImpl === 'function') {
      try {
        // The callback FILTERS FIRST and only coalesces a scan when the batch could
        // possibly matter. See batchMatters() for why this is not just scan().
        observer = new ObserverImpl(function (records) {
          if (!batchMatters(records)) return
          scheduleScan()
        })
        observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true })
        return
      } catch (error) {
        observer = null
      }
    }
    // Without a MutationObserver, degrade to a cheap low-frequency poll. The poll is
    // also coalesced through the same schedule, so the two paths cannot double-scan.
    if (win && typeof win.setInterval === 'function') timer = win.setInterval(scheduleScan, 400)
  }

  return {
    scan,
    start,
    /** The component hands us the colour to use; applied immediately when possible. */
    setSeatColor(color) {
      seatColor = typeof color === 'string' ? color : ''
      if (seat !== null && seat.el && seat.el.style) {
        try { seat.el.style.color = seatColor } catch (error) { /* ignore */ }
      }
    },
    dispose() {
      disposed = true
      cancelScheduledScan()
      if (observer !== null) {
        try { observer.disconnect() } catch (error) { /* ignore */ }
        observer = null
      }
      if (timer !== null) {
        try { win.clearInterval(timer) } catch (error) { /* ignore */ }
        timer = null
      }
      releaseSeat()
      detach()
    },
    /** Test seam: run a mutation batch through the cheap gate + coalescing. */
    notify(records) {
      if (!batchMatters(records)) return false
      scheduleScan()
      return true
    },
    /** Test seam: has a coalesced scan not run yet? */
    hasPendingScan() { return scanFrame !== null },
    host() { return current },
  }
}
