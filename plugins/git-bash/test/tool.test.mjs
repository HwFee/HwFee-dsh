/**
 * The `run_shell` tool's contract.
 *
 * Three decisions are worth pinning because each is counter-intuitive:
 *
 *   1. A NONZERO EXIT IS NOT A TOOL ERROR. `grep` that matched nothing exits 1;
 *      that is an answer, and the model must see the code and the output.
 *   2. THE ARGUMENTS DEPEND ON THE SHELL FAMILY. `-lc` is bash's spelling;
 *      PowerShell needs `-NoProfile -Command`. Swapping them is silent: the
 *      shell errors about an unknown switch and the command never runs.
 *   3. A MISSING SHELL IS an error with a message naming the fix — and the tool
 *      reads the mode LIVE, so a user who changes the setting mid-session gets
 *      the new shell on the next call.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  createRunShellTool, messageFor, runInShell, TOOL_NAME,
  delegatedCommand, runThroughHost, resolveWorkdir, shouldDelegate,
} = await import('../lib/index.js')

const GITBASH = { kind: 'gitbash', path: 'C:/Program Files/Git/bin/bash.exe' }
const PWSH = { kind: 'pwsh', path: 'C:/Program Files/PowerShell/7/pwsh.exe' }

/** A tool bound to a fixed resolution. */
const toolWith = (result) => createRunShellTool(() => result)

/** Record the argv a run would use. */
function recorder(outcome = { exitCode: 0, stdout: '', stderr: '' }) {
  const calls = []
  const run = async (path, argv, cwd) => {
    calls.push({ path, argv, cwd })
    return outcome
  }
  return { calls, run }
}

test('the schema is raw JSON Schema, which is what register() expects', function () {
  // `ctx.tools.register()` ships `parameters` to the provider verbatim. The
  // defineTool author dialect lacks a root `type` and is rejected at request
  // time with `is not of type "object"`.
  const tool = toolWith({ ok: true, shell: GITBASH })
  assert.equal(tool.name, TOOL_NAME)
  assert.equal(tool.parameters.type, 'object')
  assert.deepEqual(tool.parameters.required, ['command'])
  assert.equal('required' in tool.parameters.properties.command, false,
    'requiredness is the root array, never a per-property flag')
})

test('a bash family shell gets -lc', async function () {
  const { calls, run } = recorder()
  await runInShell(GITBASH, { command: 'echo hi' }, run)
  assert.deepEqual(calls[0].argv, ['-lc', 'echo hi'])
})

test('a PowerShell family shell gets -NoProfile -Command', async function () {
  // The silent failure this prevents: PowerShell reading `-l` as a switch and
  // never running the command.
  const { calls, run } = recorder()
  await runInShell(PWSH, { command: 'Get-Date' }, run)
  assert.deepEqual(calls[0].argv, ['-NoProfile', '-NonInteractive', '-Command', 'Get-Date'])
})

test('the result names the shell and its family', async function () {
  const { run } = recorder({ exitCode: 0, stdout: 'hi\n', stderr: '' })
  const result = await runInShell(GITBASH, { command: 'echo hi' }, run)
  assert.deepEqual(result, {
    shell: GITBASH.path,
    kind: 'gitbash',
    exitCode: 0,
    stdout: 'hi\n',
    stderr: '',
  })
})

test('a nonzero exit is returned, not thrown', async function () {
  const { run } = recorder({ exitCode: 1, stdout: '', stderr: '' })
  const result = await runInShell(GITBASH, { command: 'grep zzz missing.txt' }, run)
  assert.equal(result.exitCode, 1)
})

test('an empty command is refused before any shell starts', async function () {
  for (const args of [{}, { command: '' }, { command: '   ' }, null]) {
    const { calls, run } = recorder()
    await assert.rejects(() => runInShell(GITBASH, args, run), /needs a non-empty `command`/)
    assert.equal(calls.length, 0, 'nothing may be spawned for an invalid call')
  }
})

test('a missing shell is a tool error that names the mode and the fix', async function () {
  const tool = toolWith({ ok: false, reason: 'gitbash-not-found' })
  await assert.rejects(
    () => tool.execute({ command: 'echo hi' }),
    (error) => {
      assert.match(error.message, /Git Bash is selected but was not found/)
      assert.match(error.message, /DSH_GIT_BASH/, 'the message must name the override')
      assert.match(error.message, /will not silently switch/,
        'and must say that no fallback happened, because that is the surprising part')
      return true
    },
  )
})

