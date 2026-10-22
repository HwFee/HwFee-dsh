/**
 * Markdown scope: lists and task lists, emphasis, links — the assistant's own
 * prose only.
 *
 * SCOPE, EXACTLY. Every selector is rooted at the HOST'S OWN ROW TYPE:
 *
 *   [data-chat-flow] [data-chat-flow-kind="assistant-step"]
 *
 * Both halves are published on purpose (`docs/host-hooks.md` §4.2: the flow
 * column carries `data-chat-flow`, every row carries `data-chat-flow-kind` with
 * one of fifteen documented values). Nothing here keys on a CSS-Modules class or
 * on a `[class*="markdown"]` substring: an earlier draft rooted the rules at the
 * salted markdown root, which is one more hash-shaped hook than this feature
 * needs. Element type under a stable row type is enough, and it keeps working
 * when the host re-salts its modules.
 *
 * WHAT THAT MEANS IN PRACTICE: the rules paint the ELEMENTS the assistant's row
 * renders — `ul`, `ol`, `li`, `strong`, `em`, `del`, `s`, `a[href]` — and
 * nothing else. A user bubble, the composer, a settings page and a diff card are
 * not inside an assistant-step row, so they are unreachable by construction.
 *
 * THE THREE EXCLUSIONS ARE PART OF THE SCOPE, not an afterthought:
 *
 *   - `pre`, `pre *`, `code`, `code *` — a code block and an inline-code chip
 *     keep the treatment the host and `codeRules()` already give them. No
 *     geometry below may reach inside them.
 *   - `[data-slot="tool.call.toolview"]` and everything under it — a tool card
 *     renders its own markdown-ish payload (an output body can contain prose
 *     lists), and that is a payload, not the reply.
 *   - `.dsh-genui-card` and everything under it — a generated UI card is a
 *     sandboxed document of its own; its headings, lists and links are the card
 *     author's design, not this theme's prose.
 *
 * They are written as `:not(:where(…))` on the SUBJECT of each rule, so the
 * exclusion follows the element that would be painted rather than only its
 * ancestors — a `li` inside a tool card inside the same assistant step is
 * excluded. `:where()` keeps the exclusion at zero specificity, so these rules
 * still lose to any host rule that targets the same element more precisely.
 *
 * NO INK ON CONTAINERS. An earlier draft coloured `strong`/`em`/`del`, which
 * leaks into an inline `code` chip nested inside them: ink on a parent is
 * inherited by everything it wraps, and `:not(code)` cannot exclude a
 * DESCENDANT. So emphasis writes only what is its own — weight, style,
 * line-through — and leaves every ink where the host put it. Links are the one
 * place ink is the point, and a link still carries no rule for the chip inside
 * it: the earlier `a[href] code { color: … !important }` repainted the chip's
 * own palette values and was REMOVED, because "leave code alone" has to include
 * the code you find inside a link.
 *
 * LINE HEIGHT IS INHERITED, NOT PINNED. An earlier draft wrote
 * `line-height: 20px` on `li`, which ignored the host's markdown leading and the
 * user's font size: at a raised body size the list lines collided, at a lowered
 * one they drifted apart. The lists now inherit the row's leading (the host's
 * `font: var(--dsw-font-markdown-base)` on the markdown root) and only move
 * margins and markers.
 *
 * TASK LISTS. The host emits the literal classes `contains-task-list` /
 * `task-list-item` beside its salted name, and draws the box as a real
 * `<input type="checkbox" disabled>`. `accent-color` paints that native box —
 * including the tick — and the host's own `disabled` keeps it read-only, so a
 * checked task records what the agent said instead of becoming a control. This
 * block therefore never writes `appearance`, `pointer-events`, `opacity` or
 * `checked`: the box, its tick and its disabled state stay the host's.
 */

/**
 * The assistant prose scope: the flow column and the assistant row inside it.
 * Both attributes are published by the host (`docs/host-hooks.md` §4.2).
 */
export const MARKDOWN_ROOT = '[data-chat-flow] [data-chat-flow-kind="assistant-step"]'

/** A code block or an inline chip, and anything inside them. */
const CODE_PARTS = ['pre', 'pre *', 'code', 'code *']
/** A tool card's own payload and a generated UI card, root and everything in. */
const SURFACE_PARTS = [
  '[data-slot="tool.call.toolview"]', '[data-slot="tool.call.toolview"] *',
  '.dsh-genui-card', '.dsh-genui-card *',
]

