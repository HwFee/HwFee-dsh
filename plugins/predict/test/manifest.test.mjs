/**
 * The manifest contract between this package and the Loader.
 *
 * THE SHAPE IS COPIED FROM THE OTHER THREE PLUGINS ON PURPOSE. The failure it
 * guards is silent and it has already happened twice in this repository: a row
 * whose `name` does not resolve to a package never activates, and the plugin
 * simply disappears — no error, no failed startup, just a missing feature.
 *
 * The chain this suite pins:
 *
 *   package.json name  ==  cordis.patch.yml insert[].name
 *   package.json name  ==  the id client/client.js registers with the loader
 *   package.json name  ==  client/src/constants.js PLUGIN_ID
 *   package.json main  ==  an existing file (the Host half)
 *   package.json dsh.bundle.patch  ==  the patch that was just checked
 *   package.json exports / files   ==  entries that actually exist
 *
 * The second row is the one that takes the WHOLE APP down, not just the plugin:
 * the host keys each client row by package name, so a mismatched id makes the
 * loader replay the bundle and die on a duplicate factory registration. A test
 * that only reads YAML cannot see it, which is why the artifact is parsed here.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')
const manifest = JSON.parse(read('package.json'))

/** The `id`/`name` pairs of every row this patch inserts. */
function patchRows(yaml) {
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
  const rows = patchRows(read(rel))
  assert.ok(rows.length > 0, 'the patch inserts no rows, so it can never mount anything')
  for (const row of rows) {
    assert.equal(row.name, manifest.name,
      `row "${row.id}" targets "${row.name}" but this package is "${manifest.name}" — `
      + 'a mismatched name makes the row unresolvable and the plugin silently unmounts')
  }
})

test('the shipped client bundle registers under the package name', async function () {
  const artifact = read('client/client.js')
  const match = /__ModuleLoader__\.load\(\{\s*id:\s*(["'])([^"']+)\1/.exec(artifact)
  assert.ok(match !== null, 'the artifact must register a loader factory with a string id')
  assert.equal(match[2], manifest.name,
    `client/client.js registers "${match[2]}" but this package is "${manifest.name}" — `
    + 'the host keys the client row by the package name, so a different id replays the bundle '
    + 'and web boot dies on a duplicate factory registration')

  const constants = await import('../client/src/constants.js')
  assert.equal(constants.PLUGIN_ID, manifest.name,
    'client/src/constants.js PLUGIN_ID must be the package name (the bundle header is built from package.json)')
})

test('the Host half entry point exists and exports name plus apply', async function () {
  assert.equal(typeof manifest.main, 'string')
  const rel = manifest.main.replace(/^\.\//, '')
  assert.ok(existsSync(join(root, rel)), `main does not exist: ${rel}`)
  assert.ok(!/\.ts$/.test(rel), 'main must point at shipped JavaScript, not TypeScript source')

  // A `name` with no `apply` makes Cordis reject the plugin: the entry becomes a
  // fiber-less zombie row and the client bundle never enters the boot graph —
  // the same "the plugin disappeared" symptom, from a different cause.
  const host = await import('../lib/index.js')
  assert.equal(typeof host.name, 'string', 'the Host half must export a `name`')
  assert.equal(typeof host.apply, 'function', 'the Host half must export an `apply`')
})

test('every exports target that names a file actually exists', function () {
  const exportsMap = manifest.exports || {}
  let checked = 0
  for (const [key, value] of Object.entries(exportsMap)) {
    const target = typeof value === 'string' ? value : value && value.default
    if (typeof target !== 'string') continue
    if (target.includes('*')) continue
    const rel = target.replace(/^\.\//, '')
    assert.ok(existsSync(join(root, rel)), `exports["${key}"] points at a missing file: ${rel}`)
    checked += 1
  }
  assert.ok(checked > 0, 'the exports map exposes nothing checkable')
})

test('the files allowlist ships the runtime pieces and not the build toolchain', function () {
  assert.ok(Array.isArray(manifest.files), 'files must be declared or the tarball ships everything')
  for (const required of ['lib', 'client/client.js', 'cordis.patch.yml', 'icon.svg', 'locale']) {
    assert.ok(manifest.files.includes(required), `files must include ${required}`)
  }
  assert.ok(!manifest.files.includes('client'), 'files must name client/client.js, not the client directory')
  assert.ok(!manifest.files.includes('tools'), 'tools/ is build toolchain, not runtime')
  assert.ok(!manifest.files.includes('test'), 'test/ is not runtime')
})

test('the package is publishable and pinned to the official registry', function () {
  assert.notEqual(manifest.private, true, 'private:true would block publishing')
  assert.equal(manifest.publishConfig?.access, 'public')
  assert.equal(manifest.publishConfig?.registry, 'https://registry.npmjs.org')
})

test('both display locales carry a title and a description', function () {
  // Plugin Manager reads these WITHOUT activating the plugin, so a missing
  // description is what the user sees in the plugin list: a bare name.
  for (const locale of ['en', 'zh']) {
    const dict = JSON.parse(read(`locale/${locale}.json`))
    assert.equal(typeof dict.meta?.title, 'string', `locale/${locale}.json needs meta.title`)
    assert.ok(dict.meta.title.length > 0)
    assert.equal(typeof dict.meta?.description, 'string', `locale/${locale}.json needs meta.description`)
    assert.ok(dict.meta.description.length > 20,
      `locale/${locale}.json meta.description is too short to describe the plugin`)
  }
})

test('the declared icon is a real SVG with a viewBox', function () {
  // An accepted filename does not establish that its bytes render.
  const icon = read('icon.svg')
  assert.match(icon, /<svg[\s>]/, 'icon.svg must contain an svg element')
  assert.match(icon, /viewBox=/, 'icon.svg needs a viewBox so it scales in the plugin list')
  assert.ok(Buffer.byteLength(icon, 'utf8') < 256 * 1024, 'icons are capped at 256 KiB')
})
