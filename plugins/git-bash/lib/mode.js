/**
 * The three shell modes, and the decision each one makes.
 *
 * THIS MODULE IS SHARED BY BOTH HALVES. The client imports it for the values and
 * the storage helpers (`client/src/store.js`), and the host imports it for
 * `chooseShell()` (`lib/index.js`). It is therefore DEPENDENCY-FREE — no
 * `node:` imports — because it is also bundled into `client/client.js`. Executable
 * discovery lives in `resolve.js` (host-only) and is injected here as a function.
 *
 * THE RULE THAT MATTERS IS ABOUT FALLBACK.
 *
 *   auto     may fall back, and its `source` always says which branch was taken
 *            and why ("git --exec-path (auto)" / "known path (auto fallback)").
 *            A fallback that does not announce itself is indistinguishable from
 *            the setting doing nothing.
 *   pwsh     may not fall back to Git Bash.
 *   gitbash  may not fall back to PowerShell. Handing PowerShell to a user who
 *            asked for Git Bash turns every `grep`, `$VAR` and `&&` into a
 *            confusing failure that looks like the tool is broken — worse than
 *            refusing to run.
 *
 * @module mode
 */

/** The values the settings row may store, in display order. */
export const MODES = ['auto', 'pwsh', 'gitbash']

/** A fresh install follows the machine, which is what an unconfigured user means. */
export const DEFAULT_MODE = 'auto'

/** Mode → the label key in this plugin's dictionaries. */
export const MODE_LABELS = {
  auto: 'shell.mode.auto',
  pwsh: 'shell.mode.pwsh',
  gitbash: 'shell.mode.gitbash',
}

/**
 * Resolved shell family → the label key in this plugin's dictionaries.
 *
 * THE KINDS ARE NOT MODES. `pwsh` is one mode but two families (`pwsh` for
 * PowerShell 7, `windows-powershell` for 5.1), and `gitbash` is one mode that
 * resolves to `posix-bash` away from Windows. The row must name the thing that
 * will actually run, not the setting the user clicked.
 */
export const KIND_LABELS = {
  gitbash: 'shell.kind.gitbash',
  'posix-bash': 'shell.kind.posix-bash',
  pwsh: 'shell.kind.pwsh',
  'windows-powershell': 'shell.kind.windows-powershell',
}

/**
 * Why a mode could not be satisfied, in the user's language.
 *
 * ONE SOURCE FOR TWO READERS: the settings row renders this, and the tool throws
 * it. Two copies of these sentences would drift, and the row's job is to explain
 * the same failure the model reports.
 */
export const REASON_LABELS = {
  'gitbash-not-found': 'shell.reason.gitbash-not-found',
  'pwsh-not-found': 'shell.reason.pwsh-not-found',
  'no-shell-for-platform': 'shell.reason.no-shell-for-platform',
  'no-shell-found': 'shell.reason.no-shell-found',
}

/**
 * The key the FIRST build of this plugin wrote a boolean under.
 *
 * It answered a DIFFERENT question ("keep the platform shell tool visible beside
 * run_shell"), so it cannot be read as a mode directly. It is never deleted and
 * never re-read as a value: {@link migrateLegacyMode} translates the one
 * unambiguous case (`'false'` — the user asked to run only through Git Bash) and
 * leaves everything else at the default. The string is the historical fact; it
 * must not be renamed, or those users' choice is lost.
 */
export const LEGACY_BOOLEAN_KEY = '@hwfee/dsh-git-bash:exposeNativeShell'

/** Whether a stored value is one of the three modes. */
export function isMode(value) {
  return typeof value === 'string' && MODES.includes(value)
}

/**
 * Coerce anything to a mode.
 *
 * A corrupt storage entry, a value from a future version, or an unknown string
 * all land on `auto`: that is the setting that cannot be wrong, because it
 * follows the machine. Running commands beats refusing over a bad preference.
 *
 * @param {unknown} value
 * @returns {'auto' | 'pwsh' | 'gitbash'}
 */
export function normalizeMode(value) {
  return isMode(value) ? value : DEFAULT_MODE
}

/**
 * Read the stored mode.
 *
 * Every failure path returns the default: private mode throws on the property
 * READ itself (before any method runs), and storage may be disabled entirely. A
 * settings page must render regardless.
 *
 * @param {Storage | undefined} storage the storage object, or undefined
 * @param {string} key the mode key
 * @returns {'auto' | 'pwsh' | 'gitbash'} the mode in force
 */
