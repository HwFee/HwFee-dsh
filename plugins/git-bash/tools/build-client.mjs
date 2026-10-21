/**
 * Builds `client/client.js` in the host's module-loader format.
 *
 * The registered id is read from `package.json`, never hardcoded. The host keys
 * each client-module graph row by the package name; a bundle that registers
 * anything else never satisfies its own row, the loader retries it through the
 * one-resource URL, the bundle executes twice, and web boot dies with
 * `client-modules: duplicate factory registration`. That has taken the whole
 * app down twice in this repository, so the string is derived, not typed.
 *
 * The generated wrapper keeps the CommonJS build behind `require('react')`,
 * which the host's loader resolves from its frozen module table. React is
 * therefore never bundled.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSync } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(root, 'client', 'src', 'index.js')
const OUT = join(root, 'client', 'client.js')

const PACKAGE_NAME = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

/** Carry the entry module's leading JSDoc block into the artifact. */
function entryHeader() {
  const source = readFileSync(ENTRY, 'utf8')
  const match = /^(\s*\/\*\*[\s\S]*?\*\/)/.exec(source)
  return match ? match[1].trimEnd() + '\n\n' : ''
}

export function buildArtifact() {
  const result = buildSync({
    absWorkingDir: root,
    entryPoints: ['client/src/index.js'],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    external: ['react'],
    legalComments: 'inline',
    write: false,
    logLevel: 'warning',
  })
  const cjs = result.outputFiles[0].text.trimEnd()
  const indented = cjs.split('\n').map((line) => (line === '' ? '' : '    ' + line)).join('\n')
  return entryHeader() +
    'window.__ModuleLoader__.load({\n' +
    '  id: ' + JSON.stringify(PACKAGE_NAME) + ',\n' +
    '  factory: (require) => {\n' +
    '    var module = { exports: {} }\n' +
    '    var exports = module.exports\n' +
    indented + '\n' +
    '    return module.exports\n' +
    '  },\n' +
    '})\n'
}

/**
 * Load the artifact the way the HOST does: register the factory, then run it.
 *
 * WHY THIS GATE EXISTS. `client/src/styles.js` holds its whole sheet in a
 * template literal. A single backtick inside a CSS COMMENT ends that literal:
 * the following words become JavaScript, the build still SUCCEEDS (esbuild sees
 * a valid expression), and the failure surfaces only when the page boots —
 * `@hwfee/dsh-git-bash: import failed: code is not defined`, which takes down
 * the ENTIRE web boot and shows the user "The application could not start".
 * That happened once with the words "text-code" in a comment.
 *
 * A static search for backticks cannot catch it: the file legitimately contains
 * them. Running the factory can, and it costs one module evaluation.
 *
 * @param {string} artifact the generated bundle text
 * @throws when the factory throws while registering or materializing
 */
async function assertFactoryLoads(artifact) {
  const { mkdtempSync, rmSync, writeFileSync: write } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { pathToFileURL } = await import('node:url')
  const dir = mkdtempSync(join(tmpdir(), 'dsh-client-'))
  const file = join(dir, 'bundle.mjs')
  write(file, artifact)
  const global = globalThis
  const saved = { window: global.window, loader: global.__ModuleLoader__ }
  let factory = null
  global.window = global
  global.__ModuleLoader__ = { load: (entry) => { factory = entry.factory } }
  try {
    await import(pathToFileURL(file).href)
    if (typeof factory !== 'function') throw new Error('the bundle never called __ModuleLoader__.load')
    // A tiny `require` satisfies the host-module table the factory reaches for
    // (react / primitives). Those are optional in this plugin: a missing one is
    // a degraded row, not a boot failure, which is exactly what must hold here.
    factory(() => { throw new Error('not provided in the build check') })
  } finally {
    global.window = saved.window
    global.__ModuleLoader__ = saved.loader
    rmSync(dir, { recursive: true, force: true })
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])

if (isMain) {
  const check = process.argv.includes('--check')
  const artifact = buildArtifact()

  // BOTH MODES LOAD THE ARTIFACT. `--check` proves the committed file is
  // current; this proves the current file can RUN. They are different
  // questions, and the backtick incident passed the first while failing the
  // second hard enough to stop the whole app.
  try {
    await assertFactoryLoads(artifact)
  } catch (error) {
    console.error('client/client.js does not load: ' + (error?.message ?? error))
    console.error('A template-literal break in client/src/ (a backtick inside a CSS comment) does this. '
      + 'The host will fail web boot with "import failed: <message>" — fix the source, do not ship it.')
    process.exit(1)
  }

  if (check) {
    const committed = readFileSync(OUT, 'utf8')
    if (committed === artifact) {
      console.log('client/client.js is up to date with client/src/ and loads')
      process.exit(0)
    }
    console.error('client/client.js is STALE — run `npm run build` and commit the artifact')
    process.exit(1)
  }

  writeFileSync(OUT, artifact)
  console.log('wrote ' + OUT.replace(root, '.') + ` (${artifact.length} bytes)`)
}
