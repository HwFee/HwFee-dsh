/**
 * The settings row: which shell runs commands.
 *
 * ONE LINE, as asked: a title, a one-line hint, and a menu stating the current
 * mode. The resolved executable path is deliberately NOT rendered — it repeats
 * what the choice implies and reads like a diagnostic. The TOOL RESULT names the
 * executable on every call, which is where that fact matters.
 *
 * The single exception is FAILURE: if the chosen shell could not be found, a
 * sentence appears naming which configuration fact is wrong, because then it is
 * the whole point of the row rather than extra detail.
 *
 * The menu follows the host's own three-value rows (see
 * `plugins/genui/client/src/settings-row.js` for the same control in the same
 * slot): a trigger button stating the current value, and a `Menu` whose `anchor`
 * is rendered BY THE MENU, not passed in as an already-rendered node.
 *
 * @module settings-row
 */

import { MODES, MODE_LABELS } from '../../lib/mode.js'
import { SETTINGS_ROW_ID } from './constants.js'
import { describeShell } from './store.js'

/**
 * Build the row component.
 *
 * @param {object} deps
 * @param {object} deps.React the host React
 * @param {object | null} deps.primitives the host's ui-primitives, or null
 * @returns {Function} the row component
 */
export function createSettingsRow({ React, primitives }) {
  const h = React.createElement
  const Menu = primitives === null ? null : primitives.Menu
  const MenuItemButton = primitives === null ? null : primitives.MenuItemButton
  const IconChevron = primitives === null ? null : primitives.IconChevronDownOutlineRegular
  const IconCheck = primitives === null ? null : primitives.IconCheckOutlineRegular

  /**
   * @param {object} props
   * @param {{ getSnapshot: Function, subscribe: Function }} props.modeStore
   * @param {{ getSnapshot: Function, subscribe: Function }} props.shellInfoStore
   * @param {(mode: string) => void} props.setMode
   * @param {Function} props.t locale lookup
   */
  function ShellRow(props) {
    const t = props.t
    const mode = React.useSyncExternalStore(props.modeStore.subscribe, props.modeStore.getSnapshot)
    // THE RESOLUTION FOR THE CHOSEN MODE, not the one the page booted with.
    // Reading a single static record made the row contradict itself: the trigger
    // said "Windows PowerShell" while the line under it still named the Git Bash
    // path from boot. The store carries all three, so the line follows the menu.
    const info = props.shellInfoStore.forMode(mode)
    const [open, setOpen] = React.useState(false)

    const title = h('div', { className: 'dsh-git-bash-title' }, t('shell.title'))
    const hint = h('div', { className: 'dsh-git-bash-hint' }, t('shell.hint'))
    // NO PATH LINE. One line, as asked.
    //
    // A resolved executable path in a settings row is noise: it repeats what the
    // choice already implies and reads like a diagnostic. The row shows only the
    // mode; the TOOL RESULT names the executable per call, which is where that
    // fact actually matters.
    //
    // The ONE case that still gets a second line is failure: if the chosen shell
    // could not be found, the sentence saying which configuration fact is wrong
    // is the entire point of the row.
    const failure = info.path === null
      ? h('div', { className: 'dsh-git-bash-status dsh-git-bash-missing' }, describeShell(info, t))
      : null

    const label = t('shell.mode')
    const choose = (value) => {
      props.setMode(value)
      setOpen(false)
    }

    // Degraded path: no primitives means no popup, so a native select still
    // lets the user change the mode.
    if (Menu === null || MenuItemButton === null) {
      return h('div', { className: 'dsh-git-bash-row', id: SETTINGS_ROW_ID },
        h('div', { className: 'dsh-git-bash-main' }, title, hint, failure),
        h('select', {
          className: 'dsh-git-bash-select',
          'aria-label': label,
          value: mode,
          onChange: (event) => props.setMode(event.target.value),
        }, MODES.map((value) => h('option', { key: value, value }, t(MODE_LABELS[value])))))
    }

    const trigger = (isOpen) => h('button', {
      type: 'button',
      className: 'dsh-git-bash-trigger',
      'aria-label': label,
      'aria-haspopup': 'menu',
      'aria-expanded': isOpen,
      onClick: () => setOpen(!isOpen),
    },
    h('span', { className: 'dsh-git-bash-value' }, t(MODE_LABELS[mode])),
    IconChevron === null ? '▾' : h(IconChevron, { size: 12 }))

    const items = MODES.map((value) => h(MenuItemButton, {
      key: value,
      onSelect: () => choose(value),
    }, h('span', { className: 'dsh-git-bash-item' },
      h('span', null, t(MODE_LABELS[value])),
      value === mode && IconCheck !== null
        ? h('span', { className: 'dsh-git-bash-check' }, h(IconCheck, { size: 14 }))
        : null)))

    return h('div', { className: 'dsh-git-bash-row', id: SETTINGS_ROW_ID },
      h('div', { className: 'dsh-git-bash-main' }, title, hint, failure),
      h(Menu, {
        open,
        anchor: trigger(open),
        items: [],
        onSelect: () => setOpen(false),
        onClose: () => setOpen(false),
        align: 'end',
        portal: true,
        autoFocus: false,
      }, ...items))
  }

  return ShellRow
}
