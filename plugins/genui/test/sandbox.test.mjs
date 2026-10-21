/**
 * The sandbox: what a card may reach, and what it may not.
 *
 * THE HONEST FRAMING, restated here because a test file is where a future
 * reader checks their mental model. This is a footgun guard, not a containment
 * boundary. It hides the browser globals a well-behaved snippet would actually
 * type, and it throws with a message that tells the model what to do instead.
 * It does not stop `globalThis.fetch`, and the module header says so.
 *
 * So these tests assert three kinds of thing, and the difference matters:
 *
 *   - MASKING (a real guarantee): the parameter names are shadowed, so the
 *     obvious spelling throws, and the message names the alternative.
 *   - COMPILATION (a real guarantee): a snippet that will not parse fails with a
 *     model-facing message rather than an engine message about invisible text.
 *   - THE REACT HANDOFF (a real guarantee): the snippet actually receives the
 *     React instance it was promised. This one was a live bug — `compileCard`
 *     referenced a module-level `React` that did not exist, so every card threw
 *     `React is not defined` while all of the masking tests passed.
 *
 * A test asserting "a card cannot reach the network" would be a lie; the test
 * that exists says "a card cannot reach the network BY TYPING fetch".
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

// The sandbox module is browser source. It touches no DOM API at import time and
// takes React as an argument, so it loads in Node and its components are
// callable directly.
const { compileCard, tryCompileCard } = await import('../client/src/sandbox.js')

/**
 * A stand-in for the host's React: just enough to build a leaf element and to
 * stand in for a hook namespace.
 *
 * It is passed INTO the snippet, so a test that reads `React.useState` proves
 * the real instance reaches the card rather than a copy made here.
 */
const ReactStub = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
  useState(initial) {
    return [initial, function noop() {}]
  },
}

/** Compile a snippet against the stub React. */
function compile(code) {
  return compileCard({ React: ReactStub, code })
}

test('a snippet runs and sees React plus the h alias', function () {
  const Component = compile('return h("div", { id: "x" }, "hello")')
  const element = Component()
  assert.equal(element.type, 'div')
  assert.equal(element.props.id, 'x')
  assert.deepEqual(element.children, ['hello'])
})

test('a snippet that returns a component function is mounted, not ignored', function () {
  // REGRESSION: "it says it rendered but there is nothing there". Models very
  // often end the snippet with `return function Card() { … }` — a component,
  // not an element. React IGNORES a function child (`Functions are not valid as
  // a React child`), so the tool reported success and the card body stayed
  // empty; only the title (rendered by the frame) was visible.
  const Component = compile('return function Inner() { return h("div", null, "body") }')
  const element = Component()
  assert.equal(typeof element, 'object', 'the returned function must become a React element')
  assert.equal(element.type.name, 'Inner')
  assert.equal(element.type().type, 'div', 'and mounting it produces the snippet output')
})

test('the snippet receives the exact React instance it was handed', function () {
  // THE REGRESSION THIS CATCHES. Before the fix, `compileCard` closed over an
  // undefined module-level `React`, so every real card threw `React is not
  // defined` — while the masking tests below still passed, because they never
  // touched React. Driving a hook is the cheapest way to pin the handoff.
  const Component = compile('const [n] = React.useState(7); return h("b", null, n)')
  const element = Component()
  assert.equal(element.type, 'b')
  assert.deepEqual(element.children, [7], 'the value came from the stub, so the stub reached the snippet')
})

test('h and React.createElement are the same function', function () {
  // The skill tells the model to use `h`; if they diverged, one of the two
  // spellings would be wrong and only half the cards would work.
  const Component = compile('return h === React.createElement')
  assert.equal(Component(), true)
})

test('a card can answer the model through interact(), and the text arrives verbatim', async function () {
  // THE CAPABILITY THAT MAKES A CARD A CONTROL PANEL. Without it a card can
  // only be read; every click a model drew is a dead end. `interact` is the
  // snippet's whole outbound surface, so it is asserted end to end: the text
  // the snippet passes is the text the bridge receives, unchanged except for
  // the trim the bridge itself performs.
  const seen = []
  const Component = compileCard({
    React: ReactStub,
    code: 'return interact',
    interact: async (text) => { seen.push(text) },
  })
  const send = Component()
  await send('  周一 3.5 小时 → 改成 4.0  ')
  assert.deepEqual(seen, ['周一 3.5 小时 → 改成 4.0'],
    'the bridge receives the message the snippet sent, trimmed and nothing else')
})

