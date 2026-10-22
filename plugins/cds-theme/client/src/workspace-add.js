/**
 * "Add workspace" above the composer — the host's own picker and create call.
 *
 * THE CHAIN, from the installed client bundles:
 *
 *   const picker     = ctx.get('remote').directoryPicker   // native directory dialog
 *   const workspaces = ctx.get('workspaces')               // the workspace service
 *   const path       = await picker.pick()                 // null = cancelled; else an absolute path
 *   const created    = await workspaces.create({ path })   // { workspaceId, path, title, … }
 *
 * Evidence: `host-workspace-client.js` reaches `this.directoryPicker.pick()` and
 * `this.workspaces.create(...)` in the same service object (the UiWorkspace
 * facade), and the workspace-controller's remote client declares
 * `directoryPicker.pick` as `null | string` and `workspaces.create({path})`.
 *
 * So the button below runs the host's real flow: the OS dialog appears, the
 * folder is adopted, and the result lands in the sidebar by the host's own
 * bookkeeping — the same path the sidebar's own "Add workspace" takes.
 *
 * WHAT IT DOES NOT DO:
 *   - no synthetic keypress, no click on a hidden sidebar control;
 *   - no React node is cloned or moved;
 *   - it never switches a running conversation to the new workspace. Adopting a
 *     workspace for the CURRENT session is the host's `onPick` → `selectWorkspace`
 *     path, which lives in the conversation plugin and is not reachable from a
 *     theme. On a blank session the host already offers that through its own
 *     chip; here the new workspace simply appears in the sidebar.
 *
 * WHEN THERE IS NO BUTTON: no `remote.directoryPicker`, no `workspaces`, or a
 * rejected `pick()` means nothing is rendered (or the click reports the reason)
 * rather than a control that looks live and does nothing. `docs/` records the
 * substitute entries — the sidebar's 「添加工作区」 and Ctrl+O — for that case.
 */

/** The services this module needs, by their registered names. */
export const PICKER_SERVICE = 'remote'
export const WORKSPACES_SERVICE = 'workspaces'

/**
 * Resolve the two services, or null when either is missing.
 *
 * `ctx.get` is the optional read: a profile without the workspace plugin, or a
 * host without the remote bridge, yields null and no button is drawn.
 *
 * @param ctx a plugin context
 * @returns `{ pick, create }` or null
 */
export function workspaceServices(ctx) {
  if (!ctx || typeof ctx.get !== 'function') return null
  const remote = ctx.get(PICKER_SERVICE)
  const picker = remote === null || remote === undefined ? null : remote.directoryPicker
  if (!picker || typeof picker.pick !== 'function') return null
  const workspaces = ctx.get(WORKSPACES_SERVICE)
  if (!workspaces || typeof workspaces.create !== 'function') return null
  return {
    pick: function () { return picker.pick() },
    create: function (path) { return workspaces.create({ path: path }) },
  }
}

/**
 * Ask for a directory and adopt it as a workspace.
 *
 * Cancelling is a normal outcome: `pick()` resolves `null` and nothing is
 * created. A failure from either call is returned, never swallowed, so the
 * caller can put the host's own reason in front of the user.
 *
 * @param services the value `workspaceServices` returned
 * @returns a promise of `{ status: 'created' | 'cancelled' | 'failed', … }`
 */
export async function requestAddWorkspace(services) {
  if (services === null) return { status: 'failed', reason: 'unavailable' }
  let path = null
  try {
    path = await services.pick()
  } catch (error) {
    return { status: 'failed', reason: error && error.message ? error.message : 'pick-failed' }
  }
  if (path === null || path === undefined || path === '') return { status: 'cancelled' }
  try {
    const created = await services.create(path)
    return { status: 'created', workspace: created }
  } catch (error) {
    return { status: 'failed', reason: error && error.message ? error.message : 'create-failed' }
  }
}
