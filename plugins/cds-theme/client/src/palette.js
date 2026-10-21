/**
 * The CDS palette, as consumed by this theme.
 *
 * PROVENANCE. Every value traces to `docs/cds-spec.md`, which was extracted
 * line-by-line from `.reference/open-claude-ui`. The spec resolves eighteen
 * places where `AGENTS.md` (intent) and `code-examples/cds-theme.css` (the
 * shipped stylesheet) disagree, and in nearly every case rules for the
 * stylesheet. The rulings this file depends on:
 *
 *   C1  Surfaces come from the stylesheet, NOT from AGENTS.md. The stylesheet's
 *       ladder runs light: #f9f9f7 → #fcfcfb → #ffffff → #ffffff, dark:
 *       #0b0b0b → #151515 → #1a1a19 → #20201f → popover #2c2c2a. AGENTS.md's
 *       warm ladder (#fcfcfb … #efeee9) is an earlier "parchment" palette whose
 *       values are not on the 35-step ramp at all, and its direction is
 *       inverted. Do not reintroduce it.
 *   C3  Text is NEUTRAL grey (#151515 / #525252 / #8a8a8a), not warm grey.
 *       Neutral body text is the documented decision that keeps syntax
 *       highlighting from muddying into the surface.
 *   C4  Borders are `hsla(0, 0%, 8%, α)` — not `rgba(0, 0, 0, α)`. The 8%
 *       lightness base deliberately softens the composite by about two hex
 *       steps. Do not "simplify" it back to black.
 *   C5  Clay is a two-track system: `--brand` #c6613f for solid brand fills,
 *       `--cds-clay` #d97757 for accents, rings and breathing lights. In dark
 *       mode clay hover BRIGHTENS (#e08264).
 *   C9  The focus ring is the three-layer clay shadow from the stylesheet, not
 *       AGENTS.md's two-stop recipe (which has no solid core and vanishes on a
 *       clay background).
 *   C18 Code blocks are #0d0d0c — the one place a near-black is allowed, and
 *       the `0c` is what keeps the black warm.
 *
 * The one place this file deliberately departs from the spec is the dark
 * canvas. See DARK_SURFACES.canvas for the reasoning.
 */

// ---------------------------------------------------------------- surfaces

/**
 * Light surfaces. `cds` is the design-system value; `host` is the host's own
 * bluish grey at the same luminance, so `warmth: 0` reproduces the stock UI
 * exactly and the slider has an honest zero point.
 *
 * Direction law: in light mode the sidebar (surface-0) is the DARKEST step and
 * cards/composer (surface-2/3) are pure white — higher layers read as closer
 * to the viewer.
 */
export const LIGHT_SURFACES = {
  // surface-0: sidebar column and the base canvas.
  sidebar: { cds: '#f9f9f7', host: '#f9fafb' },
  // surface-1: the main conversation canvas.
  canvas: { cds: '#fcfcfb', host: '#ffffff' },
  // surface-2 / surface-3: message cards, composer shell, high layers.
  raised: { cds: '#ffffff', host: '#ffffff' },
  // A recessed surface for inline code, code banners and nested rows. CDS has
  // no light step below surface-0, so this is surface-0 minus a hair.
  nested: { cds: '#f7f7f5', host: '#f5f5f5' },
  // Ghost hover wash. CDS uses a 5% ink alpha rather than a solid fill so it
  // composites identically over every surface in the ladder.
  hover: { cds: 'hsla(0, 0%, 8%, 0.05)', host: 'rgba(38, 49, 72, 0.06)' },
  active: { cds: 'hsla(0, 0%, 8%, 0.10)', host: 'rgba(38, 49, 72, 0.10)' },
  // The platform module chip behind composer tool-row buttons.
  module: { cds: '#f9f9f7', host: '#f9fafb' },
}

/**
 * Dark surfaces.
 *
 * The ladder follows the spec: surface-0 (the sidebar) at `#0b0b0b`, surface-1
 * (the conversation canvas) at `#151515`, then the 2-unit OLED run
 * `#1a1a19 → #20201f → #2c2c2a`. An earlier build raised the floor to `#151515`
 * (sidebar `#121211`) to soften the near-black workspace; the user chose
 * fidelity instead, so the floor is back. Only the floor moved — the spacing
 * between layers never did. The `host` column still lets `warmth: 0` fall back
 * to the stock bluish ladder for comparison.
 */