/**
 * The exclusion appended to a rule's SUBJECT. Zero specificity via `:where`, so
 * the host keeps the last word wherever it has an opinion.
 */
export const EXCLUDE = ':not(:where(' + CODE_PARTS.concat(SURFACE_PARTS).join(', ') + '))'

const HEAD = '/* ---- markdown scope: lists, tasks, emphasis, links --------------- */'

/**
 * A descendant of the scope root that is allowed to be painted.
 *
 * @param selector the subject selector inside the root
 */
function s(selector) {
  return MARKDOWN_ROOT + ' ' + selector + EXCLUDE
}

/**
 * The markdown-scope block.
 *
 * WHERE THE NUMBERS COME FROM — and where they do not. This block has no
 * reference to copy: neither `dsh-claude-style` nor `open-claude-ui` contains a
 * markdown list, task-list, emphasis or link rule (grep them for
 * `ul|ol|li|::marker|list-style|strong|em|del` and the only hits are sidebar
 * padding). An earlier revision of this comment claimed the values "follow the
 * reference", which was false and invited a reviewer to go looking for a source
 * that does not exist.
 *
 * What the block actually does is restore what a Markdown renderer normally
 * provides and the host's sheet leaves to the browser default: a 20px list
 * gutter, 4px between items, markers one ink tier down, and a 1px link rule
 * with 2px of air in the accent. Those are typographic judgements at the
 * current body size (14/20), not measurements of anything. Leading is the
 * row's own. If a value here ever needs to match a source, cite the source.
 *
 * @returns the rule text, `\n`-joined, ending with a blank line
 */
export function markdownScopeRules() {
  return [
    HEAD,
    // ---- lists ---------------------------------------------------------
    s('ul') + ',',
    s('ol') + ' {',
    '  padding-inline-start: 20px;',
    '}',
    // NO line-height here: the item inherits the row's leading, which the host
    // derives from the user's font size. Pinning 20px (an earlier draft)
    // overrode that.
    s('li') + ' {',
    '  margin: 0 0 4px;',
    '}',
    s('li:last-child') + ' {',
    '  margin-bottom: 0;',
    '}',
    s('li') + '::marker {',
    '  color: var(--dsw-alias-label-secondary);',
    '}',
    s('ul > li') + '::marker {',
    '  color: var(--dsw-alias-label-tertiary);',
    '}',
    s('li > ul') + ',',
    s('li > ol') + ' {',
    '  margin: 4px 0 0;',
    '}',
    // ---- task lists ----------------------------------------------------
    s('li.task-list-item') + ' {',
    '  list-style: none;',
    '}',
    s('ul.contains-task-list') + ' {',
    '  padding-inline-start: 4px;',
    '}',
    // The native box, recoloured. `accent-color` is what draws the tick, so the
    // checked state reads the way the reference does; `appearance`, the checked
    // state and the host's `disabled` are all untouched.
    s('li.task-list-item > input[type="checkbox"]') + ' {',
    '  accent-color: var(--dsw-alias-label-secondary);',
    '  width: 13px;',
    '  height: 13px;',
    '  margin: 0 6px 0 0;',
    '  vertical-align: -2px;',
    '}',
    // ---- emphasis: geometry only, never ink ----------------------------
    s('strong') + ' {',
    '  font-weight: 600;',
    '}',
    s('em') + ' {',
    '  font-style: italic;',
    '}',
    s('del') + ',',
    s('s') + ' {',
    '  text-decoration-line: line-through;',
    '  text-decoration-thickness: 1px;',
    '}',
    // ---- links ---------------------------------------------------------
    // The underline is the whole treatment; a chip inside the link keeps the
    // chip's own ink and fill from `codeRules()` (there is deliberately NO
    // `a[href] code` rule here — see the module comment).
    s('a[href]') + ' {',
    '  color: var(--dsw-alias-state-business-primary);',
    '  text-decoration-line: underline;',
    '  text-decoration-thickness: 1px;',
    '  text-decoration-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, transparent);',
    '  text-underline-offset: 2px;',
    '}',
    s('a[href]:hover') + ' {',
    '  text-decoration-color: var(--dsw-alias-state-business-primary);',
    '}',
    '',
  ].join('\n')
}
