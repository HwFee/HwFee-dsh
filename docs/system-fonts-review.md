# `plugins/system-fonts` — code review

Reviewed 2026-10-18 against the tree at `C:\Users\17445\Desktop\HwFee-dsh`, the running
Web GUI at `http://127.0.0.1:62421` (profile `desktop`, plugin installed as
`link:C:/Users/17445/Desktop/HwFee-dsh/plugins/system-fonts`), and the installed host
bundles inside `resources/app.asar` (paths below cite the extracted copies).

> **Concurrent-write note.** While this review was finishing, a second writer touched
> `client/src/merge.js` (`cover()`, finding 8) and rebuilt `client/client.js`. That change
> is kept and covered by a new test; the gate numbers below were taken on the final tree
> and the artifact was verified fresh against it. Everything else in this document is the
> work of this review.

**Gate state after the fixes:** `npm test` **137 passed, 0 failed** (113 fonts + 19 host +
5 cordis; was 119), `node tools/verify.mjs` exit 0, `node tools/integration.mjs` exit 0,
`node tools/audit.mjs` (repo audit) all `system-fonts` checks pass, `npm run build` run once
after the last source edit and the artifact is fresh.

**Before you re-measure the live route:** the running DSH process still holds the *old*
host half (route registered at boot). The fence and the stripped payload take effect after
the app restarts; the client needs a page reload because it now sends the marker header.
A manual read after the restart must carry it:

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:62421/dsh-system-fonts/fonts' `
  -Headers @{'x-dsh-system-fonts'='1'}
