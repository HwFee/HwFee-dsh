import { EASING } from './palette.js'

/**
 * The host's floating "back to bottom" button, re-seated and state-aware.
 *
 * WHY THIS FILE EXISTS. The button is rendered by the HOST (`dsh-client-ui-chat`
 * ChatView), not by this plugin, so its React component cannot be edited. What
 * can be edited is the CSS around it, and that is all this module emits: no DOM
 * nodes, no listeners, no timers. "Is the assistant answering?" is read from a
 * host attribute in a `:has()` guard, so the dots appear and disappear with the
 * host's own render — nothing here polls or schedules anything.
 *
 * HOOKS (all verified in the live renderer, see `.work/tobottom-report.md`).
 *
 *   - `[data-slot="conversation.view"]` — the outlet `renderer.js` writes around
 *     the conversation view. Stable by contract: it is a slot key, not a hash.
 *   - The button's parent chain under that outlet is frame -> slot -> button.
 *     The two middle boxes are salted CSS Modules (`xz4KEq_frame`,
 *     `xz4KEq_toBottomSlot`), so they are matched STRUCTURALLY: a box that is
 *     the outlet's grandchild and whose only child is a `button`. The live probe
 *     resolves exactly one element, and it is the floating button.
 *   - The button itself is matched by the SAME structural fact (it is that box's
 *     only `button` child). Its `aria-label` is localized (`回到底部` / `Back to
 *     bottom`) and therefore not usable as a hook — a language switch would
 *     silently detach every rule below.
 *   - `[data-chat-running]` — the running indicator row. The host mounts it only
 *     while the current turn is running (`...running ? [RunningStatus] : []`), so
 *     its presence IS the answering state. `[data-streaming]` marks a streaming
 *     reasoning summary / assistant markdown root and is OR'd in because a turn
 *     can stream markdown without the running row being in the same commit.
 *   - `[data-content-phase]` is deliberately NOT used: it is the conversation
 *     VIEW phase (`hero` / `active` / `settling`), which stays `active` in an
 *     idle conversation. Keying on it would show dots forever.
 *
 * CENTRING. The host's seat is `justify-content: flex-end` plus an inline
 * `padding-right` that pushes the button to the transcript's right edge. Both
 * are overridden here; the seat is already full-width, so centring lands the
 * button on the chat column's centre line. The vertical seat is left untouched:
 * it already sits in the gap above the composer, and this plugin does not get to
 * move a control into the composer's box.
 *
 * CURSOR. `pointer`, not a down arrow or `grabbing` — see the note on the
 * button rule below.
 *
 * NO TEMPLATE LITERALS anywhere in this file on purpose: a single backtick in a
 * CSS comment ends the string early and produces a bundle that fails at load
 * time (the repo's known trap). Concatenation cannot fail that way.
 */

/** The conversation body: the one ancestor that owns both state markers. */
export const TOBOTTOM_SCOPE = '[data-conversation-content]'

/** The view outlet, scoped to the conversation body. */
export const TOBOTTOM_VIEW = TOBOTTOM_SCOPE + ' [data-slot="conversation.view"]'

/**
 * The descendant path from the body to each target. Kept separate from the scope
 * so a state guard can be appended to the SAME element that carries the markers
 * instead of demanding a second, nested conversation body (which never exists —
 * the live page has exactly one `[data-conversation-content]`).
 */
const PATH_SLOT = ' [data-slot="conversation.view"] > * > *:has(> button:only-child)'
const PATH_BUTTON = PATH_SLOT + ' > button:only-child'

/** The host's seat box: the outlet's grandchild whose only child is a button. */
export const TOBOTTOM_SLOT = TOBOTTOM_SCOPE + PATH_SLOT

/** The floating button itself. */
export const TOBOTTOM_BUTTON = TOBOTTOM_SCOPE + PATH_BUTTON

/** Running-indicator row: mounted only while the turn is running. */
export const RUNNING_MARKER = 'data-chat-running'

/** Streaming marker on the reasoning summary and the assistant markdown root. */
export const STREAMING_MARKER = 'data-streaming'

const IS_ANSWERING = ':is(:has([' + RUNNING_MARKER + ']), :has([' + STREAMING_MARKER + ']))'
const IS_IDLE = ':not(:has([' + RUNNING_MARKER + '])):not(:has([' + STREAMING_MARKER + ']))'

/** The conversation body, only while the host is answering. */
export const ANSWERING_GUARD = TOBOTTOM_SCOPE + IS_ANSWERING

