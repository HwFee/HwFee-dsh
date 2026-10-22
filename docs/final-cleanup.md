# Final cleanup · dead code, defects and what was deliberately left

Written at the freeze point, after the reference-repo sweep and before the user's
acceptance round. Scope: `plugins/**`, `tools/**`. Nothing was committed — the
repo has no commits, so every deletion below is recorded with the evidence that
proved it dead.

**Gates at the end of this round:**

| plugin | tests | `npm test` | `verify` / `integration` |
|---|---|---|---|
| cds-theme | **284** | exit 0 | `verify` exit 0 |
| system-fonts | **149** | exit 0 | `verify` exit 0, `integration` exit 0 |
| usage-stats | **133** | exit 0 | (no verify script) |
| reasoning-effort | **80** | exit 0 | (no verify script) |

`node tools/audit.mjs` exit 0.

Delta from the expected baseline (283 / 149 / 133 / 80): **cds-theme +1**, which
is one new test, not a changed expectation — see §2.

---

## 1. Deleted (dead code)

Every entry below was found by a scan for `export`ed symbols whose name appears
in **no other file in the repo** (src, lib, test, tools all counted as
consumers, and `__internals` surfaces were counted too), then confirmed by a
second repo-wide grep.

### 1.1 `plugins/system-fonts/lib/system-fonts.js` — `WEIGHT_WORDS` (was :358-369)

A 9-entry weight-name map (`100: 'Thin'` … `900: 'Black'`). Repo-wide grep for
`WEIGHT_WORDS` returned **exactly one hit: its own definition** — no importer, no
test, no `__internals` surface. The client builds its weight labels from the
catalogue payload instead, so this table was documentation-shaped code that
nothing could ever read. Removed the whole block.

### 1.2 `plugins/system-fonts/lib/system-fonts.js` — the `export` on `CHILD_TIMEOUT_MS` (:165)

**Kept the constant, removed only the keyword.** It *is* read — at :181, one line
below, as the `timeout:` of `execFileBuffer` — but nothing outside the module
imports it. A scan flags an unused *export*; deleting the binding would have
broken the child-process timeout. `export const` → `const`.

### 1.3 `plugins/usage-stats/client/src/constants.js` — `HEAT_LEVELS` (was :56-57)

`export const HEAT_LEVELS = 5`, documented as "heatmap density steps, 0 through
4". Repo-wide grep: **one hit, the definition**. The heatmap's actual level count
is hard-coded in `stats.js:320` (`levels.set(count, rank === distinct.length ? 4
: Math.max(1, Math.floor((4 * rank) / distinct.length)))`) and the CSS enumerates
`[data-level="0".."4"]` explicitly, so the constant could never disagree with
anything and never agreed with anything either. Removed.

> **Reported, not fixed:** `stats.js:320` now carries the only copy of the "4"
> that means "top level". Deriving it from a constant would be cleaner, but that
> file is on the render path and the change buys nothing at runtime. Left as-is
> and noted here so the next reader knows the magic `4` is the level ceiling, not
> an off-by-one.

### 1.4 `buildArtifact` in all four `tools/build-client.mjs` — **NOT deleted**

The scan flags `export function buildArtifact()` as unreferenced in all four
plugins. It is a **false positive worth recording**: each script calls
`buildArtifact()` at module scope (cds-theme :62, the other three :46), so the
bare name never appears as an import. The `export` keyword is technically
unnecessary, but these are CLI entry points and keeping the function exported
costs nothing while making the script testable if that is ever wanted. Left
deliberately.

### 1.5 Scan results that needed no action

Run across all four plugins, each returning zero actionable hits:

| scan | result |
|---|---|
| `FONT_ROUTE_BASE` / `fontSourcesFor` route branch / `webServer` font routes | **genuinely gone.** The only occurrence in the whole plugin is `test/fonts.test.mjs:139`, an assertion that the constant must *not* be in the artifact. `fontSourcesFor()` is inline → `file://` base → `local()`, with no route branch. `lib/index.js` has no `webServer` service dependency; its only seam is the `webserver/index-inject` listener that publishes the fonts base. |
| retired toggles `codeBlockDetails` / `markdownBody` | 8 hits, **all comments** explaining the retirement, plus the surviving rule functions and their (intentional) call sites. No dead branch: `styles.js` has no `if (state.codeBlockDetails …)` left. |
| `segmentedThumb` | **zero** occurrences in any source file. |
| `--dus-*` custom properties | 16 written, 16 read — **exact 1:1**, no orphans in either direction. |
| orphaned scrollbar / mask / `padding-right` CSS | none. `.dus-models::-webkit-scrollbar { display: none }` pairs with `scrollbar-width: none` (both needed); no `::-webkit-scrollbar-thumb` survives; the `mask-image` is gone with a comment recording why; the `padding-right: 48px` is on `.dus-row-text` (settings rows with a right-aligned control), not on the model list. |
| orphaned CSS class selectors | 323 / 318 / 151 / 274 class selectors scanned. All flagged candidates were **false positives**: `.heroHeadline`, `.TextShimmer`, `.RlGAzG_row` appear only inside *comments* documenting host structure, and `.protocol` was `url.protocol` in JS. |
| unreferenced locale keys | 39 / 33 / 23 keys, **all reachable**. |
| unread `DEFAULT_STATE` keys | 14 / 2 / 5 keys (reasoning-effort has no state), **all read** somewhere other than their own declaration. |
| `innerHTML` / `outerHTML` / `eval(` / `new Function(` | **zero** in shipped source. |
| salted CSS-Modules selectors (`._x_ab12_3`) | **zero.** Every host-class match is a `[class*="…"]` substring match, which survives re-salting — the documented allowed pattern. |
| scratch files (`.bak`, `.orig`, `_tmp`, `.probe`, `~`, build-script copies) | **none** under `plugins/`. |
| tests with no assertion, or only literal-vs-literal assertions | **none** in any of the four plugins. |

