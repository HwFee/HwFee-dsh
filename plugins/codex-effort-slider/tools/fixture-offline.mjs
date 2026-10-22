/**
 * Offline fixture: the REAL build artifact (`client/client.js`) driven against a fake
 * host menu in a real browser. No DSH process, no profile, no network.
 *
 * Why this is worth doing at all: jsdom proves behaviour, not appearance — it has no
 * layout engine and no CSS. Only a real browser shows whether the fill gradient, the
 * knob diameter, the star layer and the host row's second line actually look right.
 *
 * What it does NOT prove: that the host app mounts the plugin. That needs a real profile
 * and is explicitly out of scope.
 *
 * Page shape mirrors the host: ONE apply() (one stylesheet, one settings UI) and one
 * React root per composer, each with its own session id — which is how the host runs it.
 *
 * WHERE IT WRITES. Default target is the COMMITTED fixture at `fixture/index.html`, so
 * the page a reviewer opens is regenerable from the artifact in one command instead of
 * being a hand-made copy that already drifted once (it embedded a 92893-CHAR bundle and
 * announced it as "92893 字节" while `client/client.js` was 92930 bytes — see the byte
 * note below). Pass `--out <dir>` for a scratch copy (`.work/` is gitignored, so a
 * screenshot run should go there and the committed page stays the reference).
 *
 * Usage:
 *   node tools/fixture-offline.mjs                          # rewrite fixture/index.html
 *   node tools/fixture-offline.mjs --out ../../.work/ces-final/fixture
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const outFlag = process.argv.indexOf('--out')
const OUT = outFlag > 0 && process.argv[outFlag + 1]
  ? resolve(process.argv[outFlag + 1])
  : join(here, 'fixture')

const bundle = readFileSync(join(here, 'client', 'client.js'), 'utf8')
// BYTES, not characters. The page states the size it embeds and a reviewer diffs that
// number against `wc -c client/client.js`; `bundle.length` is UTF-16 code units, which
// is 37 short on this artifact (CJK and box-drawing comments). Report the real thing.
const bundleBytes = Buffer.byteLength(bundle)
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
const reactUmd = readFileSync(join(here, 'node_modules', 'react', 'umd', 'react.production.min.js'), 'utf8')
const reactDomUmd = readFileSync(join(here, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'), 'utf8')

const PRESETS = [
  ['off', 'Off', '最左端，官方灰'],
  ['low', 'Low', '第二档，蓝'],
  ['medium', 'Medium', '六档中段，蓝→紫推进'],
  ['max', 'Max', '满档，星云 + 星尘粒子'],
]

const cardsHtml = PRESETS.map(([id, name, caption]) => [
  '  <figure class="shot" data-only="' + id + '">',
  '    <figcaption><b>' + id + '</b> · ' + name + ' — ' + caption + '</figcaption>',
  '    <div data-composer-card data-shot="' + id + '"></div>',
  '  </figure>',
].join('\n')).join('\n')

const css = [
  ':root { color-scheme: dark; }',
  '* { box-sizing: border-box; }',
  'body { margin: 0; background: #14161a; color: #e6e8eb;',
  '       font: 14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; padding: 26px 30px; }',
  'h1 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }',
  '.note { color: #9aa3ad; font-size: 12px; margin: 0 0 22px; }',
  '[data-composer-card] { width: 660px; background: #1c1f25; border: 1px solid #2b3038;',
  '  border-radius: 14px; padding: 10px; }',
  '[data-composer-card] > button[aria-haspopup="menu"] {',
  '  display: flex; gap: 8px; align-items: center; width: 100%; text-align: left;',
  '  background: #23272e; color: #e6e8eb; border: 1px solid #2b3038; border-radius: 9px;',
  '  padding: 8px 11px; font: inherit; cursor: pointer; }',
  '[role="menu"] { margin-top: 8px; background: #20242a; border: 1px solid #2b3038;',
  '  border-radius: 11px; padding: 5px; display: flex; flex-direction: column; }',
  '[role="menuitem"] { display: flex; align-items: center; gap: 10px; width: 100%;',
  '  background: none; border: 0; color: #e6e8eb; font: inherit; text-align: left;',
  '  padding: 7px 9px; border-radius: 7px; cursor: pointer; }',
  '[role="menuitem"] .cellValue { margin-left: auto; color: #9aa3ad; }',
  '[role="menuitem"] svg { width: 13px; height: 13px; opacity: .55; flex: none; }',
  '.shots { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }',
  '.shot { margin: 0; }',
  '.shot > figcaption { color: #9aa3ad; font-size: 11px; margin-bottom: 7px; }',
  '.shot > figcaption b { color: #cdd4dc; }',
  '#fixture-status { margin-top: 18px; font: 11px/1.6 ui-monospace, Consolas, monospace;',
  '  color: #7f8a96; white-space: pre-wrap; }',
  '.bad { color: #ff6b6b !important; }',
].join('\n')

const script = [
  'const STATUS = document.getElementById("fixture-status")',
  'const log = (line, bad) => { STATUS.textContent += "\\n" + line; if (bad) STATUS.classList.add("bad") }',
  'window.addEventListener("error", (e) => log("ERROR: " + String((e.error && e.error.stack) || e.message), true))',
  '',
  '/* The host module table: what factory(require) would receive. */',
  'const hostModules = { react: React, "react-dom": ReactDOM }',
  'const registrations = []',
  'window.__ModuleLoader__ = { load: (entry) => registrations.push(entry) }',
  '',
  'const LEVELS = [',
  '  { id: "off", name: "Off" }, { id: "minimal", name: "Minimal" }, { id: "low", name: "Low" },',
  '  { id: "medium", name: "Medium" }, { id: "high", name: "High" }, { id: "max", name: "Max" },',
  ']',
  'const MODEL_ID = "deepseek-v41-flash"',
  '',
  '/* The fake host, in the exact DOM shape bridge.js expects. */',
  'function buildCard(card, preset) {',
  '  const effort = { current: preset }',
  '  const seat = document.createElement("button")',
  '  seat.setAttribute("aria-haspopup", "menu")',
  '  seat.setAttribute("aria-expanded", "true")',
  '  seat.setAttribute("aria-controls", "menu-" + preset)',
  '  const name = document.createElement("span")',
  '  name.textContent = "DeepSeek-V41-Flash"',
  '  const levelText = document.createElement("span")',
  '  levelText.textContent = preset',
  '  seat.append(name, levelText)',
  '  card.appendChild(seat)',
  '',
  '  const menu = document.createElement("div")',
  '  menu.setAttribute("role", "menu")',
  '  menu.setAttribute("id", "menu-" + preset)',
  '  card.appendChild(menu)',
  '  for (const pair of [["模型", "DeepSeek-V41-Flash"], ["推理等级", preset]]) {',
  '    const row = document.createElement("button")',
  '    row.setAttribute("role", "menuitem")',
  '    const label = document.createElement("span")',
  '    label.className = "cellLabel"; label.textContent = pair[0]',
  '    const value = document.createElement("span")',
  '    value.className = "cellValue"; value.textContent = pair[1]',
  '    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg")',
  '    chevron.innerHTML = \'<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/>\'',
  '    row.append(label, value, chevron)',
  '    menu.appendChild(row)',
  '  }',
  '',
  '  const anchorSlot = document.createElement("div")',
  '  card.appendChild(anchorSlot)',
  '',
  '  const listeners = new Set()',
  '  /* ONE cached snapshot object, rebuilt only when the state actually changes.',
  '     useSyncExternalStore compares by identity: returning a fresh object on every',
  '     getSnapshot() call is an infinite re-render loop (React #185). The real host',
  '     store caches the same way, so this is the faithful shape, not a workaround. */',
  '  let cached = null',
  '  const rebuild = () => {',
  '    cached = {',
  '      current: { provider: "deepseek", model: MODEL_ID, reasoningEffort: effort.current },',
  '      groups: [{ id: "deepseek", name: "DeepSeek", models: [{',
  '        id: MODEL_ID, name: "DeepSeek-V41-Flash",',
  '        reasoning: { defaultEffort: "medium", efforts: LEVELS },',
  '      }] }],',
  '      failures: [], status: "ready", pending: null, error: null,',
  '    }',
  '    return cached',
  '  }',
  '  const snapshot = () => (cached === null ? rebuild() : cached)',
  '  const directory = {',
  '    store: {',
  '      getSnapshot: snapshot,',
  '      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },',
  '    },',
  '    load: async () => snapshot(),',
  '    select: async (selection) => {',
  '      effort.current = selection.reasoningEffort',
  '      const next = LEVELS.find((level) => level.id === selection.reasoningEffort)',
  '      levelText.textContent = next ? next.name : selection.reasoningEffort',
  '      for (const fn of Array.from(listeners)) fn()',
  '      return { ok: true }',
  '    },',
  '  }',
  '  return { card, anchorSlot, directory, effort, seat, menu, levelText }',
  '}',
  '',
  'const cards = Array.from(document.querySelectorAll("[data-composer-card]"))',
  '  .map((card) => buildCard(card, card.dataset.shot))',
  '',
  '/* Load the REAL artifact. Its top-level code calls __ModuleLoader__.load(). */',
  bundle,
  '',
  'const entry = registrations[0]',
  'if (!entry) throw new Error("the bundle never called __ModuleLoader__.load")',
  'const EXPECTED = ' + JSON.stringify(pkg.name),
  'log("bundle registered as " + entry.id + (entry.id === EXPECTED ? " (matches package name)" : " (MISMATCH)"), entry.id !== EXPECTED)',
  '',
  '/* One apply(), exactly like the host: one stylesheet, one settings UI. */',
  'const directories = new Map()',
  'cards.forEach((fixture, index) => directories.set("session-fixture-" + index, fixture.directory))',
  'let SlotComponent = null',
  'const disposers = []',
  'const ctx = {',
  '  modelDirectories: { directoryFor: (sessionId) => {',
  '    const found = directories.get(sessionId)',
  '    if (!found) throw new Error("session resolved no scope")',
  '    return found',
  '  } },',
  '  sessions: { subagentAddress: () => undefined },',
  '  slots: {',
  '    inject: (slotName, callback) => callback(),',
  '    register: (definition, Component) => { SlotComponent = Component; return { dispose() {} } },',
  '  },',
  '  effect: (fn) => { const dispose = fn(); if (typeof dispose === "function") disposers.push(dispose) },',
  '}',
  'const exportsObject = entry.factory((moduleName) => {',
  '  if (moduleName in hostModules) return hostModules[moduleName]',
  '  throw new Error("the host would not provide " + moduleName)',
  '})',
  'log("factory executed; exports.name=" + exportsObject.name + ", apply=" + typeof exportsObject.apply)',
  'exportsObject.apply(ctx)',
  'if (SlotComponent === null) throw new Error("apply() never registered the slot component")',
  'log("apply() installed the stylesheet + settings UI")',
  '',
  '/* One React root per composer, as the host runs it. */',
  'const roots = cards.map((fixture, index) => {',
  '  const root = ReactDOM.createRoot(fixture.anchorSlot)',
  '  root.render(React.createElement(SlotComponent, { sessionId: "session-fixture-" + index }))',
  '  return root',
  '})',
  '',
  '/* ?only=<preset> keeps a single card, for a legible close-up shot. */',
  'const only = new URLSearchParams(location.search).get("only")',
  'if (only) {',
  '  for (const figure of Array.from(document.querySelectorAll(".shot"))) {',
  '    if (figure.dataset.only !== only) figure.remove()',
  '  }',
  '}',
  '',
  'window.__fixture = { registrations, entry, cards, exportsObject, roots, disposers }',
  'window.__ready = (async () => {',
  '  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 25))',
  '  const tracks = document.querySelectorAll(\'[data-ces-part="track"]\')',
  '  const knobs = document.querySelectorAll(\'[data-ces-part="knob"]\')',
  '  const stars = document.querySelectorAll(\'[data-ces-part="star"]\')',
  '  const portals = document.querySelectorAll(\'[data-ces-part="root"]\')',
  '  log("cards=" + cards.length + " portals=" + portals.length + " tracks=" + tracks.length',
  '    + " knobs=" + knobs.length + " stars=" + stars.length, tracks.length !== cards.length)',
  '  for (const fixture of cards) {',
  '    const rows = fixture.menu.querySelectorAll(\'[role="menuitem"]\')',
  '    const row = rows[rows.length - 1]',
  '    log("  " + fixture.card.dataset.shot + ": rowHeight=" + (row.style.height || "(unset)")',
  '      + " flexWrap=" + (row.style.flexWrap || "(unset)")',
  '      + " ces-inline=" + row.querySelectorAll(".ces-inline").length)',
  '  }',
  '  return { tracks: tracks.length, stars: stars.length }',
  '})()',
].join('\n')

const page = [
  '<!doctype html>',
  '<html lang="zh"><head><meta charset="utf-8">',
  '<title>codex-effort-slider · offline fixture</title>',
  '<style>', css, '</style></head><body>',
  '<h1>codex-effort-slider · 离线真实产物 fixture</h1>',
  '<p class="note">加载真实 client/client.js（' + bundleBytes + ' 字节）与真实 React 18，假宿主菜单。'
    + '不连 DSH、不读 profile、不联网。此页只证明外观与交互，<b>不证明宿主挂载</b>。</p>',
  '<div class="shots">',
  cardsHtml,
  '</div>',
  '<pre id="fixture-status">booting…</pre>',
  '<script>', reactUmd, '</script>',
  '<script>', reactDomUmd, '</script>',
  '<script>', script, '</script>',
  '</body></html>',
].join('\n')

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'index.html'), page)
console.log('wrote ' + join(OUT, 'index.html') + ' (' + Buffer.byteLength(page) + ' bytes); bundle ' + bundleBytes + ' bytes')
