import {
  FONT_ROLES, UI_FAMILY_VARIABLE, CODE_SIZE_VARIABLE,
  normalizeFontFamily, firstFamily, clampInlineCodeSize,
} from './constants.js'

/**
 * Write (or clear) the inline-code size on the host's own code-size axis.
 *
 * WHY THE SIZE VARIABLE AND NEVER THE DELTA. `--dsh-code-font-size` is the
 * host's input (`FONT_SIZE_SPECS.code.variable` in ui-theme's client); the theme
 * derives `--dsh-code-font-delta: calc(<this> - 11px)` from it, and cds-theme
 * lets exactly ONE rung consume that delta — the inline chip (`code(12)` /
 * `code(14)` in cds-theme's `typography.js`). Fenced blocks, tool cards and the
 * terminal are pinned at fixed sizes on purpose. Writing the delta here would
 * move every rung that reads it AND be overwritten by the theme on the next
 * `theme/change`, i.e. it would both overreach and drift.
 *
 * 0 REMOVES THE PROPERTY instead of writing the host's own 11: "unset" has to
 * mean "the host decides", and its presenter writes this variable on every
 * snapshot anyway.
 * 只写宿主的代码字号轴（主题据此派生 delta，且只有行内代码档消费它）；
 * 绝不直接写 `--dsh-code-font-delta`。0 表示未设置，移除属性交还宿主。
 *
 * Standalone rather than a method on the bridge because TWO callers need it —
 * the settings commit (`index.js`) and the post-`theme/change` re-assert
 * (`lifecycle.js`) — and neither of them needs a theme service to do it.
 * Returns false when there is no usable document.
 */
