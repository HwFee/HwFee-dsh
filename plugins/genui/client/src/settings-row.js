/**
 * The settings row for card title placement.
 *
 * Sits in the host's 通用设置 / General section via `settings.general.item`,
 * beside the plugin's other preferences. It edits the same store the cards read,
 * so a change is visible in the transcript immediately — no reload, and no
 * "applies to the next card only" behaviour.
 *
 * WHY A MENU AND NOT A SWITCH. The preference has three values, and a switch
 * would force one of them to be the off state. A menu states all three and shows
 * which one is active, which is also how the host's own multi-value rows behave.
 *
 * The row degrades: without the host primitives it renders a plain `<select>`.
 * A settings page that throws would take the whole section down with it.
 *
 * @module settings-row
 */

import { PLACEMENTS, PLACEMENT_LABELS } from './settings.js'

/**
 * Build the row component for one React instance and primitive table.
 *
 * @param {object} deps
 * @param {object} deps.React the host React
 * @param {object | null} deps.primitives the host's `ui-primitives` module, or null
 * @returns {Function} the row component registered into `settings.general.item`
 */
export function createSettingsRow({ React, primitives }) {
  const h = React.createElement
  const Menu = primitives === null ? null : primitives.Menu
  const MenuItemButton = primitives === null ? null : primitives.MenuItemButton
  const IconChevron = primitives === null ? null : primitives.IconChevronDownOutlineRegular
  const IconCheck = primitives === null ? null : primitives.IconCheckOutlineRegular

  /**
   * @param {object} props
   * @param {(selector: (value: string) => unknown) => unknown} props.useTitlePlacement
   *        the hook the slot builds from the store
   * @param {(value: string) => void} props.setTitlePlacement the writer
   * @param {Function} props.t locale lookup
   */
  function TitlePlacementRow(props) {
    const t = props.t
    const current = props.useTitlePlacement((value) => value)
    const [open, setOpen] = React.useState(false)

    const label = t('setting.titlePlacement')
    const choose = (value) => {
      props.setTitlePlacement(value)
      setOpen(false)
    }

    const title = h('div', { className: 'dsh-genui-setting-title' }, label)
    const hint = h('div', { className: 'dsh-genui-setting-hint' }, t('setting.titlePlacementHint'))

    // The trigger states the CURRENT value, so the row is readable without
    // opening it — the same shape the host's font-family row uses.
    //
    // `anchor` IS RENDERED BY `Menu`, not passed as a DOM reference: the host's
    // own call sites give it an ELEMENT (`anchor: jsx("button", …)`). Passing a
    // node we had already rendered made it appear twice — once by us, once by
    // the menu — which is what a duplicated settings row looked like on screen.
    const trigger = (isOpen) => h('button', {
      type: 'button',
      className: 'dsh-genui-setting-trigger',
      'aria-label': label,
      'aria-haspopup': 'menu',
      'aria-expanded': isOpen,
      onClick: () => setOpen(!isOpen),
    },
    h('span', { className: 'dsh-genui-setting-value' }, t(PLACEMENT_LABELS[current])),
    IconChevron === null ? '▾' : h(IconChevron, { size: 12 }))

    // Degraded path: no primitives means no popup, so a native select still lets
    // the user change the value.
    if (Menu === null || MenuItemButton === null) {
      return h('div', { className: 'dsh-genui-setting-row' },
        h('div', null, title, hint),
        h('select', {
          className: 'dsh-genui-setting-select',
          'aria-label': label,
          value: current,
          onChange: (event) => props.setTitlePlacement(event.target.value),
        }, PLACEMENTS.map((value) => h('option', { key: value, value }, t(PLACEMENT_LABELS[value])))))
    }

    const items = PLACEMENTS.map((value) => h(MenuItemButton, {
      key: value,
      onSelect: () => choose(value),
    }, h('span', { className: 'dsh-genui-setting-item' },
      h('span', null, t(PLACEMENT_LABELS[value])),
      value === current && IconCheck !== null
        ? h('span', { className: 'dsh-genui-setting-check' }, h(IconCheck, { size: 14 }))
        : null)))

    return h('div', { className: 'dsh-genui-setting-row' },
      h('div', null, title, hint),
      h(Menu, {
        open,
        // A FACTORY, not the element itself: the menu renders the anchor once,
        // and it needs the current `open` to set `aria-expanded` correctly.
        anchor: trigger(open),
        items: [],
        onSelect: () => setOpen(false),
        onClose: () => setOpen(false),
        align: 'end',
        portal: true,
        autoFocus: false,
      }, ...items))
  }

  return TitlePlacementRow
}
