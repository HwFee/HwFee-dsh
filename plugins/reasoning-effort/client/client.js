/**
 * dsh-reasoning-effort client bundle.
 *
 * Sources live in `client/src/`; `npm run build` bundles them into
 * `client/client.js` in the host's module-loader format
 * (`window.__ModuleLoader__.load`).
 *
 * WHAT IT DOES. One settings row: a discrete slider over the current model's
 * reasoning-effort levels. Moving it re-submits the current provider/model with
 * the new effort through `session.selectModel` — the same Host call the
 * composer's own effort pane makes — so the change applies to the next request
 * exactly as if the user had picked the level from the model menu.
 *
 * WHAT IT DELIBERATELY IS NOT. It is not a fixed five-stop control. The stop
 * count is the length of `reasoning.efforts[]` in the live catalog for the
 * selected model: two levels → two stops, three → three, none → no row at all,
 * one → a read-only label (a one-position slider is a dead control). The
 * reference component this design is ported from hardcodes Claude's five
 * levels; that list is used here only as a copy table keyed by id.
 *
 * READS.  the active session (`sessions.list` → `retainedBy.mainView`), its
 *         durable selection (`projections.faceOf('modelSelection')`), and the
 *         Host model catalog (`remote.session.modelCatalog()`).
 * WRITES. `remote.session.selectModel({ sessionId, provider, model,
 *         reasoningEffort })`, with the CURRENT provider/model plus the chosen
 *         level. An id the model does not advertise is refused locally.
 *
 * Live: the catalog reloads on the same four Host events the host's own model
 * seat listens to, and the session list and selection projection are subscribed
 * directly, so a model switch changes the stop count immediately and clamps the
 * current value.
 */

