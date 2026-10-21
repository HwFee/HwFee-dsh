/**
 * Token closure: every `--cds-*` reference in the emitted sheet must resolve.
 *
 * WHY THIS FILE EXISTS. A CSS declaration that reads an undefined custom property
 * is not a syntax error — the browser keeps the rule and throws the declaration
 * away at computed-value time. The upstream reference project hit this with an
 * undeclared `--cds-dur-*`: `transition: … var(--cds-dur-slow) …` computed to
 * `all 0s`, the animation stopped existing, and nothing anywhere reported it.
 * Selector-based tests cannot see that class of bug, because the selector still
 * matches and the rule is still in the sheet.
 *
 * The first case below is the real check (the shipped sheet). The rest prove the
 * check can actually FAIL — a guard that has never been seen to go red is not a
 * guard. `plugins/cds-theme/package.json` runs the CLI form
 * (`node ../../tools/check-tokens.mjs`) before this file, so a failure is also
 * visible as a build-level exit code 1.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  findUnresolved, checkTokens, formatReport, parseRules, collect, emittedCss, run, OWN_NAMESPACE,
} from '../../../tools/check-tokens.mjs'

const names = (hits) => hits.map(function (hit) { return hit.name })

// ------------------------------------------------------------- the real check

test('the emitted sheet has zero unresolved --cds-* references', function () {
  // Option 1 for wiring: `npm test` in this package runs the checker itself here,
  // through its CLI entry, so the repo does not need a second script that could
  // drift out of sync with this suite. A non-zero return is a build failure.
  assert.equal(run(), 0, 'the CLI must exit 0 for the shipped sheet')

  // `emittedCss()` calls the plugin's own builder, so this asserts about the text
  // that ships — not a copy of it that could drift.
  const css = emittedCss()
  assert.ok(css.length > 2000, 'expected a substantive stylesheet')

  const unresolved = findUnresolved(css, [])
  assert.deepEqual(
    unresolved.map(function (hit) { return hit.name + ' in ' + hit.sites.join(', ') }),
    [],
    'an undefined --cds-* token makes the browser drop the declaration silently',
  )

  // ...and the check is not vacuous: the sheet really does reference its own
  // tokens, and they really are declared in it.
  const { declarations, references } = collect(css)
  const own = [...references.keys()].filter(function (name) { return name.startsWith(OWN_NAMESPACE) })
  assert.ok(own.length > 0, 'the sheet no longer references any --cds-* token, so this check proves nothing')
  for (const name of own) {
    assert.ok(declarations.has(name), name + ' is referenced but never declared')
  }
})

test('the CLI verdict is a PASS with the counts filled in', function () {
  // The counts are the visible half of the skip: `skipped by ns` must be non-zero
  // so a reader sees that host tokens were deliberately not enforced.
  const result = checkTokens()
  assert.equal(result.ok, true)
  assert.equal(result.unresolved.length, 0)
  assert.ok(result.references.names > 0)
  assert.ok(result.declarations > 0)
  assert.ok(result.skipped.names > 0, 'host tokens should be skipped, not silently absent')
  assert.ok(result.skipped.groups.some(function ([ns]) { return ns === '--dsw-*' }))

  const report = formatReport(result).join('\n')
  assert.match(report, /^PASS/m)
  assert.match(report, /unresolved\s+0 names/)
  assert.match(report, /skipped by ns/)
})

// --------------------------------------------------- the check can actually fail

test('an undefined --cds-* reference is reported, with the selector that uses it', function () {
  // THE GUARD-ON-GUARD. This is the upstream bug in miniature: a declaration that
  // references a token nobody declares. If this returns [], the check below (and
  // the whole CLI) is decorative.
  const css = [
    '.md-code-block {',
    '  transition: opacity 200ms var(--cds-does-not-exist);',
    '}',
  ].join('\n')

  const unresolved = findUnresolved(css, [])
  assert.equal(unresolved.length, 1, 'the checker must see the missing token')
  assert.equal(unresolved[0].name, '--cds-does-not-exist')
  assert.deepEqual(unresolved[0].sites, ['.md-code-block'],
    'the report must name where it is referenced, or the fix starts with a grep')
  assert.ok(formatReport(checkTokens({ css: css })).some(function (line) {
    return line.includes('--cds-does-not-exist') && line.includes('.md-code-block')
  }), 'the failure must print one actionable line per unresolved token')
})

test('a declaration inside @media still reports its selector', function () {
  // The sheet nests rules under @media, so the hint has to survive the nesting;
  // a flat scan would report the whole sheet and be useless.
  const css = '@media (hover: hover) {\n  [data-composer-card]:hover { color: var(--cds-missing-in-media); }\n}'
  const unresolved = findUnresolved(css, [])
  assert.deepEqual(names(unresolved), ['--cds-missing-in-media'])
  assert.match(unresolved[0].sites[0], /data-composer-card/)
  assert.match(unresolved[0].sites[0], /@media/)
})

test('a declared token passes, even when declared later in the sheet', function () {
  // CSS custom properties resolve against the cascade, not against the file order,
  // so a forward reference is legitimate and must not be flagged.
  const css = '.a { color: var(--cds-forward) }\n:root { --cds-forward: #fff }'
  assert.deepEqual(findUnresolved(css, []), [])
})

test('an allowlisted token is not reported', function () {
  // The escape hatch exists for tokens another plugin declares at runtime; it must
  // actually silence the check for that one name and nothing else.
  const css = '.a { color: var(--cds-other-plugin) } .b { color: var(--cds-still-missing) }'
  const unresolved = findUnresolved(css, ['--cds-other-plugin'])
  assert.deepEqual(names(unresolved), ['--cds-still-missing'])
})

// ------------------------------------------------------- what must NOT be reported

test('a reference with a fallback is not reported', function () {
  // `var(--cds-nope, 12px)` has a defined value when the token is absent; that is
  // a deliberate degradation, not the silent-drop bug.
  const css = [
    '.a { border-radius: var(--cds-nope, 12px); }',
    '.b { color: var(--cds-also-nope, ) }',
  ].join('\n')
  assert.deepEqual(findUnresolved(css, []), [])
})

test('a host token reference is not reported', function () {
  // `--dsw-*` is declared by the host, not this sheet. Enforcing it would fail on
  // every host token and teach maintainers to ignore the output.
  const css = [
    '.a { color: var(--dsw-alias-label-primary); }',
    '.b { background: var(--dsl-code-block-background); }',
    '.c { transition: color 120ms var(--dsh-code-font-delta, 0px); }',
    '.d { font-family: var(--font-anthropic-sans); }',
  ].join('\n')
  assert.deepEqual(findUnresolved(css, []), [])

  const result = checkTokens({ css: css })
  assert.equal(result.ok, true)
  assert.equal(result.references.own, 0)
  // Skipped, not invisible: the caller can see which namespaces were exempted.
  assert.equal(result.skipped.names, 4)
})

// ------------------------------------------------------------------- plumbing

test('comments cannot create or hide a reference', function () {
  // The sheet is heavily commented and the comments quote token names; parsing
  // them as code would both invent references and "declare" tokens that are not
  // declared (a `--cds-x: value` written in prose).
  const css = [
    '/* .ghost { color: var(--cds-in-a-comment) } */',
    '/* :root { --cds-fake: 1px } */',
    '.real { color: var(--cds-fake) }',
  ].join('\n')
  assert.deepEqual(names(findUnresolved(css, [])), ['--cds-fake'])
  assert.equal(parseRules(css).length, 1, 'only the real rule should be parsed')
})

