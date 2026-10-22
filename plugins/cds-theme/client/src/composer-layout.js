/**
 * The composer's split layout: the framed text box, then ONE toolbar line
 * carrying both clusters and the statistics.
 *
 * OFF BY DEFAULT (`composerSplit: false`). With the switch off this module marks
 * nothing and `composerLayoutRules()` emits no rule that matches, so the shipped
 * single-card composer stands untouched.
 *
 * THE TARGET (approved): text box in its own frame, and beneath it one line that
 * holds the left cluster (permission, add, …), the statistics (turns/steps,
 * speed, tokens, cache, context ring) and the right cluster (model, Send) — the
 * reference's single toolbar row.
 *
 * WHY THE DOCK NEEDS A CONTAINING BLOCK THAT IS NOT THE CARD. The host renders
 * the statistics dock as `[data-composer-dock]`, the card's NEXT SIBLING, both
 * inside a common stack element. An earlier draft wrote the band coordinates on
 * the CARD and absolutely positioned the dock: that cannot work — a custom
 * property set on the card is not inherited by a sibling, and `position:
 * absolute` resolves against the nearest POSITIONED ANCESTOR, which for the dock
 * is the stack, never the card. The dock therefore landed against the wrong box.
 *
 * THE FIX, WITHOUT MOVING A NODE:
 *
 *   1. find the CARD and the DOCK, then their lowest common ancestor (the stack)
 *      by walking `parentElement` — no assumption about the host's salted class;
 *   2. mark that stack with this plugin's own `data-cds-composer-stack`;
 *   3. write the band and the cluster insets as custom properties ON THE STACK,
 *      which IS an ancestor of the dock, so the values actually inherit;
 *   4. CSS puts `position: relative` on the stack (the containing block) and
 *      lifts the dock onto the control row's band with `position: absolute`.
 *
 * Nothing is re-parented, cloned or hidden: React keeps owning both subtrees, so
 * the crash an earlier `removeChild` attempt caused cannot happen.
 *
 * MEASUREMENT. Four numbers, taken only inside a `ResizeObserver` callback:
 * the row's offset inside the stack, the row's height, and the two CLUSTER
 * extents, which become the dock's left/right insets so the statistics sit in
 * the gap instead of on top of the buttons.
 *
 * THE UNIT IS THE CLUSTER, NOT A SLOT. Measuring from
 * `[data-slot="conversation.input.permission"]` alone was a real overlap: the
 * host renders a SECOND seat (the plan chip) plus an add button in the same left
 * cluster, so the permission slot's right edge is not the cluster's right edge
 * and the dock started inside the buttons. The left cluster is the ancestor of
 * the permission slot whose `parentElement` is the row; the right cluster is the
 * ancestor of the model slot whose `parentElement` is the row. Both are found by
 * walking `parentElement` only — same discipline as `findControlRow`, no class
 * name — and a walk that never reaches the row falls back to the slot itself.
 *
 * The observer watches the CARD, the ROW **and the TEXT PORT** — watching the
 * row alone was the second defect of the first draft: a draft that grows the
 * input pushes the row down without resizing it. Callbacks coalesce onto one
 * animation frame, a same-value guard skips redundant writes, and `stop()`
 * disconnects the observer, cancels a pending frame and removes every attribute
 * and property it wrote.
 *
 * NARROW WINDOWS. There is no fixed horizontal inset anywhere — the earlier
 * `0 168px` overlapped the clusters as soon as the window narrowed — and no
 * fixed threshold either. The dock's own content width is measured from its
 * children (first child's left edge to last child's right edge); one line is
 * honest only when the measured centre gap can hold `contentWidth + 2 * air`.
 * `MIN_CENTRE_GAP` is nothing but the floor for an EMPTY dock, where there is no
 * content to measure. When the gap is too small the stack is marked
 * `data-cds-composer-narrow` and the dock returns to its own line below the
 * toolbar — a measured decision, not a media query guess, degrading into a
 * layout the host already ships.
 *
 * THE TEXT BOX KEEPS THE HOST'S CEILING. `[data-input-scroll]` is the host's own
 * scrollport around the Lexical surface. The host caps it through
 * `--dsh-composer-text-max-height` (this theme sets that for a blank session in
 * `newSessionInputRules`) and usage-stats adds `--dus-input-budget` on top, and
 * the two are meant to constrain it together. The split therefore adds a FRAME
 * and nothing else: no `max-height`, no `overflow`, no `min-height` — the
 * scrollport keeps belonging to both budget owners.
 */

