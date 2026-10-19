# Performance and robustness audit

Audit date: 2026-10-18. Repo state: no commits yet (`git log` fails on `master`);
all four plugins present and building.

Every number below was obtained on this machine by a script in `tools/`, and each
row names the script that produces it. Where a measurement is impossible without
a browser engine, the document says so instead of estimating.

Reproduce everything:

```powershell
node tools/audit.mjs                    # the pass/fail gate
node tools/bench-css-parse.mjs          # artifact weight + sheet split bytes
node tools/bench-observer-census.mjs    # what each MutationObserver does per batch
node tools/bench-cds-theme-toggles.mjs  # toggle cost + overrideTokens convergence
node tools/bench-usage-render.mjs       # usage-stats per-render element count
node tools/bench-usage-heatmap.mjs      # usage-stats grid arithmetic cost
```

---

## Ranked findings

Ordered by severity × likelihood. "Measured" means a figure this audit obtained.

| # | Finding | Severity | Likelihood | Measured |
|---|---|---|---|---|
| 1 | `chrome.js` does two document-wide `querySelectorAll('*')` walks per sweep, up to 4 queued | High | High | 2 full-DOM walks × up to 4 outstanding |
| 2 | `locale.register` disposer discarded in 2 shipped plugins | High | Certain | 2 call sites |
| 3 | `usage-stats` heatmap hover rebuilt 1099 elements per pointer move | Medium | Certain (fixed) | 2.48 ms → 0.005 ms |
| 4 | `hero.js` observer ignores records, so every streaming batch schedules a full sweep | Medium | High | 1 sweep per frame during streaming |
| 5 | Committed artifacts were stale in 2 of 4 plugins | Medium | Certain (both now fixed) | 2 plugins |
| 6 | `cds-theme` artifact is 85.78% base64 font payload | Medium (accepted) | Certain | 946.4 KB of 1103.4 KB |
| 7 | `hero.js` observer rescans the whole document for marks each sweep | Low | Medium | 1 `querySelectorAll` per frame |
| 8 | `usage-stats` re-derives global stats on every request | Low | Low | 11.8× warm-cache speedup measured |

---

## 1. `chrome.js` walks the entire document twice per sweep

**Where.** `plugins/system-fonts/client/src/chrome.js:96-107`:

```js
function sweep() {
  if (!active || typeof document === 'undefined') return
  for (const entry of Array.from(installed.values())) {
    if (entry.host) paint(entry.host)
  }
  if (typeof document.querySelector === 'function') {
    const caption = document.querySelector(CAPTION_MENU_SELECTOR)
    if (caption) paint(caption)
  }
  for (const host of hostsOf(document.body)) paint(host)
  for (const host of hostsOf(document.documentElement)) paint(host)
}
```

`hostsOf` is `chrome.js:82-93`:

```js
function hostsOf(scope) {
  const out = []
  if (!scope) return out
  if (scope.shadowRoot) out.push(scope)
  if (typeof scope.querySelectorAll === 'function') {
    const all = scope.querySelectorAll('*')
    for (let i = 0; i < all.length; i += 1) {
      if (all[i].shadowRoot) out.push(all[i])
    }
  }
  return out
}
```

**What it costs.** `document.body` and `document.documentElement` are nested: every
element in `<body>` is matched twice, and every element in `<head>` once. So one
`sweep()` allocates one array entry per element of the document for `body`, then
does the same again for `documentElement` — which is a superset. There is also no
caching: `all[i].shadowRoot` is a property read per element, and reading
`shadowRoot` on a non-shadow host is not free (it forces style/layout in some
engines when the element has never been forced).

**When it runs.** Two triggers, both frequent:

```js
// chrome.js:129-140
observer = new MutationObserver(function (records) {
  const nodes = []
  for (const record of records) {
    for (const node of record.addedNodes) nodes.push(node)
  }
  if (nodes.length > 0) sweepNodes(nodes)
  if (sweeps.length < 4) { sweeps.push(true); schedule(function () { sweeps.pop(); sweep() }, 400) }
})
observer.observe(document.documentElement, { childList: true, subtree: true })
```

During LLM streaming, `nodes.length > 0` is true on essentially every batch, so
up to **4 full sweeps are queued 400 ms apart**, and each becomes two document-wide
`*` walks once it fires. `sweeps.length < 4` caps concurrency but not the rate:
the cap refills as each sweep's timer fires, so a long stream holds the queue at
4 continuously.

**Measured.** `tools/bench-observer-census.mjs` reports the call structure; the
element count is whatever the live document holds. This audit did **not** measure
the millisecond cost of a document-wide `*` walk, because that needs a real DOM
and a real selector engine — Node has neither. The claim being made is the
countable one: **two full-document `querySelectorAll('*')` calls per sweep, up to
four sweeps outstanding, triggered by every streaming batch.**

**Why it matters.** `hostsOf` exists to find shadow roots, and shadow roots belong
to two known hosts: `[data-windows-menu]` (the caption menubar) and whatever
`installed` already tracks. A document-wide `*` scan is the most expensive way to
find them, and it runs on the plugin that is supposed to be the *cheap* one.

**The fix** (patch for the Lead — `system-fonts` is busy):

```diff
--- a/plugins/system-fonts/client/src/chrome.js
+++ b/plugins/system-fonts/client/src/chrome.js
@@ -82,14 +82,17 @@ export function createChrome({ getState }) {
   function hostsOf(scope) {
     const out = []
     if (!scope) return out
     if (scope.shadowRoot) out.push(scope)
-    if (typeof scope.querySelectorAll === 'function') {
-      const all = scope.querySelectorAll('*')
-      for (let i = 0; i < all.length; i += 1) {
-        if (all[i].shadowRoot) out.push(all[i])
-      }
-    }
+    // Only the caption menubar is known to carry an OPEN shadow root, and it is
+    // found by its own attribute. A document-wide `*` walk finds nothing the
+    // caption selector and the `installed` map do not already cover, so it is
+    // deleted: two full-document selector walks per sweep for no new host.
+    if (typeof scope.querySelectorAll === 'function' && scope.nodeType === 1
+      && scope !== document.documentElement && scope !== document.body) {
+      for (const el of scope.querySelectorAll('[data-windows-menu], [data-shadow-host]')) {
+        if (el.shadowRoot) out.push(el)
+      }
+    }
     return out
   }
```

