/**
 * Build the shipped CJK fallback faces from the installed Source Han fonts.
 *
 * WHY THIS IS A TOOL AND NOT A ONE-OFF SCRIPT. The two files in `fonts/` encode
 * a measured design decision — the `avar` breakpoints that make Chinese render
 * at the same optical weight as the Latin text beside it. If those files ever
 * need regenerating, the mapping must be reproduced exactly, so the numbers and
 * the reasoning live here rather than in a chat log.
 *
 * WHAT IT PRODUCES
 *   NotoSansSC-Shifted-VF.woff2     variable, 7000 ideographs, `avar`-shifted
 *   NotoSerifSC-Shifted-330.woff2   static at design 404, same coverage
 *
 * THE PROBLEM THE SHIFT SOLVES
 *   Source Han is ~17% LIGHTER than Anthropic Sans at the same nominal weight
 *   (measured stems, same em: Anthropic 400 = 0.0943, Source Han 400 = 0.0758).
 *   Font fallback is per-character, but `font-weight` is ONE property for the
 *   whole run, so the CJK face cannot ask for a different number than the Latin
 *   one. `avar` exists for exactly this: it remaps user-space weight onto
 *   design-space weight before interpolation. `font-weight: 400` then draws the
 *   design weight whose stem matches Anthropic Sans at 400.
 *
 * WHY THESE BREAKPOINTS AND NOT THE OUTLINE-MEASURED ONES
 *   The first build used design coordinates measured from the font OUTLINES.
 *   Chrome's own interpolation and rasterisation landed them 0.8-6.3% light.
 *   The shipped breakpoints are fitted against what the BROWSER draws, measured
 *   by rendering a weight sweep and reading the stems back off the screenshot.
 *
 *   Residual error after calibration, browser-measured:
 *       CSS 330 +0.0%   CSS 460 -0.7%   CSS 580 +0.1%
 *       CSS 360 -0.3%   CSS 500 +0.4%   CSS 660 -2.8%
 *       CSS 400 -0.2%   CSS 550 +0.5%
 *   The 660 row cannot close: the theme's bold stem (0.1485 em) is wider than
 *   Noto reaches at its 900 axis maximum (0.1433 em). It is left a hair light
 *   rather than falsifying the mapping.
 *
 * REQUIREMENTS
 *   Python 3 with `fonttools[brotli]`, and the Source Han/Noto SC faces
 *   installed. On Windows those are NotoSansSC-VF.ttf / NotoSerifSC-VF.ttf in
 *   C:\Windows\Fonts; pass --sans / --serif to point elsewhere.
 *
 *   python tools/build-cjk-fonts.py
 */

import argparse
import os
import sys
import time

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._a_v_a_r import table__a_v_a_r
from fontTools.varLib.instancer import instantiateVariableFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "fonts")

# Calibrated against browser-rendered stems, not outline coordinates.
# key = the CSS weight a reader must request; value = the design coordinate that
# produces the stem width Anthropic Sans has at that CSS weight.
SANS_LADDER = {
    340: 404, 380: 441, 430: 490, 480: 567,
    520: 622, 560: 705, 590: 754, 690: 850,
}

# The serif appears only in the hero greeting, only at CSS 330.
SERIF_DESIGN_WEIGHT = 404

# 7000 ideographs keeps the pair near 3 MB; a full face is 5.4 / 7.7 MB.
COVERAGE = 7000

ASCII = list(range(0x0020, 0x007F))
PUNCT = [
    0x3000, 0x3001, 0x3002, 0xFF0C, 0xFF1A, 0xFF1B, 0xFF01, 0xFF1F,
    0xFF08, 0xFF09, 0x300C, 0x300D, 0x2018, 0x2019, 0x201C, 0x201D,
    0x2014, 0x2026, 0x00B7, 0xFF5E, 0x3010, 0x3011, 0x300A, 0x300B,
    0xFF05, 0xFFE5, 0x00A5, 0xFF5B, 0xFF5D, 0x3014, 0x3015,
    0x3008, 0x3009, 0x300E, 0x300F, 0xFF02, 0xFF03, 0xFF04, 0xFF06,
    0xFF0A, 0xFF0B, 0xFF0D, 0xFF0F, 0xFF1C, 0xFF1D, 0xFF1E, 0xFF20,
    0xFF3B, 0xFF3D, 0xFF3E, 0xFF40, 0xFF5C, 0x00B0, 0x2032, 0x2033,
    0x00D7, 0x00F7, 0x00B1, 0x2260, 0x2264, 0x2265, 0x221E, 0x2211,
    0xFF0E, 0x3005, 0x3006, 0x303C, 0x309B, 0x309C, 0xFF61, 0xFF63,
]


