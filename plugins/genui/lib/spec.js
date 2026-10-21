/**
 * The `render_ui` wire contract: one validator, shared by both halves.
 *
 * WHY THIS MODULE IS SEPARATE. The Host half has to validate before it commits
 * a result (a rejected snippet must reach the model as a tool error, not as a
 * blank card), and the client half has to validate again on replay (an old
 * session's args must not be trusted just because they were once accepted).
 * Two copies of the rules would drift, so both import this file.
 *
 * The rules are deliberately thin. They reject what makes a card IMPOSSIBLE to
 * draw — empty code, code that is obviously not a function body, a snippet over
 * the size ceiling — and nothing else. Style, structure and taste are the
 * model's; the client's error boundary catches a genuinely broken card.
 *
 * @module @hwfee/dsh-genui/spec
 */

/** Wire tool name. The client registers its card under exactly this key. */
export const TOOL_NAME = 'render_ui'

/**
 * Hard ceiling on the snippet, in bytes of UTF-8.
 *
 * This is not a taste limit; it is a rendering limit. The snippet is
 * re-evaluated on every mount (a scroll that recycles the row, a theme switch,
 * a fork), and a 200 KB card would make that visible. 48 KB is roughly 1,200
 * lines of dense JSX-free React — far past any card that belongs in a chat.
 */
export const MAX_CODE_BYTES = 48 * 1024

/**
 * Validate and normalize one `render_ui` call.
 *
 * Throws with a message written FOR THE MODEL, because the throw becomes the
 * tool result text on the failure path. "code must not be empty" tells the
 * model what to do next; "invalid input" does not.
 *
 * @param {unknown} args raw model-supplied arguments
 * @returns {{ title: string, code: string, bytes: number }} the normalized spec
 */
export function buildUiSpec(args) {
  const input = args !== null && typeof args === 'object' ? args : {}

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (title === '') {
    throw new Error('render_ui needs a non-empty `title`: one short line naming what the card shows')
  }
  if (title.length > 120) {
    throw new Error('render_ui `title` must be 120 characters or fewer; put the detail inside the card')
  }

  const code = typeof input.code === 'string' ? input.code : ''
  const trimmed = code.trim()
  if (trimmed === '') {
    throw new Error('render_ui needs `code`: the body of a function that returns React elements')
  }

  // Count bytes, not UTF-16 code units: a CJK-heavy card costs three bytes per
  // glyph and would sneak past a `.length` check at 3× its real wire size.
  const bytes = utf8Length(code)
  if (bytes > MAX_CODE_BYTES) {
    throw new Error(
      `render_ui \`code\` is ${bytes} bytes, over the ${MAX_CODE_BYTES} byte limit. `
      + 'Render a compact card and leave the detail in your reply.',
    )
  }

  return { title, code, bytes }
}

/**
 * Byte length of a string in UTF-8, without allocating a Buffer.
 *
 * The Host half runs in Node where `Buffer.byteLength` would do, but this module
 * is also imported by the browser bundle, where `Buffer` does not exist. A
 * hand-rolled counter works in both and keeps the two halves on one code path.
 *
 * Surrogate pairs are counted once (a lone surrogate counts as one replacement
 * character, which is what UTF-8 encoding would produce).
 *
 * @param {string} text input string
 * @returns {number} UTF-8 byte length
 */
export function utf8Length(text) {
  let bytes = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: consume the low half when it is really there, so a
      // four-byte character counts as four and not as two three-byte ones.
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }
  }
  return bytes
}

/**
 * Recover the validated spec from a tool-call block on replay.
 *
 * The client receives the committed call as `argsRaw` (a JSON string) in the
 * `result` phase and has no structured access to it. Parsing happens here so a
 * malformed historical call yields `null` — the card then renders its "this
 * card could not be read" state — instead of throwing inside render.
 *
 * @param {string | null | undefined} argsRaw committed JSON arguments
 * @returns {{ title: string, code: string, bytes: number } | null} the spec, or
 *          null when the payload is missing or fails validation
 */
export function readUiSpec(argsRaw) {
  if (typeof argsRaw !== 'string' || argsRaw === '') return null
  let parsed
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    return null
  }
  try {
    return buildUiSpec(parsed)
  } catch {
    return null
  }
}
