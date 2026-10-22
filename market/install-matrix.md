# Install matrix · 2026-10-22

Run after the 2026-10-22 publish. Each case creates a throwaway profile, installs,
checks the package arrived as a profile **layer** (`cordis.patch.yml` present *and*
the name in `dsh.profile.bundles`), then deletes the profile. A plain dependency
entry is not enough — that is the silent half-install where pnpm succeeds and
nothing mounts.

**Why this report was run by hand rather than only through
`market/test-install-paths.ps1`.** That script passes no registry to pnpm, so every
install goes to the machine's default `~/.npmrc` — `registry.npmmirror.com`. The
mirror had not picked up this release, which had two effects, both measured below:
some packages installed the **previous** version and reported a green layer, and
packages the mirror had never seen failed outright. A matrix that reports the old
version as a pass is the failure mode this repository keeps recording. So the
formal cases here pass the registry explicitly and pin the version, and the mirror
result is kept as its own row set with the version it actually installed.

**All test profiles used `--profile <throwaway>` with `DSH_PROFILE_DIR` and
`DSH_PROFILE` cleared, so no case could read or write the user's `desktop` profile.
Every profile created here was deleted; `~/.dsh/profiles` contains only `desktop`
after the run.**

## Versions tested

| Package | Target | npm `latest` (official) | Mirror `latest` |
|---|---|---|---|
| `dsh-cds-theme` | **0.1.7** | 0.1.5 — see note | 0.1.5 |
| `dsh-system-fonts` | **0.1.3** | 0.1.3 | 0.1.2 |
| `@hwfee/dsh-git-bash` | **0.1.1** | 0.1.1 | not present |
| `@hwfee/dsh-usage-stats` | **0.1.3** | 0.1.3 | 0.1.2 |
| `@hwfee/dsh-predict` | **0.1.1** | 0.1.1 | not present |
| `@hwfee/dsh-genui` | **0.1.1** | 0.1.1 | not present |

**`dsh-cds-theme` npm note.** 0.1.6 was published and never appeared on the
registry; 0.1.7 was then published as the same content under a new version. **At
the time of this run neither 0.1.6 nor 0.1.7 had appeared on npm** (`npm view`
still answered 0.1.5, both tarballs 404). The package was therefore verified
through its Release asset, and that is stated in the rows rather than being
counted as an npm pass.

## Results

Formal cases: pinned version + `--config.registry=https://registry.npmjs.org`.

### Release tarball URL — every package, at the target version

| Case | Package | Installed | Layer | Verdict |
|---|---|---|---|---|
| `release-url` | `@hwfee/dsh-predict` | 0.1.1 | yes | PASS |
| `release-url` | `dsh-system-fonts` | 0.1.3 | yes | PASS |
| `release-url` | `@hwfee/dsh-usage-stats` | 0.1.3 | yes | PASS |
| `release-url` | `@hwfee/dsh-git-bash` | 0.1.1 | yes | PASS |
| `release-url` | `@hwfee/dsh-genui` | 0.1.1 | yes | PASS |
| `release-url` | `dsh-cds-theme` | 0.1.7 | yes | PASS |

### npm name + pinned version, official registry — five packages on npm

| Case | Package | Spec | Installed | Layer | Verdict |
|---|---|---|---|---|---|
| `npm-pinned` | `@hwfee/dsh-predict` | `@hwfee/dsh-predict@0.1.1` | 0.1.1 | yes | PASS |
| `npm-pinned` | `dsh-system-fonts` | `dsh-system-fonts@0.1.3` | 0.1.3 | yes | PASS |
| `npm-pinned` | `@hwfee/dsh-usage-stats` | `@hwfee/dsh-usage-stats@0.1.3` | 0.1.3 | yes | PASS |
| `npm-pinned` | `@hwfee/dsh-git-bash` | `@hwfee/dsh-git-bash@0.1.1` | 0.1.1 | yes | PASS |
| `npm-pinned` | `@hwfee/dsh-genui` | `@hwfee/dsh-genui@0.1.1` | 0.1.1 | yes | PASS |
| `npm-pinned` | `dsh-cds-theme` | `dsh-cds-theme@0.1.7` | — | — | **NOT RUN**: 0.1.7 not on npm during this run; covered by `release-url` above |