/** The conversation body, only while nothing is being generated. */
export const IDLE_GUARD = TOBOTTOM_SCOPE + IS_IDLE

export const DOT_ANIMATION = 'cds-tobottom-dot'

/**
 * 4px dots, 6px apart: 3 * 4 + 2 * 6 = 24px inside the host's 34px button, which
 * leaves 5px of air on each side. The earlier 5px/8px recipe measured 31px — it
 * read as dots pressed against the ring, which is why the control felt heavy.
 * Smaller dots with a tighter gap keep the group clearly inside the circle.
 */
export const DOT_SIZE = '4px'
export const DOT_GAP = '6px'
export const BUTTON_SIZE = 34

/** One loop of the wave, plus the per-dot start offsets that stagger it. */
export const DOT_CYCLE_MS = 1200
export const DOT_DELAYS = ['0ms', '160ms', '320ms']

/** How far a dot rises. Small on purpose: the button is 34px tall. */
export const DOT_RISE = '-3px'

// Curve tokens first (they are emitted by `motionRules()`), literal CDS value as
// the fallback so this block can never animate with a browser default.
export const PULSE = 'var(--cds-ease-pulse, ' + EASING.pulse + ')'
export const SNAP = 'var(--ds-ease-snap, ' + EASING.snap + ')'

/** The button while answering: guard on the body, then the structural path. */
export function answeringButton() {
  return ANSWERING_GUARD + PATH_BUTTON
}

/** The button while idle. */
export function idleButton() {
  return IDLE_GUARD + PATH_BUTTON
}

/**
 * The three dots.
 *
 * STRUCTURE. The host's button has exactly one child, the chevron `svg`, and a
 * `display: flex` box. So the wave is built from the TWO available pseudo
 * elements plus that svg, in visual order: `::before` (dot 1), the svg (dot 2),
 * `::after` (dot 3). No node is added, moved or removed — the plugin would
 * otherwise be inserting children into a React-managed subtree.
 *
 * WHY THE SVG BECOMES A DOT. It is `aria-hidden` decoration; the button keeps
 * its `aria-label` as the accessible name, so the control still announces
 * 「回到底部」 while showing progress. The chevron path is hidden rather than the
 * whole svg, so the element keeps its box and its place in the flex row.
 *
 * MOTION. Only `transform` is animated. Opacity is NOT: a translucent layer over
 * the transcript is exactly the artefact the thinking-shimmer rule had to
 * back out of (a half-transparent box kept landing over re-rendered text), and a
 * moving dot needs no fade to read as motion.
 *
 * THE CURVES ARE CDS, not linear. Per-keyframe timing functions split the loop
 * into a rise and a settle: the rise decelerates into the apex (a thrown dot),
 * the settle is the reference's symmetric breathing curve. Ant Design's own dots
 * use `linear` for the same job — the one part of their recipe this theme
 * cannot copy, because `test/css.test.mjs` forbids `linear` on transitions and
 * the CDS motion spec keeps it out of animations too.
 */
export function dotKeyframes() {
  return [
    '@keyframes ' + DOT_ANIMATION + ' {',
    '  0% {',
    '    transform: translateY(0);',
    '    animation-timing-function: ' + SNAP + ';',
    '  }',
    '  36% {',
    '    transform: translateY(' + DOT_RISE + ');',
    '    animation-timing-function: ' + PULSE + ';',
    '  }',
    '  72%, 100% {',
    '    transform: translateY(0);',
    '  }',
    '}',
  ].join('\n')
}

