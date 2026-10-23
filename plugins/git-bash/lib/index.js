/**
 * The shell this plugin runs commands in, and the tool that asks it to.
 *
 * THE SEAM, and why this plugin does not touch it. `@deepseek-ai/dsh-shell`
 * declares `ctx.shell` as a capability seam with ONE implementation per context
 * ("loading a second throws, which is cordis' standard duplicate-service
 * behavior"). On Windows the base bundle composes `pwsh-sandbox`; on POSIX it
 * composes `bash-sandbox`. Both are `ctx.shell`.
 *
 * So the default-shell switch itself is the executor's job. What this plugin
 * owns is the other half of the contract:
 *
 *   1. DECIDE which shell to use, from the user's `auto`/`pwsh`/`gitbash` mode.
 *   2. PUBLISH that decision to the settings row and to the model, with the path
 *      it resolved to, so "which shell am I talking to" is never a guess.
 *   3. EXPOSE `run_shell` — one command in the resolved shell, reporting which
 *      one ran it.
 *
 * @module @hwfee/dsh-git-bash
 */

import { execFile, spawn } from 'node:child_process'
import { DEFAULT_MODE, MODES, chooseShell, readMode } from './mode.js'
import { createResolver, execAsync } from './resolve.js'
import { createModeRoute } from './mode-route.js'
export const name = 'dsh-git-bash'

/** The `tools` registry is the only hard requirement. */
export const inject = ['tools']

/** The tool the model calls. */
export const TOOL_NAME = 'run_shell'

/** The page global carrying the resolved shell, read by the settings row. */
export const SHELL_GLOBAL = '__dshGitBash'

/** The Cordis event the browser half publishes its mode on. */
export const MODE_EVENT = 'git-bash/mode'

/**
 * Register the tool, the mode listener, and the page injection.
 *
 * @param {object} ctx the host context
 */
export function apply(ctx) {
  const resolver = createResolver()

  // The user's mode. The page owns the preference (it is the side with the
  // settings UI), so it publishes; the host caches. Default `auto` covers the
  // window before the first publish — and it is also the right answer for a
  // first launch, since the page has no stored choice yet.
  //
  // TWO CHANNELS, ON PURPOSE:
  //   - the Cordis event reaches in-process callers (tests, an embedding host);
  //   - the HTTP route reaches the BROWSER, which lives in another process.
  //     Without it the host stays on `auto` forever and the row lies.
  let mode = DEFAULT_MODE
  const setMode = (next) => {
    if (typeof next === 'string' && MODES.includes(next)) mode = next
  }
  ctx.on(MODE_EVENT, (next) => {
    if (next !== null && typeof next === 'object') setMode(next.mode)
  })
  ctx.inject(['webServer'], (hostCtx) => {
    const webServer = hostCtx.webServer
    if (webServer === undefined || typeof webServer.register !== 'function') return
    // `getOrigin()` throws before the listener binds; the fence reads it lazily.
    const origin = () => webServer.getOrigin()
    hostCtx.effect(
      () => webServer.register(createModeRoute(setMode, { origin, readMode: () => mode })),
      'dsh-git-bash: mode route',
    )
  })

  /**
   * Resolve the current mode.
   *
   * Called on each use so a mode change applies to the NEXT call, but with a
   * fresh memo per call: `auto` asks for two kinds, and both questions must see
   * the same machine. A memo shared across calls would freeze the shell forever,
   * which is the opposite of what a live setting needs.
   */
  const current = () => resolveShell(mode, { resolve: memoized(resolver), platform: process.platform })

  ctx.effect(
    () => ctx.tools.register(createRunShellTool(current, {
      // OPTIONAL ON PURPOSE. The host composes exactly one `ctx.shell` executor
      // (pwsh-sandbox on Windows), but a profile may leave it out. `ctx.get`
      // reads without an inject requirement, so the plugin still mounts — and
      // `run_shell` then fails CLOSED rather than spawning unconfined. See
      // `resolveSandboxDecision`.
      getShell: () => (typeof ctx.get === 'function' ? ctx.get('shell') : undefined),
      getWorkingDirectory: () => (typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined),
      // THE TWO SERVICES THAT MAKE THE DIRECT PATH ADMISSIBLE. Without these the
      // session's mode cannot be resolved, and `run_shell` refuses instead of
      // guessing.
      getSandboxPolicy: () => (typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : undefined),
      getSessions: () => (typeof ctx.get === 'function' ? ctx.get('sessions') : undefined),
    })),
    'dsh-git-bash: run_shell tool',
  )

  // PUBLISH EVERY MODE'S RESOLUTION TO THE PAGE.
  //
  // The settings row needs to name what `auto` chose, and it is a BROWSER
  // component: it cannot probe the filesystem. `webserver/index-inject` is the
  // host's seam for a value the page needs before its first paint, computed
  // where the process lives — the same seam cds-theme uses for its fonts base.
  //
  // SYNCHRONOUS AT INJECT TIME, deliberately: the inject fires while the HTML is
  // assembled, so an async resolution that has not settled yet would inject
  // `null` and the row would say "not found" on every launch. The probe costs
  // ~77 ms once per page load, and it is memoized across the three modes.
  //
  // ALL THREE RESOLUTIONS, not just the active one.
  //
  // The page needs to re-render the status line the moment the user picks a
  // different mode, and it cannot probe the filesystem. Injecting only the
  // ACTIVE choice made the row contradict itself: the trigger said "Windows
  // PowerShell" while the line under it still named the Git Bash path the page
  // had been booted with. It also means the row can say what `auto` WOULD pick
  // on this machine, which is the question a user choosing between the modes
  // actually has.
  ctx.on('webserver/index-inject', (table) => {
    const probe = memoized(resolver)
    const byMode = {}
    for (const candidate of MODES) {
      byMode[candidate] = describe(resolveShell(candidate, { resolve: probe, platform: process.platform }), candidate)
    }
    table.push({
      kind: 'global',
      name: SHELL_GLOBAL,
      value: { active: byMode[mode], byMode },
    })
  })
}

