/**
 * The font faces this package is PERMITTED TO REDISTRIBUTE, inlined as
 * `data:font/woff2` strings.
 *
 * WHAT SHIPS, AND WHAT DOES NOT. Exactly two faces are inlined, both built from
 * Noto Sans SC / Noto Serif SC, which are SIL Open Font License and therefore
 * redistributable:
 *
 *   NotoSansSC-Shifted-VF.woff2    1.72 MB — the shifted variable CJK sans
 *   NotoSerifSC-Shifted-330.woff2  1.22 MB — the static serif at the greeting's
 *                                            one design weight
 *
 * THE SIX ANTHROPIC FACES ARE DELIBERATELY ABSENT. `Anthropic{Sans,Serif,Mono}-
 * {Roman,Italic}-Web.woff2` are real anthropic.com web faces, and this project
 * holds no redistribution grant for them. They are NOT in the repository at all:
 * they are untracked, gitignored local working copies on the developer's own
 * machine, and a fresh clone does not contain them. Nothing in the published
 * bundle may carry their bytes either, because base64 in `client/client.js` IS
 * redistribution.
 *
 * WHY THE FIX IS "STOP INLINING", NOT "REMOVE THE FACES". The @font-face blocks
 * for those six families are still emitted (`fonts.js`), with a `local()` src.
 * So a reader who already has Anthropic's fonts installed keeps the exact
 * replica, while a fresh install resolves to the system stack behind it
 * (`--font-sans-fallbacks`, `ui-monospace`, …). Nobody's local fonts are touched,
 * no user setting changes, and the family NAMES the reference CSS uses are
 * unchanged — only the bytes we ship change.
 *
 * Every shipped face is declared in `fonts.js` with `redistributable: true`;
 * that flag is what selects the entries below, and `test/fonts.test.mjs` fails if
 * a face lacking it is inlined. The artifact check searches for each restricted
 * face's committed fingerprint in `tools/font-licences.mjs` — a 96-byte prefix
 * and a sha256, no binaries — so it still catches a re-introduction through a
 * different import path or a changed loader, on a machine that has none of the
 * six files.
 *
 * Keep the keys equal to `file` in `fonts.js`'s `CJK_FACES`.
 */
import cjkSans from '../../fonts/NotoSansSC-Shifted-VF.woff2'
import cjkSerif from '../../fonts/NotoSerifSC-Shifted-330.woff2'

export default {
  'NotoSansSC-Shifted-VF.woff2': cjkSans,
  'NotoSerifSC-Shifted-330.woff2': cjkSerif,
}
