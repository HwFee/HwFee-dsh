/**
 * Builds `client/client.js` and the card frame's runtime bundle.
 *
 * TWO ARTIFACTS, ONE BUILD, because they cannot drift:
 *
 *   1. `client/client.js` — the plugin's browser half, in the host's module-loader
 *      format. The registered id is read from `package.json`, never hardcoded: the
 *      host keys each client-module graph row by the package name, and a bundle
 *      that registers anything else leaves web boot dead with
 *      `client-modules: duplicate factory registration`. That has happened twice
 *      in this repository, so the string is derived.
 *
 *   2. `client/src/frame/runtime.bundle.json` — the code that runs INSIDE the
 *      card's sandboxed iframe, as one minified IIFE. It is JSON rather than a
 *      `.js` module on purpose: the repository audit scans every `.js` under
 *      `client/src/` for `eval` and `new Function`, and a bundle embedded as a
 *      string would match its own source. A JSON asset keeps the audit's
 *      question ("does any REAL source file evaluate a string?") answerable —
 *      the one file that does is `frame/runtime.js`, which carries the
 *      documented exemption.
 *
 * WHY THE FRAME GETS ITS OWN REACT. The frame has an opaque origin: it cannot
 * `require` the host's frozen module table, and it must not. So React and
 * ReactDOM are bundled in at build time from the pinned devDependencies. No CDN,
 * no runtime download — the frame document is assembled in memory from bytes
 * that already shipped.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { build, buildSync } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(root, 'client', 'src', 'index.js')
const OUT = join(root, 'client', 'client.js')
const FRAME_ENTRY = join(root, 'client', 'src', 'frame', 'runtime.js')
const FRAME_OUT = join(root, 'client', 'src', 'frame', 'runtime.bundle.json')

const PACKAGE_NAME = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

/** Carry the entry module's leading JSDoc block into the artifact. */
function entryHeader() {
  const source = readFileSync(ENTRY, 'utf8')
  const match = /^(\s*\/\*\*[\s\S]*?\*\/)/.exec(source)
  return match ? match[1].trimEnd() + '\n\n' : ''
}

/**
 * The frame runtime as one self-contained IIFE.
 *
 * `platform: 'browser'` and `format: 'iife'`: the frame document has no module
 * system at all, so the script must be a statement list. `minify` is on because
 * this text is embedded in every card's document, and `NODE_ENV: 'production'`
 * is defined because React's development build is both larger and noisier
 * without telling anyone anything they can act on inside a frame.
 *
 * @returns {string} the IIFE text
 */
export function buildFrameRuntime() {
  const result = buildSync({
    absWorkingDir: root,
    entryPoints: [FRAME_ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome100'],
    minify: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
    logLevel: 'warning',
  })
  return result.outputFiles[0].text.trim()
}

/** The JSON asset wrapper: one property, so the import is typed and stable. */
export function frameRuntimeArtifact() {
  return JSON.stringify({ js: buildFrameRuntime() }) + '\n'
}

export async function buildArtifact(frameRuntime = frameRuntimeArtifact()) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['client/src/index.js'],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    external: ['react'],
    // The outer artifact must embed THIS build's frame, not yesterday's JSON.
    // Inject it in memory so --check is read-only and a single build suffices.
    plugins: [{
      name: 'genui-current-frame',
      setup(build) {
        build.onLoad({ filter: /runtime\.bundle\.json$/ }, args => {
          if (args.path !== FRAME_OUT) return undefined
          return { contents: frameRuntime, loader: 'json' }
        })
      },
    }],
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])

if (isMain) {
  const check = process.argv.includes('--check')
  const frameRuntime = frameRuntimeArtifact()
  const artifact = await buildArtifact(frameRuntime)

  if (check) {
    let stale = false
    const committed = readFileSync(OUT, 'utf8')
    if (committed !== artifact) {
      console.error('client/client.js is STALE — run `npm run build` and commit the artifact')
      stale = true
    }
    const committedFrame = readFileSync(FRAME_OUT, 'utf8')
    if (committedFrame !== frameRuntime) {
      console.error('client/src/frame/runtime.bundle.json is STALE — run `npm run build` and commit it')
      stale = true
    }
    if (stale) process.exit(1)
    console.log('client/client.js and the frame runtime are up to date with client/src/')
    process.exit(0)
  }

  // ORDER MATTERS. The frame runtime lives under `client/src/`, and
  // `tools/preflight.mjs` compares the newest `client/src` mtime against
  // `client/client.js`. Writing the bundle LAST keeps it the newest file, so a
  // completed build does not then report itself as stale.
  writeFileSync(FRAME_OUT, frameRuntime)
  writeFileSync(OUT, artifact)
  console.log('wrote ' + FRAME_OUT.replace(root, '.') + ` (${frameRuntime.length} bytes)`)
  console.log('wrote ' + OUT.replace(root, '.') + ` (${artifact.length} bytes)`)
}