```

Without the header the route answers `403 {"error":"refused","reason":"missing-marker"}`
before it touches the enumerator. That is the intended contract, not a regression.

---

## Ranked findings

| # | Sev | Where | What breaks | Proof |
|---|-----|-------|-------------|-------|
| 1 | **High** | `lib/font-route.js:181-208` (was: whole handler, no guard) | Any web page the user visits can fire `?refresh=1` with an `<img>`/`fetch(no-cors)` — no preflight, no interaction — spawning PowerShell + `reg.exe` (~3.6 s each) and re-reading the install every time. The host's `webServer` offers **no** origin/auth hook (checked), so the route was the only place to fix it. | Live: cross-site GET with `Origin: https://evil.example`, `Sec-Fetch-Site: cross-site` → **200**, **3,924 ms**, repeated **3,865 ms**. After fix: **403** in 20 ms, enumerator not called. |
| 2 | **High** | `client/src/merge.js:651-706` (`attempt`), `:296` (`seat`), `:341` (`note`) | A pass that cannot resolve the host group returned `false` **without seating the rows home**. If the host's `FontSettingsGroup` disappears while the rows are merged, the rows travel into the removed subtree; React still believes they are children of the slot outlet, so a later `removeChild(outlet, row)` throws (the failure that once broke the settings page). A move that throws mid-pass left rows half-inside the region, hidden, with the official inputs visible. | Fixture probe against `merge.js`: **5 of 5 rows stranded** for "group unmounted" and "group replaced by an unknown shape"; **0** after the fix. New tests: *the host group disappearing while merged seats every row home*, *a failed in-region move degrades…*. |
| 3 | **Medium** | `lib/font-route.js:37-56`; `lib/system-fonts.js:251-310` | Every response carried a `file` field: **480 values, 198 of them absolute** (`C:\Users\…\Fonts\…ttf`) — a machine-layout disclosure to anything that can reach the port, read by **nobody** (client grep for `.file` is empty). | Live body **76,160 B** → routed body **55,206 B** for the same 523 families: **−20,954 B (−27.5 %)**, `file` count 0, zero drive paths in the body. |
| 4 | **Medium** | `lib/font-metadata.js:39-70` (new guard), `lib/system-fonts.js:165-186` (timeout) | The registry Fonts value is attacker-influenced data (HKCU is writable by any process running as the user) and it went straight to `Test-Path` + `GlyphTypeface`: `\\attacker\share\x.ttf` makes PowerShell open SMB and offer the user's NTLM credentials; `\\?\C:\…` and `..\..\…` read arbitrary local files. Separately, `execFile` had **no timeout** and `listSystemFonts` memoises its in-flight read, so one hung PowerShell pinned the catalogue — and every later request — forever. | Guard driven through the script's own PowerShell function on a 14-value table (UNC, device, root-relative, `..`, URI, bare name, drive path). Timeout: real hung child killed at 300 ms with `stdout: null` (test). |
| 5 | **Medium** | `client/src/chrome.js:99-119`, `:132`, `:62` | `sweep()` walked the whole document **twice** (`body` + `documentElement`) on every settings write — i.e. on every slider input event — and the 400 ms debounced observer pass. `installed` kept one entry per shadow root ever seen (the app mints one per tooltip/popover) and repainted detached trees; `timers` kept every fired id forever. | `node tools/bench-observer-census.mjs`: "full sweep cost: hostsOf(document.body) + hostsOf(document.documentElement) = TWO document-wide querySelectorAll('*') walks per sweep". New tests: detached host dropped (`hostCount` 0), fired timer leaves the list (`timerCount` 0). |
| 6 | **Low** | `client/src/typography.js:9-27`, `:228-241` | A family from a corrupt `localStorage` payload (or a font face) could carry a raw newline; a newline inside a quoted CSS string is a parse error, so the declaration is dropped. A whitespace-only family made `buildCss` emit the **default stack**, silently overriding a theme that points `--dsw-font-family` at an embedded face. | `quoteFamily('Evil\n}\nbody{display:none}/*')` → single-line quoted value, balanced braces, no smuggled rule; `buildCss({uiFamily:'   '})` emits no family token. Both new tests. |
| 7 | **Low** | `client/src/settings.js:31-47` | `setState` called `store.onChange` (the CSS rebuild) unguarded: a rebuild throw escaped into the React event handler that committed a slider drag. Activation rolls back, but mid-session there is nothing to roll back — the previous stylesheet is the right state. | New test: an `onChange` that throws does not make `setState` throw; value persists, one warning. |
| 8 | **Low** (suspicion, not reproduced in the real host) | `client/src/merge.js:525-551` | `data-dsf-covered` (ours, React does not manage it) and `style.display` (DOM state React can rewrite) can disagree; skipping a covered row on the mark alone would leave the official input visible next to our picker while the pass reports success. The tree **already** re-asserts the style here; I did not reproduce the reset against the real host, so this stays a suspicion with an invariant test. | New test: clearing `style.display` behind the merger's back is repaired by the next pass without duplicating the record. |
| 9 | **Low** (measured, not fixed) | `client/src/typography.js:141-192`; `client/src/panel.js:459-461` | `buildCss` re-reads 17 markdown steps × 2 tokens by walking **every rule of every stylesheet**, per rebuild; the line-height slider commits on every `input` event. | Measured with a synthetic 20-sheet × 300-rule CSSOM: **204,000 `getPropertyValue` calls per rebuild** at `lineHeightPct=80` (0 at the default 100), ~4.8 ms in Node; a real browser adds CSSOM binding cost. |
| 10 | **Low** (not fixed) | `client/src/merge.js:296-306` | `seat()` re-inserts a row before the sibling recorded at mount. After a collapse that sibling may itself be a plugin row that is inside the region, so the row is appended at the **end** of the outlet instead of its slot position. Invisible in practice (collapsed rows are `display:none`; the next expand re-seats them in slot order), so left alone. | Analysis of `seat`/`homeOf`; no user-visible repro found. |
| 11 | **Info** | `tools/audit-*.mjs`, `tools/icons-meta.json`, `pelican-bicycle.svg` | Dead weight: ~88 KB, referenced by nothing, shipped by nothing. | Repo-wide grep for each name → 0 hits outside the file itself; `package.json.files` ships only `lib`, `client`, `cordis.patch.yml`, `README.md`. |
| 12 | **Info** | `test/*.mjs` | Tests that would still pass with the feature broken (named below). | — |

### The mitigation the host actually offers (finding 1)

Checked in the installed bundles:

- `@deepseek-ai/dsh-host-webserver` — `register(route)` only stores `{kind, path, handler}`
  (`lib/index.js:326-333`) and the dispatcher hands the raw `node:http` request to the
  handler (`lib/index.js:378-394`). There is **no guard/origin hook**.
- Its README says it outright: *"No server-wide authentication or origin policy — route
  owners such as `dsh-client-connection` enforce their own request policy."*
- The host's own pattern is `isTrustedApiRequest()` in `@deepseek-ai/dsh-client-connection`
  (`lib/index.js:240-249`): reject `sec-fetch-site: cross-site`, require `Origin` (when
  present) to equal the request's own authority, require the `Host` to be loopback /
  bind address / trusted. It is **not exported**, so `font-route.js` implements the same
  policy for its one route.

