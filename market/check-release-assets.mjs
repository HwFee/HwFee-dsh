#!/usr/bin/env node
/**
 * Release gate: refuse to publish a tarball that carries fonts we have no right
 * to redistribute.
 *
 * WHY THIS LOOKS INSIDE FILES INSTEAD OF READING `files`. The cds-theme artifact
 * inlines eight woff2 faces as `data:font/woff2;base64,…` (see
 * `plugins/cds-theme/client/src/font-assets.js` and the `dataurl` loader in its
 * build). The package declaration lists no `fonts/` directory, so a file-list
 * check reports a clean package while `client/client.js` still carries ~5 MB of
 * commercial Anthropic faces. `npm pack --dry-run` cannot see this either: it
 * prints a path, a size and a hash, not the bytes behind an inlined import.
 *
 * So this script packs for real, walks every byte of every shipped file, and
 * every woff/woff2 payload it finds — raw file or base64 blob — is identified by
 * SHA-256 against `tools/font-licences.mjs`, the repository's licence registry:
 *
 *   - a COMMERCIAL face (the six Anthropic web faces, `kind: 'commercial'`)
 *     FAILS the gate, inlined or as a loose file. Those faces ship without a
 *     redistribution grant; storing them in the repository for local development
 *     is not the same as publishing them.
 *   - a payload matching NO known face FAILS too. An unidentified font is
 *     unvetted, and "we do not know what this is" is not a pass.
 *   - a LOOSE font file FAILS even when its licence is fine. Shippable faces are
 *     inlined by `client/src/font-assets.js`; a `fonts/*.woff2` inside the tarball
 *     is either a duplicate of an inlined face or a face that was deliberately
 *     kept out of the bundle and got packed by mistake.
 *   - an open-licensed face (Noto / OFL) INLINED passes, and is reported by name
 *     so the exemption is visible in the log rather than silent.
 *
 * WHY THE REGISTRY AND NOT `plugins/ *\/fonts/`. The commercial faces are
 * UNTRACKED now — they are the developer's local working copies, because keeping
 * them in a public repository is distribution. A release gate that identified
 * faces only by scanning that directory would have degraded on every clean
 * checkout: the same bytes would come back as "unknown", not as "commercial". The
 * registry carries a sha256 per face, so the verdict is the same with or without
 * the local file, and it can NAME the face it found.
 *
 * A local copy is still hashed and merged in, which catches the opposite case: a
 * file on this machine whose bytes differ from the registry. That cannot turn a
 * pass into a failure by itself (the payload would simply match no known face and
 * FAIL as unidentified), but it is reported as a fingerprint warning so the drift
 * is visible rather than mysterious.
 *
 * Usage:
 *   node market/check-release-assets.mjs                  # check every package
 *   node market/check-release-assets.mjs --only cds-theme # one package
 *   node market/check-release-assets.mjs --dir <path>     # an arbitrary package dir
 *   node market/check-release-assets.mjs --json           # machine-readable
 *
 * Exit 0 only when every package passes. Exit 1 lists what leaked and where.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

import {
  FONT_FINGERPRINTS, localPathFor, sha256Of, verifyFingerprints,
} from '../tools/font-licences.mjs'

const root = join(import.meta.dirname, '..')

// Open-licensed faces this repository legitimately subsets and ships. A KNOWN
// name that is neither commercial nor open still gets a verdict: unclassified
// faces FAIL rather than pass silently.
const COMMERCIAL = /^(Anthropic|Claude|Styrene|Copernicus|Tiempos|Ginto)/i
const OPEN_LICENSED = /^(Noto|SourceHan|SourceSans)/i

// Magic numbers. A woff2 starts `wOF2`, woff `wOFF`, OpenType `OTTO`/`0x00010000`,
// TrueType `true`/`ttcf`. Only the first four matter for this repository, but a
// stray OTF in a tarball is worth failing on too.
const FONT_MAGIC = [
  { name: 'woff2', bytes: Buffer.from('wOF2', 'latin1') },
  { name: 'woff', bytes: Buffer.from('wOFF', 'latin1') },
  { name: 'otf', bytes: Buffer.from('OTTO', 'latin1') },
  { name: 'ttf', bytes: Buffer.from([0x00, 0x01, 0x00, 0x00]) },
  { name: 'ttc', bytes: Buffer.from('ttcf', 'latin1') },
]

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// ---------------------------------------------------------------- known faces

/**
 * sha256 → { file, kind } for every face the registry knows, plus every local
 * font binary found under `plugins/ *\/fonts/`.
 *
 * THE REGISTRY IS SEEDED FIRST AND NEVER REPLACED BY A LOCAL FILE. That ordering
 * is the whole point: on a clean checkout there are no local copies of the six
 * commercial faces, and the gate must still answer "this is
 * AnthropicSans-Roman-Web.woff2, commercial, no grant" rather than "unknown".
 * Local entries are added under their own digests, so a file with unexpected
 * bytes is at least identified by name and flagged as a mismatch below.
 */
