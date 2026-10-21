/**
 * Clear the stale `dsh-auth-*` cookies that block the next launch.
 *
 * THE FAILURE. The shell keeps a per-port cookie name (`dsh-auth-<hash of
 * 127.0.0.1:PORT>`) and never removes the previous one. Every launch binds a
 * fresh port, so the jar accumulates one cookie per run — 71 of them here — all
 * scoped to host `127.0.0.1`, all still valid by expiry. The Host validates the
 * cookie against ITS port, so the jar answers a request with dozens of
 * mismatched cookies; `connectDesktopWelcome` then sees a 401 and the app stops
 * at "Loading plugins…".
 *
 * WHY DELETING EVERYTHING IS SAFE. These cookies only ever authenticate the
 * LOCAL Desktop Host on 127.0.0.1 with a token the shell just minted. Nothing
 * else in the app reads them, `Network/Cookies` is Chromium's own store (not a
 * DSH file), and the shell cannot patch a signed asar to fix the leak itself.
 *
 *   node tools/reset-auth-cookies.mjs     # with DeepSeek Harness CLOSED
 *
 * Prints what it removed. Start the app afterwards; it mints exactly one cookie.
 */
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const COOKIES = resolveCookieStore()
/**
 * Locate Chromium's cookie store.
 *
 * The Electron user-data directory is NOT under DSH_HOME, and its spelling has
 * varied; probing beats hardcoding a path that only works on one machine.
 *
 * @returns {string} path to the Cookies database
 */
function resolveCookieStore() {
  const candidates = [
    process.env.DSH_DESKTOP_USER_DATA,
    process.env.APPDATA === undefined ? undefined : join(process.env.APPDATA, '@deepseek-ai', 'dsh-desktop'),
    process.env.APPDATA === undefined ? undefined : join(process.env.APPDATA, 'dsh-desktop'),
    join(homedir(), 'Library', 'Application Support', '@deepseek-ai', 'dsh-desktop'),
    join(homedir(), '.config', '@deepseek-ai', 'dsh-desktop'),
  ].filter((dir) => dir !== undefined)
  for (const dir of candidates) {
    const file = join(dir, 'Network', 'Cookies')
    if (existsSync(file)) return file
  }
  return candidates.length === 0 ? '' : join(candidates[0], 'Network', 'Cookies')
}

if (!existsSync(COOKIES)) {
  console.error('cookie store not found:', COOKIES)
  process.exit(1)
}

// A copy first: if anything goes wrong the original is still there.
copyFileSync(COOKIES, COOKIES + '.bak')

const db = new DatabaseSync(COOKIES)
const before = db.prepare("select count(*) as n from cookies where name like 'dsh-auth-%'").get().n
const all = db.prepare("select count(*) as n from cookies where host_key = '127.0.0.1'").get().n
console.log(`before: ${before} dsh-auth cookies, ${all} cookies on 127.0.0.1`)

db.exec("delete from cookies where name like 'dsh-auth-%'")
const after = db.prepare("select count(*) as n from cookies where name like 'dsh-auth-%'").get().n
db.close()

console.log(`after:  ${after} dsh-auth cookies (removed ${before - after})`)
console.log('backup:', COOKIES + '.bak')
