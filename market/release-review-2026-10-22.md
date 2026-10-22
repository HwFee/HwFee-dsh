# Release review · 2026-10-22

Tracked record of this release. Chat logs are not evidence; this file is. Every row
below was filled in from a command's actual output. A row that was not run stays
`PENDING` — it never becomes `PASS` by assumption, and failures are recorded as
failures.

Scope: the six packages under `plugins/`, published to npm, released one by one on
GitHub, then submitted to the plugin market.

| What | Where |
|---|---|
| Release flow followed | [SUBMISSION-FLOW.md](SUBMISSION-FLOW.md) |
| npm credentials and known traps | [PUBLISHING.md](PUBLISHING.md) |
| Market entries and their status | [SUBMISSION.md](SUBMISSION.md) |
| Published vs local, file by file (generated) | [published-vs-local.md](published-vs-local.md) |
| Install matrix (recorded separately) | [install-matrix.md](install-matrix.md) |
| Tarball hashes from the publish run | [publish-record.md](publish-record.md) |

---

## 1. Environment as measured

| Item | Value | How it was checked |
|---|---|---|
| Repository root | `C:\Users\17445\Desktop\HwFee-dsh` | `pwd` |
| Branch | `master`, ahead of `origin/master` by 1 | `git status -sb` |
| HEAD at review start | `865fb44` | `git rev-parse HEAD` |
| `origin/master` at review start | `c005bcf` | `git rev-parse origin/master` |
| Remote | `https://github.com/HwFee/HwFee-dsh.git` | `git remote -v` |
| node / npm | `v24.16.0` / `11.13.0` | `node --version`, `npm --version` |
| `gh` | account `HwFee`, keyring, scopes include `repo` + `workflow` | `gh auth status` |
| Default npm registry | `registry.npmmirror.com` (read-only mirror; why every manifest carries `publishConfig.registry`) | `npm config get registry` |
| npm credential | User scope only (`NPM_TOKEN`); Process scope empty for all three candidate names | see §2 |

The working tree was **not** clean and was **not** reset: 76 tracked files modified,
24 untracked additions, 7 staged deletions, 2 unstaged deletions. Nothing was
reverted. The staged deletions are the six Anthropic font files plus
`.work-session.jsonl` — untracked in git, retained on disk.

### 1.1 Scope of this release, per package

Determined by comparing the **published tarball** against `npm pack` of the current
tree, entry by entry (§3.4). `git diff` cannot answer this: `predict` and
`usage-stats` carry `lib/` changes that are committed in `865fb44` — inside the
release, invisible to any working-tree diff.

| Package | Published | Shipping | Bump | User-visible change |
|---|---|---|---|---|
| `dsh-cds-theme` | 0.1.5 | **0.1.6** | yes | ships only the 2 OFL Noto faces; the 6 Anthropic faces become `local()` references with the system fallback stack retained; adds `licenses/NOTICE.md` + `licenses/OFL-1.1.txt` |
| `dsh-system-fonts` | 0.1.2 | **0.1.3** | yes | interface-font row, interface-size stepper, inline-code-size stepper |
| `@hwfee/dsh-git-bash` | 0.1.0 | **0.1.1** | yes | restricted sessions are refused before any spawn (fail closed), session policy passed through; cancellation, timeout and output-limit now stop the real process tree |
| `@hwfee/dsh-usage-stats` | 0.1.2 | **0.1.3** | yes | `lib/usage-ledger.js` (new, never published) plus `usage-cache` / `usage-store` changes, all from `865fb44` |
| `@hwfee/dsh-predict` | 0.1.0 | **0.1.1** | yes | `lib/index.js` / `predict.js` / `request.js` data-flow changes, all from `865fb44` |
| `@hwfee/dsh-genui` | 0.1.0 | **0.1.1** | yes | card code runs in a sandboxed opaque-origin iframe; `interact()` becomes a request the user confirms outside the frame |

No version was bumped for a package whose shipped bytes did not change. `genui` was
the last to be decided: its manifest stayed at 0.1.0 while the iframe work was
landing, and was bumped to 0.1.1 with its lock in step only after that work was
frozen.

---

## 2. Credentials

Rules applied: read only from `NPM_TOKEN` / `NODE_AUTH_TOKEN` / `NPM_AUTH_TOKEN`;
never printed, never written to `~/.npmrc`, the repository, or any persistent
configuration; injected per command.

| Scope | Candidate variables | Present |
|---|---|---|
| Process | all three | **none** |
| User | `NPM_TOKEN` | **yes** |
| Machine | all three | none |

