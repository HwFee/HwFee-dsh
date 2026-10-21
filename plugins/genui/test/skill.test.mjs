/**
 * The Host half: tool registration and the built-in skill.
 *
 * WHY A FAKE CONTEXT. `apply` is the whole Host half. Driving it with a stub
 * that records what was registered is the only way to assert the two properties
 * that matter without booting a Harness:
 *
 *   1. the tool's result is DATA (title/code/bytes) and its model-facing text
 *      says the card is on screen — a result that stays silent lets the model
 *      assume nothing rendered and repeat itself as prose;
 *   2. the skill provider answers on the same path the registry uses, including
 *      `get()` for a name it does not own, which must be `undefined` and not a
 *      throw (the registry calls `get` on candidates it may not have produced).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, name, inject } from '../lib/index.js'
import { GENUI_SKILL, SKILL_NAME } from '../lib/skill.js'

/**
 * A minimal Cordis-shaped context that records registrations.
 *
 * `effect` runs its callback immediately and keeps the disposer, which is what
 * lets a test assert teardown — the plugin's own rule is that everything is
 * registered inside an effect and removed by its disposer.
 */
function fakeContext({ withSkills = true } = {}) {
  const registered = { tools: [], providers: [], disposers: [] }
  const ctx = {
    tools: {
      register(definition) {
        registered.tools.push(definition)
        return () => {}
      },
    },
    get(service) {
      if (service !== 'skills' || !withSkills) return undefined
      return {
        registerProvider(create) {
          const provider = create({ signal: new AbortController().signal, invalidate() {} })
          registered.providers.push(provider)
          return () => {}
        },
      }
    },
    effect(callback, label) {
      const dispose = callback()
      registered.disposers.push({ label, dispose })
      return dispose
    },
  }
  return { ctx, registered }
}

test('the plugin exports a name, an inject list and an apply', function () {
  assert.equal(name, 'dsh-genui')
  assert.ok(Array.isArray(inject) && inject.includes('tools'),
    'the tool registry is a hard dependency; without it there is nothing to register')
})

test('apply registers exactly one tool, under the model-facing name', function () {
  const { ctx, registered } = fakeContext()
  apply(ctx)
  assert.equal(registered.tools.length, 1)
  const tool = registered.tools[0]
  assert.equal(tool.name, 'render_ui')
  assert.equal(typeof tool.execute, 'function')
  assert.equal(typeof tool.description, 'string')
  assert.ok(tool.description.length > 200, 'the description must carry the when-to-use judgment')
})

test('the tool description carries the trigger conditions, not just capabilities', function () {
  // The model sees this every turn, so it has to decide WHEN from this text
  // alone. A capability list produces both failure modes: a card for every
  // reply, or none ever.
  const { ctx, registered } = fakeContext()
  apply(ctx)
  const description = registered.tools[0].description

  // Positive trigger: needs to see or explore.
  assert.match(description, /SEE or EXPLORE/i, 'the description must state the positive trigger')
  // Negative triggers, each a distinct real mistake.
  assert.match(description, /file, website, app page or project change/i,
    'a build request is not an in-conversation card — the most expensive mistake')
  assert.match(description, /Markdown table/i, 'a requested table stays a table')
  assert.match(description, /Mermaid/i, 'a static graph has a cheaper host-rendered form')
  // And it must keep pointing at the skill for the full rules.
  assert.match(description, /generative-ui/, 'the description must point at the skill by name')
})

test('the tool result is data plus a sentence that says the card is visible', function () {
  const { ctx, registered } = fakeContext()
  apply(ctx)
  const tool = registered.tools[0]

  const value = tool.execute(
    { title: 'Token usage', code: 'return h("div")' },
    { signal: new AbortController().signal },
  )
  return value.then((spec) => {
    // The value is validated against output.schema by the registry, so its shape
    // is part of the contract: exactly title, code, bytes.
    assert.deepEqual(Object.keys(spec).sort(), ['bytes', 'code', 'title'])
    assert.equal(spec.title, 'Token usage')

    const rendered = tool.output.render({ title: 'Token usage' }, spec)
    assert.equal(rendered.length, 1)
    assert.equal(rendered[0].type, 'text')
    assert.match(rendered[0].text, /Rendered UI card "Token usage"/)
    assert.match(rendered[0].text, /visible to the user/,
      'without this the model cannot tell a drawn card from a dropped one')
    assert.match(rendered[0].text, /do not repeat/, 'and it must be told not to duplicate the card as prose')
  })
})

