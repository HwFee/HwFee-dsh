/**
 * dsh-context-rail host entry.
 *
 * The rail is a pure browser concern: the client bundle draws the toggle and the
 * panel, and every number comes from the host's own projection store. This entry
 * exists because a bundle patch inserts a Loader row and that row resolves the
 * package's main entry; a row whose package exports no `apply` is rejected by
 * Cordis and becomes a fiber-less zombie row, so the client bundle would never
 * join the boot graph.
 *
 * It therefore does nothing on purpose.
 */

export const name = '@hwfee/dsh-context-rail'

/**
 * No host work: the client bundle carries the whole feature.
 */
export function apply() {}
