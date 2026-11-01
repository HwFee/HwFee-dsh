#!/usr/bin/env node
/**
 * Patch the installed DeepSeek Harness `app.asar` so edit/write diff metadata carries the
 * hunk's starting line numbers (`oldStart` / `newStart`), then repack the archive.
 *
 * WHY this lives outside the plugin tree: the two functions that drop the numbers
 * (`computeHunkDiffs` + the `presentationMeta` rebuild in `@deepseek-ai/dsh-tool-fs`, and
 * `narrowDiffs` in `@deepseek-ai/dsh-client-ui-tool`) are shipped inside the Electron asar,
 * not in this repo. There is no unpacked copy of the app, so the only way to change them is
 * to rewrite the archive. A plugin cannot do it: the numbers are gone before any client
 * plugin sees `meta`.
 *
 * The matching unified diff for review/`git apply` is `patches/dsh-tool-fs-hunk-lines.patch`;
 * this tool applies the same edits as literal anchor replacements (an asar member is not a
 * git worktree, so `git apply` is not what runs against the installation).
 *
 * Usage:
 *   node tools/patch-asar.mjs status [--asar <path>]
 *   node tools/patch-asar.mjs apply  [--asar <path>] [--dry-run] [--out <file>]
 *   node tools/patch-asar.mjs revert [--asar <path>]
 *
 * `apply` refuses to run when the archive is already patched or an anchor is missing, and it
 * always writes `app.asar.bak-<epochms>` next to the archive before replacing it.
 * `--dry-run` never touches the archive: it builds the patched archive in memory and verifies
 * it, optionally writing it to `--out`. Close the app before a real apply — the running
 * process holds the archive open (Windows locks it) and would keep serving old code anyway.
 */

import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

/**
 * The shipped location of the app bundle; `--asar` exists for dry runs and tests.
 *
 * WHY this is derived from LOCALAPPDATA instead of a hard-coded user name: the archive path
 * contains the Windows account name, and the previous literal (`C:/Users/17445/...`) made
 * `status`/`apply` silently point at a different machine's installation. `DSH_ASAR` wins so a
 * test or a second install (preview channel) can be pointed at without editing this file.
 */
export const DEFAULT_ASAR =
  process.env.DSH_ASAR ??
  join(
    process.env.LOCALAPPDATA ?? 'C:/Users/17445/AppData/Local',
    'Programs/DeepSeek Harness/resources/app.asar',
  )

/** asar framing constants: Electron writes a pickled header of fixed shape (see repack()). */
const HEADER_BASE = 16 // 4 size fields before the JSON string
const DEFAULT_BLOCK_SIZE = 4 * 1024 * 1024

/** Indent helper; the shipped bundles are tab-indented and an anchor must match byte for byte. */
const t = (depth, text) => '\t'.repeat(depth) + text
const block = (...rows) => rows.join('\n')

/**
 * The patches this tool knows, in the order they must be applied.
 *
 * Each patch is independently selectable (`--patch <id>`), independently revertible, and
 * independently fragile: the second one targets a MINIFIED bundle whose single-line anchors a
 * future rebuild will almost certainly invalidate, and a broken second patch must never block
 * reinstalling the first. `status` treats "absent" and "not this build" differently for the same
 * reason — see the `SKIPPED` verdict.
 *
 * `targets[]` holds a logical archive change. Each target has one or more `variants`, because the
 * web frontend is a hashed Vite bundle: rc.2 shipped `index-CN7NIWNw.js` with `X_`/`gF`, rc.5
 * shipped `index-BXV-oxvX.js` with `Q_`/`xF`. A variant carries the exact path, marker and anchors
 * for one reviewed build. Selection is by exact path plus exact anchor evidence; an unknown build
 * cannot be rewritten by a loose minified-name regex.
 * `marker` is a substring that appears only in the patched form, and `markerCount` is how many
 * times it must occur (the row builder has a head and a tail site). Together they are how `status`
 * and the idempotence guard tell patched, unpatched, corrupted and unknown apart without
 * re-deriving the edits.
 */
