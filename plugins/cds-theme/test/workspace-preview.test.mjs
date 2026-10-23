import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WORKSPACE_PREVIEW_ROOT, workspacePreviewRules } from '../client/src/workspace-preview-styles.js'
import { SESSION_PREVIEW_ROOT } from '../client/src/session-preview-styles.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize } from '../client/src/constants.js'
import { buildTokens } from '../client/src/tokens.js'

function rules() {
  const text = workspacePreviewRules().replace(/\/\*[\s\S]*?\*\//g, '')
  return [...text.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(([, selector, body]) => [selector.trim(), body.trim()])
}

test('the folder card is identified by structure, not by the shared hover variable', () => {
  // The variable is written by the HoverCard primitive, so EVERY hover card has
  // it — the deliverables single-file preview included. The selector therefore
  // needs a structural clause on top of it.
  assert.match(WORKSPACE_PREVIEW_ROOT, /^body \[style\*="--dsh-hover-preview-fade"\]/)
  assert.match(WORKSPACE_PREVIEW_ROOT, /:has\(> div > :nth-child\(3\):last-child\)/,
    'the folder card is the one with exactly three content rows')
  assert.match(WORKSPACE_PREVIEW_ROOT, /:not\(:has\(\[data-slot\]\)\)/,
    'the session card always renders a slot outlet, so its presence rules it out')
  assert.doesNotMatch(WORKSPACE_PREVIEW_ROOT, /class\*|class=|role="tooltip"/,
    'salted CSS-module names are not a stable hook')
})

test('the folder and session selectors are disjoint', () => {
  // Both anchor on the same portal variable, so they must never both match.
  assert.notEqual(WORKSPACE_PREVIEW_ROOT, SESSION_PREVIEW_ROOT)
  assert.ok(SESSION_PREVIEW_ROOT.includes('data-slot="sidebar.session.row.hover"'),
    'the session rule keys on its slot outlet')
  assert.ok(WORKSPACE_PREVIEW_ROOT.includes(':not(:has([data-slot]))'),
    'the folder rule requires the ABSENCE of any slot, which the session card has')
})

test('only the card and its direct rows are restyled', () => {
  const entries = rules()
  assert.equal(entries.length, 3)
  for (const [selector] of entries) assert.ok(selector.startsWith(WORKSPACE_PREVIEW_ROOT), selector)
  assert.doesNotMatch(workspacePreviewRules(), /(?:display|visibility|position|pointer-events|content)\s*:/,
    'placement and hit-testing belong to the host portal')
  assert.doesNotMatch(workspacePreviewRules(), /\*\s*\{|svg\s*\{/,
    'no descendant wildcard: a future child would inherit a colour it did not ask for')
})

test('the host dark fill and cold greys are replaced by CDS roles', () => {
  const map = new Map(rules())
  const root = map.get(WORKSPACE_PREVIEW_ROOT)
  assert.match(root, /background: var\(--dsw-alias-bg-overlay\) !important/)
  assert.match(root, /color: var\(--dsw-alias-label-primary\) !important/)
  assert.match(root, /border: 0 !important/)
  assert.match(root, /border-radius: var\(--dsw-radius-lg\) !important/)
  assert.match(root, /box-shadow: var\(--dsw-elevation-prominent\) !important/)
  assert.match(map.get(WORKSPACE_PREVIEW_ROOT + ' > div > div:first-child'), /label-primary/)
  assert.match(map.get(WORKSPACE_PREVIEW_ROOT + ' > div > div:not(:first-child)'), /label-tertiary/)
  // The host paints #2C2C2E with #fff / #cfd3d6 text; none of that may survive.
  assert.doesNotMatch(workspacePreviewRules(), /#[\da-f]{3,8}\b|rgba?\(|hsla?\(|tooltip-bg|dsw-hovercard-bg\s*:/i)
})

test('surface, text, and radius tokens resolve in both modes and refinements stay optional', () => {
  const state = sanitize({})
  const tokens = buildTokens(state)
  for (const name of ['--dsw-alias-bg-overlay', '--dsw-alias-label-primary', '--dsw-alias-label-tertiary', '--dsw-radius-lg']) {
    assert.equal(typeof tokens[name].light, 'string', name)
    assert.equal(typeof tokens[name].dark, 'string', name)
  }
  assert.ok(buildCssFor(state).includes(workspacePreviewRules()))
  assert.ok(!buildCssFor(sanitize({ refine: false })).includes(WORKSPACE_PREVIEW_ROOT))
  assert.ok(!buildCssFor(sanitize({ enabled: false })).includes(WORKSPACE_PREVIEW_ROOT))
})