def build_avar(font, mapping, tag="wght"):
    """Write an `avar` table mapping user-space weight onto design-space weight.

    The normalised coordinate for a value v is the OpenType default:
        v >= default:  (v - default) / (max - default)
        v <  default:  (v - default) / (default - min)
    """
    axis = next(a for a in font["fvar"].axes if a.axisTag == tag)
    lo_v, def_v, hi_v = axis.minValue, axis.defaultValue, axis.maxValue

    def norm(v):
        return (v - def_v) / (hi_v - def_v) if v >= def_v else (v - def_v) / (def_v - lo_v)

    pairs = {0.0: 0.0, 1.0: 1.0}
    for user_w, design_w in sorted(mapping.items()):
        pairs[round(norm(user_w), 6)] = round(norm(design_w), 6)

    avar = table__a_v_a_r("avar")
    for a in font["fvar"].axes:
        avar.segments[a.axisTag] = dict(pairs) if a.axisTag == tag else {0.0: 0.0, 1.0: 1.0}
    font["avar"] = avar


def save(font, name, chars):
    opts = Options()
    opts.flavor = "woff2"
    opts.drop_tables += ["DSIG"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.layout_features = []
    opts.glyph_names = False
    opts.notdef_outline = True
    subsetter = Subsetter(options=opts)
    subsetter.populate(unicodes=sorted(set(chars)))
    subsetter.subset(font)
    font.flavor = "woff2"
    out = os.path.join(FONTS, name)
    font.save(out)
    font.close()
    return out, os.path.getsize(out)


def ideographs(path, limit):
    font = TTFont(path, fontNumber=0)
    cmap = font.getBestCmap()
    ordered = sorted(c for c in cmap if 0x4E00 <= c <= 0x9FFF)
    font.close()
    if len(ordered) < limit:
        raise SystemExit("%s has only %d ideographs, need %d" % (path, len(ordered), limit))
    return ordered[:limit]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sans", default=r"C:\Windows\Fonts\NotoSansSC-VF.ttf")
    parser.add_argument("--serif", default=r"C:\Windows\Fonts\NotoSerifSC-VF.ttf")
    parser.add_argument("--coverage", type=int, default=COVERAGE)
    args = parser.parse_args()

    for path in (args.sans, args.serif):
        if not os.path.exists(path):
            raise SystemExit("missing source font: " + path)

    cjk = ideographs(args.sans, args.coverage)
    print("coverage: %d ideographs" % len(cjk))

    start = time.time()
    sans = TTFont(args.sans, fontNumber=0)
    build_avar(sans, SANS_LADDER)
    out, size = save(sans, "NotoSansSC-Shifted-VF.woff2",
                     ASCII + PUNCT + cjk)
    print("  %s  %.3f MB  (%.0fs)" % (os.path.basename(out), size / 1048576, time.time() - start))

    start = time.time()
    serif = TTFont(args.serif, fontNumber=0)
    serif = instantiateVariableFont(serif, {"wght": SERIF_DESIGN_WEIGHT},
                                    inplace=True, updateFontNames=False, optimize=True)
    out, size = save(serif, "NotoSerifSC-Shifted-330.woff2", PUNCT + cjk)
    print("  %s  %.3f MB  (%.0fs)" % (os.path.basename(out), size / 1048576, time.time() - start))

    print()
    print("Now rebuild the client bundle: npm run build")


if __name__ == "__main__":
    sys.exit(main())
