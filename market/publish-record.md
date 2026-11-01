# Publish record

Written for the 2026-11-01 releases of `dsh-cds-theme@0.1.10`, `dsh-cds-theme@0.1.11`
and `@hwfee/dsh-usage-stats@0.1.5` (published from the release commits, `npm publish`
run by hand; the packaged tarball was then attached to each GitHub Release).

Each Release asset must match the row for its version: `AGENTS.md` requires the
asset shasum to equal npm `dist.shasum`. SHA-1 is what npm reports as
`dist.shasum`; SHA-256 is what GitHub prints as the asset digest.

These hashes describe the tarball that `npm pack` produced from the release
commit, byte-identical to the published upload: the cds-theme SHA-1 below equals
the `shasum` npm printed at publish time, and both Release assets were created
from these exact files.

| Package | Version | Tarball | KB | SHA-1 = npm dist.shasum | SHA-256 | npm integrity |
|---|---|---|---|---|---|---|
| `dsh-cds-theme` | 0.1.10 | `dsh-cds-theme-0.1.10.tgz` | 3166.3 | `6ecf371fa467d36c63361e271fe8bfc6d4d3185f` | `3fc2390e977d557de611a81f26f656254e18757fdd418e3278818c96b4f04cf2` | `sha512-/LZLjHLilVe5LaFOLy65wIbKyU0I7hSC584KUgVvH6MvwLiBbhbwj3ybKwyTOOjZUpbkPA9HjZfF5aa/IhahBA==` |
| `dsh-cds-theme` | 0.1.11 | `dsh-cds-theme-0.1.11.tgz` | 3190.7 | `3e841e63ae0909f25a288924ad0fd196af758203` | `7910ecf7555322ae221718b983840baf6ecd8493c3d68d3cb44e82fa2e452f09` | `sha512-UTPrN1ECgYBM0mav0hHvdI1YXsBGps2q/5Ir0NcT9bWfg/x3+7SbNe+28++3GKp2OiRb1nqnYYEDpXMQlat+Ag==` |
| `@hwfee/dsh-usage-stats` | 0.1.5 | `hwfee-dsh-usage-stats-0.1.5.tgz` | 45.0 | `b74cc0c3b716f4d84faa7aa757715dc0bfe48a19` | `f8f3499b82b31520245742de00b8441652764306b5f953e974caca6321eae5db` | `sha512-vF0khFo8dnzrbJzmFY0RoSYmZrF+Zlh6sy9cBMSZYJxQkQw+c6CK3027L2RLZKYhLENjELc3azap+tYPlWKoRA==` |

Registry and Release visibility were checked with the two commands `AGENTS.md`
treats as the only evidence:

- `npm view <name> versions --registry=https://registry.npmjs.org` lists the new
  version;
- `curl -sI https://registry.npmjs.org/<name>/-/<name>-<version>.tgz` returns 200.

`dsh-cds-theme@0.1.10` took roughly 40 minutes to become downloadable after
`npm publish` accepted the upload (dist-tag `latest` pointed at it well before
the tarball did). That is the package's usual delay, not a staging failure: the
tarball URL answered 200 and the install matrix then reached 0.1.10 through the
pinned, Release-asset and local-tarball paths.
