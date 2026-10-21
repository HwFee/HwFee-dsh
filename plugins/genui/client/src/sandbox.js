/**
 * Evaluating the model's snippet.
 *
 * WHAT THIS IS AND IS NOT. This is a **footgun guard**, not a security sandbox.
 * It exists so a card that reaches for `fetch` or `document` fails with a
 * sentence that tells the model what to do instead, and so an incidental
 * `setInterval` cannot outlive the card. It is NOT a containment boundary, and
 * calling it one would be a lie a later reader would rely on: the snippet still
 * runs on the page's thread, with the page's origin, inside the same JavaScript
 * realm as the host UI.
 *
 * The honest threat model: the code comes from the model, the user asked that
 * model to answer them, and the model already has tool access to their files
 * and shell. A card is therefore not a new privilege — but it IS a new way to
 * lose data by accident (`localStorage.clear()`), and that is what the masking
 * below prevents.
 *
 * WHY `new Function` AT ALL. The requested feature is "the model writes React",
 * not "the model picks from a fixed catalog". Any declarative alternative is a
 * different feature. The host itself takes the same route for its dynamic
 * packages (`@deepseek-ai/dsh-cordis-client-runner`), with the same shape: a
 * function whose PARAMETERS are the symbol surface, and teaching traps that
 * shadow the browser globals the code must not reach for. This module follows
 * that precedent deliberately, including its admission limit.
 *
 * KNOWN LIMITS, stated once so they are not rediscovered as bugs:
 *
 *   1. `globalThis` IS masked now (see its entry in REDIRECTS), which closes the
 *      one-property bypass the first version left open. It is still not
 *      containment: a snippet can reach the realm through a constructor it
 *      already holds — `h('div').__proto__.constructor` gets to `Function` and
 *      therefore to `globalThis` again. Anything wider needs a real isolation
 *      boundary.
 *
 *   2. The real boundary the official MCP Apps extension draws is a
 *      double-iframe: host → distinct-origin sandbox proxy → view, with a CSP
 *      served from resource metadata and a JSON-RPC `postMessage` bridge
 *      (`specification/2026-01-26/apps.mdx`). That is the right shape for a
 *      card that must be *untrusted*, and it is the direction this module would
 *      take if cards ever handle data the user did not ask a model to see.
 *
 * Why it is not the shape today: the host slot renders React inside the app's
 * own renderer, the snippet receives the host React instance directly, and the
 * caller already has `bash` on this machine. An iframe would force every
 * snippet through a serialization boundary (no host React, no theme tokens by
 * inheritance) and buy no protection against this particular caller. The cost
 * is real and the benefit is not, so the guard stays a guard.
 *
 * @module sandbox
 */

/**
 * Redirects for the globals a card must not reach for.
 *
 * Each message names the alternative, because the model reads it inside a
 * tool-render failure and has no other way to learn the rule mid-turn.
 */
/*
 * WHAT IS MASKED, AND WHY THE LIST IS SHORT.
 *
 * The first version masked sixteen names — every timer, every network API, the
 * document, both storages. That was over-correction: it made ordinary cards
 * worse (a progress animation, a debounced input, a chart that redraws all had
 * to be rewritten as CSS tricks) to defend against a caller who, in this host,
 * can already run `bash`. The line is drawn where ZCode's Gen UI draws it
 * (its pages are real iframes with their own document and timers, bridged to
 * the host by `postMessage`): a card may own its own time and its own view, but
 * it must not reach into the HOST's state.
 *
 * So three things are masked, and each one is a way to damage the app rather
 * than the card:
 *
 *   - `localStorage` / `sessionStorage` — the host keeps the user's actual
 *     settings there (theme, panel sizes, plugin switches). A card clearing them
 *     loses real state, silently, with no undo.
 *   - `indexedDB` — the same hazard at a larger scale.
 *   - `Function` — nested evaluation turns a snippet into a general-purpose
 *     loader for anything that can be written as a string.
 *
 * Everything else is deliberately ALLOWED: `setTimeout`/`setInterval`/
 * `requestAnimationFrame` (a card is a live view; timers die with the element
 * because React unmounts it and the snippet's own cleanup runs), `fetch` and
 * friends (a card that wants live data can have it — the same model can already
 * fetch through a tool), and `window`/`document` (reading `window.innerWidth` is
 * how a responsive card works; there is no separate document to give it).
 *
 * `eval` is NOT here and cannot be: strict mode forbids it as a binding name.
 * That is fine — it is not a way to damage the host that `Function` does not
 * already cover.
 */
const REDIRECTS = {
  localStorage: 'a card must not touch the host\'s storage. Keep state in React.useState; the model owns persistence.',
  sessionStorage: 'a card must not touch the host\'s storage. Keep state in React.useState.',
  indexedDB: 'a card must not touch the host\'s storage. Keep state in React.useState.',
  require: 'no module loading here. Build elements with `h` and the React passed to the snippet.',
  Function: 'nested evaluation is not allowed; write the code you mean.',
}

