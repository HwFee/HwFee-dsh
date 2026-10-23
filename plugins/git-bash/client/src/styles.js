/**
 * The settings row's stylesheet.
 *
 * Mirrors the host's own general-settings rows: a two-column row with the label
 * block on the left and its control on the right, separated by a hairline.
 * Every value is a host token, so the row matches its neighbours in both themes.
 */

const STYLE_MARKER = 'data-dsh-git-bash-style'

const CSS = `
.dsh-git-bash-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  /* NO border of our own. cds-theme owns the rule that draws the hairline under
     every settings row (the slot-child selector), and its selector is more
     specific than a single class — so a border here LOSES and the row ends up
     with the theme's line anyway. Declaring it was worse than useless: it made
     this row's line look different from its neighbours whenever the specificity
     race went the other way. The theme draws it; the row leaves space for it. */
}

.dsh-git-bash-main {
  min-width: 0;
  flex: 1;
}

.dsh-git-bash-title {
  font-size: var(--dsh-content-font-size, 14px);
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}

.dsh-git-bash-hint {
  margin-top: 2px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-git-bash-status {
  margin-top: 6px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  /* A Windows path is long and has no spaces to break at, so wrap anywhere
     rather than let it push the menu off the row. */
  overflow-wrap: anywhere;
}

.dsh-git-bash-missing {
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-code-diff-deleted));
}

/* The trigger states the current mode, so the row is readable without opening
   the menu — the same shape the host's own multi-value rows use. */
.dsh-git-bash-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  align-self: flex-start;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  cursor: pointer;
}

.dsh-git-bash-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-git-bash-trigger:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.dsh-git-bash-select {
  flex: none;
  align-self: flex-start;
  height: 32px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
}

/* One row per mode inside the popup, with a check on the active one. */
.dsh-git-bash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 190px;
}

.dsh-git-bash-check {
  display: inline-flex;
  color: var(--dsw-alias-brand-primary);
}

/* ---- the run_shell tool card --------------------------------------
   The reference (Claude Code desktop) draws a shell call as one boxed
   command line and then the output as BARE flowing text. Colours are the
   reference's own Shiki palette; every surface/ink value is a host token so
   the card follows the app's light and dark themes. */
.dsh-gb-tool {
  --dsh-gb-command: #0073e6;
  --dsh-gb-argument: #1e9e3c;
  --dsh-gb-punctuation: #737373;
  --dsh-gb-ink: #1a1a1a;
}

body[data-ds-dark-theme] .dsh-gb-tool {
  --dsh-gb-command: #70b8ff;
  --dsh-gb-argument: #9be963;
  --dsh-gb-punctuation: #818898;
  --dsh-gb-ink: #eaecf0;
}

/* The header: description only, 24px seat, muted until hovered. No tool name
   and no icon — the reference's rows are a sentence and a chevron. */
.dsh-gb-tool-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 18px;
  transition: color 100ms cubic-bezier(0.16, 1, 0.3, 1);
}

.dsh-gb-tool-head.is-expandable {
  cursor: pointer;
}

.dsh-gb-tool-head.is-expandable:hover,
.dsh-gb-tool-head.is-expandable:focus-visible {
  color: var(--dsw-alias-label-secondary);
}

.dsh-gb-tool-head:focus-visible {
  outline: none;
}

.dsh-gb-tool[data-state="error"] .dsh-gb-tool-head {
  color: var(--dsw-alias-state-error-primary);
}

.dsh-gb-tool[data-state="stopped"] .dsh-gb-tool-head {
  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-label-tertiary));
}

.dsh-gb-tool-chevron {
  display: inline-flex;
  flex: none;
  transform: rotate(-90deg);
  transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.dsh-gb-tool[data-expanded="true"] .dsh-gb-tool-chevron {
  transform: none;
}

/* THE ROW ITSELF IS PROSE, NOT CODE, AND IT HAS AN EXPLICIT SIZE.
   Measured live: the card inherited 16px from the conversation, so the tool
   name rendered at 16px next to host rows that are 13px — the "enormous font"
   report. Host tool rows are 13/19 in this density, so this pins the same.
   24px keeps the row on the same rhythm as the host cells. */
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool {
  font-family: var(--dsw-font-family) !important;
  font-size: calc(13px + var(--dsh-content-font-delta, 0px));
  line-height: calc(19px + var(--dsh-content-font-delta, 0px));
  font-weight: 400;
  letter-spacing: normal;
}
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-head {
  min-height: 24px;
  align-items: center;
}
.dsh-gb-tool-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Body: the card is inset under the row (the reference reserves 10px on each
   side and 4px above). */
.dsh-gb-tool-body {
  display: flex;
  flex-direction: column;
  /* ZERO, NOT 10px. The flex gap stacked on top of the output card's own margin,
     so the visual distance was 12px where the margin said 2px. The output's
     margin is now the only thing controlling that gap. */
  gap: 0;
  margin: 4px 10px 8px 10px;
}

/* The request: a real code surface with the "$" prompt, wrapped by default
   (the theme has no wrap toggle — every block wraps).

   SURFACE. The card sits on the conversation canvas, and the command box must
   read as a distinct block rather than melting into it: the fill is the host's
   code-block token (a shade off the canvas in light mode, a lifted dark surface
   in dark mode) plus a hairline, which is exactly the reference's separation.

   TYPE. Both halves of this card (request and response below) read the SAME
   rung the theme publishes for tool-card payloads —
   --dsw-font-markdown-code-block-small — rather than a hard-coded 12px.
   The hard-coded pair used to disagree with the read/edit cards (now 13/20),
   which is why the command and its output looked like two different breeds of
   text in one card: same family, different size and leading, and a font:
   shorthand resets letter-spacing/kerning each time it is declared. */
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  /* NO CAP HERE EITHER. The 160px ceiling was copied from the reference's
     fixed-height panel; a command is as long as it is, and clipping it behind a
     scroller hides the thing the card exists to show. */
  max-height: none;
  /* 8px TOP/BOTTOM, 12px SIDES — the reverse-engineered fence inset
     (docs/tool-cards-bash-terminal.md; same numbers in the reference's own
     card). It replaces the old 5px-plus-a-rail pair: that 1ch term was a second
     guess at the same inset, so the real value drifted with the code font's
     digit width — measured 17.2px at 13px mono, i.e. 5px wider than the 12px the
     table says, and it changed whenever the user moved the code-size setting.
     A literal 12px is the only way the fence stays put. */
  padding: 8px 12px;
  overflow: visible;
  /* NO FILL, ONE OUTLINE. The reference's input card carries no background
     class at all: its "card" is a 1px inset outline
     (.epitaxy-card-outline-overlay { outline: 1px solid var(--cds-border);
     outline-offset: -1px }), which is why it needs no per-theme colour and
     never fights the surface behind it. */
  /* !important: measured live, a plain transparent lost to a higher-
     specificity surface rule and the box kept painting the theme's card tint.
     The reference has NO fill here at all, so this must win. */
  background: var(--cds-card-surface, #ffffff) !important;
  border: 0;
  border-radius: 8px;
  /* THE HAIRLINE IS A DOUBLE RING, not an outline. Two inset shadows: the
     first paints the border colour, the second paints the CARD COLOUR over it,
     so only the outer half of the first ring survives and the line reads
     thinner than 1px. This is how the reference engraves its fence without
     sub-pixel support. */
  position: relative;
  /* ONE STEP OFF THE CODE SURFACE, same 96/4 ink mix the theme's tool cards\n     use: identical to the code block makes the box vanish into the card,\n     identical to the card makes the block vanish into the box. */\n  background: color-mix(in srgb, var(--dsw-alias-markdown-code-block, #ffffff) 96%, var(--dsw-alias-label-primary, #1f1f1f));
  color: var(--dsh-gb-ink);
  font: var(--dsw-font-markdown-code-block-small, 12px/1.6 var(--ds-font-family-code));
  /* !important: the theme pins the TEXT family on every non-code descendant of\n     the conversation with !important, and a card div is not code/pre — a\n     plain declaration here would lose and the command would render in Sans. */
  font-family: var(--ds-font-family-code) !important;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 1px var(--dsw-alias-border-l1),
    inset 0 0 0 1px var(--cds-card-surface, #ffffff);
}

/* Room for the copy control in the top-right corner of the box. */
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-command {
  min-width: 0;
  padding-right: 22px;
  font: inherit;
  white-space: inherit;
}

/* And room for BOTH corner controls when the trajectory entrance is present.
   The copy glyph spans 8-26px from the right; the entrance spans 30-48px, so
   without this the tail of a wrapping command runs under it — visible only
   while hovered, which is exactly when the reader is looking at the end of a
   long command. The row puts our own marker on the box when it renders an
   entrance, so a card without one keeps the old 22px and its old wrapping.
   The reserve is STATIC (it does not appear on hover), so revealing the pair
   never reflows the command.

   52px clears both 18px controls and their shared 8px gap. The theme and this
   plugin use the same right 34px seat, so theme changes preserve the spacing. */
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request[data-inspect] .dsh-gb-tool-command {
  padding-right: 52px;
}

/* The copy control: inside the command box, its own corner, quiet until the
   row is hovered — the same reveal the reference uses for its code rail. */
.dsh-gb-copy {
  position: absolute;
  /* Tucked into the box's top-right corner, on its first line. top: 4px
     aligns it with the command text's cap height rather than the box's border
     (a single-line command left it looking high). */
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* THE SHARED COPY CONTROL. The theme publishes --cds-copy-* on the
     conversation content so the tool-row rail, the markdown banner and this
     command box render one control instead of three drifting ones; the
     fallbacks keep the card correct without the theme installed. */
  width: var(--cds-copy-size, 18px);
  height: var(--cds-copy-size, 18px);
  padding: 0;
  border: 0;
  border-radius: var(--cds-copy-radius, var(--dsw-radius-xs, 4px));
  /* TRANSPARENT, not filled. A solid plate inside an already-tinted box read as
     a second surface; the reference's rail is bare and lets the code show
     through. */
  background: transparent;
  color: var(--cds-copy-ink, var(--dsw-alias-label-tertiary));
  font: inherit;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  /* Invisible AND unclickable until revealed. Without this the control still
     answered the pointer while it had no paint, so a click on blank-looking
     space silently copied the command. */
  pointer-events: none;
  transition: opacity var(--cds-copy-reveal, 100ms) cubic-bezier(0.16, 1, 0.3, 1),
    color var(--cds-copy-reveal, 100ms) cubic-bezier(0.16, 1, 0.3, 1);
}

/* HOVER-ONLY, exactly like the read and write cards: the rail is invisible
   until the pointer is on the tool row. Retained focus must not reveal it. */
.dsh-gb-tool:hover .dsh-gb-copy {
  opacity: 1;
  pointer-events: auto;
}

.dsh-gb-copy:hover {
  color: var(--cds-copy-ink-hover, var(--dsw-alias-label-primary));
}

.dsh-gb-copy[data-copied="true"] {
  color: var(--dsw-alias-state-success-primary);
}

.dsh-gb-copy-check {
  font-size: 12px;
  line-height: 1;
}

@media (prefers-reduced-motion: reduce) {
  .dsh-gb-copy {
    transition: none;
  }
}

/* THE TRAJECTORY ENTRANCE: the same floating glyph as the copy control,
   one seat to its left.

   WHY IT IS ABSOLUTE AND NOT A ROW. Every tool card in the transcript carries
   an "open this call in the trajectory" action, and the host's own cards draw
   it as a labelled button UNDER the payload — its own line, always taking
   height, for something a reader wants occasionally rather than every time.
   This card already has the settled answer to that shape: the copy control is
   a corner glyph revealed on hover. So the entrance is its sibling at 34px (the
   copy's 8px plus its 18px width plus an 8px gap), and the box reserves NOTHING
   for it — no padding change, no layout shift on reveal.

   INDEPENDENT OF THE THEME. cds-theme also paints any element carrying the
   tool-inspect attribute through its shared tool chrome, but that only exists
   while the theme is on and its refine switch is enabled. These rules are the
   whole story without it: same 18px box, same icon size, same 100ms curve as
   the copy control beside it, so the two read as one pair either way. */
.dsh-gb-inspect {
  position: absolute;
  top: 8px;
  right: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: var(--dsw-radius-xs, 4px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  /* Invisible AND unclickable until revealed — the copy control's rule, for the
     same reason: a painted-out button still answers the pointer on blank space. */
  pointer-events: none;
  transition: opacity 100ms cubic-bezier(0.16, 1, 0.3, 1),
    color 100ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* HOVER THE COMMAND BOX, NOT THE WHOLE CARD. The card's header is clickable
   (it toggles the body), so a card-wide reveal would flash this control while
   the pointer is anywhere on the row — including on the chevron's way past it. */
.dsh-gb-tool-request:hover .dsh-gb-inspect {
  opacity: 1;
  pointer-events: auto;
}

.dsh-gb-inspect:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.dsh-gb-inspect:hover {
  color: var(--dsw-alias-label-primary);
}

@media (prefers-reduced-motion: reduce) {
  .dsh-gb-inspect {
    transition: none;
  }
}

.dsh-gb-tool-prompt {
  flex: none;
  color: var(--dsh-gb-punctuation);
  user-select: none;
}



.dsh-gb-tool-command [data-token="command"],
.dsh-gb-tool-command [data-token="flag"] {
  color: var(--dsh-gb-command);
}

.dsh-gb-tool-command [data-token="arg"] {
  color: var(--dsh-gb-argument);
}

.dsh-gb-tool-command [data-token="operator"] {
  color: var(--dsh-gb-punctuation);
}

/* The response: no label, no frame — the same flowing text the thinking rows
   use. It caps its own height instead of pushing the conversation.

   Same rung as the request above, deliberately: the mock's output read as a
   different typeface from its command because one was 12/1.6 and the other
   12/1.65 in a family that falls back per-glyph (Anthropic Mono has no CJK, so
   a Chinese character in the output lands on a different face than the ASCII
   beside it). Sharing one token keeps size, leading and the shorthand's
   letter-spacing reset identical. */
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond {
  /* NO CAP, NO SCROLLER. The reference clips the output at 160px because its
     card is a fixed-height panel; this one is inline in a transcript, so a long
     output should simply be long. */
  max-height: none;
  overflow: visible;
  /* 5px ABOVE, NOT 8px. The gap between the command fence and its output is its
     own number in the table (docs/tool-cards-bash-terminal.md), separate from
     the 8px top inset inside the fence — the two were being read as one value,
     which left the output sitting 3px too far from the command it belongs to.
     The flex gap on .dsh-gb-tool-body is 0, so this margin is the only thing
     contributing to that distance. Kept as margin (not row-gap) so the output
     alone moves: a gap would also push a card that has no command above it. */
  margin: 5px 0 0;
  /* 5px / 8px INSET. The output is bare text on the card surface, so without
     its own padding its first glyph starts at the card's left edge while the
     command above it starts 12px in — the two blocks read as different widths
     of the same column. The smaller inset than the fence is deliberate: the
     output is unboxed, so it lines up optically with the fence's TEXT, not with
     the fence's border. */
  padding: 5px 8px;
  background: transparent;
  border: 0;
  outline: 0;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-markdown-code-block-small, 12px/1.6 var(--ds-font-family-code));
  /* !important: the theme pins the TEXT family on every non-code descendant of\n     the conversation with !important, and a card div is not code/pre — a\n     plain declaration here would lose and the command would render in Sans. */
  font-family: var(--ds-font-family-code) !important;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
/* ---- typography measured from the reference's terminal view ----------
   .epitaxy-terminal-view is the only place in that app where the leading is
   hard-coded instead of tokenised:
     font-size: var(--cds-font-size-code, .75rem);   /* 13px */
     line-height: 1.55;                              /* = 20.15px, NOT the 19px
                                                        --cds-leading-code token */
   Everything in the view is weight 400 except the tool name, which is the only
   ont-weight declaration in the whole terminal stylesheet:
     .terminal-tool-name { font-weight: 600 }
   Letter-spacing is 0 everywhere (0 occurrences in the CSS; xterm default), and
   the view deliberately does NOT use 	abular-nums. */

[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-title {
  font-weight: 600;
}

/* EVERY DESCENDANT TOO (superseded below, kept for the record). The theme pins the prose family with a rule that
   MATCHES the token spans inside the command (conversation content, minus
   code/pre/kbd/samp). Inheritance loses to any matching rule, so the box was
   mono while its characters were sans — the "still sans" report. */
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request span,
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond span,
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request code,
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request,
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond {
  /* 13px PLUS THE USER'S DELTA. A literal 13px here ignored the code-size
     setting entirely: the code block beside it grew to 14px while the command
     card stayed 13px. --dsh-code-font-delta is what the system-fonts plugin
     drives, and 1.55 keeps the measured ratio as the size changes. */
  /* FIXED. Only inline code follows the code-size setting; a command block is
     pinned so its leading stays tuned to the card. */
  font-size: 12px;
  line-height: 17px;
  font-weight: 400;
  letter-spacing: 0;
}
/* THE OUTPUT CARD IS ONE PIXEL TIGHTER: 12/16, matching the reference's
   text-code row, while the command and diff surfaces stay at 12/17.
   NO BACKTICKS IN THIS COMMENT: the whole sheet is a template literal, so a
   stray backtick ends the string and the words after it become CODE — that is
   exactly how the text-code row name here shipped a bundle that threw
   "code is not defined" and failed the entire web boot. */
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond {
  line-height: 16px;
}
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request span,
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond span,
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request code {
  font-family: var(--ds-font-family-code) !important;
  font-size: inherit;
}
/* CODE IS MONO, THE ROW TITLE IS NOT. This used to be scoped to the whole
   card with a universal child selector, which also caught .dsh-gb-tool-title
   and turned the tool name into monospace. Only the command box and the output
   box are code.
   NO BACKTICKS IN THIS COMMENT. Writing that selector name here in a code span
   ended the enclosing template literal: the sheet evaluated to a string times a
   string, i.e. NaN, installCss threw on CSS.trim, and apply() died BEFORE the
   tool.call.toolview registrations below it — the shell card silently fell back
   to the host's generic card with no error anywhere. This is the third variant
   of the same mistake in this file. */
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request,
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request *,
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond,
[data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond *:not(svg) {
  font-family: var(--ds-font-family-code) !important;
}
`

