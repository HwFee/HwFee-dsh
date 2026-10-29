/**
 * The rail's dictionaries, registered on the host locale service under NS.
 *
 * The same table also serves as the panel's fallback when a registration
 * carries no locale seat (a host without the locale plugin, a bare test).
 */

export const NS = 'contextRail'

export const zh = {
  'toggle.title': '上下文侧栏',
  'tab.title': '上下文',
  'guide.title': '上下文与环境',
  'guide.description': '当前会话的目录、模型、上下文占用与用量',

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

export const en = {
  'toggle.title': 'Context rail',
  'tab.title': 'Context',
  'guide.title': 'Context & environment',
  'guide.description': 'Directory, model, context occupancy and usage of this session',

  'environment.title': 'Environment',
  'environment.directory': 'Directory',
  'environment.model': 'Model',
  'environment.session': 'Session',
  'environment.state': 'State',
  'environment.running': 'Running',
  'environment.idle': 'Idle',

  'context.title': 'Context',
  'context.used': 'used',
  'context.free': 'Free',
  'context.system': 'System prompt',
  'context.tools': 'Tools',
  'context.messages': 'Messages',
  'context.empty': 'No context data yet. It appears after the first message.',

  'usage.title': 'Usage',
  'usage.total': 'Total',
  'usage.input': 'Input',
  'usage.output': 'Output',
  'usage.cacheRead': 'Cache read',
  'usage.cacheWrite': 'Cache write',
  'usage.empty': 'This session has not spent any tokens yet.',
}
