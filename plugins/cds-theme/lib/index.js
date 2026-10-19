/**
 * dsh-cds-theme Host half.
 *
 * The theme itself is a pure browser concern: every token and rule it owns is
 * applied by the Client half. This Host entry exists because a bundle patch
 * inserts a Loader row, and that row resolves the package's main entry.
 *
 * ONE SEAM, owned by the Host: a `webserver/index-inject` global carrying the
 * absolute `file://` fonts base, computed here from `import.meta.url` so the
 * committed client artifact carries no path.
 *
 * AND ONE ROUTE, also owned by the Host: the long-paste store
 * (`paste-route.js`). A long paste must become a real file in the Session
 * workspace before the composer can render it as an `@path` reference chip,
 * and only the Host can write files — the browser cannot. The route lives in
 * its own module, with its own fence and its own tests; this entry calls its
 * installer and nothing else.
 *
 * NO FONT ROUTE, AND THAT IS DELIBERATE. This plugin used to register six
 * `webServer` routes serving `/dsh-cds-theme/fonts/<file>`. They are gone
 * because **the branch that would use them cannot be built**:
 *
 *   - `client/src/font-assets.js` imports the six woff2 binaries, and
 *     `tools/build-client.mjs` sets `loader: { '.woff2': 'dataurl' }`, so every
 *     `@font-face` `src` in the shipped artifact is an inlined `data:` URL.
 *     Verified against the built bundle: six `data:font/woff2` URLs and zero
 *     route URLs in the very CSS the app injects.
 *   - `fontSourcesFor()` only falls back to the route when a face is NOT in the
 *     inline table. That happens only in a plain Node ESM run (the unit tests),
 *     where `.woff2` cannot be imported — and a Node run serves no HTTP fonts.
 *   - A build that LACKS the binaries does not produce a route-based bundle; it
 *     fails outright (`esbuild` cannot resolve the import), as verified. So there
 *     is no shipped configuration in which the route is the live path.
 *   - And the route could not have served the desktop shell anyway: that
 *     document's origin is `dsh-app://app`, where a route-relative URL resolves
 *     into the app protocol handler and 404s.
 *
 * Keeping six dead HTTP routes alive would be pure attack surface for zero
 * rendered glyphs. The `file://` global stays because it is the fallback the
 * source-run path uses.
 *
 * The seam does not start anything at import time, and it lives in a plain
 * Cordis event listener the carrier owns.
 */

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { PASTE_PATH, installPasteRoute } from './paste-route.js'

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts')

/** Mirrors `FONT_BASE_GLOBAL` in `client/src/fonts.js`. */
export const FONT_BASE_GLOBAL = '__CDS_THEME_FONT_BASE__'

/** Absolute `file://` base of the shipped fonts, with a trailing slash. */
export const FONT_BASE_URL = pathToFileURL(FONTS_DIR).href + '/'

export { PASTE_PATH }

export const name = 'dsh-cds-theme'

/**
 * Publish the local fonts base into the document, and mount the paste store.
 *
 * The listener needs no service: it is a plain Cordis event the carrier fires
 * while rendering the page. The paste route needs a web server and degrades to
 * "long pastes stay plain text" when the composition has none.
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'global',
      name: FONT_BASE_GLOBAL,
      value: FONT_BASE_URL,
    })
  })
  installPasteRoute(ctx)
}
