/**
 * The browser half of `@hwfee/dsh-predict`.
 *
 * It owns two surfaces: the ghost text in the composer, and one settings row.
 * The model call happens on the Host, through the same `ctx.llm` service the
 * conversation itself uses.
 */

window.__ModuleLoader__.load({
  id: "@hwfee/dsh-predict",
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
    var PLUGIN_ID = "@hwfee/dsh-predict";
    var LOCALE_NS = "dsh-predict";

    // client/src/ghost.js
    var GHOST_MARKER = "data-dsh-predict-ghost";
    function createGhost({ document: doc, onAccept, onDismiss }) {
      if (doc === void 0 || doc === null || typeof doc.createElement !== "function") {
        return emptyController();
      }
      let element = null;
      let text = "";
      let keyHandler = null;
      let placement = null;
      let hiddenPlaceholder = null;
      const editor = () => doc.querySelector("[data-composer-input]");
      function placeholder() {
        const ed = editor();
        const card = ed?.closest("[data-composer-card]");
        if (card === null || card === void 0) return null;
        for (const child of card.querySelectorAll("*")) {
          if (child === ed || child.contains(ed)) continue;
          if (child.children.length !== 0) continue;
          const value = (child.textContent ?? "").trim();
          if (value === "") continue;
          const style = doc.defaultView?.getComputedStyle(child);
          if (style?.position === "absolute" && style?.pointerEvents === "none") return child;
        }
        return null;
      }
      function hidePlaceholder() {
        if (hiddenPlaceholder !== null) return;
        const target2 = placeholder();
        if (target2 === null) return;
        hiddenPlaceholder = { element: target2, previous: target2.style.visibility };
        target2.style.visibility = "hidden";
      }
      function restorePlaceholder() {
        if (hiddenPlaceholder === null) return;
        hiddenPlaceholder.element.style.visibility = hiddenPlaceholder.previous;
        hiddenPlaceholder = null;
      }
      function clear() {
        if (element !== null) {
          element.remove();
          element = null;
        }
        if (keyHandler !== null) {
          keyHandler.target.removeEventListener("keydown", keyHandler.listener, true);
          keyHandler = null;
        }
        if (placement !== null) {
          const { reposition, observer, view } = placement;
          placement = null;
          if (view && typeof view.removeEventListener === "function") {
            view.removeEventListener("resize", reposition);
          }
          if (typeof doc.removeEventListener === "function") {
            doc.removeEventListener("scroll", reposition, true);
          }
          if (observer !== null) {
            try {
              observer.disconnect();
            } catch (error) {
            }
          }
        }
        text = "";
        restorePlaceholder();
      }
      function target() {
        const ed = editor();
        if (ed === null) return null;
        if ((ed.innerText ?? "").trim() !== "") return null;
        const rect = ed.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return null;
        return { editor: ed, rect };
      }
      function place(tag, ed) {
        if (ed === null || ed.isConnected === false) {
          tag.style.display = "none";
          return;
        }
        const rect = ed.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) {
          tag.style.display = "none";
          return;
        }
        tag.style.display = "";
        const style = doc.defaultView?.getComputedStyle(ed);
        const padTop = Number.parseFloat(style?.paddingTop ?? "") || 0;
        const padLeft = Number.parseFloat(style?.paddingLeft ?? "") || 0;
        tag.style.fontSize = style?.fontSize ?? "inherit";
        tag.style.lineHeight = style?.lineHeight ?? "inherit";
        tag.style.maxWidth = Math.max(80, rect.width - 24) + "px";
        tag.style.left = rect.left + padLeft + "px";
        tag.style.top = rect.top + padTop + "px";
      }
      function show(suggestion) {
        clear();
        if (typeof suggestion !== "string" || suggestion.trim() === "") return false;
        const spot = target();
        if (spot === null) return false;
        text = suggestion;
        const tag = doc.createElement("div");
        tag.setAttribute(GHOST_MARKER, "");
        tag.setAttribute("aria-hidden", "true");
        tag.textContent = suggestion + " ";
        tag.style.cssText = [
          "position: fixed",
          "pointer-events: none",
          "user-select: none",
          // THE OVERLAY LIVES ON <body>, THE COMPOSER'S SEAT DOES NOT. The host
          // wraps the composer in a `position: sticky` seat with `z-index: 7`, and
          // a body-level overlay at z-index 1 paints UNDER it: the suggestion was
          // in the DOM, positioned over the caret, and invisible. 50 clears the
          // app's sticky/positioned layers (≤10) while staying below the host's
          // menus and dialogs (100/1000/1100), so a modal still covers it.
          "z-index: 50",
          "color: var(--dsw-alias-label-caption, rgba(128,128,128,0.75))",
          "white-space: pre",
          "overflow: hidden",
          "text-overflow: ellipsis"
        ].join(";");
        place(tag, spot.editor);
        doc.body.append(tag);
        element = tag;
        const view = doc.defaultView;
        const reposition = () => place(tag, spot.editor);
        if (view && typeof view.addEventListener === "function") {
          view.addEventListener("resize", reposition, { passive: true });
        }
        if (typeof doc.addEventListener === "function") {
          doc.addEventListener("scroll", reposition, { passive: true, capture: true });
        }
        let observer = null;
        if (view && typeof view.ResizeObserver === "function") {
          observer = new view.ResizeObserver(reposition);
          try {
            observer.observe(spot.editor);
            const card = spot.editor.closest?.("[data-composer-card]");
            if (card !== null && card !== void 0) observer.observe(card);
          } catch (error) {
          }
        }
        placement = { reposition, observer, view };
        hidePlaceholder();
        const listener = (event) => {
          if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.altKey && event.isComposing !== true) {
            event.preventDefault();
            event.stopPropagation();
            accept();
            return;
          }
          if (event.key === "Escape") {
            clear();
            onDismiss?.();
            return;
          }
          if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete" || event.key === "Enter") {
            clear();
            onDismiss?.();
          }
        };
        doc.addEventListener("keydown", listener, true);
        keyHandler = { target: doc, listener };
        return true;
      }
      function accept() {
        const suggested = text;
        const spot = target();
        clear();
        if (suggested === "" || spot === null) return false;
        const view = doc.defaultView;
        if (view === void 0 || typeof view.DataTransfer !== "function") return false;
        try {
          const data = new view.DataTransfer();
          data.setData("text/plain", suggested);
          spot.editor.focus();
          const event = new view.ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true
          });
          spot.editor.dispatchEvent(event);
        } catch {
          return false;
        }
        onAccept?.(suggested);
        return true;
      }
      return {
        show,
        clear,
        accept,
        /** Whether a suggestion is currently on screen. */
        get visible() {
          return element !== null;
        },
        /** The current suggestion text. */
        get text() {
          return text;
        }
      };
    }
    function emptyController() {
      return {
        show: () => false,
        clear: () => {
        },
        accept: () => false,
        get visible() {
          return false;
        },
        get text() {
          return "";
        }
      };
    }

    // client/src/styles.js
    var STYLE_MARKER = "data-dsh-predict-style";
    var CSS = `
    .dsh-predict-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      padding: 16px 0;
    }

    .dsh-predict-main { min-width: 0; flex: 1; }

    .dsh-predict-title {
      font-size: var(--dsh-content-font-size, 14px);
      line-height: 22px;
      color: var(--dsw-alias-label-primary);
    }

    .dsh-predict-hint {
      margin-top: 2px;
      font-size: var(--dsh-content-font-size-caption, 12px);
      line-height: 18px;
      color: var(--dsw-alias-label-tertiary);
    }

    .dsh-predict-control {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }

    .dsh-predict-model-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dsh-predict-model-label {
      font-size: var(--dsh-content-font-size-caption, 12px);
      color: var(--dsw-alias-label-tertiary);
      white-space: nowrap;
    }

    .dsh-predict-model-input {
      width: 200px;
      height: 28px;
      padding: 0 8px;
      border: 0.5px solid var(--dsw-alias-border-l1);
      border-radius: var(--dsw-radius-sm);
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: var(--dsh-content-font-size-secondary, 13px);
    }

    .dsh-predict-trigger {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 260px;
      height: 28px;
      padding: 0 4px 0 8px;
      border: 0.5px solid var(--dsw-alias-border-l1);
      border-radius: var(--dsw-radius-sm);
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: var(--dsh-content-font-size-secondary, 13px);
      cursor: pointer;
    }

    .dsh-predict-trigger:hover {
      background: var(--dsw-alias-interactive-bg-hover);
    }

    .dsh-predict-value {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dsh-predict-group {
      padding: 6px 8px 2px;
      font-size: var(--dsh-content-font-size-caption, 12px);
      color: var(--dsw-alias-label-tertiary);
    }

    .dsh-predict-item {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 160px;
    }

    .dsh-predict-check {
      display: inline-flex;
      color: var(--dsw-alias-label-primary);
    }

    .dsh-predict-status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px;
      font-size: var(--dsh-content-font-size-caption, 12px);
      color: var(--dsw-alias-label-tertiary);
    }

    .dsh-predict-retry {
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .dsh-predict-search {
      margin: 2px 0 3px;
    }
    `;
    function installCss(doc) {
      if (doc === void 0 || doc === null || typeof doc.createElement !== "function") {
        return function disposeWithoutDocument() {
        };
      }
      const previous = doc.querySelector(`style[${STYLE_MARKER}]`);
      if (previous !== null) previous.remove();
      const tag = doc.createElement("style");
      tag.setAttribute(STYLE_MARKER, "");
      tag.textContent = CSS;
      doc.head.append(tag);
      return function dispose() {
        tag.remove();
      };
    }

    // client/src/locales.js
    var en = {
      "predict.title": "Next Prompt",
      "predict.hint": "Tab fills the composer without sending.",
      "predict.enable": "Show predictions",
      "predict.model": "Prediction model",
      "predict.follow": "Follow current model",
      "predict.search": "Search models",
      "predict.empty": "No models available",
      "predict.error": "Could not load models",
      "predict.retry": "Retry"
    };
    var zh = {
      "predict.title": "\u4E0B\u4E00\u53E5",
      "predict.hint": "Tab \u586B\u5165\uFF0C\u4E0D\u4F1A\u53D1\u9001\u3002",
      "predict.enable": "\u663E\u793A\u9884\u6D4B",
      "predict.model": "\u9884\u6D4B\u6A21\u578B",
      "predict.follow": "\u8DDF\u968F\u5F53\u524D\u6A21\u578B",
      "predict.search": "\u641C\u7D22\u6A21\u578B",
      "predict.empty": "\u6682\u65E0\u53EF\u7528\u6A21\u578B",
      "predict.error": "\u6A21\u578B\u5217\u8868\u52A0\u8F7D\u5931\u8D25",
      "predict.retry": "\u91CD\u8BD5"
    };

    // lib/constants.js
    var PLUGIN_ID2 = "@hwfee/dsh-predict";

    // lib/settings.js
    var ENABLED_KEY = PLUGIN_ID2 + ":enabled";
    var PINNED_MODEL_KEY = PLUGIN_ID2 + ":pinnedModel";
    var DEFAULT_ENABLED = true;
    var DEFAULT_PINNED_MODEL = "";
    function readEnabled(storage) {
      if (storage === null || storage === void 0) return DEFAULT_ENABLED;
      try {
        return storage.getItem(ENABLED_KEY) !== "false";
      } catch {
        return DEFAULT_ENABLED;
      }
    }
    function readPinnedModel(storage) {
      if (storage === null || storage === void 0) return DEFAULT_PINNED_MODEL;
      let raw;
      try {
        raw = storage.getItem(PINNED_MODEL_KEY);
      } catch {
        return DEFAULT_PINNED_MODEL;
      }
      if (typeof raw !== "string") return DEFAULT_PINNED_MODEL;
      const slash = raw.indexOf("/");
      return slash > 0 && slash < raw.length - 1 ? raw : DEFAULT_PINNED_MODEL;
    }
    function persist(storage, key, value) {
      if (storage === null || storage === void 0) return false;
      try {
        storage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }

    // client/src/lifecycle.js
    var persistSafe = (storage, key, value) => {
      try {
        persist(storage, key, value);
      } catch {
      }
    };
    function createLifecycle({ React: React2, primitives: primitives2 }) {
      return function apply2(ctx) {
        ctx.effect(() => {
          return ctx.locale.register(LOCALE_NS, { en, zh });
        }, "dsh-predict: strings");
        ctx.effect(
          () => installCss(typeof document === "undefined" ? void 0 : document),
          "dsh-predict: ghost stylesheet"
        );
        const storage = typeof localStorage === "undefined" ? void 0 : localStorage;
        const doc = typeof document === "undefined" ? void 0 : document;
        const connection = typeof ctx.get === "function" ? ctx.get("connection") : void 0;
        const sessions = typeof ctx.get === "function" ? ctx.get("sessions") : void 0;
        const uiSession = typeof ctx.get === "function" ? ctx.get("uiSession") : void 0;
        const remoteSession = () => typeof ctx.get === "function" ? ctx.get("remote.session") : void 0;
        let disposed = false;
        const debug = (payload) => {
          if (typeof globalThis !== "undefined" && globalThis !== null) globalThis.__dshPredictDebug = payload;
        };
        let dirty = false;
        let tail = Promise.resolve();
        const enqueue = (operation) => {
          const run = tail.then(operation, operation);
          tail = run.then(() => void 0, () => void 0);
          return run;
        };
        const publish = () => enqueue(() => {
          if (disposed) return Promise.resolve();
          const snapshot = settingsStore.getSnapshot();
          const settings = { enabled: snapshot.enabled, pinnedModel: snapshot.pinnedModel };
          if (connection === void 0 || typeof connection.rpc?.call !== "function") {
            dirty = true;
            return Promise.resolve();
          }
          return connection.rpc.call("/api", "predictSettings/configure", { args: { settings } }).then((result) => {
            dirty = result?.ok !== true;
          }).catch(() => {
            dirty = true;
          });
        });
        const ensureConfigured = () => tail.then(() => {
          if (disposed) return false;
          if (!dirty) return true;
          return publish().then(() => !dirty);
        });
        let ghostSession = void 0;
        const ghost = createGhost({
          document: doc,
          // Accepting or dismissing both reach the host, because the host uses the
          // dismissal to skip the next turn.
          onAccept: () => {
          },
          onDismiss: () => {
            const sessionId = ghostSession;
            ghostSession = void 0;
            if (sessionId !== void 0) {
              enqueue(() => disposed || connection === void 0 ? Promise.resolve() : connection.rpc.call("/api", "predictSettings/dismiss", { args: { request: { sessionId } } }).catch(() => void 0));
            }
          }
        });
        let activeId = void 0;
        let unsubscribeFeed = void 0;
        let lastSeq = -1;
        let waitAbort = null;
        const abortWait = () => {
          const controller = waitAbort;
          waitAbort = null;
          if (controller !== null) controller.abort();
        };
        const requestSuggestion = (turnSeq) => {
          const sessionId = activeId;
          if (connection === void 0 || sessionId === void 0) return;
          if (settingsStore.getSnapshot().enabled !== true) {
            debug({ reason: "disabled", sessionId, turnSeq });
            return;
          }
          abortWait();
          const controller = new AbortController();
          waitAbort = controller;
          void ensureConfigured().then((configured) => {
            if (controller.signal.aborted || disposed) return;
            if (!configured) {
              debug({ reason: "error", sessionId, turnSeq });
              return;
            }
            return connection.rpc.call("/api", "predictSettings/suggestion", { args: { request: { sessionId, turnSeq } } }, controller.signal).then((result) => {
              if (controller.signal.aborted) return;
              if (waitAbort === controller) waitAbort = null;
              if (result?.ok !== true) {
                debug({ reason: "error", sessionId, turnSeq });
                catalog.invalidate();
                return;
              }
              const value = result.value;
              debug({ reason: value?.reason ?? null, sessionId, turnSeq });
              if (typeof value?.text !== "string" || value.text === "") return;
              if (value.sessionId !== sessionId || value.turnSeq !== turnSeq) return;
              if (activeId !== sessionId) return;
              if (settingsStore.getSnapshot().enabled !== true) return;
              if (ghost.show(value.text)) ghostSession = sessionId;
            }).catch(() => {
              if (!controller.signal.aborted) debug({ reason: "error", sessionId, turnSeq });
            });
          });
        };
        const handleEntry = (entry) => {
          const event = entry?.event;
          if (event === null || typeof event !== "object") return;
          if (typeof event.seq === "number") {
            if (event.seq <= lastSeq) return;
            lastSeq = event.seq;
          }
          if (event.type === "turn/start" || event.type === "user/message") {
            abortWait();
            ghostSession = void 0;
            ghost.clear();
            return;
          }
          if (event.type === "turn/end") requestSuggestion(event.seq);
        };
        const bind = (sessionId) => {
          abortWait();
          ghostSession = void 0;
          ghost.clear();
          if (unsubscribeFeed !== void 0) {
            unsubscribeFeed();
            unsubscribeFeed = void 0;
          }
          if (sessionId === void 0) return;
          const source = typeof sessions?.binding === "function" ? sessions.binding(sessionId)?.eventSource : void 0;
          if (source === void 0) return;
          const snapshot = source.getSnapshot();
          lastSeq = -1;
          const entries = snapshot?.entries ?? [];
          for (const entry of entries) {
            const seq = entry?.event?.seq;
            if (typeof seq === "number" && seq > lastSeq) lastSeq = seq;
          }
          unsubscribeFeed = source.subscribe(() => {
            const change = source.getSnapshot()?.change;
            const delta = change?.kind === "prepend" ? [] : change?.entries ?? (change?.entry !== void 0 ? [change.entry] : []);
            for (const entry of delta) handleEntry(entry);
          });
        };
        const catalog = createCatalogStore(remoteSession);
        const currentSessionId = () => {
          const snapshot = uiSession?.current?.getSnapshot?.();
          return typeof snapshot?.key === "string" ? snapshot.key : void 0;
        };
        const watchCurrent = uiSession === void 0 ? void 0 : uiSession.current.subscribe(() => {
          const next = currentSessionId();
          if (next === activeId) return;
          activeId = next;
          bind(next);
        });
        activeId = currentSessionId();
        bind(activeId);
        let lastGeneration = typeof connection?.generation?.getSnapshot === "function" ? connection.generation.getSnapshot() : void 0;
        const watchGeneration = typeof connection?.generation?.subscribe === "function" ? connection.generation.subscribe(() => {
          const next = connection.generation.getSnapshot();
          if (next === void 0 || next === lastGeneration) return;
          lastGeneration = next;
          abortWait();
          catalog.invalidate();
          bind(activeId);
          publish();
        }) : void 0;
        const onComposerInput = (event) => {
          if (doc === void 0 || event?.target !== doc.querySelector("[data-composer-input]")) return;
          abortWait();
          ghostSession = void 0;
          ghost.clear();
        };
        const COMPOSER_INPUT_OPTIONS = { capture: true, passive: true };
        if (doc !== void 0 && typeof doc.addEventListener === "function") {
          doc.addEventListener("input", onComposerInput, COMPOSER_INPUT_OPTIONS);
        }
        const SettingsRow = createRow(React2, primitives2);
        const settingsStore = createSettingsStore(storage, () => {
          abortWait();
          ghostSession = void 0;
          ghost.clear();
          publish();
        });
        publish();
        ctx.effect(() => () => settingsStore.dispose(), "dsh-predict: settings store");
        ctx.effect(() => () => {
          disposed = true;
          if (watchCurrent !== void 0) watchCurrent();
          if (watchGeneration !== void 0) watchGeneration();
          if (unsubscribeFeed !== void 0) unsubscribeFeed();
          if (doc !== void 0 && typeof doc.removeEventListener === "function") {
            doc.removeEventListener("input", onComposerInput, COMPOSER_INPUT_OPTIONS);
          }
          abortWait();
          catalog.dispose();
          ghostSession = void 0;
          ghost.clear();
        }, "dsh-predict: session watcher");
        ctx.slots.inject("settings.general.item", () => ctx.slots.register({
          name: "settings.general.item",
          id: "dsh-predict-settings",
          order: 44,
          locale: LOCALE_NS,
          inject: () => ({
            settingsStore,
            catalog,
            setEnabled: (value) => settingsStore.setEnabled(value),
            setPinnedModel: (value) => settingsStore.setPinnedModel(value)
          })
        }, SettingsRow));
      };
    }
    function createCatalogStore(resolveRemoteSession) {
      let snapshot = { status: "idle", value: null, error: null };
      let generation = 0;
      let inflight = null;
      const listeners = /* @__PURE__ */ new Set();
      const set = (next) => {
        snapshot = next;
        for (const listener of [...listeners]) listener();
      };
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        invalidate() {
          generation += 1;
          inflight = null;
          set({ status: "idle", value: null, error: null });
        },
        load() {
          if (snapshot.status === "ready") return Promise.resolve(snapshot.value);
          if (snapshot.status === "error") return Promise.reject(new Error(snapshot.error ?? "catalog-failed"));
          if (inflight !== null) return inflight;
          const gen = generation;
          const settle = (next) => {
            if (gen === generation) set(next);
          };
          set({ status: "loading", value: snapshot.value, error: null });
          const remote = resolveRemoteSession();
          const call = remote?.modelCatalog;
          let started;
          try {
            started = typeof call === "function" ? call.call(remote) : Promise.reject(new Error("remote-unavailable"));
          } catch (error) {
            started = Promise.reject(error);
          }
          const operation = Promise.resolve(started).then(
            (response) => {
              if (response?.ok !== true) {
                const error = new Error(response?.error?.code ?? "catalog-failed");
                settle({ status: "error", value: snapshot.value, error: error.message });
                throw error;
              }
              settle({ status: "ready", value: response.value ?? { groups: [] }, error: null });
              return response.value;
            },
            (error) => {
              settle({ status: "error", value: snapshot.value, error: String(error?.message ?? error) });
              throw error;
            }
          );
          inflight = operation;
          void operation.then(
            () => {
              if (inflight === operation) inflight = null;
            },
            () => {
              if (inflight === operation) inflight = null;
            }
          );
          return operation;
        },
        retry() {
          inflight = null;
          set({ status: "idle", value: snapshot.value, error: null });
          return this.load();
        },
        dispose() {
          generation += 1;
          inflight = null;
          listeners.clear();
          snapshot = { status: "idle", value: null, error: null };
        }
      };
    }
    function createSettingsStore(storage, onChange) {
      let enabled = readEnabled(storage);
      let pinnedModel = readPinnedModel(storage);
      let snapshot = { enabled, pinnedModel };
      const listeners = /* @__PURE__ */ new Set();
      const notify = () => {
        for (const listener of listeners) listener();
        onChange?.();
      };
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        setEnabled(value) {
          const next = value === true;
          if (next === enabled) return;
          enabled = next;
          snapshot = { enabled, pinnedModel };
          persistSafe(storage, ENABLED_KEY, next ? "true" : "false");
          notify();
        },
        setPinnedModel(value) {
          const next = typeof value === "string" ? value.trim() : "";
          if (next === pinnedModel) return;
          pinnedModel = next;
          snapshot = { enabled, pinnedModel };
          persistSafe(storage, PINNED_MODEL_KEY, next);
          notify();
        },
        dispose() {
          listeners.clear();
        }
      };
    }
    function createRow(React2, primitives2) {
      const h = React2.createElement;
      const Switch = primitives2 === null ? null : primitives2.Switch;
      const Input = primitives2 === null ? null : primitives2.Input;
      const Menu = primitives2 === null ? null : primitives2.Menu;
      const MenuItemButton = primitives2 === null ? null : primitives2.MenuItemButton;
      const IconChevron = primitives2 === null ? null : primitives2.IconChevronDownOutlineRegular;
      const IconCheck = primitives2 === null ? null : primitives2.IconCheckOutlineRegular;
      const rankByName = typeof primitives2?.rankByName === "function" ? primitives2.rankByName : null;
      const pinLabel = (pinned, catalogValue, t) => {
        if (pinned === "") return t("predict.follow");
        if (catalogValue !== null) {
          for (const group of catalogValue.groups ?? []) {
            for (const model of group.models ?? []) {
              if (group.id + "/" + model.id === pinned) return model.name ?? model.id;
            }
          }
        }
        return pinned;
      };
      return function PredictRow(props) {
        const t = props.t;
        const state = React2.useSyncExternalStore(
          props.settingsStore.subscribe,
          props.settingsStore.getSnapshot
        );
        const catalog = React2.useSyncExternalStore(
          props.catalog.subscribe,
          props.catalog.getSnapshot
        );
        const [open, setOpen] = React2.useState(false);
        const [query, setQuery] = React2.useState("");
        React2.useEffect(() => {
          if (!open) return;
          props.catalog.load().catch(() => {
          });
        }, [open, catalog.status]);
        const groups = catalog.value === null || typeof catalog.value !== "object" ? [] : catalog.value.groups ?? [];
        const term = query.trim();
        const groupsFor = () => groups.map((group) => ({
          id: group.id,
          name: group.name ?? group.id,
          models: rankByName === null || term === "" ? group.models ?? [] : rankByName(group.models ?? [], term)
        })).filter((group) => group.models.length > 0);
        const toggle = Switch === null ? h("input", {
          type: "checkbox",
          checked: state.enabled,
          "aria-label": t("predict.enable"),
          onChange: (event) => props.setEnabled(event.target.checked)
        }) : h(Switch, {
          checked: state.enabled,
          label: t("predict.enable"),
          onChange: (next) => props.setEnabled(next)
        });
        const choose = (pin) => {
          props.setPinnedModel(pin);
          setOpen(false);
          setQuery("");
        };
        const checkFor = (pin) => pin === state.pinnedModel && IconCheck !== null ? h("span", { className: "dsh-predict-check" }, h(IconCheck, { size: 14 })) : null;
        const selectFallback = h(
          "select",
          {
            className: "dsh-predict-model-input",
            "aria-label": t("predict.model"),
            value: state.pinnedModel,
            onFocus: () => {
              props.catalog.load().catch(() => {
              });
            },
            onChange: (event) => props.setPinnedModel(event.target.value)
          },
          h("option", { value: "" }, t("predict.follow")),
          groups.map((group) => h(
            "optgroup",
            { key: group.id, label: group.name ?? group.id },
            (group.models ?? []).map((model) => h("option", {
              key: model.id,
              value: group.id + "/" + model.id
            }, model.name ?? model.id))
          )),
          state.pinnedModel !== "" && pinLabel(state.pinnedModel, catalog.value, t) === state.pinnedModel ? h("option", { value: state.pinnedModel }, state.pinnedModel) : null
        );
        const layout = (control) => h(
          "div",
          { className: "dsh-predict-row" },
          h(
            "div",
            { className: "dsh-predict-main" },
            h("div", { className: "dsh-predict-title" }, t("predict.title")),
            h("div", { className: "dsh-predict-hint" }, t("predict.hint"))
          ),
          h(
            "div",
            { className: "dsh-predict-control" },
            h("div", { className: "dsh-predict-switch-row" }, toggle),
            h(
              "div",
              { className: "dsh-predict-model-row" },
              h("label", { className: "dsh-predict-model-label" }, t("predict.model")),
              control
            )
          )
        );
        if (Menu === null || MenuItemButton === null || Input === null || rankByName === null) {
          return layout(selectFallback);
        }
        const menuChildren = [];
        menuChildren.push(h(Input, {
          key: "search",
          className: "dsh-predict-search",
          value: query,
          placeholder: t("predict.search"),
          "aria-label": t("predict.search"),
          onChange: (event) => setQuery(event.target.value)
        }));
        menuChildren.push(h(MenuItemButton, {
          key: "follow",
          onSelect: () => choose("")
        }, h(
          "span",
          { className: "dsh-predict-item" },
          h("span", null, t("predict.follow")),
          checkFor("")
        )));
        if (catalog.status === "error") {
          menuChildren.push(h(
            "div",
            { key: "error", className: "dsh-predict-status" },
            h("span", null, t("predict.error")),
            h("button", {
              type: "button",
              className: "dsh-predict-retry",
              onClick: () => {
                props.catalog.retry().catch(() => {
                });
              }
            }, t("predict.retry"))
          ));
        } else if (catalog.status === "loading") {
          menuChildren.push(h("div", { key: "status", className: "dsh-predict-status" }, "\u2026"));
        } else {
          const grouped = groupsFor();
          if (grouped.length === 0 && catalog.status === "ready") {
            menuChildren.push(h("div", { key: "empty", className: "dsh-predict-status" }, t("predict.empty")));
          }
          for (const group of grouped) {
            menuChildren.push(h("div", { key: "group:" + group.id, className: "dsh-predict-group" }, group.name));
            for (const model of group.models) {
              const pin = group.id + "/" + model.id;
              menuChildren.push(h(MenuItemButton, {
                key: pin,
                onSelect: () => choose(pin)
              }, h(
                "span",
                { className: "dsh-predict-item" },
                h("span", null, model.name ?? model.id),
                checkFor(pin)
              )));
            }
          }
        }
        const trigger = (isOpen) => h(
          "button",
          {
            type: "button",
            className: "dsh-predict-trigger",
            "aria-label": t("predict.model"),
            "aria-haspopup": "menu",
            "aria-expanded": isOpen,
            onClick: () => setOpen(!isOpen)
          },
          h("span", { className: "dsh-predict-value" }, pinLabel(state.pinnedModel, catalog.value, t)),
          IconChevron === null ? "\u25BE" : h(IconChevron, { size: 12 })
        );
        return layout(h(Menu, {
          open,
          anchor: trigger(open),
          items: [],
          onSelect: () => setOpen(false),
          onClose: () => setOpen(false),
          align: "end",
          portal: true,
          autoFocus: false
        }, ...menuChildren));
      };
    }

    // client/src/index.js
    var name = PLUGIN_ID;
    var inject = ["slots", "locale", "connection", "sessions", "uiSession", "remote"];
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
    var apply = React === null ? function applyWithoutReact() {
    } : createLifecycle({ React, primitives });
    return module.exports
  },
})
