/**
 * The blank-session home backdrop: a field of faint code glyphs with a water
 * ripple that spreads from every click.
 *
 * WHY THIS FILE EXISTS. The reference repository has no source for this effect
 * (`grep -r 'ripple'` over `.reference/open-claude-ui` finds only the text
 * shimmer), so there is nothing to copy. The behaviour being replicated is the
 * one Anthropic shipped for about a day in the Claude Code desktop app
 * (2.37337.1 → 2.42304.0) and then pulled: on the EMPTY home screen, glowing
 * code symbols behind the folder picker and the prompt bar, rippling outward in
 * circles from each mouse click (anthropics/claude-code#102952). This module is
 * a reconstruction from that description, not a port.
 *
 * WHY A CANVAS. The ripple brightens each glyph by its DISTANCE to the advancing
 * wavefront. That is per-glyph, per-frame state, so it cannot be a stylesheet
 * rule (CSS cannot evaluate distance from a click) and it cannot be one DOM node
 * per glyph without paying a style recalc per frame. One canvas, one rAF, and
 * glyphs that are strokes rather than elements.
 *
 * WHERE IT MOUNTS. Inside `[data-conversation-content]` (the host's conversation
 * body, `.Dc7zOa_body`, `docs/host-hooks.md:83`), as the FIRST child, painted at
 * `z-index: -1` under an `isolation: isolate` that is scoped to the hero phase
 * only (see `heroRippleRules()` in styles.js). That combination is what puts the
 * field BEHIND the composer card instead of on top of the text: a stacking
 * context on the body makes a negative-z child paint above the body's own
 * background and below every in-flow descendant, which is exactly the original
 * layering. The isolation is hero-scoped because the active conversation's
 * sticky composer seat uses `z-index: 7` and must keep competing with the header
 * in the host's own stacking order.
 *
 * WHERE IT IS VISIBLE. Only while `[data-content-phase="hero"]` — the host's own
 * phase attribute for a new/unused session (`conversation.js:17868`;
 * `hero = shellPhase === 'blank'`). An active conversation is untouched: the
 * loop stops, the canvas is hidden by its own rule, and clicks spawn nothing.
 *
 * HOW CLICKS ARRIVE. One `pointerdown` listener on `[data-conversation-content]`,
 * passive and non-capturing: it never calls `preventDefault` and never stops
 * propagation, so every button, the folder picker and the editor keep working.
 * A click ON the composer card still ripples — the listener is on the ancestor,
 * not on the empty background — which is why the card is rendered translucent on
 * a blank session (styles.js, `heroRippleRules`): the wave has to be visible
 * THROUGH the card, the same way the glyphs show through in the original.
 *
 * WHAT TURNS IT OFF
 *   - the setting (`heroRipple`) — the lifecycle stops the module;
 *   - `prefers-reduced-motion: reduce` — the field is drawn once, statically,
 *     with no loop and no ripples at all;
 *   - a hidden document — `visibilitychange` parks the loop;
 *   - a host layout this module does not recognise — `sweep()` returns null and
 *     paints nothing (no layer, no listener), so a future host costs nothing.
 */

/** Marks the canvas this plugin owns. Never a host class. */
export const RIPPLE_ATTR = 'data-cds-hero-ripple'
/** The host's conversation body — carries the phase attribute. */
export const CONTENT_ANCHOR = '[data-conversation-content]'
/** The host's scroll container; its presence is the structural check. */
export const SCROLL_ANCHOR = '[data-conversation-scroll]'
/** `hero` / `active` / `settling` (conversation.js:17868). */
export const PHASE_ATTR = 'data-content-phase'
export const HERO_PHASE = 'hero'

/**
 * The glyph vocabulary: pure syntax marks, never words.
 *
 * WHY NO WORDS. The first version shipped `async`, `await`, `const`, `null` —
 * and at 7% opacity they were still legible enough to be READ, which turns an
 * ambient backdrop into something the eye keeps trying to parse. Worse, they
 * were painted in the body text colour, so they read as stray characters rather
 * than as light. Now: brackets, operators and punctuation only. Nothing resolves
 * into a word, and every glyph is the accent colour, so the field reads as glow.
 */
export const GLYPH_TOKENS = [
  '{', '}', '<', '>', '/', '\\', '=', ';', ':', '(', ')', '[', ']',
  '#', '$', '*', '+', '-', '&', '|', '!', '?', '~', '^', '%', '_', '@', '"',
]

/** The palette used when the theme service cannot be read (tests, a bare host). */
export const FALLBACK_PALETTE = {
  accent: '#d97757',
  text: '#1f1e1d',
  dark: false,
}