### Local tarball — every package

| Case | Package | Installed | Layer | Verdict |
|---|---|---|---|---|
| `local-tarball` | `@hwfee/dsh-predict` | 0.1.1 | yes | PASS |
| `local-tarball` | `dsh-system-fonts` | 0.1.3 | yes | PASS |
| `local-tarball` | `@hwfee/dsh-usage-stats` | 0.1.3 | yes | PASS |
| `local-tarball` | `@hwfee/dsh-git-bash` | 0.1.1 | yes | PASS |
| `local-tarball` | `@hwfee/dsh-genui` | 0.1.1 | yes | PASS |
| `local-tarball` | `dsh-cds-theme` | 0.1.7 | yes | PASS |

### Cross cases

| Case | Package | What was checked | Result |
|---|---|---|---|
| `remove-clean` | `dsh-system-fonts` | add → remove → directory gone, dependency gone, bundle entry gone | PASS |
| `reinstall` | `dsh-system-fonts` | add again after remove → still 0.1.3 | PASS |
| `double-install` | `dsh-system-fonts` | add twice → 1 dependency entry, 1 bundle entry, still 0.1.3 | PASS |
| `link-path` | `@hwfee/dsh-genui` | `link:` → patch present, in bundles | PASS |
| `git-subdir` | `dsh-system-fonts` | `git+…&path:/plugins/system-fonts` | **FAIL as expected**: `ERR_PNPM_MISSING_PACKAGE_NAME` — pnpm installs the repository root and ignores `&path:` |

### Mirror path (default `~/.npmrc`, what a CN user actually hits)

Recorded because it is the real path for many users, and recorded with the version
it actually produced. **None of these is a pass for the target version.**

| Case | Package | Target | Installed from mirror | Reading |
|---|---|---|---|---|
| `mirror-install` | `@hwfee/dsh-predict` | 0.1.1 | **install failed** | `ERR_PNPM_NO_MATCHING_VERSION` — mirror has no version of this package |
| `mirror-install` | `@hwfee/dsh-git-bash` | 0.1.1 | **install failed** | same |
| `mirror-install` | `@hwfee/dsh-genui` | 0.1.1 | **install failed** | same |
| `mirror-install` | `dsh-system-fonts` | 0.1.3 | **0.1.2** | installed the previous version; **not** the target |
| `mirror-install` | `@hwfee/dsh-usage-stats` | 0.1.3 | **0.1.2** | installed the previous version; **not** the target |
| `mirror-install` | `dsh-cds-theme` | 0.1.7 | **0.1.5** | installed an older version; **not** the target |

Two of those rows would have looked like passes if only "did it mount?" was
checked: the layer was created and the plugin would have loaded — as the old
version, with none of this release's changes.

## Mount verification

`market/verify-mount.ps1` checks three things the matrix cannot see: the row `name`
resolves to an installed package, the bundle registers the **package name** as its
module id, and the Host half exports `apply`. **The script was not used here
unchanged**, for a measured reason: it installs with `dsh plugin --profile <p> add
<pkg>` and passes no registry, so on this machine it installs from
`registry.npmmirror.com` and lands on the previous version — or, for three of the
six, on nothing. Its output would therefore either be red for a mirror reason or
green for the wrong version, and neither is evidence about this release.

So the same three checks were performed directly against installs of the
**target** version (official registry, or the Release asset for `dsh-cds-theme`):

