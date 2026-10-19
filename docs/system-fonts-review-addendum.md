# `plugins/system-fonts` — independent review addendum

Read `docs/system-fonts-review.md` first. That document is the primary review; it was written by the
other agent working on this plugin. This addendum exists because, while I was reviewing the same
plugin (task-21), a second writer changed 15 files under it between 05:30 and 05:41. I did not write
into the plugin. What follows is the part of my review that is **not covered by the primary
document**, plus the measurements I took that independently confirm or qualify its claims.

Reproductions are in `.repro/system-fonts/` (`node .repro/system-fonts/<file>`); they stay outside
the plugin so they cannot ship.

---

## Verification of the primary document's gate numbers

Re-measured on the settled tree at **05:43** (`client/client.js` fresh against `client/src`):

| Gate | Result |
|---|---|
| `node tools/build-client.mjs --check` | `client/client.js is up to date` (exit 0) |
| `npm test` | **137 passing, 0 failed** — 113 `fonts` + 19 `host` + 5 `cordis` (was 119) |
| `node tools/verify.mjs` | exit 0, 12/12 sanity checks `ok` |
| `node tools/integration.mjs` | exit 0, wiring + strict-contract activation + artifact freshness |

Independently confirmed by reading the settled code rather than taking the claims on trust:

* **Route fence** (`lib/font-route.js:122` `refuseRequest`) — exercised as a pure function with nine
  hostile header sets (`.repro/system-fonts/.probe-fence.mjs`): `no-host`, `bad-host`, `foreign-host`
  (DNS-rebinding `Host: evil.example:62421`), `cross-site` (`Sec-Fetch-Site: cross-site`),
  `foreign-origin`, `missing-marker` are all refused; the real client's header set is admitted;
  `localhost:62421` is admitted when the listener origin is `127.0.0.1:62421` at the same port, and
  `localhost:9999` is refused.
* **`?refresh=1` cooldown** (`FORCE_COOLDOWN_MS = 5000`) — with an injected clock: forced at t=0,
  suppressed at +1000 ms and +4999 ms, forced again at +5000 ms. A manual refresh still works; an
  anonymous loop no longer spawns `powershell.exe` per request.
* **Wire shape** (`lib/font-route.js:37` `toWireCatalogue`) — entry keys are
  `family,weights,italic,symbol,gdi,localized`; `file` is absent and the serialized body contains no
  drive-letter path. (Pre-fix measurement, for the record: 480 of 523 entries carried `file`, 198 of
  them absolute, in a 75,870-byte body.)

A note on live numbers in the primary document: the DSH process that served my probes at 05:20 was
still running the **old** host half, which is why my pre-fix `200`/76 KB figures are reproducible
and the post-fix `403` figures are not, until the app restarts. Both documents say this; the
distinction matters if anyone re-runs the live check.

---

## New finding A — High, open: the seat guarantee covers removal, not placement

**Where** `client/src/merge.js:296` (`seat`), `:341` (`note`), `:302` (`insertBefore`).

The primary document's finding 2 fixes the case where the host group disappears (rows stranded in a
removed subtree, hit by React's `removeChild`). That is one half of the hazard. The other half is
React's **placement** path, and it is unaddressed by `seat()` because nothing is being detached:

```
React places a new host node with insertBefore(parent, node, before),
where `before` is the next host sibling's stateNode in the FIBER tree.
A merged row is still a fiber sibling of the outlet — but its parentNode is now the region.

outlet.insertBefore(newNode, mergedRow)
→ NotFoundError: The node before which the new node is to be inserted is not a child of this node
```

The throw happens inside React's mutation phase, before any ref callback or MutationObserver
callback of ours runs, so there is nothing for the merger to catch or repair.

**Reproduction** `.repro/system-fonts/.probe-detach.mjs` — a strict DOM (real `NotFoundError`
semantics for `removeChild` and for a non-child `insertBefore` reference) driving ten scenarios:

