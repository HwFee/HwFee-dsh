/**
 * Settings-panel dictionaries, one object per host locale.
 *
 * WHY IN SOURCE. The `locale/*.json` files carry only `meta.*` for the Plugin
 * Manager, which reads them WITHOUT activating the plugin; the strings the
 * panel renders are registered with the browser `ctx.locale` service under
 * `LOCALE_NS` at activation — the same mechanism usage-stats uses
 * (`ctx.locale.register(ns, { zh, en })`, then `locale: ns` on the slot
 * registration injects `t(key, params)` as a prop and the outlet re-renders
 * the row on a language switch).
 *
 * PURITY CONTRACT. The host language decides everything: zh → pure Chinese,
 * en → pure English. No `中文 · English` hybrid strings — the old bilingual
 * convention is gone; each string exists once per locale.
 *
 * FALLBACK. When `t` is absent (unit tests, a host without the locale
 * service), `makeT` wraps the embedded `en` table — `en` is the complete set,
 * so nothing renders as a raw key.
 */

export const LOCALE_NS = 'dsh-cds-theme'

export const en = {
  'appearance.nav': 'Theme',
  'appearance.intro': 'The theme’s colour and shape: light or dark, accent, surface warmth, radius, elevation, the replicated component details, the long-paste behaviour, and the Chinese font preference.',
  'modeRow.title': 'Theme mode',
  'modeRow.desc': 'Light, Dark, or follow the system. This is the same preference as the host’s Appearance row, moved here.',
  'modeRow.light': 'Light',
  'modeRow.dark': 'Dark',
  'modeRow.system': 'System',
  'accent.title': 'Accent colour',
  'accent.desc': 'The clay orange drives the cursor, focus ring, selection and links.',
  'accent.clay': 'Clay',
  'accent.ochre': 'Ochre',
  'accent.sand': 'Sand',
  'accent.graphite': 'Graphite',
  'warmth.title': 'Surface warmth',
  'warmth.desc': '0 keeps the host greys, 100 is the CDS warm ladder — surfaces only, text and accent untouched.',
  'radius.title': 'Corner radius',
  'radius.desc': 'Scales the CDS radius table — input 20px, bubble 18px, code block 12px at 100%.',
  'elevation.title': 'Elevation',
  'elevation.desc': 'Opacity of the CDS two-layer diffuse shadow; 100% is the design-system default.',
  'refine.title': 'Component refinement',
  'refine.desc': 'Three-state input shadow, code-block surfaces, single-stroke borders. Off keeps only the token map.',
  'thinkingBlue.title': 'Thinking-label colour',
  'thinkingBlue.desc': 'Blue only for the “Deep diving…” line; the rest of the theme is unaffected.',
  'pasteFile.title': 'Long paste becomes a file reference',
  'pasteFile.desc': 'A plain-text paste of 2,000 characters or 30 lines is saved into .dsh-paste/ in this workspace and inserted as an @ reference instead of growing the composer.',
  'pasteFile.fileName': 'pasted-text-{stamp}.txt',
  'preferThemeCjk.title': 'Prefer calibrated Chinese fonts',
  'preferThemeCjk.desc': 'Use the embedded Noto Sans SC before system fallbacks in body text and code; the home greeting keeps Noto Serif SC. Off restores the previous order. Explicit font choices take priority.',
  'heroRipple.title': 'Home backdrop with click ripples',
  'heroRipple.desc': 'On a new session, faint code glyphs glow behind the greeting and the composer, and a ripple spreads from every click. The composer turns slightly see-through so the wave passes under it. Off removes the layer entirely.',
  'markdownScope.title': 'Assistant markdown: lists, emphasis, links',
  'markdownScope.desc': 'Task lists, bold, italic, strikethrough and links in the assistant’s reply get the reference’s ink, markers and underline offset. Code blocks and inline code keep their own treatment; user messages, tool cards and settings are out of scope.',
  'viewTabsPill.title': '“Chat / Trajectory” as a segmented pill',
  'viewTabsPill.desc': 'Off is the host’s own underline tabs. On packs both into one pill. Neither decides whether the tabs appear — the host shows them only while General → “Show coding view” is on, and that setting also enables the turn’s code diff and the full agent presets.',
  'composerSplit.title': 'Split composer: box above, toolbar below',
  'composerSplit.desc': 'Puts the text box in its own frame and moves permission, add, the statistics group, the model and the context ring onto a line beneath it, as the reference does. Every control stays the host’s own, with its own behaviour. The workspace line above the box appears on a new session only, because that is where the host renders it.',
  'enabled.title': 'Enable CDS theme',
  'enabled.desc': 'Off releases every token override and restores the host skin.',
  // ---- the theme's own edit / write card (diffview.js) ------------------
  //
  // The row name is the reference's sentence: the verb plus the file, never the
  // tool name ("Edited index.js", not "Edit"). The failure and stopped forms
  // exist because a row that still says "Edited" after a rejected edit is a
  // lie the host's own card also refuses to tell.
  'diff.edit.done': 'Edited {name}',
  'diff.edit.running': 'Editing {name}',
  'diff.edit.failed': 'Failed to edit {name}',
  'diff.write.done': 'Wrote {name}',
  'diff.write.running': 'Writing {name}',
  'diff.write.failed': 'Failed to write {name}',
  'diff.stopped': 'Stopped editing {name}',
  'diff.copy': 'Copy diff',
  'diff.copied': 'Copied',
  'diff.expand': '… {count} more lines',
  'diff.expandAria': 'Expand the remaining {count} diff lines',
  'diff.collapse': 'Collapse',
  'diff.empty': 'No changes were recorded for this call',
}

