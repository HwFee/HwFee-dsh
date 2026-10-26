# Right-sidebar tab API — code-level notes (DSH 0.2.1-rc.3, macOS app)

How an **outside-the-app** client plugin adds a tab type to the host's right sidebar and reads
live session projections inside that tab's body.

Everything here was read out of the shipped Electron asar. No host file, profile or install was
modified; the only write was this document.

```
APP = /Applications/DeepSeek Harness.app/Contents/Resources/app.asar
PKG = $APP/dsh/node_modules/@deepseek-ai
```

Read a file with the Electron binary as Node (the asar is not a directory):

```bash
E="/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness"
ELECTRON_RUN_AS_NODE=1 "$E" -e "const fs=require('fs');console.log(fs.readFileSync('$PKG/dsh-client-ui-sidebar-files/lib/client.js','utf8'))"
```

---

## 0. TL;DR — the whole recipe

```js
export const inject = ['slots', 'locale', 'sidebarRightTabs']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register('contextRail', { en, zh }), 'rail: dictionaries')
  const t = ctx.locale.bind('contextRail')

  // 1. THE TYPE — a page type: no `patterns`, opened by `kind`.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: '@hwfee/dsh-context-rail',   // unique; ALSO the key the body registers under
    kind: 'contextRail',             // unique across every registration in force
    priority: 'extension',           // default band for a third-party type
    title: () => t('type.title'),    // chip text, captured when the tab opens
    // guide entries: title/description are THUNKS (re-read every render, so `t` follows the locale)
    guide: [{ id: 'rail', order: 40, title: () => t('guide.title'), description: () => t('guide.description'), icon: Glyph }],
    keepMounted: true,               // optional: retain visited bodies across session switches
  }), 'rail: tab type')

  // 2. THE BODY — keyed by the type's `id`, into the seat the sidebar plugin declares.
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: '@hwfee/dsh-context-rail',
    locale: 'contextRail',           // → `t` prop
  }, RailBody)), 'rail: tab body')
}

// Framework standard props — NOT owner props. `useProjection` really is here.
function RailBody({ useProjection, sessionId, useSession, useSessions, t }) {
  const pressure  = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  const usage     = useProjection('tokenUsage')
  /* …render numbers… */
}
```

`useProjection` **is** available inside a right-sidebar tab body: it is a *standard prop* of every
session-scoped slot (see §2.3), bound by the framework, not something the sidebar owner passes.
Registered as `scope: 'session'`, the body also receives `sessionId`, `useSession`, `useSessions`,
`useSessionStatus`, `useResource`, `usePanelInfo`, `useRemoteAccess`, `useWorkspaces` and friends.

---

## 1. Question 1 — the tab-type registration

### 1.1 The public shape

```ts
ctx.sidebarRightTabs.register({
  id: string                  // required, unique across every registration
  kind: string                // required, the type discriminator tabs are recorded under
  title: (address: string) => string   // required, chip text captured at open time
  patterns?: string[]         // resource types only; globs (picomatch)
  priority?: 'extension' | 'builtin' | 'fallback'   // default 'extension'
  canOpen?: (address: string) => boolean
  guide?: GuideEntry[]        // entry boxes for the guide page
  keepMounted?: boolean       // retain visited bodies across tab/session changes
  multiple?: boolean          // independent instances (terminals); each open gets its own address
}): () => void                // the disposer, held inside your own ctx.effect
```

`register` returns a disposer; store it in `ctx.effect` so the registration lives exactly as long
as your plugin. Validation, `dsh-client-ui-sidebar-right/lib/client.js:4580-4611`:

```js
register(definition) {
  const { id, kind } = definition;
  const entries = definition.guide ?? [];
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error(`sidebarRight: duplicate guide entry id in "${id}"`);
  const band = definition.priority ?? DEFAULT_BAND;
  if (this.ids.has(id)) throw new Error(`sidebarRight: tab type id "${id}" is already registered`);
  const held = this.kinds.get(kind);
  if (held !== void 0 && !coexists(held, band)) throw new Error(`sidebarRight: tab kind "${kind}" is already registered (${held.inForce.band})`);
  this.registrations += 1;
  const entry = {
    definition, band,
    matchers: (definition.patterns ?? []).map((pattern) => ({ pattern, test: matcherFor(pattern) })),
    order: this.registrations
  };
  …
}
```

Bands and kind coexistence, same file `:4509-4522`:

```js
const RANKS = { extension: 3, builtin: 2, fallback: 1 };
const DEFAULT_BAND = "extension";
function coexists(slot, band) {
  return band !== "fallback" && slot.inForce.band !== "fallback" && slot.inForce.band !== band && slot.shadowed === void 0;
}
```

Consequences for a third party:

* `id` must be globally unique — a package name is the natural value. A second registration of an
  `id` throws.
* a `kind` carries at most one `builtin` **and** one `extension` registration (the extension wins
  while it lives; the builtin resumes when it leaves); two registrations in the same band, or
  anything meeting a `fallback` of the same kind, throws. **Pick a `kind` of your own** unless you
  are deliberately taking over a shipped kind.
* `priority` defaults to `'extension'`, the highest band — correct for a plugin outside the product.

### 1.2 `title` and `guide` are functions, not strings

`title(address)` is a *function of the address*; it is captured into the tab record when the tab
opens, so a live title needs the optional title seat (`sidebar.right.pane.tab.title`).

`guide` is an **array** of entries. Entry shape, read off the shipped implementations:

| field | type | meaning |
|---|---|---|
| `id` | `string` (required) | unique within your provider; `kind`+`id` is the card's pin identity |
| `order` | `number` | position among all providers' cards, ascending (`refresh()` sorts by it) |
| `title` | `() => string` | card label — **a thunk**, called on every render |
| `description` | `() => string`? | shown under the title while ≤ 4 cards are visible |
| `icon` | `(props: {size?: number, className?: string}) => ReactElement`? | card glyph; the guide falls back to a muted cube |
| `commandId` | `string`? | a registered shortcut id whose keys are printed inside the card |

The registry flattens entries and injects `kind` + `providerId`, `dsh-client-ui-sidebar-right/lib/client.js:4732-4740`:

```js
refresh() {
  this.cached = this.active().map((entry) => entry.definition);
  this.guideEntries = this.cached.flatMap((definition) => (definition.guide ?? []).map((entry) => ({
    ...entry, kind: definition.kind, providerId: definition.id
  }))).sort((left, right) => left.order - right.order);
  notifySubscribers(this.listeners, "[ui-sidebar-right] tab registry");
}
```

The card renderer (`EntryBox`, same file `:517-549`) reads `entry.icon ?? CubeGlyph`,
`entry.title()`, `entry.description?.()`, and `shortcuts.find(s => s.id === entry.commandId)`.

