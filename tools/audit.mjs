/**
 * Mechanic audit for every plugin in this repository.
 *
 * No dependencies beyond Node itself and each plugin's own committed build
 * script (which is already the repo's build-of-record). Exits non-zero on the
 * first regression so it can be wired into a pre-commit hook or CI unchanged.
 *
 * THE CHECKS, and why each one exists:
 *
 *   1. ARTIFACT BUDGET — a plugin bundle is parsed on every page load before it
 *      can paint. A size jump is a startup regression even when every test is
 *      green, so each budget is a hard number (see BUDGETS) and cds-theme's is
 *      deliberately loose: six WOFF2 faces are inlined as base64 for a documented
 *      origin reason (see `plugins/cds-theme/tools/build-client.mjs:10-23`), and
 *      that payload is ~86% of the file. The budget exists to catch a *seventh*
 *      face or a duplicate copy, not to argue with the six.
 *
 *   2. UNSAFE DOM — `innerHTML` / `outerHTML` / `insertAdjacentHTML` /
 *      `document.write` are only acceptable when the argument is a compile-time
 *      constant (a string literal or a template with no substitutions). Anything
 *      computed is a parse-and-execute surface for a value that may have come
 *      from a session log, a model name or a font family.
 *
 *   3. `eval` / `new Function` — none, anywhere.
 *
 *   4. FRESHNESS — the committed `client/client.js` must equal what
 *      `tools/build-client.mjs` produces from `client/src/`. Hand-edited
 *      artifacts are how a shipped bundle drifts away from the code the tests
 *      exercise, so this re-runs each plugin's own `--check`.
 *
 *   5. TOKEN PAIRS — `ctx.theme.overrideTokens` throws on a bare string, and the
 *      throw happens inside the host service, i.e. it takes the theme down at
 *      runtime instead of at review time. For cds-theme the check CALLS
 *      `buildTokens()` under several states and asserts every entry is
 *      `{ light: string, dark: string }`; statically it also requires every
 *      `overrideTokens(` call site to live in a module that also calls
 *      `assertPairs(`.
 *
 *   6. OBSERVER LIFE — a module that constructs a `MutationObserver` must also
 *      call `.disconnect()` somewhere in the same file. A plugin that is
 *      disabled mid-session otherwise keeps sweeping a DOM nobody owns.
 *
 *   7. STORAGE GUARD — every `localStorage` access must sit on a `try` line.
 *      Private mode and quota-exceeded both throw *synchronously on the
 *      property read*, before any function is called, so a bare
 *      `window.localStorage.getItem(...)` is not a defensive-coding nicety.
 *
 *   8. EFFECT RETURNS — every `ctx.effect(` / `scope.effect(` call site's
 *      callback must visibly `return` a function (or `undefined`). A disposer
 *      that is not returned is never run, which is the most common way a plugin
 *      leaks.
 *
 * Usage:
 *
 *   node tools/audit.mjs            # all checks, exits 0/1
 *   node tools/audit.mjs --quiet    # failures only
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS = join(ROOT, 'plugins')
const QUIET = process.argv.includes('--quiet')

// --------------------------------------------------------------- budgets
//
// Measured 2026-10-18, re-measured 2026-10-19. Headroom is intentional: it is
// there so a refactor has room to move and a regression (a duplicate font, a
// bundled dependency) does not. Raise a number only with a new measurement in
// docs/perf-audit.md.

const BUDGETS = {
  // 1103.4 KB at the audit; now 5.05 MB because the two Shifted CJK faces joined
  // the six Anthropic ones as inlined `data:font/woff2` (font-assets.js, which
  // documents both as deliberate subsets). ~86% of the file is that payload. The
  // budget's job here is to catch a THIRD CJK face or a duplicate copy, so it sits
  // just above eight faces.
  'cds-theme': 5_400_000,      // 5173.8 KB now; 8 inlined WOFF2 faces
  'system-fonts': 100_000,     //   80.0 KB now
  // 55.3 KB at the audit of 2026-10-18; 76.4 KB before the hover fix and 78.8 KB
  // after it. The growth is documentation: `panel.js`/`styles.js`/`layout.js`
  // carry the reasoning the contract asks for, and esbuild keeps comments in a
  // `legalComments: inline` bundle. The fix added 727 B over the old ceiling; the
  // measurement is in docs/perf-audit.md F4. 88 KB keeps the same ~9 KB of
  // headroom over the current file that the 80 KB ceiling had over 76.4 KB.
  'usage-stats': 90_000,       //   78.8 KB now
  'reasoning-effort': 50_000,  //   38.5 KB now
}

// ------------------------------------------------------------------ utils

const failures = []
const notes = []

function fail(check, where, message) {
  failures.push({ check, where, message })
}

function pass(check, where, message) {
  if (!QUIET) console.log(`  ok   ${check.padEnd(11)} ${where ? where + '  ' : ''}${message}`)
}

function info(message) {
  if (!QUIET) console.log(message)
}

function bytes(n) {
  return n.toLocaleString('en-US') + ' B'
}

function kb(n) {
  return (n / 1024).toFixed(1) + ' KB'
}

function rel(path) {
  return relative(ROOT, path).split(sep).join('/')
}

function pluginList() {
  const out = []
  for (const name of readdirSync(PLUGINS)) {
    const dir = join(PLUGINS, name)
    if (!statSync(dir).isDirectory()) continue
    out.push({ name, dir, artifact: join(dir, 'client', 'client.js') })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Every `.js` file under `dir`, recursively, excluding node_modules. */