```
path 1  row unmounts from inside the region                 ok
path 2  page unmount, rows removed after the group is gone  ok
path 3  row unmounts while collapsed                        ok
path 4  row unmounts inside the orphan window               ok
path 5  dispose then unmount                                ok
path 6  HMR remount of a slot                               THROW NotFoundError
path 7  React inserts a sibling anchored on a merged row     THROW NotFoundError
path 8  React reorders the outlet                           ok
path 9  collapse pass then unmount                          ok
path 10 two rows unmount in one commit                      ok
```

So the answer to "does `seat()` hold on every detach path?" is **yes for detach** — all eight
removal paths survive, including the orphan window and the group-disappears case — and **no for
placement**. Paths 6 and 7 are the same defect seen twice.

**Reachability.** Any `settings.general.item` occupant that mounts while the font group is expanded
and sorts before one of our rows (orders 12–16). In this profile that is not hypothetical:
`dsh-cds-theme` registers a row at **order 10** and is listed *after* `dsh-system-fonts` in
`~/.dsh/profiles/desktop/package.json`; enabling a plugin from the plugin manager while Settings →
General is open has the same shape, as does HMR. The other writer's own reasoning about React's
`removeChild` applies verbatim to `insertBefore`.

**Why it is still open.** The only complete fix stops moving React-owned nodes: render a React-owned
outer element that never moves (the sibling anchor React will resolve) and move only an inner
wrapper the plugin creates. That changes the row DOM shape, the `.dsf-row` geometry, the
`data-dsf-row` contract and ~30 assertions — and it would have raced the concurrent writer in
`merge.js`.

**Patch sketch.**

```js
// panel.js — the seat is what React owns and keeps in the outlet
React.createElement('div', { className: 'dsf-seat', 'data-dsf-row': slot.id, ref: bindRef },
  React.createElement('div', { className: 'dsf-row' }, /* title, desc, control */))

// merge.js — move/cover the inner row; never move rec.el itself
function movable(rec) {
  return rec.el && rec.el.firstElementChild ? rec.el.firstElementChild : rec.el
}
// seat() then needs one extra step on unmount: put the inner row back INSIDE the seat
// before React removes the seat (same ref-cleanup call it already makes).
```

`.dsf-seat { display: contents }` keeps layout identical, and the `data-slot` outlet styles that
target `> *` still see a direct child.

## New finding B — Medium, open: the test DOM cannot fail the way a browser fails

**Where** `test/fonts.test.mjs:314` (`insertBefore`) and `:322` (`removeChild`).

```js
insertBefore(child, ref) {
  ...
  const i = ref === undefined || ref === null ? -1 : this.children.indexOf(ref)
  if (i < 0) this.children.push(child)      // a FOREIGN ref silently becomes an append
},
removeChild(child) {
  const i = this.children.indexOf(child)
  if (i >= 0) this.children.splice(i, 1)    // removing a NON-CHILD silently succeeds
}
```

A browser throws `NotFoundError` in both cases. Consequence: **no test in the 137 can express the
crash this plugin's central fix exists to prevent.** Delete `seat()` and the strict fixture fails
instantly (that is exactly what `.probe-detach.mjs` shows) while the shipped shim passes. Finding A
is invisible for the same reason, and so is any future regression of the same class.

**Patch.** Give the shim a `strict` mode used by a new test block, and port the ten scenarios from
`.probe-detach.mjs` (≈120 lines including its own DOM). `tools/integration.mjs`'s client-bundle shim
has the same leniency; the unit suite is the higher-value place to fix it.

## New finding C — Medium risk, open: the Host fence versus a reverse-proxy deployment

**Where** `lib/font-route.js:122` (`refuseRequest` compares `Host` against `webServer.getOrigin()`).

`dsh web --public-url https://example.com` is a supported deployment (`dsh-web-app/lib/index.js:140`
and its README). Behind it the browser sends `Host: example.com` while the listener's own origin is
`http://127.0.0.1:PORT`, so the fence answers `foreign-host` and the picker degrades to the manual
input. The host solves this for `/api` through `trustedHosts` inside
`isTrustedApiRequest` (`dsh-client-connection/lib/index.js:240`); the plugin's own fence cannot see
that list.

