/**
 * The declared faces, their licence split, @font-face declarations, the
 * reference stack tokens, and the one fallback that makes a face resolvable when
 * the build did not inline it.
 *
 * WHAT CHANGED AND WHY THESE TESTS LOOK DIFFERENT. The six Anthropic faces are
 * no longer part of the checkout: they carry no redistribution grant, so they are
 * untracked local working copies and a fresh clone has none. Every assertion here
 * that used to read those six files now reads `tools/font-licences.mjs` instead —
 * a sha256 and the first 96 bytes per face — so the checks still run, and still
 * fail, on a machine that has never seen the binaries.
 *
 * The same-origin HTTP route that used to be a second fallback is GONE — the
 * branch needing it cannot exist (see `lib/index.js`), and once the route was
 * deleted, emitting its URL would produce a guaranteed 404. These tests now pin
 * the inverse: the shipped CSS must contain NO route URL at all.
 *
 *   node test/fonts.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  FONT_FACES, CJK_FACES, CJK_WEIGHT_RANGE, FONT_BASE_GLOBAL, RESTRICTED_FACES,
  fontFaceCss, fontStackCss, fontCss, fontSourcesFor,
} from '../client/src/fonts.js'
import { FONT_BASE_GLOBAL as HOST_FONT_BASE_GLOBAL } from '../lib/index.js'
import {
  FONT_FINGERPRINTS, RESTRICTED_FACE_FILES, dataUrlPrefix, sha256Of, fingerprintFor, localPathFor,
} from '../../../tools/font-licences.mjs'

const FONTS_DIR = fileURLToPath(new URL('../fonts/', import.meta.url))
const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url))
const ARTIFACT = fileURLToPath(new URL('../client/client.js', import.meta.url))
const REFERENCE_CSS = fileURLToPath(
  new URL('../../../.reference/open-claude-ui/code-examples/cds-theme.css', import.meta.url),
)

const EXPECTED_FAMILIES = ['anthropic-sans', 'anthropic-serif', 'anthropic-mono']

/** The shipped CJK fallback families: the shifted Source Han faces. */
const EXPECTED_CJK_FAMILIES = ['anthropic-cjk', 'anthropic-cjk-serif']

/** Parse the six @font-face blocks into plain objects. */
function parseFaces(css) {
  const faces = []
  const re = /@font-face\s*\{([^}]*)\}/g
  let match = re.exec(css)
  while (match !== null) {
    const body = match[1]
    const pick = function (name) {
      const line = body.split('\n').find(function (row) { return row.trim().startsWith(name + ':') })
      if (line === undefined) return undefined
      return line.slice(line.indexOf(':') + 1).trim().replace(/;$/, '')
    }
    faces.push({
      family: (pick('font-family') || '').replace(/^"|"$/g, ''),
      style: pick('font-style'),
      weight: pick('font-weight'),
      display: pick('font-display'),
      src: pick('src'),
    })
    match = re.exec(css)
  }
  return faces
}

// ------------------------------------------------------------- the files

/**
 * THE SIX ANTHROPIC FACES ARE DECLARED, AND ARE *NOT* TRACKED.
 *
 * This used to assert that all six files exist in `fonts/`. That assertion is
 * gone, deliberately: those bytes carry no redistribution grant, so keeping them
 * in a public repository is distribution. They are now the developer's own
 * local working copies — untracked, gitignored, absent from a fresh clone.
 *
 * What must stay true instead is the contract the rest of the code depends on:
 *
 *   1. all six are still DECLARED in the face table (a machine that has the
 *      family installed must still get the replica through `local()`);
 *   2. when a local copy DOES exist it is a real WOFF2 and its bytes are the ones
 *      `tools/font-licences.mjs` describes — a swapped file must not ride along
 *      under a name the licence gates consider handled;
 *   3. git does not track them (the guard below).
 */