The strongest piece is the **required custom header** (`x-dsh-system-fonts: 1`): an
`<img>`/`<script>`/`<link>`/form/navigation cannot set one at all, and a cross-origin
`fetch` that does preflights first — the preflight is never answered (no
`access-control-allow-origin`, `OPTIONS` is 405), so the real request is never sent. The
client is same-origin, so it pays nothing (same-origin requests do not preflight). On top:
the Host fence (blocks DNS rebinding), the `Sec-Fetch-Site` check and the `Origin` match.
Finally, `?refresh=1` has a **5 s cooldown** (`FORCE_COOLDOWN_MS`), so even a same-origin
loop cannot spawn PowerShell per request; the UI's refresh still works.

---

## Fixed, with tests

All numbers are from the final gate run. 17 tests were added: 5 host, 12 client.

1. **Route fence + marker + refresh cooldown** — `lib/font-route.js`, `lib/index.js`
   (`origin: () => webServer.getOrigin()` passed lazily), `client/src/catalogue.js`,
   `client/src/constants.js`.
   Tests: *a request WITHOUT the marker is refused, and costs no enumeration*;
   *the marker alone is not enough: cross-site and foreign-origin requests are refused*;
   *the fence policy is a pure function…*; *a burst of forced refreshes is coalesced…*;
   *the catalogue request carries the marker the host route requires*.
2. **Detach guarantee on every failing path** — `client/src/merge.js`: `degrade()` seats
   rows home, unhides them and un-covers the host's rows; it now runs when there is no
   outlet, when the group is missing (and keeps watching the outlet so a late group still
   merges), when a move fails mid-pass, and in the catch. Before/after on the fixture:
   5/5 stranded → 0/0.
3. **`file` off the wire** — `lib/system-fonts.js` no longer copies the path into a
   catalogue entry; `lib/font-route.js` projects a whitelist so a field added later cannot
   leak. Measured saving **20,954 B of 76,160 B (27.5 %)**.
4. **Hostile registry paths + child-process timeout** — `lib/font-metadata.js`
   (`Test-FontPathCandidate`, applied before the first `Test-Path`);
   `lib/system-fonts.js` (`timeout: 20_000`, killed children contribute nothing;
   registry rows no longer carry the file value into Node at all).
5. **Shadow-root sweep** — `client/src/chrome.js`: one document walk instead of two,
   detached hosts pruned (and never painted), fired timer ids removed from the teardown
   list; `hostCount`/`timerCount` introspection for the tests.