/**
 * Every tuned number in one object, so the test can assert the physics without
 * duplicating magic numbers and so a future "slower / fainter" pass is one edit.
 *
 * TUNED FOR "ATMOSPHERE, NOT ARTEFACT". The first pass was legible, dense and
 * hard-edged: dark glyphs at a 92 px pitch with a stroked 1–2.4 px ring read as a
 * radar sweep. The numbers below are the second pass — sparser, dimmer, drawn in
 * the accent colour only, with the ring soft instead of stroked.
 *
 * `cell`      one glyph per ~132×132 px: sparse enough that the eye reads texture.
 * `baseAlpha` resting glyph opacity. Deliberately under 5%: this is a wash of
 *             light behind text, and anything stronger competes with the greeting.
 * `glow`      shadowBlur radius as a multiple of the glyph size. This is what
 *             makes it read as LIGHT rather than as grey text.
 * `waveGain`  how much a passing wavefront adds on top of the resting alpha.
 * `waveSigma` the wavefront's half-thickness in px.
 * `ringLife`  one ripple's full life.
 * `ringAlpha` the travelling ring's peak opacity — a hairline, not a stroke.
 * `idleMs`    frame budget when nothing is animating. The field still breathes,
 *             but at 6 fps instead of 30: identical to the eye, a sixth of the
 *             wakeups. A ripple drops the budget back to `frameMs`.
 */
export const TUNING = {
  cell: 118,
  maxGlyphs: 110,
  baseAlpha: 0.055,
  darkBaseAlpha: 0.075,
  glow: 2.6,
  waveGain: 0.52,
  waveSigma: 150,
  ringLife: 1700,
  maxRadius: 0.58,
  maxRipples: 4,
  ringAlpha: 0.10,
  frameMs: 33,
  idleMs: 160,
  maxDpr: 2,
  /**
   * Refuse a measured backdrop larger than this, in CSS px.
   *
   * A guard against measurement bugs, not a layout limit: a replaced element
   * measured with `getBoundingClientRect()` reports its BITMAP size, so a feedback
   * loop between the bitmap attributes and the measurement grows without bound.
   * 16384 is the ceiling of a single canvas dimension in Chromium anyway.
   */
  maxField: 16384,
}

/** mulberry32 — small, fast, and deterministic so a resize redraws the SAME field. */
export function createRng(seed) {
  let state = (Number(seed) || 1) >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * How many glyphs a backdrop of this size carries.
 *
 * The grid is anchored at the TOP-LEFT with a FIXED cell size (`TUNING.cell`), so
 * growing the window adds glyphs along the right and bottom edges and every
 * existing glyph keeps the position it had. Laying the field out from the total
 * count instead would rescale every cell on each resize and make the backdrop
 * visibly reshuffle whenever the sidebar collapses.
 */
export function gridFor(width, height, tuning) {
  const opts = tuning === undefined ? TUNING : tuning
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (w <= 0 || h <= 0) return { cols: 0, rows: 0, cell: opts.cell, count: 0 }
  const cols = Math.max(1, Math.ceil(w / opts.cell))
  const rows = Math.max(1, Math.ceil(h / opts.cell))
  return { cols: cols, rows: rows, cell: opts.cell, count: cols * rows }
}

/** How many glyphs a backdrop of this size carries (bounded at the top end). */
export function glyphCount(width, height) {
  const grid = gridFor(width, height)
  return Math.min(TUNING.maxGlyphs, grid.count)
}

/**
 * A deterministic glyph field for one backdrop size.
 *
 * Determinism is what keeps a resize from reshuffling the field: the grid starts
 * at the top-left corner at a fixed cell size and the random stream is drawn in
 * row-major order, so the first N glyphs of a larger field are exactly the smaller
 * field's glyphs. Nothing moves when the window grows; glyphs are only added.
 *
 * LOOK, second pass. The first version laid every glyph at nearly the same size on
 * an obvious lattice, which is why the result read as a pattern rather than as
 * atmosphere. Each glyph now carries:
 *
 *   - a wider size spread (9–25 px) so the field has depth without animation;
 *   - a per-glyph resting weight, so some are barely there;
 *   - a small ROTATION, which breaks the lattice without moving any position (the
 *     grid stays stable across resizes); punctuation at 20° reads as scattered
 *     rather than as typeset.
 */
export function layoutGlyphs(width, height, seed) {
  const grid = gridFor(width, height)
  if (grid.count === 0) return []
  const rng = createRng(seed === undefined ? 1 : seed)
  const glyphs = []
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (glyphs.length >= TUNING.maxGlyphs) return glyphs
      const token = GLYPH_TOKENS[Math.floor(rng() * GLYPH_TOKENS.length) % GLYPH_TOKENS.length]
      // Math.min against the field: the last column/row of a grid whose cell size
      // does not divide the width can place a jittered glyph a pixel past the edge,
      // where it would be clipped and read as a missing glyph.
      glyphs.push({
        text: token,
        x: Math.min(width, (col + 0.16 + rng() * 0.68) * grid.cell),
        y: Math.min(height, (row + 0.2 + rng() * 0.62) * grid.cell),
        size: 9 + rng() * 16,
        // A per-glyph resting weight so the field has depth without animation.
        weight: 0.3 + rng() * 0.7,
        // A small tilt: enough to break the lattice, small enough that punctuation
        // still reads as punctuation.
        rotate: (rng() - 0.5) * 0.7,
        phase: rng() * Math.PI * 2,
        drift: 0.4 + rng() * 0.9,
      })
    }
  }
  return glyphs
}