test('the tool reads the mode LIVE, so a settings change applies', async function () {
  // A resolution cached at apply time would keep running the old shell until a
  // restart; the user just changed a setting and expects it to take effect on
  // the NEXT call. This pins that `execute` asks its resolver every time, by
  // flipping the resolver between two shells and observing both error paths.
  let reason = 'gitbash-not-found'
  let asked = 0
  const tool = createRunShellTool(() => {
    asked += 1
    return { ok: false, reason }
  })

  await assert.rejects(() => tool.execute({ command: 'echo hi' }), /Git Bash is selected/)
  assert.equal(asked, 1, 'the resolver runs once per call, not once per plugin')

  reason = 'pwsh-not-found'
  await assert.rejects(() => tool.execute({ command: 'echo hi' }), /PowerShell is selected/)
  assert.equal(asked, 2, 'and again for the next call, with the new value')
})

test('every failure reason has a sentence, and none is a code', function () {
  for (const reason of ['gitbash-not-found', 'pwsh-not-found', 'no-shell-for-platform', 'no-shell-found']) {
    const text = messageFor(reason)
    assert.notEqual(text, reason, `${reason} must be explained, not echoed`)
    assert.ok(text.length > 30, `${reason}'s message must be actionable`)
  }
  assert.match(messageFor('something-else'), /could not be started/)
})

// ROUTE 2: the selected shell runs THROUGH the host executor.
//
// `child_process.execFile` bypasses the sandbox, approval ledger, cancellation
// and subprocess lifetime. Delegation fixes that, but it adds a shell layer, so
// the quoting is the whole contract: a command containing quotes, `$`, `&&` or
// newlines must reach the selected interpreter byte for byte.
test('delegation names the selected interpreter and quotes the command', function () {
  assert.equal(
    delegatedCommand(GITBASH, "echo 'hi' && echo $HOME", 'win32'),
    "& 'C:/Program Files/Git/bin/bash.exe' -lc 'echo ''hi'' && echo $HOME'",
  )
  assert.equal(
    delegatedCommand(PWSH, "Write-Output 'x'", 'win32'),
    "& 'C:/Program Files/PowerShell/7/pwsh.exe' -NoProfile -NonInteractive -Command 'Write-Output ''x'''",
  )
  assert.equal(
    delegatedCommand({ kind: 'posix-bash', path: '/bin/bash' }, "echo 'hi'", 'linux'),
    "'/bin/bash' -lc 'echo '\\''hi'\\'''",
  )
})