/**
 * Resolve one mode against this machine.
 *
 * THE HOST-SIDE ENTRY POINT. `mode.js` holds the decision table but is shared
 * with the browser bundle, so it cannot import `node:child_process`; the
 * executable probe lives in `resolve.js`. This is the one call that joins them,
 * used by the tool and the injection alike so they can never disagree.
 *
 * The result is a VALUE, never a throw: `{ ok, mode, kind, path, source,
 * reason }`. `source` explains WHICH branch ran — under `auto` that is the only
 * evidence a fallback happened.
 *
 * @param {'auto' | 'pwsh' | 'gitbash'} [mode] the selected mode
 * @param {object} [deps]
 * @param {(kind: string) => object | null} [deps.resolve] a resolver, injected for tests
 * @param {string} [deps.platform] `process.platform`, injected for tests
 * @returns {{ ok: boolean, mode: string, kind: string | null, path: string | null, source: string, reason: string | null }}
 */
export function resolveShell(mode = DEFAULT_MODE, deps = {}) {
  const platform = deps.platform ?? process.platform
  const resolver = deps.resolve ?? memoized(createResolver({ platform }))
  const decision = chooseShell(mode, { resolve: resolver, platform })
  if (decision.ok !== true) {
    return { ok: false, mode, kind: null, path: null, source: '', reason: decision.reason }
  }
  return {
    ok: true,
    mode,
    kind: decision.shell.kind,
    path: decision.shell.path,
    source: decision.shell.source,
    reason: null,
  }
}

/**
 * Turn a resolution into the shape the page reads.
 *
 * A failure is not an empty value: the row must be able to say WHY nothing runs,
 * and `reason` is the only place that survives the JSON injection. `source` and
 * `kind` are what make `auto` readable — "git --exec-path (auto)" versus
 * "known path (auto fallback)" is the whole difference between "the setting
 * worked" and "the setting quietly did something else".
 *
 * @param {{ ok: boolean, path: string | null, kind: string | null, source: string, reason: string | null }} result
 *        the resolution
 * @param {string} mode the mode it was made under
 * @returns {object} the page payload
 */
export function describe(result, mode) {
  if (result.ok !== true) {
    return { mode, path: null, kind: null, source: null, reason: result.reason }
  }
  return {
    mode,
    path: result.path,
    kind: result.kind,
    source: result.source,
    reason: null,
  }
}

/**
 * The model-facing tool.
 *
 * `current` is a FUNCTION, not a value: the user can change the mode while a
 * session is open, and the next call must use the new shell.
 *
 * @param {() => ({ ok: boolean, path: string | null, kind: string | null, reason: string | null })} current
 *        resolves the shell under the active mode
 * @param {object} [services] optional host services, read lazily
 * @param {() => object | undefined} [services.getShell] `ctx.shell`, the host executor
 * @param {() => object | undefined} [services.getWorkingDirectory] `ctx.workingDirectory`
 * @param {(path: string, args: string[], cwd?: string, signal?: AbortSignal) => Promise<object>} [services.run]
 *        the direct executor, injected for tests; defaults to the real spawn
 * @returns the tool definition `ctx.tools.register` expects
 */
