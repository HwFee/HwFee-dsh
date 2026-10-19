/**
 * Windows system-font enumeration for dsh-system-fonts.
 *
 * Three complementary sources:
 *
 *  1. `System.Drawing.Text.InstalledFontCollection` (PowerShell) — 347 families
 *     of GDI-canonical names. These are the names CSS actually resolves, but the
 *     collection carries no weight information, and on this machine it returned
 *     not one non-ASCII name: a Chinese family arrives as "STKaiti", never as
 *     华文楷体.
 *  2. The registry Fonts keys — 242 families carrying both a localized display
 *     name (华文楷体, 苹方-简) and, because each weight ships as its own entry,
 *     the set of weights that family actually has. Those entry names are display
 *     names, not family/subfamily pairs, so they need decomposing:
 *        "Arial Bold Italic (TrueType)"      -> Arial / 700 / italic
 *        "Cambria & Cambria Math (TrueType)" -> Cambria (the first variant wins)
 *        "苹方-简 中粗体 (TrueType)"          -> 苹方-简 / 600
 *  3. Per-file face metadata via WPF `GlyphTypeface` (PowerShell +
 *     PresentationCore). For every installed file this reads the family
 *     aliases the face declares (Win32FamilyNames — "PingFang SC" and its
 *     localized "苹方-简" are the same face) plus the true OpenType weight.
 *     Source 2's display-name parse can split one face's aliases into
 *     separate entries, leaving the English name pinned at 400 while only
 *     the localized rows carried 600; metadata supplements every declared
 *     alias with the file's real weight.
 *
 * All three sets are unioned: the GDI names guarantee the picked family
 * resolves, the registry parse supplies weights from display names, and the
 * file metadata adds each face's true weight onto every alias it claims.
 * Sources 2 and 3 are complementary: a face whose file metadata cannot be
 * read keeps whatever the display-name parse produced.
 *
 * The client-side Local Font Access API is not an option here — DSH never turns
 * `queryLocalFonts` on, and the permission handler it needs lives in the
 * Electron main process, which a plugin cannot reach.
 *
 * Reading a child process's stdout is the fragile part: under a confined
 * sandbox the pipe can fail with EPERM. `listSystemFonts` therefore degrades to
 * whatever source worked, and to an empty list when none did — the client
 * shows a manual family input rather than an empty picker.
 */

import { execFile } from 'node:child_process'

import { readFontMetadata } from './font-metadata.js'

const FONT_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
  'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
]

const POWERSHELL_SCRIPT = [
  'Add-Type -AssemblyName System.Drawing',
  '$c = New-Object System.Drawing.Text.InstalledFontCollection',
  '$c.Families | ForEach-Object { $_.Name }',
].join('\n')

/**
 * Weight tokens: `[pattern, words consumed, weight]`.
 *
 * Every pattern is ANCHORED. An unanchored `/(?:semi|demi)bold/` tested against
 * the two-word candidate "UI SemiBold" matches its substring and then consumes
 * BOTH words, turning "Segoe UI SemiBold" into the family "Segoe". The word
 * count is carried explicitly for the same reason — the candidate is offered
 * as a one-word and a two-word string, and only a pattern that declares two
 * words may pop two.
 *
 * Latin and CJK names spell weight differently: a Chinese family says
 * 常规体 / 中粗体 / 细体 where a Latin one says Regular / Semibold / Light.
 * Order matters within a word count — 800 before 700, 950 before 800.
 */
const WEIGHT_TOKENS = [
  // two-word forms
  [/^(?:extra|ultra)[\s-]*black$/i, 2, 950],
  [/^(?:extra|ultra)[\s-]*bold$/i, 2, 800],
  [/^(?:semi|demi)[\s-]*bold$/i, 2, 600],
  [/^(?:extra|ultra)[\s-]*light$/i, 2, 200],
  [/^(?:semi|demi)[\s-]*light$/i, 2, 350],
  // one-word forms
  [/^(?:extrabold|ultrabold)$/i, 1, 800],
  [/^(?:extralight|ultralight)$/i, 1, 200],
  [/^(?:semibold|demibold)$/i, 1, 600],
  [/^(?:semibold|demibold|中粗体|中粗|中黑体)$/i, 1, 600],
  [/^(?:black|heavy|特黑|特粗|超粗)$/i, 1, 900],
  [/^(?:bold|bd|粗体)$/i, 1, 700],
  [/^(?:medium|med|中等体|中等)$/i, 1, 500],
  [/^(?:book|regular|normal|reg|常规体|常规|标准|标准体|正体)$/i, 1, 400],
  [/^(?:light|lt|细体|细)$/i, 1, 300],
  [/^(?:thin|hairline|极细|特细|超细)$/i, 1, 100],
]

const ITALIC = /^(?:italic|oblique|斜体|倾斜)$/i

const STYLE_SUFFIX = /\s*\((?:TrueType|OpenType|All res|VGA res|TrueType Collection)\)\s*$/i

