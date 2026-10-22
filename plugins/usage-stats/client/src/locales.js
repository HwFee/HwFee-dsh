/**
 * Client dictionaries for the usage panel, one object per host locale.
 *
 * WHY IN SOURCE. The `locale/*.json` files carry only `meta.*` — they are read
 * by the Plugin Manager without activating the plugin. The panel's runtime
 * strings are registered with the browser `ctx.locale` service under
 * `LOCALE_NS` instead, the same mechanism the host's own client bundles use
 * (`ctx.locale.register(ns, { zh, en })` then `locale: ns` on the slot
 * registration injects `t`). Keeping the dictionaries beside the code that
 * reads them means a string and its interpolation contract can never drift
 * apart across files.
 *
 * `t(key)` returns the entry for the active locale and substitutes `{param}`
 * placeholders from the second argument; a key missing from the active
 * dictionary falls through to `en`, so `en` is the complete set.
 */
export const LOCALE_NS = 'dsh-usage-stats'

export const en = {
  'tab.overview': 'Overview',
  'tab.models': 'Models',
  'aria.tabs': 'Statistics view',
  'aria.ranges': 'Statistics range',
  'range.all': 'All',
  'range.30d': '30d',
  'range.7d': '7d',
  'range.all.hint': 'All time',
  'range.days.hint': 'Last {days} days',
  'card.sessions': 'Sessions',
  'card.messages': 'Messages',
  'card.tokens': 'Total tokens',
  'card.days': 'Active days',
  'card.peak': 'Peak hour',
  'card.model': 'Favorite model',
  'note.unavailable': 'Usage data unavailable',
  'note.loading': 'Crunching the numbers…',
  'note.noActivity': 'No activity recorded in this period',
  'note.noModels': 'No model calls recorded in this period',
  // The settings rows (all three live on the 主题定制 page, General list as
  // fallback). The height edits the shared tab body `.dus-body` through
  // `--dus-body-height`, and it sizes whichever style is selected — each style
  // keeps its own height.
  'settings.style.title': 'Panel style',
  'settings.style.desc': 'Compact: a 480px flat card. Classic: full composer width.',
  'settings.style.classic': 'Classic',
  'settings.style.compact': 'Compact',
  'settings.style.aria': 'Panel style',
  'settings.height.title': 'Stats panel height',
  'settings.height.desc': 'Height of the panel body, 240–520 px; applies immediately',
  // The unit row is a SWITCH now: on = 万/亿, off = K/M/B. The description names
  // BOTH ends with an example, because "短式" is not self-explanatory — the
  // feedback that prompted this change was literally 「什么叫短式」.
  'units.title': 'Number units',
  'units.desc': 'On: Chinese units. Off: K/M/B (12K, 1M).',
  'units.short': 'Short K/M/B',
  'units.myriad': 'Myriad wan/yi',
  'aria.heatmap': 'Activity heatmap: {weeks} weeks, busiest day {max} messages',
  'heat.cell': '{date} · {count} messages',
  'heat.cell.one': '{date} · {count} message',
  'heat.cell.zero': '{date} · no activity',
  // `book.lang` is a self-reporting locale marker, never shown: the panel reads
  // it to resolve the `auto` unit scale (K/M/B in an English UI, 万/亿 in a
  // Chinese one). Translators never see it.
  'book.lang': 'en',
}

export const zh = {
  'tab.overview': '总览',
  'tab.models': '模型',
  'aria.tabs': '统计视图',
  'aria.ranges': '统计范围',
  'range.all': '全部',
  'range.30d': '30 天',
  'range.7d': '7 天',
  'range.all.hint': '全部时间',
  'range.days.hint': '最近 {days} 天',
  'card.sessions': '会话',
  'card.messages': '消息',
  'card.tokens': '总 token',
  'card.days': '活跃天数',
  'card.peak': '高峰时段',
  'card.model': '常用模型',
  'note.unavailable': '用量数据不可用',
  'note.loading': '正在统计…',
  'note.noActivity': '这段时间还没有活跃记录',
  'note.noModels': '这段时间还没有模型调用记录',
  // 三行设置（都在「主题定制」页，缺失时回退通用列表）。高度行通过
  // `--dus-body-height` 改两个标签页共用的 `.dus-body`，并且只改**当前样式**的高度：
  // 两种样式各存各的高度。
  'settings.style.title': '面板样式',
  'settings.style.desc': '参考：480px 紧凑平面卡片。现有：跟随输入框宽度。',
  'settings.style.classic': '现有',
  'settings.style.compact': '参考',
  'settings.style.aria': '面板样式',
  'settings.height.title': '用量面板高度',
  'settings.height.desc': '面板正文高度，240–520 px，拖动即时生效',
  // 单位行现在是开关：开 = 万/亿，关 = K/M/B。描述里两端都给了例子，因为
  // 「短式」这个词本身不自明——正是这句反馈（「什么叫短式」）促成了这次改动。
  'units.title': '数字单位',
  'units.desc': '开：用 万/亿（12345 显示 1.2万）。关：用 K/M/B（显示 12K）。',
  'units.short': 'K/M/B',
  'units.myriad': '万/亿',
  'aria.heatmap': '活跃度热力图：{weeks} 周，单日最多 {max} 条消息',
  'heat.cell': '{date} · {count} 条消息',
  'heat.cell.one': '{date} · {count} 条消息',
  'heat.cell.zero': '{date} · 没有活跃记录',
  'book.lang': 'zh',
}
