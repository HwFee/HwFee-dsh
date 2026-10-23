import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildArtifact } from '../tools/build-client.mjs'

test('one client build embeds the frame produced by that build without reading stale JSON', async () => {
  const file = new URL('../client/src/frame/runtime.bundle.json', import.meta.url)
  const before = readFileSync(file, 'utf8')
  const artifact = await buildArtifact(JSON.stringify({ js: 'globalThis.__DSH_CURRENT_FRAME_TEST__ = true;' }))
  assert.ok(artifact.includes('__DSH_CURRENT_FRAME_TEST__'), 'a stale runtime.bundle.json must not win over this build')
  assert.equal(readFileSync(file, 'utf8'), before, 'a check/build composition must not mutate its inputs')
})