/**
 * Install the stylesheet, returning its disposer.
 *
 * Idempotent: a tag left by an HMR reload is removed first, so the DOM never
 * carries two copies and a later dispose cannot remove the wrong one.
 *
 * @param {Document | undefined} doc the document to mount into
 * @returns {() => void} disposer
 */
export function installCss(doc) {
  if (doc === undefined || doc === null || typeof doc.createElement !== 'function') {
    return function disposeWithoutDocument() {}
  }
  // NEVER REPLACE A GOOD SHEET WITH AN EMPTY ONE. During an HMR reload this
  // module can be evaluated before the stylesheet text is ready; the old tag
  // was removed first, leaving an empty style element — and the card rendered
  // unstyled at the inherited 16px, which reads as "the font got enormous".
  // Keeping the previous tag when the new sheet is empty makes the reload
  // harmless.
  if (CSS.trim() === "") return function disposeWithoutCss() {}
  const previous = doc.querySelector(`style[${STYLE_MARKER}]`)
  if (previous !== null) previous.remove()

  const tag = doc.createElement('style')
  tag.setAttribute(STYLE_MARKER, '')
  tag.textContent = CSS
  doc.head.append(tag)

  return function dispose() { tag.remove() }
}

/** The stylesheet text, for tests. */
export const ROW_CSS = CSS
