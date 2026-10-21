/**
 * The browser half of `@hwfee/dsh-genui`.
 *
 * It registers one occupant of `tool.call.toolview` under the key `render_ui`.
 * A keyed hit REPLACES the generic tool row, so the user sees a live card where
 * the call would otherwise be a collapsed "Render UI" line.
 *
 * Sources live beside this file; `npm run build` bundles them into
 * `client/client.js` in the host's module-loader format.
 *
 * WHAT SURVIVES A RELOAD. The card is not held in plugin memory — it is
 * re-derived from the committed tool call's arguments on every mount. That is
 * why `lib/spec.js` and the arg parser are shared with the Host half instead of
 * being duplicated here: a forked or replayed session must render the same card
 * from the same bytes.
 */

window.__ModuleLoader__.load({
  id: "@hwfee/dsh-genui",
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

    // lib/spec.js
    var TOOL_NAME = "render_ui";
    var MAX_CODE_BYTES = 48 * 1024;
    function buildUiSpec(args) {
      const input = args !== null && typeof args === "object" ? args : {};
      const title = typeof input.title === "string" ? input.title.trim() : "";
      if (title === "") {
        throw new Error("render_ui needs a non-empty `title`: one short line naming what the card shows");
      }
      if (title.length > 120) {
        throw new Error("render_ui `title` must be 120 characters or fewer; put the detail inside the card");
      }
      const code = typeof input.code === "string" ? input.code : "";
      const trimmed = code.trim();
      if (trimmed === "") {
        throw new Error("render_ui needs `code`: the body of a function that returns React elements");
      }
      const bytes = utf8Length(code);
      if (bytes > MAX_CODE_BYTES) {
        throw new Error(
          `render_ui \`code\` is ${bytes} bytes, over the ${MAX_CODE_BYTES} byte limit. Render a compact card and leave the detail in your reply.`
        );
      }
      return { title, code, bytes };
    }
    function utf8Length(text) {
      let bytes = 0;
      for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        if (code < 128) {
          bytes += 1;
        } else if (code < 2048) {
          bytes += 2;
        } else if (code >= 55296 && code <= 56319) {
          const next = text.charCodeAt(i + 1);
          if (next >= 56320 && next <= 57343) {
            bytes += 4;
            i += 1;
          } else {
            bytes += 3;
          }
        } else {
          bytes += 3;
        }
      }
      return bytes;
    }
    function readUiSpec(argsRaw) {
      if (typeof argsRaw !== "string" || argsRaw === "") return null;
      let parsed;
      try {
        parsed = JSON.parse(argsRaw);
      } catch {
        return null;
      }
      try {
        return buildUiSpec(parsed);
      } catch {
        return null;
      }
    }

    // client/src/constants.js
    var PLUGIN_ID = "@hwfee/dsh-genui";
    var SLOT = "tool.call.toolview";
    var LOCALE_NS = "dsh-genui";
    var NODE_KIND = "render-ui";

    // client/src/legibility.js
    var MIN_TEXT_ALPHA = 0.25;
    var LEGIBLE_ATTR = "data-dsh-genui-legible";
    function parseComputedColor(value) {
      if (typeof value !== "string") return null;
      const match = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
      if (match === null) return null;
      const parts = match[1].split(/[\s,/]+/).filter((part) => part !== "");
      if (parts.length < 3) return null;
      const channel = (text) => {
        const number = text.endsWith("%") ? Number(text.slice(0, -1)) * 2.55 : Number(text);
        return Number.isFinite(number) ? Math.round(number) : null;
      };
      const r = channel(parts[0]);
      const g = channel(parts[1]);
      const b = channel(parts[2]);
      if (r === null || g === null || b === null) return null;
      const a = parts.length > 3 ? Number(parts[3].endsWith("%") ? parts[3].slice(0, -1) / 100 : parts[3]) : 1;
      return { r, g, b, a: Number.isFinite(a) ? a : 1 };
    }
    function paintsText(element) {
      const children = element.childNodes;
      if (children === void 0 || children === null) return false;
      for (const node of children) {
        if (node.nodeType === 3 && String(node.nodeValue ?? "").trim() !== "") return true;
      }
      return false;
    }
    function repairElement(element, view) {
      if (!paintsText(element)) return false;
      if (element.style === void 0 || element.style === null || typeof element.style.setProperty !== "function") return false;
      const style = view.getComputedStyle(element);
      if (style === void 0 || style === null) return false;
      const clip = style.backgroundClip ?? style.webkitBackgroundClip;
      if (clip === "text") return false;
      const color = parseComputedColor(style.color);
      if (color === null || color.a >= MIN_TEXT_ALPHA) return false;
      element.style.setProperty("color", `rgb(${color.r}, ${color.g}, ${color.b})`);
      if (typeof element.setAttribute === "function") element.setAttribute(LEGIBLE_ATTR, "");
      return true;
    }
    function repairInvisibleText(root) {
      const view = root?.ownerDocument?.defaultView ?? null;
      if (view === null || typeof view.getComputedStyle !== "function") return 0;
      if (typeof root.querySelectorAll !== "function") return 0;
      let repaired = repairElement(root, view) ? 1 : 0;
      for (const element of root.querySelectorAll("*")) {
        if (repairElement(element, view)) repaired += 1;
      }
      return repaired;
    }
    function observeInvisibleText(root) {
      const view = root?.ownerDocument?.defaultView ?? null;
      const Observer = view?.MutationObserver;
      if (typeof Observer !== "function") {
        repairInvisibleText(root);
        return function disposeWithoutObserver() {
        };
      }
      let queued = false;
      let cancelled = false;
      const frame = typeof view.requestAnimationFrame === "function" ? (callback) => view.requestAnimationFrame(callback) : (callback) => view.setTimeout(callback, 0);
      const cancelFrame = typeof view.cancelAnimationFrame === "function" ? (handle2) => view.cancelAnimationFrame(handle2) : (handle2) => view.clearTimeout(handle2);
      let handle = null;
      const flush = () => {
        queued = false;
        if (cancelled) return;
        repairInvisibleText(root);
      };
      const schedule = () => {
        if (queued || cancelled) return;
        queued = true;
        handle = frame(flush);
      };
      repairInvisibleText(root);
      const observer = new Observer(schedule);
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      return function dispose() {
        cancelled = true;
        observer.disconnect();
        if (handle !== null) cancelFrame(handle);
      };
    }

    // client/src/card.js
    function createCard({ React: React2, toolName, tryCompile, readSpec }) {
      const h = React2.createElement;
      class CardErrorBoundary extends React2.Component {
        constructor(props) {
          super(props);
          this.state = { error: null };
        }
        static getDerivedStateFromError(error) {
          return { error };
        }
        componentDidUpdate(prevProps) {
          if (prevProps.resetKey !== this.props.resetKey && this.state.error !== null) {
            this.setState({ error: null });
          }
        }
        /**
         * Stop the snippet's timers when the card leaves the DOM.
         *
         * A recycled row unmounts constantly, and a `setInterval` a snippet started
         * has no other owner. Guarded because `onUnmount` is optional.
         */
        componentWillUnmount() {
          if (typeof this.props.onUnmount === "function") this.props.onUnmount();
        }
        render() {
          if (this.state.error !== null) {
            return this.props.renderFailure(this.state.error);
          }
          return this.props.children;
        }
      }
      function CardBody({ spec, t, send, sent, sendFailed }) {
        const compiled = React2.useMemo(
          // `send` is part of the key: the bridge identity is stable per card, and a
          // compiled component that captured a stale bridge would send into the
          // wrong session after the row is recycled.
          () => tryCompile({ React: React2, code: spec.code, interact: send }),
          [spec.code, send]
        );
        if (!compiled.ok) {
          return h(Failure, { t, title: t("card.failed"), detail: compiled.message });
        }
        const Rendered = compiled.Component;
        return h(
          CardErrorBoundary,
          {
            resetKey: spec.code,
            // The compiled card owns its timers; unmounting it is the moment to stop
            // them. `dispose` is optional so a component compiled by an older build
            // (a cached artifact) still renders.
            onUnmount: typeof Rendered.dispose === "function" ? Rendered.dispose : void 0,
            renderFailure: (error) => h(Failure, {
              t,
              title: t("card.failed"),
              detail: error instanceof Error ? error.message : String(error)
            })
          },
          h(Rendered),
          // Delivery feedback lives OUTSIDE the card's own tree so a snippet cannot
          // style it away, and below the card so it does not shift the layout the
          // snippet computed.
          sent ? h("div", { className: "dsh-genui-sent", role: "status" }, t("card.sent")) : null,
          sendFailed !== "" ? h(Failure, { t, title: t("card.sendFailed"), detail: sendFailed }) : null
        );
      }
      function CardBodyFrame({ t, spec, send, sent, sendFailed }) {
        const body = React2.useRef(null);
        React2.useEffect(() => {
          if (body.current === null) return void 0;
          return observeInvisibleText(body.current);
        }, [spec.code]);
        return h(
          "div",
          { className: "dsh-genui-body", ref: body },
          h(CardBody, { spec, t, send, sent, sendFailed })
        );
      }
      function Failure({ t, title, detail }) {
        return h(
          "div",
          { className: "dsh-genui-failure", role: "alert" },
          h("div", { className: "dsh-genui-failure-title" }, title),
          h("div", { className: "dsh-genui-failure-detail" }, detail)
        );
      }
      function Invalid({ t }) {
        return h(
          "div",
          { className: "dsh-genui-body" },
          h("div", { className: "dsh-genui-failure-detail" }, t("card.invalid"))
        );
      }
      function Pending({ t }) {
        return h(
          "div",
          { className: "dsh-genui-card" },
          h("div", { className: "dsh-genui-pending" }, t("card.preparing"))
        );
      }
      return function RenderUiCard(props) {
        const { phase, block, useDisclosure } = props;
        const t = typeof props.t === "function" ? props.t : fallbackTranslate;
        const disclosure = typeof useDisclosure === "function" ? useDisclosure() : { expanded: false, toggle: function noop() {
        } };
        const showSource = disclosure.expanded === true;
        const toggle = disclosure.toggle;
        const [sent, setSent] = React2.useState(false);
        const [sendFailed, setSendFailed] = React2.useState("");
        const mounted = React2.useRef(true);
        React2.useEffect(() => () => {
          mounted.current = false;
        }, []);
        React2.useEffect(() => {
          if (!sent) return void 0;
          const timer = globalThis.setTimeout(() => {
            if (mounted.current) setSent(false);
          }, 4e3);
          return () => {
            globalThis.clearTimeout(timer);
          };
        }, [sent]);
        const send = React2.useCallback(async (message) => {
          if (typeof props.sendMessage !== "function") {
            throw new Error("this card cannot send a message: no conversation bridge was injected");
          }
          try {
            await props.sendMessage(message);
            if (mounted.current) {
              setSent(true);
              setSendFailed("");
            }
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            if (mounted.current) setSendFailed(detail);
            throw error;
          }
        }, [props.sendMessage]);
        if (phase === "preparing") return h(Pending, { t });
        const isNode = props.node !== void 0 && props.node !== null;
        const raw = isNode ? props.node.data.argsRaw : phase === "result" ? block?.call?.argsRaw : block?.argsRaw;
        const spec = isNode ? props.node.data.spec : readSpec(raw);
        const toolError = isNode ? props.node.data.errorText ?? "" : phase === "result" && block?.isError === true ? blockContentText(block) : "";
        if (spec === null) {
          return h(
            "div",
            { className: "dsh-genui-card" },
            h("div", { className: "dsh-genui-head" }, h("div", { className: "dsh-genui-title" }, t("card.title"))),
            h(Invalid, { t }),
            toolError !== "" ? h(Failure, { t, title: t("card.failed"), detail: toolError }) : null
          );
        }
        const rationale = readRationale(raw);
        const store = props.titlePlacementStore;
        const subscribed = typeof React2.useSyncExternalStore === "function" && store !== void 0;
        const fromStore = subscribed ? React2.useSyncExternalStore(store.subscribe, store.getSnapshot) : void 0;
        const placement = fromStore ?? props.titlePlacement ?? "above";
        const heading = h("div", {
          className: "dsh-genui-title",
          title: rationale !== "" ? rationale : spec.title
        }, spec.title);
        const sourceToggle = h("button", {
          type: "button",
          className: "dsh-genui-toggle",
          "aria-pressed": showSource,
          "aria-label": t("aria.toggleSource"),
          title: showSource ? t("card.hideSource") : t("card.showSource"),
          onClick: toggle
        }, h("span", { "aria-hidden": "true" }, showSource ? "\xD7" : "\u2325"));
        const head = (extraClass) => h(
          "div",
          { className: "dsh-genui-head " + extraClass },
          heading,
          placement === "left" ? sourceToggle : null
        );
        return h(
          "div",
          {
            className: "dsh-genui-card",
            "data-dsh-genui-card": "",
            "data-title-placement": placement,
            "aria-label": t("aria.card")
          },
          // `left` and `above` both put the heading first; only the alignment differs,
          // and the CSS class carries that.
          placement === "above" ? head("dsh-genui-head-centered") : null,
          placement === "left" ? head("dsh-genui-head-left") : null,
          h(CardBodyFrame, { t, spec, send, sent, sendFailed }),
          placement === "below" ? head("dsh-genui-head-centered dsh-genui-head-below") : null,
          placement !== "left" ? h("div", { className: "dsh-genui-actions" }, sourceToggle) : null,
          showSource ? h("pre", { className: "dsh-genui-source", tabIndex: 0, "aria-label": t("card.sourceLabel") }, spec.code) : null
        );
      };
    }
    function blockContentText(block) {
      const content = Array.isArray(block?.content) ? block.content : [];
      const parts = [];
      for (const part of content) {
        if (part !== null && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
          parts.push(part.text);
        }
      }
      return parts.join("\n").trim();
    }
    function readRationale(argsRaw) {
      if (typeof argsRaw !== "string" || argsRaw === "") return "";
      try {
        const parsed = JSON.parse(argsRaw);
        return parsed !== null && typeof parsed === "object" && typeof parsed.rationale === "string" ? parsed.rationale.trim() : "";
      } catch {
        return "";
      }
    }
    function fallbackTranslate(key) {
      return key;
    }

    // client/src/sandbox.js
    var REDIRECTS = {
      localStorage: "a card must not touch the host's storage. Keep state in React.useState; the model owns persistence.",
      sessionStorage: "a card must not touch the host's storage. Keep state in React.useState.",
      indexedDB: "a card must not touch the host's storage. Keep state in React.useState.",
      require: "no module loading here. Build elements with `h` and the React passed to the snippet.",
      Function: "nested evaluation is not allowed; write the code you mean."
    };
    var PARAMETERS = ["React", "h", "interact", "timers", ...Object.keys(REDIRECTS)];
    function trapFor(name2) {
      const message = `${name2} is not available in a render_ui card \u2014 ${REDIRECTS[name2]}`;
      const fail = () => {
        throw new Error(message);
      };
      const callable = { [name2]: function maskedGlobal() {
      } }[name2];
      return new Proxy(callable, {
        get: fail,
        set: fail,
        apply: fail,
        construct: fail,
        has() {
          return true;
        }
      });
    }
    function compileCard({ React: React2, code, interact }) {
      if (React2 === null || typeof React2 !== "object" && typeof React2 !== "function") {
        throw new Error("render_ui needs the host React instance; none was passed to the sandbox");
      }
      const send = async function interactBridge(text) {
        const message = typeof text === "string" ? text.trim() : "";
        if (message === "") throw new Error("interact() needs a non-empty message");
        if (typeof interact !== "function") {
          throw new Error("this card has no way to send a message back; interact() needs a host bridge");
        }
        return interact(message);
      };
      let body;
      try {
        body = new Function(...PARAMETERS, `'use strict';
    ${code}`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `the snippet did not parse: ${detail}. JSX is not available \u2014 use h(tag, props, ...children) or React.createElement.`
        );
      }
      const traps = PARAMETERS.slice(4).map((name2) => trapFor(name2));
      const timers = createScopedTimers();
      function RenderUiCard() {
        const result = body(React2, React2.createElement, send, timers.api, ...traps);
        let component = false;
        if (typeof result === "function") {
          try {
            component = /^[A-Z]/.test(result.name ?? "") || result.prototype?.isReactComponent !== void 0;
          } catch (error) {
            component = false;
          }
        }
        return component ? React2.createElement(result) : result;
      }
      RenderUiCard.dispose = timers.clear;
      return RenderUiCard;
    }
    function createScopedTimers() {
      const pending = /* @__PURE__ */ new Set();
      const wrap = (callback) => {
        if (typeof callback !== "function") throw new Error("timers.set/every needs a function");
        return function scopedTimerCallback() {
          try {
            callback();
          } catch (error) {
            console.error("[dsh-genui] a card timer threw:", error);
          }
        };
      };
      const api = {
        set(callback, ms) {
          const id = setTimeout(() => {
            pending.delete(id);
            wrap(callback)();
          }, ms);
          pending.add(id);
          return id;
        },
        every(callback, ms) {
          const id = setInterval(wrap(callback), ms);
          pending.add(id);
          return id;
        },
        clear(id) {
          if (pending.delete(id)) {
            clearTimeout(id);
            clearInterval(id);
          }
        }
      };
      return {
        api,
        clear() {
          for (const id of pending) {
            clearTimeout(id);
            clearInterval(id);
          }
          pending.clear();
        }
      };
    }
    function tryCompileCard({ React: React2, code, interact }) {
      try {
        return { ok: true, Component: compileCard({ React: React2, code, interact }) };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    }

    // client/src/vendor/visualize.css.js
    var VENDOR_CSS = '/**\n * ZCode `visualize` design system, ported to DSH theme tokens.\n *\n * Upstream: zai-org/ZCode \xB7 apps/zcode-cli/packages/visualize-plugin/\n *           skills/visualize/assets/visualize.css\n * License:  Apache-2.0 (see vendor/NOTICE.md)\n *\n * GENERATED by tools/port-visualize-css.mjs \u2014 do not hand-edit the component\n * section. To re-port, pass a newer upstream file to that script.\n */\n/* ------------------------------------------------------------------ *\n * TOKEN LAYER \u2014 ported onto DSH theme tokens.\n *\n * Everything below this block is ZCode\'s component CSS, copied verbatim.\n * Every value here resolves through a --dsw-alias-* token, so a component\n * follows light/dark mode, the CDS theme, and any theme plugin the user\n * installs \u2014 none of that needs a rule of its own.\n *\n * `light-dark()` fallbacks are intentionally gone: DSH switches themes on\n * body[data-ds-dark-theme], not on prefers-color-scheme, so an imported\n * fallback would disagree with the user\'s theme choice.\n * ------------------------------------------------------------------ */\n/*\n * SCOPED TO THE CARD, NOT :root. Upstream sets these on `:root` because the\n * page belongs to the visual. Here the page belongs to the HOST: `--primary`,\n * `--border` and `--card` are generic enough names that another plugin, or a\n * future host variable, could mean something else by them. Scoping the block\n * to `.dsh-genui-card` keeps the design system inside the answer it styles.\n */\n.dsh-genui-card {\n  color-scheme: light dark;\n\n  --background: transparent;\n  --foreground: var(--dsw-alias-label-primary);\n  --card: var(--dsw-alias-bg-layer-2);\n  --card-border: var(--dsw-alias-border-l1);\n  --card-foreground: var(--dsw-alias-label-primary);\n  --popover: var(--dsw-alias-bg-layer-2);\n  --popover-foreground: var(--dsw-alias-label-primary);\n  --primary: var(--dsw-alias-brand-primary);\n  --primary-foreground: var(--dsw-alias-label-on-brand, #ffffff);\n  --secondary: var(--dsw-alias-bg-layer-2);\n  --secondary-foreground: var(--dsw-alias-label-primary);\n  --muted: var(--dsw-alias-bg-layer-2);\n  --muted-foreground: var(--dsw-alias-label-secondary);\n  --accent: var(--dsw-alias-bg-layer-2);\n  --accent-foreground: var(--dsw-alias-brand-primary);\n  --destructive: var(--dsw-alias-state-error-primary, var(--dsw-alias-code-diff-deleted));\n  --border: var(--dsw-alias-border-l1);\n  --input: var(--dsw-alias-border-l1);\n  --ring: var(--dsw-alias-brand-primary);\n  --content-accent: var(--dsw-alias-brand-primary);\n  --color-background-primary: transparent;\n  --color-text-primary: var(--dsw-alias-label-primary);\n  --color-border-secondary: var(--dsw-alias-border-l1);\n\n  --viz-series-1: var(--dsw-alias-brand-primary);\n  --viz-series-2: var(--dsw-alias-state-warn-primary, #d97706);\n  --viz-series-3: var(--dsw-alias-state-success-primary, #16a34a);\n  --viz-series-4: var(--dsw-alias-state-business-primary, #2563eb);\n  --viz-series-5: var(--dsw-alias-state-error-primary, #dc2626);\n  --viz-series-6: var(--dsw-alias-label-secondary);\n\n  --font-size-normal: var(--dsh-content-font-size, 14px);\n  --font-size-small: var(--dsh-content-font-size-secondary, 13px);\n  --font-size-xs: var(--dsh-content-font-size-caption, 12px);\n  --font-weight-normal: 400;\n  --font-weight-medium: 500;\n  --font-weight-bold: 600;\n  --line-height-normal: 1.4;\n  --font-sans: inherit;\n  --font-mono: var(--ds-font-family-code, ui-monospace, monospace);\n  --radius-sm: var(--dsw-radius-sm, 6px);\n  --radius-md: var(--dsw-radius-md, 8px);\n  --radius-lg: var(--dsw-radius-lg, 12px);\n  --radius-xl: var(--dsw-radius-xl, 16px);\n  --radius-full: 999px;\n  --control-radius: var(--radius-lg);\n  --cursor-interaction: pointer;\n}\n\n/* ---------- component rules (verbatim from upstream) ---------- */.dsh-genui-card .cursor-interaction {\n  cursor: var(--cursor-interaction, pointer);\n}\n\n.dsh-genui-card a {\n  color: color-mix(in srgb, var(--viz-accent) 80%, var(--viz-text) 20%);\n  cursor: var(--cursor-interaction, pointer);\n  font-weight: var(--font-weight-medium, 500);\n  text-decoration: none;\n  text-underline-offset: 2px;\n}\n\n.dsh-genui-card a:is(:hover, :focus-visible) {\n  text-decoration-line: underline;\n  text-decoration-style: dashed;\n  text-decoration-thickness: 0.5px;\n}\n\n.dsh-genui-card h1,\n.dsh-genui-card h2,\n.dsh-genui-card h3,\n.dsh-genui-card h4,\n.dsh-genui-card h5,\n.dsh-genui-card h6,\n.dsh-genui-card p {\n  margin-block: 0;\n}\n\n.dsh-genui-card h1 {\n  font-size: var(--font-size-h1);\n  font-weight: var(--font-weight-medium);\n  line-height: 1.25;\n}\n\n.dsh-genui-card h2 {\n  font-size: var(--font-size-h2);\n  font-weight: var(--font-weight-medium);\n  line-height: 1.25;\n}\n\n.dsh-genui-card h3,\n.dsh-genui-card h4,\n.dsh-genui-card h5,\n.dsh-genui-card h6 {\n  font-size: var(--font-size-h3);\n  font-weight: var(--font-weight-medium);\n  line-height: 1.3;\n}\n\n.dsh-genui-card b,\n.dsh-genui-card strong,\n.dsh-genui-card th {\n  font-weight: var(--font-weight-medium);\n}\n\n.dsh-genui-card code:not(pre code) {\n  display: inline;\n  padding: 1px 6px;\n  border-radius: var(--radius-sm);\n  corner-shape: var(--corner-shape);\n  background: var(--muted);\n  font-family: var(--font-mono);\n  font-size: var(--font-size-small);\n  overflow-wrap: anywhere;\n  -webkit-box-decoration-break: clone;\n  box-decoration-break: clone;\n  word-break: break-word;\n}\n\n.dsh-genui-card .table-responsive {\n  width: 100%;\n  overflow-x: auto;\n  scrollbar-width: thin;\n}\n\n.dsh-genui-card .table {\n  width: 100%;\n  border-collapse: collapse;\n  color: var(--foreground);\n  font: inherit;\n  text-align: start;\n}\n\n.dsh-genui-card .table :is(th, td) {\n  padding-block: 10px;\n  padding-inline: 0 24px;\n  overflow-wrap: anywhere;\n  border-bottom: 1px solid var(--border);\n  text-align: start;\n  vertical-align: top;\n}\n\n.dsh-genui-card .table-responsive > .table :is(th, td) {\n  overflow-wrap: break-word;\n}\n\n.dsh-genui-card .table :is(th, td):last-child {\n  padding-inline-end: 0;\n}\n\n.dsh-genui-card .table :is(caption, thead th) {\n  font-weight: 600;\n}\n\n.dsh-genui-card .table thead th {\n  padding-block: 8px;\n  border-bottom-color: color-mix(in srgb, var(--foreground) 16%, transparent);\n}\n\n.dsh-genui-card .table tbody tr:last-child :is(th, td) {\n  border-bottom: 0;\n}\n\n.dsh-genui-card .table.table-sm :is(th, td) {\n  padding-block: 6px;\n}\n\n.dsh-genui-card .table.table-sm :is(th, td):not(:last-child) {\n  padding-inline-end: 16px;\n}\n\n.dsh-genui-card .table :is(.text-end, [align="right"]) {\n  text-align: end;\n  font-variant-numeric: tabular-nums;\n}\n\n.dsh-genui-card .table :is(.text-center, [align="center"]) {\n  text-align: center;\n}\n\n.dsh-genui-card .table .text-nowrap {\n  white-space: nowrap;\n}\n\n.dsh-genui-card {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  width: 100%;\n  padding: 0;\n  background: transparent !important;\n}\n\n.dsh-genui-card .card {\n  min-width: 0;\n  padding: 12px;\n  overflow: hidden;\n  overflow-wrap: break-word;\n  border: 1px solid var(--card-border);\n  border-radius: var(--radius-xl);\n  corner-shape: var(--corner-shape);\n  color: var(--card-foreground);\n  background: var(--card);\n}\n\n.dsh-genui-card .widget {\n  min-width: 0;\n  overflow: hidden;\n  border: 0;\n  border-radius: var(--radius-xl);\n  corner-shape: var(--corner-shape);\n  box-shadow: 0 0 0 0.5px var(--border-strong, var(--border));\n  color: var(--foreground);\n  background: var(--background);\n}/* \u53EA\u8BA1\u7B97\u53EF\u89C1\u5706\u89D2\u5BB9\u5668\uFF0C\u4EFB\u610F\u5E03\u5C40 wrapper \u4E0D\u589E\u52A0\u5C42\u7EA7\u3002 */\n.dsh-genui-card :is(.card, .widget) {\n  --control-radius: var(--radius-lg);\n}\n\n.dsh-genui-card :is(.card, .widget) :is(.card, .widget) {\n  border-radius: var(--radius-lg);\n  --control-radius: var(--radius-md);\n}\n\n.dsh-genui-card :is(.card, .widget) :is(.card, .widget) :is(.card, .widget) {\n  border-radius: var(--radius-md);\n  --control-radius: var(--radius-sm);\n}\n\n.dsh-genui-card :is(.card, .widget) :is(.card, .widget) :is(.card, .widget) :is(.card, .widget) {\n  border-radius: var(--radius-sm);\n}\n\n.dsh-genui-card .dsh-genui-body > :not(.card, .widget, .progress) {\n  width: 100% !important;\n  max-width: none !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n}\n\n.dsh-genui-card .tooltip {\n  position: fixed;\n  z-index: 50;\n  top: 0;\n  left: 0;\n  width: max-content;\n  max-width: min(\n    20rem,\n    var(--tooltip-available-width, calc(100vw - 10px)),\n    calc(100vw - 10px)\n  );\n  max-height: min(\n    var(--tooltip-available-height, calc(100vh - 10px)),\n    calc(100vh - 10px)\n  );\n  padding: 4px 8px;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-lg);\n  corner-shape: var(--corner-shape);\n  color: var(--popover-foreground);\n  background: var(--popover);\n  box-shadow: none;\n  font-size: var(--font-size-tooltip);\n  line-height: var(--line-height-tooltip);\n  overflow-wrap: break-word;\n  white-space: normal;\n  pointer-events: none;\n  user-select: none;\n}\n\n.dsh-genui-card .viz-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(max(180px, 24%), 1fr));\n  gap: 10px;\n}\n\n.dsh-genui-card .viz-stat {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.dsh-genui-card .viz-stat-value {\n  font-size: var(--font-size-h2);\n  font-weight: var(--font-weight-medium);\n  line-height: 1.25;\n}\n\n.dsh-genui-card .viz-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 10px;\n}\n\n.dsh-genui-card hr {\n  width: 100%;\n  height: 1px;\n  margin-block: 6px;\n  border: 0;\n  background: var(--border);\n}\n\n.dsh-genui-card .nav {\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  gap: 4px;\n}\n\n.dsh-genui-card .progress {\n  display: flex;\n  height: 8px;\n  margin-block: calc((var(--line-height-normal, 1.5em) - 8px) / 2);\n  overflow: hidden;\n  border: 0;\n  border-radius: var(--radius-full);\n  background: var(--muted);\n}\n\n.dsh-genui-card .progress-bar:only-child {\n  border-radius: var(--radius-full);\n}\n\n.dsh-genui-card .progress-bar {\n  height: 100%;\n  flex-shrink: 0;\n  border: 0;\n  background: var(--viz-series-1);\n}\n\n.dsh-genui-card .viz-badge {\n  padding: 3px 8px;\n  border-radius: var(--radius-full);\n  color: var(--accent-foreground);\n  background: var(--accent);\n  font-weight: var(--font-weight-medium);\n}\n\n.dsh-genui-card small,\n.dsh-genui-card .text-small,\n.dsh-genui-card .viz-badge {\n  font-size: var(--font-size-small);\n  line-height: var(--line-height-small);\n}\n\n.dsh-genui-card .text-muted {\n  color: var(--muted-foreground);\n}\n\n.dsh-genui-card .tabular-nums {\n  font-variant-numeric: tabular-nums;\n}\n\n.dsh-genui-card .sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n\n.dsh-genui-card .viz-controls {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n}\n\n.dsh-genui-card .viz-controls > .form-label {\n  display: grid;\n  min-width: min(100%, 260px);\n  flex: 1 1 280px;\n  grid-template-columns: minmax(0, 1fr) auto;\n  align-items: baseline;\n  gap: 2px 12px;\n  margin-bottom: 0;\n}\n\n.dsh-genui-card .viz-controls > .form-label > :is(.form-control, .form-range, .form-select) {\n  grid-column: 1 / -1;\n}\n\n.dsh-genui-card .btn,\n.dsh-genui-card .nav-link,\n.dsh-genui-card .form-check-input,\n.dsh-genui-card .form-control,\n.dsh-genui-card .form-range,\n.dsh-genui-card .form-select {\n  font-family: var(--font-sans);\n  font-size: var(--font-size-normal);\n  font-weight: var(--font-weight-normal);\n  line-height: var(--line-height-normal);\n}\n\n.dsh-genui-card .btn,\n.dsh-genui-card .nav-link {\n  appearance: button;\n  display: inline-flex;\n  inline-size: fit-content;\n  max-inline-size: 100%;\n  min-height: 28px;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n  margin: 0;\n  padding: 0 8px;\n  -webkit-app-region: no-drag;\n  border: 1px solid var(--gen-ui-border, var(--input));\n  border-radius: var(--control-radius);\n  corner-shape: var(--corner-shape);\n  color: var(--foreground);\n  background: transparent;\n  cursor: var(--cursor-interaction, pointer);\n  text-align: center;\n  text-decoration: none;\n  white-space: nowrap;\n  user-select: none;\n  -webkit-font-smoothing: antialiased;\n}\n\n.dsh-genui-card .btn:is(.btn-block, .viz-tile) {\n  inline-size: 100%;\n}\n\n.dsh-genui-card .btn.viz-tile {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  white-space: normal;\n}\n\n.dsh-genui-card a.btn {\n  cursor: var(--cursor-interaction, pointer);\n  text-decoration: none;\n}\n\n.dsh-genui-card .btn:not(:disabled):hover,\n.dsh-genui-card .nav-link:not(:disabled):not([aria-disabled="true"]):hover {\n  border-color: var(--gen-ui-border-hover, var(--border));\n  background: color-mix(in srgb, var(--input-bg) 50%, transparent);\n}\n\n.dsh-genui-card .btn-primary {\n  border-color: transparent;\n  color: var(--primary-foreground);\n  background: var(--primary);\n  background-clip: padding-box;\n}\n\n.dsh-genui-card .btn-primary .text-muted {\n  color: color-mix(in srgb, var(--primary-foreground) 50%, transparent);\n}\n\n.dsh-genui-card .btn-primary:not(:disabled):hover {\n  border-color: transparent;\n  background: color-mix(in srgb, var(--primary) 80%, transparent);\n  background-clip: padding-box;\n}\n\n.dsh-genui-card .btn-ghost {\n  border-color: transparent;\n  color: var(--foreground);\n  background: transparent;\n}\n\n.dsh-genui-card .btn-ghost:not(:disabled):hover {\n  border-color: transparent;\n  color: var(--foreground);\n  background: var(--hover);\n}\n\n.dsh-genui-card .nav-pills .nav-link {\n  min-width: 0;\n  border-color: transparent;\n  color: var(--muted-foreground);\n  background: transparent;\n}\n\n.dsh-genui-card .nav-justified .nav-link {\n  flex: 1 1 0;\n  overflow-wrap: anywhere;\n  white-space: normal;\n}\n\n.dsh-genui-card .nav-pills .nav-link.active {\n  color: var(--foreground);\n  background: var(--muted);\n}\n\n.dsh-genui-card .btn-secondary {\n  border-color: transparent;\n  background: var(--secondary);\n}\n\n.dsh-genui-card .btn-secondary:not(:disabled):hover {\n  border-color: transparent;\n  background: color-mix(in srgb, var(--secondary) 80%, transparent);\n}/* \u56FA\u5B9A\u9AD8\u5EA6\u53E0\u52A0\u6B63\u6587\u884C\u9AD8\u4F1A\u8BA9\u653E\u5927\u5B57\u53F7\u6EA2\u51FA\uFF1B\u53D8\u4F53\u4EC5\u7EA6\u675F\u6700\u5C0F\u9AD8\u5EA6\uFF0C\u4FDD\u7559\u5185\u5BB9\u589E\u957F\u3002 */\n.dsh-genui-card .btn:is(.btn-xs, .btn-sm, .btn-lg) {\n  line-height: 1;\n  padding-block: 2px;\n}\n\n.dsh-genui-card .btn-xs {\n  min-height: 20px;\n}\n\n.dsh-genui-card .btn-sm {\n  min-height: 24px;\n}\n\n.dsh-genui-card .btn-lg {\n  min-height: 32px;\n  padding-inline: 10px;\n}\n\n.dsh-genui-card .btn svg.lucide {\n  --icon-size: 14px;\n}\n\n.dsh-genui-card .btn-xs svg.lucide {\n  --icon-size: 10px;\n}\n\n.dsh-genui-card .btn-sm svg.lucide {\n  --icon-size: 12px;\n}\n\n.dsh-genui-card .btn-lg svg.lucide {\n  --icon-size: 16px;\n}/* Shared preview chrome; product styles stay inside each variant. */\n.dsh-genui-card .viz-dotted-background {\n  background-image: radial-gradient(\n    circle,\n    color-mix(in srgb, var(--foreground) 14%, transparent) 0.8px,\n    transparent 0.8px\n  );\n  background-position: center;\n  background-size: 16px 16px;\n}\n\n.dsh-genui-card .viz-carousel {\n  position: relative;\n  min-width: 0;\n}\n\n.dsh-genui-card .viz-carousel:has(> .viz-carousel-controls) {\n  min-height: calc(60px + var(--viz-carousel-picker-height, 0px));\n  padding-bottom: 60px;\n}\n\n.dsh-genui-card .viz-carousel > [data-variant][hidden] {\n  display: none !important;\n}\n\n.dsh-genui-card .viz-carousel > [data-variant] {\n  isolation: isolate;\n}\n\n.dsh-genui-card .viz-carousel-controls {\n  --viz-carousel-hover: color-mix(in srgb, var(--foreground) 5.4%, transparent);\n  position: absolute;\n  z-index: 2;\n  bottom: 8px;\n  left: 50%;\n  display: flex;\n  width: max-content;\n  /* Leave room for the host\'s design-controls launcher at the trailing edge. */\n  max-width: calc(100% - 96px);\n  align-items: center;\n  gap: 0;\n  padding: 0;\n  border: 1px solid var(--border);\n  border-radius: 16px;\n  color: var(--foreground);\n  background: var(--background);\n  font-family: var(--font-sans);\n  /* Match the settings dropdown chrome independently of the content font size. */\n  font-size: 13px;\n  font-weight: var(--font-weight-normal);\n  line-height: 18px;\n  transform: translateX(-50%);\n  user-select: none;\n}\n\n.dsh-genui-card .viz-carousel-controls button,\n.dsh-genui-card .viz-carousel-picker > summary {\n  display: flex;\n  min-height: 30px;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n  padding: 0 6px;\n  -webkit-app-region: no-drag;\n  border: 0;\n  border-radius: 14px;\n  color: inherit;\n  background: transparent;\n  font: inherit;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.dsh-genui-card .viz-carousel-controls > button,\n.dsh-genui-card .viz-carousel-picker > summary {\n  position: relative;\n  isolation: isolate;\n}\n\n.dsh-genui-card .viz-carousel-controls > button {\n  --icon-size: 16px;\n  width: 30px;\n  padding: 0;\n}\n\n.dsh-genui-card .viz-carousel-picker > summary {\n  padding-inline: 12px;\n}\n\n.dsh-genui-card .viz-carousel-controls .viz-carousel-caret {\n  width: 14px;\n  height: 14px;\n  flex: none;\n  margin: 0;\n  color: inherit;\n  transform: rotate(180deg);\n}\n\n.dsh-genui-card .viz-carousel-controls > button > svg,\n.dsh-genui-card .viz-carousel-controls .viz-carousel-caret,\n.dsh-genui-card .viz-carousel-count {\n  opacity: 0.5;\n}\n\n.dsh-genui-card .viz-carousel-controls > button::before,\n.dsh-genui-card .viz-carousel-picker > summary::before {\n  position: absolute;\n  z-index: -1;\n  inset: 3px;\n  border-radius: 12px;\n  content: "";\n  pointer-events: none;\n}\n\n.dsh-genui-card .viz-carousel-controls > button:hover::before,\n.dsh-genui-card .viz-carousel-picker > summary:hover::before {\n  background: var(--viz-carousel-hover);\n}\n\n.dsh-genui-card .viz-carousel-controls > button,\n.dsh-genui-card .viz-carousel-controls [data-lucide],\n.dsh-genui-card .viz-carousel-controls .lucide {\n  flex-shrink: 0;\n}\n\n.dsh-genui-card .viz-carousel-picker {\n  min-width: 0;\n}\n\n.dsh-genui-card .viz-carousel-picker > summary {\n  min-width: 0;\n  list-style: none;\n}\n\n.dsh-genui-card .viz-carousel-picker > summary::-webkit-details-marker {\n  display: none;\n}\n\n.dsh-genui-card .viz-carousel-count {\n  flex-shrink: 0;\n  white-space: nowrap;\n}\n\n.dsh-genui-card .viz-carousel-name {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dsh-genui-card .viz-carousel-options {\n  position: absolute;\n  right: 0;\n  bottom: calc(100% + 4px);\n  left: 0;\n  display: flex;\n  max-height: 240px;\n  flex-direction: column;\n  gap: 2px;\n  overflow: auto;\n  padding: 4px;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-lg);\n  background: var(--background);\n  box-shadow: 0 4px 12px rgb(0 0 0 / 6%);\n}\n\n.dsh-genui-card .viz-carousel-options > button {\n  width: 100%;\n  min-height: 28px;\n  justify-content: flex-start;\n  padding: 4px 8px;\n  font-size: var(--font-size-small);\n  text-align: start;\n  white-space: normal;\n  overflow-wrap: anywhere;\n}\n\n.dsh-genui-card .viz-carousel-options > [aria-current="true"],\n.dsh-genui-card .viz-carousel-options > button:hover {\n  background: var(--viz-carousel-hover);\n}\n\n.dsh-genui-card .btn:disabled,\n.dsh-genui-card .nav-link:disabled,\n.dsh-genui-card .nav-link[aria-disabled="true"] {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n\n.dsh-genui-card [data-lucide] {\n  stroke-width: 1.6;\n}\n\n.dsh-genui-card .form-label {\n  display: block;\n  margin-bottom: 6px;\n  color: var(--foreground);\n}\n\n.dsh-genui-card .form-control {\n  display: block;\n  width: 100%;\n  min-height: 36px;\n  padding: 0 8px;\n  outline: none;\n  border: 1px solid var(--input-border);\n  border-radius: var(--control-radius);\n  corner-shape: var(--corner-shape);\n  color: var(--foreground);\n  background: var(--input-bg);\n}\n\n.dsh-genui-card .form-control::placeholder {\n  color: var(--placeholder);\n}\n\n.dsh-genui-card .form-control[type="file"] {\n  padding: 0;\n  overflow: hidden;\n  cursor: var(--cursor-interaction, pointer);\n}\n\n.dsh-genui-card .form-control[type="file"]::file-selector-button {\n  min-height: 26px;\n  margin-right: 8px;\n  padding: 0 8px;\n  border: 0;\n  border-right: 1px solid var(--input);\n  color: var(--secondary-foreground);\n  background: var(--input-bg);\n  cursor: inherit;\n  font: inherit;\n}\n\n.dsh-genui-card .form-control[type="file"]:not(:disabled):hover::file-selector-button {\n  background: color-mix(in srgb, var(--foreground) 6%, var(--secondary));\n}\n\n.dsh-genui-card .form-control-color[type="color"] {\n  width: 40px;\n  height: 28px;\n  padding: 3px;\n  cursor: var(--cursor-interaction, pointer);\n}\n\n.dsh-genui-card .form-control-color[type="color"]::-webkit-color-swatch-wrapper {\n  padding: 0;\n}\n\n.dsh-genui-card .form-control-color[type="color"]::-webkit-color-swatch {\n  border: 0;\n  border-radius: calc(var(--radius-lg) - 4px);\n  corner-shape: var(--corner-shape);\n}\n\n.dsh-genui-card textarea.form-control {\n  height: auto;\n  min-height: 64px;\n  padding: 8px;\n  resize: vertical;\n}\n\n.dsh-genui-card .form-control:focus-visible {\n  border-color: var(--input-border-focused);\n  background-color: var(--input-bg-focused);\n}\n\n.dsh-genui-card .form-control:disabled,\n.dsh-genui-card .form-select:disabled {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n\n.dsh-genui-card .form-select {\n  appearance: none;\n  display: block;\n  width: 100%;\n  min-height: 36px;\n  margin: 0;\n  padding: 0 32px 0 8px;\n  outline: none;\n  border: 1px solid var(--input-border);\n  border-radius: var(--control-radius);\n  corner-shape: var(--corner-shape);\n  color: var(--foreground);\n  background-color: var(--input-bg);\n  background-image:\n    linear-gradient(45deg, transparent 50%, var(--muted-foreground) 50%),\n    linear-gradient(135deg, var(--muted-foreground) 50%, transparent 50%);\n  background-position:\n    calc(100% - 14px) 50%,\n    calc(100% - 10px) 50%;\n  background-repeat: no-repeat;\n  background-size: 4px 4px;\n  cursor: var(--cursor-interaction, default);\n}\n\n.dsh-genui-card .form-select:not(:disabled):not(:focus-visible):hover {\n  border-color: var(--input-border-hover);\n}\n\n.dsh-genui-card .form-select:focus-visible {\n  border-color: var(--input-border-focused);\n  background-color: var(--input-bg-focused);\n}\n\n.dsh-genui-card .form-control:not(:disabled):not(:focus-visible):hover {\n  border-color: var(--input-border-hover);\n}\n\n.dsh-genui-card .form-control.form-control-sm,\n.dsh-genui-card .form-select.form-select-sm {\n  min-height: 28px;\n}\n\n.dsh-genui-card .form-control.form-control-xs,\n.dsh-genui-card .form-select.form-select-xs {\n  min-height: 24px;\n}\n\n.dsh-genui-card .form-check {\n  display: flex;\n  min-height: 20px;\n  align-items: center;\n  gap: 6px;\n}\n\n.dsh-genui-card .form-check-input {\n  appearance: none;\n  width: 16px;\n  height: 16px;\n  flex: 0 0 auto;\n  margin: 0;\n  border: 1px solid var(--input-border);\n  color: var(--primary-foreground);\n  background-color: transparent;\n  cursor: var(--cursor-interaction, default);\n  transition:\n    background-color 150ms,\n    border-color 150ms,\n    box-shadow 150ms;\n}\n\n.dsh-genui-card .form-check:not(.form-switch) .form-check-input[type="checkbox"] {\n  border-color: var(--input-border);\n  border-radius: var(--radius-sm);\n  corner-shape: var(--corner-shape);\n  background-color: var(--input-bg);\n  box-shadow: none;\n}\n\n.dsh-genui-card .form-check:not(.form-switch)\n  .form-check-input:not(:disabled):not(:checked):not(:indeterminate):hover {\n  /* \u534A\u9009\u4E0D\u662F\u672A\u9009\u4E2D\uFF1B\u907F\u514D hover \u8986\u76D6 primary \u80CC\u666F\u5BFC\u81F4\u6A2A\u7EBF\u5931\u53BB\u5BF9\u6BD4\u3002 */\n  background-color: var(--card);\n}\n\n.dsh-genui-card .form-check:not(.form-switch) .form-check-input[type="checkbox"]:checked {\n  border-color: var(--primary);\n  background-color: var(--primary);\n}\n\n.dsh-genui-card .form-check:not(.form-switch)\n  .form-check-input[type="checkbox"]:checked::before {\n  display: block;\n  width: 100%;\n  height: 100%;\n  background: var(--primary-foreground);\n  content: "";\n  mask: var(--checkmark-image) center / 12px 12px no-repeat;\n}\n\n.dsh-genui-card .form-check-input[type="radio"] {\n  width: 16px;\n  height: 16px;\n  border-radius: var(--radius-full);\n}\n\n.dsh-genui-card .form-check-input[type="radio"]:checked {\n  border: 2px solid var(--primary);\n  background:\n    radial-gradient(circle, var(--primary-foreground) 0 2.5px, transparent 3px),\n    var(--primary);\n}\n\n.dsh-genui-card .form-check:not(.form-switch) .form-check-input:focus-visible {\n  outline: 2px solid var(--ring);\n  outline-offset: 2px;\n}\n\n.dsh-genui-card .form-check:not(.form-switch) .form-check-input:disabled {\n  cursor: not-allowed;\n  pointer-events: none;\n}\n\n.dsh-genui-card .form-check:not(.form-switch) .form-check-input:disabled + .form-check-label {\n  cursor: not-allowed;\n}\n\n.dsh-genui-card .form-switch .form-check-input:disabled,\n.dsh-genui-card .form-switch .form-check-input:disabled + .form-check-label {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n\n.dsh-genui-card .form-check-label {\n  color: var(--foreground);\n  cursor: var(--cursor-interaction, default);\n}\n\n.dsh-genui-card .form-switch .form-check-input {\n  position: relative;\n  width: 32px;\n  height: 18px;\n  border: 0;\n  border-radius: var(--radius-full);\n  background: color-mix(in srgb, var(--primary) 30%, transparent);\n  box-shadow: none;\n  transition: background-color 200ms cubic-bezier(0, 0, 0.2, 1);\n}\n\n.dsh-genui-card .form-switch .form-check-input::before {\n  position: absolute;\n  top: 50%;\n  left: 0;\n  width: 16px;\n  height: 16px;\n  box-sizing: border-box;\n  border: 1px solid var(--primary-foreground);\n  border-radius: var(--radius-full);\n  background: var(--primary-foreground);\n  box-shadow: none;\n  content: "";\n  transform: translate(1px, -50%);\n  transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);\n}\n\n.dsh-genui-card .form-switch .form-check-input:checked {\n  background: var(--primary);\n}\n\n.dsh-genui-card .form-switch .form-check-input:checked::before {\n  transform: translate(15px, -50%);\n}\n\n.dsh-genui-card .form-switch .form-check-input:focus-visible {\n  box-shadow: 0 0 0 2px var(--ring);\n}\n\n.dsh-genui-card .form-check:not(.form-switch) .form-check-input[type="checkbox"]:indeterminate {\n  border-color: var(--primary);\n  background: var(--primary);\n}\n\n.dsh-genui-card .form-check:not(.form-switch) .form-check-input[type="checkbox"]:indeterminate::before {\n  display: block;\n  width: 8px;\n  height: 2px;\n  margin: 6px 3px;\n  background: var(--primary-foreground);\n  content: "";\n}\n\n.dsh-genui-card .form-check-input:disabled {\n  opacity: 0.5;\n}\n\n.dsh-genui-card .form-range {\n  appearance: none;\n  display: block;\n  width: 100%;\n  height: 28px;\n  flex: 1;\n  margin: 0;\n  padding: 0;\n  outline: none;\n  border: 0;\n  accent-color: var(--primary);\n  background: linear-gradient(\n      color-mix(in srgb, var(--foreground) 7%, transparent),\n      color-mix(in srgb, var(--foreground) 7%, transparent)\n    )\n    center / 100% 2px no-repeat;\n}\n\n.dsh-genui-card .form-range::-webkit-slider-runnable-track {\n  height: 28px;\n  background: transparent;\n}\n\n.dsh-genui-card .form-range::-webkit-slider-thumb {\n  appearance: none;\n  width: 20px;\n  height: 20px;\n  margin-top: 4px;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-full);\n  background: var(--primary-foreground);\n}\n\n.dsh-genui-card .form-range:focus-visible::-webkit-slider-thumb {\n  border-color: var(--ring);\n  box-shadow: inset 0 0 0 1px var(--ring);\n}\n\n.dsh-genui-card .form-range::-moz-range-track {\n  height: 28px;\n  background: transparent;\n}\n\n.dsh-genui-card .form-range::-moz-range-thumb {\n  width: 20px;\n  height: 20px;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-full);\n  background: var(--primary-foreground);\n}\n\n.dsh-genui-card .form-range:focus-visible::-moz-range-thumb {\n  border-color: var(--ring);\n  box-shadow: inset 0 0 0 1px var(--ring);\n}\n\n.dsh-genui-card .form-range:disabled {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n\n.dsh-genui-card .btn:not(.btn-primary, .viz-tile):is(\n  [aria-pressed="true"],\n  [aria-selected="true"],\n  .is-selected\n) {\n  border-color: var(--gen-ui-border, var(--border));\n  color: var(--foreground);\n  background: var(--selected);\n}\n\n.dsh-genui-card .btn.viz-tile:is([aria-pressed="true"], [aria-selected="true"], .is-selected) {\n  border-color: var(--primary);\n  box-shadow: inset 0 0 0 1px var(--primary);\n}\n\n.dsh-genui-card .btn:focus-visible,\n.dsh-genui-card .nav-link:focus-visible,\n.dsh-genui-card .viz-carousel-controls :is(button, summary):focus-visible {\n  outline: 2px solid var(--ring);\n  outline-offset: 2px;\n}\n\n@media (pointer: coarse) {.dsh-genui-card .viz-carousel:has(> .viz-carousel-controls) {\n    min-height: calc(76px + var(--viz-carousel-picker-height, 0px));\n    padding-bottom: 76px;\n  }\n\n.dsh-genui-card .btn,\n.dsh-genui-card .nav-link,\n.dsh-genui-card .viz-carousel-controls button,\n.dsh-genui-card .viz-carousel-picker > summary,\n.dsh-genui-card .form-control,\n.dsh-genui-card .form-select,\n.dsh-genui-card .form-control.form-control-sm,\n.dsh-genui-card .form-control.form-control-xs,\n.dsh-genui-card .form-select.form-select-sm,\n.dsh-genui-card .form-select.form-select-xs,\n.dsh-genui-card .btn.btn-xs,\n.dsh-genui-card .btn.btn-sm,\n.dsh-genui-card .btn.btn-lg {\n    min-width: 44px;\n    min-height: 44px;\n  }/* Keep small-screen WebKit from zooming when a text field receives focus. */\n.dsh-genui-card .form-control,\n.dsh-genui-card .form-select {\n    font-size: max(16px, var(--font-size-normal));\n  }\n\n.dsh-genui-card .form-control[type="file"]::file-selector-button {\n    min-width: 44px;\n    min-height: 44px;\n  }\n\n.dsh-genui-card .form-control-color[type="color"] {\n    width: 44px;\n    height: 44px;\n  }\n\n.dsh-genui-card .form-control:is(\n    [type="date"],\n    [type="datetime-local"],\n    [type="month"],\n    [type="time"],\n    [type="week"]\n  ) {\n    min-width: 0;\n    max-width: 100%;\n    padding-block: 8px;\n  }\n\n.dsh-genui-card .form-check {\n    min-height: 44px;\n    padding-inline: 15px;\n  }\n\n.dsh-genui-card .form-check-input {\n    position: relative;\n  }\n\n.dsh-genui-card .form-check-input::after {\n    position: absolute;\n    top: 50%;\n    left: 50%;\n    width: 44px;\n    height: 44px;\n    content: "";\n    transform: translate(-50%, -50%);\n  }\n\n.dsh-genui-card .form-check-label {\n    display: inline-flex;\n    min-width: 44px;\n    min-height: 44px;\n    align-items: center;\n  }\n\n.dsh-genui-card .form-range {\n    height: 44px;\n    touch-action: pan-y;\n  }\n\n.dsh-genui-card .form-range::-webkit-slider-runnable-track {\n    height: 44px;\n  }\n\n.dsh-genui-card .form-range::-moz-range-track {\n    height: 44px;\n  }\n\n.dsh-genui-card .form-range::-webkit-slider-thumb {\n    margin-top: 12px;\n  }\n}\n\n.dsh-genui-card svg {\n  display: block;\n  max-width: 100%;\n  height: auto;\n}\n\n.dsh-genui-card > svg {\n  width: 100%;\n}/* Model-authored chart rules can otherwise stretch icons after these styles load. */\n.dsh-genui-card svg.lucide {\n  display: block;\n  width: var(--icon-size) !important;\n  height: var(--icon-size) !important;\n  flex: none;\n  margin: 0 !important;\n  stroke-width: 1.6;\n}\n\n.dsh-genui-card .text-warning,\n.dsh-genui-card .text-destructive {\n  color: var(--destructive);\n}\n';

    // client/src/styles.js
    var CSS = `
    /* NO FRAME. A generated UI is the ANSWER, not a window that contains it.
       The first version drew a card \u2014 border, radius, header bar, a "view source"
       button, a "why a card" footer \u2014 and that framing was wrong on every count:
       it made the answer look like an embedded widget, it added chrome the user has
       to read past, and it competed visually with the reply text around it.

       ZCode's Gen UI (and every other shipped implementation) renders the page
       inline in the message flow, full width, with no container. So does this one
       now: the root is a plain block that inherits the transcript's own typography
       and colours. The only structure left is spacing. */
    /* A COLUMN FLEX CONTAINER, not a block.
       The heading rows centre themselves with justify-content: center, and that
       property does NOTHING on a block container \u2014 which is why the first version's
       "centred" heading still rendered hard left while a geometry assertion built on
       justify-content passed. Flex makes the row's alignment real, and column keeps
       the heading / body / footer stacked in document order. */
    .dsh-genui-card {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    /* The title is a LINE OF TEXT, not a chrome bar: same size as body copy, one
       step stronger, with no divider under it \u2014 the answer's own content is the
       content, and a rule between title and body only added a box edge. */
    .dsh-genui-head {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    /* ABOVE (default): a centred heading over the content.
       Centred rather than left-aligned because the content under it is usually a
       figure, a chart or a table \u2014 a block with its own optical centre \u2014 and a
       left-hugging label over a centred block reads as disconnected. */
    .dsh-genui-head-centered {
      justify-content: center;
      margin-bottom: 12px;
    }

    /* BELOW: the same heading, under the content, so the reading order is
       content-first. Margin flips to the top; nothing else changes. */
    .dsh-genui-head-below {
      margin-bottom: 0;
      margin-top: 12px;
    }

    /* LEFT: the original heading, left-aligned, sharing its line with the source
       toggle. Kept for readers who prefer the title to lead without centring. */
    .dsh-genui-head-left {
      justify-content: flex-start;
      margin-bottom: 10px;
    }

    /* The trailing diagnostics row, used whenever the heading is centred and the
       toggle would break that centring. It sits at the end, right-aligned, and is
       nearly invisible until hovered. */
    .dsh-genui-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
    }

    /* THE TITLE IS ONE STEP ABOVE BODY COPY, by weight only.
       ZCode's typography rule is "h1 is body +4px, h2 +2px, h3-h6 the body size",
       and a visual's own heading is an h3: the body size, differentiated by weight.
       So this stays at the body size and uses 600. Making it LARGER than the reply
       text was the actual complaint \u2014 a card that shouts its own title competes
       with the answer it is supposed to be part of. */
    /* THE TITLE MUST SHRINK TO ITS TEXT when centred.
       flex: 1 (from the inline layout, where the title shares a row with the
       source toggle and should absorb the spare space) makes the element full width
       \u2014 and a full-width element has nothing for justify-content to move, so the
       text stayed hard left while the computed style read center. The centring
       modes therefore set flex: 0 1 auto, and only the inline mode grows. */
    .dsh-genui-title {
      flex: 0 1 auto;
      min-width: 0;
      font-size: var(--dsh-content-font-size, 14px);
      font-weight: 600;
      line-height: 1.5;
      color: var(--dsw-alias-label-primary);
    }

    /* Left mode: the title leads and takes the leftover width, pushing the source
       toggle to the far end. */
    .dsh-genui-head-left .dsh-genui-title {
      flex: 1;
    }

    /* Long titles wrap instead of being clipped; centred text that overflows is
       worse than a second line. */
    .dsh-genui-head-centered .dsh-genui-title {
      text-align: center;
      overflow-wrap: anywhere;
    }

    /* Metadata stays available but recedes: it is a caption, not a badge. */
    .dsh-genui-badge {
      flex: none;
      font-size: var(--dsh-content-font-size-caption, 12px);
      color: var(--dsw-alias-label-tertiary);
      font-variant-numeric: tabular-nums;
    }

    .dsh-genui-toggle {
      flex: none;
      appearance: none;
      border: 1px solid transparent;
      border-radius: var(--dsw-radius-sm);
      background: transparent;
      padding: 2px 8px;
      font-size: var(--dsh-content-font-size-caption, 12px);
      color: var(--dsw-alias-label-secondary);
      cursor: pointer;
      transition: background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
                  color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
    }

    /* Hidden until the reader shows interest. A diagnostic control has no business
       competing with the answer for attention \u2014 but it must stay reachable by
       keyboard, so focus reveals it exactly like hover does. */
    .dsh-genui-toggle {
      opacity: 0;
      transition: opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out),
                  background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
                  color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
    }

    .dsh-genui-card:hover .dsh-genui-toggle,
    .dsh-genui-toggle:focus-visible,
    .dsh-genui-toggle[aria-pressed="true"] {
      opacity: 1;
    }

    .dsh-genui-toggle:hover {
      background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary);
    }

    .dsh-genui-toggle:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary);
      outline-offset: 1px;
    }

    /* NO PADDING, NO SCROLLBOX, NO HEIGHT CAP.
       All three were window chrome. A generated answer that is taller than the
       viewport should scroll WITH the conversation \u2014 that is what the transcript
       does \u2014 rather than becoming an inner scroll region the user has to hit with
       the wheel first. The host's own long content (a big diff, a long table in
       Markdown) behaves the same way: it grows and the page scrolls. */
    .dsh-genui-body {
      /* THE CONVERSATION DOES NOT SET A FONT SIZE. The chat flow's containers all
         inherit the document's 16px; only the markdown renderer, further in, sets
         the 14px a reply is displayed at. So "inherit" here would give 16px \u2014 larger
         than the reply sitting next to it, which is the bug this rule fixes.
         The host's own content token is the value the markdown renderer itself uses,
         so the answer matches the prose AND follows the user's font-size setting. */
      font-size: var(--dsh-content-font-size, 14px);
      /* The host has no line-height token; it computes 19.2px for 14px text (1.37).
         1.4 lands on 19.6px and, more importantly, SCALES with the font-size token
         when the user changes it \u2014 a fixed 19.2px would not. */
      line-height: 1.4;
      color: var(--dsw-alias-label-primary);
      min-width: 0;
    }

    .dsh-genui-body:empty {
      display: none;
    }

    /* The rationale is a FOOTNOTE, not a footer bar: no rule above it, no box
       padding, just tertiary text one step down from the answer. It explains the
       model's choice; it is not part of the answer's frame. */
    .dsh-genui-rationale {
      margin-top: 10px;
      font-size: var(--dsh-content-font-size-caption, 12px);
      line-height: 1.5;
      color: var(--dsw-alias-label-tertiary);
    }

    /* The source view is a CODE BLOCK, not a panel inside a window: it borrows the
       host's markdown code treatment (surface + radius + code font) so it reads as
       "here is the code that made this", the same way a fenced block in the reply
       would. */
    .dsh-genui-source {
      margin: 10px 0 0;
      padding: 12px 14px;
      border-radius: var(--dsw-radius-md);
      background: var(--dsw-alias-markdown-code-block);
      color: var(--dsw-alias-label-primary);
      font-family: var(--ds-font-family-code);
      font-size: var(--dsh-content-font-size-caption, 12px);
      line-height: 1.55;
      overflow: auto;
      max-height: 360px;
      tab-size: 2;
    }

    /* A failure is inline feedback with a red left edge, not a panel. Same shape as
       the host's own inline callouts.
       THE EDGE USES THE OPAQUE ERROR INK, not --dsw-alias-code-diff-deleted. That
       token is a translucent FILL (rgba(186, 39, 35, 0.08) \u2014 eight percent), so a
       2px border drawn with it is a 2px border at eight percent opacity: the panel
       then has no visible edge at all, which is the same mistake the card's own
       snippet made with its headline (see legibility.js). */
    .dsh-genui-failure {
      display: grid;
      gap: 6px;
      margin-top: 10px;
      padding: 10px 12px;
      border-left: 2px solid var(--dsw-alias-state-error-primary);
      border-radius: 0 var(--dsw-radius-sm) var(--dsw-radius-sm) 0;
      background: var(--dsw-alias-bg-layer-2);
    }

    .dsh-genui-failure-title {
      font-size: var(--dsh-content-font-size, 14px);
      font-weight: 600;
      color: var(--dsw-alias-label-primary);
    }

    .dsh-genui-failure-detail {
      font-family: var(--ds-font-family-code);
      font-size: var(--dsh-content-font-size-caption, 12px);
      color: var(--dsw-alias-label-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .dsh-genui-sent {
      margin-top: 8px;
      font-size: var(--dsh-content-font-size-caption, 12px);
      color: var(--dsw-alias-label-tertiary);
    }

    /* ---- the settings row ---------------------------------------------------
       Mirrors the host's own general-settings rows: a title, a secondary hint, and
       the control on the right. Every value is a host token so the row matches its
       neighbours in both themes. */
    .dsh-genui-setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 0;
      /* NO border of our own. cds-theme draws the hairline under every settings row
         with the slot-child rule, and a border here competed with it: whichever won
         depended on stylesheet order, so this row's line was 0.06 while its
         neighbours were 0.10 \u2014 visibly the odd one out. The theme owns the
         separator. */
    }

    .dsh-genui-setting-title {
      font-size: var(--dsh-content-font-size, 14px);
      line-height: 22px;
      color: var(--dsw-alias-label-primary);
    }

    .dsh-genui-setting-hint {
      margin-top: 2px;
      font-size: var(--dsh-content-font-size-caption, 12px);
      line-height: 18px;
      color: var(--dsw-alias-label-tertiary);
    }

    .dsh-genui-setting-trigger {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: none;
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

    .dsh-genui-setting-trigger:hover {
      background: var(--dsw-alias-interactive-bg-hover);
    }

    .dsh-genui-setting-trigger:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary);
      outline-offset: 1px;
    }

    .dsh-genui-setting-select {
      flex: none;
      height: 32px;
      padding: 0 8px;
      border: 0.5px solid var(--dsw-alias-border-l1);
      border-radius: var(--dsw-radius-md);
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary);
      font: inherit;
      font-size: var(--dsh-content-font-size-secondary, 13px);
    }

    /* Inside the popup menu, one row per placement, with a check on the active one. */
    .dsh-genui-setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-width: 180px;
    }

    .dsh-genui-setting-check {
      display: inline-flex;
      color: var(--dsw-alias-brand-primary);
    }

    .dsh-genui-pending {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: var(--dsh-content-font-size-secondary, 13px);
      color: var(--dsw-alias-label-tertiary);
    }
    `;
    function installCardCss(doc) {
      const disposeFrame = installOne(doc, CSS, "data-dsh-genui-style");
      const disposeVendor = installOne(doc, VENDOR_CSS, "data-dsh-genui-vendor-style");
      return () => {
        disposeVendor();
        disposeFrame();
      };
    }
    function installOne(doc, css, marker) {
      if (doc === void 0 || doc === null || typeof doc.createElement !== "function") {
        return function disposeWithoutDocument() {
        };
      }
      const previous = doc.querySelector(`style[${marker}]`);
      if (previous !== null) previous.remove();
      const tag = doc.createElement("style");
      tag.setAttribute(marker, "");
      tag.textContent = css;
      doc.head.append(tag);
      return function dispose() {
        tag.remove();
      };
    }

    // client/src/locales.js
    var en = {
      "card.title": "Generated UI",
      "card.preparing": "Preparing card\u2026",
      "card.invalid": "This card could not be read \u2014 its arguments are missing or invalid.",
      "card.failed": "This card failed to render",
      "card.showSource": "View source",
      "card.hideSource": "Hide source",
      "card.sourceLabel": "Card source",
      "card.rationaleLabel": "Why a card",
      "card.sent": "Sent to the conversation",
      "setting.titlePlacement": "Card title position",
      "setting.titlePlacement.left": "Left, above the content",
      "setting.titlePlacement.above": "Centred above the content",
      "setting.titlePlacement.below": "Centred below the content",
      "setting.titlePlacementHint": "Where a generated card puts its title.",
      "card.sendFailed": "This card could not send its message",
      "aria.toggleSource": "Toggle the source of this card",
      "aria.card": "Interactive card rendered from a render_ui call"
    };
    var zh = {
      "card.title": "\u751F\u6210\u7684\u754C\u9762",
      "card.preparing": "\u6B63\u5728\u51C6\u5907\u5361\u7247\u2026",
      "card.invalid": "\u8FD9\u5F20\u5361\u7247\u8BFB\u4E0D\u51FA\u6765 \u2014\u2014 \u5B83\u7684\u53C2\u6570\u7F3A\u5931\u6216\u4E0D\u5408\u6CD5\u3002",
      "card.failed": "\u8FD9\u5F20\u5361\u7247\u6E32\u67D3\u5931\u8D25",
      "card.showSource": "\u67E5\u770B\u6E90\u7801",
      "card.hideSource": "\u6536\u8D77\u6E90\u7801",
      "card.sourceLabel": "\u5361\u7247\u6E90\u7801",
      "card.rationaleLabel": "\u4E3A\u4EC0\u4E48\u7528\u5361\u7247",
      "card.sent": "\u5DF2\u53D1\u9001\u5230\u5BF9\u8BDD",
      "setting.titlePlacement": "\u5361\u7247\u6807\u9898\u4F4D\u7F6E",
      "setting.titlePlacement.left": "\u9760\u5DE6\uFF0C\u5728\u5185\u5BB9\u4E0A\u65B9",
      "setting.titlePlacement.above": "\u5185\u5BB9\u4E0A\u65B9\uFF0C\u5C45\u4E2D",
      "setting.titlePlacement.below": "\u5185\u5BB9\u4E0B\u65B9\uFF0C\u5C45\u4E2D",
      "setting.titlePlacementHint": "\u751F\u6210\u7684\u5361\u7247\u628A\u6807\u9898\u653E\u5728\u54EA\u91CC\u3002",
      "card.sendFailed": "\u8FD9\u5F20\u5361\u7247\u6CA1\u80FD\u53D1\u51FA\u6D88\u606F",
      "aria.toggleSource": "\u5C55\u5F00\u6216\u6536\u8D77\u8FD9\u5F20\u5361\u7247\u7684\u6E90\u7801",
      "aria.card": "\u7531 render_ui \u8C03\u7528\u6E32\u67D3\u7684\u4EA4\u4E92\u5361\u7247"
    };

    // client/src/render-ui-node.js
    function createRenderUiNodeDefinition() {
      return {
        kind: NODE_KIND,
        target: "chat",
        /**
         * Claim this call for our target.
         *
         * `exclusive` on the START is what removes the generic tool row; without it
         * both would render. The id is the callId, so a replayed session reuses the
         * same Context and a forked one starts a fresh node.
         *
         * THE RESULT IS DELIBERATELY **NOT** EXCLUSIVE. Making it exclusive was the
         * bug behind "every tool row turns amber and says interrupted": an exclusive
         * claim is not read by this definition alone — `dispatchInput` rejects EVERY
         * other non-exclusive definition on the same target
         * (`dsh-client-ui-conversation/lib/client.js:2838`). This `match` answers for
         * any `tool/result` that carries a callId, so it claimed the results of
         * pwsh, read, grep — every tool in the conversation. The host's own
         * `toolDefinition` (target `chat`, `dsh-client-ui-chat/lib/client.js:10388`)
         * therefore never folded a result into its row; once the step closed,
         * `interruption()` + `projectBlock` replaced the missing result with a
         * synthetic `{ isError: true, error: { code: 'interrupted' } }`
         * (`:10312`, `:10351`), which the row renders as `state: 'stopped'` and
         * paints with `--dsw-alias-state-warn-label`.
         *
         * Dropping `exclusive` here costs nothing: the START claim already kept the
         * host from creating a row for our call, so its result has no Context to
         * update, and `buildViewNode` returns null for an update-only one.
         */
        match(event) {
          if (event.type === "tool/call") {
            if (event.data?.name !== "render_ui") return null;
            return { id: String(event.data.callId), role: "start", exclusive: true };
          }
          if (event.type === "tool/result") {
            const callId = event.data?.message?.source?.callId;
            if (typeof callId !== "string") return null;
            return { id: callId, role: "update" };
          }
          return null;
        },
        start(_context, match) {
          if (match.event.type !== "tool/call") {
            throw new Error("render-ui node start requires tool/call");
          }
          const { callId, arguments: argsRaw } = match.event.data;
          const spec = readUiSpec(argsRaw);
          return {
            seq: match.event.seq,
            callId: String(callId),
            argsRaw: typeof argsRaw === "string" ? argsRaw : "",
            // `null` means "the payload is unreadable"; the view then renders the
            // invalid state rather than an empty card.
            spec,
            errorText: ""
          };
        },
        update(context, match) {
          if (match.event.type !== "tool/result") return context.state;
          const message = match.event.data.message;
          const isError = match.event.data.isError === true;
          return {
            ...context.state,
            errorText: isError ? contentText(message) : ""
          };
        },
        buildViewNode(context) {
          if (context.state === void 0) return null;
          const { seq, ...data } = context.state;
          return {
            key: context.key,
            kind: NODE_KIND,
            id: context.id,
            target: "chat",
            anchorSeq: seq,
            location: context.start?.location ?? { kind: "unresolved" },
            visibility: "visible",
            // Outside `process`: the card interrupts the fold instead of joining it.
            groupTree: "turn",
            data
          };
        }
      };
    }
    function contentText(message) {
      const content = Array.isArray(message?.content) ? message.content : [];
      return content.filter((part) => part !== null && typeof part === "object" && part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
    }

    // client/src/settings.js
    var STORAGE_KEY = PLUGIN_ID + ":titlePlacement";
    var PLACEMENTS = ["left", "above", "below"];
    var DEFAULT_PLACEMENT = "above";
    var SETTINGS_ROW_ID = PLUGIN_ID + "-title-placement";
    var PLACEMENT_LABELS = {
      left: "setting.titlePlacement.left",
      above: "setting.titlePlacement.above",
      below: "setting.titlePlacement.below"
    };
    var LEGACY_ALIASES = { inline: "left" };
    function readPlacement(storage) {
      if (storage === null || storage === void 0) return DEFAULT_PLACEMENT;
      let raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch {
        return DEFAULT_PLACEMENT;
      }
      if (Object.hasOwn(LEGACY_ALIASES, raw)) return LEGACY_ALIASES[raw];
      return PLACEMENTS.includes(raw) ? raw : DEFAULT_PLACEMENT;
    }
    function writePlacement(storage, placement) {
      if (storage === null || storage === void 0) return false;
      if (!PLACEMENTS.includes(placement)) return false;
      try {
        storage.setItem(STORAGE_KEY, placement);
        return true;
      } catch {
        return false;
      }
    }
    function createPlacementStore(storage) {
      let current = readPlacement(storage);
      const listeners = /* @__PURE__ */ new Set();
      return {
        getSnapshot() {
          return current;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        set(value) {
          if (!PLACEMENTS.includes(value) || value === current) return;
          current = value;
          writePlacement(storage, value);
          for (const listener of listeners) listener();
        },
        dispose() {
          listeners.clear();
        }
      };
    }

    // client/src/settings-row.js
    function createSettingsRow({ React: React2, primitives: primitives2 }) {
      const h = React2.createElement;
      const Menu = primitives2 === null ? null : primitives2.Menu;
      const MenuItemButton = primitives2 === null ? null : primitives2.MenuItemButton;
      const IconChevron = primitives2 === null ? null : primitives2.IconChevronDownOutlineRegular;
      const IconCheck = primitives2 === null ? null : primitives2.IconCheckOutlineRegular;
      function TitlePlacementRow(props) {
        const t = props.t;
        const current = props.useTitlePlacement((value) => value);
        const [open, setOpen] = React2.useState(false);
        const label = t("setting.titlePlacement");
        const choose = (value) => {
          props.setTitlePlacement(value);
          setOpen(false);
        };
        const title = h("div", { className: "dsh-genui-setting-title" }, label);
        const hint = h("div", { className: "dsh-genui-setting-hint" }, t("setting.titlePlacementHint"));
        const trigger = (isOpen) => h(
          "button",
          {
            type: "button",
            className: "dsh-genui-setting-trigger",
            "aria-label": label,
            "aria-haspopup": "menu",
            "aria-expanded": isOpen,
            onClick: () => setOpen(!isOpen)
          },
          h("span", { className: "dsh-genui-setting-value" }, t(PLACEMENT_LABELS[current])),
          IconChevron === null ? "\u25BE" : h(IconChevron, { size: 12 })
        );
        if (Menu === null || MenuItemButton === null) {
          return h(
            "div",
            { className: "dsh-genui-setting-row" },
            h("div", null, title, hint),
            h("select", {
              className: "dsh-genui-setting-select",
              "aria-label": label,
              value: current,
              onChange: (event) => props.setTitlePlacement(event.target.value)
            }, PLACEMENTS.map((value) => h("option", { key: value, value }, t(PLACEMENT_LABELS[value]))))
          );
        }
        const items = PLACEMENTS.map((value) => h(MenuItemButton, {
          key: value,
          onSelect: () => choose(value)
        }, h(
          "span",
          { className: "dsh-genui-setting-item" },
          h("span", null, t(PLACEMENT_LABELS[value])),
          value === current && IconCheck !== null ? h("span", { className: "dsh-genui-setting-check" }, h(IconCheck, { size: 14 })) : null
        )));
        return h(
          "div",
          { className: "dsh-genui-setting-row" },
          h("div", null, title, hint),
          h(Menu, {
            open,
            // A FACTORY, not the element itself: the menu renders the anchor once,
            // and it needs the current `open` to set `aria-expanded` correctly.
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
      return TitlePlacementRow;
    }

    // client/src/lifecycle.js
    function createConversationBridge(ctx, sessionId) {
      const sessions = typeof ctx.get === "function" ? ctx.get("sessions") : void 0;
      if (sessions === void 0 || typeof sessions.scope !== "function") return null;
      let scoped;
      try {
        scoped = sessions.scope(sessionId);
      } catch {
        return null;
      }
      if (scoped === void 0 || typeof scoped.get !== "function") return null;
      const conversation = scoped.get("conversation");
      if (conversation === void 0 || typeof conversation.send !== "function") return null;
      return async function sendMessage(text) {
        const message = typeof text === "string" ? text.trim() : "";
        if (message === "") throw new Error("interact() needs a non-empty message");
        await conversation.send(message);
      };
    }
    function createLifecycle({ React: React2, toolName, primitives: primitives2 }) {
      const Card = createCard({ React: React2, toolName, tryCompile: tryCompileCard, readSpec: readUiSpec });
      const SettingsRow = createSettingsRow({ React: React2, primitives: primitives2 });
      return function apply2(ctx) {
        ctx.effect(() => {
          return ctx.locale.register(LOCALE_NS, { en, zh });
        }, "dsh-genui: card strings");
        ctx.effect(
          () => installCardCss(typeof document === "undefined" ? void 0 : document),
          "dsh-genui: card stylesheet"
        );
        const uiConversation = ctx.uiConversation;
        if (typeof uiConversation?.events?.register === "function") {
          ctx.effect(
            () => uiConversation.events.register(createRenderUiNodeDefinition()),
            "dsh-genui: render_ui answer node"
          );
        }
        const placementStore = createPlacementStore(
          typeof localStorage === "undefined" ? void 0 : localStorage
        );
        ctx.effect(() => () => placementStore.dispose(), "dsh-genui: title placement store");
        ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
          name: "conversation.chat.node",
          key: NODE_KIND,
          locale: LOCALE_NS,
          inject: (sessionId) => {
            const sendMessage = createConversationBridge(ctx, sessionId);
            return {
              ...sendMessage === null ? {} : { sendMessage },
              // The store ITSELF, not a `hooks` entry.
              //
              // `hooks: { name: store }` makes the framework build a
              // `useName(selector)` prop for the OCCUPANT, and a plain function
              // component that reads props never receives it — so the setting
              // appeared to do nothing to cards already on screen. Passing the store
              // lets the card call React.useSyncExternalStore directly, which React
              // guarantees and which the card can also be tested for.
              titlePlacementStore: placementStore
            };
          }
        }, Card));
        ctx.slots.inject("settings.general.item", () => ctx.slots.register({
          name: "settings.general.item",
          id: SETTINGS_ROW_ID,
          order: 42,
          locale: LOCALE_NS,
          inject: () => ({
            hooks: { titlePlacement: placementStore },
            setTitlePlacement: (value) => placementStore.set(value)
          })
        }, SettingsRow));
        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          key: toolName,
          locale: LOCALE_NS,
          // A card that can only be READ is a picture. The host's own composer sends
          // through `conversation.send`, addressed by session scope; the card gets
          // that same capability as `interact(text)` inside the snippet, so a button
          // the model drew can answer the model.
          //
          // WHY THE LOOKUP IS HERE AND NOT IN THE COMPONENT. The `inject` factory
          // runs in the plugin's `apply` world with the session id already resolved,
          // which is the only place `sessions.scope(id)` is legal. A component cannot
          // reach a service; it can only receive one.
          inject: (sessionId) => {
            const sendMessage = createConversationBridge(ctx, sessionId);
            return sendMessage === null ? {} : { sendMessage };
          }
        }, Card));
      };
    }

    // client/src/index.js
    var name = PLUGIN_ID;
    var inject = ["slots", "locale", "uiConversation"];
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
    } : createLifecycle({ React, toolName: TOOL_NAME, primitives });
    return module.exports
  },
})
