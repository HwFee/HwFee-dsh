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

/**
 * The services a call needs to be ALLOWED to run, plus its session.
 *
 * Since the fail-closed change, `execute` refuses unless it can resolve the
 * session's sandbox mode, and the direct path additionally requires that mode to
 * be `danger-full-access`. So every test that expects a command to run has to
 * supply both facts — which is the point: there is no longer a way to reach a
 * spawn without them.
 *
 * @param {string} [mode] the resolved sandbox mode
 * @returns {{ services: object, exec: object }} the readers and the call context
 */
const allowed = (mode = 'danger-full-access') => ({
  services: {
    getSandboxPolicy: () => ({ resolve: () => ({ mode, workspaceRoot: 'C:/ws' }) }),
    getSessions: () => ({ get: (id) => ({ id, header: { id } }) }),
  },
  exec: { agent: { id: 'session-1' } },
})

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

// CANCELLATION, the direct path.
//
// THE BUG THIS PINS (measured before the fix): `execute` forwarded `exec.signal`
// only on the host-delegated path. The direct path — the one Git Bash on Windows
// must take, and the one every profile without `ctx.shell` takes — called
// `runInShell` with arguments alone. Cancelling a running `run_shell` therefore
// left the shell alive until it finished, and its late output was returned into a
// turn the user had already stopped: aborting `sleep 3` resolved after 3.7 s with
// `stdout: "LATE\n"`.
//
// Three separate guarantees, because each fails differently:
//   1. the signal reaches the executor at all (the dropped argument);
//   2. an already-cancelled call never spawns (a `rm` must not start);
//   3. an abort reports `AbortError`, not a normal result with a kill exit code.
test('the direct path forwards the abort signal to the executor', async function () {
  const seen = []
  const run = async (path, argv, cwd, signal) => {
    seen.push({ path, signal })
    return { exitCode: 0, stdout: '', stderr: '' }
  }
  const { services, exec } = allowed()
  const tool = createRunShellTool(
    () => ({ ok: true, kind: 'gitbash', path: GITBASH.path }),
    { ...services, getShell: () => undefined, platform: 'win32', run },
  )
  const controller = new AbortController()
  await tool.execute({ command: 'echo hi' }, { ...exec, signal: controller.signal })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].signal, controller.signal,
    'the executor got no signal — a cancelled call would run to completion')
})

test('an already-cancelled call never starts the command', async function () {
  const { calls, run } = recorder()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () => runInShell(GITBASH, { command: 'rm -rf build', signal: controller.signal }, run),
    (error) => {
      assert.equal(error.name, 'AbortError')
      return true
    },
  )
  assert.equal(calls.length, 0, 'nothing may be spawned for a call that is already cancelled')
})

test('an abort during the run rejects with AbortError instead of its output', async function () {
  // The executor models the real one: it honors the signal and would otherwise
  // resolve with whatever the command managed to print.
  const run = (path, argv, cwd, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ exitCode: 0, stdout: 'LATE\n', stderr: '' }), 50)
    if (signal === undefined) return
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve({ exitCode: 1, stdout: 'LATE\n', stderr: '' })
    }, { once: true })
  })
  const controller = new AbortController()
  const pending = runInShell(GITBASH, { command: 'sleep 3', signal: controller.signal }, run)
  controller.abort()
  await assert.rejects(pending, (error) => {
    assert.equal(error.name, 'AbortError', 'a cancelled call is not a command failure')
    assert.match(error.message, /cancelled/)
    return true
  })
})

test('a call without a signal still resolves normally', async function () {
  // The guard must not turn an ordinary call into a rejection; every existing
  // caller passes no signal at all.
  const { run } = recorder({ exitCode: 0, stdout: 'ok\n', stderr: '' })
  const result = await runInShell(GITBASH, { command: 'echo ok' }, run)
  assert.equal(result.stdout, 'ok\n')
  assert.equal(result.exitCode, 0)
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

// THE SESSION'S MODE MUST REACH THE EXECUTOR.
//
// The request used to omit `sandboxPolicy` entirely, so the executor applied its
// own default and a `read-only` session's command ran under whatever the
// deployment default was. That is the second half of the fail-open bug: fixing
// only the direct path would still have ignored the session on the delegated one.
test('the delegated request carries the session policy verbatim', async function () {
  const seen = []
  const hostShell = {
    resolve: (request) => request,
    async execute(spec) {
      seen.push(spec)
      return { result: async () => ({ exitCode: 0, stdout: { text: '' }, stderr: { text: '' } }) }
    },
  }
  const { services, exec } = allowed('read-only')
  const tool = createRunShellTool(
    () => ({ ok: true, kind: 'pwsh', path: PWSH.path }),
    { ...services, getShell: () => hostShell, platform: 'win32' },
  )
  await tool.execute({ command: 'Get-Date' }, exec)
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0].sandboxPolicy, { mode: 'read-only', workspaceRoot: 'C:/ws' },
    'the executor must receive the session policy, not fall back to its own default')
})

