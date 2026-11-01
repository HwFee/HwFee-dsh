#!/usr/bin/env node
/**
 * Publish the host-patch tooling into the theme package.
 *
 * WHY A GENERATED COPY. `tools/patch-asar.mjs` is the canonical applier and `patches/*.patch`
 * are the reviewable diffs, but they live at the repository root, so an installed
 * `dsh-cds-theme` (npm or a Release tarball) receives neither — a user who installs the plugin
 * cannot apply the patch at all. npm cannot package files from outside the package directory,
 * so the shipped copy is generated here, exactly like `client/client.js` is a committed build
 * artifact. `--check` fails when the copy drifts, so the two cannot silently disagree.
 *
 * Usage:
 *   node tools/sync-host-patch.mjs           # write the packaged copy
 *   node tools/sync-host-patch.mjs --check   # exit 1 when it is stale
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const target = join(root, 'plugins', 'cds-theme', 'host-patch')

/** Canonical source → path inside the package. */
const FILES = [
  ['tools/patch-asar.mjs', 'patch-asar.mjs'],
  ['patches/dsh-tool-fs-hunk-lines.patch', 'patches/dsh-tool-fs-hunk-lines.patch'],
  ['patches/dsh-web-frontend-diff-start.patch', 'patches/dsh-web-frontend-diff-start.patch'],
]

/** The packaged applier must not point at repository-only paths when it prints them. */
function adapt(source) {
  return source.replace(
    ' * The matching unified diff for review/`git apply` is `patches/dsh-tool-fs-hunk-lines.patch`;',
    ' * The matching unified diffs for review live in `patches/` beside this file;',
  )
}

const check = process.argv.includes('--check')
const stale = []

for (const [from, to] of FILES) {
  const source = readFileSync(join(root, from), 'utf8')
  const text = from === 'tools/patch-asar.mjs' ? adapt(source) : source
  const destination = join(target, to)
  if (check) {
    const current = existsSync(destination) ? readFileSync(destination, 'utf8') : null
    if (current !== text) stale.push(relative(root, destination))
    continue
  }
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, text)
  console.log(`wrote ${relative(root, destination)}`)
}

if (check) {
  if (stale.length > 0) {
    console.error('host-patch copy is STALE:')
    for (const file of stale) console.error(`  ${file}`)
    console.error('run `node tools/sync-host-patch.mjs` and commit the result')
    process.exit(1)
  }
  console.log('host-patch copy is up to date')
}