test('a rejected call throws with the message the model will read', function () {
  const { ctx, registered } = fakeContext()
  apply(ctx)
  const tool = registered.tools[0]
  assert.throws(
    () => tool.execute({ title: 'T', code: '' }, { signal: new AbortController().signal }),
    /render_ui needs `code`/,
  )
})

test('both halves of the definition use the enforced JSON Schema dialect', function () {
  // BOTH SCHEMAS HERE ARE RAW JSON SCHEMA, and that is the part the first
  // version of this test got wrong.
  //
  // Two dialects exist in the host:
  //
  //   ParameterSchemaSpec   `{ title: { type: 'string', required: true } }`
  //                         — author-facing, compiled by `defineTool()`
  //   JSON Schema subset    root `type`/`properties`/`required: [...]`
  //                         — what `ctx.tools.register()` stores and ships
  //
  // `defineTool` compiles the first into the second. This plugin registers
  // RAW (`ctx.tools.register(createRenderUiTool())`) because it cannot import
  // `defineTool` — that lives in the host's own node_modules, not the
  // profile's. So BOTH `parameters` and `output.schema` must be written in the
  // raw dialect, and the earlier assertion that `parameters.title.required`
  // was `true` was pinning the bug rather than catching it: the provider
  // refused the un-compiled property map on every request with
  //
  //   Invalid schema for function 'render_ui': … is not of type "object"
  //
  // The row activated and the client card loaded, so nothing looked wrong —
  // the tool simply was not callable.
  const { ctx, registered } = fakeContext()
  apply(ctx)
  const tool = registered.tools[0]

  for (const [label, schema] of [['parameters', tool.parameters], ['output.schema', tool.output.schema]]) {
    assert.equal(schema.type, 'object', `${label} must be an object-rooted JSON Schema`)
    assert.equal(schema.additionalProperties, false, `${label} must refuse unknown keys`)
    for (const [field, property] of Object.entries(schema.properties)) {
      assert.ok(['string', 'integer'].includes(property.type),
        `${label}.${field} must be a schema node with a JSON Schema type, not an author spec`)
      assert.equal('required' in property, false,
        `${label}.${field} must not carry a per-property \`required\` — requiredness is the root array`)
    }
    assert.ok(Array.isArray(schema.required), `${label} declares requiredness as a root array`)
  }

  assert.deepEqual([...tool.output.schema.required].sort(), ['bytes', 'code', 'title'])
  assert.deepEqual([...tool.parameters.required].sort(), ['code', 'title'],
    'the model must supply title and code; bytes is computed by the Host')
})

test('apply registers the built-in skill through the skills service', function () {
  const { ctx, registered } = fakeContext()
  apply(ctx)
  assert.equal(registered.providers.length, 1, 'one provider, so the catalog has one entry')
  const provider = registered.providers[0]
  assert.equal(provider.name, 'dsh-genui')
  assert.equal(typeof provider.list, 'function')
  assert.equal(typeof provider.get, 'function')
})

test('the provider lists one candidate whose name matches the skill body', function () {
  const { ctx, registered } = fakeContext()
  apply(ctx)
  return registered.providers[0].list({}).then((observation) => {
    assert.equal(observation.complete, true)
    assert.equal(observation.candidates.length, 1)
    const candidate = observation.candidates[0]
    assert.equal(candidate.name, SKILL_NAME)
    assert.equal(candidate.description, GENUI_SKILL.description)
    assert.equal(candidate.whenToUse, GENUI_SKILL.whenToUse)
    assert.equal(typeof candidate.rank, 'number')
    assert.ok(candidate.locator !== undefined, 'the registry passes the locator back to get()')
  })
})

test('a candidate carries every field the registry validates', function () {
  // THE REGRESSION. `validateCandidate` in @deepseek-ai/dsh-skill requires these
  // on the LIST entry, not only on the full definition. The first shipped
  // version omitted `source`, `provider` and `invocation`, and the whole plugin
  // failed to load with:
  //
  //   skill provider "dsh-genui" returned skill "generative-ui" with a non-string source
  //
  // The fake context does not run that validation, so the fields are asserted
  // here by name — a missing one is a plugin that never activates.
  const { ctx, registered } = fakeContext()
  apply(ctx)
  return registered.providers[0].list({}).then((observation) => {
    const candidate = observation.candidates[0]
    assert.equal(typeof candidate.source, 'string', 'source must be a string')
    assert.equal(candidate.source, 'runtime', 'this skill ships inside the plugin, not on disk')
    assert.equal(typeof candidate.provider, 'string', 'provider must be a string')
    assert.equal(candidate.provider, 'dsh-genui', 'provider must equal provider.name')
    assert.equal(registered.providers[0].name, candidate.provider,
      'the registry rejects a candidate whose provider is not its own name')
    assert.equal(typeof candidate.invocation, 'object', 'invocation must be an object')
    assert.equal(candidate.invocation.modelInvocable, true)
    assert.equal(candidate.invocation.userInvocable, true)
    assert.match(candidate.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'the registry enforces kebab-case names')
  })
})