/** One ripple's progress, 0 → 1, clamped. */
export function rippleProgress(ageMs, lifeMs) {
  const life = lifeMs === undefined ? TUNING.ringLife : lifeMs
  if (!(life > 0)) return 1
  return Math.max(0, Math.min(1, (Number(ageMs) || 0) / life))
}

/** Easy-out: the wave leaves fast and settles as it dies, like water. */
export function easeOutCubic(p) {
  const t = Math.max(0, Math.min(1, Number(p) || 0))
  return 1 - Math.pow(1 - t, 3)
}

/** The ripple's radius at one instant, in CSS pixels. */
export function rippleRadius(ageMs, maxRadius, lifeMs) {
  const p = rippleProgress(ageMs, lifeMs)
  return easeOutCubic(p) * (Number(maxRadius) || 0)
}

/**
 * The brightness a single ripple contributes to a glyph `distance` px away.
 *
 * This is the whole effect in one function: a Gaussian band centred on the
 * advancing front, scaled by how much life the ripple has left, so glyphs light up
 * as the front passes over them and fade again behind it.
 *
 * WHY THE DECAY IS 1.6 AND NOT 2. A square decayed to 0.49 by the time the front
 * was 30% of the way out, so the swell was already dim where most of the glyphs
 * live — measured on the first pass, the peak contribution was 1.7% alpha, which
 * is invisible rather than subtle. 1.6 keeps the front bright for the first half
 * of its travel and still collapses cleanly at the end.
 *
 * `waveSigma` is deliberately wide relative to the travel distance: a narrow band
 * would be a readout ("a line is here"), a wide one reads as a swell of light.
 */
export function waveStrength(distance, ageMs, maxRadius, tuning) {
  const opts = tuning === undefined ? TUNING : tuning
  const age = Number(ageMs) || 0
  if (age < 0 || age > opts.ringLife) return 0
  const radius = rippleRadius(age, maxRadius, opts.ringLife)
  const offset = (Number(distance) || 0) - radius
  const sigma = opts.waveSigma
  const band = Math.exp(-(offset * offset) / (2 * sigma * sigma))
  const life = 1 - rippleProgress(age, opts.ringLife)
  return band * Math.pow(life, 1.6) * opts.waveGain
}

/** Total wave contribution at one point, from every live ripple. */
export function totalWave(distance, ageMsList, maxRadius, tuning) {
  let sum = 0
  for (const age of ageMsList) sum += waveStrength(distance, age, maxRadius, tuning)
  return sum
}

/**
 * The resting opacity of one glyph at time `seconds`.
 *
 * Each glyph breathes on its own phase and drift, so the field shimmers without
 * ever looking like it is pulsing in unison. This is the ONLY place the breathing
 * is expressed — `draw()` calls it, so the drawn field and the tests that assert
 * "faint at rest" cannot disagree about the formula.
 */
export function restingAlpha(glyph, seconds, tuning) {
  const opts = tuning === undefined ? TUNING : tuning
  const base = opts.baseAlpha
  const breath = 0.72 + 0.28 * Math.sin(seconds * glyph.drift + glyph.phase)
  return base * glyph.weight * breath
}

/**
 * Read the two colours this layer paints with, from the live document.
 *
 * Both are read from COMPUTED style of the canvas itself, so they are the values
 * the theme service actually applied (including a user accent preset) and not a
 * guess at the palette. The accent can change at runtime — a settings row or the
 * host's own theme switch — so the caller refreshes this on `theme/change` and
 * whenever the dark-mode attribute flips; the loop does not poll it.
 */