/** The attribute written on `<body>`. */
export const COMPOSER_LAYOUT_ATTR = 'data-cds-composer-layout'
/** The value that turns the split on. */
export const COMPOSER_LAYOUT_SPLIT = 'split'
/** The stack (card + dock's common ancestor), marked by this module. */
export const COMPOSER_STACK_ATTR = 'data-cds-composer-stack'
/** The marked control row inside the card. */
export const COMPOSER_ROW_ATTR = 'data-cds-composer-row'
/** Set on the stack when the measured gap cannot hold the statistics. */
export const COMPOSER_NARROW_ATTR = 'data-cds-composer-narrow'

/** Custom properties, all written on the STACK so the dock inherits them. */
export const ROW_TOP_VAR = '--cds-row-top'
export const ROW_HEIGHT_VAR = '--cds-row-height'
export const DOCK_INSET_LEFT_VAR = '--cds-dock-inset-left'
export const DOCK_INSET_RIGHT_VAR = '--cds-dock-inset-right'

/** The published hooks. All four are host `data-*`, never a salted class. */
const CARD = '[data-composer-card]'
const DOCK = '[data-composer-dock]'
const TEXT_PORT = '[data-input-scroll]'
const LEFT_SLOT = '[data-slot="conversation.input.permission"]'
const RIGHT_SLOT = '[data-slot="conversation.input.model"]'

/**
 * The floor for an EMPTY dock, in px — nothing else.
 *
 * The real threshold is measured: the dock's own content width plus air on both
 * sides. This constant only covers the case where the dock has no children to
 * measure, so there is no content width to compare against. It is NOT the
 * one-line threshold; the fixed 220px that used to live here let a dock wider
 * than 220px stay on the band and overlap the controls.
 */
export const MIN_CENTRE_GAP = 220

/**
 * The air kept between a cluster and the statistics, in px.
 *
 * 8px is the host's own `--dsh-composer-dock-inset`, so the gap the split leaves
 * on each side of the statistics is the gap the host's own dock leaves. It is
 * also as wide as the fit allows: at a 1280px viewport the row's raw cluster gap
 * is 289.98px against 266.78px of statistics, i.e. 11.6px per side, so a 12px air
 * would push a row that physically fits into the fallback.
 */
const AIR = 8

/**
 * The control row of one card, found structurally from the two cluster hooks.
 *
 * @param card the composer card element
 * @returns the row element, or null
 */
export function findControlRow(card) {
  if (!card || typeof card.querySelector !== 'function') return null
  const left = card.querySelector(LEFT_SLOT)
  const right = card.querySelector(RIGHT_SLOT)
  if (left === null || right === null) return null
  let node = left
  while (node !== null && node !== card) {
    if (typeof node.contains === 'function' && node.contains(right)) return node
    node = node.parentElement
  }
  return null
}

/**
 * The direct child of `row` that contains `slot` — the CLUSTER, not the slot.
 *
 * The host puts more than one seat in a cluster: the left one holds the add
 * button and the permission AND plan slots. Measuring the permission slot alone
 * is what let the statistics land on the plan chip. This walks `parentElement`
 * only: no class name, matching `findControlRow`'s discipline.
 *
 * Degenerate cases fall back to the slot itself: a slot that already IS a child
 * of the row (the common single-seat row) and a walk that never reaches the row
 * (a detached slot) both answer with the slot, which reproduces the previous,
 * narrower measurement rather than throwing.
 *
 * @param row the control row
 * @param slot a slot inside it (or null)
 * @returns the cluster element, or null when `slot` is null
 */
