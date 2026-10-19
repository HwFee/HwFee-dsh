/**
 * Long-paste scratch store: the file half of "a long paste becomes an `@path`".
 *
 * WHY A FILE ON DISK. A pasted FILE is the only thing the composer renders as
 * a compact chip: the host's paste/drop intake (verified in the installed
 * `@deepseek-ai/dsh-client-ui-conversation` bundle, the `PASTE_COMMAND` handler
 * around `registerComposerKeymap`) asks the desktop bridge for the real path of
 * every pasted `File`:
 *
 *   const path = bridge?.pathFor(file) ?? ''
 *   if (path === '' || (!directory && isImageMediaType(file.type))) {
 *     uploads.push(file)            // → 240×64 upload card
 *     continue
 *   }
 *   const mention = formatFileMention({ path: relativizeToCwd(path, cwd), kind: 'file' }, false)
 *   references.push({ source: 'reference', ref: mention, … })   // → @-reference chip
 *   …
 *   shell.addFiles(references, [])  // → insertFileReferences → chip node
 *
 * `bridge.pathFor` is `electron.webUtils.getPathForFile`, which only answers for
 * files the OS handed to the renderer; a `File` built in JavaScript always gets
 * `''`. So a plugin cannot synthesize the bridge answer — it must make the path
 * REAL: write the text to disk here, and let the Client insert the `@relative`
 * reference itself (see `client/src/paste.js`).
 *
 * WHERE. `<session workspace>/.dsh-paste/`, one file per paste, named by the
 * Client (timestamped, locale-shaped) and never overwritten: the open uses
 * `wx` and a numbered suffix retries a name collision. The directory is a
 * visible dot-directory so the user can find and delete these files, and so
 * `@.dsh-paste/…` resolves like any other workspace-relative mention.
 *
 * WHAT IS RETURNED. Only the workspace-relative path (`/` separators) and the
 * file name. The absolute path never leaves the Host: it is a filesystem-layout
 * disclosure the browser has no use for.
 */

import { mkdir, open, unlink } from 'node:fs/promises'
import path from 'node:path'

/** Directory (relative to the session workspace) holding converted pastes. */
export const PASTE_DIR = '.dsh-paste'

/** Refuse a paste whose UTF-8 body exceeds this. */
export const MAX_PASTE_BYTES = 4 * 1024 * 1024

/** Longest file name accepted from the Client, in characters. */
export const MAX_PASTE_NAME = 180

/** Same reserved-device rule the Client applies (Windows `CON.txt` …). */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

/**
 * Make a client-supplied name safe as one path component.
 *
 * The Client already sanitizes (`client/src/paste.js`), but the Host must not
 * trust a browser string that becomes a file name: this strips separators,
 * Windows-rejected characters, control characters, leading/trailing dots and
 * spaces, reserved device names, and caps the length. An unusable name becomes
 * `pasted-text.txt`.
 */
export function sanitizePasteName(name) {
  let value = String(name === null || name === undefined ? '' : name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  if (value === '') value = 'pasted-text.txt'
  if (RESERVED_NAME.test(value)) value = '_' + value
  if (value.length > MAX_PASTE_NAME) value = value.slice(0, MAX_PASTE_NAME)
  return value
}

/**
 * The composer's mention spelling for a workspace-relative path, in the host's
 * own grammar (`formatFileMention` in ui-conversation): a path with whitespace
 * is quoted, a quote/control character makes the token unrepresentable.
 *
 * @returns the `@path` / `@"path"` token, or null when the grammar cannot carry it.
 */
export function formatPasteMention(relativePath) {
  const normalized = String(relativePath === null || relativePath === undefined ? '' : relativePath)
    .replace(/\\/g, '/')
  if (normalized === '') return null
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(normalized)) return null
  return /\s/u.test(normalized) ? '@"' + normalized + '"' : '@' + normalized
}

/**
 * Write one paste under `<cwd>/.dsh-paste/`, never overwriting an existing file.
 *
 * @param cwd - absolute session workspace root.
 * @param name - requested file name (sanitized here).
 * @param text - the pasted plain text, written as UTF-8.
 * @returns `{ fileName, relativePath }` with `/` separators.
 * @throws when the directory cannot be created or every candidate name exists.
 */
export async function writePasteFile({ cwd, name, text }) {
  if (typeof cwd !== 'string' || cwd === '' || !path.isAbsolute(cwd)) {
    throw new Error('paste: the session workspace is not an absolute path')
  }
  const directory = path.join(cwd, PASTE_DIR)
  await mkdir(directory, { recursive: true })

  const safe = sanitizePasteName(name)
  const extension = path.extname(safe)
  const stem = extension === '' ? safe : safe.slice(0, safe.length - extension.length)

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const fileName = attempt === 1 ? safe : stem + '-' + attempt + extension
    const target = path.join(directory, fileName)
    let handle
    try {
      handle = await open(target, 'wx')
    } catch (error) {
      if (error && error.code === 'EEXIST') continue
      throw error
    }
    try {
      await handle.writeFile(text, 'utf8')
    } catch (error) {
      // A half-written file is worse than no file: the name would be taken by
      // an empty scratch the user cannot distinguish from a real paste.
      await handle.close().catch(() => {})
      await unlink(target).catch(() => {})
      throw error
    }
    await handle.close()
    return { fileName, relativePath: PASTE_DIR + '/' + fileName }
  }
  throw new Error('paste: every candidate file name is taken')
}