### 1.3 Quoted reference implementations

**Resource type** (claims `dsh-resource://` addresses) —
`dsh-client-ui-sidebar-documentpreview/lib/client.js:1053-1088`:

```js
/** The tab kind this package owns. */
const TEXTPREVIEW_KIND = "text";
/** This implementation's identity in the tab system: the key its body registers under. */
const TEXTPREVIEW_ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
…
function textDefinition() {
  return {
    id: TEXTPREVIEW_ID,
    kind: TEXTPREVIEW_KIND,
    patterns: ["dsh-resource://file/[\\s\\S]+"],
    priority: "fallback",
    canOpen: (address) => parseFileAddress(address)?.scope === "session",
    title: basenameOf
  };
}
```

registered at `:7209`:

```js
ctx.effect(() => ctx.sidebarRightTabs.register(textDefinition()), "ui-sidebar-documentpreview: text type");
```

**Page type with a guide card** (the shape a third-party tab wants) —
`dsh-client-ui-sidebar-files/lib/client.js:14-37`:

```js
/** The tab kind this package owns. */
const FILES_KIND = "files";
/** This implementation's identity in the tab system, and the key its body registers under. */
const FILES_ID = "@deepseek-ai/dsh-client-ui-sidebar-files";
…
function filesDefinition(t) {
  return {
    id: FILES_ID,
    kind: FILES_KIND,
    priority: "builtin",
    title: () => t("type.label"),
    guide: [{
      id: "workspace",
      commandId: "workspace.files",
      order: 10,
      title: () => t("guide.title"),
      description: () => t("guide.description"),
      icon: _deepseek_ai_dsh_client_ui_primitives.GuideArtworkFiles
    }]
  };
}
```

registered at `:996`:

```js
ctx.effect(() => ctx.sidebarRightTabs.register(filesDefinition(t)), "ui-sidebar-files: files type");
```

The shipped guide type itself is a page type with no `guide`, `:4840-4847`:

```js
function guideDefinition(t) {
  return {
    id: GUIDE_ID,                    // "@deepseek-ai/dsh-client-ui-sidebar-right/guide"
    kind: GUIDE_KIND,                // "guide"
    priority: "builtin",
    title: () => t("tab.guide.title")
  };
}
```

### 1.4 How a *page* type is opened

A page is named by `kind`; the sidebar composes its own address (`sidebar://<kind>`) and the caller
never spells it, `dsh-client-ui-sidebar-right/lib/client.js:711-721` and `:2298-2307`:

```js
const GUIDE_KIND = "guide";
function pageAddress(kind) {
  return `sidebar://${kind}`;
}
…
placeTab(sessionId, actions, kind, options) {
  const definition = this.tabs.get(kind);
  if (definition === void 0) throw new Error(`sidebarRight: no tab type is registered as "${kind}"`);
  const address = definition.multiple === true ? `${pageAddress(kind)}/${randomUUID()}` : pageAddress(kind);
  this.place(sessionId, actions, { kind, contentId: address, title: definition.title(address) }, address, options, options.params);
}
```

Options accepted by `openTab(kind, options)` / `tab.actions.openTab(kind, options)`
(`:2298-2322`, `:1984-1989`): `paneId`, `replaceTab`, `preferNewPane`, `revealIfOpened`, `params`.
`params` reaches the body as `tab.navigation.params`. Opening always expands the panel
(`planSetExpanded(state, true)`, `:1118`).

---

## 2. Question 2 — the body seat

### 2.1 What the sidebar plugin declares

`dsh-client-ui-sidebar-right/lib/client.js:5042-5077` — the seat lives inside the
`rightbar.session` registration:

```js
yield ctx.slots.register({
  name: "rightbar.session",
  locale: NS,
  children: {
    "sidebar.right.pane.tab": {
      kind: "keyed",
      scope: "session",
      inject: { hooks: { tabInfo: tabInfoFactory } }
    },
    "sidebar.right.pane.tab.title": {
      kind: "keyed",
      scope: "session",
      inject: { hooks: { tabInfo: tabInfoFactory } }
    },
    "sidebar.right.tab.menu.item": {
      kind: "list",
      scope: "session"
    }
  },
  store,
  inject: (sessionId) => ({ … })
}, RightbarSeat);
```

`scope: "session"` is the whole reason the body can read projections. A tab body is dispatched as
`kind: "keyed"`, so **your registration options are**:

| option | value for a tab body |
|---|---|
| `name` | `'sidebar.right.pane.tab'` (required) |
| `key` | your tab type's `id` (**required** for a keyed slot — the owner dispatches by it) |
| `locale` | your locale namespace → supplies the `t(key, params)` prop |
| `store` | optional `defineStore({ init, actions })` declaration → supplies `useStore` / `actions`, one instance per session |
| `children` | optional child slots you declare (e.g. an actions list) |
| `inject` | optional *function* `(sessionId, actions) => face`, whose `face` is spread as props; `face.hooks` entries become `use<Name>` props bound to `{getSnapshot, subscribe}` sources, `face.keyedHooks` likewise keyed by session |
| `priority` | optional; same `(key, priority)` twice throws |

The framework's own validation (`dist/assets/index-BXV-oxvX.js`, `SlotCore.register`):

```js
case"keyed":{ if(e.key===void 0) throw new Error(`keyed slot "${e.name}" requires options.key`); … }
…
if(!r?.spec) throw new Error(`slot "${e.name}" is not declared (a parent entry's children table must declare it)`);
```

That second error is why registration must sit behind `ctx.slots.inject('sidebar.right.pane.tab', …)`.

### 2.2 The shipped registration, verbatim

`dsh-client-ui-sidebar-documentpreview/lib/client.js:7220-7249`:

```js
ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
  name: "sidebar.right.pane.tab",
  key: TEXTPREVIEW_ID,
  locale: NS,
  store,
  children: {
    "sidebar.right.tab.document": {
      kind: "keyed", scope: "session",
      inject: { hooks: { tabInfo: documentTabInfoFactory } }
    },
    "sidebar.right.tab.document.actions": { kind: "list", scope: "session" },
    "sidebar.right.tab.document.unpreviewable": { kind: "list", scope: "session" },
    "sidebar.right.tab.document.action": {
      kind: "keyed", scope: "session",
      inject: { hooks: { tabInfo: documentTabInfoFactory } }
    }
  },
  inject: (sessionId, actions) => ({
    ...face(sessionId, actions),
    hooks: { documentPreviews: source }
  })
}, TextPreview)), "ui-sidebar-documentpreview: text body");
ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
  name: "sidebar.right.pane.tab.title",
  key: TEXTPREVIEW_ID
}, TextTitle)), "ui-sidebar-documentpreview: text title");
```

and the minimal variant, `dsh-client-ui-sidebar-files/lib/client.js:1003-1013`:

```js
ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
  name: "sidebar.right.pane.tab",
  key: FILES_ID,
  locale: NS,
  store,
  inject,
  children: { "sidebar.right.tab.files.actions": { kind: "list", scope: "session" } }
}, FilesBody)), "ui-sidebar-files: files tab body");
```

### 2.3 What the body component actually receives

Dispatch happens in `TabSlot`, `dsh-client-ui-sidebar-right/lib/client.js:1368-1415`:

```js
function TabSlot({ renderSlot, occurrence, useTabTypes, useTabNavigation, useStore, fullscreen, shortcuts, active, retainTab, tab, seat, fallback }) {
  const { id, signal, tabActions } = occurrence(tab);
  const definition = useTabTypes((types) => types.find((definition) => definition.kind === tab.kind));
  const retained = seat === "sidebar.right.pane.tab" && definition?.keepMounted === true;
  useLayoutEffect(() => retained ? retainTab(tab.id, signal) : void 0, [retained, retainTab, tab.id, signal]);
  const hookContext = useMemo(() => ({
    tabId: tab.id, shortcuts, title: seat === "sidebar.right.pane.tab.title",
    fullscreen, active, signal, actions: tabActions, useStore, useTabNavigation
  }), […]);
  const content = renderSlot(seat, {}, { entryKey: definition?.id ?? tab.kind, fallback, hookContext });
  …
}
```

`hookContext` is the `TabHookContext` the framework feeds to the slot's declared `tabInfo` factory
(`:4856-4893`), which is how `useTabInfo` is produced:

```js
const tabInfoFactory = (standard, context) => {
  const { sessionId } = standard;
  const { tabId, title, fullscreen, active, signal, actions, useStore, useTabNavigation, shortcuts } = context;
  return function useTabInfo() {
    const layout = useStore((state) => state.bySession[sessionId]?.layout);
    const navigation = useTabNavigation(tabId);
    return useMemo(() => {
      const tab = layout?.tabs[tabId];
      if (layout === void 0 || tab === void 0 || navigation === void 0) throw new Error(`sidebarRight: tab "${tabId}" is not committed in session "${sessionId}"`);
      const pane = findTabPane(layout, tabId);
      return {
        sidebar: { expanded: layout.expanded, fullscreen },
        panel: { id: pane.id },
        tab: {
          ...tab,
          visible: active && (pane.host === "float" || layout.expanded && (title || pane.activeTabId === tabId)),
          navigation, signal, actions,
          refreshShortcut: shortcuts.find((row) => row.id === "page.refresh")
        }
      };
    }, [layout, navigation, tabId, title, fullscreen, active, signal, actions, shortcuts]);
  };
};
```

So `useTabInfo()` gives `{ sidebar, panel, tab }` where `tab` is the record `{id, kind, contentId,
title}` (`:788-793`) plus `visible`, `navigation` (`{address, params, revision}` snapshot store),
`signal` (occurrence `AbortSignal`), `actions` (`{bindCommands, openResource, openTab, close}`,
`:2000-2026`) and `refreshShortcut`.

**Note: `useTabInfo()` does not carry a session id.** The session id is the *standard prop*
`sessionId` (see below). `useTabInfo().tab.sessionId` does not exist.

Full prop list for a tab body = standard props + kit + inject + owner props
(`dsh-client-ui-renderer/lib/client.js:736-767`, `:773-791`):

```js
function standardKit(host, entry, scope, rootBinding, scopeBinding) {
  const standard = standardProps(scope, rootBinding, scopeBinding);
  const kit = { ...standard, renderFactorySlot: boundRenderFactorySlot(entry) };
  if (entry.locale !== void 0) { … kit["t"] = localeSeat(face, entry.locale); }
  const store = host.storeOf(entry, scopedStoreBinding);
  if (store !== void 0) { kit["useStore"] = observableHook(store); kit["actions"] = store.actions; }
  if (entry.children !== void 0) { kit["renderSlot"] = boundRenderSlot(host, entry); … }
  return { kit, standard, actions: store?.actions };
}
…
return jsx(Comp, { ...kit, ...injected, ...slotInjected.props, ...contextual, ...ownerProps });
```

`standardProps` merges the root source and the session source (`:680-702`):

```js
standard = {
  ...materializeStandardBinding(rootBinding, false, scopeBinding.key),
  ...materializeStandardBinding(scopeBinding, scope === "session-maybe")
};
```

The session source is installed by `dsh-client-ui-session`, `lib/client.js:755-764`:

```js
const BUILTIN_SOURCE = {
  hooks: ["session"],
  keyedHooks: ["projection"],
  props: ["sessionId"],
  resolve: (binding) => ({
    hooks: { session: binding.session },
    keyedHooks: { projection: (key) => binding.session.projections.faceOf(key) },
    props: { sessionId: binding.sessionId }
  })
};
```

and `standardHookPropName` is literally `'use' + Capitalized(name)` (shell bundle:
`function kI(e){return \`use${e[0]?.toUpperCase()??""}${e.slice(1)}\`}`). Therefore:

* `hooks: ["session"]` → prop **`useSession`**
* `keyedHooks: ["projection"]` → prop **`useProjection`**
* `props: ["sessionId"]` → prop **`sessionId`**
* root source (`dsh-client-ui-session/lib/client.js:1104-1113`) adds `useSessions`,
  `useSessionStatus`, and keyed `useSessionRetainInfo`, `useSessionAccess`.

The host's own slot catalog agrees; `sidebar.right.pane.tab` is catalogued (the app's
`CLIENT_SLOT_API` in `dsh-cordis-client-runner/lib/client.js:5844-5896`):

```
key: "sidebar.right.pane.tab", kind: "keyed", scope: "session",
registerOptions: [{ name: "key", requirement: "required", type: "string", … }],
standardProps: [
  "useRemoteAccess", "useResource", "useWorkspaces", "usePanelInfo", "useSessions",
  "useSessionStatus", "useSessionRetainInfo", "useSessionAccess", "useWorkspaceAccess",
  "useChat", "useConversation", "useInput", "inputActions",
  "useSession", "sessionId", "useProjection", "useAccess", "useTrajectory" ],
hookContext: "TabHookContext",
slotInject: "SidebarRightTabInjected",
```

So **yes — `useProjection` is available inside a right-sidebar tab body**, and it needs no extra
inject, no `ctx.sessions` read, and no owner cooperation.

`useProjection` call forms (`dsh-client-ui-renderer/lib/client.js:245-287`): `(key)`,
`(key, selector)`, `(key, selector, isEqual)`, or `(selector)` — the key is the **projection key**;
the session is already bound by the source. Re-renders come from
`useSyncExternalStoreWithSelector` over the projection's identity-stable face.