export const DARK_SURFACES = {
  sidebar: { cds: '#0b0b0b', host: '#1b1b1c' },
  canvas: { cds: '#151515', host: '#151517' },
  raised: { cds: '#1a1a19', host: '#232324' },
  nested: { cds: '#20201f', host: '#2c2c2e' },
  hover: { cds: 'hsla(0, 0%, 100%, 0.05)', host: 'rgba(255, 255, 255, 0.08)' },
  active: { cds: 'hsla(0, 0%, 100%, 0.09)', host: 'rgba(255, 255, 255, 0.12)' },
  module: { cds: '#20201f', host: '#353638' },
}

// -------------------------------------------------------------------- text

/**
 * Neutral text tiers (`css:139-141`, `css:348-350`).
 *
 * CDS defines THREE tiers. The host has four (`primary`, `secondary`,
 * `tertiary`, `caption`), so the fourth borrows: `caption` introduces no new
 * colour, it reuses the tertiary value.
 *
 * An earlier version gave caption a lighter grey (#a5a5a5 light, #5c5c5c dark)
 * to express "quieter than tertiary". That inverted the ladder — the caption
 * tier measured 2.40:1 on the canvas, under the 3.0 floor for large text — and
 * `--dsw-alias-label-caption` is exactly what the composer placeholder and the
 * code-block banner use. Borrowing tertiary leaves the hierarchy honest instead
 * of inventing a fourth step the system does not have.
 *
 * The 3.0 floor was the wrong bar, though. The composer placeholder and the
 * settings descriptions are body-size text, which needs 4.5:1, and they sit on
 * the INPUT surface (#ffffff light / #1a1a19 dark), not the canvas. Measured
 * there the CDS value #8a8a8a is 3.45:1 and the dark #7d7b76 is 4.12:1. So the
 * two tertiary values are darkened (light) and lifted (dark) just far enough to
 * clear AA on the brightest surface they appear on — a deliberate departure
 * from the spec's #8a8a8a / #666666 muted tier, kept as small as possible:
 *
 *   light  #8a8a8a -> #767676   3.45:1 -> 4.54:1 on #ffffff
 *   dark   #7d7b76 -> #85837e   4.12:1 -> 4.60:1 on #1a1a19
 *
 * Recorded as D2 in `docs/cds-spec.md` §9.3; the measured reasoning is in §2.2.
 */
export const LIGHT_TEXT = {
  primary: '#151515',
  secondary: '#525252',
  tertiary: '#767676',
  caption: '#767676',
  onBrand: '#ffffff',
}

export const DARK_TEXT = {
  primary: '#f5f5f5',
  secondary: '#a3a3a3',
  tertiary: '#85837e',
  caption: '#85837e',
  onBrand: '#ffffff',
}

// ------------------------------------------------------------------ borders

/**
 * The alpha ladder (`css:97-105`, `css:302-319`). `hsla(0, 0%, 8%, α)` is
 * #141414 at that alpha — deliberately not pure black, so a hairline over a
 * white surface lands on #e8e8e8 rather than a dirty #e6e6e6.
 */
export const LIGHT_BORDERS = {
  l1: 'hsla(0, 0%, 8%, 0.06)',
  l2: 'hsla(0, 0%, 8%, 0.10)',
  l3: 'hsla(0, 0%, 8%, 0.20)',
  l4: 'hsla(0, 0%, 8%, 0.35)',
}

export const DARK_BORDERS = {
  l1: 'hsla(0, 0%, 100%, 0.06)',
  l2: 'hsla(0, 0%, 100%, 0.09)',
  l3: 'hsla(0, 0%, 100%, 0.18)',
  l4: 'hsla(0, 0%, 100%, 0.30)',
}

// -------------------------------------------------------------------- clay

/**
 * The two-track brand system (C5).
 *
 * `brand` is the solid-fill brand colour; `clay` is the accent. They are not
 * interchangeable: #c6613f is deeper and calmer for large fills, #d97757 is
 * brighter and warmer for small accents, rings and glows.
 *
 * `clayHover` brightens in dark mode — the opposite of the light-mode
 * direction. Getting this backwards is the most common CDS port mistake.
 */
