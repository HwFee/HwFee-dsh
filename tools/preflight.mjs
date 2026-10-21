/**
 * Pre-launch health check for the Desktop profile.
 *
 * Three failures have now stopped the app at "Loading plugins…". None of them
 * produced a useful error, and each took a separate debugging session:
 *
 *   1. PROFILE BUNDLES WERE TRUNCATED. `dsh.profile.bundles` in the profile's
 *      `package.json` is rewritten by external flows (the plugin manager, a
 *      failed install, a hand-edit). When it drops to the two core bundles every
 *      third-party plugin silently stops mounting — the app looks fine, the
 *      panels are simply gone. AGENTS.md records the same shape happening twice.
 *
 *   2. STALE AUTH COOKIES. The shell mints a `dsh-auth-<hash of 127.0.0.1:PORT>`
 *      cookie per launch and never removes the previous one. The jar accumulates
 *      one per run; once it is large the Host rejects the handshake and the app
 *      stops at "Loading plugins…". Clearing them and relaunching is the fix.
 *
 *   3. LINK INSTALLS GOING STALE. A `link:` dependency points at a working copy;
 *      if that directory loses its `cordis.patch.yml` (or the package is renamed)
 *      the row cannot resolve and the plugin disappears.
 *
 * WHAT THIS DOES NOT DO. It never writes to the profile. It reports, with the
 * exact command that fixes each finding, and exits non-zero when something is
 * wrong so it can gate a launch script. Mutating a profile from a checker would
 * be a second source of truth — the failure this file exists to prevent.
 *
 * Usage:
 *
 *   node tools/preflight.mjs              # check the desktop profile
 *   node tools/preflight.mjs --profile web
 *   node tools/preflight.mjs --json       # machine-readable output
 *
 * Exit code: 0 clean or warnings only, 1 when any check FAILS.
 */

import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const JSON_OUT = process.argv.includes('--json')
const profileFlag = process.argv.indexOf('--profile')
const PROFILE = profileFlag === -1 ? 'desktop' : (process.argv[profileFlag + 1] ?? 'desktop')

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILE_DIR = join(DSH_HOME, 'profiles', PROFILE)

/**
 * Bundles every profile must carry, in order. Anything after these is yours.
 * The order matters: `dsh-base` provides the service registry, `dsh-web-app`
 * mounts the UI, and plugins must come after both.
 */
const CORE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

/** The plugins this repository ships, and the order its profiles use. */
const REPO_PLUGINS = ['dsh-system-fonts', 'dsh-cds-theme', '@hwfee/dsh-usage-stats', '@hwfee/dsh-genui']

const findings = []
const record = (level, check, message, fix) => {
  findings.push({ level, check, message, ...(fix === undefined ? {} : { fix }) })
}

// --------------------------------------------------------------- 1. profile

