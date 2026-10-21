/**
 * The three modes, and the decision each one makes.
 *
 * THE RULE THAT MATTERS IS ABOUT FALLBACK. `auto` may fall back and must say
 * which way it went; an EXPLICIT mode may not. Handing PowerShell to a user who
 * asked for Git Bash turns every `grep`, `$VAR` and `&&` into a confusing
 * failure that looks like the tool is broken — worse than refusing to run.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  DEFAULT_MODE, KIND_LABELS, LEGACY_BOOLEAN_KEY, MODES, MODE_LABELS, REASON_LABELS,
  chooseShell, migrateLegacyMode, readMode, writeMode,
} = await import('../lib/mode.js')
const { resolveShell } = await import('../lib/index.js')

/** A storage double. */
function fakeStorage(initial = {}) {
  const data = { ...initial }
  return { getItem: (k) => (Object.hasOwn(data, k) ? data[k] : null), setItem: (k, v) => { data[k] = v }, data }
}

const hostile = {
  get getItem() { throw new Error('SecurityError') },
  setItem() { throw new Error('SecurityError') },
}

/** A resolver over a fixed set of available shells. */
const resolveWith = (available) => (kind) => available[kind] ?? null

const GITBASH = { kind: 'gitbash', path: 'C:/Program Files/Git/bin/bash.exe', source: 'git --exec-path' }
const PWSH7 = { kind: 'pwsh', path: 'C:/Program Files/PowerShell/7/pwsh.exe', source: 'known path' }
const WINPS = { kind: 'windows-powershell', path: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', source: 'known path' }
const POSIX = { kind: 'posix-bash', path: '/usr/bin/bash', source: 'PATH' }

// ------------------------------------------------------------------ storage

test('the default mode is auto', function () {
  assert.equal(DEFAULT_MODE, 'auto')
  assert.deepEqual(MODES, ['auto', 'pwsh', 'gitbash'])
})

test('a stored mode round-trips', function () {
  const storage = fakeStorage()
  assert.equal(writeMode(storage, 'k', 'gitbash'), true)
  assert.equal(readMode(storage, 'k'), 'gitbash')
})

test('an unknown stored value falls back to auto', function () {
  for (const junk of ['', 'bash', 'AUTO', 'pwsh.exe']) {
    assert.equal(readMode(fakeStorage({ k: junk }), 'k'), 'auto', `"${junk}" is not a mode`)
  }
})

test('a storage that throws yields the default', function () {
  assert.equal(readMode(hostile, 'k'), 'auto')
  assert.equal(writeMode(hostile, 'k', 'pwsh'), false)
})

test('writing an invalid mode is refused', function () {
  const storage = fakeStorage()
  assert.equal(writeMode(storage, 'k', 'fish'), false)
  assert.equal(readMode(storage, 'k'), 'auto')
})

test('the legacy boolean key is documented, not silently reused', function () {
  // The first build stored `exposeNativeShell` — a different question ("keep the
  // platform shell visible as a tool"), not a shell choice. It is named here so
  // a migration can find it; reading it as a mode would map "false" to
  // "gitbash" and quietly change which shell runs.
  assert.equal(typeof LEGACY_BOOLEAN_KEY, 'string')
  assert.notEqual(LEGACY_BOOLEAN_KEY, undefined)
})

// --------------------------------------------------------------- migration

test('the legacy "false" migrates to gitbash', function () {
  const storage = fakeStorage({ [LEGACY_BOOLEAN_KEY]: 'false' })
  assert.equal(migrateLegacyMode(storage, 'k'), 'gitbash')
  assert.equal(storage.data.k, 'gitbash')
})

test('the legacy "true" migrates to auto, which behaves the same', function () {
  const storage = fakeStorage({ [LEGACY_BOOLEAN_KEY]: 'true' })
  assert.equal(migrateLegacyMode(storage, 'k'), 'auto')
})

test('migration never overwrites a mode the user has since chosen', function () {
  const storage = fakeStorage({ [LEGACY_BOOLEAN_KEY]: 'false', k: 'pwsh' })
  assert.equal(migrateLegacyMode(storage, 'k'), null)
  assert.equal(storage.data.k, 'pwsh')
})

test('migration is a no-op when the legacy key is absent or junk', function () {
  for (const initial of [{}, { [LEGACY_BOOLEAN_KEY]: '' }, { [LEGACY_BOOLEAN_KEY]: 'yes' }]) {
    const storage = fakeStorage(initial)
    assert.equal(migrateLegacyMode(storage, 'k'), null)
    assert.equal(Object.hasOwn(storage.data, 'k'), false, 'nothing is written')
  }
})

test('migration tolerates a storage that throws on either read', function () {
  assert.equal(migrateLegacyMode(hostile, 'k'), null)
  assert.equal(migrateLegacyMode(undefined, 'k'), null)
})

test('a migration whose write fails still reports the value for this session', function () {
  // Private mode: the user's old choice still applies now, and the next launch
  // retries the write.
  const storage = { getItem: (k) => (k === LEGACY_BOOLEAN_KEY ? 'false' : null), setItem() { throw new Error('Quota') } }
  assert.equal(migrateLegacyMode(storage, 'k'), 'gitbash')
})

// ------------------------------------------------------------------- choice

test('gitbash mode returns Git Bash when it exists', function () {
  const result = chooseShell('gitbash', { resolve: resolveWith({ gitbash: GITBASH }), platform: 'win32' })
  assert.equal(result.ok, true)
  assert.equal(result.shell.path, GITBASH.path)
})

test('gitbash mode REFUSES to fall back to PowerShell', function () {
  // The whole point of an explicit choice: a POSIX command under PowerShell
  // fails in ways that read as "the tool is broken".
  const result = chooseShell('gitbash', { resolve: resolveWith({ pwsh: PWSH7 }), platform: 'win32' })
  assert.deepEqual(result, { ok: false, reason: 'gitbash-not-found' })
})

test('pwsh mode returns PowerShell and refuses to fall back to Git Bash', function () {
  const ok = chooseShell('pwsh', { resolve: resolveWith({ pwsh: PWSH7, gitbash: GITBASH }), platform: 'win32' })
  assert.equal(ok.ok, true)
  assert.equal(ok.shell.kind, 'pwsh')

  const missing = chooseShell('pwsh', { resolve: resolveWith({ gitbash: GITBASH }), platform: 'win32' })
  assert.deepEqual(missing, { ok: false, reason: 'pwsh-not-found' })
})

test('auto prefers Git Bash', function () {
  const result = chooseShell('auto', {
    resolve: resolveWith({ gitbash: GITBASH, pwsh: PWSH7 }),
    platform: 'win32',
  })
  assert.equal(result.ok, true)
  assert.equal(result.shell.kind, 'gitbash')
  assert.match(result.shell.source, /\(auto\)$/,
    'the source says this was the auto preference, not an explicit choice')
})

test('auto falls back to the platform shell, and SAYS it fell back', function () {
  const result = chooseShell('auto', { resolve: resolveWith({ pwsh: PWSH7 }), platform: 'win32' })
  assert.equal(result.ok, true)
  assert.equal(result.shell.kind, 'pwsh')
  assert.match(result.shell.source, /auto fallback/,
    'the row must be able to say "auto chose PowerShell" — a silent fallback is the bug')
})

test('auto on a POSIX platform uses the platform bash', function () {
  const result = chooseShell('auto', { resolve: resolveWith({ 'posix-bash': POSIX }), platform: 'linux' })
  assert.equal(result.ok, true)
  assert.equal(result.shell.kind, 'posix-bash')
})

test('auto reports a total failure instead of pretending', function () {
  const result = chooseShell('auto', { resolve: resolveWith({}), platform: 'win32' })
  assert.deepEqual(result, { ok: false, reason: 'no-shell-found' })
})

test('an unknown mode is treated as auto rather than as an error', function () {
  // A stale value from a future version should still run commands.
  const result = chooseShell('fish', { resolve: resolveWith({ gitbash: GITBASH }), platform: 'win32' })
  assert.equal(result.ok, true)
  assert.equal(result.shell.kind, 'gitbash')
})

test('every mode has a label', function () {
  for (const mode of MODES) {
    assert.equal(typeof MODE_LABELS[mode], 'string', `missing label for ${mode}`)
  }
})

test('every reason has a label, so no raw code reaches the row', function () {
  for (const reason of ['gitbash-not-found', 'pwsh-not-found', 'no-shell-for-platform', 'no-shell-found']) {
    assert.match(REASON_LABELS[reason] ?? '', /^shell\.reason\./, `missing label for ${reason}`)
  }
  // And every reason `chooseShell` can actually produce is covered above.
  const produced = new Set()
  for (const mode of ['auto', 'pwsh', 'gitbash']) {
    for (const platform of ['win32', 'linux']) {
      const result = chooseShell(mode, { resolve: () => null, platform })
      if (result.ok !== true) produced.add(result.reason)
    }
  }
  for (const reason of produced) {
    assert.equal(typeof REASON_LABELS[reason], 'string',
      `chooseShell can return "${reason}", which the row cannot translate`)
  }
})

test('every resolved family has a label', function () {
  // The kinds are NOT the modes: `pwsh` covers 7 and 5.1, `gitbash` becomes
  // `posix-bash` off Windows. A kind without a label shows through untranslated.
  for (const kind of ['gitbash', 'posix-bash', 'pwsh', 'windows-powershell']) {
    assert.match(KIND_LABELS[kind] ?? '', /^shell\.kind\./, `missing label for ${kind}`)
  }
})

// ------------------------------------------------------- the host entry point

test('resolveShell returns a flat record for each mode', async function () {
  const resolve = resolveWith({ gitbash: GITBASH, pwsh: PWSH7 })
  for (const mode of MODES) {
    const result = await resolveShell(mode, { resolve, platform: 'win32' })
    assert.equal(result.ok, true, `${mode} on this fake machine`)
    assert.equal(result.mode, mode)
    assert.equal(typeof result.path, 'string')
    assert.equal(typeof result.kind, 'string')
    assert.equal(result.reason, null)
  }
})

test('resolveShell reports auto\'s downgrade in `source`, not silently', async function () {
  const result = await resolveShell('auto', { resolve: resolveWith({ pwsh: PWSH7 }), platform: 'win32' })
  assert.equal(result.ok, true)
  assert.equal(result.kind, 'pwsh')
  assert.match(result.source, /auto fallback/,
    'the row must be able to say "auto chose PowerShell"; a silent fallback is the bug')
})

test('resolveShell keeps a forced mode from falling back', async function () {
  // `gitbash` with only PowerShell on the machine must fail, not quietly run
  // PowerShell: the user chose POSIX semantics on purpose.
  const result = await resolveShell('gitbash', { resolve: resolveWith({ pwsh: PWSH7 }), platform: 'win32' })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'gitbash-not-found')
  assert.equal(result.path, null, 'a failure names no executable, so nothing can run it by accident')
})