test('interact refuses an empty message instead of sending a blank turn', async function () {
  // An empty send would look like a successful click and produce nothing. The
  // bridge is async because the host's send is, so the refusal arrives as a
  // rejection — a synchronous `assert.throws` would pass over it silently.
  const Component = compileCard({
    React: ReactStub,
    code: 'return interact',
    interact: async () => {},
  })
  const send = Component()
  await assert.rejects(() => send('   '), /non-empty message/)
  await assert.rejects(() => send(null), /non-empty message/)
  await assert.rejects(() => send({ text: 'hi' }), /non-empty message/,
    'an object is not a message — only a string is')
})

test('a card with no bridge fails with a sentence, not "interact is not a function"', async function () {
  // A host without the conversation service is a degraded host, not a bug in
  // the model's snippet. The message says which one happened.
  const Component = compile('return typeof interact')
  assert.equal(Component(), 'function', 'interact is always callable')

  const failing = compileCard({ React: ReactStub, code: 'return interact' })
  await assert.rejects(() => failing()('hello'), /needs a host bridge/)
})

test('the bridge stays outside the trap list', function () {
  // `interact` sits between `h` and the traps in PARAMETERS. If it ever drifted
  // into the trap range, every card would lose its outbound channel while all
  // the masking tests still passed — the same failure shape as the React handoff
  // bug this file already documents.
  // `fetch` reports `function` because the trap IS a callable proxy — that is
  // what makes `fetch(...)` reach the apply trap and produce a teaching message
  // instead of "fetch is not a function". Presence, not the typeof value, is
  // what distinguishes a trap from the bridge: `interact` must not throw on a
  // MERE READ, while every masked global's operations do.
  // `fetch` and `window` are no longer traps — they are real, by design (see the
  // module header). `localStorage` still IS a trap, so it reports `function`.
  const Component = compile('return [typeof React, typeof h, typeof interact, typeof fetch, typeof localStorage].join(",")')
  assert.equal(Component(), 'object,function,function,function,function')
})

test('a card may use timers, window, document and fetch — the browser it needs', function () {
  // THE DELIBERATE LOOSENING. The first version masked all of these, which made
  // ordinary cards worse (no animation, no debounce, no responsive layout) to
  // defend against a caller who can already run `bash`. ZCode's Gen UI gives its
  // pages a real document and real timers; so does this one now.
  // Timers and fetch are platform facts in both Node and the page, so their
  // presence is asserted exactly. Browser-only names (`XMLHttpRequest`, `alert`,
  // `window`, `document`) are UNDEFINED under Node — this suite runs there — so
  // for those the only portable assertion is that they are not TRAPS: a trap is
  // a callable proxy that throws on use, while an absent global is plain
  // `undefined`. That distinction is what the loosening changed.
  const Component = compile(`
    return [typeof setTimeout, typeof setInterval, typeof fetch].join(',')`)
  assert.equal(Component(), 'function,function,function',
    'timers and fetch are real browser surface, not traps')

  for (const name of ['XMLHttpRequest', 'alert', 'window', 'document']) {
    const Probe = compile(`return typeof ${name}`)
    assert.equal(Probe(), 'undefined',
      `${name} must be left alone (undefined here, real in the page) rather than replaced by a trap`)

    // A trap is a CALLABLE PROXY: `new trap()` or `trap.x` throws the teaching
    // message. An unshadowed browser global under Node is simply absent, so
    // strict mode raises a plain ReferenceError. Asserting the *absence of the
    // teaching message* is the portable way to say "not masked" — the exact
    // error text differs between Node and the page, the distinction does not.
    const Value = compile(`return ${name}`)
    let outcome = 'returned'
    try {
      outcome = typeof Value()
    } catch (error) {
      assert.ok(!/is not available in a render_ui card/.test(String(error.message)),
        `${name} must not be masked — got the teaching message`)
      assert.match(String(error.message), /is not defined|ReferenceError/,
        `${name} should fail as an absent global, not as a trap`)
      outcome = 'reference-error'
    }
    assert.equal(outcome, 'reference-error',
      `${name} is absent under Node (undefined in a browser both ways), never a trap`)
  }
})

