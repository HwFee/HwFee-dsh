/**
 * The package's own name — and therefore the only id this client half may
 * register under.
 *
 * The host composes one client-module graph row per package, keyed by the
 * package name; a bundle that registers anything else never satisfies its own
 * row, and web boot dies with `client-modules: duplicate factory registration`.
 * `tools/build-client.mjs` reads the name from package.json, and
 * `test/manifest.test.mjs` pins the shipped artifact.
 */
export const PLUGIN_ID = '@hwfee/dsh-git-bash'

/** Locale namespace for this plugin's strings. */
export const LOCALE_NS = 'dsh-git-bash'

/** The settings row id. */
export const SETTINGS_ROW_ID = PLUGIN_ID + '-shell'

/**
 * The second settings row's id: the sandbox-note switch.
 *
 * Its own id, not a suffix on {@link SETTINGS_ROW_ID}: the host keys slot entries
 * by id, and two rows sharing one would collide.
 */
export const SANDBOX_NOTE_ROW_ID = PLUGIN_ID + '-sandbox-note'