export const zh = {
  'appearance.nav': '主题定制',
  'appearance.intro': '主题的配色与形状：浅色或深色、强调色、表面暖度、圆角、阴影、逐项复刻的组件细节、长文本粘贴行为，以及中文字体偏好。',
  'modeRow.title': '主题模式',
  'modeRow.desc': '浅色、深色，或跟随系统。与宿主原本那一行是同一个偏好，只是搬到这里。',
  'modeRow.light': '浅色',
  'modeRow.dark': '深色',
  'modeRow.system': '跟随系统',
  'accent.title': '品牌强调色',
  'accent.desc': '陶土橙驱动光标、焦点环、选中态与链接。',
  'accent.clay': '陶土橙',
  'accent.ochre': '赭石',
  'accent.sand': '砂金',
  'accent.graphite': '石墨',
  'warmth.title': '表面暖度',
  'warmth.desc': '0 为宿主原色，100 为 CDS 暖灰阶梯；只移动表面色，文字与强调色不跟随。',
  'radius.title': '圆角比例',
  'radius.desc': 'CDS 圆角阶梯的整体缩放：输入框 20px、气泡 18px、代码块 12px 为 100%。',
  'elevation.title': '阴影强度',
  'elevation.desc': 'CDS 双层弥散阴影的不透明度，100% 为设计系统原值。',
  'refine.title': '组件细化',
  'refine.desc': '输入框三态阴影、代码块表面、单笔触边框纪律；关闭后只保留配色令牌。',
  'thinkingBlue.title': '深度思考提示用原版蓝',
  'thinkingBlue.desc': '只改「正在深度求索」这行提示的颜色，与主题其余部分无关。',
  'pasteFile.title': '长文本粘贴存为文件引用',
  'pasteFile.desc': '纯文本超过 2000 字或 30 行时，先存到工作区 .dsh-paste/ 下，再以 @ 引用插入输入框，不再撑高输入框。',
  'pasteFile.fileName': '粘贴文本-{stamp}.txt',
  'preferThemeCjk.title': '中文优先使用主题字体',
  'preferThemeCjk.desc': '正文与代码中的中文优先使用内嵌、校准字重的思源黑体，首页问候语仍用思源宋体；关闭恢复原回退顺序。手动选择的字体始终优先。',
  'heroRipple.title': '首页背景点击波纹',
  'heroRipple.desc': '新会话时，问候语与输入框背后浮出一层淡的代码字形，每次点击从光标处荡开水波。输入框会略透，让波纹从底下透出来。关闭即整层移除。',
  'markdownScope.title': '助手正文的列表、强调与链接',
  'markdownScope.desc': '助手的任务列表、粗体、斜体、删除线与链接改用参考版的墨色、项目符号与下划线间距。代码块与行内代码保持原样；用户消息、工具卡片与设置页不在范围内。',
  'viewTabsPill.title': '「对话 / 轨迹」用胶囊样式',
  'viewTabsPill.desc': '关闭是宿主原本的下划线页签，开启则两段收进一个胶囊。两者都不决定这两个页签出不出现——只有当「通用 → 显示代码工作视图」打开时宿主才画它们，而那个开关同时会打开本轮代码差异与完整 Agent 预设。',
  'composerSplit.title': '输入框分离：文本框在上，工具栏在下',
  'composerSplit.desc': '把文本框放进独立边框，权限、添加、统计、模型与上下文环移到它下方一行，与参考版一致。每个控件仍是宿主的原件，行为不变。文本框上方那行工作区只在新会话出现，因为宿主只在那里渲染它。',
  'enabled.title': '启用 CDS 主题',
  'enabled.desc': '关闭即释放全部令牌覆盖，界面回到宿主原样式。',
  // ---- 主题自绘的编辑 / 写入卡片（diffview.js）----------------------------
  'diff.edit.done': '已编辑 {name}',
  'diff.edit.running': '正在编辑 {name}',
  'diff.edit.failed': '编辑失败 {name}',
  'diff.write.done': '已写入 {name}',
  'diff.write.running': '正在写入 {name}',
  'diff.write.failed': '写入失败 {name}',
  'diff.stopped': '已停止编辑 {name}',
  'diff.copy': '复制差异',
  'diff.copied': '已复制',
  'diff.expand': '… 其余 {count} 行',
  'diff.expandAria': '展开其余 {count} 行差异',
  'diff.collapse': '收起',
  'diff.empty': '这次调用没有记录任何改动',
}

/**
 * A translator backed by `dict`, substituting `{param}` placeholders from the
 * second argument. Used as the fallback when the outlet supplies no `t`.
 */
export function makeTranslator(dict) {
  return function translate(key, params) {
    const template = dict[key] !== undefined ? dict[key] : key
    return String(template).replace(/\{(\w+)\}/g, function (match, name) {
      return params && name in params ? String(params[name]) : match
    })
  }
}

/**
 * Wrap the outlet-injected `t`. An absent `t` (tests, a host without
 * `ctx.locale`) falls back to the embedded English table so the rows stay
 * readable instead of showing raw keys.
 */
export function makeT(injected) {
  return typeof injected === 'function' ? injected : makeTranslator(en)
}