---

## 3. Question 3 — the projection shapes

`SessionProjectionMap`, `dsh-api-session-controller/lib/typert.host.js:2886-2888` (typert stores the
declaration as an escaped string; reproduced verbatim):

```ts
export interface SessionProjectionMap {
    inbox: InboxWireState;
    workingDirectory: string | null;
    agentPreset: string | null;
    title: string | null;
    todos: TodoItem[] | null;
    sessionListMetadata: SessionListMetadata;
    imageLimits: ImageAttachmentLimits;
    modelSelection: ModelSelectionProjection;
    permissions: PermissionSelection;
    subagentCatalog: SubagentCatalogEntry[];
    subagentTiming: SubagentTimingProjection;
    subagent: SubagentIdentityProjection | null;
    tokenUsage: TokenUsageProjection;
    contextPressure: ContextPressureProjection;
    contextBreakdown: ContextBreakdownProjection;
    agentTeam: TeamProjection;
    userQuestions: UserQuestionProjectionView;
    goal: GoalProjection | null;
    plan: PlanProjection;
}
```

The ones a stats/context rail needs:

```ts
// typert.host.js:2322
export interface ContextPressureProjection {
    pressureTokens?: number;
    projectedTokens?: number;
    contextWindow?: number;
}

// typert.host.js:2314
export interface ContextBreakdownProjection {
    systemTokens: number;
    toolsTokens: number;
    messageTokens: number;
}

// typert.host.js:3134
export interface TokenUsageProjection {
    uncachedInputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}

// typert.host.js:3126
export interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
}

// typert.host.js:2846
export interface SessionListMetadata {
    readonly blank: boolean;
    readonly lastPromptAt: number | null;
}

// typert.host.js:2598-2602
export interface ModelSelection {
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
}
export interface ModelSelectionProjection {
    readonly lastUsed: ModelSelection | null;
    readonly next: ModelSelection | null;
}
```

`title: string | null` and `workingDirectory: string | null` and `agentPreset: string | null` are
plain scalars in the map above (no separate interface).

**`sessionStats` is not in `SessionProjectionMap`.** It is a separate projection unit owned by
`dsh-session-stats`, `lib/types/projection.js:24-33` + `:159-172`:

```js
const sessionStatsSchema = z.object({
    turns: z.number().int().nonnegative(),
    steps: z.number().int().nonnegative(),
    llmMs: z.number().nonnegative(),
    toolMs: z.number().nonnegative(),
    ttftMs: z.number().nonnegative(),
    ttftSteps: z.number().int().nonnegative(),
    decodeMs: z.number().nonnegative(),
    decodeTokens: z.number().nonnegative(),
}).strict();
…
export const sessionStatsProjectionDefinition = { key: 'sessionStats', …,
  wire: { viewSchema: sessionStatsSchema, view: state => ({ turns, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens }) } }
```

At runtime `useProjection('sessionStats')` returns exactly that object; in TypeScript it is only
typed if the map is declared-merged (the app ships no `.d.ts`, so this is a JS-only path).

Wire views are what the client reads — not the producer's internal state:

* `contextPressure` — `dsh-token-meter/lib/index.js:487-494`:
  `{ contextWindow?, pressureTokens?, projectedTokens? }`, where
  `projectedTokens = max(0, pressureTokens + surfaceTokens - sampledSurfaceTokens)`
  (the live figure while a turn streams; `pressureTokens` is prompt-side only).
* `contextBreakdown` — `dsh-token-meter/lib/index.js:241-243`: `view: (state) => state.breakdown`,
  i.e. `{systemTokens, toolsTokens, messageTokens}` with `systemTokens` = the last non-empty
  surviving system prompt and `messageTokens = surfaceTokens - systemTokens`.
* `tokenUsage` — `dsh-token-meter/lib/types/usage-projection.js:29-35`, the four-bucket totals.

### 3.1 The shipped consumer to copy

`dsh-client-ui-conversation/lib/client.js:18711-18713`:

```js
function ContextMeter({ useProjection, t }) {
  const pressure = useProjection("contextPressure");
  const breakdown = useProjection("contextBreakdown");
```

and `:18626-18634`:

```js
function contextOccupancy(pressure) {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens;
  if (usedTokens === void 0 || pressure?.contextWindow === void 0) return null;
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow
  };
}
```

(`ContextMeter` is registered in a conversation seat, not the sidebar, but the projection plumbing
is identical — both are session-scoped slots.)

---

## 4. Question 4 — reading the values at runtime

### 4.1 Inside your tab body: standard props (preferred, public, documented)

```js
export const inject = ['slots', 'locale', 'sidebarRightTabs']

function RailBody(props) {
  // Framework standard props; hooks, so call them unconditionally, in a fixed order.
  const pressure  = props.useProjection('contextPressure')
  const breakdown = props.useProjection('contextBreakdown')
  const usage     = props.useProjection('tokenUsage')
  const cwd       = props.useProjection('workingDirectory')
  const title     = props.useProjection('title')
  const model     = props.useProjection('modelSelection', (value) => value?.next ?? value?.lastUsed)
  const summary   = props.useSessions((rows) => rows.byId[props.sessionId]) // {cwd, running, blank, …}

  const used = pressure?.projectedTokens ?? pressure?.pressureTokens
  const percent = used === undefined || pressure?.contextWindow === undefined
    ? null
    : Math.min(100, Math.round(used / pressure.contextWindow * 100))
  …
}
```

Every one of those hooks subscribes and re-renders on change; there is no manual subscription and
no polling. `useSessions`/`useSession` come from the root source, `useProjection`/`sessionId` from
the session source.

TypeScript note: `useProjection` is `UseProjection` in the host's declarations. The app ships no
`.d.ts` for it, so a JS plugin simply uses it untyped.

### 4.2 Outside a body, or for a session other than the one on screen

`ctx.sessions` is a real injectable service — `dsh-api-session-controller/lib/client.js:3840`:

```js
rootCtx.reflect.provide("sessions", this, void 0);
```

Public accessors on it (`dsh-api-session-controller/lib/client.js`):

| member | line | meaning |
|---|---|---|
| `sessions.list` | 3814-3819 | snapshot store `{ids, byId, phase, projectionsBySession}` |
| `sessions.retain(target, {source, signal?})` | 3842-3855 | acquire a generation; returns `{sessionId, binding, ready, release()}` |
| `sessions.using(target, options, op)` | 3856-3862 | retain → await ready → run → release |
| `sessions.binding(id)` | 4056-4058 | the retained binding, or `undefined` |
| `sessions.sessionOf(ctx)` / `scopeOf(ctx)` | 4033-4050 | ctx → Session, for Agent-scoped contexts |