---

## 2. The two changes you asked me to judge rather than delete

### 2.1 The shimmer rule lost its `opacity` / `filter` — **correct, and the replacement assertions are real**

Your removal is right, and the assertions guarding it are not theatre. I checked
them by mutation rather than by reading: I rebuilt the rule body with
`opacity: 0.6 !important` and `filter: blur(1px) !important` restored and ran the
test's own regexes against both strings.

```
current   -> opacity caught: false   filter caught: false
regressed -> opacity caught: true    filter caught: true
=> assertions DISCRIMINATE: true
```

They are inverted rather than deleted, they match a bare `opacity:.6` and a
mid-block `;\nopacity: 1` alike, and they do not false-positive on
`background-image:url(...)`. The rest of that test still pins the clay gradient,
`--cds-ease-pulse`, and the "geometry is the host's" list
(`animation-name`/`-duration`/`-delay`/`-iteration-count`/`transform`/
`mask-image`), so the rule cannot silently grow a new timing or transform either.

The rule itself is a single `[data-shimmer-decoration]` selector with
`background` + `animation-timing-function` and nothing else — exactly the
"colour of the glint only" contract the comment claims.

### 2.2 `omitFonts` — **the byte-identity claim holds; one stale comment fixed; one guard added**

**Independent verification.** I did not trust the existing test's arithmetic; I
recomputed it. For nine states (`{}`, `refine:false`, `enabled:false`, a full
non-default patch, `thinkingLabelBlue`, three A/B switches off, the two B-tier
switches off, `elevation:0`, `elevation:200`):

> `buildCssFor(state, { omitFonts: true }) === buildCssFor(state)` with
> `fontSheet()` removed from it — **byte-identical in all nine cases.**

The first run of my check reported a mismatch; the fault was mine, not the
code's — I sliced `fontSheet().length + 2` (assuming the `'\n\n'` join separator
was included in the block). It is not: `full.length − omitted.length` is exactly
`fontSheet().length` (1733 here), and `styles.js:1418` splices the empty part in
precisely so the omitted form lines up byte for byte. With the slice corrected,
all nine states pass.

**Second expensive path: none.** `buildCss` / `buildCssFor` have exactly one
call site on a live path — `createStyles().apply()` at `styles.js:1533`, which
passes `omitFonts: true`. `verify.mjs` calls the full builder, but that is a
build-time evidence tool, not the runtime. So there is no remaining path that
rebuilds the font block on a settings change.

**Fixed — a stale claim.** `styles.js` doc-comment above `apply()` still said
*"`apply()` slices the cached font block back out with `indexOf`"*. That is no
longer what the code does, and a comment that describes the old expensive route
is exactly the kind of thing the next reader acts on. Rewritten to say `apply()`
asks for the rules alone via `omitFonts: true` and never builds-then-slices.
(The `indexOf` mention at `styles.js:1391` is a *historical* note explaining why
the option exists and is correct as written.)

**Added — a guard that the hot path stays cheap.** `test/styles.test.mjs`:
`the live path never builds the font block (the expensive route is gone)`. It
asserts `apply()`'s body contains `omitFonts: true`, contains no `indexOf(` call,
and — via the fake DOM — that the rules tag carries no `@font-face` while the
font tag does. The cost is invisible in the output (both routes produce the same
string), so a byte-comparison test alone could never catch a regression here;
this one pins the *route*.

Mutation-tested: deleting `omitFonts: true` from the `apply()` call makes
**three** tests fail, not just this one.

That new test is the **+1** in cds-theme's count (283 → 284).

---

## 3. Defects found and fixed

| # | where | what | guard |
|---|---|---|---|
| 1 | `cds-theme/client/src/styles.js` (doc-comment above `apply()`) | described the deleted `indexOf` slicing route as current behaviour | the comment now matches the code; §2.2's new test pins the route it describes |
| 2 | `system-fonts/lib/system-fonts.js:165` | `export` on a constant with no external consumer (only a dead *export*, not a dead symbol) | covered by the full suite; the binding is still exercised by the child-timeout test |

