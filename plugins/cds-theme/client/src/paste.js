/**
 * Long plain-text paste → a real `.txt` in the session workspace → an
 * `@relative/path` mention in the composer.
 *
 * WHY THE OUTCOME CHANGED. The previous version re-dispatched the host's own
 * file-intake path with a synthesized `File`, which produced a 240×64 upload
 * card: the browser cannot give that `File` a real path, so the host's
 * `bridge.pathFor(file)` returned `''` and the attachment went to uploads. The
 * installed `@deepseek-ai/dsh-client-ui-conversation` bundle draws the line
 * exactly there (around `registerComposerKeymap`'s `PASTE_COMMAND` handler):
 *
 *   const path = bridge?.pathFor(file) ?? ''
 *   if (path === '' || (!directory && isImageMediaType(file.type))) uploads.push(file)
 *   else references.push({ source: 'reference', ref: mention, … })   // → @ chip
 *
 * A JavaScript `File` can never satisfy `pathFor` (`electron.webUtils.getPathForFile`
 * answers only for OS-delivered files), so the path has to become REAL: this
 * module asks the Host half (`lib/paste-route.js`) to write the text under
 * `<session workspace>/.dsh-paste/`, then inserts the `@` mention the host's own
 * grammar defines. The sent message carries `@.dsh-paste/pasted-text-….txt`,
 * which the model resolves through the same `@file` contract as any dragged
 * file, and the transcript renders it with the reference chip.
 *
 * WHY A TEXT PASTE FOR THE INSERTION. The composer's public input actions
 * (`captureInsertion`/`insertText`) live on a slot injection this plugin does
 * not own, and the atomic chip route (`shell.addFiles`) is package-internal.
 * The host's PASTE_COMMAND handler is public and stable, inserts at the caret
 * as one undo unit, and needs nothing but `text/plain` — so the mention rides
 * the same synthetic paste the fallback already used.
 *
 * SAFETY IS THE HARD REQUIREMENT. Every failure — no session id, no Host route,
 * a Host error, a write error, a 2-second budget, or a mention that never lands
 * in the draft — re-dispatches the ORIGINAL text as a plain-text paste: exactly
 * what the host would have received without this feature. `preventDefault()`
 * only runs after the converter has decided to own the paste, and the fallback
 * runs at most once per paste.
 *
 * DETECTION. The generation is "the mention text reached the live composer":
 * `[data-composer-input]`'s `textContent` gains the mention. A pending
 * attachment card is no longer the signal because no attachment is created.
 */

import { en, makeTranslator } from './locales.js'

/**
 * Convert when the pasted text is at least this many characters …
 *
 * Both numbers were chosen to keep short pastes behaving normally while
 * stopping multi-KB dumps from stretching the composer: 2,000 characters is
 * roughly two screens of prose, and 30 lines is a little over the visible
 * composer before it scrolls. Either threshold is enough on its own.
 */
export const PASTE_FILE_CHAR_THRESHOLD = 2000

/** … OR this many lines. */
export const PASTE_FILE_LINE_THRESHOLD = 30

/**
 * Total budget for one conversion, in milliseconds.
 *
 * It covers the Host round trip AND the landing check: past this point the
 * original text is pasted, so a slow or unreachable Host costs the user at most
 * two seconds and never their content.
 */
export const PASTE_ATTACH_WAIT_MS = 2000

/** Poll interval while the landing check runs. */
export const PASTE_ATTACH_POLL_MS = 100

/** The host's own MIME for a plain-text paste. Kept for the fallback transfer. */
export const PASTE_FILE_TYPE = 'text/plain'

/** Host route that writes one paste under the session workspace. */
export const PASTE_ROUTE = '/dsh-cds-theme/paste'

/**
 * The marker the Host route requires on every request (must match
 * `lib/paste-route.js`). A custom non-safelisted header is what makes the route
 * unreachable from a page the user visits: `<img>`/`<script>`/`<form>` and
 * navigation cannot set one, and a cross-origin `fetch` that would sends a CORS
 * preflight the Host never answers. Same-origin requests never preflight.
 */
export const PASTE_MARKER_HEADER = 'x-dsh-cds-theme'
export const PASTE_MARKER_VALUE = '1'

/** Stable host hooks the composer publishes on purpose. */
export const PASTE_COMPOSER_INPUT = '[data-composer-input]'
export const PASTE_COMPOSER_CARD = '[data-composer-card]'

/**
 * Conversation body hook carrying the Session id. The paste lands inside it, so
 * the Host can resolve that Session's workspace without the client guessing.
 */
export const PASTE_SESSION_HINT = '[data-conversation-session]'