A `Session` object carries the projection store (`lib/types/client/sessions/session.js:83-90`):
`projections.faceOf(key)` (bare `{getSnapshot, subscribe}`), `projections.get(key)`,
`projections.values()`, `projections.seqOf(key)`
(`lib/types/client/sessions/projection-store.js:25-70`).

```js
export const inject = ['sessions']

const ref = ctx.sessions.retain(sessionId, { source: 'context-rail' })
await ref.ready                                   // catalogued, opening started
const session = ctx.sessions.binding(sessionId)?.session
const value = session?.projections.get('contextPressure')          // non-reactive read
const face  = session?.projections.faceOf('contextPressure')       // { getSnapshot, subscribe }
const off   = face?.subscribe(() => { /* … */ })
ref.release()
```

Caveats: (a) `projectionsBySession` on the list is a coarse *list hint* (`SessionProjectionHints`),
not a live per-key face; (b) inside a body you never need any of this — the standard props are
already bound to that tab's session; (c) `binding()` is a public method of the service but is not
described in `dsh-api-session-controller/README.md` (which documents `retain`/`using`/`list`), so
treat it as the least-stable of the paths.

### 4.3 What is *not* an accessor

* `ctx.reflect.get('sessions')` — unnecessary; `ctx.sessions` exists because of `reflect.provide`.
  `ctx.reflect.provide` is for *providing*, not reading (the sidebar does exactly this for
  `sidebarRightTabs`/`sidebarRight`, `dsh-client-ui-sidebar-right/lib/client.js:4965-4966`).
* `useProjection` is **not** an inject key. It cannot appear in `export const inject = [...]`; it is
  a prop handed to your component. Injecting `'projection'` or `'useProjection'` will hang the
  plugin waiting for a service that is never provided.

---

## 5. Question 5 — the guide entry, and opening/closing the column

### 5.1 Making the tab appear in the "add tab" surface

Register a `guide` array on your type (§1.2). Nothing else is required: the guide page renders one
capsule per entry of every type in force, `dsh-client-ui-sidebar-right/lib/client.js:606-653`:

```js
const entries = useGuideEntries((entries) => entries);
…
const described = visibleEntries.length <= MAX_DESCRIBED_ENTRIES;   // 4
…
fallback: jsx(EntryBox, {
  entry, described,
  shortcut: shortcuts.find((shortcut) => shortcut.id === entry.commandId),
  onPick: (selected) => { tab.actions.openTab(selected.kind, { replaceTab: true }); }
})
```

So clicking your card opens your page **in the guide tab's own place** (`replaceTab: true`) — the
guide is a doorway.

`icon` is optional; supply a component matching `({size, className}) => ReactElement`. The shipped
guide artwork in `@deepseek-ai/dsh-client-ui-primitives` (`GuideArtworkFiles`, `GuideArtworkBrowser`)
has exactly that signature (`function LU({size:e=36,className:t})`), and the primitives barrel is in
the browser's frozen module table, so `require('@deepseek-ai/dsh-client-ui-primitives')` from your
bundle is legal.

### 5.2 Does one entry make it the default page? No — not in this app

`defaultSeed`, `dsh-client-ui-sidebar-right/lib/client.js:694-709`:

```js
function defaultSeed(tabs) {
  const [only, ...others] = tabs.guide();
  const kind = only !== void 0 && others.length === 0 ? only.kind : GUIDE_KIND;
  const definition = tabs.get(kind);
  if (definition === void 0) throw new Error(`sidebarRight: default tab kind "${kind}" is not registered`);
  return { kind, title: definition.title(pageAddress(kind)) };
}
```

The rule counts **every registered guide entry in the whole app**, not entries from one plugin. The
shipped rc.3 bundle already contributes four:

| package | entry id | order |
|---|---|---|
| `dsh-client-ui-sidebar-files` | `workspace` | 10 |
| `dsh-client-ui-sidebar-terminal` | `new` | 20 |
| `dsh-client-ui-sidebar-browser` | `new` | 30 |
| `dsh-experimental-session-inspector` | `open` | 60 (experimental; only if that bundle is enabled) |

So in a normal install opening the sidebar shows the **guide page with your card among the others**.
Only in a composition where your entry is the registry's *single* entry does opening the sidebar land
directly on your page. To place your card early, pick a low `order` (e.g. `5`).

### 5.3 How the user opens/closes the column

* **Toggle command** `sidebar.right.toggle` — desktop macOS `⌘⌥B`, web `⌘⇧B`
  (`dsh-client-ui-sidebar-right/lib/client.js:181-226`).
* **Header expand button** — one control in `conversation.session.header.corner`, rendered only while
  the panel is collapsed (`:672-692`, seat at `:5079-5084`).
* **Strip add control** — drawn only while that pane holds no guide tab; it calls
  `openTab('guide', { paneId, revealIfOpened: false })` (`:1330-1335`).
* **Collapse / presentation controls** — in the tab strip chrome of the top-right pane.
* Programmatically: `ctx.sidebarRight.isExpanded()` / `toggleExpanded()` (`:2361-2372`), and every
  `openTab`/`openResource` expands the column for you.
