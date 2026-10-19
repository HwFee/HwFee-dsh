import {
  PLUGIN_ID, STYLE_ID,
  DEFAULT_UI_STACK, DEFAULT_CODE_STACK,
  SCALE_STEPS, clampLineHeight, clampTracking,
} from './constants.js'

// --------------------------------------------------------- CSS building

const UNSAFE_FAMILY_CHARS = /["\\;{}]/g
/**
 * C0/C1 controls and DEL. A raw newline inside a quoted CSS string is a parse
 * error, so a corrupt `localStorage` payload (or a family name read from a font
 * face) could emit a declaration the browser drops. The host's own
 * `normalizeFontFamily` strips exactly this set before a value reaches CSS.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/** Quote a family for a CSS stack; drop anything that could break out. */
export function quoteFamily(name) {
  const clean = String(name == null ? '' : name)
    .replace(UNSAFE_FAMILY_CHARS, '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean === '') return null
  return '"' + clean + '"'
}

/**
 * Build a stack: the chosen family first, then the host's own tail with
 * the chosen family removed so it is not listed twice.
 */
export function buildStack(chosen, fallback) {
  const quoted = quoteFamily(chosen)
  if (quoted === null) return fallback.join(', ')
  const bare = quoted.slice(1, -1).toLowerCase()
  const tail = fallback.filter(function (entry) {
    return entry.replace(/^["']|["']$/g, '').toLowerCase() !== bare
  })
  return [quoted].concat(tail).join(', ')
}

/**
 * Read one whitespace-delimited piece of a `font` shorthand, stopping at
 * whitespace or (optionally) a slash — but only at paren depth 0, so
 * `calc(24px + var(--dsh-content-font-delta))` and `min(calc(13px - 1px),
 * max(13px, calc(13px - 2px)))` survive as single pieces. The host's scale
 * uses exactly those forms, and a naive regex cuts them at the first inner
 * space, which produces an invalid `font` value.
 */
function scanPiece(text, start, stopAtSlash) {
  let depth = 0
  let i = start
  for (; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '(') depth += 1
    else if (ch === ')') { depth -= 1; if (depth < 0) return null }
    else if (depth === 0) {
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\f' || ch === '\r') break
      if (stopAtSlash && ch === '/') break
    }
  }
  if (depth !== 0) return null
  return [text.slice(start, i), i]
}

/** A font-size token: a length/percentage, or a var()/calc()/min()/max()/clamp(). */
function isSizeToken(token) {
  return /^\d+(\.\d+)?(px|rem|em|pt|%)$/.test(token)
    || /^(var|calc|min|max|clamp)\(/.test(token)
}

/**
 * Split the tail of a `font` shorthand into size, optional line-height and
 * family — each piece kept VERBATIM, so `var(...)` size references and
 * `calc(...)` line-heights keep tracking the host's own axes (the content
 * font-size axis in particular).
 *
 * Returns null when the tail is not a shorthand this understands.
 */
export function splitFontTail(text) {
  let i = 0
  while (i < text.length && /\s/.test(text[i])) i += 1
  const size = scanPiece(text, i, true)
  if (size === null || size[0] === '' || !isSizeToken(size[0])) return null
  i = size[1]
  while (i < text.length && /\s/.test(text[i])) i += 1
  let lineHeight = ''
  if (text[i] === '/') {
    let j = i + 1
    while (j < text.length && /\s/.test(text[j])) j += 1
    const lh = scanPiece(text, j, false)
    if (lh === null || lh[0] === '') return null
    lineHeight = lh[0]
    i = lh[1]
  }
  while (i < text.length && /\s/.test(text[i])) i += 1
  return { size: size[0], lineHeight: lineHeight, family: text.slice(i) }
}

/**
 * Multiply one length by a ratio, keeping `var()`/`calc()` intact: a bare
 * length wraps as `calc(len * k)`; anything already `var(...)`/`calc(...)`
 * becomes `calc(... * k)` so the host's font-size axis keeps flowing through.
 * Returns null for a value that is not a single length.
 */
function scaleLength(len, ratio) {
  const s = String(len == null ? '' : len).trim()
  if (s === '') return null
  const k = Math.round(ratio * 1000) / 1000
  if (/^\d+(\.\d+)?(px|rem|em|pt|%)$/.test(s)) return 'calc(' + s + ' * ' + k + ')'
  if (/^(var|calc|min|max|clamp)\(/.test(s)) return 'calc(' + s + ' * ' + k + ')'
  return null
}

/**
 * Rewrite one `font` shorthand changing only its line-height. Every other
 * piece — style keywords, any weight token (the weight belongs to the theme,
 * so it is preserved verbatim rather than re-written), the size and the family
 * — is carried through untouched, which is what keeps a font-size var or a
 * hard-coded family from being frozen into numbers.
 *
 * Returns null when the value has no scalable line-height.
 */
export function rewriteLineHeight(value, ratio) {
  let text = String(value == null ? '' : value).trim()
  if (text === '') return null
  const head = []
  for (;;) {
    const kw = /^(italic|oblique|normal|small-caps|\d{3}|bold|bolder|lighter)\s+/i.exec(text)
    if (kw === null) break
    head.push(kw[1])
    text = text.slice(kw[0].length)
  }
  const tail = splitFontTail(text)
  if (tail === null || tail.lineHeight === '') return null
  const lh = scaleLength(tail.lineHeight, ratio)
  if (lh === null) return null
  const sizeLh = tail.size + '/' + lh
  return head.concat([sizeLh, tail.family]).join(' ')
}

// ------------------------------------------------------- reading the host

/** The token names `buildCss` reads back: each markdown step and its height. */
const MARKDOWN_STEPS = SCALE_STEPS.filter(function (step) { return /^markdown-/.test(step) })

function sourceTokens() {
  const names = []
  for (const step of MARKDOWN_STEPS) {
    names.push('--dsw-font-' + step, '--dsw-font-' + step + '-line-height')
  }
  return names
}

/**
 * The DECLARED values of `names`, collected in ONE pass over the CSSOM.
 *
 * Why this exists: reading one token at a time walked every rule of every
 * sheet per lookup, and a rebuild asks for the 17 markdown steps × 2 tokens.
 * On a 58-sheet × 24-rule document that is 34 × 1,392 = **47,328**
 * `getPropertyValue` calls per rebuild — and the line-height slider commits on
 * every `input` event, so a drag spent ~55–64 ms per second inside the CSSOM.
 * One pass answers all 34 from a map instead, and it only probes the
 * declarations a rule actually carries (via the CSSOM's own index), so rules
 * for ordinary chrome cost nothing at all.
 *
 * THE MATCHING RULES ARE UNCHANGED and load-bearing — the non-compounding
 * invariant ("repeated rebuilds produce byte-identical output") depends on
 * exactly which declaration wins:
 *
 *   1. an INLINE value on `body` wins outright (the theme writes tokens there);
 *   2. otherwise the LAST `body` / `html` / `:root` rule wins ("tight");
 *   3. otherwise the FIRST other rule wins ("loose");
 *   4. disabled sheets, unreadable sheets (`cssRules` throws) and the caller's
 *      own sheet (`skip`, matched by `ownerNode`) are ignored.
 *
 * @param names - token names to collect.
 * @param skip - our own stylesheet node to ignore while rebuilding.
 * @returns Map of name -> declared value ('' when the document has none).
 */
export function collectDeclaredTokens(names, skip) {
  const out = new Map()
  for (const name of names) out.set(name, '')
  if (typeof document === 'undefined') return out
  const wanted = new Set(names)
  const tight = new Map()
  const loose = new Map()

  const body = document.body
  if (body && body.style && typeof body.style.getPropertyValue === 'function') {
    visitStyle(body.style, wanted, (name, value) => out.set(name, value))
  }

  const sheets = document.styleSheets
  if (sheets) {
    for (let i = 0; i < sheets.length; i += 1) {
      const sheet = sheets[i]
      if (!sheet || sheet.disabled === true) continue
      if (skip && sheet.ownerNode === skip) continue
      let rules
      try { rules = sheet.cssRules } catch (error) { continue }
      if (!rules) continue
      for (let j = 0; j < rules.length; j += 1) {
        const rule = rules[j]
        if (!rule || !rule.style || typeof rule.style.getPropertyValue !== 'function') continue
        const isTight = /(^|[\s,])(body|html|:root)([\s,{]|$)/.test(String(rule.selectorText || ''))
        visitStyle(rule.style, wanted, (name, value) => {
          if (out.get(name) !== '') return // an inline value already won
          if (isTight) tight.set(name, value) // last tight wins
          else if (!loose.has(name)) loose.set(name, value) // first loose wins
        })
      }
    }
  }

  for (const name of names) {
    if (out.get(name) !== '') continue
    if (tight.has(name)) out.set(name, tight.get(name))
    else if (loose.has(name)) out.set(name, loose.get(name))
  }
  return out
}

/**
 * Report the wanted declarations a single style object carries.
 *
 * Enumerating via `length`/`item` keeps the pass proportional to what the
 * document DECLARES rather than to (names × rules). A style object without an
 * index (a minimal shim) falls back to probing every wanted name — same
 * answer, just slower.
 */
function visitStyle(style, wanted, visit) {
  if (typeof style.item === 'function' && typeof style.length === 'number') {
    for (let i = 0; i < style.length; i += 1) {
      const name = style.item(i)
      if (!wanted.has(name)) continue
      const value = style.getPropertyValue(name)
      if (value) visit(name, value)
    }
    return
  }
  for (const name of wanted) {
    const value = style.getPropertyValue(name)
    if (value) visit(name, value)
  }
}

/**
 * The declared value of one token — `collectDeclaredTokens` for a single name,
 * with the same precedence. Kept as the public single-token entry point.
 */
export function readDeclaredToken(name, skip) {
  return collectDeclaredTokens([name], skip).get(name) || ''
}

/** The live shorthand / line-height for a step, or null when both are absent. */
function readStep(step, declared, skip) {
  const name = '--dsw-font-' + step
  const heightName = name + '-line-height'
  let shorthand = (declared.get(name) || '').trim()
  let lineHeight = (declared.get(heightName) || '').trim()
  // Last resort: the resolved value. It loses its var() links, but a step is
  // better scaled once than never. A failure here PROPAGATES on purpose — a
  // broken DOM must roll the activation back rather than leave half a
  // stylesheet installed.
  if (shorthand === '' && lineHeight === '') {
    const target = document.body || document.documentElement
    if (target && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const computed = window.getComputedStyle(target)
      shorthand = (computed.getPropertyValue(name) || '').trim()
      lineHeight = (computed.getPropertyValue(heightName) || '').trim()
    }
  }
  if (shorthand === '' && lineHeight === '') return null
  return { shorthand: shorthand, lineHeight: lineHeight }
}

/**
 * The whole stylesheet. Every declaration is `!important` because the host
 * declares its own tokens with its own specificity — see the header.
 *
 * WHAT IT EMITS, and nothing else:
 *
 *   - `--dsw-font-family` / `--ds-font-family-code` when a family is chosen;
 *   - for the markdown content steps, a scaled `-line-height` sub-token and a
 *     shorthand with its `/lh` segment scaled (row spacing);
 *   - one `letter-spacing` rule on the markdown roots, when tracking ≠ 0.
 *
 * NO `font-weight` DECLARATION IS EVER EMITTED. Weights belong to the theme:
 * each step's `font` shorthand carries its own weight, and the theme's tokens
 * decide the hierarchy. The old weight-shift machinery (and its UI) is gone.
 *
 * The selector is `:root, body` because that is where the host declares the
 * scale: base.css puts the 30 steps on `body` and the family tokens on
 * `:root`. A `:root`-only override is dead on arrival — `body`'s own
 * declaration beats an inherited `:root` value no matter how important the
 * inheritance was.
 */
export function buildCss(current) {
  const lines = []
  // A value that cannot be quoted (whitespace only, or nothing but unsafe
  // characters) is "no choice", not the default stack: emitting the fallback
  // here would OVERRIDE a theme that points the token at an embedded face.
  const uiStack = quoteFamily(current.uiFamily) === null ? null : buildStack(current.uiFamily, DEFAULT_UI_STACK)
  const codeStack = quoteFamily(current.codeFamily) === null ? null : buildStack(current.codeFamily, DEFAULT_CODE_STACK)
  const lhRatio = clampLineHeight(current.lineHeightPct) / 100
  const trackingEm = clampTracking(current.trackingEm) / 100

  lines.push('/* ' + PLUGIN_ID + ' — fonts & content spacing; generated, edit in the settings panel */')
  lines.push(':root, body {')
  // A chosen family replaces the token outright; the fallback tail above
  // already carries the host's own families.
  if (uiStack !== null) lines.push('  --dsw-font-family: ' + uiStack + ' !important;')
  if (codeStack !== null) lines.push('  --ds-font-family-code: ' + codeStack + ' !important;')

  // Row spacing rides the content steps: shift each step's own line-height,
  // never a blanket `line-height` on body — that would rescale menus, buttons
  // and every UI row the host sized deliberately.
  if (lhRatio !== 1) {
    // ONE CSSOM pass for every step this rebuild needs, not two walks per step.
    // 每次重建只扫一遍 CSSOM，而不是每步两趟。
    const skip = typeof document === 'undefined' ? null : document.getElementById(STYLE_ID)
    const declared = collectDeclaredTokens(sourceTokens(), skip)
    for (const step of SCALE_STEPS) {
      if (!/^markdown-/.test(step)) continue
      const live = readStep(step, declared, skip)
      if (live === null) continue
      if (live.lineHeight !== '') {
        const lh = scaleLength(live.lineHeight, lhRatio)
        if (lh !== null) {
          lines.push('  --dsw-font-' + step + '-line-height: ' + lh + ' !important;')
        }
      }
      if (live.shorthand) {
        const rewritten = rewriteLineHeight(live.shorthand, lhRatio)
        if (rewritten !== null) lines.push('  --dsw-font-' + step + ': ' + rewritten + ' !important;')
      }
    }
  }
  lines.push('}')

  // Letter-spacing has no token — there is nothing to read back. Apply it as
  // a real property on the content surface only (the markdown blocks and
  // their headings), in `em` so it follows each step's own size.
  if (trackingEm !== 0) {
    const em = trackingEm.toFixed(2).replace(/\.?0+$/, '')
    // The markdown roots carry CSS-Modules hashes (`_markdown_1ypvv_5`,
    // `_markdown_1wejo_28`), not a stable class name — `.markdown-body` was
    // matching nothing at all. Attribute-contains matches the hash whatever
    // the build salts it with, and `letter-spacing` inherits down the tree,
    // so the root alone covers headings, tables and code.
    lines.push('[class*="markdown"] {')
    lines.push('  letter-spacing: ' + em + 'em !important;')
    lines.push('}')
  }
  return lines.join('\n')
}

export function createTypography({ getState }) {
  let active = false

  /** Install or refresh the plugin's single stylesheet. */
  function apply() {
    if (!active) return
    if (typeof document === 'undefined' || !document.head) return
    let tag = document.getElementById(STYLE_ID)
    if (tag === null) {
      tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.dataset.plugin = PLUGIN_ID
      document.head.appendChild(tag)
    }
    const wasDisabled = tag.disabled === true
    tag.disabled = true
    let css
    try {
      css = buildCss(getState())
    } finally {
      tag.disabled = wasDisabled
    }
    if (tag.textContent !== css) tag.textContent = css
  }

  function teardown() {
    active = false
    if (typeof document === 'undefined' || !document.head) return
    const tag = document.getElementById(STYLE_ID)
    if (tag !== null && tag.parentNode) tag.parentNode.removeChild(tag)
  }

  return {
    apply,
    teardown,
    activate() { active = true },
    get active() { return active },
  }
}
