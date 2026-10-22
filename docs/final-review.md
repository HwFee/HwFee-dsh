# 最终独立复核 · Final independent review of the unreviewed batch

Reviewer: `appearance-group` (read-only). Date: 2026-10-18.
Scope: everything that landed **after** `docs/perf-audit.md` and `docs/system-fonts-review.md` (+addendum).
Nothing was modified. Only this file was written.

**Method.** Every claim below was produced by running the code, not by reading a test. Commands and their output are quoted. Where I could only read, I say so.

**Environment note (important).** Other agents were editing `plugins/usage-stats` **during** this review (`usage-cache.js` 07:14:38, `usage-store.js` 07:16:07, `usage-store.test.mjs` 07:16:52). One of my runs caught that tree mid-edit and reported `31 passed, 1 failed` — that state was **transient and is not a defect**. Three consecutive re-runs afterwards were `32 passed, 0 failed`. See 未核实 §2.

---

## Verdict in one line

**The batch is in good shape.** Both reversibility claims I ran are exactly true, all host hooks exist in the installed bundle, and every number I spot-checked in the docs holds. I found **one real defect** (an audit-check hole, not a product bug) and **three documentation inaccuracies**. Nothing here should block acceptance.

---

## Findings, ranked

### F1 — MEDIUM — `tools/audit.mjs` `switches` check has silent holes in its forward direction

`tools/audit.mjs:713` and `:733`

The Lead's question was whether a key that is boolean but written in a shape the regex misses could slip through. **Yes — six shapes are missed.** The check only matches `key: true` / `key: false` **with an unquoted identifier and a literal boolean**.

Evidence — I reproduced the check's own regexes and probed them:

```
$ node --input-type=module   # reproduces /([A-Za-z_$][\w$]*)\s*:\s*(true|false)\s*,?/g
=== forward direction: does the boolean-key regex see it? ===
  plain true           -> SEEN ["attachments"]
  shorthand prop       -> MISSED
  spread base          -> SEEN ["attachments"]
  double-quoted key    -> MISSED
  single-quoted key    -> MISSED
  computed key         -> MISSED
  expression value     -> MISSED
  not-negation         -> MISSED
  multiline value      -> SEEN ["attachments"]

=== row-key side: quoted styles ===
  single     -> SEEN ["attachments"]
  double     -> MISSED
  no space   -> SEEN ["attachments"]
```

The dangerous one is **`attachments,` (shorthand property)**. It is idiomatic modern JS, it is a *boolean-valued key in `DEFAULT_STATE`*, and the check is blind to it — a switch could be added with no row and the audit would stay green. `attachments: !false` and `attachments: Boolean(1)` are theoretically boolean too, though the repo's `sanitize()` treats non-`true` as false, so those are less likely in practice.

**Patch.** Accept the quoted and shorthand forms, and warn (not fail) on values the check cannot classify:

```js
// tools/audit.mjs, replacing the two collection loops at :713 and :717
const QUOTED = '["\']?([A-Za-z_$][\\w$]*)["\']?'
const booleanKeys = []
const everyKey = []
// key: true | key: false | "key": true | 'key': true
for (const match of body.matchAll(new RegExp(QUOTED + '\\s*:\\s*(true|false)\\s*,?', 'g'))) {
  booleanKeys.push(match[1]); everyKey.push(match[1])
}
// `{ ...base, attachments, }` — shorthand: collect every bare identifier that is
// the last thing before a comma, then treat it as a key we could not classify.
for (const match of body.matchAll(/(?:^|,|\{)\s*([A-Za-z_$][\w$]*)\s*(?=,|\n|$)/g)) {
  if (!everyKey.includes(match[1])) everyKey.push(match[1])
}
```
and to keep the check honest about what it cannot see, emit a note when `everyKey` contains names that were never classified:

```js
const unclassified = everyKey.filter(function (k) { return !booleanKeys.includes(k) && !rowKeys.has(k) })
if (unclassified.length > 0) {
  notes.push(`${plugin.name}: ${unclassified.length} DEFAULT_STATE key(s) could not be classified ` +
    `by the switches check (${unclassified.join(', ')}) — verify by hand`)
}
```

This is a **regression-hazard fix, not a live bug**: today all 10 cds-theme booleans are written in the form the regex sees, so the check is green for the right reason. It matters for the *next* row someone adds.

**Also at `tools/audit.mjs:712/715/718`:** `const everyKey = []` is populated but never read. Dead variable — either use it (as in the patch above) or delete it. Confirmed dead:

```
$ Select-String -Path tools/audit.mjs -Pattern 'everyKey'
LineNumber Line
       712   const everyKey = []
       715     everyKey.push(match[1])
       718     everyKey.push(match[1])
```

(no other occurrence — collected, never consumed)

### F2 — LOW — `docs/replication-toggles.md:34` states the wrong rule count for `statTypography`

