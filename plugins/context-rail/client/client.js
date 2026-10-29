/**
 * dsh-context-rail client bundle.
 *
 * WHAT IT IS. A session rail that lives INSIDE the conversation page, the way
 * Claude Code's session rail does: a toggle in the conversation header's
 * utility row, a fixed-width column at the conversation column's right edge,
 * auto-opened once the window is wide enough.
 *
 * WHY NOT THE HOST'S RIGHT SIDEBAR. That column already has an occupant model
 * (tabs, splits, floats) and it is where file previews, the file tree, the
 * browser and terminals open. Putting the rail there would make it compete for
 * the same space and would close whenever a file preview opened. This rail lives
 * inside the conversation column instead and reserves its width with padding.
 *
 * WHERE THE NUMBERS COME FROM. The toggle is registered in a session-scoped
 * slot, so the framework hands it the standard `useProjection` and `useSessions`
 * hooks. Those read the host's live projection store: `contextPressure`,
 * `contextBreakdown`, `tokenUsage`, `modelSelection`, `workingDirectory`,
 * `title`. Nothing is recomputed from logs and nothing polls.
 *
 * GEOMETRY. The rail is positioned from the measured rectangle of the
 * conversation scroller, shifted left by the scroller's own scrollbar gutter, so
 * the scrollbar stays outside the rail. When the native right sidebar opens the
 * conversation column shrinks, the measurement shrinks with it, and the rail
 * follows. The only condition that hides it is a column too narrow to hold the
 * rail plus a readable text column.
 */

