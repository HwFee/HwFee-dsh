/**
 * dsh-system-fonts client bundle.
 *
 * Sources live in `client/src/`; `npm run build` bundles them into
 * `client/client.js` in the host's module-loader format
 * (`window.__ModuleLoader__.load`), exactly the shape `dsh-client-ui-theme`
 * and `dsh-custom-font` ship.
 *
 * WHAT IT CHANGES: font FAMILIES, plus the row spacing and tracking of the
 * content column. Family names go through the host's own theme service
 * (`setFontFamily`), so this plugin's three dropdowns REPLACE the host's three
 * official family inputs (roles text/code/terminal) and share one persisted
 * state with them. Sizes stay on the host's steppers.
 *
 *   row 1  t('row.text.title')      ->  text family
 *   row 2  t('row.code.title')      ->  code family
 *   row 3  t('row.terminal.title')  ->  terminal family
 *   row 4  t('row.lineHeight.title')->  --dsw-font-markdown-*-line-height, 50–100
 *   row 5  t('row.tracking.title')  ->  letter-spacing on `[class*="markdown"]`
 *
 * No colour, no font-size axis, no column-width rule, and NO `font-weight`
 * declaration is ever emitted.
 *
 * WEIGHTS BELONG TO THE THEME. The host's typography is a scale of 30 steps
 * (`--dsw-font-base-16`, `--dsw-font-markdown-h1`, …), each a `font`
 * shorthand carrying its own weight; the active theme decides them. An earlier
 * build shipped a weight knob that shifted every step — that machinery is
 * gone, because a second weight authority can only fight the theme's. This
 * plugin rewrites a step's shorthand only to scale its `/line-height`.
 *
 * WHERE THE ROWS SIT. `settings.general.item` is a flat sibling list: a slot
 * can only inject rows next to the host's FontSettingsGroup, never inside it.
 * The rows therefore register at orders 12–16 and `merge.js` reparents them
 * INTO the group's collapsible font region after mount: each picker directly
 * after the official family row it replaces (正文字体 / 代码字体 / 终端字体),
 * the two sliders at the end, and the official family inputs covered (hidden).
 * While that region is collapsed the host removes it from the DOM, so the rows
 * are seated back in the slot outlet and hidden — they expand and collapse with
 * the group instead of showing as standalone entries. The merge is idempotent,
 * reversible on dispose, and does nothing at all when the host group cannot be
 * found.
 *
 * WHY `!important`. The host writes theme tokens per element and declares its
 * steps with its own specificity; an `!important` author declaration wins,
 * which is what makes a stylesheet the correct vehicle here. It is also the
 * approach the host's own theme stylesheets rely on.
 *
 * LANGUAGE. Every visible string — titles, descriptions, menu entries, search
 * placeholder, aria-labels — comes from `locale/zh.json` and
 * `locale/en.json` through `locales.js`, so a zh UI is pure Chinese and an en
 * UI pure English. The dictionaries are registered on the host locale service
 * (`locale: 'dsh-system-fonts'` on the slot registration injects `t`), the
 * same pattern `plugins/usage-stats` uses. The only Chinese left outside the
 * dictionaries is font DATA: the Windows face suffixes the Host half parses
 * (`中粗体` / `Regular`), which are file names, not UI copy.
 */

