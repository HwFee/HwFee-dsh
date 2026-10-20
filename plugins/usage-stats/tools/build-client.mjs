import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSync } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(root, 'client', 'src', 'index.js')
const OUT = join(root, 'client', 'client.js')

// The id the bundle registers with `window.__ModuleLoader__.load({ id })`.
//
// It is the PACKAGE NAME, read here rather than hardcoded, because the host
// keys each client-module graph row by the package name: a bundle that
// registers under anything else never satisfies its own row. The loader then
// reports "loaded without registering", retries through the one-resource URL,
// executes the bundle a second time, and the retry dies with
// `client-modules: duplicate factory registration` — taking the whole web boot
// down. The rename to @hwfee/dsh-usage-stats hit exactly this: the patch row
// was fixed, the hardcoded id here was not.
const PACKAGE_NAME = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

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