test('the six Anthropic faces are declared, and any local copy matches its fingerprint', function () {
  assert.equal(FONT_FACES.length, 6)
  const files = FONT_FACES.map(function (face) { return face.file })
  assert.deepEqual(files.slice().sort(), [
    'AnthropicMono-Italic-Web.woff2',
    'AnthropicMono-Roman-Web.woff2',
    'AnthropicSans-Italic-Web.woff2',
    'AnthropicSans-Roman-Web.woff2',
    'AnthropicSerif-Italic-Web.woff2',
    'AnthropicSerif-Roman-Web.woff2',
  ])
  for (const file of files) {
    const path = FONTS_DIR + file
    if (!existsSync(path)) continue // the expected state on a fresh clone
    const bytes = readFileSync(path)
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', file + ' is not a WOFF2 file')
    const known = fingerprintFor(file)
    assert.ok(known, file + ' has no licence fingerprint in tools/font-licences.mjs')
    assert.equal(sha256Of(bytes), known.sha256,
      file + ' on this machine is not the face the licence registry describes. Restore the'
      + ' original file; do not edit the registry to match an unlicensed replacement.')
  }
})

/**
 * The licence decision is "these six never ship", and it is enforced by CONTENT.
 *
 * The registry in `tools/font-licences.mjs` is what the build, the audit and the
 * release gate all read. This test pins the two lists to the face table so a new
 * `redistributable: false` entry cannot be added to `fonts.js` and silently stay
 * out of the gates that protect it.
 */
test('the licence registry covers exactly the declared faces, split by licence', function () {
  const declared = FONT_FACES.concat(CJK_FACES)
  assert.deepEqual(
    FONT_FINGERPRINTS.map(function (face) { return face.file }).sort(),
    declared.map(function (face) { return face.file }).sort(),
    'tools/font-licences.mjs and client/src/fonts.js must describe the same faces',
  )
  const declaredRestricted = declared
    .filter(function (face) { return face.redistributable !== true })
    .map(function (face) { return face.file })
    .sort()
  assert.deepEqual(RESTRICTED_FACE_FILES.slice().sort(), declaredRestricted,
    'every face marked `redistributable: false` must be `kind: commercial` in the registry')
  assert.deepEqual(RESTRICTED_FACES.slice().sort(), declaredRestricted)
  for (const face of FONT_FINGERPRINTS) {
    assert.ok(Number.isInteger(face.bytes) && face.bytes > 0, face.file + ' needs a byte length')
    assert.match(face.sha256, /^[0-9a-f]{64}$/, face.file + ' needs a full sha256')
    assert.equal(Buffer.from(face.prefix96, 'base64').length, 96,
      face.file + ' must carry exactly the first 96 bytes as base64')
  }
})

/**
 * THE UNTRACKED CONTRACT, checked against git itself.
 *
 * Every other test would stay green if someone re-`git add`ed the six commercial
 * faces: the files are on the developer's machine either way. This is the one
 * assertion that fails when they become public again, so it is worth the one
 * subprocess call. Skipped when the checkout is not a git repository (an
 * exported tarball, a CI artifact) rather than passing silently.
 */
