/**
 * Port ZCode's `visualize` design system onto DSH theme tokens.
 *
 * WHAT THIS IS. ZCode ships a 30 KB stylesheet (`assets/visualize.css`, Apache-2.0)
 * that gives a generated UI a complete, coherent component vocabulary: cards,
 * buttons, forms, tabs, tables, progress bars, chart series colours, a carousel.
 * The classes are the same ones its SKILL.md tells the model to use, so importing
 * the sheet is what makes that guidance TRUE here instead of aspirational.
 *
 * WHAT CHANGES IN THE PORT. The sheet's token layer is keyed to ZCode's host
 * variables (`--color-text-primary`, `--gen-ui-card`, …) with `light-dark()`
 * fallbacks. DSH has its own aliases (`--dsw-alias-label-primary`, …) and applies
 * them per theme. Two token systems in one page would give a component the wrong
 * colour in one of the two themes, so the port REPLACES the token block: each
 * ZCode variable is re-pointed at the DSH alias that means the same thing. Every
 * component rule below it is copied byte-for-byte.
 *
 * WHY A SCRIPT AND NOT A ONE-OFF EDIT. The upstream file is Apache-2.0 and may
 * change. Keeping the transform reproducible means a future re-port is a
 * re-run, and the mapping table below is the single place where the two design
 * systems are reconciled — a table a reviewer can check line by line, unlike a
 * hand-merged 30 KB diff.
 *
 * Usage:
 *
 *   node tools/port-visualize-css.mjs <path-to-upstream-visualize.css>
 *
 * Writes `client/src/vendor/visualize.css` and prints a summary. The output is
 * committed; `test/vendor-css.test.mjs` pins the properties that matter.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'client', 'src', 'vendor')
const OUT = join(OUT_DIR, 'visualize.css')

/**
 * ZCode variable → DSH alias.
 *
 * Each row answers one question: "what does this ZCode concept mean in DSH?".
 * The right-hand side is a `--dsw-alias-*` token, never a literal — the plugin
 * must follow the user's theme and any theme plugin they install.
 *
 * `light-dark(...)` fallbacks are deliberately DROPPED. DSH switches tokens on
 * `body[data-ds-dark-theme]`, not on `prefers-color-scheme`, so an imported
 * fallback would be wrong the moment the user picks a theme different from
 * their OS setting.
 */
const TOKENS = {
  // Surfaces. `--background` is the page the visual sits on; in a transcript
  // that is the conversation itself, so it stays transparent.
  'background': 'transparent',
  'foreground': 'var(--dsw-alias-label-primary)',
  'card': 'var(--dsw-alias-bg-layer-2)',
  'card-border': 'var(--dsw-alias-border-l1)',
  'card-foreground': 'var(--dsw-alias-label-primary)',
  'popover': 'var(--dsw-alias-bg-layer-2)',
  'popover-foreground': 'var(--dsw-alias-label-primary)',

  // Actions.
  'primary': 'var(--dsw-alias-brand-primary)',
  'primary-foreground': 'var(--dsw-alias-label-on-brand, #ffffff)',
  'secondary': 'var(--dsw-alias-bg-layer-2)',
  'secondary-foreground': 'var(--dsw-alias-label-primary)',
  'muted': 'var(--dsw-alias-bg-layer-2)',
  'muted-foreground': 'var(--dsw-alias-label-secondary)',
  'accent': 'var(--dsw-alias-bg-layer-2)',
  'accent-foreground': 'var(--dsw-alias-brand-primary)',
  'destructive': 'var(--dsw-alias-state-error-primary, var(--dsw-alias-code-diff-deleted))',

  // Structure.
  'border': 'var(--dsw-alias-border-l1)',
  'input': 'var(--dsw-alias-border-l1)',
  'ring': 'var(--dsw-alias-brand-primary)',

  // Chart series. ZCode derives six from one accent; DSH has one accent, so the
  // ladder is built from it plus the host's state colours. See `SERIES` below.
  'content-accent': 'var(--dsw-alias-brand-primary)',

  // Legacy MCP aliases the sheet also sets, kept pointing at the same place.
  'color-background-primary': 'transparent',
  'color-text-primary': 'var(--dsw-alias-label-primary)',
  'color-border-secondary': 'var(--dsw-alias-border-l1)',
}

/**
 * The six-series chart ladder.
 *
 * ZCode ships six hand-picked hues. DSH has one brand accent and a set of state
 * colours, so the ladder is: brand first, then the state palette in a fixed
 * order. Fixed order matters — a series colour must mean the same thing across
 * redraws, and ZCode's rule is "never give every peer a different colour by
 * default".
 */
