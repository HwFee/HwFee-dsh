import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SESSION_PREVIEW_ROOT, sessionPreviewRules } from '../client/src/session-preview-styles.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize } from '../client/src/constants.js'
import { buildTokens } from '../client/src/tokens.js'

function rules() {
  const text = sessionPreviewRules().replace(/\/\*[\s\S]*?\*\//g, '')
  return [...text.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(([, selector, body]) => [selector.trim(), body.trim()])
}

test('only the session-details portal and its direct content rows are restyled', () => {
  assert.equal(SESSION_PREVIEW_ROOT, 'body [style*="--dsh-hover-preview-fade"]:has(> div > [data-slot="sidebar.session.row.hover"])')
  for (const [selector] of rules()) assert.ok(selector.startsWith(SESSION_PREVIEW_ROOT), selector)
  assert.equal(rules().length, 4)
  assert.doesNotMatch(sessionPreviewRules(), /class\*|class=|role="tooltip"/)
  assert.doesNotMatch(sessionPreviewRules(), /(?:display|visibility|position|pointer-events|content)\s*:/)
})

test('the fixed dark fill and cold labels are replaced by CDS surface and text roles', () => {
  const map = new Map(rules())
  const root = map.get(SESSION_PREVIEW_ROOT)
  assert.match(root, /background: var\(--dsw-alias-bg-overlay\) !important/)
  assert.match(root, /color: var\(--dsw-alias-label-primary\) !important/)
  assert.match(root, /border: 0 !important/)
  assert.match(root, /border-radius: var\(--dsw-radius-lg\) !important/)
  assert.match(root, /box-shadow: var\(--dsw-elevation-prominent\) !important/)
  assert.match(map.get(SESSION_PREVIEW_ROOT + ' > div > div:not([data-slot])'), /label-secondary/)
  assert.match(map.get(SESSION_PREVIEW_ROOT + ' > div > div:first-child'), /label-primary/)
  assert.match(map.get(SESSION_PREVIEW_ROOT + ' > div > div:nth-child(2):not([data-slot])'), /label-tertiary/)
  // Child slots and StateDot have their own semantics; no descendant wildcard
  // may flatten task-section text, semantic dots, or a spinner's currentColor.
  assert.doesNotMatch(sessionPreviewRules(), /\*\s*\{|svg\s*\{|\[data-state/)
  assert.doesNotMatch(sessionPreviewRules(), /#[\da-f]{3,8}\b|rgba?\(|hsla?\(|tooltip-bg|dsw-hovercard-bg\s*:/i)
})

test('surface, text, and radius tokens resolve in both modes and refinements remain optional', () => {
  const state = sanitize({})
  const tokens = buildTokens(state)
  for (const name of ['--dsw-alias-bg-overlay', '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary', '--dsw-radius-lg']) {
    assert.equal(typeof tokens[name].light, 'string', name)
    assert.equal(typeof tokens[name].dark, 'string', name)
  }
  assert.ok(buildCssFor(state).includes(sessionPreviewRules()))
  assert.ok(!buildCssFor(sanitize({ refine: false })).includes(SESSION_PREVIEW_ROOT))
  assert.ok(!buildCssFor(sanitize({ enabled: false })).includes(SESSION_PREVIEW_ROOT))
})
