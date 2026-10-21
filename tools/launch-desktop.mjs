/**
 * Preflight, then launch DeepSeek Harness with the debug port open.
 *
 *   node tools/launch-desktop.mjs            # check, then launch
 *   node tools/launch-desktop.mjs --check    # check only
 *   node tools/launch-desktop.mjs --force    # launch even when checks fail
 *
 * WHY A SCRIPT AND NOT ABOOKMARK. Three failure modes have each cost a debugging
 * session: a truncated bundle list (plugins silently gone), a pile of stale auth
 * cookies (app stuck at "Loading plugins…"), and a stale `client/client.js`.
 * Every one of them is detectable BEFORE the app starts, so the check runs
 * first and the failure message names the fix.
 *
 * `--remote-debugging-port` is what lets `.work/cdp.mjs` and the e2e suite drive
 * the real renderer. Launching any other way means no CDP and no screenshots.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CHECK_ONLY = process.argv.includes('--check')
const FORCE = process.argv.includes('--force')
const PORT = String(process.env.CDP_PORT ?? 9222)

const APP = process.env.DSH_APP_EXE
  ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe')

// 1. Preflight. A failed check is a hard stop unless --force, because launching
//    a broken profile produces an app that looks fine and has no plugins.
const check = spawn(process.execPath, [join(ROOT, 'tools', 'preflight.mjs'), '--json'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'inherit'],
})
let output = ''
check.stdout.on('data', (chunk) => { output += chunk })
const exitCode = await new Promise((resolve) => check.on('close', resolve))

let report
try {
  report = JSON.parse(output)
} catch {
  console.error('preflight produced unreadable output:\n' + output)
  process.exit(1)
}

for (const finding of report.findings) {
  const tag = finding.level === 'fail' ? 'FAIL' : finding.level === 'warn' ? 'WARN' : 'ok  '
  console.log(`  ${tag}  ${finding.check.padEnd(9)} ${finding.message}`)
  if (finding.fix !== undefined) console.log(`        ${' '.repeat(9)} fix: ${finding.fix}`)
}
console.log('')

if (exitCode !== 0 && !FORCE) {
  console.error('Refusing to launch: fix the failures above, or pass --force.')
  process.exit(1)
}
if (CHECK_ONLY) process.exit(exitCode)

if (!existsSync(APP)) {
  console.error(`app not found: ${APP}\nSet DSH_APP_EXE to its real path.`)
  process.exit(1)
}

// 2. A second instance would take the single-instance lock, focus the existing
//    window, and silently ignore our debug port — so check for one first.
const running = await new Promise((resolve) => {
  const ps = spawn('powershell.exe', [
    '-NoProfile', '-Command',
    "(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Measure-Object).Count",
  ], { stdio: ['ignore', 'pipe', 'inherit'] })
  let text = ''
  ps.stdout.on('data', (chunk) => { text += chunk })
  ps.on('close', () => resolve(Number(text.trim()) || 0))
})
if (running > 0) {
  console.error(`DeepSeek Harness is already running (${running} processes).`)
  console.error('Close it first — a second launch takes the single-instance lock and ignores the debug port.')
  process.exit(1)
}

// 3. Launch detached so the shell survives this script exiting, with CDP on.
const child = spawn(APP, [`--remote-debugging-port=${PORT}`], {
  detached: true,
  stdio: 'ignore',
})
child.unref()
console.log(`launched with CDP on 127.0.0.1:${PORT}`)
console.log('watch for the renderer with:  node .work/cdp.mjs targets')
