# Publish record · 2026-10-22

Hashes for the tarballs uploaded in this release. `AGENTS.md` requires a GitHub
Release asset's shasum to equal npm's `dist.shasum`; that check needs the numbers
written down, and re-deriving them by hand is how it ends up skipped.

These were **packed once each from the committed tree, then published by path**
(`npm publish <file>`), so the recorded SHA-1 describes the uploaded bytes rather
than a re-pack of the directory afterwards. Packing was verified reproducible:
two consecutive packs of every package produced identical SHA-256.

`market/publish-pending.ps1` normally writes this file. This release was published
with explicit per-package `npm publish <file>` calls instead (the packages were
pushed individually to keep a failing upload from blocking the others), so the
record is reconstructed here from the hashes that were captured before each upload
and confirmed against the registry afterwards.

| Package | Version | Tarball | Files | KB | SHA-1 = npm `dist.shasum` | SHA-256 | npm `dist.integrity` |
|---|---|---|---|---|---|---|---|
| `dsh-cds-theme` | 0.1.7 | `dsh-cds-theme-0.1.7.tgz` | 14 | 3131.9 | `5f1bef4d6c1f3e4d1a7ccea85706c6d2f439a5a7` | `9cc5bf46537bf8e7a8c32340aa26fbd9189d9e6818a28631479672b88df7bf47` | see note 1 |
| `dsh-system-fonts` | 0.1.3 | `dsh-system-fonts-0.1.3.tgz` | 9 | 42.4 | `281ba22f63a27ddc9ffa15ec79832836657828da` | `bde903cce70548f3b1a2f8f1848b4c899795e2e5494d8f7248221ca3f4a9a0a8` | see note 1 |
| `@hwfee/dsh-usage-stats` | 0.1.3 | `hwfee-dsh-usage-stats-0.1.3.tgz` | 12 | 43.0 | `857d65b973638e2dbc7a00facbf311871fa6e527` | `409500c73e61087b84e747dc97a400128d3c946033db11c6f812342c82689bc5` | see note 1 |
| `@hwfee/dsh-git-bash` | 0.1.1 | `hwfee-dsh-git-bash-0.1.1.tgz` | 11 | 43.7 | `94019b2ed3a5f3e6cf3ad9eec6e94631926f2164` | `505be670c5854803941add6f6e2762c01b330bd060c177758c6918a8cda9c42a` | see note 1 |
| `@hwfee/dsh-predict` | 0.1.1 | `hwfee-dsh-predict-0.1.1.tgz` | 12 | 28.3 | `66996c5e4bb7e188d247f744c245c240b7677ae6` | `b30e290ceb995aadde5ac251e26460410157117e02f3135cd8234d90ad6db8e6` | see note 1 |
| `@hwfee/dsh-genui` | 0.1.1 | `hwfee-dsh-genui-0.1.1.tgz` | 14 | 91.1 | `d8f02d8d875058153e0955525cfaa5b8e86ddc53` | `84c10acb51a00920035b7d19e9dd2c484283ef23d25fc2977ef74d2b66f794a2` | see note 1 |

**Note 1 — integrity.** npm's `dist.integrity` was read back for
`@hwfee/dsh-predict@0.1.1` during the dry run and matched the packed file
(`sha512-S7+nQ2jgBBV0lF3q2NSQG3MSkBViby2aV8eaQE++Exi2rlLVH6Mnps52jGk0R6Tstd7oT0D1zTCIg/SwaFA/7Q==`).
It is not transcribed per package here because the SHA-1 column is the one the
Release-asset check uses, and every SHA-1 in this table was confirmed equal to the
registry's `dist.shasum` before the Release was created.

## Confirmed against the registry

Each row below was verified after publishing, not inferred from `npm publish`'s
own output:

| Package | `dist.shasum` == table SHA-1 | tarball URL 200 |
|---|---|---|
| `@hwfee/dsh-predict@0.1.1` | yes | yes |
| `dsh-system-fonts@0.1.3` | yes | yes |
| `@hwfee/dsh-usage-stats@0.1.3` | yes | yes |
| `@hwfee/dsh-git-bash@0.1.1` | yes | yes |
| `@hwfee/dsh-genui@0.1.1` | yes | yes |
| `dsh-cds-theme@0.1.7` | yes | yes (after a delay, see below) |

## `dsh-cds-theme` 0.1.6 → 0.1.7

0.1.6 was uploaded twice (the first attempt failed with `E503 Service Unavailable`)
and never appeared in the official packument; its tarball stayed 404. 0.1.7 was
then published as the **same content under a new version number** — only the
version fields in `package.json` and the lock changed — and it landed on npm about
19 minutes later. Its `dist.shasum` equals the SHA-1 recorded above, so the npm
tarball and the `cds-theme-v0.1.7` Release asset are the same bytes.

0.1.6 remains recorded in the stuck-version ledger in
[PUBLISHING.md](PUBLISHING.md), as "uploaded, not seen, did not land inside the
observation window". It is not described as permanently stuck: the same package's
0.1.2 and 0.1.3 were once written off and were later found to be available.

## Release assets

Each package has its own Release, tagged `<directory>-v<version>`, with the tarball
above attached and the Release targeting the source commit that contains the
package content:

| Tag | Asset | Target commit |
|---|---|---|
| `cds-theme-v0.1.7` | `dsh-cds-theme-0.1.7.tgz` | `6698565` (version bump; content identical to `b04768a`) |
| `system-fonts-v0.1.3` | `dsh-system-fonts-0.1.3.tgz` | `b04768a` |
| `usage-stats-v0.1.3` | `hwfee-dsh-usage-stats-0.1.3.tgz` | `b04768a` |
| `git-bash-v0.1.1` | `hwfee-dsh-git-bash-0.1.1.tgz` | `b04768a` |
| `predict-v0.1.1` | `hwfee-dsh-predict-0.1.1.tgz` | `b04768a` |
| `genui-v0.1.1` | `hwfee-dsh-genui-0.1.1.tgz` | `b04768a` |

All six assets were downloaded back from GitHub and their SHA-1 compared to this
table's SHA-1: **all six matched**, so each Release asset is byte-identical to the
tarball npm serves.
