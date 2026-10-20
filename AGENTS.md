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

## The package name appears in four places, and all four must agree

Renaming a plugin is the most dangerous edit in this repository, because it silently breaks the *whole application*, not just the plugin. It has already happened twice. Before merging any change to `package.json.name`, verify all four:

| # | Where | What breaks if it disagrees |
|---|---|---|
| 1 | `package.json` `name` | the source of truth for the other three |
| 2 | `cordis.patch.yml` → `insert[].name` | the Loader cannot resolve the row to a package, the row never activates, and the plugin **silently disappears** — no error anywhere. Confirmed by `cordis_inspect_query` showing the row at `status: "inactive"` while everything else looked correct |
| 3 | the client bundle's `__ModuleLoader__.load({ id })` | the host keys each client-module graph row by package name. A mismatched id never satisfies its row, so the loader retries through the one-resource URL, runs the bundle a **second** time, and dies with `client-modules: duplicate factory registration for "<id>"`. That failure takes down **web boot**: the desktop shows "The application could not start or stopped unexpectedly" and the app is unusable |
| 4 | the profile's dependency key and `bundles` entry | pnpm cannot install, or the bundle is not composed |

**The build script must read `name` from `package.json`, never hardcode it.** All three plugins do this now. A hardcoded literal is invisible to the manifest and turns case 3 into a landmine that goes off on the next rename.

**The trap, measured:** case 3 fails in a way that looks like a stale cache — the *local* artifact can be correct while the *running* app still registers the old id, because the browser already fetched the module graph at boot. Always restart the application after changing a bundle; a page refresh is not enough.

`test/manifest.test.mjs` pins cases 1–3 in every plugin and fails on any mismatch. It does **not** cover the profile, which is per-machine state.

**This rule has a delivery half.** Any change to a plugin's shipped files is not finished until the published package matches. See "Shipping" below.

## Shipping: publishing is part of the change

`<package>.client/client.js`, `lib/`, `cordis.patch.yml` and `package.json` are all inside the published tarball. So **a fix is not delivered until it is republished** — a local `link:` install hides this, because the profile reads the working tree directly and never sees npm.

- Publish shape: bump `version` in the affected plugin (npm ignores a reused version), `npm publish`, then verify with `npm view <name> dist-tags` and by unpacking the tarball (`npm pack <name>@<version>` → inspect the file that was fixed).
- Only the plugins whose shipped files changed need a republish. Say which ones in the commit message.
- The registry is `https://registry.npmjs.org` via `publishConfig`; the machine's default `~/.npmrc` points at a **read-only mirror** that cannot accept a publish.
- Publishing needs an account token with `bypass 2fa`. The last error that blocked this was `E403 ... granular access token with bypass 2fa enabled is required`.
- A publish is asynchronous ("being processed"). Verify the version actually appears; a `+ name@version` line from `npm publish` means *accepted*, not *live*.

### A publish that never lands is not "still scanning"

`dsh-cds-theme` burned two rounds of waiting on this. The lesson, in order:

**`+ name@version` and "Your package is being processed" prove nothing.** They are printed when the upload is *accepted by the client*, before the registry commits anything. Only these two checks prove delivery:

```sh
npm view <name> versions --registry=https://registry.npmjs.org   # the version appears in the list
curl -sI https://registry.npmjs.org/<name>/-/<name>-<version>.tgz  # 200, not 404
```

**`Cannot publish over previously staged version "<v>"` (E409) means the version is in npm's staging area, and there is no way to remove it.** `npm stage` is not a command in npm 11 (`Unknown command: "stage"`), and the registry exposes no endpoint for it. This is a known npm defect with an open upstream issue describing our exact situation — the version is absent from the packument, absent from the staged list, and the author can neither approve nor reject it ([npm/cli#9889](https://github.com/npm/cli/issues/9889)). It is **not** the malware scan finishing late, and waiting does not clear it.

**A bumped version is the only recovery, and a failure on the first bump proves nothing.** Measured here on 2026-10-20:

- `0.1.2` wedged, E409 on every republish, tarball 404, absent from the packument.
- `0.1.3` … also returned E409, which briefly looked like the block was on the *package*.
- `0.1.4` … published and went live within minutes (`latest=0.1.4`, tarball 200).

So the block is **per version**, and each new version gets one attempt: a fresh version number either publishes or wedges. `0.1.3` appears to have collided with a second wedged submission of its own rather than inheriting `0.1.2`'s lock. Do not conclude "the package is poisoned" from a single failed bump — check the tarball URL of the newest attempt before deciding.

**What the failures did rule out, which is worth not re-testing:**

- our tarball — the same files published fine as `0.1.1` and `0.1.4`, and `npm install dsh-cds-theme@0.1.1` still works;
- auth — a direct `PUT` with the same token answers `400` (bad body), not `403`;
- size — the 3.9 MB tarball published as `0.1.4`; the "big package, slow scan" theory was wrong both times.

**So the practical rule for this repository:** never let a release depend on one publish landing. Ship the code in the repository first (it is the source of truth and `link:` installs read it directly), publish second, and treat the npm badge as a convenience that may lag. If a version wedges, bump once more; if that also fails, wait rather than burning version numbers in a loop.

**Log every wedged version in the table below** so a later reader does not repeat the diagnosis:

| Package | Wedged version | First seen | Outcome |
|---|---|---|---|
| `dsh-cds-theme` | `0.1.2` | 2026-10-20 | E409 on republish; absent from packument; tarball 404; `npm stage` unavailable. Never recovered. |
| `dsh-cds-theme` | `0.1.3` | 2026-10-20 | E409 on republish; tarball 404. Never recovered. |
| `dsh-cds-theme` | `0.1.4` | 2026-10-20 | **Published**, live in ~2 min, tarball 200. `latest`. |

## Plugin-specific notes

- `plugins/system-fonts`: font-weight overrides derive from host tokens with this plugin's stylesheet disabled; repeated rebuilds must not compound the shift. `tools/integration.mjs` checks profile wiring without launching the desktop UI, and `test/cordis.test.mjs` uses the installed app's Cordis when available — a skipped suite is not desktop-startup verification.
- `plugins/cds-theme`: the palette lives in `client/src/palette.js` and every value traces to `docs/cds-spec.md`; changing a value means changing the citation comment with it. Contrast is asserted in `test/tokens.test.mjs` for both palettes and every accent preset.
