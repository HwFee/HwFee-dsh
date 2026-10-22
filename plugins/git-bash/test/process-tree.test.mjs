/**
 * The process-tree guarantees: a deadline and a cancellation must actually STOP
 * the command, and must return within a bounded time.
 *
 * THESE TESTS USE REAL PROCESSES. A mock executor cannot show that a grandchild
 * died — that is the whole question — so each case spawns a real shell that
 * starts a real grandchild, and the assertion is about what is on disk
 * afterwards. The commands are `sleep` and `touch`: harmless, short, no network.
 *
 * WHAT WAS MEASURED BEFORE THE FIX (and why each test exists):
 *
 *   1. `child_process`'s built-in `timeout` killed only the shell it started.
 *      The grandchild survived — 1/1/1 alive after the call returned — and
 *      because that grandchild held the stdio pipes, `close` never fired and the
 *      call could hang long past its deadline. Fixed by running our own timer
 *      through the same kill path as cancellation.
 *   2. A failed or slow `taskkill` left the call waiting on grandchildren for
 *      hours. Fixed by a bounded grace window that destroys the pipes and settles.
 *   3. The host-delegated path turned a cancelled run into `exitCode: -1`, i.e. a
 *      SUCCESSFUL tool result for a command the user stopped. Fixed by throwing
 *      `AbortError`.
 *   4. A timeout or an output overrun was indistinguishable from a spawn failure.
 *      Fixed by a visible marker in stderr, with partial output preserved.
 *
 * The deadline is injected through `createRunner`, not exposed on the tool
 * schema: policy constants stay policy, and the tests get a 400 ms deadline.
 *
 *   node test/process-tree.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createRunner, terminationNote, runThroughHost, abortError,
  TIMEOUT_MARKER, ABORT_MARKER, MAXBUFFER_MARKER, TREE_MARKER, KILLED_MARKER,
} from '../lib/index.js'

const BASH = 'C:/Program Files/Git/bin/bash.exe'

/** A scratch directory per test, cleaned up afterwards. */
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-gb-tree-'))
  t.after(() => { try { rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ } })
  return dir
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Wait until `check()` is true, or give up after `ms`. */
async function waitFor(check, ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (check()) return true
    await sleep(25)
  }
  return check()
}

test('a timeout kills the GRANDCHILD, not just the shell', { skip: !existsSync(BASH) }, async function (t) {
  // THE BUG. `execFile`'s `timeout` killed `bash.exe`; the `bash -c` it started
  // kept running and wrote its file seconds later. The proof is the file the
  // grandchild would have created: it must NOT exist after the deadline fires.
  //
  // The grandchild first records that it STARTED (so a missing "finished" file
  // cannot be explained by "it never ran"), then writes a second file after a
  // delay. If the tree was killed, only the first file exists.
  const dir = scratch(t)
  const started = join(dir, 'grandchild-started')
  const finished = join(dir, 'grandchild-finished')
  const script = `bash -c 'touch "${started}"; sleep 2; touch "${finished}"' & wait`

  const run = createRunner({ timeoutMs: 500, graceMs: 3_000, platform: 'win32' })
  const result = await run(BASH, ['-lc', script], dir)

  assert.equal(result.exitCode, -1, 'a timed-out call reports -1, not a command exit code')
  assert.ok(result.stderr.includes(TIMEOUT_MARKER), 'the timeout must be marked in stderr')
  assert.match(result.stderr, /after 500ms/, 'the marker must state the deadline that fired')

  // The grandchild had to have started, or the next assertion proves nothing.
  assert.ok(await waitFor(() => existsSync(started), 3_000),
    'the grandchild never started — this test would be vacuous')
  // And it must not have finished: give it longer than its own sleep.
  await sleep(2_500)
  assert.equal(existsSync(finished), false,
    'the grandchild survived the timeout and completed — the tree was not killed')
})