/**
 * Legacy / symbol faces that render glyph tables rather than text. A UI font
 * picker should hide these by default — choosing one makes the whole interface
 * unreadable. They stay in the catalogue behind a flag rather than being
 * dropped, so the hide/show decision belongs to the UI and is not a silent
 * omission.
 */
const SYMBOL_FAMILY = /^(?:Wingdings(?:\s\d)?|Webdings|Symbol|Marlett|Bookshelf Symbol \d|MS Reference \w+|MS Outlook|Script|SWGDT|SWIsot\d*|SWMusic|DSISO\d*|DS\d+|OCRA|OCR\s?B|Holomdl2|Segoe MDL2 Assets|Segoe Fluent Icons|Segoe UI Symbol|Segoe UI Emoji|Segoe UI Historic|Cambria Math|ZapfDingbats|MT Extra|Reference Speciality)$/i

/**
 * A family name that cannot survive being quoted into a CSS font stack.
 * Control characters are included: a newline inside a CSS string is a parse
 * error, and the name is echoed into the plugin's own `:root, body` rule.
 */
const UNSAFE_FAMILY = /["\\;{}\u0000-\u001f\u007f]/

/** Split one display name into a family plus the weight/style it names. */
export function parseFontName(display) {
  let name = String(display).replace(STYLE_SUFFIX, '').trim()
  // "Cambria & Cambria Math" — the first variant is the family's own name.
  name = name.split('&')[0].trim()
  if (name === '') return null

  // A hyphen is a separator in names like "DSISO1-Bold"; treat it as one when a
  // weight/style word follows.
  name = name.replace(/[-–](?=[A-Za-z\u4e00-\u9fff]+$)/g, ' ')

  const words = name.split(/\s+/)
  let italic = false
  let weight = null
  let stripped = true
  while (stripped && words.length > 1) {
    stripped = false
    const last = words[words.length - 1]
    if (ITALIC.test(last)) {
      italic = true
      words.pop()
      stripped = true
      continue
    }
    const twoWord = words.length >= 2 ? `${words[words.length - 2]} ${last}` : ''
    let matched = false
    for (const [re, wordCount, value] of WEIGHT_TOKENS) {
      // A two-word pattern is only ever offered the two-word candidate, and a
      // one-word pattern only the last word — see WEIGHT_TOKENS.
      const candidate = wordCount === 2 ? twoWord : last
      if (candidate === '' || !re.test(candidate)) continue
      weight = value
      words.pop()
      if (wordCount === 2) words.pop()
      matched = true
      break
    }
    if (matched) stripped = true
  }
  const family = words.join(' ').trim()
  if (family === '') return null
  return { family, weight: weight ?? 400, italic }
}

/**
 * A child process that never finishes must not wedge the catalogue.
 *
 * `listSystemFonts` memoises its in-flight read, so a hung PowerShell (a broken
 * WPF install, a font file on a stalled network path) would leave every later
 * request awaiting the same promise forever — the picker spins on "loading" for
 * the rest of the process's life. A timeout turns that into the documented
 * degradation (that source contributes [], the other two still answer).
 */
const CHILD_TIMEOUT_MS = 20_000

/** `(file, args, options) => { ok, stdout, error }` — never rejects. */
export const execFileBuffer = (file, args, options) =>
  new Promise((resolve) => {
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      execFile(file, args, {
        windowsHide: true,
        maxBuffer: 8 << 20,
        encoding: 'buffer',
        timeout: CHILD_TIMEOUT_MS,
        ...options,
      }, (error, stdout) => {
        // A killed child (the timeout) may still have buffered a partial line;
        // discard it rather than treat a truncated read as a complete answer.
        const killed = Boolean(error) && (error.killed === true || error.code === 'ETIMEDOUT')
        if (error && (killed || !stdout)) done({ ok: false, stdout: null, error })
        else done({ ok: true, stdout, error })
      })
    } catch (error) {
      // execFile can throw synchronously (EPERM under a confined sandbox).
      done({ ok: false, stdout: null, error })
    }
  })

/** GDI-canonical family names. Returns [] on any failure. */
async function readPowerShellFamilies() {
  const { stdout } = await execFileBuffer('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    POWERSHELL_SCRIPT,
  ])
  if (stdout === null) return []
  // Decoded as UTF-8 after the fact: the child's own console encoding is the
  // OEM codepage, and a BOM is not written because the script never touches
  // [Console]::OutputEncoding (on PowerShell 5.1 setting it emits a UTF-8 BOM
  // that corrupts the first name).
  return stdout
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter(Boolean)
}

/**
 * Registry rows: `{ display }`. The registry value (the font file) is read by
 * lib/font-metadata.js inside PowerShell and never enters Node — nothing here
 * needs it, and keeping it out means a planted registry value cannot turn into
 * a path this process resolves.
 */