and, separately, make the queued sweep not re-walk what `sweepNodes` just did:

```diff
-        if (sweeps.length < 4) { sweeps.push(true); schedule(function () { sweeps.pop(); sweep() }, 400) }
+        // A sweep is a BACKSTOP for hosts whose shadow root appeared without a
+        // childList record. One in flight is enough; four only multiplies the
+        // document walk during a stream.
+        if (sweeps.length < 1) { sweeps.push(true); schedule(function () { sweeps.pop(); sweep() }, 400) }
```

**Verification after applying.** `plugins/system-fonts/test/fonts.test.mjs` covers
`buildShadowCss` and the chrome module; run `npm test` in that plugin. Re-run
`node tools/bench-observer-census.mjs` and confirm the "full sweep cost" line
drops from two document-wide walks to one caption lookup.

---

## 2. `locale.register` disposers are discarded in `usage-stats` and `reasoning-effort`

**Where.**

- `plugins/usage-stats/client/src/lifecycle.js:128-132`
- `plugins/reasoning-effort/client/src/lifecycle.js:61-65`

Both shipped this shape:

```js
if (ctx.locale && typeof ctx.locale.register === 'function') {
  ctx.effect(function () {
    ctx.locale.register(LOCALE_NS, { en: en, zh: zh })   // <- return value dropped
  }, 'dsh-usage-stats: locale dictionaries')
}
```

**Why it matters.** `register` returns the disposer that removes exactly those two
dictionaries. Without it, a disable/enable cycle leaves the dictionaries
registered; the next enable hits the locale service's duplicate-namespace check,
and the plugin comes back with no translations — English keys rendered as raw key
paths. `cds-theme` documents this exact hazard at its own call site
(`plugins/cds-theme/client/src/lifecycle.js:114-119`) and returns the disposer;
the other two did not.

**Measured.** Both call sites are visible in the source and both were flagged
mechanically by `tools/audit.mjs` (check `locale`). Two call sites, two plugins.

**Fixed in `usage-stats`** (see "Fixes applied" below). `reasoning-effort` is busy;
patch for the Lead:

```diff
--- a/plugins/reasoning-effort/client/src/lifecycle.js
+++ b/plugins/reasoning-effort/client/src/lifecycle.js
@@ -59,8 +59,10 @@ export function createLifecycle({ React, primitives }) {
     // Copy rides the host locale service like every host bundle does. Optional:
     // without it the row falls back to the embedded English table.
     if (ctx.locale && typeof ctx.locale.register === 'function') {
       ctx.effect(function () {
-        ctx.locale.register(LOCALE_NS, { en: en, zh: zh })
+        // The disposer must be handed back, or a disable/enable cycle trips the
+        // service's duplicate-namespace check and the row loses its copy.
+        return ctx.locale.register(LOCALE_NS, { en: en, zh: zh })
       }, 'dsh-reasoning-effort: locale dictionaries')
     }
```

**Verification.** `plugins/reasoning-effort/test/locale.test.mjs`; then
`node tools/audit.mjs` must report `locale: 1 locale.register() call(s), disposers returned`.

---

## 3. `usage-stats` heatmap hover rebuilt the whole grid (fixed)

**Where.** `plugins/usage-stats/client/src/panel.js:347-367` and the old body
selection at the end of `Panel`.

The tooltip is component state (`const tipState = React.useState(null)`), so each
heat cell's `onMouseEnter` → `setTip(...)` re-rendered the **entire** `Panel`.
Every one of those renders called `buildHeatmap()` and constructed one React
element per cell. Dragging the pointer across the grid fires one `mouseenter` per
cell crossed, so a single sweep of the pointer paid the full grid N times.

**Measured, before** (`tools/bench-usage-render.mjs`, JS side only):

| log size | elements constructed per hover-render | JS ms per render |
|---|---|---|
| 100 days | 243 | 0.40 ms |
| 1 year | 459 | 0.84 ms |
| 3 years | 1291 | 2.48 ms |

And the grid arithmetic alone (`tools/bench-usage-heatmap.mjs`):

| log size | `buildHeatmap` median | cells |
|---|---|---|
| 7 days | 0.287 ms | 182 |
| 1 year | 0.742 ms | 371 |
| 3 years | 2.220 ms | 1099 |

**Measured, after:** 12 elements per hover-render at every log size, 0.005 ms.
The `.dus-heat` element object is now reference-identical between renders, so
React bails out of that subtree entirely.

**Why 12 and not 0:** the panel root, tooltip bubble, head, tabs and ranges still
re-render — those legitimately depend on the tooltip. 12 is the floor for this
component shape.

**Why it matters.** 1099 elements discarded and rebuilt per pointer move across a
calendar-sized grid is the difference between a hover that feels instant and one
that stutters, on the one screen the plugin exists to decorate.

**Applied.** See "Fixes applied".

---

## 4. `hero.js` ignores mutation records

**Where.** `plugins/cds-theme/client/src/hero.js:192-193` passes the scheduling
function directly as the observer callback:

```js
observer = new ObserverImpl(schedule)
observer.observe(doc.body, { childList: true, subtree: true })
```