test('a cancellation kills the grandchild too, and returns within the grace window', { skip: !existsSync(BASH) }, async function (t) {
  const dir = scratch(t)
  const started = join(dir, 'abort-started')
  const finished = join(dir, 'abort-finished')
  const script = `bash -c 'touch "${started}"; sleep 2; touch "${finished}"' & wait`

  const controller = new AbortController()
  const run = createRunner({ timeoutMs: 60_000, graceMs: 2_000, platform: 'win32' })
  const before = Date.now()
  const pending = run(BASH, ['-lc', script], dir, controller.signal)

  // Abort once the grandchild exists, so the kill has something real to reach.
  assert.ok(await waitFor(() => existsSync(started), 5_000), 'the grandchild never started')
  controller.abort()

  await assert.rejects(pending, (error) => {
    assert.equal(error.name, 'AbortError', 'cancellation is not a command result')
    assert.ok(error.message.includes(ABORT_MARKER), 'the cancellation must be marked')
    // THE CLEANUP LIMITATION MUST BE REPORTABLE, not only logged to the console:
    // the host surfaces tool errors, and `stderr` is what it shows.
    assert.equal(typeof error.stderr, 'string')
    assert.ok(error.stderr.includes(ABORT_MARKER), 'the host needs the marker on the error too')
    return true
  })

  const elapsed = Date.now() - before
  assert.ok(elapsed < 6_000, `cancellation took ${elapsed}ms — it must be bounded by the grace window`)

  await sleep(2_500)
  assert.equal(existsSync(finished), false,
    'the grandchild survived the cancellation and completed')
})

test('a cancel is bounded even when the grandchild never releases the pipes', { skip: !existsSync(BASH) }, async function (t) {
  // THE HANG THIS PREVENTS. A surviving grandchild inherits the stdio pipes, so
  // `close` never fires and the promise waits on it indefinitely. The grace
  // window destroys the pipes and settles, which is what keeps a "stop" button
  // responsive.
  //
  // THE TRAP MAKES THIS A REAL TEST OF THE WINDOW. The shell ignores SIGTERM and
  // its grandchild keeps the pipe open, so the plain process kill cannot make
  // `close` fire. Only the bounded grace path can end the call, which is exactly
  // the behaviour the fix adds — a bare `child.kill()` version hangs here.
  //
  // `platform` is pinned away from win32 for that reason: on Windows the tree
  // kill would take the grandchild too, and the grace window would never be
  // exercised.
  const dir = scratch(t)
  const script = "trap '' TERM; bash -c 'trap \"\" TERM; sleep 30' & wait"
  const controller = new AbortController()
  const run = createRunner({ timeoutMs: 60_000, graceMs: 800, platform: 'linux' })

  const before = Date.now()
  const pending = run(BASH, ['-lc', script], dir, controller.signal)
  await sleep(500)
  controller.abort()

  await assert.rejects(pending, (error) => {
    assert.equal(error.name, 'AbortError')
    return true
  })
  const elapsed = Date.now() - before
  assert.ok(elapsed < 5_000,
    `the call waited ${elapsed}ms on a pipe a grandchild holds — the grace window must bound it`)
})

test('an unconfirmed tree kill is REPORTED, never claimed as clean', function () {
  // The honest-reporting rule. When cleanup could not be confirmed, the note says
  // so and names why; a verified kill says nothing extra, so the marker keeps its
  // meaning.
  const unconfirmed = terminationNote('timeout', { timeoutMs: 500, treeConfirmed: false, treeDetail: 'taskkill failed: denied' })
  assert.ok(unconfirmed.includes(TREE_MARKER))
  assert.match(unconfirmed, /taskkill failed: denied/)

  const confirmed = terminationNote('timeout', { timeoutMs: 500, treeConfirmed: true })
  assert.ok(!confirmed.includes(TREE_MARKER), 'a confirmed kill must not cry wolf')

  // Partial output is never discarded: the caller appends, it does not replace.
  assert.ok(terminationNote('abort', {}).includes(ABORT_MARKER))
  assert.ok(terminationNote('maxBuffer', {}).includes(MAXBUFFER_MARKER))
})

test('an output overrun is a result with a marker, not a spawn failure', async function (t) {
  // `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` used to be neither: it arrived as an
  // error with a string code, so the tool reported "the shell could not be
  // started" for a command that had run and printed a great deal.
  const dir = scratch(t)
  const node = process.execPath
  const run = createRunner({ timeoutMs: 30_000, graceMs: 1_000, platform: process.platform, maxBuffer: 4_096 })
  const result = await run(node, ['-e', 'process.stdout.write("x".repeat(200000))'], dir)
  assert.equal(result.exitCode, -1)
  assert.ok(result.stderr.includes(MAXBUFFER_MARKER),
    'the overrun must be marked, got: ' + JSON.stringify(result.stderr.slice(0, 200)))
})

