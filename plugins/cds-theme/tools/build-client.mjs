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
 * The licence registry: static fingerprints for every face this repository
 * knows, including the six commercial ones whose BYTES are no longer tracked.
 *
 * WHY A REPOSITORY-LEVEL MODULE AND NOT A LOCAL COPY OF THE NAMES. The gate has
 * to work on a checkout that does not contain those six files — they are
 * untracked on purpose, because keeping them in a public repository is
 * distribution. A list that lived here would have to be kept in step with
 * `market/check-release-assets.mjs` and `tools/audit.mjs`; one registry cannot
 * drift from itself.
 */
const { RESTRICTED_FACE_FILES, dataUrlPrefix } = await import(
  '../../../tools/font-licences.mjs'
)

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
 * rebuild for this.
 *
 * ONLY REDISTRIBUTABLE FACES ARE IMPORTED. `font-assets.js` lists the two Noto
 * (SIL OFL) faces, so a face whose licence forbids redistribution has no import
 * to inline and its `@font-face` resolves through `local()`. The check below is
 * the enforcement: it fails the build if any restricted face's bytes appear in
 * the output, which is what catches a face re-imported through another path.
 */

/**
 * The `data:` URL prefix of one face.
 *
 * THE FINGERPRINT IS STATIC ON PURPOSE. This used to read the woff2 out of
 * `fonts/` and give up when it was missing — and it is missing on every fresh
 * clone, because the six commercial faces are untracked. A gate that silences
 * itself the moment the file it guards is gone is not a gate: the build would
 * have succeeded with those bytes inlined.
 *
 * `tools/font-licences.mjs` holds the prefix (the first 96 bytes, base64) for
 * every face the repository knows, so this works with no local bytes at all.
 * When a local copy DOES exist its own prefix is checked too — a swapped file
 * must not pass under the old name (see `faceDataPrefixes`).
 *
 * @param {string} file the woff2 file name
 * @returns {string | null} the prefix, or null for a file the registry does not know
 */
export function faceDataPrefix(file) {
  return dataUrlPrefix(file)
}

/**
 * Every prefix a restricted face may be inlined as: the registry's, plus the
 * local copy's when the bytes differ. Empty for a face the registry does not
 * know, which cannot happen for `RESTRICTED_FACE_FILES`.
 */
function faceDataPrefixes(file) {
  const prefixes = [dataUrlPrefix(file)]
  try {
    const bytes = readFileSync(join(root, 'fonts', file))
    const local = 'data:font/woff2;base64,' + bytes.subarray(0, 96).toString('base64')
    if (!prefixes.includes(local)) prefixes.push(local)
  } catch (error) {
    // Absent is the normal state: the six commercial faces are not tracked.
  }
  return prefixes
}

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

/**
 * The licence gate.
 *
 * Runs on the built text in BOTH paths — the freshness check and a real build —
 * so a stale-but-inlined artifact cannot pass `--check` either.
 *
 * The needles are the registry fingerprints (work with no local files) plus any
 * local copy whose bytes differ (works with no registry update). Both are
 * searched; `restrictedFacesIn` reports the file name either way.
 *
 * @param {string} artifact the bundle text
 * @returns {string[]} the restricted faces whose bytes were found
 */
export function restrictedFacesIn(artifact) {
  const found = []
  for (const file of RESTRICTED_FACE_FILES) {
    for (const prefix of faceDataPrefixes(file)) {
      if (prefix !== null && artifact.includes(prefix)) {
        found.push(file)
        break
      }
    }
  }
  return found
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])

if (isMain) {
  const check = process.argv.includes('--check')
  const artifact = buildArtifact()

  // NO LICENCE-BOUND FONT BYTES, EVER. This is not a size or taste rule: those
  // faces carry no redistribution grant, and a base64 string in the published
  // bundle is redistribution.
  const leaked = restrictedFacesIn(artifact)
  if (leaked.length > 0) {
    console.error('refusing to build: the artifact contains font faces this package may not redistribute:\n'
      + leaked.map(function (file) { return '  - ' + file }).join('\n')
      + '\nMark them `redistributable: false` in client/src/fonts.js (they resolve'
      + ' through local()) and remove their import from client/src/font-assets.js.')
    process.exit(1)
  }

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
