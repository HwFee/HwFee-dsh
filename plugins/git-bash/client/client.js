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
      "shell.reason.no-shell-found": "No usable shell was found. Install Git for Windows, or set DSH_GIT_BASH.",
      // The tool card's header: the reference names the action, not the tool.
      "run.done": "Ran a command",
      "run.running": "Running a command",
      "run.stopped": "Stopped running the command",
      "run.copy": "Copy command"
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
      "shell.reason.no-shell-found": "\u6CA1\u6709\u53EF\u7528\u7684 shell\u3002\u8BF7\u5B89\u88C5 Git for Windows\uFF0C\u6216\u8BBE\u7F6E DSH_GIT_BASH\u3002",
      "run.done": "\u5DF2\u8FD0\u884C\u547D\u4EE4",
      "run.running": "\u6B63\u5728\u8FD0\u884C\u547D\u4EE4",
      "run.stopped": "\u5DF2\u505C\u6B62\u8FD0\u884C\u547D\u4EE4",
      "run.copy": "\u590D\u5236\u547D\u4EE4"
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

    // client/src/tool-view.js
    var OPERATORS = ["&&", "||", "|", ";", ">>", ">", "<"];
    var WORD_BREAK = /* @__PURE__ */ new Set([" ", "	", "\n", "|", ";", ">", "<", '"', "'"]);
    function tokenizeShell(command) {
      const tokens = [];
      if (typeof command !== "string" || command === "") return tokens;
      let i = 0;
      let expectCommand = true;
      while (i < command.length) {
        const ch = command[i];
        if (ch === " " || ch === "	" || ch === "\n") {
          const start = i;
          while (i < command.length && (command[i] === " " || command[i] === "	" || command[i] === "\n")) i += 1;
          tokens.push({ text: command.slice(start, i), kind: "plain" });
          continue;
        }
        if (ch === '"' || ch === "'") {
          const quote = ch;
          let j2 = i + 1;
          while (j2 < command.length) {
            if (quote === '"' && command[j2] === "\\") {
              j2 += 2;
              continue;
            }
            if (command[j2] === quote) {
              j2 += 1;
              break;
            }
            j2 += 1;
          }
          tokens.push({ text: command.slice(i, j2), kind: "string" });
          i = j2;
          expectCommand = false;
          continue;
        }
        const operator = OPERATORS.find(function(candidate) {
          return command.startsWith(candidate, i);
        });
        if (operator !== void 0) {
          tokens.push({ text: operator, kind: "operator" });
          i += operator.length;
          expectCommand = true;
          continue;
        }
        let j = i;
        while (j < command.length && !WORD_BREAK.has(command[j])) j += 1;
        const word = command.slice(i, j);
        if (expectCommand) {
          tokens.push({ text: word, kind: "command" });
          expectCommand = false;
        } else {
          tokens.push({ text: word, kind: word.startsWith("-") ? "flag" : "arg" });
        }
        i = j;
      }
      return tokens;
    }
    function readArguments(argsRaw) {
      if (typeof argsRaw !== "string" || argsRaw === "") return null;
      try {
        const value = JSON.parse(argsRaw);
        return typeof value === "object" && value !== null ? value : null;
      } catch (error) {
        return null;
      }
    }
    function resultText(block) {
      const parts = [];
      const content = Array.isArray(block?.content) ? block.content : [];
      for (const part of content) {
        if (part?.type === "text") parts.push(part.text);
        else parts.push(JSON.stringify(part, null, 2));
      }
      const error = block?.error;
      if (parts.length === 0 && error !== void 0 && error !== null) {
        parts.push(String(error.name ?? "Error") + ": " + String(error.code ?? ""));
      }
      return parts.join("\n");
    }
    function createRunShellRow({ React: React2 }) {
      const h = React2.createElement;
      function CopyCommandButton({ text, label }) {
        const [copied, setCopied] = React2.useState(false);
        const timer = React2.useRef(null);
        React2.useEffect(function clearOnUnmount() {
          return function clear() {
            if (timer.current !== null) clearTimeout(timer.current);
          };
        }, []);
        const copy = function copy2() {
          const clipboard = typeof navigator === "undefined" ? void 0 : navigator.clipboard;
          if (clipboard === void 0 || typeof clipboard.writeText !== "function") return;
          void clipboard.writeText(text).then(function done() {
            setCopied(true);
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = setTimeout(function decay() {
              setCopied(false);
            }, 1e3);
          }, function failed() {
          });
        };
        return h(
          "button",
          {
            type: "button",
            className: "dsh-gb-copy",
            "aria-label": label,
            "data-copied": copied ? "true" : void 0,
            onClick: copy
          },
          // THE HOST'S OWN COPY GLYPH, not a character stand-in. The two-rect mark
          // below is the exact SVG the banner renders (`_action_1pq26_43` button,
          // `aria-label="Copy"`), copied so the command card's control is visually
          // the same control the read and edit cards show — same 14px box, same 1px
          // stroke, same fill rule. A `⧉` character rendered at a different weight
          // and optical size, which is what this replaced.
          copied ? h("svg", { width: 12, height: 12, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, h("path", { d: "M3.5 8.5l3 3 6-6", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" })) : h(
            "svg",
            {
              // 12px inside an 18px box: the command box is a small surface, and the
              // 14px glyph the banner uses looked heavy in it.
              width: 12,
              height: 12,
              viewBox: "0 0 16 16",
              fill: "none",
              xmlns: "http://www.w3.org/2000/svg",
              "aria-hidden": "true",
              strokeWidth: 1
            },
            h("rect", { x: 1.52075, y: 4.07373, width: 10.3932, height: 10.3932, rx: 2, stroke: "currentColor" }),
            h("path", {
              d: "M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z",
              fill: "currentColor"
            })
          )
        );
      }
      function RunShellRow(props) {
        const t = typeof props.t === "function" ? props.t : function untranslated(key) {
          return key;
        };
        const block = props.block;
        const done = block !== null && typeof block === "object" && "kind" in block;
        const call = done ? block.call : block;
        const args = readArguments(done ? call?.argsRaw : block?.argsRaw);
        const command = typeof args?.command === "string" ? args.command : "";
        const description = typeof args?.description === "string" ? args.description.trim() : "";
        const output = done ? resultText(block) : "";
        const interrupted = done && block.error?.code === "interrupted";
        const state = !done ? block?.phase === "preparing" ? "preparing" : "running" : interrupted ? "stopped" : block.isError ? "error" : "ok";
        const disclosure = typeof props.useDisclosure === "function" ? props.useDisclosure() : null;
        const expanded = disclosure !== null && disclosure.expanded === true;
        const toggle = disclosure === null ? null : disclosure.toggle;
        const canExpand = command !== "" || output !== "";
        const title = description !== "" ? description : state === "stopped" ? t("run.stopped") : state === "running" || state === "preparing" ? t("run.running") : t("run.done");
        const activate = canExpand && toggle !== null ? toggle : void 0;
        const onKeyDown = canExpand && toggle !== null ? function onKeyDown2(event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggle();
        } : void 0;
        return h(
          "div",
          {
            className: "dsh-gb-tool",
            // The wire name that dispatched this row: run_shell, pwsh or bash. It
            // stays on the DOM because the theme and the E2E probes key on
            // `[data-tool]`, exactly like the host's own rows.
            "data-tool": typeof props.toolName === "string" && props.toolName !== "" ? props.toolName : "run_shell",
            "data-state": state,
            "data-expanded": expanded ? "true" : "false"
          },
          h(
            "div",
            {
              className: "dsh-gb-tool-head" + (canExpand ? " is-expandable" : ""),
              role: canExpand ? "button" : void 0,
              tabIndex: canExpand ? 0 : void 0,
              "aria-expanded": canExpand ? expanded : void 0,
              onClick: activate,
              onKeyDown
            },
            h(
              "span",
              { className: "dsh-gb-tool-chevron", "aria-hidden": "true" },
              h("svg", {
                width: 14,
                height: 14,
                viewBox: "0 0 16 16",
                fill: "none",
                xmlns: "http://www.w3.org/2000/svg",
                strokeWidth: 1
              }, h("path", {
                // One down-chevron; the stylesheet rotates it while the row is closed.
                d: "M4 6L7.29289 9.29289C9.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6",
                stroke: "currentColor"
              }))
            ),
            h("span", { className: "dsh-gb-tool-title" }, title)
          ),
          canExpand && expanded ? h(
            "div",
            { className: "dsh-gb-tool-body" },
            h(
              "div",
              { className: "dsh-gb-tool-request" },
              h("span", { className: "dsh-gb-tool-prompt", "aria-hidden": "true" }, "$"),
              h(
                "code",
                { className: "dsh-gb-tool-command" },
                tokenizeShell(command).map(function(token, index) {
                  return h("span", { key: index, "data-token": token.kind }, token.text);
                })
              ),
              // A HOOK COMPONENT, NOT A HELPER CALL. `CopyCommandButton` uses
              // useState/useRef/useEffect, so calling it as a plain function would
              // add hooks only while the row is expanded — the hook count would
              // change between renders and React would throw, dropping the whole
              // row. `h(...)` gives it its own component instance, mounted and
              // unmounted with the body.
              h(CopyCommandButton, { text: command, label: t("run.copy") })
            ),
            output !== "" ? h("pre", { className: "dsh-gb-tool-respond" }, output) : null
          ) : null
        );
      }
      return RunShellRow;
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

    /* ---- the run_shell tool card --------------------------------------
       The reference (Claude Code desktop) draws a shell call as one boxed
       command line and then the output as BARE flowing text. Colours are the
       reference's own Shiki palette; every surface/ink value is a host token so
       the card follows the app's light and dark themes. */
    .dsh-gb-tool {
      --dsh-gb-command: #0073e6;
      --dsh-gb-argument: #1e9e3c;
      --dsh-gb-punctuation: #737373;
      --dsh-gb-ink: #1a1a1a;
    }

    body[data-ds-dark-theme] .dsh-gb-tool {
      --dsh-gb-command: #70b8ff;
      --dsh-gb-argument: #9be963;
      --dsh-gb-punctuation: #818898;
      --dsh-gb-ink: #eaecf0;
    }

    /* The header: description only, 24px seat, muted until hovered. No tool name
       and no icon \u2014 the reference's rows are a sentence and a chevron. */
    .dsh-gb-tool-head {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 24px;
      color: var(--dsw-alias-label-tertiary);
      font-size: var(--dsh-content-font-size-secondary, 13px);
      line-height: 18px;
      transition: color 100ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .dsh-gb-tool-head.is-expandable {
      cursor: pointer;
    }

    .dsh-gb-tool-head.is-expandable:hover,
    .dsh-gb-tool-head.is-expandable:focus-visible {
      color: var(--dsw-alias-label-secondary);
    }

    .dsh-gb-tool-head:focus-visible {
      outline: none;
    }

    .dsh-gb-tool[data-state="error"] .dsh-gb-tool-head {
      color: var(--dsw-alias-state-error-primary);
    }

    .dsh-gb-tool[data-state="stopped"] .dsh-gb-tool-head {
      color: var(--dsw-alias-state-warn-label, var(--dsw-alias-label-tertiary));
    }

    .dsh-gb-tool-chevron {
      display: inline-flex;
      flex: none;
      transform: rotate(-90deg);
      transition: transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .dsh-gb-tool[data-expanded="true"] .dsh-gb-tool-chevron {
      transform: none;
    }

    /* THE ROW ITSELF IS PROSE, NOT CODE, AND IT HAS AN EXPLICIT SIZE.
       Measured live: the card inherited 16px from the conversation, so the tool
       name rendered at 16px next to host rows that are 13px \u2014 the "enormous font"
       report. Host tool rows are 13/19 in this density, so this pins the same.
       24px keeps the row on the same rhythm as the host cells. */
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool {
      font-family: var(--dsw-font-family) !important;
      font-size: calc(13px + var(--dsh-content-font-delta, 0px));
      line-height: calc(19px + var(--dsh-content-font-delta, 0px));
      font-weight: 400;
      letter-spacing: normal;
    }
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-head {
      min-height: 24px;
      align-items: center;
    }
    .dsh-gb-tool-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Body: the card is inset under the row (the reference reserves 10px on each
       side and 4px above). */
    .dsh-gb-tool-body {
      display: flex;
      flex-direction: column;
      /* ZERO, NOT 10px. The flex gap stacked on top of the output card's own margin,
         so the visual distance was 12px where the margin said 2px. The output's
         margin is now the only thing controlling that gap. */
      gap: 0;
      margin: 4px 0 8px 22px;
    }

    /* The request: a real code surface with the "$" prompt, wrapped by default
       (the theme has no wrap toggle \u2014 every block wraps).

       SURFACE. The card sits on the conversation canvas, and the command box must
       read as a distinct block rather than melting into it: the fill is the host's
       code-block token (a shade off the canvas in light mode, a lifted dark surface
       in dark mode) plus a hairline, which is exactly the reference's separation.

       TYPE. Both halves of this card (request and response below) read the SAME
       rung the theme publishes for tool-card payloads \u2014
       --dsw-font-markdown-code-block-small \u2014 rather than a hard-coded 12px.
       The hard-coded pair used to disagree with the read/edit cards (now 13/20),
       which is why the command and its output looked like two different breeds of
       text in one card: same family, different size and leading, and a font:
       shorthand resets letter-spacing/kerning each time it is declared. */
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 4px;
      /* NO CAP HERE EITHER. The 160px ceiling was copied from the reference's
         fixed-height panel; a command is as long as it is, and clipping it behind a
         scroller hides the thing the card exists to show. */
      max-height: none;
      padding: 5px calc(10px + 1ch);
      overflow: visible;
      /* NO FILL, ONE OUTLINE. The reference's input card carries no background
         class at all: its "card" is a 1px inset outline
         (.epitaxy-card-outline-overlay { outline: 1px solid var(--cds-border);
         outline-offset: -1px }), which is why it needs no per-theme colour and
         never fights the surface behind it. */
      /* !important: measured live, a plain transparent lost to a higher-
         specificity surface rule and the box kept painting the theme's card tint.
         The reference has NO fill here at all, so this must win. */
      background: var(--cds-card-surface, #ffffff) !important;
      border: 0;
      border-radius: 8px;
      /* THE HAIRLINE IS A DOUBLE RING, not an outline. Two inset shadows: the
         first paints the border colour, the second paints the CARD COLOUR over it,
         so only the outer half of the first ring survives and the line reads
         thinner than 1px. This is how the reference engraves its fence without
         sub-pixel support. */
      position: relative;
      /* ONE STEP OFF THE CODE SURFACE, same 96/4 ink mix the theme's tool cards
         use: identical to the code block makes the box vanish into the card,
         identical to the card makes the block vanish into the box. */
      background: color-mix(in srgb, var(--dsw-alias-markdown-code-block, #ffffff) 96%, var(--dsw-alias-label-primary, #1f1f1f));
      color: var(--dsh-gb-ink);
      font: var(--dsw-font-markdown-code-block-small, 12px/1.6 var(--ds-font-family-code));
      /* !important: the theme pins the TEXT family on every non-code descendant of
         the conversation with !important, and a card div is not code/pre \u2014 a
         plain declaration here would lose and the command would render in Sans. */
      font-family: var(--ds-font-family-code) !important;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      box-shadow:
        inset 0 0 0 1px var(--dsw-alias-border-l1),
        inset 0 0 0 1px var(--cds-card-surface, #ffffff);
    }

    /* Room for the copy control in the top-right corner of the box. */
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-command {
      min-width: 0;
      padding-right: 22px;
      font: inherit;
      white-space: inherit;
    }

    /* The copy control: inside the command box, its own corner, quiet until the
       row is hovered \u2014 the same reveal the reference uses for its code rail. */
    .dsh-gb-copy {
      position: absolute;
      /* Tucked into the box's top-right corner, on its first line. top: 4px
         aligns it with the command text's cap height rather than the box's border
         (a single-line command left it looking high). */
      top: 8px;
      right: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      /* THE SHARED COPY CONTROL. The theme publishes --cds-copy-* on the
         conversation content so the tool-row rail, the markdown banner and this
         command box render one control instead of three drifting ones; the
         fallbacks keep the card correct without the theme installed. */
      width: var(--cds-copy-size, 18px);
      height: var(--cds-copy-size, 18px);
      padding: 0;
      border: 0;
      border-radius: var(--cds-copy-radius, var(--dsw-radius-xs, 4px));
      /* TRANSPARENT, not filled. A solid plate inside an already-tinted box read as
         a second surface; the reference's rail is bare and lets the code show
         through. */
      background: transparent;
      color: var(--cds-copy-ink, var(--dsw-alias-label-tertiary));
      font: inherit;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
      /* Invisible AND unclickable until revealed. Without this the control still
         answered the pointer while it had no paint, so a click on blank-looking
         space silently copied the command. */
      pointer-events: none;
      transition: opacity var(--cds-copy-reveal, 100ms) cubic-bezier(0.16, 1, 0.3, 1),
        color var(--cds-copy-reveal, 100ms) cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* HOVER-ONLY, exactly like the read and write cards: the rail is invisible
       until the pointer is on the tool row (or focus is inside it). */
    .dsh-gb-tool:hover .dsh-gb-copy,
    /* HOVER ONLY. The focus-within member kept the control painted after a click
       landed inside the card, until focus moved elsewhere \u2014 the same bug that was
       fixed in the theme rail. The button keeps its own :focus-visible rule so a
       keyboard user still sees it when they tab to it. */
    .dsh-gb-copy:focus-visible {
      opacity: 1;
      pointer-events: auto;
    }

    .dsh-gb-copy:hover {
      color: var(--cds-copy-ink-hover, var(--dsw-alias-label-primary));
    }

    .dsh-gb-copy[data-copied="true"] {
      color: var(--dsw-alias-state-success-primary);
    }

    .dsh-gb-copy-check {
      font-size: 12px;
      line-height: 1;
    }

    @media (prefers-reduced-motion: reduce) {
      .dsh-gb-copy {
        transition: none;
      }
    }

    .dsh-gb-tool-prompt {
      flex: none;
      color: var(--dsh-gb-punctuation);
      user-select: none;
    }



    .dsh-gb-tool-command [data-token="command"],
    .dsh-gb-tool-command [data-token="flag"] {
      color: var(--dsh-gb-command);
    }

    .dsh-gb-tool-command [data-token="arg"] {
      color: var(--dsh-gb-argument);
    }

    .dsh-gb-tool-command [data-token="operator"] {
      color: var(--dsh-gb-punctuation);
    }

    /* The response: no label, no frame \u2014 the same flowing text the thinking rows
       use. It caps its own height instead of pushing the conversation.

       Same rung as the request above, deliberately: the mock's output read as a
       different typeface from its command because one was 12/1.6 and the other
       12/1.65 in a family that falls back per-glyph (Anthropic Mono has no CJK, so
       a Chinese character in the output lands on a different face than the ASCII
       beside it). Sharing one token keeps size, leading and the shorthand's
       letter-spacing reset identical. */
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond {
      /* NO CAP, NO SCROLLER. The reference clips the output at 160px because its
         card is a fixed-height panel; this one is inline in a transcript, so a long
         output should simply be long. */
      max-height: none;
      overflow: visible;
      /* 5px: the one number that controls this distance (the flex gap above it is
         0, so nothing else contributes). */
      /* 8px and no frame: the output belongs to the page background, not to the
         command box above it. */
      margin: 8px 0 0;
      background: transparent;
      border: 0;
      outline: 0;
      color: var(--dsw-alias-label-secondary);
      font: var(--dsw-font-markdown-code-block-small, 12px/1.6 var(--ds-font-family-code));
      /* !important: the theme pins the TEXT family on every non-code descendant of
         the conversation with !important, and a card div is not code/pre \u2014 a
         plain declaration here would lose and the command would render in Sans. */
      font-family: var(--ds-font-family-code) !important;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    /* ---- typography measured from the reference's terminal view ----------
       .epitaxy-terminal-view is the only place in that app where the leading is
       hard-coded instead of tokenised:
         font-size: var(--cds-font-size-code, .75rem);   /* 13px */
         line-height: 1.55;                              /* = 20.15px, NOT the 19px
                                                            --cds-leading-code token */
       Everything in the view is weight 400 except the tool name, which is the only
       \font-weight declaration in the whole terminal stylesheet:
         .terminal-tool-name { font-weight: 600 }
       Letter-spacing is 0 everywhere (0 occurrences in the CSS; xterm default), and
       the view deliberately does NOT use 	abular-nums. */

    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-title {
      font-weight: 600;
    }

    /* EVERY DESCENDANT TOO (superseded below, kept for the record). The theme pins the prose family with a rule that
       MATCHES the token spans inside the command (conversation content, minus
       code/pre/kbd/samp). Inheritance loses to any matching rule, so the box was
       mono while its characters were sans \u2014 the "still sans" report. */
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request span,
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond span,
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request code,
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request,
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond {
      /* 13px PLUS THE USER'S DELTA. A literal 13px here ignored the code-size
         setting entirely: the code block beside it grew to 14px while the command
         card stayed 13px. --dsh-code-font-delta is what the system-fonts plugin
         drives, and 1.55 keeps the measured ratio as the size changes. */
      /* FIXED. Only inline code follows the code-size setting; a command block is
         pinned so its leading stays tuned to the card. */
      font-size: 12px;
      line-height: 17px;
      font-weight: 400;
      letter-spacing: 0;
    }
    /* THE OUTPUT CARD IS ONE PIXEL TIGHTER: 12/16, matching the reference's
       text-code row, while the command and diff surfaces stay at 12/17.
       NO BACKTICKS IN THIS COMMENT: the whole sheet is a template literal, so a
       stray backtick ends the string and the words after it become CODE \u2014 that is
       exactly how the text-code row name here shipped a bundle that threw
       "code is not defined" and failed the entire web boot. */
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond {
      line-height: 16px;
    }
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request span,
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond span,
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request code {
      font-family: var(--ds-font-family-code) !important;
      font-size: inherit;
    }
    /* CODE IS MONO, THE ROW TITLE IS NOT. This used to be scoped to the whole
       card (` * `), which also caught .dsh-gb-tool-title and turned the tool name
       into monospace. Only the command box and the output box are code. */
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request,
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-request *,
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond,
    [data-conversation-content] [data-slot="tool.call.toolview"] .dsh-gb-tool-respond *:not(svg) {
      font-family: var(--ds-font-family-code) !important;
    }
    `;
    function installCss(doc) {
      if (doc === void 0 || doc === null || typeof doc.createElement !== "function") {
        return function disposeWithoutDocument() {
        };
      }
      if (CSS.trim() === "") return function disposeWithoutCss() {
      };
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
      const RunShellRow = createRunShellRow({ React: React2 });
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
        for (const wireName of ["run_shell", "pwsh", "bash"]) {
          ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
            name: "tool.call.toolview",
            key: wireName,
            priority: 100,
            locale: LOCALE_NS
          }, RunShellRow));
        }
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