window.__ModuleLoader__.load({
  id: 'dsh-reasoning-effort',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name2 in all)
        __defProp(target, name2, { get: all[name2], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    // client/src/index.js
    var index_exports = {};
    __export(index_exports, {
      apply: () => apply,
      inject: () => inject,
      name: () => name
    });
    module.exports = __toCommonJS(index_exports);

    // client/src/constants.js
    var PLUGIN_ID = "dsh-reasoning-effort";
    var SETTINGS_ROW_ID = "dsh-reasoning-effort";
    var SETTINGS_ROW_ORDER = 28;
    var PANEL_STYLE_ID = PLUGIN_ID + "/panel";
    var LEVEL_META_IDS = ["low", "medium", "high", "xhigh", "max"];
    var WARNING_LEVEL_ID = "max";
    var LEVEL_ORDER = LEVEL_META_IDS;

    // client/src/locales.js
    var LOCALE_NS = "dsh-reasoning-effort";
    var en = {
      // The row itself.
      "row.title": "Thinking effort",
      "row.desc": "Higher effort means more thorough reasoning, but takes longer and uses limits faster.",
      "row.sessionless": "Open a session to change its thinking effort.",
      // State lines.
      "state.loading": "Reading the model catalog\u2026",
      "state.unavailable": "Effort levels unavailable",
      "badge.default": "Default",
      // The reference's EFFORT_META, translated.
      "level.low.name": "Low",
      "level.low.desc": "Quick replies to simple questions",
      "level.medium.name": "Medium",
      "level.medium.desc": "Light, casual tasks",
      "level.high.name": "High",
      "level.high.desc": "Balanced for everyday work",
      "level.xhigh.name": "Extra",
      "level.xhigh.desc": "Complex, detailed work",
      "level.max.name": "Max",
      "level.max.desc": "The hardest problems. Takes longest.",
      "level.max.warning": "May use excessive tokens resulting in long response times and may hit token limits. Use sparingly for the hardest tasks.",
      // Accessibility.
      "aria.label": "Thinking effort, {name}, level {index} of {count}",
      "aria.single": "Thinking effort is fixed at {name} for this model",
      "note.pending": "Applying\u2026",
      "note.failed": "Could not change the effort",
      "error.write": "Effort change failed: {message}",
      "error.notAdvertised": "This model does not offer that effort level"
    };
    var zh = {
      "row.title": "\u601D\u8003\u5F3A\u5EA6",
      "row.desc": "\u5F3A\u5EA6\u8D8A\u9AD8\uFF0C\u601D\u8003\u8D8A\u5145\u5206\uFF0C\u4F46\u8017\u65F6\u66F4\u4E45\u3001\u66F4\u5BB9\u6613\u89E6\u53CA\u7528\u91CF\u4E0A\u9650\u3002",
      "row.sessionless": "\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\u540E\u624D\u80FD\u8C03\u6574\u5B83\u7684\u601D\u8003\u5F3A\u5EA6\u3002",
      "state.loading": "\u6B63\u5728\u8BFB\u53D6\u6A21\u578B\u76EE\u5F55\u2026",
      "state.unavailable": "\u601D\u8003\u5F3A\u5EA6\u4E0D\u53EF\u7528",
      "badge.default": "\u9ED8\u8BA4",
      "level.low.name": "\u4F4E",
      "level.low.desc": "\u7B80\u5355\u95EE\u9898\u7684\u5FEB\u901F\u56DE\u7B54",
      "level.medium.name": "\u4E2D",
      "level.medium.desc": "\u8F7B\u677E\u3001\u65E5\u5E38\u7684\u4EFB\u52A1",
      "level.high.name": "\u9AD8",
      "level.high.desc": "\u65E5\u5E38\u5DE5\u4F5C\u7684\u5747\u8861\u6863",
      "level.xhigh.name": "\u6781\u9AD8",
      "level.xhigh.desc": "\u590D\u6742\u3001\u7EC6\u81F4\u7684\u5DE5\u4F5C",
      "level.max.name": "\u6700\u9AD8",
      "level.max.desc": "\u6700\u96BE\u7684\u95EE\u9898\uFF0C\u8017\u65F6\u6700\u957F\u3002",
      "level.max.warning": "\u53EF\u80FD\u6D88\u8017\u8FC7\u591A token\uFF0C\u5BFC\u81F4\u54CD\u5E94\u65F6\u95F4\u53D8\u957F\uFF0C\u5E76\u89E6\u53CA\u7528\u91CF\u4E0A\u9650\u3002\u53EA\u5728\u6700\u96BE\u7684\u4EFB\u52A1\u4E0A\u5076\u5C14\u4F7F\u7528\u3002",
      "aria.label": "\u601D\u8003\u5F3A\u5EA6\uFF1A{name}\uFF0C\u7B2C {index} \u6863\uFF0C\u5171 {count} \u6863",
      "aria.single": "\u8FD9\u4E2A\u6A21\u578B\u7684\u601D\u8003\u5F3A\u5EA6\u56FA\u5B9A\u4E3A {name}",
      "note.pending": "\u6B63\u5728\u5E94\u7528\u2026",
      "note.failed": "\u65E0\u6CD5\u4FEE\u6539\u601D\u8003\u5F3A\u5EA6",
      "error.write": "\u601D\u8003\u5F3A\u5EA6\u4FEE\u6539\u5931\u8D25\uFF1A{message}",
      "error.notAdvertised": "\u5F53\u524D\u6A21\u578B\u6CA1\u6709\u8FD9\u4E2A\u601D\u8003\u5F3A\u5EA6\u6863\u4F4D"
    };
    function makeTranslator(dict) {
      return function translate(key, params) {
        const template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
        return String(template).replace(/\{(\w+)\}/g, function(match, name2) {
          return params && Object.prototype.hasOwnProperty.call(params, name2) ? String(params[name2]) : match;
        });
      };
    }
    function makeT(injected) {
      return typeof injected === "function" ? injected : makeTranslator(en);
    }

    // client/src/styles.js
    var PANEL_CSS = [
      "/* ---- thinking effort: the row --------------------------------------- */",
      // Row chrome copied from the host's General-row recipe (16px padding, a .5px
      // hairline, 14/22 title, 12/18 description) — the same geometry the sibling
      // plugin rows use, so this row sits in the section without a seam.
      ".dre-row { display: flex; align-items: flex-start; gap: 24px; padding: 16px 0;",
      "  border-bottom: .5px solid var(--dsw-alias-border-l2); justify-content: space-between; }",
      ".dre-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;",
      "  padding-right: 32px; }",
      ".dre-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 400; line-height: 22px; }",
      ".dre-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 400;",
      "  line-height: 18px; }",
      ".dre-control { flex: none; display: flex; flex-direction: column; gap: 8px;",
      "  align-items: flex-end; min-width: 232px; }",
      "/* ---- the level name, the Default badge, the description ------------- */",
      // The reference's `Thinking: {name}` capsule reduced to the value line above
      // the track: name in the primary tone, the Default marker as a neutral chip.
      ".dre-value { display: flex; align-items: center; gap: 6px; min-height: 20px;",
      "  font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }",
      ".dre-badge { flex: none; padding: 0 6px; border-radius: 9999px;",
      "  background: var(--dsw-alias-interactive-bg-hover);",
      "  color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 16px; }",
      "/* ---- the track: a flat pill with one clay fill ---------------------- */",
      // `--dre-fill` is written inline by the row as a percentage, so the fill
      // tracks the thumb without a second React render of the stylesheet.
      ".dre-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 20px;",
      "  background: transparent; cursor: pointer; margin: 0; }",
      ".dre-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 9999px;",
      "  background: linear-gradient(to right,",
      "    var(--dsw-alias-state-business-primary) 0 var(--dre-fill, 0%),",
      "    var(--dsw-alias-border-l1) var(--dre-fill, 0%) 100%); }",
      ".dre-slider::-moz-range-track { height: 6px; border-radius: 9999px;",
      "  background: var(--dsw-alias-border-l1); }",
      ".dre-slider::-moz-range-progress { height: 6px; border-radius: 9999px;",
      "  background: var(--dsw-alias-state-business-primary); }",
      "/* ---- the thumb: 14px clay pill with the CDS ring -------------------- */",
      ".dre-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;",
      "  width: 14px; height: 14px; margin-top: -4px; border: 0; border-radius: 9999px;",
      "  background: var(--dsw-alias-state-business-primary);",
      "  box-shadow: 0 1px 2px hsla(0, 0%, 8%, .18);",
      "  transition: box-shadow .12s cubic-bezier(.16, 1, .3, 1); }",
      ".dre-slider::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 9999px;",
      "  background: var(--dsw-alias-state-business-primary);",
      "  box-shadow: 0 1px 2px hsla(0, 0%, 8%, .18);",
      "  transition: box-shadow .12s cubic-bezier(.16, 1, .3, 1); }",
      // The CDS three-layer focus ring, drawn on the thumb the way the reference
      // draws it on its controls: an inset separator, the accent core, the glow.
      ".dre-slider:focus-visible { outline: none; }",
      ".dre-slider:focus-visible::-webkit-slider-thumb {",
      "  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),",
      "    0 0 0 1.5px var(--dsw-focus-ring-color),",
      "    0 0 6px 1px var(--dsw-alias-state-business-tertiary); }",
      ".dre-slider:focus-visible::-moz-range-thumb {",
      "  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),",
      "    0 0 0 1.5px var(--dsw-focus-ring-color),",
      "    0 0 6px 1px var(--dsw-alias-state-business-tertiary); }",
      // The clay breathing glow the reference puts on its pulsing dot, attached to
      // the thumb while the control has focus. Under `prefers-reduced-motion` the
      // animation is dropped entirely and only the static ring remains.
      "@media (prefers-reduced-motion: no-preference) {",
      "  .dre-slider:focus-visible::-webkit-slider-thumb { animation: dre-breathe 2.4s",
      "    cubic-bezier(.4, 0, .2, 1) infinite; }",
      "  .dre-slider:focus-visible::-moz-range-thumb { animation: dre-breathe 2.4s",
      "    cubic-bezier(.4, 0, .2, 1) infinite; }",
      "}",
      "@keyframes dre-breathe {",
      "  0%, 100% { box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),",
      "    0 0 0 1.5px var(--dsw-focus-ring-color),",
      "    0 0 4px 1px var(--dsw-alias-state-business-tertiary); }",
      "  50% { box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),",
      "    0 0 0 1.5px var(--dsw-focus-ring-color),",
      "    0 0 10px 2px var(--dsw-alias-state-business-tertiary); }",
      "}",
      "/* ---- the stops: a tick under every advertised level ----------------- */",
      // Rendered as absolutely positioned ticks over the same width the input
      // spans, so N stops = N marks with no extra DOM in the track itself. Each
      // tick is centred on its stop with `translateX(-50%)`.
      ".dre-ticks { position: relative; width: 100%; height: 10px; margin-top: -4px; }",
      ".dre-tick { position: absolute; top: 0; width: 2px; height: 6px; border-radius: 9999px;",
      "  background: var(--dsw-alias-border-l3); transform: translateX(-50%); }",
      '.dre-tick[data-past="true"] { background: var(--dsw-alias-state-business-primary); }',
      "/* ---- the max warning, the reference amber block --------------------- */",
      ".dre-warning { display: flex; gap: 6px; padding: 6px 8px; border-radius: 8px;",
      "  background: var(--dsw-alias-state-warn-tertiary);",
      "  color: var(--dsw-alias-state-warn-label);",
      "  font-size: 11px; line-height: 15px; max-width: 320px; text-align: left; }",
      ".dre-warning-mark { flex: none; }",
      "/* ---- the degenerate one-level case: a label, never a slider --------- */",
      ".dre-single { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }",
      "/* ---- the write failure: say so, do not pretend ---------------------- */",
      ".dre-error { padding: 6px 8px; border-radius: 8px;",
      "  background: var(--dsw-alias-interactive-bg-hover-danger);",
      "  color: var(--dsw-alias-state-error-primary);",
      "  font-size: 11px; line-height: 15px; max-width: 320px; text-align: left; }",
      "/* ---- the pending write: a single quiet line ------------------------- */",
      ".dre-pending { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 15px; }",
      "@media (max-width: 600px) {",
      "  .dre-row { flex-wrap: wrap; gap: 12px; }",
      "  .dre-control { width: 100%; align-items: stretch; min-width: 0; }",
      "  .dre-row-text { padding-right: 0; }",
      "}"
    ].join("\n");
    function installPanelCss(document_) {
      const doc = document_ === void 0 ? typeof document === "undefined" ? void 0 : document : document_;
      if (doc === void 0 || !doc.head) return;
      if (doc.getElementById(PANEL_STYLE_ID) !== null) return;
      const tag = doc.createElement("style");
      tag.id = PANEL_STYLE_ID;
      tag.dataset.plugin = PLUGIN_ID;
      tag.textContent = PANEL_CSS;
      doc.head.appendChild(tag);
    }
    function removePanelCss(document_) {
      const doc = document_ === void 0 ? typeof document === "undefined" ? void 0 : document : document_;
      if (doc === void 0 || !doc.head) return;
      const tag = doc.getElementById(PANEL_STYLE_ID);
      if (tag !== null && tag.parentNode) tag.parentNode.removeChild(tag);
    }

    // client/src/controller.js
    var MAIN_VIEW_SOURCE = "mainView";
    var CATALOG_EVENTS = [
      "llm/adapters-updated",
      "settings/document-updated",
      "credentials/record-updated",
      "credentials/reference-updated"
    ];
    function modelKey(selection) {
      return JSON.stringify([selection.provider, selection.model]);
    }
    function mainSessionId(sessions) {
      if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== "function") return void 0;
      const snapshot = sessions.list.getSnapshot();
      if (!snapshot || !Array.isArray(snapshot.ids)) return void 0;
      for (const id of snapshot.ids) {
        const row = snapshot.byId === void 0 ? void 0 : snapshot.byId[id];
        const retained = row === void 0 ? void 0 : row.retainedBy;
        if (retained !== void 0 && retained !== null && (retained[MAIN_VIEW_SOURCE] ?? 0) > 0) return id;
      }
      return void 0;
    }
    function failureOf(result) {
      if (result === null || typeof result !== "object") return "no response";
      if (result.ok === true) return void 0;
      const error = result.error;
      if (error === null || typeof error !== "object") return "unknown error";
      const code = typeof error.code === "string" ? error.code : "error";
      const message = typeof error.message === "string" ? error.message : "";
      return message === "" ? code : code + ": " + message;
    }
    function createEffortController(deps) {
      const source = deps === null || typeof deps !== "object" ? {} : deps;
      const remote = source.remote;
      const injectedNamespace = source.remoteSession;
      const sessions = source.sessions;
      const listeners = /* @__PURE__ */ new Set();
      const reasoningByKey = /* @__PURE__ */ new Map();
      const disposers = [];
      let snapshot = Object.freeze({
        phase: "idle",
        sessionId: void 0,
        provider: void 0,
        modelId: void 0,
        reasoning: null,
        selected: void 0,
        error: void 0,
        catalogStatus: "idle"
      });
      let catalog = null;
      let catalogStatus = "idle";
      let catalogError;
      let generation = 0;
      let started = false;
      let disposed = false;
      let faceUnsub = null;
      let faceKey;
      function resolveNamespace() {
        if (injectedNamespace !== void 0 && injectedNamespace !== null) return injectedNamespace;
        if (remote === null || remote === void 0) return void 0;
        try {
          return remote.session;
        } catch (error) {
          return void 0;
        }
      }
      function publish(next) {
        const merged = Object.assign({}, snapshot, next);
        const same = Object.keys(merged).every(function(key) {
          return Object.is(merged[key], snapshot[key]);
        });
        if (same) return;
        snapshot = Object.freeze(merged);
        for (const listener of [...listeners]) {
          try {
            listener(snapshot);
          } catch (error) {
          }
        }
      }
      function project() {
        if (disposed) return snapshot;
        const sessionId = mainSessionId(sessions);
        if (sessionId === void 0) {
          if (faceUnsub !== null) {
            faceUnsub();
            faceUnsub = null;
            faceKey = void 0;
          }
          publish({
            phase: "no-session",
            sessionId: void 0,
            provider: void 0,
            modelId: void 0,
            reasoning: null,
            selected: void 0,
            error: void 0,
            catalogStatus
          });
          return snapshot;
        }
        if (faceKey !== sessionId) {
          if (faceUnsub !== null) {
            faceUnsub();
            faceUnsub = null;
          }
          faceKey = sessionId;
          const binding2 = typeof sessions.binding === "function" ? sessions.binding(sessionId) : void 0;
          const projections2 = binding2 === void 0 ? void 0 : binding2.session.projections;
          const face2 = projections2 !== void 0 && typeof projections2.faceOf === "function" ? projections2.faceOf("modelSelection") : void 0;
          if (face2 !== void 0 && typeof face2.subscribe === "function") {
            const unsubscribe = face2.subscribe(function() {
              project();
            });
            faceUnsub = typeof unsubscribe === "function" ? unsubscribe : null;
          }
        }
        const binding = typeof sessions.binding === "function" ? sessions.binding(sessionId) : void 0;
        const projections = binding === void 0 ? void 0 : binding.session.projections;
        const face = projections !== void 0 && typeof projections.faceOf === "function" ? projections.faceOf("modelSelection") : void 0;
        const projected = face !== void 0 && typeof face.getSnapshot === "function" ? face.getSnapshot() : void 0;
        const intended = (projected !== void 0 && projected !== null ? projected.next : void 0) ?? (catalog !== null ? catalog.default : void 0);
        if (intended === void 0 || intended === null) {
          publish({
            // `unsupported` is the row's "render nothing" state: this host exposes
            // no model catalog, so there is no level list to draw.
            phase: catalogStatus === "error" ? "error" : catalogStatus === "unsupported" ? "unsupported" : "loading",
            sessionId,
            provider: void 0,
            modelId: void 0,
            reasoning: null,
            selected: void 0,
            error: catalogStatus === "error" ? catalogError : void 0,
            catalogStatus
          });
          return snapshot;
        }
        const reasoning = reasoningByKey.get(modelKey(intended));
        const selected = typeof intended.reasoningEffort === "string" ? intended.reasoningEffort : void 0;
        publish({
          phase: "ready",
          sessionId,
          provider: intended.provider,
          modelId: intended.model,
          reasoning: reasoning === void 0 ? null : reasoning,
          selected,
          error: void 0,
          catalogStatus
        });
        return snapshot;
      }
      async function loadCatalog() {
        const namespace = resolveNamespace();
        if (namespace === void 0 || typeof namespace.modelCatalog !== "function") {
          catalogStatus = "unsupported";
          catalogError = void 0;
          project();
          return snapshot;
        }
        const mine = ++generation;
        catalogStatus = "loading";
        project();
        let result;
        try {
          result = await namespace.modelCatalog();
        } catch (error) {
          if (mine !== generation || disposed) return snapshot;
          catalogStatus = "error";
          catalogError = error instanceof Error ? error.message : String(error);
          project();
          return snapshot;
        }
        if (mine !== generation || disposed) return snapshot;
        const failure = failureOf(result);
        if (failure !== void 0) {
          catalogStatus = "error";
          catalogError = failure;
          project();
          return snapshot;
        }
        const value = result.value === null || typeof result.value !== "object" ? null : result.value;
        catalog = value;
        reasoningByKey.clear();
        if (value !== null && Array.isArray(value.groups)) {
          for (const group of value.groups) {
            const models = group === null || typeof group !== "object" ? [] : group.models;
            if (!Array.isArray(models)) continue;
            for (const model of models) {
              if (model === null || typeof model !== "object") continue;
              reasoningByKey.set(modelKey({ provider: group.id, model: model.id }), model.reasoning);
            }
          }
        }
        catalogStatus = "ready";
        catalogError = void 0;
        project();
        return snapshot;
      }
      async function setEffort(effort) {
        if (disposed) return { ok: false, error: "disposed" };
        const current = snapshot;
        if (current.phase !== "ready" || current.provider === void 0 || current.modelId === void 0) {
          return { ok: false, error: "no selection" };
        }
        const advertised = current.reasoning === null || !Array.isArray(current.reasoning.efforts) ? [] : current.reasoning.efforts;
        const offered = advertised.some(function(level) {
          return level !== null && level.id === effort;
        });
        if (!offered) return { ok: false, error: "effort not advertised" };
        const namespace = resolveNamespace();
        if (namespace === void 0 || typeof namespace.selectModel !== "function") {
          return { ok: false, error: "selectModel unavailable" };
        }
        let result;
        try {
          result = await namespace.selectModel({
            sessionId: current.sessionId,
            provider: current.provider,
            model: current.modelId,
            reasoningEffort: effort
          });
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        const failure = failureOf(result);
        if (failure !== void 0) return { ok: false, error: failure };
        project();
        return { ok: true };
      }
      return {
        getSnapshot() {
          return snapshot;
        },
        subscribe(listener) {
          listeners.add(listener);
          return function unsubscribe() {
            listeners.delete(listener);
          };
        },
        start() {
          if (started || disposed) return;
          started = true;
          const on = remote !== null && remote !== void 0 ? remote["$on"] : void 0;
          if (typeof on === "function") {
            for (const name2 of CATALOG_EVENTS) {
              try {
                const dispose = on.call(remote, name2, function() {
                  loadCatalog().catch(function() {
                  });
                });
                if (typeof dispose === "function") disposers.push(dispose);
              } catch (error) {
              }
            }
          }
          const list = sessions !== null && sessions !== void 0 ? sessions.list : void 0;
          if (list !== void 0 && typeof list.subscribe === "function") {
            const dispose = list.subscribe(function() {
              project();
            });
            if (typeof dispose === "function") disposers.push(dispose);
          }
          loadCatalog().catch(function(error) {
            if (disposed) return;
            catalogStatus = "error";
            catalogError = error instanceof Error ? error.message : String(error);
            project();
          });
        },
        refresh() {
          if (disposed) return Promise.resolve(snapshot);
          return loadCatalog();
        },
        setEffort,
        dispose() {
          disposed = true;
          generation += 1;
          if (faceUnsub !== null) {
            faceUnsub();
            faceUnsub = null;
          }
          for (const dispose of disposers.splice(0)) {
            try {
              dispose();
            } catch (error) {
            }
          }
          listeners.clear();
        },
        /** Test seam: the plugin name, so a log line names the owner. */
        owner: PLUGIN_ID
      };
    }

    // client/src/levels.js
    function isKnownLevelId(id) {
      return LEVEL_META_IDS.indexOf(id) !== -1;
    }
    function orderEfforts(efforts) {
      if (!Array.isArray(efforts)) return [];
      return efforts.map(function(effort, index) {
        const rank = LEVEL_ORDER.indexOf(effort && effort.id);
        return { effort, index, rank: rank === -1 ? LEVEL_ORDER.length : rank };
      }).sort(function(a, b) {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.index - b.index;
      }).map(function(entry) {
        return entry.effort;
      });
    }
    function buildLevelModel(input) {
      const source = input && typeof input === "object" ? input : {};
      const t = typeof source.t === "function" ? source.t : function identity(key) {
        return key;
      };
      const reasoning = source.reasoning && typeof source.reasoning === "object" ? source.reasoning : null;
      const advertised = reasoning !== null && Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
      const efforts = orderEfforts(advertised.filter(function(effort) {
        return effort !== null && typeof effort === "object" && typeof effort.id === "string" && effort.id !== "";
      }));
      if (efforts.length === 0) {
        return {
          mode: "none",
          stops: [],
          index: -1,
          selected: void 0,
          defaultId: void 0,
          warning: false,
          description: void 0
        };
      }
      const defaultId = reasoning !== null && typeof reasoning.defaultEffort === "string" ? reasoning.defaultEffort : void 0;
      const stops = efforts.map(function(effort, index2) {
        const known = isKnownLevelId(effort.id);
        const name2 = known ? t("level." + effort.id + ".name") : typeof effort.name === "string" && effort.name !== "" ? effort.name : effort.id;
        const description = known ? t("level." + effort.id + ".desc") : void 0;
        return {
          id: effort.id,
          index: index2,
          name: name2,
          description,
          known,
          isDefault: effort.id === defaultId,
          warning: effort.id === WARNING_LEVEL_ID
        };
      });
      let index = -1;
      if (typeof source.selected === "string") {
        index = stops.findIndex(function(stop) {
          return stop.id === source.selected;
        });
      }
      if (index === -1 && defaultId !== void 0) {
        index = stops.findIndex(function(stop) {
          return stop.id === defaultId;
        });
      }
      if (index === -1) index = 0;
      const active = stops[index];
      return {
        mode: stops.length === 1 ? "label" : "slider",
        stops,
        index,
        selected: active.id,
        defaultId,
        // The reference's warning block is keyed on the `max` id AND shown only
        // while that stop is the selected one.
        warning: active.id === WARNING_LEVEL_ID && active.description !== void 0,
        description: active.description
      };
    }
    function stopAt(stops, raw) {
      if (!Array.isArray(stops) || stops.length === 0) return void 0;
      const n = Math.round(Number(raw));
      if (!Number.isFinite(n)) return stops[0];
      return stops[Math.min(stops.length - 1, Math.max(0, n))];
    }
    function isAdvertised(stops, id) {
      if (!Array.isArray(stops) || typeof id !== "string") return false;
      return stops.some(function(stop) {
        return stop.id === id;
      });
    }

    // client/src/panel.js
    function Ticks(React2, stops, index) {
      if (stops.length < 2) return null;
      const marks = stops.map(function(stop, at) {
        const percent = at / (stops.length - 1) * 100;
        return React2.createElement("span", {
          key: stop.id,
          className: "dre-tick",
          "data-past": at <= index ? "true" : "false",
          style: { left: percent + "%" }
        });
      });
      return React2.createElement("div", { className: "dre-ticks", "aria-hidden": "true" }, ...marks);
    }
    function createPanel({ React: React2, controller }) {
      function EffortRow(props) {
        const t = makeT(props && props.t);
        const state = React2.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
        const [pending, setPending] = React2.useState(null);
        const [failure, setFailure] = React2.useState(null);
        React2.useEffect(function() {
          if (pending === null) return void 0;
          const model2 = buildLevelModel({ reasoning: state.reasoning, selected: state.selected, t });
          if (!isAdvertised(model2.stops, pending)) setPending(null);
          return void 0;
        }, [state.provider, state.modelId, pending]);
        function commit(id) {
          if (pending !== null) return;
          setFailure(null);
          setPending(id);
          controller.setEffort(id).then(function(result) {
            setPending(null);
            if (result.ok) return;
            setFailure(result.error === "effort not advertised" ? t("error.notAdvertised") : t("error.write", { message: result.error === void 0 ? "" : result.error }));
          }).catch(function(error) {
            setPending(null);
            setFailure(t("error.write", { message: error instanceof Error ? error.message : String(error) }));
          });
        }
        const title = React2.createElement("div", { className: "dre-title" }, t("row.title"));
        const description = React2.createElement("div", { className: "dre-desc" }, t("row.desc"));
        function shell(control2) {
          return React2.createElement(
            "div",
            { className: "dre-row" },
            React2.createElement("div", { className: "dre-row-text" }, title, description),
            control2
          );
        }
        if (state.phase === "no-session") {
          return shell(React2.createElement(
            "div",
            { className: "dre-control" },
            React2.createElement("div", { className: "dre-pending" }, t("row.sessionless"))
          ));
        }
        if (state.phase === "loading" || state.phase === "idle") {
          return shell(React2.createElement(
            "div",
            { className: "dre-control" },
            React2.createElement("div", { className: "dre-pending" }, t("state.loading"))
          ));
        }
        if (state.phase === "error") {
          return shell(React2.createElement(
            "div",
            { className: "dre-control" },
            React2.createElement(
              "div",
              { className: "dre-error" },
              state.error === void 0 ? t("state.unavailable") : t("error.write", { message: state.error })
            )
          ));
        }
        if (state.phase === "unsupported") return null;
        const model = buildLevelModel({ reasoning: state.reasoning, selected: state.selected, t });
        if (model.mode === "none") return null;
        const active = model.stops[model.index];
        const valueLine = React2.createElement(
          "div",
          { className: "dre-value" },
          React2.createElement("span", null, active.name),
          active.isDefault ? React2.createElement("span", { className: "dre-badge" }, t("badge.default")) : null
        );
        if (model.mode === "label") {
          return shell(React2.createElement(
            "div",
            { className: "dre-control" },
            React2.createElement(
              "div",
              {
                className: "dre-single",
                "aria-label": t("aria.single", { name: active.name })
              },
              active.name,
              active.isDefault ? React2.createElement("span", { className: "dre-badge" }, t("badge.default")) : null
            ),
            active.description === void 0 ? null : React2.createElement("div", { className: "dre-pending" }, active.description)
          ));
        }
        const fill = model.stops.length > 1 ? Math.round(model.index / (model.stops.length - 1) * 100) : 0;
        const control = React2.createElement(
          "div",
          { className: "dre-control" },
          valueLine,
          React2.createElement("input", {
            type: "range",
            className: "dre-slider",
            // The range is the advertised list, 0..N-1 — never a fixed 1..5.
            min: 0,
            max: model.stops.length - 1,
            step: 1,
            value: model.index,
            // The accessible name and value are the level's own, not "3".
            "aria-label": t("row.title"),
            "aria-valuetext": t("aria.label", {
              name: active.name,
              index: model.index + 1,
              count: model.stops.length
            }),
            disabled: pending !== null,
            style: { "--dre-fill": fill + "%" },
            onChange: function(event) {
              const stop = stopAt(model.stops, parseInt(event.target.value, 10));
              if (stop === void 0 || stop.id === model.selected) return;
              commit(stop.id);
            }
          }),
          Ticks(React2, model.stops, model.index),
          active.description === void 0 ? null : React2.createElement("div", { className: "dre-pending" }, active.description),
          model.warning ? React2.createElement(
            "div",
            { className: "dre-warning", role: "note" },
            React2.createElement("span", { className: "dre-warning-mark", "aria-hidden": "true" }, "\u26A0\uFE0F"),
            React2.createElement("span", null, t("level.max.warning"))
          ) : null,
          pending !== null ? React2.createElement("div", { className: "dre-pending" }, t("note.pending")) : null,
          failure !== null ? React2.createElement("div", { className: "dre-error", role: "alert" }, failure) : null
        );
        return shell(control);
      }
      return { EffortRow };
    }

    // client/src/lifecycle.js
    function createLifecycle({ React: React2, primitives: primitives2 }) {
      const uiReady = Boolean(React2) && Boolean(primitives2);
      let applied = false;
      let warned = false;
      function warnOnce(message) {
        if (warned) return;
        warned = true;
        console.warn(message);
      }
      function apply2(ctx) {
        if (!ctx || applied) return;
        if (!uiReady) {
          warnOnce("dsh-reasoning-effort: react/primitives unavailable; the effort row is not registered");
          return;
        }
        const slots = ctx.slots;
        if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") {
          warnOnce("dsh-reasoning-effort: slots service unavailable; the effort row is not registered");
          return;
        }
        applied = true;
        if (ctx.locale && typeof ctx.locale.register === "function") {
          ctx.effect(function() {
            return ctx.locale.register(LOCALE_NS, { en, zh });
          }, "dsh-reasoning-effort: locale dictionaries");
        }
        ctx.effect(function() {
          installPanelCss();
          return function() {
            applied = false;
            removePanelCss();
          };
        }, "dsh-reasoning-effort: row styles");
        ctx.inject(["sessions", "remote", "remote.session"], function(scope) {
          const remote = scope.get("remote");
          const controller = createEffortController({
            remote,
            remoteSession: scope.get("remote.session"),
            sessions: scope.get("sessions")
          });
          const panel = createPanel({ React: React2, controller });
          controller.start();
          scope.effect(function() {
            return function() {
              controller.dispose();
            };
          }, "dsh-reasoning-effort: effort controller");
          slots.inject("settings.general.item", function() {
            return slots.register({
              name: "settings.general.item",
              id: SETTINGS_ROW_ID,
              order: SETTINGS_ROW_ORDER,
              locale: LOCALE_NS
            }, panel.EffortRow);
          });
        });
      }
      return apply2;
    }

    // client/src/index.js
    var React = null;
    try {
      React = require("react");
    } catch (error) {
      React = null;
    }
    var primitives = null;
    try {
      primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    } catch (error) {
      primitives = null;
    }
    var name = PLUGIN_ID;
    var inject = ["slots", "locale"];
    var apply = createLifecycle({ React, primitives });
    return module.exports
  },
})