/**
 * Number of newline-separated lines. `a\nb` is 2, and a trailing newline is
 * the empty line after it — the same way an editor counts it.
 */
export function countLines(text) {
  return String(text === null || text === undefined ? '' : text).split(/\r\n|\r|\n/).length
}

/** The pure threshold predicate, independent of the clipboard or the DOM. */
export function isLongPaste(text) {
  if (typeof text !== 'string' || text === '') return false
  return text.length >= PASTE_FILE_CHAR_THRESHOLD
    || countLines(text) >= PASTE_FILE_LINE_THRESHOLD
}

/**
 * HTML that is clearly a FILE/RICH payload rather than styled text. A copied
 * paragraph (`<p>`, `<b>`, `<span>`) is still plain prose and may convert;
 * embedded media, data/file URLs, form controls and tables mean the clipboard
 * is carrying something a `.txt` would destroy.
 */
export function looksLikeRichPayload(html) {
  if (typeof html !== 'string' || html === '') return false
  if (/<\s*(?:img|video|audio|iframe|object|embed|canvas|svg|table|input|textarea)\b/i.test(html)) return true
  return /(?:file:|data:(?:image|audio|video|application)\/)/i.test(html)
}

/**
 * The whole decision, as a pure function:
 *
 *   - the switch is on;
 *   - the payload is plain text (no file items);
 *   - its HTML half is not a file/rich payload;
 *   - it crosses the character OR line threshold.
 */
export function shouldConvertPaste(options) {
  const input = options === undefined || options === null ? {} : options
  if (input.enabled === false) return false
  if (typeof input.fileCount === 'number' && input.fileCount > 0) return false
  if (looksLikeRichPayload(input.html)) return false
  return isLongPaste(input.text)
}

/**
 * `YYYY-MM-DD-HHmm` in the user's local time. Two-digit fields, no separators
 * that Windows rejects. A caller-supplied Date makes this deterministic.
 */
export function formatPasteStamp(now) {
  const date = now instanceof Date && !isNaN(now.getTime()) ? now : new Date()
  const pad = function (value) { return String(value).padStart(2, '0') }
  return String(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-'
    + pad(date.getDate()) + '-' + pad(date.getHours()) + pad(date.getMinutes())
}

/**
 * Windows' reserved device names are unusable as file names on their own
 * (`CON`, `NUL`, `COM1`, …; `CON.txt` is reserved too). A leading underscore
 * keeps the generated name usable.
 */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

/**
 * Make a user-facing name safe on every supported platform: no path
 * separators, none of `<>:"/\|?*`, no control characters, no trailing dots or
 * spaces, and no reserved device name. The visible text is otherwise untouched.
 *
 * The Host repeats this on its side (`lib/paste-store.js`): a browser string
 * that becomes a file name is not trusted twice.
 */
export function sanitizeFileName(name) {
  let value = String(name === null || name === undefined ? '' : name)
    // Windows-rejected characters and C0 controls become a separator.
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    // Collapse runs so a hostile string does not become a wall of hyphens.
    .replace(/-{2,}/g, '-')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  if (value === '') value = 'pasted-text.txt'
  if (RESERVED_NAME.test(value)) value = '_' + value
  // Most filesystems cap a component at 255; leave plenty of headroom for the
  // timestamp and extension while keeping a pathologically long template safe.
  if (value.length > 180) value = value.slice(0, 180)
  return value
}

/**
 * Build the file name from the active locale's dictionary entry:
 *
 *   zh 粘贴文本-YYYY-MM-DD-HHmm.txt
 *   en pasted-text-YYYY-MM-DD-HHmm.txt
 *
 * `translate` is the locale service binding (`ctx.locale.bind(LOCALE_NS)`) the
 * rest of this plugin uses, so the name follows the active UI language and a
 * language switch needs no logic here. A translator that cannot resolve the key
 * falls back to the English shape rather than leaking a raw key into a file
 * name.
 */
export function buildPastedTextFilename(translate, now) {
  const stamp = formatPasteStamp(now === undefined ? new Date() : now)
  const translator = typeof translate === 'function' ? translate : makeTranslator(en)
  const rendered = translator('pasteFile.fileName', { stamp })
  const template = typeof rendered === 'string' && rendered.indexOf(stamp) >= 0
    ? rendered
    : 'pasted-text-' + stamp + '.txt'
  return sanitizeFileName(template)
}

/**
 * How many elements inside `card` carry `title === filename`.
 *
 * NO LONGER THE LANDING SIGNAL — nothing is uploaded, so no card appears — but
 * the helper stays exported because this plugin's `__internals` re-exports it
 * and it is still the honest way to ask "is this name already on a pending
 * card" if a future version goes back to attachments.
 */
export function attachmentCount(card, filename) {
  if (!card || typeof card.querySelectorAll !== 'function') return 0
  const nodes = card.querySelectorAll('[title]')
  let count = 0
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node && typeof node.getAttribute === 'function' && node.getAttribute('title') === filename) {
      count += 1
    }
  }
  return count
}

