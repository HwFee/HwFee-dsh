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
 *   package.json main  ==  an existing file (the Host half)
 *   package.json dsh.bundle.patch  ==  the patch that was just checked
 *   package.json exports map every entry that actually exists
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
  // THE REGRESSION, SECOND HALF. Fixing the patch row is only half a rename.
  // The host composes one client-module row per package, keyed by the package
  // name, and counts that row as arrived only when a factory is registered under
  // the same id. A bundle registering a different id never satisfies its own row:
  // the loader retries it through the one-resource URL, the bundle executes
  // twice, and the retry dies with
  //
  //   client-modules: duplicate factory registration for "<id>"
  //
  // which fails the ENTIRE web boot — the desktop shows "The application could
  // not start or stopped unexpectedly" and nothing is usable. This happened when
  // the sibling plugin was renamed and only its patch row was fixed.
  //
  // Pinning the artifact is the only way to catch it, because the id is written
  // at build time from package.json: a stale build passes every source test.
  const artifact = read('client/client.js')
  const match = /__ModuleLoader__\.load\(\{\s*id:\s*(["'])([^"']+)\1/.exec(artifact)
  assert.ok(match !== null, 'the artifact must register a loader factory with a string id')
  assert.equal(match[2], manifest.name,
    `client/client.js registers "${match[2]}" but this package is "${manifest.name}" — `
    + 'the host keys the client row by the package name, so a different id replays the bundle '
    + 'and web boot dies on a duplicate factory registration')

  // The runtime constant the plugin uses for its own ids is the same string, so a
  // rename cannot half-apply between the bundle header and the source.
  const constants = await import('../client/src/constants.js')
  assert.equal(constants.PLUGIN_ID, manifest.name,
    'client/src/constants.js PLUGIN_ID must be the package name')
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

test('the bundled fonts travel with their licence', function () {
  // THE REGRESSION. The published bundle inlines two SIL OFL faces as base64.
  // OFL condition 2 requires the copyright notice and the licence text to travel
  // with every copy; condition 3 requires a Modified Version to say so. `files`
  // is an allowlist, so adding the notice without adding `licenses` packs
  // nothing, and adding `licenses` without the files packs an empty directory.
  // Neither failure is visible unless the whole `npm pack --dry-run` list is read.
  assert.ok(Array.isArray(manifest.files), 'files must be declared')
  assert.ok(manifest.files.includes('licenses'),
    'files must ship licenses/: the two inlined Noto faces are SIL OFL, and OFL '
    + 'condition 2 requires the copyright notice and licence text with every copy')

  for (const rel of ['licenses/OFL-1.1.txt', 'licenses/NOTICE.md']) {
    assert.ok(existsSync(join(root, rel)), `licence file is missing: ${rel}`)
  }

  // The full licence, not a summary. A truncated OFL text is worse than none:
  // it looks like compliance and is not.
  const ofl = read('licenses/OFL-1.1.txt')
  for (const required of [
    'SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007',
    'PERMISSION & CONDITIONS',
    'TERMINATION',
    'DISCLAIMER',
  ]) {
    assert.ok(ofl.includes(required), `OFL-1.1.txt is missing the "${required}" section`)
  }

  // The notice must carry the copyright holder read out of the shipped faces,
  // and the Reserved Font Name that condition 3 turns on.
  const notice = read('licenses/NOTICE.md')
  assert.ok(notice.includes('Adobe'), 'NOTICE.md must carry the copyright holder')
  assert.ok(/Reserved Font Name/.test(notice),
    'NOTICE.md must state the Reserved Font Name that OFL condition 3 restricts')
})
