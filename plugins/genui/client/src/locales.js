/**
 * Client dictionaries for the generated-UI card.
 *
 * The `locale/*.json` files carry only `meta.*` — the Plugin Manager reads them
 * without activating the plugin. The card's runtime strings register with the
 * browser `ctx.locale` service under `LOCALE_NS`, and passing `locale: LOCALE_NS`
 * on the slot registration injects `t`.
 *
 * `en` is the complete set; a key missing from the active dictionary falls
 * through to it, so a half-translated locale degrades to English rather than to
 * a raw key.
 */
export const en = {
  'card.title': 'Generated UI',
  'card.preparing': 'Preparing card…',
  'card.invalid': 'This card could not be read — its arguments are missing or invalid.',
  'card.failed': 'This card failed to render',
  'card.showSource': 'View source',
  'card.hideSource': 'Hide source',
  'card.sourceLabel': 'Card source',
  'card.rationaleLabel': 'Why a card',
  'card.sent': 'Sent to the conversation',
  'setting.titlePlacement': 'Card title position',
  'setting.titlePlacement.left': 'Left, above the content',
  'setting.titlePlacement.above': 'Centred above the content',
  'setting.titlePlacement.below': 'Centred below the content',
  'setting.titlePlacementHint': 'Where a generated card puts its title.',
  'card.sendFailed': 'This card could not send its message',
  'aria.toggleSource': 'Toggle the source of this card',
  'aria.card': 'Interactive card rendered from a render_ui call',
}

export const zh = {
  'card.title': '生成的界面',
  'card.preparing': '正在准备卡片…',
  'card.invalid': '这张卡片读不出来 —— 它的参数缺失或不合法。',
  'card.failed': '这张卡片渲染失败',
  'card.showSource': '查看源码',
  'card.hideSource': '收起源码',
  'card.sourceLabel': '卡片源码',
  'card.rationaleLabel': '为什么用卡片',
  'card.sent': '已发送到对话',
  'setting.titlePlacement': '卡片标题位置',
  'setting.titlePlacement.left': '靠左，在内容上方',
  'setting.titlePlacement.above': '内容上方，居中',
  'setting.titlePlacement.below': '内容下方，居中',
  'setting.titlePlacementHint': '生成的卡片把标题放在哪里。',
  'card.sendFailed': '这张卡片没能发出消息',
  'aria.toggleSource': '展开或收起这张卡片的源码',
  'aria.card': '由 render_ui 调用渲染的交互卡片',
}