test('a delegated call crosses ctx.shell and maps its result', async function () {
  const calls = []
  const hostShell = {
    resolve(request) { calls.push(request); return { ...request, resolved: true } },
    async execute(spec) {
      calls.push(spec)
      return { result: async () => ({ exitCode: 3, stdout: { text: 'out' }, stderr: { text: 'err' } }) }
    },
  }
  const result = await runThroughHost(hostShell, PWSH, { command: 'Get-Date', workdir: 'C:/tmp' })
  assert.equal(calls.length, 2, 'resolve then execute')
  assert.equal(calls[0].workdir, 'C:/tmp', 'the call workdir reaches the spec')
  assert.match(calls[0].command, /pwsh\.exe' -NoProfile -NonInteractive -Command 'Get-Date'/)
  assert.deepEqual(result, {
    shell: PWSH.path, kind: 'pwsh', via: 'host', exitCode: 3, stdout: 'out', stderr: 'err',
  })
})

test('PowerShell mode crosses the host executor on Windows', async function () {
  let executed = 0
  const hostShell = {
    resolve: (request) => request,
    async execute() {
      return { result: async () => { executed += 1; return { exitCode: 0, stdout: { text: 'host' }, stderr: { text: '' } } } }
    },
  }
  const tool = createRunShellTool(
    () => ({ ok: true, kind: 'pwsh', path: PWSH.path }),
    { getShell: () => hostShell, platform: 'win32' },
  )
  const result = await tool.execute({ command: 'Get-Date' })
  assert.equal(executed, 1)
  assert.equal(result.stdout, 'host', 'the direct child_process path must not have run')
  assert.equal(result.via, 'host')
})

// REGRESSION: Git Bash cannot be delegated on Windows.
//
// The host executor there is pwsh-sandbox; asking it to start bash.exe fails
// with NtCreateDirectoryObject / 0xC0000022 (reproduced in the real app). The
// tool therefore keeps the direct spawn for this mode — and SAYS SO, because a
// command that quietly bypasses the sandbox must never look like one that
// crossed it. A future host that permits the nesting can flip this test.
test('the delegation decision excludes Git Bash on Windows and keeps POSIX', function () {
  assert.equal(shouldDelegate('gitbash', 'win32', true), false,
    'the sandbox cannot create the MSYS process')
  assert.equal(shouldDelegate('posix-bash', 'win32', true), false)
  assert.equal(shouldDelegate('pwsh', 'win32', true), true)
  assert.equal(shouldDelegate('windows-powershell', 'win32', true), true)
  assert.equal(shouldDelegate('posix-bash', 'linux', true), true)
  assert.equal(shouldDelegate('pwsh', 'linux', true), false)
  assert.equal(shouldDelegate('pwsh', 'win32', false), false,
    'a profile without ctx.shell falls back to the direct path')
})

test('the call inherits the session working directory when none is passed', async function () {
  const asked = []
  const service = { async ensure(agent, signal) { asked.push({ agent, signal }); return 'C:/session' } }
  assert.equal(await resolveWorkdir({}, { agent: { id: 'a' }, signal: 'sig' }, () => service), 'C:/session')
  assert.equal(asked.length, 1)
  assert.equal(await resolveWorkdir({ workdir: 'C:/explicit' }, {}, () => service), 'C:/explicit',
    'an explicit workdir wins')
  assert.equal(await resolveWorkdir({}, {}, () => service), undefined,
    'no agent means no session directory')
  assert.equal(await resolveWorkdir({}, { agent: {} }, () => undefined), undefined,
    'a profile without the service keeps the executor default')
})

test('the result render names the shell and the family', function () {
  const tool = toolWith({ ok: true, shell: GITBASH })
  const rendered = tool.output.render({}, {
    shell: 'C:/Program Files/Git/bin/bash.exe', kind: 'gitbash', exitCode: 0, stdout: 'ok\n', stderr: '',
  })
  assert.equal(rendered.length, 1)
  assert.match(rendered[0].text, /\[gitbash · C:\/Program Files\/Git\/bin\/bash\.exe\] exit 0/,
    'a command that ran in the wrong shell is indistinguishable without this')
})

test('the result render says whether the host executor ran it', function () {
  // Host and direct results used to look identical ("direct" was the only
  // marker, and it was appended only for the direct path). A model reading
  // "exit 0" could not tell a sandboxed run from one that bypassed it.
  const tool = toolWith({ ok: true })
  const host = tool.output.render({}, {
    shell: 's', kind: 'pwsh', exitCode: 0, stdout: '', stderr: '', via: 'host',
  })[0].text
  assert.match(host, /\] exit 0 · host$/)
  const direct = tool.output.render({}, {
    shell: 's', kind: 'gitbash', exitCode: 0, stdout: '', stderr: '',
    via: 'direct', note: 'Ran directly: no sandbox.',
  })[0].text
  assert.match(direct, /\] exit 0 · direct\nRan directly: no sandbox\.$/)
})

test('stderr is surfaced when present, omitted when empty', function () {
  const tool = toolWith({ ok: true, shell: GITBASH })
  assert.match(tool.output.render({}, { shell: 's', kind: 'k', exitCode: 2, stdout: '', stderr: 'boom' })[0].text,
    /stderr: boom/)
  assert.ok(!tool.output.render({}, { shell: 's', kind: 'k', exitCode: 0, stdout: 'ok', stderr: '' })[0].text
    .includes('stderr:'))
})

test('the tool speaks the render-intent vocabulary', function () {
  const tool = toolWith({ ok: true, shell: GITBASH })
  const intent = tool.presentCall({ command: 'ls -la' })
  assert.equal(intent.card, 'generic')
  assert.equal(intent.kind, 'execute')
  assert.equal(intent.rawInput, 'ls -la')
  assert.ok(tool.presentCall({ command: 'x'.repeat(500) }).title.length <= 80)
})