export const CLAY = {
  light: {
    brand: '#c6613f',
    clay: '#d97757',
    clayHover: '#cc5a36',
    clayLight: '#fbf3ef',
    // The solid-fill rung that carries white text.
    //
    // `--brand` #c6613f measures 4.05:1 against white, which fails WCAG AA for
    // the 14px label a primary button actually renders. The design system's own
    // clay-700 (#b2563a, AGENTS.md) measures 4.90:1, so the *fill* uses that
    // rung while `--brand` stays the documented value for non-text use. Same
    // hue family, one rung deeper — visually indistinguishable as a button,
    // legible as text.
    fill: '#b2563a',
    fillHover: '#9e4a31',
    // A clay-tinted text colour, darker than the accent so links and the
    // accent label keep their contrast against a white canvas.
    text: '#b2563a',
    // 12% / 20% clay over the canvas: selected rows, chips, tag fills.
    subtle: 'hsla(16, 62%, 60%, 0.12)',
    subtleStrong: 'hsla(16, 62%, 60%, 0.20)',
  },
  dark: {
    brand: '#c6613f',
    clay: '#d97757',
    clayHover: '#e08264',
    clayLight: 'hsla(16, 62%, 60%, 0.15)',
    // On a dark canvas the fill also needs to clear 4.5:1 against white text
    // (4.90:1) while still separating from #151515 (3.73:1, above the 3:1
    // non-text threshold).
    fill: '#b2563a',
    fillHover: '#c6613f',
    // Lighter than the accent, because a dark canvas needs the opposite
    // direction for text to stay legible.
    text: '#e8967a',
    subtle: 'hsla(16, 62%, 60%, 0.16)',
    subtleStrong: 'hsla(16, 62%, 60%, 0.26)',
  },
}

/**
 * Accent presets. Clay is the CDS default; the other three stay inside the
 * system's rule set — warm, desaturated, never neon, never a cold gradient.
 */
export const ACCENT_PRESETS = [
  { id: 'clay', label: '陶土橙 Clay', light: '#d97757', dark: '#d97757', brandLight: '#c6613f', brandDark: '#c6613f', fillLight: '#b2563a', fillDark: '#b2563a' },
  { id: 'ochre', label: '赭石 Ochre', light: '#c5713f', dark: '#d98a5c', brandLight: '#b5622f', brandDark: '#c5713f', fillLight: '#a05a2e', fillDark: '#a05a2e' },
  { id: 'sand', label: '砂金 Sand', light: '#b8894f', dark: '#d0a05e', brandLight: '#a87a42', brandDark: '#b8894f', fillLight: '#8a6535', fillDark: '#8a6535' },
  { id: 'graphite', label: '石墨 Graphite', light: '#52514e', dark: '#b4b2ac', brandLight: '#383835', brandDark: '#52514e', fillLight: '#383835', fillDark: '#3c3c3a' },
]

// -------------------------------------------------------------- state hues

/**
 * Semantic states. CDS keeps them recognisable but warm-shifted: a leaf green
 * rather than a signal green, a clay-red rather than an alarm red.
 *
 * `success` and `error` are NOT only icon/dot colours. The host paints diff
 * rows with `color: state-success-primary` / `error-primary` over a wash of the
 * same hue (`code-diff-added` / `-deleted`), so they are body text over a tinted
 * fill and must clear 4.5:1 against that composite, including inside a tool
 * card's nested fill, which is the worst case. Two values were below that and
 * are the reason for the specific numbers here:
 *
 *   light success  #2f9e44 -> #1f7a34   2.89:1 -> 4.53:1 (added lines)
 *   dark  error    #f25a5a -> #f56e6e   4.28:1 -> 4.92:1 (deleted lines)
 */
export const LIGHT_STATE = {
  success: '#1f7a34',
  successSubtle: 'rgba(47, 158, 68, 0.10)',
  successSecondary: '#37b24d',
  warn: '#e8590c',
  warnSubtle: 'rgba(232, 89, 12, 0.10)',
  warnSecondary: '#f76707',
  error: '#ba2723',
  errorSubtle: 'rgba(186, 39, 35, 0.08)',
  errorSecondary: '#d6342f',
  idle: '#c3c2b7',
}

export const DARK_STATE = {
  success: '#4ed17e',
  successSubtle: 'rgba(78, 209, 126, 0.12)',
  successSecondary: '#69db7c',
  warn: '#f7ad31',
  warnSubtle: 'rgba(247, 173, 49, 0.12)',
  warnSecondary: '#ffa94d',
  error: '#f56e6e',
  errorSubtle: 'rgba(242, 90, 90, 0.12)',
  errorSecondary: '#fa423e',
  idle: '#52514e',
}

// ------------------------------------------------------------------ radii

/**
 * Host token → CDS component radius (`docs/cds-spec.md` §3.2, which forbids
 * swapping these: each radius belongs to a component class).
 *
 *   xs     4px  kbd caps, checkboxes, inline badges      -> --radius-sm   4px
 *   sm     8px  standard buttons, menu rows, fields      -> --radius-lg   8px
 *   md    12px  attachment tiles, sub-panels             -> panel-radius  10px
 *   lg    16px  code blocks, large buttons               -> --radius-xl  12px
 *   xl    20px  user message bubbles, dialogs            -> bubble       18px
 *   panel 28px  the composer terminal                    -> composer     20px
 *
 * The last two are the moves that make the UI read as CDS at a glance: a
 * 28px composer shell becomes a 20px one, and a 20px bubble becomes 18px.
 */