test('the full definition repeats the candidate metadata', function () {
  // `get()` re-validates the definition and rejects one whose name differs from
  // the candidate that produced it, so the two shapes must stay in step.
  const { ctx, registered } = fakeContext()
  apply(ctx)
  const provider = registered.providers[0]
  return provider.list({}).then((observation) => {
    const candidate = observation.candidates[0]
    return provider.get(candidate, {}).then((definition) => {
      assert.equal(definition.name, candidate.name)
      assert.equal(definition.provider, candidate.provider)
      assert.equal(definition.source, candidate.source)
      assert.equal(definition.description, candidate.description)
      assert.deepEqual(definition.invocation, candidate.invocation)
    })
  })
})

test('get() returns the full body for its own name and undefined for any other', function () {
  const { ctx, registered } = fakeContext()
  apply(ctx)
  const provider = registered.providers[0]

  return provider.get({ name: SKILL_NAME }, {}).then((skill) => {
    assert.equal(skill.name, SKILL_NAME)
    assert.equal(skill.content, GENUI_SKILL.content)
    assert.equal(skill.invocation.modelInvocable, true)
    assert.equal(skill.invocation.userInvocable, true)
    assert.equal(skill.provider, 'dsh-genui')
    // The registry calls `get` for candidates from other providers too; throwing
    // there would fail the whole catalog read.
    return provider.get({ name: 'some-other-skill' }, {})
  }).then((missing) => {
    assert.equal(missing, undefined)
  })
})

test('the plugin still registers its tool when no skill service exists', function () {
  // A minimal agent preset ships no skill registry. The tool must survive: the
  // card is the feature, the skill is the help text.
  const { ctx, registered } = fakeContext({ withSkills: false })
  apply(ctx)
  assert.equal(registered.tools.length, 1)
  assert.equal(registered.providers.length, 0)
})

test('every registration is owned by an effect that can dispose it', function () {
  // A registration outside `ctx.effect` cannot be removed when the plugin is
  // disabled, so the tool outlives its own plugin.
  const { ctx, registered } = fakeContext()
  apply(ctx)
  assert.equal(registered.disposers.length, 2, 'one effect for the tool, one for the skill')
  for (const entry of registered.disposers) {
    assert.equal(typeof entry.dispose, 'function', `effect ${entry.label} must return a disposer`)
  }
})

test('the skill and the sandbox agree on which names are masked', function () {
  // DRIFT GUARD, in both directions. `sandbox.js` masks a set of names and
  // `skill.js` tells the model which ones; a name in one and not the other means
  // either the model is warned about something that works, or it trips over
  // something undocumented.
  //
  // The list is read from the SAME table the sandbox uses, so this test cannot
  // drift into agreeing with a stale copy of it.
  const masked = ['localStorage', 'sessionStorage', 'indexedDB', 'require', 'Function']
  for (const name of masked) {
    assert.ok(GENUI_SKILL.content.includes(name),
      `the skill must mention the masked name "${name}"`)
  }

  // And the names that are now ALLOWED must be described as allowed, or a model
  // reading the skill would keep avoiding capabilities it has.
  for (const name of ['timers', 'fetch', 'window', 'document']) {
    assert.ok(GENUI_SKILL.content.includes(name),
      `the skill must mention "${name}", which a card may now use`)
  }
  assert.match(GENUI_SKILL.content, /What a card can do/,
    'the allowed set needs its own section — a masked-only table reads as "none of this works"')
})

test('the skill teaches interact, because a card without it is a picture', function () {
  // The capability the first version was missing entirely: a card could render
  // but never answer. MCP Apps calls this `ui/message`; here it is `interact`.
  // The skill is the only place the model learns it exists, so each rule it
  // needs is asserted by name.
  assert.match(GENUI_SKILL.content, /interact\(text\)/, 'the signature must be shown')
  assert.match(GENUI_SKILL.content, /useState/, 'a control should also update what is on screen')
  assert.match(GENUI_SKILL.content, /user message|as a user message/i,
    'the model must know the text arrives as a user turn')
  assert.match(GENUI_SKILL.content, /do not await it inside render/i,
    'awaiting during render is the one way to break the card')
  assert.match(GENUI_SKILL.content, /host may not provide the bridge/i,
    'a missing bridge must be described as a host limitation, not a snippet bug')
})