export function findCluster(row, slot) {
  if (!row || slot === null || slot === undefined) return null
  let node = slot
  let guard = 0
  while (node !== null && node !== row && guard < 64) {
    if (node.parentElement === row) return node
    node = node.parentElement
    guard += 1
  }
  return slot
}

/**
 * The dock's own content width, measured from its children.
 *
 * The first child's left edge to the last child's right edge, so a dock whose
 * flex container is wider than its content is measured by the content. Returns
 * 0 for zero or one child — with nothing to span, there is nothing to measure,
 * and the caller falls back to `MIN_CENTRE_GAP`.
 *
 * @param dock the statistics dock (or null)
 * @returns the content width in px, 0 when unmeasurable
 */
export function measureDockContent(dock) {
  if (!dock || !dock.children) return 0
  const kids = Array.prototype.slice.call(dock.children)
  if (kids.length < 2) return 0
  const first = kids[0]
  const last = kids[kids.length - 1]
  if (typeof first.getBoundingClientRect !== 'function' || typeof last.getBoundingClientRect !== 'function') return 0
  const left = first.getBoundingClientRect().left
  const right = last.getBoundingClientRect().right
  const width = Math.round(right - left)
  return Number.isFinite(width) && width > 0 ? width : 0
}

/**
 * The card, the dock and their lowest common ancestor.
 *
 * `parentElement` is walked, never a class name: the host salts the stack's class
 * on every build.
 *
 * @param doc a document
 * @returns `{ card, dock, stack }` or null when the host does not render both
 */
export function findComposerParts(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  const card = doc.querySelector(CARD)
  if (card === null) return null
  const dock = doc.querySelector(DOCK)
  if (dock === null) return null
  const ancestors = []
  let node = card.parentElement
  while (node !== null) {
    ancestors.push(node)
    node = node.parentElement
  }
  for (const candidate of ancestors) {
    if (typeof candidate.contains === 'function' && candidate.contains(dock)) {
      return { card: card, dock: dock, stack: candidate }
    }
  }
  return null
}

/**
 * Write the split mark (or clear it) on the document's body.
 *
 * Idempotent: writing the value the body already carries is not a DOM mutation.
 *
 * @param doc a document (or a fake with `body`)
 * @param layout `'host'` (default) or `'split'`
 */
export function applyComposerLayout(doc, layout) {
  const body = doc && doc.body
  if (!body || typeof body.setAttribute !== 'function') return false
  if (layout === COMPOSER_LAYOUT_SPLIT) {
    if (typeof body.getAttribute !== 'function' || body.getAttribute(COMPOSER_LAYOUT_ATTR) !== COMPOSER_LAYOUT_SPLIT) {
      body.setAttribute(COMPOSER_LAYOUT_ATTR, COMPOSER_LAYOUT_SPLIT)
    }
    return true
  }
  if (typeof body.hasAttribute === 'function' && body.hasAttribute(COMPOSER_LAYOUT_ATTR)) {
    body.removeAttribute(COMPOSER_LAYOUT_ATTR)
  }
  return false
}

/**
 * The measuring half of the split.
 *
 * @param options.document the document
 * @param options.ResizeObserver injectable for tests (defaults to the global)
 * @param options.requestFrame injectable one-frame scheduler (defaults to rAF)
 * @param options.cancelFrame its canceller
 * @returns `{ measure, stop }`
 */
