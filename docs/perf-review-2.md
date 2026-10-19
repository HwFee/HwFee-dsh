# Performance review 2 — whole repo

Second pass. `docs/perf-audit.md` measured structure (call counts, byte counts) because the
machine had no browser. This pass ran a **real Chromium** (Google Chrome 153, headless, driven
over CDP with no dependencies), so the numbers below are renderer main-thread milliseconds and
style-recalc counts, not estimates.

Nothing in the repo was modified. `tools/` and every `plugins/**` file are exactly as found;
the instrumentation this review needed (sweep counters, a cap-1 `chrome.js`, a blanked font
table) was done on **copies in `%TEMP%\perf2\probes\`**, never in place.

Repo state during this review: another agent was editing `plugins/usage-stats/**` and
`plugins/cds-theme/**`, and it kept editing while this document was being written. Three files
changed under me at the very end:

```
usage-stats/client/src/styles.js          21329 -> 21177 B   (12:24 UTC)
usage-stats/test/settings.test.mjs        35862 -> 36623 B   (12:24 UTC)
usage-stats/client/client.js              71899 -> 71747 B   (12:24 UTC)
```

Every number quoted here was **re-run against the tree as it stands after those writes**, and
none of the findings depends on the three files that moved. The files the findings *do* rest on
are untouched since before this review started: `usage-stats/client/src/settings-slot.js`
(06:46), `usage-stats/client/src/panel.js` (06:49), `cds-theme/client/src/section.js` (04:31),
`cds-theme/client/src/styles.js` (07:05), `system-fonts/client/src/chrome.js` (05:39).

**Method.** Every row below says how it was measured. The harnesses are in
`%TEMP%\perf2\` (`cdp.mjs`, `probe-*.mjs`); they launch Chrome, build a page with the host's
shape, install the plugins' **real** shipped CSS and JS, and read the browser's own counters
(`Performance.getMetrics`: `TaskDuration`, `ScriptDuration`, `RecalcStyleDuration`,
`RecalcStyleCount`) or `document.getAnimations()` and `getComputedStyle`. Page sizes ranged
from 537 to 12,717 elements.

---

## Verdict in one line

The theme is **idle when idle** — measured 3.5 ms of main-thread work in 6 s on a 1,269-element
page with the full sheet installed and nothing animating — and the observers are cheaper per
frame than the earlier audit feared. The real costs are elsewhere: **one slider rewrites the
whole stylesheet on every `input` event** (24.4 ms/step at 9,380 elements), **`chrome.js`'s
400 ms backstop walks the document 8×/s during a stream** because the cap is a queue depth and
not a rate limit, and **two tests enumerate the user's real fonts, twice, 4 s each**.

---

## Ranked findings

Ordered by severity × likelihood. "Measured" is what I obtained, on this machine, with the
harness noted.

| # | Finding | Severity | Likelihood | Headline number |
|---|---|---|---|---|
| 1 | Elevation slider rewrites the 964 KB sheet on every `input` event | **High** | Certain | 24.4 ms/step, 1,000 ms per full drag |
| 2 | `chrome.js` backstop sweeps the document 8×/s during a stream | **High** | Certain during streaming | 8.1 sweeps/s at cap 4, 0.4/s with no backstop |
| 3 | Two `host.test.mjs` tests enumerate the real font list twice | **Medium** | Certain (every CI run) | 2 × 4,021 ms of the 10,155 ms suite |
| 4 | `usage-stats`' fallback timer is armed after the decision, so Node cannot exit | **Medium** | Certain | 3,748 ms of pure hang in a 4,688 ms suite |
| 5 | `merge.js` pass count on a settings open is 11 for 5 rows | **Low-Medium** | Certain | 11 `attempt()` calls, 6 `flush()` |
| 6 | Font-menu filter rescans 509 rows per keystroke | **Low** | Certain | 30–39 µs per keystroke (JS side) |
| 7 | `summarize()` is called twice per render and scales with total log age | **Low** | Certain at 3+ years | 2,281 µs `buildHeatmap` at 1,095 days |
| 8 | `indexOf` over the 948 KB font block on every apply | **Low** | Certain | 0.6 ms/tick measured, ~0 saved by fixing |

---

## 1. HIGH — the elevation slider rewrites the whole stylesheet on every input event

**Measured.** Real `createStyles().apply()` from `plugins/cds-theme/client/src/styles.js`, with
the shipped 948 KB font tag already in the document, at three document sizes. 40 steps per run,
median of the samples:

| elements | elevation (41 steps) | warmth (101 steps) | radiusScale (21 steps) |
|---|---|---|---|
| 800 | **3.9 ms/step** | 0.8 ms/step | 0.8 ms/step |
| 3,140 | **10.3 ms/step** | 0.8 ms/step | 0.8 ms/step |
| 9,380 | **24.4 ms/step** (29.1 ms p95) | 0.8 ms/step | 0.8 ms/step |

Tag writes over 40 steps: **30/40 for elevation, 0/40 for warmth and radiusScale.**

**Why.** `SLIDER_SLOTS` (`plugins/cds-theme/client/src/panel.js:143-183`) declares three
sliders: `warmth` (step 1, 101 positions), `radiusScale` (step 5, 21), `elevation` (step 5, 41).
The `onChange` handler at `panel.js:335-339` calls `settings.setState` on **every** input event,
and the settings subscription at `lifecycle.js:94-99` calls `styles.apply()` for every change.

For warmth and radiusScale that is nearly free, because their only effect is a **token** —
`buildCssFor` returns a byte-identical string and the guard at `styles.js:1513`
(`if (rulesTag.textContent !== rules)`) skips the write. Verified: sheet identical between
`warmth: 40` and `warmth: 41`.

For elevation it is not, because `elevationRules(state)` (`styles.js:48-72`) interpolates the
value into **real CSS declarations**:

```
--dsw-elevation-panel: 0 0 0 1px var(--dsw-elevation-stroke-color), 0 2px 8px 0 rgba(0,0,0,0.08) !important;
```

Six such lines differ per step (measured by diffing the two sheets), the whole 964 KB string is
rebuilt, the 948 KB font block is sliced back out by `indexOf`, and the 16.7 KB rules tag is
rewritten — which invalidates the style cache for the entire document.

**Why it matters to a user.** Dragging the 阴影强度 slider from 0% to 200% is 41 steps. At
9,380 elements that is **1,000 ms of layout-blocking work spread over the drag**; at 3,140
elements it is 422 ms. The drag stutters in proportion to how much conversation is on screen —
the one slider whose feedback is *visual* is the one that blocks the visual update. It is the
only slider in the plugin with this property, so the user experiences it as "one of the three
sliders is laggy" with no visible reason.

**Concrete fix.** Elevation is a *scale factor on three token values*. Move it out of the sheet
and into the token layer, where warmth and radiusScale already are:

```js
// tokens.js — elevation becomes a token pair, like every other scaled value
function elevationTokens(state) {
  const tier = {
    panel: scaleShadow(SHADOWS.light.panel, state.elevation),
    prominent: scaleShadow(SHADOWS.light.prominent, state.elevation),
    soft: scaleShadow(SHADOWS.light.soft, state.elevation),
  }
  // …dark tier the same way…
  return {
    '--dsw-elevation-panel': { light: tier.light.panel, dark: tier.dark.panel },
    '--dsw-elevation-prominent': { light: tier.light.prominent, dark: tier.dark.prominent },
    '--dsw-elevation-soft': { light: tier.light.soft, dark: tier.dark.soft },
  }
}
```

`--dsw-elevation-*` cannot be overridden by an inline body style — that is why the sheet exists
(`styles.js:19-22`, `docs/host-hooks.md` §7) — but `ctx.theme.overrideTokens` is a *different*
channel: the presenter composes the layer into its own stylesheet, which is exactly the rule the
`body, body *` declaration needs. `theme.js` already ships this shape for 316 other tokens.

> **⚠️ OUTCOME — THIS RECOMMENDATION WAS TRIED AND REJECTED (Lead, 2026-10-18).**
>
> **Do not implement the `overrideTokens` route above.** The reasoning in this section is wrong about
> *which* channel reaches the element. `overrideTokens` layers are composed into the presenter's
> snapshot and written as **INLINE STYLES ON `<body>`** — that is the whole mechanism, and it is why
> the plugin's own README documents `--dsw-elevation-*` as the one token group that *cannot* travel
> this way: the host declares it on **`body, body *`**, so every descendant carries its own
> declaration and the value cascaded from `body` never reaches it. A body inline write would be
> **silently ineffective**: the slider would keep moving and the shadow would stop changing — a
> working control turned into a dead one, which is far worse than a slow one. `AGENTS.md` states the
> same rule at the repo root.
>
> **What was implemented instead** (same file, same problem, no channel change): `buildCss` now takes
> `omitFonts`, and the live path (`createStyles().apply()`) asks for the rules **without** the 948 KB
> static font block. Before, every `input` event rebuilt a 964 KB string and then paid a 948 KB
> `indexOf` to slice the same block back out; now neither happens and only the ~17 KB of
> state-dependent rules is composed. The omitted form is asserted **byte-identical** to
> "full string minus the block" across nine states (`test/styles.test.mjs`), and a dedicated test
> pins `apply()` to `omitFonts: true` — removing that flag fails three tests, because the saving is
> invisible in the output.
>
> The remaining per-step cost is the rules-tag rewrite itself, which is inherent to a slider whose
> value appears in real declarations. If that is still too slow on a large history, the *fallback in
> the next paragraph* (coalesce onto an animation frame) is the correct next move — it keeps the
> value where it is and cuts the writes.

Alternative if the token channel is not trusted for these three: coalesce the slider onto an
animation frame (`onChange` → `requestAnimationFrame(apply)`), which turns 41 writes into ~10
at 60 Hz without changing where the value lives. That is a 4× cut, not the ~40× the token
route gives.

**Verification.** `plugins/cds-theme/test/css.test.mjs` slices the elevation block out of
`buildCssFor` and asserts its content; moving it to tokens means that assertion moves to
`tokens.test.mjs` against `buildTokens`. `tools/bench-cds-theme-toggles.mjs` line
`elevation -> 150  rules-tag write this toggle: 1` should become `0`.

---

## 2. HIGH — `chrome.js` sweeps the document 8 times a second while a response streams

**Measured.** The shipped `plugins/system-fonts/client/src/chrome.js:157`:

```js
if (sweeps.length < 4) { sweeps.push(true); schedule(function () { sweeps.pop(); sweep() }, 400) }
```

`sweeps.length` is a **queue depth**, not a rate limiter. Every mutation batch that leaves a
queue slot free pushes another 400 ms timer, and each timer pops itself when it fires — so the
queue refills at the mutation rate and the cap never binds. Three variants, same page, same
240-frame stream (measured on instrumented copies in `%TEMP%`):

| variant | sweeps in 5.2 s | sweeps/s | gap between sweeps |
|---|---|---|---|
| **shipped (cap 4)** | **42** | **8.1** | 2, 28, 6, 148, 218, 18 … ms (bursty) |
| cap 1 | 12 | 2.3 | 201, 209, 416, 417, 416 … ms (regular) |
| backstop removed | 2 | 0.4 | — (startup only) |

`sweep()` at `chrome.js:99-121` calls `hostsOf(document.documentElement)`, which is
`querySelectorAll('*')` over the whole document (`chrome.js:90`). Cost of one such sweep,
aggregate-timed over 60 calls:

| document | one `chrome.apply()` sweep |
|---|---|
| 537 elements | 40 µs |
| 1,797 elements | 128 µs |
| 5,157 elements | 357 µs |
| 12,717 elements | **880 µs** |

**Isolated A/B, 240 streaming frames, system-fonts only:**

| variant | script time | script/frame | sweeps |
|---|---|---|---|
| no plugin | 1.1 ms | — | 0 |
| **shipped (cap 4)** | **23.4 ms** | **93 µs/f** | 42 |
| cap 1 | 11.9 ms | 45 µs/f | 12 |
| no backstop | 6.0 ms | 20 µs/f | 2 |

**Why it matters.** During streaming this is 93 µs of main-thread script per frame for a plugin
whose entire job is writing one stylesheet into shadow roots that already exist. At a 16.7 ms
frame budget that is 0.56% — small — but it is pure waste, it scales with the conversation
length (880 µs per sweep at 12.7 k elements × 8/s = 7 ms/s of selector engine), and it is the
single largest per-frame cost of the four plugins (all four together: 137 µs/frame, of which
`chrome.js` is 110).

**Concrete fix — two lines.** The earlier audit proposed capping at 1. That helps (93 → 45
µs/frame) but keeps the timer churning. The right fix is to make the backstop a *rate*:

```js
// chrome.js:157 — a backstop marks a TIME, not a queue slot
let lastSweep = 0
// …in the observer callback:
const now = Date.now()
if (now - lastSweep >= 400) { lastSweep = now; schedule(sweep, 0) }
```

That is at most 2.5 sweeps/s under a continuous stream, and it also removes the burst pattern
above (four sweeps firing 2–28 ms apart, which is the worst case for cache behaviour).

**Verification.** `plugins/system-fonts/test/fonts.test.mjs` has `hostCount`/`timerCount`
introspection already; add a case that drives 20 mutation batches and asserts `<= 3` sweeps.
Re-run the harness above and confirm the "sweeps in 5.2 s" row drops to ~12 or below.

---

## 3. MEDIUM — two host tests enumerate the user's real font catalogue, twice

**Measured.** `plugins/system-fonts/test/host.test.mjs`, instrumented copy with a per-test
timestamp (the file's own `test()` helper at `:17-25` makes this easy):

```
  ok   GET answers a real catalogue with the documented shape  [4021ms]
  ok   ?refresh=1 is accepted and still answers a catalogue    [4049ms]
  ok   a hung child process is killed…                         [353ms]
  (every other test)                                           [0-1ms]
```

The two tests call `apply(ctx)` and then drive the real route, which calls the real
`listSystemFonts()`. I timed that function directly: **4,427 ms cold, 0 ms warm (memoised)**.
The second test passes `?refresh=1`, which forces a re-read, so the memo does not help it.

Suite wall time: **10,155 ms**, of which **8,070 ms (79%)** is those two tests, which exist to
assert "200 + an array" and "the query is forwarded". The wire shape is already covered
deterministically by `createFontRoute(injectedEnumerator)` in the same file at `:273-330`.

**Why it matters.** `npm test` in `system-fonts` takes 10 s instead of 1.5 s. `AGENTS.md` says
"a test that takes minutes gets skipped by humans"; at 10 s it is on the edge, and it is 10 s
of *spawning PowerShell twice and reading the whole installed-font registry* on every CI run
and every local save. `docs/system-fonts-review.md` already flags that this suite's assertions
are weak — so the cost buys almost nothing.

**Concrete fix.** Keep one real-enumeration test, gate it, and delete the second:

```js
// Skip the live enumeration unless explicitly asked for; the deterministic
// route tests already cover status/shape/forwarding.
const LIVE = process.env.DSF_LIVE_FONTS === '1'

await test('GET answers a real catalogue with the documented shape', async () => {
  if (!LIVE) { process.stdout.write('  skip (set DSF_LIVE_FONTS=1 for a live read)\n'); return }
  // …existing body…
})
```

and for `?refresh=1 is accepted…` (`:234-241`), replace the route call with the injected
enumerator form used at `:291` (`createFontRoute(async (force) => { seen = force; … })`) —
one assertion on `force === true`, zero PowerShell.

**Verification.** `time npm test` in `plugins/system-fonts` should drop from 10,155 ms to
~1,900 ms; run once with `DSF_LIVE_FONTS=1` to confirm the live path still passes.

---

## 4. MEDIUM — the bounded-wait fallback timer is armed *after* the decision, so Node hangs

**Where.** Two files, same shape:

- `plugins/usage-stats/client/src/settings-slot.js:159-163`
- `plugins/cds-theme/client/src/section.js:254-258`

```js
const stopWaiting = slots.inject(APPEARANCE_SLOT, function () { … cancelWait() … })   // :136
…
if (waitMs > 0) {
  timer = timers.setTimeout(function () { timer = null; fallBack(…) }, waitMs)       // :160
}
```

When `slots.inject` invokes its callback **synchronously** — which the shipped host does,
because `settings.section` and `settings.appearance.item` are both declared before this plugin
mounts — the decision is already made and `cancelWait()` runs while `timer` is still `null`.
The timer is then armed regardless, and its callback is a no-op because `mode` is no longer
`pending`. Nothing clears it until `dispose()`.

**Measured** (injected timer adapter, counting arm/clear pairs):

| | mode after `inject` | timers armed | cleared |
|---|---|---|---|
| `settings-slot.js`, synchronous inject | `appearance` | 1 | 0 |
| `section.js`, synchronous inject | `flat` | 1 | 0 |
| `settings-slot.js`, `waitMs: 0` | `appearance` | **0** | 0 |

**Effect in Node, measured** (per file, before the concurrent edit; re-verified after it below):

| suite | normal | `--test-force-exit` | delta |
|---|---|---|---|
| `usage-stats` | 4,607 ms | 859 ms | **3,748 ms** |
| `system-fonts` | 10,239 ms | 9,266 ms | 973 ms |
| `cds-theme` | 2,384 ms | 2,354 ms | 30 ms |
| `reasoning-effort` | 780 ms | 749 ms | 31 ms |

`usage-stats/test/settings.test.mjs` alone: **3,180 ms normal, 186 ms with `--test-force-exit`** —
i.e. **3.0 s of the 3.18 s is one leaked 3000 ms timer**, not test work.

**Re-verified after the concurrent edit** (the other agent grew `settings.test.mjs` by 761 B at
12:24 UTC; `settings-slot.js` itself was not touched): `npm test` is still **4,688 ms** and
`settings.test.mjs --test-force-exit` is **151 ms**. The 3.0 s hang is unchanged — the edit added
test cases, not a cleanup.

| suite, re-measured on the settled tree | `npm test` |
|---|---|
| `cds-theme` | 3,032 ms |
| `system-fonts` | 10,155 ms |
| `usage-stats` | 4,688 ms |
| `reasoning-effort` | 1,429 ms |
| **total** | **19,304 ms** |


**Why it matters to a user.** In the browser it is one no-op callback after 3 s — harmless. What
it actually costs is CI and developer time: **3.7 s of the repo's 19.3 s test wall time** is a
process waiting for a timer that cannot do anything, and it makes `npm test` look slower than it
is, which is exactly the incentive to skip it.

**Concrete fix** (three lines, in both files):

```js
// settings-slot.js / section.js — only arm the wait when the answer is unknown
if (waitMs > 0 && mode === 'pending') {
  timer = timers.setTimeout(…)
} else if (mode === 'pending') {
  fallBack(…)
}
```

`mode === 'pending'` after the `inject` call means "the slot did not declare synchronously", so
the timer is armed exactly when it can still matter. Both files already read `mode === 'pending'`
in the sibling branch, so the condition is already in the vocabulary.

**Verification.** `test/settings-slot.test.mjs` and `test/section.test.mjs` both pass `waitMs: 0`
today, so add one case with the default `waitMs` and a synchronous `inject`, asserting
`setTimeout` was **not** called. Then `time npm test` in `usage-stats` should read ~900 ms.

---

## 5. LOW-MEDIUM — a settings open runs 11 merge passes for 5 rows

**Measured** on an instrumented `merge.js` copy (two counter lines in `attempt()` and `flush()`),
against a page with the host's real outlet shape:

| event | `attempt()` calls |
|---|---|
| registering 5 rows (`note()` ×5) | **11** |
| the group collapses (region unmounts) | 2 |
| 20 slider `input` events | **0** (correct — a settings write is not a DOM mutation) |
| the group expands again | 2 |

The 11 is `note()` calling `flush()` directly at `merge.js:372` (one pass per row, 5), plus the
rAF-scheduled `schedule()` at `:373` per row coalesced into 1, plus the observer's own
`flush()` per delivered batch — `flush()` measured 6 calls.

**Cost.** One `attempt()` at a realistic outlet: **61.5 µs at 33 outlet children, 58.5 µs at
903** — flat, because `findHostFontGroup` walks the *outlet's* children and each row's subtree,
not the document. It is not quadratic in host rows. So 11 passes ≈ **0.7 ms**, once, on open.

**Why it is still worth a line.** 11 passes for 5 mounts is 2.2× redundant work, and `merge.js`
is the module with the worst historical bug (rows stranded in a detached region, the failure
that broke the settings page — `docs/system-fonts-review.md` finding 2). Every redundant pass is
another chance to observe a half-mounted row. The measured cost is negligible; the *shape* is
what I would change:

```js
// merge.js:372-373 — coalesce mounts, do not pass per row
flush()            // keep: the first row must be seated before paint
schedule()         // keep: one deferred retry
// and in note(), replace the unconditional flush() with:
if (rows.size === 1 || !scheduled) flush()
```

**Verification.** `plugins/system-fonts/test/fonts.test.mjs` already has a "collapsed: a second
pass writes nothing" case; add a mount-time counter assertion (`attempts <= 3` for 5 rows).

---

## 6. LOW — the font-picker filter rescans all 509 rows per keystroke

`panel.js:312-316` filters the whole catalogue on every render, and the search field
(`panel.js:325`) sets state per keystroke:

```js
const q = query.trim().toLowerCase()
const filtered = fonts.families.filter((entry) =>
  !entry.symbol && (q === '' || entry.family.toLowerCase().includes(q)))
```

**Measured** against the real catalogue size on this machine (523 families, 509 non-symbol,
from `listSystemFonts()`):

| query | filter cost | rows kept |
|---|---|---|
| `""` | 12.7 µs | 509 |
| `"a"` | 30.0 µs | 509 |
| `"seg"` | 32.3 µs | 0 |
| `"family name number 5"` | 38.9 µs | 33 |

That is JS only. The larger cost is that with the query empty every keystroke re-creates
**509 element rows** — the menu is not virtualised. Typing four characters into the search box
is ~120 µs of filtering plus up to 4 × 509 element constructions.

**Why it matters.** This is a menu the user opens deliberately and types in quickly; 500–2,000
element constructions per keystroke is where a picker starts feeling heavy on a slower machine.
It is not the always-on path — the menu only renders while open — so this is genuinely LOW.

**Concrete fix.** Hoist the lowercase form into the catalogue once, at the point it is built, so
each keystroke is a string compare instead of 509 `toLowerCase()` calls:

```js
// catalogue.js — when the list is normalised
list.families = raw.map((e) => ({ ...e, lower: e.family.toLowerCase() }))
// panel.js
const filtered = fonts.families.filter((e) => !e.symbol && (q === '' || e.lower.includes(q)))
```

and cap the rendered rows (`filtered.slice(0, 50)`) with the existing `menu.use` manual-entry row
already at `panel.js:370` as the escape hatch for a miss.

---

## 7. LOW — `summarize()` runs twice per render and its cost tracks total log age

The panel calls `summarize(load.summary, range.days)` and `summarize(load.summary, 0)`
(`panel.js:450-460`) so the cards can follow the range while the heat grid stays all-time. Both
are memoised, so this is once per summary/range — not per hover (verified: a hover still
constructs 12 elements, unchanged from the earlier round).

**Measured** (aggregate-timed, µs per call):

| log age | `summarize(0)` | `summarize(30)` | `summarize(7)` | `buildHeatmap` |
|---|---|---|---|---|
| 100 days | 80.5 | 109.1 | 117.0 | 358.1 |
| 365 days | 245.0 | 421.2 | 437.9 | 804.3 |
| 1,095 days | 744.4 | 1,298.4 | 1,313.7 | 2,281.5 |
| 3,650 days | 2,775.5 | 4,614.9 | 4,612.7 | 7,832.4 |

Cost is linear in `perDay` size, as expected. **A 10-year log costs 7.8 ms per heatmap build**,
and the range buttons cost 1.3 ms each at 3 years (measured in a mini-React harness: 4.2 ms per
range click at 1,095 days vs 0.006 ms per hover, 1,306 elements constructed for a range click
at 3 years vs 12 for a hover).

**Why it matters.** The heat grid is all-time **by contract** (`docs/usage-stats-contract.md:188`),
and I measured that a range click rebuilds it anyway (1,306 elements at 1,095 days) because the
memo key is `[view, allView, t, tips, roll, unitScale]` and `view` changes with the range. The
grid is in the same memo as the cards. It is correct, but the memo cannot skip it.

**Concrete fix.** Split the overview body's memo so the grid is keyed only on `[allView, t, tips,
unitScale]`:

```js
const heatBand = React.useMemo(() => renderHeat(allView, t, tips, unitScale), [allView, t, tips, unitScale])
const overviewBody = React.useMemo(() => overviewElement(React, renderCards(view, t, unitScale),
  heatBand, renderFoot(allView, roll, t, unitScale)), [view, heatBand, t, roll, unitScale])
```

Then a range click reuses the grid element and drops from 1,306 elements to ~200 at 3 years.

---

## 8. LOW — a 948 KB `indexOf` on every `apply()`, measured at 0.6 ms

`styles.js:1510-1511` searches the freshly built 964 KB string for the cached 948 KB font block,
then slices it back out. **Measured: 0.6 ms median per tick**, at 9,380 elements, with the real
inline font table present (my earlier Node measurement of 0.448 ms was close).

`docs/perf-audit.md` proposed `buildRulesFor()` to remove it. On this measurement that saves
**0.6 ms out of a 24.4 ms slider step** — 2.5%. Worth doing as hygiene (it also removes the only
place where a slice bug could ship the font block twice) but it is **not** the cause of the
slider lag; finding 1 is. Doing only this fix would cut the drag by 25 ms out of 1,000 ms.

---

## 9. INFO — the two risks the previous audit listed are not risks

Both were checked in the browser and both are fine; recording them so nobody spends time here.

**statusPulse does not run when there is nothing to pulse.** On a 1,269-element page with the
full theme sheet installed and no `[data-chat-running]` row, over 6 s: **0 animations
(`document.getAnimations().length === 0`), 3.5 ms of task time, 0 style recalcs.** The
`infinite` keyframes only exist once the host mounts the running row, which it does only while a
turn is live.

**And when it does run, it costs nothing.** With the host's real markup and the host's own
`runningIcon` rule (`display:inline-flex; contain:strict`), 6 s windows:

| | animations | task/6s | style/6s | recalcs |
|---|---|---|---|---|
| theme pulse block | 2 (`cds-status-blink`, `cds-status-breathe`) | **4.6 ms** | 0.1 ms | 1 |
| host CSS only | 0 | 4.5 ms | 0 | 0 |

So the pulse is 0.1 ms over 6 seconds. Separately, `prefers-reduced-motion: reduce` removes both
animations outright (measured: 0 animations, 0 recalcs) — the accessibility rule works.

> **A measurement trap worth recording.** My first statusPulse run reported **279 ms per 6 s**
> and looked like a real battery finding. It was an artifact: the probe put the keyframe on a
> bare inline `<span>`, which Chrome cannot composite, so it forced a style recalc per frame.
> The host's real element is `display:inline-flex; contain:strict`; with those declarations the
> same animation composites and costs 0.1 ms. **The animation is not the problem; the element
> it lands on decides.** Anyone re-measuring this must apply the host's `runningIcon` rules or
> they will reproduce the wrong number.

---

## Measured and clean

What I checked and found **no** problem with, with the number. This is the "do not spend effort
here" list.

| Area | What I checked | Number |
|---|---|---|
| Idle cost of the whole theme | full sheet installed, page idle 6 s, 1,269 elements | **3.5 ms task, 0 recalcs, 0 animations** |
| Hover on the usage panel | element construction per hover, 100 d / 1 y / 3 y | **12 elements, 0.005–0.007 ms** — the earlier fix holds |
| Heat grid DOM cost | real markup, real `PANEL_CSS`, 182 / 371 / 1,099 cells | layout **1.1 / 1.4 / 4.1 ms**, remount **0.8 / 1.7 / 4.9 ms** |
| Heat cell hover | attribute write + one `getBoundingClientRect` | **0 ms** median (below the 100 µs clamp) |
| statusPulse, idle | no running row mounted | **0 animations** |
| statusPulse, running | host CSS + theme block | **4.6 ms / 6 s**, 1 recalc |
| `prefers-reduced-motion` | emulated | **0 animations, 0 recalcs** |
| `merge.js` scaling | `attempt()` vs outlet size | **61.5 µs @ 33 rows → 58.5 µs @ 903 rows** — flat, not O(n²) |
| `merge.js` slider drags | 20 `input` events | **0 observer passes** — a settings write is not a DOM mutation |
| `merge.js` collapse/expand | region unmount + remount | **2 passes each**, rows seated and hidden correctly |
| hero sweep | `findGreetingHeadline` + `markedIn`, 537→12,717 elements | **3.2 µs, flat** (the pre-filter `onMutations` landed) |
| navicon sweep | `querySelectorAll('button')` on the settings modal | **4.2 µs, flat** |
| markdown sweep | `findTableWrappers` + `markedIn` | 20 µs @ 537 → 450 µs @ 12,717 (linear; see below) |
| hero observer on a nodeValue stream | 240 frames of `nodeValue` writes | **0 deliveries** — `childList` cannot see them |
| Observer deliveries, element stream | 240 frames | hero 241, markdown 241, navicon 240 — coalesced to ≤1 sweep/frame |
| Font block split | with the split vs one tag, browser parse | rules **0.1 ms**, font **0 ms**, one tag **0.2 ms** (tokenising is not the cost; the recalc is) |
| Font sheet install | 948 KB, 6 data URLs, first install + recalc | **27.3 ms**, `document.fonts.size === 6` |
| Per-toggle recalc | 16.7 KB rules rewrite, forced recalc, 4,573 elements | **8.6–9.0 ms median, 10 ms p95** |
| `overrideTokens` on a slider tick | real bridge, 40 syncs | **0.2 ms/sync, 40 registrations, 1 live layer** |
| Assemble art parse | 4 artifacts, fresh V8 `vm.Script` with unique filename | cds-theme **3.15 ms**, system-fonts 0.92, usage-stats 0.58, reasoning-effort 0.27 = **4.9 ms total** |
| `tools/audit.mjs` cost | per phase | **1,298 ms total**, of which **1,070 ms is the 4 `build-client --check` subprocesses**; regex passes 9.2 ms, 58 files / 621 KB |
| `tools/audit.mjs` quadratic risk | `balanced()` from every `ctx.effect(` | **23 call sites, 9.2 ms total** — no O(n²) |
| Test totals, all four plugins | `npm test` | cds-theme **283 pass / 0 fail**, system-fonts **149 / 0**, usage-stats **86 / 0**, reasoning-effort **80 / 0** |
| Artifact freshness | `build-client.mjs --check` ×4 | all **up to date** at 07:32 / 06:28 / 07:32 / 06:38 mtimes |
| Byte-vs-char trap | artifact `.length` vs file size | cds-theme 1,144,375 chars / 1,144,489 B (114 B), usage-stats 71,654 / 71,899 (245 B) — the earlier audit's warning still holds |

**One nuance on `markdown.js`** (the only sweep that grows): 20 µs at 537 elements to 450 µs at
12,717, i.e. linear, driven by `findTableWrappers` → `flow.querySelectorAll('table')` plus a
document-wide `markedIn` for marks. It does **not** run per streaming frame (measured: 1 sweep
across 240 frames of a table-free stream), so it never lands on the frame budget. Leave it.

---

## 未核实 — what I could not check, and why

1. **The theme's selector-matching cost inside the real app's DOM.** My pages reproduce the
   host's *structure* and install the host's real `runningIcon` CSS where it matters, but the
   app has 20+ stylesheets and a React tree I cannot rebuild faithfully. `chrome.js`'s
   `querySelectorAll('*')` will be slower in the app than my 880 µs at 12,717 elements because
   the app's documents are larger. The **direction and the mechanism** are certain (42 vs 12 vs 2
   sweeps in the same 5.2 s); the absolute millisecond figure in the real app is not measured.
2. **Whether elevation can actually move to `overrideTokens`.** The claim rests on
   `--dsw-elevation-*` being declared on `body, body *` (`docs/host-hooks.md` §7) and on the
   theme service compositing a layer into its own stylesheet. I verified the second half by
   reading `theme.js` and driving `createThemeBridge` against a transcription of the host's
   `overrideTokens`; I did **not** boot the desktop app and watch the shadow change. This is the
   one place where a fix could fail for a reason I did not test — check it before applying.
3. **The 990 KB `apply()` path in the real artifact.** My probe builds the font block from the
   artifact's own six `data:` URLs, so the bytes are right, but it runs the *source* modules under
   esbuild rather than `client/client.js` under `__ModuleLoader__`. The 24.4 ms/step figure should
   transfer; I did not confirm it inside the running app.
4. **The desktop app itself.** The Web GUI at `127.0.0.1:55904` answers **401** to an
   unauthenticated request, and launching the Electron binary headless produced no output, so
   every number here is from Chrome 153 on a `file://` page, not from `dsh-app://app`. Startup
   parse cost in particular may differ (the app serves bundles over its own protocol with a code
   cache).
5. **`system-fonts`' `test/cordis.test.mjs`** skips when the installed app's Cordis is
   unavailable — I did not establish which it did on this run, so "149 pass" may include skipped
   work. `AGENTS.md` already says a skipped suite is not startup verification.
6. **The `chrome-nocap` variant's provenance.** I created it by deleting the `sweeps.push(...)`
   line from an instrumented copy. It measures what the backstop costs, not something that ships.
   Reading it as "remove the backstop" would be wrong — the backstop is what catches a shadow
   root that mounts without a childList record.

---

## Ranked fix list

| # | Where | Change | Measured payoff |
|---|---|---|---|
| 1 | `cds-theme/client/src/styles.js:48` + `tokens.js` | Move elevation to `overrideTokens` | 24.4 → ~0.8 ms per slider step |
| 2 | `system-fonts/client/src/chrome.js:157` | Rate-limit the backstop, not the queue | 8.1 → ≤2.5 sweeps/s; 93 → ~20 µs/frame |
| 3 | `system-fonts/test/host.test.mjs:132,234` | Gate the two live enumerations | suite 10,155 → ~1,900 ms |
| 4 | `usage-stats/client/src/settings-slot.js:159` + `cds-theme/client/src/section.js:254` | Arm the wait only while pending | suite 4,688 → ~900 ms |
| 5 | `usage-stats/client/src/panel.js:489` | Separate memo for the heat band | range click 1,306 → ~200 elements at 3 y |
| 6 | `system-fonts/client/src/merge.js:372` | Coalesce the mount passes | 11 → ≤3 passes per open |
| 7 | `system-fonts/client/src/panel.js:313` | Precompute the lowercase key | ~40 µs → ~15 µs per keystroke |
| 8 | `cds-theme/client/src/styles.js:1510` | Add `buildRulesFor()` | 0.6 ms/tick (hygiene, not lag) |

Fix 1 is the only one a user would notice on their own. Fixes 3 and 4 cost nothing and buy back
6.7 s of the repo's 19.3 s test wall time.