/**
 * `eval` is deliberately absent from the table above, and the reason is a
 * JavaScript rule rather than a choice: strict mode makes `eval` (like
 * `arguments`) an illegal binding name, so a parameter cannot shadow it —
 * `new Function('eval', ...)` throws `Unexpected eval or arguments in strict
 * mode` at compile time, before any snippet runs.
 *
 * Giving up strict mode to hide `eval` would be a bad trade. Strict mode is what
 * stops an accidental `leaked = 1` from attaching to the page's global object,
 * and that is a real data hazard. `eval` is not: a snippet is already arbitrary
 * code by definition, so the ability to evaluate a second string grants the
 * model nothing it did not already have.
 */

/**
 * Parameter names, in order, for the generated function.
 *
 * These are the sandbox's only real surface: every other global is reachable
 * through `globalThis`, but these names are what a snippet written in good
 * faith will actually type.
 *
 * `timers` sits here for the opposite reason: timers are ALLOWED, but they are
 * the snippet's own. React unmounts the element when the row scrolls away or
 * the session is left, and nothing in the snippet runs a cleanup at that point —
 * so the module hands the card a scoped pair that the component clears on
 * unmount. That is the difference between "a card may animate" and "a card can
 * leave an interval ticking for the rest of the app's life".
 */
const PARAMETERS = ['React', 'h', 'interact', 'timers', ...Object.keys(REDIRECTS)]

/**
 * A trap that throws the redirect for whatever the snippet does with it.
 *
 * THE TARGET MUST BE CALLABLE. The first version proxied `{}` and the result was
 * worse than no guard at all: `fetch('...')` failed with "fetch is not a
 * function", which is the engine's voice, not a teaching message — the model
 * cannot tell whether the name is misspelled or forbidden. A function target
 * makes the `apply` trap reachable, so the call site gets the redirect.
 *
 * `apply` covers `localStorage.getItem(...)`; `get` covers `localStorage.length`;
 * `construct` covers `new Function(...)`.
 *
 * ONE LIMIT, stated rather than discovered later: a bare identifier read —
 * `return localStorage` with no property access, no call — returns the proxy
 * and throws nothing. JavaScript offers no hook for "this name was evaluated",
 * so a value that is merely passed around cannot be intercepted. That is
 * harmless: the trap still refuses every operation performed ON it, and a proxy
 * is not a valid React child, so a card that returns one still fails visibly.
 *
 * @param {string} name the masked global
 * @returns {object} a callable proxy that throws on use
 */
function trapFor(name) {
  const message = `${name} is not available in a render_ui card — ${REDIRECTS[name]}`
  const fail = () => { throw new Error(message) }
  // A named dummy function: `new Proxy(() => {}, …)` would report `anonymous`
  // in a stack trace, and this name shows up in the model's error message.
  const callable = { [name]: function maskedGlobal() {} }[name]
  return new Proxy(callable, {
    get: fail,
    set: fail,
    apply: fail,
    construct: fail,
    has() { return true },
  })
}

/**
 * Compile one snippet into a component.
 *
 * The snippet becomes the BODY of the generated function, and that function is
 * called once per render by the component returned here:
 *
 *   new Function('React', 'h', ...traps, "'use strict';\n" + code)
 *
 * Two things follow, and both are load-bearing:
 *
 *   - hooks are legal, because the generated function runs inside the component
 *     returned below, i.e. during a React render;
 *   - a snippet that throws does so AT RENDER, where the card's error boundary
 *     catches it, instead of at compile time where the tool could not have known
 *     the data was bad.
 *
 * `'use strict'` is the first statement of that body, so the whole snippet is
 * strict: an accidental `leaked = 1` throws instead of attaching to the page's
 * global object and outliving the card.
 *
 * REACT IS A CLOSURE ARGUMENT, not a module import. This file is bundled into
 * the client half where the host's frozen module table supplies React at call
 * time; importing it here would either bundle a second copy (which React
 * rejects at runtime) or make the module unimportable in Node, where the
 * sandbox's own tests run.
 *
 * @param {object} deps
 * @param {object} deps.React the host React instance
 * @param {string} deps.code the validated snippet
 * @returns {() => unknown} a React function component
 * @throws {Error} with the model-facing message when the snippet will not parse
 */
