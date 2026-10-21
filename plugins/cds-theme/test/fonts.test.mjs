/**
 * The embedded Anthropic faces: files on disk, @font-face declarations, the
 * reference stack tokens, and the one fallback that makes the faces resolvable
 * when the build did not inline them.
 *
 * The same-origin HTTP route that used to be a second fallback is GONE — the
 * branch needing it cannot be built (see `lib/index.js`), and once the route
 * was deleted, emitting its URL would produce a guaranteed 404. These tests now
 * pin the inverse: the shipped CSS must contain NO route URL at all.
 *
 *   node test/fonts.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  FONT_FACES, CJK_FACES, CJK_WEIGHT_RANGE, FONT_BASE_GLOBAL,
  fontFaceCss, fontStackCss, fontCss, fontSourcesFor,
} from '../client/src/fonts.js'
import { FONT_BASE_GLOBAL as HOST_FONT_BASE_GLOBAL } from '../lib/index.js'

const FONTS_DIR = fileURLToPath(new URL('../fonts/', import.meta.url))
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

test('all six variable woff2 faces ship in fonts/', function () {
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
    assert.ok(existsSync(path), file + ' is missing from fonts/')
    const head = readFileSync(path).subarray(0, 4).toString('latin1')
    assert.equal(head, 'wOF2', file + ' is not a WOFF2 file')
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
 * reached — but the fallback is unreachable in the shipped artifact, and the
 * directory was pure duplication:
 *
 *   client/client.js   5.05 MB   ← 8 faces already inlined as base64 (4.85 MB)
 *   fonts/             3.0 MB    ← the same 8 woff2 files, a second copy
 *
 *   published tarball  7.5 MB    → 3.9 MB once the directory was dropped
 *
 * WHY DROPPING IT IS SAFE, verified rather than argued: the shipped bundle was
 * loaded through its own `window.__ModuleLoader__` entry and its `fontCss()` was
 * called. All 8 `@font-face` rules came back with a `data:font/woff2` src, zero
 * `file://` and zero `local()`. `fontSourcesFor()` returns the inline data URL
 * before it ever looks at the Host-injected `file://` base, so the fonts
 * directory is not read at runtime. `fonts/` stays in the REPOSITORY because the
 * build imports it.
 *
 * THE INVARIANT THIS MUST PROTECT is therefore not "fonts/ is packed" but
 * "every face is inlined". If a build ever stops inlining a face, that face
 * silently falls back to a `file://` URL that points inside a package that no
 * longer carries the file — broken fonts in the app, with nothing thrown. So
 * this test asserts BOTH halves: the manifest does not pack the second copy,
 * AND the bundle carries a data URL for every single face.
 */
test('the package ships the faces inlined, not as a duplicate fonts directory', function () {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(Array.isArray(manifest.files), 'package.json must declare files')
  assert.ok(!manifest.files.includes('fonts'),
    'fonts/ must NOT be packed: the faces are already inlined in client/client.js, '
    + 'and packing both costs ~3 MB of duplication')

  // The half that actually protects the user: every face is inlined in the
  // committed artifact. A bundle that lost an inline URL would fall back to
  // `file://<pkg>/fonts/<file>` — a directory that is no longer shipped.
  const artifact = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  const inlined = (artifact.match(/data:font\/woff2;base64,/g) || []).length
  assert.equal(inlined, FONT_FACES.length + CJK_FACES.length,
    'every face must be a data: URL in the committed bundle, or it resolves '
    + 'against a fonts/ directory that the package does not ship')
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
  // The shipped build always inlines, so this is the source-run degradation
  // path. It must NOT name a URL: the route is deleted, so any URL here would
  // be a guaranteed 404 and a console error per face.
  const faces = parseFaces(fontFaceCss({ fileBase: '' }))
  // Both the Anthropic faces and the CJK fallbacks go through the same
  // degradation path, so the walk covers all eight declarations in order.
  const allFiles = FONT_FACES.concat(CJK_FACES).map(function (face) { return face.file })
  assert.equal(faces.length, allFiles.length)
  for (const [index, face] of faces.entries()) {
    assert.ok(!face.src.includes('url('), 'no URL may be emitted without data or a base: ' + face.src)
    assert.ok(!face.src.includes('/dsh-cds-theme/fonts/'), 'the deleted route must not reappear')
    assert.equal(face.src, 'local("' + allFiles[index] + '")')
  }
})

test('the injected file:// base is used when the face was not inlined', function () {
  const base = 'file:///C:/plugins/cds-theme/fonts/'
  const src = fontSourcesFor('AnthropicSans-Roman-Web.woff2', { fileBase: base })
  // In the Node test run the inline table is empty (no .woff2 import), so this
  // really is the non-inlined branch.
  assert.equal(src, 'url("' + base + 'AnthropicSans-Roman-Web.woff2") format("woff2")')
  assert.ok(!src.includes('/dsh-cds-theme/fonts/'), 'no route URL, ever')
})

test('the shipped artifact inlines every face and never names the deleted route', function () {
  const artifact = readFileSync(ARTIFACT, 'utf8')
  assert.equal((artifact.match(/data:font\/woff2;base64,/g) || []).length, 8,
    'all eight faces (six Anthropic + two CJK) must be inlined in the shipped bundle')
  assert.ok(!artifact.includes('/dsh-cds-theme/fonts/'),
    'the deleted route must not appear anywhere in the artifact')
  assert.ok(!artifact.includes('FONT_ROUTE_BASE'), 'the constant itself must be gone')
})

test('the runtime reads the Host-injected global', function () {
  const base = 'file:///C:/plugins/cds-theme/fonts/'
  globalThis[FONT_BASE_GLOBAL] = base
  try {
    const faces = parseFaces(fontFaceCss())
    assert.ok(faces[0].src.includes(base), 'the injected base must reach the @font-face src')
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

test('the shipped artifact INLINES all six faces (the desktop origin cannot fetch them)', function () {
  // The desktop document is served from the `dsh-app://app` origin: a
  // route-relative font URL lands in the app's own protocol handler and 404s,
  // a `file://` URL is blocked, and an absolute http URL is cross-origin with
  // no CORS headers. The only delivery that works there is a data URL, so the
  // build inlines the six woff2 files. This test pins that contract at the
  // artifact level, where the require-guarded font-assets module cannot be
  // exercised by Node ESM (it cannot import .woff2).
  const artifact = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  assert.equal((artifact.match(/data:font\/woff2;base64,/g) || []).length, 8)
  // No machine-specific path may leak into the committed artifact.
  assert.equal(/file:\/\/\//.test(artifact), false)
  assert.equal(/[A-Za-z]:\\\\/.test(artifact), false)
})