export function readMode(storage, key) {
  if (storage === null || storage === undefined) return DEFAULT_MODE
  let raw
  try {
    raw = storage.getItem(key)
  } catch {
    return DEFAULT_MODE
  }
  return normalizeMode(raw)
}

/**
 * Persist a mode.
 *
 * Silent on failure: quota-exceeded and private-mode throws must not break the
 * settings page the user is clicking through.
 *
 * @param {Storage | undefined} storage the storage object, or undefined
 * @param {string} key the mode key
 * @param {string} mode the chosen mode
 * @returns {boolean} whether the write landed
 */
export function writeMode(storage, key, mode) {
  if (storage === null || storage === undefined) return false
  if (!isMode(mode)) return false
  try {
    storage.setItem(key, mode)
    return true
  } catch {
    return false
  }
}

/**
 * Translate the old boolean preference into the new mode key, once.
 *
 * The mapping is deliberately conservative, because the old key measured a
 * different thing:
 *
 *   'false'  the user turned the platform shell OFF, i.e. asked for Git Bash to
 *            be the only way commands run → `gitbash`
 *   'true'   the default; nothing was expressed about the shell → `auto`, which
 *            prefers Git Bash anyway, so behaviour is unchanged
 *   absent / anything else → no migration; {@link readMode} returns the default
 *
 * A value already present under the new key always wins, so the migration can
 * only ever run once and can never overwrite a newer choice.
 *
 * @param {Storage | undefined} storage the storage object, or undefined
 * @param {string} key the new mode key
 * @returns {string | null} the migrated mode, or null when nothing was migrated
 */
export function migrateLegacyMode(storage, key) {
  if (storage === null || storage === undefined) return null
  let current
  try {
    current = storage.getItem(key)
  } catch {
    return null
  }
  if (isMode(current)) return null

  let legacy
  try {
    legacy = storage.getItem(LEGACY_BOOLEAN_KEY)
  } catch {
    return null
  }
  const migrated = legacy === 'false' ? 'gitbash' : legacy === 'true' ? DEFAULT_MODE : null
  if (migrated === null) return null
  try {
    storage.setItem(key, migrated)
  } catch {
    // The value still applies for this session; the next launch retries.
  }
  return migrated
}

/**
 * Choose the shell for a mode.
 *
 * `resolve(kind)` is injected so this module stays free of `node:` imports and
 * the tests can describe a machine instead of probing one. Its kinds are the
 * ones `resolve.js` produces: `gitbash`, `pwsh`, `windows-powershell`,
 * `posix-bash`.
 *
 * @param {'auto' | 'pwsh' | 'gitbash' | string} mode the selected mode
 * @param {object} deps
 * @param {(kind: string) => ({ kind: string, path: string, source: string } | null)} deps.resolve
 *        resolves one shell kind, or null
 * @param {string} [deps.platform] `process.platform`, injected for tests
 * @returns {{ ok: true, shell: { kind: string, path: string, source: string } }
 *   | { ok: false, reason: string }} the decision — a failure is a VALUE, never
 *   an exception, because the settings row has to render it
 */
export function chooseShell(mode, deps = {}) {
  const resolve = typeof deps.resolve === 'function' ? deps.resolve : () => null
  const platform = deps.platform ?? 'win32'
  const requested = normalizeMode(mode)
  const windows = platform === 'win32'

  if (requested === 'gitbash') {
    const found = resolve(windows ? 'gitbash' : 'posix-bash')
    if (found === null) return { ok: false, reason: 'gitbash-not-found' }
    return { ok: true, shell: found }
  }

  if (requested === 'pwsh') {
    // Windows PowerShell is a Windows program. On POSIX the honest answer is
    // "not available here", not "not installed".
    if (!windows) return { ok: false, reason: 'no-shell-for-platform' }
    const found = resolve('pwsh')
    if (found === null) return { ok: false, reason: 'pwsh-not-found' }
    return { ok: true, shell: found }
  }

  // AUTO.
  if (windows) {
    const gitbash = resolve('gitbash')
    if (gitbash !== null) {
      return { ok: true, shell: { ...gitbash, source: gitbash.source + ' (auto)' } }
    }
    const fallback = resolve('pwsh')
    if (fallback !== null) {
      return {
        ok: true,
        shell: { ...fallback, source: fallback.source + ' (auto fallback)' },
      }
    }
    return { ok: false, reason: 'no-shell-found' }
  }

  const posixBash = resolve('posix-bash')
  if (posixBash === null) return { ok: false, reason: 'no-shell-found' }
  return { ok: true, shell: { ...posixBash, source: posixBash.source + ' (auto)' } }
}