test('resolveShell never throws, even when nothing resolves', async function () {
  for (const mode of MODES) {
    for (const platform of ['win32', 'linux', 'darwin']) {
      const result = await resolveShell(mode, { resolve: () => null, platform })
      assert.equal(result.ok, false)
      assert.equal(typeof result.reason, 'string')
      assert.equal(result.path, null)
    }
  }
})

test('resolveShell defaults to auto rather than to an error', async function () {
  const result = await resolveShell(undefined, { resolve: resolveWith({ gitbash: GITBASH }), platform: 'win32' })
  assert.equal(result.mode, 'auto')
  assert.equal(result.ok, true)
})

test('the page payload survives a JSON round-trip', async function () {
  // `webserver/index-inject` serialises the value into the HTML. A Promise or a
  // class instance would arrive as `{}`, and the row would read "not found"
  // forever — the exact bug the previous build shipped once.
  const result = await resolveShell('auto', { resolve: resolveWith({ gitbash: GITBASH }), platform: 'win32' })
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
})

test('auto on this machine resolves to something real', async function () {
  // Not a fake: the point of the feature is that auto follows the machine, so
  // the real resolver is exercised once. It is allowed to fail on a machine with
  // neither Git nor PowerShell, but it must never throw and must never claim a
  // shell it cannot name.
  const result = await resolveShell('auto')
  assert.equal(typeof result.ok, 'boolean')
  if (result.ok) {
    assert.equal(typeof result.path, 'string')
    assert.ok(result.path.length > 0)
    assert.match(result.source, /auto/,
      'auto always says so in `source`, whichever branch it took')
  } else {
    assert.equal(typeof result.reason, 'string')
  }
})