So a plain `pwsh market/publish-pending.ps1` finds no token in a fresh shell. The
documented invocation injects it for that one command:

```powershell
$env:NPM_TOKEN = [Environment]::GetEnvironmentVariable('NPM_TOKEN','User').Trim()
pwsh market/publish-pending.ps1
```

`npm whoami` is **not** used as the criterion: a granular token fails it by design, so
a `401` there says nothing about validity. Whether the token may publish is proven by
the publish call itself (§3.5).

---

## 3. Verification evidence

### 3.1 Build and test, one run per package

`npm test` runs the artifact freshness check first, then the manifest contract, then
the suite. Each package was built and tested once for this release; results are exit
codes, not a count of assertions — the per-file `pass` totals are not aggregated here
because the individual `node test/*.mjs` runs each print their own summary.

| Plugin | `npm run build` | `npm test` | Test files wired into `npm test` |
|---|---|---|---|
| `cds-theme` | ok | exit 0 | 24 |
| `genui` | ok | exit 0 | 11 |
| `git-bash` | ok | exit 0 | 10 |
| `system-fonts` | ok | exit 0 | 7 |
| `usage-stats` | ok | exit 0 | 8 |
| `predict` | ok | exit 0 | 9 |

Every `test/*.mjs` in each package appears in that package's `test` script — checked
file by file, because a test file that is never run protects nothing.

| Check | Command | Result |
|---|---|---|
| Repository audit (artifacts, unsafe DOM, eval, observer release, switch contract) | `node tools/audit.mjs` | exit 0, `all checks passed` (notes only, no failures) |
| Mount criteria self-test | `pwsh market/test-mount-criteria.ps1` | exit 0, `all 41 mount criteria behave correctly` |
| The five release PowerShell scripts parse | `[Parser]::ParseFile` | all parse-ok |

The audit's `genui` line allows the two evaluation sites in
`client/src/frame/runtime.js` and states why: that is the plugin's feature, and it now
happens inside the opaque-origin frame, with the frame boundary asserted by
`test/frame.test.mjs`.

### 3.2 Release asset gate

```sh
node market/check-release-assets.mjs
```

| Package | Result | What it found |
|---|---|---|
| `dsh-cds-theme` | **PASS** | only `NotoSansSC-Shifted-VF` and `NotoSerifSC-Shifted-330`, named as open-licence exemptions |
| `genui`, `git-bash`, `predict`, `system-fonts`, `usage-stats` | **PASS** | no font payloads of any kind |

Two properties of this gate matter more than the verdict:

1. It **unpacks the real tarball and hashes every font payload**, so a clean-looking
   `files` field proves nothing. That is how 0.1.5 shipped six commercial faces as
   base64 inside `client/client.js` while `npm pack --dry-run` printed a clean list.
2. It has been **reverse-verified**: fed the already-published `dsh-cds-theme@0.1.5`
   it names all six Anthropic faces with their byte offsets, and a scratch copy with
   `files` widened to `fonts/` fails on all eight loose files. A gate never shown to
   catch the real incident is not evidence.

The gate now identifies a face from `tools/font-licences.mjs` — static fingerprints
(byte length, SHA-256, 96-byte base64 prefix) rather than by reading bytes out of
`fonts/`. A gate that needs a file the repository must not contain degrades on a fresh
clone, and a degraded gate reports "unidentified" instead of "forbidden".

### 3.3 Pack contents and determinism

The chain that matters is build → pack once → gate **those** bytes → `npm publish
<that file>`. `npm publish` with no argument re-packs the directory, which opens a
window between the gate and the upload; publishing the path closes it.

The gate internally runs its own `npm pack`, so the chain is only sound if packing is
reproducible. Measured: two consecutive packs of each of the six packages produced
identical SHA-256 for all six.

Final tarballs, packed once each:

| Package | Tarball | Files | Size | SHA-1 |
|---|---|---|---|---|
| `dsh-cds-theme` | `dsh-cds-theme-0.1.6.tgz` | 14 | 3131.9 KB | `b7c6886f91060539e04775fa5d81dab35752df35` |
| `dsh-system-fonts` | `dsh-system-fonts-0.1.3.tgz` | 9 | 42.4 KB | `281ba22f63a27ddc9ffa15ec79832836657828da` |
| `@hwfee/dsh-usage-stats` | `hwfee-dsh-usage-stats-0.1.3.tgz` | 12 | 43.0 KB | `857d65b973638e2dbc7a00facbf311871fa6e527` |
| `@hwfee/dsh-git-bash` | `hwfee-dsh-git-bash-0.1.1.tgz` | 11 | 42.8 KB | `7e1253f0e436e0a810adead2ec50dbddfc1f5c04` |
| `@hwfee/dsh-predict` | `hwfee-dsh-predict-0.1.1.tgz` | 12 | 28.3 KB | `66996c5e4bb7e188d247f744c245c240b7677ae6` |
| `@hwfee/dsh-genui` | `hwfee-dsh-genui-0.1.1.tgz` | 14 | 91.1 KB | `d8f02d8d875058153e0955525cfaa5b8e86ddc53` |