export function toBottomRules() {
  const answering = answeringButton()
  const idle = idleButton()
  const dotBox = [
    '  content: "";',
    '  flex: none;',
    '  width: ' + DOT_SIZE + ';',
    '  height: ' + DOT_SIZE + ';',
    '  border-radius: 50%;',
    '  background: currentColor;',
    '  animation: ' + DOT_ANIMATION + ' ' + DOT_CYCLE_MS + 'ms ' + PULSE + ' infinite;',
  ].join('\n')

  return [
    '/* ---- back to bottom: centred seat, streaming dots, down affordance --- */',
    // 1. Centre the seat on the chat column. The host right-aligns it with a
    //    flex-end seat plus an inline padding-right derived from the composer
    //    clearance; both go, and the full-width seat centres instead. Vertical
    //    geometry is the host's and is not touched: the button already floats in
    //    the gap above the composer, and moving it down would cover the composer.
    TOBOTTOM_SLOT + ' {',
    '  justify-content: center !important;',
    '  padding-left: 0 !important;',
    '  padding-right: 0 !important;',
    '}',
    // 2. THE CONTROL IS LIGHTER THAN THE HOST'S DEFAULT. The host draws a filled
    //    white plate with a 1px hard ring (0 0 0 1px) plus two drop shadows; at
    //    34px that reads as a solid chip floating over the transcript. The theme's
    //    own floating controls use the raised surface with the soft elevation and
    //    NO hard ring, so this matches them: one surface token, one shadow tier,
    //    a hairline instead of an outline ring. Nothing here changes the box size
    //    or position — only weight.
    TOBOTTOM_BUTTON + ' {',
    '  cursor: pointer !important;',
    '  background: var(--dsw-alias-bg-layer-1) !important;',
    '  box-shadow: var(--dsw-elevation-soft) !important;',
    '  border: 0.5px solid var(--dsw-alias-border-l1) !important;',
    '  color: var(--dsw-alias-label-secondary) !important;',
    '  transition: background-color 120ms ' + SNAP + ', color 120ms ' + SNAP + ',',
    '    box-shadow 120ms ' + SNAP + ';',
    '}',
    // Hover lifts it a step instead of deepening the shadow: the tier change is
    // what the rest of the theme does on hover.
    TOBOTTOM_BUTTON + ':hover {',
    '  background: var(--dsw-alias-bg-layer-2) !important;',
    '  color: var(--dsw-alias-label-primary) !important;',
    '}',
    // 3. Idle: the chevron dips on hover. Guarded by IDLE so it can never fight
    //    the dots' own transform while the assistant is answering.
    idle + ' > svg {',
    '  transition: transform 140ms ' + SNAP + ';',
    '}',
    idle + ':hover > svg {',
    '  transform: translateY(2px);',
    '}',
    // 4. Answering: the chevron becomes the middle dot and two pseudos appear
    //    around it. `gap` keeps the group centred inside the fixed-size button;
    //    nothing here can change the button's outside geometry.
    answering + ' {',
    '  gap: ' + DOT_GAP + ';',
    '}',
    // HOVERING WHILE BUSY MUST SHOW THE AFFORDANCE AGAIN. The dots say "working",
    // but the pointer says "I am about to click this", so the control has to
    // answer with what the click will do. Hover therefore drops the dots and
    // restores the downward chevron the button has when idle; the wave resumes
    // when the pointer leaves.
    answering + ':hover {',
    '  gap: 0;',
    '}',
    answering + ' > svg {',
    '  flex: none;',
    '  width: ' + DOT_SIZE + ';',
    '  height: ' + DOT_SIZE + ';',
    '  background: currentColor;',
    '  border-radius: 50%;',
    '  transform: translateY(0);',
    '  animation: ' + DOT_ANIMATION + ' ' + DOT_CYCLE_MS + 'ms ' + PULSE + ' infinite;',
    '  animation-delay: ' + DOT_DELAYS[1] + ';',
    '  transition: none;',
    '}',
    answering + ' > svg > path {',
    '  stroke: none;',
    '}',
    answering + '::before {',
    dotBox,
    '  animation-delay: ' + DOT_DELAYS[0] + ';',
    '}',
    answering + '::after {',
    dotBox,
    '  animation-delay: ' + DOT_DELAYS[2] + ';',
    '}',
    // The hovered-while-busy shape: no dots, the real chevron back, same box.
    answering + ':hover::before,',
    answering + ':hover::after {',
    '  content: none;',
    '  animation: none;',
    '}',
    answering + ':hover > svg {',
    '  width: 16px;',
    '  height: 16px;',
    '  background: none;',
    '  border-radius: 0;',
    '  animation: none;',
    '  transform: translateY(2px);',
    '}',
    answering + ':hover > svg > path {',
    '  stroke: currentColor;',
    '}',
    dotKeyframes(),
    // 5. Reduced motion means NOT MOVING, not moving slower: the three dots stay
    //    as a static ellipsis (the state is still legible) and every transition
    //    on this control is dropped.
    '@media (prefers-reduced-motion: reduce) {',
    '  ' + TOBOTTOM_BUTTON + ',',
    '  ' + idle + ' > svg,',
    '  ' + answering + ' > svg,',
    '  ' + answering + ':hover > svg,',
    '  ' + answering + '::before,',
    '  ' + answering + '::after {',
    '    animation: none !important;',
    '    transition: none !important;',
    '    transform: none !important;',
    '  }',
    '}',
  ].join('\n')
}
