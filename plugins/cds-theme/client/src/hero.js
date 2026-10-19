/**
 * The hero greeting's serif hook.
 *
 * WHY THIS FILE EXISTS. The blank-session hero headline ("Into the Unknown",
 * 26px/500, `conversation.js` HeroShell) declares NO `font-family`, so it
 * inherits the UI sans. The reference renders the greeting in the SERIF stack
 * ("问候语与正文衬线栈", docs/v1/01-…md:325) — so the headline needs a serif,
 * but its class (`Hqq-bq_headline`) is a salted CSS-Modules name this theme is
 * forbidden to target. The legal path is structural: FIND the element from
 * stable `data-slot` anchors, MARK it with this theme's own `data-cds-greeting`
 * attribute, and style `[data-cds-greeting]` in the plugin stylesheet.
 *
 * THE STRUCTURE (extracted from `dsh-client-ui-conversation.js`:
 * ConversationRoot `composerBar`, lines ~17834-17845, and HeroShell ~17697):
 *
 *   div.composerStack                      (column flex)
 *   ├─ div.heroShell                       (HeroShell root — always first child)
 *   │    └─ div.heroStack
 *   │         ├─ div.heroHeadline  ← 26px/500; THIS gets data-cds-greeting
 *   │         │    ├─ span.fishHitbox (wraps the conversation.hero.brand.mark slot)
 *   │         │    └─ span.titleGroup ("Into the Unknown" + preview badge)
 *   │         └─ div.heroBody
 *   ├─ div.heroWorkspaceRow        (contains [data-slot="conversation.hero.workspace"])
 *   ├─ [data-slot="conversation.input.dock"]  (display:contents outlet)
 *   └─ inputBar
 *
 * IMPORTANT: the dock outlet is NOT always present, and when present it is
 * NOT always directly after the workspace row.
 *   - Before a session exists (`sessionId === undefined`) the conversation
 *     renders no `conversation.input.dock` outlet at all, so the workspace
 *     anchor is the primary locator and the dock is only a cross-check.
 *   - The installed usage-stats plugin hoists its dock outlet ABOVE the
 *     workspace row (`insertBefore(outlet, workspaceRow)`), so the sibling
 *     order becomes `heroShell → dock → workspaceRow → inputBar`. The hero
 *     shell is therefore located as the STACK'S FIRST ELEMENT CHILD — stable
 *     in every order — not as `workspaceRow.previousElementSibling`.
 *
 * Every slot outlet the host renders carries `data-slot="<key>"` on a
 * `display:contents` wrapper — including the brand-mark outlet INSIDE the
 * headline. A blanket "headline contains no data-slot" check would therefore
 * reject the real headline; the signature check instead requires the
 * brand-mark anchor exactly, and rejects composer anchors.
 *
 * FAILURE MODES. The mark is a pure attribute write:
 *   - idempotent — `setAttribute` with the same value is a no-op;
 *   - reversible — `stop()` removes every mark it could still find;
 *   - graceful — any structural surprise (no workspace anchor, a dock that is
 *     not a child of the same composer stack, a hero that is not the stack's
 *     first child, a titled element with no brand-mark anchor, a headline that
 *     hosts the composer) returns `null` and marks nothing. The greeting then
 *     simply keeps the inherited sans.
 *
 * A MutationObserver re-runs the sweep because React recreates the hero nodes
 * on every blank→live→blank flip and because usage-stats re-orders the dock on
 * mount. Sweeps are coalesced onto one animation frame: streaming sessions
 * mutate the body continuously, and one sweep per frame is enough to keep the
 * mark true without doing structural queries per mutation.
 */

/** The attribute this plugin owns. Never target the host's classes. */
export const GREETING_ATTR = 'data-cds-greeting'

/**
 * Host slot anchors. These are the `data-slot` wrappers the renderer emits for
 * public slot keys (`conversation.hero.workspace`, `conversation.input.dock`,
 * `conversation.hero.brand.mark`) — stable names from the host's slot registry,
 * never hashed CSS. `docs/usage-stats-contract.md:149` already relies on the
 * workspace anchor as "稳定属性" for the same container walk.
 */
const DOCK_ANCHOR = '[data-slot="conversation.input.dock"]'
const WORKSPACE_ANCHOR = '[data-slot="conversation.hero.workspace"]'
/** Slot outlet rendered INSIDE the real headline (fish brand mark). */
const BRAND_ANCHOR = '[data-slot="conversation.hero.brand.mark"]'

/** `querySelectorAll` for the marks currently in the tree. */
function markedIn(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  return Array.prototype.slice.call(root.querySelectorAll('[' + GREETING_ATTR + ']'))
}

/**
 * Locate the hero headline element, or return null when the structure does
 * not match the documented shape. Takes anything with `querySelector`.
 *
 * The workspace anchor is the primary locator: the hero workspace row is
 * rendered whenever the hero is, while the dock outlet only exists once a
 * session does. When the dock IS rendered it must sit in the same composer
 * stack as the workspace row — that is the cross-check that the element found
 * is really the composer column and not some other column.
 */
