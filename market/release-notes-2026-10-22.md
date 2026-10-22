# Release notes · 2026-10-22

One entry per package, worded from what the shipped code does. These are the notes for
the npm/GitHub Releases: what changes for the user, what to expect if you upgrade, and
what was verified locally.

---

## dsh-cds-theme 0.1.6

**The package no longer contains the six Anthropic web faces.** Up to 0.1.5 the built
bundle carried them inlined as base64 (about 711 KB) while the package's file list gave
no sign of it. Now:

- **Two SIL OFL Noto subset faces stay inlined** — `NotoSansSC-Shifted-VF` and
  `NotoSerifSC-Shifted-330`. These are the only font bytes in the tarball.
- **The six Anthropic faces become `local()` references.** A machine that has the family
  installed renders exactly as before.
- **The original fallback stack is kept**, so Latin and monospace text resolve through
  the system fonts when those families are absent.
- **No setting and no family name changes.**

The package now ships `licenses/NOTICE.md` — the copyright notices read out of the
shipped `.woff2` name tables — and `licenses/OFL-1.1.txt`, so the licence and notice
travel inside the tarball with the font they cover.

**If you upgrade:** on a machine without those families installed, headings and body text
in the replica render with the system fallback faces instead of the embedded ones. This
is the intended behaviour of this version, not a rendering fault.

Verified locally: the release asset gate unpacks the built tarball and hashes every font
payload — the two Noto faces are reported as open-licence exemptions and no commercial
payload is present. The gate was reverse-tested against the published 0.1.5 tarball,
which it correctly rejects and names all six faces in.

## dsh-system-fonts 0.1.3

Adds an interface font slot and two pixel steppers:

- **Interface font** — a fourth slot beside content, code and terminal. Its default is
  "follow the body": unset means the interface resolves through the content font, so
  nothing changes unless you set it.
- **Interface size** — 10–20 px, 14 px when unset. It scales interface text only; row
  layout does not move.
- **Inline code size** — 10–20 px, 12 px when unset. It affects inline code only; code
  blocks and the terminal keep their own sizes.

The plugin still never writes `font-weight` (weights belong to the host theme) and never
touches colour.

**If you upgrade:** nothing moves until you change a row. The two new rows show a default
value while unset and start applying only once you step them.

Verified locally by the package's own suites and by the rows rendering in the real
application.

## @hwfee/dsh-git-bash 0.1.1

Both changes are about a command that should have stopped and did not:

- **Restricted sessions are refused before anything starts.** On Windows, read-only and
  `workspace-write` sessions — and any session whose mode cannot be determined — are
  rejected before a process is spawned, instead of being run and annotated afterwards.
- **Cancellation, timeout and an output overrun stop the real process tree.** These used
  to kill only the shell the plugin started and leave a grandchild alive; because that
  grandchild held the stdio pipes, the call could also hang past its deadline. An output
  overrun now returns a marked result and stops the tree. If the kill cannot be confirmed
  within a bounded grace window, the note says so instead of claiming a stop.

**If you upgrade:** a read-only or `workspace-write` session on Windows that used to run
commands through Git Bash now gets an error instead. The message points at Windows
PowerShell, which runs inside the sandbox. This is the intended change.

Verified locally with real processes: the suite spawns a real shell that starts a real
grandchild and asserts what is on disk afterwards, for the timeout, cancellation and
output-overrun paths. An aborted host-delegated run raises an abort rather than returning
a successful result.

## @hwfee/dsh-usage-stats 0.1.3

Adds the usage ledger (`lib/usage-ledger.js` — in the repository since the previous
checkpoint, never published) and updates the cache and store alongside it.

## @hwfee/dsh-predict 0.1.1

Data-flow changes to `lib/index.js`, `lib/predict.js` and `lib/request.js` — committed in
the repository since the previous checkpoint, never published.

## @hwfee/dsh-genui 0.1.1

**Card code now runs in a sandboxed frame, and a card can no longer send a message on its
own.**

- **The card renders in an iframe** with `sandbox="allow-scripts"` and no
  `allow-same-origin`, so its document has an opaque origin: the host page, its storage
  and its cookies are unreadable to it rather than merely hidden. A CSP in the frame
  document additionally removes the documented network APIs, navigation, nested frames
  and forms.
- **`interact(text)` is now a request, not a send.** The card's suggestion appears in a
  confirmation row *outside* the frame, showing the exact sentence, with send and discard
  buttons; only a click on send reaches the conversation. A second request while one is
  pending is ignored rather than replacing what you are reading.
- Cards look and behave as before: host theme tokens are passed in as a snapshot, light
  and dark follow the host, and the card reports its own height.
- React 18.3.1, ReactDOM 18.3.1 and its transitive scheduler 0.23.2 are bundled into the
  frame runtime at build time — no CDN, no host module table — and the package ships their
  MIT licence texts plus `THIRD_PARTY_NOTICES.md`.

**If you upgrade:** sending from a card takes one extra click. A card that used to put its
text straight into the conversation now asks first.

Verified locally: `test/frame.test.mjs` asserts the frame boundary — messages from a
different frame, from a non-opaque origin, or with a wrong token are rejected, and only
the known message types are accepted. The build's freshness check covers both the client
bundle and the frame runtime.

---

## Verification behind all six

Each package was built and its `npm test` ran once for this release: all six exited 0,
with every `test/*.mjs` in the package wired into that script. The repository audit
passed, and the release asset gate passed on all six final tarballs. Packing is
reproducible (two consecutive packs of each package produced identical SHA-256), so the
bytes the gate inspected are the bytes that were uploaded. The full record, including
per-file diffs against what was published, is in
[release-review-2026-10-22.md](release-review-2026-10-22.md) and
[published-vs-local.md](published-vs-local.md).
