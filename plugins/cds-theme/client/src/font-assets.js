/**
 * The six Anthropic variable woff2 faces plus the two shifted CJK faces,
 * inlined as `data:font/woff2` strings.
 *
 * This file is the ONLY place that imports the binary faces, and it is
 * reached through `require()` from `fonts.js` so a plain Node ESM test run
 * (which cannot import `.woff2`) simply fails the require and uses the
 * URL-based fallback instead. The browser artifact has no such limit: the
 * build's `dataurl` loader rewrites each import into a data URL and bundles
 * this module into `client/client.js`.
 *
 * Keep the keys equal to `file` in `fonts.js`'s `FONT_FACES` / `CJK_FACES`.
 *
 * THE CJK FACES ARE SUBSETS, and that is a deliberate size decision:
 *   NotoSansSC-Shifted-VF.woff2    1.72 MB — 7000 common ideographs, VARIABLE,
 *                                            `avar` shifts the axis so Chinese
 *                                            matches Anthropic Sans's weight.
 *   NotoSerifSC-Shifted-330.woff2  1.22 MB — the same coverage, STATIC at the
 *                                            one design weight the greeting uses.
 * A full CJK face is 5.37 / 7.70 MB; inlined, the pair would cost ~17.5 MB of
 * committed bundle instead of ~3.9 MB. See the long note in `fonts.js`.
 */
import sansRoman from '../../fonts/AnthropicSans-Roman-Web.woff2'
import sansItalic from '../../fonts/AnthropicSans-Italic-Web.woff2'
import serifRoman from '../../fonts/AnthropicSerif-Roman-Web.woff2'
import serifItalic from '../../fonts/AnthropicSerif-Italic-Web.woff2'
import monoRoman from '../../fonts/AnthropicMono-Roman-Web.woff2'
import monoItalic from '../../fonts/AnthropicMono-Italic-Web.woff2'
import cjkSans from '../../fonts/NotoSansSC-Shifted-VF.woff2'
import cjkSerif from '../../fonts/NotoSerifSC-Shifted-330.woff2'

export default {
  'AnthropicSans-Roman-Web.woff2': sansRoman,
  'AnthropicSans-Italic-Web.woff2': sansItalic,
  'AnthropicSerif-Roman-Web.woff2': serifRoman,
  'AnthropicSerif-Italic-Web.woff2': serifItalic,
  'AnthropicMono-Roman-Web.woff2': monoRoman,
  'AnthropicMono-Italic-Web.woff2': monoItalic,
  'NotoSansSC-Shifted-VF.woff2': cjkSans,
  'NotoSerifSC-Shifted-330.woff2': cjkSerif,
}