**A packed file that is not tracked in git is a release defect** — the tarball would
carry bytes no commit contains, and a fresh clone could not rebuild it. Checking every
path in each final pack against `git ls-files` found exactly one class: the licence
files (`cds-theme/licenses/*`, `genui/licenses/*`, `genui/THIRD_PARTY_NOTICES.md`).
Those must ship, so they are staged with the release.

The same check, run earlier, caught `git-bash/lib/index.js.probe` — a 48 KB stale copy
of `lib/index.js` that the `files` allowlist pulled in because it names the whole `lib`
directory. It was removed before the final pack, and the tarball went from 12 files to
11. No repacker or `files` allowlist check would have reported it; only reading the
final pack listing does.

`genui` bundles React 18.3.1, ReactDOM 18.3.1 and its transitive `scheduler` 0.23.2
into `client/src/frame/runtime.bundle.json`. The three MIT licence texts and
`THIRD_PARTY_NOTICES.md` are in the 14-file tarball; the versions in that table were
checked against the installed packages, not assumed.

### 3.4 Published vs local

`node market/compare-published.mjs` — compares the tarball on npm against `npm pack`
of the current tree, file by file, for **every** package, and prints the count it
compared so "all six" cannot be claimed from a subset. Exit 0: a difference is a
finding, not a failure.

| Package | Local | Published | Added | Changed | Removed |
|---|---|---|---|---|---|
| `dsh-cds-theme` | 0.1.6 | 0.1.5 | 2 | 3 | 0 |
| `@hwfee/dsh-genui` | 0.1.1 | 0.1.0 | 0 | 5 | 0 |
| `@hwfee/dsh-git-bash` | 0.1.1 | 0.1.0 | 0 | 5 | 0 |
| `@hwfee/dsh-predict` | 0.1.1 | 0.1.0 | 0 | 5 | 0 |
| `dsh-system-fonts` | 0.1.3 | 0.1.2 | 0 | 3 | 0 |
| `@hwfee/dsh-usage-stats` | 0.1.3 | 0.1.2 | 1 | 4 | 0 |

All six differ from what is published. The generated detail — including the
`licenses/` additions in `cds-theme` and the never-published `lib/usage-ledger.js` — is
in [published-vs-local.md](published-vs-local.md).

### 3.5 `npm publish` command form

Verified with `--dry-run` against a real packed tarball and the User-scope token:
exit 0, `+ @hwfee/dsh-predict@0.1.1`, and the printed `shasum` equal to the packed
file's SHA-1. This proves the invocation and that the CLI accepts the credential —
it is **not** evidence of publish permission, which only a real publish settles.

### 3.6 Install matrix and mount verification

Run **after** publishing, recorded separately as the flow requires.

| Step | Command | Result |
|---|---|---|
| Install matrix (5 install paths + cross cases per package) | `pwsh market/test-install-paths.ps1` | `PENDING` — needs published versions |
| Mount verification (row name resolves, bundle id, Host `apply`) | `pwsh market/verify-mount.ps1` | `PENDING` — needs published versions |

Previous release baseline, for comparison only: 34 cases, 32 pass, 1 expected failure
(`git-subdir`), plus one unexpected failure — an unpinned `dsh-system-fonts@0.1.2`
install failing against the mirror with `ERR_PNPM_NO_MATCHING_VERSION`. That is not a
prediction for this release.

**The matrix must report the version it actually installed.** An unpinned install can
land one version behind because of pnpm's `minimumReleaseAge`; recording that as a pass
would claim the new version works when the old one was tested.

---

## 4. Script and pipeline changes carried by this release

Each fixes a failure mode that was observed, not a preference.

