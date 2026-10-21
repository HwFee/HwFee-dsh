#!/usr/bin/env node
/**
 * Token-closure check for the cds-theme stylesheet.
 *
 * WHY THIS EXISTS. A CSS declaration that reads an undefined custom property is
 * NOT a syntax error: the declaration is kept in the sheet and dropped at
 * computed-value time. So the rule "exists", the selector matches, the test that
 * greps for the selector passes — and the browser paints nothing. The upstream
 * reference project shipped exactly that: `--cds-dur-*` was never declared, the
 * shimmer's `transition: … var(--cds-dur-slow) …` computed to `all 0s`, and the
 * animation silently stopped existing.
 *
 * WHAT IT CHECKS. It imports the plugin's own CSS builder, so it checks the text
 * that actually ships rather than a copy of it, then requires every `var(--cds-*)`
 * reference to be satisfied by one of:
 *
 *   1. a `--cds-*: …` declaration somewhere in the same emitted sheet,
 *   2. a `var(--cds-x, fallback)` fallback,
 *   3. an entry in ALLOWLIST below (with its "who defines it / what breaks" note).
 *
 * OUT OF SCOPE BY DESIGN. Only `--cds-*` is enforced. `--dsw-*`, `--ds-*` and
 * `--dsl-*` are the host's tokens, and `--dsh-*` (plus `--font-*`, `--shiki-*`)
 * are integration seams that other plugins or the host declare at runtime — this
 * sheet cannot prove those exist, and failing on them would only teach maintainers
 * to ignore the check. They are counted and listed in the output so the skip stays
 * visible instead of becoming a silent hole.
 *
 * Usage: node tools/check-tokens.mjs   (exit 1 on an unresolved `--cds-*` token)
 */

import { pathToFileURL } from 'node:url'

import { buildCssFor } from '../plugins/cds-theme/client/src/styles.js'
import { sanitize } from '../plugins/cds-theme/client/src/constants.js'

/** The plugin's own design-token namespace — the only one this repo can prove. */
export const OWN_NAMESPACE = '--cds-'

/**
 * `--cds-*` references that are deliberately allowed to be unresolved.
 *
 * Every entry must carry a one-line note naming WHO declares it at runtime and
 * WHAT the user loses when it is absent. An entry without that note turns a real
 * bug into a permanent exemption, which is exactly the failure this checker was
 * written to catch.
 *
 * Empty today: every `--cds-*` reference in the emitted sheet resolves against a
 * declaration in the same sheet (`--cds-btn-spring`, `--cds-ease-pulse`). Add
 * here only when the declaration genuinely lives in another plugin.
 */
export const ALLOWLIST = []

/** `var(--name)` / `var(--name, …)`; group 2 is the comma that proves a fallback. */
const VAR_REF = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,)?/g

/**
 * Remove comments and blank out string literals, keeping braces balanced.
 *
 * WHY: the sheet is heavily commented (comments here quote token names and even
 * show declarations), and a comment saying `--cds-x: 4px` would otherwise count
 * as a declaration — i.e. it would HIDE the exact bug this check exists to catch.
 * Strings are blanked for the mirror-image reason: `content: "var(--cds-x)"` is
 * not a reference.
 */
function clean(css) {
  let out = ''
  let i = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end < 0 ? css.length : end + 2
      out += ' '
    } else if (ch === '"' || ch === "'") {
      const quote = ch
      i += 1
      while (i < css.length && css[i] !== quote) i += css[i] === '\\' ? 2 : 1
      i += 1
      out += quote + quote
    } else {
      out += ch
      i += 1
    }
  }
  return out
}

/**
 * Flatten the sheet into `{ selector, atRules, body, isAtRule }` frames.
 *
 * WHY NOT A REGEX. The sheet nests rules inside `@media`, and a ref's hint is
 * only useful if it names the selector the ref sits in. A flat scan would report
 * the whole sheet as one site. At-rule frames are kept (flagged) so their own
 * declarations (`@property`, `@font-face`) still count, and so a `@keyframes`
 * step keeps the at-rule as context.
 */