window.__ModuleLoader__.load({
  id: 'dsh-system-fonts',
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
      __internals: () => __internals,
      apply: () => apply,
      inject: () => inject,
      name: () => name
    });
    module.exports = __toCommonJS(index_exports);

    // client/src/constants.js
    var PLUGIN_ID = "dsh-system-fonts";
    var STORAGE_KEY = "dsh-system-fonts/settings";
    var FONTS_API = "/dsh-system-fonts/fonts";
    var FONTS_MARKER_HEADER = "x-dsh-system-fonts";
    var FONTS_MARKER_VALUE = "1";
    var STYLE_ID = "dsh-system-fonts-style";
    var PANEL_STYLE_ID = PLUGIN_ID + "/panel";
    function normalizeFontFamily(value) {
      const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)$/i;
      const parts = String(value == null ? "" : value).split(",");
      const out = [];
      for (const raw of parts) {
        const clean = String(raw).replace(new RegExp(`["'\\\\<>\\u0000-\\u001f]`, "g"), "").trim();
        if (clean === "") continue;
        out.push(GENERIC.test(clean) ? clean.toLowerCase() : '"' + clean + '"');
      }
      return out.join(", ");
    }
    function firstFamily(list) {
      const first = String(list == null ? "" : list).split(",")[0].trim();
      return first.replace(/^["']|["']$/g, "");
    }
    var DEFAULT_UI_STACK = [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      '"PingFang SC"',
      '"Hiragino Sans GB"',
      '"Microsoft YaHei"',
      '"Helvetica Neue"',
      "Helvetica",
      "Arial",
      "sans-serif"
    ];
    var DEFAULT_CODE_STACK = [
      '"SF Mono"',
      '"JetBrains Mono"',
      '"Fira Code"',
      "Consolas",
      '"Liberation Mono"',
      "Menlo",
      "Courier",
      '"PingFang SC"',
      '"Microsoft YaHei"',
      "monospace"
    ];
    var SCALE_STEPS = [
      // UI chrome — consumes --dsw-font-family
      "base-16",
      "base-strong-16",
      "l-20",
      "m-18",
      "s-14",
      "s-strong-14",
      "xs-13",
      "xs-strong-13",
      "xxs-12",
      "xxs-strong-12",
      "xxxs-11",
      "xxxs-strong-11",
      "xl-24",
      // Conversation content — consumes --dsw-font-family
      "markdown-base",
      "markdown-base-italic",
      "markdown-base-strong",
      "markdown-base-strong-italic",
      "markdown-h1",
      "markdown-h2",
      "markdown-h3",
      "markdown-h4",
      "markdown-table",
      "markdown-table-head",
      "markdown-small",
      "markdown-small-italic",
      "markdown-small-strong",
      "markdown-small-strong-italic",
      // Code — consumes --ds-font-family-code
      "markdown-code",
      "markdown-code-block",
      "markdown-code-block-small"
    ];
    var DEFAULT_STATE = {
      /** Shared UI + content family. Empty = the host's own stack. 空 = 宿主默认字体栈。 */
      uiFamily: "",
      codeFamily: "",
      /**
       * Terminal family — committed through `theme.setFontFamily('terminal')`
       * like the host's own row; kept here so the row still shows a value when
       * the theme service is absent. 终端字体——经宿主管线写入；服务缺席时本地留存。
       */
      terminalFamily: "",
      /**
       * Line-height multiplier on the markdown/content steps only, as a percent.
       * 100 = untouched; the host's own `line-height` sub-token and shorthand both
       * shift by the same ratio, so the step's own size→height relationship is
       * what changes — UI chrome line-heights (button rows, menus) stay put.
       * Range 50–100: row spacing tightens from the host's default, never loosens.
       */
      lineHeightPct: 100,
      /**
       * Letter-spacing added to markdown/content text, in hundredths of an `em`
       * (so 5 = 0.05em). `em` keeps it proportional to whatever size each step
       * resolves to; a fixed `px` value would look double-spaced on 11px code
       * and invisible on 24px headings.
       */
      trackingEm: 0
    };
    function clampLineHeight(value) {
      const n = Math.round(Number(value));
      if (!isFinite(n)) return 100;
      return Math.min(100, Math.max(50, n));
    }
    function clampTracking(value) {
      const n = Math.round(Number(value));
      if (!isFinite(n)) return 0;
      return Math.min(30, Math.max(-30, n));
    }
    function sanitize(raw) {
      const source = raw && typeof raw === "object" ? raw : {};
      return {
        uiFamily: typeof source.uiFamily === "string" ? source.uiFamily : "",
        codeFamily: typeof source.codeFamily === "string" ? source.codeFamily : "",
        terminalFamily: typeof source.terminalFamily === "string" ? source.terminalFamily : "",
        lineHeightPct: clampLineHeight(source.lineHeightPct),
        trackingEm: clampTracking(source.trackingEm)
      };
    }

    // client/src/settings.js
    function createSettingsStore(storage2) {
      function loadState() {
        try {
          const raw = storage2 ? storage2.getItem(STORAGE_KEY) : null;
          if (!raw) return Object.assign({}, DEFAULT_STATE);
          return sanitize(JSON.parse(raw));
        } catch (error) {
          return Object.assign({}, DEFAULT_STATE);
        }
      }
      function saveState(next) {
        try {
          if (storage2) storage2.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (error) {
          console.warn("dsh-system-fonts: could not persist settings", error);
        }
      }
      let state = loadState();
      const listeners = [];
      const store = {
        onChange: null,
        loadState,
        getState() {
          return state;
        },
        setState(patch) {
          state = sanitize(Object.assign({}, state, patch));
          saveState(state);
          for (let i = 0; i < listeners.length; i += 1) {
            try {
              listeners[i](state);
            } catch (error) {
            }
          }
          if (typeof store.onChange === "function") {
            try {
              store.onChange(state);
            } catch (error) {
              console.warn("dsh-system-fonts: could not apply the new settings", error);
            }
          }
        },
        subscribe(listener) {
          listeners.push(listener);
          return function unsubscribe() {
            const i = listeners.indexOf(listener);
            if (i >= 0) listeners.splice(i, 1);
          };
        },
        listenerCount() {
          return listeners.length;
        }
      };
      return store;
    }

    // client/src/typography.js
    var UNSAFE_FAMILY_CHARS = /["\\;{}]/g;
    var CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
    function quoteFamily(name2) {
      const clean = String(name2 == null ? "" : name2).replace(UNSAFE_FAMILY_CHARS, "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
      if (clean === "") return null;
      return '"' + clean + '"';
    }
    function buildStack(chosen, fallback) {
      const quoted = quoteFamily(chosen);
      if (quoted === null) return fallback.join(", ");
      const bare = quoted.slice(1, -1).toLowerCase();
      const tail = fallback.filter(function(entry) {
        return entry.replace(/^["']|["']$/g, "").toLowerCase() !== bare;
      });
      return [quoted].concat(tail).join(", ");
    }
    function scanPiece(text, start, stopAtSlash) {
      let depth = 0;
      let i = start;
      for (; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === "(") depth += 1;
        else if (ch === ")") {
          depth -= 1;
          if (depth < 0) return null;
        } else if (depth === 0) {
          if (ch === " " || ch === "	" || ch === "\n" || ch === "\f" || ch === "\r") break;
          if (stopAtSlash && ch === "/") break;
        }
      }
      if (depth !== 0) return null;
      return [text.slice(start, i), i];
    }
    function isSizeToken(token) {
      return /^\d+(\.\d+)?(px|rem|em|pt|%)$/.test(token) || /^(var|calc|min|max|clamp)\(/.test(token);
    }
    function splitFontTail(text) {
      let i = 0;
      while (i < text.length && /\s/.test(text[i])) i += 1;
      const size = scanPiece(text, i, true);
      if (size === null || size[0] === "" || !isSizeToken(size[0])) return null;
      i = size[1];
      while (i < text.length && /\s/.test(text[i])) i += 1;
      let lineHeight = "";
      if (text[i] === "/") {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        const lh = scanPiece(text, j, false);
        if (lh === null || lh[0] === "") return null;
        lineHeight = lh[0];
        i = lh[1];
      }
      while (i < text.length && /\s/.test(text[i])) i += 1;
      return { size: size[0], lineHeight, family: text.slice(i) };
    }
    function scaleLength(len, ratio) {
      const s = String(len == null ? "" : len).trim();
      if (s === "") return null;
      const k = Math.round(ratio * 1e3) / 1e3;
      if (/^\d+(\.\d+)?(px|rem|em|pt|%)$/.test(s)) return "calc(" + s + " * " + k + ")";
      if (/^(var|calc|min|max|clamp)\(/.test(s)) return "calc(" + s + " * " + k + ")";
      return null;
    }
    function rewriteLineHeight(value, ratio) {
      let text = String(value == null ? "" : value).trim();
      if (text === "") return null;
      const head = [];
      for (; ; ) {
        const kw = /^(italic|oblique|normal|small-caps|\d{3}|bold|bolder|lighter)\s+/i.exec(text);
        if (kw === null) break;
        head.push(kw[1]);
        text = text.slice(kw[0].length);
      }
      const tail = splitFontTail(text);
      if (tail === null || tail.lineHeight === "") return null;
      const lh = scaleLength(tail.lineHeight, ratio);
      if (lh === null) return null;
      const sizeLh = tail.size + "/" + lh;
      return head.concat([sizeLh, tail.family]).join(" ");
    }
    var MARKDOWN_STEPS = SCALE_STEPS.filter(function(step) {
      return /^markdown-/.test(step);
    });
    function sourceTokens() {
      const names = [];
      for (const step of MARKDOWN_STEPS) {
        names.push("--dsw-font-" + step, "--dsw-font-" + step + "-line-height");
      }
      return names;
    }
    function collectDeclaredTokens(names, skip) {
      const out = /* @__PURE__ */ new Map();
      for (const name2 of names) out.set(name2, "");
      if (typeof document === "undefined") return out;
      const wanted = new Set(names);
      const tight = /* @__PURE__ */ new Map();
      const loose = /* @__PURE__ */ new Map();
      const body = document.body;
      if (body && body.style && typeof body.style.getPropertyValue === "function") {
        visitStyle(body.style, wanted, (name2, value) => out.set(name2, value));
      }
      const sheets = document.styleSheets;
      if (sheets) {
        for (let i = 0; i < sheets.length; i += 1) {
          const sheet = sheets[i];
          if (!sheet || sheet.disabled === true) continue;
          if (skip && sheet.ownerNode === skip) continue;
          let rules;
          try {
            rules = sheet.cssRules;
          } catch (error) {
            continue;
          }
          if (!rules) continue;
          for (let j = 0; j < rules.length; j += 1) {
            const rule = rules[j];
            if (!rule || !rule.style || typeof rule.style.getPropertyValue !== "function") continue;
            const isTight = /(^|[\s,])(body|html|:root)([\s,{]|$)/.test(String(rule.selectorText || ""));
            visitStyle(rule.style, wanted, (name2, value) => {
              if (out.get(name2) !== "") return;
              if (isTight) tight.set(name2, value);
              else if (!loose.has(name2)) loose.set(name2, value);
            });
          }
        }
      }
      for (const name2 of names) {
        if (out.get(name2) !== "") continue;
        if (tight.has(name2)) out.set(name2, tight.get(name2));
        else if (loose.has(name2)) out.set(name2, loose.get(name2));
      }
      return out;
    }
    function visitStyle(style, wanted, visit) {
      if (typeof style.item === "function" && typeof style.length === "number") {
        for (let i = 0; i < style.length; i += 1) {
          const name2 = style.item(i);
          if (!wanted.has(name2)) continue;
          const value = style.getPropertyValue(name2);
          if (value) visit(name2, value);
        }
        return;
      }
      for (const name2 of wanted) {
        const value = style.getPropertyValue(name2);
        if (value) visit(name2, value);
      }
    }
    function readDeclaredToken(name2, skip) {
      return collectDeclaredTokens([name2], skip).get(name2) || "";
    }
    function readStep(step, declared, skip) {
      const name2 = "--dsw-font-" + step;
      const heightName = name2 + "-line-height";
      let shorthand = (declared.get(name2) || "").trim();
      let lineHeight = (declared.get(heightName) || "").trim();
      if (shorthand === "" && lineHeight === "") {
        const target = document.body || document.documentElement;
        if (target && typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
          const computed = window.getComputedStyle(target);
          shorthand = (computed.getPropertyValue(name2) || "").trim();
          lineHeight = (computed.getPropertyValue(heightName) || "").trim();
        }
      }
      if (shorthand === "" && lineHeight === "") return null;
      return { shorthand, lineHeight };
    }
    function buildCss(current) {
      const lines = [];
      const uiStack = quoteFamily(current.uiFamily) === null ? null : buildStack(current.uiFamily, DEFAULT_UI_STACK);
      const codeStack = quoteFamily(current.codeFamily) === null ? null : buildStack(current.codeFamily, DEFAULT_CODE_STACK);
      const lhRatio = clampLineHeight(current.lineHeightPct) / 100;
      const trackingEm = clampTracking(current.trackingEm) / 100;
      lines.push("/* " + PLUGIN_ID + " \u2014 fonts & content spacing; generated, edit in the settings panel */");
      lines.push(":root, body {");
      if (uiStack !== null) lines.push("  --dsw-font-family: " + uiStack + " !important;");
      if (codeStack !== null) lines.push("  --ds-font-family-code: " + codeStack + " !important;");
      if (lhRatio !== 1) {
        const skip = typeof document === "undefined" ? null : document.getElementById(STYLE_ID);
        const declared = collectDeclaredTokens(sourceTokens(), skip);
        for (const step of SCALE_STEPS) {
          if (!/^markdown-/.test(step)) continue;
          const live = readStep(step, declared, skip);
          if (live === null) continue;
          if (live.lineHeight !== "") {
            const lh = scaleLength(live.lineHeight, lhRatio);
            if (lh !== null) {
              lines.push("  --dsw-font-" + step + "-line-height: " + lh + " !important;");
            }
          }
          if (live.shorthand) {
            const rewritten = rewriteLineHeight(live.shorthand, lhRatio);
            if (rewritten !== null) lines.push("  --dsw-font-" + step + ": " + rewritten + " !important;");
          }
        }
      }
      lines.push("}");
      if (trackingEm !== 0) {
        const em = trackingEm.toFixed(2).replace(/\.?0+$/, "");
        lines.push('[class*="markdown"] {');
        lines.push("  letter-spacing: " + em + "em !important;");
        lines.push("}");
      }
      return lines.join("\n");
    }
    function createTypography({ getState }) {
      let active = false;
      function apply2() {
        if (!active) return;
        if (typeof document === "undefined" || !document.head) return;
        let tag = document.getElementById(STYLE_ID);
        if (tag === null) {
          tag = document.createElement("style");
          tag.id = STYLE_ID;
          tag.dataset.plugin = PLUGIN_ID;
          document.head.appendChild(tag);
        }
        const wasDisabled = tag.disabled === true;
        tag.disabled = true;
        let css;
        try {
          css = buildCss(getState());
        } finally {
          tag.disabled = wasDisabled;
        }
        if (tag.textContent !== css) tag.textContent = css;
      }
      function teardown() {
        active = false;
        if (typeof document === "undefined" || !document.head) return;
        const tag = document.getElementById(STYLE_ID);
        if (tag !== null && tag.parentNode) tag.parentNode.removeChild(tag);
      }
      return {
        apply: apply2,
        teardown,
        activate() {
          active = true;
        },
        get active() {
          return active;
        }
      };
    }

    // client/src/chrome.js
    var SHADOW_STYLE_ID = PLUGIN_ID + "/shadow";
    var BACKSTOP_MS = 400;
    var CAPTION_MENU_SELECTOR = "[data-windows-menu]";
    function isCaptionMenu(el) {
      if (!el) return false;
      if (el.dataset && "windowsMenu" in el.dataset) return true;
      return typeof el.matches === "function" && el.matches(CAPTION_MENU_SELECTOR);
    }
    function buildShadowCss(current, caption) {
      const lines = ["/* " + PLUGIN_ID + " \u2014 shadow typography */"];
      if (current.uiFamily) {
        lines.push(":host { font-family: " + buildStack(current.uiFamily, DEFAULT_UI_STACK) + " !important; }");
      }
      if (caption) {
        lines.push('button, [role="menuitem"] { font-size: var(--dsh-content-font-size, 14px) !important; }');
      }
      return lines.join("\n");
    }
    function createChrome({ getState }) {
      let active = false;
      let observer = null;
      const installed = /* @__PURE__ */ new Map();
      const timers = [];
      const sweeps = [];
      let backstopArmed = false;
      let lastBackstopAt = 0;
      function paint(host) {
        if (!active || !host || !host.shadowRoot) return;
        if (host.isConnected === false) return;
        const root = host.shadowRoot;
        const caption = isCaptionMenu(host);
        const css = buildShadowCss(getState(), caption);
        let entry = installed.get(root);
        if (entry === void 0 || entry.host !== host || !entry.tag.isConnected) {
          let tag = root.querySelector ? root.querySelector("style#" + SHADOW_STYLE_ID.replace(/\//g, "\\/")) : null;
          if (tag === null) {
            tag = document.createElement("style");
            tag.id = SHADOW_STYLE_ID;
            tag.dataset.plugin = PLUGIN_ID;
            root.appendChild(tag);
          }
          entry = { host, tag };
          installed.set(root, entry);
        }
        if (entry.tag.textContent !== css) entry.tag.textContent = css;
      }
      function hostsOf(scope) {
        const out = [];
        if (!scope) return out;
        if (scope.shadowRoot) out.push(scope);
        if (typeof scope.querySelectorAll === "function") {
          const all = scope.querySelectorAll("*");
          for (let i = 0; i < all.length; i += 1) {
            if (all[i].shadowRoot) out.push(all[i]);
          }
        }
        return out;
      }
      function sweep() {
        if (!active || typeof document === "undefined") return;
        for (const [root, entry] of Array.from(installed)) {
          if (!entry.host || entry.host.isConnected === false || !entry.tag.isConnected) {
            if (entry.tag && entry.tag.parentNode) entry.tag.parentNode.removeChild(entry.tag);
            installed.delete(root);
            continue;
          }
          paint(entry.host);
        }
        if (typeof document.querySelector === "function") {
          const caption = document.querySelector(CAPTION_MENU_SELECTOR);
          if (caption) paint(caption);
        }
        const scope = document.documentElement || document.body;
        for (const host of hostsOf(scope)) paint(host);
      }
      function sweepNodes(nodes) {
        if (!active) return;
        for (const node of nodes) {
          if (!node || node.nodeType !== 1) continue;
          for (const host of hostsOf(node)) paint(host);
        }
      }
      function schedule(fn, ms) {
        if (typeof setTimeout !== "function") return;
        const id = setTimeout(function() {
          const at = timers.indexOf(id);
          if (at >= 0) timers.splice(at, 1);
          fn();
        }, ms);
        timers.push(id);
      }
      function activate() {
        if (active) return;
        active = true;
        sweep();
        if (typeof MutationObserver === "function" && document.documentElement) {
          observer = new MutationObserver(function(records) {
            const nodes = [];
            for (const record of records) {
              for (const node of record.addedNodes) nodes.push(node);
            }
            if (nodes.length > 0) sweepNodes(nodes);
            if (!backstopArmed && Date.now() - lastBackstopAt >= BACKSTOP_MS) {
              backstopArmed = true;
              lastBackstopAt = Date.now() + BACKSTOP_MS;
              schedule(function() {
                backstopArmed = false;
                if (active) sweep();
              }, BACKSTOP_MS);
            }
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }
        schedule(sweep, 600);
      }
      function teardown() {
        active = false;
        if (observer !== null) {
          observer.disconnect();
          observer = null;
        }
        for (const timer of timers.splice(0)) clearTimeout(timer);
        sweeps.length = 0;
        backstopArmed = false;
        lastBackstopAt = 0;
        installed.forEach(function(entry) {
          if (entry.tag && entry.tag.parentNode) entry.tag.parentNode.removeChild(entry.tag);
        });
        installed.clear();
      }
      return {
        activate,
        apply: sweep,
        teardown,
        paint,
        buildShadowCss,
        get active() {
          return active;
        },
        /** Test/introspection surface: live (unfired) timers in the teardown list. */
        get timerCount() {
          return timers.length;
        },
        /** Test/introspection surface: shadow roots still tracked. */
        get hostCount() {
          return installed.size;
        }
      };
    }

    // client/src/catalogue.js
    function createCatalogue(fetchImpl) {
      const callFetch = fetchImpl || function() {
        return fetch.apply(null, arguments);
      };
      let fontList = { status: "idle", families: [], sources: [], error: null, supported: true };
      const listeners = [];
      let active = false;
      let generation = 0;
      function setFontList(next) {
        fontList = next;
        for (let i = 0; i < listeners.length; i += 1) {
          try {
            listeners[i](fontList);
          } catch (error) {
          }
        }
      }
      function fetchFonts(refresh) {
        if (!active) return Promise.resolve();
        const gen = ++generation;
        setFontList(Object.assign({}, fontList, { status: "loading" }));
        const url = FONTS_API + (refresh ? "?refresh=1" : "");
        const headers = { [FONTS_MARKER_HEADER]: FONTS_MARKER_VALUE };
        return callFetch(url, { credentials: "same-origin", headers }).then(function(response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        }).then(function(body) {
          if (gen !== generation) return;
          setFontList({
            status: "ready",
            families: Array.isArray(body && body.families) ? body.families : [],
            sources: Array.isArray(body && body.sources) ? body.sources : [],
            supported: body && body.supported !== false,
            error: null
          });
        }).catch(function(error) {
          if (gen !== generation) return;
          setFontList({
            status: "error",
            families: [],
            sources: [],
            supported: false,
            error: error && error.message ? error.message : String(error)
          });
        });
      }
      function isKnownFamily(family) {
        if (!family) return true;
        const needle = family.toLowerCase();
        for (let i = 0; i < fontList.families.length; i += 1) {
          if (fontList.families[i].family.toLowerCase() === needle) return true;
        }
        return false;
      }
      function resetLoading() {
        if (fontList.status === "loading") {
          setFontList({ status: "idle", families: [], sources: [], error: null, supported: true });
        }
      }
      return {
        get list() {
          return fontList;
        },
        subscribe(listener) {
          listeners.push(listener);
          return function unsubscribe() {
            const i = listeners.indexOf(listener);
            if (i >= 0) listeners.splice(i, 1);
          };
        },
        listenerCount() {
          return listeners.length;
        },
        fetchFonts,
        isKnownFamily,
        activate() {
          active = true;
          resetLoading();
        },
        dispose() {
          active = false;
          generation += 1;
          resetLoading();
        }
      };
    }

    // locale/zh.json
    var zh_default = {
      meta: {
        title: "\u7CFB\u7EDF\u5B57\u4F53",
        description: "\u4E3A\u300C\u8BBE\u7F6E \u2192 \u901A\u7528\u300D\u589E\u52A0\u5185\u5BB9\u5B57\u4F53\u3001\u4EE3\u7801\u5B57\u4F53\u3001\u7EC8\u7AEF\u5B57\u4F53\u4E09\u4E2A\u7CFB\u7EDF\u5B57\u4F53\u9009\u62E9\u5668\uFF0C\u9644\u884C\u8DDD\u4E0E\u5B57\u8DDD\u63A7\u5236\uFF1B\u4ECE Windows \u5DF2\u5B89\u88C5\u5B57\u4F53\u679A\u4E3E\uFF0C\u5B57\u53F7\u4E0E\u5B57\u91CD\u4ECD\u7531\u5BBF\u4E3B\u4E3B\u9898\u7BA1\u7406\u3002"
      },
      strings: {
        "row.text.title": "\u5185\u5BB9\u5B57\u4F53",
        "row.text.desc": "\u754C\u9762\u4E0E\u6B63\u6587\u4F7F\u7528\u540C\u4E00\u5B57\u4F53",
        "row.code.title": "\u4EE3\u7801\u5B57\u4F53",
        "row.code.desc": "\u884C\u5185\u4EE3\u7801\u4E0E\u4EE3\u7801\u5757",
        "row.terminal.title": "\u7EC8\u7AEF\u5B57\u4F53",
        "row.terminal.desc": "\u96C6\u6210\u7EC8\u7AEF",
        "row.lineHeight.title": "\u884C\u8DDD",
        "row.lineHeight.desc": "\u6B63\u6587\u4E0E\u6807\u9898\u7684\u884C\u9AD8\uFF0C\u5F80\u5DE6\u62D6\u66F4\u7D27\u51D1",
        "row.tracking.title": "\u5B57\u8DDD",
        "row.tracking.desc": "\u6B63\u6587\u5B57\u7B26\u95F4\u8DDD\uFF0C0 \u4E3A\u5BBF\u4E3B\u9ED8\u8BA4",
        "note.loading": "\u6B63\u5728\u8BFB\u53D6\u7CFB\u7EDF\u5B57\u4F53\u2026",
        "note.error": "\u7CFB\u7EDF\u5B57\u4F53\u8BFB\u53D6\u5931\u8D25\uFF0C\u53EF\u624B\u5199\u65CF\u540D",
        "note.empty": "\u6CA1\u6709\u5339\u914D\u7684\u5B57\u4F53",
        "menu.default": "\u9ED8\u8BA4\u5B57\u4F53",
        "menu.refresh": "\u91CD\u65B0\u8BFB\u53D6\u7CFB\u7EDF\u5B57\u4F53",
        "menu.use": "\u4F7F\u7528\u201C{name}\u201D",
        "search.placeholder": "\u641C\u7D22\u5B57\u4F53\u6216\u8F93\u5165\u5B57\u4F53\u540D\u79F0",
        "menu.builtin": "\u5185\u7F6E\u5B57\u4F53",
        "menu.default.effective": "\u9ED8\u8BA4\u5B57\u4F53\uFF08{family}\uFF09"
      }
    };

    // locale/en.json
    var en_default = {
      meta: {
        title: "System fonts",
        description: "Adds system-font pickers for text, code and terminal fonts to Settings \u2192 General, with line-height and letter-spacing controls; enumerates installed Windows fonts. Font size and weight stay with the host theme."
      },
      strings: {
        "row.text.title": "Text font",
        "row.text.desc": "Interface and content share one family",
        "row.code.title": "Code font",
        "row.code.desc": "Inline code and code blocks",
        "row.terminal.title": "Terminal font",
        "row.terminal.desc": "The integrated terminal",
        "row.lineHeight.title": "Line height",
        "row.lineHeight.desc": "Row spacing for body and headings; drag left to tighten",
        "row.tracking.title": "Letter spacing",
        "row.tracking.desc": "Character spacing in content; 0 is the host default",
        "note.loading": "Reading system fonts\u2026",
        "note.error": "System fonts unavailable \u2014 type a name",
        "note.empty": "No matching fonts",
        "menu.default": "Default font",
        "menu.refresh": "Reload system fonts",
        "menu.use": "Use \u201C{name}\u201D",
        "search.placeholder": "Search fonts or type a family name",
        "menu.builtin": "Built-in",
        "menu.default.effective": "Default font ({family})"
      }
    };

    // client/src/locales.js
    var LOCALE_NS = "dsh-system-fonts";
    var zh = zh_default.strings;
    var en = en_default.strings;
    var META = { zh: zh_default.meta, en: en_default.meta };
    var DICTS = { zh, en };
    var DEFAULT_LOCALE = "zh";
    function createTranslator(lang) {
      const dict = DICTS[lang] || DICTS[DEFAULT_LOCALE];
      return function t(key, params) {
        const raw = dict[key] !== void 0 ? dict[key] : en[key] !== void 0 ? en[key] : key;
        if (params === void 0 || params === null) return raw;
        return String(raw).replace(/\{(\w+)\}/g, function(whole, name2) {
          return params[name2] !== void 0 ? String(params[name2]) : whole;
        });
      };
    }
    function createLocaleHandle(initial) {
      let t = createTranslator(initial && DICTS[initial] ? initial : DEFAULT_LOCALE);
      return {
        /** Bind the live host translator. 绑定宿主翻译函数。 */
        attach(hostT) {
          if (typeof hostT === "function") t = hostT;
        },
        t(key, params) {
          return t(key, params);
        }
      };
    }

    // client/src/panel.js
    var PANEL_CSS = [
      ".dsf-row { display: flex; align-items: center; gap: 8px; padding: 16px 0;",
      "  border-bottom: .5px solid var(--dsw-alias-border-l2); }",
      ".dsf-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-right: 48px; }",
      ".dsf-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 400; line-height: 22px; }",
      ".dsf-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 400; line-height: 18px; }",
      ".dsf-control { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }",
      ".dsf-trigger { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px;",
      "  border: none; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform);",
      "  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 22px; cursor: pointer; min-width: 0; }",
      ".dsf-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }",
      ".dsf-trigger .dsf-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsf-trigger .dsf-chevron { flex: none; margin-left: auto; }",
      ".dsf-trigger .dsf-placeholder { color: var(--dsw-alias-label-tertiary); }",
      ".dsf-family { width: 220px; max-width: 100%; }",
      ".dsf-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; width: 100%; }",
      ".dsf-item .dsf-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".dsf-item .dsf-check { flex: none; color: var(--dsw-alias-label-secondary); display: inline-flex; }",
      ".dsf-note { padding: 6px 8px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }",
      // Section label above the built-in (embedded) families, which are not part
      // of the system catalogue and must read differently from a real font row.
      ".dsf-group { padding: 8px 8px 2px; color: var(--dsw-alias-label-tertiary);",
      "  font-size: 11px; line-height: 16px; letter-spacing: .02em; text-transform: uppercase; }",
      // The search field sticks inside the host menu's scroll viewport. top:0
      // keeps it at the viewport's top edge; a negative offset would drag it over
      // the menu's 4px padding and rounded top border while scrolling, making the
      // popup's border appear to move upward and fuse with the row above it.
      //
      // The wrapper itself paints nothing. The host already paints the menu
      // surface, and the Input inside carries its own opaque, rounded field. An
      // extra background/backdrop-filter here made an unrounded square plate
      // around the rounded search field, which read as a stray square frame.
      ".dsf-search { position: sticky; top: 0; z-index: 1; padding: 2px 2px 6px; }",
      ".dsf-search .dsf-search-input { width: 100%; box-sizing: border-box; }",
      ".dsf-font-list { min-width: 220px; max-width: 360px;",
      "  max-height: min(360px, calc(100dvh - 24px - var(--dsh-frame-overlay-top, 12px))); }",
      ".dsf-slider { -webkit-appearance: none; appearance: none; width: 180px; height: 20px; background: transparent; cursor: pointer; }",
      ".dsf-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 3px;",
      "  background: linear-gradient(to right, var(--dsw-alias-state-business-primary, #4c72e0) 0 var(--dsf-fill, 0%),",
      "    var(--dsw-alias-border-l1, #d9d9d9) var(--dsf-fill, 0%) 100%); }",
      ".dsf-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; margin-top: -4px; border: 0; border-radius: 50%; background: var(--dsw-alias-state-business-primary, #4c72e0); }",
      ".dsf-slider::-moz-range-track { height: 6px; border-radius: 3px; background: var(--dsw-alias-border-l1, #d9d9d9); }",
      ".dsf-slider::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--dsw-alias-state-business-primary, #4c72e0); }",
      ".dsf-slider::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--dsw-alias-state-business-primary, #4c72e0); }",
      ".dsf-slider-value { flex: none; min-width: 52px; text-align: right; color: var(--dsw-alias-label-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }",
      "@media (max-width: 600px) { .dsf-row { flex-wrap: wrap; } .dsf-row-text { padding-right: 0; } .dsf-control { flex-wrap: wrap; } .dsf-family { width: 100%; } }"
    ].join("\n");
    function installPanelCss() {
      if (typeof document === "undefined" || !document.head) return;
      if (document.getElementById(PANEL_STYLE_ID) !== null) return;
      const tag = document.createElement("style");
      tag.id = PANEL_STYLE_ID;
      tag.dataset.plugin = PLUGIN_ID;
      tag.textContent = PANEL_CSS;
      document.head.appendChild(tag);
    }
    function removePanelCss() {
      if (typeof document === "undefined" || !document.head) return;
      const tag = document.getElementById(PANEL_STYLE_ID);
      if (tag !== null && tag.parentNode) tag.parentNode.removeChild(tag);
    }
    var SLOTS = [
      { id: "dsh-system-fonts-content", order: 12, role: "text", titleKey: "row.text.title", descKey: "row.text.desc", familyKey: "uiFamily" },
      { id: "dsh-system-fonts-code", order: 13, role: "code", titleKey: "row.code.title", descKey: "row.code.desc", familyKey: "codeFamily" },
      { id: "dsh-system-fonts-terminal", order: 14, role: "terminal", titleKey: "row.terminal.title", descKey: "row.terminal.desc", familyKey: "terminalFamily" }
    ];
    var BUILTIN_FAMILIES = [
      { family: "anthropic-sans", display: "Anthropic Sans" },
      { family: "anthropic-serif", display: "Anthropic Serif" },
      { family: "anthropic-mono", display: "Anthropic Mono" }
    ];
    var BUILTIN_DISPLAY = BUILTIN_FAMILIES.reduce(function(table, entry) {
      table[entry.family] = entry.display;
      return table;
    }, {});
    function displayNameOf(family) {
      return BUILTIN_DISPLAY[family] !== void 0 ? BUILTIN_DISPLAY[family] : family;
    }
    var EFFECTIVE_FONT_VAR = {
      text: "--dsw-font-family",
      code: "--ds-font-family-code",
      terminal: "--dsw-font-family-terminal"
    };
    var HOST_DEFAULT_VAR = {
      text: "--dsh-font-family-text-default",
      code: "--dsh-font-family-code-default",
      terminal: "--dsh-font-family-terminal-default"
    };
    function firstFamilyOf(value) {
      if (typeof value !== "string") return "";
      const first = value.split(",")[0].trim();
      return first.replace(/^["']/, "").replace(/["']$/, "").trim();
    }
    function effectiveDefaultFamily(role) {
      if (typeof document === "undefined" || !document.body) return "";
      const variable = EFFECTIVE_FONT_VAR[role];
      if (variable === void 0) return "";
      try {
        const style = getComputedStyle(document.body);
        const effective = firstFamilyOf(style.getPropertyValue(variable));
        if (effective === "") return "";
        const baseline = firstFamilyOf(style.getPropertyValue(HOST_DEFAULT_VAR[role]));
        return effective === baseline ? "" : effective;
      } catch (error) {
        return "";
      }
    }
    var SLIDER_SLOTS = [
      {
        id: "dsh-system-fonts-line-height",
        order: 15,
        titleKey: "row.lineHeight.title",
        descKey: "row.lineHeight.desc",
        key: "lineHeightPct",
        min: 50,
        max: 100,
        step: 1,
        normalize: function(v) {
          return clampLineHeight(v);
        },
        display: function(v) {
          return v + "%";
        }
      },
      {
        id: "dsh-system-fonts-tracking",
        order: 16,
        titleKey: "row.tracking.title",
        descKey: "row.tracking.desc",
        key: "trackingEm",
        min: -30,
        max: 30,
        step: 1,
        normalize: function(v) {
          return clampTracking(v);
        },
        display: function(v) {
          return (v > 0 ? "+" : "") + (v / 100).toFixed(2) + "em";
        }
      }
    ];
    function createPanel({ React: React2, primitives: primitives2, settings: settings2, catalogue: catalogue2, bridge: bridge2, locale: locale2, merger: merger2 }) {
      const Menu = primitives2 ? primitives2.Menu : null;
      const MenuItemButton = primitives2 ? primitives2.MenuItemButton : null;
      const Input = primitives2 ? primitives2.Input : null;
      const IconChevron = primitives2 ? primitives2.IconChevronDownOutlineRegular : null;
      const IconCheck = primitives2 ? primitives2.IconCheckOutlineRegular : null;
      const IconSearch = primitives2 ? primitives2.IconSearchOutlineRegular : null;
      const handle = locale2 || createLocaleHandle(DEFAULT_LOCALE);
      function tFor(props) {
        return props && typeof props.t === "function" ? props.t : handle.t;
      }
      function rowRef(slot) {
        return function(el) {
          if (merger2) merger2.note(slot.id, el, slot.order, slot.role || null);
        };
      }
      function getCatalogueList() {
        return catalogue2.list;
      }
      function useStoreValue(store, get) {
        return React2.useSyncExternalStore(store.subscribe, get);
      }
      function familyEntryFor(name2) {
        const needle = String(name2).toLowerCase();
        const list = catalogue2.list;
        for (let i = 0; i < list.families.length; i += 1) {
          if (list.families[i].family.toLowerCase() === needle) return list.families[i];
        }
        return null;
      }
      function commitFamily(slot, name2) {
        const patch = { [slot.familyKey]: name2 };
        settings2.setState(patch);
        if (bridge2 && bridge2.live) bridge2.setFamily(slot.role, name2);
        return patch;
      }
      function FamilyMenu({ slot, family, t }) {
        const pair = React2.useState(false);
        const open = pair[0];
        const setOpen = pair[1];
        const queryPair = React2.useState("");
        const query = queryPair[0];
        const setQuery = queryPair[1];
        const fonts = useStoreValue(catalogue2, getCatalogueList);
        function openMenu() {
          setQuery("");
          setOpen(true);
        }
        function choose(name2) {
          commitFamily(slot, name2);
          setQuery("");
          setOpen(false);
        }
        function commitQuery() {
          const name2 = query.trim();
          if (name2 === "") return;
          const exact = familyEntryFor(name2);
          choose(exact !== null ? exact.family : name2);
        }
        const effective = family === "" ? effectiveDefaultFamily(slot.role) : "";
        const valueText = family !== "" ? displayNameOf(family) : effective === "" ? t("menu.default") : BUILTIN_DISPLAY[effective] !== void 0 ? BUILTIN_DISPLAY[effective] : t("menu.default.effective", { family: effective });
        const label = t(slot.titleKey);
        const trigger = React2.createElement(
          "button",
          {
            type: "button",
            className: "dsf-trigger dsf-family",
            "aria-label": label,
            "aria-haspopup": "menu",
            "aria-expanded": open,
            onClick: function() {
              if (open) setOpen(false);
              else openMenu();
            },
            onKeyDown: function(event) {
              if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                event.preventDefault();
                openMenu();
              }
            }
          },
          React2.createElement(
            "span",
            { className: "dsf-value" + (family === "" ? " dsf-placeholder" : "") },
            valueText
          ),
          IconChevron ? React2.createElement(IconChevron, { size: 12, className: "dsf-chevron" }) : null
        );
        const q = query.trim().toLowerCase();
        const filtered = fonts.families.filter(function(entry) {
          return !entry.symbol && (q === "" || entry.family.toLowerCase().includes(q));
        });
        const exactHit = q === "" ? null : familyEntryFor(query.trim());
        const children = [];
        children.push(React2.createElement(
          "div",
          { className: "dsf-search", key: "search" },
          React2.createElement(Input, {
            "aria-label": t("search.placeholder"),
            className: "dsf-search-input",
            icon: IconSearch ? React2.createElement(IconSearch, { size: 14 }) : void 0,
            value: query,
            onChange: function(event) {
              setQuery(event.target.value);
            },
            onKeyDown: function(event) {
              if (event.key === "Home" || event.key === "End") event.stopPropagation();
              if (event.key === "Enter" && !(event.isComposing || event.nativeEvent && event.nativeEvent.isComposing)) {
                event.preventDefault();
                commitQuery();
              }
            }
          })
        ));
        if (fonts.status === "loading") {
          children.push(React2.createElement("div", { className: "dsf-note", key: "note" }, t("note.loading")));
        } else if (fonts.status === "error") {
          children.push(React2.createElement("div", { className: "dsf-note", key: "note" }, t("note.error")));
        } else if (fonts.status === "ready" && filtered.length === 0 && q !== "") {
          children.push(React2.createElement("div", { className: "dsf-note", key: "note" }, t("note.empty")));
        }
        const builtinMatches = BUILTIN_FAMILIES.filter(function(entry) {
          return q === "" || entry.display.toLowerCase().includes(q) || entry.family.indexOf(q) !== -1;
        });
        if (builtinMatches.length > 0) {
          children.push(React2.createElement("div", { className: "dsf-group", key: "builtin-label" }, t("menu.builtin")));
          for (const entry of builtinMatches) {
            const active = family !== "" ? entry.family.toLowerCase() === family.toLowerCase() : entry.family === effective;
            children.push(React2.createElement(MenuItemButton, {
              key: "builtin-" + entry.family,
              onSelect: function() {
                choose(entry.family);
              }
            }, React2.createElement(
              "span",
              { className: "dsf-item" },
              React2.createElement("span", { className: "dsf-name" }, entry.display),
              active && IconCheck ? React2.createElement("span", { className: "dsf-check" }, React2.createElement(IconCheck, { size: 14 })) : null
            )));
          }
        }
        if (q !== "" && exactHit === null) {
          children.push(React2.createElement(MenuItemButton, {
            key: "manual",
            onSelect: function() {
              commitQuery();
            }
          }, t("menu.use", { name: query.trim() })));
        }
        for (const entry of filtered) {
          children.push(React2.createElement(MenuItemButton, {
            key: entry.family,
            onSelect: function() {
              choose(entry.family);
            }
          }, React2.createElement(
            "span",
            { className: "dsf-item" },
            React2.createElement("span", { className: "dsf-name" }, entry.family),
            entry.family.toLowerCase() === family.toLowerCase() && family !== "" && IconCheck ? React2.createElement("span", { className: "dsf-check" }, React2.createElement(IconCheck, { size: 14 })) : null
          )));
        }
        return React2.createElement(Menu, {
          open,
          anchor: trigger,
          items: [],
          onSelect: function(id) {
            if (id === "default") {
              commitFamily(slot, "");
              setQuery("");
              setOpen(false);
            } else if (id === "refresh") {
              catalogue2.fetchFonts(true);
            }
          },
          onClose: function() {
            setOpen(false);
          },
          align: "end",
          portal: true,
          autoFocus: false,
          className: void 0,
          listClassName: "dsf-font-list",
          footer: [
            { id: "default", label: t("menu.default") },
            { id: "refresh", label: t("menu.refresh"), disabled: fonts.status === "loading" }
          ]
        }, ...children);
      }
      function makeRow(slot) {
        const bindRef = rowRef(slot);
        return function FontRow(props) {
          const t = tFor(props);
          const state = useStoreValue(settings2, settings2.getState);
          React2.useEffect(function() {
            if (catalogue2.list.status === "idle") catalogue2.fetchFonts(false);
          }, []);
          const family = state[slot.familyKey];
          return React2.createElement(
            "div",
            {
              className: "dsf-row",
              "data-dsf-row": slot.id,
              ref: bindRef
            },
            React2.createElement(
              "div",
              { className: "dsf-row-text" },
              React2.createElement("div", { className: "dsf-title" }, t(slot.titleKey)),
              React2.createElement("div", { className: "dsf-desc" }, t(slot.descKey))
            ),
            React2.createElement(
              "div",
              { className: "dsf-control" },
              React2.createElement(FamilyMenu, { slot, family, t })
            )
          );
        };
      }
      function SliderRow({ slot, t, bindRef }) {
        const state = useStoreValue(settings2, settings2.getState);
        const value = slot.normalize(state[slot.key]);
        const span = slot.max - slot.min;
        const fill = span > 0 ? Math.round((value - slot.min) / span * 100) : 0;
        return React2.createElement(
          "div",
          { className: "dsf-row", "data-dsf-row": slot.id, ref: bindRef },
          React2.createElement(
            "div",
            { className: "dsf-row-text" },
            React2.createElement("div", { className: "dsf-title" }, t(slot.titleKey)),
            React2.createElement("div", { className: "dsf-desc" }, t(slot.descKey))
          ),
          React2.createElement(
            "div",
            { className: "dsf-control" },
            React2.createElement("input", {
              type: "range",
              className: "dsf-slider",
              min: slot.min,
              max: slot.max,
              step: slot.step,
              value,
              "aria-label": t(slot.titleKey),
              "aria-valuetext": slot.display(value),
              style: { "--dsf-fill": fill + "%" },
              onChange: function(event) {
                const next = slot.normalize(parseInt(event.target.value, 10));
                if (next !== value) settings2.setState({ [slot.key]: next });
              }
            }),
            React2.createElement("span", { className: "dsf-slider-value" }, slot.display(value))
          )
        );
      }
      const fontSlots = SLOTS.map(function(slot) {
        return Object.assign({}, slot, { component: makeRow(slot) });
      });
      const sliderSlots = SLIDER_SLOTS.map(function(slot) {
        const bindRef = rowRef(slot);
        return Object.assign({}, slot, {
          component: function BoundSlider(props) {
            return React2.createElement(SliderRow, { slot, t: tFor(props), bindRef });
          }
        });
      });
      const slots = fontSlots.concat(sliderSlots);
      return {
        slots,
        locale: handle,
        ContentFontRow: fontSlots[0].component,
        CodeFontRow: fontSlots[1].component,
        TerminalFontRow: fontSlots[2].component
      };
    }

    // client/src/bridge.js
    function createThemeBridge(theme, settings2) {
      const listeners = [];
      let svc = theme;
      function seed() {
        const state = settings2 ? settings2.getState() : {};
        return {
          text: state.uiFamily || "",
          code: state.codeFamily || "",
          terminal: state.terminalFamily || ""
        };
      }
      let snapshot = { fontFamilies: seed(), fontSizes: null };
      function emit() {
        for (let i = 0; i < listeners.length; i += 1) {
          try {
            listeners[i](snapshot);
          } catch (error) {
          }
        }
      }
      function adopt(host) {
        if (host && host.fontFamilies) {
          snapshot = {
            fontFamilies: {
              text: firstFamily(host.fontFamilies.text),
              code: firstFamily(host.fontFamilies.code),
              terminal: firstFamily(host.fontFamilies.terminal)
            },
            fontSizes: host.fontSizes || null
          };
        } else {
          snapshot = { fontFamilies: seed(), fontSizes: null };
        }
        emit();
      }
      if (svc && typeof svc.getTheme === "function") {
        try {
          adopt(svc.getTheme());
        } catch (error) {
        }
      }
      return {
        /** True when a live theme service backs this bridge. 是否有活的 theme 服务。 */
        get live() {
          return !!(svc && typeof svc.setFontFamily === "function");
        },
        get snapshot() {
          return snapshot;
        },
        /**
         * Attach (or replace) the theme service after construction. Re-seeds the
         * snapshot from the service; pass null to fall back to the stored families.
         * 构造后挂接/替换 theme 服务并重读快照；传 null 回到本地种子值。
         */
        attach(next) {
          svc = next;
          if (svc && typeof svc.getTheme === "function") {
            try {
              adopt(svc.getTheme());
            } catch (error) {
            }
          } else {
            adopt(null);
          }
        },
        subscribe(listener) {
          listeners.push(listener);
          return function unsubscribe() {
            const i = listeners.indexOf(listener);
            if (i >= 0) listeners.splice(i, 1);
          };
        },
        listenerCount() {
          return listeners.length;
        },
        /** Re-read `theme.getTheme()`; call once a `theme/change` is wired. 重读快照。 */
        sync() {
          if (svc && typeof svc.getTheme === "function") {
            try {
              adopt(svc.getTheme());
            } catch (error) {
            }
          }
        },
        adopt,
        /**
         * Delegate a family write to the host pipeline. `name` may be a single
         * family or a CSS list; it is normalized the way the host normalizes.
         * Returns false when the service is absent — the caller keeps its local
         * write so the row still works on a partial host.
         * 把族名写入委托给宿主管线；服务缺失时返回 false，由调用方保留本地写入。
         */
        setFamily(role, name2) {
          if (!this.live) return false;
          try {
            svc.setFontFamily(role, normalizeFontFamily(name2));
            return true;
          } catch (error) {
            return false;
          }
        }
      };
    }

    // client/src/lifecycle.js
    function createLifecycle({ settings: settings2, typography: typography2, chrome: chrome2, catalogue: catalogue2, panel: panel2, merger: merger2, locale: locale2, React: React2, primitives: primitives2, onTheme }) {
      let applied = false;
      function scheduleRebuild() {
        if (typeof window === "undefined") return function() {
        };
        let stopped = false;
        const run = function() {
          if (stopped) return;
          typography2.apply();
          if (chrome2) chrome2.apply();
        };
        const cancel = [];
        if (typeof window.requestAnimationFrame === "function") {
          const id = window.requestAnimationFrame(run);
          if (typeof window.cancelAnimationFrame === "function") {
            cancel.push(function() {
              window.cancelAnimationFrame(id);
            });
          }
        } else {
          const id = setTimeout(run, 16);
          cancel.push(function() {
            clearTimeout(id);
          });
        }
        const late = setTimeout(run, 300);
        cancel.push(function() {
          clearTimeout(late);
        });
        return function() {
          stopped = true;
          for (const c of cancel) c();
        };
      }
      function apply2(ctx) {
        if (applied || !ctx) return;
        applied = true;
        ctx.effect(function() {
          typography2.activate();
          catalogue2.activate();
          if (chrome2) chrome2.activate();
          return function() {
            applied = false;
            catalogue2.dispose();
            if (chrome2) chrome2.teardown();
            typography2.teardown();
            removePanelCss();
          };
        }, "dsh-system-fonts: activation state");
        ctx.effect(function() {
          const service = ctx.locale;
          if (!service || typeof service.register !== "function") return void 0;
          const off = service.register(LOCALE_NS, { en, zh });
          if (locale2 && typeof service.bind === "function") {
            try {
              locale2.attach(service.bind(LOCALE_NS));
            } catch (error) {
            }
          }
          return typeof off === "function" ? off : void 0;
        }, "dsh-system-fonts: locale dictionaries");
        ctx.effect(function() {
          installPanelCss();
          typography2.apply();
          if (chrome2) chrome2.apply();
        }, "dsh-system-fonts: font styles");
        ctx.effect(scheduleRebuild, "dsh-system-fonts: deferred rebuild");
        ctx.effect(function() {
          let theme = null;
          try {
            theme = typeof ctx.get === "function" ? ctx.get("theme") : null;
            if (!theme || typeof theme.getTheme !== "function") theme = null;
          } catch (error) {
            theme = null;
          }
          if (theme === null) return void 0;
          if (typeof onTheme === "function") onTheme(theme);
          const bridge2 = createThemeBridge(theme, settings2);
          const reasserted = /* @__PURE__ */ new Set();
          function reassert(role, name2) {
            if (reasserted.has(role)) return false;
            reasserted.add(role);
            try {
              return bridge2.setFamily(role, name2);
            } catch (error) {
              return false;
            }
          }
          function reconcileFamilies(families) {
            const state = settings2.getState();
            const pairs = [
              ["text", "uiFamily", state.uiFamily],
              ["code", "codeFamily", state.codeFamily],
              ["terminal", "terminalFamily", state.terminalFamily]
            ];
            const patch = {};
            let changed = false;
            for (const [role, key, local] of pairs) {
              const host = families[role];
              if (host === local) continue;
              if (host !== "") {
                patch[key] = host;
                changed = true;
                continue;
              }
              if (local === "") continue;
              reassert(role, local);
            }
            if (changed) settings2.setState(patch);
          }
          reconcileFamilies(bridge2.snapshot.fontFamilies);
          let off = null;
          try {
            off = typeof ctx.on === "function" ? ctx.on("theme/change", function(snapshot) {
              bridge2.adopt(snapshot);
              reconcileFamilies(bridge2.snapshot.fontFamilies);
              typography2.apply();
              if (chrome2) chrome2.apply();
            }) : null;
          } catch (error) {
            off = null;
          }
          return function() {
            if (typeof off === "function") off();
          };
        }, "dsh-system-fonts: theme bridge");
        ctx.effect(function() {
          if (!merger2) return void 0;
          return function() {
            try {
              merger2.restore();
            } catch (error) {
            }
          };
        }, "dsh-system-fonts: host font group merge");
        const slots = ctx.slots;
        const uiReady = React2 && primitives2 && primitives2.Menu && primitives2.MenuItemButton && primitives2.Input;
        if (!uiReady || !slots || typeof slots.inject !== "function") {
          console.warn("dsh-system-fonts: slots/react/primitives unavailable; font rows not registered");
        } else {
          slots.inject("settings.general.item", function() {
            return panel2.slots.map(function(slot) {
              return slots.register({
                name: "settings.general.item",
                id: slot.id,
                order: slot.order,
                // Injects `t(key, params)` as a component prop, backed by the
                // dictionaries registered above, and re-renders the rows when the
                // host language changes. 注入 t 并随语言切换重渲染。
                locale: LOCALE_NS
              }, slot.component);
            });
          });
        }
      }
      return apply2;
    }

    // client/src/merge.js
    var ROW_ATTR = "data-dsf-row";
    var COVERED_ATTR = "data-dsf-covered";
    var COLLAPSED_ATTR = "data-dsf-collapsed";
    var OUTLET_ATTR = "data-slot";
    var OUTLET_KEY = "settings.general.item";
    var ROLE_TITLES = [
      ["text", ["\u6B63\u6587\u5B57\u4F53", "Text font"]],
      ["code", ["\u4EE3\u7801\u5B57\u4F53", "Code font"]],
      ["terminal", ["\u7EC8\u7AEF\u5B57\u4F53", "Terminal font"]]
    ];
    var ROLE_ORDER = ROLE_TITLES.map(function(entry) {
      return entry[0];
    });
    var HOST_FAMILY_TITLES = ROLE_TITLES.reduce(function(all, entry) {
      return all.concat(entry[1]);
    }, []);
    var HOST_FAMILY_PLACEHOLDERS = ["\u9ED8\u8BA4", "Default"];
    function attr(el, name2) {
      if (!el || typeof el.getAttribute !== "function") return null;
      try {
        return el.getAttribute(name2);
      } catch (error) {
        return null;
      }
    }
    function setAttr(el, name2, value) {
      if (el && typeof el.setAttribute === "function") el.setAttribute(name2, value);
    }
    function delAttr(el, name2) {
      if (el && typeof el.removeAttribute === "function") el.removeAttribute(name2);
    }
    function tagOf(el) {
      return el && typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
    }
    function childrenOf(el) {
      const out = [];
      const kids = el && el.children;
      if (!kids) return out;
      for (let i = 0; i < kids.length; i += 1) out.push(kids[i]);
      return out;
    }
    function textOf(el) {
      const text = el && el.textContent;
      return text === void 0 || text === null ? "" : String(text).trim();
    }
    function styleOf(el) {
      return el && el.style ? el.style : null;
    }
    function isOurRow(el) {
      return attr(el, ROW_ATTR) !== null;
    }
    function eachDescendant(el, visit) {
      const stack = childrenOf(el).slice().reverse();
      while (stack.length > 0) {
        const node = stack.pop();
        if (isOurRow(node)) continue;
        visit(node);
        const kids = childrenOf(node);
        for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
      }
    }
    function isExpanderButton(el) {
      return tagOf(el) === "BUTTON" && attr(el, "aria-expanded") !== null && typeof attr(el, "aria-controls") === "string" && attr(el, "aria-controls") !== "";
    }
    function isFamilyInput(el) {
      if (tagOf(el) !== "INPUT") return false;
      if (attr(el, "maxlength") === "200") return true;
      const ph = attr(el, "placeholder");
      if (ph !== null && HOST_FAMILY_PLACEHOLDERS.indexOf(ph.trim()) >= 0) return true;
      const al = attr(el, "aria-label");
      if (al !== null && HOST_FAMILY_TITLES.indexOf(al.trim()) >= 0) return true;
      return false;
    }
    function subtreeHas(el, predicate) {
      let found = false;
      eachDescendant(el, (node) => {
        if (!found && predicate(node)) found = true;
      });
      return found;
    }
    function subtreeHasPx(el) {
      return subtreeHas(el, (node) => textOf(node) === "px");
    }
    function subtreeHasExpander(el) {
      return subtreeHas(el, isExpanderButton);
    }
    function subtreeHasFamilyInput(el) {
      return subtreeHas(el, isFamilyInput);
    }
    function subtreeInputs(el) {
      const out = [];
      eachDescendant(el, (node) => {
        if (isFamilyInput(node)) out.push(node);
      });
      return out;
    }
    function roleOfTitle(title) {
      const needle = String(title == null ? "" : title).trim();
      if (needle === "") return null;
      for (const entry of ROLE_TITLES) {
        if (entry[1].indexOf(needle) >= 0) return entry[0];
      }
      return null;
    }
    function childOfList(node, list) {
      let current = node;
      while (current && current.parentNode && current.parentNode !== list) current = current.parentNode;
      return current && current.parentNode === list ? current : null;
    }
    function findHostFontGroup(list) {
      let hit = null;
      eachDescendant(list, (node) => {
        if (hit !== null || !isExpanderButton(node)) return;
        const row = childOfList(node, list);
        if (row !== null && !isOurRow(row) && subtreeHasPx(row)) hit = row;
      });
      if (hit !== null) return hit;
      eachDescendant(list, (node) => {
        if (hit !== null || !isFamilyInput(node)) return;
        const row = childOfList(node, list);
        if (row !== null && !isOurRow(row)) hit = row;
      });
      return hit;
    }
    function applySequence(container, sequence, onError) {
      let cursor = container.firstChild || null;
      for (const node of sequence) {
        if (cursor === node) {
          cursor = node.nextSibling || null;
          continue;
        }
        try {
          container.insertBefore(node, cursor);
        } catch (error) {
          if (typeof onError === "function") onError(error);
          return false;
        }
      }
      return true;
    }
    function createHostMerger() {
      const rows = /* @__PURE__ */ new Map();
      const covered = [];
      let observer = null;
      let observed = null;
      let scheduled = false;
      let stopped = false;
      let warned = false;
      function warnOnce(error) {
        if (warned) return;
        warned = true;
        try {
          console.warn("dsh-system-fonts: host font group merge skipped", error);
        } catch (e) {
        }
      }
      function homeOf(el) {
        return { parent: el.parentNode || null, next: el.nextSibling || null };
      }
      function orderedRows() {
        return [...rows.values()].sort(function(a, b) {
          return a.order - b.order;
        });
      }
      function seat(rec) {
        const el = rec.el;
        if (!el || !rec.home || !rec.home.parent) return;
        if (el.parentNode === rec.home.parent) return;
        try {
          const next = rec.home.next && rec.home.next.parentNode === rec.home.parent ? rec.home.next : null;
          rec.home.parent.insertBefore(el, next);
        } catch (error) {
          warnOnce(error);
        }
      }
      function seatHomeAll() {
        for (const rec of rows.values()) seat(rec);
      }
      function hideRows() {
        for (const rec of rows.values()) {
          const el = rec.el;
          if (!el) continue;
          if (attr(el, COLLAPSED_ATTR) === null) setAttr(el, COLLAPSED_ATTR, "");
          const style = styleOf(el);
          if (style && style.display !== "none") style.display = "none";
        }
      }
      function unhideRows() {
        for (const rec of rows.values()) {
          const el = rec.el;
          if (!el) continue;
          if (attr(el, COLLAPSED_ATTR) !== null) delAttr(el, COLLAPSED_ATTR);
          const style = styleOf(el);
          if (style && style.display !== "") style.display = "";
        }
      }
      function note(slotId, el, order, role) {
        if (!el) {
          const prev2 = rows.get(slotId);
          if (prev2) {
            rows.delete(slotId);
            seat(prev2);
          }
          if (rows.size === 0) {
            uncoverAll();
            disconnect();
          }
          return;
        }
        setAttr(el, ROW_ATTR, slotId);
        stopped = false;
        const prev = rows.get(slotId);
        if (prev && prev.el !== el) seat(prev);
        rows.set(slotId, {
          el,
          order: order === void 0 ? prev ? prev.order : rows.size : order,
          role: role === void 0 ? prev ? prev.role : null : role,
          home: prev && prev.el === el ? prev.home : homeOf(el)
        });
        flush();
        schedule();
      }
      function unnote(slotId) {
        note(slotId, null);
      }
      function schedule() {
        if (scheduled) return;
        const run = function() {
          scheduled = false;
          attempt();
        };
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          scheduled = true;
          window.requestAnimationFrame(run);
        } else if (typeof setTimeout === "function") {
          scheduled = true;
          setTimeout(run, 0);
        } else {
          attempt();
        }
      }
      function flush() {
        scheduled = false;
        attempt();
      }
      function findList() {
        for (const rec of rows.values()) {
          const starts = [rec.el, rec.home && rec.home.parent];
          for (const start of starts) {
            let node = start;
            for (let i = 0; i < 8 && node; i += 1) {
              if (attr(node, OUTLET_ATTR) === OUTLET_KEY) return node;
              node = node.parentNode;
            }
          }
        }
        return null;
      }
      function findGroup(list) {
        return findHostFontGroup(list);
      }
      function findControl(group) {
        let pxHolder = null;
        for (const child of childrenOf(group)) {
          if (isOurRow(child)) continue;
          if (subtreeHasExpander(child)) return child;
          if (pxHolder === null && subtreeHasPx(child)) pxHolder = child;
        }
        return pxHolder;
      }
      function otherChildren(group, control) {
        return childrenOf(group).filter(function(child) {
          return child !== control && !isOurRow(child);
        });
      }
      function findRegion(group, control) {
        for (const child of otherChildren(group, control)) {
          if (subtreeHasFamilyInput(child)) return child;
        }
        return null;
      }
      function isCollapsedShape(group, control) {
        return otherChildren(group, control).length === 0;
      }
      function familyEntries(region) {
        const entries = [];
        for (const input of subtreeInputs(region)) {
          const row = familyRowOf(input, region);
          if (entries.some((entry) => entry.row === row)) continue;
          entries.push({ row, title: attr(input, "aria-label") || attr(input, "placeholder") || "" });
        }
        return entries;
      }
      function familyRowOf(input, region) {
        const candidates = [];
        let node = input.parentNode;
        while (node && node !== region) {
          const parent = node.parentNode;
          if (!parent) break;
          if (parent === region || parent.parentNode === region && parent !== region) candidates.push(node);
          node = parent;
        }
        for (let i = candidates.length - 1; i >= 0; i -= 1) {
          const cand = candidates[i];
          const inputs = subtreeInputs(cand);
          if (inputs.length === 1 && !subtreeHasExpander(cand) && !subtreeHasPx(cand)) return cand;
        }
        return input;
      }
      function familyRoles(region) {
        const entries = familyEntries(region);
        const found = [];
        entries.forEach((entry, index) => {
          const role = roleOfTitle(entry.title) || ROLE_ORDER[index] || null;
          if (role === null) return;
          if (found.some((item) => item.role === role)) return;
          found.push({ role, row: entry.row });
        });
        return found;
      }
      function cover(region) {
        for (let i = covered.length - 1; i >= 0; i -= 1) {
          const entry = covered[i];
          if (entry.el && entry.el.parentNode !== null) continue;
          covered.splice(i, 1);
        }
        for (const entry of familyEntries(region)) {
          const target = entry.row;
          const marked = attr(target, COVERED_ATTR) !== null;
          const hidden = target.style ? target.style.display === "none" : true;
          if (marked && hidden) continue;
          if (!marked) {
            const prevDisplay = target.style ? target.style.display : void 0;
            covered.push({ el: target, prevDisplay });
            setAttr(target, COVERED_ATTR, "");
          }
          if (target.style) target.style.display = "none";
        }
      }
      function uncoverAll() {
        for (const entry of covered.splice(0)) {
          delAttr(entry.el, COVERED_ATTR);
          if (entry.el.style) entry.el.style.display = entry.prevDisplay === void 0 ? "" : entry.prevDisplay;
        }
      }
      function seatInRegion(region) {
        const roles = familyRoles(region);
        const ordered = orderedRows();
        const placed = /* @__PURE__ */ new Set();
        const sequence = [];
        for (const child of childrenOf(region)) {
          if (isOurRow(child)) continue;
          sequence.push(child);
          for (const item of roles) {
            if (item.row !== child) continue;
            const rec = ordered.find(function(row) {
              return row.role === item.role && !placed.has(row);
            });
            if (rec && rec.el) {
              sequence.push(rec.el);
              placed.add(rec);
            }
          }
        }
        for (const rec of ordered) {
          if (!rec.el || placed.has(rec)) continue;
          sequence.push(rec.el);
          placed.add(rec);
        }
        return applySequence(region, sequence, warnOnce);
      }
      function watch(list) {
        const Observer = typeof window !== "undefined" ? window.MutationObserver : null;
        if (typeof Observer !== "function") return;
        if (observer && observed === list) return;
        if (observer) {
          try {
            observer.disconnect();
          } catch (error) {
          }
        }
        try {
          observer = new Observer(function() {
            flush();
          });
          observer.observe(list, { childList: true, subtree: true });
          observed = list;
        } catch (error) {
          observer = null;
          observed = null;
        }
      }
      function disconnect() {
        if (observer) {
          try {
            observer.disconnect();
          } catch (error) {
          }
        }
        observer = null;
        observed = null;
      }
      function degrade() {
        seatHomeAll();
        unhideRows();
        uncoverAll();
      }
      function attempt() {
        try {
          if (stopped || rows.size === 0) return false;
          const list = findList();
          if (list === null) {
            degrade();
            return false;
          }
          const group = findGroup(list);
          if (group === null) {
            watch(list);
            degrade();
            return false;
          }
          const control = findControl(group);
          const region = findRegion(group, control);
          if (region !== null) {
            if (!seatInRegion(region)) {
              degrade();
              return false;
            }
            cover(region);
            unhideRows();
            watch(list);
            return true;
          }
          if (isCollapsedShape(group, control)) {
            seatHomeAll();
            hideRows();
            uncoverAll();
            watch(list);
            return true;
          }
          degrade();
          watch(list);
          return false;
        } catch (error) {
          warnOnce(error);
          try {
            degrade();
          } catch (secondary) {
          }
          return false;
        }
      }
      function restore() {
        stopped = true;
        seatHomeAll();
        unhideRows();
        uncoverAll();
        disconnect();
      }
      return {
        note,
        unnote,
        attempt,
        restore,
        /** Test/introspection surface. 测试与自省用。 */
        get rowCount() {
          return rows.size;
        },
        get coveredCount() {
          return covered.length;
        },
        /** All rows, in slot order. 全部行（按槽位顺序）。 */
        elements() {
          return orderedRows().map(function(rec) {
            return rec.el;
          });
        },
        /** The host region currently resolved, or null (collapsed). 当前折叠区。 */
        region() {
          const list = findList();
          if (list === null) return null;
          const group = findGroup(list);
          return group === null ? null : findRegion(group, findControl(group));
        },
        /** True when every row sits inside the live region. */
        isMerged() {
          const region = this.region();
          if (region === null) return false;
          for (const rec of rows.values()) {
            if (!rec.el || rec.el.parentNode !== region) return false;
          }
          return rows.size > 0;
        },
        /** True when every row is home (slot outlet) and hidden by us. */
        isCollapsed() {
          if (rows.size === 0) return false;
          for (const rec of rows.values()) {
            const el = rec.el;
            if (!el || !rec.home || !rec.home.parent) return false;
            if (el.parentNode !== rec.home.parent) return false;
            if (attr(el, COLLAPSED_ATTR) === null) return false;
            if (!el.style || el.style.display !== "none") return false;
          }
          return true;
        }
      };
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
    var storage = null;
    try {
      storage = typeof window === "undefined" ? null : window.localStorage;
    } catch (error) {
      storage = null;
    }
    var settings = createSettingsStore(storage);
    var typography = createTypography({ getState: settings.getState });
    var chrome = createChrome({ getState: settings.getState });
    settings.onChange = function() {
      typography.apply();
      chrome.apply();
    };
    var catalogue = createCatalogue();
    var bridge = createThemeBridge(null, settings);
    var locale = createLocaleHandle(DEFAULT_LOCALE);
    var merger = createHostMerger();
    var panel = createPanel({ React, primitives, settings, catalogue, bridge, locale, merger });
    var apply = createLifecycle({
      settings,
      typography,
      chrome,
      catalogue,
      panel,
      merger,
      locale,
      React,
      primitives,
      onTheme: function(theme) {
        bridge.attach(theme);
      }
    });
    var name = PLUGIN_ID;
    var inject = ["slots", "locale"];
    var __internals = {
      DEFAULT_STATE,
      SCALE_STEPS,
      LOCALE_NS,
      buildCss,
      buildStack,
      rewriteLineHeight,
      splitFontTail,
      readDeclaredToken,
      buildShadowCss,
      quoteFamily,
      clampLineHeight,
      clampTracking,
      loadState: settings.loadState,
      getState: settings.getState,
      setState: settings.setState,
      applyCss: typography.apply,
      settings,
      catalogue,
      typography,
      chrome,
      panel,
      merger,
      localeHandle: locale,
      translator: createTranslator
    };
    return module.exports
  },
})
