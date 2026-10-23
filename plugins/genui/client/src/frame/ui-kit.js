/** Small reusable interaction primitives. No host services or model calls. */

export function chartData(data) {
  return (Array.isArray(data) ? data : []).filter(item =>
    item !== null && typeof item === 'object' && typeof item.label === 'string'
      && typeof item.value === 'number' && Number.isFinite(item.value))
    .map(item => ({ label: item.label, value: item.value }))
}

/** Ratios avoid overflow when the data contains very large finite numbers. */
export function chartDomain(data) {
  const scale = data.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0) || 1
  const ratios = data.map(item => item.value / scale)
  const min = Math.min(0, ...ratios), max = Math.max(0, ...ratios)
  const span = max - min || 1
  return { position(value) { return (value / scale - min) / span }, zero: -min / span }
}

export function createUIKit(React) {
  const h = React.createElement
  const number = value => new Intl.NumberFormat(undefined, Math.abs(value) >= 1e12 || (value !== 0 && Math.abs(value) < .001)
    ? { notation: 'scientific', maximumFractionDigits: 2 } : { maximumFractionDigits: 3 }).format(value)
  const empty = message => h('p', { className: 'gui-empty', role: 'status' }, message || 'No data / 暂无数据')
  const caption = (label, children) => label ? h('div', { className: 'gui-label' }, label, children) : null

  function Metric({ label, value, detail }) {
    return h('div', { className: 'gui-metric' }, caption(label),
      h('div', { className: 'gui-metric-value' }, value),
      detail ? h('div', { className: 'gui-muted' }, detail) : null)
  }

  function BarChart({ data, label, unit = '', onSelect, emptyText }) {
    const rows = chartData(data), domain = chartDomain(rows)
    const [selected, setSelected] = React.useState(null)
    if (rows.length === 0) return empty(emptyText)
    return h('div', { className: 'gui-chart', role: 'group', 'aria-label': label || 'Bar chart' },
      caption(label),
      rows.map((item, index) => {
        const position = domain.position(item.value)
        return h('button', {
          key: index, type: 'button', className: 'gui-bar-row', 'aria-pressed': selected === index,
          'aria-label': item.label + ': ' + number(item.value) + unit,
          onClick() { setSelected(index); if (typeof onSelect === 'function') onSelect(item, index) },
        },
        h('span', { className: 'gui-bar-label' }, item.label),
        h('span', { className: 'gui-bar-track', 'aria-hidden': true },
          h('span', { className: 'gui-bar-zero', style: { left: domain.zero * 100 + '%' } }),
          h('span', { className: 'gui-bar-fill', style: {
            left: Math.min(position, domain.zero) * 100 + '%',
            width: Math.abs(position - domain.zero) * 100 + '%',
          } })),
        h('span', { className: 'gui-number' }, number(item.value) + unit))
      }))
  }

  function LineChart({ data, label, unit = '', onSelect, emptyText }) {
    const rows = chartData(data), domain = chartDomain(rows)
    const [selected, setSelected] = React.useState(0)
    if (rows.length === 0) return empty(emptyText)
    const active = Math.min(selected, rows.length - 1)
    const x = index => rows.length === 1 ? 200 : 16 + index * 368 / (rows.length - 1)
    const y = value => 154 - domain.position(value) * 136
    const points = rows.map((item, index) => x(index) + ',' + y(item.value)).join(' ')
    const select = index => { setSelected(index); if (typeof onSelect === 'function') onSelect(rows[index], index) }
    return h('div', { className: 'gui-chart' }, caption(label),
      h('div', { className: 'gui-readout', 'aria-live': 'polite' }, rows[active].label + ': ' + number(rows[active].value) + unit),
      h('svg', { className: 'gui-line-chart', viewBox: '0 0 400 174', role: 'group', 'aria-label': label || 'Line chart' },
        h('line', { x1: 16, x2: 384, y1: y(0), y2: y(0), className: 'gui-axis' }),
        h('polyline', { points, className: 'gui-line' }),
        rows.map((item, index) => h('circle', {
          key: index, cx: x(index), cy: y(item.value), r: active === index ? 5 : 3,
          className: 'gui-point', tabIndex: 0, role: 'button', 'aria-pressed': active === index,
          'aria-label': item.label + ': ' + number(item.value) + unit,
          onMouseEnter: () => select(index), onFocus: () => select(index), onClick: () => select(index),
          onKeyDown(event) {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(index) }
          },
        }, h('title', null, item.label + ': ' + number(item.value) + unit)))),
      h('div', { className: 'gui-chart-ends', 'aria-hidden': true }, h('span', null, rows[0].label), h('span', null, rows.at(-1).label)))
  }

  /** Native buttons form a simple selectable group; content is owned by the caller. */
  function Tabs({ items = [], value, onChange, label }) {
    return h('div', { className: 'gui-tabs', role: 'group', 'aria-label': label || 'Views' },
      items.map(item => {
        const option = typeof item === 'string' ? { label: item, value: item } : item
        return h('button', {
          key: option.value, type: 'button', 'aria-pressed': option.value === value,
          onClick: () => { if (typeof onChange === 'function') onChange(option.value) },
        }, option.label)
      }))
  }

  function Select({ label, options = [], value, onChange }) {
    const id = React.useId()
    return h('label', { className: 'gui-control', htmlFor: id }, caption(label),
      h('select', { id, value, 'aria-label': label || 'Select', onChange: event => onChange?.(event.target.value) },
        options.map(item => {
          const option = typeof item === 'string' ? { label: item, value: item } : item
          return h('option', { key: option.value, value: option.value }, option.label)
        })))
  }

  function Range({ label, value, onChange, min = 0, max = 100, step = 1, unit = '' }) {
    const id = React.useId()
    return h('label', { className: 'gui-control', htmlFor: id },
      h('div', { className: 'gui-range-label' }, caption(label), h('output', { htmlFor: id, className: 'gui-number' }, value + unit)),
      h('input', { id, type: 'range', min, max, step, value, 'aria-label': label || 'Value',
        onChange: event => onChange?.(event.target.valueAsNumber) }))
  }

  return Object.freeze({ Metric, BarChart, LineChart, Tabs, Select, Range })
}