| File | Change | Failure it prevents |
|---|---|---|
| `market/check-release-assets.mjs` (new) | Packs the real tarball, walks every byte, hashes each font payload against `tools/font-licences.mjs`; commercial → FAIL (inlined or loose), unknown → FAIL, loose font file → FAIL, OFL inlined → pass and named | Shipping six commercially-licensed faces inside `client/client.js` while the file list looked clean — this happened in 0.1.5 |
| `tools/font-licences.mjs` (new) | The repository's single source of truth for which font bytes may be redistributed, identified by content (byte length + SHA-256 + 96-byte prefix) rather than by path | A gate that had to read the restricted faces out of `fonts/`, so on a fresh clone it degraded to "unidentified" and skipped the check |
| `market/compare-published.mjs` (new) | Published tarball vs `npm pack`, file by file, for every package; prints the count compared; reports the working-tree delta separately | A comparison that was true of a subset being reported as "all six are byte-identical" — committed-but-unpublished `lib/` changes are invisible to `git diff` |
| `market/test-mount-criteria.ps1` (new) | 41 assertions over throwaway profile dirs (22 call sites, unwound through 4 loops; the count in the output is tallied by the script, not written by hand), plus assertions that the regexes are literally the ones `verify-mount.ps1` runs | A real defect: `verify-mount.ps1` read `^\s*name:`, so the compact YAML row `    - name: pkg` yielded zero names and a good patch was reported as inserting no row |
| `market/packages.ps1` (new) | Single derived list of releasable packages (from `plugins/*` + `dsh.bundle`), with `<dir>-v<version>` tags and scope-stripped asset names, plus `Assert-ReleaseNaming` | Two hand-written package arrays that a new plugin would slip past, printing green while never testing it |
| `market/publish-pending.ps1` | Builds → tests → packs **once** → gates those bytes → `npm publish <that file>`; records SHA-1/SHA-256 and npm `dist.integrity`; re-hashes immediately before upload; prints real failure output | `npm publish` re-packing the directory after the gate; `npm test` output piped to `Out-Null` so a red suite reported only "test failed" |
| `market/test-install-paths.ps1`, `market/verify-mount.ps1` | Use the derived list; the row id is read from each plugin's own `cordis.patch.yml` | The list drifting from the actual package set, and conflating a package name with the internal row id |
| `tools/audit.mjs` | Consumes the shared font licence registry; adds a fingerprint audit | The audit `continue`ing past a font check it could not perform |

---

## 5. Known limitations

1. **`dsh-cds-theme@0.1.5` is already public with the six commercial faces.** A
   published version cannot be withdrawn. The remediation is that new versions stop
   carrying them, plus the gate so it cannot recur.
2. **Scope of the security work in this release.** Two findings were addressed in code
   this round — `git-bash` failing open in restricted sessions, and `genui` running
   model-authored code same-origin. What backs them is the local evidence named in §3.1
   and the per-package changes in §1.1. Online scanning and penetration testing were
   stopped by the user's decision and are not part of this round, so nothing here speaks
   to external attack resistance.
3. **`npm whoami` is not a credential test.** Granular tokens fail it by design.
4. **`minimumReleaseAge` makes an unpinned install lag one version** for up to about a
   day. Not a publish failure; pinned and Release-tarball installs are unaffected. The
   danger case is a lagging version that is itself broken — so the matrix names the
   version actually installed instead of calling a lagging install a pass.
5. **git subdirectory installs do not work.** `pnpm` installs the repository root and
   ignores `&path:`; the matrix records this as an expected failure.
6. **The default registry on this machine is a read-only mirror** that trails npm.
7. **`PENDING` rows are genuinely unrun**, not silently passed.

---

## 6. Release checklist state

| Item | State |
|---|---|
| Six packages: build + tests green | `PASS` (§3.1) |
| Repository audit green | `PASS` (§3.1) |
| Mount criteria self-test green | `PASS` (§3.1) |
| Asset gate green on final tarballs | `PASS` (§3.2) |
| Pack determinism verified (the gate sees the uploaded bytes) | `PASS` (§3.3) |
| Every packed file tracked in git | `PASS` after staging the licence files (§3.3) |
| Published-vs-local comparison recorded for all six | `PASS` (§3.4) |
| Versions bumped where content changed | `PASS` — six of six (§1.1) |
| Commit + push | `PENDING` |
| `npm view` shows the new version | `PENDING` |
| tarball URL returns 200 | `PENDING` |
| One GitHub Release per package, asset 200, shasum equals npm `dist.shasum` | `PENDING` |
| Install matrix recorded | `PENDING` |
| Mount verification green | `PENDING` |
| Market catalog + `index.json` updated | `PENDING` — `build-index.mjs` reads npm publish times, so it runs after publishing |
| Market PR opened or entry already present, link recorded | Entries present: #8392 merged 2026-10-21T17:27Z, #8189 closed. `system-fonts` description refresh: `PENDING` |
| Final screenshots for UI-visible changes | `PENDING` |
