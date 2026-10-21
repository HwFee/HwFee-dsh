/**
 * The browser half of `@hwfee/dsh-git-bash`.
 *
 * It contributes ONE settings row: which shell is in use, and whether the
 * platform's own shell tool stays exposed. No card, no tool view — the shell
 * itself runs on the Host.
 *
 * React comes from the host's frozen module table; it is absent in a Node
 * import (the unit tests load this file for its `name`), so the entry degrades
 * to a no-op apply instead of throwing.
 */

window.__ModuleLoader__.load({
  id: "@hwfee/dsh-git-bash",
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
    var PLUGIN_ID = "@hwfee/dsh-git-bash";
    var LOCALE_NS = "dsh-git-bash";
    var SETTINGS_ROW_ID = PLUGIN_ID + "-shell";

    // client/src/locales.js
    var en = {
      "shell.title": "Default shell",
      "shell.hint": "Which interpreter runs shell commands.",
      "shell.mode": "Shell mode",
      "shell.mode.auto": "Automatic",
      // The user's own wording for the option. Which BUILD ran (7 vs 5.1) is a
      // detail the row does not show; the tool result names it per call.
      "shell.mode.pwsh": "Windows PowerShell",
      "shell.mode.gitbash": "Git Bash",
      "shell.current": "{kind} \xB7 {path}",
      "shell.notFound": "No shell resolved",
      "shell.kind.gitbash": "Git Bash",
      "shell.kind.posix-bash": "bash",
      "shell.kind.pwsh": "PowerShell 7",
      "shell.kind.windows-powershell": "Windows PowerShell 5.1",
      "shell.reason.gitbash-not-found": "Git Bash not found. Install Git for Windows, or set DSH_GIT_BASH.",
      "shell.reason.pwsh-not-found": "PowerShell not found. Install PowerShell 7 or Windows PowerShell.",
      "shell.reason.no-shell-for-platform": "Windows PowerShell is only available on Windows.",
      "shell.reason.no-shell-found": "No usable shell was found. Install Git for Windows, or set DSH_GIT_BASH."
    };
    var zh = {
      "shell.title": "\u9ED8\u8BA4 shell",
      "shell.hint": "\u7528\u54EA\u4E2A\u89E3\u91CA\u5668\u6267\u884C shell \u547D\u4EE4\u3002",
      "shell.mode": "Shell \u6A21\u5F0F",
      "shell.mode.auto": "\u81EA\u52A8",
      "shell.mode.pwsh": "Windows PowerShell",
      "shell.mode.gitbash": "Git Bash",
      "shell.current": "{kind} \xB7 {path}",
      "shell.notFound": "\u6CA1\u6709\u89E3\u6790\u5230 shell",
      "shell.kind.gitbash": "Git Bash",
      "shell.kind.posix-bash": "bash",
      "shell.kind.pwsh": "PowerShell 7",
      "shell.kind.windows-powershell": "Windows PowerShell 5.1",
      "shell.reason.gitbash-not-found": "\u6CA1\u627E\u5230 Git Bash\u3002\u8BF7\u5B89\u88C5 Git for Windows\uFF0C\u6216\u8BBE\u7F6E DSH_GIT_BASH\u3002",
      "shell.reason.pwsh-not-found": "\u6CA1\u627E\u5230 PowerShell\u3002\u8BF7\u5B89\u88C5 PowerShell 7 \u6216 Windows PowerShell\u3002",
      "shell.reason.no-shell-for-platform": "Windows PowerShell \u53EA\u5728 Windows \u4E0A\u53EF\u7528\u3002",
      "shell.reason.no-shell-found": "\u6CA1\u6709\u53EF\u7528\u7684 shell\u3002\u8BF7\u5B89\u88C5 Git for Windows\uFF0C\u6216\u8BBE\u7F6E DSH_GIT_BASH\u3002"
    };

    // lib/mode.js
    var MODES = ["auto", "pwsh", "gitbash"];
    var DEFAULT_MODE = "auto";
    var MODE_LABELS = {
      auto: "shell.mode.auto",
      pwsh: "shell.mode.pwsh",
      gitbash: "shell.mode.gitbash"
    };
    var KIND_LABELS = {
      gitbash: "shell.kind.gitbash",
      "posix-bash": "shell.kind.posix-bash",
      pwsh: "shell.kind.pwsh",
      "windows-powershell": "shell.kind.windows-powershell"
    };
    var REASON_LABELS = {
      "gitbash-not-found": "shell.reason.gitbash-not-found",
      "pwsh-not-found": "shell.reason.pwsh-not-found",
      "no-shell-for-platform": "shell.reason.no-shell-for-platform",
      "no-shell-found": "shell.reason.no-shell-found"
    };
    var LEGACY_BOOLEAN_KEY = "@hwfee/dsh-git-bash:exposeNativeShell";
    function isMode(value) {
      return typeof value === "string" && MODES.includes(value);
    }
    function normalizeMode(value) {
      return isMode(value) ? value : DEFAULT_MODE;
    }
    function readMode(storage, key) {
      if (storage === null || storage === void 0) return DEFAULT_MODE;
      let raw;
      try {
        raw = storage.getItem(key);
      } catch {
        return DEFAULT_MODE;
      }
      return normalizeMode(raw);
    }
    function writeMode(storage, key, mode) {
      if (storage === null || storage === void 0) return false;
      if (!isMode(mode)) return false;
      try {
        storage.setItem(key, mode);
        return true;
      } catch {
        return false;
      }
    }
    function migrateLegacyMode(storage, key) {
      if (storage === null || storage === void 0) return null;
      let current;
      try {
        current = storage.getItem(key);
      } catch {
        return null;
      }
      if (isMode(current)) return null;
      let legacy;
      try {
        legacy = storage.getItem(LEGACY_BOOLEAN_KEY);
      } catch {
        return null;
      }
      const migrated = legacy === "false" ? "gitbash" : legacy === "true" ? DEFAULT_MODE : null;
      if (migrated === null) return null;
      try {
        storage.setItem(key, migrated);
      } catch {
      }
      return migrated;
    }

    // client/src/store.js
    var MODE_KEY = PLUGIN_ID + ":mode";
    var SHELL_GLOBAL = "__dshGitBash";
    function createShellInfoStore(carrier) {
      const raw = carrier === void 0 ? void 0 : carrier[SHELL_GLOBAL];
      const valid = raw !== null && typeof raw === "object";
      const normalize = (record) => {
        const entry = record !== null && typeof record === "object" ? record : {};
        return {
          path: typeof entry.path === "string" ? entry.path : null,
          kind: typeof entry.kind === "string" ? entry.kind : null,
          source: typeof entry.source === "string" ? entry.source : null,
          reason: typeof entry.reason === "string" ? entry.reason : null
        };
      };
      const byMode = valid && raw.byMode !== null && typeof raw.byMode === "object" ? raw.byMode : null;
      const active = valid && raw.active !== null && typeof raw.active === "object" ? raw.active : raw;
      const single = normalize(active);
      const snapshots = byMode === null ? null : Object.fromEntries(Object.entries(byMode).map(([key, value]) => [key, normalize(value)]));
      return {
        /**
         * The resolution for one mode.
         *
         * Falls back to the active record when the mode is unknown, so a stale or
         * future value still shows SOMETHING rather than an empty row.
         *
         * @param {string} mode one of the three modes
         * @returns {object} the resolution
         */
        forMode(mode) {
          if (snapshots === null) return single;
          return snapshots[mode] ?? single;
        },
        getSnapshot: () => single,
        subscribe: () => () => {
        },
        dispose: () => {
        }
      };
    }
    function createModeStore(storage) {
      migrateLegacyMode(storage, MODE_KEY);
      let current = readMode(storage, MODE_KEY);
      const listeners = /* @__PURE__ */ new Set();
      return {
        getSnapshot: () => current,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        set(value) {
          if (!MODES.includes(value) || value === current) return;
          current = value;
          writeMode(storage, MODE_KEY, value);
          for (const listener of listeners) listener();
        },
        dispose() {
          listeners.clear();
        }
      };
    }
    function describeShell(info, t) {
      if (info.path === null) {
        return t(info.reason === null ? "shell.notFound" : REASON_LABELS[info.reason] ?? "shell.notFound");
      }
      const kind = info.kind === null ? "" : t(KIND_LABELS[info.kind] ?? info.kind);
      return t("shell.current", { path: info.path, kind });
    }

    // client/src/settings-row.js
    function createSettingsRow({ React: React2, primitives: primitives2 }) {
      const h = React2.createElement;
      const Menu = primitives2 === null ? null : primitives2.Menu;
      const MenuItemButton = primitives2 === null ? null : primitives2.MenuItemButton;
      const IconChevron = primitives2 === null ? null : primitives2.IconChevronDownOutlineRegular;
      const IconCheck = primitives2 === null ? null : primitives2.IconCheckOutlineRegular;
      function ShellRow(props) {
        const t = props.t;
        const mode = React2.useSyncExternalStore(props.modeStore.subscribe, props.modeStore.getSnapshot);
        const info = props.shellInfoStore.forMode(mode);
        const [open, setOpen] = React2.useState(false);
        const title = h("div", { className: "dsh-git-bash-title" }, t("shell.title"));
        const hint = h("div", { className: "dsh-git-bash-hint" }, t("shell.hint"));
        const failure = info.path === null ? h("div", { className: "dsh-git-bash-status dsh-git-bash-missing" }, describeShell(info, t)) : null;
        const label = t("shell.mode");
        const choose = (value) => {
          props.setMode(value);
          setOpen(false);
        };
        if (Menu === null || MenuItemButton === null) {
          return h(
            "div",
            { className: "dsh-git-bash-row", id: SETTINGS_ROW_ID },
            h("div", { className: "dsh-git-bash-main" }, title, hint, failure),
            h("select", {
              className: "dsh-git-bash-select",
              "aria-label": label,
              value: mode,
              onChange: (event) => props.setMode(event.target.value)
            }, MODES.map((value) => h("option", { key: value, value }, t(MODE_LABELS[value]))))
          );
        }
        const trigger = (isOpen) => h(
          "button",
          {
            type: "button",
            className: "dsh-git-bash-trigger",
            "aria-label": label,
            "aria-haspopup": "menu",
            "aria-expanded": isOpen,
            onClick: () => setOpen(!isOpen)
          },
          h("span", { className: "dsh-git-bash-value" }, t(MODE_LABELS[mode])),
          IconChevron === null ? "\u25BE" : h(IconChevron, { size: 12 })
        );
        const items = MODES.map((value) => h(MenuItemButton, {
          key: value,
          onSelect: () => choose(value)
        }, h(
          "span",
          { className: "dsh-git-bash-item" },
          h("span", null, t(MODE_LABELS[value])),
          value === mode && IconCheck !== null ? h("span", { className: "dsh-git-bash-check" }, h(IconCheck, { size: 14 })) : null
        )));
        return h(
          "div",
          { className: "dsh-git-bash-row", id: SETTINGS_ROW_ID },
          h("div", { className: "dsh-git-bash-main" }, title, hint, failure),
          h(Menu, {
            open,
            anchor: trigger(open),
            items: [],
            onSelect: () => setOpen(false),
            onClose: () => setOpen(false),
            align: "end",
            portal: true,
            autoFocus: false
          }, ...items)
        );
      }
      return ShellRow;
    }

    // client/src/styles.js
    var STYLE_MARKER = "data-dsh-git-bash-style";
    var CSS = `
    .dsh-git-bash-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      padding: 16px 0;
      /* NO border of our own. cds-theme owns the rule that draws the hairline under
         every settings row (the slot-child selector), and its selector is more
         specific than a single class \u2014 so a border here LOSES and the row ends up
         with the theme's line anyway. Declaring it was worse than useless: it made
         this row's line look different from its neighbours whenever the specificity
         race went the other way. The theme draws it; the row leaves space for it. */
    }

    .dsh-git-bash-main {
      min-width: 0;
      flex: 1;
    }

    .dsh-git-bash-title {
      font-size: var(--dsh-content-font-size, 14px);
      line-height: 22px;
      color: var(--dsw-alias-label-primary);
    }

    .dsh-git-bash-hint {
      margin-top: 2px;
      font-size: var(--dsh-content-font-size-caption, 12px);
      line-height: 18px;
      color: var(--dsw-alias-label-tertiary);
    }

    .dsh-git-bash-status {
      margin-top: 6px;
      font-size: var(--dsh-content-font-size-caption, 12px);
      line-height: 18px;
      color: var(--dsw-alias-label-secondary);
      /* A Windows path is long and has no spaces to break at, so wrap anywhere
         rather than let it push the menu off the row. */
      overflow-wrap: anywhere;
    }

    .dsh-git-bash-missing {
      color: var(--dsw-alias-state-error-primary, var(--dsw-alias-code-diff-deleted));
    }

    /* The trigger states the current mode, so the row is readable without opening
       the menu \u2014 the same shape the host's own multi-value rows use. */
    .dsh-git-bash-trigger {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: none;
      align-self: flex-start;
      height: 32px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--dsw-radius-md);
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: var(--dsh-content-font-size-secondary, 13px);
      cursor: pointer;
    }

    .dsh-git-bash-trigger:hover {
      background: var(--dsw-alias-interactive-bg-hover);
    }

    .dsh-git-bash-trigger:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary);
      outline-offset: 1px;
    }

    .dsh-git-bash-select {
      flex: none;
      align-self: flex-start;
      height: 32px;
      padding: 0 8px;
      border: 0.5px solid var(--dsw-alias-border-l1);
      border-radius: var(--dsw-radius-md);
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: var(--dsh-content-font-size-secondary, 13px);
    }

    /* One row per mode inside the popup, with a check on the active one. */
    .dsh-git-bash-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-width: 190px;
    }

    .dsh-git-bash-check {
      display: inline-flex;
      color: var(--dsw-alias-brand-primary);
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

    // client/src/lifecycle.js
    var MODE_EVENT = "git-bash/mode";
    var MODE_PATH = "/dsh-git-bash/mode";
    var MODE_MARKER_HEADER = "x-dsh-git-bash";
    function createLifecycle({ React: React2, primitives: primitives2 }) {
      const ShellRow = createSettingsRow({ React: React2, primitives: primitives2 });
      return function apply2(ctx) {
        ctx.effect(() => {
          return ctx.locale.register(LOCALE_NS, { en, zh });
        }, "dsh-git-bash: strings");
        ctx.effect(
          () => installCss(typeof document === "undefined" ? void 0 : document),
          "dsh-git-bash: row stylesheet"
        );
        const storage = typeof localStorage === "undefined" ? void 0 : localStorage;
        const shellInfo = createShellInfoStore(
          typeof globalThis === "undefined" ? void 0 : globalThis
        );
        ctx.effect(() => () => shellInfo.dispose(), "dsh-git-bash: shell info store");
        const modeStore = createModeStore(storage);
        ctx.effect(() => () => modeStore.dispose(), "dsh-git-bash: mode store");
        const publish = () => {
          const mode = modeStore.getSnapshot();
          ctx.emit(MODE_EVENT, { mode });
          if (typeof fetch !== "function") return;
          try {
            void fetch(MODE_PATH, {
              method: "POST",
              credentials: "same-origin",
              keepalive: true,
              headers: {
                "content-type": "application/json",
                [MODE_MARKER_HEADER]: "1"
              },
              body: JSON.stringify({ mode })
            }).catch(() => {
            });
          } catch (error) {
          }
        };
        publish();
        ctx.effect(() => modeStore.subscribe(publish), "dsh-git-bash: publish mode");
        ctx.slots.inject("settings.general.item", () => ctx.slots.register({
          name: "settings.general.item",
          id: SETTINGS_ROW_ID,
          order: 43,
          locale: LOCALE_NS,
          // The stores as ORDINARY props, not a `hooks` entry: a function component
          // receives props, while `hooks:` builds a `useName(selector)` prop that
          // only a framework-aware occupant reads. See `store.js`.
          inject: () => ({
            modeStore,
            shellInfoStore: shellInfo,
            setMode: (value) => modeStore.set(value)
          })
        }, ShellRow));
      };
    }

    // client/src/index.js
    var name = PLUGIN_ID;
    var inject = ["slots", "locale"];
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