`docs/replication-toggles.md:34` says 「用量数字排版（**5 条规则**）」. The builder emits **4**:

```
$ node --input-type=module   # buildCssFor with statTypography on vs off, rule-level diff
statTypography     blocks removed= 4  style=4  keyframes=0  media=0  added=0
      [data-composer-stat] {
      [data-session-stats-details], [data-turn-usage-details] {
      [data-session-stats-details] dt, [data-turn-usage-details] dt {
      [data-session-stats-details] dd, [data-turn-usage-details] dd {
```

`styles.js:814-845` (`statTypographyRules()`) has exactly four rule heads. The 5th may have been the `[data-composer-stat]` **comment header** counted as a rule, or an earlier draft that also styled the pill.

**Patch:** change `（5 条规则）` → `（4 条规则）` at `docs/replication-toggles.md:34`.

### F3 — LOW — `docs/replication-toggles.md:31` overstates `statusPulse` as "6 条规则"

`docs/replication-toggles.md:31` says 「状态点呼吸（**6 条规则** + keyframes + reduced-motion）」. Actual: **1 style rule + 2 keyframes + 1 media block**:

```
statusPulse        blocks removed= 4  style=1  keyframes=2  media=1  added=0
      [data-chat-running] > span:last-of-type > :first-child {
      @keyframes cds-status-blink {
      @keyframes cds-status-breathe {
      @media (prefers-reduced-motion: reduce) {
```

The parenthetical already mentions keyframes and reduced-motion, so "6 条规则" double-counts the inner keyframe steps. Two readings are defensible; the number is not. Suggest stating it the way the others now do.

**Patch:** `（6 条规则 + keyframes + reduced-motion）` → `（1 条规则 + 2 组 keyframes + reduced-motion）`.

### F4 — INFO — the reviewed-order comment inside the test is stale

`plugins/cds-theme/test/section.test.mjs:651`

```js
// reviewed layout (10, 18, 19, 22, 24, 26, 29, 30, 31, 33, 34, 35, 36).
```

The actual page is `10, 18, 19, 22, 24, 26, 29, 30, 31, 33, 34, 35, 36, 37, 38` — the comment omits **37/38**, the two B-tier rows that landed last. The assertion itself (`indexOf(27/28/32) === -1`) is correct and passes; only the explanatory list is behind.

**Patch:** append `, 37, 38` to that comment. No assertion change.

---

## Claims I verified as TRUE

These are the ones I would stake the acceptance on.

1. **Reversibility — all seven switches are pure removals.** Built the sheet with the switch off, diffed at rule level against the on-state, for every one of the seven. `added: 0` in every case — no switch substitutes a replacement rule, so "off removes exactly N rules, changes none" holds literally.

   ```
   $ node --input-type=module   # buildCssFor({...DEFAULT_STATE, [k]: false}) vs on
   attachments        rules removed:  4  added: 0
   footnotes          rules removed:  2  added: 0
   statusPulse        rules removed:  4  added: 0    (1 rule + 2 keyframes + 1 media)
   concentricRadius   rules removed:  1  added: 0
   buttonSpring       rules removed:  2  added: 0
   statTypography     rules removed:  4  added: 0
   disclosurePolish   rules removed:  7  added: 0
   ```

2. **The reversibility tests are honest.** `css.test.mjs:986-1003` (A-tier) and `:1173-1185` (B-tier) rebuild the expected sheet by removing the captured block, then assert `off === expected` — and assert `expected !== on` first, so a mis-split cannot make the test vacuous. This is the right shape. It is not an eyeballed selector list.

3. **No two switches style the same element.** I collected every selector contributed by each of the seven and intersected them. The only duplicate is *within* one switch (statusPulse uses `[data-chat-running] > span:last-of-type > :first-child` in both the rule and its reduced-motion block, which is intended).

   ```
   === selectors used by MORE THAN ONE switch ===
     COLLISION: [data-chat-running] > span:last-of-type > :first-child  <- statusPulse + statusPulse
   ```
   No cross-switch collision exists. The failure class the Lead worried about — two items fighting over one element with `!important` — **is not present**.

4. **All ten boolean cds-theme keys are actually read.** Forward-checked each `DEFAULT_STATE` boolean to a consumer, then confirmed all ten have a settings row in `panel.js`. `thinkingLabelBlue` is consumed in `tokens.js:307-313` (a token pair, not a CSS rule) — legitimate, and `theme.js:96` correctly includes it in the token-affecting set so the token layer re-registers while the stylesheet does not.

5. **Every `data-*` hook the new items key on exists in the installed host bundle.** Grepped the real `app.asar` for all eleven:

   ```
   OK data-message-attachments   OK data-footnotes     OK data-chat-running
   OK data-menu-material         OK data-composer-stat OK data-session-stats-details
   OK data-turn-usage-details    OK data-disclosure-header  OK data-disclosure-row
   OK data-has-accessory         OK data-open  (3 exact-attribute occurrences)
   ```
   No CSS-Modules hash appears in any of the seven new items' rules, and the B-tier tests assert that (`css.test.mjs:1219`).