export function createRunShellTool(current, services = {}) {
  return {
    name: TOOL_NAME,
    description:
      'Run one shell command and return its output. '
      + 'The interpreter is whatever the user configured: Git Bash (POSIX), '
      + 'PowerShell, or automatic. The result names the executable that ran it, so '
      + 'check that line before assuming which quoting and variable syntax apply. '
      + 'Each call runs in a fresh shell in the working directory; pass an absolute '
      + 'path instead of relying on a previous `cd`.',
    // RAW JSON SCHEMA. `ctx.tools.register()` stores this as the wire schema and
    // hands it to the provider verbatim; the `defineTool` author dialect
    // (`{ name: { type, required: true } }`) is rejected at request time with
    // `is not of type "object"`. See docs/genui-audit.md for that incident.
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['command'],
      properties: {
        command: {
          type: 'string',
          description: 'The command to run. Passed to the resolved shell as a single command string.',
        },
        workdir: {
          type: 'string',
          description: 'Absolute directory to run in. Defaults to the session working directory.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['shell', 'exitCode', 'stdout'],
        properties: {
          shell: { type: 'string' },
          kind: { type: 'string' },
          exitCode: { type: 'integer' },
          stdout: { type: 'string' },
          stderr: { type: 'string' },
          // WHERE THE COMMAND RAN. 'host' crossed ctx.shell (sandbox, approval
          // and cancellation semantics apply); 'direct' used the plugin's own
          // spawn because the host cannot start this shell. The renderer always
          // spells this out — a silently unconfined command would be the worst
          // possible failure mode.
          via: { type: 'string' },
          note: { type: 'string' },
        },
      },
      render(_args, value) {
        // THE PATH IS ALWAYS STATED, IN ONE WORD. "host" means the command crossed
        // `ctx.shell` (sandbox / cancellation apply); "direct (unsandboxed)" means
        // the plugin spawned it itself because the host cannot start this shell.
        // Leaving the host case unmarked made the two indistinguishable.
        //
        // WHY THE PARENTHESIS AND NOT THE SENTENCE. This text is what the model is
        // charged for on EVERY request, and the sandbox admission used to be a
        // whole second line here (about 39 tokens per call, measured). One word
        // carries the same security fact, so the sentence moved to
        // `presentationMeta` below, where it reaches the UI and not the context.
        const route = value.via === 'host' ? ' · host' : value.via === 'direct' ? ' · direct (unsandboxed)' : ''
        const parts = [`[${value.kind} · ${value.shell}] exit ${value.exitCode}${route}`]
        if (value.stdout !== '') parts.push(value.stdout)
        if (value.stderr !== '') parts.push('stderr: ' + value.stderr)
        return [{ type: 'text', text: parts.join('\n') }]
      },
      // THE FULL SENTENCE, FOR THE UI ONLY. The registry hands this object to the
      // page as `data.meta` (never to the provider), so the card can still state
      // "the session grants danger-full-access, so this command did not cross the
      // sandbox" while the model only pays for the marker above.
      //
      // NULL, NOT AN OBJECT WITH AN UNDEFINED FIELD. The registry snapshots this
      // value as lossless JSON (`snapshotProjection`), which REJECTS `undefined`
      // wherever it appears — returning `{ note: undefined }` on the delegated
      // path would fail the whole tool call with `output.presentationMeta
      // returned non-lossless JSON`. `null` is the supported "no metadata" value.
      presentationMeta(_args, value) {
        return typeof value.note === 'string' && value.note !== '' ? { note: value.note } : null
      },
    },
    async execute(args, exec) {
      const resolved = current()
      if (resolved.ok !== true) {
        throw new Error(messageFor(resolved.reason))
      }
      const workdir = await resolveWorkdir(args, exec, services.getWorkingDirectory)
      const shell = {
        kind: resolved.kind,
        path: resolved.path,
        ...(workdir === undefined ? {} : { workdir }),
      }
      const platform = services.platform ?? process.platform
      const hostShell = typeof services.getShell === 'function' ? services.getShell() : undefined
      const hasHost = hostShell !== undefined
        && typeof hostShell.execute === 'function'
        && typeof hostShell.resolve === 'function'

      // THE SESSION'S SANDBOX POLICY, RESOLVED BEFORE ANYTHING SPAWNS.
      //
      // This plugin used to ignore it entirely, and that is a fail-OPEN bug, not
      // a missing nicety: on Windows the Git Bash path cannot delegate, so it
      // spawned through `child_process` — outside the sandbox, outside approval,
      // whatever mode the session was in. A `read-only` session could still
      // write, and the old code only *said* so in the result, after the command
      // had already run. A disclosure printed afterwards is not a control.
      //
      // The policy is resolved here, once, and it decides whether the direct
      // path is allowed at all.
      const decision = resolveSandboxDecision(exec, services)
      if (decision.ok !== true) throw new Error(messageFor(decision.reason, decision.detail))

      // WHICH MODES MAY CROSS THE HOST BOUNDARY.
      //
      // PowerShell does: the host executor IS pwsh on Windows, and nesting a
      // pwsh child through it works. Git Bash on Windows does NOT: the sandboxed
      // pwsh cannot create the MSYS process (NtCreateDirectoryObject,
      // 0xC0000022 — reproduced live), so delegating would turn every command
      // into a spawn failure. POSIX has one shell, so it always delegates.
      const delegate = shouldDelegate(shell.kind, platform, hasHost)
      // The resolved policy rides into the executor, so the session's actual mode
      // is enforced there instead of the executor falling back to its own default
      // — which was the second half of the same fail-open bug: the request used
      // to omit `sandboxPolicy`, so even the delegated path ignored the session.
      if (delegate) return runThroughHost(hostShell, shell, args, exec, decision.policy)

      // FROM HERE ON THE COMMAND RUNS WITHOUT THE SANDBOX, so the ONLY admissible
      // case is a session that explicitly grants full access. Anything else —
      // read-only, workspace-write, an unrecognised mode, or a policy service
      // that could not be consulted — refuses, and refuses BEFORE spawning.
      if (decision.mode !== 'danger-full-access') {
        throw new Error(messageFor('sandbox-denied', decision.mode))
      }

      // THE SIGNAL CROSSES THIS PATH TOO. It used to be dropped here: the host
      // path forwarded `exec.signal` to the executor, while the direct path
      // called `runInShell` with only the arguments — so a cancelled tool call
      // kept its shell (and whatever it had started) running to completion, and
      // the late output was returned into a turn the user had already stopped.
      // Measured before the fix: aborting a `sleep 3` call still resolved after
      // 3.7 s with stdout "LATE". See test/tool.test.mjs.
      //
      // `services.run` is the executor seam: it defaults to the real spawn and
      // exists so the cancellation guarantee above can be asserted without
      // starting a process.
      const direct = await runInShell(
        { kind: shell.kind, path: shell.path },
        { ...args, workdir: shell.workdir, signal: exec.signal },
        services.run,
      )
      // THE NOTE IS UI COPY NOW, NOT CONTEXT. It used to be the second line of the
      // tool result, where every call paid for it in the model's input on every
      // request. `output.presentationMeta` below sends the same sentence to
      // `data.meta`, which the page reads and the provider never sees; the
      // result content carries only the `(unsandboxed)` marker. The per-user
      // switch that hides the line is `showSandboxNote`.
      //
      // POSITIVE, NOT RESIDUAL. The old wording admitted that the call had
      // bypassed the sandbox; now the call is only here because the session
      // granted full access, so the note states the permission instead of
      // excusing the bypass.
      const note = `Ran directly: the session grants danger-full-access, so this command `
        + `did not cross the sandbox${hasHost ? '' : ' (this profile also has no ctx.shell executor)'}.`
      return { ...direct, via: 'direct', note }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: typeof args?.command === 'string' ? args.command.slice(0, 80) : 'Run shell command',
      kind: 'execute',
      rawInput: args?.command,
    }),
  }
}

/**
 * Resolve the sandbox policy for one call, and decide whether the direct path is
 * admissible at all.
 *
 * FAIL CLOSED IN EVERY DIRECTION. The honest question is not "did the caller
 * pass a policy" but "what is this session actually allowed to do". Three facts
 * make that answerable, and each has a failure branch that must deny:
 *
 *   1. `ctx.sandboxPolicy.resolve({ session })` is the host's single owner of
 *      the per-call policy (`defaultMode` under the session's logged mode).
 *      Without that service the plugin cannot learn the mode, so it denies —
 *      "unconfined because I could not ask" is the same hazard as
 *      "unconfined because nobody checked".
 *   2. A session is only available as `exec.agent`; `sessions.get(agent.id)`
 *      turns it into the `Session` the policy service expects. A throw, a
 *      missing store, or a session that is not live all deny.
 *   3. An unrecognised `mode` denies. A future host mode is not evidence of
 *      permission.
 *
 * The resolved policy is RETURNED rather than re-derived downstream, so the
 * delegated path enforces exactly what the direct path was judged against.
 *
 * @param {object} [exec] the tool execution context (`agent`, `signal`)
 * @param {object} [services] the injected service readers
 * @returns {{ ok: true, mode: string, policy: object } | { ok: false, reason: string, detail?: string }}
 *          the decision; a failure is a VALUE, so `execute` can name the fix
 */