function indexKnownFaces() {
  const known = new Map()
  const drifted = []
  for (const face of FONT_FINGERPRINTS) {
    const kind = face.kind === 'commercial' ? 'commercial' : face.kind === 'open' ? 'open' : 'unknown-licence'
    known.set(face.sha256, { file: face.file, kind, plugin: face.plugin, source: 'registry' })
  }

  const pluginsDir = join(root, 'plugins')
  for (const dir of readdirSync(pluginsDir)) {
    const fontsDir = join(pluginsDir, dir, 'fonts')
    let entries
    try {
      entries = readdirSync(fontsDir)
    } catch {
      continue
    }
    for (const file of entries) {
      if (!/\.(woff2?|otf|ttf)$/i.test(file)) continue
      const bytes = readFileSync(join(fontsDir, file))
      const digest = sha256(bytes)
      if (known.has(digest)) continue
      // A local face that the registry does not describe at this digest. Report
      // it, keep it known by its own hash, and let `verifyFingerprints` decide
      // whether it is drift for a face we DO track a fingerprint for.
      const kind = COMMERCIAL.test(file) ? 'commercial' : OPEN_LICENSED.test(file) ? 'open' : 'unknown-licence'
      known.set(digest, { file, kind, plugin: dir, source: 'local' })
      drifted.push({ file, plugin: dir, digest })
    }
  }
  return { known, drifted }
}

// ------------------------------------------------------------- the tarball

/**
 * Minimal ustar reader. npm tarballs are produced by the `tar` node package:
 * plain ustar with `prefix`, occasionally a pax `x` header for long paths. We
 * need names and contents only.
 */