const SERIES = [
  'var(--dsw-alias-brand-primary)',
  'var(--dsw-alias-state-warn-primary, #d97706)',
  'var(--dsw-alias-state-success-primary, #16a34a)',
  'var(--dsw-alias-state-business-primary, #2563eb)',
  'var(--dsw-alias-state-error-primary, #dc2626)',
  'var(--dsw-alias-label-secondary)',
]

/** The type scale, in DSH's own size tokens. */
const TYPE = {
  '--font-size-normal': 'var(--dsh-content-font-size, 14px)',
  '--font-size-small': 'var(--dsh-content-font-size-secondary, 13px)',
  '--font-size-xs': 'var(--dsh-content-font-size-caption, 12px)',
  '--font-weight-normal': '400',
  '--font-weight-medium': '500',
  '--font-weight-bold': '600',
  '--line-height-normal': '1.4',
  '--font-sans': 'inherit',
  '--font-mono': 'var(--ds-font-family-code, ui-monospace, monospace)',
}

/**
 * The radius ladder.
 *
 * Upstream does not DEFINE these — it inherits them from the host's CSS, which
 * this port cannot do (the sheet lives in the answer, not in a ZCode page). The
 * result before this block existed: every `border-radius: var(--radius-md)`
 * resolved to nothing, so buttons rendered square while the sheet looked
 * correct. Values mirror DSH's own ladder so a component corner matches the
 * host's cards.
 */
const RADII = {
  '--radius-sm': 'var(--dsw-radius-sm, 6px)',
  '--radius-md': 'var(--dsw-radius-md, 8px)',
  '--radius-lg': 'var(--dsw-radius-lg, 12px)',
  '--radius-xl': 'var(--dsw-radius-xl, 16px)',
  '--radius-full': '999px',
}

/** Rebuild the `:root` token block against DSH aliases. */
function tokenBlock() {
  const lines = [
    '/* ------------------------------------------------------------------ *',
    ' * TOKEN LAYER — ported onto DSH theme tokens.',
    ' *',
    ' * Everything below this block is ZCode\'s component CSS, copied verbatim.',
    ' * Every value here resolves through a --dsw-alias-* token, so a component',
    ' * follows light/dark mode, the CDS theme, and any theme plugin the user',
    ' * installs — none of that needs a rule of its own.',
    ' *',
    ' * `light-dark()` fallbacks are intentionally gone: DSH switches themes on',
    ' * body[data-ds-dark-theme], not on prefers-color-scheme, so an imported',
    ' * fallback would disagree with the user\'s theme choice.',
    ' * ------------------------------------------------------------------ */',
    '/*',
    ' * SCOPED TO THE CARD, NOT :root. Upstream sets these on `:root` because the',
    ' * page belongs to the visual. Here the page belongs to the HOST: `--primary`,',
    ' * `--border` and `--card` are generic enough names that another plugin, or a',
    ' * future host variable, could mean something else by them. Scoping the block',
    ' * to `.dsh-genui-card` keeps the design system inside the answer it styles.',
    ' */',
    '.dsh-genui-card {',
    '  color-scheme: light dark;',
    '',
  ]

  for (const [name, value] of Object.entries(TOKENS)) {
    lines.push(`  --${name}: ${value};`)
  }
  lines.push('')
  for (let index = 0; index < SERIES.length; index += 1) {
    lines.push(`  --viz-series-${index + 1}: ${SERIES[index]};`)
  }
  lines.push('')
  for (const [name, value] of Object.entries(TYPE)) {
    lines.push(`  ${name}: ${value};`)
  }
  for (const [name, value] of Object.entries(RADII)) {
    lines.push(`  ${name}: ${value};`)
  }
  // Every control resolves its corner through `--control-radius`, which upstream
  // sets ONLY on `:is(.card, .widget)` — the nesting-level rule. Our root is
  // neither class, so the variable was empty and every button rendered square
  // while the sheet looked right. The root is the visual's outermost surface, so
  // it owns the large rung, exactly as `.card` does upstream.
  lines.push('  --control-radius: var(--radius-lg);')
  lines.push('  --cursor-interaction: pointer;')
  lines.push('}')
  return lines.join('\n')
}

/**
 * Replace the shadow tokens with DSH's.
 *
 * ZCode builds elevation from colour mixes. DSH has `--dsw-elevation-*`, which the
 * theme owner controls, so mapping to them keeps a popover consistent with the
 * host's own popovers.
 */
function shadowAliases(css) {
  return css
    .replace(/--shadow-sm:\s*[^;]+;/g, '--shadow-sm: none;')
    .replace(/--shadow-md:\s*[^;]+;/g, '--shadow-md: var(--dsw-elevation-soft, 0 1px 2px rgb(0 0 0 / 8%));')
    .replace(/--shadow-lg:\s*[^;]+;/g, '--shadow-lg: var(--dsw-elevation-panel);')
}