export function readPalette(doc, node) {
  const target = node || (doc && doc.body)
  if (!doc || !target || typeof (doc.defaultView ? doc.defaultView.getComputedStyle : null) !== 'function') {
    return Object.assign({}, FALLBACK_PALETTE)
  }
  let computed = null
  try {
    computed = doc.defaultView.getComputedStyle(target)
  } catch (error) {
    return Object.assign({}, FALLBACK_PALETTE)
  }
  if (!computed || typeof computed.getPropertyValue !== 'function') {
    return Object.assign({}, FALLBACK_PALETTE)
  }
  const accent = String(computed.getPropertyValue('--dsw-alias-brand-primary') || '').trim()
  const text = String(computed.getPropertyValue('--dsw-alias-label-primary') || '').trim()
  const dark = !!(doc.body && typeof doc.body.hasAttribute === 'function'
    && doc.body.hasAttribute('data-ds-dark-theme'))
  return {
    accent: accent === '' ? FALLBACK_PALETTE.accent : accent,
    text: text === '' ? (dark ? '#eeede8' : FALLBACK_PALETTE.text) : text,
    dark: dark,
  }
}

/** Whether the user asked for less motion, read once per start(). */
function prefersReducedMotion(view) {
  if (!view || typeof view.matchMedia !== 'function') return false
  let result = null
  try { result = view.matchMedia('(prefers-reduced-motion: reduce)') } catch (error) { result = null }
  return !!(result && result.matches === true)
}

/**
 * Locate the host conversation body and prove the layout is the one this module
 * understands. Returns null for anything else — a missing body, a body with no
 * scroll container, or a body that is no longer in the document.
 */
export function findHeroHost(root) {
  if (!root || typeof root.querySelector !== 'function') return null
  const content = root.querySelector(CONTENT_ANCHOR)
  if (!content || typeof content.querySelector !== 'function') return null
  const scroll = content.querySelector(SCROLL_ANCHOR)
  if (!scroll) return null
  if (typeof content.insertBefore !== 'function') return null
  return { content: content, scroll: scroll }
}

/** Marked canvas currently in the tree, or null. */
function markedCanvas(root) {
  if (!root || typeof root.querySelector !== 'function') return null
  return root.querySelector('[' + RIPPLE_ATTR + ']')
}

/**
 * One backdrop layer for one plugin lifetime.
 *
 * `Observer`, `now` and `raf` are injectable so the whole state machine is
 * testable without a browser; in the app they default to the real ones.
 */
