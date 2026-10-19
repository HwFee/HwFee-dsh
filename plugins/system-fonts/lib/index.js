/**
 * dsh-system-fonts host entry.
 *
 * The only thing the host owns is the font enumeration: reading the Windows
 * registry and the GDI font collection is a Node-side job the browser cannot
 * do (DSH never enables `queryLocalFonts`, and the permission handler that
 * would need lives in the Electron main process, out of a plugin's reach).
 *
 * The catalogue is served over one same-origin route (see font-route.js);
 * everything else in this plugin — the settings panel, the CSS, the
 * persistence — lives in the client bundle.
 */

import { createFontRoute, FONTS_PATH } from './font-route.js'

export { FONTS_PATH }

export const name = 'dsh-system-fonts'

/**
 * Mount the catalogue route once the profile composes a web server.
 *
 * `ctx.inject` waits for the service, so a composition without a web server
 * (a headless run) simply never mounts the route — the client then offers a
 * manual family input instead of an empty picker.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (hostCtx) => {
    const webServer = hostCtx.webServer
    if (webServer === undefined || typeof webServer.register !== 'function') {
      console.warn('dsh-system-fonts: the webServer service exposes no register(); the font list will be unavailable')
      return
    }
    // `getOrigin()` throws before the listener binds; the route only answers
    // after that, so the fence reads it lazily per request and degrades to the
    // loopback-only rule if it ever does throw.
    const origin = () => webServer.getOrigin()
    hostCtx.effect(
      () => webServer.register(createFontRoute(undefined, { origin })),
      'dsh-system-fonts: font catalogue route',
    )
  })
}
