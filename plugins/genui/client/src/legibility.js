/**
 * The legibility pass: text inside a card must actually be readable.
 *
 * THE FAILURE THIS EXISTS FOR. A card's body is model-authored code, and the
 * host's token vocabulary contains two families that look alike by name:
 *
 *   ink tokens   `--dsw-alias-label-primary`      rgb(21, 21, 21)
 *                `--dsw-alias-state-error-primary` rgb(186, 39, 35)
 *   fill tokens  `--dsw-alias-code-diff-deleted`  rgba(186, 39, 35, 0.08)
 *                `--dsw-alias-border-l1`          rgba(20, 20, 20, 0.06)
 *
 * A model reaching for "the red one" picks the diff token — it IS the red one,
 * at 8% alpha, because it is meant to tint a diff line behind normal text. As a
 * `color` it paints an 8%-opacity salmon: the "99.5%" headline that prompted
 * this module measured rgb(247, 235, 234) on a rgb(252, 252, 251) surface, a
 * contrast ratio of 1.05:1. The user reported it as "the percentage is covered".
 * Nothing was covering it; it was there, at one thirteenth of its colour.
 *
 * WHY A MEASUREMENT AND NOT A TOKEN LIST. A deny-list of translucent tokens
 * would be wrong twice over: it has to be updated whenever the host adds one,
 * and it cannot see a snippet that puts the mistake in a class, an SVG `fill`,
 * or a computed style. `getComputedStyle(el).color` is ground truth for every
 * one of those, so the rule is stated in the one currency that cannot drift:
 * a text colour below MIN_TEXT_ALPHA is a bug, whatever produced it.
 *
 * WHY ALPHA AND NOT CONTRAST. Computing a real contrast ratio needs the
 * effective background, which means walking up the ancestor chain compositing
 * every translucent layer, and the answer changes with a gradient or an image
 * behind the card. Alpha is a lower bound on the same defect — and the numbers
 * are far apart: every ink token the host ships is fully opaque, while every
 * fill token sits at 0.05–0.24. MIN_TEXT_ALPHA lives in the gap, so the rule
 * needs no theme, no background and no threshold tuning per palette.
 *
 * WHAT IT DELIBERATELY CANNOT SEE: `opacity` on an ancestor, a text-shadow that
 * is the only visible thing, or SVG `fill`. All three are outside what a
 * `color` measurement can prove, and inventing a rule for them would cost a
 * layout read per element on every card for a class of bug nobody has hit.
 *
 * @module legibility
 */

/**
 * Below this alpha, a text colour is treated as a fill token used by mistake.
 *
 * THE NUMBER IS A GAP, NOT A TASTE. Measured across the host's alias table:
 * opaque ink tokens sit at 1.0 (the faintest "disabled" friendly one,
 * `--dsw-alias-label-shimmer`, is 0.3), and the fill tokens top out at 0.24
 * (`--dsw-alias-bg-mask-1`). 0.25 separates the two families with the whole
 * palette's margin on both sides, so the rule fires on the mistake and never on
 * a deliberate faint label.
 */
export const MIN_TEXT_ALPHA = 0.25

/** The attribute set on a repaired element, so a test can see the pass ran. */
export const LEGIBLE_ATTR = 'data-dsh-genui-legible'

/**
 * Parse a computed colour into channels plus alpha.
 *
 * Computed `color` in Chromium is always `rgb(...)`/`rgba(...)` for a colour
 * that came from a hex, a token or a named colour, so that is the only shape
 * handled. Anything else — `color(srgb ...)`, `oklab(...)`, an empty string
 * from a detached node — returns null and is LEFT ALONE: an unparsable value is
 * a reason to do nothing, never a reason to guess.
 *
 * Both comma and space syntax are accepted (`rgba(1, 2, 3, 0.5)` and
 * `rgb(1 2 3 / 50%)`), because a future engine may normalise to the modern one.
 *
 * @param {string} value a computed `color`
 * @returns {{ r: number, g: number, b: number, a: number } | null} channels, or null
 */
export function parseComputedColor(value) {
  if (typeof value !== 'string') return null
  const match = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
  if (match === null) return null
  const parts = match[1].split(/[\s,/]+/).filter((part) => part !== '')
  if (parts.length < 3) return null
  const channel = (text) => {
    const number = text.endsWith('%') ? Number(text.slice(0, -1)) * 2.55 : Number(text)
    return Number.isFinite(number) ? Math.round(number) : null
  }
  const r = channel(parts[0])
  const g = channel(parts[1])
  const b = channel(parts[2])
  if (r === null || g === null || b === null) return null
  const a = parts.length > 3 ? Number(parts[3].endsWith('%') ? parts[3].slice(0, -1) / 100 : parts[3]) : 1
  return { r, g, b, a: Number.isFinite(a) ? a : 1 }
}

