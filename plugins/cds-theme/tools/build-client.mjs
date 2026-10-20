import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSync } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(root, 'client', 'src', 'index.js')
const OUT = join(root, 'client', 'client.js')

// The id the bundle registers with `window.__ModuleLoader__.load({ id })`.
//
// READ FROM package.json, NEVER HARDCODED. The host keys each client-module graph
// row by the PACKAGE NAME; a bundle that registers under anything else never
// satisfies its own row. The loader then reports "loaded without registering",
// retries through the one-resource URL, executes the bundle a second time, and
// the retry dies with `client-modules: duplicate factory registration`, which
// takes the entire web boot down (the desktop shows "The application could not
// start or stopped unexpectedly").
//
// This exact failure already happened once, in the sibling usage-stats plugin:
// its package was renamed, the patch row was fixed, and the hardcoded id here was
// not. That plugin's build script now reads the manifest, and this one does too —
// so a future rename cannot repeat it.
const PACKAGE_NAME = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

/**
 * Inline every woff2 import as a `data:font/woff2` string (esbuild's built-in
 * `dataurl` loader — the synchronous API cannot take plugins).
 *
 * WHY AT BUILD TIME. In the desktop shell the document origin is
 * `dsh-app://app`: a route-relative font URL resolves into the app's own
 * protocol handler and 404s, a `file://` URL is blocked as a local resource,
 * and an absolute `http://127.0.0.1:<port>` URL is cross-origin with no CORS
 * headers on the route. A data URL has none of those problems — no origin, no
 * token, no CSP surface — and inlining at build time keeps the artifact
 * path-free (no drive letter, no `file://`), so a fresh checkout needs no
 * rebuild for this. Cost: ~660 KB of woff2 becomes ~880 KB of base64 in the
 * committed bundle; that is the documented price of a replica that renders.
 */

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
    external: ['react', '@deepseek-ai/dsh-client-ui-primitives'],
    legalComments: 'inline',
    write: false,
    logLevel: 'warning',
    loader: { '.woff2': 'dataurl' },
  })
  const cjs = result.outputFiles[0].text.trimEnd()
  const indented = cjs.split('\n').map((line) => (line === '' ? '' : '    ' + line)).join('\n')
  return entryHeader() +
    'window.__ModuleLoader__.load({\n' +
    "  id: " + JSON.stringify(PACKAGE_NAME) + ",\n" +
    '  factory: (require) => {\n' +
    '    var module = { exports: {} }\n' +
    '    var exports = module.exports\n' +
    indented + '\n' +
    '    return module.exports\n' +
    '  },\n' +
    '})\n'
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])

if (isMain) {
  const check = process.argv.includes('--check')
  const artifact = buildArtifact()

  if (check) {
    const committed = readFileSync(OUT, 'utf8')
    if (committed === artifact) {
      console.log('client/client.js is up to date with client/src/')
      process.exit(0)
    }
    console.error('client/client.js is STALE — run `npm run build` and commit the artifact')
    process.exit(1)
  }

  writeFileSync(OUT, artifact)
  console.log('wrote ' + OUT.replace(root, '.') + ` (${artifact.length} bytes)`)
}
