**English** | [简体中文](README-zh.md)

# HwFee-dsh

Three independent plugins for **DeepSeek Harness (DSH)**: a Claude Design System theme, a system font picker, and a blank-session usage dashboard.

Each plugin ships its own manifest, pre-built client bundle, and test suite. Install one or all three—they never touch each other's tokens or slots, and turning any of them off restores the host cleanly.

## Quick Install (Published on npm)

Run in your terminal, or paste the package name into **Settings → Plugins → Add Plugin** inside DSH:

```bash
# 1. Theme (palette, typography, corner radius, elevation, component polish)
dsh plugin --profile desktop add dsh-cds-theme

# 2. System Fonts (UI / code / terminal font pickers + line-height & tracking)
dsh plugin --profile desktop add dsh-system-fonts

# 3. Usage Stats (blank-session token & activity card + heatmap)
dsh plugin --profile desktop add @hwfee/dsh-usage-stats
```

**Fully quit and restart DSH after installing or removing a plugin.** Plugins are wired during profile startup and do not hot-load into a running window.

To uninstall:

```bash
dsh plugin --profile desktop remove dsh-cds-theme
dsh plugin --profile desktop remove dsh-system-fonts
dsh plugin --profile desktop remove @hwfee/dsh-usage-stats
```

> If a regional mirror (such as npmmirror) hasn't synced the latest tarball yet and reports `Unexpected end of TAR archive`, pull straight from the official registry:
> ```bash
> dsh plugin --profile desktop add @hwfee/dsh-usage-stats --config.registry=https://registry.npmjs.org
> ```

---

## Screenshots

| Chat & Tool Calls | Code Block & Diff |
| :---: | :---: |
| ![Chat View](assets/screenshot-chat.png) | ![Code View](assets/screenshot-code.png) |

| Theme Settings Page | Blank Session (Serif Greeting + Usage Card) |
| :---: | :---: |
| ![Theme Settings](assets/screenshot-settings.png) | ![Chinese Home](assets/screenshot-zh.png) |

<details>
<summary>English UI preview (all settings and labels follow the host language)</summary>

![English Home](assets/screenshot-en.png)

</details>

---

## What Each Plugin Does

### 1. `dsh-cds-theme` (v0.1.1) — Theme & Component Overhaul

