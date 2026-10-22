/**
 * The manifest contract between this package and the Loader.
 *
 * WHY EVERY ROW HERE EXISTS. This repository has shipped two silent failures that
 * looked like "the plugin is broken" and were in fact one string disagreeing with
 * another (AGENTS.md §四):
 *
 *   · a patch row whose `name` did not match the package name — the Loader could not
 *     resolve it, the row never activated, and the feature vanished with NO error;
 *   · a client bundle registering an id other than the package name — the host keys
 *     each client-module row by that name, so the row never matched, the loader
 *     replayed the bundle through its one-resource URL, and web boot died with
 *     `client-modules: duplicate factory registration`.
 *
 * `dsh.client.inject` is the third: without it the bundle's `require('react')` can
 * resolve to nothing on a cold start, `apply` degrades to a permanent no-op, and the
 * plugin is installed and mounted and does absolutely nothing.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')
const manifest = JSON.parse(read('package.json'))

/** The `id`/`name` pairs a flat `- insert:` patch declares. */
function patchRows(yaml) {
  const out = []
  const re = /^\s*-\s*id:\s*(\S+)\s*\r?\n\s*name:\s*['"]?([^'"\r\n]+)['"]?\s*$/gm
  let match = re.exec(yaml)
  while (match !== null) {
    out.push({ id: match[1], name: match[2].trim() })
    match = re.exec(yaml)
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
      `row "${row.id}" targets "${row.name}" but this package is "${manifest.name}" — a mismatched name makes the row unresolvable and the plugin silently unmounts`)
  }
})