// THE OVERRUN MUST STOP THE TREE, NOT JUST THE SHELL.
//
// THE BUG. The overrun used to be handled in the `execFile` callback, i.e. after
// Node had already killed the shell it spawned. Two things followed, and this test
// pins both because they have different causes:
//
//   A. THE TREE SURVIVED. `taskkill /T` can only enumerate children of a LIVE
//      root, so by the time the callback ran there was nothing left to walk. The
//      witness grandchild finished its work after the call had returned.
//   B. THE CAP WAS NOT OURS. Node's internal limit is 64 KiB regardless of the
//      configured value, so a 4 KiB cap still captured 65536 bytes — the memory
//      bound the caller asked for was not the bound it got.
//
// MEASURED, both directions, with the same command:
//   old code:  capturedBytes=65536  witnessFinished=true   elapsed≈0.75 s
//   fixed:     capturedBytes=4096   witnessFinished=false  elapsed≈2.6 s
//
// THE WITNESS MUST NOT WRITE TO STDOUT. An earlier version had one grandchild both
// flood and write the file, and it "passed" on the old code: destroying the pipe
// killed the writer via SIGPIPE, so the file was never created for a reason that
// had nothing to do with a tree kill. Here the witness only sleeps and writes; the
// flood comes from a sibling pipeline.
test('an output overrun stops the tree AND honours the configured cap', { skip: !existsSync(BASH) }, async function (t) {
  const dir = scratch(t)
  const started = join(dir, 'overrun-started')
  const finished = join(dir, 'overrun-finished')
  const script = `( sleep 2; touch "${finished}" ) & touch "${started}"; head -c 400000 /dev/zero | tr "\\0" "x"; wait`

  const run = createRunner({ timeoutMs: 60_000, graceMs: 3_000, platform: 'win32', maxBuffer: 4096 })
  const result = await run(BASH, ['-lc', script], dir)

  assert.equal(result.exitCode, -1, 'an overrun reports -1')
  assert.ok(result.stderr.includes(MAXBUFFER_MARKER), 'the overrun must be marked')
  // B: the configured cap is the cap that is actually enforced.
  assert.ok(result.stdout.length <= 4096 + 64,
    'captured stdout must stay within the configured cap, got ' + result.stdout.length
    + ' bytes — the runtime enforced its own 64 KiB instead of ours')
  assert.ok(result.stdout.length > 0, 'the output produced before the cap must be kept')

  assert.ok(await waitFor(() => existsSync(started), 5_000),
    'the command never started — this test would be vacuous')
  await sleep(3_000)
  // A: the witness must not have completed.
  assert.equal(existsSync(finished), false,
    'the witness grandchild survived the output overrun and completed — '
    + 'the overrun did not stop the process tree (taskkill cannot walk a dead root)')
})

test('the overrun note does not claim a stop this layer cannot prove', function () {
  // When the RUNTIME enforced the limit (our handler lost the race), the note
  // must say the tree is unverified instead of claiming "it was stopped".
  const runtime = terminationNote('maxBuffer', {
    runtimeEnforced: true,
    treeConfirmed: false,
    treeDetail: 'the runtime stopped the shell before this layer could kill the tree',
  })
  assert.ok(runtime.includes(MAXBUFFER_MARKER))
  assert.ok(!/it was stopped/.test(runtime),
    'the runtime-enforced variant must not claim the command was stopped')
  assert.match(runtime, /unverified/)
  assert.ok(runtime.includes(TREE_MARKER), 'and it must carry the honest tree marker')

  // Ours enforced it and the kill was confirmed: the claim is allowed.
  const ours = terminationNote('maxBuffer', { treeConfirmed: true })
  assert.ok(/it was stopped/.test(ours))
  assert.ok(!ours.includes(TREE_MARKER))
})

test('a normal command still resolves with its own exit code and output', { skip: !existsSync(BASH) }, async function (t) {
  // The deadline machinery must not disturb the ordinary path.
  const dir = scratch(t)
  const run = createRunner({ timeoutMs: 30_000, graceMs: 1_000, platform: 'win32' })
  const result = await run(BASH, ['-lc', 'echo ok; exit 3'], dir)
  assert.equal(result.exitCode, 3)
  assert.equal(result.stdout.trim(), 'ok')
  assert.equal(result.stderr, '')
})

// ---------------------------------------------------------- host delegation

