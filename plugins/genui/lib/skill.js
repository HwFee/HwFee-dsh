/**
 * The built-in `generative-ui` skill body.
 *
 * WHY THIS IS THE MOST IMPORTANT FILE IN THE PLUGIN. The tool description says
 * "make a card when the answer is the artifact"; that is a criterion, not an
 * instruction the model can act on. A model that gets only the tool schema will
 * (a) reach for the card too often, turning every reply into a widget, or
 * (b) write `fetch(...)` or JSX and get a blank card with no idea why.
 *
 * So this file carries the three things the schema cannot:
 *   1. the judgment rule — when prose beats a card,
 *   2. the sandbox rules — what is masked and what to do instead,
 *   3. the styling rules — which tokens to use so a card matches the host in
 *      both light and dark mode without the model guessing a palette.
 *
 * It is written for an agent reader: imperative, specific, no marketing.
 *
 * @module @hwfee/dsh-genui/skill
 */

/** Kebab-case skill name; the registry rejects anything else. */
export const SKILL_NAME = 'generative-ui'

const CONTENT = `# Generative UI cards

You can answer with a live interface instead of prose by calling \`render_ui\`.
This skill covers when that is the right call, how the snippet is executed, and
how to make it look like it belongs in the app.

## When to draw one

**Reach for it proactively.** When an answer would be clearer to LOOK AT than to
read — you do not need to be asked. The opposite error is just as common: a card
where a sentence or a table would have done.

### The test

Draw a card only when BOTH are true:

1. **The user needs to see or explore it in the conversation.** Not "the content
   happens to contain numbers or structure" — that is not enough.
2. **Seeing it materially improves the answer** over one or two sentences.

### Draw one for

- numbers across categories where the shape matters (a breakdown, a trend, a
  distribution) — not a single number
- something the user should operate before deciding: a form, a picker, a
  simulator, a config toggler
- structure that prose flattens: a timeline, a before/after, a state machine,
  a dependency graph with many edges

### Do not draw one for

- **A request for a file, a website, an app page, a component, or a change to
  the project.** Even when the deliverable contains charts or interactivity,
  that is ordinary work with tools — write the code into the project. It is not
  an in-conversation card.
- **A plain table.** When the user asks for a table, return a Markdown table in
  your reply. A table is already the right shape; wrapping it in a card adds
  nothing.
- **A static structure that labeled nodes and edges explain.** A diagram whose
  nodes and arrows carry all the meaning is a bulleted list with arrows — write
  it as a list, or use the host's Mermaid fenced block if it really is a graph.
- **Plain explanation, steps, code, greetings, apologies, summaries.** Those are prose.
  An explanation with useful adjustable parameters can use a simulator or chart.
  A card that restates your own paragraph is the most common failure.
- **One number, or two numbers to compare in a sentence.** Write the sentence.

### The fallback ladder, cheapest first

Before reaching for a card, ask whether a cheaper form already answers it:

| Form | Use when |
|---|---|
| a sentence | the answer is one fact, one comparison, or one recommendation |
| a Markdown table | the user asked for a table, or rows of text need aligning |
| Mermaid (fenced, host-rendered) | a static graph whose labels and edges say everything |
| a card | the user must SEE or EXPLORE it, and only then |

A card earns its cost only when interaction or visual shape carries information
that text cannot. One card per turn is the practical ceiling; two compete for the
same attention.

The sharpest single question: **would the user want to change something on it,
or read a value out of a shape?** If neither, you are drawing a picture of your
own paragraph — write the paragraph.

### After you draw one: do not repeat the card in prose

The card IS the answer. Around it, write at most ONE short sentence — a lead-in
before it ("Here is the comparison, adjustable:") or a conclusion the card
cannot show. Do **not**:

- list the same numbers, labels or rows again in text,
- describe what the card looks like ("the card shows three tabs…"),
- add a second summary after the card that restates it.

If the card has tabs, the tabs already organise the content — do not narrate
what each tab contains. The reply text is the frame around the card, not a
transcript of it.

## Start with the built-in ui kit

The frame provides six tested React components in \`ui\`. They inherit theme,
resize to the conversation width, and work without imports or network requests.
Prefer them to rebuilding a chart or control from DOM nodes. Keep ordinary \`h\`
code for layouts and interfaces these components do not cover.

| Component | Props |
|---|---|
| \`ui.BarChart\` | \`data: [{label: string, value: number}]\`, \`label\`, optional \`unit\`, \`onSelect(item, index)\`, \`emptyText\`. Click a bar to select it; negative values use a shared zero axis. |
| \`ui.LineChart\` | Same props; hover, focus or click a point to read its value. |
| \`ui.Metric\` | \`label\`, \`value\`, optional \`detail\`. Use inside a larger answer, not a card for one number alone. |
| \`ui.Tabs\` | \`items: ['Monthly','Yearly']\` or \`[{label,value}]\`, \`value\`, \`onChange(value)\`, optional \`label\`. A selectable button group; caller renders the chosen content. |
| \`ui.Select\` | \`label\`, \`options\` (strings or \`{label,value}\`), \`value\`, \`onChange(value)\`. Values are strings. |
| \`ui.Range\` | \`label\`, numeric \`value\`, \`onChange(number)\`, optional \`min\`, \`max\`, \`step\`, \`unit\`. |

Example: an adjustable scenario with a real chart, not a static drawing:

\`\`\`js
const [growth, setGrowth] = React.useState(6)
const [view, setView] = React.useState('Trend')
const data = Array.from({length: 6}, (_, i) => ({
  label: 'Year ' + (i + 1), value: 100 * Math.pow(1 + growth / 100, i + 1)
}))
return h('div', {style: {display: 'grid', gap: 20}},
  h(ui.Range, {label: 'Annual growth', value: growth, min: -20, max: 30, unit: '%', onChange: setGrowth}),
  h(ui.Tabs, {items: ['Trend', 'Compare'], value: view, onChange: setView, label: 'Chart view'}),
  h(view === 'Trend' ? ui.LineChart : ui.BarChart, {label: 'Illustrative growth scenario', data}))
\`\`\`

This example is illustrative data. For actual user data, fetch/read it with host
tools first, then embed that data in the code. Never present a scenario as a fact.
Local chart/view/range changes stay local; do not call \`interact\` for each hover,
slider movement or tab switch. Use \`interact\` only for an explicit action that
should continue the conversation, such as 'Use this configuration'.

## What the code is

\`code\` is the **body of a function component**. It returns a React element. It
may call hooks — \`React.useState\`, \`React.useMemo\`, \`React.useCallback\`,
\`React.useRef\` — because it runs as a component, not as a one-shot expression.

\`\`\`js
const [open, setOpen] = React.useState(false)
return h('div', { style: { padding: 16 } },
  h('button', { onClick: () => setOpen(!open) }, open ? 'Hide' : 'Show'),
  open && h('p', null, 'Now you see it.'))
\`\`\`

**No JSX.** The snippet is evaluated as plain JavaScript, so JSX would be a
syntax error. Use \`h\` (an alias for \`React.createElement\`) or
\`React.createElement\` directly.

## Answering back: \`interact\`

The snippet receives one extra function, \`interact(text)\`. Call it when the user
does something that should change the conversation — a choice, a submission, a
reset.

**It does not send. It asks.** The host shows \`text\` under the card with a
confirmation button, and only the user's click puts the message into the
conversation. So the text must read as a complete sentence the user would be
willing to send:

\`\`\`js
const [choice, setChoice] = React.useState(null)
return h('div', null,
  ['fast', 'balanced', 'thorough'].map((mode) =>
    h('button', {
      key: mode,
      onClick: () => { setChoice(mode); interact('Use ' + mode + ' mode.') },
    }, mode)),
  choice !== null && h('p', null, 'Selected: ' + choice))
\`\`\`

Rules for using it:

- **A control that changes nothing is a lie.** Every button, toggle, or form in a
  card must either change what is on screen (\`React.useState\`) or call
  \`interact\` — ideally both, so the user sees the choice land immediately.
- **Say what happened, in the user's voice.** \`interact('Set the range to 7 days')\`
  reads as a user instruction. \`interact('{"range":7}')\` makes the next turn
  guess. Write one short imperative sentence, and include the values.
- **One request at a time.** While an earlier request is waiting for the user,
  another \`interact\` is ignored. Ask for one decision, not a stream.
- **Do not use it for narration.** It is a message to the conversation, and there
  is no "just log this". If nothing should happen on the next turn, use state.
- **Do not call it from render or from a timer.** The user has to confirm it, and
  a request that appears without a click reads as the card acting on its own.
- A host may not provide the bridge. Then the confirmation button is absent and
  nothing is sent; treat that as a host limitation, not a snippet bug.

## What the card runs inside

The snippet runs in its own **sandboxed frame** — a separate document with an
opaque origin. That changes what is available in ways worth knowing:

- **Timers work.** Use \`timers.set(fn, ms)\` and \`timers.every(fn, ms)\` — they
  are your own, and they are cleared automatically when the card unmounts.
  (\`setTimeout\` and \`setInterval\` also work, but nothing clears those for you,
  and the row is recycled constantly: prefer the scoped pair.)
- **\`window\` and \`document\` are YOURS**, not the host's. Reading
  \`window.innerWidth\` for a responsive layout is fine. You cannot reach the
  app's DOM, its storage or its cookies — a cross-origin frame refuses those — and
  the card is sized from its own content, so do not set a fixed height.
- **There is no network.** The frame's Content-Security-Policy blocks \`fetch\`,
  \`XMLHttpRequest\`, WebSocket and remote images. Inline the data you already
  have; a card that waits on a request renders a loading state forever.
- **Storage is not available.** \`localStorage\`, \`sessionStorage\` and
  \`indexedDB\` do not exist in the frame. Keep state in \`React.useState\`.
- **Theme tokens are supplied for you.** \`var(--dsw-alias-*)\` and the type/
  radius tokens resolve in the frame because the host hands the card a snapshot
  of its own computed theme; light and dark both work and follow a switch at
  runtime.

The snippet is re-evaluated every time the card mounts, so keep it cheap.
Anything that must survive a reload has to live in the session or a file, not in
the card.

## Styling

**Do not draw a container.** The answer already sits in the conversation, on the
same surface as the reply text around it. A background colour, a border, a
radius or a shadow on your root element makes it look like a widget pasted into
the chat instead of an answer, and it fights the theme: the container you draw
has to be updated for dark mode while the real one already is.

So the root is a bare layout element:

\`\`\`js
return h('div', { style: { display: 'grid', gap: 12 } }, ...)
\`\`\`

Only INNER blocks that group content may carry a surface: a highlighted callout,
a code sample, a quoted figure. Those use \`var(--dsw-alias-bg-layer-2)\` with
\`var(--dsw-radius-md)\`.

Text and accents, all through \`var(...)\`:

- \`var(--dsw-alias-label-primary)\` for body text; \`--dsw-alias-label-secondary\` for labels; \`var(--dsw-alias-label-tertiary)\` for captions
- \`var(--dsw-alias-border-l1)\` for hairlines between rows; \`var(--dsw-alias-border-l2)\` for stronger separators
- \`var(--dsw-alias-brand-primary)\` for the one accent: the primary value or the active item
- **Danger/positive TEXT** uses \`var(--dsw-alias-state-error-primary)\` /
  \`var(--dsw-alias-state-success-primary)\`. The \`--dsw-alias-code-diff-deleted\`
  and \`-added\` tokens are **translucent background fills** (roughly 8–14%
  alpha) for diff lines — using one as a \`color\` renders almost invisible: a
  "99.5%" headline came out as an 8%-opacity salmon that looked broken.
- \`var(--dsw-alias-link)\` for anything clickable that is not a button

Type and shape, in the host's own scale:

- **Inherit the base size.** The answer already sits at the conversation's body
  size. Setting a \`fontSize\` on the root makes the visual larger or smaller than
  the prose around it and reads as a foreign block.
- Labels: \`var(--dsh-content-font-size-secondary, 13px)\`; captions:
  \`var(--dsh-content-font-size-caption, 12px)\`; the one featured number:
  \`var(--dsw-font-xl-24)\` (a full font shorthand, so use it on \`font\` and never
  on \`font-size\`).
- Emphasis comes from WEIGHT, not size: \`600\` for a heading, \`400\` for body.
  Never introduce a size between the captions and the featured number.
- \`var(--dsw-radius-md)\` for inner blocks only; nothing else takes a radius.
- Font family is inherited; do not set it.
- \`prefers-reduced-motion\`: no motion at all, not merely slower motion.

Layout: you are inside a chat column. Design for ~600 px, let it wrap below
that, and never set a fixed \`height\` on the root; content sizes it, and the
conversation scrolls, not your block.

## Use the component classes

The card ships a complete design system, already themed. **Prefer these classes
to hand-written styles** — they are what makes a generated UI look like it was
built by the app rather than by a language model. They arrive as the host's own
token vocabulary and follow light/dark mode automatically.

Pass them as \`className\`. All of these exist:

| Class | Gives you |
|---|---|
| \`card\` | the ONE surface: a bordered panel for a numeric summary, a selected-item block, or a bounded field |
| \`btn\`, \`btn-primary\`, \`btn-secondary\`, \`btn-ghost\` | buttons; \`btn-xs\` / \`btn-sm\` / \`btn-lg\` for 20/24/32px heights (28px default) |
| \`viz-stat\`, \`viz-stat-value\` | a summary card's label + big value |
| \`viz-grid\`, \`viz-row\`, \`viz-controls\` | a responsive equal-column grid, a wrapping row, a control row |
| \`form-label\`, \`form-control\`, \`form-select\`, \`form-check\`, \`form-switch\`, \`form-range\` | the whole form vocabulary |
| \`nav nav-pills\` + \`nav-link\` | tabs (presentation only; wire selection with \`useState\`) |
| \`progress\` + \`progress-bar\` | a progress bar |
| \`table\`, \`table-sm\`, \`table-responsive\` | a quiet data table |
| \`text-small\`, \`text-muted\`, \`text-destructive\` | size and tone for secondary copy |
| \`tabular-nums\` | aligned numbers |
| \`viz-badge\` | a small display-only pill |
| \`viz-tile\` | a selectable cell for a dense grid |
| \`sr-only\` | screen-reader-only text |
| \`viz-dotted-background\` | a quiet dot grid behind a preview area |
| \`cursor-interaction\` | the host's link cursor; never hardcode \`cursor: pointer\` |

Chart series colours are CSS variables, not classes: \`--viz-series-1\` through
\`--viz-series-6\`. Use series 1 for one measure or the active state, and the rest
only when a category identity must persist across redraws. Never give every peer
a different colour by default, and pair colour with a label or shape.

### Rules for the classes

- **\`card\` is the only surface.** It is for a necessary summary or a bounded
  field — never the whole visual, never a wrapper around a chart, never nested.
- **Charts, tables, controls and diagrams stay unframed.** They sit directly on
  the conversation surface.
- **Use the matching class for every control.** Do not restyle a \`.btn\` or a
  \`.form-control\`; no custom heights, radii, borders or colours on them.
- **At most 2–3 summary cards**, near the top, only when the numbers matter.
  Never fill space with status cards or invented metrics.
- Keep the root a bare layout element (see the next section). A \`card\` inside a
  framed root is a box in a box.

### Recipes

Copy these shapes. Each one is the smallest correct use of the vocabulary.

**A number that changes with a control** — a summary card, the control, then the
value it drives:

\`\`\`js
const [rate, setRate] = React.useState(6)
return h('div', { style: { display: 'grid', gap: 16 } },
  h('div', { className: 'card viz-stat' },
    h('div', { className: 'text-muted text-small' }, '年化收益'),
    h('div', { className: 'viz-stat-value tabular-nums' }, (rate * 1.8).toFixed(1) + '%')),
  h('div', { className: 'viz-controls' },
    h('label', { className: 'form-label' }, '利率'),
    h('input', { className: 'form-range', type: 'range', min: 1, max: 12, value: rate,
      onChange: (e) => setRate(Number(e.target.value)) })))
\`\`\`

**A table the user asked to compare** — the table class, no card around it:

\`\`\`js
return h('table', { className: 'table table-sm' },
  h('thead', null, h('tr', null,
    h('th', null, '插件'), h('th', { className: 'text-end' }, '测试数'))),
  h('tbody', null, rows.map((r) => h('tr', { key: r.name },
    h('td', null, r.name),
    h('td', { className: 'text-end tabular-nums' }, r.tests)))))
\`\`\`

**Tabs over one dataset** — \`nav-pills\`, with selection in state (the class is
presentation only; you wire the state):

\`\`\`js
const [tab, setTab] = React.useState('by-version')
return h('div', { style: { display: 'grid', gap: 12 } },
  h('div', { className: 'nav nav-pills', role: 'tablist' },
    ['by-version', 'by-tests'].map((id) => h('button', {
      key: id, type: 'button', role: 'tab',
      className: tab === id ? 'nav-link active' : 'nav-link',
      'aria-selected': tab === id,
      onClick: () => setTab(id),
    }, id === 'by-version' ? '按版本' : '按测试数'))),
  h('table', { className: 'table' }, /* rows ordered by \`tab\` */))
\`\`\`

**Choosing between options** — buttons, one primary:

\`\`\`js
h('div', { className: 'viz-controls' },
  h('button', { type: 'button', className: 'btn btn-primary', onClick: () => interact('用保守方案') }, '保守'),
  h('button', { type: 'button', className: 'btn', onClick: () => interact('用激进方案') }, '激进'))
\`\`\`



## A complete example

\`\`\`js
const rows = [
  { label: 'Input', value: 412 },
  { label: 'Output', value: 1890 },
  { label: 'Cached', value: 3301 },
]
const total = rows.reduce((sum, row) => sum + row.value, 0)
return h('div', { style: { display: 'grid', gap: 10 } },
  h('div', { style: { fontSize: 'var(--dsw-font-xl-24)', color: 'var(--dsw-alias-label-primary)' } },
    total.toLocaleString(), ' tokens'),
  rows.map((row) =>
    h('div', { key: row.label, style: { display: 'grid', gridTemplateColumns: '64px 1fr 56px', gap: 10, alignItems: 'center' } },
      h('span', { style: { fontSize: 'var(--dsw-font-xs-13)', color: 'var(--dsw-alias-label-secondary)' } }, row.label),
      h('div', { style: { height: 6, borderRadius: 999, background: 'var(--dsw-alias-bg-layer-2)' } },
        h('div', { style: { width: (row.value / total) * 100 + '%', height: '100%', borderRadius: 999, background: 'var(--dsw-alias-brand-primary)' } })),
      h('span', { style: { fontSize: 'var(--dsw-font-xs-13)', color: 'var(--dsw-alias-label-tertiary)', textAlign: 'right' } }, row.value))))
\`\`\`

Note what the root is: a grid with no background, no border and no radius. The
only painted element is the progress track inside each row. That is the whole
rule — the answer should look like it was always there.

## Failure modes to avoid

- **JSX** — syntax error, blank card. Use \`h\`.
- **Hardcoded colors** — unreadable in one theme. Use tokens.
- **Fixed pixel height** — clips in a narrow column. Let content size it.
- **Repeating the card as prose** — say what to notice, not what is already on screen.
- **A card for a one-line answer** — write the line.
- **A dead control** — a control must change what the user sees or offer an
  explicit follow-up action. Local exploration needs no \`interact\` request.
- **A wall of nested divs** — a card is a summary surface. If it needs scrolling
  inside the card, the detail belongs in your reply.
`