test('the scoped timer pair is handed to the snippet and cleans itself up', async function () {
  // `timers` is the one addition: it lets a card animate WITHOUT leaving work
  // behind, because the compiled component clears everything on unmount. The
  // test drives the real timer and then the real disposer.
  const fired = []
  // The snippet cannot close over a Node variable, so the probe is a global the
  // snippet calls by name. Deleted below even if an assertion throws.
  globalThis.__genuiProbe = (label) => fired.push(label)
  const Component = compileCard({
    React: ReactStub,
    code: `
      timers.every(function () { __genuiProbe('every') }, 5)
      return null`,
  })
  try {
    Component()
    await new Promise((resolve) => setTimeout(resolve, 18))
    const ran = fired.length
    assert.ok(ran > 0, 'the scoped timer must actually fire')
    assert.equal(typeof Component.dispose, 'function',
      'the compiled component exposes the disposer the frame calls on unmount')
    Component.dispose()
    const afterDispose = fired.length
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(fired.length, afterDispose,
      'after dispose() nothing may fire again — a leaked interval keeps pushing entries here')
  } finally {
    delete globalThis.__genuiProbe
  }
})

test('every masked name throws with guidance that names the alternative', function () {
  // One row per masked global. A new entry in REDIRECTS without a row here is a
  // rule the model never gets told about, so the table is asserted whole.
  //
  // The list is SHORT on purpose (see the module header): only names that can
  // damage the HOST are masked. Anything that merely makes a card harder would
  // be over-reach, and the previous sixteen-entry version proved it.
  const cases = [
    ['localStorage', /must not touch the host's storage/, 'localStorage.getItem("k")'],
    ['sessionStorage', /must not touch the host's storage/, 'sessionStorage.getItem("k")'],
    ['indexedDB', /must not touch the host's storage/, 'indexedDB.open("db")'],
    ['require', /no module loading/, 'require("fs")'],
    ['Function', /nested evaluation/, 'Function("return 1")'],
  ]
  for (const [name, pattern, expression] of cases) {
    const Component = compile(`return ${expression}`)
    assert.throws(
      () => Component(),
      (error) => {
        assert.match(error.message, new RegExp(`${name} is not available in a render_ui card`),
          `${name} must be masked by name`)
        assert.match(error.message, pattern, `${name}'s message must carry its own guidance`)
        return true
      },
      `${name} should throw when a snippet uses it as ${expression}`,
    )
  }
})

test('a bare identifier read returns the trap instead of throwing — a documented limit', function () {
  // WHY THIS IS A TEST AND NOT A WISH. JavaScript gives no hook for "this name
  // was evaluated", so shadowing a parameter cannot intercept `return X`; the
  // proxy is handed back untouched. Every OPERATION on it still throws (asserted
  // above), and a proxy is not a valid React child, so a card that returns one
  // still fails visibly rather than silently rendering nothing.
  //
  // If this test ever starts failing because the read throws, the limit is gone
  // and the module comment must be updated with it.
  const Component = compile('return localStorage')
  const value = Component()
  assert.equal(typeof value, 'function', 'the trap is a callable proxy')
  assert.throws(() => value.getItem('k'), /localStorage is not available in a render_ui card/,
    'and every use of it still throws')
})

test('a property read on a masked global throws the same redirect', function () {
  // `localStorage.length` is the spelling a snippet uses when it inspects the
  // store; a plain `undefined` would produce "undefined is not a function" and
  // teach nothing.
  const Component = compile('return localStorage.length')
  assert.throws(() => Component(), /localStorage is not available in a render_ui card/)
})

test('globalThis reaches a masked name, and the mask still wins', function () {
  // THE BYPASS STILL EXISTS IN PRINCIPLE and is tested where it matters: reading
  // `globalThis.localStorage` gets the REAL storage object, because `globalThis`
  // is no longer a masked parameter (masking it only pushed the same reach one
  // hop out, and it broke ordinary `globalThis` code for no gain). What must
  // hold is that the name a snippet is TOLD not to use throws — and this asserts
  // the honest framing rather than a false guarantee:
  //
  //   - the direct spelling (`localStorage.getItem`) is masked;
  //   - the indirect spelling (`globalThis.localStorage`) is not.
  //
  // A snippet written in good faith uses the first. The second is the documented
  // limit of a lexical guard, and the module header says so.
  const direct = compile('return localStorage.getItem("k")')
  assert.throws(() => direct(), /localStorage is not available in a render_ui card/)

  // The indirect path is NOT asserted to reach storage, because under Node there
  // is none to reach. What is asserted is the shape of the limit: `globalThis`
  // is a real object, not a trap, so a snippet can go around the lexical mask.
  // Stating that honestly is the point — a guard that claimed otherwise would
  // be the kind of promise this repository has already been burned by.
  const indirect = compile('return typeof globalThis')
  assert.equal(indirect(), 'object', 'globalThis is reachable (documented limit)')
})

test('eval is NOT masked, and that is a documented limit rather than an oversight', function () {
  // Strict mode forbids `eval` as a binding name, so it cannot be a parameter.
  // Giving up strict mode to hide it would be a bad trade: strict mode is what
  // stops `leaked = 1` from attaching to the page. A snippet is already
  // arbitrary code, so a second evaluation grants nothing new.
  //
  // This test exists so the limit is visible and cannot silently regress into
  // "we forgot": if a future change DOES mask eval, this test fails and the
  // module comment must be updated with it.
  const Component = compile('return typeof eval')
  assert.equal(Component(), 'function')
})

test('JSX fails to compile with a message that names JSX', function () {
  // The single most common mistake. The engine's own SyntaxError talks about a
  // position in a string the model cannot see, so the text is rewritten.
  const outcome = tryCompileCard({ React: ReactStub, code: 'return <div>hi</div>' })
  assert.equal(outcome.ok, false)
  assert.match(outcome.message, /did not parse/)
  assert.match(outcome.message, /JSX is not available/)
  assert.match(outcome.message, /React\.createElement/, 'the message must name the fix')
})

test('a genuine syntax error is reported, not swallowed', function () {
  const outcome = tryCompileCard({ React: ReactStub, code: 'return (((' })
  assert.equal(outcome.ok, false)
  assert.match(outcome.message, /did not parse/)
})

test('a snippet that throws at render is the error boundary\'s problem, not the compiler\'s', function () {
  // Compilation succeeds — the snippet is valid JavaScript. The throw happens
  // when the component renders, which is exactly what the boundary catches, so
  // `tryCompileCard` must NOT pre-run the body.
  const outcome = tryCompileCard({ React: ReactStub, code: 'throw new Error("boom at render")' })
  assert.equal(outcome.ok, true, 'a throwing body must still compile')
  assert.throws(() => outcome.Component(), /boom at render/, 'and throw only when rendered')
})

test('the compiled component is a component-shaped function', function () {
  // It takes no required parameters and returns elements, which is what lets
  // React own the lifecycle and makes hooks legal inside it.
  const outcome = tryCompileCard({ React: ReactStub, code: 'return h("span", null, "ok")' })
  assert.equal(outcome.ok, true)
  assert.equal(typeof outcome.Component, 'function')
  assert.equal(outcome.Component.length, 0, 'a component takes no required parameters')
})

test('the compiled component does not leak an implicit global', function () {
  // `'use strict'` in the generated wrapper: without it, `leaked = 1` inside a
  // snippet would attach to the page's global object and survive the card.
  const Component = compile('leakedFromGenUiCard = 1; return null')
  assert.throws(() => Component(), /leakedFromGenUiCard is not defined/)
  assert.equal(typeof globalThis.leakedFromGenUiCard, 'undefined')
})

test('a missing React fails loudly at compile time, not silently at render', function () {
  // The bug that prompted this test: the instance was read from module scope.
  // Passing `undefined` re-creates the old condition, and it must be visible.
  assert.throws(
    () => compileCard({ React: undefined, code: 'return null' }),
    /React/,
    'a missing React instance must not compile into a component that throws later',
  )
})
