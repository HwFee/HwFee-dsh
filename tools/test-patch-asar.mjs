/**
 * Tests for the archive patcher: variant selection, edit post-conditions, repacking.
 *
 * WHAT IS REAL HERE. The rc.2 / rc.5 variants in `patch-asar.mjs` are literal fragments of
 * shipped bundles. This file does not re-embed those bundles: it builds a synthetic member from
 * each registered anchor, which is enough to prove the properties the tool promises —
 * anchors are unique, replacements do not contain their own anchor, a variant is selected only
 * from its own evidence, and an unknown build is never guessed at.
 *
 * The last test runs against the installed archive when one exists, and skips otherwise: that is
 * where "the registered rc.5 anchors really are in the shipped bundle" is checked. A CI machine
 * without DSH installed must not fail because of that.
 *
 *   node --test tools/test-patch-asar.mjs
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'

import {
  DEFAULT_ASAR,
  PATCHES,
  applyEdits,
  patchState,
  readArchive,
  repack,
  resolveTarget,
  selectPatches,
  targetVariants,
  walkEntries,
  extract,
} from './patch-asar.mjs'

/** The pickled frame Electron writes: four length fields, then the header JSON, padded to 4. */
const HEADER_BASE = 16

/** Build a minimal, valid archive from `{ 'a/b.js': text }`, with nested header entries. */
function makeArchive(entries) {
  const header = { files: {} }
  const chunks = []
  let offset = 0
  for (const [path, content] of Object.entries(entries)) {
    const bytes = Buffer.from(content, 'utf8')
    let node = header
    const parts = path.split('/')
    for (const part of parts.slice(0, -1)) {
      node.files[part] ??= { files: {} }
      node = node.files[part]
    }
    node.files[parts.at(-1)] = { size: String(bytes.length), offset: String(offset) }
    chunks.push(bytes)
    offset += bytes.length
  }
  const json = Buffer.from(JSON.stringify(header), 'utf8')
  const padding = (4 - ((HEADER_BASE + json.length) % 4)) % 4
  const frame = Buffer.alloc(HEADER_BASE)
  frame.writeUInt32LE(4, 0)
  frame.writeUInt32LE(json.length + 8 + padding, 4)
  frame.writeUInt32LE(json.length + 4 + padding, 8)
  frame.writeUInt32LE(json.length, 12)
  return Buffer.concat([frame, json, Buffer.alloc(padding), ...chunks])
}

/** Parse archive bytes without touching disk. */
function archiveOf(entries) {
  return { ...readArchiveBuffer(makeArchive(entries)), file: 'test.asar' }
}

/** `readArchive` reads a path; tests build bytes, so mirror it here. */
function readArchiveBuffer(buffer) {
  const jsonLength = buffer.readUInt32LE(12)
  const header = JSON.parse(buffer.subarray(HEADER_BASE, HEADER_BASE + jsonLength).toString('utf8'))
  return { buf: buffer, header, jsonLength, dataOffset: 8 + buffer.readUInt32LE(4) }
}

/** One logical target, by patch and target id. */
function targetOf(patchId, targetId) {
  const patch = PATCHES.find((entry) => entry.id === patchId)
  assert.ok(patch, `unknown patch ${patchId}`)
  const target = patch.targets.find((entry) => entry.id === targetId)
  assert.ok(target, `unknown target ${targetId}`)
  return target
}

/** The variant registered for a given build prefix (rc.2 / rc.5 …). */
function variantFor(patchId, targetId, buildHint) {
  const variant = targetVariants(targetOf(patchId, targetId)).find((entry) =>
    String(entry.build).includes(buildHint))
  assert.ok(variant, `no ${buildHint} variant for ${patchId}/${targetId}`)
  return variant
}

/** A member whose text contains every anchor of this variant exactly once. */
function docFor(variant) {
  return variant.edits.map((edit) => edit.anchor).join('\n')
}

