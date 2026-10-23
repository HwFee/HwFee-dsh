/**
 * The repository's preflight checker, tested against synthetic profiles.
 *
 * WHY THIS LIVES IN THE GENUI PACKAGE. `tools/preflight.mjs` is repository-level,
 * and this repository has no root test runner — each plugin owns its own suite.
 * The checker's whole value is that it catches the profile failures that took
 * two debugging sessions, so it cannot be the one piece nobody tests; genui is
 * the package that suffered most from a silent unmount, so its suite carries it.
 *
 * Every test builds a profile in a temp directory and runs the REAL CLI, so what
 * is asserted is the exit code and the messages a person would see.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const PREFLIGHT = join(ROOT, 'tools', 'preflight.mjs')

/**
 * Build a throwaway DSH home with one profile.
 *
 * @param {object} opts
 * @param {string[]} opts.bundles the profile's dsh.profile.bundles
 * @param {Record<string,string>} opts.deps its dependencies
 * @param {string} [opts.patch] cordis.patch.yml contents
 * @param {Array<{name: string, files?: Record<string,string>}>} [opts.links]
 *        link-installed packages to materialize on disk
 * @returns {{ dir: string, run: () => { status: number, stdout: string, stderr: string }, cleanup: () => void }}
 */
function profile({ bundles, deps, patch = '- id: x\n  name: "@deepseek-ai/dsh-base"\n', links = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-preflight-'))
  const profileDir = join(dir, 'profiles', 'test')
  mkdirSync(profileDir, { recursive: true })

  const resolvedDeps = { ...deps }
  for (const link of links) {
    const target = join(dir, 'packages', link.name.replace(/[@/]/g, '_'))
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: link.name }))
    for (const [rel, body] of Object.entries(link.files ?? {})) {
      const path = join(target, rel)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, body)
    }
    resolvedDeps[link.name] = 'link:' + target
  }

  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: 'test-profile',
    private: true,
    dependencies: resolvedDeps,
    dsh: { profile: { bundles } },
  }, null, 2))
  if (patch !== null) writeFileSync(join(profileDir, 'cordis.patch.yml'), patch)

  return {
    dir,
    run: () => spawnSync(process.execPath, [PREFLIGHT, '--profile', 'test'], {
      env: { ...process.env, DSH_HOME: dir, APPDATA: join(dir, 'no-appdata') },
      encoding: 'utf8',
    }),
    runJson: () => JSON.parse(spawnSync(process.execPath, [PREFLIGHT, '--profile', 'test', '--json'], {
      env: { ...process.env, DSH_HOME: dir, APPDATA: join(dir, 'no-appdata') }, encoding: 'utf8',
    }).stdout),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

const CORE = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

test('a healthy profile passes', function () {
  const p = profile({
    bundles: [...CORE, 'dsh-demo'],
    deps: { 'dsh-demo': '1.0.0' },
    links: [{
      name: 'dsh-demo',
      files: {
        'cordis.patch.yml': "- insert:\n    - id: demo\n      name: 'dsh-demo'\n",
        'client/client.js': '// built\n',
      },
    }],
  })
  try {
    const result = p.run()
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const report = p.runJson()
    assert.equal(report.findings.filter(item => item.level === 'fail').length, 0)
    assert.ok(report.findings.filter(item => item.level === 'warn').every(item => item.check === 'freshness'),
      'only independent checkout freshness hints may accompany a healthy profile')
  } finally {
    p.cleanup()
  }
})

test('a truncated bundle list FAILS and names the missing plugins', function () {
  // THE REAL INCIDENT. `dsh.profile.bundles` was cut to the two core bundles
  // while four plugins stayed installed; the app started normally and none of
  // them mounted. This asserts the checker catches exactly that shape.
  const p = profile({
    bundles: CORE,
    deps: { 'dsh-demo': '1.0.0', '@hwfee/dsh-genui': '0.1.0' },
    links: [
      { name: 'dsh-demo', files: { 'cordis.patch.yml': "- insert:\n    - id: demo\n      name: 'dsh-demo'\n" } },
      { name: '@hwfee/dsh-genui', files: { 'cordis.patch.yml': "- insert:\n    - id: genui\n      name: '@hwfee/dsh-genui'\n" } },
    ],
  })
  try {
    const result = p.run()
    assert.equal(result.status, 1, 'a broken profile must exit non-zero so it can gate a launch')
    assert.match(result.stdout, /dsh-demo is installed but missing from dsh\.profile\.bundles/)
    assert.match(result.stdout, /@hwfee\/dsh-genui is installed but missing from dsh\.profile\.bundles/)
    assert.match(result.stdout, /only 2 bundles are listed/)
    assert.match(result.stdout, /Refusing|fix:/, 'a failure must carry the fix')
  } finally {
    p.cleanup()
  }
})

test('a bundle that is not a dependency fails — the row cannot resolve', function () {
  const p = profile({
    bundles: [...CORE, 'ghost-plugin'],
    deps: {},
  })
  try {
    const result = p.run()
    assert.equal(result.status, 1)
    assert.match(result.stdout, /bundle "ghost-plugin" is listed but is not a dependency/)
  } finally {
    p.cleanup()
  }
})

test('core bundles out of order fail', function () {
  const p = profile({
    bundles: ['@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-base'],
    deps: {},
  })
  try {
    const result = p.run()
    assert.equal(result.status, 1)
    assert.match(result.stdout, /must be @deepseek-ai\/dsh-base, @deepseek-ai\/dsh-web-app/)
  } finally {
    p.cleanup()
  }
})

test('a link install missing its patch fails, and says why that matters', function () {
  const p = profile({
    bundles: [...CORE, 'dsh-demo'],
    deps: {},
    links: [{ name: 'dsh-demo', files: { 'client/client.js': '// built\n' } }],
  })
  try {
    const result = p.run()
    assert.equal(result.status, 1)
    assert.match(result.stdout, /has no cordis\.patch\.yml/)
  } finally {
    p.cleanup()
  }
})

test('a patch whose name does not match the package fails', function () {
  // The rename trap: patch row says `name: old-name` while the package is
  // `dsh-demo`. The row resolves to nothing and the plugin silently disappears.
  const p = profile({
    bundles: [...CORE, 'dsh-demo'],
    deps: {},
    links: [{
      name: 'dsh-demo',
      files: { 'cordis.patch.yml': "- insert:\n    - id: demo\n      name: 'old-name'\n" },
    }],
  })
  try {
    const result = p.run()
    assert.equal(result.status, 1)
    assert.match(result.stdout, /patch inserts old-name/)
  } finally {
    p.cleanup()
  }
})

test('client/src without a built client.js fails', function () {
  const p = profile({
    bundles: [...CORE, 'dsh-demo'],
    deps: {},
    links: [{
      name: 'dsh-demo',
      files: {
        'cordis.patch.yml': "- insert:\n    - id: demo\n      name: 'dsh-demo'\n",
        'client/src/index.js': 'export const x = 1\n',
      },
    }],
  })
  try {
    const result = p.run()
    assert.equal(result.status, 1)
    assert.match(result.stdout, /has client\/src but no built client\/client\.js/)
    assert.match(result.stdout, /npm run build/)
  } finally {
    p.cleanup()
  }
})

test('an id-targeted override row without a name is legal', function () {
  // The docs describe overriding a bundle's row by `id`; those rows carry only
  // `config`. Treating a missing `name` as an error would flag a correct file.
  const p = profile({
    bundles: [...CORE, 'dsh-demo'],
    deps: { 'dsh-demo': '1.0.0' },
    links: [{
      name: 'dsh-demo',
      files: {
        'cordis.patch.yml': "- insert:\n    - id: demo\n      name: 'dsh-demo'\n",
        'client/client.js': '// built\n',
      },
    }],
    patch: [
      '- id: ui-chat',
      '  config:',
      '    transcriptView: standard',
      '- id: demo',
      '  name: "dsh-demo"',
      '  config:',
      '    enabled: true',
      '',
    ].join('\n'),
  })
  try {
    const result = p.run()
    assert.equal(result.status, 0, result.stdout + result.stderr)
  } finally {
    p.cleanup()
  }
})

test('a patch row naming an uninstalled plugin fails', function () {
  const p = profile({
    bundles: CORE,
    deps: {},
    patch: '- id: ghost\n  name: "not-installed"\n  config:\n    enabled: true\n',
  })
  try {
    const result = p.run()
    assert.equal(result.status, 1)
    assert.match(result.stdout, /patch row "ghost" inserts "not-installed"/)
  } finally {
    p.cleanup()
  }
})

test('a missing profile directory fails rather than passing vacuously', function () {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-preflight-empty-'))
  try {
    const result = spawnSync(process.execPath, [PREFLIGHT, '--profile', 'nope'], {
      env: { ...process.env, DSH_HOME: dir, APPDATA: join(dir, 'no-appdata') },
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /profile directory not found/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the checker never writes to the profile it inspects', function () {
  // A checker that repairs things becomes a second source of truth — the exact
  // failure mode it exists to detect. This pins "read-only" as a property.
  const p = profile({ bundles: CORE, deps: { 'dsh-demo': '1.0.0' } })
  try {
    const before = readFileSync(join(p.dir, 'profiles', 'test', 'package.json'), 'utf8')
    const beforeMtime = statSync(join(p.dir, 'profiles', 'test', 'package.json')).mtimeMs
    p.run()
    const after = readFileSync(join(p.dir, 'profiles', 'test', 'package.json'), 'utf8')
    const afterMtime = statSync(join(p.dir, 'profiles', 'test', 'package.json')).mtimeMs
    assert.equal(after, before, 'package.json must be untouched')
    assert.equal(afterMtime, beforeMtime, 'not even rewritten with identical bytes')
  } finally {
    p.cleanup()
  }
})