/**
 * Does this element paint its own text?
 *
 * A DIRECT non-blank text child, not a descendant one: the child that owns the
 * text is the element whose colour is being measured, and repairing it there
 * keeps the change on the smallest node. A wrapper that only inherits a colour
 * is left alone — its text child is repaired on its own turn through the walk.
 *
 * @param {object} element a DOM element
 * @returns {boolean} true when the element has a non-blank text child
 */
function paintsText(element) {
  const children = element.childNodes
  if (children === undefined || children === null) return false
  for (const node of children) {
    // 3 is Node.TEXT_NODE. The literal is used because this module is also
    // driven by a fake DOM in Node, where the `Node` global does not exist.
    if (node.nodeType === 3 && String(node.nodeValue ?? '').trim() !== '') return true
  }
  return false
}

/**
 * Repair one element's colour in place, if it is below the floor.
 *
 * The hue is preserved and only the alpha is dropped, because that is exactly
 * what the model meant: `rgba(186, 39, 35, 0.08)` is the red of
 * `--dsw-alias-state-error-primary`, and full-alpha red is the headline it
 * intended to draw. Compositing the translucent colour over the background
 * would reproduce the invisible result instead of fixing it.
 *
 * Gradient text (`background-clip: text`) is skipped: its visible ink is the
 * background, and an explicit `color: transparent` there is the technique, not
 * the bug.
 *
 * @param {object} element a DOM element
 * @param {object} view the element's window
 * @returns {boolean} true when the element was rewritten
 */
function repairElement(element, view) {
  if (!paintsText(element)) return false
  if (element.style === undefined || element.style === null
    || typeof element.style.setProperty !== 'function') return false
  const style = view.getComputedStyle(element)
  if (style === undefined || style === null) return false

  const clip = style.backgroundClip ?? style.webkitBackgroundClip
  if (clip === 'text') return false

  const color = parseComputedColor(style.color)
  if (color === null || color.a >= MIN_TEXT_ALPHA) return false

  element.style.setProperty('color', `rgb(${color.r}, ${color.g}, ${color.b})`)
  if (typeof element.setAttribute === 'function') element.setAttribute(LEGIBLE_ATTR, '')
  return true
}

/**
 * Run one legibility pass over a subtree.
 *
 * Idempotent by measurement rather than by a marker: once the colour is opaque,
 * the next pass reads alpha 1 and writes nothing. That is what lets the
 * MutationObserver below fire freely — a repair cannot retrigger a repair.
 *
 * @param {object} root the card body element
 * @returns {number} how many elements were repaired (0 when the card is fine)
 */
export function repairInvisibleText(root) {
  const view = root?.ownerDocument?.defaultView ?? null
  if (view === null || typeof view.getComputedStyle !== 'function') return 0
  if (typeof root.querySelectorAll !== 'function') return 0

  let repaired = repairElement(root, view) ? 1 : 0
  for (const element of root.querySelectorAll('*')) {
    if (repairElement(element, view)) repaired += 1
  }
  return repaired
}

/**
 * Keep a card legible as its snippet re-renders.
 *
 * A card is not static: a tab switch (`React.useState` in the snippet) replaces
 * its whole body, and the replacement can carry the same mistake. Running the
 * pass once on mount would fix the first tab and leave the second invisible.
 *
 * Coalesced to one pass per frame: a snippet that renders a table renders it one
 * cell at a time, and sweeping the subtree once per mutation would walk the card
 * dozens of times for one answer. The repository's observer rule is the same
 * one stated here — subscribe to `childList`, sweep once per frame, disconnect
 * on dispose.
 *
 * @param {object} root the card body element
 * @returns {() => void} disposer
 */
export function observeInvisibleText(root) {
  const view = root?.ownerDocument?.defaultView ?? null
  const Observer = view?.MutationObserver
  if (typeof Observer !== 'function') {
    // No observer (a Node test, an exotic host): the one-shot pass is still
    // worth running, and the disposer stays a no-op.
    repairInvisibleText(root)
    return function disposeWithoutObserver() {}
  }

  let queued = false
  let cancelled = false
  const frame = typeof view.requestAnimationFrame === 'function'
    ? (callback) => view.requestAnimationFrame(callback)
    : (callback) => view.setTimeout(callback, 0)
  const cancelFrame = typeof view.cancelAnimationFrame === 'function'
    ? (handle) => view.cancelAnimationFrame(handle)
    : (handle) => view.clearTimeout(handle)

  let handle = null
  const flush = () => {
    queued = false
    if (cancelled) return
    repairInvisibleText(root)
  }
  const schedule = () => {
    if (queued || cancelled) return
    queued = true
    handle = frame(flush)
  }

  repairInvisibleText(root)
  const observer = new Observer(schedule)
  observer.observe(root, { childList: true, subtree: true, characterData: true })

  return function dispose() {
    cancelled = true
    observer.disconnect()
    if (handle !== null) cancelFrame(handle)
  }
}
