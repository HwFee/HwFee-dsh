/**
 * Finding the executables, tested against the failure that matters.
 *
 * THE TRAP THIS FILE EXISTS FOR. On Windows `bash` is often on PATH as
 * `C:\Windows\System32\bash.exe` — the WSL stub. It IS bash, it IS on PATH, and
 * it is the WRONG shell: a different filesystem view (`/mnt/c/...`), a different
 * user, and no `git` from the Windows install. A resolver that tries `where bash`
 * first picks it and every subsequent command fails in a way that looks like the
 * plugin is broken.
 *
 * So Git Bash is located from `git --exec-path`, which names the Git install the
 * user actually works with. The tests inject `execSync`, `exists`, `env` and
 * `platform`, so resolution never depends on the machine running them.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { GITBASH_CANDIDATES, PWSH_CANDIDATES, createResolver } = await import('../lib/resolve.js')

/**
 * Build a resolver over a fake machine.
 *
 * @param {object} opts
 * @param {string[]} [opts.exists] paths that exist
 * @param {Record<string, string>} [opts.commands] `"cmd arg"` → stdout
 * @param {Record<string, string>} [opts.env]
 * @param {string} [opts.platform]
 */
function resolverFor({ exists = [], commands = {}, env = {}, platform = 'win32' }) {
  return createResolver({
    platform,
    env,
    exists: (path) => exists.includes(path),
    execSync: (command, args) => {
      const key = command + ' ' + args.join(' ')
      const out = commands[key]
      if (out === undefined) throw new Error('ENOENT: ' + command)
      return out
    },
  })
}

test('Git Bash comes from git --exec-path, not from PATH', function () {
  const resolve = resolverFor({
    exists: ['C:/Program Files/Git/bin/bash.exe'],
    commands: { 'git --exec-path': 'C:/Program Files/Git/mingw64/libexec/git-core\n' },
  })
  assert.deepEqual(resolve('gitbash'), {
    kind: 'gitbash',
    path: 'C:/Program Files/Git/bin/bash.exe',
    source: 'git --exec-path',
  })
})

test('the WSL stub on PATH is never returned as Git Bash', function () {
  // It exists and it is bash — and it is the wrong shell. Resolution must return
  // null rather than hand the model a different filesystem view.
  const resolve = resolverFor({
    exists: ['C:/Windows/System32/bash.exe'],
    commands: { 'sh -c command -v bash': '/usr/bin/bash\n' },
  })
  assert.equal(resolve('gitbash'), null)
})

test('git missing from PATH falls through to the known install paths', function () {
  const resolve = resolverFor({ exists: ['C:/Program Files/Git/bin/bash.exe'], commands: {} })
  assert.equal(resolve('gitbash').path, 'C:/Program Files/Git/bin/bash.exe')
  assert.equal(resolve('gitbash').source, 'known path')
})

test('a git install whose bash is absent is not reported as found', function () {
  const resolve = resolverFor({
    exists: [],
    commands: { 'git --exec-path': 'D:/tools/Git/mingw64/libexec/git-core\n' },
  })
  assert.equal(resolve('gitbash'), null)
})

test('DSH_GIT_BASH overrides everything', function () {
  const resolve = resolverFor({
    exists: ['D:/portable/Git/bin/bash.exe', 'C:/Program Files/Git/bin/bash.exe'],
    commands: { 'git --exec-path': 'C:/Program Files/Git/mingw64/libexec/git-core\n' },
    env: { DSH_GIT_BASH: 'D:/portable/Git/bin/bash.exe' },
  })
  assert.deepEqual(resolve('gitbash'), {
    kind: 'gitbash',
    path: 'D:/portable/Git/bin/bash.exe',
    source: 'DSH_GIT_BASH',
  })
})

test('a stale override is ignored, not trusted', function () {
  const resolve = resolverFor({
    exists: ['C:/Program Files/Git/bin/bash.exe'],
    commands: { 'git --exec-path': 'C:/Program Files/Git/mingw64/libexec/git-core\n' },
    env: { DSH_GIT_BASH: 'D:/gone/bash.exe' },
  })
  assert.equal(resolve('gitbash').path, 'C:/Program Files/Git/bin/bash.exe')
})

test('PowerShell 7 is preferred over Windows PowerShell', function () {
  // Both are installed on a machine that has 7; 7 is the maintained one, and
  // VS Code's own detection prefers it for the same reason.
  const resolve = resolverFor({ exists: PWSH_CANDIDATES.map((c) => c.path) })
  const pwsh = resolve('pwsh')
  assert.equal(pwsh.kind, 'pwsh')
  assert.match(pwsh.path, /PowerShell\/7/)
})

test('Windows PowerShell is found when 7 is absent, with its own kind', function () {
  const winps = PWSH_CANDIDATES.find((c) => c.kind === 'windows-powershell').path
  const resolve = resolverFor({ exists: [winps] })
  assert.deepEqual(resolve('pwsh'), { kind: 'windows-powershell', path: winps, source: 'known path' })
})

test('PowerShell is not offered on a POSIX platform', function () {
  const resolve = resolverFor({ platform: 'linux', exists: PWSH_CANDIDATES.map((c) => c.path) })
  assert.equal(resolve('pwsh'), null)
})

test('the POSIX shell comes from PATH', function () {
  const resolve = resolverFor({
    platform: 'linux',
    commands: { 'sh -c command -v bash': '/usr/bin/bash\n' },
  })
  assert.deepEqual(resolve('posix-bash'), { kind: 'posix-bash', path: '/usr/bin/bash', source: 'PATH' })
})

test('resolution never throws, even when nothing works', function () {
  // The plugin must still load: the settings row is how the user learns what is
  // wrong, and a throw here would take the row down with it.
  const resolve = resolverFor({ exists: [], commands: {} })
  for (const kind of ['gitbash', 'pwsh', 'posix-bash']) {
    assert.equal(resolve(kind), null, `${kind} must resolve to null, not throw`)
  }
})

test('an unknown kind resolves to null rather than guessing', function () {
  assert.equal(resolverFor({})('fish'), null)
})

test('the candidate lists stay in a deliberate order', function () {
  // Git Bash candidates are tried after `git --exec-path`, and the Program Files
  // install leads: it is what the official installer creates.
  assert.match(GITBASH_CANDIDATES[0], /Program Files\/Git\/bin\/bash\.exe/)
  // PowerShell 7 precedes Windows PowerShell in the same list.
  assert.equal(PWSH_CANDIDATES[0].kind, 'pwsh')
  assert.equal(PWSH_CANDIDATES.at(-1).kind, 'windows-powershell')
})