export const RADII = {
  xs: 4,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 18,
  panel: 20,
}

// ----------------------------------------------------------------- shadows

/**
 * Elevation, in CDS's two-part language: a tight ambient-occlusion layer plus
 * a wide diffusion layer (`docs/cds-spec.md` §4.3 — single-layer hard shadows
 * are forbidden).
 *
 * `panel`/`prominent`/`soft` are the host's `--dsw-elevation-*` tokens, which
 * are declared on `body, body *` rather than `body`, so they cannot travel
 * through the inline token layer and are emitted by the stylesheet instead.
 * Each keeps `var(--dsw-elevation-stroke-color)` so a component that rebinds
 * the stroke colour still gets a matching hairline.
 */
export const SHADOWS = {
  light: {
    lv1: '0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 2px 8px 0 rgba(0, 0, 0, 0.08)',
    lv2: '0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 6px 16px 0 rgba(0, 0, 0, 0.08)',
    lv3: '0 4px 8px 0 rgba(0, 0, 0, 0.06), 0 12px 28px -2px rgba(0, 0, 0, 0.08)',
    panel: '0 0 0 1px var(--dsw-elevation-stroke-color), 0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 2px 8px 0 rgba(0, 0, 0, 0.08)',
    prominent: '0 0 0 1px var(--dsw-elevation-stroke-color), 0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 6px 16px 0 rgba(0, 0, 0, 0.08)',
    // The composer's own tier: a wider, softer diffusion plus a hairline drawn
    // INSIDE the shell, which is what lets it sit on the canvas without a
    // layout-consuming border.
    soft: 'inset 0 0 0 1px var(--dsw-elevation-stroke-color), 0 4px 20px 0 rgba(0, 0, 0, 0.035)',
  },
  dark: {
    lv1: '0 1px 2px 0 rgba(0, 0, 0, 0.40), 0 2px 8px 0 rgba(0, 0, 0, 0.40)',
    lv2: '0 2px 4px 0 rgba(0, 0, 0, 0.40), 0 6px 16px 0 rgba(0, 0, 0, 0.40)',
    lv3: '0 4px 8px 0 rgba(0, 0, 0, 0.50), 0 16px 36px -2px rgba(0, 0, 0, 0.40)',
    panel: '0 0 0 1px var(--dsw-elevation-stroke-color), 0 1px 2px 0 rgba(0, 0, 0, 0.40), 0 2px 8px 0 rgba(0, 0, 0, 0.40)',
    prominent: '0 0 0 1px var(--dsw-elevation-stroke-color), 0 2px 4px 0 rgba(0, 0, 0, 0.40), 0 6px 16px 0 rgba(0, 0, 0, 0.40)',
    soft: 'inset 0 0 0 1px var(--dsw-elevation-stroke-color), 0 4px 20px 0 rgba(0, 0, 0, 0.40)',
  },
}

// -------------------------------------------------------------------- code

/**
 * Code block surfaces and syntax colours, taken from the installed Claude
 * desktop app (2.42304.2), not from the reconstruction:
 * `app/resources/ion-dist/` → `js/c5d464fa3-Dlv8sG-j.js` defines the live
 * `claude-light` / `claude-dark` Shiki themes; the values below are that
 * module's palette (`x` for light, `C` for dark) with the same role mapping.
 *
 * The light block is WHITE on the warm chat canvas; the dark block is
 * `#1a1a19`, not the `#0d0d0c` the reference repository hard-codes. The theme
 * remaps the host's Shiki variables on `.md-code-block` so the syntax palette
 * is Claude's, while the surrounding chrome stays CDS.
 */
export const CODE_SURFACE = {
  light: '#ffffff',
  dark: '#1a1a19',
}