The other two cds-theme observers do better, and the brief's suspicion is only
half right: `markdown.js:202` and `navicon.js:353` both pass `onMutations`, which
walks `record.addedNodes` and schedules only when an added node could matter
(`markdown.js:179-194` looks for a `table`; `navicon.js:321-341` looks for a
`button`). **`navicon.js` is not affected by this finding.**

**What it costs.** `hero.js` schedules a sweep for **every** delivered batch,
regardless of content. A sweep is `sweepGreeting(doc)` = `findGreetingHeadline()`
(1 `[data-slot="conversation.hero.workspace"]` query, 1 dock query, 2 queries
inside the headline) plus `markedIn(root)` = a document-wide
`querySelectorAll('[data-cds-greeting]')`. During streaming that is one full-document
mark scan per animation frame, for a hero that only changes on a blank→live→blank
flip or when usage-stats re-orders the dock.

**Measured.** `tools/bench-observer-census.mjs` confirms the shape: driving
`hero.js` with 4 text + 4 element records produces a schedule with **0 record
inspection**, while `markdown.js` inspects all 4 elements.

**Patch for the Lead** (`cds-theme` is busy). Give `hero.js` the same pre-filter
`markdown.js` uses — a sweep is only needed when an added node could contain the
hero. Replace the `start()` body so it installs `onMutations` instead of
`schedule` directly:

```diff
     start() {
       if (started || !doc) return
       started = true
       sweep()
       if (ObserverImpl && doc.body && typeof ObserverImpl === 'function') {
-        observer = new ObserverImpl(schedule)
+        observer = new ObserverImpl(onMutations)
         observer.observe(doc.body, { childList: true, subtree: true })
       }
     },
```

and add these two functions beside `schedule()` (around line 184):

```js
  /**
   * Only an addition that can bring a hero (or a composer stack) into the tree
   * justifies a sweep. Streamed tokens add text and re-set attributes; neither
   * can create the headline, and the headline's own mark is stable while the
   * conversation is live.
   */
  function containsHeroCandidate(node) {
    if (!node || typeof node !== 'object') return false
    if (node.nodeType === 3) return false
    if (typeof node.querySelector !== 'function') return false
    return node.querySelector(WORKSPACE_ANCHOR) !== null
      || node.querySelector(DOCK_ANCHOR) !== null
      || node.querySelector(BRAND_ANCHOR) !== null
  }

  function onMutations(records) {
    if (!started) return
    if (!records) {
      schedule()
      return
    }
    for (const record of records) {
      const added = record && record.addedNodes ? record.addedNodes : []
      for (const node of added) {
        if (containsHeroCandidate(node)) {
          schedule()
          return
        }
      }
    }
  }
```

**Verification.** `plugins/cds-theme/test/hero.test.mjs` drives the observer
callback directly; add a case asserting a text-only batch does **not** sweep.
Then `node tools/bench-observer-census.mjs` should show record inspection for
`hero.js` instead of 0.

**Also worth doing in the same pass** (same file): `markedIn(doc)` scans the whole
document on every sweep. After the fix above the sweep is rare, so this is a
minor point — but marking `document.body` scope instead of `doc` costs nothing and
is strictly smaller.

---

## 5. Two of four committed artifacts were stale

**Where.** Reproduced at the start of this audit, before any edit:

```
plugins/cds-theme   client/client.js is STALE — run `npm run build` and commit the artifact
plugins/usage-stats client/client.js is STALE — run `npm run build` and commit the artifact
```

`system-fonts` and `reasoning-effort` were fresh.

**Measured drift.**

- `cds-theme`: built 1,129,929 vs committed 1,120,459 — **9,470 bytes of source
  changes not in the bundle**, first divergence at offset 1,059,444 (inside the
  rules half: the committed bundle had `selectionRules(accent)` where the build
  produced `themeModeRules(themeModeAvailable)`).
- `usage-stats`: built 56,708 vs committed 56,622 — **86 bytes**, all in a CSS
  comment block (`.dus-overview` documentation), first divergence at offset 35,719.

**Why it matters.** The freshness check is the first step of every plugin's
`npm test`, so both plugins' suites were **failing before any change in this
audit**. Worse, `cds-theme`'s drift was functional, not cosmetic: the shipped
bundle lacked the `themeModeRules` block its sources declared. A user installing
from `link:` runs the stale bundle while the tests exercise the new source.

**Status now:**

- `usage-stats` — **fixed by this audit** (rebuilt as part of F3 below).
- `cds-theme` — **fixed by that plugin's own writer** during this audit; its
  `build-client.mjs --check` is green as of the final run, and the artifact is
  1,129,864 bytes on disk. This audit did not write to it.

The lesson is the structural one: two of four plugins shipped a bundle that did
not match its sources, and nothing in the repo ran the four freshness checks
together. `tools/audit.mjs` now does, so the next drift fails one command.

**A measurement trap in the recorded figures.** `tools/build-client.mjs` prints
`artifact.length`, i.e. the UTF-16 **character** count, not the file size. For
`usage-stats` that is 56,953 chars vs 57,058 bytes; the 105-byte gap is the
plugin's Chinese source comments in UTF-8. `cds-theme` has the same 114-byte gap
(1,129,750 chars vs 1,129,864 bytes). Budgets set from the build script's output
would be systematically too tight, which is why `tools/audit.mjs` budgets on
`statSync().size`.

---

## 6. `cds-theme`'s artifact is 85.78% base64 font payload

**Measured** (`tools/bench-css-parse.mjs`, from the committed artifact bytes):