/**
 * The `@` mention for one workspace-relative path, spelled with the host's own
 * grammar (`formatFileMention` in ui-conversation): whitespace forces quotes,
 * and a quote/control character makes the token unrepresentable.
 *
 * @returns the `@path` / `@"path"` token, or null.
 */
export function formatPasteMention(relativePath) {
  const normalized = String(relativePath === null || relativePath === undefined ? '' : relativePath)
    .replace(/\\/g, '/')
  if (normalized === '') return null
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(normalized)) return null
  return /\s/u.test(normalized) ? '@"' + normalized + '"' : '@' + normalized
}

/**
 * Read the Session id from the composer's enclosing conversation body.
 *
 * The host renders `data-conversation-session` on `.Dc7zOa_body`, the ancestor
 * of every composer seat; a session-less composer (the workspace-picker
 * landing page) has none, which is one more reason to fall back to plain text.
 */
export function composerSessionId(input) {
  if (!input || typeof input.closest !== 'function') return ''
  const host = input.closest(PASTE_SESSION_HINT)
  if (!host || !host.dataset) return ''
  const value = host.dataset.conversationSession
  return typeof value === 'string' ? value : ''
}

/** Read a clipboard string defensively; a browser may throw for a type. */
function clipboardText(clipboardData, type) {
  if (!clipboardData || typeof clipboardData.getData !== 'function') return ''
  try {
    return String(clipboardData.getData(type) || '')
  } catch (error) {
    return ''
  }
}

/** Count file items without trusting either `items` or `files` to exist. */
function clipboardFileCount(clipboardData) {
  let count = 0
  if (!clipboardData) return count
  const items = clipboardData.items
  if (items && typeof items.length === 'number') {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (item && item.kind === 'file') count += 1
    }
  }
  if (clipboardData.files && typeof clipboardData.files.length === 'number') {
    count += clipboardData.files.length
  }
  return count
}

/**
 * Ask the Host to write one paste. Injects `fetch` for tests.
 *
 * @param request - `{ sessionId, name, text }`.
 * @param options.fetchImpl - fetch-compatible function.
 * @param options.signal - abort signal for the 2-second budget.
 * @returns `{ mention }` on success.
 * @throws when the Host refuses, answers non-200, or answers a body with no mention.
 */
export async function requestPasteFile(request, options) {
  const opts = options === undefined || options === null ? {} : options
  const callFetch = typeof opts.fetchImpl === 'function'
    ? opts.fetchImpl
    : function (url, init) { return fetch(url, init) }
  const response = await callFetch(PASTE_ROUTE, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      [PASTE_MARKER_HEADER]: PASTE_MARKER_VALUE,
    },
    body: JSON.stringify(request),
    signal: opts.signal,
  })
  if (!response || response.ok !== true) {
    throw new Error('paste: the Host refused the conversion (' + (response ? response.status : 'no response') + ')')
  }
  const body = await response.json()
  if (!body || body.ok !== true || typeof body.mention !== 'string' || body.mention === '') {
    throw new Error('paste: the Host answered no mention')
  }
  return { mention: body.mention, fileName: body.fileName, relativePath: body.relativePath }
}

/**
 * Own the paste interception for one plugin lifetime.
 *
 * Everything with a browser global is injectable so the whole flow — success,
 * Host failure, timeout, and the text-only fallback — can be driven in
 * `node:test` without a DOM, a Host, or a real 2 s wait: `makeDataTransfer`,
 * `makeClipboardEvent`, `fetchPaste`, `readComposerText`, `schedule`/`cancel`,
 * `nowMs`. `doc` is the only required dependency.
 */