* Pane split `pane.split` (`⌘\`) and panel fullscreen `pane.fullscreen.toggle` (`⌘⌥↵`); page close
  `page.close` (`⌘W`), refresh `page.refresh` (`⌘R`).

`toggleExpanded()` and the service-level `openTab`/`openResource` throw
`sidebarRight: no session surface is mounted` when no Session is on screen (`:2594-2602`) — guard
with `ctx.sidebarRight.mounted.getSnapshot() !== undefined`. A tab body's own
`tab.actions.openTab/openResource/close` never throw for another session: they no-op when that
session's store was released (`:2011-2026`).

---

## 6. Question 6 — session scope and background sessions

* **The body's session id is the standard prop `sessionId`** — *not* `useTabInfo().tab.sessionId`
  (that field does not exist) and not a `panel`/`sidebar` field. `useTabInfo()` returns only
  `{ sidebar: {expanded, fullscreen}, panel: {id}, tab: {…record, visible, navigation, signal, actions} }`.
* The scope binding is the *sidebar view's* session, not necessarily the conversation's:
  `SessionView` mounts each view with `SessionProvider session={view.reference}`
  (`dsh-client-ui-sidebar-right/lib/client.js:1698-1716`), so a body's `useProjection`/`sessionId`
  belong to the session that sidebar view draws.
* **Bodies of background sessions do render — but only with `keepMounted: true` and only once
  visited.** The root-scoped `rightbar` seat renders the selected Session *and* background Sessions
  that still hold retained bodies; a view with no retained tab is pruned and unmounted
  (`:1862-1867`):
  ```js
  prune(view) {
    if (view.sessionId === this.selected || view.hasRetainedTabs || this.views.get(view.sessionId) !== view) return;
    this.views.delete(view.sessionId); this.publish(); view.retire();
  }
  ```
  Retention is requested by `TabSlot` only when `definition.keepMounted === true` (`:1371-1377`), and
  the hold is released on unmount or occurrence abort (`SidebarSessionView.retainTab`, `:1779-1794`).
  Unvisited bodies are never mounted eagerly.
* A hidden/background body is wrapped in `<div hidden>` (`:1701-1714`) and its
  `tab.visible` is `false`: `visible: active && (pane.host === "float" || layout.expanded && (title || pane.activeTabId === tabId))`
  where `active = visible && view.selected`. **Do not gate real work on `tab.visible`**; use it only
  for visual affordances. Bodies also stay mounted (invisible) while the column is collapsed.
* The occurrence's `AbortSignal` (`tab.signal`) aborts when the tab record disappears or the plugin
  unloads — *not* when the sidebar collapses or the user switches sessions. Close it through
  `ctx.sidebarRight.registerCloseHandler(kind, handler)` if you own background cleanup (`:2194-2200`).

---

## 7. Complete minimal plugin skeleton

Follows the shape already used by `plugins/usage-stats` in this repo: ESM sources in `client/src/`,
one esbuild bundle wrapped in `window.__ModuleLoader__.load({ id: <package name>, factory })`, a
no-op Node half, a locale namespace, and a cordis patch row.

### 7.1 `package.json`

```json
{
  "name": "@hwfee/dsh-context-rail",
  "version": "0.1.0",
  "description": "Right-sidebar Context rail for DeepSeek Harness: live context pressure, breakdown and token usage for the session in the tab.",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": "./client/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./locale/*.json": "./locale/*.json",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-ui-sidebar-right",
        "@deepseek-ai/dsh-client-ui-session",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-api-session-controller"
      ],
      "platform": "web"
    }
  },
  "files": ["lib", "client/client.js", "locale", "cordis.patch.yml", "README.md"],
  "scripts": { "build": "node tools/build-client.mjs", "build:check": "node tools/build-client.mjs --check" },
  "devDependencies": { "esbuild": "0.25.10" }
}
```

`dsh.client.inject` is a **bundle-arrival order list of package names**, not service keys
(`dsh-client-modules/README.md`; host parse `lib/index.js:65-75`; browser
`arriveGraphRow` — "Register each injected package and unresolved dynamic request before its
consumer", `lib/client.js:776-794`). The service keys go in the module's own `export const inject`
(documented in `dsh-client-modules/README.md#declaring-a-client-plugin` and in every shipped package).

### 7.2 `cordis.patch.yml`

```yaml
- insert:
    - id: dsh-context-rail
      name: '@hwfee/dsh-context-rail'
```

### 7.3 `lib/index.js` (Node half — the client plugin needs none)

```js
/** Pure host half; the whole rail lives in the browser export. */
function apply() {}
export { apply }
```

### 7.4 `client/src/index.js` (the whole plugin body)

```js
/**
 * Right-sidebar "Context" tab.
 *
 * Two registrations, both owned by effects:
 *   1. the tab TYPE  (ctx.sidebarRightTabs.register)  — identity, kind, chip title, guide card
 *   2. the tab BODY  (ctx.slots.register into 'sidebar.right.pane.tab') keyed by the type id
 *
 * The body reads live projections through the framework's standard props
 * (`useProjection`, `sessionId`, `useSessions`) — no service reach-in, no polling.
 */

let React = null
try { React = require('react') } catch (error) { React = null }

const NS = 'contextRail'
const TYPE_ID = '@hwfee/dsh-context-rail'
const KIND = 'contextRail'

const en = {
  'type.title': 'Context',
  'guide.title': 'Context',
  'guide.description': 'Context pressure, breakdown and token usage of this session',
  'title': 'Context',
  'used': 'used',
  'free': 'free',
  'system': 'System',
  'tools': 'Tools',
  'messages': 'Messages',
  'usage': 'Usage',
  'input': 'Input',
  'output': 'Output',
  'cacheRead': 'Cache read',
  'cacheWrite': 'Cache write',
  'empty': 'No context data yet — send the first message.',
  'noUsage': 'This session has no token usage yet.',
}
const zh = {
  'type.title': '上下文',
  'guide.title': '上下文',
  'guide.description': '本会话的上下文占用、构成与用量',
  'title': '上下文',
  'used': '已用',
  'free': '剩余',
  'system': '系统提示',
  'tools': '工具',
  'messages': '消息',
  'usage': '用量',
  'input': '输入',
  'output': '输出',
  'cacheRead': '缓存读',
  'cacheWrite': '缓存写',
  'empty': '还没有上下文数据，发出第一条消息后出现。',
  'noUsage': '本会话还没有产生用量。',
}

/** Compact token count. */
function tokens(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value < 1000) return String(Math.round(value))
  if (value < 1e6) return (Math.round(value / 100) / 10) + 'K'
  return (Math.round(value / 1e5) / 10) + 'M'
}

/** Occupancy, exactly as the host's ContextMeter computes it. */
function occupancy(pressure) {
  const used = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (used === undefined || pressure?.contextWindow === undefined) return null
  return {
    usedTokens: used,
    contextWindow: pressure.contextWindow,
    percent: Math.min(100, Math.round(used / pressure.contextWindow * 100)),
  }
}

const noProjection = () => undefined

/**
 * THE REGISTERED COMPONENT.
 *
 * Props the framework hands every session-scoped slot body:
 *   sessionId, useProjection, useSession, useSessions, useSessionStatus,
 *   useResource, usePanelInfo, useRemoteAccess, useWorkspaces, useAccess, …
 * plus `t` from our `locale:` registration and `useTabInfo` from the slot's
 * declared TabHookContext (only if we ask for it via inject.hooks).
 */
function RailBody(props) {
  const useProjection = props.useProjection ?? noProjection
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  const usage = useProjection('tokenUsage')
  const useSessions = props.useSessions
  const summary = typeof useSessions === 'function'
    ? useSessions((rows) => rows.byId[props.sessionId])
    : undefined
  const t = typeof props.t === 'function' ? props.t : (key) => en[key] ?? key

  const context = occupancy(pressure)
  const b = breakdown
  const breakdownTotal = b === undefined ? 0 : b.systemTokens + b.toolsTokens + b.messageTokens
  const u = usage
  const usageTotal = u === undefined ? 0
    : u.uncachedInputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens

  const h = React.createElement
  return h('div', { className: 'dcr-root', 'data-dcr-root': true, 'data-session': props.sessionId },
    h('section', { className: 'dcr-card', 'data-dcr-card': 'context' },
      h('div', { className: 'dcr-head' }, h('span', { className: 'dcr-title' }, t('title'))),
      context === null
        ? h('p', { className: 'dcr-empty' }, t('empty'))
        : h('div', null,
            h('div', { className: 'dcr-figures' },
              h('span', { className: 'dcr-percent' }, context.percent + '%'),
              h('span', null, tokens(context.usedTokens) + ' / ' + tokens(context.contextWindow))),
            h('div', { className: 'dcr-bar' },
              h('div', { className: 'dcr-seg', 'data-band': 'total',
                style: { width: context.percent + '%' } })),
            h('div', { className: 'dcr-rows' },
              h(Row, { label: t('system'), value: tokens(b?.systemTokens) }),
              h(Row, { label: t('tools'), value: tokens(b?.toolsTokens) }),
              h(Row, { label: t('messages'), value: tokens(b?.messageTokens) }),
              h(Row, { label: t('free'), value: tokens(context.contextWindow - context.usedTokens) }),
              h(Row, { label: 'Σ', value: tokens(breakdownTotal) })))),
      summary?.running === true ? h('span', { className: 'dcr-badge' }, '●') : null),

    h('section', { className: 'dcr-card', 'data-dcr-card': 'usage' },
      h('div', { className: 'dcr-head' },
        h('span', { className: 'dcr-title' }, t('usage')),
        h('span', { className: 'dcr-badge' }, tokens(usageTotal))),
      usageTotal === 0
        ? h('p', { className: 'dcr-empty' }, t('noUsage'))
        : h('div', { className: 'dcr-rows' },
            h(Row, { label: t('input'), value: tokens(u?.uncachedInputTokens) }),
            h(Row, { label: t('output'), value: tokens(u?.outputTokens) }),
            h(Row, { label: t('cacheRead'), value: tokens(u?.cacheReadTokens) }),
            h(Row, { label: t('cacheWrite'), value: tokens(u?.cacheWriteTokens) }),
            h(Row, { label: 'Σ', value: tokens(usageTotal) }))))
}

