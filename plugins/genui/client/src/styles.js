/**
 * The card's stylesheet, installed once and removed on disable.
 *
 * WHY A STYLESHEET AND NOT INLINE STYLES. The model's snippet is styled inline
 * with theme tokens — that is its own business. The FRAME around it (header,
 * source view, failure state) is the plugin's UI, and it must match the host's
 * own cards. Inline styles cannot express `:hover`, `:focus-visible` or
 * `prefers-reduced-motion`, all three of which this frame needs.
 *
 * WHY IT IS A SINGLE TAG. One `<style>` element per plugin, installed inside
 * `ctx.effect` and removed by its disposer. Every card then shares it, so
 * scrolling a long conversation does not accumulate stylesheets — the failure
 * mode a per-component `<style>` would have.
 *
 * WHY ONLY TOKENS. Every colour, radius and font size below resolves through a
 * host token, so the card follows light/dark mode, the CDS theme, and any
 * future theme the user installs without this plugin knowing about them. The
 * one literal dimension is the max height, explained at its rule.
 *
 * Selectors are this plugin's own `dsh-genui-*` names. The host's CSS-Modules
 * classes are salted per build and are never targeted.
 */

import { VENDOR_CSS } from './vendor/visualize.css.js'

/** Marks the injected tag so a teardown can find it even after an HMR reload. */
const STYLE_MARKER = 'data-dsh-genui-style'