No behavioural defect was found in the six areas the brief listed. In particular:
every `ctx.effect` callback that registers something returns its disposer — I
checked all 20 call sites across the four plugins, and the six my scanner first
flagged were all false positives of a regex that did not recognise
`return settings.subscribe(...)` / `return ctx.locale.register(...)` / a
conditional `return typeof off === 'function' ? off : undefined`. One site
(`system-fonts` `lifecycle.js:84`, which installs panel CSS and applies
typography) genuinely returns nothing — and that is correct by design: teardown
for those is owned by the activation effect at `:48-59`, and `installPanelCss()`
is idempotent (`panel.js:58` returns early when the tag exists).

---

## 4. Deliberately left (with reasons)

| what | why |
|---|---|
| `export function buildArtifact()` ×4 | CLI entry points, called at module scope; the bare name never appears as an import, which is why a scan flags them. Harmless to export. |
| `tools/audit.mjs`'s `everyKey` | **Not dead.** You thought it was yours from a rushed rewrite; it is read at :896-903 to print the "values (not switches)" inventory line. Removing it would silently drop that output. Verified before touching it. |
| the magic `4` in `stats.js:320` | the level ceiling, now the only copy. See §1.3. |
| `docs/*.md` mentioning `indexOf` / the font route | historical audit and review records. `perf-audit.md` and `perf-review-2.md` describe the cost *as measured*, which is why the fix exists. Editing them would rewrite evidence. |
| `.heroHeadline` / `.TextShimmer` / `.RlGAzG_row` in cds-theme comments | document the host's real DOM structure next to the rule that depends on it. Deleting them would remove the evidence for the selector. |
| `[class*="…"]` selectors | substring matches survive the host re-salting its CSS-Modules hashes; this is the documented alternative to naming a hash. |
| the `.dus-models` invisible-scroll rules | they look removable ("there is no scrollbar") but they *are* the thing that removes it, in both engines. |

---

## 5. Suspicious but unproven — for the record

0. **`cds-theme` has no real-Cordis activation test, and an attempt to add one was
   abandoned.** Recorded here because the absence looks like an oversight and is
   not one.

   `plugins/system-fonts/test/cordis.test.mjs` boots its committed bundle inside
   the real `@deepseek-ai/cordis` extracted from the installed `app.asar`. That
   suite was worth writing because its plugin registers five rows and touches no
   other browser surface. `cds-theme` is the opposite: `apply()` drives a theme
   bridge, two injected `<style>` tags, a synthetic theme-mode row, a settings
   panel, and a nav-icon marker that walks the settings dialog's DOM. Booting it
   in Node needs a large slice of a browser before the plugin gets far enough to
   register anything.

   The attempt was made and deleted. It produced **0 registrations** while
   `ctx.theme` / `ctx.slots` / `ctx.locale` all resolved, and three successive
   attempts to model `SlotCore` (synchronous `inject`; a section's `children`
   notified inside the same `register` call; duplicate ids throwing per slot)
   each moved the failure without reaching a green suite. The stand-in was
   drifting from the host faster than it was testing it — exactly the failure
   mode this file exists to catch in other people's work.

   **What covers this instead:** `test/host.test.mjs` asserts every registration,
   order, locale namespace, the section's `children` declaration and the
   bound-wait fallback against a scripted context; `tools/verify.mjs` checks the
   built artifact against the current token map (319 entries as of 2026-10-22;
   it prints `override map size`, so read the number rather than trusting this
   line). So the REGISTRATIONS are
   covered. What is NOT covered is "does Cordis itself accept this fiber on the
   shipped host" for this plugin specifically — a gap that `system-fonts`
   closes for itself and `cds-theme` does not. If someone wants it closed, the
   honest route is to extract the app's Cordis AND enough of `ui-settings-general`
   so the shell really declares `settings.section`, rather than growing the
   stand-in further.

1. **`stats.js:320` hard-codes the heat ceiling** as `4` in three places on one
   line (the ternary, the `Math.max(1, …)`, the `/ distinct.length`). Correct
   today; it is the single place where "five levels" is assumed.
2. **`perf-review-2.md:62` rates the `indexOf` cost "Low / ~0 saved by fixing"**
   while `perf-audit.md:917` and the `styles.js` comment cite 24.4 ms/step at
   9,380 elements. The two reviews disagree about the same change; the code
   follows the pessimistic number, which is the safe direction. Not worth
   reconciling the documents at freeze time, but a reader comparing them will
   notice.
3. **`fonts.test.mjs:139`** asserts `FONT_ROUTE_BASE` is absent from the artifact
   by searching for that literal string. It passes for the right reason today,
   but it would also pass if the constant were renamed. The stronger form would
   assert the artifact contains no route-shaped URL, which `fonts.test.mjs:137`
   and `:119` already do — so the pair covers it.

---

## 6. What a reviewer should re-run

```bash
for p in cds-theme system-fonts usage-stats reasoning-effort; do
  (cd plugins/$p && npm run build && npm test)
done
(cd plugins/cds-theme     && node tools/verify.mjs)
(cd plugins/system-fonts  && node tools/verify.mjs && node tools/integration.mjs)
node tools/audit.mjs
```

Expected: 284 / 149 / 133 / 80, every command exit 0.