test('the six commercial faces are not tracked by git', function () {
  let tracked
  try {
    tracked = execFileSync('git', ['ls-files', '--', 'fonts'], {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    // No git, or git refuses this directory: nothing to assert about the index.
    return
  }
  const trackedNames = tracked.split(/\r?\n/).filter(Boolean)
  // On Windows the split above sees `fonts/AnthropicSans-Roman-Web.woff2`.
  for (const file of RESTRICTED_FACE_FILES) {
    assert.ok(!trackedNames.some(function (row) { return row.replace(/\\/g, '/').endsWith('fonts/' + file) }),
      file + ' is tracked by git. Those bytes carry no redistribution grant: they are the'
      + ' developer\'s local working copies and must stay untracked (see .gitignore).')
  }
  for (const face of CJK_FACES) {
    assert.ok(trackedNames.some(function (row) { return row.replace(/\\/g, '/').endsWith('fonts/' + face.file) }),
      face.file + ' must stay tracked: it is the face the package actually ships')
  }
})

/**
 * The CJK fallback faces: real Source Han/Noto faces, axis-shifted, subset.
 *
 * These assertions encode the measurements the design depends on, so a silent
 * regression in the shipped binaries fails here instead of showing up as
 * "Chinese looks a bit thin" in the UI:
 *   - both files must exist, be WOFF2, and stay inside the documented subset
 *     size band (a full face is 5-8 MB and would blow up the bundle);
 *   - the sans face is the variable one with the `avar` shift, the serif is the
 *     static one at the greeting's design weight.
 */
test('the CJK fallback faces ship, are WOFF2, and stay inside the subset budget', function () {
  assert.equal(CJK_FACES.length, 2, 'exactly one sans and one serif fallback')

  for (const face of CJK_FACES) {
    const path = FONTS_DIR + face.file
    assert.ok(existsSync(path), face.file + ' is missing from fonts/')
    const buffer = readFileSync(path)
    assert.equal(buffer.subarray(0, 4).toString('latin1'), 'wOF2', face.file + ' is not WOFF2')
    // Subset with punctuation + ASCII is ~1-2 MB; a FULL face is 5-8 MB. The
    // upper bound is the promise that keeps client.js near 5 MB instead of 20.
    assert.ok(buffer.length > 500 * 1024, face.file + ' is suspiciously small')
    assert.ok(buffer.length < 3 * 1024 * 1024,
      face.file + ' exceeds the subset budget; a full face would bloat the bundle')
  }

  const sans = CJK_FACES.find(function (face) { return face.family === 'anthropic-cjk' })
  const serif = CJK_FACES.find(function (face) { return face.family === 'anthropic-cjk-serif' })
  assert.ok(sans && serif, 'both families must be declared')
  assert.equal(sans.file, 'NotoSansSC-Shifted-VF.woff2')
  assert.equal(serif.file, 'NotoSerifSC-Shifted-330.woff2')
})

/**
 * The package ships the faces ONE way, and this test pins which way.
 *
 * IT USED TO ASSERT `files.includes('fonts')`, with the reason "or an installed
 * plugin loses the faces". That reason was correct when the fallback could be
 * reached — but `files` is an allowlist, so listing the directory would pack BOTH
 * the six commercial faces (which must never be distributed) and a second copy of
 * the two that are already inlined. The history, for scale:
 *
 *   client/client.js   5.05 MB   ← 8 faces inlined as base64 (4.85 MB)
 *   fonts/             3.0 MB    ← the same 8 woff2 files, a second copy
 *
 *   published tarball  7.5 MB    → 3.9 MB once the directory was dropped
 *
 * WHY DROPPING IT IS SAFE, verified rather than argued: the shipped bundle was
 * loaded through its own `window.__ModuleLoader__` entry and its `fontCss()` was
 * called. Every shippable `@font-face` came back with a `data:font/woff2` src, and
 * `fontSourcesFor()` returns the inline data URL before it ever looks at the
 * Host-injected `file://` base, so the fonts directory is not read at runtime. The
 * two Noto faces stay TRACKED in the repository because the build imports them;
 * the six commercial ones are untracked and absent from a fresh clone.
 *
 * THE INVARIANT THIS MUST PROTECT is therefore not "fonts/ is packed" but
 * "every face we may ship is inlined, and no face we may not ship ever is". If a
 * build stops inlining a shippable face, that face silently falls back to a
 * `file://` URL that points inside a package that does not carry it — broken
 * fonts in the app, with nothing thrown.
 */
test('the build imports only redistributable faces', function () {
  // THE ARTIFACT ASSERTIONS ABOVE CANNOT SEE A SOURCE-LEVEL RE-INTRODUCTION on
  // their own: if someone re-adds an Anthropic import and does not rebuild, the
  // committed bundle is still clean and those checks stay green. (The build
  // itself refuses — `tools/build-client.mjs` exits 1 — but a test must fail
  // too, not just the build.) So this reads the import table directly.
  const source = readFileSync(new URL('../client/src/font-assets.js', import.meta.url), 'utf8')
  const imported = Array.from(source.matchAll(/from\s+'\.\.\/\.\.\/fonts\/([^']+)'/g))
    .map(function (match) { return match[1] })
  assert.ok(imported.length > 0, 'font-assets.js must import the faces it inlines')

  const faces = FONT_FACES.concat(CJK_FACES)
  for (const file of imported) {
    const face = faces.find(function (entry) { return entry.file === file })
    assert.ok(face, file + ' is imported but not declared in fonts.js — every inlined '
      + 'face must carry a `redistributable` classification')
    assert.equal(face.redistributable, true,
      file + ' is imported by font-assets.js, so its bytes would be inlined and '
      + 'published. It is classified `redistributable: false`: remove the import.')
  }
  // And the table must cover exactly what ships, with no extras.
  const permitted = faces.filter(function (face) { return face.redistributable === true })
  assert.deepEqual(imported.slice().sort(), permitted.map(function (face) { return face.file }).sort(),
    'font-assets.js must import exactly the redistributable faces')
})

test('the package ships only the faces it may redistribute', function () {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(Array.isArray(manifest.files), 'package.json must declare files')
  assert.ok(!manifest.files.includes('fonts'),
    'fonts/ must NOT be packed: redistributable faces are inlined in client/client.js, '
    + 'and the restricted ones must not be distributed at all')

  // THE LICENCE RULE, asserted on the ARTIFACT. `files` cannot express this: the
  // faces used to be inlined, and base64 in a published bundle IS redistribution.
  // The six Anthropic web faces have no redistribution grant, so their bytes must
  // be absent while the two SIL OFL Noto faces stay inlined.
  //
  // THE PREFIXES COME FROM THE REGISTRY, NOT FROM `fonts/`. Reading the file here
  // is what made this assertion useless on a fresh clone — the six commercial
  // files are untracked, so `readFileSync` threw and the check never ran where it
  // mattered most.
  const artifact = readFileSync(ARTIFACT, 'utf8')
  for (const file of RESTRICTED_FACES) {
    assert.ok(!artifact.includes(dataUrlPrefix(file)),
      file + ' is inlined in the shipped bundle. Those faces carry no redistribution '
      + 'grant: mark the entry `redistributable: false` in client/src/fonts.js and drop '
      + 'its import from client/src/font-assets.js.')
  }

  // And a face whose LOCAL bytes differ from the registry is caught too: the
  // registry prefix alone would miss a swapped file. Absent is fine — that is the
  // fresh-clone state — but present-and-different must be a failure, not a skip.
  for (const file of RESTRICTED_FACES) {
    // `localPathFor` takes the REPOSITORY root (it appends `plugins/<name>/fonts/`),
    // not this plugin's directory.
    const local = localPathFor(fingerprintFor(file))
    if (!existsSync(local)) continue
    const bytes = readFileSync(local)
    const localPrefix = 'data:font/woff2;base64,' + bytes.subarray(0, 96).toString('base64')
    assert.ok(!artifact.includes(localPrefix),
      file + ' is inlined, identified by its LOCAL bytes (which differ from the registry'
      + ' fingerprint). Restore the original face or correct the fingerprint.')
  }

  // The permitted faces must still be inlined, or they fall back to a file:// URL
  // inside a package that no longer carries fonts/ — broken, with nothing thrown.
  const permitted = FONT_FACES.concat(CJK_FACES)
    .filter(function (face) { return face.redistributable === true })
  assert.ok(permitted.length > 0, 'at least the CJK fallbacks are redistributable')
  for (const face of permitted) {
    // These two ARE tracked, so reading them is correct here — and reading them
    // checks the real bytes rather than trusting the table.
    const bytes = readFileSync(new URL('../fonts/' + face.file, import.meta.url))
    const prefix = 'data:font/woff2;base64,' + bytes.subarray(0, 96).toString('base64')
    assert.ok(artifact.includes(prefix), face.file + ' must be inlined: the package '
      + 'does not ship fonts/')
    assert.equal(sha256Of(bytes), fingerprintFor(face.file).sha256,
      face.file + ' on disk does not match its committed fingerprint')
  }

  // And the count is exact — no stray face inlined behind the table's back.
  assert.equal((artifact.match(/data:font\/woff2;base64,/g) || []).length, permitted.length,
    'only the redistributable faces may appear as data URLs')
})

test('every face is classified, and a restricted face never resolves to a URL', function () {
  // The flag is what the build and the test above both read; an unclassified face
  // would default to "ships" in one place and "does not" in another.
  for (const face of FONT_FACES.concat(CJK_FACES)) {
    assert.equal(typeof face.redistributable, 'boolean',
      face.file + ' must declare `redistributable` explicitly')
  }
  // Localized family name for the restricted ones, so local() can actually match
  // an installed face rather than the file name.
  for (const face of FONT_FACES) {
    assert.equal(typeof face.local, 'string', face.file + ' needs the installed family name')
    assert.ok(face.local.indexOf('.woff2') < 0, 'local() takes a FAMILY, not a file name')
  }

  const base = 'file:///C:/plugins/cds-theme/fonts/'
  const restricted = RESTRICTED_FACES[0]
  // Even with an inline table AND a base, a restricted face is local() only.
  assert.equal(fontSourcesFor(restricted, { fileBase: base, restricted: true }),
    'local("' + FONT_FACES.find(function (f) { return f.file === restricted }).local + '")')
  assert.ok(!fontSourcesFor(restricted, { fileBase: base, restricted: true }).includes('url('),
    'a restricted face must never emit a URL — the package does not ship the file')

  // And the generated sheet follows the same rule for those families.
  const faces = parseFaces(fontFaceCss({ fileBase: base }))
  for (const face of faces.filter(function (f) { return EXPECTED_FAMILIES.includes(f.family) })) {
    assert.ok(face.src.startsWith('local('),
      face.family + ' ' + face.style + ' must resolve through local(), got: ' + face.src)
    assert.ok(!face.src.includes(base), 'no file:// URL for a restricted face')
  }
})

// --------------------------------------------------------- @font-face

test('the Anthropic @font-face blocks declare the reference family names exactly', function () {
  const all = parseFaces(fontFaceCss({ fileBase: '', protocol: 'http:' }))
  assert.equal(all.length, 8, 'six Anthropic faces plus two CJK fallbacks')
  const faces = all.filter(function (face) { return EXPECTED_FAMILIES.includes(face.family) })
  assert.equal(faces.length, 6)

  const families = [...new Set(faces.map(function (face) { return face.family }))].sort()
  assert.deepEqual(families, EXPECTED_FAMILIES.slice().sort(),
    'family names must match the reference verbatim: anthropic-sans/serif/mono')

  for (const face of faces) {
    assert.ok(EXPECTED_FAMILIES.includes(face.family), 'unexpected family ' + face.family)
    const italic = /-Italic-/.test(FONT_FACES.find(function (f) { return f.family === face.family && f.style === face.style }).file)
    assert.equal(face.style, italic ? 'italic' : 'normal',
      face.family + ' ' + face.style + ' must be the ' + (italic ? 'Italic' : 'Roman') + ' file')
    // Probed fvar axis range on all six faces: wght 300–800.
    assert.equal(face.weight, '300 800', 'variable weight range missing')
    assert.equal(face.display, 'swap')
  }

  // Each family has exactly a roman and an italic face.
  for (const family of EXPECTED_FAMILIES) {
    const owned = faces.filter(function (face) { return face.family === family })
    assert.deepEqual(owned.map(function (face) { return face.style }).sort(), ['italic', 'normal'])
  }
})

test('without an inlined face and without a base the src is a local() name, never a URL', function () {
  // The shipped build always inlines the permitted faces, so this is the
  // source-run degradation path. It must NOT name a URL: the route is deleted,
  // so any URL here would be a guaranteed 404 and a console error per face.
  const faces = parseFaces(fontFaceCss({ fileBase: '' }))
  const declared = FONT_FACES.concat(CJK_FACES)
  assert.equal(faces.length, declared.length)
  for (const [index, face] of faces.entries()) {
    assert.ok(!face.src.includes('url('), 'no URL may be emitted without data or a base: ' + face.src)
    assert.ok(!face.src.includes('/dsh-cds-theme/fonts/'), 'the deleted route must not reappear')
    // A restricted face names its INSTALLED family; a permitted one falls back
    // to the file name (its data URL is what the shipped build uses anyway).
    const expected = typeof declared[index].local === 'string'
      ? declared[index].local
      : declared[index].file
    assert.equal(face.src, 'local("' + expected + '")')
  }
})

test('the injected file:// base is used when a permitted face was not inlined', function () {
  const base = 'file:///C:/plugins/cds-theme/fonts/'
  const src = fontSourcesFor('NotoSansSC-Shifted-VF.woff2', { fileBase: base })
  // In the Node test run the inline table is empty (no .woff2 import), so this
  // really is the non-inlined branch.
  assert.equal(src, 'url("' + base + 'NotoSansSC-Shifted-VF.woff2") format("woff2")')
  assert.ok(!src.includes('/dsh-cds-theme/fonts/'), 'no route URL, ever')
})

test('the shipped artifact carries only redistributable faces and no deleted route', function () {
  const artifact = readFileSync(ARTIFACT, 'utf8')
  const permitted = FONT_FACES.concat(CJK_FACES)
    .filter(function (face) { return face.redistributable === true })
  assert.equal((artifact.match(/data:font\/woff2;base64,/g) || []).length, permitted.length,
    'exactly the redistributable faces may be inlined — the six Anthropic web faces '
    + 'have no redistribution grant and must resolve through local()')
  assert.ok(!artifact.includes('/dsh-cds-theme/fonts/'),
    'the deleted route must not appear anywhere in the artifact')
  assert.ok(!artifact.includes('FONT_ROUTE_BASE'), 'the constant itself must be gone')
})

test('the runtime reads the Host-injected global', function () {
  // The base only applies to a REDISTRIBUTABLE face now: a restricted one is
  // local()-only, so the observable behaviour is pinned on the CJK face.
  const base = 'file:///C:/plugins/cds-theme/fonts/'
  globalThis[FONT_BASE_GLOBAL] = base
  try {
    const faces = parseFaces(fontFaceCss())
    const cjk = faces.find(function (face) { return face.family === 'anthropic-cjk' })
    assert.ok(cjk, 'the CJK face must be declared')
    assert.ok(cjk.src.includes(base), 'the injected base must reach a redistributable face src')
  } finally {
    delete globalThis[FONT_BASE_GLOBAL]
  }
  // And it must disappear again when the Host does not inject it.
  assert.ok(!fontFaceCss().includes('file://'), 'a stale global must not leak into the sheet')
})

test('the built artifact carries no machine-specific font path', function () {
  const artifact = readFileSync(ARTIFACT, 'utf8')
  assert.ok(artifact.includes('@font-face'), 'the artifact must ship the @font-face blocks')
  // The weight range is assembled at runtime (`"  font-weight: " + weightRange`),
  // so assert the VALUE the builder emits rather than a literal in the bundle.
  assert.ok(fontFaceCss({ fileBase: '' }).includes('font-weight: ' + CJK_WEIGHT_RANGE),
    'the CJK faces must declare their own weight range')
  assert.ok(fontFaceCss({ fileBase: '' }).includes('font-weight: 300 800'),
    'the Latin faces must declare the probed variable range')
  assert.ok(artifact.includes(FONT_BASE_GLOBAL), 'the injected-global name must be in the artifact')
  assert.ok(!artifact.includes('file:///'), 'no build-stamped absolute file:// URL may be committed')
  assert.ok(!/[A-Za-z]:\\\\Users\\\\/.test(artifact), 'no build-machine path may be committed')
})

test('the Host and the client agree on the injected global name', function () {
  // A drift here is silent: the Host injects a global nobody reads and every
  // fallback URL is built from ''. Same class of bug the system-fonts fence
  // guards with its marker-header test.
  assert.equal(FONT_BASE_GLOBAL, HOST_FONT_BASE_GLOBAL)
  assert.equal(FONT_BASE_GLOBAL, '__CDS_THEME_FONT_BASE__')
})

// ---------------------------------------------------------- the stacks

test('the reference families survive, and the CJK rungs are the shipped faces', function () {
  // THE DELIBERATE DEPARTURE. The reference CSS (:205-213) ends every stack in
  // four macOS CJK family names. On Windows none resolve; on macOS they resolve
  // to *stock* PingFang, which is two static files, so the theme's eight
  // weights collapse to two there as well. The shipped stack therefore puts the
  // real shifted Source Han face FIRST and keeps the reference names behind it
  // as a last resort.
  //
  // What is still pinned verbatim: the Latin families and the fallback chain
  // they sit in, because the reference still owns those values.
  const css = fontStackCss()
  const verbatim = [
    '--font-cjk-sans-sc: "PingFang SC";',
    '--font-cjk-sans-tc: "PingFang TC";',
    '--font-cjk-sans-jp: "Hiragino Sans";',
    '--font-cjk-sans-kr: "Apple SD Gothic Neo";',
    '--font-anthropic-sans: "anthropic-sans", var(--font-sans-fallbacks);',
    '--font-anthropic-mono: "anthropic-mono", ui-monospace,',
  ]
  for (const line of verbatim) {
    assert.ok(css.includes('  ' + line), 'missing verbatim stack token: ' + line)
  }

  // The shift mechanism must be reachable from the stacks: without these the
  // shipped CJK faces would be downloaded and never used.
  assert.ok(css.includes('--font-cjk-sans: "anthropic-cjk"'),
    'the shifted sans face must be the first CJK rung')
  assert.ok(css.includes('--font-cjk-serif: "anthropic-cjk-serif"'),
    'the shifted serif face must be the first CJK serif rung')
  assert.ok(css.includes('"Noto Sans SC"'),
    'the installed face must sit behind the subset, so rare glyphs match')
  assert.ok(css.includes('"Noto Serif SC"'),
    'the serif stack must not fall back to a SANS face (the reference bug)')

  // The reference's own bug must not come back: --font-anthropic-serif used to
  // end in the SANS CJK chain, so Chinese in the greeting rendered as a sans
  // beside a serif Latin. It must end in the SERIF chain.
  const serifLine = css.split('\n').find(function (row) {
    return row.trim().startsWith('--font-anthropic-serif:')
  })
  assert.ok(serifLine !== undefined)
  assert.ok(serifLine.includes('var(--font-cjk-serif)'),
    'the serif stack must reach the SERIF CJK chain')
  assert.ok(!serifLine.includes('var(--font-cjk-sans-fallback)'),
    'the reference sans-behind-serif bug must stay fixed')
})

test('the reference stylesheet still supplies the Latin half of the stack', function (t) {
  if (!existsSync(REFERENCE_CSS)) {
    t.skip('reference checkout not present')
    return
  }
  const reference = readFileSync(REFERENCE_CSS, 'utf8').split(/\r?\n/)

  // Locate the nine-line stack block by CONTENT, not by a hardcoded slice.
  // The old `slice(204, 213)` broke the moment upstream inserted 12 lines above
  // it (open-claude-ui afe22f3/every-commit after ddf3aea): the window slid onto
  // the easing-curve block and this test reported "the reference no longer
  // carries the expected token" while all five tokens were still present,
  // 21 lines lower. Anchoring on the first and last line keeps the assertion
  // about the tokens and lets upstream insert lines above the block freely.
  const first = reference.findIndex(function (line) {
    return line.trim() === '--font-cjk-sans-sc: "PingFang SC";'
  })
  assert.notEqual(first, -1, 'the reference stack block start disappeared')
  const lines = reference.slice(first, first + 9)
  assert.equal(lines.length, 9)
  assert.equal(lines[8].trim(), '--font-anthropic-mono: "anthropic-mono", ui-monospace, monospace;',
    'the reference stack block no longer ends where it used to')
  const css = fontStackCss()

  // The four macOS family NAMES are still pinned verbatim, and so is the
  // `--font-anthropic-sans` line. The composite lines that referenced
  // `--font-cjk-sans-fallback` are NOT: that token now points at the shipped
  // face, which is the change under test in the block above.
  const stillVerbatim = [
    '--font-cjk-sans-sc: "PingFang SC";',
    '--font-cjk-sans-tc: "PingFang TC";',
    '--font-cjk-sans-jp: "Hiragino Sans";',
    '--font-cjk-sans-kr: "Apple SD Gothic Neo";',
    '--font-anthropic-sans: "anthropic-sans", var(--font-sans-fallbacks);',
  ]
  for (const wanted of stillVerbatim) {
    assert.ok(lines.some(function (line) { return line.trim() === wanted }),
      'the reference no longer carries the expected token: ' + wanted)
    assert.ok(css.includes('  ' + wanted),
      'the shipped stack must still carry: ' + wanted)
  }
})

test('fontCss joins the faces and the stacks into one block', function () {
  const css = fontCss({ fileBase: '', protocol: 'http:' })
  assert.equal(css, fontFaceCss({ fileBase: '', protocol: 'http:' }) + '\n\n' + fontStackCss())
  assert.equal((css.match(/@font-face/g) || []).length, 8)
  assert.ok(css.includes('--font-anthropic-serif'))
})

test('the shipped artifact inlines only the redistributable faces (the desktop origin cannot fetch them)', function () {
  // The desktop document is served from the `dsh-app://app` origin: a
  // route-relative font URL lands in the app's own protocol handler and 404s,
  // a `file://` URL is blocked, and an absolute http URL is cross-origin with
  // no CORS headers. A data URL is the only delivery that works there — so every
  // face we are ALLOWED to ship is inlined, and the restricted ones resolve
  // through local() instead. This pins that split at the artifact level, where
  // the require-guarded font-assets module cannot be exercised by Node ESM.
  const artifact = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const permitted = FONT_FACES.concat(CJK_FACES)
    .filter(function (face) { return face.redistributable === true })
  assert.equal((artifact.match(/data:font\/woff2;base64,/g) || []).length, permitted.length)
  // No machine-specific path may leak into the committed artifact.
  assert.equal(/file:\/\/\//.test(artifact), false)
  assert.equal(/[A-Za-z]:\\\\/.test(artifact), false)
})