6. **316 tokens, every one a `{light,dark}` pair.** Ran `buildTokens()`:

   ```
   buildTokens key count: 316
   every key a {light,dark} pair: true
   non-pairs: 0
   ```
   Matches `docs/reference-absorption-ledger.md:32` and `:145` as they read on 2026-10-18.

   > **2026-10-22 更正：这个数字过期了。** 现在 `buildTokens(DEFAULT_STATE)` 返回 **319** 个键（173 配色 + 133 排印 + 13 圆角/阴影/缓动），四个强调色预设下都是 319；新增的 3 个是 UI 字号角色（`--dsw-font-family-ui`、`--dsw-font-size-ui`、`--dsw-font-size-ui-delta`）加入时没同步本文与 ledger。复审当时的结论（每个键都是 `{light,dark}` 对、没有非成对项）依然成立。复现：`node plugins/cds-theme/tools/verify.mjs | Select-String 'override map size'`。

7. **Retired-item rule counts in the doc are correct.** `codeBlockDetails` = **6** rules and `markdownBody` = **10** rules, confirmed by counting rules per emitted section. (My first count said 5 and 11; that was my boundary error, not the doc's — the doc counts by section block, which is the right unit.)

8. **Vacant orders 27/28/32 are genuinely vacant and asserted.** Actual registered orders are `10, 18, 19, 22, 24, 26, 29, 30, 31, 33, 34, 35, 36, 37, 38`; none of 27/28/32 appears, and `section.test.mjs:654-657` asserts all three. The claim in `docs/replication-toggles.md:40` holds.

9. **Test totals.** `cds-theme` **287 tests / 14 suites, 0 failed** (matches). `reasoning-effort` **80, 0 failed** (matches). `usage-stats` **116** (30+29+8+17+32), 0 failed once the concurrent edit settled (matches).

10. **`reasoning-effort`'s `remote.session` fix is correct and self-documented.** `client/src/lifecycle.js:98` injects `['sessions', 'remote', 'remote.session']` — naming the dotted service as its own dependency — and the failure mode (`cannot get property "remote.session" without inject`) is written up at `:86-97`. `package.json` `dsh.client.inject` carries package IDs (`@deepseek-ai/dsh-api-remotes`) while the client module's `inject` carries Cordis service names; the two are correctly distinguished per the repo convention.

11. **usage-stats order/units claims.** `constants.js:23,25` → `SETTINGS_ROW_ORDER = 40`, `UNITS_ROW_ORDER = 41`; the three-way mode is `auto | short | myriad` with `auto` resolved from the active locale at render (`panel.js:329-330`), which is what makes a language switch re-format numbers. Matches `docs/replication-toggles.md:45-46`.

12. **`buttonSpring`'s "3 常驻曲线令牌" is accurate.** `motionTokenRules()` emits exactly three (`--cds-btn-spring` 15-stop `linear(...)`, `--cds-ease-rise`, `--cds-ease-fall`) and they persist when the switch is off — correct, since the reference's curves are tokens rather than a look.

---

## 未核实 (could not verify, and why)

1. **The `attachments` / `statTypography` / `disclosurePolish` rules against a *live* rendered DOM.** All of my selector evidence is against the CSS the plugin emits plus the presence of the hooks in the host bundle. I did **not** launch the desktop app, so I cannot confirm the rules actually match elements at runtime (e.g. that `[data-disclosure-row] > :first-child` really is the chevron in this host build). `npm test` covers this shape indirectly; a real render does not.

2. **usage-stats' persisted parse cache and hot-tail tolerance under a cold 50 MB session store.** I ran the suite (green) but did not reproduce the end-to-end load claim (~20 ms from the disk parse cache). Measuring that needs the user's real session corpus.

3. **Whether the audit's `switches` check would catch a *new* defect today.** I proved the regex misses six shapes (F1) by probing it directly, but I did not add a temporary bad key to verify the failure path end-to-end — that would have meant editing `plugins/**`, which this review may not do.

4. **The claim that every one of cds-theme's rules keys only on stable hooks.** I verified the *seven new items* that way. The older, already-reviewed rule sets were out of scope for this pass.

---

## One process note for the Lead

The test failure I hit (`31 passed, 1 failed` in usage-stats) was **another agent's in-flight edit**, not a defect: `usage-store.js` and `usage-store.test.mjs` were written at 07:16:07/07:16:52 while my run was in progress, and the failure was `DEFAULT_CACHE_FILE` no longer matching `/dsh-usage-stats.*parse-cache-[0-9a-f]+\.json$/`. Three re-runs after the edits settled were `32 passed, 0 failed`. Worth knowing that a green run during a multi-agent window can be a snapshot of a moving tree — this review re-ran everything after the tree settled, and the numbers above are from those re-runs.
