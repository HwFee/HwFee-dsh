import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chartData, chartDomain, createUIKit } from '../client/src/frame/ui-kit.js'
import { UI_KIT_CSS } from '../client/src/frame/ui-kit-css.js'
import { buildFrameDocument } from '../client/src/frame-html.js'

const ui = createUIKit(React)
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props))

test('chart inputs reject non-finite values without mutating caller data', () => {
  const raw = [{ label: 'A', value: -2, extra: true }, { label: 'B', value: Infinity }, null, { label: 'C', value: '2' }]
  assert.deepEqual(chartData(raw), [{ label: 'A', value: -2 }])
  assert.equal(raw[0].extra, true)
  assert.deepEqual(chartData(null), [])
})

test('positive, negative, zero and extreme domains keep a finite shared zero axis', () => {
  for (const values of [[], [0], [0, 0], [4, 8], [-8, -4], [-3, 7], [-Number.MAX_VALUE, Number.MAX_VALUE]]) {
    const data = values.map((value, index) => ({ label: String(index), value }))
    const domain = chartDomain(data)
    for (const position of [domain.zero, ...data.map(item => domain.position(item.value))]) {
      assert.ok(Number.isFinite(position) && position >= 0 && position <= 1)
    }
  }
})

test('charts expose named keyboard controls and show an empty state rather than invalid SVG', () => {
  for (const Component of [ui.BarChart, ui.LineChart]) {
    assert.match(render(Component, { data: [], emptyText: 'Nothing yet' }), /role="status">Nothing yet/)
    const html = render(Component, { label: 'Changes', data: [{ label: 'A', value: -3 }, { label: 'B', value: 7 }] })
    assert.match(html, /aria-label="Changes"/)
    assert.match(html, /aria-label="A: -3"/)
    assert.match(html, /aria-pressed=/)
    assert.ok(!/NaN|Infinity|undefined/.test(html))
  }
  assert.match(render(ui.LineChart, { data: [{ label: 'Only', value: 0 }] }), /cx="200"/)
  const extremes = render(ui.BarChart, { data: [{label: 'tiny', value: 1e-7}, {label: 'huge', value: Number.MAX_VALUE}] })
  assert.match(extremes, /tiny: 1E-7/)
  assert.match(extremes, /huge: 1\.8E308/)
})

test('form controls preserve labels, unique associations and numeric range semantics', () => {
  const html = renderToStaticMarkup(React.createElement('div', null,
    React.createElement(ui.Range, { label: 'Growth', value: 6, min: -20, max: 30, step: 2, unit: '%', onChange() {} }),
    React.createElement(ui.Select, { label: 'Period', value: 'year', options: [{ label: 'Year', value: 'year' }], onChange() {} })))
  assert.match(html, /type="range"/); assert.match(html, /min="-20"/); assert.match(html, /step="2"/)
  assert.match(html, /6%/); assert.match(html, /aria-label="Growth"/); assert.match(html, /aria-label="Period"/)
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1])
  assert.equal(new Set(ids).size, 2)
  for (const id of ids) assert.ok(html.includes('for="' + id + '"'))
  assert.match(render(ui.Tabs, { label: 'View', items: ['A', 'B'], value: 'B' }), /aria-pressed="true">B/)
})

test('the generated frame includes the kit and scoped styles without changing the tool payload', () => {
  const html = buildFrameDocument({ code: 'return h(ui.BarChart, {data:[]})', token: 'test' })
  assert.ok(html.includes('<div id="root" class="dsh-genui-card">'), 'scoped kit/vendor styles need an ancestor inside the iframe')
  assert.ok(html.includes('.dsh-genui-card .gui-chart'))
  assert.ok(html.includes('ui.BarChart'))
  for (const selector of UI_KIT_CSS.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    if (selector[1].trim().startsWith('@')) continue
    for (const part of selector[1].split(',')) assert.ok(part.trim().startsWith('.dsh-genui-card'), part)
  }
})