export function resolveSandboxDecision(exec, services = {}) {
  const getPolicy = typeof services.getSandboxPolicy === 'function'
    ? services.getSandboxPolicy
    : () => undefined
  const getSessions = typeof services.getSessions === 'function'
    ? services.getSessions
    : () => undefined

  let policyService
  try {
    policyService = getPolicy()
  } catch {
    return { ok: false, reason: 'sandbox-unverified', detail: 'the sandbox-policy service threw' }
  }
  if (policyService === undefined || policyService === null) {
    return { ok: false, reason: 'sandbox-unverified', detail: 'this profile composes no ctx.sandboxPolicy' }
  }
  if (typeof policyService.resolve !== 'function') {
    return { ok: false, reason: 'sandbox-unverified', detail: 'the sandbox-policy service has no resolve()' }
  }

  // THE SESSION IS THE UNIT THE MODE IS LOGGED AGAINST. Without one there is no
  // mode to enforce, so the deployment default cannot be assumed to be
  // permissive.
  const agent = exec === undefined || exec === null ? undefined : exec.agent
  if (agent === undefined || agent === null || typeof agent.id !== 'string') {
    return { ok: false, reason: 'sandbox-unverified', detail: 'the call carries no session' }
  }

  let sessions
  try {
    sessions = getSessions()
  } catch {
    return { ok: false, reason: 'sandbox-unverified', detail: 'the sessions service threw' }
  }
  if (sessions === undefined || sessions === null || typeof sessions.get !== 'function') {
    return { ok: false, reason: 'sandbox-unverified', detail: 'this profile composes no ctx.sessions' }
  }

  let session
  try {
    session = sessions.get(agent.id)
  } catch {
    return { ok: false, reason: 'sandbox-unverified', detail: 'looking up the session threw' }
  }
  if (session === undefined || session === null) {
    return { ok: false, reason: 'sandbox-unverified', detail: 'the session is not live' }
  }

  let policy
  try {
    policy = policyService.resolve({ session })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: 'sandbox-unverified', detail: 'resolve() threw: ' + detail }
  }
  if (policy === null || typeof policy !== 'object' || typeof policy.mode !== 'string') {
    return { ok: false, reason: 'sandbox-unverified', detail: 'resolve() returned no usable policy' }
  }
  if (!SANDBOX_MODES.includes(policy.mode)) {
    return { ok: false, reason: 'sandbox-unverified', detail: 'unknown sandbox mode "' + policy.mode + '"' }
  }
  return { ok: true, mode: policy.mode, policy }
}

/**
 * The sandbox modes this host defines, mirroring `SandboxMode`.
 *
 * Listed rather than trusted, so a typo or a future value fails closed
 * (`resolveSandboxDecision` denies anything outside this set).
 */
export const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']

/**
 * The sentence a user reads when the chosen shell is missing.
 *
 * Each reason names the fix, because the failure is always one of three
 * configuration facts and never the command's fault.
 *
 * @param {string} reason the failure code
 * @param {string} [detail] the specific fact behind a refusal
 * @returns {string} the message
 */
export function messageFor(reason, detail) {
  switch (reason) {
    case 'gitbash-not-found':
      return 'Git Bash is selected but was not found. Install Git for Windows, or set '
        + 'DSH_GIT_BASH to its bash.exe. (The plugin will not silently switch to PowerShell: '
        + 'POSIX commands would fail in confusing ways under it.)'
    case 'pwsh-not-found':
      return 'PowerShell is selected but neither pwsh.exe nor Windows PowerShell was found.'
    case 'no-shell-for-platform':
      return 'The selected shell mode is not available on this platform.'
    case 'no-shell-found':
      return 'No usable shell was found. Install Git for Windows, or set DSH_GIT_BASH.'
    // REFUSED, NOT FAILED. The command never started, which is the point: these
    // two sentences have to say so, and name the way forward, or the model will
    // retry the same call or assume the command ran and failed.
    //
    // THE SENTENCE MUST NOT OFFER TO ESCALATE. An earlier version ended with
    // "or raise this session to danger-full-access", which reads as an
    // instruction the model can follow — and a model that raises its own
    // sandbox mode to get its command through has defeated the control this
    // refusal exists to enforce. The refusal therefore names the ONE safe
    // redirection (PowerShell, which runs inside the sandbox) and, when the
    // command is genuinely a POSIX-only script, says plainly that the user has
    // to choose. It never invites either the model or its reader to widen the
    // session's permissions.
    case 'sandbox-denied':
      return 'run_shell refused to run in Git Bash: this session is in "'
        + String(detail === undefined ? 'an unverified' : detail) + '" mode, and Git Bash on Windows '
        + 'cannot run inside the host sandbox (the sandboxed pwsh cannot create the MSYS '
        + 'process, 0xC0000022). NOTHING WAS EXECUTED. Do not retry the same command here and do '
        + 'not change the sandbox mode to make it work. Choose one of these instead: run the '
        + 'command with the pwsh / run_shell tool in Windows PowerShell mode, which enforces the '
        + 'sandbox; rewrite it as an equivalent PowerShell command; or tell the user that this '
        + 'specific command needs a POSIX shell and let them decide.'
    case 'sandbox-unverified':
      return 'run_shell refused to run: the sandbox policy for this session could not be '
        + 'determined (' + String(detail === undefined ? 'no reason given' : detail) + '), and Git Bash '
        + 'on Windows cannot run inside the sandbox anyway. NOTHING WAS EXECUTED. Running it '
        + 'unconfined without knowing the session mode is not an acceptable fallback. Use the '
        + 'pwsh / run_shell tool in Windows PowerShell mode instead; if that is unavailable, this '
        + 'profile cannot safely run shell commands and the user has to fix the composition.'
    default:
      return 'The configured shell could not be started: ' + reason
  }
}

/**
 * Run one command in a resolved shell.
 *
 * HOW THE COMMAND IS PASSED depends on the family, and getting it wrong is
 * silent: `-lc` is bash's "login shell, run this string", while PowerShell's
 * equivalent is `-NoProfile -Command`. Handing `-lc` to PowerShell makes it read
 * `-l` as a switch and complain about an unknown argument.
 *
 * A NONZERO EXIT IS NOT AN ERROR: that is the command's own result, and the
 * model needs to see it (`grep` that matched nothing exits 1).
 *
 * @param {{ kind: string, path: string }} shell the executable
 * @param {{ command: string, workdir?: string, signal?: AbortSignal }} args the call arguments
 * @param {(path: string, args: string[], cwd?: string, signal?: AbortSignal) => Promise<object>} [run]
 *        the executor, injected for tests
 * @param {AbortSignal} [signal] cancellation, forwarded to the executor
 * @returns {Promise<object>} the tool result
 */
export async function runInShell(shell, args, run = defaultRun, signal = args?.signal) {
  const command = typeof args?.command === 'string' ? args.command : ''
  if (command.trim() === '') throw new Error('run_shell needs a non-empty `command`')
  // AN ALREADY-CANCELLED CALL MUST NOT SPAWN AT ALL. The host can cancel between
  // dispatch and body start; spawning first and killing after would still start
  // the command (a `rm`, a `git push`) for a turn that is already over.
  if (signal?.aborted === true) throw abortError(signal)

  const argv = shell.kind === 'gitbash' || shell.kind === 'posix-bash'
    ? ['-lc', command]
    : ['-NoProfile', '-NonInteractive', '-Command', command]

  const outcome = await run(shell.path, argv, args?.workdir, signal)
  // A kill that lands while the child is exiting still resolves with a numeric
  // exit code, so the abort is reported from the signal rather than inferred
  // from the code: otherwise a cancelled call would look like a normal failure
  // of the command the user never let finish.
  if (signal?.aborted === true) throw abortError(signal)
  return {
    shell: shell.path,
    kind: shell.kind,
    exitCode: outcome.exitCode,
    stdout: outcome.stdout,
    stderr: outcome.stderr,
  }
}