test('every registered variant has unique anchors and stable replacements', () => {
  for (const patch of PATCHES) {
    for (const target of patch.targets) {
      for (const variant of targetVariants(target)) {
        const doc = docFor(variant)
        for (const edit of variant.edits) {
          assert.equal(
            doc.split(edit.anchor).length - 1, 1,
            `${patch.id}/${edit.id}: the anchor must occur once in the unpatched member`,
          )
          assert.ok(edit.replace !== edit.anchor, `${edit.id}: replacement equals the anchor`)
        }
        const patched = applyEdits(doc, variant)
        const markerHits = patched.split(variant.marker).length - 1
        assert.equal(
          markerHits, variant.markerCount ?? 1,
          `${patch.id}/${variant.build}: the patched member must carry ${variant.marker}`,
        )
        for (const edit of variant.edits) {
          assert.equal(patched.split(edit.anchor).length - 1, 0, `${edit.id}: anchor survived`)
          assert.equal(patched.split(edit.replace).length - 1, 1, `${edit.id}: replacement not once`)
        }
      }
    }
  }
})

test('a replacement that contains its own anchor is rejected', () => {
  const target = {
    path: 'a.js',
    edits: [{ id: 'self', anchor: 'AAA', replace: 'AAAB' }],
  }
  assert.throws(
    () => applyEdits('xAAAz', target),
    /failed post-edit validation/,
    'a replacement containing its anchor would match again on a second run',
  )
})

test('an anchor that occurs twice is rejected, with the count in the message', () => {
  const target = { path: 'a.js', edits: [{ id: 'dup', anchor: 'AAA', replace: 'BBB' }] }
  assert.throws(() => applyEdits('AAAAAA', target), /found 2/)
})

test('applying the same variant twice fails loudly instead of silently no-oping', () => {
  const variant = variantFor('diff-start-attrs', 'web-frontend-diff-block', 'rc.5')
  const once = applyEdits(docFor(variant), variant)
  assert.throws(() => applyEdits(once, variant), /found 0/)
})

test('rc.2 and rc.5 are selected by their own evidence, never by a loose pattern', () => {
  const rc2 = variantFor('diff-start-attrs', 'web-frontend-diff-block', 'rc.2')
  const rc5 = variantFor('diff-start-attrs', 'web-frontend-diff-block', 'rc.5')

  const onlyRc2 = archiveOf({ [rc2.path]: docFor(rc2) })
  const rc2Resolution = resolveTarget(onlyRc2, targetOf('diff-start-attrs', 'web-frontend-diff-block'))
  assert.equal(rc2Resolution.error, undefined)
  assert.equal(rc2Resolution.chosen.variant.build, rc2.build)

  const onlyRc5 = archiveOf({ [rc5.path]: docFor(rc5) })
  const rc5Resolution = resolveTarget(onlyRc5, targetOf('diff-start-attrs', 'web-frontend-diff-block'))
  assert.equal(rc5Resolution.chosen.variant.build, rc5.build)

  const unknown = archiveOf({
    'dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-UNKNOWN.js': docFor(rc5),
  })
  const unknownResolution = resolveTarget(
    unknown, targetOf('diff-start-attrs', 'web-frontend-diff-block'),
  )
  assert.match(unknownResolution.error ?? '', /archive member not found/)
  assert.equal(
    patchState(unknown, PATCHES.find((patch) => patch.id === 'diff-start-attrs')).state,
    'unavailable',
    'an unregistered build is SKIPPED, never patched by guesswork',
  )
})

test('both known builds present is ambiguous, not a coin flip', () => {
  const rc2 = variantFor('diff-start-attrs', 'web-frontend-diff-block', 'rc.2')
  const rc5 = variantFor('diff-start-attrs', 'web-frontend-diff-block', 'rc.5')
  const both = archiveOf({ [rc2.path]: docFor(rc2), [rc5.path]: docFor(rc5) })
  const resolution = resolveTarget(both, targetOf('diff-start-attrs', 'web-frontend-diff-block'))
  assert.match(resolution.error ?? '', /ambiguous build/)
})