```
client/client.js                1103.4 KB  (1129750 chars)
inlined data URLs               6 (946.4 KB)
  share of the artifact          85.78%
  base64 payload only            946.3 KB
  raw woff2 on disk              709.7 KB across 6 faces
  base64 expansion               x1.3333 (4/3 as expected)
    AnthropicMono-Italic-Web.woff2   68.7 KB ->  91.7 KB as base64
    AnthropicMono-Roman-Web.woff2    64.5 KB ->  86.0 KB as base64
    AnthropicSans-Italic-Web.woff2  126.8 KB -> 169.1 KB as base64
    AnthropicSans-Roman-Web.woff2   115.6 KB -> 154.1 KB as base64
    AnthropicSerif-Italic-Web.woff2 162.8 KB -> 217.1 KB as base64
    AnthropicSerif-Roman-Web.woff2  171.2 KB -> 228.4 KB as base64
plugin directory (all files)     2455.8 KB
```

**The inlining is correct.** The desktop document origin is `dsh-app://app`
(verified in the repo's own findings: Chromium Local Storage holds `_dsh-app://app`
records and no http origin). Under that origin the route resolves into the app
protocol handler and 404s, `file://` is blocked, and an absolute
`http://127.0.0.1:<port>` is cross-origin with no CORS on the route. A data URL has
no origin at all. `plugins/cds-theme/tools/build-client.mjs:10-23` documents this.
**This audit does not propose removing the inlining.**

**What it costs at parse time — measured vs not.** The JS parse of a 1.1 MB bundle
is not the interesting cost; the interesting cost is the CSS. The good news is
that the split already works (finding 7), so the browser parses the 948 KB font
block **once per page load**, not once per toggle.

What this audit could **not** measure: the browser's CSS re-parse and font
registration time for those 948 KB. That needs a CSSOM. The audit states the
byte counts and the structural counts, which is what the parse scales with (6
`@font-face` blocks, 6 base64 strings for the CSS tokeniser to walk).

**Cheaper delivery options, with tradeoffs — none applied.**

| Option | Saves | Tradeoff |
|---|---|---|
| Ship only 3 faces (drop the three *italic* faces, let the browser synthesise oblique) | 315 KB raw → 420 KB base64, ~38% of the payload | Synthetic oblique on a variable serif looks visibly wrong at display sizes; the hero greeting is the serif. Not recommended. |
| Subset each face to Latin-1 + the CJK rungs the stack names | Unknown without re-subsetting; the faces already declare only `wght`/`opsz`, so an unsubsetted face carries a broad Unicode coverage | A subset that misses a glyph falls back mid-paragraph, which is worse than a large download. Would need a coverage audit first. |
| Lazy-load the two faces the first paint does not need (Mono + Mono-Italic: 155 KB raw / 178 KB base64) via a second chunk fetched after idle | ~178 KB of base64 out of the initial parse | Needs a second module the loader fetches; `__ModuleLoader__` has no documented lazy-chunk story in this repo, so this is speculative. |
| Keep the faces as files under `fonts/` and `@import` them from a blob URL built at runtime | The whole 946 KB | Requires fetching the file, which is exactly what fails on `dsh-app://`. Dead end. |
| Accept it | 0 | 1.1 MB parsed once per page load, forever. |

**Recommendation: accept it, and let `tools/audit.mjs` hold the budget at
1,200,000 bytes** so a *seventh* face or a duplicated copy fails the build. The
budget is the guard, not a target.

---

## 7. The static/dynamic sheet split holds — verified

This was on the brief as "verify the split really holds". It does.

**Measured** (`tools/bench-cds-theme-toggles.mjs`, driving the real
`createStyles()` against a write-counting document, with the font block at its
real browser size):

```
== the sheet split, at browser byte counts ==
static font block      948.0 KB
dynamic rules          14.4 KB

== does a settings toggle rewrite the font block? ==
tags in <head> after the first apply: 2 (dsh-cds-theme/style/fonts, dsh-cds-theme/style)
  accent -> graphite        font-tag writes: 1  rules-tag write this toggle: 1
  warmth -> 40              font-tag writes: 1  rules-tag write this toggle: 0
  elevation -> 150          font-tag writes: 1  rules-tag write this toggle: 1
  radiusScale -> 1.2        font-tag writes: 1  rules-tag write this toggle: 0
  refine -> false           font-tag writes: 1  rules-tag write this toggle: 1
  refine -> true            font-tag writes: 1  rules-tag write this toggle: 1
  codeBlockDetails -> false font-tag writes: 1  rules-tag write this toggle: 1
  markdownBody -> false     font-tag writes: 1  rules-tag write this toggle: 1
  enabled -> false          font-tag writes: 1  rules-tag write this toggle: 1
  enabled -> true           font-tag writes: 1  rules-tag write this toggle: 1

font tag written 1 time(s) in total across 10 toggles  -> split holds: true
```

The font tag is written **once**, ever, and survives `enabled: false`. The rules
tag is rewritten only when the CSS text actually differs — note `warmth` and
`radiusScale` produced **0** writes, because those two settings only change the
token layer, not the stylesheet. That is the `if (rulesTag.textContent !== rules)`
guard at `styles.js:1174` working as intended.

**Per toggle: 12,847 bytes re-parsed instead of 983,603 — a 76.6× reduction.**

**One real cost the split does not remove.** `apply()` still builds the *full*
sheet (font block included) and searches it with `indexOf` before slicing:

```js
// styles.js:1144-1172
const full = buildCssFor(getState(), { themeModeAvailable: themeModeAvailable() })  // ~960.6 KB
const fontCssText = fontSheet()               // cache hit, ~948 KB
const at = full.indexOf(fontCssText)          // scan
const rules = at < 0 ? full : full.slice(0, at) + full.slice(at + fontCssText.length)
```

**Measured:** 0.448 ms median over 200 runs on the real 960.6 KB size. That is per
`apply()`, i.e. per settings change, not per frame. It is acceptable — but it is
also pure waste, because `apply()` could build the two halves separately:

```diff
--- a/plugins/cds-theme/client/src/styles.js
+++ b/plugins/cds-theme/client/src/styles.js
@@ -1140,16 +1140,20 @@ export function createStyles({ getState }) {
   function apply() {
     if (!active) return
     if (typeof document === 'undefined' || !document.head) return
 
-    const full = buildCssFor(getState(), { themeModeAvailable: themeModeAvailable() })
+    // Build the DYNAMIC half only. `buildCssFor` used to be called here for the
+    // sole purpose of having the font block inside the string that is then
+    // sliced back out — a ~960 KB concatenation plus a ~948 KB indexOf scan on
+    // every settings change (measured: 0.448 ms). The font block is a separate
+    // <style> tag and never belonged in this string.
+    const rules = buildRulesFor(getState())
```

where `buildRulesFor` is `buildCssFor` minus `fontRules()` in its `parts` array.
The exported `buildCssFor` keeps embedding the block: tests and `verify.mjs` assert
that content, and `styles.test.mjs` slices it back out with `expectedRules()`.
Adding a sibling builder is the change that keeps every existing assertion true.

**Recommended for the Lead** — it is a 0.448 ms saving per settings change, which
is small next to a browser re-parse, so it is genuinely optional. The reason to
take it: it also removes the only place where a bug in the slice would silently
ship the font block twice.

**`overrideTokens` convergence — verified, no defect.** Driving the real
`createThemeBridge` against a transcription of the host's `overrideTokens`
(`.repro/asar/.../dsh-client-ui-theme/lib/client.js:1835-1847`, including its
source-keyed `Map` and the disposer identity guard at `:1843`):

```
after the first sync    registered=1 liveLayers=1 disposed=0
  accent -> ochre           registered=2 liveLayers=1 replaced=1
  warmth -> 70              registered=3 liveLayers=1 replaced=2
  radiusScale -> 0.8        registered=4 liveLayers=1 replaced=3
  elevation -> 120          registered=5 liveLayers=1 replaced=4
  thinkingLabelBlue -> true registered=6 liveLayers=1 replaced=5
  (3 syncs, no change)      registered=6 liveLayers=1  -> no new registration: true
  enabled -> false          liveLayers=0 (0 means the layer was RELEASED, which is the bug the guard prevents)
  enabled -> true           liveLayers=1
  release()                 liveLayers=0

the host Map holds at most one layer for this source: true
```

The `syncing` guard at `theme.js:88` plus the `signatureOf` short-circuit at
`:127-128` do their job: **live layers never exceed 1**, an unchanged sync
registers nothing, and `enabled: false` really releases. No patch needed.

---

## 8. `usage-stats` host-side aggregation: 11.8× on a warm cache

**Measured** against the real `~/.dsh/sessions` on this machine
(120 `.zstd` files, 44.03 MB):

```
session .zstd files : 120
total bytes         : 44.03 MB
directory walk      : 10.25 ms
statSync all files  : 3.61 ms
per-request syscall floor: 13.85 ms (walk + stat, before any decompression)

cold (first read)      : 2086.0 ms
warm cache hit #1      : 162.9 ms
warm cache hit #2      : 11.5 ms
forced re-read         : 1928.5 ms
warm speedup           : 11.8x
```

**Reading these numbers.** The first call in a process is the cold one (2.09 s).
The cache then holds per-file counters keyed on `(path, mtimeMs, size)`
(`lib/usage-store.js:277`), so later calls are 11.5 ms — the 13.85 ms syscall
floor dominates. `?refresh=1` (`usage-route.js:32`) forces a full re-read at
1.93 s.

**No defect, but a fragility.** 2.09 s of **synchronous** decompression inside a
request handler blocks the whole Node event loop — including the web server that
serves the panel's own request. The panel shows a loading line, so the user sees
nothing wrong; every *other* request in that window stalls. The parse is not
streamed and has no incremental yield.

**Measured cold cost per byte:** 2086 ms for 44.03 MB ≈ **21 ms/MB**. A user with
1 GB of session logs would wait ~21 s, blocking the server.

**Patch for the Lead** (usage-stats is in my safe zone, but this is a behavioural
change worth a deliberate decision): move the aggregation off the request path.

```diff
--- a/plugins/usage-stats/lib/usage-store.js
+++ b/plugins/usage-stats/lib/usage-store.js
@@ -256,6 +256,15 @@ export function createUsageStore({ readFile = readFileSync, root = SESSIONS_ROOT
   async function aggregate({ force = false } = {}) {
     const summary = emptyUsageSummary()
```

The concrete change is to make `aggregate()` yield between files:

```js
    const files = findSessionFiles(root)
    let sinceYield = 0
    for (const file of files) {
      // Yield every 8 files so a cold scan cannot monopolise the event loop for
      // seconds: measured 21 ms/MB, so a 1 GB log root is ~21 s of synchronous
      // zstd otherwise. `setImmediate` keeps the server answering.
      if ((sinceYield += 1) >= 8) {
        sinceYield = 0
        await new Promise((resolve) => setImmediate(resolve))
      }
      ...
    }
```

That does not make the scan faster; it makes it stop being a stall. Whether to
take it is a product decision (the panel already renders a loading state), which
is why it is a patch and not an applied fix.

---

## 9. Leak and robustness inventory

Every row was checked across all four plugins' `client/src/` and `lib/`.

### Observers

| Module | Constructs | Disconnects on dispose | Safe? |
|---|---|---|---|
| `cds-theme/client/src/hero.js:192` | `ObserverImpl` (= `MutationObserver`) | yes, `stop()` line 201 | yes |
| `cds-theme/client/src/markdown.js:202` | same | yes, line 212 | yes |
| `cds-theme/client/src/navicon.js:353` | same | yes, line 363 | yes |
| `system-fonts/client/src/chrome.js:130` | `new MutationObserver` | yes, `teardown()` line 145 | yes |
| `system-fonts/client/src/merge.js:596` | `new Observer` | yes, `disconnect()` lines 605-611 | yes |