const CSS = `
/* NO FRAME. A generated UI is the ANSWER, not a window that contains it.
   The first version drew a card — border, radius, header bar, a "view source"
   button, a "why a card" footer — and that framing was wrong on every count:
   it made the answer look like an embedded widget, it added chrome the user has
   to read past, and it competed visually with the reply text around it.

   ZCode's Gen UI (and every other shipped implementation) renders the page
   inline in the message flow, full width, with no container. So does this one
   now: the root is a plain block that inherits the transcript's own typography
   and colours. The only structure left is spacing. */
/* A COLUMN FLEX CONTAINER, not a block.
   The heading rows centre themselves with justify-content: center, and that
   property does NOTHING on a block container — which is why the first version's
   "centred" heading still rendered hard left while a geometry assertion built on
   justify-content passed. Flex makes the row's alignment real, and column keeps
   the heading / body / footer stacked in document order. */
.dsh-genui-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* The title is a LINE OF TEXT, not a chrome bar: same size as body copy, one
   step stronger, with no divider under it — the answer's own content is the
   content, and a rule between title and body only added a box edge. */
.dsh-genui-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

/* ABOVE (default): a centred heading over the content.
   Centred rather than left-aligned because the content under it is usually a
   figure, a chart or a table — a block with its own optical centre — and a
   left-hugging label over a centred block reads as disconnected. */
.dsh-genui-head-centered {
  justify-content: center;
  margin-bottom: 12px;
}

/* BELOW: the same heading, under the content, so the reading order is
   content-first. Margin flips to the top; nothing else changes. */
.dsh-genui-head-below {
  margin-bottom: 0;
  margin-top: 12px;
}

/* LEFT: the original heading, left-aligned, sharing its line with the source
   toggle. Kept for readers who prefer the title to lead without centring. */
.dsh-genui-head-left {
  justify-content: flex-start;
  margin-bottom: 10px;
}

/* The trailing diagnostics row, used whenever the heading is centred and the
   toggle would break that centring. It sits at the end, right-aligned, and is
   nearly invisible until hovered. */
.dsh-genui-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

/* THE TITLE IS ONE STEP ABOVE BODY COPY, by weight only.
   ZCode's typography rule is "h1 is body +4px, h2 +2px, h3-h6 the body size",
   and a visual's own heading is an h3: the body size, differentiated by weight.
   So this stays at the body size and uses 600. Making it LARGER than the reply
   text was the actual complaint — a card that shouts its own title competes
   with the answer it is supposed to be part of. */
/* THE TITLE MUST SHRINK TO ITS TEXT when centred.
   flex: 1 (from the inline layout, where the title shares a row with the
   source toggle and should absorb the spare space) makes the element full width
   — and a full-width element has nothing for justify-content to move, so the
   text stayed hard left while the computed style read center. The centring
   modes therefore set flex: 0 1 auto, and only the inline mode grows. */
.dsh-genui-title {
  flex: 0 1 auto;
  min-width: 0;
  font-size: var(--dsh-content-font-size, 14px);
  font-weight: 600;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}

/* Left mode: the title leads and takes the leftover width, pushing the source
   toggle to the far end. */
.dsh-genui-head-left .dsh-genui-title {
  flex: 1;
}

/* Long titles wrap instead of being clipped; centred text that overflows is
   worse than a second line. */
.dsh-genui-head-centered .dsh-genui-title {
  text-align: center;
  overflow-wrap: anywhere;
}

/* Metadata stays available but recedes: it is a caption, not a badge. */
.dsh-genui-badge {
  flex: none;
  font-size: var(--dsh-content-font-size-caption, 12px);
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

.dsh-genui-toggle {
  flex: none;
  appearance: none;
  border: 1px solid transparent;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  padding: 2px 8px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
              color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

/* Hidden until the reader shows interest. A diagnostic control has no business
   competing with the answer for attention — but it must stay reachable by
   keyboard, so focus reveals it exactly like hover does. */
.dsh-genui-toggle {
  opacity: 0;
  transition: opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out),
              background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
              color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dsh-genui-card:hover .dsh-genui-toggle,
.dsh-genui-toggle:focus-visible,
.dsh-genui-toggle[aria-pressed="true"] {
  opacity: 1;
}

.dsh-genui-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dsh-genui-toggle:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

/* NO PADDING, NO SCROLLBOX, NO HEIGHT CAP.
   All three were window chrome. A generated answer that is taller than the
   viewport should scroll WITH the conversation — that is what the transcript
   does — rather than becoming an inner scroll region the user has to hit with
   the wheel first. The host's own long content (a big diff, a long table in
   Markdown) behaves the same way: it grows and the page scrolls. */
.dsh-genui-body {
  /* THE CONVERSATION DOES NOT SET A FONT SIZE. The chat flow's containers all
     inherit the document's 16px; only the markdown renderer, further in, sets
     the 14px a reply is displayed at. So "inherit" here would give 16px — larger
     than the reply sitting next to it, which is the bug this rule fixes.
     The host's own content token is the value the markdown renderer itself uses,
     so the answer matches the prose AND follows the user's font-size setting. */
  font-size: var(--dsh-content-font-size, 14px);
  /* The host has no line-height token; it computes 19.2px for 14px text (1.37).
     1.4 lands on 19.6px and, more importantly, SCALES with the font-size token
     when the user changes it — a fixed 19.2px would not. */
  line-height: 1.4;
  color: var(--dsw-alias-label-primary);
  min-width: 0;
}

.dsh-genui-body:empty {
  display: none;
}

/* The rationale is a FOOTNOTE, not a footer bar: no rule above it, no box
   padding, just tertiary text one step down from the answer. It explains the
   model's choice; it is not part of the answer's frame. */
.dsh-genui-rationale {
  margin-top: 10px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}

/* The source view is a CODE BLOCK, not a panel inside a window: it borrows the
   host's markdown code treatment (surface + radius + code font) so it reads as
   "here is the code that made this", the same way a fenced block in the reply
   would. */
.dsh-genui-source {
  margin: 10px 0 0;
  padding: 12px 14px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-markdown-code-block);
  color: var(--dsw-alias-label-primary);
  font-family: var(--ds-font-family-code);
  font-size: var(--dsh-content-font-size-caption, 12px);
  line-height: 1.55;
  overflow: auto;
  max-height: 360px;
  tab-size: 2;
}

/* A failure is inline feedback with a red left edge, not a panel. Same shape as
   the host's own inline callouts.
   THE EDGE USES THE OPAQUE ERROR INK, not --dsw-alias-code-diff-deleted. That
   token is a translucent FILL (rgba(186, 39, 35, 0.08) — eight percent), so a
   2px border drawn with it is a 2px border at eight percent opacity: the panel
   then has no visible edge at all, which is the same mistake the card's own
   snippet made with its headline (see legibility.js). */
.dsh-genui-failure {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  padding: 10px 12px;
  border-left: 2px solid var(--dsw-alias-state-error-primary);
  border-radius: 0 var(--dsw-radius-sm) var(--dsw-radius-sm) 0;
  background: var(--dsw-alias-bg-layer-2);
}

.dsh-genui-failure-title {
  font-size: var(--dsh-content-font-size, 14px);
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dsh-genui-failure-detail {
  font-family: var(--ds-font-family-code);
  font-size: var(--dsh-content-font-size-caption, 12px);
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.dsh-genui-sent {
  margin-top: 8px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  color: var(--dsw-alias-label-tertiary);
}

/* ---- the settings row ---------------------------------------------------
   Mirrors the host's own general-settings rows: a title, a secondary hint, and
   the control on the right. Every value is a host token so the row matches its
   neighbours in both themes. */
.dsh-genui-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
  /* NO border of our own. cds-theme draws the hairline under every settings row
     with the slot-child rule, and a border here competed with it: whichever won
     depended on stylesheet order, so this row's line was 0.06 while its
     neighbours were 0.10 — visibly the odd one out. The theme owns the
     separator. */
}

.dsh-genui-setting-title {
  font-size: var(--dsh-content-font-size, 14px);
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}

.dsh-genui-setting-hint {
  margin-top: 2px;
  font-size: var(--dsh-content-font-size-caption, 12px);
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-genui-setting-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
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

.dsh-genui-setting-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-genui-setting-trigger:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.dsh-genui-setting-select {
  flex: none;
  height: 32px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: var(--dsh-content-font-size-secondary, 13px);
}

/* Inside the popup menu, one row per placement, with a check on the active one. */
.dsh-genui-setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 180px;
}

.dsh-genui-setting-check {
  display: inline-flex;
  color: var(--dsw-alias-brand-primary);
}

.dsh-genui-pending {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  color: var(--dsw-alias-label-tertiary);
}
`