export const PATCHES = [
  {
    id: 'hunk-lines',
    file: 'patches/dsh-tool-fs-hunk-lines.patch',
    summary: 'carry oldStart/newStart from the diff engine into meta.diffs',
    // Readable, tab-indented, unminified members: the most anchor-stable thing in the archive.
    fragile: 'low',
    requires: [],
    targets: [
      {
        id: 'host-meta',
        role: 'host: writes `meta.diffs`',
        variants: [
          {
            // The same anchor was verified byte-for-byte against the rc.2 and rc.5 bundles.
            build: '@deepseek-ai/dsh-tool-fs 0.2.1-rc.2 / 0.2.1-rc.5',
            path: 'dsh/node_modules/@deepseek-ai/dsh-tool-fs/lib/index.js',
            marker: 'oldStart: hunk.oldStart',
            markerCount: 1,
            edits: [
              {
                id: 'compute-hunk-starts',
                // The one place that has `hunk.oldStart` / `hunk.newStart` in hand. Everything
                // downstream only ever saw the joined text, so the numbers died here.
                anchor: block(
                  t(2, 'diffs.push({'),
                  t(3, 'path,'),
                  t(3, 'oldText: oldLines.length > 0 ? oldLines.join("\\n") : null,'),
                  t(3, 'newText: newLines.join("\\n")'),
                  t(2, '});'),
                ),
                replace: block(
                  t(2, 'diffs.push({'),
                  t(3, 'path,'),
                  t(3, 'oldText: oldLines.length > 0 ? oldLines.join("\\n") : null,'),
                  t(3, 'newText: newLines.join("\\n"),'),
                  t(3, '// WHY: the hunk header already knows where this change sits in the file, but'),
                  t(3, '// only the joined text was kept — a renderer could number rows 1..n and nothing'),
                  t(3, '// else. Carry both sides\' 1-based start lines so the diff card can print real'),
                  t(3, '// file line numbers (and so a clicked number can jump to that line).'),
                  t(3, 'oldStart: hunk.oldStart,'),
                  t(3, 'newStart: hunk.newStart'),
                  t(2, '});'),
                ),
              },
              {
                id: 'is-file-diff',
                // Defensive narrowing of opaque `meta`: optional numbers must not fail, but a
                // present-but-wrong value must, or a malformed producer slips past replay.
                anchor: block(
                  t(1, 'const { path, oldText, newText } = value;'),
                  t(
                    1,
                    'return typeof path === "string" && (oldText === null || typeof oldText === "string") && typeof newText === "string";',
                  ),
                ),
                replace: block(
                  t(1, 'const { path, oldText, newText, oldStart, newStart } = value;'),
                  t(1, '// WHY: both start lines are optional on purpose. Sessions recorded before this'),
                  t(1, '// patch (and the argument-derived diff on a tool call that never settled) have'),
                  t(1, '// no numbers; replaying them must stay valid. A number that is present but not a'),
                  t(1, '// line number is still rejected.'),
                  t(1, 'const startLine = (line) => line === void 0 || Number.isInteger(line) && line >= 0;'),
                  t(
                    1,
                    'return typeof path === "string" && (oldText === null || typeof oldText === "string") && typeof newText === "string" && startLine(oldStart) && startLine(newStart);',
                  ),
                ),
              },
              {
                id: 'write-presentation-meta',
                // `presentationMeta` re-projects each hunk through a destructure; without adding the
                // fields here the patched hunks would be trimmed again and `meta.diffs` would still
                // be the old three-key shape.
                anchor: block(
                  t(
                    4,
                    'diffs: value.before === null ? [] : computeHunkDiffs(value.path, value.before, value.after).map(({ path, oldText, newText }) => ({',
                  ),
                  t(5, 'path,'),
                  t(5, 'oldText,'),
                  t(5, 'newText'),
                  t(4, '}))'),
                ),
                replace: block(
                  t(
                    4,
                    'diffs: value.before === null ? [] : computeHunkDiffs(value.path, value.before, value.after).map(({ path, oldText, newText, oldStart, newStart }) => ({',
                  ),
                  t(5, 'path,'),
                  t(5, 'oldText,'),
                  t(5, 'newText,'),
                  t(5, '// WHY: this rebuild is the second place the numbers used to die. It must list'),
                  t(5, '// them explicitly, because the projection exists to keep `meta` to three keys.'),
                  t(5, 'oldStart,'),
                  t(5, 'newStart'),
                  t(4, '}))'),
                ),
              },
              {
                id: 'edit-presentation-meta',
                // Same projection on the edit tool's result path.
                anchor: block(
                  t(
                    4,
                    'diffs: computeHunkDiffs(value.path, value.before, value.after).map(({ path, oldText, newText }) => ({',
                  ),
                  t(5, 'path,'),
                  t(5, 'oldText,'),
                  t(5, 'newText'),
                  t(4, '}))'),
                ),
                replace: block(
                  t(
                    4,
                    'diffs: computeHunkDiffs(value.path, value.before, value.after).map(({ path, oldText, newText, oldStart, newStart }) => ({',
                  ),
                  t(5, 'path,'),
                  t(5, 'oldText,'),
                  t(5, 'newText,'),
                  t(5, '// WHY: mirror of the write path — a hunk that reaches `diffCardModel` without'),
                  t(5, '// its start line is a hunk the card has to renumber from 1.'),
                  t(5, 'oldStart,'),
                  t(5, 'newStart'),
                  t(4, '}))'),
                ),
              },
            ],
          },
        ],
      },
      {
        id: 'client-narrow-diffs',
        role: 'client: rebuilds each hunk before `diffCardModel`',
        variants: [
          {
            build: '@deepseek-ai/dsh-client-ui-tool 0.2.1-rc.2 / 0.2.1-rc.5',
            path: 'dsh/node_modules/@deepseek-ai/dsh-client-ui-tool/lib/client.js',
            marker: 'const { path, oldText, newText, oldStart, newStart } = hunk;',
            markerCount: 1,
            edits: [
              {
                id: 'narrow-diffs',
                // Third place the numbers die: the browser-side narrowing rebuilds every hunk from
                // three destructured keys.
                anchor: block(
                  t(4, 'const { path, oldText, newText } = hunk;'),
                  t(4, 'if (typeof path !== "string") return null;'),
                  t(4, 'if (oldText !== null && typeof oldText !== "string") return null;'),
                  t(4, 'if (typeof newText !== "string") return null;'),
                  t(4, 'out.push({'),
                  t(5, 'path,'),
                  t(5, 'oldText,'),
                  t(5, 'newText'),
                  t(4, '});'),
                ),
                replace: block(
                  t(4, 'const { path, oldText, newText, oldStart, newStart } = hunk;'),
                  t(4, 'if (typeof path !== "string") return null;'),
                  t(4, 'if (oldText !== null && typeof oldText !== "string") return null;'),
                  t(4, 'if (typeof newText !== "string") return null;'),
                  t(4, '// WHY: same rule as the host guard — old metadata has no start lines, new'),
                  t(4, '// metadata does, and this rebuild must not be the third place that drops them.'),
                  t(4, '// Absent stays absent (the card falls back to 1..n); present-but-invalid fails.'),
                  t(4, 'if (oldStart !== void 0 && !(Number.isInteger(oldStart) && oldStart >= 0)) return null;'),
                  t(4, 'if (newStart !== void 0 && !(Number.isInteger(newStart) && newStart >= 0)) return null;'),
                  t(4, 'out.push({'),
                  t(5, 'path,'),
                  t(5, 'oldText,'),
                  t(5, 'newText,'),
                  t(5, '...(oldStart !== void 0 ? { oldStart } : {}),'),
                  t(5, '...(newStart !== void 0 ? { newStart } : {})'),
                  t(4, '});'),
                ),
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'diff-start-attrs',
    file: 'patches/dsh-web-frontend-diff-start.patch',
    summary: 'publish each hunk\'s start line onto its first row, where the theme can read it',
    // A MINIFIED, 192-line, single-line-heavy Vite bundle. The anchors below are exact byte
    // matches against one build; a rebuild renames/merges these helpers and this patch will
    // refuse to apply. That is why it ships separately and `status` marks it SKIPPED rather
    // than failing the whole run.
    //
    // WHY there are two variants instead of one loose minified-name matcher: the identifiers
    // (`X_`/`gF` in rc.2, `Q_`/`xF` in rc.5) are build outputs, not API. A generic regex would
    // match a renamed or restructured function and publish a wrong line number instead of
    // failing loudly. Each variant is an exact, reviewed build; an unknown build is SKIPPED.
    fragile: 'high',
    requires: ['hunk-lines'],
    targets: [
      {
        id: 'web-frontend-diff-block',
        role: 'web frontend: DiffBlock row builder',
        variants: [
          {
            build: '@deepseek-ai/dsh-web-frontend 0.2.1-rc.2 (index-CN7NIWNw.js)',
            path: 'dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-CN7NIWNw.js',
            marker: 'data-diff-new-start',
            // Two sites: the head map and the collapsed tail map. Counting both makes a
            // half-applied edit fail here instead of looking "patched" because one attribute
            // happened to land.
            markerCount: 2,
            edits: [
              {
                id: 'gF-carry-start',
                // WHY the number is computed as `i.newStart + s.newStart - 1`:
                // `i` is the meta hunk (`{path, oldText, newText, oldStart, newStart}` — the two
                // numbers patch 1 adds). `X_(i)` then RE-DIFFS that hunk's own texts, and because
                // those texts are already a slice of the file, jsdiff numbers the result from 1.
                // So the sub-hunk's file line is the hunk's file start plus the sub-hunk's own
                // 1-based line minus one. Nothing is recomputed from the file: patch 1's numbers are
                // the only source of truth, and this expression just re-bases them.
                //
                // WHY `n` (the sub-hunk index) is irrelevant and the gap row is untouched: a hunk
                // whose texts contain two separated changes is emitted as two sub-hunks with a `⋯`
                // between them, and each one gets its own start from its own `s`. That is what makes
                // a multi-hunk card number correctly instead of restarting.
                //
                // WHY `i.newStart === void 0` emits nothing: on a session recorded before patch 1
                // there is no start to publish. Leaving `start` undefined keeps every downstream
                // guard on its existing path (the theme then counts 1..n, as it does today) instead
                // of publishing a confidently wrong 0.
                anchor:
                  'i.path!==r?t.push({kind:"path",text:i.path}):t.push({kind:"gap",text:"⋯"}),r=i.path;for(const[n,s]of X_(i).entries()){n>0&&t.push({kind:"gap",text:"⋯"});for(const l of s.lines){const d=l.startsWith("-")?"del":l.startsWith("+")?"add":"context";t.push({kind:d,text:l.slice(1)})}}',
                replace:
                  'i.path!==r?t.push({kind:"path",text:i.path}):t.push({kind:"gap",text:"⋯"}),r=i.path;for(const[n,s]of X_(i).entries()){n>0&&t.push({kind:"gap",text:"⋯"});let g0=!0;for(const l of s.lines){const d=l.startsWith("-")?"del":l.startsWith("+")?"add":"context";const o={kind:d,text:l.slice(1)};if(g0&&i.newStart!==void 0){g0=!1;o.start={newStart:i.newStart+s.newStart-1,oldStart:(i.oldStart===void 0?i.newStart:i.oldStart)+s.oldStart-1}}t.push(o)}}',
              },
              {
                id: 'emit-attr-head',
                // WHY the attribute lands on the FIRST ROW of each hunk, not on the body:
                // `diffnumbers.js` numbers a card in body mode only when it has ONE contiguous
                // segment. Any multi-hunk card has the `⋯` separator, so it is numbered in ROW mode,
                // and row mode requires EVERY segment's first row to carry its own start. A
                // body-level attribute would light up single-hunk cards and leave multi-hunk ones at
                // 1..n — the case users actually notice.
                //
                // WHY the head and tail map sites are patched separately: they are the head and tail
                // slices of the SAME row array (head = first `r/2` rows, tail = last rows when
                // collapsed). Both render real code rows, so both need to forward `start`; the
                // anchors differ only by their receiver, which is also what keeps each one
                // unique in the file.
                anchor: 'F.map((L,H)=>u.jsx("div",{className:de(Nn.line,F8[L.kind]),children:L.text},H))',
                replace:
                  'F.map((L,H)=>u.jsx("div",{className:de(Nn.line,F8[L.kind]),children:L.text,"data-diff-new-start":L.start===void 0?void 0:L.start.newStart,"data-diff-old-start":L.start===void 0?void 0:L.start.oldStart},H))',
              },
              {
                id: 'emit-attr-tail',
                anchor: 'D.map((L,H)=>u.jsx("div",{className:de(Nn.line,F8[L.kind]),children:L.text},H))',
                replace:
                  'D.map((L,H)=>u.jsx("div",{className:de(Nn.line,F8[L.kind]),children:L.text,"data-diff-new-start":L.start===void 0?void 0:L.start.newStart,"data-diff-old-start":L.start===void 0?void 0:L.start.oldStart},H))',
              },
            ],
          },
          {
            // rc.5 renamed every minified helper: X_ -> Q_, gF -> xF, u -> d, de -> he,
            // Nn -> Pn, L/H -> O/U. The three anchors below are the exact rc.5 text; the
            // replacement keeps the rc.2 semantics and only re-bases onto the rc.5 names.
            build: '@deepseek-ai/dsh-web-frontend 0.2.1-rc.5 (index-BXV-oxvX.js)',
            path: 'dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BXV-oxvX.js',
            marker: 'data-diff-new-start',
            markerCount: 2,
            edits: [
              {
                id: 'xF-carry-start',
                // The row-building loop is the whole anchor: `i` is the meta hunk and `s` is a
                // re-diffed sub-hunk, exactly as in rc.2. Inserting `g0` before the loop keeps the
                // first-row-only rule and leaves every later row's shape unchanged.
                anchor:
                  'for(const l of s.lines){const u=l.startsWith("-")?"del":l.startsWith("+")?"add":"context";t.push({kind:u,text:l.slice(1)})}',
                replace:
                  'let g0=!0;for(const l of s.lines){const u=l.startsWith("-")?"del":l.startsWith("+")?"add":"context";const o={kind:u,text:l.slice(1)};if(g0&&i.newStart!==void 0){g0=!1;o.start={newStart:i.newStart+s.newStart-1,oldStart:(i.oldStart===void 0?i.newStart:i.oldStart)+s.oldStart-1}}t.push(o)}',
              },
              {
                id: 'emit-attr-head-rc5',
                anchor: 'P.map((O,U)=>d.jsx("div",{className:he(Pn.line,F8[O.kind]),children:O.text},U))',
                replace:
                  'P.map((O,U)=>d.jsx("div",{className:he(Pn.line,F8[O.kind]),children:O.text,"data-diff-new-start":O.start===void 0?void 0:O.start.newStart,"data-diff-old-start":O.start===void 0?void 0:O.start.oldStart},U))',
              },
              {
                id: 'emit-attr-tail-rc5',
                anchor: 'D.map((O,U)=>d.jsx("div",{className:he(Pn.line,F8[O.kind]),children:O.text},U))',
                replace:
                  'D.map((O,U)=>d.jsx("div",{className:he(Pn.line,F8[O.kind]),children:O.text,"data-diff-new-start":O.start===void 0?void 0:O.start.newStart,"data-diff-old-start":O.start===void 0?void 0:O.start.oldStart},U))',
              },
            ],
          },
        ],
      },
    ],
  },
]


/** Read the archive framing: raw bytes, parsed header, where the data area starts. */
export function readArchive(file) {
  return parseArchive(readFileSync(file), file)
}

/** Same as {@link readArchive} over already-loaded bytes (dry runs keep the archive in memory). */
export function parseArchive(buf, file) {
  const jsonLength = buf.readUInt32LE(12)
  const header = JSON.parse(buf.subarray(HEADER_BASE, HEADER_BASE + jsonLength).toString('utf8'))
  // `dataOffset` comes from the frame (not from HEADER_BASE + jsonLength) so any alignment
  // padding between the JSON and the data area is accounted for by construction.
  const dataOffset = 8 + buf.readUInt32LE(4)
  return { file, buf, header, jsonLength, dataOffset }
}

/**
 * File entries in archive order (the order the data area is laid out in).
 * Accepts either a parsed header or the object `readArchive()` returns, because mixing the two
 * up yields an empty list rather than an error — a silent "everything verified" is the worst
 * possible failure mode for a tool whose job is verifying an archive.
 */
export function walkEntries(headerOrArchive) {
  const header = headerOrArchive.header ?? headerOrArchive
  const out = []
  const walk = (node, prefix) => {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const path = prefix === '' ? name : `${prefix}/${name}`
      if (entry.files !== undefined) walk(entry, path)
      else out.push([path, entry])
    }
  }
  walk(header, '')
  if (out.length === 0) throw new Error('archive header contains no file entries')
  return out
}

/** The on-disk entry record for one archive path; throws with the path when it is absent. */
export function locate(header, path) {
  let node = header
  for (const part of path.split('/')) {
    node = node.files?.[part]
    if (node === undefined) throw new Error(`archive member not found: ${path}`)
  }
  return node
}

/** Read one member's bytes. */
export function extract(archive, path) {
  const entry = locate(archive.header, path)
  if (entry.unpacked === true) throw new Error(`member is unpacked, not in the archive: ${path}`)
  const start = archive.dataOffset + Number(entry.offset)
  return archive.buf.subarray(start, start + Number(entry.size))
}

/** How many times `needle` occurs in `haystack` (anchors must be unique to be safe). */
function countOccurrences(haystack, needle) {
  let count = 0
  let at = haystack.indexOf(needle)
  while (at !== -1) {
    count += 1
    at = haystack.indexOf(needle, at + needle.length)
  }
  return count
}

/**
 * The build variants that can satisfy one logical target.
 *
 * A target used to be exactly one archive path. That only works while every installed build has
 * the same filename and the same minified identifiers; rc.5 renamed both. Keeping a target with
 * several reviewed variants lets `status` say "this is the rc.2/rc.5 build I know" while an
 * unknown build stays SKIPPED instead of being rewritten by a loose pattern.
 */
export function targetVariants(target) {
  return Array.isArray(target.variants) && target.variants.length > 0 ? target.variants : [target]
}

/**
 * Apply every edit of one target variant to `text`.
 *
 * Post-conditions, not just pre-conditions: after each replacement the anchor must be gone and
 * the replacement must occur exactly once. That catches a replacement string that accidentally
 * contains its own anchor (a second run would match there) and a partially applied bundle.
 *
 * @returns the patched text.
 * @throws when an anchor is missing or matches more than once — a silent no-op patch is worse
 *   than a failure, because the archive would then look patched while still dropping the fields.
 */
export function applyEdits(text, target) {
  let next = text
  for (const edit of target.edits) {
    const hits = countOccurrences(next, edit.anchor)
    if (hits !== 1) {
      const preview = edit.anchor.split('\n').slice(0, 3).join('\n')
      throw new Error(
        `${target.path}: edit "${edit.id}" expected exactly 1 anchor match, found ${hits}.` +
          `\n  expected text (first lines):\n${preview}` +
          `\n  The installed build likely differs from the one this tool was written against.`,
      )
    }
    next = next.replace(edit.anchor, () => edit.replace)
    const anchorLeft = countOccurrences(next, edit.anchor)
    const replacements = countOccurrences(next, edit.replace)
    if (anchorLeft !== 0 || replacements !== 1) {
      throw new Error(
        `${target.path}: edit "${edit.id}" failed post-edit validation` +
          ` (anchor still present ${anchorLeft} time(s), replacement occurs ${replacements} time(s), expected 0 and 1).` +
          ' The replacement text must be unique and must not contain the anchor it replaced.',
      )
    }
  }
  return next
}

/** Integrity record Electron writes per member: whole-file hash plus per-block hashes. */
function integrityFor(bytes, blockSize) {
  const size = blockSize > 0 ? blockSize : DEFAULT_BLOCK_SIZE
  const hash = createHash('sha256').update(bytes).digest('hex')
  const blocks = []
  if (bytes.length > size) {
    for (let at = 0; at < bytes.length; at += size) {
      blocks.push(createHash('sha256').update(bytes.subarray(at, at + size)).digest('hex'))
    }
  } else {
    // Matches the shipped archive: one block, identical to the whole-file hash.
    blocks.push(hash)
  }
  return { algorithm: 'SHA256', hash, blockSize: size, blocks }
}

/**
 * Rebuild the archive with `replacements` (Map<archivePath, Buffer>) spliced in.
 *
 * WHY repack the whole archive instead of patching bytes in place: a changed member length
 * shifts every later member's `offset`, so the header has to be rewritten anyway. The data
 * area is a flat concatenation of the *packed* members in walk order (verified against the
 * shipped archive: 16726 packed members, zero offset gaps, zero trailing bytes), so
 * re-emitting them in that same order reproduces the layout exactly, and each member's
 * integrity hash is recomputed to match its new bytes.
 *
 * Nothing is signed here; the archive carries no signature.
 */
export function repack(archive, replacements) {
  const chunks = []
  let offset = 0
  for (const [path, entry] of walkEntries(archive.header)) {
    // Unpacked members have no offset and no bytes in the archive; `app.asar.unpacked` stays
    // untouched, which is why only packed members move.
    if (entry.unpacked === true) continue
    const start = archive.dataOffset + Number(entry.offset)
    const original = archive.buf.subarray(start, start + Number(entry.size))
    const bytes = replacements.get(path) ?? original
    entry.offset = String(offset)
    entry.size = bytes.length
    if (entry.integrity !== undefined) {
      entry.integrity = integrityFor(bytes, Number(entry.integrity.blockSize) || DEFAULT_BLOCK_SIZE)
    }
    chunks.push(bytes)
    offset += bytes.length
  }
  const json = Buffer.from(JSON.stringify(archive.header), 'utf8')
  // Electron/asar pickle framing, as observed in the shipped file: [4][json+8][json+4][json]
  // then the JSON, padded so the data area starts on a 4-byte boundary.
  const padding = (4 - ((HEADER_BASE + json.length) % 4)) % 4
  const frame = Buffer.alloc(HEADER_BASE)
  frame.writeUInt32LE(4, 0)
  frame.writeUInt32LE(json.length + 8 + padding, 4)
  frame.writeUInt32LE(json.length + 4 + padding, 8)
  frame.writeUInt32LE(json.length, 12)
  return Buffer.concat([frame, json, Buffer.alloc(padding), ...chunks])
}

/** Re-read a rebuilt archive and prove its framing, offsets and hashes are self-consistent. */
function verifyArchive(file, expected) {
  const archive = readArchive(file)
  const problems = []
  let offset = 0
  let checked = 0
  for (const [path, entry] of walkEntries(archive.header)) {
    if (entry.unpacked === true) continue
    if (Number(entry.offset) !== offset) {
      problems.push(`${path}: offset ${entry.offset} != expected ${offset}`)
      break
    }
    const start = archive.dataOffset + Number(entry.offset)
    const bytes = archive.buf.subarray(start, start + Number(entry.size))
    if (entry.integrity !== undefined) {
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (digest !== entry.integrity.hash) problems.push(`${path}: sha256 mismatch`)
    }
    offset += Number(entry.size)
    checked += 1
  }
  if (archive.dataOffset + offset !== archive.buf.length) {
    problems.push(
      `data area ends at ${archive.dataOffset + offset}, file is ${archive.buf.length} bytes`,
    )
  }
  for (const [path, bytes] of expected) {
    const actual = extract(archive, path)
    if (!actual.equals(bytes)) problems.push(`${path}: repacked bytes differ from the patched text`)
  }
  return { problems, checked, bytes: archive.buf.length }
}

/**
 * Classify one variant against its actual member text.
 *
 * `patched` requires the full patched shape, not one marker substring: the anchor is gone and
 * every replacement occurs once. A marker that is present but incomplete is `corrupted` (a
 * half-applied or hand-edited bundle), which is materially different from "unknown build".
 */
function inspectVariantText(text, variant) {
  const expectedMarkers = variant.markerCount ?? 1
  const markerHits = countOccurrences(text, variant.marker)
  if (markerHits > 0 && markerHits !== expectedMarkers) {
    return {
      patched: false,
      anchorsMatch: false,
      corrupted: true,
      reasons: [
        `marker "${variant.marker}" occurs ${markerHits} time(s), expected ${expectedMarkers}`,
      ],
    }
  }
  if (markerHits === expectedMarkers) {
    const problems = []
    for (const edit of variant.edits) {
      const anchorHits = countOccurrences(text, edit.anchor)
      const replacementHits = countOccurrences(text, edit.replace)
      if (anchorHits !== 0) {
        problems.push(`${edit.id}: original anchor still present ${anchorHits} time(s)`)
      }
      if (replacementHits !== 1) {
        problems.push(`${edit.id}: replacement occurs ${replacementHits} time(s), expected 1`)
      }
    }
    return {
      patched: problems.length === 0,
      anchorsMatch: false,
      corrupted: problems.length > 0,
      reasons: problems,
    }
  }
  const anchorResults = variant.edits.map((edit) => ({
    id: edit.id,
    hits: countOccurrences(text, edit.anchor),
  }))
  return {
    patched: false,
    anchorsMatch: anchorResults.every((result) => result.hits === 1),
    corrupted: false,
    reasons: anchorResults
      .filter((result) => result.hits !== 1)
      .map((result) => `${result.id}: ${result.hits} anchor match(es), expected 1`),
  }
}

/**
 * Pick the variant this archive actually contains.
 *
 * Selection is by exact archive path first, then by exact marker/anchor evidence. It never
 * rewrites a lookalike: if two known variants are present, or a present one is half-patched, the
 * caller gets an error instead of a guess.
 */
export function resolveTarget(archive, target) {
  const states = targetVariants(target).map((variant) => {
    try {
      const text = extract(archive, variant.path).toString('utf8')
      return {
        variant,
        present: true,
        size: Buffer.byteLength(text, 'utf8'),
        ...inspectVariantText(text, variant),
      }
    } catch (error) {
      return {
        variant,
        present: false,
        size: 0,
        patched: false,
        anchorsMatch: false,
        corrupted: false,
        reasons: [error.message],
      }
    }
  })
  const present = states.filter((state) => state.present)
  const patched = present.filter((state) => state.patched)
  if (patched.length > 1) {
    return {
      states,
      error: `ambiguous build: ${patched.map((state) => state.variant.build).join(' and ')} are both patched`,
    }
  }
  if (patched.length === 1) return { states, chosen: patched[0] }
  if (present.length === 0) {
    return {
      states,
      error: `archive member not found for any supported build: ${targetVariants(target)
        .map((variant) => `${variant.build ?? 'unknown build'} (${variant.path})`)
        .join(', ')}`,
    }
  }
  if (present.length === 1) return { states, chosen: present[0] }
  const applicable = present.filter((state) => !state.corrupted && state.anchorsMatch)
  if (applicable.length === 1 && present.every((state) => !state.corrupted)) {
    return { states, chosen: applicable[0] }
  }
  return {
    states,
    error:
      `ambiguous build: ${present.length} supported variants are present ` +
      `(${present.map((state) => state.variant.build).join(', ')}) and none is uniquely selectable`,
  }
}

/**
 * Marker presence per logical target, for one patch — the single source of truth for "is this
 * patched".
 *
 * Four states, because the second patch's anchors are minified text that a rebuild invalidates:
 * `patched` (full patched shape), `unpatched` (anchors still match), `unavailable` (no supported
 * build is present, or the evidence is ambiguous), and `corrupted` (a marker is present but the
 * shape is incomplete — a half-applied or hand-edited bundle).
 */
export function inspect(archive, patch) {
  return patch.targets.map((target) => {
    const { states, chosen, error } = resolveTarget(archive, target)
    if (error !== undefined) {
      const nonePresent = states.every((state) => !state.present)
      return {
        path: states.map((state) => state.variant.path).join(' | '),
        role: target.role,
        build: null,
        size: 0,
        missing: nonePresent,
        ambiguous: !nonePresent,
        patched: false,
        anchorsMatch: false,
        corrupted: false,
        // WHY this is an array: it used to be `error.message` (a string), and `status` iterated
        // it as `for (const reason of row.reasons)`, printing one line per character.
        reasons: [error],
        variants: states.map((state) => ({
          build: state.variant.build ?? null,
          path: state.variant.path,
          present: state.present,
          patched: state.patched,
          corrupted: state.corrupted,
        })),
      }
    }
    return {
      path: chosen.variant.path,
      role: target.role,
      build: chosen.variant.build ?? null,
      size: chosen.size,
      missing: false,
      ambiguous: false,
      patched: chosen.patched,
      anchorsMatch: chosen.anchorsMatch,
      corrupted: chosen.corrupted,
      reasons: chosen.reasons,
      variants: states.map((state) => ({
        build: state.variant.build ?? null,
        path: state.variant.path,
        present: state.present,
        patched: state.patched,
        corrupted: state.corrupted,
      })),
    }
  })
}

/**
 * Per-patch verdict.
 * - `patched`     every target carries the complete patched shape
 * - `unpatched`   every target is unpatched AND every anchor matches exactly once (applicable)
 * - `unavailable` no supported build is present / ambiguous: this is not the build the patch was
 *                 written against (typical after an app update, for the minified patch)
 * - `partial`     a mix of patched, corrupted and unpatched targets — hand-edited or interrupted
 */
export function patchState(archive, patch) {
  const rows = inspect(archive, patch)
  if (rows.some((row) => row.missing || row.ambiguous)) return { state: 'unavailable', rows }
  if (rows.some((row) => row.corrupted)) return { state: 'partial', rows }
  const patched = rows.filter((row) => row.patched).length
  if (patched === rows.length) return { state: 'patched', rows }
  if (patched > 0) return { state: 'partial', rows }
  if (rows.some((row) => !row.anchorsMatch)) return { state: 'unavailable', rows }
  return { state: 'unpatched', rows }
}

/** Select the patches named by `only` (ids), or all of them. Throws on an unknown id. */
export function selectPatches(only) {
  if (only === undefined || only.length === 0) return PATCHES
  const unknown = only.filter((id) => !PATCHES.some((patch) => patch.id === id))
  if (unknown.length > 0) {
    throw new Error(
      `unknown patch id(s): ${unknown.join(', ')} — known: ${PATCHES.map((p) => p.id).join(', ')}`,
    )
  }
  return PATCHES.filter((patch) => only.includes(patch.id))
}

/** Replacements for one patch, or a loud failure naming the build/anchor that did not match. */
function replacementsFor(archive, patch) {
  const out = new Map()
  for (const target of patch.targets) {
    const { chosen, error } = resolveTarget(archive, target)
    if (error !== undefined) throw new Error(`${target.role}: ${error}`)
    const original = extract(archive, chosen.variant.path)
    const patched = Buffer.from(applyEdits(original.toString('utf8'), chosen.variant), 'utf8')
    out.set(chosen.variant.path, { original, patched })
  }
  return out
}

/** Newest `app.asar.bak-<epochms>` next to `asarFile`, or undefined. */
function newestBackup(asarFile) {
  const dir = dirname(asarFile)
  const prefix = `${asarFile.split(/[\\/]/).pop()}.bak-`
  const candidates = readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({ name, at: Number(name.slice(prefix.length)) }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((a, b) => b.at - a.at)
  return candidates.length === 0 ? undefined : join(dir, candidates[0].name)
}

/** Parse `--flag value` / `--flag` from argv without a dependency. */
function parseArgs(argv) {
  const options = {
    command: argv[0],
    dryRun: false,
    asar: DEFAULT_ASAR,
    out: undefined,
    only: [],
    force: false,
  }
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--force') options.force = true
    else if (arg === '--asar') options.asar = argv[++i]
    else if (arg === '--out') options.out = argv[++i]
    else if (arg === '--patch') {
      // Repeatable, and accepts a comma-separated list so `--patch a,b` works too.
      const value = argv[++i]
      if (value === undefined) throw new Error('--patch needs a patch id')
      options.only.push(...value.split(',').map((part) => part.trim()).filter(Boolean))
    } else throw new Error(`unknown argument: ${arg}`)
  }
  return options
}

/** Human label for one patch state. */
const STATE_LABEL = {
  patched: 'PATCHED',
  unpatched: 'unpatched',
  unavailable: 'SKIPPED (no supported build / anchors do not match)',
  partial: 'PARTIAL (half-patched or corrupted)',
}

/** Human label for one target row. `missing` and `ambiguous` are not the same failure. */
function rowLabel(row) {
  if (row.missing) return 'MISSING '
  if (row.ambiguous) return 'AMBIGUOUS '
  if (row.corrupted) return 'CORRUPTED '
  return row.patched ? 'PATCHED ' : 'unpatched'
}

function status(asarFile, only) {
  if (!existsSync(asarFile)) throw new Error(`archive not found: ${asarFile}`)
  const archive = readArchive(asarFile)
  console.log(`archive: ${asarFile} (${archive.buf.length} bytes)`)
  const states = []
  for (const patch of selectPatches(only)) {
    const { state, rows } = patchState(archive, patch)
    states.push({ patch, state })
    console.log(`\n[${patch.id}] ${patch.summary}`)
    console.log(`  patch file: ${patch.file}`)
    console.log(`  state:      ${STATE_LABEL[state]}`)
    if (state === 'unavailable') {
      console.log(`  note:       no supported build variant is applicable (fragility: ${patch.fragile});`)
      console.log('              this patch is skipped, not fatal — the other patches are unaffected')
    }
    for (const row of rows) {
      console.log(`    ${rowLabel(row)} ${row.path}`)
      console.log(`              ${row.role}, ${row.size} bytes`)
      if (row.build !== null) console.log(`              build: ${row.build}`)
      for (const reason of row.reasons) console.log(`              ! ${reason}`)
      if (row.variants.length > 1) {
        for (const variant of row.variants) {
          const stateLabel = !variant.present
            ? 'not present'
            : variant.patched
              ? 'patched'
              : variant.corrupted
                ? 'corrupted'
                : 'present, unpatched'
          console.log(`              known: ${stateLabel} — ${variant.build ?? variant.path}`)
        }
      }
    }
    if (patch.requires.length > 0) {
      const missing = patch.requires.filter((id) => {
        const other = PATCHES.find((candidate) => candidate.id === id)
        return other === undefined || patchState(archive, other).state !== 'patched'
      })
      if (missing.length > 0) {
        console.log(`  note:       pairs with ${missing.join(', ')}, which is not installed`)
        console.log('              (alone it publishes nothing, because there are no start lines to publish)')
      }
    }
  }
  const backup = newestBackup(asarFile)
  console.log(`\nbackup: ${backup ?? 'none'}`)
  const patched = states.filter((entry) => entry.state === 'patched').length
  const skipped = states.filter((entry) => entry.state === 'unavailable').length
  const partial = states.filter((entry) => entry.state === 'partial').length
  const verdict =
    partial > 0
      ? 'verdict: a patch is APPLIED INCOMPLETELY — reinstall it or revert'
      : patched === states.length
        ? 'verdict: every selected patch is installed — diff cards can show real file line numbers'
        : patched === 0
          ? 'verdict: nothing installed — diff cards number rows 1..n'
          : `verdict: ${patched}/${states.length} installed${skipped > 0 ? `, ${skipped} skipped (build mismatch)` : ''}`
  console.log(verdict)
  return states
}

function apply(asarFile, { dryRun, out, only, force }) {
  if (!existsSync(asarFile)) throw new Error(`archive not found: ${asarFile}`)
  // `--out` exists for dry runs. A real apply must stage NEXT TO the archive: replacing it is a
  // rename, and a cross-volume rename silently degrades into a copy that can leave a truncated
  // archive if it is interrupted.
  if (!dryRun && out !== undefined) {
    throw new Error('--out is only meaningful with --dry-run; a real apply stages next to the archive')
  }
  const archive = readArchive(asarFile)

  // Plan every selected patch BEFORE touching disk. A patch that is already installed is
  // skipped (idempotence); one whose anchors are gone is skipped too, UNLESS it was named
  // explicitly with --patch (then the user is asking for that one and deserves the loud error).
  // A half-patched archive is never auto-repaired: that state means someone else edited it.
  const planned = []
  for (const patch of selectPatches(only)) {
    const { state, rows } = patchState(archive, patch)
    if (state === 'patched') {
      console.log(`skip: ${patch.id} — already patched`)
      continue
    }
    if (state === 'partial') {
      const broken = rows
        .filter((row) => row.patched || row.corrupted)
        .map((row) => `${row.path}${row.corrupted ? ' (corrupted)' : ''}`)
      throw new Error(
        `${patch.id} is half-patched (${broken.join(', ')}).` +
          ' Revert to a backup before patching again.',
      )
    }
    if (state === 'unavailable') {
      const explicit = only.length > 0
      if (explicit || force) {
        // Rethrow the resolver/applyEdits message: it names the build and the text it expected.
        replacementsFor(archive, patch)
        throw new Error(`${patch.id}: anchors matched but the patch state is unexpected`)
      }
      console.log(`skip: ${patch.id} — no supported build variant applies (fragility: ${patch.fragile})`)
      for (const row of rows) for (const reason of row.reasons) console.log(`        ${row.path}: ${reason}`)
      continue
    }
    planned.push(patch)
  }
  if (planned.length === 0) {
    console.log('nothing to do — pass --patch <id> to force a specific patch')
    return 0
  }

  // Build every replacement first: if any anchor is missing, nothing on disk has been touched
  // yet and the failure message names the exact expected text.
  const replacements = new Map()
  for (const patch of planned) {
    for (const target of patch.targets) {
      const { chosen, error } = resolveTarget(archive, target)
      if (error !== undefined) throw new Error(`${target.role}: ${error}`)
      const original = extract(archive, chosen.variant.path)
      const patched = Buffer.from(applyEdits(original.toString('utf8'), chosen.variant), 'utf8')
      replacements.set(chosen.variant.path, patched)
      console.log(
        `edit: [${patch.id}] ${chosen.variant.path}` +
          ` (+${patched.length - original.length} bytes, ${chosen.variant.build ?? 'known variant'})`,
      )
    }
  }

  const rebuilt = repack(archive, replacements)
  // A dry run must not drop a sibling file into the installation directory either: default it
  // into the OS temp dir, so `--dry-run` really is read-only for the app folder.
  const target = out ?? (dryRun ? join(tmpdir(), `app.asar.dryrun-${Date.now()}`) : `${asarFile}.next`)
  writeFileSync(target, rebuilt)
  const verification = verifyArchive(target, replacements)
  console.log(`rebuilt archive: ${target} (${verification.bytes} bytes, ${verification.checked} members)`)
  if (verification.problems.length > 0) {
    for (const problem of verification.problems) console.log(`  FAIL ${problem}`)
    // A rejected rebuild must not linger next to the archive: the next run would overwrite it
    // anyway, but a stale `app.asar.next` invites someone to "finish" a failed apply by hand.
    if (!dryRun) rmSync(target, { force: true })
    throw new Error('repacked archive failed self-verification; nothing was installed')
  }
  console.log('verify: framing, offsets and every member sha256 match')

  if (dryRun) {
    console.log(`dry run: archive untouched${out === undefined ? `, scratch copy removed` : `, copy kept at ${target}`}`)
    if (out === undefined) rmSync(target, { force: true })
    return 0
  }

  // Backup before touching anything: the whole file, next to itself, timestamped.
  const backup = `${asarFile}.bak-${Date.now()}`
  try {
    copyFileSync(asarFile, backup)
  } catch (error) {
    // A running app holds the archive open on Windows; failing here is the last safe moment.
    rmSync(target, { force: true })
    throw new Error(
      `cannot write next to the archive (${error.code}); close DeepSeek Harness and retry —` +
        ' an open app also keeps serving the old archive, so a patch while it runs would do nothing',
    )
  }
  const originalSize = readFileSync(backup).length
  if (originalSize !== archive.buf.length) {
    throw new Error(`backup size ${originalSize} != archive size ${archive.buf.length}`)
  }
  console.log(`backup: ${backup}`)

  try {
    // Same directory, so this is one directory update rather than a cross-volume copy.
    renameSync(target, asarFile)
  } catch (error) {
    rmSync(target, { force: true })
    throw new Error(
      `cannot replace the archive (${error.code}); the original is untouched and the backup is` +
        ` ${backup} — close DeepSeek Harness and retry`,
    )
  }
  const after = readArchive(asarFile)
  const unfinished = planned.filter((patch) => patchState(after, patch).state !== 'patched')
  if (unfinished.length > 0) {
    throw new Error(`post-install check failed for: ${unfinished.map((p) => p.id).join(', ')}`)
  }
  console.log('installed: restart DeepSeek Harness so the new archive is loaded')
  return 0
}

function revert(asarFile, only) {
  if (!existsSync(asarFile)) throw new Error(`archive not found: ${asarFile}`)
  const backup = newestBackup(asarFile)
  if (backup === undefined) throw new Error(`no ${asarFile}.bak-<epochms> backup found`)
  // Revert is whole-archive, not per-patch: a backup is a snapshot of the file, not of one
  // patch, so "revert only the minified one" cannot be honoured without re-applying the rest.
  // Say so instead of silently also removing patches the caller wanted to keep.
  const willDrop = selectPatches(only).map((patch) => patch.id)
  console.log(`revert is whole-archive: this restores ${backup}`)
  console.log(`  it will drop every patch currently installed, including: ${willDrop.join(', ')}`)
  // Keep the current (possibly broken) state too: reverting should never be a one-way door.
  const aside = `${asarFile}.prerevert-${Date.now()}`
  copyFileSync(asarFile, aside)
  copyFileSync(backup, asarFile)
  console.log(`previous state kept at: ${aside}`)
  const archive = readArchive(asarFile)
  for (const patch of PATCHES) {
    const { state, rows } = patchState(archive, patch)
    console.log(`  [${patch.id}] ${STATE_LABEL[state]}`)
    for (const row of rows) console.log(`    ${rowLabel(row)} ${row.path}`)
  }
  return 0
}

function main(argv) {
  const options = parseArgs(argv)
  if (options.command === 'status') return status(options.asar, options.only)
  if (options.command === 'apply') return apply(options.asar, options)
  if (options.command === 'revert') return revert(options.asar, options.only)
  if (options.command === 'list') {
    for (const patch of PATCHES) {
      console.log(`${patch.id}  (fragility: ${patch.fragile})`)
      console.log(`  ${patch.summary}`)
      console.log(`  file: ${patch.file}`)
      for (const target of patch.targets) {
        console.log(`  target: ${target.id ?? target.role} — ${target.role}`)
        for (const variant of targetVariants(target)) {
          console.log(`    build: ${variant.build ?? 'unknown'}`)
          console.log(`    path:  ${variant.path}`)
        }
      }
      if (patch.requires.length > 0) console.log(`  pairs with: ${patch.requires.join(', ')}`)
    }
    return 0
  }
  throw new Error(
    'usage: patch-asar.mjs <status|apply|revert|list> [--patch <id>[,<id>]] [--asar <path>]' +
      ' [--dry-run] [--out <file>] [--force]',
  )
}

// Only run when executed directly: `.work/` scripts import the helpers to build and verify the
// reviewable patch without ever going near the CLI path.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`patch-asar: ${error.message}`)
    process.exitCode = 1
  }
}
