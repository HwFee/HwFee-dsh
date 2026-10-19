# Project conventions

This repository is a **collection** of DeepSeek Harness plugins. Each plugin is an independent package under `plugins/<name>/` with its own manifest, bundle patch, build script and tests. A plugin can be installed, upgraded and disabled on its own.

## Layout

- `plugins/<name>/client/src/` — browser sources (ESM).
- `plugins/<name>/client/client.js` — the **committed build artifact**. Ship it: a profile installed with `link:` points at the source directory and does not run a build at application startup.
- `plugins/<name>/lib/index.js` — the Host half.
- `plugins/<name>/test/` — `node:test` suites; run `npm test` inside the plugin directory.
- `docs/` — the reference documents the implementation is written against. They are evidence, not summaries: `cds-spec.md` carries file:line citations for every token value and an adjudication table for every source conflict; `host-hooks.md` records which host selectors are stable and which are salted hashes.

## Plugin rules

- Edit browser code in `client/src/`, then `npm run build`. `npm test` starts with a freshness check (`build-client.mjs --check`) and fails on a stale artifact — never hand-edit `client/client.js`.
- `dsh.client.inject` contains **package IDs**; the client module's `inject` export contains **Cordis service names**. Read optional services only through `ctx.get(...)` inside `apply`, and degrade gracefully when one is absent.
- Every theme token passed to `ctx.theme.overrideTokens` must be a `{ light, dark }` pair; a bare string throws inside the theme service. `assertPairs` checks this at the call site.
- Do not target salted CSS-Modules classes (`.RlGAzG_card`, `._markdown_1ypvv_5`). Use `data-*` hooks, literal classes the host exposes on purpose (`.md-code-block`), or the host's own intermediate variables (`--dsl-code-block-*`). Where no stable hook exists, go through tokens or leave the component alone.
- `--dsw-elevation-*` is declared on `body, body *`, so an inline token write on `body` cannot override it. It must come from a stylesheet rule with `!important`.
- Keep application profile files and task storage unchanged during plugin tests.

## Plugin-specific notes

- `plugins/system-fonts`: font-weight overrides derive from host tokens with this plugin's stylesheet disabled; repeated rebuilds must not compound the shift. `tools/integration.mjs` checks profile wiring without launching the desktop UI, and `test/cordis.test.mjs` uses the installed app's Cordis when available — a skipped suite is not desktop-startup verification.
- `plugins/cds-theme`: the palette lives in `client/src/palette.js` and every value traces to `docs/cds-spec.md`; changing a value means changing the citation comment with it. Contrast is asserted in `test/tokens.test.mjs` for both palettes and every accent preset.
