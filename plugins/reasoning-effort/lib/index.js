/**
 * dsh-reasoning-effort host entry.
 *
 * The host owns nothing here, and that is the point. Everything this plugin
 * needs — the model catalog, the session's durable selection, and the write —
 * is already on the client side of the Remote boundary (`ctx.remote.session
 * .modelCatalog()` / `.selectModel()`), so this plugin has no route, no file
 * access and no Host service of its own. It is registered in the profile (see
 * `cordis.patch.yml`) and contributes one client bundle.
 *
 * Keeping the half EMPTY is deliberate, but an empty half is still a PLUGIN and
 * must export `apply`. That is not ceremony — omitting it silently deleted the
 * whole feature:
 *
 *   cordis `RegistryService.resolve()` accepts a function, or an object whose
 *   `apply` is a function. A module exporting only `name` matches neither, so
 *   `registry.plugin()` throws `invalid plugin, expect function or object with
 *   an "apply" method`. `Entry._init()` never reaches the line that assigns
 *   `entry.fiber`, so the entry stays fiberless — which `dsh-tool-cordis`
 *   reports as `status: "inactive"`.
 *
 *   And `@deepseek-ai/dsh-client-modules` builds the browser boot graph only
 *   from entries that HAVE a fiber:
 *
 *       if (entry.options.name !== entryName || entry.fiber === void 0 ||
 *           entry.disabled) continue
 *
 *   No fiber means this package's `client` bundle never reaches
 *   `window.__DSH_BOOT__`, so the client half never applies and the settings
 *   row never mounts. The symptom is not an error — it is an absent slider.
 */

export const name = 'dsh-reasoning-effort'

/**
 * The Host half's plugin body: intentionally empty.
 *
 * Everything this plugin needs lives on the client side of the Remote boundary,
 * so there is no route, no file access and no Host service to install. The body
 * exists because the Loader requires one (see the module comment); the client
 * bundle does the actual work once this entry owns a fiber.
 */
export function apply() {}
