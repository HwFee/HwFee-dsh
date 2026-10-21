/**
 * The Host half of `@hwfee/dsh-genui`.
 *
 * It owns exactly two things, and neither of them touches the browser:
 *
 *   1. The `render_ui` tool. Its whole job is to validate the model's snippet
 *      and hand it back in a stable shape. The card itself is drawn by the
 *      client bundle, so the tool body must return data, not markup.
 *
 *   2. One built-in skill registered through `ctx.skills.registerProvider`.
 *      The skill is what makes the tool usable: a model that does not know when
 *      a card beats a paragraph will not reach for it, and a model that does not
 *      know the sandbox rules will write `fetch(...)` and get a blank card.
 *
 * WHY THE TOOL DOES NOT RENDER. `render_ui` is a tool call, so its result is a
 * session event. The visible card is a `tool.call.toolview` occupant in the
 * client, keyed by this tool's name (`key: 'render_ui'`). That separation is
 * what makes the card survive a reload and a fork: it is re-rendered from the
 * committed `argsRaw`, not from live plugin memory.
 *
 * @module @hwfee/dsh-genui
 */

import { buildUiSpec, MAX_CODE_BYTES, TOOL_NAME } from './spec.js'
import { GENUI_SKILL, SKILL_NAME } from './skill.js'

export const name = 'dsh-genui'

/**
 * `tools` and `skills` are both declared, but only `tools` is required for the
 * plugin to be useful — `apply` degrades to tool-only when the registry is
 * absent (a bare profile without `@deepseek-ai/dsh-skill`).
 */
export const inject = ['tools']

/**
 * Register the tool and, when a skill registry exists, the built-in skill.
 *
 * Everything is registered inside `ctx.effect` so a disable/HMR reload removes
 * both the tool and the provider. `registerProvider` hands back the exact
 * disposer that unregisters it, which is why the two live in one effect: a
 * half-disposed plugin would leave the skill catalog advertising a tool that
 * no longer exists.
 *
 * @param ctx host context carrying the tool registry
 */
export function apply(ctx) {
  const disposeTool = ctx.tools.register(createRenderUiTool())
  ctx.effect(() => () => {
    disposeTool()
  }, 'dsh-genui: render_ui tool')

  // The skill registry is optional. A profile that ships no skill service (a
  // minimal agent preset, a headless run) still gets the tool; the model then
  // relies on the tool description alone.
  const skills = typeof ctx.get === 'function' ? ctx.get('skills') : undefined
  if (skills === undefined || typeof skills.registerProvider !== 'function') {
    return
  }
  // `registerProvider` takes a FACTORY, not a provider: it invokes the factory
  // synchronously during apply, hands it this registration's lifecycle, and
  // registers what it returns. Passing a provider object instead compiles fine
  // and throws `create is not a function` on every profile startup.
  ctx.effect(() => skills.registerProvider(createSkillProvider), 'dsh-genui: built-in skill')
}

/**
 * The model-facing tool definition.
 *
 * `parameters.code` is a plain string rather than a structured component tree:
 * the whole point of this plugin is that the model may compose arbitrary React,
 * not that it picks from a fixed catalog. That freedom is why the client half
 * evaluates the snippet inside a restricted scope and wraps it in an error
 * boundary — see `client/src/sandbox.js`.
 *
 * @returns the `render_ui` tool definition
 */