/**
 * Flatten the component rules' own `light-dark()` calls.
 *
 * Upstream uses `light-dark()` in a few COMPONENT rules, not just in the token
 * layer (a carousel hover wash and a popover shadow). Those cannot simply be
 * deleted: they are the light value where DSH is light and the dark value where
 * it is dark, and `light-dark()` reads the OS preference rather than the app's
 * theme — so on a light-themed app in a dark OS they would be wrong.
 *
 * The first branch is kept and the second dropped, because DSH's dark-mode
 * variant of these two values is a slightly stronger version of the same effect
 * and the first already reads through a themed token in the common case.
 */
/**
 * Re-point the sheet's root-container selector at our root.
 *
 * Upstream wraps every visual in `#widget` and styles the root's direct children
 * with it — "strip any border, padding and background the root happened to
 * carry". DSH has no such id; the equivalent node is the card root, whose direct
 * children are the answer's own elements. Without this rewrite the rule is
 * dead CSS and a model that puts a border on its root keeps it.
 */
function retargetWidgetRoot(css) {
  // The DIRECT-CHILD rule is the delicate one. `.dsh-genui-card > *` would also
  // hit the plugin's own header and body wrapper, stripping their layout. The
  // rule's actual intent is "the snippet's top-level elements", which is the body
  // element's children — so that one case is retargeted to the body, and the
  // remaining `#widget` references (a descendant SVG, the root state) become the
  // card.
  return css
    .replace(/#widget\s*>\s*:not\(/g, '.dsh-genui-body > :not(')
    .replace(/#widget\b/g, '.dsh-genui-card')
}

/**
 * Scope EVERY selector in the sheet to the card.
 *
 * THE BUG THIS PREVENTS, and it shipped twice. Upstream styles a whole page, so
 * it writes element selectors (`svg`, `h1`, `th`, `code`), page classes
 * (`.table`, `.table-responsive`, `.text-warning`) and attribute selectors
 * without a root. This sheet is injected into the HOST'S page, where every one
 * of those reaches the application: `svg { display: block }` broke the
 * file-mention icon, and the page classes could colour host text (the amber
 * "stopped tool" summary was reported as a genui takeover).
 *
 * The first fix scoped a hand-maintained BARE list; it missed every selector
 * that was not on it. This version scopes the whole rule tree —
 * `@keyframes`/`@font-face` frames keep their bare `from`/`to` selectors,
 * `@media`/`@supports`/`@layer` bodies are processed recursively, and every
 * other selector gets the card prefix unless it already has it.
 *
 * @param {string} css the component section
 * @returns {string} the same rules, all under `.dsh-genui-card`
 */
export function scopeSelectors(css) {
  const SCOPE = '.dsh-genui-card'
  const KEEP_AT = /^@(?:-webkit-)?keyframes\b|^@font-face\b|^@property\b|^@page\b|^@charset\b/

  /** Split a selector list on top-level commas (parens/brackets/quotes aware). */
  function splitSelectors(text) {
    const parts = []
    let depth = 0
    let quote = ''
    let start = 0
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]
      if (quote !== '') {
        if (ch === '\\') i += 1
        else if (ch === quote) quote = ''
        continue
      }
      if (ch === '"' || ch === "'") quote = ch
      else if (ch === '(' || ch === '[') depth += 1
      else if (ch === ')' || ch === ']') depth -= 1
      else if (ch === ',' && depth === 0) {
        parts.push(text.slice(start, i))
        start = i + 1
      }
    }
    parts.push(text.slice(start))
    return parts.map((part) => part.trim()).filter((part) => part !== '')
  }

  function scopeOne(selector) {
    if (selector.startsWith(SCOPE)) return selector
    // `:root`/`html`/`body` mean "the page the visual owned" upstream; here that
    // page is the card root.
    if (/^(:root|html|body)\b/.test(selector)) {
      return selector.replace(/^(:root|html|body)\b/, SCOPE)
    }
    return SCOPE + ' ' + selector
  }

  function process(src) {
    let out = ''
    let pos = 0
    while (pos < src.length) {
      const open = src.indexOf('{', pos)
      if (open === -1) {
        out += src.slice(pos)
        break
      }
      let prelude = src.slice(pos, open)
      // Preserve the whitespace before the selector so the generated file stays
      // reviewable: one rule per block instead of `}.selector` runs.
      const leadWs = (prelude.match(/^\s*/) ?? [''])[0]
      // Comments written between rules belong to the NEXT prelude position;
      // peel them off so the selector rewrite cannot swallow them.
      const comments = []
      prelude = prelude.replace(/\/\*[\s\S]*?\*\//g, (match) => {
        comments.push(match)
        return ''
      })
      const cleaned = prelude.trim()

      let depth = 1
      let end = open + 1
      while (end < src.length && depth > 0) {
        if (src[end] === '{') depth += 1
        else if (src[end] === '}') depth -= 1
        end += 1
      }
      const body = src.slice(open + 1, end - 1)
      const lead = comments.length > 0 ? comments.join('\n') + '\n' : ''

      if (cleaned.startsWith('@')) {
        if (KEEP_AT.test(cleaned)) out += leadWs + lead + cleaned + ' {' + body + '}'
        else out += leadWs + lead + cleaned + ' {' + process(body) + '}'
      } else {
        const scoped = splitSelectors(cleaned).map(scopeOne).join(',\n')
        out += leadWs + lead + scoped + ' {' + body + '}'
      }
      pos = end
    }
    return out
  }

  return process(css)
}

