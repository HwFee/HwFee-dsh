/**
 * The Host half: it must load, export `name` + `apply`, and report the one host-side
 * failure that is otherwise invisible (a missing or mismatched client artifact).
 *
 * Also asserts the ABSENCE of two things that would be fatal if present:
 *   · a synchronous throw from `apply` (fails the fiber, the startup audit reports
 *     "Failed to load plugins"), and
 *   · any `ctx.` capability use — this half genuinely does nothing, and if it starts
 *     needing the host it should say so explicitly rather than acquire a hidden
 *     dependency on a service that may not exist.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const host = await import('../lib/index.js')

test('the Host half exports name and apply', function () {
  assert.equal(host.name, manifest.name)
  assert.equal(typeof host.apply, 'function', 'without apply the host rejects the plugin and the row becomes a zombie')
  assert.equal(typeof host.default?.apply, 'function', 'the default export is what some loaders read')
})

test('apply() never throws, even with a hostile context', function () {
  const contexts = [
    undefined,
    null,
    {},
    { logger: null },
    { logger: function () { throw new Error('logger factory exploded') } },
    { logger: () => ({ info() { throw new Error('sink exploded') } }) },
  ]
  for (const ctx of contexts) {
    assert.doesNotThrow(() => host.apply(ctx), `apply threw with context ${JSON.stringify(ctx)}`)
  }
})

test('apply() reports readiness through a logger when one exists', function () {
  const lines = []
  host.apply({ logger: (id) => ({ info: (message) => lines.push(id + ' ' + message) }) })
  assert.equal(lines.length, 1, 'exactly one line: silence on success, one report on the artifact check')
  assert.match(lines[0], /@hwfee\/dsh-codex-effort-slider/)
  assert.match(lines[0], /就绪|未通过|不可读/)
})

test('apply() falls back to console.info without a logger', function () {
  const original = console.info
  const lines = []
  console.info = (message) => lines.push(message)
  try {
    host.apply({})
  } finally {
    console.info = original
  }
  assert.equal(lines.length, 1)
})

test('the Host half injects no services and uses no ctx capability', function () {
  const source = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  assert.ok(!/export\s+const\s+inject/.test(code),
    'declaring a service that is never provided leaves the fiber PENDING')
  // The only ctx reads allowed are the optional logger probe.
  for (const match of code.matchAll(/ctx\??\.([A-Za-z_$][\w$]*)/g)) {
    assert.equal(match[1], 'logger', `lib/index.js reaches for ctx.${match[1]}, which this half must not need`)
  }
})

test('the artifact audit is static: it reads the bundle, never executes it', function () {
  const source = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
  assert.ok(!/\bimport\s*\(/.test(source), 'the host half must not dynamically import the client bundle')
  assert.ok(!/new\s+Function|eval\s*\(/.test(source))
})

test('the audit markers match what the built artifact actually contains', function () {
  // The check is only useful if its needles are real. Read the shipped artifact and
  // confirm each marker the host half looks for is present.
  const artifact = readFileSync(join(root, 'client', 'client.js'), 'utf8')
  for (const needle of ['__ModuleLoader__.load', 'return module.exports', 'conversation.input.right']) {
    assert.ok(artifact.includes(needle), `the artifact lacks "${needle}", so the host audit would warn every boot`)
  }
  // `apply` IS exported, but esbuild emits it through its `__export(…)` helper, so the
  // literal `exports.apply` never appears in a bundle built this way. Asserting the literal
  // would assert the build tool's spelling, not the export — and it made the host half warn
  // on every boot.
  assert.equal(host.exportsApply(artifact), true,
    'the artifact must export apply; without it the host rejects the plugin')
  assert.equal(host.exportsApply('var x = 1'), false,
    'the pattern must not match an artifact with no exports at all')
  assert.ok(artifact.includes('id: "' + manifest.name + '"') || artifact.includes('id:"' + manifest.name + '"'),
    'the artifact must register under the package name for the host audit to pass')
})