function createRenderUiTool() {
  return {
    name: TOOL_NAME,
    description:
      // THE MODEL SEES THIS EVERY TURN, so it carries the trigger conditions —
      // the same ones the skill states in full. A description that only says
      // what the tool does makes a model guess when to use it, and the usual
      // guesses are both wrong: it fires on "make me a React component" (which
      // belongs in the project) or it never fires at all.
      'Draw an interactive answer directly in the conversation instead of describing it in prose. '
      + 'Use it when the user needs to SEE or EXPLORE the answer: numbers whose shape matters '
      + '(a breakdown, trend, distribution), something to operate (a form, picker, simulator, '
      + 'toggle), or structure that prose flattens (a timeline, before/after, state machine). '
      + 'Do NOT use it for: a request that produces a file, website, app page or project change '
      + '(write the code into the project instead); a plain table the user asked for (return a '
      + 'Markdown table); a static graph whose labeled nodes and edges already explain it (use a '
      + 'Mermaid fenced block or a list); or one number you can state in a sentence. '
      + 'The code is a JavaScript function body returning React elements, with `h` '
      + '(createElement), `interact(text)` to send a choice back as a user message, and scoped '
      + '`timers`. It runs in the page: no module loading, and storage APIs are blocked so a card '
      + 'cannot touch the settings the host owns. '
      + 'Load the `generative-ui` skill before your first call: it carries the whole judgment '
      + 'ladder, the styling rules, and the failure modes that produce a blank card.',
    // RAW JSON SCHEMA, NOT THE `defineTool` PARAMETER SPEC.
    //
    // `ctx.tools.register()` stores `parameters` as the wire schema and hands it
    // to the model provider verbatim (`schemaOf` in @deepseek-ai/dsh-tools). The
    // author-facing `{ title: { type, required: true } }` form is only legal
    // inside `defineTool()`, which compiles it through
    // `parameterSchemaSpecToJsonSchema` first — and this plugin cannot import
    // that helper (it lives in the host's own node_modules, not the profile's).
    //
    // Passing the author form here shipped a schema whose root was not an
    // object. Every session that loaded the tool failed at the FIRST REQUEST
    // with a provider 400:
    //
    //   Invalid schema for function 'render_ui':
    //   {"description":"…","required":true,"type":"string"} is not of type "object"
    //
    // so the tool was never callable and no card could ever be rendered.
    // `test/render-tool.test.mjs` now pins the compiled shape, so the two
    // dialects cannot be confused again.
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'code'],
      properties: {
        title: {
          type: 'string',
          description: 'Short card title shown above the UI, e.g. "Token usage by model".',
        },
        code: {
          type: 'string',
          description:
            'JavaScript body of a function that returns React elements. Build elements with '
            + '`React.createElement` or the provided `h` alias — JSX is NOT available. '
            + 'Style with the host theme tokens listed in the skill; do not hardcode colors.',
        },
        rationale: {
          type: 'string',
          description: 'One sentence on why this is a card rather than prose; shown in the card footer.',
        },
      },
    },
    output: {
      // TWO DIFFERENT SCHEMA DIALECTS MEET HERE, and mixing them fails at LOAD
      // time, not at call time: `JsonSchemaError: unsupported JSON schema`
      // aborts the whole entry, so the plugin silently never activates.
      //
      //   `parameters`    ParameterSchemaSpec — requiredness per property
      //                   (`{ type: 'string', required: true }`)
      //   `output.schema` the enforced JSON Schema subset — requiredness as a
      //                   ROOT array (`required: ['a', 'b']`), and per-property
      //                   `required` is rejected outright on a scalar type.
      //
      // `@deepseek-ai/dsh-tool-todo` demonstrates both in one definition, which
      // is where the difference is visible.
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'code', 'bytes'],
        properties: {
          title: { type: 'string' },
          code: { type: 'string' },
          bytes: { type: 'integer' },
        },
      },
      // The model sees this text as the tool result. It must confirm what was
      // drawn, because a card the user cannot see (a crash, a clipped snippet)
      // would otherwise read as success.
      render: (_args, value) => [{
        type: 'text',
        text: `Rendered UI card "${value.title}" (${value.bytes} bytes of code). `
          + 'The card is visible to the user; do not repeat the same content as prose.',
      }],
    },
    execute(args) {
      // `buildUiSpec` owns every validation rule, so the same function is what
      // the client half's contract tests exercise.
      const spec = buildUiSpec(args)
      return Promise.resolve(spec)
    },
    presentCall: (args) => ({
      card: 'generic',
      title: typeof args?.title === 'string' && args.title !== '' ? args.title : 'Render UI',
      kind: 'other',
    }),
  }
}

/**
 * The candidate metadata every provider must produce.
 *
 * `validateCandidate` in `@deepseek-ai/dsh-skill` requires all of these on the
 * LIST entry, not only on the full definition. A candidate carrying just
 * `name`/`description`/`rank`/`locator` throws
 *
 *   skill provider "dsh-genui" returned skill "generative-ui" with a non-string source
 *
 * and the whole plugin fails to load. That is the exact error this plugin hit on
 * its first install, which is why the shape lives in one constant that `list`
 * and `get` both spread: the two must agree, and the registry checks that they
 * do (`provider` must equal `provider.name`, and the definition's `name` must
 * equal the candidate's).
 *
 * `source` is the reserved `runtime` value: this skill ships inside the plugin
 * rather than on disk.
 */
const CANDIDATE = {
  name: SKILL_NAME,
  description: GENUI_SKILL.description,
  whenToUse: GENUI_SKILL.whenToUse,
  source: 'runtime',
  provider: 'dsh-genui',
  invocation: { modelInvocable: true, userInvocable: true },
}

/**
 * A provider is the thinnest possible adapter: one candidate, one body.
 *
 * `rank` is the registry's tie-breaker WITHIN a layer, and this is a runtime
 * skill registered by a host row, so it lands in the global layer. The value
 * matches the reserved runtime rank (250) — the registry's own choice for a
 * locally-registered skill — so a filesystem skill of the same name wins by
 * being a project/user entry rather than by a number this plugin picked.
 *
 * `list` returns the `{ candidates, complete }` observation rather than a bare
 * array: `complete: true` tells the registry it may cache the catalog, and a
 * provider that never completes makes every skill read re-collect.
 *
 * @returns the skill provider the registry expects
 */
function createSkillProvider() {
  return {
    name: CANDIDATE.provider,
    list: () => Promise.resolve({
      candidates: [{ ...CANDIDATE, rank: 250, locator: { source: 'dsh-genui' } }],
      complete: true,
    }),
    get: (candidate) => {
      if (candidate.name !== SKILL_NAME) return Promise.resolve(undefined)
      // The definition repeats the candidate fields and adds the body; the
      // registry re-validates it and rejects a definition whose `name` differs
      // from the candidate that produced it.
      return Promise.resolve({
        ...CANDIDATE,
        content: GENUI_SKILL.content,
        resourceBase: {
          kind: 'opaque',
          description: 'This skill is self-contained; it references no files.',
        },
      })
    },
  }
}

export { MAX_CODE_BYTES, TOOL_NAME }