export function findGreetingHeadline(root) {
  if (!root || typeof root.querySelector !== 'function') return null

  const workspaceSlot = root.querySelector(WORKSPACE_ANCHOR)
  if (!workspaceSlot || !workspaceSlot.parentElement) return null
  const workspaceRow = workspaceSlot.parentElement
  const stack = workspaceRow.parentElement
  if (!stack) return null

  const dock = root.querySelector(DOCK_ANCHOR)
  if (dock && dock.parentElement !== stack) return null

  const children = Array.prototype.slice.call(stack.children || [])
  if (children.indexOf(workspaceRow) < 0) return null

  // HeroShell is the stack's first element child. It must be a real element
  // (not a slot wrapper) and must not be the workspace row itself.
  const heroShell = stack.firstElementChild
  if (!heroShell || heroShell === workspaceRow || heroShell === dock) return null
  if (typeof heroShell.hasAttribute === 'function' && heroShell.hasAttribute('data-slot')) return null

  // HeroShell root → hero stack → headline (first child of first child).
  const heroStack = heroShell.firstElementChild
  if (!heroStack) return null
  const headline = heroStack.firstElementChild
  if (!headline || headline === workspaceRow || headline === dock || headline === heroShell) return null
  if (typeof headline.querySelector !== 'function') return null

  // Structural signature of the REAL headline: it hosts the brand-mark slot
  // wrapper and never the composer. A layout that no longer matches this is a
  // layout we do not understand — leave it alone.
  if (!headline.querySelector(BRAND_ANCHOR)) return null
  if (headline.querySelector('[data-composer-card]')) return null
  if (headline.querySelector('[data-composer-input]')) return null

  return headline
}

/**
 * One marking pass: mark the current headline, drop marks anywhere else.
 * Returns the marked element (or null) — the whole operation is idempotent.
 */
export function sweepGreeting(root) {
  const headline = findGreetingHeadline(root)
  for (const el of markedIn(root)) {
    if (el !== headline && typeof el.removeAttribute === 'function') {
      el.removeAttribute(GREETING_ATTR)
    }
  }
  if (headline && typeof headline.setAttribute === 'function') {
    if (!headline.hasAttribute || !headline.hasAttribute(GREETING_ATTR)) {
      headline.setAttribute(GREETING_ATTR, '')
    }
  }
  return headline
}

/**
 * Own the mark for one plugin lifetime.
 *
 * `Observer` is injectable so the sweep logic is testable without a DOM; in
 * the browser it defaults to the real MutationObserver and re-sweeps on any
 * child-list change under `document.body` (the hero is created, destroyed and
 * re-ordered by React and by sibling plugins as the conversation phase
 * changes). `requestAnimationFrame` is read from `doc.defaultView`, with a
 * `setTimeout(0)` fallback for non-window documents.
 */
export function createGreetingMarker(doc, Observer) {
  const ObserverImpl = Observer === undefined
    ? (typeof MutationObserver === 'function' ? MutationObserver : null)
    : Observer
  const view = doc && doc.defaultView ? doc.defaultView : null
  let observer = null
  let started = false
  let scheduled = false

  function sweep() {
    if (!started) return
    sweepGreeting(doc)
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
   * Only an addition that can carry a headline justifies a sweep.
   *
   * The previous version passed `schedule` straight to the observer, so EVERY
   * mutation batch — including the text-node churn of a streaming response —
   * queued a full document sweep (one `findGreetingHeadline` plus a
   * document-wide `querySelectorAll('[data-cds-greeting]')`). Streaming never
   * adds an element that could become the hero, so that work was pure waste for
   * the whole duration of every answer. `markdown.js` and `navicon.js` already
   * filter their records this way; this brings the hero marker in line.
   *
   * The test is on what a node CANNOT be, not on `nodeType === 1`: a text (3) or
   * comment (8) node carries no element, and anything else is treated as a
   * possible element. That keeps hand-built hosts and test doubles — which may
   * omit `nodeType` entirely — on the safe side of the check, because a missed
   * sweep is a cosmetic miss while a skipped one is a missing greeting.
   */
  function onMutations(records) {
    if (!started) return
    // A callback with no records (a hand-built host, a test double) still
    // sweeps: degradation over silence.
    if (!records) {
      schedule()
      return
    }
    for (const record of records) {
      const added = record && record.addedNodes ? record.addedNodes : []
      for (const node of added) {
        if (!node) continue
        if (node.nodeType === 3 || node.nodeType === 8) continue
        schedule()
        return
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
        if (typeof el.removeAttribute === 'function') el.removeAttribute(GREETING_ATTR)
      }
    },
    sweep,
    get started() { return started },
  }
}