export function createRowAlignment(options) {
  const doc = options && options.document
  const RO = options.ResizeObserver === undefined
    ? (typeof ResizeObserver === 'function' ? ResizeObserver : null)
    : options.ResizeObserver
  const view = doc && doc.defaultView ? doc.defaultView : null
  const requestFrame = options.requestFrame !== undefined
    ? options.requestFrame
    : (view && typeof view.requestAnimationFrame === 'function'
      ? function (run) { return view.requestAnimationFrame(run) }
      : function (run) { return setTimeout(run, 16) })
  const cancelFrame = options.cancelFrame !== undefined
    ? options.cancelFrame
    : (view && typeof view.cancelAnimationFrame === 'function'
      ? function (id) { view.cancelAnimationFrame(id) }
      : function (id) { clearTimeout(id) })

  let stack = null
  let card = null
  let row = null
  let observer = null
  let frame = null
  let last = null

  function releaseMarks() {
    if (observer !== null) {
      observer.disconnect()
      observer = null
    }
    if (frame !== null) {
      cancelFrame(frame)
      frame = null
    }
    if (row !== null && typeof row.removeAttribute === 'function' && row.hasAttribute(COMPOSER_ROW_ATTR)) {
      row.removeAttribute(COMPOSER_ROW_ATTR)
    }
    if (stack !== null) {
      if (typeof stack.removeAttribute === 'function') {
        if (stack.hasAttribute(COMPOSER_STACK_ATTR)) stack.removeAttribute(COMPOSER_STACK_ATTR)
        if (stack.hasAttribute(COMPOSER_NARROW_ATTR)) stack.removeAttribute(COMPOSER_NARROW_ATTR)
      }
      if (stack.style && typeof stack.style.removeProperty === 'function') {
        for (const name of [ROW_TOP_VAR, ROW_HEIGHT_VAR, DOCK_INSET_LEFT_VAR, DOCK_INSET_RIGHT_VAR]) {
          stack.style.removeProperty(name)
        }
      }
    }
    stack = null
    card = null
    row = null
    last = null
  }

  /** Schedule at most one reading per animation frame. */
  function schedule() {
    if (frame !== null) return
    frame = requestFrame(function () {
      frame = null
      measure()
    })
  }

  function observe(target, callback) {
    if (observer === null || !target) return
    try {
      observer.observe(target)
    } catch (error) {
      /* a detached node cannot be observed; the other targets still can */
    }
  }

  /**
   * One reading: the row's band inside the stack, and the two cluster insets.
   * Called from an observer callback or an explicit settings pass — never per
   * frame, and never from a scroll or stream handler.
   */
  function measure() {
    if (!doc || typeof doc.querySelector !== 'function') return
    const parts = findComposerParts(doc)
    if (parts === null) {
      releaseMarks()
      return
    }
    const nextRow = findControlRow(parts.card)
    if (nextRow === null) {
      releaseMarks()
      return
    }

    const stackChanged = parts.stack !== stack
    const rowChanged = nextRow !== row
    stack = parts.stack
    card = parts.card
    row = nextRow

    if (typeof stack.setAttribute === 'function' && !stack.hasAttribute(COMPOSER_STACK_ATTR)) {
      stack.setAttribute(COMPOSER_STACK_ATTR, '')
    }
    if (typeof row.setAttribute === 'function' && !row.hasAttribute(COMPOSER_ROW_ATTR)) {
      row.setAttribute(COMPOSER_ROW_ATTR, '')
    }

    // Re-arm the observer whenever the elements it watches have changed. The
    // TEXT PORT is observed on purpose: a draft that grows the input moves the
    // row down without changing its size, and watching the row alone misses it.
    if (RO !== null && (stackChanged || rowChanged || observer === null)) {
      if (observer !== null) observer.disconnect()
      observer = null
      try {
        observer = new RO(function () { schedule() })
      } catch (error) {
        observer = null
      }
      if (observer !== null) {
        observe(card)
        observe(row)
        observe(card.querySelector(TEXT_PORT))
      }
    }

    const stackBox = stack.getBoundingClientRect()
    const rowBox = row.getBoundingClientRect()
    const top = Math.round(rowBox.top - stackBox.top)
    const height = Math.round(rowBox.height)

    // The insets are measured from the CLUSTERS, never from one slot each: the
    // host's left cluster also carries the plan seat and the add button, so the
    // permission slot's right edge is not where the buttons end. When a cluster
    // is absent (a host without the permission slot) its inset stays 0.
    //
    // The cluster edges stay UNROUNDED for the width decision below; only the
    // values written as CSS pixels are rounded. Deciding on rounded insets was
    // enough to tip a row that physically fits into the fallback.
    const leftSlot = row.querySelector(LEFT_SLOT)
    const rightSlot = row.querySelector(RIGHT_SLOT)
    const leftCluster = findCluster(row, leftSlot)
    const rightCluster = findCluster(row, rightSlot)
    const leftEdge = leftCluster === null
      ? 0
      : leftCluster.getBoundingClientRect().right - rowBox.left
    const rightEdge = rightCluster === null
      ? 0
      : rowBox.right - rightCluster.getBoundingClientRect().left
    const insetLeft = Math.max(0, Math.round(leftEdge + AIR))
    const insetRight = Math.max(0, Math.round(rightEdge + AIR))

    // How much of the row the statistics can actually use. The written insets
    // reserve `AIR` on each side, so the room left for the dock's content is the
    // raw gap minus those two bands — the equivalent of asking the raw gap for
    // `contentWidth + 2 * AIR`. The requirement itself is MEASURED from the
    // dock's own children: a fixed 220px let any dock wider than that overlap
    // the controls, which is exactly what happened here.
    const centre = Math.round(rowBox.width - (leftEdge + AIR) - (rightEdge + AIR))
    const contentWidth = measureDockContent(parts.dock)
    const needed = contentWidth > 0 ? contentWidth : MIN_CENTRE_GAP
    const narrow = centre < needed

    const next = { top: top, height: height, left: insetLeft, right: insetRight, narrow: narrow }
    if (last !== null
      && last.top === next.top && last.height === next.height
      && last.left === next.left && last.right === next.right
      && last.narrow === next.narrow) return
    last = next

    stack.style.setProperty(ROW_TOP_VAR, next.top + 'px')
    stack.style.setProperty(ROW_HEIGHT_VAR, next.height + 'px')
    stack.style.setProperty(DOCK_INSET_LEFT_VAR, next.left + 'px')
    stack.style.setProperty(DOCK_INSET_RIGHT_VAR, next.right + 'px')
    if (next.narrow) stack.setAttribute(COMPOSER_NARROW_ATTR, '')
    else if (stack.hasAttribute(COMPOSER_NARROW_ATTR)) stack.removeAttribute(COMPOSER_NARROW_ATTR)
  }

  return { measure, stop: releaseMarks }
}

