/**
 * Font licence registry — the repository's ONE source of truth for which font
 * bytes may be redistributed, identified by CONTENT rather than by path.
 *
 * WHY THIS FILE EXISTS. `plugins/cds-theme/fonts/` used to hold all eight woff2
 * faces as tracked files. Six of them are real anthropic.com web faces and this
 * project holds no redistribution grant for them: keeping them in a public
 * repository is itself distribution. They are now LOCAL-ONLY developer working
 * copies — untracked, gitignored, never packed — while the two Noto (SIL OFL)
 * faces stay tracked because they are what actually ships.
 *
 * THE PROBLEM THIS SOLVES. Every licence gate used to find a restricted face by
 * READING ITS BYTES out of `fonts/`. A fresh clone does not have those bytes, so
 * the gates degraded: the build saw no file and skipped the check, `audit.mjs`
 * `continue`d past it, and the release gate could only say "unidentified bytes".
 * A gate that needs a file the repository must not contain is not a gate.
 *
 * So a face is identified by two STATIC fingerprints, computed once from the
 * trusted local copies:
 *
 *   sha256          whole-file digest — the release gate matches a packed
 *                   payload to a face by this, so a commercial face is NAMED
 *                   even when the local file is absent;
 *   prefix96        the first 96 bytes as base64 — exactly what an inlined
 *                   `data:font/woff2;base64,…` URL starts with, so the build and
 *                   the artifact tests can search a bundle for a face without
 *                   holding the face.
 *
 * WHAT IS AND IS NOT HERE. A byte length, a SHA-256, and a 96-byte prefix. No
 * complete font, nothing reconstructable: 96 of 66 056 bytes is a header.
 *
 * WHO READS IT — all of them, so the list cannot drift between gates:
 *   - `plugins/cds-theme/tools/build-client.mjs`  (refuses to build an artifact
 *      that carries a restricted face) — works with or without local files;
 *   - `plugins/cds-theme/test/fonts.test.mjs`, `plugins/cds-theme/test/host.test.mjs`;
 *   - `tools/audit.mjs` (repository-wide check);
 *   - `market/check-release-assets.mjs` (release gate).
 *
 * STALENESS IS CHECKED, NOT ASSUMED. `verifyFingerprints()` recomputes every
 * fingerprint from the local copies; `tools/audit.mjs` calls it on every run and
 * FAILS on drift. `absent` is the normal state on a fresh clone for the six
 * commercial faces (they are not tracked) — and an absent file must NEVER be
 * treated as "nothing to check": the static fingerprint is still the one the
 * gates search for, so the check keeps working with no local bytes at all.
 *
 * WHY THE TWO NOTO FACES ARE IN THE SAME TABLE. They are the same question asked
 * the other way round: the release gate must be able to say "this packed payload
 * is NotoSansSC-Shifted-VF.woff2, open licence, allowed" and not merely "unknown,
 * therefore suspect". `kind: 'open'` is that answer, and it stays tied to the
 * real bytes by the same sha256.
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * Every face this repository knows by heart.
 *
 * `kind` is the licence verdict, and it is the only field the gates branch on:
 *   commercial  no redistribution grant — local() only, bytes must never ship
 *   open        SIL OFL — may be inlined and packed
 *
 * Keep `plugin` + `file` equal to the on-disk path under `plugins/`; that is how
 * `--verify` finds the local copy to compare against.
 */
export const FONT_FINGERPRINTS = [
  { file: 'AnthropicSans-Roman-Web.woff2', plugin: 'cds-theme', kind: 'commercial', bytes: 118340,
    sha256: '1b75c8ee81a05fa77331366e9602b82072bb5223593c928a6488dfe6fd023f1b',
    prefix96: 'd09GMgABAAAAAc5EABAAAAAE3EwAAc3bAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGptkG+lQHJweBmA/U1RBVII6AI9qL4FgCoKhXIHwSAuLFAAwjv0iATYCJAOWJAQg' },
  { file: 'AnthropicSans-Italic-Web.woff2', plugin: 'cds-theme', kind: 'commercial', bytes: 129868,
    sha256: 'ffcf21c4e9a729cbf4710401760434bb1d10bc7db244540e4af796d182c6817d',
    prefix96: 'd09GMgABAAAAAftMABAAAAAFDSAAAfrlAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGp9EG+hcHJZeBmA/U1RBVII2AI8gL4FgCoKdeIHsJguKGAAwj+tGATYCJAOULAQg' },
  { file: 'AnthropicSerif-Roman-Web.woff2', plugin: 'cds-theme', kind: 'commercial', bytes: 175356,
    sha256: 'e96fe97bb7ba2190a9a227d27380e0c79894408bfc6acea5a511774d93a16f69',
    prefix96: 'd09GMgABAAAAAqz8ABAAAAAHy2wAAqyVAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGqBKG4GJTByfWAZgP1NUQVSCOgCPRC+BYAqDt1SC7QYLi1gAMJmXbgE2AiQDlywE' },
  { file: 'AnthropicSerif-Italic-Web.woff2', plugin: 'cds-theme', kind: 'commercial', bytes: 166724,
    sha256: '7f61e32b5941ad6e5699aeb3e03390a43e5f04f3bff6a5853bed08c802596f83',
    prefix96: 'd09GMgABAAAAAotEABAAAAAHD5AAAoraAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGpwMG4GEUByYVAZgP1NUQVSCNgCOCC+BYAqDiwSCyigLihgAMJbpJgE2AiQDlCwE' },
  { file: 'AnthropicMono-Roman-Web.woff2', plugin: 'cds-theme', kind: 'commercial', bytes: 66056,
    sha256: '49b8b95c950b0bee7ecdf68cda9dd6908e980283c50dc570c401de1e683a22e5',
    prefix96: 'd09GMgABAAAAAQIIABAAAAACScgAAQGiAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGoNyG5t0HI04BmA/U1RBVIEKAJE6L2AKgp9ggegRC4p4ADCF5igBNgIkA4p6BCAF' },
  { file: 'AnthropicMono-Italic-Web.woff2', plugin: 'cds-theme', kind: 'commercial', bytes: 70384,
    sha256: '58bc928b953cea2666c578222a0a7c4fba4b3eb1b07c840a38be00aaba325f85',
    prefix96: 'd09GMgABAAAAARLwABAAAAACb6gAARKIAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGoRCG50iHI04BmA/U1RBVIEGAJE6L2AKgqcAge8nC4p4ADCGpyIBNgIkA4p6BCAF' },
  { file: 'NotoSansSC-Shifted-VF.woff2', plugin: 'cds-theme', kind: 'open', bytes: 1804444,
    sha256: '3816f1e46f60d81fccc68fa8b23bc57c0f860fbf8c6ffe27a0e46a6a4dbac6a2',
    prefix96: 'd09GMgABAAAAG4icABUAAAA2DiwAG4gmAAIKPQAAAAAAAAAAAAAAAAAAAAAAAAAAGYIKGyAcQj9IVkFS8DAGYD9TVEFUgTYnMgCHKi9qEQgK/IMY4NZCMNbSBAE2AiQD' },
  { file: 'NotoSerifSC-Shifted-330.woff2', plugin: 'cds-theme', kind: 'open', bytes: 1280632,
    sha256: '412585bcdef664c613471d9a7622ca6d052bd1bd787e0ceed5d2c4b2e38cb32e',
    prefix96: 'd09GMgABAAAAE4p4ABEAAAAtI5gAE4oPAAIFHwAAAAAAAAAAAAAAAAAAAAAAAAAAGYIKGyAcQgZgP1NUQVQcAIZYEQgKga/+HIGJil0BNgIkA4HcMguB3QgABCAFklQH' },
]