async function readRegistryRows() {
  const rows = []
  for (const key of FONT_KEYS) {
    const { stdout } = await execFileBuffer('reg', ['query', key])
    if (stdout === null) continue
    for (const line of stdout.toString('utf8').split(/\r?\n/)) {
      // "    Arial Bold (TrueType)    REG_SZ    arialbd.ttf"
      const m = /^\s{4}(.+?)\s{4}REG_SZ\s{4}/.exec(line)
      if (m) rows.push({ display: m[1] })
    }
  }
  return rows
}

/**
 * Merge all sources into the catalogue the settings UI renders.
 *
 * The catalogue is the WIRE shape (see lib/font-route.js): family names,
 * weights, style and provenance flags — no filesystem paths. The registry and
 * the per-file metadata both carry the file a row came from, and it is used
 * here only as provenance while merging; it is deliberately NOT copied into an
 * entry any more (nothing read it, and 480 absolute paths per response is a
 * machine-layout disclosure plus ~21 KB of dead weight).
 *
 * @param powershellFamilies - GDI-canonical names (may be empty).
 * @param registryRows - parsed registry rows (may be empty).
 * @param fontMetadata - per-file face records from GlyphTypeface (may be empty).
 * @returns families sorted for a picker, each with the weights it ships.
 */
export function mergeCatalogue(powershellFamilies, registryRows, fontMetadata = []) {
  const families = new Map()
  const byLower = new Map()

  const touch = (family) => {
    let entry = families.get(family) ?? byLower.get(family.toLowerCase())
    if (entry === undefined) {
      entry = { family, weights: new Set(), italic: false, gdi: false, localized: false }
      families.set(family, entry)
      byLower.set(family.toLowerCase(), entry)
    }
    return entry
  }

  // GDI names first: they are the ones CSS is guaranteed to resolve.
  for (const name of powershellFamilies) {
    const parsed = parseFontName(name)
    if (parsed === null) continue
    const entry = touch(parsed.family)
    entry.weights.add(parsed.weight)
    if (parsed.italic) entry.italic = true
    entry.gdi = true
  }

  // The registry adds localized names and the real per-family weight sets.
  for (const row of registryRows) {
    const parsed = parseFontName(row.display)
    if (parsed === null) continue
    const entry = touch(parsed.family)
    entry.weights.add(parsed.weight)
    if (parsed.italic) entry.italic = true
    entry.localized = true
  }

  // Per-file metadata: every weight lands on every alias the face declares.
  for (const record of fontMetadata) {
    if (record === null || typeof record !== 'object' || !Array.isArray(record.families)) continue
    const weight = Number(record.weight)
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) continue
    for (const name of record.families) {
      if (typeof name !== 'string' || name.trim() === '') continue
      const known = byLower.has(name.trim().toLowerCase())
      const entry = touch(name.trim())
      entry.weights.add(weight)
      if (record.italic === true) entry.italic = true
      if (!known) entry.localized = true
    }
  }

  return [...families.values()]
    .filter((e) => !UNSAFE_FAMILY.test(e.family))
    .map((e) => ({
      family: e.family,
      weights: [...e.weights].sort((a, b) => a - b),
      italic: e.italic,
      symbol: SYMBOL_FAMILY.test(e.family),
      /** True when the name came from the GDI collection, i.e. resolves in CSS. */
      gdi: e.gdi,
      /** True when the registry named this family, i.e. it is a localized name. */
      localized: e.localized,
    }))
    .sort((a, b) => {
      // Symbol faces last, then GDI-canonical names, then by name.
      if (a.symbol !== b.symbol) return a.symbol ? 1 : -1
      if (a.gdi !== b.gdi) return a.gdi ? -1 : 1
      return a.family.localeCompare(b.family, 'zh-Hans-CN')
    })
}

let cache = null
let inflight = null

/** Enumerate once per process; `force` re-reads after a font install. */
export function listSystemFonts(force = false) {
  if (process.platform !== 'win32') {
    return Promise.resolve({ platform: process.platform, supported: false, families: [], sources: [] })
  }
  if (!force && cache !== null) return Promise.resolve(cache)
  if (inflight === null) {
    inflight = (async () => {
      const [powershellFamilies, registryRows, fontMetadata] = await Promise.all([
        readPowerShellFamilies(),
        readRegistryRows(),
        readFontMetadata(execFileBuffer),
      ])
      const families = mergeCatalogue(powershellFamilies, registryRows, fontMetadata)
      const sources = []
      if (powershellFamilies.length > 0) sources.push(`powershell:${powershellFamilies.length}`)
      if (registryRows.length > 0) sources.push(`registry:${registryRows.length}`)
      if (fontMetadata.length > 0) sources.push(`font-metadata:${fontMetadata.length}`)
      return {
        platform: process.platform,
        supported: true,
        sources,
        count: families.length,
        families,
      }
    })().finally(() => {
      inflight = null
    })
  }
  return inflight.then((result) => {
    cache = result
    return result
  })
}