/**
 * The error a cancelled call reports.
 *
 * Named `AbortError` because that is the name the host's tool layer and the
 * model both recognise as cancellation rather than as the command failing.
 *
 * IT ALWAYS CARRIES `stderr`. Two call sites cancel a call — before dispatch and
 * during the run — and the host surfaces `stderr` while a plain `error.message`
 * may never reach the user. Leaving it undefined on one of them made the cleanup
 * limitation invisible on exactly the path that had no cleanup to do, which is
 * the shape that later reads as "the kill worked".
 *
 * @param {AbortSignal} [signal] the signal that fired
 * @param {string} [note] the cleanup note; defaults to the standard cancel marker
 * @returns {Error} an error whose `name` is `AbortError`
 */
export function abortError(signal, note) {
  const reason = signal?.reason
  const detail = typeof note === 'string' && note !== '' ? note : terminationNote('abort', {})
  const base = reason instanceof Error && reason.name !== 'AbortError' && reason.message !== ''
    ? 'run_shell was cancelled: ' + reason.message
    : 'run_shell was cancelled before the command finished'
  // THE NOTE GOES IN BOTH PLACES. `stderr` is what the host renders; `message` is
  // what a log or a bare `catch` prints. A marker that reaches only one of them
  // is invisible on the other path.
  const error = new Error(base + '\n' + detail.trimEnd())
  error.name = 'AbortError'
  error.stderr = detail
  return error
}

/**
 * Quote one string for PowerShell's `-Command` argument.
 *
 * A single-quoted PowerShell string is literal; the ONLY escape is doubling an
 * inner quote. Newlines are legal inside it, so an arbitrary command string
 * survives without the parser re-reading `$`, `;` or `&`.
 *
 * @param {string} value the literal to carry
 * @returns {string} a single-quoted PowerShell string
 */
export function quotePowerShell(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'"
}

/**
 * Quote one string for a POSIX shell's `-lc` argument.
 *
 * @param {string} value the literal to carry
 * @returns {string} a single-quoted shell word
 */
export function quoteSh(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "'\\''") + "'"
}

/**
 * Whether one resolved shell can run through the host executor.
 *
 * Extracted so the decision is testable without spawning anything. See the
 * call site for why Git Bash on Windows is excluded: the sandbox cannot create
 * the MSYS process, so delegation would fail every command.
 *
 * @param {string} kind the resolved shell kind
 * @param {string} platform `process.platform`
 * @param {boolean} hasHost whether a usable `ctx.shell` is composed
 * @returns {boolean} whether to call `runThroughHost`
 */
export function shouldDelegate(kind, platform, hasHost) {
  if (hasHost !== true) return false
  if (platform === 'win32') return kind === 'pwsh' || kind === 'windows-powershell'
  return kind === 'posix-bash'
}

/**
 * The command a HOST EXECUTOR runs to start the SELECTED interpreter.
 *
 * Why not just hand the user's command to `ctx.shell`: on Windows the executor
 * is always pwsh, and the mode may have chosen Git Bash. The delegation has to
 * name the executable explicitly, or "Git Bash mode" would quietly run
 * PowerShell. The quoting above is what makes an arbitrary command (quotes,
 * `$`, `&&`, newlines) survive the extra shell layer.
 *
 * @param {{ kind: string, path: string }} shell the selected interpreter
 * @param {string} command the user's command
 * @param {string} [platform] `process.platform`
 * @returns {string} the host-executor command string
 */
export function delegatedCommand(shell, command, platform = process.platform) {
  const script = String(command == null ? '' : command)
  if (platform === 'win32') {
    const exe = quotePowerShell(shell.path)
    if (shell.kind === 'gitbash' || shell.kind === 'posix-bash') {
      return '& ' + exe + ' -lc ' + quotePowerShell(script)
    }
    return '& ' + exe + ' -NoProfile -NonInteractive -Command ' + quotePowerShell(script)
  }
  return quoteSh(shell.path) + ' -lc ' + quoteSh(script)
}

/**
 * Run one command through the host's shell executor.
 *
 * The executor owns sandboxing, approval facts, cancellation and process
 * lifetime; this function only translates the request and the result into
 * `run_shell`'s shape. `result()` rejects on infrastructure failures, which
 * propagate to the tool layer like any other tool error.
 *
 * THE POLICY TRAVELS WITH THE REQUEST. Omitting `sandboxPolicy` used to make the
 * executor apply its own default, so a `read-only` session's command ran under
 * whatever the deployment default happened to be — the session mode was ignored
 * on the delegated path too, not just the direct one. The resolved policy is
 * passed through verbatim.
 *
 * @param {object} hostShell the `ctx.shell` service
 * @param {{ kind: string, path: string, workdir?: string }} shell the selected interpreter
 * @param {{ command?: string, workdir?: string }} args the call arguments
 * @param {{ signal?: AbortSignal }} [exec] the tool execution context
 * @param {object} [policy] the resolved `SandboxExecutionPolicy` for this call
 * @returns {Promise<object>} the tool result
 */