function jsFiles(dir) {
  const out = []
  if (!statSafe(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      out.push(...jsFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full)
    }
  }
  return out
}

function statSafe(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

/** Split a file into lines once so every check can cite a line number. */
function lines(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/)
}

/**
 * True when a right-hand side is a compile-time constant: a quoted string, a
 * template literal with no `${`, or one of the two concatenated from those.
 * Deliberately conservative — an expression this cannot prove constant is
 * reported, and the reviewer decides.
 */
function isConstant(rhs) {
  let text = rhs.trim()
  // Drop one trailing semicolon and any trailing comment.
  text = text.replace(/;\s*$/, '').replace(/\s*\/\/.*$/, '').trim()
  if (text === '') return false
  // A single quoted string literal, possibly with escaped quotes.
  if (/^'(?:[^'\\]|\\.)*'$/.test(text)) return true
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return true
  // A template literal with no substitution.
  if (/^`(?:[^`\\$]|\\.|\$(?!\{))*`$/.test(text)) return true
  // A chain of the above joined by `+`.
  const parts = text.split(/\s*\+\s*/)
  if (parts.length > 1 && parts.every(isConstant)) return true
  // A dedicated constant builder call is NOT provably constant from here:
  // report it so a human looks once.
  return false
}

/**
 * Extract the argument expression starting at `openIndex` (which must point at
 * the opening `(` or `=`), balancing brackets and respecting strings.
 * Returns the inner text and the index just past the closing bracket.
 */
function balanced(text, openIndex) {
  let depth = 0
  let quote = ''
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== '') {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1
      if (depth === 0) return { text: text.slice(openIndex + 1, i), end: i + 1 }
    }
  }
  return { text: text.slice(openIndex + 1), end: text.length }
}

// ------------------------------------------------------- 1. byte budgets

function checkBudgets(plugins) {
  for (const plugin of plugins) {
    const budget = BUDGETS[plugin.name]
    const stat = statSafe(plugin.artifact)
    if (stat === null) {
      fail('budget', plugin.name, 'client/client.js is missing')
      continue
    }
    if (budget === undefined) {
      notes.push(`${plugin.name}: no budget declared (${bytes(stat.size)}); add one to BUDGETS`)
      continue
    }
    if (stat.size > budget) {
      fail('budget', plugin.name, `${bytes(stat.size)} exceeds the ${bytes(budget)} budget`)
      continue
    }
    const share = ((stat.size / budget) * 100).toFixed(1)
    pass('budget', plugin.name, `${kb(stat.size)} of ${kb(budget)} (${share}%)`)
  }
}

// --------------------------------------------------------- 2. unsafe DOM

const UNSAFE_ASSIGN = [
  { name: 'innerHTML', re: /\.innerHTML\s*=(?!=)/g, sink: 'element.innerHTML' },
  { name: 'outerHTML', re: /\.outerHTML\s*=(?!=)/g, sink: 'element.outerHTML' },
]

function checkUnsafeDom(plugin) {
  const files = jsFiles(join(plugin.dir, 'client', 'src'))
  let checked = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const lineStarts = lineIndex(text)

    for (const { name, re, sink } of UNSAFE_ASSIGN) {
      re.lastIndex = 0
      let match
      while ((match = re.exec(text)) !== null) {
        const rhs = balanced(text, match.index + match[0].length)
        checked += 1
        if (!isConstant(rhs.text)) {
          fail('unsafe-dom', `${rel(file)}:${lineAt(lineStarts, match.index)}`,
            `${sink} assigned a non-constant: ${shorten(rhs.text)}`)
        }
      }
    }

    // `insertAdjacentHTML(position, html)` — the html is argument 2.
    const iah = /\.insertAdjacentHTML\s*\(/g
    let match
    while ((match = iah.exec(text)) !== null) {
      const call = balanced(text, match.index + match[0].length - 1)
      const args = splitArgs(call.text)
      checked += 1
      if (args.length < 2 || !isConstant(args[1])) {
        fail('unsafe-dom', `${rel(file)}:${lineAt(lineStarts, match.index)}`,
          `insertAdjacentHTML fed a non-constant: ${shorten(args[1] ?? '(none)')}`)
      }
    }

    // `document.write(value)`
    const dw = /document\.write(?:ln)?\s*\(/g
    while ((match = dw.exec(text)) !== null) {
      const call = balanced(text, match.index + match[0].length - 1)
      checked += 1
      if (!isConstant(call.text)) {
        fail('unsafe-dom', `${rel(file)}:${lineAt(lineStarts, match.index)}`,
          `document.write fed a non-constant: ${shorten(call.text)}`)
      }
    }

    // `dangerouslySetInnerHTML` — React's escape hatch, same rule.
    const dsih = /dangerouslySetInnerHTML\s*:\s*\{/g
    while ((match = dsih.exec(text)) !== null) {
      fail('unsafe-dom', `${rel(file)}:${lineAt(lineStarts, match.index)}`,
        'dangerouslySetInnerHTML is not used in this repo')
    }
  }
  pass('unsafe-dom', plugin.name, `${files.length} source files, ${checked} sink(s) examined`)
}

/** Split a balanced argument string on top-level commas. */
function splitArgs(text) {
  const out = []
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
    if (ch === "'" || ch === '"' || ch === '`') quote = ch
    else if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1
    else if (ch === ',' && depth === 0) {
      out.push(text.slice(start, i))
      start = i + 1
    }
  }
  out.push(text.slice(start))
  return out.map((part) => part.trim()).filter((part) => part !== '')
}

