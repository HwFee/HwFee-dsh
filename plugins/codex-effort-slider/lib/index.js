/**
 * `@hwfee/dsh-codex-effort-slider` — host half.
 *
 * ALL of this plugin's behaviour is in the browser bundle. The host half exists for
 * one reason: `dsh.client` bundles are discovered from the Loader's entry list, so a
 * package with no host row never gets its client bundle into
 * `window.__DSH_BOOT__`. In other words, without this file the slider cannot appear
 * no matter how correct `client/client.js` is.
 *
 * THREE DISCIPLINES, each of which has bitten a plugin in this repository:
 *   1. `apply()` NEVER THROWS. A synchronous throw fails the entry's fiber and the
 *      startup audit reports "Failed to load plugins".
 *   2. NO SERVICES ARE INJECTED. Declaring a service that is never provided leaves
 *      the fiber PENDING and drags on the whole plugin tree.
 *   3. NO LOG NOISE ON SUCCESS. The one thing worth saying is the one host-side
 *      failure mode that is otherwise invisible: a client artifact that is missing or
 *      malformed means "the plugin is installed and nothing will appear".
 *
 * The check is STATIC — it reads the artifact and looks for markers, never executes
 * it. A broken client bundle must cost the widget, not the boot.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PACKAGE_ID = '@hwfee/dsh-codex-effort-slider'

/**
 * Markers the client artifact must contain.
 *
 * `id: "<package>"` is the loader registration — a mismatch there is the
 * `duplicate factory registration` hazard. `conversation.input.right` is the slot the
 * anchor lives in; without it the component is never mounted anywhere.
 *
 * THE `apply` CHECK IS A PATTERN, NOT A LITERAL. esbuild emits CommonJS exports through
 * its `__export(target, { apply: () => … })` helper, so the text `exports.apply` never
 * appears in a bundle built this way even though `apply` IS exported. A literal needle
 * would warn on every boot — a false alarm that teaches the reader to ignore the one
 * message this half produces.
 */
const MARKERS = [
  { needle: '__ModuleLoader__.load', why: 'not a module-loader bundle' },
  { needle: 'return module.exports', why: 'the factory hands back no exports' },
  { needle: 'conversation.input.right', why: 'the anchor slot is not declared' },
]

/** Is `apply` exported? Accepts both the esbuild helper form and a direct assignment. */
export function exportsApply(bundle) {
  if (/\bexports\.apply\s*=/.test(bundle)) return true
  // esbuild: __export(index_exports, { apply: (...) => …, name: … })
  return /__export\([^,]+,\s*\{[\s\S]{0,4000}?\bapply\s*:/.test(bundle)
}

function auditClientBundle(log) {
  try {
    const bundle = readFileSync(fileURLToPath(new URL('../client/client.js', import.meta.url)), 'utf8')
    const problems = []
    // Accept the quoted id with or without surrounding whitespace.
    if (!bundle.includes('id: "' + PACKAGE_ID + '"') && !bundle.includes('id:"' + PACKAGE_ID + '"')) {
      problems.push('bundle id 与包名不一致')
    }
    for (const marker of MARKERS) {
      if (!bundle.includes(marker.needle)) problems.push(marker.why)
    }
    if (!exportsApply(bundle)) problems.push('没有导出 apply')
    if (problems.length > 0) {
      log('客户端产物 client/client.js 检查未通过（界面可能不会出现滑条）：' + problems.join('；'))
      return
    }
    log('客户端产物 client/client.js 就绪（' + Buffer.byteLength(bundle, 'utf8') + ' 字节，静态检查通过）')
  } catch (error) {
    log('客户端产物 client/client.js 不可读（界面不会出现滑条）：' + String(error))
  }
}

/**
 * @param {object} ctx host cordis context (this half uses none of it)
 */
export function apply(ctx) {
  try {
    const candidate = ctx?.logger
    const sink = typeof candidate === 'function' ? candidate(PACKAGE_ID) : candidate
    const log = (message) => {
      try {
        if (sink && typeof sink.info === 'function') sink.info('[' + PACKAGE_ID + '] ' + message)
        else console.info('[' + PACKAGE_ID + '] ' + message)
      } catch (error) {
        /* even logging must not throw */
      }
    }
    auditClientBundle(log)
  } catch (error) {
    /* the audit failing must still let apply succeed */
  }
}

export const name = PACKAGE_ID

export default { name: PACKAGE_ID, apply }