test('an aborted host run throws AbortError instead of returning exit -1', async function () {
  // THE BUG. The executor's contract RESOLVES a cancelled run with
  // `aborted: true` and no exit code. Mapping that to `exitCode: -1` handed the
  // model a successful tool result for a command the user stopped.
  const hostShell = {
    resolve: (request) => request,
    async execute() {
      return {
        result: async () => ({
          aborted: true, exitCode: null, signal: 'SIGTERM', timedOut: false, timeoutMs: 0,
          stdout: { text: 'partial' }, stderr: { text: 'warned' },
        }),
      }
    },
  }
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () => runThroughHost(hostShell, { kind: 'pwsh', path: 'x' }, { command: 'Get-Date' }, { signal: controller.signal }),
    (error) => {
      assert.equal(error.name, 'AbortError')
      assert.ok(error.stderr.includes(ABORT_MARKER), 'the host must receive the cleanup limitation')
      return true
    },
  )
})

test('a host run that reports aborted without our signal also throws', async function () {
  // The other direction: the executor may cancel for its own reasons (expiry,
  // teardown) while our signal was never fired.
  const hostShell = {
    resolve: (request) => request,
    async execute() {
      return {
        result: async () => ({
          aborted: true, exitCode: null, signal: 'SIGTERM', timedOut: true, timeoutMs: 100,
          stdout: { text: '' }, stderr: { text: '' },
        }),
      }
    },
  }
  await assert.rejects(
    () => runThroughHost(hostShell, { kind: 'pwsh', path: 'x' }, { command: 'Get-Date' }, {}),
    (error) => {
      assert.equal(error.name, 'AbortError')
      return true
    },
  )
})

test('an already-cancelled call never reaches the host executor', async function () {
  let executed = 0
  const hostShell = {
    resolve: (request) => request,
    async execute() {
      executed += 1
      return { result: async () => ({ exitCode: 0, stdout: { text: '' }, stderr: { text: '' } }) }
    },
  }
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () => runThroughHost(hostShell, { kind: 'pwsh', path: 'x' }, { command: 'Get-Date' }, { signal: controller.signal }),
    (error) => { assert.equal(error.name, 'AbortError'); return true },
  )
  assert.equal(executed, 0, 'nothing may be started for a call that is already cancelled')
})

test('a completed host run is still a normal result', async function () {
  const hostShell = {
    resolve: (request) => request,
    async execute() {
      return {
        result: async () => ({
          aborted: false, exitCode: 0, signal: null, timedOut: false, timeoutMs: 0,
          stdout: { text: 'out' }, stderr: { text: '' },
        }),
      }
    },
  }
  const result = await runThroughHost(hostShell, { kind: 'pwsh', path: 'pwsh.exe' }, { command: 'Get-Date' }, {})
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'out')
  assert.equal(result.via, 'host')
})

test('abortError carries a name the host recognises', function () {
  const controller = new AbortController()
  controller.abort()
  const error = abortError(controller.signal)
  assert.equal(error.name, 'AbortError')
  assert.match(error.message, /cancelled/)
})