/** The faces whose bytes must never leave this machine. */
export const RESTRICTED_FACE_FILES = FONT_FINGERPRINTS
  .filter((face) => face.kind === 'commercial')
  .map((face) => face.file)

/** One entry by file name, or undefined. */
export function fingerprintFor(file) {
  return FONT_FINGERPRINTS.find((face) => face.file === file)
}

/**
 * The `data:` URL prefix of a face, from the static fingerprint.
 *
 * This is what makes the licence gates work on a fresh clone: the build and the
 * artifact tests search a bundle for these characters, and they need no local
 * copy to do it. Returns null for a file the registry does not know.
 */
export function dataUrlPrefix(file) {
  const face = fingerprintFor(file)
  if (face === undefined) return null
  return 'data:font/woff2;base64,' + face.prefix96
}

/**
 * Every needle a restricted face can be found by: the committed fingerprint AND
 * whatever the local copy actually contains.
 *
 * WHY BOTH. The committed fingerprint is what makes the check work on a machine
 * that does not have the file (a fresh clone, CI). The locally computed one
 * catches the case the static table cannot see on its own: a local file whose
 * bytes differ from the registry. Neither replaces the other, so this returns
 * the union and the caller reports which needle matched — the two cases need
 * different fixes ("you inlined it" vs "your local copy is not the face this
 * table describes").
 *
 * A local file that differs is NOT silently trusted: `drifted` entries must be
 * failed by the caller (see `verifyFingerprints`), never used to widen the pass
 * condition.
 */
export function restrictedNeedles(root) {
  const needles = []
  for (const face of FONT_FINGERPRINTS) {
    if (face.kind !== 'commercial') continue
    const prefix = 'data:font/woff2;base64,' + face.prefix96
    needles.push({ file: face.file, prefix, source: 'registry' })
    let bytes
    try {
      bytes = readFileSync(localPathFor(face, root))
    } catch {
      continue
    }
    const local = 'data:font/woff2;base64,' + bytes.subarray(0, 96).toString('base64')
    if (local !== prefix) needles.push({ file: face.file, prefix: local, source: 'local' })
  }
  return needles
}

/** The restricted faces found in `text`, by either needle, with the source. */
export function restrictedHitsIn(text, root) {
  return restrictedNeedles(root).filter((needle) => text.includes(needle.prefix))
}

/** Where a face lives when the machine has a local copy. */
export function localPathFor(face, root) {
  return join(root || REPO_ROOT, 'plugins', face.plugin, 'fonts', face.file)
}

/** sha256 of a buffer, lowercase hex — one definition for every caller. */
export function sha256Of(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Compare the committed fingerprints with whatever local copies exist.
 *
 * `absent` is not a failure: those six files are deliberately untracked, so a
 * fresh clone has none of them. `drifted` is: the bytes on this machine are not
 * the bytes the registry describes, which would let a swapped face pass every
 * gate under the old name. Callers MUST fail on drift and must not fall back to
 * "unknown, therefore let it through" — a gate that degrades is not a gate.
 */
export function verifyFingerprints(root) {
  const checked = []
  const drifted = []
  const absent = []
  for (const face of FONT_FINGERPRINTS) {
    const path = localPathFor(face, root)
    let bytes
    try {
      bytes = readFileSync(path)
    } catch {
      absent.push(face.file)
      continue
    }
    const actual = sha256Of(bytes)
    if (actual !== face.sha256) {
      drifted.push({ file: face.file, expected: face.sha256, actual, path })
      continue
    }
    checked.push(face.file)
  }
  return { checked, drifted, absent }
}