Built from [Caho1/open-claude-ui](https://github.com/Caho1/open-claude-ui) (MIT, a clean-room reconstruction of Anthropic's Claude Design System), adapted where DSH's own layout needed different calls.

- **316 design tokens via `overrideTokens`**: DSH writes active theme tokens inline onto `<body>`, so plain CSS rules cannot override them. The plugin registers a token layer for both light and dark modes: warm-grey surfaces, clay accent (`#d97757` / `#c6613f`), `hsla(0,0%,8%,α)` hairline borders, two-layer diffuse shadows, and three-layer focus rings.
- **8 bundled fonts inlined as `data:font/woff2`**: 6 official Anthropic variable fonts (Sans / Serif / Mono × Roman / Italic) plus 2 subsetted Source Han Sans/Serif files with `avar` stem-weight calibration so Chinese glyphs match Latin stroke weights across all 8 weight steps.
- **Component polish**: Serif display greeting on blank sessions (38px / wght 330); framed Markdown tables with tinted headers and tabular numerals; `#0d0d0c` warm-black code blocks; soft breathing shimmer on the thinking label.
- **Standalone "Theme" settings page**: Sits in the settings sidebar right next to General. Includes Light / Dark / System mode, 4 accents (Clay, Ochre, Sand, Graphite), surface warmth, corner radius scale, shadow intensity, component refinement toggle, original-blue thinking label toggle, automatic `@` file reference for long pastes (>2,000 chars or >30 lines), and CJK font priority.
- **Blank-session click ripple (WIP, toggleable)**: Reconstructs the short-lived Claude Code desktop home backdrop (faint code punctuation + radial light waves on click). Still rough around the edges—turn it off anytime at the bottom of the Theme page.

See [`plugins/cds-theme/README.md`](plugins/cds-theme/README.md) for the full technical breakdown.

### 2. `dsh-system-fonts` (v0.1.0) — Local Font Pickers & Spacing

Changes font families, line-height, and letter-spacing—nothing else. It never emits `font-weight`, leaving the theme's weight hierarchy intact.

- **Three font slots**: Replaces DSH's plain-text font inputs (Content / Code / Terminal) inside **Settings → General → Font size (expanded)** with searchable dropdowns, while keeping the host's own size steppers.
- **Windows font discovery**: Merges GDI `InstalledFontCollection`, Registry `Fonts` keys, and per-file OpenType metadata so English and localized CJK family names resolve together.
- **Live sliders**: Line-height (`50%–100%`) and letter-spacing (`−0.30em` to `+0.30em`), applied immediately.

See [`plugins/system-fonts/README.md`](plugins/system-fonts/README.md).

### 3. `@hwfee/dsh-usage-stats` (v0.1.1) — Local Session Usage Card

Adds a usage panel below the blank-session greeting, aggregated locally from `~/.dsh/sessions/*.zstd` with zero network uploads.

- **Six counters & per-model breakdown**: Sessions, messages, total tokens, active days, peak hour, and top model, plus a Models tab with token shares. Switch between All Time, 30 Days, and 7 Days.
- **Activity heatmap & book comparison**: Rolling 7-row grid anchored with Today at the bottom-right, paired with a randomized comparison against classic books.
- **Persistent disk cache**: Session logs are concatenated multi-frame zstd files. The first cold scan takes ~2s; subsequent startups read from `~/.dsh/cache/usage-stats/` in ~20ms. Panel height (`240–520px`) and number units (`K/M/B` vs `万/亿`) live on the Theme settings page.

See [`plugins/usage-stats/README.md`](plugins/usage-stats/README.md).

---

## Other Ways to Install (Market / Release Tarballs / Source)

DSH has three plugin entry points, and they do not accept the same input:

| Where | What to enter |
|---|---|
| **CLI**: `dsh plugin --profile desktop add <spec>` | npm package name, `.tgz` URL, or `link:<dir>` |
| **GUI: Settings → Plugins → Add Plugin** | Same `<spec>` as CLI |
| **GUI: Plugins → Discover** (requires Custom Plugin Market enabled) | Market `index.json` URL only |

**Option A: Custom Plugin Market**

Enable "Custom Plugin Market" in DSH settings and add:

```text
https://raw.githubusercontent.com/HwFee/HwFee-dsh/master/market/index.json
```

**Option B: GitHub Release Tarballs**

Paste any of these URLs into **Add Plugin** or `dsh plugin add`:

- `https://github.com/HwFee/HwFee-dsh/releases/download/v0.1.1/dsh-cds-theme-0.1.1.tgz`
- `https://github.com/HwFee/HwFee-dsh/releases/download/v0.1.0/dsh-system-fonts-0.1.0.tgz`
- `https://github.com/HwFee/HwFee-dsh/releases/download/v0.1.1/hwfee-dsh-usage-stats-0.1.1.tgz`

> Do not use `git+https://github.com/HwFee/HwFee-dsh.git#...&path:/plugins/...`—pnpm's git resolver installs the repo root and ignores subdirectory parameters.

**Option C: Local Source Checkout**

Pre-built `client/client.js` bundles are committed to git, so a fresh clone can be linked immediately:

```bash
git clone https://github.com/HwFee/HwFee-dsh.git
cd HwFee-dsh/plugins/cds-theme
npm ci && npm run build
dsh plugin --profile desktop add link:.
```

---

## Repository Layout & Tests

All three plugins ship with **667 tests** in total (`cds-theme` 398, `system-fonts` 156, `usage-stats` 113) plus a repo-wide static audit:

```bash
# Run build freshness check + unit tests inside any plugin
cd plugins/cds-theme
npm test

# Run repo-wide bundle budget, DOM safety, observer/effect lifecycle & token-pair checks
node tools/audit.mjs
```

```text
HwFee-dsh/
├── plugins/
│   ├── cds-theme/        # CDS theme plugin (398 tests)
│   ├── system-fonts/     # System font picker plugin (156 tests)
│   └── usage-stats/      # Session usage dashboard plugin (113 tests)
├── market/               # Custom market index.json & publishing scripts
├── docs/                 # Spec citations (cds-spec.md) & host DOM/CSS survey (host-hooks.md)
├── assets/               # Preview screenshots
└── tools/audit.mjs       # Repo-level static audit
```

> `skills/dsh-plugin-guide/` is a bundled third-party developer reference (Apache-2.0) containing archived DeepSeek docs; none of the plugins depend on it at runtime.