// THE IMPLICIT RUNTIME BUFFER MUST BE GONE, NOT MERELY OUT-VOTED.
//
// THE BUG, found after the maxBuffer fix looked complete. `execFile` installs its
// OWN `data` listener on each pipe, and with `maxBuffer: Infinity` that listener
// is literally `ArrayPrototypePush(_stdout, chunk)` — it copies every chunk into
// an internal array with no bound at all. Adding our own budgeted listener cannot
// prevent it: listeners are additive, BOTH receive every chunk. So the earlier
// fix bounded OUR array while the runtime's grew without limit — the cap was
// real for the result and fictional for the process.
//
// MEASURED INDEPENDENTLY, same 64 MB of stdout:
//   execFile + maxBuffer: Infinity   → RSS +194.9 MB
//   + our onData budget (8 MB kept)  → RSS +196.8 MB   (the internal copy remains)
//   spawn + same budget              → RSS  +23.8 MB
//
// This test asserts the STRUCTURAL fact rather than chewing memory: the command's
// pipes must carry exactly the one listener this module installs. `execFile`
// always adds `onChildStdout`/`onChildStderr`; `spawn` adds nothing.
test('the command stream has no runtime-owned collector besides ours', { skip: !existsSync(BASH) }, async function (t) {
  const dir = scratch(t)
  const started = join(dir, 'ls-started')
  const hold = join(dir, 'ls-hold')

  // The seam hands us the live child; production passes no observer.
  const counts = []
  const run = createRunner({
    timeoutMs: 8_000,
    graceMs: 2_000,
    platform: process.platform,
    maxBuffer: 4_096,
    onChild: (child) => {
      counts.push({
        stdout: child.stdout.listenerCount('data'),
        stderr: child.stderr.listenerCount('data'),
        stdoutNames: child.stdout.listeners('data').map((fn) => fn.name),
        stderrNames: child.stderr.listeners('data').map((fn) => fn.name),
      })
    },
  })
  // The witness writes files only — never stdout — so a broken pipe (SIGPIPE)
  // cannot kill it and be mistaken for a tree kill.
  const script = `touch "${started}"; ( sleep 3; touch "${hold}" ) & head -c 400000 /dev/zero | tr "\\0" "x"; wait`
  const result = await run(BASH, ['-lc', script], dir)

  assert.equal(counts.length, 1, 'the child must be observed exactly once')
  const seen = counts[0]
  assert.equal(seen.stdout, 1,
    'stdout carries ' + seen.stdout + ' data listeners (' + seen.stdoutNames.join(',') + '); '
    + 'an extra one is a runtime accumulator that copies every chunk with no bound')
  assert.equal(seen.stderr, 1,
    'stderr carries ' + seen.stderr + ' data listeners (' + seen.stderrNames.join(',') + ')')
  // And the one listener is OURS, not a runtime collector that happens to be alone.
  assert.ok(!seen.stdoutNames.includes('onChildStdout'),
    'execFile\'s onChildStdout collector is still attached — the runtime is copying every chunk')
  assert.ok(!seen.stderrNames.includes('onChildStderr'),
    'execFile\'s onChildStderr collector is still attached')

  // The run itself still behaves: capped output, marked, -1.
  assert.equal(result.exitCode, -1)
  assert.ok(result.stderr.includes(MAXBUFFER_MARKER), 'the overrun must still be marked')
  assert.ok(result.stdout.length <= 4_096 + 64,
    'the configured cap must still be the enforced cap, got ' + result.stdout.length)
})

test('a spawn failure rejects instead of resolving a fake success', async function () {
  // With `execFile` a spawn failure arrived in the callback. `spawn` reports it on
  // the 'error' event, and without a listener it would crash the host process.
  // The failure must also NOT settle as `exitCode: -1` with empty output: that is
  // the shape a timeout or a cap produces, and "the shell could not be started"
  // has to stay distinguishable from "the command was stopped".
  const run = createRunner({ timeoutMs: 5_000, graceMs: 1_000, platform: process.platform })
  await assert.rejects(
    () => run('C:/definitely-not-here-9f3a/bash.exe', ['-lc', 'echo hi'], undefined),
    (error) => {
      assert.notEqual(error.name, 'AbortError', 'a missing executable is not a cancellation')
      assert.equal(typeof error.code, 'string', 'the Node spawn error must reach the caller')
      return true
    },
  )
})

test('a signal death keeps its real exit status instead of becoming a fake -1', { skip: !existsSync(BASH) }, async function (t) {
  const dir = scratch(t)
  const run = createRunner({ timeoutMs: 30_000, graceMs: 1_000, platform: 'win32' })
  // MEASURED: on Windows a bash that kills itself with SIGTERM exits 3840
  // (15<<8), so `close` delivers a NUMBER, not a null code. The number must be
  // passed through unchanged — coercing it to -1 would erase the one fact that
  // says "this was a signal, not a command failure".
  const result = await run(BASH, ['-lc', 'kill -TERM $$'], dir)
  assert.equal(typeof result.exitCode, 'number')
  assert.notEqual(result.exitCode, -1,
    'a Windows signal death carries a real status; only an unrepresentable death uses -1')
  // The termination marker belongs to the `-1` path only; this result keeps its
  // own numeric status and must not be relabelled.
  assert.ok(!result.stderr.includes(KILLED_MARKER),
    'a numeric exit status is self-describing and must not be double-labelled')
})

test('the killed note names the signal, so a null-code death is explainable', function () {
  // POSIX `close` gives `code === null` plus a signal name. That is the only case
  // allowed to use -1, and the note is what makes the -1 interpretable.
  const note = terminationNote('killed', { signalName: 'SIGTERM' })
  assert.ok(note.includes(KILLED_MARKER), 'the note must carry its own marker')
  assert.match(note, /SIGTERM/, 'the signal itself must be named')
  assert.match(note, /terminated/i)
  // It must not borrow the timeout or cap wording.
  assert.ok(!note.includes(TIMEOUT_MARKER))
  assert.ok(!note.includes(MAXBUFFER_MARKER))
})
