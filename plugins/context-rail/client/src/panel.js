/**
 * The rail body: three stacked cards — Environment, Context, Usage.
 *
 * WHY A FACTORY. React arrives as an argument instead of a module import,
 * because the browser only has the host's frozen module table; passing it in
 * also lets the panel render under a test's own React with no host around it.
 *
 * WHY NO JSX. The bundle is built by esbuild with no JSX transform, so every
 * element is React.createElement.
 *
 * WHY EVERY NUMBER IS PRE-COMPUTED. Formatting, occupancy and the band widths
 * live in format.js, which is pure and unit-tested without a DOM. This file
 * only arranges that output — the same split usage-stats uses.
 */

import {
  bandShares, formatPercent, formatTokens, leafOf, occupancy, usageTotals,
} from './format.js'

const FALLBACK = {
  'environment.title': '环境',
  'environment.directory': '目录',
  'environment.model': '模型',
  'environment.session': '会话',
  'environment.state': '状态',
  'environment.running': '回复中',
  'environment.idle': '空闲',
  'context.title': '上下文',
  'context.used': '已用',
  'context.free': '剩余',
  'context.system': '系统提示',
  'context.tools': '工具',
  'context.messages': '消息',
  'context.empty': '还没有上下文数据，发出第一条消息后出现。',
  'usage.title': '用量',
  'usage.total': '合计',
  'usage.input': '输入',
  'usage.output': '输出',
  'usage.cacheRead': '缓存读',
  'usage.cacheWrite': '缓存写',
  'usage.empty': '本会话还没有产生用量。',
}

/**
 * Translation with an embedded English table, for a registration that carries
 * no locale seat and for tests.
 * @param {(key: string) => string} [t] - slot-injected translator
 * @returns {(key: string) => string}
 */
export function translator(t) {
  if (typeof t === 'function') return t
  return (key) => FALLBACK[key] ?? key
}

/**
 * One CSS percentage, rounded to two decimals.
 *
 * Rounding is not cosmetic: the three band widths and the free tail are
 * computed independently and must sum to the track, and unrounded floats leak
 * values like 75.06999999999999 into the style attribute.
 * @param {number} value - percent in 0..100
 * @returns {string}
 */
function pct(value) {
  return String(Math.round(value * 100) / 100) + '%'
}

/**
 * @param {{ React: object }} deps
 * @returns {{ Panel: Function }}
 */
