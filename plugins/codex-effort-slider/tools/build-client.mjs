/**
 * Builds `client/client.js` in the host's module-loader format.
 *
 * THE ID IS READ FROM package.json, NEVER TYPED HERE. The host keys each
 * client-module graph row by the package name, and a bundle that registers under
 * anything else never satisfies its own row: the loader reports "loaded without
 * registering", retries through the one-resource URL, executes the bundle a second
 * time, and the retry dies with `client-modules: duplicate factory registration` —
 * which fails the whole web boot, not just this plugin. That has already happened
 * twice in this repository (see AGENTS.md §四), so the string is derived.
 *
 * BOTH MODES EXECUTE THE FACTORY. `--check` proves the committed file is current;
 * the load gate proves the current file can RUN. They answer different questions,
 * and the failure that motivated the gate (a backtick inside a CSS comment ending a
 * template literal, build exit 0, `import failed: code is not defined` at boot) passes
 * the first and dies on the second.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync as writeTemp } from 'node:fs'
import { tmpdir } from 'node:os'
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
    // React and the primitives come from the host's frozen module table. Bundling
    // React here would put a second React in the page and break hooks.
    external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
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
 * @param {string} artifact the generated bundle text
 * @throws when the artifact never registers, or the factory throws while materialising
 */
async function assertFactoryLoads(artifact) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ces-'))
  const file = join(dir, 'bundle.mjs')
  writeTemp(file, artifact)
  const global = globalThis
  const saved = { window: global.window, loader: global.__ModuleLoader__ }
  let registration = null
  global.window = global
  global.__ModuleLoader__ = { load: (entry) => { registration = entry } }
  try {
    await import(pathToFileURL(file).href)
    if (registration === null || typeof registration.factory !== 'function') {
      throw new Error('the bundle never called __ModuleLoader__.load with a factory')
    }
    if (registration.id !== PACKAGE_NAME) {
      throw new Error('the bundle registered "' + registration.id + '", expected "' + PACKAGE_NAME + '"')
    }
    // A tiny `require` stands in for the host module table. React is absent on
    // purpose: the entry must degrade to a no-op apply, not throw, which is exactly
    // the property this gate is here to prove.
    const exportsObject = registration.factory(() => { throw new Error('not provided in the build check') })
    if (typeof exportsObject !== 'object' || exportsObject === null) {
      throw new Error('the factory returned no exports')
    }
    if (exportsObject.name !== PACKAGE_NAME) {
      throw new Error('exports.name is "' + exportsObject.name + '", expected the package name')
    }
    if (typeof exportsObject.apply !== 'function') {
      throw new Error('exports.apply is missing — the host rejects a plugin without it')
    }
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

  try {
    await assertFactoryLoads(artifact)
  } catch (error) {
    console.error('client/client.js does not load: ' + (error?.message ?? error))
    console.error('A template-literal break in client/src/ (for example a backtick inside a CSS comment) does this. '
      + 'The host would fail web boot with "import failed: <message>" — fix the source, do not ship it.')
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
