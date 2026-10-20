/**
 * The manifest contract between this package and the Loader.
 *
 * WHY THIS FILE EXISTS. The package was renamed from `dsh-usage-stats` to
 * `@hwfee/dsh-usage-stats` and every test stayed green, but the usage panel
 * vanished from the app. The cause was one line:
 *
 *   cordis.patch.yml ->  name: 'dsh-usage-stats'   (the old, unscoped name)
 *
 * The bundle patch inserts a Loader row whose `name` is resolved to a package.
 * When that name does not exist in the profile, the row cannot resolve, the
 * plugin never mounts, and NOTHING is thrown — no console error, no failed
 * startup, just a missing panel. A rename is exactly the kind of edit that
 * breaks this, because `package.json.name` and the patch's `name` are two
 * separate strings that must agree.
 *
 * So this suite pins the whole chain, not just that one string:
 *
 *   package.json name  ==  cordis.patch.yml insert[].name
 *   package.json name  ==  the id client/client.js registers with the loader
 *   package.json name  ==  client/src/constants.js PLUGIN_ID
 *   package.json main  ==  an existing file (the Host half)
 *   package.json dsh.bundle.patch  ==  the patch that was just checked
 *   package.json exports map every entry that actually exists
 *
 * The second and third rows were added after 0.1.1: fixing the patch name was
 * only half the rename. The client bundle still registered the old unscoped id,
 * the host keys each client row by the package name, so the row never matched
 * its registration, retried through its one-resource URL, executed the bundle
 * twice and threw `client-modules: duplicate factory registration` — the web
 * boot dialog, not a missing panel. A test that only reads YAML cannot see that.
 *
 * It is deliberately cheap: plain reads, no imports of the plugin.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')
const manifest = JSON.parse(read('package.json'))

/** The `name:` values of every row this patch inserts. */
function patchRowNames(yaml) {
  // The dialect this repo uses is a flat `- insert:` list of `id`/`name` pairs.
  // A regex is enough here and keeps the test dependency-free; if the patch
  // ever grows nested groups this will need a real parser, and failing loudly
  // is the right outcome at that point.
  const out = []
  const re = /^\s*-\s*id:\s*(\S+)\s*\r?\n\s*name:\s*['"]?([^'"\r\n]+)['"]?\s*$/gm
  let m = re.exec(yaml)
  while (m !== null) {
    out.push({ id: m[1], name: m[2].trim() })
    m = re.exec(yaml)
  }
  return out
}

test('the bundle patch exists and is the one the manifest declares', function () {
  assert.equal(typeof manifest.dsh?.bundle?.patch, 'string',
    'dsh.bundle.patch is what makes the package installable as a profile layer')
  const rel = manifest.dsh.bundle.patch.replace(/^\.\//, '')
  assert.ok(existsSync(join(root, rel)), `declared patch does not exist: ${rel}`)
})

test('every row the patch inserts names THIS package', function () {
  const rel = manifest.dsh.bundle.patch.replace(/^\.\//, '')
  const rows = patchRowNames(read(rel))
  assert.ok(rows.length > 0, 'the patch inserts no rows, so it can never mount anything')

  for (const row of rows) {
    // THE REGRESSION. After a rename this goes stale silently: the Loader cannot
    // resolve the row to a package, the plugin does not mount, and the feature
    // simply disappears with no error. `@hwfee/dsh-usage-stats` vs
    // `dsh-usage-stats` is exactly that failure.
    assert.equal(row.name, manifest.name,
      `row "${row.id}" targets "${row.name}" but this package is "${manifest.name}" — `
      + 'a mismatched name makes the row unresolvable and the plugin silently unmounts')
  }
})

test('the shipped client bundle registers under the package name', async function () {
  // THE REGRESSION, SECOND HALF. The host composes one client-module row per
  // package, keyed by the package name, and counts that row as arrived only when
  // a factory is registered under the same id. A bundle registering the old
  // unscoped id therefore never satisfies its own row: the loader retries it
  // through the one-resource URL, the bundle executes twice, and the retry dies
  // with `client-modules: duplicate factory registration` — which fails the
  // whole web boot, not just this panel. Pinning the artifact is the only way to
  // catch it, because the id is generated at build time.
  const artifact = read('client/client.js')
  const match = /__ModuleLoader__\.load\(\{\s*id:\s*(["'])([^"']+)\1/.exec(artifact)
  assert.ok(match !== null, 'the artifact must register a loader factory with a string id')
  assert.equal(match[2], manifest.name,
    `client/client.js registers "${match[2]}" but this package is "${manifest.name}" — `
    + 'the host keys the client row by the package name, so a different id replays the bundle '
    + 'and web boot dies on a duplicate factory registration')

  // The runtime name the bundle exposes is the same string; keeping the bundle
  // header and the source constant in step means a rename cannot half-apply.
  const constants = await import('../client/src/constants.js')
  assert.equal(constants.PLUGIN_ID, manifest.name,
    'client/src/constants.js PLUGIN_ID must be the package name (the bundle header is built from package.json)')
})

test('the Host half entry point exists', function () {
  assert.equal(typeof manifest.main, 'string')
  const rel = manifest.main.replace(/^\.\//, '')
  assert.ok(existsSync(join(root, rel)), `main does not exist: ${rel}`)
  assert.ok(!/\.ts$/.test(rel), 'main must point at shipped JavaScript, not TypeScript source')
})

test('every exports target that names a file actually exists', function () {
  const exportsMap = manifest.exports || {}
  const checked = []
  for (const [key, value] of Object.entries(exportsMap)) {
    const target = typeof value === 'string' ? value : value && value.default
    if (typeof target !== 'string') continue
    // Wildcards (`./locale/*.json`) cannot be existence-checked as a literal.
    if (target.includes('*')) continue
    const rel = target.replace(/^\.\//, '')
    assert.ok(existsSync(join(root, rel)), `exports["${key}"] points at a missing file: ${rel}`)
    checked.push(key)
  }
  assert.ok(checked.length > 0, 'the exports map exposes nothing checkable')
})

test('the files allowlist ships the runtime pieces and not the build toolchain', function () {
  assert.ok(Array.isArray(manifest.files), 'files must be declared or the tarball ships everything')
  const files = manifest.files

  // Must ship: the artifact, the Host half, the patch, the icon.
  for (const required of ['lib', 'client/client.js', 'cordis.patch.yml', 'icon.svg']) {
    assert.ok(files.includes(required), `files must include ${required}`)
  }

  // Must NOT ship: sources and toolchain. `client` (the directory) would drag
  // `client/src/` in with it, which is what an earlier version did.
  assert.ok(!files.includes('client'), 'files must name client/client.js, not the client directory')
  assert.ok(!files.includes('tools'), 'tools/ is build toolchain, not runtime')
  assert.ok(!files.includes('test'), 'test/ is not runtime')
})

test('the package is publishable and pinned to the official registry', function () {
  // `private: true` blocks `npm publish`; a mirror registry silently cannot
  // accept one at all.
  assert.notEqual(manifest.private, true, 'private:true would block publishing')
  assert.equal(manifest.publishConfig?.access, 'public')
  assert.equal(manifest.publishConfig?.registry, 'https://registry.npmjs.org')
})
