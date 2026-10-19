/**
 * Plugin identity and the one storage key.
 *
 * Nothing here is a "level". The level list is never a constant: it comes from
 * the live catalog (`reasoning.efforts[]` of the currently selected model), so a
 * provider that advertises two levels gets two stops and a provider that
 * advertises none gets no row at all.
 */

/** The package name; also the Cordis plugin name and the locale namespace. */
export const PLUGIN_ID = 'dsh-reasoning-effort'

/** The settings row's slot id and its position among the host's General rows. */
export const SETTINGS_ROW_ID = 'dsh-reasoning-effort'
export const SETTINGS_ROW_ORDER = 28

/** The `<style>` element the row's chrome lives in. */
export const PANEL_STYLE_ID = PLUGIN_ID + '/panel'

/**
 * The reference component's copy source, copied verbatim from
 * `.reference/open-claude-ui/code-examples/ModelSelectorEffort.tsx`
 * (`EFFORT_META`). It is a LOOKUP TABLE keyed by level id — never the stop
 * list. An adapter that advertises `minimal`, `off`, or a custom key falls
 * through to the catalog's own name and gets no description, because inventing
 * a semantic the provider never stated is worse than showing only what it did.
 */
export const LEVEL_META_IDS = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * The only id whose description carries a warning in the reference, and the
 * only place the reference's copy is a measurable claim rather than flavour.
 * Keyed on the id, displayed only while that stop is the selected one.
 */
export const WARNING_LEVEL_ID = 'max'

/** Canonical escalation order, used ONLY to sort an unsorted catalog. */
export const LEVEL_ORDER = LEVEL_META_IDS