/**
 * Inline-code chip, measured from the installed Claude app and its own
 * stylesheet (`--cds-alpha-1` fill, alpha-3/.5px edge, 4px radius in the chat
 * markdown rule).
 *
 * THE LETTERS ARE RED, not body ink. Claude's prose rule is
 *
 *   code:not(pre code){ color:var(--cds-prose-code-color,
 *                            var(--cds-text-danger,currentColor)); … }
 *
 * and `--cds-text-danger` resolves to `--cds-role-danger-600` = red-600
 * `#8e2626` in light, `--cds-role-danger-300` = red-300 `#ec7e7e` in dark
 * (`app/resources/ion-dist/css/c6a992d55-*.css`). The same rule tints the
 * `.ReactMarkdown code` and TipTap editor variants, so it is the system's
 * chip ink rather than one surface's accident.
 *
 * Cross-checked against a screenshot of the real app: every chip in the
 * transcript measures exactly `rgb(142, 38, 38)` = `#8e2626` while the body
 * ink is `#0b0b0b` (--cds-gray-900). An earlier revision of this theme left
 * `color` unset, so the chip inherited body ink and read as black — visibly
 * wrong next to the app.
 *
 * Link/button-nested code is the one variant Claude paints differently
 * (`--code-chip-ink: --cds-text-accent`, transparent fill); this theme keeps
 * the chip treatment there because the host's markdown rarely nests them and
 * a second rule buys nothing the user can see.
 */
export const INLINE_CODE = {
  light: { background: '#f0f0ef', border: 'hsla(0, 0%, 8%, 0.10)', ink: '#8e2626' },
  dark: { background: '#262625', border: 'hsla(0, 0%, 100%, 0.10)', ink: '#ec7e7e' },
}

export const CODE_BORDER = {
  light: '#e4e4e3',
  dark: '#141414',
}

/** The app has no header strip (copy is a floating control); the host does. */
export const CODE_BANNER = {
  light: '#ffffff',
  dark: '#1a1a19',
}

/**
 * Role → `--shiki-token-*`. The host renders token colours as
 * `var(--shiki-token-*)`, so overriding these on the block is what makes the
 * syntax palette Claude's. `type` is deliberately absent: the host's
 * css-variables theme folds `entity.name.type` into `token-function`, so there
 * is no separate variable for it.
 */
export const CODE_TOKENS = {
  // EXACTLY THE APP'S SHIKI THEME, not an approximation. `claude-chat-light` /
  // `claude-chat-dark` are generated by a factory whose 18 TextMate rules only
  // reference 12 palette slots; these are those slots, transcribed. Two rules
  // that look wrong at first glance are faithful here:
  //   - `keyword.operator` (`=`, `+`, `&&`) uses the DEFAULT fg, not the keyword
  //     colour, so operators are never purple;
  //   - `entity.name.type` / `support.class` resolve to the `variable` slot, so a
  //     type name has no colour of its own.
  light: {
    foreground: 'hsl(220, 20%, 10%)',
    comment: 'hsl(220, 10%, 48%)',
    punctuation: 'hsl(220, 15%, 20%)',
    keyword: 'hsl(280, 100%, 38%)',
    string: 'hsl(120, 100%, 25%)',
    regex: 'hsl(120, 90%, 27%)',
    number: 'hsl(180, 100%, 25%)',
    property: 'hsl(355, 90%, 38%)',
    attrName: 'hsl(355, 85%, 40%)',
    function: 'hsl(215, 100%, 38%)',
    variable: 'hsl(25, 100%, 35%)',
    parameter: 'hsl(25, 95%, 37%)',
  },
  dark: {
    foreground: 'hsl(220, 15%, 93%)',
    comment: 'hsl(220, 10%, 55%)',
    punctuation: 'hsl(220, 15%, 85%)',
    keyword: 'hsl(280, 85%, 72%)',
    string: 'hsl(95, 75%, 65%)',
    regex: 'hsl(95, 70%, 63%)',
    number: 'hsl(180, 80%, 65%)',
    property: 'hsl(355, 85%, 72%)',
    attrName: 'hsl(355, 80%, 70%)',
    function: 'hsl(210, 100%, 72%)',
    variable: 'hsl(30, 95%, 68%)',
    parameter: 'hsl(30, 90%, 67%)',
  },
}

/** The three motion curves plus the two interaction easings (docs/cds-spec.md §6). */
export const EASING = {
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  swift: 'cubic-bezier(0.16, 1, 0.3, 1)',
  enter: 'cubic-bezier(0.22, 1, 0.36, 1)',
  out: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
  snap: 'cubic-bezier(0.32, 0.72, 0, 1)',
  pulse: 'cubic-bezier(0.4, 0, 0.2, 1)',
}
export const DURATIONS = {
  fast: '0.12s',
  base: '0.2s',
  slow: '0.3s',
}

/** CDS's five duration rungs (`docs/cds-spec.md` §6.3). */
export const CDS_DURATIONS = {
  fast: '60ms',
  snap: '120ms',
  base: '200ms',
  sheet: '300ms',
  slow: '450ms',
}