if (!existsSync(PROFILE_DIR)) {
  record('fail', 'profile', `profile directory not found: ${PROFILE_DIR}`,
    'run the app once so it creates the profile, or pass --profile <name>')
} else {
  const manifestPath = join(PROFILE_DIR, 'package.json')
  if (!existsSync(manifestPath)) {
    record('fail', 'profile', `missing ${manifestPath}`, 'the profile is not a valid DSH profile')
  } else {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      record('fail', 'profile', `package.json is not valid JSON: ${error.message}`,
        'restore the newest package.json.bak* in the profile directory')
    }

    if (manifest !== undefined) {
      const bundles = manifest.dsh?.profile?.bundles
      const deps = manifest.dependencies ?? {}

      if (!Array.isArray(bundles)) {
        record('fail', 'bundles', 'dsh.profile.bundles is missing or not an array',
          'restore it from a package.json.bak* in the profile directory')
      } else {
        // (a) the core prefix must be intact and in order.
        const head = bundles.slice(0, CORE_BUNDLES.length)
        if (head.join('|') !== CORE_BUNDLES.join('|')) {
          record('fail', 'bundles',
            `the first ${CORE_BUNDLES.length} bundles must be ${CORE_BUNDLES.join(', ')}; found ${head.join(', ') || '(none)'}`,
            'restore dsh.profile.bundles — see AGENTS.md section 9')
        }

        // (b) every installed dependency must appear in bundles, or it will not mount.
        const installed = Object.keys(deps).filter((name) => isPluginName(name))
        for (const name of installed) {
          if (!bundles.includes(name)) {
            record('fail', 'bundles',
              `${name} is installed but missing from dsh.profile.bundles — it will never mount`,
              `add "${name}" to dsh.profile.bundles in ${manifestPath}`)
          }
        }

        // (c) every bundle must resolve to an installed package.
        for (const name of bundles) {
          if (CORE_BUNDLES.includes(name)) continue
          if (!Object.hasOwn(deps, name)) {
            record('fail', 'bundles',
              `bundle "${name}" is listed but is not a dependency — the row cannot resolve`,
              `add it to dependencies, or remove it from dsh.profile.bundles`)
          }
        }

        // (d) a truncated list is the exact failure AGENTS.md describes.
        if (bundles.length < CORE_BUNDLES.length + 1 && installed.length > 0) {
          record('fail', 'bundles',
            `only ${bundles.length} bundles are listed while ${installed.length} plugins are installed — `
            + 'this is the truncation that makes every plugin disappear',
            'restore dsh.profile.bundles from a backup')
        }
      }

      // (e) link: installs must still point at a real, complete plugin.
      for (const [name, spec] of Object.entries(deps)) {
        if (typeof spec !== 'string' || !spec.startsWith('link:')) continue
        const target = spec.slice('link:'.length)
        if (!existsSync(target)) {
          record('fail', 'link', `${name} links to a missing directory: ${target}`,
            'fix the path, or reinstall the plugin')
          continue
        }
        const patch = join(target, 'cordis.patch.yml')
        if (!existsSync(patch)) {
          record('fail', 'link', `${name} links to ${target} but it has no cordis.patch.yml`,
            'the package is incomplete — rebuild or reinstall it')
        } else {
          // The patch row must name the package, or the row silently never activates.
          const yaml = readFileSync(patch, 'utf8')
          const names = [...yaml.matchAll(/^\s*name:\s*['"]?([^'"\r\n]+)['"]?\s*$/gm)].map((m) => m[1].trim())
          if (names.length > 0 && !names.includes(name)) {
            record('fail', 'link',
              `${name}'s patch inserts ${names.join(', ')} — the row cannot resolve to this package`,
              'fix cordis.patch.yml in the plugin; see AGENTS.md section 4')
          }
        }
        // The shipped client bundle must match its sources.
        const clientJs = join(target, 'client', 'client.js')
        if (existsSync(join(target, 'client', 'src')) && !existsSync(clientJs)) {
          record('fail', 'link', `${name} has client/src but no built client/client.js`,
            `cd ${target} && npm run build`)
        }
      }
    }
  }

  // ------------------------------------------------- 2. cordis.patch.yml sanity

  const patchPath = join(PROFILE_DIR, 'cordis.patch.yml')
  if (!existsSync(patchPath)) {
    record('fail', 'patch', `missing ${patchPath}`, 'restore it from a backup in the profile directory')
  } else {
    const rows = parsePatchRows(readFileSync(patchPath, 'utf8'))
    // TWO LEGAL ROW SHAPES, and only one of them carries a name:
    //
    //   - id-targeted OVERRIDE  `- id: ui-chat` + `config:` — patches a row a
    //     bundle already inserted. `name` is optional (the docs describe
    //     overriding "by `id`"), and the row keeps whatever name it had.
    //   - INSERT                `- id:` + `name:` — adds a row, so the name is
    //     what the Loader resolves to a package. Missing or wrong here is the
    //     silent-disappearance failure.
    // So the check is not "every row has a name"; it is "every row that HAS a
    // name must name something installed".
    if (rows.length === 0) {
      record('warn', 'patch', 'cordis.patch.yml has no entries', 'that is fine if you never overrode anything')
    }
    const deps = existsSync(join(PROFILE_DIR, 'package.json'))
      ? Object.keys(JSON.parse(readFileSync(join(PROFILE_DIR, 'package.json'), 'utf8')).dependencies ?? {})
      : []
    const coreish = new Set([...CORE_BUNDLES, '@deepseek-ai/dsh-session-log-deepseek'])
    for (const row of rows) {
      if (row.name === undefined) continue
      const known = deps.includes(row.name) || coreish.has(row.name) || row.name.startsWith('@deepseek-ai/')
      if (!known) {
        record('fail', 'patch',
          `patch row "${row.id}" inserts "${row.name}", which is neither a dependency nor a core package `
          + '— the row cannot resolve and the plugin never activates',
          `install ${row.name}, or fix the name in ${patchPath}`)
      }
    }
  }

  // ------------------------------------------------------- 3. auth cookie pile

  // The Electron user-data directory is platform-specific and NOT under DSH_HOME
  // (that holds the profile; this holds Chromium's own state). Probe the shapes
  // the desktop app has used rather than guessing one.
  const candidates = [
    process.env.DSH_DESKTOP_USER_DATA,
    process.env.APPDATA === undefined ? undefined : join(process.env.APPDATA, '@deepseek-ai', 'dsh-desktop'),
    process.env.APPDATA === undefined ? undefined : join(process.env.APPDATA, 'dsh-desktop'),
    join(homedir(), 'Library', 'Application Support', '@deepseek-ai', 'dsh-desktop'),
    join(homedir(), '.config', '@deepseek-ai', 'dsh-desktop'),
  ].filter((p) => p !== undefined)
  const found = candidates
    .map((dir) => join(dir, 'Network', 'Cookies'))
    .find((p) => existsSync(p))
  if (found !== undefined) {
    try {
      // Chromium holds an exclusive lock while the app runs, and a read-only
      // open still fails on a WAL database. Copy the file (plus its -wal/-shm
      // siblings) to a temp path and read that, so the check works whether or
      // not the app is up.
      const tmp = join(tmpdir(), `dsh-preflight-cookies-${process.pid}.sqlite`)
      copyFileSync(found, tmp)
      for (const suffix of ['-wal', '-shm']) {
        if (existsSync(found + suffix)) copyFileSync(found + suffix, tmp + suffix)
      }
      const db = new DatabaseSync(tmp, { readOnly: true })
      const row = db.prepare("select count(*) as n from cookies where name like 'dsh-auth-%'").get()
      db.close()
      for (const suffix of ['', '-wal', '-shm']) {
        try { unlinkSync(tmp + suffix) } catch { /* the sibling may not exist */ }
      }
      const count = Number(row.n)
      // One or two is normal (the current launch, plus the previous one if the
      // app was force-killed). Dozens means the leak has been running for days.
      if (count > 8) {
        record('warn', 'cookies',
          `${count} dsh-auth cookies are stored for 127.0.0.1 — the shell never removes old ones, `
          + 'and a large pile can fail the launch handshake',
          'node tools/reset-auth-cookies.mjs   (with the app closed)')
      } else {
        record('info', 'cookies', `${count} dsh-auth cookie(s) stored`)
      }
    } catch (error) {
      // Windows denies even a read while Chromium holds the file, so a running
      // app makes this check impossible rather than failing it. Say which case
      // it is: an unreadable store while the app is CLOSED is worth a warning.
      const busy = error.code === 'EBUSY' || error.code === 'EPERM' || /locked|busy/i.test(error.message)
      if (busy) {
        record('info', 'cookies', 'app is running, so the cookie store is locked; close it to check')
      } else {
        record('warn', 'cookies', `cookie store unreadable: ${error.message}`,
          'run with the app closed to check the auth-cookie pile')
      }
    }
  } else {
    record('info', 'cookies', 'no Electron cookie store found; skipping')
  }
}