test('the shipped client bundle registers under the package name', function () {
  const artifact = read('client/client.js')
  const match = /__ModuleLoader__\.load\(\{\s*id:\s*(["'])([^"']+)\1/.exec(artifact)
  assert.ok(match !== null, 'the artifact must register a loader factory with a string id')
  assert.equal(match[2], manifest.name,
    `client/client.js registers "${match[2]}" but this package is "${manifest.name}" — `
    + 'the host keys the client row by the package name, so a different id replays the bundle and web boot dies on a duplicate registration')
})

test('the client source declares the same id the manifest does', async function () {
  const constants = await import('../client/src/constants.js')
  assert.equal(constants.PLUGIN_ID, manifest.name,
    'client/src/constants.js PLUGIN_ID must be the package name, so a rename cannot half-apply')
  const entry = await import('../client/src/index.js')
  assert.equal(entry.name, manifest.name, 'the client entry exports `name`, which must equal the package name')
})

test('dsh.client declares the host packages this bundle requires', function () {
  // THE COLD-START TRAP. The bundle asks the host's frozen module table for `react`
  // and `react-dom`. If the platform packages that provide them are not declared as
  // client dependencies, that lookup can fail during boot, `apply` degrades to the
  // no-op path, and the plugin is "installed, mounted, and invisible" with no error.
  const inject = manifest.dsh?.client?.inject
  assert.ok(Array.isArray(inject) && inject.length > 0,
    'dsh.client.inject must name the host client packages, not service names')

  const required = [
    '@deepseek-ai/dsh-client-ui-renderer', // the slot/renderer surface
    '@deepseek-ai/dsh-client-ui-conversation', // owns the slot we anchor in
    '@deepseek-ai/dsh-client-ui-model-selection', // owns the menu and the directory we write through
  ]
  for (const id of required) {
    assert.ok(inject.includes(id), `dsh.client.inject must include ${id}`)
  }
  for (const id of inject) {
    assert.ok(id.startsWith('@deepseek-ai/'),
      `${id} looks like a service name; dsh.client.inject takes package ids`)
  }
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.client.immediately, true)
})

test('the Host half entry point exists and is JavaScript', function () {
  assert.equal(typeof manifest.main, 'string')
  const rel = manifest.main.replace(/^\.\//, '')
  assert.ok(existsSync(join(root, rel)), `main does not exist: ${rel}`)
  assert.ok(!/\.ts$/.test(rel), 'main must point at shipped JavaScript, not TypeScript source')
})

test('every exports target that names a file actually exists', function () {
  const checked = []
  for (const [key, value] of Object.entries(manifest.exports || {})) {
    const target = typeof value === 'string' ? value : value && value.default
    if (typeof target !== 'string') continue
    if (target.includes('*')) continue
    const rel = target.replace(/^\.\//, '')
    assert.ok(existsSync(join(root, rel)), `exports["${key}"] points at a missing file: ${rel}`)
    checked.push(key)
  }
  assert.ok(checked.length > 0, 'the exports map exposes nothing checkable')
})

test('the files allowlist ships runtime pieces and the upstream licence', function () {
  const files = manifest.files
  assert.ok(Array.isArray(files), 'files must be declared or the tarball ships everything')
  for (const required of ['lib', 'client/client.js', 'cordis.patch.yml', 'icon.svg', 'licenses']) {
    assert.ok(files.includes(required), `files must include ${required}`)
  }
  // `licenses` is not optional here: the package is an MIT port and the upstream
  // copyright notice has to travel with the redistribution.
  assert.ok(existsSync(join(root, 'licenses', 'UPSTREAM-LICENSE.txt')))
  assert.ok(existsSync(join(root, 'licenses', 'NOTICE.md')))
  const notice = read('licenses/UPSTREAM-LICENSE.txt')
  assert.match(notice, /MIT License/)
  assert.match(notice, /dsh-codex-effort-slider contributors/,
    'the upstream copyright holder must be preserved verbatim')

  assert.ok(!files.includes('client'), 'files must name client/client.js, not the client directory')
  assert.ok(!files.includes('tools'), 'tools/ is build toolchain, not runtime')
  assert.ok(!files.includes('test'), 'test/ is not runtime')
})

test('the package is publishable and pinned to the official registry', function () {
  assert.notEqual(manifest.private, true, 'private:true would block publishing')
  assert.equal(manifest.publishConfig?.access, 'public')
  assert.equal(manifest.publishConfig?.registry, 'https://registry.npmjs.org')
})

/* ─── the attribution record ──────────────────────────────────────────────── */

/**
 * NOTICE.md is the file a future maintainer diffs against upstream v1.1.2. It said
 * `resolveLevels` was a verbatim port while the code had changed its fallback rule, so
 * anyone trusting it would have reverted a fix that upstream never had. These three
 * tests pin the correction; they read the document the way that maintainer would —
 * section by section — instead of grepping the whole file, where a name can legitimately
 * appear in the "changed" list while being absent from the "verbatim" table.
 */
function noticeSections() {
  const notice = read('licenses/NOTICE.md')
  const verbatimAt = notice.indexOf('## 移植自上游的部分')
  const changedAt = notice.indexOf('## 本仓库做的修改')
  assert.ok(verbatimAt >= 0 && changedAt > verbatimAt, 'NOTICE must keep its two sections: verbatim, then changes')
  return {
    notice,
    verbatim: notice.slice(verbatimAt, changedAt),
    changed: notice.slice(changedAt),
  }
}

test('THE REGRESSION: NOTICE does not call resolveLevels a verbatim port', function () {
  // Upstream's `resolveLevels` reused the cache for ANY empty list. This port asks
  // `reasoningSupport()` first, so a model that definitively has no reasoning keeps its
  // empty list instead of inheriting the previous model's levels. Listing it under
  // 「逐字移植」 invites exactly the revert this change exists to prevent.
  //
  // Only TABLE ROWS count as the claim: the section may (and does) name it in prose to
  // say it is excluded, which is the opposite of calling it verbatim.
  const { verbatim } = noticeSections()
  const rows = verbatim.split(/\r?\n/).filter((line) => line.trimStart().startsWith('|'))
  assert.ok(rows.length > 0, 'the verbatim section must still be a table')
  for (const row of rows) {
    assert.ok(!/resolveLevels/.test(row),
      `this port table row claims resolveLevels is verbatim: ${row}`)
  }
})

test('THE REGRESSION: NOTICE records the three-state reasoning judgement and why', function () {
  const { changed } = noticeSections()
  assert.match(changed, /reasoningSupport/,
    'the changes list must name reasoningSupport: without it the "no hidden differences" claim is false')
  assert.match(changed, /resolveLevels/,
    'and it must say where the judgement is consumed')
  // The WHY matters more than the name: the whole point is the momentary-empty window.
  assert.match(changed, /瞬时|短暂|切换模型/, 'it must explain the transient-empty case it exists for')
  assert.match(changed, /OOM|内存/, 'and the failure the old shape actually produced')
  // The two inherited-but-dead exports have to be recorded as inherited, not deleted.
  assert.match(changed, /motionMode/, 'the exported-but-uncalled motionMode must be recorded')
  assert.match(changed, /BASE_SPEEDUP/, 'the unreferenced BASE_SPEEDUP must be recorded')
  assert.match(changed, /继承自上游/, 'dead exports upstream also has are inherited, not our change')
})

test('NOTICE names the font token the components actually CONSUME', function () {
  // AGENTS.md §十二: `--dsh-font-family-ui` is what system-fonts WRITES into the page,
  // `--dsw-font-family-ui` is what a component READS. The stylesheet reads the `--dsw-`
  // one; a NOTICE naming only the `--dsh-` one describes a variable this plugin never
  // consumes, so the next reader looks for a dependency that is not there.
  //
  // FIRST MENTION IS THE ASSERTION. Merely containing `--dsw-…` proves nothing: the
  // wrong sentence also contains it, as the token being ruled out. The claim is which
  // one the shell uses, and in this document that is whatever is named first.
  const { notice } = noticeSections()
  const styles = read('client/src/styles.js')
  const used = /var\((--ds[hw]-font-family-ui)/.exec(styles)
  assert.notEqual(used, null, 'styles.js must still consume a UI font token')
  assert.equal(used[1], '--dsw-font-family-ui', 'the consumed token is the --dsw- one (the --dsh- one is the setting)')

  const atDsw = notice.indexOf('--dsw-font-family-ui')
  const atDsh = notice.indexOf('--dsh-font-family-ui')
  assert.ok(atDsw >= 0, 'NOTICE must name the token the code consumes, i.e. --dsw-font-family-ui')
  assert.ok(atDsh < 0 || atDsw < atDsh,
    'NOTICE names --dsh-font-family-ui as the shell font before --dsw-font-family-ui — '
    + 'the --dsh- one is the SETTING variable system-fonts writes, the --dsw- one is what components read')
})

test('THE REGRESSION: the committed fixture embeds the CURRENT artifact', function () {
  // The fixture in the repo embedded a stale bundle and announced its size as
  // "92893 字节" (a UTF-16 length) while client/client.js was 92930 bytes, so the page a
  // reviewer opened was neither current nor honestly measured — and its screenshot showed
  // four empty tracks. A fixture that claims to load the real artifact has to BE that
  // artifact; regenerate it with `node tools/fixture-offline.mjs`.
  const html = read('fixture/index.html')
  const artifact = read('client/client.js')
  assert.ok(html.includes(artifact),
    'fixture/index.html does not embed the current client/client.js — run `node tools/fixture-offline.mjs`')
  const bytes = Buffer.byteLength(artifact)
  const announced = /client\/client\.js（(\d+) 字节）/.exec(html)
  assert.notEqual(announced, null, 'the fixture must state the artifact size it embeds')
  assert.equal(Number(announced[1]), bytes,
    `the fixture says ${announced[1]} bytes but client/client.js is ${bytes} — the number must be BYTES, not string length`)
})

test('the test script runs the freshness check first and every suite', function () {
  const script = manifest.scripts.test
  assert.ok(script.startsWith('node tools/build-client.mjs --check'),
    'the freshness check must run first: a stale artifact makes every later test meaningless')
  assert.ok(script.includes('node test/manifest.test.mjs'))
  for (const suite of ['levels', 'motion', 'energy', 'settings', 'bridge', 'component', 'host']) {
    assert.ok(script.includes(`node test/${suite}.test.mjs`), `test/${suite}.test.mjs is not wired into npm test`)
  }
  assert.ok(existsSync(join(root, 'tools', 'build-client.mjs')))
  for (const file of ['levels', 'motion', 'energy', 'settings', 'bridge', 'component', 'host']) {
    assert.ok(existsSync(join(root, 'test', `${file}.test.mjs`)), `test/${file}.test.mjs is missing`)
  }
})