export function writeInlineCodeSize(px) {
  const body = typeof document === 'undefined' ? undefined : document.body
  if (!body || !body.style || typeof body.style.setProperty !== 'function') return false
  try {
    const size = clampInlineCodeSize(px)
    if (size > 0) body.style.setProperty(CODE_SIZE_VARIABLE, size + 'px')
    else body.style.removeProperty(CODE_SIZE_VARIABLE)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Bridge to the host theme service (`ctx.get('theme')`, provided by
 * `dsh-client-ui-theme`).
 *
 * The host owns the font pipeline: `setFontFamily(role, value)` /
 * `setFontSize(role, px)` normalize, persist through the settings scope, and
 * emit `theme/change` with the new snapshot. The bridge mirrors that snapshot
 * so the panel rows can subscribe to it, and delegates every family write to
 * the service — the plugin's pickers and the host's own inputs then share one
 * state instead of diverging.
 *
 * When the service is absent (a partial host, a unit test without a ctx), the
 * bridge falls back to a local snapshot fed from the plugin's settings store
 * and `setFamily` returns false, so callers keep the local write.
 *
 * 桥接宿主 theme 服务（`ctx.get('theme')`，由 `dsh-client-ui-theme` 提供）。
 * 宿主拥有字体管线：`setFontFamily`/`setFontSize` 规范化后经 settings scope
 * 持久化并发出 `theme/change`；本模块镜像快照供面板订阅，并把所有族名写入
 * 委托给服务，使插件下拉与宿主自带输入框共享同一份状态而非各自分叉。
 * 服务缺失时（部分宿主、无 ctx 的单元测试）回退到本地快照，`setFamily`
 * 返回 false，由调用方保留本地写入。
 */
export function createThemeBridge(theme, settings) {
  const listeners = []
  // `svc` is mutable: the bridge may be built before the host's theme service
  // resolves (`ctx.get('theme')` inside apply), so the panel binds the bridge
  // object once and `attach` swaps the live service in. `live` reads svc.
  // svc 可变：桥可能先于 theme 服务创建，attach 在其到达后换上活服务。
  let svc = theme

  // The snapshot is seeded from the plugin's own stored families so the panel
  // shows the same values before the service answers, and keeps a coherent
  // value when it never does.
  // 快照先用插件已存族名做种子，使面板在服务应答前（或始终不应答时）也显示
  // 一致值。
  function seed() {
    const state = settings ? settings.getState() : {}
    return {
      text: state.uiFamily || '',
      code: state.codeFamily || '',
      terminal: state.terminalFamily || '',
    }
  }

  let snapshot = { fontFamilies: seed(), fontSizes: null }

  function emit() {
    for (let i = 0; i < listeners.length; i += 1) {
      try { listeners[i](snapshot) } catch (error) { /* a dead panel must not stall the rest */ }
    }
  }

  /**
   * Take a host `ThemeSnapshot` (`{ fontSizes, fontFamilies }`) or null to
   * restore the seeded fallback.
   * 接收宿主 `ThemeSnapshot`；传 null 回到种子回退值。
   */
  function adopt(host) {
    if (host && host.fontFamilies) {
      snapshot = {
        fontFamilies: {
          text: firstFamily(host.fontFamilies.text),
          code: firstFamily(host.fontFamilies.code),
          terminal: firstFamily(host.fontFamilies.terminal),
        },
        fontSizes: host.fontSizes || null,
      }
    } else {
      snapshot = { fontFamilies: seed(), fontSizes: null }
    }
    emit()
  }

  if (svc && typeof svc.getTheme === 'function') {
    try { adopt(svc.getTheme()) } catch (error) { /* adopt lazily through sync() instead */ }
  }

  return {
    /** True when a live theme service backs this bridge. 是否有活的 theme 服务。 */
    get live() { return !!(svc && typeof svc.setFontFamily === 'function') },
    get snapshot() { return snapshot },
    /**
     * Attach (or replace) the theme service after construction. Re-seeds the
     * snapshot from the service; pass null to fall back to the stored families.
     * 构造后挂接/替换 theme 服务并重读快照；传 null 回到本地种子值。
     */
    attach(next) {
      svc = next
      if (svc && typeof svc.getTheme === 'function') {
        try { adopt(svc.getTheme()) } catch (error) { /* keep the seeded snapshot */ }
      } else {
        adopt(null)
      }
    },
    subscribe(listener) {
      listeners.push(listener)
      return function unsubscribe() {
        const i = listeners.indexOf(listener)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
    listenerCount() { return listeners.length },
    /** Re-read `theme.getTheme()`; call once a `theme/change` is wired. 重读快照。 */
    sync() {
      if (svc && typeof svc.getTheme === 'function') {
        try { adopt(svc.getTheme()) } catch (error) { /* keep the last good snapshot */ }
      }
    },
    adopt,
    /**
     * Delegate a family write to the host pipeline. `name` may be a single
     * family or a CSS list; it is normalized the way the host normalizes.
     * Returns false when the service is absent — the caller keeps its local
     * write so the row still works on a partial host.
     * 把族名写入委托给宿主管线；服务缺失时返回 false，由调用方保留本地写入。
     */
    setFamily(role, name) {
      // THE UI ROLE IS OURS, not the host's. `FONT_ROLES` is exactly
      // `['text', 'code', 'terminal']`, so `setFontFamily('ui', …)` would throw
      // `invalid font role` inside the service. The variable it backs is read by
      // cds-theme's `--dsw-font-family-ui`, whose fallback is the text role —
      // which is what makes "follows the body by default" true. Writing the
      // custom property directly is the whole implementation.
      if (role === 'ui') {
        try {
          const value = normalizeFontFamily(name)
          const body = typeof document === 'undefined' ? undefined : document.body
          if (body === undefined) return false
          if (value === '') body.style.removeProperty(UI_FAMILY_VARIABLE)
          else body.style.setProperty(UI_FAMILY_VARIABLE, value)
          return true
        } catch (error) {
          return false
        }
      }
      if (!this.live) return false
      try {
        svc.setFontFamily(role, normalizeFontFamily(name))
        return true
      } catch (error) {
        return false
      }
    },
  }
}

export { FONT_ROLES }
