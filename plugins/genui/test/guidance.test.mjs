import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'
import { UI_GUIDANCE, uiPromptSection } from '../lib/guidance.js'

function context({ withPrompt = true, withSkills = false } = {}) {
  const sections = new Map(), tools = new Map(), disposers = []
  const ctx = {
    tools: { register(tool) { assert.ok(!tools.has(tool.name)); tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
    get(name) {
      if (name === 'systemPrompt' && withPrompt) return { section(section) {
        assert.ok(!sections.has(section.name)); sections.set(section.name, section); return () => sections.delete(section.name)
      } }
      if (name === 'skills' && withSkills) return { registerProvider() { return () => {} } }
      return undefined
    },
    effect(fn) { disposers.push(fn()) },
  }
  return { ctx, sections, tools, stop() { for (const off of disposers.splice(0).reverse()) off?.() } }
}

test('proactive guidance reaches prompt assembly even when the skill provider is absent', () => {
  const c = context(); apply(c.ctx)
  assert.equal(c.sections.size, 1); assert.equal(c.tools.size, 1)
  const section = [...c.sections.values()][0]
  assert.deepEqual(section, uiPromptSection())
  assert.match(section.text, /Do not wait/); assert.match(section.text, /ui.BarChart/)
  assert.match(section.text, /Local exploration needs no chat message/)
  assert.ok(section.order >= 100 && section.order < 200)
  assert.ok(!section.complete, 'augment the host prompt; never replace the persona')
})

test('disable and re-enable leave no duplicate sections or tools; minimal hosts retain the tool', () => {
  for (const withPrompt of [true, false]) {
    const c = context({ withPrompt })
    apply(c.ctx); c.stop(); assert.equal(c.sections.size, 0); assert.equal(c.tools.size, 0)
    apply(c.ctx); assert.equal(c.tools.size, 1); c.stop()
  }
})

test('the guidance has clear fallbacks and does not require another model call', () => {
  assert.match(UI_GUIDANCE, /Markdown/); assert.match(UI_GUIDANCE, /Mermaid/)
  assert.match(UI_GUIDANCE, /project tools/); assert.match(UI_GUIDANCE, /unavailable, answer normally/)
  assert.ok(!UI_GUIDANCE.includes('{{'), 'no accidental host prompt interpolation')
})