export async function runThroughHost(hostShell, shell, args, exec = {}, policy) {
  const command = typeof args?.command === 'string' ? args.command : ''
  if (command.trim() === '') throw new Error('run_shell needs a non-empty `command`')
  // AN ALREADY-CANCELLED CALL MUST NOT REACH THE EXECUTOR. The executor would
  // start the process and only then notice the signal, which is the same hazard
  // the direct path guards against.
  if (exec.signal?.aborted === true) throw abortError(exec.signal)
  const workdir = typeof args?.workdir === 'string' && args.workdir !== ''
    ? args.workdir
    : shell.workdir
  const request = {
    command: delegatedCommand(shell, command, process.platform),
    ...(workdir === undefined ? {} : { workdir }),
    ...(exec.signal === undefined ? {} : { signal: exec.signal }),
    ...(policy === undefined || policy === null ? {} : { sandboxPolicy: policy }),
  }
  const handle = await hostShell.execute(hostShell.resolve(request))
  const result = await handle.result()
  // A CANCELLED RUN IS NOT A RESULT. The executor's contract says an abort
  // RESOLVES with `aborted: true` and no exit code; reporting that as
  // `exitCode: -1` would hand the model a successful tool result for a command
  // the user stopped. It becomes the same `AbortError` the direct path throws, so
  // the host sees one cancellation shape from both routes.
  if (result?.aborted === true || exec.signal?.aborted === true) {
    // The executor owned the tree, so cleanup truth lives there: it reports
    // whether the kill finished, and that is what the note says instead of a
    // claim this layer cannot verify.
    const note = typeof result?.stderr?.text === 'string' ? result.stderr.text : ''
    throw abortError(exec.signal, appendNote(note, terminationNote('abort', {
      treeConfirmed: null,
      treeDetail: 'cleanup was the host executor\'s responsibility',
    })))
  }
  return {
    shell: shell.path,
    kind: shell.kind,
    via: 'host',
    // A signal kill has no exit code. Keep the integer contract the schema
    // declares; the renderer states the signal separately when it matters.
    exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : -1,
    stdout: typeof result?.stdout?.text === 'string' ? result.stdout.text : '',
    stderr: typeof result?.stderr?.text === 'string' ? result.stderr.text : '',
  }
}

/**
 * Resolve the working directory for one call.
 *
 * The description promises "the session working directory" when `workdir` is
 * absent. The host's `workingDirectory.ensure()` is where that fact lives; it is
 * optional (a minimal profile has no such service), in which case the executor
 * keeps its own default.
 *
 * @param {{ workdir?: string }} args the call arguments
 * @param {{ agent?: object, signal?: AbortSignal }} [exec] the tool execution context
 * @param {() => object | undefined} [getService] reads `ctx.workingDirectory`
 * @returns {Promise<string | undefined>} the directory, when one is known
 */
export async function resolveWorkdir(args, exec, getService) {
  if (typeof args?.workdir === 'string' && args.workdir !== '') return args.workdir
  const service = typeof getService === 'function' ? getService() : undefined
  if (service === undefined || exec?.agent === undefined || typeof service.ensure !== 'function') return undefined
  try {
    return await service.ensure(exec.agent, exec.signal)
  } catch {
    return undefined
  }
}

/**
 * The deadline for one command, and how long a kill may take before we stop
 * waiting for it. Both are constants rather than tool fields: widening the wire
 * schema is a separate decision, and these two are policy, not caller input.
 */
export const DEFAULT_TIMEOUT_MS = 120_000

/**
 * THE BOUND ON CLEANUP.
 *
 * A killed shell does not necessarily close its stdio: a grandchild that
 * inherited the pipe keeps `close` from firing until IT exits — measured in the
 * hours for a long-lived child. So cancellation gets a bounded window to do its
 * work, after which the pipes are destroyed and the call returns anyway. The
 * number is 3–5 s because that is long enough for `taskkill /T /F` to finish and
 * short enough that a user pressing stop sees a result.
 */
export const TREE_KILL_GRACE_MS = 4_000

/** Marker prefixes appended to stderr, so the limit is stated where the model reads it. */
export const TIMEOUT_MARKER = '[dsh-git-bash] timed out'
export const ABORT_MARKER = '[dsh-git-bash] cancelled'
export const MAXBUFFER_MARKER = '[dsh-git-bash] output limit exceeded'
/** A death this layer did not cause, so `-1` is never mistaken for a timeout or a cap. */
export const KILLED_MARKER = '[dsh-git-bash] terminated'
/** The honest "I could not prove the tree died" marker. Never emitted as success. */
export const TREE_MARKER = '[dsh-git-bash] process tree may still be running'

/**
 * The stderr note for one termination.
 *
 * @param {'timeout' | 'abort' | 'maxBuffer' | 'killed'} kind what stopped the command
 * @param {{ timeoutMs?: number, treeConfirmed?: boolean | null, treeDetail?: string, runtimeEnforced?: boolean, signalName?: string }} facts
 *        `runtimeEnforced` marks the case where NODE reported the limit instead
 *        of us — then the sentence must not claim we stopped anything.
 *        `signalName` names the signal for a death this layer did not cause.
 * @returns {string} the note, ending with a newline
 */