test('PowerShell mode crosses the host executor on Windows', async function () {
  let executed = 0
  const hostShell = {
    resolve: (request) => request,
    async execute() {
      return { result: async () => { executed += 1; return { exitCode: 0, stdout: { text: 'host' }, stderr: { text: '' } } } }
    },
  }
  const { services, exec } = allowed()
  const tool = createRunShellTool(
    () => ({ ok: true, kind: 'pwsh', path: PWSH.path }),
    { ...services, getShell: () => hostShell, platform: 'win32' },
  )
  const result = await tool.execute({ command: 'Get-Date' }, exec)
  assert.equal(executed, 1)
  assert.equal(result.stdout, 'host', 'the direct child_process path must not have run')
  assert.equal(result.via, 'host')
})

// ==========================================================================
// FAIL CLOSED: the direct path is unconfined, so it needs explicit permission.
// ==========================================================================
//
// THE BUG THESE PIN (found by an independent security review, then confirmed
// here). `execute` never read `sandboxPolicy` or the approval facts, and on
// Windows Git Bash can never delegate — so every Git Bash call spawned through
// `child_process` regardless of the session's mode. A `read-only` session could
// write to disk. The old code printed `via: 'direct'` AFTER the command had
// already run; a disclosure is not a control.
//
// Each case asserts the two things that matter together: the call REJECTS, and
// the executor was NEVER CALLED. Only the second proves the command did not run.

for (const mode of ['read-only', 'workspace-write']) {
  test('a ' + mode + ' session refuses to run Git Bash, and never spawns', async function () {
    let spawned = 0
    const { services, exec } = allowed(mode)
    const tool = createRunShellTool(
      () => ({ ok: true, kind: 'gitbash', path: GITBASH.path }),
      {
        ...services,
        getShell: () => undefined,
        platform: 'win32',
        run: async () => { spawned += 1; return { exitCode: 0, stdout: '', stderr: '' } },
      },
    )
    await assert.rejects(() => tool.execute({ command: 'rm -rf build' }, exec), (error) => {
      assert.match(error.message, /refused to run in Git Bash/)
      assert.match(error.message, new RegExp(mode), 'the message must name the mode it saw')
      assert.match(error.message, /NOTHING WAS EXECUTED/)
      assert.match(error.message, /PowerShell/, 'and name the sandboxed redirection')
      // THE REFUSAL MUST NOT TEACH THE CALLER TO ESCALATE. A model that raises
      // its own sandbox mode to get the command through has defeated the very
      // control this refusal enforces, so the text never invites widening the
      // session's permissions — it names PowerShell, or hands the decision back
      // to the user.
      assert.match(error.message, /do not change the sandbox mode/i,
        'the refusal must explicitly forbid escalating the mode')
      assert.ok(!/raise|grant|switch to danger-full-access/i.test(error.message),
        'the refusal must not suggest danger-full-access as a way to make it work')
      return true
    })
    assert.equal(spawned, 0, 'a refused call must not spawn anything')
  })
}

test('a missing sandbox-policy service refuses rather than running unconfined', async function () {
  let spawned = 0
  const tool = createRunShellTool(
    () => ({ ok: true, kind: 'gitbash', path: GITBASH.path }),
    {
      getSandboxPolicy: () => undefined,
      getSessions: () => ({ get: () => ({}) }),
      getShell: () => undefined,
      platform: 'win32',
      run: async () => { spawned += 1; return { exitCode: 0, stdout: '', stderr: '' } },
    },
  )
  await assert.rejects(
    () => tool.execute({ command: 'echo hi' }, { agent: { id: 'session-1' } }),
    (error) => {
      assert.match(error.message, /refused to run/)
      assert.match(error.message, /could not be determined/)
      assert.match(error.message, /ctx\.sandboxPolicy/)
      return true
    },
  )
  assert.equal(spawned, 0,
    '"I could not determine the mode" must never mean "run it anyway"')
})

test('a call with no session refuses, because there is no mode to enforce', async function () {
  let spawned = 0
  const { services } = allowed()
  const tool = createRunShellTool(
    () => ({ ok: true, kind: 'gitbash', path: GITBASH.path }),
    {
      ...services,
      getShell: () => undefined,
      platform: 'win32',
      run: async () => { spawned += 1; return { exitCode: 0, stdout: '', stderr: '' } },
    },
  )
  await assert.rejects(() => tool.execute({ command: 'echo hi' }, {}), /could not be determined/)
  assert.equal(spawned, 0)
})

for (const [label, policyService] of [
  ['resolve() throws', { resolve: () => { throw new Error('boom') } }],
  ['resolve() returns no mode', { resolve: () => ({ workspaceRoot: 'C:/ws' }) }],
  ['resolve() returns an unknown mode', { resolve: () => ({ mode: 'sudo-everything', workspaceRoot: 'C:/ws' }) }],
]) {
  test('a policy service that misbehaves refuses: ' + label, async function () {
    let spawned = 0
    const tool = createRunShellTool(
      () => ({ ok: true, kind: 'gitbash', path: GITBASH.path }),
      {
        getSandboxPolicy: () => policyService,
        getSessions: () => ({ get: () => ({}) }),
        getShell: () => undefined,
        platform: 'win32',
        run: async () => { spawned += 1; return { exitCode: 0, stdout: '', stderr: '' } },
      },
    )
    await assert.rejects(
      () => tool.execute({ command: 'echo hi' }, { agent: { id: 's' } }),
      /could not be determined/,
    )
    assert.equal(spawned, 0, 'an unverifiable policy must fail closed')
  })
}