/**
 * Kept as the named entry point the port comments reference. The blanket
 * scoper above supersedes the old hand-maintained list.
 */
export function scopeBareElements(css) {
  return scopeSelectors(css)
}

function flattenLightDark(css) {
  // A regex cannot do this: the arguments are nested functions whose own commas
  // (`color-mix(in srgb, …)`) are indistinguishable from the top-level one.
  // Walk the string, and for each `light-dark(` find the matching close paren and
  // the top-level comma inside it.
  let out = ''
  let index = 0
  const OPEN = 'light-dark('

  for (;;) {
    const start = css.indexOf(OPEN, index)
    if (start === -1) {
      out += css.slice(index)
      break
    }
    out += css.slice(index, start)

    let depth = 1
    let comma = -1
    let cursor = start + OPEN.length
    for (; cursor < css.length && depth > 0; cursor += 1) {
      const ch = css[cursor]
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
      else if (ch === ',' && depth === 1 && comma === -1) comma = cursor
    }
    // cursor now sits just past the closing paren.
    if (depth !== 0 || comma === -1) {
      out += css.slice(start, cursor)
      index = cursor
      continue
    }
    // Keep the light branch; the dark one is only a stronger variant.
    out += css.slice(start + OPEN.length, comma).trim()
    index = cursor
  }
  return out
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])

if (isMain) {
  const upstream = process.argv[2]
  if (upstream === undefined) {
    console.error('usage: node tools/port-visualize-css.mjs <upstream visualize.css>')
    process.exit(2)
  }

  const source = readFileSync(upstream, 'utf8')

  // Everything from the first COMPONENT rule onward is copied as-is. The token
  // layer is the leading `:root { … }` plus the `*`/`html > body` base rules that
  // only re-point variables, which the ported token block replaces.
  const firstComponent = source.search(/^\.(cursor-interaction|btn|card)\b/m)
  if (firstComponent === -1) {
    console.error('could not find the component section; upstream layout changed')
    process.exit(1)
  }
  const components = scopeBareElements(
    retargetWidgetRoot(shadowAliases(flattenLightDark(source.slice(firstComponent)))),
  )

  const header = [
    '/**',
    ' * ZCode `visualize` design system, ported to DSH theme tokens.',
    ' *',
    ' * Upstream: zai-org/ZCode · apps/zcode-cli/packages/visualize-plugin/',
    ' *           skills/visualize/assets/visualize.css',
    ' * License:  Apache-2.0 (see vendor/NOTICE.md)',
    ' *',
    ' * GENERATED by tools/port-visualize-css.mjs — do not hand-edit the component',
    ' * section. To re-port, pass a newer upstream file to that script.',
    ' */',
    '',
  ].join('\n')

  const out = header + tokenBlock() + '\n\n/* ---------- component rules (verbatim from upstream) ---------- */\n\n' + components
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT, out)

  // A `.js` sibling so the bundle can IMPORT the sheet. esbuild has no CSS
  // loader configured here, and adding one would move the stylesheet into a
  // separate asset the host loader does not fetch — the plugin ships one
  // JS file, so the text has to live in it.
  const jsOut = OUT.replace(/\.css$/, '.css.js')
  const banner = '/** Generated by tools/port-visualize-css.mjs — edit the upstream, not this. */\n'
  writeFileSync(jsOut, banner + 'export const VENDOR_CSS = ' + JSON.stringify(out) + '\n')

  const classes = new Set([...out.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]))
  console.log(`wrote ${OUT.replace(ROOT, '.')} (${out.length} bytes)`)
  console.log(`  token variables mapped: ${Object.keys(TOKENS).length}`)
  console.log(`  series colours:         ${SERIES.length}`)
  console.log(`  classes present:        ${classes.size}`)
}