/**
 * The runtime half: the body mark plus the measurement.
 *
 * The gate is `enabled && composerSplit`, the same one the rules ride, so the
 * attribute and the CSS cannot disagree. `stop()` clears the body mark AND every
 * mark and property the measurement wrote.
 *
 * @param options `{ doc, getState, subscribe, ResizeObserver, requestFrame, cancelFrame }`
 */
export function createComposerLayoutController(options) {
  const doc = options && options.doc
  const getState = options && typeof options.getState === 'function' ? options.getState : function () { return {} }
  const subscribe = options && typeof options.subscribe === 'function' ? options.subscribe : null
  let off = null
  let align = null

  function wanted() {
    const state = getState() || {}
    return state.enabled !== false && state.composerSplit === true
  }

  function sync() {
    const on = wanted()
    applyComposerLayout(doc, on ? COMPOSER_LAYOUT_SPLIT : 'host')
    if (!on) {
      if (align !== null) {
        align.stop()
        align = null
      }
      return
    }
    if (align === null) {
      align = createRowAlignment({
        document: doc,
        ResizeObserver: options.ResizeObserver,
        requestFrame: options.requestFrame,
        cancelFrame: options.cancelFrame,
      })
    }
    align.measure()
  }

  return {
    start() {
      if (off !== null) return
      sync()
      if (subscribe !== null) off = subscribe(sync)
    },
    sync,
    stop() {
      if (typeof off === 'function') off()
      off = null
      if (align !== null) {
        align.stop()
        align = null
      }
      applyComposerLayout(doc, 'host')
    },
    /** One explicit reading — what the settings panel triggers after a change. */
    measure() {
      if (align !== null) align.measure()
    },
    get applied() {
      const body = doc && doc.body
      return !!(body && typeof body.getAttribute === 'function'
        && body.getAttribute(COMPOSER_LAYOUT_ATTR) === COMPOSER_LAYOUT_SPLIT)
    },
  }
}