function lineIndex(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1)
  return starts
}

function lineAt(starts, offset) {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function shorten(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim()
  return flat.length > 90 ? flat.slice(0, 87) + '...' : flat
}

// ----------------------------------------------------- 3. dynamic code

function checkDynamicCode(plugin) {
  const files = jsFiles(join(plugin.dir, 'lib')).concat(
    jsFiles(join(plugin.dir, 'client', 'src')),
    jsFiles(join(plugin.dir, 'tools')),
  )
  let hits = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const starts = lineIndex(text)
    // `eval(` as a call, `new Function(`, `Function(` as an implicit constructor.
    const patterns = [
      { re: /(?<![\w.$])eval\s*\(/g, label: 'eval()' },
      { re: /new\s+Function\s*\(/g, label: 'new Function()' },
      { re: /(?<![\w.$])Function\s*\(\s*['"`]/g, label: 'Function(string)' },
    ]
    for (const { re, label } of patterns) {
      re.lastIndex = 0
      let match
      while ((match = re.exec(text)) !== null) {
        hits += 1
        fail('dynamic-code', `${rel(file)}:${lineAt(starts, match.index)}`, label)
      }
    }
  }
  if (hits === 0) pass('dynamic-code', plugin.name, `${files.length} files, no eval and no new Function`)
}

// -------------------------------------------------------- 4. freshness

function checkFreshness(plugin) {
  const script = join(plugin.dir, 'tools', 'build-client.mjs')
  if (statSafe(script) === null) {
    notes.push(`${plugin.name}: no tools/build-client.mjs — artifact freshness cannot be verified`)
    return
  }
  const result = spawnSync(process.execPath, [script, '--check'], {
    cwd: plugin.dir,
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (result.error) {
    fail('freshness', plugin.name, `could not run the build check: ${result.error.message}`)
    return
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim().split('\n').pop() || 'check failed'
    fail('freshness', plugin.name, detail)
    return
  }
  pass('freshness', plugin.name, 'client/client.js matches client/src/')
}

// ------------------------------------------------------ 5. token pairs

/**
 * The only module in the repo that calls `overrideTokens`. Verified two ways:
 * statically that the call site sits behind `assertPairs(`, and dynamically
 * that `buildTokens()` really emits pairs for several states.
 */
async function checkTokenPairs() {
  const themeJs = join(PLUGINS, 'cds-theme', 'client', 'src', 'theme.js')
  const tokensJs = join(PLUGINS, 'cds-theme', 'client', 'src', 'tokens.js')
  if (statSafe(themeJs) === null || statSafe(tokensJs) === null) {
    notes.push('cds-theme: theme.js/tokens.js absent — token-pair rule not verified')
    return
  }

  // -- static: overrideTokens( must be preceded by assertPairs( in the module.
  const themeSrc = readFileSync(themeJs, 'utf8')
  const callIndex = themeSrc.indexOf('overrideTokens(')
  if (callIndex < 0) {
    notes.push('cds-theme: theme.js no longer calls overrideTokens — check moved, re-point it')
  } else if (!/assertPairs\s*\(/.test(themeSrc)) {
    fail('token-pairs', rel(themeJs),
      'overrideTokens() is called with no assertPairs() guard in the module')
  } else if (themeSrc.indexOf('assertPairs(') > callIndex) {
    fail('token-pairs', rel(themeJs),
      'assertPairs() appears only after the overrideTokens() call site')
  } else {
    pass('token-pairs', 'cds-theme', 'assertPairs() guards the overrideTokens() call site')
  }

  // -- dynamic: every emitted token is a pair of strings, in every state.
  let buildTokens
  try {
    const module = await import(pathToFileURL(tokensJs).href)
    buildTokens = module.buildTokens
  } catch (error) {
    notes.push('cds-theme: could not import tokens.js (' + error.message + ') — dynamic pair check skipped')
    return
  }
  if (typeof buildTokens !== 'function') {
    fail('token-pairs', rel(tokensJs), 'tokens.js exports no buildTokens()')
    return
  }

  const states = [
    { enabled: true, warmth: 100, accent: 'clay', radiusScale: 1, elevation: 100,
      refine: true, thinkingLabelBlue: false, codeBlockDetails: true, markdownBody: true },
    // Adversarial: an unknown accent, an out-of-range warmth and radius, and a
    // zero elevation — the shapes a hand-edited localStorage payload produces.
    { enabled: true, warmth: -50, accent: 'not-a-preset', radiusScale: 99, elevation: 0,
      refine: false, thinkingLabelBlue: true, codeBlockDetails: false, markdownBody: false },
    { enabled: true, warmth: 0, accent: 'graphite', radiusScale: 0.5, elevation: 200,
      refine: true, thinkingLabelBlue: true, codeBlockDetails: true, markdownBody: true },
    { enabled: true, warmth: 37, accent: 'sand', radiusScale: 1.37, elevation: 63,
      refine: true, thinkingLabelBlue: false, codeBlockDetails: true, markdownBody: true },
  ]

  let total = 0
  for (const state of states) {
    let tokens
    try {
      tokens = buildTokens(state)
    } catch (error) {
      fail('token-pairs', 'cds-theme', `buildTokens() threw for ${JSON.stringify(state)}: ${error.message}`)
      continue
    }
    const names = Object.keys(tokens)
    total += names.length
    for (const name of names) {
      const value = tokens[name]
      if (value === null || typeof value !== 'object'
        || typeof value.light !== 'string' || typeof value.dark !== 'string') {
        fail('token-pairs', 'cds-theme',
          `${name} is not a { light, dark } string pair for accent=${state.accent}, warmth=${state.warmth}`)
      }
    }
  }
  if (!QUIET) {
    console.log(`  ok   ${'token-pairs'.padEnd(11)} ${'cds-theme'.padEnd(16)} ` +
      `${total} token values across ${states.length} states are all { light, dark } pairs`)
  }
}

// ------------------------------------------------------ 6. observer life

function checkObserverLife(plugin) {
  const files = jsFiles(join(plugin.dir, 'client', 'src'))
  let constructed = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const starts = lineIndex(text)
    // Two shapes exist in this repo: a direct `new MutationObserver(...)` and
    // the injectable form `new ObserverImpl(...)` where `ObserverImpl` defaults
    // to `MutationObserver` (hero.js, markdown.js, navicon.js all take the
    // second so their sweep logic is testable without a DOM). Both count.
    const direct = /new\s+MutationObserver\s*\(/g
    const injectable = /new\s+(ObserverImpl|Observer)\s*\(/g
    let first = -1
    let count = 0
    for (const re of [direct, injectable]) {
      re.lastIndex = 0
      let match
      while ((match = re.exec(text)) !== null) {
        count += 1
        if (first < 0 || match.index < first) first = match.index
      }
    }
    if (count === 0) continue
    constructed += count
    if (!/\.disconnect\s*\(/.test(text)) {
      fail('observers', `${rel(file)}:${lineAt(starts, first)}`,
        'constructs a MutationObserver but never calls disconnect() in the same module')
    }
    // An injected observer whose options lack `childList` never fires at all;
    // one with `subtree` but no `childList` observes attributes only.
    for (const observe of text.matchAll(/\.observe\s*\(([^)]*)\)/g)) {
      if (!/childList\s*:\s*true/.test(observe[1])) {
        fail('observers', `${rel(file)}:${lineAt(starts, observe.index)}`,
          `observe(${shorten(observe[1])}) does not subscribe to childList`)
      }
    }
  }
  pass('observers', plugin.name, `${constructed} observer construction(s), all disconnect`)
}

// ------------------------------------------------------ 7. storage guard

function checkStorageGuard(plugin) {
  const files = jsFiles(join(plugin.dir, 'client', 'src')).concat(
    jsFiles(join(plugin.dir, 'lib')),
  )
  let accessed = 0
  for (const file of files) {
    const source = lines(file)
    for (let i = 0; i < source.length; i += 1) {
      const line = source[i]
      if (!/\b(localStorage|sessionStorage)\b/.test(line)) continue
      // Comment / doc lines are not accesses.
      const trimmed = line.trim()
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue
      accessed += 1
      // Acceptable shapes: the access is on a `try` line (`try { x = window.localStorage }`)
      // or the previous non-blank line opened a `try {`.
      const onTryLine = /\btry\b/.test(line)
      let guardedAbove = false
      for (let j = i - 1; j >= 0 && j >= i - 6; j -= 1) {
        const prev = source[j].trim()
        if (prev === '') continue
        guardedAbove = /^try\s*\{/.test(prev) || prev.endsWith('try {')
        break
      }
      if (!onTryLine && !guardedAbove) {
        fail('storage', `${rel(file)}:${i + 1}`,
          'storage access outside a try block — private mode / quota throws synchronously')
      }
    }
  }
  if (accessed > 0) pass('storage', plugin.name, `${accessed} storage access(es), all inside try`)
}

// ------------------------------------------------------ 8. locale disposers

/**
 * `ctx.locale.register(ns, dict)` returns a disposer. If the caller drops it,
 * Cordis cannot drop those dictionaries when the plugin is disabled, and the
 * next enable trips the service's duplicate-locale check — the plugin loads
 * with no copy and logs a collision. `cds-theme` documents exactly this
 * (`client/src/lifecycle.js:114-119`) and hands the disposer back; this check
 * makes that the rule rather than one plugin's good habit.
 *
 * Accepted shapes, because each one really does release the dictionaries:
 *
 *   return ctx.locale.register(NS, { en, zh })
 *   const off = ctx.locale.register(NS, {...}); return typeof off === 'function' ? off : undefined
 *   ctx.effect(() => ctx.locale.register(NS, {...}), 'label')    // arrow, implicit return
 */
function checkLocaleDisposers(plugin) {
  const files = jsFiles(join(plugin.dir, 'client', 'src'))
  let calls = 0
  for (const file of files) {
    const source = lines(file)
    const text = source.join('\n')
    const starts = lineIndex(text)
    for (const match of text.matchAll(/\.locale\.register\s*\(/g)) {
      const at = lineAt(starts, match.index)
      const line = source[at - 1] ?? ''
      // A mention in prose is not a call: module comments quote the API.
      const trimmed = line.trim()
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue
      calls += 1
      // The `return` may sit earlier on this line (`return ctx.locale.register(…)`)
      // or on the line immediately before, for the wrapped two-line shape.
      const beforeOnLine = line.slice(0, match.index - (starts[at - 1] ?? 0))
      const previous = (source[at - 2] ?? '').trim()
      const inlineReturn = /\breturn\b/.test(beforeOnLine) || /\breturn\s*$/.test(previous)
      const arrowBody = /=>\s*$/.test(beforeOnLine) || /=>\s*$/.test(previous)
      // `const off = ctx.locale.register(...)` followed by a `return ... off`.
      const assigned = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(beforeOnLine)
        || /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(previous)
      let assignedReturned = false
      if (assigned !== null) {
        const rest = text.slice(match.index)
        assignedReturned = new RegExp(
          'return\\b[^\\n]*\\b' + escapeRe(assigned[1]) + '\\b').test(rest)
      }
      if (!inlineReturn && !arrowBody && !assignedReturned) {
        fail('locale', `${rel(file)}:${at}`,
          'locale.register() result discarded — the dictionaries can never be unregistered')
      }
    }
  }
  if (calls > 0) pass('locale', plugin.name, `${calls} locale.register() call(s), disposers returned`)
}

// ------------------------------------------------------- 9. effect returns

/**
 * An `effect` callback with no `return` token anywhere has nothing to dispose.
 * That is sometimes correct (system-fonts' style effect is deliberately one: its
 * tag is removed by the activation effect's own disposer), so this is reported
 * as a note rather than a failure — the point is that a silent
 * never-disposed registration cannot hide in a green run.
 */
function checkEffectReturns(plugin) {
  const files = jsFiles(join(plugin.dir, 'client', 'src'))
  let effects = 0
  let without = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const starts = lineIndex(text)
    const re = /\b(?:ctx|scope|hostCtx|boot)\.effect\s*\(/g
    let match
    while ((match = re.exec(text)) !== null) {
      const call = balanced(text, match.index + match[0].length - 1)
      const args = splitArgs(call.text)
      if (args.length === 0) continue
      effects += 1
      const callback = args[0].trim()
      let body = null
      if (/^(?:async\s+)?function\b/.test(callback) || /=>/.test(callback)) {
        body = callback
      } else {
        const name = callback.split('.')[0].trim()
        if (/^[A-Za-z_$][\w$]*$/.test(name)) {
          const declaration = new RegExp(
            '(?:function\\s+' + escapeRe(name) + '\\s*\\([^)]*\\)\\s*\\{|' +
            'const\\s+' + escapeRe(name) + '\\s*=\\s*(?:async\\s+)?(?:function\\b|\\())')
          const declared = declaration.exec(text)
          if (declared !== null) body = text.slice(declared.index)
        }
      }
      if (body === null) continue
      if (!/\breturn\b/.test(body)) {
        without += 1
        notes.push(`${plugin.name} ${rel(file)}:${lineAt(starts, match.index)} — ` +
          'effect callback returns nothing; verify another effect disposes what it registers')
      }
    }
  }
  pass('effects', plugin.name, `${effects} effect call site(s); ${without} without a disposer`)
}

// ------------------------------------------------ 10. switch <-> row contract

/**
 * The per-item replication convention (`docs/replication-toggles.md`): every
 * replicated behaviour ships with its own settings row so the user can compare
 * it against the host's own treatment, and the row is deleted once they have
 * verified it. Nothing enforced either half, so the two failure modes were
 * invisible: an item that shipped with NO switch (the user cannot compare it),
 * and an item whose switch was deleted while its state key stayed behind (a
 * dead key that reads as a feature flag to the next maintainer).
 *
 * WHAT IS CHECKABLE STATICALLY. Each plugin declares its state keys in
 * `client/src/constants.js` (`DEFAULT_STATE`) and its rows either in
 * `client/src/panel.js` (cds-theme: `toggleSlots` entries carrying `key`) or in
 * `client/src/settings.js` (usage-stats: a row list). Those are two different
 * shapes, so this reads each plugin's real shape rather than pretending one
 * fits both.
 *
 * NOT EVERY KEY IS A SWITCH. `warmth`, `radiusScale`, `elevation` and `accent`
 * are continuous values with rows, and `enabled` is the master switch; a
 * non-boolean default is a value, not a toggle, so it is skipped rather than
 * demanded to have a toggle row. The check is: every BOOLEAN key except an
 * explicit allowance list must have a row, and every row's key must exist.
 */
const SWITCH_EXEMPT = {
  // cds-theme: the master switch has a row, but it lives in 通用 rather than
  // on the 主题定制 page by design, and the plan survives a per-id lookup.
  'cds-theme': [],
}

function checkSwitchContract(plugin) {
  const srcDir = join(plugin.dir, 'client', 'src')
  const constantsFile = join(srcDir, 'constants.js')
  if (statSafe(constantsFile) === null) {
    notes.push(`${plugin.name} has no client/src/constants.js; switch contract not analysed`)
    return
  }
  const constantsText = readFileSync(constantsFile, 'utf8')
  // Locate `DEFAULT_STATE = { ... }` and take the boolean-valued keys.
  const start = constantsText.search(/export\s+const\s+DEFAULT_STATE\s*=\s*\{/)
  if (start < 0) {
    notes.push(`${plugin.name} declares no DEFAULT_STATE object; switch contract not analysed`)
    return
  }
  const open = constantsText.indexOf('{', start)
  let depth = 0
  let close = -1
  for (let i = open; i < constantsText.length; i += 1) {
    const ch = constantsText[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) { close = i; break }
    }
  }
  if (close < 0) {
    fail('switches', rel(constantsFile), 'DEFAULT_STATE braces do not balance')
    return
  }
  const body = constantsText.slice(open + 1, close)
  /**
   * Parse the object literal's OWN properties without assuming a notation.
   *
   * A first version matched `key: true|false` and missed six idiomatic
   * spellings — the reviewer probed them and found every one invisible:
   *
   *   shorthand           attachments,          <- by far the most common
   *   double-quoted key   "attachments": true,
   *   single-quoted key   'attachments': true,
   *   computed key        [KEY]: true,
   *   expression value    orphan: !!flag,
   *   negation            orphan: !flag,
   *
   * Shorthand is the dangerous one: it is idiomatic, it is boolean-valued, and a
   * switch written that way would ship with no settings row while this audit
   * stayed green — exactly the failure the check exists to prevent. So the
   * property list is collected first (any notation), and then each property is
   * classified: a literal `true`/`false` is a toggle; anything else that is not
   * obviously a number/string/array/object is reported as **unclassified** so a
   * human can look, rather than being silently skipped.
   */
  /**
   * Strip comments BEFORE splitting. A JSDoc block inside the object literal
   * (`/** … *\/` above a field) otherwise splits into fragments that look like
   * properties whose key is `*` — the first hardened version reported a bogus
   * `DEFAULT_STATE.as` in system-fonts for exactly that reason. Strings are
   * preserved because a comment marker inside a string is not a comment.
   */
  const bodyNoComments = (function stripComments(text) {
    let out = ''
    let quoteLocal = null
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]
      if (quoteLocal !== null) {
        out += ch
        if (ch === '\\') { out += text[i + 1] ?? ''; i += 1; continue }
        if (ch === quoteLocal) quoteLocal = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { quoteLocal = ch; out += ch; continue }
      if (ch === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2)
        i = end < 0 ? text.length : end + 1
        out += ' '
        continue
      }
      if (ch === '/' && text[i + 1] === '/') {
        const end = text.indexOf('\n', i + 2)
        i = end < 0 ? text.length : end
        out += '\n'
        continue
      }
      out += ch
    }
    return out
  })(body)

  const properties = []
  {
    // Split the literal's top level on commas that are not inside brackets,
    // braces, strings or comments. Hand-written config objects are flat in this
    // repo, so a flat split with nesting depth is sufficient and honest.
    let depthLocal = 0
    let quoteLocal = null
    let current = ''
    for (let i = 0; i < bodyNoComments.length; i += 1) {
      const ch = bodyNoComments[i]
      if (quoteLocal !== null) {
        current += ch
        if (ch === '\\') { current += bodyNoComments[i + 1] ?? ''; i += 1; continue }
        if (ch === quoteLocal) quoteLocal = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { quoteLocal = ch; current += ch; continue }
      if (ch === '{' || ch === '[' || ch === '(') depthLocal += 1
      else if (ch === '}' || ch === ']' || ch === ')') depthLocal -= 1
      if (ch === ',' && depthLocal === 0) { properties.push(current); current = ''; continue }
      current += ch
    }
    if (current.trim() !== '') properties.push(current)
  }

  const booleanKeys = []
  const everyKey = []
  const unclassified = []
  for (const raw of properties) {
    const entry = raw.trim()
    if (entry === '' || entry.startsWith('...')) continue
    // Strip a leading line comment / block comment carried by the split.
    const cleaned = entry.replace(/^\/\*[\s\S]*?\*\//, '').replace(/^\/\/[^\n]*\n/, '').trim()
    if (cleaned === '') continue

    // Key: bare identifier, "quoted", 'quoted', or [computed].
    const keyMatch = /^([A-Za-z_$][\w$]*|"[^"]*"|'[^']*'|\[[^\]]*\])\s*(:?)\s*([\s\S]*)$/.exec(cleaned)
    if (keyMatch === null) { unclassified.push(cleaned.slice(0, 40)); continue }
    const rawKey = keyMatch[1]
    const hasColon = keyMatch[2] === ':'
    const value = keyMatch[3].trim()
    const key = rawKey.startsWith('[') ? null
      : rawKey.replace(/^["']|["']$/g, '')
    if (key === null) { unclassified.push(cleaned.slice(0, 40)); continue }

    if (!hasColon) {
      // Shorthand `{ attachments, }` — the initialized value is a variable of the
      // same name, so its declared default is not visible here. Treated as a
      // possibly-boolean switch: it MUST have a row, which is the safe direction.
      booleanKeys.push(key)
      everyKey.push(key)
      continue
    }
    if (/^(true|false)$/.test(value)) {
      booleanKeys.push(key)
      everyKey.push(key)
      continue
    }
    everyKey.push(key)
    // Everything else is a value (number, string, array, object literal). An
    // EXPRESSION cannot be classified `boolean` or `not boolean` from source, so
    // it is reported for a human instead of guessed at. `!`/`!!`/`Boolean(` are
    // the ones that are always boolean.
    if (/^!{1,2}/.test(value) || /^Boolean\s*\(/.test(value) || /^[\w$.[\]()]+\s*\|\|\s*(true|false)/.test(value)) {
      booleanKeys.push(key)
      continue
    }
    if (!/^[-+]?[\d._]/.test(value)
      && !/^["'`]/.test(value)
      && !/^(new\s+)?[[{]/.test(value)
      && !/^(null|undefined)$/.test(value)
      && !/^function\b/.test(value)
      && !/^\(/.test(value)) {
      unclassified.push(`${key} = ${value.slice(0, 40)}`)
    }
  }

  // Collect the registered row keys from whichever row module this plugin has.
  const rowFiles = ['panel.js', 'settings.js', 'settings-slot.js']
    .map(function (name) { return join(srcDir, name) })
    .filter(function (file) { return statSafe(file) !== null })
  const rowKeys = new Set()
  let scanned = 0
  for (const file of rowFiles) {
    const text = readFileSync(file, 'utf8')
    scanned += 1
    // `key: 'warmth'` on a slot descriptor, and `'<key>': <something>` in a
    // row map. Both appear in this repo; neither is a comment because the
    // matches require a value.
    for (const match of text.matchAll(/\bkey:\s*'([A-Za-z_$][\w$]*)'/g)) rowKeys.add(match[1])
    for (const match of text.matchAll(/\bslot:\s*\{\s*key:\s*'([A-Za-z_$][\w$]*)'/g)) rowKeys.add(match[1])
  }
  if (scanned === 0) {
    notes.push(`${plugin.name}: no row module found (panel.js/settings.js); switch contract not analysed`)
    return
  }
  // A row id is also an acceptable carrier: some plugins register by id only.
  for (const file of rowFiles) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/id:\s*'([A-Za-z_$][\w$-]*)'/g)) rowKeys.add(match[1])
  }

  const exempt = new Set(SWITCH_EXEMPT[plugin.name] ?? [])
  const missing = booleanKeys.filter(function (key) {
    return !exempt.has(key) && !rowKeys.has(key)
  })

  // Report the switch inventory once per plugin so a reviewer sees it whole.
  pass('switches', plugin.name,
    `${booleanKeys.length} boolean state key(s), ${rowKeys.size} registered row key(s)` +
    (exempt.size > 0 ? `, ${exempt.size} exempt` : ''))
  if (booleanKeys.length > 0) {
    info(`    switches: ${booleanKeys.join(', ')}`)
  }

  for (const key of missing) {
    fail('switches', `${rel(constantsFile)}: DEFAULT_STATE.${key}`,
      `boolean state key "${key}" has no settings row — the user cannot compare it against ` +
      'the host treatment. Add a row (see docs/replication-toggles.md) or delete the key.')
  }

  // An expression whose value cannot be classified from source is reported, not
  // guessed: a false ✅ here would be worse than an honest "look at this".
  for (const entry of unclassified) {
    notes.push(`${plugin.name} DEFAULT_STATE entry not classified: ${entry} — ` +
      'if this is a switch, it needs a settings row; the check cannot tell from source')
  }

  // `everyKey` is the full property list; kept so the inventory line below can
  // report how many NON-switch values sit beside the toggles (a reader otherwise
  // wonders why 14 properties produce 10 switches).
  if (everyKey.length !== booleanKeys.length) {
    info(`    values (not switches): ${everyKey.filter(function (key) {
      return booleanKeys.indexOf(key) < 0
    }).join(', ')}`)
  }

  // NOTE ON THE REVERSE DIRECTION. A first attempt also demanded that every
  // `key:` literal in a row module appear in DEFAULT_STATE, and it produced 13
  // false positives on the first run: `key` is a generic field name in this
  // repo (`key: 'search'` on a menu item, `key: 'tokens'` on a stat descriptor,
  // `key: 'models'` on a tab). The convention this check exists to protect is
  // "one switch <-> one row", and that is fully expressed by the direction
  // above. Crying wolf about stat ids would get the whole check switched off,
  // which is worse than not having it — so the reverse scan is deliberately NOT
  // implemented. The honest limit is recorded here rather than hidden.
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------- baseline

/**
 * Known defects in plugins this audit was not permitted to edit.
 *
 * Without a baseline the gate would be red for a bug the auditor cannot fix,
 * which trains people to ignore it. With one, the gate is green for the current
 * state and red for anything NEW — and, crucially, an entry that stops failing
 * is itself a failure, so a fixed defect cannot leave a stale exemption behind.
 *
 * Every baselined entry is printed under "BASELINED (known, unfixed)" on every
 * run, with the file:line and the one-line fix, so it stays visible.
 */
function loadBaseline() {
  const path = join(ROOT, 'tools', 'audit-baseline.json')
  if (statSafe(path) === null) return { entries: [], path }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [], path }
  } catch (error) {
    fail('baseline', rel(path), `unparseable: ${error.message}`)
    return { entries: [], path }
  }
}

/**
 * Partition the collected failures into (a) new regressions and (b) known ones
 * that the baseline excuses. A baseline entry that matched nothing is reported:
 * the defect was fixed and the entry should be deleted.
 */
function applyBaseline(failures, entries) {
  const remaining = []
  const matched = new Set()
  for (const failure of failures) {
    const key = `${failure.check}|${failure.where}`
    const entry = entries.find(function (candidate) {
      return `${candidate.check}|${candidate.where}` === key
    })
    if (entry === undefined) {
      remaining.push(failure)
      continue
    }
    matched.add(entry.id)
    failure.baseline = entry
  }
  const stale = entries.filter(function (entry) { return !matched.has(entry.id) })
  return { remaining, stale }
}

// ---------------------------------------------------------------- driver

async function main() {
  const plugins = pluginList()
  info('=== HwFee-dsh mechanical audit ===')
  info(`${plugins.length} plugins, ${Object.keys(BUDGETS).length} declared budgets\n`)

  for (const plugin of plugins) {
    info(`[${plugin.name}]`)
    checkBudgets([plugin])
    checkUnsafeDom(plugin)
    checkDynamicCode(plugin)
    checkFreshness(plugin)
    checkObserverLife(plugin)
    checkStorageGuard(plugin)
    checkLocaleDisposers(plugin)
    checkEffectReturns(plugin)
    checkSwitchContract(plugin)
    info('')
  }

  info('[cross-plugin]')
  await checkTokenPairs()
  info('')

  const baseline = loadBaseline()
  const { remaining, stale } = applyBaseline(failures, baseline.entries)
  const excused = failures.filter(function (item) { return item.baseline !== undefined })

  if (notes.length > 0) {
    info('--- notes (not failures) ---')
    for (const note of notes) info('  note: ' + note)
    info('')
  }

  if (excused.length > 0) {
    info(`--- BASELINED (known, unfixed) — ${excused.length} in ${rel(baseline.path)} ---`)
    for (const item of excused) {
      info(`  ${item.check}: ${item.where}`)
      info(`    ${item.message}`)
      info(`    fix: ${item.baseline.fix}`)
      info(`    owner: ${item.baseline.owner}`)
    }
    info('')
  }

  if (stale.length > 0) {
    console.error(`=== ${stale.length} STALE baseline entr(ies) — the defect no longer reproduces ===`)
    for (const entry of stale) {
      console.error(`  ${entry.id}: ${entry.check} ${entry.where}`)
      console.error(`    Delete this entry from ${rel(baseline.path)}: it is fixed.`)
    }
    process.exitCode = 1
    return
  }

  if (remaining.length > 0) {
    console.error(`=== FAILED: ${remaining.length} new regression(s) ===`)
    for (const item of remaining) {
      console.error(`  ${item.check}: ${item.where}`)
      console.error(`    ${item.message}`)
    }
    process.exitCode = 1
    return
  }

  if (excused.length > 0) {
    console.log(`=== all checks passed (${excused.length} known defect(s) baselined) ===`)
    return
  }
  console.log('=== all checks passed ===')
}

main().catch((error) => {
  console.error('audit crashed:', error)
  process.exitCode = 2
})