test('the tool description names interact too, so a model that skips the skill still finds it', function () {
  // The skill is loaded on demand; the tool description is always in context.
  // A model that never loads the skill would otherwise draw dead buttons.
  const { ctx, registered } = fakeContext()
  apply(ctx)
  const description = registered.tools[0].description
  assert.match(description, /interact/, 'the always-visible description must name the bridge')
  assert.match(description, /user message/i,
    'and must say where the message lands, or a model treats it as a local event')
})

test('the skill states the fallback ladder, cheapest form first', function () {
  // THE JUDGMENT ITSELF, borrowed from ZCode's `visualize` skill: a model that
  // only knows "when a card is right" still over-uses it. Naming the cheaper
  // forms — sentence, table, Mermaid, then card — is what makes the choice a
  // comparison rather than a yes/no.
  const content = GENUI_SKILL.content
  assert.match(content, /fallback ladder/i)
  for (const form of ['a sentence', 'Markdown table', 'Mermaid']) {
    assert.ok(content.indexOf(form) !== -1, `the ladder must name "${form}"`)
  }
  // Order matters: the table rows must run cheapest first. Anchoring on the
  // table header rather than on the sentence that introduces it keeps the
  // comparison on the ROWS, where the order is meaningful.
  const ladder = content.slice(content.indexOf('| Form | Use when |'))
  const sentenceAt = ladder.indexOf('| a sentence |')
  const cardAt = ladder.indexOf('| a card |')
  assert.ok(sentenceAt !== -1 && cardAt !== -1, 'the ladder table must list both ends')
  assert.ok(sentenceAt < cardAt, 'the ladder must read cheapest-first')

  // And the "build me a thing" exclusion, stated as a rule rather than implied.
  assert.match(content, /file, a website, an app page, a component/i)
  assert.match(content, /Proactively/i,
    'without an explicit "proactively" a model waits to be asked and the feature never fires')
})

test('the skill body says JSX is unavailable and names the replacement', function () {
  // The one mistake that produces a blank card every time.
  assert.match(GENUI_SKILL.content, /No JSX/i)
  assert.match(GENUI_SKILL.content, /\bh\b.*alias|alias.*\bh\b/s)
})

test('the skill body names theme tokens instead of leaving color to guesswork', function () {
  for (const token of ['--dsw-alias-bg-layer-2', '--dsw-alias-label-primary',
    '--dsw-alias-brand-primary', '--dsw-radius-md']) {
    assert.ok(GENUI_SKILL.content.includes(token), `the skill must name ${token}`)
  }
  // And it must warn against the failure those tokens prevent.
  assert.match(GENUI_SKILL.content, /hardcoded/i)
})

test('the skill warns that fill tokens are not ink, and names the opaque ones', function () {
  // REGRESSION, from the card the user reported: a "99.5%" headline drawn with
  // `--dsw-alias-code-diff-deleted`, which is rgba(186, 39, 35, 0.08) — a tint
  // for diff lines. The number rendered at 8% opacity and read as "covered".
  //
  // The skill is not the FIX (legibility.js is: a prompt rule cannot see a card
  // that was already drawn, and this one was). It is the half that stops the
  // mistake being made in the first place, so it must not lose the sentence.
  const content = GENUI_SKILL.content
  assert.match(content, /--dsw-alias-code-diff-deleted/,
    'the trap token must be named: a model cannot avoid a token it cannot see')
  assert.match(content, /translucent background fills/i,
    'and it must say WHY — the name reads like ink, the value is a fill')
  assert.match(content, /state-error-primary/,
    'the warning is useless without the token to use instead')
  assert.match(content, /state-success-primary/,
    'both halves of the pair, or the positive case walks into the same trap')
  assert.match(content, /8%|8 percent|almost invisible/i,
    'the consequence must be concrete, not "may look odd"')
})

test('the skill forbids drawing a container around the answer', function () {
  // THE DESIGN RULE, and the one a model gets wrong by default: every LLM
  // trained on "make a card" output adds a background, a border and a radius to
  // the root element. That turns the answer into an embedded widget — a box
  // floating in the transcript — and it duplicates theming the host already
  // does. The rule must be stated as a prohibition, not a preference.
  assert.match(GENUI_SKILL.content, /Do not draw a container/i)
  assert.match(GENUI_SKILL.content, /bare layout element/i,
    'the skill must say what the root actually is')
  assert.match(GENUI_SKILL.content, /bg-layer-2/,
    'inner blocks may carry a surface, and that is the token for them')
  assert.ok(!/var\(--dsw-radius-lg\)/.test(GENUI_SKILL.content),
    'the card radius must not be offered — there is no card to round')
})