/**
 * The stylesheet half. Emitted only for the split mark, so the default emits
 * nothing that matches.
 *
 * The card keeps a real, non-zero box: this sheet never sets `display: contents`
 * on it, because the host's ghosts and popovers measure the card while they place
 * themselves. It becomes a column, so the box and the toolbar are two bands of
 * the same element.
 *
 * @returns the rule text, `\n`-joined, ending with a blank line
 */
export function composerLayoutRules() {
  const root = 'body[' + COMPOSER_LAYOUT_ATTR + '="' + COMPOSER_LAYOUT_SPLIT + '"]'
  const stack = root + ' [' + COMPOSER_STACK_ATTR + ']'
  const card = root + ' ' + CARD
  const dock = stack + ' > ' + DOCK
  const narrow = stack + '[' + COMPOSER_NARROW_ATTR + ']'
  return [
    '/* ---- composer: split layout (box, then one toolbar line) ---------- */',
    // THE CONTAINING BLOCK. The stack is the dock's real parent, so `relative`
    // here is what makes `absolute` on the dock resolve against a box that
    // contains both the card and the dock. Declaring it on the card — what an
    // earlier draft did — left the dock with no containing block at all.
    stack + ' {',
    '  position: relative;',
    '}',
    // The card's own chrome goes away: its fill, its shadow and its padding move
    // onto the text box, or the box would sit inside a second frame.
    card + ' {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 8px;',
    '  background: transparent !important;',
    '  box-shadow: none !important;',
    '  border-radius: 0 !important;',
    '  padding: 0 !important;',
    '}',
    // The box. `[data-input-scroll]` is the host's own scrollport around the
    // Lexical surface, so the fill and the hairline land on it instead of on a
    // wrapper this sheet would have to invent.
    //
    // NO max-height, NO overflow, NO min-height: the host caps this scrollport
    // through `--dsh-composer-text-max-height` and usage-stats adds
    // `--dus-input-budget`; the two own the ceiling together, and a hard
    // `min(30vh, 220px)` here — the first draft's value — overrode both.
    card + ' ' + TEXT_PORT + ' {',
    '  box-sizing: border-box;',
    '  border-radius: var(--dsw-radius-md);',
    '  background: var(--dsw-specific-input-major);',
    '  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2) inset;',
    '  padding: 10px 14px;',
    '}',
    // The toolbar band: the host's own row, now a line under the box. It keeps
    // its place in the flow — the dock is what gets lifted onto it.
    card + ' [' + COMPOSER_ROW_ATTR + '] {',
    '  min-height: 32px;',
    '}',
    // THE STATISTICS, ON THE TOOLBAR'S BAND. Every number comes from the stack's
    // own properties, which the dock inherits because the stack is its ancestor.
    // The insets are MEASURED cluster widths, so nothing overlaps on a narrow
    // window; `pointer-events: none` lets the host's buttons underneath stay
    // clickable, and each child re-enables its own pointer events.
    dock + ' {',
    '  position: absolute;',
    '  top: var(' + ROW_TOP_VAR + ', 0px);',
    '  left: 0;',
    '  right: 0;',
    '  height: var(' + ROW_HEIGHT_VAR + ', 32px);',
    '  margin: 0;',
    '  padding-inline: var(' + DOCK_INSET_LEFT_VAR + ', 0px) var(' + DOCK_INSET_RIGHT_VAR + ', 0px);',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  gap: 12px;',
    '  pointer-events: none;',
    '}',
    dock + ' > * {',
    '  pointer-events: auto;',
    '}',
    // NARROW: the measured gap cannot hold the statistics, so they go back to
    // their own line under the toolbar — the layout the host already ships. This
    // is a measured switch, not a media query, and it is what replaces the fixed
    // 168px inset that used to overlap the clusters.
    narrow + ' > ' + DOCK + ' {',
    '  position: static;',
    '  height: auto;',
    '  padding-inline: 0;',
    '  margin: 6px 0 0;',
    '  min-height: 24px;',
    '}',
    // A blank session's workspace row keeps the reference's air above the box.
    root + ' [data-slot="conversation.hero.workspace"] {',
    '  margin-bottom: 2px;',
    '}',
    '',
  ].join('\n')
}