/** The skill as the registry and the model see it. */
export const GENUI_SKILL = {
  /**
   * THE DESCRIPTION IS THE TRIGGER, so it carries the judgment, not just a topic.
   *
   * ZCode's `visualize` skill does the same thing, and it is worth copying the
   * shape: the description names the situations that call for a visual AND the
   * ones that do not ("a request for a file, website, app page or project change
   * is not an in-conversation visualization request"). A model reading only the
   * catalog line should be able to decide correctly, because a wrong "yes" is
   * as costly as a wrong "no".
   *
   * "Proactively use" matters: without it a model waits to be asked, and the
   * feature never fires on its own.
   */
  description:
    'Draw an interactive answer directly in the conversation instead of describing it in prose. '
    + 'Use it proactively when the user needs to SEE or EXPLORE the answer — numbers whose shape '
    + 'matters, something to operate (a form, picker, simulator, toggle), or structure prose '
    + 'flattens. Do NOT use it for a request that produces a file, website, app page or project '
    + 'change, for a plain table (return Markdown), for a static graph Mermaid already explains, '
    + 'or for one number you can say in a sentence. Carries the snippet contract, the sandbox '
    + 'rules, the theme tokens, and the failure modes that produce a blank card.',
  whenToUse:
    'Before the first `render_ui` call in a session, and whenever a card came back blank, '
    + 'wrong-sized, or unreadable in dark mode.',
  content: CONTENT,
}