function readTar(buf) {
  const files = []
  let offset = 0
  let paxPath = null
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    const nameField = header.subarray(0, 100).toString('latin1').replace(/\0.*$/, '')
    const sizeField = header.subarray(124, 136).toString('latin1').replace(/\0.*$/, '').trim()
    const typeflag = String.fromCharCode(header[156] || 48)
    const prefix = header.subarray(345, 500).toString('latin1').replace(/\0.*$/, '')
    const size = parseInt(sizeField, 8) || 0
    const dataStart = offset + 512
    const data = buf.subarray(dataStart, dataStart + size)
    const path = prefix ? `${prefix}/${nameField}` : nameField

    if (typeflag === 'x' || typeflag === 'g') {
      // pax extended header: "len key=value\n"
      const text = data.toString('utf8')
      const m = /\d+ path=([^\n]+)\n/.exec(text)
      if (m) paxPath = m[1]
    } else if (typeflag === 'L') {
      paxPath = data.toString('utf8').replace(/\0.*$/, '')
    } else if (typeflag === '0' || typeflag === '\0' || typeflag === '') {
      files.push({ path: paxPath ?? path, data })
      paxPath = null
    } else {
      paxPath = null
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return files
}

/**
 * Every font payload in one file.
 *
 * RAW MAGIC IS ONLY TRUSTED AT OFFSET 0. A bare search for `OTTO` / `wOF2`
 * anywhere in a JavaScript file matches prose and base64 by accident — measured
 * here: `client/client.js` of git-bash contains the word "8px TOP/BOTTOM … fence
 * inset" where `OTTO` sits across `BOTTOM`, and cds-theme's base64 run happened
 * to contain the same four letters. Both were reported as "unidentified font
 * bytes" until this check moved to offset 0, where a real font binary starts.
 * Font files shipped as files are caught by name in `checkPackage`.
 */
function findFontPayloads(path, data) {
  const found = []

  const atZero = FONT_MAGIC.find((f) => data.length >= 4 && data.subarray(0, 4).equals(f.bytes))
  if (atZero) {
    found.push({ offset: 0, format: atZero.name, hint: `raw ${atZero.name} at start of file`, hash: sha256(data), size: data.length })
  }

  // base64 blobs: a data URL, or any run of base64 long enough to be a face
  // (a 60 KB face is 80 K base64 chars; 4 K is a safe lower bound that still
  // keeps this from matching ordinary minified code).
  const text = data.toString('latin1')
  const re = /[A-Za-z0-9+/]{4096,}={0,2}/g
  let m
  while ((m = re.exec(text)) !== null) {
    let decoded
    try {
      decoded = Buffer.from(m[0], 'base64')
    } catch {
      continue
    }
    if (decoded.length < 3072) continue
    const magic = FONT_MAGIC.find((f) => decoded.subarray(0, 4).equals(f.bytes))
    if (!magic) continue
    found.push({
      offset: m.index,
      format: magic.name,
      hint: `base64 ${magic.name} at byte ${m.index}`,
      hash: sha256(decoded),
      size: decoded.length,
    })
  }
  return found
}

// ------------------------------------------------------------------ packing

function pack(dir) {
  const dest = mkdtempSync(join(tmpdir(), 'release-assets-'))
  // One command string, not args-with-shell: on Windows `npm` is a .cmd shim and
  // needs a shell, but `execFileSync(file, args, {shell:true})` concatenates
  // unescaped args (Node DEP0190). The directory is quoted here instead.
  const out = execFileSync(`npm pack --pack-destination "${dest}" --json`, {
    cwd: dir,
    encoding: 'utf8',
    shell: true,
  })
  const info = JSON.parse(out)
  const tgz = join(dest, info[0].filename)
  if (!statSync(tgz).isFile()) throw new Error(`npm pack produced no file in ${dest}`)
  return {
    tgz,
    size: statSync(tgz).size,
    cleanup: () => rmSync(dest, { recursive: true, force: true }),
  }
}

function checkPackage(dir, known) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const packed = pack(dir)
  const problems = []
  const exemptions = []
  const rawFontFiles = []

  try {
    const entries = readTar(gunzipSync(readFileSync(packed.tgz)))
    for (const entry of entries) {
      if (/\.(woff2?|otf|ttf|ttc)$/i.test(entry.path)) {
        const hit = known.get(sha256(entry.data))
        rawFontFiles.push({ path: entry.path, face: hit?.file ?? 'unknown' })
        // A RAW FONT FILE IS NEVER ALLOWED IN A TARBALL, whatever its licence.
        // The delivery mechanism is inlining: a shippable face is imported by
        // `font-assets.js` and becomes base64 in `client/client.js`. A loose
        // `fonts/*.woff2` therefore means one of two things, both wrong — the
        // face is duplicated (source rule: never ship both), or it is a face
        // that was deliberately kept out of the bundle and got packed by
        // accident. The commercial ones are the second case, and they are exactly
        // what `plugins/*/fonts/` holds as the developer's local working copies.
        if (hit?.kind === 'commercial') {
          problems.push({
            where: entry.path,
            what: `raw commercial face ${hit.file} — the repository copy is for local use only, never packed`,
            size: entry.data.length,
          })
        } else if (!hit) {
          problems.push({ where: entry.path, what: 'raw font file not in plugins/*/fonts', size: entry.data.length })
        } else {
          problems.push({
            where: entry.path,
            what: `raw ${hit.file} packed as a file — faces ship inlined through font-assets.js, not as loose files`,
            size: entry.data.length,
          })
        }
        continue
      }

      const payloads = findFontPayloads(entry.path, entry.data)
      for (const payload of payloads) {
        const hash = payload.hash ?? null
        const hit = hash ? known.get(hash) : null
        if (hit?.kind === 'commercial') {
          problems.push({
            where: entry.path,
            what: `${payload.hint} is ${hit.file} (commercial, no redistribution grant)`,
            size: payload.size ?? null,
          })
        } else if (!hash) {
          // A raw font magic inside a non-font file with no base64 hash to test:
          // cannot identify, cannot exempt.
          problems.push({ where: entry.path, what: `${payload.hint} — unidentified font bytes`, size: null })
        } else if (!hit) {
          problems.push({
            where: entry.path,
            what: `${payload.hint} matches no face in plugins/*/fonts (sha256 ${hash.slice(0, 16)}…)`,
            size: payload.size,
          })
        } else if (hit.kind === 'unknown-licence') {
          problems.push({ where: entry.path, what: `${payload.hint} is ${hit.file} with no licence classification`, size: payload.size })
        } else {
          exemptions.push({ where: entry.path, face: hit.file, size: payload.size })
        }
      }
    }
  } finally {
    packed.cleanup()
  }

  return { name: manifest.name, version: manifest.version, dir, size: packed.size, problems, exemptions, rawFontFiles }
}

