/**
 * Client dictionaries, one object per host locale.
 *
 * WHY IN SOURCE. `locale/*.json` carries only `meta.*` (the Plugin Manager
 * reads it without activating the plugin). The row's runtime copy is registered
 * with the browser `ctx.locale` service under `LOCALE_NS`, and the slot
 * registration's `locale:` field injects `t` and re-renders the row on a
 * language switch.
 *
 * PURITY. zh is pure Chinese, en is pure English. No `中文 · English` glue.
 *
 * PROVENANCE OF THE LEVEL COPY. The five `level.*` entries are the reference
 * component's `EFFORT_META` (`.reference/open-claude-ui/code-examples/
 * ModelSelectorEffort.tsx:12-22`), translated — not invented. They are only
 * ever used for a level id the provider actually advertises. An id the
 * reference does not name (`minimal`, `off`, a custom key) never reaches this
 * table: `levels.js` falls back to the catalog's own `name` and skips the
 * description entirely, so this plugin cannot claim a semantic the provider
 * never stated.
 *
 * `level.max.warning` is the reference's token warning. It is shown only while
 * the `max` stop is the selected one — the one place the reference copy is a
 * measurable claim rather than flavour.
 */

export const LOCALE_NS = 'dsh-reasoning-effort'

export const en = {
  // The row itself.
  'row.title': 'Thinking effort',
  'row.desc': 'Higher effort means more thorough reasoning, but takes longer and uses limits faster.',
  'row.sessionless': 'Open a session to change its thinking effort.',

  // State lines.
  'state.loading': 'Reading the model catalog…',
  'state.unavailable': 'Effort levels unavailable',
  'badge.default': 'Default',

  // The reference's EFFORT_META, translated.
  'level.low.name': 'Low',
  'level.low.desc': 'Quick replies to simple questions',
  'level.medium.name': 'Medium',
  'level.medium.desc': 'Light, casual tasks',
  'level.high.name': 'High',
  'level.high.desc': 'Balanced for everyday work',
  'level.xhigh.name': 'Extra',
  'level.xhigh.desc': 'Complex, detailed work',
  'level.max.name': 'Max',
  'level.max.desc': 'The hardest problems. Takes longest.',
  'level.max.warning': 'May use excessive tokens resulting in long response times and may hit token limits. Use sparingly for the hardest tasks.',

  // Accessibility.
  'aria.label': 'Thinking effort, {name}, level {index} of {count}',
  'aria.single': 'Thinking effort is fixed at {name} for this model',
  'note.pending': 'Applying…',
  'note.failed': 'Could not change the effort',
  'error.write': 'Effort change failed: {message}',
  'error.notAdvertised': 'This model does not offer that effort level',
}

export const zh = {
  'row.title': '思考强度',
  'row.desc': '强度越高，思考越充分，但耗时更久、更容易触及用量上限。',
  'row.sessionless': '打开一个会话后才能调整它的思考强度。',

  'state.loading': '正在读取模型目录…',
  'state.unavailable': '思考强度不可用',
  'badge.default': '默认',

  'level.low.name': '低',
  'level.low.desc': '简单问题的快速回答',
  'level.medium.name': '中',
  'level.medium.desc': '轻松、日常的任务',
  'level.high.name': '高',
  'level.high.desc': '日常工作的均衡档',
  'level.xhigh.name': '极高',
  'level.xhigh.desc': '复杂、细致的工作',
  'level.max.name': '最高',
  'level.max.desc': '最难的问题，耗时最长。',
  'level.max.warning': '可能消耗过多 token，导致响应时间变长，并触及用量上限。只在最难的任务上偶尔使用。',

  'aria.label': '思考强度：{name}，第 {index} 档，共 {count} 档',
  'aria.single': '这个模型的思考强度固定为 {name}',
  'note.pending': '正在应用…',
  'note.failed': '无法修改思考强度',
  'error.write': '思考强度修改失败：{message}',
  'error.notAdvertised': '当前模型没有这个思考强度档位',
}

/**
 * A translator backed by `dict`, substituting `{param}` placeholders from the
 * second argument. Used when the outlet supplies no `t`.
 */
export function makeTranslator(dict) {
  return function translate(key, params) {
    const template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
    return String(template).replace(/\{(\w+)\}/g, function (match, name) {
      return params && Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match
    })
  }
}

/**
 * Wrap the outlet-injected `t`. An absent `t` (tests, a host without
 * `ctx.locale`) falls back to the embedded English table, so a row never renders
 * a raw key.
 */
export function makeT(injected) {
  return typeof injected === 'function' ? injected : makeTranslator(en)
}