export function parseRules(css) {
  const text = clean(css)
  const rules = []
  const stack = []
  let buffer = ''

  for (const ch of text) {
    if (ch === '{') {
      stack.push({ prelude: buffer.trim().replace(/\s+/g, ' '), body: '' })
      buffer = ''
    } else if (ch === '}') {
      const frame = stack.pop()
      if (frame !== undefined) {
        // Only frames with DIRECT declarations are collected: a child's text never
        // lands in its parent's `body`, so `@media` (empty direct body) is pure
        // context while `@font-face { src: … }` is a real declaration site. Without
        // this split a nested ref would be counted twice — once at its selector,
        // once at the enclosing `@media`.
        if (frame.body.includes(':')) {
          rules.push({
            selector: frame.prelude,
            atRules: stack.filter(function (f) { return f.prelude.startsWith('@') })
              .map(function (f) { return f.prelude }),
            body: frame.body,
          })
        }
      }
      buffer = ''
    } else {
      buffer += ch
      if (stack.length > 0) stack[stack.length - 1].body += ch
    }
  }
  return rules
}

/** The `--x-*` grouping used to report skips by owner, e.g. `--dsw-*`. */
function namespaceOf(name) {
  const first = name.slice(2).split('-')[0]
  return '--' + first + '-*'
}

function siteOf(rule) {
  // A nested rule is reported as `@media … › selector`, so the fix starts at the
  // right place instead of at the sheet as a whole. An at-rule with its own
  // declarations (`@font-face`) has no enclosing context to prepend.
  return rule.atRules.length > 0
    ? rule.atRules.join(' › ') + ' › ' + rule.selector
    : rule.selector
}

/** Every reference and declaration in the sheet, with the site of each reference. */
export function collect(css) {
  const declarations = new Set()
  const references = new Map() // name -> { occurrences, hasFallback, sites:Set }

  for (const rule of parseRules(css)) {
    for (const m of rule.body.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) declarations.add(m[1])
    // `@property --cds-x { … }` DECLARES the name in its prelude, not its body.
    // Missing this would report a registered property as an undefined token.
    const registered = /^@property\s+(--[A-Za-z0-9_-]+)/.exec(rule.selector)
    if (registered !== null) declarations.add(registered[1])
    for (const m of rule.body.matchAll(VAR_REF)) {
      const name = m[1]
      const entry = references.get(name)
        || { name: name, occurrences: 0, hasFallback: false, sites: new Set() }
      entry.occurrences += 1
      if (m[2] !== undefined) entry.hasFallback = true
      entry.sites.add(siteOf(rule))
      references.set(name, entry)
    }
  }
  return { declarations, references }
}

/**
 * The pure core: which `--cds-*` references in `css` cannot resolve?
 *
 * Returns one entry per unresolved NAME (sorted), each with the rule sites that
 * reference it — one line per token is what a failing build should print.
 */
export function findUnresolved(css, allowlist) {
  const allowed = new Set(allowlist === undefined ? ALLOWLIST : allowlist)
  const { declarations, references } = collect(css)
  const unresolved = []

  for (const entry of references.values()) {
    if (!entry.name.startsWith(OWN_NAMESPACE)) continue
    if (declarations.has(entry.name)) continue
    if (entry.hasFallback) continue
    if (allowed.has(entry.name)) continue
    unresolved.push({ name: entry.name, occurrences: entry.occurrences, sites: [...entry.sites] })
  }
  return unresolved.sort(function (a, b) { return a.name < b.name ? -1 : 1 })
}

/** The sheet under test: what the plugin emits for a default state, fonts omitted. */
export function emittedCss() {
  return buildCssFor(sanitize({}), { omitFonts: true })
}