export function createPasteConverter(options) {
  const opts = options === undefined || options === null ? {} : options
  const doc = opts.doc || null
  const getState = typeof opts.getState === 'function' ? opts.getState : function () { return {} }
  const translate = typeof opts.translate === 'function' ? opts.translate : makeTranslator(en)
  const now = typeof opts.now === 'function' ? opts.now : function () { return new Date() }
  const nowMs = typeof opts.nowMs === 'function' ? opts.nowMs : function () { return Date.now() }
  const waitMs = typeof opts.waitMs === 'number' ? opts.waitMs : PASTE_ATTACH_WAIT_MS
  const pollMs = typeof opts.pollMs === 'number' ? opts.pollMs : PASTE_ATTACH_POLL_MS
  const schedule = typeof opts.schedule === 'function'
    ? opts.schedule
    : function (callback, delay) { return setTimeout(callback, delay) }
  const cancel = typeof opts.cancel === 'function'
    ? opts.cancel
    : function (timer) { clearTimeout(timer) }
  const makeDataTransfer = typeof opts.makeDataTransfer === 'function'
    ? opts.makeDataTransfer
    : function () { return new DataTransfer() }
  const makeClipboardEvent = typeof opts.makeClipboardEvent === 'function'
    ? opts.makeClipboardEvent
    : function (type, init) {
        const event = new ClipboardEvent(type, init)
        // Chromium honours ClipboardEventInit.clipboardData; a host that
        // ignores it would otherwise see `null` and drop the text. Defining the
        // own property is the fallback, not the primary path.
        if (!event.clipboardData && init && init.clipboardData) {
          try {
            Object.defineProperty(event, 'clipboardData', { value: init.clipboardData })
          } catch (error) { /* leave the host's own behaviour in place */ }
        }
        return event
      }
  const fetchPaste = typeof opts.fetchPaste === 'function'
    ? opts.fetchPaste
    : function (request, init) { return requestPasteFile(request, init) }
  const readComposerText = typeof opts.readComposerText === 'function'
    ? opts.readComposerText
    : function (element) { return element && typeof element.textContent === 'string' ? element.textContent : '' }
  const sessionIdOf = typeof opts.sessionIdOf === 'function' ? opts.sessionIdOf : composerSessionId

  let started = false
  let reentering = false
  // Timer ids currently armed, so stop() leaves no callback behind.
  const timers = new Set()

  function featureEnabled() {
    const state = getState() || {}
    return state.enabled !== false && state.pasteAsFile !== false
  }

  function arm(callback, delay) {
    let timer = null
    const run = function () {
      timers.delete(timer)
      callback()
    }
    timer = schedule(run, delay)
    timers.add(timer)
    return timer
  }

  function clearTimers() {
    for (const timer of timers) cancel(timer)
    timers.clear()
  }

  function liveInput(fallback) {
    if (fallback && fallback.isConnected !== false) return fallback
    return doc && typeof doc.querySelector === 'function'
      ? doc.querySelector(PASTE_COMPOSER_INPUT)
      : null
  }

  /** Dispatch one paste and keep our own capture listener out of it. */
  function dispatchPaste(target, transfer) {
    const previous = reentering
    reentering = true
    try {
      target.dispatchEvent(makeClipboardEvent('paste', {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }))
      return true
    } catch (error) {
      // A host that cannot construct a ClipboardEvent must not lose the paste:
      // the caller falls through to its own text insertion.
      return false
    } finally {
      reentering = previous
    }
  }

  /** Build a text-only transfer, or null when this environment cannot. */
  function textTransfer(text) {
    let transfer
    try {
      transfer = makeDataTransfer()
    } catch (error) {
      return null
    }
    if (!transfer || typeof transfer.setData !== 'function') return null
    transfer.setData('text/plain', text)
    return transfer
  }

  /**
   * Put the original text into the composer the way a normal paste would.
   * The element may have been re-rendered while the conversion was in flight,
   * so fall back to whatever composer input is live at that moment.
   */
  function dispatchTextFallback(target, text) {
    const live = liveInput(target)
    if (!live) return false
    const transfer = textTransfer(text)
    if (!transfer) return false
    return dispatchPaste(live, transfer)
  }

  /**
   * Insert the `@mention` as an ordinary text paste.
   *
   * The host's own chip insertion separates a reference from surrounding text
   * with one space on each side; the same rule is applied here, because a
   * mention glued to the preceding word would not be a reference when the
   * message renders.
   */
  function dispatchMention(target, mention) {
    const live = liveInput(target)
    if (!live) return false
    const current = readComposerText(live)
    const lead = current === '' || /\s$/.test(current) ? '' : ' '
    const transfer = textTransfer(lead + mention + ' ')
    if (!transfer) return false
    return dispatchPaste(live, transfer)
  }

  /**
   * One paste's conversion, with exactly one terminal outcome.
   *
   * ONE BUDGET (`waitMs`) covers both phases: the Host round trip, bounded by a
   * watchdog that aborts the request, and the landing check, which polls what
   * is left of the same deadline (with at least two poll intervals so a fast
   * Host still gets a fair check). Every path calls the same idempotent
   * `fail()`, so a late Host answer after a fallback is a no-op and the user's
   * text is never pasted twice.
   */
  function convert(target, text, sessionId) {
    // 'pending' → the Host is being asked; 'inserted' → the mention is in the
    // draft and only its landing is unconfirmed; 'settled' → terminal.
    let phase = 'pending'
    let watchdog = null
    let controller = null
    const deadline = nowMs() + waitMs

    function clearWatchdog() {
      if (watchdog === null) return
      cancel(watchdog)
      timers.delete(watchdog)
      watchdog = null
    }

    function fail() {
      if (phase === 'settled') return
      phase = 'settled'
      clearWatchdog()
      dispatchTextFallback(target, text)
    }

    const filename = buildPastedTextFilename(translate, now())

    // A Host that never answers must not swallow the paste: at the deadline the
    // request is aborted and the original text is pasted instead.
    watchdog = arm(function () {
      watchdog = null
      if (phase !== 'pending') return
      if (controller !== null) {
        try { controller.abort() } catch (error) { /* nothing left to abort */ }
      }
      fail()
    }, waitMs)

    let pending
    try {
      controller = typeof AbortController === 'function' ? new AbortController() : null
      pending = fetchPaste({
        sessionId: sessionId,
        name: filename,
        text: text,
      }, {
        ...controller === null ? {} : { signal: controller.signal },
        ...typeof opts.fetchImpl === 'function' ? { fetchImpl: opts.fetchImpl } : {},
      })
    } catch (error) {
      fail()
      return
    }

    Promise.resolve(pending).then(function (result) {
      // A plugin that was disabled while the request was in flight must not
      // touch the document at all — `stop()` already cancelled the watchdog.
      if (!started || phase !== 'pending') return
      const mention = result && typeof result.mention === 'string' ? result.mention : ''
      if (mention === '') {
        fail()
        return
      }
      clearWatchdog()
      // The pre-dispatch text makes the landing check honest: the draft must
      // CHANGE and carry the mention. Without it, a draft that already held an
      // identical token (the same name in the same minute) would look landed
      // even if the synthetic paste was refused.
      const before = readComposerText(liveInput(target))
      if (!dispatchMention(target, mention)) {
        fail()
        return
      }
      phase = 'inserted'
      // Landing check: the mention must actually reach the live composer. A
      // dispatch whose event nobody handled would otherwise look like success,
      // and the user's text would be gone.
      watchMention(target, before, mention, Math.max(deadline, nowMs() + pollMs * 2))
    }, function () {
      fail()
    })

    function watchMention(el, before, mention, limit) {
      function check() {
        if (!started || phase === 'settled') return
        const text = readComposerText(liveInput(el))
        if (text !== before && text.indexOf(mention) >= 0) {
          phase = 'settled'
          return
        }
        if (nowMs() >= limit) {
          fail()
          return
        }
        arm(check, pollMs)
      }
      arm(check, pollMs)
    }
  }

  function onPaste(event) {
    if (!started || reentering || !event) return
    if (!featureEnabled()) return
    const target = event.target
    if (!target || typeof target.closest !== 'function') return
    const input = target.closest(PASTE_COMPOSER_INPUT)
    if (!input) return
    // The landing page can render the same div inert (contenteditable=false)
    // while the workspace picker owns the click. Do not swallow a paste there;
    // there is no editor to receive either a mention or the fallback text.
    if (input.isContentEditable === false) return
    const clipboardData = event.clipboardData
    if (!clipboardData) return

    const text = clipboardText(clipboardData, 'text/plain')
    const html = clipboardText(clipboardData, 'text/html')
    const fileCount = clipboardFileCount(clipboardData)
    if (!shouldConvertPaste({ enabled: true, text: text, fileCount: fileCount, html: html })) return

    // Decide BEFORE consuming the event: an environment that cannot even build
    // a text transfer must let the host handle the paste normally.
    if (!textTransfer('')) return

    const sessionId = sessionIdOf(input)
    event.preventDefault()
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()

    if (sessionId === '') {
      // No Session (the workspace-picker landing page): the Host cannot name a
      // workspace, so the honest outcome is the original paste.
      dispatchTextFallback(input, text)
      return
    }
    convert(input, text, sessionId)
  }

  return {
    start() {
      if (started || !doc || typeof doc.addEventListener !== 'function') return
      started = true
      doc.addEventListener('paste', onPaste, true)
    },
    stop() {
      if (!started) return
      started = false
      clearTimers()
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('paste', onPaste, true)
      }
    },
    handlePaste: onPaste,
    get started() { return started },
  }
}