test('danger-full-access is the ONE mode that may run the direct path', async function () {
  let spawned = 0
  const { services, exec } = allowed('danger-full-access')
  const tool = createRunShellTool(
    () => ({ ok: true, kind: 'gitbash', path: GITBASH.path }),
    {
      ...services,
      getShell: () => undefined,
      platform: 'win32',
      run: async () => { spawned += 1; return { exitCode: 0, stdout: 'ok\n', stderr: '' } },
    },
  )
  const result = await tool.execute({ command: 'echo ok' }, exec)
  assert.equal(spawned, 1)
  assert.equal(result.via, 'direct')
  assert.match(result.note, /danger-full-access/,
    'the note must state the PERMISSION that admitted the call, not excuse a bypass')
  // THE NOTE NO LONGER RIDES IN THE CONTENT. It is emitted as
  // `presentationMeta` (below) so the UI keeps it and the model's context does
  // not, and the content states the same fact as `(unsandboxed)`.
  const content = tool.output.render({ command: 'echo ok' }, result)[0].text
  assert.match(content, /· direct \(unsandboxed\)/)
  assert.doesNotMatch(content, /Ran directly/)
  assert.match(tool.output.presentationMeta({ command: 'echo ok' }, result).note, /danger-full-access/)
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
  //
  // THE MARKER IS NOW ONE WORD. `direct (unsandboxed)` states the security fact
  // the old sentence stated, at a fraction of the tokens: this text is charged
  // to the model on EVERY request, and the sentence cost about 39 tokens per
  // call before it moved to `presentationMeta`.
  const tool = toolWith({ ok: true })
  const host = tool.output.render({}, {
    shell: 's', kind: 'pwsh', exitCode: 0, stdout: '', stderr: '', via: 'host',
  })[0].text
  assert.match(host, /\] exit 0 · host$/, 'the delegated path still says so, and claims no sandbox status')
  const direct = tool.output.render({}, {
    shell: 's', kind: 'gitbash', exitCode: 0, stdout: '', stderr: '',
    via: 'direct', note: 'Ran directly: no sandbox.',
  })[0].text
  assert.match(direct, /\] exit 0 · direct \(unsandboxed\)$/,
    'the unconfined path must name itself in the content')
})

test('the sandbox sentence is NOT in the content, and IS in presentationMeta', function () {
  // WHY THIS IS TWO ASSERTIONS AND NOT ONE. The sentence is a disclosure the
  // user must keep seeing, and it is also the bulk of the per-call context cost.
  // Splitting it across the two channels is the whole point of the change, so
  // both halves are pinned: content must be free of it, meta must still carry it.
  const tool = toolWith({ ok: true })
  const value = {
    shell: 's', kind: 'gitbash', exitCode: 0, stdout: 'ok\n', stderr: '',
    via: 'direct', note: 'Ran directly: the session grants danger-full-access, so this command did not cross the sandbox.',
  }
  const content = tool.output.render({}, value)[0].text
  assert.match(content, /\(unsandboxed\)/)
  assert.doesNotMatch(content, /Ran directly/, 'the sentence must not reach the model')
  assert.doesNotMatch(content, /danger-full-access/, 'nor the policy wording')

  const meta = tool.output.presentationMeta({}, value)
  assert.equal(typeof meta, 'object')
  assert.match(meta.note, /danger-full-access/,
    'the full explanation still reaches the UI through data.meta')
  assert.match(meta.note, /did not cross the sandbox/)
})

test('presentationMeta returns null, never undefined, when there is no note', function () {
  // THE CRASH THIS PINS. The registry snapshots `presentationMeta`'s return value
  // as lossless JSON, and `undefined` is not lossless — `{ note: undefined }`
  // fails the whole tool call with "output.presentationMeta returned
  // non-lossless JSON". The delegated (`via: 'host'`) path has no note at all,
  // which is exactly when that shape would be produced.
  const tool = toolWith({ ok: true })
  const delegated = { shell: 's', kind: 'pwsh', exitCode: 0, stdout: '', stderr: '', via: 'host' }
  assert.equal(tool.output.presentationMeta({}, delegated), null)
  assert.equal(tool.output.presentationMeta({}, { ...delegated, note: '' }), null)
})

test('a hostile note value cannot smuggle text into the content', function () {
  // `note` is what the host writes, so this is about the render's own contract:
  // it must ignore the field entirely, whatever it holds.
  const tool = toolWith({ ok: true })
  for (const note of ['Ran directly: x', 42, null, { length: 3 }]) {
    const text = tool.output.render({}, {
      shell: 's', kind: 'k', exitCode: 0, stdout: 'ok', stderr: '', via: 'direct', note,
    })[0].text
    assert.equal(text, '[k · s] exit 0 · direct (unsandboxed)\nok')
  }
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
