#!/usr/bin/env node
/**
 * Compare what is PUBLISHED against what would be published now, file by file.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT `git diff`. Two comparisons are easy to get
 * wrong and both were wrong once during the 2026-10-22 review:
 *
 *   1. `git diff` compares the working tree to HEAD. That misses nothing local,
 *      but it says nothing about what is on npm — and the published package can
 *      be older than HEAD by several commits. A file can be committed, unedited in
 *      the working tree, and still be absent from every published tarball. That
 *      was exactly the case for `usage-stats/lib/usage-ledger.js` and the
 *      `predict/lib` rewrite: committed in `865fb44`, never published.
 *   2. Comparing a subset of packages and reporting it as "all six" produced a
 *      false "byte-identical" claim. This script always iterates every package and
 *      prints the count it actually compared.
 *
 * So the comparison is: published tarball (downloaded from the registry at the
 * version npm reports as `latest`) versus `npm pack` of the CURRENT tree, entry by
 * entry, by SHA-256. That is the exact question a release must answer: if I publish
 * now, what does a user receive that they do not already have?
 *
 * It also reports the working-tree-vs-HEAD delta per package, separately, so an
 * uncommitted edit and an unpublished commit are distinguishable in the output.
 *
 * Usage:
 *   node market/compare-published.mjs                 # every package
 *   node market/compare-published.mjs --only genui
 *   node market/compare-published.mjs --json
 *   node market/compare-published.mjs --write         # also rewrite the report in
 *                                                     # market/published-vs-local.md
 *
 * Exit code is 0 whenever the comparison itself succeeded — a difference is a
 * finding, not a failure. Exit 1 means the comparison could not be performed.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const root = join(import.meta.dirname, '..')
const registry = 'https://registry.npmjs.org'
const REPORT = join(import.meta.dirname, 'published-vs-local.md')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// ---------------------------------------------------------------- tar reading

/** Minimal ustar/pax reader: name → bytes. Same contract as npm's own tarballs. */
function readTar(buf) {
  const files = new Map()
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
    const data = buf.subarray(offset + 512, offset + 512 + size)
    const path = prefix ? `${prefix}/${nameField}` : nameField

    if (typeflag === 'x' || typeflag === 'g') {
      const m = /\d+ path=([^\n]+)\n/.exec(data.toString('utf8'))
      if (m) paxPath = m[1]
    } else if (typeflag === 'L') {
      paxPath = data.toString('utf8').replace(/\0.*$/, '')
    } else if (typeflag === '0' || typeflag === '\0' || typeflag === '') {
      const final = paxPath ?? path
      // npm tarballs put everything under `package/`.
      files.set(final.replace(/^package\//, ''), Buffer.from(data))
      paxPath = null
    } else {
      paxPath = null
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

// ------------------------------------------------------------------- packing

function packDir(dir) {
  const dest = mkdtempSync(join(tmpdir(), 'cmp-'))
  try {
    const out = execFileSync(`npm pack --pack-destination "${dest}" --json`, {
      cwd: dir,
      encoding: 'utf8',
      shell: true,
    })
    const info = JSON.parse(out)[0]
    const tgz = join(dest, info.filename)
    const files = readTar(gunzipSync(readFileSync(tgz)))
    const manifest = JSON.parse(files.get('package.json').toString('utf8'))
    return { files, manifest, filename: info.filename, size: statSync(tgz).size }
  } finally {
    rmSync(dest, { recursive: true, force: true })
  }
}

function packPublished(name, version) {
  const dest = mkdtempSync(join(tmpdir(), 'pub-'))
  try {
    execFileSync(`npm pack "${name}@${version}" --registry=${registry} --json`, {
      cwd: dest,
      encoding: 'utf8',
      shell: true,
    })
    const tgz = readdirSync(dest).find((f) => f.endsWith('.tgz'))
    if (!tgz) throw new Error(`npm pack ${name}@${version} produced no tarball`)
    const files = readTar(gunzipSync(readFileSync(join(dest, tgz))))
    const manifest = JSON.parse(files.get('package.json').toString('utf8'))
    // Guard against a wrong registry/cache answer: the tarball must BE the package
    // we asked for. This is the check that would have caught a bad mapping.
    if (manifest.name !== name) throw new Error(`asked for ${name}, tarball declares ${manifest.name}`)
    return { files, manifest, filename: tgz, size: statSync(join(dest, tgz)).size }
  } finally {
    rmSync(dest, { recursive: true, force: true })
  }
}

function registryLatest(name) {
  try {
    return execFileSync(`npm view "${name}" version --registry=${registry}`, {
      encoding: 'utf8',
      shell: true,
    }).trim()
  } catch {
    return null
  }
}

// -------------------------------------------------------------- git helpers

/**
 * Run git inside ONE package directory.
 *
 * `pluginDir` is relative to the repository root (`plugins/genui`), and it is
 * used for BOTH the `-C` target and the working directory. An earlier version
 * passed the absolute root here by mistake; `git -C <root>/<root>` does not exist,
 * the call threw, and the catch returned an empty string — so every package
 * reported "working tree clean" while `git status` showed changes. A silent
 * fallback that reads as a clean result is the worst kind of default, so a
 * failure here is now loud.
 */
function git(pluginDir, args) {
  const cwd = join(root, pluginDir)
  try {
    // Trim only the trailing newline. `git status --porcelain` encodes the index
    // state in the FIRST two characters (" M" = modified in the work tree), so
    // `trim()` would eat the leading space of line 1 and make one row look
    // different from the rest.
    return execFileSync(`git ${args}`, { cwd, encoding: 'utf8', shell: true }).replace(/\s+$/, '')
  } catch (error) {
    throw new Error(`git ${args} failed in ${cwd}: ${error.message}`)
  }
}

/** Files under a plugin dir that the working tree has changed but not committed. */
function uncommitted(pluginDir) {
  const status = git(pluginDir, 'status --porcelain -- .')
  return status ? status.split(/\r?\n/).filter(Boolean) : []
}

// --------------------------------------------------------------------- main

const args = process.argv.slice(2)
const jsonOut = args.includes('--json')
const writeReport = args.includes('--write')
const onlyIndex = args.indexOf('--only')
const only = onlyIndex !== -1 ? args[onlyIndex + 1] : null

const pluginsDir = join(root, 'plugins')
const dirs = readdirSync(pluginsDir)
  .filter((d) => statSync(join(pluginsDir, d)).isDirectory())
  .filter((d) => !only || d === only)

if (dirs.length === 0) {
  console.error('No package matched. Nothing was compared.')
  process.exit(1)
}

const results = []
for (const slug of dirs) {
  const dir = join(pluginsDir, slug)
  let local
  try {
    local = packDir(dir)
  } catch (error) {
    console.error(`FAIL  ${slug}: cannot pack — ${error.message}`)
    process.exit(1)
  }
  const name = local.manifest.name
  const localVersion = local.manifest.version
  const publishedVersion = registryLatest(name)

  if (!publishedVersion) {
    results.push({ slug, name, localVersion, publishedVersion: null, added: [...local.files.keys()], changed: [], removed: [], localSize: local.size, publishedSize: null, uncommitted: uncommitted(`plugins/${slug}`) })
    continue
  }

  let published
  try {
    published = packPublished(name, publishedVersion)
  } catch (error) {
    console.error(`FAIL  ${name}@${publishedVersion}: cannot download — ${error.message}`)
    process.exit(1)
  }

  const added = []
  const changed = []
  const removed = []
  for (const [path, bytes] of local.files) {
    if (!published.files.has(path)) added.push(path)
    else if (sha256(bytes) !== sha256(published.files.get(path))) changed.push(path)
  }
  for (const path of published.files.keys()) {
    if (!local.files.has(path)) removed.push(path)
  }

  results.push({
    slug,
    name,
    localVersion,
    publishedVersion,
    added,
    changed,
    removed,
    localSize: local.size,
    publishedSize: published.size,
    uncommitted: uncommitted(`plugins/${slug}`),
  })
}

// ------------------------------------------------------------------- output

if (jsonOut) {
  console.log(JSON.stringify({ compared: results.length, registry, results }, null, 2))
} else {
  for (const r of results) {
    const total = r.added.length + r.changed.length + r.removed.length
    const verdict = r.publishedVersion === null ? 'NOT PUBLISHED' : total === 0 ? 'IDENTICAL' : `${total} file(s) differ`
    console.log(`\n=== ${r.name}  local ${r.localVersion}  published ${r.publishedVersion ?? '—'}  ${verdict}`)
    console.log(`    tarball: published ${r.publishedSize ? (r.publishedSize / 1024).toFixed(1) + ' KB' : '—'} -> local ${(r.localSize / 1024).toFixed(1)} KB`)
    for (const p of r.added) console.log(`    + ${p}`)
    for (const p of r.changed) console.log(`    ~ ${p}`)
    for (const p of r.removed) console.log(`    - ${p}`)
    if (r.uncommitted.length) {
      console.log(`    uncommitted in the working tree (${r.uncommitted.length}):`)
      for (const line of r.uncommitted.slice(0, 10)) console.log(`      ${line}`)
      if (r.uncommitted.length > 10) console.log(`      … ${r.uncommitted.length - 10} more`)
    } else {
      console.log('    working tree clean for this package')
    }
  }
  console.log(`\nCompared ${results.length} package(s) against ${registry}.`)
}

if (writeReport) {
  const lines = [
    '# Published vs local',
    '',
    'Generated by `node market/compare-published.mjs --write`.',
    '',
    'Compares the tarball on npm for each package\'s published version against `npm pack`',
    'of the current tree, file by file, by SHA-256. This is the question a release has to',
    'answer: what would a user receive that they do not already have?',
    '',
    'A file can appear here while `git status` shows it clean — committed but never',
    'published. That is a release-scope difference, not an uncommitted edit, and the',
    'last column separates the two.',
    '',
    '| Package | Local | Published | Added | Changed | Removed | Uncommitted |',
    '|---|---|---|---|---|---|---|',
  ]
  for (const r of results) {
    lines.push(`| \`${r.name}\` | ${r.localVersion} | ${r.publishedVersion ?? '—'} | ${r.added.length} | ${r.changed.length} | ${r.removed.length} | ${r.uncommitted.length} |`)
  }
  lines.push('')
  for (const r of results) {
    const total = r.added.length + r.changed.length + r.removed.length
    if (total === 0 && r.uncommitted.length === 0) continue
    lines.push(`## ${r.name} ${r.localVersion} vs published ${r.publishedVersion ?? '—'}`, '')
    for (const p of r.added) lines.push(`- added \`${p}\``)
    for (const p of r.changed) lines.push(`- changed \`${p}\``)
    for (const p of r.removed) lines.push(`- removed \`${p}\``)
    if (r.uncommitted.length) {
      lines.push('', 'Uncommitted in the working tree:', '')
      for (const line of r.uncommitted) lines.push(`- \`${line}\``)
    }
    lines.push('')
  }
  writeFileSync(REPORT, lines.join('\n'), 'utf8')
  console.log(`\nreport written to ${REPORT}`)
}