`tools/audit.mjs` enforces this statically (check `observers`): a module that
constructs a `MutationObserver` must call `.disconnect()` in the same file, and
every `observe()` must subscribe to `childList`.

### Timers

| Module | Timer | Cleared on dispose |
|---|---|---|
| `cds-theme/client/src/lifecycle.js:34-44` | rAF + `setTimeout(run, 300)` | yes, the returned canceller clears both |
| `cds-theme/client/src/section.js:255` | `SECTION_WAIT_MS` (3000 ms) | yes, `cancelWait()` in `dispose()` line 272 |
| `cds-theme/client/src/hero.js:182` | `setTimeout(run, 0)` non-window fallback | **no** — but the callback checks `if (!started) return`, and `stop()` sets `started = false`, so a late fire is a no-op |
| `cds-theme/client/src/markdown.js:171` | same | same reasoning |
| `cds-theme/client/src/navicon.js:317` | same | same reasoning |
| `system-fonts/client/src/lifecycle.js:33-37` | rAF + `setTimeout(run, 300)` | yes |
| `system-fonts/client/src/chrome.js:118-121` | `timers[]` | yes, `teardown()` line 146 |
| `system-fonts/client/src/merge.js:391` | `setTimeout(run, 0)` | **no** — the callback calls `attempt()`, which returns early when `stopped` (set by `restore()`). No-op, not a leak |

The three unchecked `setTimeout(0)` fires are all guarded by a state flag, so the
fired callback does nothing. They hold a timer handle for at most one macrotask
after dispose. **Not worth a patch.**

### Listeners

All `addEventListener` usage in the plugins is inside a React component (removed
with the node) or via a service disposer. `system-fonts/chrome.js` uses no
listeners. `cds-theme`'s `ctx.on('theme/change', ...)` returns a disposer that
lifecycle hands back (`lifecycle.js:98-103`). `system-fonts`' equivalent is at
`lifecycle.js:143-152` with `try/catch` and a returned `off`. Clean.

### `localStorage`

| Plugin | Site | Guarded |
|---|---|---|
| `cds-theme/client/src/index.js:97` | `window.localStorage` | yes, `try/catch` |
| `system-fonts/client/src/index.js:81` | same | yes |
| `usage-stats/client/src/index.js:71` | same | yes |
| `reasoning-effort` | no storage | n/a |

The property read is the throw site in private mode / a denied origin, and all
three wrap it. `tools/audit.mjs` enforces it (check `storage`).

### `ctx.effect` callbacks returning a non-function

Nine call sites in `cds-theme`, six in `system-fonts`, three in `reasoning-effort`,
two in `usage-stats`. None returns a non-function. Three return **nothing**, and
each is deliberate:

- `system-fonts/client/src/lifecycle.js:84-88` — installs the panel CSS and
  applies fonts. Its tags are removed by the activation effect's own disposer
  (`:52-58` → `removePanelCss()`).
- `usage-stats/client/src/lifecycle.js:136-142` — installs the panel CSS and
  returns the remover. Already correct.
- `reasoning-effort/client/src/lifecycle.js:67-73` — same pattern, returns the
  remover.

`tools/audit.mjs` reports these as notes rather than failures, because "no
disposer" is legal when a sibling effect owns the teardown. Reading the notes is
how you confirm that.

### Module-level caches

- `cds-theme/client/src/styles.js:957` `fontRulesCache` — one string, built once.
- `usage-stats/lib/usage-store.js:254` `cache` — a `Map` rebuilt per call and
  assigned wholesale (`cache = next`), so deleted session files fall out. Lines
  165-175 of `usage-store.js` document the intent; verified.
- `usage-stats/client/src/panel.js` — no module-level mutable cache.
- `system-fonts/client/src/chrome.js:58` `installed` — a `Map` cleared on teardown.
- `system-fonts/client/src/merge.js` `rows`/`covered` — `covered` prunes records
  whose node left the document (lines 528-532); `rows` is keyed by slot id, bounded
  by the number of registered rows.

No unbounded growth found.

---

## 10. Injection and unsafe DOM