This is a **suspicion, not a measurement** — I did not stand up a proxy, and the listener here binds
loopback. It is a code-path reading plus the documented `--public-url` support.

**Patch.** Delegate to the host's fence when the service exists, keeping `refuseRequest` as the
fallback for compositions without it:

```js
// lib/index.js
const connection = (() => { try { return hostCtx.get('connection') } catch { return undefined } })()
const guard = connection && typeof connection.requestRejection === 'function'
  ? (req) => connection.requestRejection(req)   // 401/403/undefined
  : undefined
// font-route: a host rejection wins; refuseRequest still runs when guard is absent
```

Keep the marker header in every case — it is the only cross-site defence a bare route owner has.

## New finding D — Low, open: the marker header has two sources of truth

**Where** `lib/font-route.js:26-27` and `client/src/constants.js:14-15`. Host and client bundles
cannot import each other, so `x-dsh-system-fonts: 1` is hand-duplicated. If either side changes, every
catalogue request becomes a silent `403` and the picker degrades to a bare text field with nothing
the user can act on. One assertion in `test/host.test.mjs` that reads both files and compares the
literals removes the failure mode (the test already imports from `../lib/font-route.js`).

## New finding E — Low, open: GDI enumeration still decodes the wrong charset

**Where** `lib/system-fonts.js:197-213`. The primary document lists this as "demonstrably works on
this machine". It does — every GDI name here is ASCII (7,421 bytes of stdout, **0 bytes ≥ 0x80**).
The decoder is nevertheless wrong for any non-ASCII name, and that is measurable without such a
font: `.repro/system-fonts/.probe-charset.mjs` runs the same child and asks it for a known
non-ASCII string.

```
default console encoding (what readPowerShellFamilies gets):  "????","Segoe UI"     lossless? false
with [Console]::OutputEncoding = UTF8 (what font-metadata.js does):  "华文楷体"      lossless? true
```

`lib/font-metadata.js` already sets `[Console]::OutputEncoding`; this script does not. The BOM
concern in its comment is already handled by the per-line `.replace(/^\uFEFF/, '')`. Patch is five
lines: add `'[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)'` as the first
script line.

---

## Still open, in one list

1. **A** — placement-path `NotFoundError` (High; needs the seat/wrapper change).
2. **B** — strict DOM in the test harness plus the ten-scenario matrix (Medium).
3. **C** — proxy/`--public-url` compatibility of the fence (Medium risk; delegate to `connection`).
4. **D** — marker constant duplication (Low; one test).
5. **E** — GDI charset (Low; five lines).
6. From the primary document: the per-rebuild CSSOM scan (its finding 9) and `seat()` order after
   collapse (its finding 10). My measurement of the former at shipped order of magnitude:
   58 stylesheets × 24 rules → **47,328 `getPropertyValue` calls and 0.92 ms median per state
   change** (`.repro/system-fonts/.probe-cost-real.mjs`), i.e. ~55 ms/s of main-thread CSSOM work
   during a 60 Hz slider drag, scaling linearly with the CSSOM.

## What is genuinely in good shape

Worth stating because the density of findings above can read as a verdict on the whole plugin:

* The **removal-side detach guarantee is real** and covers more paths than the one that had a test.
* The **route fence, wire whitelist and refresh cooldown are correct** for a route that cannot reach
  the host's `connection` service, and fail closed on every branch I could construct.
* **No path traversal** (the route is an exact path with no parameters and reads no files), **no shell
  injection** (argument arrays, fixed scripts, `-LiteralPath`), and the response is bounded by the
  installed-font count.
* **Browser-session auth is not silently bypassed any more** — the pre-fix API/font contrast
  (`/api/settings` → 403 vs `/dsh-system-fonts/fonts` → 200 with a foreign Host) is gone after the
  restart requirement noted in the primary document.