export function createPanel({ React }) {
  const h = React.createElement

  /**
   * One section: a collapsible title row and the content beneath it.
   *
   * The rail has no card chrome — no fill, radius or hairline — so the title is
   * the only separator a section gets. It is a button because clicking it
   * collapses the section, which is what the chevron promises.
   */
  function Card({ id, title, meta, children }) {
    const [open, setOpen] = React.useState(true)
    return h('section', {
      className: 'dcr-card',
      'data-dcr-card': id,
      'data-collapsed': open ? undefined : 'true',
    },
    h('button', {
      type: 'button',
      className: 'dcr-head',
      'aria-expanded': open,
      onClick: () => setOpen(!open),
    },
    h('span', { className: 'dcr-title' }, title),
    h('span', { className: 'dcr-spacer' }),
    meta === undefined ? null : h('span', { className: 'dcr-head-meta' }, meta),
    h('svg', {
      className: 'dcr-chevron',
      width: 12,
      height: 12,
      viewBox: '0 0 12 12',
      'aria-hidden': true,
    }, h('path', {
      d: 'M3 4.5 6 7.5 9 4.5',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }))),
    open ? h('div', { className: 'dcr-body' }, children) : null)
  }

  /** One definition row: optional colour swatch, label, value and optional percent. */
  function Row({ band, label, value, percent, title }) {
    return h('div', { className: 'dcr-row' },
      h('dt', null,
        band === undefined ? null : h('span', { className: 'dcr-swatch', 'data-band': band }),
        h('span', { className: 'dcr-value-label' }, label)),
      h('dd', { className: 'dcr-value', title: title ?? (typeof value === 'string' ? value : undefined) },
        h('span', null,
          typeof value === 'string' || typeof value === 'number' ? String(value) : (value ?? '—')),
        percent === undefined ? null : h('span', { className: 'dcr-pct' }, percent)))
  }

  /** Environment: where this session runs and what it runs on. */
  function EnvironmentCard({ props, t }) {
    const rows = [
      { key: 'directory', label: t('environment.directory'), value: leafOf(props.cwd), title: props.cwd ?? undefined },
      { key: 'model', label: t('environment.model'), value: props.model || '—' },
      { key: 'session', label: t('environment.session'), value: props.title || '—', title: props.title ?? undefined },
      { key: 'state', label: t('environment.state'), value: props.running ? t('environment.running') : t('environment.idle') },
    ]
    return h(Card, { id: 'environment', title: t('environment.title') },
      h('dl', { className: 'dcr-rows' },
        rows.map((row) => h(Row, {
          key: row.key, label: row.label, value: row.value, title: row.title,
        }))))
  }

  /**
   * Context: occupancy over the window, drawn as one stacked bar whose empty
   * tail is the free space, then the composition bands and the remainder.
   *
   * ONE AUTHORITY FOR "REMAINING". The free row and its percentage come from
   * the pressure total (`context.ratio`), never from the breakdown sum: the two
   * projections are measured independently and need not agree, so deriving the
   * free share from the bands would print a remainder that contradicts the
   * occupancy above it.
   */
  function ContextCard({ props, t }) {
    const context = occupancy(props.pressure)
    const bands = bandShares(props.breakdown, context)
    if (context === null) {
      return h(Card, { id: 'context', title: t('context.title') },
        h('p', { className: 'dcr-empty' }, t('context.empty')))
    }
    const occupiedWidth = context.ratio * 100
    const freeWidth = Math.max(0, 100 - occupiedWidth)
    const segments = bands.length === 0
      ? [h('div', { key: 'total', className: 'dcr-seg', 'data-band': 'total', style: { width: pct(occupiedWidth) } })]
      : bands.map((band) => h('div', {
        key: band.key,
        className: 'dcr-seg',
        'data-band': band.key,
        style: { width: pct(band.share * 100) },
      }))
    if (freeWidth > 0) {
      segments.push(h('div', {
        key: 'free',
        className: 'dcr-seg',
        'data-band': 'free',
        style: { width: pct(freeWidth) },
      }))
    }
    const rows = bands.map((band) => h(Row, {
      key: band.key,
      band: band.key,
      label: t('context.' + band.key),
      value: '~' + formatTokens(band.tokens),
      percent: formatPercent(band.percent),
    }))
    rows.push(h(Row, {
      key: 'free',
      band: 'free',
      label: t('context.free'),
      value: formatTokens(context.freeTokens),
      percent: formatPercent(context.freePercent),
    }))
    return h(Card, {
      id: 'context',
      title: t('context.title'),
      meta: context.percent + '% ' + t('context.used'),
    },
    h('div', { className: 'dcr-figures' },
      h('span', null, '~' + formatTokens(context.usedTokens) + ' / ' + formatTokens(context.contextWindow))),
    h('div', { className: 'dcr-bar', 'data-dcr-bar': 'context' }, segments),
    h('dl', { className: 'dcr-rows' }, rows))
  }

  /** Usage: what the session has billed so far, split the way the provider splits it. */
  function UsageCard({ props, t }) {
    const totals = usageTotals(props.usage)
    if (totals === null || totals.total === 0) {
      return h(Card, { id: 'usage', title: t('usage.title') },
        h('p', { className: 'dcr-empty' }, t('usage.empty')))
    }
    const rows = totals.rows.map((row) => h(Row, {
      key: row.key,
      label: t('usage.' + row.key),
      value: formatTokens(row.tokens),
    }))
    rows.push(h(Row, { key: 'total', label: t('usage.total'), value: formatTokens(totals.total) }))
    return h(Card, { id: 'usage', title: t('usage.title') },
      h('dl', { className: 'dcr-rows' }, rows))
  }

  /**
   * The registered component.
   *
   * Props come from the slot seat; the rail only reads. Everything is optional
   * so the first paint before any projection arrives shows the empty states
   * rather than throwing.
   */
  function Panel(props) {
    const t = translator(props.t)
    return h('div', { className: 'dcr-root', 'data-dcr-root': true },
      h(EnvironmentCard, { props, t }),
      h(ContextCard, { props, t }),
      h(UsageCard, { props, t }))
  }

  return { Panel }
}
