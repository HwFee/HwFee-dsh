/**
 * Finding the executables: Git Bash, PowerShell, and the POSIX shell.
 *
 * THE RULE THAT MATTERS MOST IS ABOUT GIT BASH. On Windows `bash` is often on
 * PATH as `C:\Windows\System32\bash.exe` — the WSL stub. It IS bash, it IS on
 * PATH, and it is the WRONG shell: a different filesystem view (`/mnt/c/...`), a
 * different user, and no `git` from the Windows install. A resolver that tries
 * `where bash` first picks it and every subsequent command fails in a way that
 * looks like the plugin is broken.
 *
 * So Git Bash is located from `git --exec-path`, which names the Git install the
 * user actually works with; its `bin/bash.exe` is the shell Git itself ships.
 *
 * @module resolve
 */

import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Git Bash locations to try after `git --exec-path`.
 *
 * A fixed list, not a PATH search: PATH is where the WSL stub hides.
 */
export const GITBASH_CANDIDATES = [
  'C:/Program Files/Git/bin/bash.exe',
  'C:/Program Files/Git/usr/bin/bash.exe',
  'C:/Program Files (x86)/Git/bin/bash.exe',
  'C:/ProgramData/chocolatey/bin/bash.exe',
]

/**
 * PowerShell locations, newest first.
 *
 * PowerShell 7 (`pwsh.exe`) is tried before Windows PowerShell 5.1: it is the
 * maintained one, and VS Code's own detection prefers it for the same reason.
 * Both are reported with a distinct `kind` so the row can say which one ran.
 */
export const PWSH_CANDIDATES = [
  { path: 'C:/Program Files/PowerShell/7/pwsh.exe', kind: 'pwsh' },
  { path: 'C:/Program Files/PowerShell/6/pwsh.exe', kind: 'pwsh' },
  { path: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', kind: 'windows-powershell' },
]

/** Normalize a Windows path to forward slashes, the shape `git --exec-path` uses. */
const slash = (value) => value.replaceAll('\\', '/')

/**
 * Build a resolver bound to one environment.
 *
 * @param {object} [deps]
 * @param {(path: string) => boolean} [deps.exists] filesystem probe, for tests
 * @param {(command: string, args: string[]) => string} [deps.execSync] sync runner, for tests
 * @param {NodeJS.ProcessEnv} [deps.env] the environment
 * @param {string} [deps.platform] `process.platform`
 * @returns {(kind: string) => object | null} resolves one shell kind
 */
export function createResolver(deps = {}) {
  const exists = deps.exists ?? existsSync
  const runSync = deps.execSync ?? defaultExecSync
  const env = deps.env ?? process.env
  const platform = deps.platform ?? process.platform

  /** Git Bash: the override, then `git --exec-path`, then the known paths. */
  function gitbash() {
    const override = env.DSH_GIT_BASH
    if (typeof override === 'string' && override !== '' && exists(override)) {
      return { kind: 'gitbash', path: slash(override), source: 'DSH_GIT_BASH' }
    }
    if (platform === 'win32') {
      try {
        const execPath = runSync('git', ['--exec-path']).trim()
        if (execPath !== '') {
          const fromGit = slash(join(dirname(dirname(dirname(execPath))), 'bin', 'bash.exe'))
          if (exists(fromGit)) return { kind: 'gitbash', path: fromGit, source: 'git --exec-path' }
        }
      } catch {
        // `git` is not on PATH; fall through to the known locations.
      }
      for (const candidate of GITBASH_CANDIDATES) {
        if (exists(candidate)) return { kind: 'gitbash', path: slash(candidate), source: 'known path' }
      }
      return null
    }
    // POSIX: the bash on PATH IS the shell this mode means.
    try {
      const which = runSync('sh', ['-c', 'command -v bash']).trim()
      if (which !== '') return { kind: 'posix-bash', path: which, source: 'PATH' }
    } catch {
      // No bash at all.
    }
    return null
  }

  /** PowerShell: 7 before 5.1, then PATH. */
  function pwsh() {
    if (platform !== 'win32') return null
    for (const candidate of PWSH_CANDIDATES) {
      if (exists(candidate.path)) {
        return { kind: candidate.kind, path: slash(candidate.path), source: 'known path' }
      }
    }
    try {
      const which = runSync('where', ['pwsh']).trim().split(/\r?\n/)[0]
      if (which !== '') return { kind: 'pwsh', path: slash(which), source: 'PATH' }
    } catch {
      // Not installed anywhere findable.
    }
    return null
  }

  /** The POSIX shell, on a POSIX platform. */
  function posixBash() {
    try {
      const which = runSync('sh', ['-c', 'command -v bash']).trim()
      if (which !== '') return { kind: 'posix-bash', path: which, source: 'PATH' }
    } catch {
      // Fall through.
    }
    return null
  }

  return function resolve(kind) {
    switch (kind) {
      case 'gitbash': return gitbash()
      case 'pwsh': return pwsh()
      case 'posix-bash': return posixBash()
      default: return null
    }
  }
}

/**
 * Run a command synchronously, returning stdout.
 *
 * @param {string} command the executable
 * @param {string[]} args its arguments
 * @returns {string} stdout
 */
function defaultExecSync(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 })
}

/**
 * Run a command asynchronously, resolving stdout.
 *
 * Kept for the tool path, which must not block the event loop.
 *
 * @param {string} command the executable
 * @param {string[]} args its arguments
 * @returns {Promise<string>} stdout
 */
export function execAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}