/** One label/value row. */
function Row({ label, value }) {
  return React.createElement('div', { className: 'dcr-row' },
    React.createElement('span', { className: 'dcr-label' }, label),
    React.createElement('span', { className: 'dcr-value' }, value))
}

/** Guide card glyph: `({ size, className }) => element`, same contract as the host artwork. */
function RailGlyph(props) {
  const size = props?.size ?? 36
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 36 36', fill: 'none',
    className: props?.className, 'aria-hidden': 'true',
  }, React.createElement('rect', {
    x: 7, y: 9, width: 22, height: 18, rx: 3,
    stroke: 'currentColor', strokeWidth: 1.8,
  }), React.createElement('path', {
    d: 'M10.5 19.5h6v4h-6z M19.5 13.5h6v10h-6z',
    stroke: 'currentColor', strokeWidth: 1.6,
  }))
}

export const name = TYPE_ID
/** Services, not packages: the tab registry, the slot registry, copy. */
export const inject = ['slots', 'locale', 'sidebarRightTabs']

export function apply(ctx) {
  if (React === null) {
    console.warn('dsh-context-rail: react unavailable in the module table; rail not registered')
    return
  }

  // Copy first: the type's title/guide thunks read `t` from this namespace.
  if (ctx.locale && typeof ctx.locale.register === 'function') {
    ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'context-rail: dictionaries')
  }
  const t = ctx.locale && typeof ctx.locale.bind === 'function'
    ? ctx.locale.bind(NS)
    : (key) => en[key] ?? key

  // 1. THE TYPE.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TYPE_ID,
    kind: KIND,
    priority: 'extension',
    title: () => t('type.title'),
    keepMounted: true,
    guide: [{
      id: 'rail',
      order: 40,                       // after files(10)/terminal(20)/browser(30)
      title: () => t('guide.title'),
      description: () => t('guide.description'),
      icon: RailGlyph,
    }],
  }), 'context-rail: tab type')

  // 2. THE BODY. `slots.inject` waits for the sidebar plugin to declare the seat
  //    (`slot "…" is not declared` is thrown otherwise) and releases with the plugin.
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TYPE_ID,
    locale: NS,
  }, RailBody)), 'context-rail: tab body')
}
```

Open it from anywhere with a Session on screen:

```js
ctx.sidebarRight.openTab('contextRail')                 // expands the column and focuses the tab
ctx.sidebarRight.openTab('guide')                       // the guide page, as the strip's + does
```

or let the user click the guide card.

---

## 8. What is NOT possible through the public API

| # | Not possible | Evidence |
|---|---|---|
| 1 | **Registering a body without the sidebar plugin's declaration.** You cannot declare `sidebar.right.pane.tab` yourself; `register` throws unless a parent entry's `children` table declared it, and a second declaration throws "already declared". Hence `ctx.slots.inject(…)` is mandatory. | shell bundle `SlotCore.register`/`releaseChildren`: `slot "…" is not declared (a parent entry's children table must declare it)`, `slot "…" is already declared (by …)` |
| 2 | **Owner props in a tab body.** The seat's `ownerProps` are `[]`; only `{}` is passed to `renderSlot`. A body gets kit + inject + hookContext, nothing else. | catalog `ownerProps: []` (`dsh-cordis-client-runner/lib/client.js:5855`); `renderSlot(seat, {}, …)` (`ui-sidebar-right:1399`) |
| 3 | **Pane-level actions or collapsed-state controls from a plugin.** "No seat exists for pane-level actions or for collapsed-state controls yet." Only the tab body, the tab title, the guide body/entry and the tab menu item exist. | `ui-sidebar-right/README.md:88` |
| 4 | **Reading the layout / lookup by address / undo.** "The face exposes operations only: no layout snapshot, no operation log, no lookup by address." `_undo`/`_redo` are `@internal`. `adopt` is absent. | `README.md:97`, `:104`, `:147` |
| 5 | **A live chip title from `title(address)`.** The title is captured when the tab opens; only the optional `sidebar.right.pane.tab.title` seat can render a live one. | `README.md:148`; `placeTab` stores `definition.title(address)` (`:2305`) |
| 6 | **`useProjection` as an inject key.** It is a *prop* bound to the slot, never a service; `export const inject = ['projection']` waits forever. Same for `useSession`, `sessionId`. | `ui-session/lib/client.js:755-764`; renderer `materializeStandardBinding` (`:667-678`) |
| 7 | **A second registration of the same `id`, or a colliding kind.** Ids are global; a kind takes at most one `builtin` + one `extension`; `fallback` kinds share with nothing. | registry `:4583-4587`, `coexists` `:4520-4522` |
| 8 | **Choosing a tab's index / exact pane in the public options.** `openTab` accepts `paneId`, `replaceTab`, `preferNewPane`, `revealIfOpened`, `params` — no `index`. (`index` exists only inside the store's `openContent`.) | `:2298-2322`; store `:1122`, `:1150` |
| 9 | **Suppressing/hiding another provider's guide card.** Only the guide's own user-facing pin list does that; the plugin API has no removal hook. `kind: 'files'` cards are never hidden at all. | `README.md:117`; `GuideBody` filter `:612` |
| 10 | **A resource-address page (or any address outside `dsh-resource://`).** `openResource` throws for a foreign scheme, and a page is only reachable via `openTab(kind)`. | `:2294`; `placeTab` `:2298-2300` |
| 11 | **Eager mount of unvisited tabs, or background bodies without `keepMounted`.** A view with no retained body is pruned on session switch; "Unvisited bodies are not mounted eagerly." | `prune` `:1862-1867`; `README.md:106` |
| 12 | **Work driven by `tab.visible` for background sessions.** Background bodies render with `visible: false` and a `hidden` wrapper. | `:4874`, `:1701-1714` |
| 13 | **Reaching `dsh-resource://` internals, or a projection's producer-side state.** The client only ever sees the wire view (`contextPressure` = 3 optional fields, etc.); producer state (`surfaceTokens`, `sampledSurfaceTokens`, `systems[]`) never crosses. | `dsh-token-meter/lib/index.js:487-494`; `usage-projection.js:61-70` |
| 14 | **Typed projection reads for keys outside `SessionProjectionMap`** (e.g. `sessionStats`). Runtime works; the TS map has to be declared-merged, and the app ships no `.d.ts`. | `typert.host.js:2886-2888`; `dsh-session-stats/lib/types/projection.js` |
| 15 | **Importing arbitrary host packages from your bundle.** The browser's module table is frozen to `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `zod`, `@tanstack/react-virtual`, `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-dockkit`. Anything else must be bundled in. | `dist/assets/index-BXV-oxvX.js` (`function OZ(){return{react:aC,…}}`) |

