/**
 * The hover preview inside the turn-changes card: make it read like the theme's
 * own edit diff.
 *
 * WHY A SEPARATE BLOCK. Two diff renderers coexist. The theme owns the card for
 * `edit` / `write` (`diffview.js` → `[data-cds-diffcard]`), and the host's
 * deliverables package owns the file preview that opens when a row in the
 * "Edited N files" card is hovered (`ChangedFilePreview` → `[data-changes-hover-preview]`,
 * with a `FileDiff` body using `data-diff-*` hooks). The host's body is not ours
 * to re-render — it fetches its own comparison through `useChangesDiff` and
 * carries its own row model — so the two are aligned by STYLE here, never by
 * replacing nodes.
 *
 * WHAT CAN BE ALIGNED, and why each one matters:
 *
 *   - the frame: same hairline, 12px radius and code surface as
 *     `[data-cds-diffcard]`, so the preview looks like the same object as the
 *     card it previews;
 *   - the type: the same code family and 12px/1.6 as the edit card. The host
 *     body inherits `--dsw-font-markdown-code-block`, which is the UI's code
 *     size, not the diff card's;
 *   - the row rhythm: 22px rows in the host become the card's `1lh` rhythm, so
 *     a five-line hunk is the same height in both;
 *   - the gutter: the host paints the whole number cell with the add/del wash
 *     (`--diff-gutter-fill`) and a 3px inset marker. The theme's card keeps the
 *     numbers on the card surface and tints only the row, with the number in
 *     the state colour. Matching the theme means dropping the cell wash.
 *   - the header: the host's 38px header with a bottom hairline becomes the
 *     card's quieter band, so the path reads as a caption rather than a toolbar.
 *
 * WHAT CANNOT BE ALIGNED, and is left alone on purpose:
 *
 *   - TOKEN COLOUR. The host's rows are plain text; there is no token structure
 *     in its DOM, so there is nothing to paint with `--shiki-token-*`. Adding
 *     spans would mean re-implementing the host's diff, which this pass
 *     deliberately does not do. This is also why the panel declares no Shiki
 *     palette: `test/css.test.mjs` allows those variables on exactly two
 *     surfaces (the markdown block and the theme's own diff card), and a
 *     surface with no token spans is not a legitimate third one.
 *   - THE 16-LINE FOLD. `diffview.js` folds at `LINE_LIMIT`; the host decides
 *     its own truncation and reports it through `data-diff-truncated`. CSS
 *     cannot fold what it did not receive.
 *   - SPLIT VIEW. The preview is always unified (`split: false`).
 *
 * @module changes-preview-styles
 */

/**
 * The preview root: the host's own hook, scoped to the document.
 *
 * WHY NOT THE CONVERSATION CONTENT. This block used to start with
 * `[data-conversation-content]`, on the assumption that the panel renders where
 * the card that opened it lives. It does not: the shared `HoverCard` primitive
 * renders its content through `createPortal(..., document.body)`, and the
 * measured parent chain of the live panel is exactly
 *
 *     [data-changes-hover-preview]  ->  div._card_…_preview  ->  BODY
 *
 * so the scoped selector matched ZERO elements and every rule below was dead.
 * The measurement that settles it: `panel.matches('[data-conversation-content]
 * [data-changes-hover-preview]')` is false in the running app, while the same
 * call against this selector is true. `body` is kept so a preview cannot be
 * picked up in a detached fragment, and so the scope reads like the two sibling
 * hover modules (`workspace-preview-styles.js`, `session-preview-styles.js`)
 * which already anchor on `body` for the same reason.
 */
export const CHANGES_PREVIEW_ROOT = 'body [data-changes-hover-preview]'

/**
 * Rules that make the preview match the theme's edit diff.
 *
 * THE SWITCH HAS TO ACTUALLY REMOVE THE PANEL. Returning an empty string when
 * the switch is off looks like "off", but it only stops this sheet from styling
 * the panel — the panel itself is mounted by the host's own HoverCard portal, so
 * an empty sheet leaves it appearing exactly as before. Measured: with `''`
 * injected, a 500ms hover still opened the preview, while the setting's own copy
 * promises "off hides that hover panel". The off branch therefore emits ONE hide
 * rule and nothing else: no surface, no type, no wash, so turning the switch back
 * on is what restores the themed look.
 *
 * @param state - the theme state; `diffPreview: false` emits only the hide rule.
 * @returns the CSS text.
 */
