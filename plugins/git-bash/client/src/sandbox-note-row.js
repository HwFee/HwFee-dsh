/**
 * The settings row: whether the shell card states that a command left the sandbox.
 *
 * WHY THIS ROW EXISTS. The sandbox sentence under a shell result is a disclosure,
 * and it is also the one line a power user sees on every single command. Someone
 * who has deliberately chosen `danger-full-access` knows what that means; being
 * told again on every call is noise. So it is a preference — DEFAULT ON, because
 * a user who upgrades must keep seeing a security notice until they turn it off.
 *
 * WHAT IT MUST NOT TOUCH. The model-facing side of the same fact — the
 * `· direct (unsandboxed)` marker inside the tool result — is emitted by the HOST
 * and is not connected to this switch at all. This store lives in the page
 * (`client/src/store.js`), the host never reads it, and hiding the line here
 * cannot make a command look sandboxed to the model. `test/tool.test.mjs` pins
 * that across both halves, and `test/sandbox-note-row.test.mjs` pins the switch.
 *
 * WHERE IT REGISTERS. The same `settings.general.item` slot this plugin already
 * owns for the shell mode, with its own id and its own `order` — one settings row
 * per setting, which is how the host composes the list. It ships its own strings
 * in this plugin's locale namespace, so it works without cds-theme.
 *
 * THE SWITCH ITSELF is a button with `role="switch"`, matching the host's own
 * control geometry (36×20, 999px radius, 2px inset, 16px thumb) so it sits on the
 * same rhythm as the shipped switches above it. The host's `Switch` component is
 * not part of the primitives table this plugin is allowed to rely on, and adding
 * a hard dependency on it would turn a missing export into a blank settings row.
 *
 * @module sandbox-note-row
 */

import { SANDBOX_NOTE_ROW_ID } from './constants.js'

/**
 * Build the row component.
 *
 * @param {object} deps
 * @param {object} deps.React the host React
 * @returns {Function} the row component
 */
export function createSandboxNoteRow({ React }) {
  const h = React.createElement

  /**
   * @param {object} props
   * @param {{ getSnapshot: Function, subscribe: Function, set: Function }} props.noteStore
   * @param {Function} props.t locale lookup
   * @returns {object} the row
   */
  function SandboxNoteRow(props) {
    const t = typeof props.t === 'function' ? props.t : function untranslated(key) { return key }
    // THE READING IS `useSyncExternalStore`, not a local `useState`: the card's
    // note line reads the SAME store, so flipping this switch must repaint both
    // without a reload. A local state copy would leave the card stale until the
    // next navigation.
    const shown = React.useSyncExternalStore(props.noteStore.subscribe, props.noteStore.getSnapshot)
    return h('div', { className: 'dsh-git-bash-row', id: SANDBOX_NOTE_ROW_ID },
      h('div', { className: 'dsh-git-bash-main' },
        h('div', { className: 'dsh-git-bash-title' }, t('sandboxNote.title')),
        h('div', { className: 'dsh-git-bash-hint' }, t('sandboxNote.hint'))),
      h('button', {
        type: 'button',
        className: 'dsh-git-bash-toggle',
        role: 'switch',
        'aria-checked': shown === true,
        'aria-label': t('sandboxNote.title'),
        onClick: () => props.noteStore.set(shown !== true),
      }, h('span', { className: 'dsh-git-bash-toggle-thumb' })))
  }

  return SandboxNoteRow
}