test('the same missing token in two rules is one failure line', function () {
  // One line per token keeps the build output readable; the sites carry the rest.
  const css = '.a { color: var(--cds-gone) }\n.b { border-color: var(--cds-gone) }'
  const unresolved = findUnresolved(css, [])
  assert.equal(unresolved.length, 1)
  assert.deepEqual(unresolved[0].sites.sort(), ['.a', '.b'])
  assert.equal(unresolved[0].occurrences, 2)
})

test('a var() inside a string is not a reference', function () {
  // Quoted text is content, not a declaration: `content: "var(--cds-x)"` prints
  // those characters literally. Counting it would invent a failure with no fix.
  const css = '.a::before { content: "var(--cds-literal, red)"; }'
  assert.deepEqual(findUnresolved(css, []), [])
  assert.equal(collect(css).references.size, 0, 'the quoted var() must not be counted')
})

test('a declaration inside an at-rule body still counts', function () {
  // `@font-face` / `@property` carry real declarations. If the parser dropped
  // at-rule bodies, a token declared there would look missing.
  const css = [
    '@property --cds-registered { syntax: "<length>"; inherits: false; initial-value: 0px; }',
    '.a { margin: var(--cds-registered); }',
  ].join('\n')
  assert.deepEqual(findUnresolved(css, []), [])
})