export function changesPreviewRules(state) {
  // The switch turns the PREVIEW off, not the edit card: the card is where the
  // user reads what changed, while the preview is a hover convenience. Turning
  // the card off as well would hide the turn's result behind a setting named
  // after a preview.
  if (state !== undefined && state !== null && state.diffPreview === false) {
    return `
/* ---- turn-changes hover preview: off --------------------------------- */
${CHANGES_PREVIEW_ROOT} { display: none !important; }
`
  }
  const root = CHANGES_PREVIEW_ROOT
  return `
/* ---- turn-changes hover preview: the edit card's own frame and rhythm ---- */
${root} {
  box-sizing: border-box;
  border: 0.5px solid var(--dsw-alias-border-l2) !important;
  border-radius: var(--dsw-radius-lg) !important;
  /* THE SURFACE TOKEN HAS TO CARRY ITS OWN FALLBACK HERE. --cds-card-surface
     and the two git washes are declared on [data-conversation-content], and
     this panel is a child of body — measured: the variable reads back EMPTY
     inside the portal. The fallbacks are the host's own file-diff tokens, which
     is what the panel already paints with, so with refinement off nothing moves.
     --dsw-alias-bg-layer-1 is the same value the theme assigns
     --cds-card-surface (#ffffff light / #1a1a19 dark), so the two modes stay
     in step instead of pinning a light literal. */
  background: var(--cds-card-surface, var(--dsw-alias-bg-layer-1)) !important;
  color: var(--dsw-alias-label-primary) !important;
  /* THE SAME SHORTHAND THE EDIT CARD USES, not a hand-written 12px/1.6. The
     token resolves to 12px/17px (measured in the running app), i.e. the host's
     own code-block small size — 12 x 1.6 would be 19.2px and every row would sit
     2.2px taller than the card it is being compared against. The literal is the
     fallback for a host that does not publish the token.
     The shorthand resets the family, so the explicit family follows it, exactly
     as diffCardRules() writes those two lines. */
  font: var(--dsw-font-markdown-code-block-small, 12px/1.6 var(--ds-font-family-code)) !important;
  font-family: var(--ds-font-family-code) !important;
  /* REDECLARED ON THE CARD, the pattern diffCardRules() already uses. These
     two washes are declared on [data-conversation-content]; this panel is
     portaled to body, so it never inherits them and a bare var() is dropped.
     Measured before this: the add row still carried the HOST's 10% mix while the
     edit card's row carried the theme's 12%. Declaring them here is what makes
     the two rows the same colour instead of merely both-green. */
  --cds-bg-git-added: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);
  --cds-bg-git-removed: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
  overflow: hidden !important;
  max-height: 280px;
}
/* The path band: a caption on the code surface, not a toolbar over it. */
${root} > div:first-child {
  height: auto !important;
  min-height: 0 !important;
  padding: 6px 10px !important;
  gap: 6px !important;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1) !important;
  background: transparent !important;
}
${root} [data-changes-preview-path] {
  color: var(--dsw-alias-label-caption) !important;
  font-family: var(--ds-font-family-code) !important;
  font-size: 11px !important;
  line-height: 18px !important;
}
/* The scroll body: the card's own 8px block padding, no side padding, so a
   row's wash reaches the frame exactly as it does in the edit card. */
${root} > div:last-child,
${root} [class*="_body"] {
  padding: 8px 0 !important;
  font: inherit !important;
  overflow: auto !important;
}
${root} [class*="_line"],
${root} [class*="_sideLine"],
${root} [class*="_splitLine"] {
  min-height: 1lh !important;
  line-height: 1lh !important;
  font: inherit !important;
}
${root} [class*="_hunk"] { margin-bottom: 8px !important; }
${root} [class*="_hunkHeader"] {
  padding: 2px 10px !important;
  color: var(--dsw-alias-label-tertiary) !important;
  font: inherit !important;
}
/* The gutter: numbers on the card surface, in the state colour — the cell wash
   and the 3px inset marker are the host's own idiom and read as a second
   surface here. */
${root} [class*="_number"] {
  padding: 0 8px 0 2px !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--dsw-alias-label-caption) !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
}
${root} [class*="_add"] [class*="_number"] { color: var(--dsw-alias-state-success-primary) !important; }
${root} [class*="_del"] [class*="_number"] { color: var(--dsw-alias-state-error-primary) !important; }
/* The glyph column is punctuation, so it takes the muted caption ink — the edit
   card paints it from the shiki punctuation token, but this panel has no token
   spans to declare that palette for, and the guard forbids a third site. */
${root} [class*="_sign"] { color: var(--dsw-alias-label-caption) !important; }
/* The wash: the same 12% mix the edit card uses, on the row and not the cell.
   The fallbacks are load-bearing for the same reason as the surface above: the
   --cds-bg-git-* pair lives on [data-conversation-content], so inside this
   portal the bare var() resolved to nothing and the declaration was dropped —
   the measured add-row fill was still the HOST's own 10% mix, i.e. this rule
   was silently inert. Falling back to the host's file-diff tokens keeps the
   two surfaces identical when refinement is off, and lets the theme's 12% mix
   take over when it is on. */
${root} [class*="_add"] { background: var(--cds-bg-git-added, var(--dsw-alias-file-diff-added-bg)) !important; }
${root} [class*="_del"] { background: var(--cds-bg-git-removed, var(--dsw-alias-file-diff-deleted-bg)) !important; }
${root} [class*="_context"] [class*="_text"] { color: var(--dsw-alias-label-secondary) !important; }
${root} [class*="_text"] { padding-right: 10px !important; font: inherit !important; }
${root} [class*="_note"] {
  padding: 4px 10px 8px !important;
  color: var(--dsw-alias-label-tertiary) !important;
  font-family: var(--ds-font-family-code) !important;
  font-size: 11px !important;
  line-height: 18px !important;
}
`
}