| Package | Installed | Row name resolves | Bundle id == package name | Host exports `apply` |
|---|---|---|---|---|
| `@hwfee/dsh-predict` | 0.1.1 | yes | yes | yes |
| `dsh-system-fonts` | 0.1.3 | yes | yes | yes |
| `@hwfee/dsh-usage-stats` | 0.1.3 | yes | yes | yes |
| `@hwfee/dsh-git-bash` | 0.1.1 | yes | yes | yes |
| `@hwfee/dsh-genui` | 0.1.1 | yes | yes | yes |
| `dsh-cds-theme` | 0.1.7 | yes | yes | yes |

All six mount correctly at the target version.

## Open observation: unpinned installs can lag

An **unpinned** install with the official registry explicitly passed
(`--config.registry=https://registry.npmjs.org`, spec `dsh-system-fonts`) still
installed **0.1.2**, not 0.1.3.

The cause is **not identified**. What was checked and did not explain it:

| Check | Value |
|---|---|
| `npm config get minimum-release-age` | `undefined` |
| `pnpm config get minimumReleaseAge` | `undefined` |
| profile `pnpm-workspace.yaml` | `packages: ["."]`, `nodeLinker: hoisted`, `autoInstallPeers: false` — no release-age key |

Earlier releases in this repository recorded a similar lag and attributed it to
pnpm's `minimumReleaseAge`; those notes are in
[SUBMISSION-FLOW.md](SUBMISSION-FLOW.md) and
[PUBLISHING.md](PUBLISHING.md). **That attribution is not repeated here**, because
the config that would cause it is not set on this machine. The observation stands
on its own: with this toolchain an unpinned install of a just-published version may
resolve to the previous one, and only a pinned version or the Release tarball is
reliable immediately after a publish.

## How to read this report

- A `PASS` requires that the installed version **equals the target** and the package
  became a layer. Anything else is recorded as what actually happened.
- `dsh-cds-theme` was verified through its Release asset at first, because npm had not
  accepted 0.1.7 within the observation window. It has since landed on npm and matches
  the asset byte for byte; see the note below.
- The mirror rows are the reason the script's own output should not be trusted
  alone: it reported mounts for packages that were the wrong version.

## Two different `build-index.mjs` failures, two different causes

Recorded separately because they were briefly conflated. The same script failed twice
on 2026-10-22, with **different errors**:

| When | Error text | Cause |
|---|---|---|
| Before 0.1.7 landed on npm | `Error: dsh-cds-theme@0.1.7 is not on npm - publish before building the index` at `build-index.mjs:53` | The manifest version had no npm publish timestamp yet. Line 53 is an unconditional `throw` for exactly that case. |
| After the plugin directories were emptied | `code: 'ENOENT', syscall: 'open', path: '…\\plugins\\cds-theme\\package.json'` | The manifest file itself was gone — the directories had been emptied, not a registry problem. |

So neither explanation replaces the other: the first failure was the registry, the
second was a missing file. Once the sources were restored **and** 0.1.7 had landed,
`build-index.mjs` succeeded (`market/index.json: 6 plugins, 4 categories`).

Note on the Windows exit code: after the `throw`, the process also printed
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and exited `-1073740791`.
That is Node's teardown path for an uncaught rejection on this platform; it is **not**
data corruption — `git status` confirmed `market/index.json` was untouched.

## cds-theme 0.1.7 eventually landed, and npm matches the Release asset

| Check | Result |
|---|---|
| `npm view dsh-cds-theme version` (official) | `0.1.7` (landed ~19 minutes after publish) |
| npm tarball HEAD | `200` (404 for ~30 s after the version first appeared) |
| npm `dist.shasum` | `5f1bef4d6c1f3e4d1a7ccea85706c6d2f439a5a7` |
| Locked local tarball SHA-1 | `5f1bef4d6c1f3e4d1a7ccea85706c6d2f439a5a7` |
| Verdict | identical bytes — npm and the Release asset are the same package |

The package was installed successfully from its Release asset **while npm had not
landed it**, which is why that path is recorded above rather than being treated as a
theoretical fallback.
