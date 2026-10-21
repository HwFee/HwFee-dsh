import { installPanelCss, removePanelCss } from './panel.js'
import { createThemeBridge } from './bridge.js'
import { LOCALE_NS, en, zh } from './locales.js'
import { uiScaleFactor } from './constants.js'

// ------------------------------------------------------------ lifecycle

export function createLifecycle({ settings, typography, chrome, uiScaler, catalogue, panel, merger, locale, React, primitives, onTheme }) {
  let applied = false

  /**
   * Rebuild once more shortly after mount.
   *
   * The steps are read back from the document, and at mount time the host's
   * own stylesheets may not all be applied yet — a step read too early is
   * skipped, leaving that part of the scale unshifted. One deferred pass
   * picks up whatever landed afterwards.
   */
  function scheduleRebuild() {
    if (typeof window === 'undefined') return function () {}
    let stopped = false
    const run = function () {
      if (stopped) return
      typography.apply()
      if (chrome) chrome.apply()
      if (uiScaler) uiScaler.refresh()
    }
    const cancel = []
    if (typeof window.requestAnimationFrame === 'function') {
      const id = window.requestAnimationFrame(run)
      if (typeof window.cancelAnimationFrame === 'function') {
        cancel.push(function () { window.cancelAnimationFrame(id) })
      }
    } else {
      const id = setTimeout(run, 16)
      cancel.push(function () { clearTimeout(id) })
    }
    const late = setTimeout(run, 300)
    cancel.push(function () { clearTimeout(late) })
    return function () {
      stopped = true
      for (const c of cancel) c()
    }
  }

  function apply(ctx) {
    if (applied || !ctx) return
    applied = true

    ctx.effect(function () {
      typography.activate()
      catalogue.activate()
      if (chrome) chrome.activate()
      if (uiScaler) {
        uiScaler.activate()
        uiScaler.setScale(uiScaleFactor(settings.getState()))
      }
      return function () {
        applied = false
        catalogue.dispose()
        if (uiScaler) uiScaler.teardown()
        if (chrome) chrome.teardown()
        typography.teardown()
        removePanelCss()
      }
    }, 'dsh-system-fonts: activation state')

    // ---- panel copy ----
    //
    // The two dictionaries ride the host locale service under this plugin's
    // namespace — the same mechanism the host's own bundles use. It is the
    // only string source: no label, description, menu entry, placeholder or
    // aria-label is inlined in either language, so a zh UI is pure Chinese and
    // an en UI pure English. The slot registration below carries
    // `locale: LOCALE_NS`, which is what injects the live `t` prop; `bind` here
    // is the fallback for a row rendered outside an outlet (a test, an HMR
    // re-mount) so already-mounted rows follow the host language too.
    // 面板文案全部来自 locale 字典，随宿主语言切换。
    ctx.effect(function () {
      const service = ctx.locale
      if (!service || typeof service.register !== 'function') return undefined
      const off = service.register(LOCALE_NS, { en: en, zh: zh })
      if (locale && typeof service.bind === 'function') {
        try { locale.attach(service.bind(LOCALE_NS)) } catch (error) { /* the prop path still works */ }
      }
      return typeof off === 'function' ? off : undefined
    }, 'dsh-system-fonts: locale dictionaries')

    // Applied here so the fonts are in force without the settings panel ever
    // being opened; `apply` is the plugin body and runs at mount.
    ctx.effect(function () {
      installPanelCss()
      typography.apply()
      if (chrome) chrome.apply()
    }, 'dsh-system-fonts: font styles')

    ctx.effect(scheduleRebuild, 'dsh-system-fonts: deferred rebuild')

    // ---- theme bridge ----
    //
    // The host theme service owns the family/size pipeline (`setFontFamily`,
    // `theme/change`). It is optional and may arrive after us, so the bridge is
    // resolved lazily inside an effect rather than at module scope. The panel
    // keeps a static reference to whatever bridge we hand it via `onTheme`.
    // 宿主 theme 服务拥有族/字号管线；可选且可能晚到，故在 effect 内惰性
    // 解析并经 `onTheme` 交给面板，而非在模块顶层取。
    ctx.effect(function () {
      // `ctx.get` exists only on the real ctx; on a test harness that models
      // inject-strictness, merely reading the property throws. Resolve it
      // through a guarded call so a missing/absent service stays a no-op.
      // 真 ctx 才有 `ctx.get`；测试代理读取该属性即抛。用受守卫的调用解析，
      // 服务缺席时保持空操作。
      let theme = null
      try {
        theme = typeof ctx.get === 'function' ? ctx.get('theme') : null
        if (!theme || typeof theme.getTheme !== 'function') theme = null
      } catch (error) {
        theme = null
      }
      if (theme === null) return undefined
      // Hand the live service to index.js, which attaches it to the bridge the
      // panel already holds (`bridge.attach`). 把活服务交给 index.js 由它 attach。
      if (typeof onTheme === 'function') onTheme(theme)
      const bridge = createThemeBridge(theme, settings)

      // Reconcile the host's families with the plugin's stored ones so a family
      // typed in the host's own row also updates the plugin's dropdown, and
      // re-apply so the stylesheet is rebuilt on the same revision.
      // 把宿主与本地族名对齐，并按同一版本号重建样式表。
      //
      // WHEN THE HOST HAS A VALUE IT WINS. That is the single-source-of-truth
      // rule the pickers need, and the official inputs are hidden behind them,
      // so a stale local copy would silently disagree with the host.
      //
      // WHEN THE HOST HAS NO VALUE (`''`), THAT IS NOT AN INSTRUCTION TO FORGET.
      // "" means "no preference recorded", and this plugin's store is the only
      // place a choice survives — the host's own family fields are `volatile()`,
      // so a restart hands us an empty snapshot. Blindly mirroring it erased the
      // user's choice for all three roles (the reported "terminal font reverted"
      // bug: pick a family, reopen, it is back to the default). So an empty host
      // value for a role where we DO have a choice re-asserts that choice
      // through the host pipeline instead of dropping it — the host then renders
      // it again and the two sides converge on the user's own value.
      // 宿主有值则以宿主为准；宿主为空表示"未记录偏好"，不能据此清空用户的选择。
      // 故当宿主某角色为空而本地有值时，把本地值重新写回宿主管线，双方收敛到
      // 用户自己的选择（这就是"终端字体重开后又变回默认"的根因）。
      const reasserted = new Set()
      function reassert(role, name) {
        if (reasserted.has(role)) return false
        reasserted.add(role)
        try { return bridge.setFamily(role, name) } catch (error) { return false }
      }

      function reconcileFamilies(families) {
        const state = settings.getState()
        const pairs = [
          ['text', 'uiFamily', state.uiFamily],
          ['code', 'codeFamily', state.codeFamily],
          ['terminal', 'terminalFamily', state.terminalFamily],
        ]
        const patch = {}
        let changed = false
        for (const [role, key, local] of pairs) {
          const host = families[role]
          if (host === local) continue
          if (host !== '') {
            // The host knows a family: adopt it, it is the shared truth.
            patch[key] = host
            changed = true
            continue
          }
          // Host is empty. Keep the stored choice and push it back so the host
          // renders it again; an empty local value means nothing to restore.
          if (local === '') continue
          reassert(role, local)
        }
        if (changed) settings.setState(patch)
      }
      reconcileFamilies(bridge.snapshot.fontFamilies)

      let off = null
      try {
        off = typeof ctx.on === 'function' ? ctx.on('theme/change', function (snapshot) {
          bridge.adopt(snapshot)
          reconcileFamilies(bridge.snapshot.fontFamilies)
          typography.apply()
          if (chrome) chrome.apply()
        }) : null
      } catch (error) { off = null }
      return function () { if (typeof off === 'function') off() }
    }, 'dsh-system-fonts: theme bridge')

    // ---- the rows, merged into the host's font group ----
    //
    // `settings.general.item` is a flat sibling list: a slot can only inject
    // rows NEXT TO the host's FontSettingsGroup, never inside it. So the rows
    // register here at orders 12–17 (right behind the host's group) and
    // `merge.js` reparents them INSIDE the group's collapsible font region —
    // each picker after the official family row it replaces (the UI picker
    // after them), sliders last, the official inputs covered (hidden, not
    // removed). Collapsed, the host does not render that region: the rows are
    // then seated back in the slot outlet and hidden, so they expand/collapse
    // with the group.
    //
    // Every family write still goes through `theme.setFontFamily(role, value)`
    // (see `panel.js` / `bridge.js`), so the host's persisted state and our
    // pickers cannot diverge even though the host inputs are off screen.
    // 槽位只能注入平铺兄弟节点，故挂载后由 merge.js 把行搬进宿主字号组的折叠区、
    // 盖住官方族名输入框；折叠时行归位到槽位并隐藏。族名写入仍走宿主
    // setFontFamily 单一管线。
    ctx.effect(function () {
      if (!merger) return undefined
      // The first pass is scheduled by each row's ref callback once the rows
      // mount; this effect only owns the teardown, which restores the host DOM
      // exactly as it was found (rows back home, covered rows unhidden).
      return function () {
        try { merger.restore() } catch (error) { /* dispose must not throw */ }
      }
    }, 'dsh-system-fonts: host font group merge')

    const slots = ctx.slots
    const uiReady = React && primitives
      && primitives.Menu && primitives.MenuItemButton && primitives.Input
    if (!uiReady || !slots || typeof slots.inject !== 'function') {
      console.warn('dsh-system-fonts: slots/react/primitives unavailable; font rows not registered')
    } else {
      slots.inject('settings.general.item', function () {
        return panel.slots.map(function (slot) {
          return slots.register({
            name: 'settings.general.item',
            id: slot.id,
            order: slot.order,
            // Injects `t(key, params)` as a component prop, backed by the
            // dictionaries registered above, and re-renders the rows when the
            // host language changes. 注入 t 并随语言切换重渲染。
            locale: LOCALE_NS,
          }, slot.component)
        })
      })
    }
  }

  return apply
}