/** Everything the CLI reports, as data, so a test can assert on it. */
export function checkTokens(options) {
  const opts = options === undefined ? {} : options
  const css = opts.css === undefined ? emittedCss() : opts.css
  const allowlist = opts.allowlist === undefined ? ALLOWLIST : opts.allowlist
  const { declarations, references } = collect(css)

  const own = [...references.values()].filter(function (e) { return e.name.startsWith(OWN_NAMESPACE) })
  const skipped = [...references.values()].filter(function (e) { return !e.name.startsWith(OWN_NAMESPACE) })
  const unresolved = findUnresolved(css, allowlist)

  const skippedByNamespace = new Map()
  for (const entry of skipped) {
    const key = namespaceOf(entry.name)
    const group = skippedByNamespace.get(key) || []
    group.push(entry.name)
    skippedByNamespace.set(key, group)
  }
  for (const names of skippedByNamespace.values()) names.sort()
  const skippedGroups = [...skippedByNamespace.entries()]
    .sort(function (a, b) { return b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1) })

  return {
    ok: unresolved.length === 0,
    bytes: css.length,
    references: {
      names: references.size,
      occurrences: [...references.values()].reduce(function (n, e) { return n + e.occurrences }, 0),
      own: own.length,
    },
    declarations: declarations.size,
    skipped: { names: skipped.length, groups: skippedGroups },
    unresolved,
    allowlist: [...new Set(allowlist)].length,
  }
}

/** Human output: counts always, one line per unresolved token, one-line verdict. */
export function formatReport(result) {
  const lines = []
  lines.push('token closure · dsh-cds-theme (emitted sheet, ' + result.bytes + ' bytes)')
  lines.push('  references        ' + result.references.names + ' names / '
    + result.references.occurrences + ' occurrences (' + result.references.own + ' in '
    + OWN_NAMESPACE + '*)')
  lines.push('  declarations      ' + result.declarations + ' names')
  lines.push('  skipped by ns     ' + result.skipped.names + ' names (not ' + OWN_NAMESPACE
    + '* — host tokens and runtime hooks this sheet cannot prove)')
  for (const [namespace, names] of result.skipped.groups) {
    // Named, not just counted: a silent exemption is the hole this check exists to
    // close. Truncated so a passing run stays one screen; the full list is in
    // `checkTokens().skipped.groups` for anyone who needs it.
    const shown = names.slice(0, 6).join(', ')
    lines.push('    ' + namespace + ' (' + names.length + ') ' + shown
      + (names.length > 6 ? ', +' + (names.length - 6) + ' more' : ''))
  }
  if (result.allowlist > 0) lines.push('  allowlisted       ' + result.allowlist + ' names')
  lines.push('  unresolved        ' + result.unresolved.length + ' names')

  if (result.ok) {
    lines.push('PASS every ' + OWN_NAMESPACE + '* reference resolves (declared, fallback, or allowlisted)')
    return lines
  }

  lines.push('FAIL ' + result.unresolved.length + ' unresolved ' + OWN_NAMESPACE + '* reference'
    + (result.unresolved.length === 1 ? '' : 's'))
  for (const hit of result.unresolved) {
    const sites = hit.sites.slice(0, 3).join(' | ')
    const more = hit.sites.length > 3 ? ' (+' + (hit.sites.length - 3) + ' more)' : ''
    lines.push('  ' + hit.name + '  referenced by: ' + sites + more)
  }
  lines.push('  what breaks: the browser drops any declaration that reads an undefined custom')
  lines.push('  property at computed-value time, so the rule ships but has no effect.')
  lines.push('  fix: add the declaration in client/src/styles.js, add a var(--x, fallback),')
  lines.push('  or allowlist it in tools/check-tokens.mjs with a comment naming who declares it.')
  return lines
}

/** CLI entry. Returns the exit code so `main` stays testable. */
export function run() {
  const result = checkTokens()
  for (const line of formatReport(result)) console.log(line)
  return result.ok ? 0 : 1
}

// Only exit when executed directly — `npm test` imports this module. `pathToFileURL`
// handles Windows drive letters and spaces; a hand-built `file://` string does not.
const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) process.exitCode = run()