test('patchState reports unpatched, patched, partial and unavailable from the same members', () => {
  const host = variantFor('hunk-lines', 'host-meta', 'rc.2')
  const client = variantFor('hunk-lines', 'client-narrow-diffs', 'rc.2')
  const hunkLines = PATCHES.find((patch) => patch.id === 'hunk-lines')
  assert.ok(hunkLines)

  const unpatched = archiveOf({ [host.path]: docFor(host), [client.path]: docFor(client) })
  assert.equal(patchState(unpatched, hunkLines).state, 'unpatched')

  const patched = archiveOf({
    [host.path]: applyEdits(docFor(host), host),
    [client.path]: applyEdits(docFor(client), client),
  })
  assert.equal(patchState(patched, hunkLines).state, 'patched')

  const partial = archiveOf({
    [host.path]: applyEdits(docFor(host), host),
    [client.path]: docFor(client),
  })
  assert.equal(patchState(partial, hunkLines).state, 'partial')

  const halfEdited = archiveOf({
    [host.path]: applyEdits(docFor(host), host).replace(host.edits[0].replace, ''),
    [client.path]: applyEdits(docFor(client), client),
  })
  assert.equal(
    patchState(halfEdited, hunkLines).state, 'partial',
    'a marker without its full patched shape is corruption, not "patched"',
  )
})

test('repack rewrites offsets and keeps every member byte-identical', () => {
  const original = makeArchive({ 'a/one.js': 'one', 'a/two.js': 'two-longer' })
  const archive = { ...readArchiveBuffer(original), file: 'round-trip.asar' }
  const replacement = Buffer.from('one-changed-and-longer', 'utf8')
  const rebuilt = repack(archive, new Map([['a/one.js', replacement]]))
  const reread = readArchiveBuffer(rebuilt)

  assert.deepEqual(
    walkEntries(reread).map(([path]) => path), ['a/one.js', 'a/two.js'],
    'member order is preserved',
  )
  assert.equal(extract({ ...reread, dataOffset: reread.dataOffset }, 'a/one.js').toString(), replacement.toString())
  assert.equal(extract({ ...reread, dataOffset: reread.dataOffset }, 'a/two.js').toString(), 'two-longer')
})

test('selectPatches refuses an unknown id and keeps the declared order', () => {
  assert.deepEqual(selectPatches(['diff-start-attrs', 'hunk-lines']).map((p) => p.id), [
    'hunk-lines', 'diff-start-attrs',
  ])
  assert.throws(() => selectPatches(['nope']), /unknown patch id\(s\): nope/)
})

test('the installed archive resolves the registered build', { skip: !existsSync(DEFAULT_ASAR) }, () => {
  const archive = readArchive(DEFAULT_ASAR)

  // hunk-lines is installed on this machine; if it is not, the test still proves the anchors
  // match, which is the part a rebuild can break.
  const hunkLines = PATCHES.find((patch) => patch.id === 'hunk-lines')
  const hostRow = hunkLines.targets.find((target) => target.id === 'host-meta')
  const hostResolution = resolveTarget(archive, hostRow)
  assert.equal(hostResolution.error, undefined, 'the installed tool-fs build must be recognised')
  assert.match(hostResolution.chosen.variant.build, /0\.2\.1-rc\.\d/)

  const diffRow = PATCHES
    .find((patch) => patch.id === 'diff-start-attrs')
    .targets.find((target) => target.id === 'web-frontend-diff-block')
  const resolution = resolveTarget(archive, diffRow)
  assert.equal(resolution.error, undefined, 'exactly one registered web-frontend build is present')
  assert.ok(
    resolution.chosen.variant.build.includes('rc.5'),
    `expected the rc.5 variant, got ${resolution.chosen.variant.build}`,
  )
})
