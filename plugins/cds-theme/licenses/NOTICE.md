# Third-party notices — bundled fonts

`dsh-cds-theme` inlines exactly two font faces into `client/client.js` as
`data:font/woff2;base64,…` strings. Both are subset from Noto CJK faces; the sans
also carries a custom `avar` axis remap. Every string quoted below was read out
of the shipped `.woff2` files' own `name` table, not copied from a catalogue page.

## What ships

| File in this repository | Family (name ID 1) | Version (name ID 5) | Size |
|---|---|---|---|
| `fonts/NotoSansSC-Shifted-VF.woff2` | `Noto Sans SC` | `Version 2.04;241114210130;non-release` | 1,804,444 B |
| `fonts/NotoSerifSC-Shifted-330.woff2` | `Noto Serif SC` | `Version 2.02;241114204558;non-release` | 1,280,632 B |

Both are inlined into `client/client.js` as base64. Their `.woff2` sources stay
in `fonts/` because the build imports them; they are not packed as loose files.

## Copyright notices (name ID 0, verbatim)

Noto Sans SC:

> © 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.

Noto Serif SC:

> © 2017-2023 Adobe (http://www.adobe.com/).

## Trademark statements (name ID 7, verbatim)

Noto Sans SC:

> Source is a trademark of Adobe in the United States and/or other countries.

Noto Serif SC:

> Noto is a trademark of Google Inc.

## Contributors (name ID 9 and 10, verbatim)

Noto Sans SC, ID 9:

> Ryoko NISHIZUKA 西塚涼子 (kana, bopomofo & ideographs); Paul D. Hunt (Latin,
> Greek & Cyrillic); Sandoll Communications 산돌커뮤니케이션, Soo-young JANG
> 장수영 & Joo-yeon KANG 강주연 (hangul elements, letters & syllables)

Noto Sans SC, ID 10:

> Dr. Ken Lunde (project architect, glyph set definition & overall production);
> Masataka HATTORI 服部正貴 (production & ideograph elements)

Noto Serif SC, ID 9:

> Ryoko NISHIZUKA 西塚涼子 (kana & ideographs); Frank Grießhammer (Latin, Greek &
> Cyrillic); Wenlong ZHANG 张文龙 (bopomofo); Sandoll Communications
> 산돌커뮤니케이션, Soohyun PARK 박수현, Yejin WE 위예진 & Donghoon HAN 한동훈
> (hangul elements, letters & syllables)

Noto Serif SC, ID 10:

> Dr. Ken Lunde (project architect, glyph set definition & overall production);
> Masataka HATTORI 服部正貴 (production & ideograph elements); Zachary Quinn
> Scheuren (variable font & overall production)

Manufacturer (name ID 8) is `Adobe` on both faces. Vendor URLs (name ID 11):
`http://www.adobe.com/type/` on both; the serif also carries
`https://fonts.google.com/noto`.

## Licence

Both faces carry this statement in their own `name` table (ID 13, verbatim):

> This Font Software is licensed under the SIL Open Font License, Version 1.1.
> This Font Software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
> CONDITIONS OF ANY KIND, either express or implied. See the SIL Open Font
> License for the specific language, permissions and limitations governing your
> use of this Font Software.

Name ID 14 on both: `http://scripts.sil.org/OFL`.

The full licence text ships alongside this notice as
[`OFL-1.1.txt`](OFL-1.1.txt). It is the `LICENSE` file published with Noto CJK
(`raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE`,
sha256 `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`,
byte-identical to the `Serif/LICENSE` file). OFL condition 2 requires the
copyright notice and the licence to travel with every copy — that is what this
directory is for.

## What this project changed (relevant to OFL condition 3)

Each shipped file is a **Modified Version** in the OFL sense. Measured from the
files themselves:

| | Sans | Serif |
|---|---|---|
| Format | WOFF2 | WOFF2 |
| `fvar` axes | 1 — `wght` min 100 / default 100 / max 900 | **absent** (static instance) |
| `avar` | present (axis remap) | **absent** |
| `OS/2` usWeightClass | 100 | 404 |
| Codepoints | 7,167 — 7,000 CJK URO ideographs, 95 ASCII, CJK/full-width punctuation | 7,072 — 7,000 CJK URO ideographs, CJK/full-width punctuation, **no ASCII** |

1. **Subset.** Coverage is reduced to the counts above. Glyph outlines of the
   retained glyphs are unchanged.
2. **Sans keeps its variable axis, with an `avar` remap added.** The user-space
   `wght` coordinate is remapped onto the design coordinate whose stem width
   matches Anthropic Sans at the same nominal CSS weight — e.g. CSS `400` maps
   to design `490`. `fvar` and the 100–900 range are otherwise untouched.
3. **Serif is a static instance** at design weight 404, which is what CSS weight
   330 resolves to after the same stem-width calibration. It has no `fvar` and
   no `avar`; the greeting is its only consumer and only uses that one weight.
4. **Format conversion** to WOFF2.

The Reserved Font Name in the Sans copyright line is **`Source`** — not `Noto`.
The shipped family names stay `Noto Sans SC` / `Noto Serif SC`, which is also
what the build's `@font-face` rules declare, and no shipped file is renamed to a
`Source`-derived name. If a future rebuild renames the families, condition 3
applies to `Source` and this notice must be revisited.

## Not covered by this notice

`plugins/cds-theme/fonts/Anthropic{Sans,Serif,Mono}-{Roman,Italic}-Web.woff2`
are commercial faces kept in the working tree for local calibration. They are
not inlined into the bundle, not listed in `files`, and this project holds no
redistribution grant for them. Nothing here grants any right to those files.