/** Whether a dependency name is a DSH plugin rather than a library. */
function isPluginName(name) {
  return name.startsWith('@hwfee/') || name.startsWith('dsh-') || REPO_PLUGINS.includes(name)
}

/**
 * Read the patch rows a profile's `cordis.patch.yml` declares.
 *
 * Deliberately shallow: a real YAML parser would be a dependency, and the only
 * fields this checker needs are the two that sit on the row itself — `- id:` at
 * column 0 and a two-space `name:` directly under it. Nested keys (a `name:` in
 * `config:`) are skipped by requiring exactly two spaces of indent.
 *
 * @param {string} yaml file contents
 * @returns {Array<{ id: string, name?: string }>} one entry per row
 */
function parsePatchRows(yaml) {
  const rows = []
  let current = null
  for (const line of yaml.split(/\r?\n/)) {
    const idMatch = /^-\s+id:\s*(\S+)/.exec(line)
    if (idMatch !== null) {
      current = { id: idMatch[1] }
      rows.push(current)
      continue
    }
    if (current === null) continue
    const nameMatch = /^ {2}name:\s*['"]?([^'"#\r\n]+?)['"]?\s*(?:#.*)?$/.exec(line)
    if (nameMatch !== null && current.name === undefined) current.name = nameMatch[1].trim()
    // A new top-level key ends the row; a nested one does not.
    if (/^[A-Za-z]/.test(line)) current = null
  }
  return rows
}

// ---------------------------------------------------------------------- 4. repo

for (const plugin of REPO_PLUGINS) {
  const dir = join(ROOT, 'plugins', plugin.replace('@hwfee/dsh-', '').replace(/^dsh-/, ''))
  if (!existsSync(join(dir, 'package.json'))) continue // the plugin is not in this checkout
  const clientJs = join(dir, 'client', 'client.js')
  const clientSrc = join(dir, 'client', 'src')
  if (existsSync(clientSrc) && existsSync(clientJs)) {
    // Compare mtimes as a cheap freshness hint. The authoritative check is each
    // plugin's `npm test` (build-client --check); this only catches the obvious
    // case where sources were edited after the last build.
    const srcNewer = newestMtime(clientSrc) > statSync(clientJs).mtimeMs
    if (srcNewer) {
      record('warn', 'freshness', `${plugin}: client/src is newer than client/client.js`,
        `cd ${dir} && npm run build`)
    }
  }
}

function newestMtime(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(path))
    else newest = Math.max(newest, statSync(path).mtimeMs)
  }
  return newest
}

// -------------------------------------------------------------------- output

const failed = findings.filter((f) => f.level === 'fail')
const warned = findings.filter((f) => f.level === 'warn')

if (JSON_OUT) {
  console.log(JSON.stringify({ profile: PROFILE, ok: failed.length === 0, findings }, null, 2))
} else {
  console.log(`preflight · profile "${PROFILE}" at ${PROFILE_DIR}\n`)
  for (const f of findings) {
    const tag = f.level === 'fail' ? 'FAIL' : f.level === 'warn' ? 'WARN' : 'ok  '
    console.log(`  ${tag}  ${f.check.padEnd(9)} ${f.message}`)
    if (f.fix !== undefined) console.log(`        ${' '.repeat(9)} fix: ${f.fix}`)
  }
  console.log('')
  if (failed.length === 0) {
    console.log(warned.length === 0
      ? 'All checks passed — safe to launch.'
      : `${warned.length} warning(s); the app should still start, but see the fixes above.`)
  } else {
    console.log(`${failed.length} check(s) FAILED — fix those before launching.`)
  }
}

if (failed.length > 0) process.exitCode = 1