export function createHeroRipple(options) {
  const opts = options || {}
  const doc = opts.doc
  const view = opts.view !== undefined
    ? opts.view
    : (doc && doc.defaultView ? doc.defaultView : null)
  const ObserverImpl = opts.Observer === undefined
    ? (typeof MutationObserver === 'function' ? MutationObserver : null)
    : opts.Observer
  // The size watcher. Observing the canvas is how the module learns its own size
  // WITHOUT reading layout on every frame — a rect read forces layout, and a
  // 30 fps decorative layer has no business doing that.
  const ResizeObserverImpl = opts.ResizeObserver === undefined
    ? (typeof ResizeObserver === 'function' ? ResizeObserver : null)
    : opts.ResizeObserver
  const nowImpl = typeof opts.now === 'function'
    ? opts.now
    : function () {
        if (view && typeof view.performance === 'object' && view.performance !== null
          && typeof view.performance.now === 'function') return view.performance.now()
        return Date.now()
      }

  let started = false
  let host = null
  let canvas = null
  let ctx = null
  let glyphs = []
  let ripples = []
  let palette = Object.assign({}, FALLBACK_PALETTE)
  let paletteDirty = true
  let observer = null
  let sizeObserver = null
  let reduceMotion = false
  let rafId = null
  // -Infinity, not 0: a first frame arriving at timestamp 0 would otherwise be
  // swallowed by the frame budget and the field would stay blank until the second
  // tick. Browsers start `performance.now()` above 0, but a test clock does not,
  // and "the first frame paints" is worth guaranteeing on its own.
  let lastFrame = -Infinity
  /** Set by the ResizeObserver; the loop re-measures only when this is true. */
  let sizeDirty = true
  let fieldW = 0
  let fieldH = 0
  let dpr = 1
  let painted = 0
  const seed = 0x5eed

  function requestFrame(fn) {
    if (view && typeof view.requestAnimationFrame === 'function') {
      return view.requestAnimationFrame(fn)
    }
    return setTimeout(fn, 16)
  }

  function cancelFrame(id) {
    if (id === null) return
    if (view && typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(id)
    else clearTimeout(id)
  }

  function isHero() {
    if (!host || !host.content || typeof host.content.getAttribute !== 'function') return false
    return host.content.getAttribute(PHASE_ATTR) === HERO_PHASE
  }

  /**
   * (Re)measure the canvas.
   *
   * MEASURE THE PARENT, NOT THE CANVAS — this is the fix for a runaway feedback
   * loop that was shipping a 25973×13013 bitmap (≈1.3 GB) into a 1000×742 area.
   *
   * WHY IT RAN AWAY. `<canvas>` is a REPLACED element. With `position: absolute;
   * inset: 0` and `width`/`height` left at `auto` it is NOT stretched to the
   * inset box: a replaced element takes its INTRINSIC size, which is exactly the
   * `width`/`height` ATTRIBUTES — the bitmap dimensions. So measuring the canvas
   * with `getBoundingClientRect()` returned the bitmap size, which was multiplied
   * by devicePixelRatio and written straight back to the attributes, which made
   * the next measurement larger again. Every ResizeObserver tick multiplied the
   * buffer: 450 → 675 → … → 25973. The layer stayed "mounted and visible" the
   * whole time, which is why it looked like nothing was happening.
   *
   * TWO INDEPENDENT GUARDS, because one of them alone is not enough:
   *
   *   1. The stylesheet gives the layer `width: 100%; height: 100%` (styles.js),
   *      so its CSS box comes from the containing block and no longer depends on
   *      the bitmap. That alone breaks the loop.
   *   2. This function measures the PARENT's box, so even a future stylesheet
   *      regression cannot feed bitmap size back into layout.
   *
   * A zero or absurd measurement is refused rather than drawn: the caller keeps
   * waiting, which is the correct behaviour for the frame or two before the host
   * has laid the conversation body out.
   */
  function measure() {
    if (!canvas) return null
    const parent = canvas.parentElement
    // NO FALLBACK TO THE CANVAS ITSELF. Measuring the canvas is the feedback loop:
    // a replaced element reports its bitmap as its layout size, so the write-back
    // would grow the bitmap on every measurement. Without a parent there is no
    // containing block to measure, and the honest answer is "not yet".
    if (!parent || typeof parent.getBoundingClientRect !== 'function') return null
    const rect = parent.getBoundingClientRect()
    const width = Math.round(rect.width || 0)
    const height = Math.round(rect.height || 0)
    if (width <= 0 || height <= 0) return null
    // A backdrop larger than any real window is a measurement bug, never a layout.
    // Refusing it keeps a runaway from allocating gigabytes before it is noticed.
    if (width > TUNING.maxField || height > TUNING.maxField) return null
    return { width: width, height: height }
  }

  function resize(force) {
    if (!canvas) return false
    const size = measure()
    if (size === null) return false
    const width = size.width
    const height = size.height
    const ratio = Math.min(TUNING.maxDpr,
      Math.max(1, Number(view && view.devicePixelRatio) || 1))
    if (!force && width === fieldW && height === fieldH && ratio === dpr) return true
    fieldW = width
    fieldH = height
    dpr = ratio
    // A real canvas: both properties always exist. Assign them unconditionally —
    // the previous `!== undefined` guard made a test double pass while proving
    // nothing about the browser.
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    glyphs = layoutGlyphs(width, height, seed)
    if (ctx && typeof ctx.setTransform === 'function') ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    return true
  }

  function clear() {
    if (ctx && typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, fieldW, fieldH)
    painted = 0
  }

  function refreshPalette() {
    paletteDirty = true
  }

  /** Ensure the palette is current before painting; cheap because it is rare. */
  function currentPalette() {
    if (paletteDirty) {
      palette = readPalette(doc, canvas)
      paletteDirty = false
    }
    return palette
  }

  /**
   * Paint one frame at `timeMs`. Reads module state; writes only canvas + painted.
   *
   * WHAT THE RIPPLE IS, AND WHAT IT IS NOT.
   *
   * The first version drew a stroked circle (`ctx.arc` + `ctx.stroke`) travelling
   * outward at 1–2.4 px. It read as a radar sweep, and rightly so: a hard closed
   * curve moving across a dim field is a UI indicator, not water.
   *
   * The reference repository has no implementation of this effect (grep for
   * `ripple` / `glyph` / `code symbol` over every branch: zero hits), but its ONE
   * ambient-canvas precedent does say how the house draws light —
   * `ReasoningAmbientGlow.tsx` `AmbientLightFieldCanvas`:
   *
   *     const grad1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, r1)
   *     grad1.addColorStop(0,    'rgba(217, 119, 87, 0.12)')
   *     grad1.addColorStop(0.5,  'rgba(217, 119, 87, 0.04)')
   *     grad1.addColorStop(1,    'rgba(217, 119, 87, 0)')
   *     ctx.fillStyle = grad1
   *     ctx.fillRect(0, 0, w, h)
   *
   * Soft radial gradients, never strokes. So the ring is GONE: a click now sends
   * a diffuse front of light outward, and the only thing that marks its position
   * is the glyphs brightening as it passes over them. Nothing is drawn where the
   * field is empty, which is what makes it read as atmosphere rather than as a
   * HUD element.
   *
   * The glyphs themselves are drawn in the ACCENT colour at low alpha with a soft
   * shadow, never in the body text colour: text-coloured glyphs read as stray
   * characters, accent-coloured ones read as glow.
   */
  function draw(timeMs) {
    if (!ctx || fieldW === 0 || fieldH === 0) { painted = 0; return }
    const colors = currentPalette()
    const seconds = timeMs / 1000
    // One tuning object per frame: dark mode only moves the resting alpha.
    const tuning = colors.dark
      ? Object.assign({}, TUNING, { baseAlpha: TUNING.darkBaseAlpha })
      : TUNING
    const maxRadius = Math.max(fieldW, fieldH) * TUNING.maxRadius
    const live = []
    for (const ripple of ripples) {
      const age = timeMs - ripple.born
      if (age < 0 || age > TUNING.ringLife) continue
      live.push({ ripple: ripple, age: age })
    }
    ripples = live.map(function (entry) { return entry.ripple })

    if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, fieldW, fieldH)
    let drawn = 0
    if (typeof ctx.fillText === 'function') {
      // The accent is the only ink. `shadowBlur` is what turns a flat glyph into a
      // point of light; it is set once per frame (it does not vary per glyph) and
      // takes the current colour, so the glow is tinted by the accent for free.
      if ('shadowColor' in ctx) {
        ctx.shadowColor = colors.accent
        ctx.shadowBlur = TUNING.glow * 4
      }
      ctx.fillStyle = colors.accent
      for (const glyph of glyphs) {
        let wave = 0
        for (const entry of live) {
          const dx = glyph.x - entry.ripple.x
          const dy = glyph.y - entry.ripple.y
          wave += waveStrength(Math.sqrt(dx * dx + dy * dy), entry.age, maxRadius)
        }
        const alpha = Math.min(1, restingAlpha(glyph, seconds, tuning) + wave)
        if (alpha <= 0.004) continue
        ctx.globalAlpha = alpha
        ctx.font = String(Math.round(glyph.size)) + 'px ' + (opts.fontFamily || 'ui-monospace, monospace')
        if (glyph.rotate !== 0 && typeof ctx.save === 'function' && typeof ctx.rotate === 'function') {
          // Rotate about the glyph's own origin, then restore: the tilt breaks the
          // lattice, but the glyph POSITIONS stay on the deterministic grid.
          ctx.save()
          ctx.translate(glyph.x, glyph.y)
          ctx.rotate(glyph.rotate)
          ctx.fillText(glyph.text, 0, 0)
          ctx.restore()
        } else {
          ctx.fillText(glyph.text, glyph.x, glyph.y)
        }
        drawn += 1
      }
    }
    ctx.globalAlpha = 1
    if ('shadowBlur' in ctx) ctx.shadowBlur = 0
    painted = drawn
  }

  function frame(timestamp) {
    rafId = null
    if (!started || !isHero()) { clear(); return }
    const time = typeof timestamp === 'number' && isFinite(timestamp) ? timestamp : nowImpl()
    // TWO BUDGETS, not one. With a ripple alive the field needs 30 fps or the
    // swell stutters. With nothing happening it only has to breathe, and 6 fps is
    // indistinguishable at 4% opacity — so an idle home screen costs a sixth of
    // the wakeups it used to. This matters because the backdrop stays mounted for
    // as long as the home screen is open, which is where a user leaves the app.
    const budget = ripples.length > 0 ? TUNING.frameMs : TUNING.idleMs
    if (time - lastFrame < budget - 1) {
      rafId = requestFrame(frame)
      return
    }
    lastFrame = time
    // NOT `resize(false)` here. Measuring per frame forces layout, and a 30 fps
    // backdrop must not force 30 layouts a second. The size arrives from the
    // ResizeObserver instead (`onResize` sets `sizeDirty`); the loop only makes
    // sure a measurement exists at all.
    if (!sizeDirty && fieldW > 0 && fieldH > 0) {
      drawAfterBudget(time)
      rafId = requestFrame(frame)
      return
    }
    sizeDirty = false
    if (!resize(false)) {
      rafId = requestFrame(frame)
      return
    }
    drawAfterBudget(time)
    rafId = requestFrame(frame)
  }

  /** Drop expired ripples, then paint. Split out so the size branch cannot skip it. */
  function drawAfterBudget(time) {
    if (ripples.length > 0) {
      const keep = []
      for (const ripple of ripples) {
        if (time - ripple.born <= TUNING.ringLife) keep.push(ripple)
      }
      ripples = keep
    }
    draw(time)
  }

  function startLoop() {
    if (rafId !== null) return
    if (reduceMotion) {
      // Static field, one paint, no loop and no ripples: reduced motion asked for
      // no movement, not for a slower version of the movement.
      if (resize(true)) draw(nowImpl())
      return
    }
    rafId = requestFrame(frame)
  }

  function stopLoop() {
    cancelFrame(rafId)
    rafId = null
  }

  /** Spawn one ripple at a point in canvas coordinates. */
  function pushRipple(x, y) {
    if (reduceMotion) return false
    const px = Number(x)
    const py = Number(y)
    if (!isFinite(px) || !isFinite(py)) return false
    ripples.push({ x: px, y: py, born: nowImpl() })
    if (ripples.length > TUNING.maxRipples) ripples.splice(0, ripples.length - TUNING.maxRipples)
    startLoop()
    return true
  }

  /** The pointer handler: canvas-local coordinates, no interference with the host. */
  /**
   * The pointer handler: map a client point into the FIELD's coordinate space.
   *
   * The origin is the same element `measure()` reads — the canvas's parent — so
   * the ripple centre and the glyph coordinates are guaranteed to be in one
   * space. Reading the canvas's own rect here was the same trap `measure()`
   * documents: on a replaced element that rect is the BITMAP size, not the CSS
   * box, so the ripple would land at a scaled position.
   */
  function onPointerDown(event) {
    if (!started || !isHero() || !canvas) return
    if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return
    const origin = canvas.parentElement
    if (!origin || typeof origin.getBoundingClientRect !== 'function') return
    const rect = origin.getBoundingClientRect()
    pushRipple(event.clientX - (rect.left || 0), event.clientY - (rect.top || 0))
  }

  function attachLayer(target) {
    const node = doc.createElement('canvas')
    node.setAttribute(RIPPLE_ATTR, '')
    node.setAttribute('aria-hidden', 'true')
    target.insertBefore(node, target.firstChild)
    return node
  }

  function detachLayer() {
    if (sizeObserver) { sizeObserver.disconnect(); sizeObserver = null }
    if (!canvas) return
    if (canvas.parentNode && typeof canvas.parentNode.removeChild === 'function') {
      canvas.parentNode.removeChild(canvas)
    }
    canvas = null
    ctx = null
    fieldW = 0
    fieldH = 0
  }

  /** The size watcher's callback: stop reading layout per frame. */
  function onResize() {
    if (!started) return
    sizeDirty = true
    if (isHero()) startLoop()
  }

  /** Observe the canvas for size changes; a no-op when the browser lacks it. */
  function watchSize(node) {
    if (sizeObserver) { sizeObserver.disconnect(); sizeObserver = null }
    if (!ResizeObserverImpl || !node) return
    try {
      sizeObserver = new ResizeObserverImpl(onResize)
      sizeObserver.observe(node)
    } catch (error) {
      sizeObserver = null
    }
    // Without a ResizeObserver the loop falls back to measuring on its own; the
    // flag below makes that path explicit rather than accidental.
    if (sizeObserver === null) sizeDirty = true
  }

  /** One sweep: make the layer true for the current DOM, or remove it. */
  function sweep() {
    if (!started) return null
    const found = findHeroHost(doc)
    if (!found) {
      if (host && typeof host.content.removeEventListener === 'function') {
        host.content.removeEventListener('pointerdown', onPointerDown)
      }
      detachLayer()
      host = null
      glyphs = []
      clear()
      return null
    }
    // Re-attach the listener whenever the host node changes: the content body is
    // recreated by React on some phase transitions, and a listener left on the
    // detached node would silently stop receiving clicks.
    if (host === null || host.content !== found.content) {
      if (host && typeof host.content.removeEventListener === 'function') {
        host.content.removeEventListener('pointerdown', onPointerDown)
      }
      if (typeof found.content.addEventListener === 'function') {
        found.content.addEventListener('pointerdown', onPointerDown)
      }
    }
    host = found
    const existing = markedCanvas(host.content)
    if (existing === null) {
      detachLayer()
      canvas = attachLayer(host.content)
      if (canvas && typeof canvas.getContext === 'function') ctx = canvas.getContext('2d')
      watchSize(canvas)
    } else if (existing !== canvas) {
      canvas = existing
      if (typeof canvas.getContext === 'function') ctx = canvas.getContext('2d')
      watchSize(canvas)
    }
    paletteDirty = true
    sizeDirty = true
    resize(true)
    if (isHero()) startLoop()
    else { stopLoop(); clear() }
    return canvas
  }

  /**
   * Is the layer still where it belongs?
   *
   * The cheap test the mutation path runs before doing any real work. React
   * re-creating the conversation body is the ONE case a child-list mutation can
   * hurt us, and it shows up here as `canvas.parentNode` no longer being the
   * cached host body. Everything else — a streaming response adding rows, the
   * composer growing a line — leaves this true, and then there is nothing to do.
   */
  function isLayerHealthy() {
    if (!canvas || !host || !host.content) return false
    if (canvas.parentNode !== host.content) return false
    if (typeof host.content.isConnected === 'boolean' && !host.content.isConnected) return false
    return true
  }

  /**
   * Coalesce mutation reactions onto one animation frame.
   *
   * Streaming mutates the chat body continuously; without this every added text
   * element would run a document query and a phase check. One scheduled check per
   * frame is enough, and the check itself is `isLayerHealthy()` — a pointer
   * comparison, not a query (the same discipline as `hero.js`).
   */
  let sweepQueued = false
  function scheduleSweep() {
    if (!started || sweepQueued) return
    sweepQueued = true
    requestFrame(function () {
      sweepQueued = false
      if (!started) return
      if (isLayerHealthy()) return
      sweep()
    })
  }

  function onMutations(records) {
    if (!started) return
    // Only an added element, or the phase attribute, can change anything here.
    if (!records || records.length === 0) { scheduleSweep(); return }
    for (const record of records) {
      if (!record) continue
      if (record.type === 'attributes') {
        if (record.attributeName === PHASE_ATTR) { syncPhase(); return }
        continue
      }
      // THE MOUNT GATE, and the bug it fixes:
      //
      //   `if (!isHero()) continue` was here, and it deadlocked the whole feature.
      //   `isHero()` reads the CACHED host, so before the first successful sweep it
      //   is always false — and the plugin activates before React has rendered the
      //   conversation body at all. Every later mutation therefore hit `continue`,
      //   no sweep ever ran, and the canvas was never mounted: the effect was dead
      //   for the entire session while every unit test passed, because the tests
      //   build the body BEFORE `start()`.
      //
      //   The phase filter is only valid once a layer EXISTS: with the canvas
      //   mounted, a child-list change outside the hero phase genuinely cannot
      //   matter (nothing is painted). Without a layer, an addition is the only
      //   thing that can ever mount one, so it must always be looked at.
      //
      // `isLayerHealthy()` is what keeps streaming cheap — it is a pointer compare,
      // so an active conversation with no layer does one comparison per frame and
      // no document query.
      if (isLayerHealthy()) {
        if (!isHero()) continue
      }
      const added = record.addedNodes || []
      for (const node of added) {
        if (!node) continue
        if (node.nodeType === 3 || node.nodeType === 8) continue
        if (node === canvas) continue
        scheduleSweep()
        return
      }
      const removed = record.removedNodes || []
      for (const node of removed) {
        if (!node) continue
        if (node.nodeType === 3 || node.nodeType === 8) continue
        if (node === canvas) { scheduleSweep(); return }
      }
    }
  }

  /** Phase changed: start or stop the loop without rebuilding anything. */
  function syncPhase() {
    if (!started) return
    if (isHero()) {
      paletteDirty = true
      startLoop()
    } else {
      stopLoop()
      ripples = []
      clear()
    }
  }

  function onVisibility() {
    if (!started) return
    const hidden = !!(doc && doc.visibilityState === 'hidden')
    if (hidden) stopLoop()
    else if (isHero()) startLoop()
    else clear()
  }

  return {
    /** Mount the layer and attach every listener. Idempotent. */
    start() {
      if (started || !doc) return
      started = true
      reduceMotion = prefersReducedMotion(view)
      sweep()
      const Obs = ObserverImpl
      if (Obs && doc.body && typeof Obs === 'function') {
        observer = new Obs(onMutations)
        // `attributes` on the subtree is what catches the host flipping
        // `data-content-phase` on the conversation body; `childList` is what
        // catches React recreating that body.
        observer.observe(doc.body, {
          childList: true, subtree: true, attributes: true, attributeFilter: [PHASE_ATTR],
        })
      }
      if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', onVisibility)
      }
    },

    /** Remove the layer, the listener and the loop. Safe to call twice. */
    stop() {
      if (!started) return
      started = false
      stopLoop()
      if (observer) { observer.disconnect(); observer = null }
      if (host && host.content && typeof host.content.removeEventListener === 'function') {
        host.content.removeEventListener('pointerdown', onPointerDown)
      }
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('visibilitychange', onVisibility)
      }
      ripples = []
      detachLayer()
      host = null
      glyphs = []
    },

    sweep: sweep,
    syncPhase: syncPhase,
    refresh: refreshPalette,
    pushRipple: pushRipple,
    get started() { return started },
    get mounted() { return canvas !== null },
    get canvas() { return canvas },
    get ripples() { return ripples.slice() },
    get glyphs() { return glyphs.slice() },
    get painted() { return painted },
    get reducedMotion() { return reduceMotion },
    /** The palette last read from the live document (tests and verify read it). */
    get palette() { return Object.assign({}, palette) },
  }
}