window.__ModuleLoader__.load({
  id: "@hwfee/dsh-context-rail",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
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
      AUTO_OPEN_MIN_WIDTH: () => AUTO_OPEN_MIN_WIDTH,
      MIN_CONTENT_WIDTH: () => MIN_CONTENT_WIDTH,
      RAIL_WIDTH: () => RAIL_WIDTH,
      STORAGE_KEY: () => STORAGE_KEY,
      apply: () => apply,
      composerInset: () => composerInset,
      inject: () => inject,
      railFits: () => railFits
    });
    module.exports = __toCommonJS(index_exports);

    // client/src/geometry.js
    var RAIL_WIDTH = 328;
    var AUTO_OPEN_MIN_WIDTH = 1180;
    var MIN_CONTENT_WIDTH = 240;
    function railFits(columnWidth) {
      return typeof columnWidth === "number" && columnWidth >= RAIL_WIDTH + MIN_CONTENT_WIDTH;
    }
    function composerInset(scrollbarWidth) {
      const bar = typeof scrollbarWidth === "number" && scrollbarWidth > 0 ? scrollbarWidth : 0;
      return RAIL_WIDTH + bar;
    }

    // client/src/format.js
    function formatTokens(value) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "\u2014";
      const scaled = (candidate) => candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
      if (value < 1e3) return String(Math.round(value));
      if (value < 1e6) return scaled(value / 1e3) + "k";
      return scaled(value / 1e6) + "M";
    }
    function occupancy(pressure) {
      const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens;
      const contextWindow = pressure?.contextWindow;
      if (typeof usedTokens !== "number" || typeof contextWindow !== "number" || contextWindow <= 0) {
        return null;
      }
      const ratio = Math.max(0, Math.min(1, usedTokens / contextWindow));
      return {
        ratio,
        percent: Math.round(ratio * 100),
        freePercent: Math.round((1 - ratio) * 1e3) / 10,
        usedTokens,
        contextWindow,
        freeTokens: Math.max(0, contextWindow - usedTokens)
      };
    }
    function bandShares(breakdown, context) {
      if (!breakdown || !context) return [];
      const rows = [
        { key: "system", tokens: breakdown.systemTokens },
        { key: "tools", tokens: breakdown.toolsTokens },
        { key: "messages", tokens: breakdown.messageTokens }
      ].filter((row) => typeof row.tokens === "number" && row.tokens > 0);
      const total = rows.reduce((sum, row) => sum + row.tokens, 0);
      if (total <= 0) return [];
      const bands = rows.map((row) => {
        const share = context.ratio * (row.tokens / total);
        return {
          key: row.key,
          tokens: row.tokens,
          share,
          percent: Math.round(share * 1e3) / 10
        };
      });
      const occupied = Math.round(context.ratio * 1e3) / 10;
      let printed = 0;
      bands.forEach((band, index) => {
        if (index === bands.length - 1) {
          band.percent = Math.max(0, Math.round((occupied - printed) * 10) / 10);
        }
        printed = Math.round((printed + band.percent) * 10) / 10;
      });
      return bands;
    }
    function usageTotals(usage) {
      if (!usage) return null;
      const rows = [
        { key: "input", tokens: usage.uncachedInputTokens },
        { key: "output", tokens: usage.outputTokens },
        { key: "cacheRead", tokens: usage.cacheReadTokens },
        { key: "cacheWrite", tokens: usage.cacheWriteTokens }
      ].filter((row) => typeof row.tokens === "number" && row.tokens >= 0);
      const total = rows.reduce((sum, row) => sum + row.tokens, 0);
      return { total, rows };
    }
    function leafOf(cwd) {
      if (typeof cwd !== "string" || cwd === "") return "\u2014";
      const parts = cwd.replace(/[\\/]+$/, "").split(/[\\/]/);
      return parts[parts.length - 1] || cwd;
    }
    function formatPercent(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "\u2014";
      return String(Math.round(value * 10) / 10) + "%";
    }

    // client/src/panel.js
    var FALLBACK = {
      "environment.title": "\u73AF\u5883",
      "environment.directory": "\u76EE\u5F55",
      "environment.model": "\u6A21\u578B",
      "environment.session": "\u4F1A\u8BDD",
      "environment.state": "\u72B6\u6001",
      "environment.running": "\u56DE\u590D\u4E2D",
      "environment.idle": "\u7A7A\u95F2",
      "context.title": "\u4E0A\u4E0B\u6587",
      "context.used": "\u5DF2\u7528",
      "context.free": "\u5269\u4F59",
      "context.system": "\u7CFB\u7EDF\u63D0\u793A",
      "context.tools": "\u5DE5\u5177",
      "context.messages": "\u6D88\u606F",
      "context.empty": "\u8FD8\u6CA1\u6709\u4E0A\u4E0B\u6587\u6570\u636E\uFF0C\u53D1\u51FA\u7B2C\u4E00\u6761\u6D88\u606F\u540E\u51FA\u73B0\u3002",
      "usage.title": "\u7528\u91CF",
      "usage.total": "\u5408\u8BA1",
      "usage.input": "\u8F93\u5165",
      "usage.output": "\u8F93\u51FA",
      "usage.cacheRead": "\u7F13\u5B58\u8BFB",
      "usage.cacheWrite": "\u7F13\u5B58\u5199",
      "usage.empty": "\u672C\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u4EA7\u751F\u7528\u91CF\u3002"
    };
    function translator(t) {
      if (typeof t === "function") return t;
      return (key) => FALLBACK[key] ?? key;
    }
    function pct(value) {
      return String(Math.round(value * 100) / 100) + "%";
    }
    function createPanel({ React: React2 }) {
      const h = React2.createElement;
      function Card({ id, title, meta, children }) {
        const [open, setOpen] = React2.useState(true);
        return h(
          "section",
          {
            className: "dcr-card",
            "data-dcr-card": id,
            "data-collapsed": open ? void 0 : "true"
          },
          h(
            "button",
            {
              type: "button",
              className: "dcr-head",
              "aria-expanded": open,
              onClick: () => setOpen(!open)
            },
            h("span", { className: "dcr-title" }, title),
            h("span", { className: "dcr-spacer" }),
            meta === void 0 ? null : h("span", { className: "dcr-head-meta" }, meta),
            h("svg", {
              className: "dcr-chevron",
              width: 12,
              height: 12,
              viewBox: "0 0 12 12",
              "aria-hidden": true
            }, h("path", {
              d: "M3 4.5 6 7.5 9 4.5",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.4,
              strokeLinecap: "round",
              strokeLinejoin: "round"
            }))
          ),
          open ? h("div", { className: "dcr-body" }, children) : null
        );
      }
      function Row({ band, label, value, percent, title }) {
        return h(
          "div",
          { className: "dcr-row" },
          h(
            "dt",
            null,
            band === void 0 ? null : h("span", { className: "dcr-swatch", "data-band": band }),
            h("span", { className: "dcr-value-label" }, label)
          ),
          h(
            "dd",
            { className: "dcr-value", title: title ?? (typeof value === "string" ? value : void 0) },
            h(
              "span",
              null,
              typeof value === "string" || typeof value === "number" ? String(value) : value ?? "\u2014"
            ),
            percent === void 0 ? null : h("span", { className: "dcr-pct" }, percent)
          )
        );
      }
      function EnvironmentCard({ props, t }) {
        const rows = [
          { key: "directory", label: t("environment.directory"), value: leafOf(props.cwd), title: props.cwd ?? void 0 },
          { key: "model", label: t("environment.model"), value: props.model || "\u2014" },
          { key: "session", label: t("environment.session"), value: props.title || "\u2014", title: props.title ?? void 0 },
          { key: "state", label: t("environment.state"), value: props.running ? t("environment.running") : t("environment.idle") }
        ];
        return h(
          Card,
          { id: "environment", title: t("environment.title") },
          h(
            "dl",
            { className: "dcr-rows" },
            rows.map((row) => h(Row, {
              key: row.key,
              label: row.label,
              value: row.value,
              title: row.title
            }))
          )
        );
      }
      function ContextCard({ props, t }) {
        const context = occupancy(props.pressure);
        const bands = bandShares(props.breakdown, context);
        if (context === null) {
          return h(
            Card,
            { id: "context", title: t("context.title") },
            h("p", { className: "dcr-empty" }, t("context.empty"))
          );
        }
        const occupiedWidth = context.ratio * 100;
        const freeWidth = Math.max(0, 100 - occupiedWidth);
        const segments = bands.length === 0 ? [h("div", { key: "total", className: "dcr-seg", "data-band": "total", style: { width: pct(occupiedWidth) } })] : bands.map((band) => h("div", {
          key: band.key,
          className: "dcr-seg",
          "data-band": band.key,
          style: { width: pct(band.share * 100) }
        }));
        if (freeWidth > 0) {
          segments.push(h("div", {
            key: "free",
            className: "dcr-seg",
            "data-band": "free",
            style: { width: pct(freeWidth) }
          }));
        }
        const rows = bands.map((band) => h(Row, {
          key: band.key,
          band: band.key,
          label: t("context." + band.key),
          value: "~" + formatTokens(band.tokens),
          percent: formatPercent(band.percent)
        }));
        rows.push(h(Row, {
          key: "free",
          band: "free",
          label: t("context.free"),
          value: formatTokens(context.freeTokens),
          percent: formatPercent(context.freePercent)
        }));
        return h(
          Card,
          {
            id: "context",
            title: t("context.title"),
            meta: context.percent + "% " + t("context.used")
          },
          h(
            "div",
            { className: "dcr-figures" },
            h("span", null, "~" + formatTokens(context.usedTokens) + " / " + formatTokens(context.contextWindow))
          ),
          h("div", { className: "dcr-bar", "data-dcr-bar": "context" }, segments),
          h("dl", { className: "dcr-rows" }, rows)
        );
      }
      function UsageCard({ props, t }) {
        const totals = usageTotals(props.usage);
        if (totals === null || totals.total === 0) {
          return h(
            Card,
            { id: "usage", title: t("usage.title") },
            h("p", { className: "dcr-empty" }, t("usage.empty"))
          );
        }
        const rows = totals.rows.map((row) => h(Row, {
          key: row.key,
          label: t("usage." + row.key),
          value: formatTokens(row.tokens)
        }));
        rows.push(h(Row, { key: "total", label: t("usage.total"), value: formatTokens(totals.total) }));
        return h(
          Card,
          { id: "usage", title: t("usage.title") },
          h("dl", { className: "dcr-rows" }, rows)
        );
      }
      function Panel2(props) {
        const t = translator(props.t);
        return h(
          "div",
          { className: "dcr-root", "data-dcr-root": true },
          h(EnvironmentCard, { props, t }),
          h(ContextCard, { props, t }),
          h(UsageCard, { props, t })
        );
      }
      return { Panel: Panel2 };
    }

    // client/src/styles.js
    var STYLE_ID = "@hwfee/dsh-context-rail/rail.css";
    var CSS = `
    .dcr-toggle {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: var(--dsw-radius-sm, 6px);
      background: none;
      color: var(--dsw-alias-label-secondary);
      cursor: pointer;
    }

    .dcr-toggle:hover,
    .dcr-toggle[aria-pressed="true"] {
      background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary);
    }

    .dcr-toggle:focus-visible {
      outline: 2px solid var(--dsw-alias-border-focus, var(--dsw-alias-border-l3));
      outline-offset: 2px;
    }

    body[data-dcr-open="true"] [data-conversation-scroll] {
      padding-right: var(--dcr-rail-width, 328px);
    }

    /*
     * The trajectory view mounts a composer overlay and the host turns the composer
     * seat into an absolutely positioned box (left 0, right the scrollbar width).
     * An absolutely positioned box is not constrained by the scroller's padding, so
     * without this rule the input card slides under the rail. The seat is positioned
     * against the scroller's padding box, hence the rail plus the scrollbar gutter.
     */
    body[data-dcr-open="true"] [data-conversation-scroll]:has([data-conversation-composer-overlay]) > [data-composer-seat] {
      right: var(--dcr-composer-inset, calc(var(--dsh-scrollbar-width, 5px) + var(--dcr-rail-width, 328px))) !important;
    }

    .dcr-rail {
      box-sizing: border-box;
      position: fixed;
      right: calc(var(--dsh-scrollbar-width, 5px) + 2px);
      z-index: 3;
      display: flex;
      flex-direction: column;
      width: 328px;
      min-height: 0;
      overflow: hidden;
      background: var(--dsw-alias-bg-base);
    }

    .dcr-root {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 12px 12px 20px;
      font-family: var(--dsw-font-family);
      font-size: 12px;
      line-height: 18px;
      color: var(--dsw-alias-label-secondary);
      scrollbar-width: thin;
    }

    .dcr-card {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 9px;
      padding: 12px 12px 14px;
      border: .5px solid var(--dsw-alias-border-l3);
      border-radius: var(--dsw-radius-lg, 12px);
      background: color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent);
    }

    .dcr-head {
      display: flex;
      align-items: center;
      gap: 6px;
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      padding: 0;
      background: none;
      border: 0;
      border-radius: 0;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }

    .dcr-head:focus-visible {
      outline: 2px solid var(--dsw-alias-border-focus, var(--dsw-alias-border-l3));
      outline-offset: 4px;
      border-radius: var(--dsw-radius-sm, 4px);
    }

    .dcr-title {
      font-weight: 600;
      font-size: 12px;
      line-height: 18px;
      letter-spacing: 0.01em;
      color: var(--dsw-alias-label-primary);
    }

    .dcr-spacer { flex: 1 1 auto; }

    .dcr-head-meta {
      flex: none;
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      line-height: 16px;
      color: var(--dsw-alias-label-tertiary);
    }

    .dcr-chevron {
      flex: none;
      margin-left: 2px;
      color: var(--dsw-alias-label-tertiary);
      transition: transform 140ms ease;
    }

    .dcr-card[data-collapsed="true"] .dcr-chevron { transform: rotate(-90deg); }

    .dcr-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .dcr-figures {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
      gap: 10px;
      margin-bottom: 2px;
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      line-height: 16px;
      color: var(--dsw-alias-label-tertiary);
    }

    .dcr-bar {
      display: flex;
      gap: 1px;
      height: 4px;
      margin: 1px 0 6px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--dsw-alias-interactive-bg-hover);
    }

    .dcr-seg {
      flex: none;
      height: 100%;
      min-width: 1px;
      border-radius: 1px;
      background: var(--dcr-tint, var(--dsw-alias-label-tertiary));
    }

    .dcr-seg[data-band="system"] { --dcr-tint: var(--dsw-static-neutral-bluish-400, #9aa0a6); }
    .dcr-seg[data-band="tools"] { --dcr-tint: #a78bfa; }
    .dcr-seg[data-band="messages"] { --dcr-tint: var(--dsw-static-blue-450, #3b82f6); }
    .dcr-seg[data-band="free"] { --dcr-tint: transparent; flex: 1 1 auto; }

    .dcr-rows {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin: 0;
    }

    .dcr-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 21px;
    }

    .dcr-row dt {
      display: flex;
      align-items: center;
      gap: 7px;
      margin: 0;
      min-width: 0;
      color: var(--dsw-alias-label-secondary);
    }

    .dcr-row dd {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
      gap: 10px;
      margin: 0;
      flex: none;
      font-variant-numeric: tabular-nums;
      color: var(--dsw-alias-label-primary);
      text-align: right;
    }

    .dcr-pct {
      flex: none;
      min-width: 42px;
      font-size: 11px;
      color: var(--dsw-alias-label-tertiary);
    }

    .dcr-swatch {
      display: inline-block;
      flex: none;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--dcr-tint, var(--dsw-alias-label-tertiary));
    }

    .dcr-swatch[data-band="system"] { --dcr-tint: var(--dsw-static-neutral-bluish-400, #9aa0a6); }
    .dcr-swatch[data-band="tools"] { --dcr-tint: #a78bfa; }
    .dcr-swatch[data-band="messages"] { --dcr-tint: var(--dsw-static-blue-450, #3b82f6); }
    .dcr-swatch[data-band="free"] { --dcr-tint: var(--dsw-alias-border-l3); }

    .dcr-value {
      max-width: 62%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dcr-empty {
      margin: 0;
      color: var(--dsw-alias-label-tertiary);
      font-size: 11px;
      line-height: 16px;
    }

    `;
    function installCss() {
      if (typeof document === "undefined") return () => {
      };
      const existing = document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]');
      if (existing !== null) return () => {
      };
      const tag = document.createElement("style");
      tag.dataset.plugin = "@hwfee/dsh-context-rail";
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => {
        if (tag.parentNode !== null) tag.parentNode.removeChild(tag);
      };
    }

    // client/src/locales.js
    var NS = "contextRail";
    var zh = {
      "toggle.title": "\u4E0A\u4E0B\u6587\u4FA7\u680F",
      "tab.title": "\u4E0A\u4E0B\u6587",
      "guide.title": "\u4E0A\u4E0B\u6587\u4E0E\u73AF\u5883",
      "guide.description": "\u5F53\u524D\u4F1A\u8BDD\u7684\u76EE\u5F55\u3001\u6A21\u578B\u3001\u4E0A\u4E0B\u6587\u5360\u7528\u4E0E\u7528\u91CF",
      "environment.title": "\u73AF\u5883",
      "environment.directory": "\u76EE\u5F55",
      "environment.model": "\u6A21\u578B",
      "environment.session": "\u4F1A\u8BDD",
      "environment.state": "\u72B6\u6001",
      "environment.running": "\u56DE\u590D\u4E2D",
      "environment.idle": "\u7A7A\u95F2",
      "context.title": "\u4E0A\u4E0B\u6587",
      "context.used": "\u5DF2\u7528",
      "context.free": "\u5269\u4F59",
      "context.system": "\u7CFB\u7EDF\u63D0\u793A",
      "context.tools": "\u5DE5\u5177",
      "context.messages": "\u6D88\u606F",
      "context.empty": "\u8FD8\u6CA1\u6709\u4E0A\u4E0B\u6587\u6570\u636E\uFF0C\u53D1\u51FA\u7B2C\u4E00\u6761\u6D88\u606F\u540E\u51FA\u73B0\u3002",
      "usage.title": "\u7528\u91CF",
      "usage.total": "\u5408\u8BA1",
      "usage.input": "\u8F93\u5165",
      "usage.output": "\u8F93\u51FA",
      "usage.cacheRead": "\u7F13\u5B58\u8BFB",
      "usage.cacheWrite": "\u7F13\u5B58\u5199",
      "usage.empty": "\u672C\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u4EA7\u751F\u7528\u91CF\u3002"
    };
    var en = {
      "toggle.title": "Context rail",
      "tab.title": "Context",
      "guide.title": "Context & environment",
      "guide.description": "Directory, model, context occupancy and usage of this session",
      "environment.title": "Environment",
      "environment.directory": "Directory",
      "environment.model": "Model",
      "environment.session": "Session",
      "environment.state": "State",
      "environment.running": "Running",
      "environment.idle": "Idle",
      "context.title": "Context",
      "context.used": "used",
      "context.free": "Free",
      "context.system": "System prompt",
      "context.tools": "Tools",
      "context.messages": "Messages",
      "context.empty": "No context data yet. It appears after the first message.",
      "usage.title": "Usage",
      "usage.total": "Total",
      "usage.input": "Input",
      "usage.output": "Output",
      "usage.cacheRead": "Cache read",
      "usage.cacheWrite": "Cache write",
      "usage.empty": "This session has not spent any tokens yet."
    };

    // client/src/index.js
    var React = null;
    var ReactDOM = null;
    try {
      React = require("react");
      ReactDOM = require("react-dom");
    } catch (error) {
      React = null;
      ReactDOM = null;
    }
    var inject = ["slots", "locale"];
    var STORAGE_KEY = "dsh-context-rail/open";
    function readStored() {
      try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        return value === "1" ? true : value === "0" ? false : null;
      } catch (error) {
        return null;
      }
    }
    function writeStored(open) {
      try {
        window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
      } catch (error) {
      }
    }
    function wideEnough() {
      return typeof window !== "undefined" && window.innerWidth >= AUTO_OPEN_MIN_WIDTH;
    }
    var Panel = React === null ? null : createPanel({ React }).Panel;
    var RailBoundary = class extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error) {
        console.error("dsh-context-rail: rail render failed", error);
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    };
    function RailIcon() {
      return React.createElement(
        "svg",
        {
          width: 16,
          height: 16,
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.3,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": true
        },
        React.createElement("rect", { x: 2.25, y: 2.75, width: 11.5, height: 10.5, rx: 2 }),
        React.createElement("path", { d: "M10 3v10" })
      );
    }
    function RailToggle(props) {
      const { sessionId, useProjection, useSessions } = props;
      const t = typeof props.t === "function" ? props.t : translator(void 0);
      const projection = typeof useProjection === "function" ? useProjection : () => void 0;
      const sessions = typeof useSessions === "function" ? useSessions : () => void 0;
      const [stored, setStored] = React.useState(readStored);
      const [wide, setWide] = React.useState(wideEnough);
      const [geometry, setGeometry] = React.useState(null);
      const wanted = stored === null ? wide : stored;
      React.useEffect(() => {
        const update = () => setWide(wideEnough());
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
      }, []);
      React.useEffect(() => {
        if (!wanted) {
          setGeometry(null);
          return void 0;
        }
        let cancelled = false;
        let retry = null;
        let stopWatching = () => {
        };
        const start = () => {
          if (cancelled) return;
          const content = document.querySelector("[data-conversation-content]");
          if (content === null) {
            retry = window.setTimeout(start, 300);
            return;
          }
          const scroller = content.querySelector("[data-conversation-scroll]");
          const measure = () => {
            const rect = content.getBoundingClientRect();
            const scroll = scroller === null ? null : scroller.getBoundingClientRect();
            const bar = scroller === null ? 0 : Math.max(0, scroller.offsetWidth - scroller.clientWidth);
            setGeometry({
              top: Math.max(0, rect.top),
              height: Math.max(0, rect.height),
              width: Math.max(0, (scroll === null ? rect : scroll).width),
              right: Math.max(0, window.innerWidth - (scroll === null ? rect.right : scroll.right) + bar),
              inset: composerInset(bar)
            });
          };
          measure();
          const observer = new ResizeObserver(measure);
          observer.observe(content);
          if (scroller !== null) observer.observe(scroller);
          window.addEventListener("resize", measure);
          stopWatching = () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
          };
        };
        start();
        return () => {
          cancelled = true;
          if (retry !== null) window.clearTimeout(retry);
          stopWatching();
        };
      }, [wanted]);
      const visible = wanted && geometry !== null && railFits(geometry.width);
      const composerRight = geometry === null ? null : geometry.inset;
      React.useEffect(() => {
        if (!visible) return void 0;
        const body = document.body;
        body.dataset.dcrOpen = "true";
        body.style.setProperty("--dcr-rail-width", RAIL_WIDTH + "px");
        if (typeof composerRight === "number") {
          body.style.setProperty("--dcr-composer-inset", composerRight + "px");
        }
        return () => {
          delete body.dataset.dcrOpen;
          body.style.removeProperty("--dcr-rail-width");
          body.style.removeProperty("--dcr-composer-inset");
        };
      }, [visible, composerRight]);
      const pressure = projection("contextPressure");
      const breakdown = projection("contextBreakdown");
      const usage = projection("tokenUsage");
      const projectedTitle = projection("title");
      const projectedCwd = projection("workingDirectory");
      const modelSelection = projection("modelSelection");
      const row = sessions((state) => sessionId === void 0 ? void 0 : state?.byId?.[sessionId]);
      const model = modelSelection?.lastUsed?.model ?? modelSelection?.next?.model;
      const toggle = React.createElement("button", {
        type: "button",
        className: "dcr-toggle",
        "data-dcr-toggle": true,
        "aria-pressed": wanted,
        "aria-label": t("toggle.title"),
        title: t("toggle.title"),
        onClick: () => {
          const next = !wanted;
          setStored(next);
          writeStored(next);
        }
      }, React.createElement(RailIcon));
      if (!visible) return toggle;
      const rail = React.createElement("aside", {
        className: "dcr-rail",
        "data-dcr-rail": true,
        style: {
          width: RAIL_WIDTH + "px",
          top: geometry.top + "px",
          right: geometry.right + "px",
          height: geometry.height + "px"
        }
      }, React.createElement(Panel, {
        pressure,
        breakdown,
        usage,
        model: typeof model === "string" ? model : "",
        cwd: typeof projectedCwd === "string" && projectedCwd !== "" ? projectedCwd : row?.cwd,
        title: typeof projectedTitle === "string" && projectedTitle !== "" ? projectedTitle : row?.displayTitle,
        running: row?.running === true,
        t
      }));
      return React.createElement(
        React.Fragment,
        null,
        toggle,
        React.createElement(RailBoundary, null, ReactDOM.createPortal(rail, document.body))
      );
    }
    function apply(ctx) {
      if (React === null || ReactDOM === null) {
        console.warn("dsh-context-rail: react/react-dom unavailable; rail not registered");
        return;
      }
      if (!ctx || !ctx.slots) {
        console.warn("dsh-context-rail: slots service unavailable; rail not registered");
        return;
      }
      const t = typeof ctx.locale?.bind === "function" ? ctx.locale.bind(NS) : translator(void 0);
      if (ctx.locale && typeof ctx.locale.register === "function") {
        ctx.effect(function() {
          return ctx.locale.register(NS, { zh, en });
        }, "dsh-context-rail: dictionaries");
      }
      ctx.effect(() => installCss(), "dsh-context-rail: rail styles");
      ctx.effect(() => ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
        name: "conversation.session.header.utilities",
        id: "context-rail",
        order: 10,
        locale: NS
      }, RailToggle)), "dsh-context-rail: header toggle");
    }
    return module.exports
  },
})
