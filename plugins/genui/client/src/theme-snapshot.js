/**
 * The theme, as data the frame can use.
 *
 * A sandboxed frame with an opaque origin inherits NOTHING from the host page:
 * not the CSS custom properties on `<body>`, not the paragraph font, not the
 * dark-mode attribute. That is the price of the isolation and it is worth
 * paying, but it means the card would render unstyled unless the host measures
 * its own theme and hands it over.
 *
 * So this module takes a measurement, not a stylesheet:
 *
 *   vars  every `--dsw-*` / `--dsh-*` custom property the card's own CSS and the
 *         ported vendor sheet reference, resolved on the host's `<body>`
 *   base  the four inherited text properties the transcript sets on its own body
 *   dark  whether the app is in its dark theme, from the attribute the host's
 *         presenter writes
 *
 * WHY A MEASUREMENT AND NOT A TOKEN TABLE. The tokens belong to the theme owner;
 * a list copied here would drift the moment a theme plugin changes a value, and
 * the card would silently paint the old palette. `getComputedStyle` is ground
 * truth for whatever is in force right now, including a third-party theme.
 *
 * WHY THE NAMES ARE DISCOVERED FROM THE CARD'S OWN CSS. The names come from the
 * two sheets the card ships, so a new token added to a rule is carried
 * automatically; the static list below only covers names the skill tells the
 * model to use in inline styles, which no sheet mentions.
 *
 * @module theme-snapshot
 */

import { VENDOR_CSS } from './vendor/visualize.css.js'
import { CARD_CSS } from './styles.js'

/**
 * Tokens the skill documents for inline styles.
 *
 * These appear in model-authored `style` objects rather than in either shipped
 * sheet, so they cannot be discovered by scanning CSS and are listed here once.
 */
const SKILL_TOKENS = [
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-label-caption',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-link',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-warn-label',
  '--dsw-alias-code-diff-added',
  '--dsw-alias-code-diff-deleted',
  '--dsw-radius-sm',
  '--dsw-radius-md',
  '--dsw-radius-lg',
  '--dsw-radius-xl',
  '--dsw-font-xxxs-11',
  '--dsw-font-xxs-12',
  '--dsw-font-xs-13',
  '--dsw-font-s-14',
  '--dsw-font-base-16',
  '--dsw-font-m-18',
  '--dsw-font-l-20',
  '--dsw-font-xl-24',
  '--dsh-content-font-size',
  '--dsh-content-font-size-secondary',
  '--dsh-content-font-size-caption',
  '--dsh-font-family-ui',
  '--dsw-font-family',
  '--ds-font-family-code',
  '--dsw-elevation-soft',
  '--dsw-elevation-panel',
]

/** Body properties the transcript's own typography lives in. */
const BASE_PROPERTIES = ['font-family', 'font-size', 'line-height', 'letter-spacing']

/** `var(--x)` / `var(--x, fallback)` references in a stylesheet. */
function varNamesIn(css) {
  const names = []
  for (const match of String(css ?? '').matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) names.push(match[1])
  return names
}

/** Every token name the card's rendered output can reference. */
export function themeTokenNames() {
  const names = new Set(SKILL_TOKENS)
  for (const name of varNamesIn(CARD_CSS)) names.add(name)
  for (const name of varNamesIn(VENDOR_CSS)) names.add(name)
  return [...names].filter((name) => /^--(dsw|dsh|ds|viz)-[a-z0-9-]+$/.test(name)).sort()
}

/**
 * Measure the host's current theme.
 *
 * Reads only. A missing or exotic `getComputedStyle` yields an empty snapshot,
 * which the frame renders with its own defaults rather than throwing: a theme
 * that cannot be measured must not take the card down.
 *
 * @param {Window | undefined} view the host window
 * @param {string[]} [names] token names to resolve (defaults to the discovered set)
 * @returns {{ vars: Record<string,string>, base: Record<string,string>, dark: boolean }} the snapshot
 */