/**
 * Install the stylesheet, returning the disposer that removes it.
 *
 * Idempotent by contract: if a previous activation's tag is still present (an
 * HMR reload that outran its teardown), it is removed first, so the DOM never
 * carries two copies and a later dispose cannot remove the wrong one.
 *
 * Degrades to a no-op when there is no document — the unit tests import this
 * module in Node, where `document` does not exist.
 *
 * @param {Document | undefined} doc the document to mount into
 * @returns {() => void} disposer
 */
export function installCardCss(doc) {
  const disposeFrame = installOne(doc, CSS, 'data-dsh-genui-style')
  const disposeVendor = installOne(doc, VENDOR_CSS, 'data-dsh-genui-vendor-style')
  return () => {
    disposeVendor()
    disposeFrame()
  }
}

/**
 * Install the ported ZCode design system (see `vendor/visualize.css`).
 *
 * A SECOND tag rather than concatenating the two: the vendor sheet is generated
 * by `tools/port-visualize-css.mjs` and may be replaced wholesale on a re-port,
 * while the frame above is hand-maintained. Keeping them apart means a re-port
 * cannot silently drop the frame rules, and a reviewer can diff them separately.
 *
 * Only installed when the snippet is allowed to use the classes — which it is,
 * since the skill documents them.
 */
function installOne(doc, css, marker) {
  if (doc === undefined || doc === null || typeof doc.createElement !== 'function') {
    return function disposeWithoutDocument() {}
  }
  const previous = doc.querySelector(`style[${marker}]`)
  if (previous !== null) previous.remove()

  const tag = doc.createElement('style')
  tag.setAttribute(marker, '')
  tag.textContent = css
  doc.head.append(tag)

  return function dispose() {
    tag.remove()
  }
}

/** The stylesheet text, for tests that assert a token never becomes a literal. */
export const CARD_CSS = CSS
