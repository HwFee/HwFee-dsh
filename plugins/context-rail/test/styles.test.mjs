import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = readFileSync(join(ROOT, 'client/src/styles.js'), 'utf8')
const ARTIFACT = readFileSync(join(ROOT, 'client/client.js'), 'utf8')

test('each section is a rounded module with a hairline edge', () => {
  assert.match(SOURCE, /\.dcr-card \{[^}]*border:\s*\.5px solid var\(--dsw-alias-border-l3\)/)
  assert.match(SOURCE, /\.dcr-card \{[^}]*border-radius/)
  assert.match(SOURCE, /\.dcr-card \{[^}]*padding:/)
})

test('the rail is a fixed in-page column, not a host panel', () => {
  assert.match(SOURCE, /\.dcr-rail \{[^}]*position:\s*fixed/)
  assert.match(SOURCE, /\.dcr-rail \{[^}]*width:\s*328px/)
  assert.match(SOURCE, /\.dcr-rail \{[^}]*background:\s*var\(--dsw-alias-bg-base\)/)
})

test('the toggle is a 28px hit target that shows its pressed state', () => {
  assert.match(SOURCE, /\.dcr-toggle \{[^}]*width:\s*28px/)
  assert.match(SOURCE, /\.dcr-toggle\[aria-pressed="true"\]/)
})

test('the rail never styles the native right column', () => {
  // The whole point of the in-page rail: file previews keep that column as-is.
  // A CSS rule touching it would mean the rail is competing for it again. The
  // bundle may still READ the column's width to know when to step aside.
  assert.ok(!SOURCE.includes('[data-rightbar-col]'), 'no rule may target the native column')
  assert.ok(!SOURCE.includes('data-sidebar-right'), 'no rule may target the native sidebar')
  assert.ok(!SOURCE.includes('sidebar.right.'))
})

test('the conversation reserves the rail width while open', () => {
  // The padding must sit on the SCROLLER, not on the column: padding on the
  // column shrinks the scroller and drags the scrollbar in between the text and
  // the rail. On the scroller the bar keeps its place at the far right.
  assert.match(SOURCE, /body\[data-dcr-open="true"\] \[data-conversation-scroll\] \{[^}]*padding-right/)
  assert.ok(!SOURCE.includes('data-dcr-open="true"] [data-conversation-content]'),
    'the column must not carry the reservation')
  assert.ok(ARTIFACT.includes('data-dcr-open'))
})

test('the rail leaves the scrollbar gutter outside itself', () => {
  assert.match(SOURCE, /\.dcr-rail \{[^}]*right:\s*calc\(var\(--dsh-scrollbar-width, 5px\) \+ 2px\)/)
})
