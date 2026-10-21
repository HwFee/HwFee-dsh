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

import { execFile } from 'node:child_process'
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
      // reads without an inject requirement, so the plugin still mounts and
      // `run_shell` falls back to direct execution.
      getShell: () => (typeof ctx.get === 'function' ? ctx.get('shell') : undefined),
      getWorkingDirectory: () => (typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined),
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
        // THE PATH IS ALWAYS STATED. "host" means the command crossed
        // `ctx.shell` (sandbox / cancellation apply); "direct" means the plugin
        // spawned it itself because the host cannot start this shell. Leaving
        // the host case unmarked made the two indistinguishable in the result.
        const route = value.via === 'host' ? ' · host' : value.via === 'direct' ? ' · direct' : ''
        const parts = [`[${value.kind} · ${value.shell}] exit ${value.exitCode}${route}`]
        if (typeof value.note === 'string' && value.note !== '') parts.push(value.note)
        if (value.stdout !== '') parts.push(value.stdout)
        if (value.stderr !== '') parts.push('stderr: ' + value.stderr)
        return [{ type: 'text', text: parts.join('\n') }]
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

      // WHICH MODES MAY CROSS THE HOST BOUNDARY.
      //
      // PowerShell does: the host executor IS pwsh on Windows, and nesting a
      // pwsh child through it works. Git Bash on Windows does NOT: the sandboxed
      // pwsh cannot create the MSYS process (NtCreateDirectoryObject,
      // 0xC0000022 — reproduced live), so delegating would turn every command
      // into a spawn failure. POSIX has one shell, so it always delegates.
      //
      // The direct path is the pre-delegation behaviour. It is REPORTED (via
      // 'direct' + a note), never silent: a user reading the tool result must be
      // able to tell that this call did not cross the sandbox.
      const delegate = shouldDelegate(shell.kind, platform, hasHost)
      if (delegate) return runThroughHost(hostShell, shell, args, exec)

      const direct = await runInShell({ kind: shell.kind, path: shell.path }, { ...args, workdir: shell.workdir })
      const note = !hasHost
        ? 'Ran directly: this profile has no ctx.shell executor.'
        : 'Ran directly: the Windows host sandbox cannot start Git Bash (nested MSYS process creation is denied), so this command did not cross the sandbox.'
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
 * The sentence a user reads when the chosen shell is missing.
 *
 * Each reason names the fix, because the failure is always one of three
 * configuration facts and never the command's fault.
 *
 * @param {string} reason the failure code
 * @returns {string} the message
 */
export function messageFor(reason) {
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
 * @param {{ command: string, workdir?: string }} args the call arguments
 * @param {(path: string, args: string[], cwd?: string) => Promise<object>} [run]
 *        the executor, injected for tests
 * @returns {Promise<object>} the tool result
 */
export async function runInShell(shell, args, run = defaultRun) {
  const command = typeof args?.command === 'string' ? args.command : ''
  if (command.trim() === '') throw new Error('run_shell needs a non-empty `command`')

  const argv = shell.kind === 'gitbash' || shell.kind === 'posix-bash'
    ? ['-lc', command]
    : ['-NoProfile', '-NonInteractive', '-Command', command]

  const outcome = await run(shell.path, argv, args?.workdir)
  return {
    shell: shell.path,
    kind: shell.kind,
    exitCode: outcome.exitCode,
    stdout: outcome.stdout,
    stderr: outcome.stderr,
  }
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
 * @param {object} hostShell the `ctx.shell` service
 * @param {{ kind: string, path: string, workdir?: string }} shell the selected interpreter
 * @param {{ command?: string, workdir?: string }} args the call arguments
 * @param {{ signal?: AbortSignal }} [exec] the tool execution context
 * @returns {Promise<object>} the tool result
 */
export async function runThroughHost(hostShell, shell, args, exec = {}) {
  const command = typeof args?.command === 'string' ? args.command : ''
  if (command.trim() === '') throw new Error('run_shell needs a non-empty `command`')
  const workdir = typeof args?.workdir === 'string' && args.workdir !== ''
    ? args.workdir
    : shell.workdir
  const request = {
    command: delegatedCommand(shell, command, process.platform),
    ...(workdir === undefined ? {} : { workdir }),
    ...(exec.signal === undefined ? {} : { signal: exec.signal }),
  }
  const handle = await hostShell.execute(hostShell.resolve(request))
  const result = await handle.result()
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
 * Run an argv and resolve the outcome instead of rejecting on a nonzero exit.
 *
 * @param {string} command the executable
 * @param {string[]} args its arguments
 * @param {string} [cwd] working directory
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
function defaultRun(command, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: cwd === undefined ? undefined : cwd,
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      // A spawn failure has no exit code and no output; that is the only case
      // worth rejecting.
      if (error !== null && typeof error.code !== 'number') {
        reject(error)
        return
      }
      resolve({
        exitCode: error === null ? 0 : error.code,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
      })
    })
  })
}

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