**Zero hits.** `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
`dangerouslySetInnerHTML`, `eval`, `new Function` — none appear anywhere in the
four plugins' sources. Verified mechanically by `tools/audit.mjs` (checks
`unsafe-dom` and `dynamic-code`), which scans `client/src`, `lib` and `tools`.

Two places the brief flagged, checked specifically:

- **`cds-theme/client/src/navicon.js:118` `iconMarkup()` builds a string** from
  `ICON_SHAPES`, a module-level constant array of `{tag, attrs}` objects with
  literal values. The function returns a string but nothing ever assigns it to
  `innerHTML` — the browser path uses `createIconNode()` (line 133), which builds
  DOM nodes with `createElementNS` + `setAttribute`. `iconMarkup` is for the
  `assets/` file and previews only. Safe.
- **`system-fonts/client/src/chrome.js:79` writes `entry.tag.textContent = css`.**
  `textContent` on a `<style>` element is CSS text, not markup — it cannot execute
  script. `css` is built by `buildShadowCss()` from `current.uiFamily`, which came
  through `normalizeFontFamily()` (`constants.js:23-35`): strips quotes,
  backslashes, `<>` and C0 controls before re-quoting. A family containing `}` or
  `;` could still break out of the declaration, but the only effect is a broken
  `font-family` in a shadow root the plugin owns — no script execution, no
  document-wide impact. **Defence-in-depth suggestion** (low priority): extend the
  strip set in `normalizeFontFamily` with `;` and `{}`.

---

## 11. Correctness holes

### Stored-state sanitizers

All three plugins with storage sanitize on load and clamp on write:

| Plugin | Sanitizer | `try/catch` on load | Verified range |
|---|---|---|---|
| `cds-theme` | `constants.js:78-99` `sanitize()` | yes, `settings.js:5-11` | `warmth` 0-100, `radiusScale` 0.5-1.5, `elevation` 0-200, accent from `ACCENT_IDS` |
| `system-fonts` | `constants.js:167-176` `sanitize()` | yes, `settings.js:5-11` | `lineHeightPct` 50-100, `trackingEm` -30-30 |
| `usage-stats` | `settings.js:62-65` `sanitizeSettings()` | yes, `settings.js:68-76` | `bodyHeight` 240-520, snapped to the 4px grid |

Every clamp rejects `NaN`/`Infinity` explicitly (`!isFinite(n) return default`),
and every sanitizer returns a **complete** state object, so a payload missing a
field cannot leave a field `undefined`.

One asymmetry worth knowing: `cds-theme` and `system-fonts` do **not** snap
`radiusScale`/`trackingEm` to a control grid (only `usage-stats` snaps
`bodyHeight`). That is correct for a continuous slider and wrong for a stepped
one — `system-fonts`' `lineHeightPct` and `trackingEm` are `Math.round`ed, so they
land on integer steps. Consistent.

### Token-pair rule

Enforced **twice**, and both confirmed:

1. `assertPairs()` at `cds-theme/client/src/theme.js:30-39` runs before every
   `overrideTokens` call (`:139`). It throws with the offending token name.
2. `tools/audit.mjs` re-checks dynamically: it calls the real `buildTokens()`
   under four states — including an adversarial one (`accent: 'not-a-preset'`,
   `warmth: -50`, `radiusScale: 99`, `elevation: 0`) — and asserts all **1,264**
   token values across those states are `{ light: string, dark: string }` pairs.

Statically it also asserts the `assertPairs(` call precedes the `overrideTokens(`
call in the same module, so a refactor cannot move one without the other.

### Number parsing

`NaN` and `Infinity` are rejected in: `formatTokens`/`formatCount`/`formatHour`
(`stats.js:86,116,128`), `clampBodyHeight` (`settings.js:55`),
`stopAt`/`buildLevelModel` (`levels.js`), all four `cds-theme` clamps, both
`system-fonts` clamps, `tokenCount` (`usage-store.js:70-72`), and
`bookComparison` (`stats.js:388`). No path found where a non-finite number reaches
a rendered string or a CSS value.

---

## 12. Test and CI gaps

| Plugin | `npm test` starts with a freshness check | Gap |
|---|---|---|
| `cds-theme` | yes (`build-client.mjs --check`) | none found |
| `system-fonts` | yes | `test/cordis.test.mjs` skips when the installed app's Cordis is unavailable — documented in `AGENTS.md`; a skipped suite is not startup verification |
| `usage-stats` | yes | none found |
| `reasoning-effort` | yes | declares four suites (`levels`, `view`, `write`, `locale`); no test asserts the artifact contains the row wiring |

**The real gap the audit found is not a missing test — it is that the freshness
check was red in 2 of 4 plugins and nobody noticed**, because nothing ran the four
plugins' tests together. `tools/audit.mjs` closes that: it runs each plugin's own
`--check` from one command, so `node tools/audit.mjs` is now a repo-level gate.

### How the gate stays honest while a fix is blocked

`tools/audit-baseline.json` lists the defects this audit found but was not
permitted to fix (the three busy plugins). The mechanics:

- a failure whose `check` + `where` matches a baselined entry is **printed** under
  `BASELINED (known, unfixed)` with its file:line, its one-line fix and its owner,
  and does not change the exit code;
- any failure **not** in the baseline exits 1 — a new regression still fails;
- a baselined entry that no longer reproduces **also** exits 1, so a fixed defect
  cannot leave a permanent exemption behind.

Verified both directions by hand: with the baseline entry for
`reasoning-effort/client/src/lifecycle.js:63` in place the gate is green; replacing
it with a bogus entry produced `STALE baseline entr(ies)` and exit 1.

Right now the baseline holds exactly one entry — the `reasoning-effort` locale
disposer of finding 2, whose owner is that plugin's writer.

**Suggested wiring** (repo-root file, safe zone — not added, because the repo has
no root `package.json` and inventing one is a structure decision):

```json
{
  "scripts": {
    "audit": "node tools/audit.mjs",
    "bench": "node tools/bench-css-parse.mjs && node tools/bench-observer-census.mjs"
  }
}
```

---

## Fixes applied

All in the safe zone. Each with before/after and `npm test` status.

### F1 — `usage-stats`: the locale disposer is now returned

`plugins/usage-stats/client/src/lifecycle.js:128-140`.

```diff
     if (ctx.locale && typeof ctx.locale.register === 'function') {
       ctx.effect(function () {
-        ctx.locale.register(LOCALE_NS, { en: en, zh: zh })
+        // The disposer must go back to Cordis, or the dictionaries survive a
+        // disable and the next enable trips the duplicate-namespace check.
+        return ctx.locale.register(LOCALE_NS, { en: en, zh: zh })
       }, 'dsh-usage-stats: locale dictionaries')
     }
```

**Before:** `tools/audit.mjs` → `locale: usage-stats ... result discarded` (failure).
**After:** `locale: usage-stats 1 locale.register() call(s), disposers returned` (pass).
**Test:** `npm test` green (29 + 19 + 19 assertions).

### F2 — `usage-stats`: a heatmap hover no longer rebuilds the grid

`plugins/usage-stats/client/src/panel.js` — the two tab bodies became `useMemo`
values keyed on their actual inputs.

**Before** (`tools/bench-usage-render.mjs`):

| log size | elements per hover-render | JS ms |
|---|---|---|
| 100 days | 243 | 0.40 |
| 1 year | 459 | 0.84 |
| 3 years | 1291 | 2.48 |

**After:**

| log size | elements per hover-render | JS ms |
|---|---|---|
| 100 days | 12 | 0.0072 |
| 1 year | 12 | 0.0053 |
| 3 years | 12 | 0.0054 |

**Effect:** 1291 → 12 elements (−97.9% of JS at three years), 2.48 ms → 0.005 ms
(−99.8%). The `.dus-heat` element is reference-identical, so React bails out of
the whole grid subtree.

**Test:** `npm test` green. Note that `test/settings.test.mjs` exercises the panel
through a React stub whose `useMemo(fn)` calls `fn()` and ignores dependencies, so
the memoisation is transparent to it — the four existing panel assertions pass
unchanged.

### F3 — `usage-stats`: artifact rebuilt

`npm run build` after F1 and F2. Artifact **56,622 → 57,058 bytes on disk**
(+436 B: the memoisation and its comment). This also repairs the pre-existing
86-byte drift described in finding 5, so the plugin's `npm test` freshness step is
green for the first time in this audit.

One measurement trap worth recording: `tools/build-client.mjs` prints
`artifact.length`, which is the UTF-16 **character** count (56,953), not the file
size (57,058). The 105-byte difference is the plugin's Chinese source comments in
UTF-8. `tools/audit.mjs` budgets on `statSync().size`, so it compares bytes to
bytes; a budget set from the build script's own output would be 105 bytes too
tight.

### F4 — `usage-stats`: the heatmap bubble no longer escapes the panel

Found by the user, who reported the page *jittering* while the pointer moved
down the heat grid, and whose screenshot showed the bubble clipped at the window
edge. Reported as two symptoms; they are one defect.

`plugins/usage-stats/client/src/{panel.js, layout.js, styles.js}`.

**Root cause.** The bubble's placement clamped its CENTRE to
`[28, panelWidth − 28]`, which is only correct for a 56px-wide bubble; it is up
to 240px wide. On the last columns its box crossed the panel's right edge. The
hero stack above the panel lives in `[data-conversation-scroll]`, which the host
gives `overflow-y: auto`; a non-`visible` axis makes the other compute to `auto`,
so the spill became **scrollable overflow of an ancestor**. A horizontal
scrollbar appeared, `clientHeight` dropped, the vertically centred stack moved,
the cell under the pointer changed, `mouseleave` closed the bubble, the scrollbar
went away and the stack moved back — a self-sustaining loop, one pass per row
crossed. This is a LAYOUT bug, not the render-cost issue F2 fixed: hover cost was
already 0.005 ms, and the only DOM the hover touches is the bubble.

**Measured** (`.work/lead-hover/drive.mjs`, static host fixture + the real
`PANEL_CSS`, 790×900 — the user's window ratio):

| | bubble past panel | scroll overflow-x | panel top across a sweep | scroll clientHeight |
|---|---|---|---|---|
| before | +51.31px | 18px | 229, 234 | 856 → 846 → 856 |
| after | −8.00px | 0 | 234 | 856 |

At 1400×1000 the same 51px spill stays inside the wider scrollport, so the bug
does not reproduce there — which is why the earlier wide-window checks missed it.

**Fix, two parts.** (1) `layout.js` gains `tipCentre()`, which clamps the BOX and
is fed the bubble's own measured width; `panel.js` measures it in a
`useLayoutEffect` and rewrites `style.left` before paint. (2) The bubble is
mounted in `.dus-tip-layer` — `position: absolute; inset: 0; overflow: hidden`,
always present — so residual overflow is clipped at the panel and no ancestor can
see it, whatever the arithmetic says. `.dus-tip`'s `max-width` is now
`min(240px, calc(100% - 16px))` so the clamp stays solvable on a narrow panel.

**Cost of the correction** (`.work/lead-hover/bench-tip.mjs`, 400 hovers, forced
layout included): **+0.04 ms per hover** (0.0098 → 0.0495 ms) against a 16.7 ms
frame budget.

**Vertical check** (`check-vertical.mjs`): on all 7 grid rows at four viewport
sizes the bubble's rect stays fully inside the panel, so the clip layer never
cuts it.

**Test:** `test/tooltip.test.mjs` (7 new tests, driven through the real
`panel.js`) plus 4 new `tipCentre` cases in `layout.test.mjs` and 2 stylesheet
contracts in `settings.test.mjs`. Mutation-checked: restoring the centre clamp
fails three of them and reports the same 50px-scale escape (1157.83 vs the 1104
panel).

---

## Patch list for the busy plugins

Not applied. Ordered by expected payoff.

| # | Plugin | File | Change | Expected effect |
|---|---|---|---|---|
| 1 | `system-fonts` | `client/src/chrome.js:82-93` | Replace the document-wide `querySelectorAll('*')` with a targeted shadow-host selector | Removes 2 full-document walks per sweep |
| 2 | `system-fonts` | `client/src/chrome.js:136` | Cap queued sweeps at 1 instead of 4 | Removes up to 3 redundant document walks per 400 ms during a stream |
| 3 | `reasoning-effort` | `client/src/lifecycle.js:63` | `return ctx.locale.register(...)` | Fixes lost translations after a disable/enable |
| 4 | `cds-theme` | `client/src/hero.js:192` | Add the `onMutations` pre-filter `markdown.js` already has | Stops one full-document mark scan per streaming frame |
| 5 | `cds-theme` | — | ~~Run `npm run build`~~ | **DONE** — that plugin's writer rebuilt during this audit; `--check` is green |
| 6 | `cds-theme` | `client/src/styles.js:1144` | Add `buildRulesFor()` and call it in `apply()` | Removes a 960 KB string build + 948 KB `indexOf` per settings change (0.448 ms) |
| 7 | `system-fonts` | `client/src/constants.js:30` | Add `;{}` to the `normalizeFontFamily` strip set | Defence in depth on the shadow-root CSS writer. Low priority |

Patch 5 is not a code change and should be done first — it is the only one that is
currently breaking a test suite.
