/** Stable, cacheable turn guidance; detailed recipes stay in the on-demand skill. */
export const UI_GUIDANCE = `## Interactive answers
When render_ui is available, proactively choose an inline interactive answer if it
materially helps the user understand or decide. Do not wait for the user to ask
for a card. Use it for exploring trends/distributions, comparing several options,
or an explanation that benefits from changing parameters and seeing the result.
A simulator, adjustable chart, selector or small calculator should work immediately
inside the answer. Prefer one focused interface with useful defaults.
Use ordinary prose for a quick fact, Markdown for a plain requested table, Mermaid
for a static graph, and project tools for a file, website, app page or code change.
Before your first render_ui call, read generative-ui when the skill is available.
The tool is also usable without the skill: code is a plain JavaScript function
body; return h(ui.BarChart, {data:[{label:'A',value:3},{label:'B',value:8}]}) for an
explorable chart. The ui kit also includes LineChart, Metric, Tabs, Select, Range.
Use React.useState for local changes. Local exploration needs no chat message.
Only call interact(text) when a choice should continue the conversation; the host
asks the user to confirm that message. Do not invent data or duplicate the UI's
contents in the surrounding prose. If render_ui is unavailable, answer normally.`

export function uiPromptSection() {
  return { name: 'dsh-genui:interactive-answers', order: 180, text: UI_GUIDANCE }
}
