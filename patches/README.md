# patches — host-archive changes

These are the changes this repository needs **inside the installed DeepSeek Harness** (`resources/app.asar`), which no plugin can make at runtime. Each one is a unified diff for review and a registered variant in [`../tools/patch-asar.mjs`](../tools/patch-asar.mjs), which is what actually applies it (an asar member is not a git worktree, so `git apply` is not what runs).

| File | Member | Purpose | Fragility |
|---|---|---|---|
| [`dsh-tool-fs-hunk-lines.patch`](dsh-tool-fs-hunk-lines.patch) | `@deepseek-ai/dsh-tool-fs/lib/index.js` + `@deepseek-ai/dsh-client-ui-tool/lib/client.js` | Carry each hunk's `oldStart`/`newStart` into persisted `meta.diffs`, so the edit card can print real file lines instead of counting from 1 | low: readable, tab-indented, unminified |
| [`dsh-web-frontend-diff-start.patch`](dsh-web-frontend-diff-start.patch) | `@deepseek-ai/dsh-web-frontend/dist/assets/index-*.js` | Publish that start line onto the DOM, for the host's own diff card | high: minified Vite bundle, anchors are build output |

## One file, several builds

The readable tool-fs anchors are byte-identical on `0.2.1-rc.2` and `0.2.1-rc.5`, so one diff covers both.

The minified web-frontend bundle is not like that: rc.5 renamed the asset (`index-CN7NIWNw.js` → `index-BXV-oxvX.js`) **and** every minified helper (`X_`→`Q_`, `gF`→`xF`, `yF`→`bF`, `de`→`he`, `Nn`→`Pn`). The `.patch` file therefore records the rc.2 text only; both builds live in `tools/patch-asar.mjs` as exact, reviewed variants, and selection is by exact path then exact anchor evidence. An unregistered build is reported as unavailable and never rewritten by a loose pattern — a wrong line number is worse than a skipped patch.

## Usage

```sh
node tools/patch-asar.mjs status                     # which patches are installed, and for which build
node tools/patch-asar.mjs apply --dry-run --out x.asar
node tools/patch-asar.mjs apply                      # needs DSH fully closed; writes app.asar.bak-<epoch>
node tools/patch-asar.mjs revert                     # restores the newest backup
node --test tools/test-patch-asar.mjs                # variant selection, edit post-conditions, repack
```

A real `apply` stages next to the archive and renames, because Windows holds `app.asar` open while DSH runs; the dry run prints the same plan without touching the installation. `npm run test:tools` runs the test file.

**Every DSH update replaces `app.asar` and takes these patches with it.** Re-run `status` after an update, then `apply`.

## Removed

`cds-theme-katex-fonts.patch` was deleted with the 0.1.10 release. It recorded the 0.1.9 fix — appending `:not(.katex):not(.katex *)` to the conversation font rule — which fixed math but raised that rule's specificity until it overrode code-token fonts. 0.1.10 replaced the whole approach with a container-only rule (see `plugins/cds-theme/client/src/styles.js`). The old patch is in git history at commit `04ecc7e`; keeping it here would have described a selector the source no longer contains.