export function readThemeSnapshot(view, names = themeTokenNames()) {
  const empty = { vars: {}, base: {}, dark: false }
  if (view === undefined || view === null) return empty
  const doc = view.document
  const body = doc?.body
  if (body === undefined || body === null) return empty
  if (typeof view.getComputedStyle !== 'function') return empty

  const computed = view.getComputedStyle(body)
  if (computed === undefined || computed === null) return empty

  const vars = {}
  for (const name of names) {
    // `getPropertyValue` on a custom property returns the AUTHORED value
    // (already resolved through the cascade, not through `var()`), which is
    // exactly what has to be re-declared in the frame.
    const value = computed.getPropertyValue(name)
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed === '' || trimmed.length > 200) continue
    vars[name] = trimmed
  }

  const base = {}
  for (const property of BASE_PROPERTIES) {
    const value = computed.getPropertyValue(property)
    if (typeof value === 'string' && value.trim() !== '' && value.length <= 200) {
      base[property] = value.trim()
    }
  }

  return {
    vars,
    base,
    // The host's presenter writes the attribute on the root element; the body is
    // checked too because a theme plugin may write it there instead.
    dark: doc.documentElement?.hasAttribute?.('data-ds-dark-theme') === true
      || body.hasAttribute?.('data-ds-dark-theme') === true,
  }
}

/**
 * Keep a frame in step with the host's theme.
 *
 * Two things change the answer: the user flips light/dark (an attribute on the
 * root), and a theme or font plugin rewrites tokens (an inline `<style>` on
 * `<body>`, or an inline style property). Both are observed, then debounced to
 * one snapshot per frame — the host rewrites its whole token sheet in one go,
 * and re-measuring per mutation would read the palette dozens of times for one
 * switch.
 *
 * @param {Window | undefined} view the host window
 * @param {(snapshot: object) => void} onChange called with a fresh snapshot
 * @returns {() => void} disposer
 */
export function observeTheme(view, onChange) {
  const noop = function disposeWithoutWindow() {}
  if (view === undefined || view === null || typeof onChange !== 'function') return noop
  const doc = view.document
  if (doc?.documentElement === undefined || doc.documentElement === null) return noop

  let queued = false
  let cancelled = false
  const Observer = view.MutationObserver
  const flush = () => {
    queued = false
    if (cancelled) return
    onChange(readThemeSnapshot(view))
  }
  const schedule = () => {
    if (queued || cancelled) return
    queued = true
    if (typeof view.requestAnimationFrame === 'function') view.requestAnimationFrame(flush)
    else view.setTimeout(flush, 0)
  }

  /**
   * Does this mutation record belong to the theme layer?
   *
   * ONE observer on the root subtree is the only shape that sees all three
   * sources — the presenter's attribute write on `<html>`, a theme plugin
   * swapping its `<style>` in `<head>`, and an inline font/scale change on
   * `<body>` — with a single registration. The cost is that it also sees every
   * mutation the transcript makes while a reply streams, so the records are
   * filtered here BEFORE the snapshot: a message list re-render must not cost a
   * `getComputedStyle` sweep on every frame.
   *
   * @param {MutationRecord} record one record
   * @returns {boolean} whether it can have changed a token or the theme flag
   */
  const relevant = (record) => {
    const target = record.target
    if (target === doc.documentElement) return true
    if (target === doc.body) return true
    // A node inside `<head>` being added/removed is a stylesheet swap. Anything
    // removed from head is reported on `head` itself, which the tests below
    // catch; anything added comes with the new node as `record.target`'s child.
    if (doc.head !== null && doc.head !== undefined) {
      if (target === doc.head) return true
      if (typeof doc.head.contains === 'function' && doc.head.contains(target)) return true
    }
    return false
  }

  let observer = null
  if (typeof Observer === 'function') {
    observer = new Observer((records) => {
      for (const record of records) {
        if (relevant(record)) { schedule(); return }
      }
    })
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-ds-dark-theme'],
    })
  }

  // A media-query flip is the one change no mutation reports: the OS palette
  // moving while the app follows it.
  let query = null
  const onMedia = () => schedule()
  if (typeof view.matchMedia === 'function') {
    query = view.matchMedia('(prefers-color-scheme: dark)')
    if (typeof query.addEventListener === 'function') query.addEventListener('change', onMedia)
  }

  return function dispose() {
    cancelled = true
    if (observer !== null) observer.disconnect()
    if (query !== null && typeof query.removeEventListener === 'function') query.removeEventListener('change', onMedia)
  }
}