Two smaller practical limits worth knowing:

* `ctx.sidebarRight.openTab`/`openResource`/`toggleExpanded` throw
  `sidebarRight: no session surface is mounted` without a Session on screen (`:2594-2602`).
* `dsh.client.external` only adds *non-baseline* requests, and a module-graph cycle is a hard
  composition error (`dsh-client-modules/lib/index.js:orderByModuleGraph`).

---

## 9. Evidence index

| fact | file:lines |
|---|---|
| type registry `register` validation, disposer | `dsh-client-ui-sidebar-right/lib/client.js:4580-4611` |
| bands / `coexists` | `:4509-4522` |
| glob→matcher (picomatch, whole address vs URI path) | `:4528-4548` |
| guide flatten + sort by `order` | `:4732-4740` |
| guide card render (`icon`/`title()`/`description?.()`) | `:517-549` |
| `GuideBody`, guide→page replace | `:606-653` |
| default page rule (1 entry ⇒ its page) | `:694-709` |
| `pageAddress` / `GUIDE_KIND` | `:711-721` |
| shipped guide type definition | `:4840-4847` |
| `TabSlot` dispatch + `hookContext` | `:1368-1415` |
| `tabInfoFactory` → `useTabInfo()` | `:4856-4893` |
| tab record schema (`id, kind, contentId, title`) | `:786-799` |
| `tabActions` (`openTab`/`openResource`/`close`/`bindCommands`) | `:2000-2026` |
| child seat declaration (`sidebar.right.pane.tab`) | `:5042-5077` |
| controller `openTab`/`placeTab`/options | `:2243-2246`, `:2298-2322` |
| `mounted`/`require()` throw | `:2594-2602` |
| shortcuts (`sidebar.right.toggle` etc.) | `:181-226`, `:227-300` |
| session views / retention / prune | `:1698-1716`, `:1779-1794`, `:1862-1867` |
| resource-type reference impl | `dsh-client-ui-sidebar-documentpreview/lib/client.js:1053-1088`, `:7191-7199`, `:7209`, `:7220-7253` |
| page-type + guide reference impl | `dsh-client-ui-sidebar-files/lib/client.js:14-37`, `:934-941`, `:996`, `:1003-1017` |
| session standard source (`useSession`/`useProjection`/`sessionId`) | `dsh-client-ui-session/lib/client.js:755-764`, `:1012-1031`, `:1102-1119` |
| standard props synthesis / kit assembly | `dsh-client-ui-renderer/lib/client.js:667-702`, `:736-767`, `:773-791` |
| `observableHook` / `keyedObservableHook` / call forms | `dsh-client-ui-renderer/lib/client.js:219-294` |
| `bindSlotHookFactories` (`hooks: {x} → useX`) | `dsh-client-ui-renderer/lib/client.js:491-498` |
| slot register validation (keyed needs `key`, must be declared) | `dist/assets/index-BXV-oxvX.js` (`SlotCore.register`) |
| `standardHookPropName = 'use' + Capitalized` | `dist/assets/index-BXV-oxvX.js` (`function kI`) |
| frozen module table | `dist/assets/index-BXV-oxvX.js` (`function OZ`) |
| slot catalog entry for the seat + standardProps | `dsh-cordis-client-runner/lib/client.js:5844-5896` |
| `SessionProjectionMap` | `dsh-api-session-controller/lib/typert.host.js:2886-2888` |
| `ContextPressure/Breakdown/TokenUsage/TodoItem/ModelSelection` | same file `:2322`, `:2314`, `:3134`, `:3126`, `:2598-2602` |
| `ctx.sessions` provided; `retain`/`binding` | `dsh-api-session-controller/lib/client.js:3814-3855`, `:4056-4058` |
| `ProjectionValueStore.faceOf/get/values` | `dsh-api-session-controller/lib/types/client/sessions/projection-store.js:25-70` |
| `contextPressure` wire view | `dsh-token-meter/lib/index.js:448-495` |
| `contextBreakdown` wire view | `dsh-token-meter/lib/index.js:241-243` |
| `tokenUsage` buckets | `dsh-token-meter/lib/types/usage-projection.js:29-35` |
| `sessionStats` view schema | `dsh-session-stats/lib/types/projection.js:24-33`, `:159-172` |
| `ContextMeter` / `contextOccupancy` | `dsh-client-ui-conversation/lib/client.js:18711-18713`, `:18626-18634` |
| package-reference prose (seats, guide, limits) | `dsh-client-ui-sidebar-right/README.md` §Extension seats, §The guide, §Known Limitations |
| client plugin declaration (`dsh.client`) | `dsh-package-manifest/README.md`; `dsh-client-modules/README.md`; host parse `lib/index.js:65-75` |
| `dsh.client.inject` = bundle arrival order | `dsh-client-modules/lib/client.js:776-794` |