export function terminationNote(kind, facts = {}) {
  const lines = []
  const runtime = facts.runtimeEnforced === true
  if (kind === 'timeout') {
    lines.push(TIMEOUT_MARKER + ' after ' + String(facts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      + 'ms; the command was stopped and the output above is what it produced first.')
  } else if (kind === 'abort') {
    lines.push(ABORT_MARKER + ': the user stopped this call; the command was stopped and the '
      + 'output above is what it produced first.')
  } else if (kind === 'killed') {
    // SOMEBODY ELSE KILLED IT. A signal death has no exit code, so `-1` alone would
    // be indistinguishable from a timeout or a cap; naming the signal is the only
    // thing that tells the model "this was terminated, do not just retry".
    lines.push(KILLED_MARKER + ' by signal ' + String(facts.signalName ?? 'unknown')
      + '; the output above is what it produced before it was terminated.')
  } else if (runtime) {
    // HONEST VARIANT. The runtime killed the shell on its own, so this layer
    // never got to run the tree kill while the root was still alive. Claiming
    // "it was stopped" here would be a false statement about the grandchildren.
    lines.push(MAXBUFFER_MARKER + ': the command produced more output than the limit allows. '
      + 'The runtime enforcing the limit stops the shell it started, and cannot be relied on to '
      + 'stop anything that shell started; treat the process tree as unverified.')
  } else {
    lines.push(MAXBUFFER_MARKER + ': the command produced more output than the limit allows; '
      + 'it was stopped and the output above is truncated.')
  }
  // ONLY WHEN IT IS TRUE. Reporting a clean stop we cannot prove is the failure
  // mode this whole module exists to avoid, so an unconfirmed tree says so and
  // names the reason.
  if (facts.treeConfirmed === false) {
    lines.push(TREE_MARKER + ' (' + String(facts.treeDetail ?? 'the tree kill did not complete')
      + '); a child process started by this command may still be alive.')
  }
  return lines.join('\n') + '\n'
}

/** Append a note to captured stderr without losing what the command printed. */
function appendNote(stderr, note) {
  const text = typeof stderr === 'string' ? stderr : ''
  if (note === '') return text
  return text === '' || text.endsWith('\n') ? text + note : text + '\n' + note
}

/**
 * Build a runner, optionally with a shorter deadline.
 *
 * The deadline is injected HERE rather than exposed on the tool schema: the
 * production value is a policy constant, and the tests need a short one to prove
 * the tree really dies without waiting two minutes. `services.run` receives the
 * result, so the tool layer stays unchanged.
 *
 * @param {{ timeoutMs?: number, graceMs?: number, platform?: string, maxBuffer?: number, onChild?: (child: object) => void }} [options]
 *        `onChild` is a TEST SEAM, in the same spirit as `services.run`: it hands
 *        the live child to a caller that needs to inspect the real streams (the
 *        regression that proves no runtime-owned collector shares them).
 * @returns {(command: string, args: string[], cwd?: string, signal?: AbortSignal) => Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
export function createRunner(options = {}) {
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const graceMs = typeof options.graceMs === 'number' ? options.graceMs : TREE_KILL_GRACE_MS
  const platform = options.platform ?? process.platform
  const maxBuffer = typeof options.maxBuffer === 'number' ? options.maxBuffer : 8 * 1024 * 1024
  const onChild = typeof options.onChild === 'function' ? options.onChild : undefined
  return (command, args, cwd, signal) => runOnce({ command, args, cwd, signal, timeoutMs, graceMs, platform, maxBuffer, onChild })
}

/**
 * Run an argv and resolve the outcome instead of rejecting on a nonzero exit.
 *
 * WHY THE BUILT-IN `timeout` IS NOT USED. `child_process`'s own timeout kills the
 * process it spawned and nothing else. Measured on this machine: a shell that had
 * started a grandchild was killed, the grandchild kept running (1/1/1 alive), and
 * — worse — the `close` event never fired while that grandchild held the stdio
 * pipes, so the call could hang far past its deadline. The deadline is therefore
 * OUR timer, and it goes through exactly the same kill path as cancellation.
 *
 * THE STOP PATH, in order:
 *
 *   1. `beginStop(kind)` runs once. It marks the reason, clears the deadline
 *      timer, and asks `killTree` to kill the whole tree.
 *   2. `killTree` uses `taskkill /T /F` on Windows — the only thing that reaches
 *      grandchildren of a shell — and falls back to `child.kill()` if that
 *      fails, recording WHY it is unconfirmed.
 *   3. A grace timer bounds the wait. If the child has not closed when it fires,
 *      the stdio pipes are destroyed (a grandchild holding them must not keep the
 *      handle open) and the call settles from the output captured so far.
 *
 * The output is accumulated from `data` events rather than trusted from the
 * callback, because on the grace path the callback may never deliver the bytes
 * the command already printed.
 *
 * @param {{ command: string, args: string[], cwd?: string, signal?: AbortSignal, timeoutMs: number, graceMs: number, platform: string, maxBuffer: number }} spec
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
function runOnce(spec) {
  const { command, args, cwd, signal, timeoutMs, graceMs, platform, maxBuffer, onChild } = spec
  return new Promise((resolve, reject) => {
    let settled = false
    /** What stopped the command: null while it is still legitimately running. */
    let stopped = null
    /** true = the tree was confirmed dead; false = it was not; null = not attempted. */
    let treeConfirmed = null
    let treeDetail = ''
    let deadlineTimer = null
    let graceTimer = null
    const out = []
    const err = []

    const stdoutText = () => out.join('')
    const stderrText = () => err.join('')

    const clearTimers = () => {
      if (deadlineTimer !== null) { clearTimeout(deadlineTimer); deadlineTimer = null }
      if (graceTimer !== null) { clearTimeout(graceTimer); graceTimer = null }
    }

    /**
     * Settle exactly once, whichever of close / grace / spawn failure arrives first.
     *
     * With `spawn` there is no `(error, stdout, stderr)` callback: the exit facts
     * arrive as `(code, signal)` on `close`, and a spawn failure arrives as an
     * `error` event. Both route here, and the output is always the text this layer
     * collected — never a second copy held by the runtime.
     *
     * @param {Error | null} error a spawn failure, or null for a normal close
     * @param {number | null} [code] the exit code from `close`
     * @param {string | null} [signalName] the terminating signal from `close`
     */
    const deliver = (error, code, signalName) => {
      if (settled) return
      settled = true
      clearTimers()
      if (signal !== undefined && onAbort !== null) signal.removeEventListener('abort', onAbort)

      // CANCELLATION IS NOT A RESULT. The host has to be able to tell "the user
      // stopped this" apart from "the command exited nonzero", so it rejects with
      // a named error that also carries the cleanup limitation on `stderr`.
      if (stopped === 'abort') {
        reject(abortError(signal, appendNote(stderrText(), terminationNote('abort', { treeConfirmed, treeDetail }))))
        return
      }

      if (stopped === 'timeout') {
        resolve({
          exitCode: -1,
          stdout: stdoutText(),
          stderr: appendNote(stderrText(), terminationNote('timeout', { timeoutMs, treeConfirmed, treeDetail })),
        })
        return
      }

      if (stopped === 'maxBuffer') {
        resolve({
          exitCode: -1,
          stdout: stdoutText(),
          stderr: appendNote(stderrText(), terminationNote('maxBuffer', { treeConfirmed, treeDetail })),
        })
        return
      }

      if (error !== null && error !== undefined) {
        // A genuine spawn failure (ENOENT/EACCES) has no exit facts and no output.
        // With `spawn` there is no internal limit to mistake for one: the cap is
        // ours, enforced in `onData` while the root is still alive.
        reject(error)
        return
      }

      // A signal death MAY have no exit code — POSIX reports `code === null` with a
      // signal name, while Windows still delivers a number (measured: bash
      // self-SIGTERM exits 3840). The number is passed through untouched, because
      // it is the fact that distinguishes a signal from a command failure. Only a
      // null code falls back to `-1`, and then the note names the signal so the
      // `-1` is never an unexplained status.
      if (typeof code === 'number') {
        resolve({ exitCode: code, stdout: stdoutText(), stderr: stderrText() })
        return
      }
      const note = signalName === undefined || signalName === null
        ? ''
        : appendNote(stderrText(), terminationNote('killed', { signalName }))
      resolve({ exitCode: -1, stdout: stdoutText(), stderr: note })
    }

    /**
     * Kill the whole tree, once.
     *
     * `child.killed` is deliberately not consulted: Node sets it when `kill()` is
     * called, which says nothing about a grandchild — and on Windows the tree kill
     * is a separate `taskkill` process, so its own exit is the only evidence.
     */
    const killTree = () => {
      if (child === null || child === undefined) { treeConfirmed = false; treeDetail = 'no child process'; return }
      if (platform === 'win32' && typeof child.pid === 'number') {
        execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, (error) => {
          if (error === null || error === undefined) { treeConfirmed = true; return }
          treeConfirmed = false
          treeDetail = 'taskkill failed: ' + String(error.message || error.code || 'unknown error')
          // Fall back to the process we do own. That does not make the tree
          // confirmed, so the note above still reaches the user.
          try { child.kill() } catch { /* already gone */ }
        })
        return
      }
      try {
        child.kill('SIGTERM')
        treeConfirmed = true
      } catch (error) {
        treeConfirmed = false
        treeDetail = 'kill failed: ' + String(error instanceof Error ? error.message : error)
      }
    }

    /** Mark why the command is being stopped and start the bounded cleanup. */
    const beginStop = (kind) => {
      if (settled || stopped !== null) return
      stopped = kind
      if (deadlineTimer !== null) { clearTimeout(deadlineTimer); deadlineTimer = null }
      // EVERY STOP GOES THROUGH THE TREE KILL. There is no longer a runtime-owned
      // limit that pre-empts this layer: the cap is enforced in `onData` while the
      // root is alive, so this is always the one place that can reach grandchildren.
      killTree()
      graceTimer = setTimeout(() => {
        graceTimer = null
        // THE PIPES MUST GO. A surviving grandchild holding them is exactly what
        // keeps `close` from firing; destroying them lets this call return, and
        // the settle below reports the partial output we already captured.
        try { child?.stdout?.destroy() } catch { /* already closed */ }
        try { child?.stderr?.destroy() } catch { /* already closed */ }
        if (treeConfirmed === null) {
          treeConfirmed = false
          treeDetail = 'the tree kill did not complete within ' + String(graceMs) + 'ms'
        }
        deliver(null, null, null)
      }, graceMs)
    }

    /**
     * Accumulate one chunk under the cap, and enforce the cap OURSELVES.
     *
     * WHY OUR OWN CHECK. Two things made the runtime's limit the wrong owner:
     *
     *   1. Node's enforcement kills the shell IT spawned and nothing else, so the
     *      grandchildren survived — while the stderr note said the command "was
     *      stopped". A false statement about cleanup.
     *   2. Node's limit counts bytes in its own internal copy, and that copy is
     *      not something a second listener can bound (see the `spawn` note below).
     *      Counting here means our array is the ONLY copy, and it is capped.
     *
     * MEMORY STAYS BOUNDED, which is the whole point of a cap: chunks are dropped
     * once the budget is spent, so the grace window cannot accumulate unbounded
     * output. Nothing else accumulates it either, because `spawn` installs no
     * collector of its own.
     */
    let budget = Math.max(0, Number(maxBuffer) || 0)
    const onData = (bucket) => (chunk) => {
      if (settled) return
      const text = String(chunk)
      if (budget <= 0) {
        // Once the cap is exceeded the command is stopped on this tick; keep
        // discarding so a fast writer cannot fill memory in the meantime.
        return
      }
      if (text.length > budget) {
        bucket.push(text.slice(0, budget))
        budget = 0
        // THE ROOT IS STILL ALIVE HERE, so this is the one place the tree kill
        // can actually reach the grandchildren.
        beginStop('maxBuffer')
        return
      }
      budget -= text.length
      bucket.push(text)
    }

    // `spawn`, NOT `execFile`, and that is a memory-safety decision rather than a
    // stylistic one.
    //
    // `execFile` installs its OWN `data` listener on both pipes and accumulates
    // into an internal array, unconditionally: with `maxBuffer: Infinity` its
    // handler is literally `ArrayPrototypePush(_stdout, chunk)` and returns. A
    // second listener cannot prevent that — listeners are additive, both receive
    // every chunk. So raising `maxBuffer` to Infinity to keep Node from killing
    // the root first had a price the code below did not pay: the internal copy
    // grew without bound, which is exactly what a cap exists to prevent.
    //
    // `spawn` has no such accumulator: the streams are handed to this layer and
    // nothing else reads them. Our `onData` budget (above) is therefore the only
    // copy, and it is the bound the caller asked for.
    //
    // NO `timeout` OPTION, on purpose: `child_process`'s own deadline kills the
    // process it spawned and nothing else. Ours is the deadline (see above).
    const child = spawn(command, args, {
      cwd: cwd === undefined ? undefined : cwd,
      windowsHide: true,
      // stdin is not part of this contract; closing it stops a command that would
      // otherwise wait forever for input the model never sends.
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Capture the bytes as they arrive: on the grace path `close` may fire after
    // the pipes are destroyed, and only what was already collected survives.
    child.stdout?.on('data', onData(out))
    child.stderr?.on('data', onData(err))

    // TEST SEAM: hand the live child to a caller that needs to inspect the real
    // streams. Production never passes it, so this changes no behaviour.
    if (onChild !== undefined) {
      try { onChild(child) } catch { /* a test observer must not break the run */ }
    }

    // A SPAWN FAILURE HAS ITS OWN EVENT on this API; there is no callback. Without
    // a listener it would be an unhandled 'error' and take the process down.
    child.on('error', (error) => { deliver(error) })
    child.on('close', (code, signal) => { deliver(null, code, signal) })

    const onAbort = signal === undefined ? null : () => { beginStop('abort') }

    deadlineTimer = setTimeout(() => { beginStop('timeout') }, timeoutMs)

    if (onAbort !== null) {
      if (signal.aborted === true) {
        beginStop('abort')
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }
  })
}

/** The production runner: the real spawn with the real deadline. */
const defaultRun = createRunner()

export { execAsync, readMode }

/**
 * Memoize a resolver for one resolution pass.
 *
 * The injection asks for all three modes, and `auto` itself asks for two kinds.
 * Without this, one page load would spawn `git --exec-path` three times and
 * `where pwsh` twice — the probe is the expensive part (~77 ms), not the choice.
 * A FRESH memo per pass, not a module-level one: a cache that outlives the call
 * would answer tomorrow's question with today's machine.
 *
 * @param {(kind: string) => object | null} resolve
 * @returns {(kind: string) => object | null}
 */
function memoized(resolve) {
  const seen = new Map()
  return (kind) => {
    if (!seen.has(kind)) seen.set(kind, resolve(kind))
    return seen.get(kind)
  }
}