6. **CSS robustness** — `client/src/typography.js`: control characters stripped in
   `quoteFamily` (same set as the host's own `normalizeFontFamily`), and a family that
   cannot be quoted emits **no** token instead of the default stack.
7. **Store robustness** — `client/src/settings.js`: a rebuild failure is logged, not
   thrown into the committing event handler.
8. **Cover re-assertion** (finding 8) — already in the tree when I finished; kept, and the
   invariant is now pinned by a test.

---

## Left unfixed (with the patch)

- **9 — CSSOM scan per rebuild.** Patch sketch: split `readDeclaredToken` into a
  one-pass collector (`collectDeclaredTokens(names, skip) -> Map`) used by `buildCss`;
  keep the exported single-token reader for the tests. Estimated 34 walks → 1 per
  rebuild. Not done because every non-compounding test pins the read path
  (`readDeclaredToken`'s inline-first/`tight`-before-`loose` rules and the `skip` own-sheet
  rule) and a refactor of it is not a "safe" change in a review pass.
- **10 — seat order after collapse.** Patch sketch: record the outlet **index** at mount
  (`Array.prototype.indexOf.call(home.parent.children, el)`) and insert before the current
  child at that index, falling back to `home.next`. Not done: no user-visible symptom was
  found, and every extra DOM write in `seat()` is a new chance to wake the observer.
- **8 — cover/style disagreement.** The tree's fix covers it; an end-to-end reproduction
  needs a browser (React re-render resetting an inline style we cannot observe from Node).
- **Host-surface residuals** (no patch needed, listed for the record): the route returns
  `error.message` in its 500 body (same-origin only now); the catalogue has no entry cap
  (bounded by installed fonts today, 523); `readPowerShellFamilies` still decodes `reg`/
  PowerShell output as UTF-8 — it demonstrably works on this machine (523 families, 35 with
  CJK names from the registry) but would produce mojibake under a non-UTF-8 console codepage.

---

## Area 2 — every locator, and what a miss looks like

| Locator | Depends on | On a miss |
|---|---|---|
| Outlet `[data-slot="settings.general.item"]` (`merge.js:409-426`) | `dsh-client-ui-renderer` publishing `data-slot` (`lib/client.js:1124`) and the host's own stylesheet using it (`settings-general` `GeneralSection.module.css`). | Rows stay at their slot orders (12–16) as ordinary settings entries; nothing hidden. |
| Group: a direct child of the outlet whose subtree has `button[aria-expanded][aria-controls]` **and** a descendant whose text is exactly `px` (`merge.js:220-234`, `438-449`) | The host's `FontSizeRow` disclosure button (`ui-theme/lib/client.js:1284-1290`) and `fontSize.unit` = `px` in both dictionaries (`:1280`, `:1480`). | First fallback: any child carrying a family input. If that also misses → rows stay visible at their slot positions. |
| Group fallback: a child with a family input — `input[maxlength="200"]`, placeholder `默认`/`Default`, or aria-label ∈ {正文字体, 代码字体, 终端字体, Text font, Code font, Terminal font} (`merge.js:163-171`) | `FontFamilyRow` passing `maxLength: 200`, `fontFamily.placeholder`, `fontFamily.<role>.title` (`ui-theme`: `:1209`, `:1487`, `:1481-1486`). | No group → degrade (finding 2's fix guarantees seating). |
| Region: the group's non-control child containing a family input (`merge.js:462-472`) | The host rendering `{open && <div id={regionId}>}` (`ui-theme`: `:1319-1355`). | Any other group child = "unrecognized shape" → seat home, show rows, hide nothing. |
| Official row: row-level ancestor with exactly one family input, no expander, no `px` (`merge.js:493-509`) | The host's row markup (title + description + input in one row div). | Falls back to hiding the input alone: the title stays, the duplicate input goes. |
| Role: the input's `aria-label`/placeholder against the six host titles, else document order `text, code, terminal` (`merge.js:198-205`, `512-522`) | `fontFamily.<role>.title` in `zh`/`en`. | A third host language falls back to document order; pickers land at the end of the region, official rows are still covered. Half-ordered, never half-moved. |

A move that cannot complete is now caught (`applySequence` → `attempt` failure → `degrade`),
so "half-moved" is not reachable from any of these misses.

---

## Area 5 — lifecycle and leaks

- Observers: `merge.js` watches only the `data-slot` outlet (`childList + subtree`) and
  disconnects on `restore()`/empty; `chrome.js` watches `documentElement` and disconnects on
  teardown. `tools/audit.mjs` reports "2 observer construction(s), all disconnect".
- Timers: `lifecycle.scheduleRebuild` cancels both the rAF and the 300 ms timer;
  `chrome` clears its list on teardown and (new) removes ids as they fire.
- Listeners: `ctx.on('theme/change')` is disposed; `locale.register` returns a disposer that
  the effect returns; `locale.bind` is a cached function, not a subscription (checked in
  `dsh-client-locale/lib/client.js`). `settings.subscribe` is React's
  `useSyncExternalStore` unsubscribe.
- Disable/enable: `applied` flips false in the first effect's disposer; the next `apply`
  reinstalls one stylesheet, one panel sheet, five rows (tests: *dispose → activate…*,
  *double activation is a no-op*, *a thrown slots.inject rolls activation back*).
- `tools/audit.mjs` note "effect callback returns nothing" (`lifecycle.js:84`) is the styles
  effect; its tag removal lives in the activation effect's disposer and is covered by the
  dispose tests — verified, not a leak.
- Noted, not defects: `mirrorFamilies` + `theme/change` call `typography.apply()` twice per
  host change (idempotent, second write is skipped); `lifecycle.js:117` builds a bridge that
  is thrown away after seeding the snapshot; the module bridge keeps the host theme service
  reference after dispose (one object).

---

## Area 6 — tests that would still pass if the feature were broken

- `host.test.mjs` — *?refresh=1 is accepted and still answers a catalogue*: only checks 200
  plus an array, so it passes with `refresh` entirely ignored. (It also asserted the
  unauthenticated refresh as **correct** behaviour before this review — the test was
  protecting the hole.) The forwarding test is the one that proves the query is read.
- `host.test.mjs` — *an unparseable request URL does not fail the read*: a junk URL does not
  throw in `new URL`, so the `catch` branch it is named after is never exercised.
- `host.test.mjs` — *GET answers a real catalogue with the documented shape*: on a machine
  with no readable fonts the family assertions are skipped by the `else` branch, so it can
  pass having checked only the four top-level keys.
- `fonts.test.mjs` — *collapsed: a second pass writes nothing*: only counts `insertBefore`
  on the outlet and the group; an attribute/style write or a move into the region is
  invisible to it.
- `fonts.test.mjs` — *no host group…* and *an unrecognized group shape hides nothing*:
  they assert `attempt() === false`; a merger that always returned `false` would satisfy
  both. They prove the negative path only.
- `fonts.test.mjs` — *every rendered row carries its mark and notes itself with its role*:
  calls `props.ref(el)` on a detached element (`home.parent === null`), so it proves
  registration, not seating.
- `fonts.test.mjs` — *a corrupt stored value falls back to defaults*: its own comment admits
  it only exercises clamps, not a corrupt payload. The new seeded-storage test covers that.
- `tools/verify.mjs` — its header says "Prints, asserts nothing": the host half is a
  readout; only the client half exits non-zero.

Fixed while here: the fake `MutationObserver` ignored `observe()`'s arguments, so a merger
observing the wrong node or with wrong options would still have passed — the test now
asserts target `data-slot` outlet and `{childList:true, subtree:true}`.

---

## Area 7 — dead weight

```powershell
# nothing in the repo references these; `files` in package.json ships none of them
Remove-Item plugins/system-fonts/tools/audit-class.mjs, `
            plugins/system-fonts/tools/audit-ratio.mjs, `
            plugins/system-fonts/tools/audit-scale.mjs, `
            plugins/system-fonts/tools/audit-spacing.mjs, `
            plugins/system-fonts/tools/icons-meta.json, `
            plugins/system-fonts/pelican-bicycle.svg
```

- `tools/audit-class.mjs` (1,974 B), `audit-ratio.mjs` (666 B), `audit-scale.mjs` (4,140 B),
  `audit-spacing.mjs` (3,488 B) — each starts with `// One-off`, three of them re-implement
  the asar reader, none is in a `package.json` script, no test or tool imports them.
- `tools/icons-meta.json` (47,556 B) — a scrape of host icon paths; zero references.
- `pelican-bicycle.svg` (30,692 B, plugin root) — zero references, not in `files`.
- Kept: `tools/build-client.mjs` (the build + freshness gate), `tools/verify.mjs`,
  `tools/integration.mjs`, `test/*.mjs` — all wired into `package.json` scripts.

I did not delete them: the repository has **no commits** (`git log` → "your current branch
'master' does not have any commits yet"), so a deletion cannot be undone. Total ~88 KB,
none of it shipped.

---

## Files changed

| File | Change |
|---|---|
| `lib/font-route.js` | request fence (Host/Origin/Sec-Fetch-Site + required marker), wire whitelist, refresh cooldown, `nosniff` |
| `lib/index.js` | pass `webServer.getOrigin()` to the route lazily |
| `lib/system-fonts.js` | drop `file` from catalogue entries and registry rows; 20 s child timeout; export `execFileBuffer`; control chars in `UNSAFE_FAMILY` |
| `lib/font-metadata.js` | `Test-FontPathCandidate` guard before any filesystem probe; export the script for the test |
| `client/src/constants.js` | marker header/value constants |
| `client/src/catalogue.js` | send the marker |
| `client/src/merge.js` | `degrade()` on every unresolved/failed pass (plus the cover re-assertion present in the tree) |
| `client/src/typography.js` | control characters stripped; no token for an unquotable family |
| `client/src/chrome.js` | one document walk, prune detached hosts, drop fired timer ids, paint guard, introspection getters |
| `client/src/settings.js` | a rebuild throw is logged, not propagated |
| `client/client.js` | rebuilt artifact (fresh; 78,971 B as shipped) |
| `test/host.test.mjs`, `test/fonts.test.mjs` | +17 tests; two dishonest tests tightened |

---

## Re-verify

```powershell
cd plugins/system-fonts
npm run build          # only if client/src changed; `npm test` fails on a stale artifact
npm test               # 137 passed
node tools/verify.mjs  # exit 0
node tools/integration.mjs  # exit 0

# the fixed route, on a local listener (marker required, cross-site refused)
node $env:TEMP\sf-review\probe-route.mjs   # if that scratch copy is gone, see test/host.test.mjs
```
