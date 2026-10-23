import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFrameThemeApplier } from '../client/src/frame/theme.js'

const style = () => ({ values: new Map(), setProperty(name, value) { this.values.set(name, value) }, removeProperty(name) { this.values.delete(name) } })
function setup() {
  const root = { style: style(), attrs: new Set(), setAttribute(name) { this.attrs.add(name) }, removeAttribute(name) { this.attrs.delete(name) } }
  const body = { style: style() }
  return { root, body, apply: createFrameThemeApplier({ documentElement: root, body }) }
}

test('code font and chart series reach the frame alongside host theme tokens', () => {
  const s = setup()
  const vars = { '--ds-font-family-code': 'monospace', '--viz-series-1': '#c66a4a', '--dsw-radius-md': '8px', '--dsh-content-font-size': '15px' }
  s.apply({ vars, dark: true, base: { 'font-size': '15px' } })
  assert.deepEqual(Object.fromEntries(s.root.style.values), vars)
  assert.equal(s.root.style.colorScheme, 'dark'); assert.ok(s.root.attrs.has('data-ds-dark-theme'))
  assert.equal(s.body.style.values.get('font-size'), '15px')
})

test('a new snapshot removes obsolete values rather than keeping the previous theme', () => {
  const s = setup()
  s.apply({ vars: { '--viz-series-1': 'red' }, base: { 'font-size': '20px' }, dark: true })
  s.apply({ vars: { '--dsw-radius-md': '4px' }, dark: false })
  assert.equal(s.root.style.values.has('--viz-series-1'), false)
  assert.equal(s.body.style.values.has('font-size'), false)
  assert.equal(s.root.attrs.has('data-ds-dark-theme'), false)
})
