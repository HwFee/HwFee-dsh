#!/usr/bin/env node
/**
 * Install every plugin's dev dependencies.
 *
 * WHY THIS EXISTS. Each plugin is an independent package with its own
 * `package.json`, and `node_modules/` is gitignored. So a fresh checkout has no
 * `esbuild`, and the first item of every `npm test` — the freshness check, which
 * loads `tools/build-client.mjs` — dies with `ERR_MODULE_NOT_FOUND: esbuild`
 * before any assertion runs. The same failure makes `tools/audit.mjs` report
 * "freshness" regressions for plugins nobody touched.
 *
 * `--ignore-scripts` is deliberate: these packages have no install-time build of
 * their own, and running arbitrary install scripts in a repository of plugins is
 * exactly the surface this repo avoids. `--no-audit --no-fund` keeps the output
 * to what matters here.
 *
 * Usage:
 *   node tools/install-deps.mjs            # every plugin missing deps
 *   node tools/install-deps.mjs --force    # reinstall even when present
 *   node tools/install-deps.mjs --only cds-theme,genui
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pluginsDir = join(root, 'plugins')

const argv = process.argv.slice(2)
const force = argv.includes('--force')
const onlyIndex = argv.indexOf('--only')
const only = onlyIndex >= 0 && argv[onlyIndex + 1] !== undefined
  ? argv[onlyIndex + 1].split(',').map((name) => name.trim()).filter(Boolean)
  : null

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const targets = []

for (const name of readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!name.isDirectory()) continue
  const dir = join(pluginsDir, name.name)
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) continue
  if (only !== null && !only.includes(name.name)) continue

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const devDependencies = manifest.devDependencies ?? {}
  if (Object.keys(devDependencies).length === 0) continue

  const missing = Object.keys(devDependencies).some(
    (dependency) => !existsSync(join(dir, 'node_modules', dependency, 'package.json')),
  )
  if (force || missing) targets.push(name.name)
}

if (targets.length === 0) {
  console.log('every plugin already has its declared dev dependencies')
  process.exit(0)
}

let failed = 0
for (const name of targets) {
  const dir = join(pluginsDir, name)
  console.log(`\n==> ${name}`)
  // One command string with `shell`, because `npm` is a .cmd shim on Windows and
  // passing an argument array through a shell only earns Node's DEP0190 warning.
  const result = spawnSync(
    `${npm} ci --ignore-scripts --no-audit --no-fund`,
    { cwd: dir, stdio: 'inherit', shell: true },
  )
  if (result.status !== 0) {
    failed += 1
    console.error(`${name}: npm ci exited ${String(result.status)}`)
  }
}

if (failed > 0) {
  console.error(`\n${String(failed)} of ${String(targets.length)} plugin(s) failed to install`)
  process.exit(1)
}
console.log(`\ninstalled dependencies for ${String(targets.length)} plugin(s)`)
