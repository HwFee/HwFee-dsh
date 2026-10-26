import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

test('the patch row names the package itself', () => {
  const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
  const names = [...patch.matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(names, [manifest.name],
    'a mismatch leaves the row unresolvable and the plugin silently inactive')
})

test('the patch points at the file the manifest declares', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(existsSync(join(ROOT, manifest.dsh.bundle.patch)))
})

test('every shipped path exists', () => {
  for (const file of manifest.files) {
    assert.ok(existsSync(join(ROOT, file)), file + ' is listed in files but missing')
  }
})

test('main, exports and client entry resolve', () => {
  assert.equal(manifest.main, 'lib/index.js')
  assert.ok(existsSync(join(ROOT, manifest.main)))
  assert.equal(manifest.exports['./client'], './client/client.js')
  assert.ok(existsSync(join(ROOT, 'client/client.js')))
})

test('the client bundle registers under the package name', () => {
  const artifact = readFileSync(join(ROOT, 'client/client.js'), 'utf8')
  assert.ok(artifact.includes('id: ' + JSON.stringify(manifest.name)),
    'the module-loader id must equal the package name; see AGENTS.md section 4')
})

test('the conversation package is declared as a client dependency', () => {
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'),
    'the toggle mounts into the conversation header, so that bundle must arrive first')
  assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'),
    'the rail must not depend on the native right sidebar')
})

test('the host half exports name and apply', async () => {
  const host = await import(join(ROOT, 'lib/index.js'))
  assert.equal(host.name, manifest.name)
  assert.equal(typeof host.apply, 'function')
})