export function compileCard({ React, code, interact }) {
  if (React === null || typeof React !== 'object' && typeof React !== 'function') {
    // Caught here rather than at render: a card compiled against a missing React
    // would throw `React is not defined` from inside the error boundary, which
    // reads as "the model's snippet is broken" for a plugin wiring failure.
    throw new Error('render_ui needs the host React instance; none was passed to the sandbox')
  }
  // `interact` is how a card says something back. It defaults to a function that
  // explains why it cannot, so a snippet written against a host that supplies no
  // bridge fails with a sentence rather than `interact is not a function`.
  //
  // NORMALIZATION LIVES HERE, at the one place every card goes through, so the
  // rule holds whether the caller is a button, a form submit, or a host test:
  // a message is a non-empty trimmed string, and anything else is refused before
  // it reaches the conversation as a blank turn.
  const send = async function interactBridge(text) {
    const message = typeof text === 'string' ? text.trim() : ''
    if (message === '') throw new Error('interact() needs a non-empty message')
    if (typeof interact !== 'function') {
      throw new Error('this card has no way to send a message back; interact() needs a host bridge')
    }
    return interact(message)
  }
  let body
  try {
    // eslint-disable-next-line no-new-func -- see the module header for why.
    body = new Function(...PARAMETERS, `'use strict';\n${code}`)
  } catch (error) {
    // A parse failure is the model's most common mistake (JSX). The message is
    // rewritten because the engine's own text names a position in a string the
    // model cannot see.
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `the snippet did not parse: ${detail}. `
      + 'JSX is not available — use h(tag, props, ...children) or React.createElement.',
    )
  }

  const traps = PARAMETERS.slice(4).map((name) => trapFor(name))
  const timers = createScopedTimers()

  /**
   * The mounted component. `h` is `React.createElement` under a shorter name
   * because the skill tells the model to use it and the snippet is written to
   * that promise.
   *
   * Parameters are positional and match `PARAMETERS`: React first (so a snippet
   * may call `React.useState`), then `h`, then `interact`, then `timers`, then
   * the traps.
   */
  function RenderUiCard() {
    const result = body(React, React.createElement, send, timers.api, ...traps)
    // MODELS RETURN A COMPONENT, NOT AN ELEMENT. The contract says "the body
    // of a function that returns React elements", but a very common answer is
    //
    //     return function Card() { return h('div', …) }
    //
    // React IGNORES a function child (`Functions are not valid as a React
    // child`), so the card rendered its title and an empty body while the tool
    // reported success — "it says it rendered but there is nothing there".
    //
    // The name/prototype probes must be guarded: a masked global is a Proxy
    // whose `get` trap THROWS (that is how `localStorage` explains itself), and
    // probing `.name` on it re-enters that trap. A throw means "not a
    // component". Only component-looking functions are mounted — React's own
    // convention is a capitalised name (or a class with `isReactComponent`); a
    // snippet returning `interact` or a trap is returning an API value, and the
    // sandbox suite pins exactly that.
    let component = false
    if (typeof result === 'function') {
      try {
        component = /^[A-Z]/.test(result.name ?? '') || result.prototype?.isReactComponent !== undefined
      } catch (error) {
        component = false
      }
    }
    return component ? React.createElement(result) : result
  }
  // The component carries its own disposer so the frame can clear pending
  // timers when React unmounts it. A property on the function (rather than a
  // second return value) keeps `compileCard`'s contract — "give me a component"
  // — while still giving the caller the one lifecycle hook a compiled card has.
  RenderUiCard.dispose = timers.clear
  return RenderUiCard
}

/**
 * A timer pair owned by one compiled card.
 *
 * The snippet gets `timers.set(fn, ms)` / `timers.every(fn, ms)` instead of the
 * bare globals. Both register with the real platform timer and record the id
 * here; `clear()` cancels everything still pending. The component calls
 * `clear()` on unmount, which is the moment the card stops existing — after
 * that a callback would touch React state on a dead tree.
 *
 * Why not just let the snippet use `setTimeout`: it can (that is allowed now),
 * but a snippet that forgets to clear leaves work queued with no owner, and the
 * row is recycled constantly. Handing it an owning object is the small nudge
 * that makes the correct thing the easy thing.
 *
 * A callback that throws is caught: the platform would otherwise report an
 * uncaught error in the host's console with no attribution to the card.
 *
 * @returns {{ api: object, clear: () => void }} the snippet-facing pair and its disposer
 */
function createScopedTimers() {
  const pending = new Set()
  const wrap = (callback) => {
    if (typeof callback !== 'function') throw new Error('timers.set/every needs a function')
    return function scopedTimerCallback() {
      try {
        callback()
      } catch (error) {
        // Reaching the host console with the card's own message is better than
        // an anonymous uncaught error; the card's error boundary cannot see a
        // callback that fires outside render.
        console.error('[dsh-genui] a card timer threw:', error)
      }
    }
  }
  const api = {
    set(callback, ms) {
      const id = setTimeout(() => { pending.delete(id); wrap(callback)() }, ms)
      pending.add(id)
      return id
    },
    every(callback, ms) {
      const id = setInterval(wrap(callback), ms)
      pending.add(id)
      return id
    },
    clear(id) {
      if (pending.delete(id)) { clearTimeout(id); clearInterval(id) }
    },
  }
  return {
    api,
    clear() {
      for (const id of pending) { clearTimeout(id); clearInterval(id) }
      pending.clear()
    },
  }
}

/**
 * Compile with the outcome as a value instead of a throw.
 *
 * The card needs the failure to RENDER (as a source view with the message), and
 * a render-time throw would be the error boundary's job — which shows less than
 * this does. So compilation is attempted here, and both outcomes are data.
 *
 * @param {object} deps
 * @param {object} deps.React the host React instance
 * @param {string} deps.code the validated snippet
 * @returns {{ ok: true, Component: () => unknown } | { ok: false, message: string }} the outcome
 */
export function tryCompileCard({ React, code, interact }) {
  try {
    return { ok: true, Component: compileCard({ React, code, interact }) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