// --------------------------------------------------------------------- main

const args = process.argv.slice(2)
const jsonOut = args.includes('--json')
const onlyIndex = args.indexOf('--only')
const only = onlyIndex !== -1 ? args[onlyIndex + 1] : null
const dirIndex = args.indexOf('--dir')
const onlyDir = dirIndex !== -1 ? args[dirIndex + 1] : null

const { known, drifted } = indexKnownFaces()
const pluginsDir = join(root, 'plugins')
const dirs = onlyDir
  ? [onlyDir]
  : readdirSync(pluginsDir)
      .filter((d) => statSync(join(pluginsDir, d)).isDirectory())
      .filter((d) => !only || d === only)

const results = []
for (const d of dirs) {
  const report = checkPackage(onlyDir ? d : join(pluginsDir, d), known)
  results.push(report)
}

// A local copy whose bytes differ from the registry is a FAILURE, not a note.
//
// WHY FAIL AND NOT WARN. Every verdict below is a lookup in that registry. If a
// working copy has been swapped, the registry no longer describes the bytes on
// this machine, and the gate would be judging a table nobody has checked. The
// honest outcomes are "restore the original face" or "update the registry
// deliberately, in a reviewed change" — never "publish and hope the unknown
// payload fails for an unrelated reason".
const fingerprint = verifyFingerprints()
const driftFailure = fingerprint.drifted.length > 0
if (driftFailure) {
  console.log('')
  console.log('FAIL: local font copies differ from tools/font-licences.mjs:')
  for (const item of fingerprint.drifted) {
    console.log(`    drift ${item.file}`)
    console.log(`          registry ${item.expected.slice(0, 16)}…  local ${item.actual.slice(0, 16)}…`)
  }
  console.log('    The gate identifies faces by these digests. Restore the original face, or')
  console.log('    update the registry in a reviewed change — do not publish against a table')
  console.log('    that no longer describes the bytes on this machine.')
}

if (jsonOut) {
  console.log(JSON.stringify({
    knownFaces: known.size,
    localOnlyFaces: drifted.map((item) => item.file),
    drifted: fingerprint.drifted.map((item) => ({ file: item.file, expected: item.expected, actual: item.actual })),
    results,
  }, null, 2))
} else {
  for (const r of results) {
    const verdict = r.problems.length ? 'FAIL' : 'PASS'
    console.log(`\n=== ${r.name}@${r.version}  [${r.dir.split(/[\\/]/).pop()}]  ${(r.size / 1024).toFixed(1)} KB  ${verdict}`)
    for (const p of r.problems) {
      console.log(`    FAIL  ${p.where}`)
      console.log(`          ${p.what}${p.size ? ` (${(p.size / 1024).toFixed(0)} KB)` : ''}`)
    }
    const kept = new Map()
    for (const e of r.exemptions) kept.set(e.face, (kept.get(e.face) ?? 0) + 1)
    for (const [face, count] of kept) console.log(`    ok    ships ${face}${count > 1 ? ` ×${count}` : ''} (open licence)`)
    if (!r.problems.length && !kept.size) console.log('    ok    no font payloads of any kind')
  }
}

const failed = results.filter((r) => r.problems.length)
console.log('')
if (failed.length || driftFailure) {
  if (failed.length) {
    console.log(`${failed.length} package(s) FAIL the release asset gate: ${failed.map((r) => r.name).join(', ')}`)
    console.log('Do not publish these. Strip the faces from the build, or ship them under a licence that allows redistribution.')
  }
  if (driftFailure) {
    console.log('Do not publish: the licence registry does not match the local font copies (see above).')
  }
  process.exit(1)
}
console.log(`All ${results.length} package(s) pass: no commercial font bytes and no loose font files in any tarball.`)
