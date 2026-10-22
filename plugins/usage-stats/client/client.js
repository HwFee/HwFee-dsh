/**
 * dsh-usage-stats client bundle.
 *
 * Sources live in `client/src/`; `npm run build` bundles them into
 * `client/client.js` in the host's module-loader format
 * (`window.__ModuleLoader__.load`).
 *
 * WHAT IT DOES: renders one panel on the blank-session hero — the screen the
 * user lands on when they click "New Session", below the "Into the Unknown"
 * headline and above the composer. The panel carries six numbers (sessions,
 * messages, total tokens, active days, peak hour, favourite model), an activity
 * heatmap, and one line comparing the token spend against a Chinese novel.
 *
 * WHERE THE NUMBERS COME FROM: the Host half aggregates the session logs under
 * `~/.dsh/sessions` and serves them at `/dsh-usage-stats/summary`. The browser
 * cannot read those files and the logs are zstd-framed, so this is a Node job.
 * The panel is pure presentation; all the arithmetic the user sees (ranges,
 * formatting, the heatmap grid, the book comparison) lives in `stats.js` and is
 * unit-tested without a DOM.
 *
 * WHEN IT SHOWS: only while the conversation is blank — the same predicate the
 * host uses to draw the hero itself (`session.blank && !session.running &&
 * !session.promptAttempted`). Once the first turn starts the panel is gone, so
 * it never clutters an active conversation.
 *
 * HOW IT LOADS: the summary is fetched through one shared short-TTL cache
 * (`summary-cache.js`). Reopening the panel — which happens on every blank
 * session — paints the last answer immediately from `peek()` and only asks the
 * browser/Host again when the cached copy is stale; an ordinary open never sends
 * `?refresh=1`, so the Host's persistent per-file cache stays useful. The Host
 * marks a response `stale` when it reused a parse for a log that was still being
 * written; the panel then asks again once with `{ refresh: true }` (incremental,
 * not forced), so a transient undercount corrects itself without user action.
 *
 * SETTINGS ROWS: the plugin contributes TWO entries that moved together to the
 * 主题定制 / Theme page (`settings.appearance.item`, hosted by cds-theme) with a
 * bounded-wait fallback to General (`settings.general.item`): the panel body
 * height (id `dsh-usage-stats-panel-height`, order 40) and the number-unit mode
 * (id `dsh-usage-stats-units`, order 41). The policy and its tests live in
 * `settings-slot.js`. The height lives in localStorage
 * (`dsh-usage-stats/settings`), is clamped to the slider's 240–520 px range, and
 * reaches the stylesheet as the `--dus-body-height` custom property that the
 * shared tab body `.dus-body` consumes — a drag resizes BOTH tabs live. The
 * unit mode (`auto` | `short` | `myriad`) is stored beside it; `auto` is
 * resolved per render from the active locale, and every number the panel prints
 * — cards, model rows, heatmap text and aria text, book line — goes through the
 * same formatter (`stats.formatNumber`), so a mode or language switch
 * re-formats the whole panel without a reload.
 */

window.__ModuleLoader__.load({
  id: "@hwfee/dsh-usage-stats",
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
    var PLUGIN_ID = "@hwfee/dsh-usage-stats";
    var USAGE_PATH = "/dsh-usage-stats/summary";
    var USAGE_MARKER_HEADER = "x-dsh-usage-stats";
    var USAGE_MARKER_VALUE = "1";
    var STORAGE_KEY = "dsh-usage-stats/settings";
    var STYLE_ROW_ID = "dsh-usage-stats-panel-style";
    var STYLE_ROW_ORDER = 39;
    var UNITS_ROW_ID = "dsh-usage-stats-units";
    var UNITS_ROW_ORDER = 41;
    var RANGES = [
      { id: "all", days: 0 },
      { id: "30d", days: 30 },
      { id: "7d", days: 7 }
    ];
    var DEFAULT_STATE = {
      range: "all",
      tab: "overview"
    };

    // client/src/input-budget.js
    var INPUT_BUDGET_VAR = "--dus-input-budget";
    var CARD_ATTR = "data-dus-input-budget";
    var SCROLL_ATTR = "data-dus-hero-scroll";
    var HOST_TEXT_MAX = 336;
    var SINGLE_LINE_FALLBACK = 36;
    var SINGLE_LINE_MAX = 56;
    var BUDGET_RESERVE = 12;
    function inputBudgetFor(spec) {
      const source = spec && typeof spec === "object" ? spec : {};
      const ceiling = Number.isFinite(source.ceiling) ? source.ceiling : HOST_TEXT_MAX;
      const fallbackFloor = Number.isFinite(source.floor) ? source.floor : SINGLE_LINE_FALLBACK;
      const floor = Math.min(fallbackFloor, ceiling);
      const available = Number(source.available);
      if (!Number.isFinite(available) || available <= 0) return ceiling;
      const chrome = Math.max(0, Number(source.chrome) || 0);
      const reserve = Number.isFinite(source.reserve) ? source.reserve : BUDGET_RESERVE;
      const raw = Math.floor(available - chrome - reserve);
      if (!Number.isFinite(raw)) return ceiling;
      return Math.max(floor, Math.min(ceiling, raw));
    }
    function lineFloorFor(spec) {
      const source = spec && typeof spec === "object" ? spec : {};
      const lineHeight = Number(source.lineHeight);
      const top = Number(source.paddingTop);
      const bottom = Number(source.paddingBottom);
      const padding = (Number.isFinite(top) ? Math.max(0, top) : 0) + (Number.isFinite(bottom) ? Math.max(0, bottom) : 0);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        return Math.round(clamp(SINGLE_LINE_FALLBACK + padding, SINGLE_LINE_FALLBACK, SINGLE_LINE_MAX));
      }
      const extra = padding > 0 ? padding : 8;
      return Math.round(clamp(lineHeight + extra, SINGLE_LINE_FALLBACK, SINGLE_LINE_MAX));
    }
    function clamp(value, low, high) {
      return Math.max(low, Math.min(high, value));
    }
    function chromeFrom(spec) {
      const source = spec && typeof spec === "object" ? spec : {};
      const stack = Math.max(0, Number(source.stackHeight) || 0);
      const text = Math.max(0, Number(source.textPortHeight) || 0);
      if (stack <= 0) return 0;
      return Math.max(0, stack - text);
    }
    function attributeOf(node, name2) {
      if (!node || typeof node.getAttribute !== "function") return null;
      const value = node.getAttribute(name2);
      return value === void 0 ? null : value;
    }
    function childrenOf(node) {
      if (!node || !node.children) return [];
      return Array.prototype.slice.call(node.children);
    }
    function findByAttr(root, name2) {
      const queue = childrenOf(root);
      while (queue.length > 0) {
        const node = queue.shift();
        if (attributeOf(node, name2) !== null) return node;
        const kids = childrenOf(node);
        for (let i = 0; i < kids.length; i += 1) queue.push(kids[i]);
      }
      return null;
    }
    function heightOf(node) {
      if (!node || typeof node.getBoundingClientRect !== "function") return 0;
      const box = node.getBoundingClientRect();
      return box && Number.isFinite(box.height) ? box.height : 0;
    }
    function attachInputBudget(rootEl, options) {
      const opts = options && typeof options === "object" ? options : {};
      const view = opts.view || (typeof window === "undefined" ? null : window);
      if (rootEl === null || rootEl === void 0 || !rootEl.parentNode) return void 0;
      const outlet = rootEl.parentNode;
      const stack = outlet && outlet.parentNode;
      if (!stack) return void 0;
      const card = findByAttr(stack, "data-composer-card");
      if (card === null) return void 0;
      const textPort = findByAttr(card, "data-input-scroll");
      if (textPort === null) return void 0;
      let scroller = stack;
      while (scroller && attributeOf(scroller, "data-conversation-scroll") === null) {
        scroller = scroller.parentNode;
      }
      if (!scroller || !Number.isFinite(Number(scroller.clientHeight))) return void 0;
      const cardStyle = card.style;
      if (!cardStyle || typeof cardStyle.setProperty !== "function") return void 0;
      let written = null;
      let disposed = false;
      let frame = null;
      const styleOf = typeof view === "object" && view && typeof view.getComputedStyle === "function" ? view.getComputedStyle : null;
      const usableHeight = function(element) {
        const raw = Number(element.clientHeight);
        if (!Number.isFinite(raw)) return 0;
        if (typeof styleOf !== "function") return raw;
        let style = null;
        try {
          style = styleOf.call(view, element);
        } catch (error) {
          style = null;
        }
        if (!style) return raw;
        const top = parseFloat(style.paddingTop);
        const bottom = parseFloat(style.paddingBottom);
        const padding = (Number.isFinite(top) ? top : 0) + (Number.isFinite(bottom) ? bottom : 0);
        return Math.max(0, raw - padding);
      };
      const sync = function() {
        if (disposed) return null;
        let margins = 0;
        if (typeof styleOf === "function") {
          let style = null;
          try {
            style = styleOf.call(view, stack);
          } catch (error) {
            style = null;
          }
          if (style) {
            const mt = parseFloat(style.marginTop);
            const mb = parseFloat(style.marginBottom);
            margins = (Number.isFinite(mt) ? mt : 0) + (Number.isFinite(mb) ? mb : 0);
          }
        }
        const textPortHeight = heightOf(textPort);
        const chrome = chromeFrom({
          stackHeight: heightOf(stack),
          textPortHeight
        }) + margins;
        let floor = SINGLE_LINE_FALLBACK;
        if (typeof styleOf === "function") {
          let portStyle = null;
          try {
            portStyle = styleOf.call(view, textPort);
          } catch (error) {
            portStyle = null;
          }
          if (portStyle) {
            floor = lineFloorFor({
              lineHeight: parseFloat(portStyle.lineHeight),
              paddingTop: parseFloat(portStyle.paddingTop),
              paddingBottom: parseFloat(portStyle.paddingBottom)
            });
          }
        }
        const budget = inputBudgetFor({
          available: usableHeight(scroller),
          chrome,
          floor,
          reserve: opts.reserve,
          ceiling: opts.ceiling
        });
        const value = budget + "px";
        if (value === written) return budget;
        written = value;
        cardStyle.setProperty(INPUT_BUDGET_VAR, value);
        if (typeof card.setAttribute === "function") card.setAttribute(CARD_ATTR, "");
        if (typeof scroller.setAttribute === "function") scroller.setAttribute(SCROLL_ATTR, "");
        return budget;
      };
      sync();
      const ResizeObserverCtor = opts.ResizeObserver || view && view.ResizeObserver || (typeof ResizeObserver === "undefined" ? null : ResizeObserver);
      const requestFrame = view && typeof view.requestAnimationFrame === "function" ? function(callback) {
        return view.requestAnimationFrame(callback);
      } : null;
      const cancelFrame = view && typeof view.cancelAnimationFrame === "function" ? function(handle) {
        view.cancelAnimationFrame(handle);
      } : view && typeof view.clearTimeout === "function" ? function(handle) {
        view.clearTimeout(handle);
      } : function() {
      };
      let observer = null;
      if (typeof ResizeObserverCtor === "function" && requestFrame) {
        observer = new ResizeObserverCtor(function() {
          if (frame !== null || disposed) return;
          frame = requestFrame(function() {
            frame = null;
            sync();
          });
        });
        if (typeof observer.observe === "function") {
          const watch = observer.observe.bind(observer);
          watch(stack);
          watch(textPort);
          watch(card);
          watch(scroller);
        }
      }
      return function dispose() {
        disposed = true;
        if (frame !== null) {
          cancelFrame(frame);
          frame = null;
        }
        if (observer && typeof observer.disconnect === "function") observer.disconnect();
        observer = null;
        if (typeof cardStyle.removeProperty === "function") cardStyle.removeProperty(INPUT_BUDGET_VAR);
        if (typeof card.removeAttribute === "function") card.removeAttribute(CARD_ATTR);
        if (typeof scroller.removeAttribute === "function") scroller.removeAttribute(SCROLL_ATTR);
        written = null;
      };
    }

    // client/src/layout.js
    var HEAT_CELL_MAX = 22;
    var MIN_BODY_HEIGHT = 240;
    var MAX_BODY_HEIGHT = 520;
    function clampHeight(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 344;
      return Math.min(MAX_BODY_HEIGHT, Math.max(MIN_BODY_HEIGHT, Math.round(n)));
    }
    var HEAT_CELL_FLOOR = 5;
    var CARD_LABEL_FLOOR = 10;
    var CARD_VALUE_FLOOR = 15;
    var HEAT_SCROLLBAR_RESERVE = 12;
    var NARROW_VIEWPORT_PX = 560;
    var TIP_INSET = 8;
    var TIP_MAX_WIDTH = 240;
    function tipCentre(centre, bubbleWidth, panelWidth, inset) {
      const gap = Number.isFinite(inset) ? Math.max(0, inset) : TIP_INSET;
      const width = Number.isFinite(panelWidth) ? panelWidth : 0;
      const anchor = Number.isFinite(centre) ? centre : 0;
      const half = Number.isFinite(bubbleWidth) && bubbleWidth > 0 ? bubbleWidth / 2 : 0;
      if (width <= 0) return anchor;
      const min = gap + half;
      const max = width - gap - half;
      if (min > max) return width / 2;
      return Math.min(Math.max(anchor, min), max);
    }
    var LAYOUT_TIERS = [
      {
        id: "roomy",
        minCell: 10,
        overviewGap: 10,
        gridGap: 6,
        cardPad: 8,
        cardGap: 2,
        labelSize: 11,
        labelLh: 15,
        valueSize: 17,
        valueLh: 22,
        bottomGap: 25.5,
        heatPad: 8,
        heatGap: 4
      },
      {
        id: "tight",
        minCell: 8,
        overviewGap: 6,
        gridGap: 6,
        cardPad: 8,
        cardGap: 2,
        labelSize: 11,
        labelLh: 15,
        valueSize: 17,
        valueLh: 22,
        bottomGap: 25.5,
        heatPad: 4,
        heatGap: 3
      },
      {
        id: "packed",
        minCell: 0,
        overviewGap: 4,
        gridGap: 4,
        cardPad: 6,
        cardGap: 2,
        labelSize: CARD_LABEL_FLOOR,
        labelLh: 12,
        valueSize: CARD_VALUE_FLOOR,
        valueLh: 18,
        bottomGap: 19.5,
        heatPad: 2,
        heatGap: 2
      }
    ];
    function cardHeight(tier) {
      return tier.cardPad * 2 + tier.labelLh + tier.cardGap + tier.valueLh;
    }
    function gridRows(viewportWidth) {
      const width = typeof viewportWidth === "number" && Number.isFinite(viewportWidth) ? viewportWidth : NARROW_VIEWPORT_PX + 1;
      return width <= NARROW_VIEWPORT_PX ? 3 : 2;
    }
    function fixedHeight(tier, rows) {
      const grid = cardHeight(tier) * rows + tier.gridGap * (rows - 1);
      return grid + tier.overviewGap * 2 + tier.bottomGap;
    }
    function cellFor(tier, rows, bodyHeight) {
      const bandBudget = bodyHeight - fixedHeight(tier, rows);
      const content = bandBudget - tier.heatPad * 2 - tier.heatGap * 6 - HEAT_SCROLLBAR_RESERVE;
      return Math.floor(content / 7);
    }
    function bandHeight(tier, cell) {
      return cell * 7 + tier.heatGap * 6 + tier.heatPad * 2;
    }
    function overviewLayout(bodyHeight, options) {
      const opts = options || {};
      const height = clampHeight(bodyHeight);
      const rows = gridRows(opts.viewportWidth);
      let chosen = LAYOUT_TIERS[LAYOUT_TIERS.length - 1];
      let raw = cellFor(chosen, rows, height);
      for (const tier of LAYOUT_TIERS) {
        const cell2 = cellFor(tier, rows, height);
        if (cell2 >= tier.minCell) {
          chosen = tier;
          raw = cell2;
          break;
        }
      }
      const cell = Math.min(HEAT_CELL_MAX, Math.max(HEAT_CELL_FLOOR, raw));
      const band = bandHeight(chosen, cell);
      return {
        tier: chosen.id,
        rows,
        height,
        cell,
        band,
        // The custom-property values, in px, all derived from this one tier.
        overviewGap: chosen.overviewGap,
        gridGap: chosen.gridGap,
        cardPad: chosen.cardPad,
        cardGap: chosen.cardGap,
        labelSize: chosen.labelSize,
        labelLh: chosen.labelLh,
        valueSize: chosen.valueSize,
        valueLh: chosen.valueLh,
        bottomGap: chosen.bottomGap,
        heatPad: chosen.heatPad,
        heatGap: chosen.heatGap
      };
    }
    function overviewVars(bodyHeight, options) {
      const layout = overviewLayout(bodyHeight, options);
      return {
        "--dus-overview-gap": layout.overviewGap + "px",
        "--dus-grid-gap": layout.gridGap + "px",
        "--dus-card-pad": layout.cardPad + "px",
        "--dus-card-gap": layout.cardGap + "px",
        "--dus-card-label-size": layout.labelSize + "px",
        "--dus-card-label-lh": layout.labelLh + "px",
        "--dus-card-value-size": layout.valueSize + "px",
        "--dus-card-value-lh": layout.valueLh + "px",
        "--dus-heat-pad": layout.heatPad + "px",
        "--dus-heat-gap": layout.heatGap + "px",
        "--dus-heat-cell-max": layout.cell + "px"
      };
    }

    // client/src/locales.js
    var LOCALE_NS = "dsh-usage-stats";
    var en = {
      "tab.overview": "Overview",
      "tab.models": "Models",
      "aria.tabs": "Statistics view",
      "aria.ranges": "Statistics range",
      "range.all": "All",
      "range.30d": "30d",
      "range.7d": "7d",
      "range.all.hint": "All time",
      "range.days.hint": "Last {days} days",
      "card.sessions": "Sessions",
      "card.messages": "Messages",
      "card.tokens": "Total tokens",
      "card.days": "Active days",
      "card.peak": "Peak hour",
      "card.model": "Favorite model",
      "note.unavailable": "Usage data unavailable",
      "note.loading": "Crunching the numbers\u2026",
      "note.noActivity": "No activity recorded in this period",
      "note.noModels": "No model calls recorded in this period",
      // The settings rows (all three live on the 主题定制 page, General list as
      // fallback). The height edits the shared tab body `.dus-body` through
      // `--dus-body-height`, and it sizes whichever style is selected — each style
      // keeps its own height.
      "settings.style.title": "Panel style",
      "settings.style.desc": "Compact: a 480px flat card. Classic: full composer width.",
      "settings.style.classic": "Classic",
      "settings.style.compact": "Compact",
      "settings.style.aria": "Panel style",
      "settings.height.title": "Stats panel height",
      "settings.height.desc": "Height of the panel body, 240\u2013520 px; applies immediately",
      // The unit row is a SWITCH now: on = 万/亿, off = K/M/B. The description names
      // BOTH ends with an example, because "短式" is not self-explanatory — the
      // feedback that prompted this change was literally 「什么叫短式」.
      "units.title": "Number units",
      "units.desc": "On: Chinese units. Off: K/M/B (12K, 1M).",
      "units.short": "Short K/M/B",
      "units.myriad": "Myriad wan/yi",
      "aria.heatmap": "Activity heatmap: {weeks} weeks, busiest day {max} messages",
      "heat.cell": "{date} \xB7 {count} messages",
      "heat.cell.one": "{date} \xB7 {count} message",
      "heat.cell.zero": "{date} \xB7 no activity",
      // `book.lang` is a self-reporting locale marker, never shown: the panel reads
      // it to resolve the `auto` unit scale (K/M/B in an English UI, 万/亿 in a
      // Chinese one). Translators never see it.
      "book.lang": "en"
    };
    var zh = {
      "tab.overview": "\u603B\u89C8",
      "tab.models": "\u6A21\u578B",
      "aria.tabs": "\u7EDF\u8BA1\u89C6\u56FE",
      "aria.ranges": "\u7EDF\u8BA1\u8303\u56F4",
      "range.all": "\u5168\u90E8",
      "range.30d": "30 \u5929",
      "range.7d": "7 \u5929",
      "range.all.hint": "\u5168\u90E8\u65F6\u95F4",
      "range.days.hint": "\u6700\u8FD1 {days} \u5929",
      "card.sessions": "\u4F1A\u8BDD",
      "card.messages": "\u6D88\u606F",
      "card.tokens": "\u603B token",
      "card.days": "\u6D3B\u8DC3\u5929\u6570",
      "card.peak": "\u9AD8\u5CF0\u65F6\u6BB5",
      "card.model": "\u5E38\u7528\u6A21\u578B",
      "note.unavailable": "\u7528\u91CF\u6570\u636E\u4E0D\u53EF\u7528",
      "note.loading": "\u6B63\u5728\u7EDF\u8BA1\u2026",
      "note.noActivity": "\u8FD9\u6BB5\u65F6\u95F4\u8FD8\u6CA1\u6709\u6D3B\u8DC3\u8BB0\u5F55",
      "note.noModels": "\u8FD9\u6BB5\u65F6\u95F4\u8FD8\u6CA1\u6709\u6A21\u578B\u8C03\u7528\u8BB0\u5F55",
      // 三行设置（都在「主题定制」页，缺失时回退通用列表）。高度行通过
      // `--dus-body-height` 改两个标签页共用的 `.dus-body`，并且只改**当前样式**的高度：
      // 两种样式各存各的高度。
      "settings.style.title": "\u9762\u677F\u6837\u5F0F",
      "settings.style.desc": "\u53C2\u8003\uFF1A480px \u7D27\u51D1\u5E73\u9762\u5361\u7247\u3002\u73B0\u6709\uFF1A\u8DDF\u968F\u8F93\u5165\u6846\u5BBD\u5EA6\u3002",
      "settings.style.classic": "\u73B0\u6709",
      "settings.style.compact": "\u53C2\u8003",
      "settings.style.aria": "\u9762\u677F\u6837\u5F0F",
      "settings.height.title": "\u7528\u91CF\u9762\u677F\u9AD8\u5EA6",
      "settings.height.desc": "\u9762\u677F\u6B63\u6587\u9AD8\u5EA6\uFF0C240\u2013520 px\uFF0C\u62D6\u52A8\u5373\u65F6\u751F\u6548",
      // 单位行现在是开关：开 = 万/亿，关 = K/M/B。描述里两端都给了例子，因为
      // 「短式」这个词本身不自明——正是这句反馈（「什么叫短式」）促成了这次改动。
      "units.title": "\u6570\u5B57\u5355\u4F4D",
      "units.desc": "\u5F00\uFF1A\u7528 \u4E07/\u4EBF\uFF0812345 \u663E\u793A 1.2\u4E07\uFF09\u3002\u5173\uFF1A\u7528 K/M/B\uFF08\u663E\u793A 12K\uFF09\u3002",
      "units.short": "K/M/B",
      "units.myriad": "\u4E07/\u4EBF",
      "aria.heatmap": "\u6D3B\u8DC3\u5EA6\u70ED\u529B\u56FE\uFF1A{weeks} \u5468\uFF0C\u5355\u65E5\u6700\u591A {max} \u6761\u6D88\u606F",
      "heat.cell": "{date} \xB7 {count} \u6761\u6D88\u606F",
      "heat.cell.one": "{date} \xB7 {count} \u6761\u6D88\u606F",
      "heat.cell.zero": "{date} \xB7 \u6CA1\u6709\u6D3B\u8DC3\u8BB0\u5F55",
      "book.lang": "zh"
    };

    // client/src/compact-layout.js
    var COMPACT_DEFAULT_BODY_HEIGHT = 252;
    var MIN_BODY_HEIGHT2 = 240;
    var MAX_BODY_HEIGHT2 = 520;
    var COMPACT_TILE_HEIGHT = 46;
    var COMPACT_TILE_GAP = 4;
    var COMPACT_BLOCK_GAP = 12;
    var COMPACT_BOTTOM_GAP = 16;
    var COMPACT_HEAT_GAP = 3;
    var COMPACT_HEAT_ROWS = 7;
    var COMPACT_CELL_FLOOR = 8;
    var COMPACT_CELL_CEIL = 15;
    function compactFixedHeight() {
      return COMPACT_TILE_HEIGHT * 2 + COMPACT_TILE_GAP + COMPACT_BLOCK_GAP * 2 + COMPACT_BOTTOM_GAP;
    }
    function heatChrome() {
      return COMPACT_HEAT_GAP * (COMPACT_HEAT_ROWS - 1);
    }
    function clampHeight2(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return COMPACT_DEFAULT_BODY_HEIGHT;
      return Math.min(MAX_BODY_HEIGHT2, Math.max(MIN_BODY_HEIGHT2, Math.round(n)));
    }
    function compactCellForHeight(bodyHeight) {
      const height = clampHeight2(bodyHeight);
      const budget = height - compactFixedHeight() - heatChrome();
      return Math.floor(budget / COMPACT_HEAT_ROWS);
    }
    function compactLayout(bodyHeight) {
      const height = clampHeight2(bodyHeight);
      const raw = compactCellForHeight(height);
      const cell = Math.min(COMPACT_CELL_CEIL, Math.max(COMPACT_CELL_FLOOR, raw));
      return {
        height,
        cell,
        band: cell * COMPACT_HEAT_ROWS + heatChrome(),
        // True when the height setting is what bounds the columns (rather than the
        // 480px width or the ceiling). The settings copy and the tests read it.
        heightBound: raw < COMPACT_CELL_CEIL
      };
    }
    function compactVars(bodyHeight) {
      const layout = compactLayout(bodyHeight);
      return {
        "--dus-compact-cell": layout.cell + "px",
        "--dus-compact-tile-h": COMPACT_TILE_HEIGHT + "px",
        "--dus-compact-tile-gap": COMPACT_TILE_GAP + "px",
        "--dus-compact-block-gap": COMPACT_BLOCK_GAP + "px",
        "--dus-compact-heat-gap": COMPACT_HEAT_GAP + "px"
      };
    }

    // client/src/settings.js
    var DEFAULT_BODY_HEIGHT = 344;
    var MIN_BODY_HEIGHT3 = 240;
    var MAX_BODY_HEIGHT3 = 520;
    var BODY_HEIGHT_STEP = 4;
    var DEFAULT_STYLE = "classic";
    var PANEL_STYLES = ["classic", "compact"];
    var BODY_HEIGHT_VAR = "--dus-body-height";
    function clampStyle(value) {
      return PANEL_STYLES.indexOf(value) >= 0 ? value : DEFAULT_STYLE;
    }
    function isCompact(style) {
      return clampStyle(style) === "compact";
    }
    var DEFAULT_UNITS = "myriad";
    function clampUnits(value, language) {
      if (value === "short" || value === "myriad") return value;
      if (language === "en") return "short";
      return DEFAULT_UNITS;
    }
    function unitsIsOn(value) {
      return clampUnits(value) === "myriad";
    }
    function unitsForSwitch(on) {
      return on ? "myriad" : "short";
    }
    function clampBodyHeight(value, style) {
      const fallback = isCompact(style) ? COMPACT_DEFAULT_BODY_HEIGHT : DEFAULT_BODY_HEIGHT;
      let n = Number.NaN;
      if (typeof value === "number") n = value;
      else if (typeof value === "string" && value.trim() !== "") n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      const clamped = Math.min(MAX_BODY_HEIGHT3, Math.max(MIN_BODY_HEIGHT3, Math.round(n)));
      const snapped = MIN_BODY_HEIGHT3 + Math.round((clamped - MIN_BODY_HEIGHT3) / BODY_HEIGHT_STEP) * BODY_HEIGHT_STEP;
      return Math.min(MAX_BODY_HEIGHT3, Math.max(MIN_BODY_HEIGHT3, snapped));
    }
    function sanitizeSettings(raw) {
      const source = raw && typeof raw === "object" ? raw : {};
      const style = clampStyle(source.style);
      return {
        style,
        bodyHeight: clampBodyHeight(source.bodyHeight, "classic"),
        compactBodyHeight: clampBodyHeight(source.compactBodyHeight, "compact"),
        // An old payload (from before the unit row existed) has no field → auto.
        units: clampUnits(source.units)
      };
    }
    function bodyHeightOf(state) {
      const source = state && typeof state === "object" ? state : {};
      return isCompact(source.style) ? COMPACT_DEFAULT_BODY_HEIGHT : DEFAULT_BODY_HEIGHT;
    }
    function bodyHeightKey(style) {
      return isCompact(style) ? "compactBodyHeight" : "bodyHeight";
    }
    function loadSettings(storage2) {
      try {
        const raw = storage2 ? storage2.getItem(STORAGE_KEY) : null;
        if (!raw) return sanitizeSettings(null);
        return sanitizeSettings(JSON.parse(raw));
      } catch (error) {
        return sanitizeSettings(null);
      }
    }
    function saveSettings(storage2, settings2) {
      try {
        if (storage2) storage2.setItem(STORAGE_KEY, JSON.stringify(settings2));
      } catch (error) {
      }
    }
    function bodyHeightStyle(height, viewportWidth, style) {
      const compact = isCompact(style);
      const clamped = clampBodyHeight(height, compact ? "compact" : "classic");
      const derived = compact ? compactVars(clamped) : overviewVars(clamped, { viewportWidth });
      return Object.assign({ [BODY_HEIGHT_VAR]: clamped + "px" }, derived);
    }
    function createSettingsStore(storage2) {
      let state = Object.freeze(Object.assign({}, loadSettings(storage2)));
      const listeners = [];
      function commit(next) {
        state = Object.freeze(next);
        saveSettings(storage2, state);
        for (let i = 0; i < listeners.length; i += 1) {
          try {
            listeners[i](state);
          } catch (error) {
          }
        }
      }
      return {
        getState() {
          return state;
        },
        /** Switch the panel style; returns the value actually stored. */
        setStyle(style) {
          const next = clampStyle(style);
          if (next === state.style) return next;
          commit(Object.assign({}, state, { style: next }));
          return next;
        },
        /**
         * Clamp + persist + notify; returns the value actually stored.
         *
         * The write lands on the field of the style in view unless `forStyle` names
         * one explicitly, so a slider dragged while compact is showing edits
         * `compactBodyHeight` and leaves the classic height alone. A caller that
         * knows the target style (the settings row does) passes it, which keeps the
         * write correct even if the two trees ever disagree about the current style
         * for a frame.
         */
        setBodyHeight(height, forStyle) {
          const style = clampStyle(forStyle === void 0 ? state.style : forStyle);
          const key = bodyHeightKey(style);
          const next = clampBodyHeight(height, style);
          if (next === state[key]) return next;
          const patch = {};
          patch[key] = next;
          commit(Object.assign({}, state, patch));
          return next;
        },
        /** Switch the unit mode (`auto` | `short` | `myriad`); returns what was stored. */
        setUnits(mode) {
          const next = clampUnits(mode);
          if (next === state.units) return next;
          commit(Object.assign({}, state, { units: next }));
          return next;
        },
        subscribe(listener) {
          listeners.push(listener);
          return function unsubscribe() {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          };
        },
        listenerCount() {
          return listeners.length;
        }
      };
    }

    // client/src/summary-cache.js
    var SUMMARY_TTL_MS = 15e3;
    var STALE_RETRY_MS = 3500;
    function createSummaryCache(options) {
      const fetcher = options.fetcher;
      const now = typeof options.now === "function" ? options.now : function() {
        return Date.now();
      };
      const ttlMs = options.ttlMs === void 0 ? SUMMARY_TTL_MS : options.ttlMs;
      let cached = null;
      let inflight = null;
      function peek() {
        return cached === null ? null : cached.summary;
      }
      function ageMs() {
        return cached === null ? Infinity : now() - cached.at;
      }
      function isFresh() {
        return cached !== null && ageMs() <= ttlMs;
      }
      function remember(summary) {
        cached = { summary, at: now() };
        return summary;
      }
      function load(readOptions) {
        const options2 = readOptions || {};
        const force = options2.force === true;
        const refresh = options2.refresh === true;
        if (!force && !refresh) {
          if (isFresh()) return Promise.resolve(cached.summary);
          if (inflight !== null) return inflight;
        }
        const request = Promise.resolve().then(function() {
          return fetcher({ force });
        }).then(function(summary) {
          return remember(summary);
        }, function(error) {
          throw error;
        });
        if (force) return request;
        if (inflight !== null) return inflight;
        const tracked = request.then(
          function(summary) {
            inflight = null;
            return summary;
          },
          function(error) {
            inflight = null;
            throw error;
          }
        );
        inflight = tracked;
        return tracked;
      }
      return {
        load,
        peek,
        isFresh,
        ageMs,
        get ttlMs() {
          return ttlMs;
        }
      };
    }

    // client/src/stats.js
    var DAY_MS = 864e5;
    var MODEL_MIN_MESSAGES = 0.5;
    function dayStamp(key) {
      if (typeof key !== "string") return NaN;
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
      if (match === null) return NaN;
      return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    function daysBetween(fromKey, toKey) {
      return Math.round((dayStamp(toKey) - dayStamp(fromKey)) / DAY_MS);
    }
    function dayKeysIn(perDay, days) {
      const keys = Object.keys(perDay === null || perDay === void 0 ? {} : perDay).filter((key) => !Number.isNaN(dayStamp(key))).sort();
      if (keys.length === 0) return [];
      const span = Math.max(0, days);
      if (span === 0) return keys;
      const newest = keys[keys.length - 1];
      const start = keys.findIndex((key) => daysBetween(key, newest) < span);
      return keys.slice(start);
    }
    var UNIT_SCALES = {
      short: [
        { value: 1e12, suffix: "T", sigDigits: 2 },
        { value: 1e9, suffix: "B", sigDigits: 2 },
        { value: 1e6, suffix: "M", sigDigits: 2 },
        { value: 1e3, suffix: "K", sigDigits: 2 }
      ],
      myriad: [
        { value: 1e12, suffix: "\u4E07\u4EBF", sigDigits: 3 },
        { value: 1e8, suffix: "\u4EBF", sigDigits: 3 },
        { value: 1e4, suffix: "\u4E07", sigDigits: 2 }
      ]
    };
    function resolveUnitScale(mode, language) {
      if (mode === "short" || mode === "myriad") return mode;
      return language === "zh" ? "myriad" : "short";
    }
    function roundTo(value, decimals) {
      const factor = 10 ** decimals;
      return Math.round(value * factor) / factor;
    }
    function decimalsFor(scaled, sigDigits) {
      const magnitude = Math.max(0, Math.floor(Math.log10(scaled)));
      return Math.max(0, sigDigits - 1 - magnitude);
    }
    function groupInteger(value) {
      return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    function trimNumber(text) {
      if (text.indexOf(".") < 0) return text;
      return text.replace(/\.?0+$/, "");
    }
    function formatNumber(n, scale) {
      if (typeof n !== "number" || !Number.isFinite(n)) return "0";
      const units = UNIT_SCALES[scale === "myriad" ? "myriad" : "short"];
      const sign = n < 0 ? "-" : "";
      const size = Math.abs(n);
      let index = units.findIndex((unit) => size >= unit.value);
      if (index < 0) return sign + groupInteger(Math.round(size));
      let text = "";
      for (; ; ) {
        const unit = units[index];
        const scaled = size / unit.value;
        const decimals = decimalsFor(scaled, unit.sigDigits);
        text = trimNumber(roundTo(scaled, decimals).toFixed(decimals));
        const nextStep = index === 0 ? Infinity : units[index - 1].value / unit.value;
        if (index === 0 || Number(text) < nextStep) break;
        index -= 1;
      }
      return sign + text + units[index].suffix;
    }
    function formatHour(h) {
      if (typeof h !== "number" || !Number.isFinite(h)) return "12 AM";
      const hour = (Math.trunc(h) % 24 + 24) % 24;
      const twelve = hour % 12 === 0 ? 12 : hour % 12;
      return `${twelve} ${hour < 12 ? "AM" : "PM"}`;
    }
    function modelsInRange(perModel, share) {
      const source = perModel === null || perModel === void 0 ? {} : perModel;
      const result = {};
      for (const [id, entry] of Object.entries(source)) {
        const tokens = Math.round((entry?.tokens ?? 0) * share);
        const messages = Math.round((entry?.messages ?? 0) * share);
        if (messages < MODEL_MIN_MESSAGES) continue;
        result[id] = { tokens, messages };
      }
      return result;
    }
    function summarize(summary, range) {
      const source = summary === null || summary === void 0 ? {} : summary;
      const perDay = source.perDay ?? {};
      const keys = dayKeysIn(perDay, range);
      const selected = keys.filter((key) => (perDay[key] ?? 0) > 0);
      let messages = 0;
      const windowedPerDay = {};
      for (const key of keys) {
        const count = perDay[key] ?? 0;
        windowedPerDay[key] = count;
        messages += count;
      }
      const allMessages = Object.values(perDay).reduce((sum, count) => sum + (count ?? 0), 0);
      const share = allMessages > 0 ? messages / allMessages : 0;
      const perHour = Array.isArray(source.perHour) ? source.perHour.slice() : new Array(24).fill(0);
      let peakHour = 0;
      for (let hour = 1; hour < perHour.length; hour += 1) {
        if ((perHour[hour] ?? 0) > (perHour[peakHour] ?? 0)) peakHour = hour;
      }
      const perModel = modelsInRange(source.perModel, share);
      const totalTokens = Object.values(perModel).reduce((sum, entry) => sum + entry.tokens, 0);
      return {
        sessions: source.sessions ?? 0,
        messages,
        totalTokens,
        activeDays: selected.length,
        peakHour,
        perDay: windowedPerDay,
        perHour,
        perModel
      };
    }
    function favoriteModel(perModel) {
      const source = perModel === null || perModel === void 0 ? {} : perModel;
      const entries = Object.entries(source);
      if (entries.length === 0) return null;
      let champion = null;
      let total = 0;
      for (const [id, entry] of entries) {
        const tokens = entry?.tokens ?? 0;
        total += tokens;
        if (champion === null || tokens > champion.tokens) champion = { id, tokens };
      }
      return {
        id: champion.id,
        tokens: champion.tokens,
        share: total > 0 ? champion.tokens / total : 0
      };
    }
    function heatLevels(counts) {
      const distinct = Array.from(new Set(counts)).sort((a, b) => a - b);
      const levels = /* @__PURE__ */ new Map();
      distinct.forEach((count, index) => {
        const rank = index + 1;
        levels.set(count, rank === distinct.length ? 4 : Math.max(1, Math.floor(4 * rank / distinct.length)));
      });
      return levels;
    }
    function todayKey(now) {
      const date = now instanceof Date ? now : new Date(now === void 0 ? Date.now() : now);
      if (Number.isNaN(date.getTime())) return "";
      const month = `${date.getMonth() + 1}`.padStart(2, "0");
      const day = `${date.getDate()}`.padStart(2, "0");
      return `${date.getFullYear()}-${month}-${day}`;
    }
    var ALL_RANGE_MIN_DAYS = 182;
    function buildHeatmap(perDay, range, now) {
      const source = perDay === null || perDay === void 0 ? {} : perDay;
      const keys = dayKeysIn(source, range);
      const active = keys.filter((key) => (source[key] ?? 0) > 0);
      if (active.length === 0) {
        return { weeks: [], max: 0 };
      }
      const levels = heatLevels(active.map((key) => source[key]));
      const levelOf = (count) => levels.get(count) ?? 0;
      const first = active[0];
      const last = active[active.length - 1];
      const firstStamp = dayStamp(first);
      const lastStamp = dayStamp(last);
      const todayStamp = dayStamp(todayKey(now));
      const endStamp = Number.isNaN(todayStamp) ? lastStamp : Math.max(lastStamp, todayStamp);
      const spanDays = Math.round((endStamp - firstStamp) / DAY_MS) + 1;
      let columns = Math.max(1, Math.ceil(spanDays / 7));
      if (Math.max(0, range) === 0 && columns < ALL_RANGE_MIN_DAYS / 7) columns = ALL_RANGE_MIN_DAYS / 7;
      const dayCount = columns * 7;
      const startStamp = endStamp - (dayCount - 1) * DAY_MS;
      const weeks = [];
      for (let day = 0; day < dayCount; day += 1) {
        const stamp = startStamp + day * DAY_MS;
        const key = new Date(stamp).toISOString().slice(0, 10);
        const count = Number.isNaN(dayStamp(key)) ? 0 : source[key] ?? 0;
        const pad = stamp < firstStamp;
        if (day % 7 === 0) weeks.push([]);
        weeks[weeks.length - 1].push(
          pad ? { key, count: 0, level: 0, pad: true } : { key, count, level: count > 0 ? levelOf(count) : 0 }
        );
      }
      let max = 0;
      for (const key of active) {
        if (source[key] > max) max = source[key];
      }
      return { weeks, max };
    }

    // client/src/panel.js
    var TABS = [
      { id: "overview" },
      { id: "models" }
    ];
    var FALLBACK_T = function(key, params) {
      const template = en[key] ?? key;
      return String(template).replace(/\{(\w+)\}/g, function(match, name2) {
        return params && name2 in params ? String(params[name2]) : match;
      });
    };
    function isBlankSession(session) {
      return Boolean(session) && session.blank === true && !session.running && !session.promptAttempted;
    }
    function hoistAboveWorkspaceRow(rootEl) {
      if (rootEl === null || rootEl.parentNode === null) return void 0;
      const outlet = rootEl.parentNode;
      const stack = outlet.parentNode;
      if (stack === null) return void 0;
      const workspaceRow = Array.prototype.find.call(stack.children, function(child) {
        return child !== outlet && typeof child.querySelector === "function" && child.querySelector('[data-slot="conversation.hero.workspace"]') !== null;
      });
      if (workspaceRow === void 0 || workspaceRow === outlet.nextSibling) return void 0;
      stack.insertBefore(outlet, workspaceRow);
      return function() {
        if (outlet.parentNode === stack && workspaceRow.parentNode === stack) {
          stack.insertBefore(outlet, workspaceRow.nextSibling);
        }
      };
    }
    function metricCards(view, t, unitScale) {
      const favourite = favoriteModel(view.perModel);
      return [
        { key: "sessions", label: t("card.sessions"), value: formatNumber(view.sessions, unitScale) },
        { key: "messages", label: t("card.messages"), value: formatNumber(view.messages, unitScale) },
        { key: "tokens", label: t("card.tokens"), value: formatNumber(view.totalTokens, unitScale) },
        { key: "days", label: t("card.days"), value: formatNumber(view.activeDays, unitScale) },
        { key: "peak", label: t("card.peak"), value: formatHour(view.peakHour) },
        { key: "model", label: t("card.model"), value: favourite === null ? "\u2014" : favourite.id }
      ];
    }
    function modelRows(perModel, totalTokens) {
      const rows = [];
      for (const id of Object.keys(perModel)) {
        const entry = perModel[id];
        rows.push({
          id,
          tokens: entry.tokens,
          share: totalTokens > 0 ? entry.tokens / totalTokens : 0
        });
      }
      rows.sort(function(left, right) {
        return right.tokens - left.tokens;
      });
      return rows;
    }
    function shareLabel(share) {
      return (share * 100).toFixed(1) + "%";
    }
    function overviewElement(React2, cards, heat) {
      return React2.createElement("div", { className: "dus-overview" }, cards, heat);
    }
    function createPanel({ React: React2, primitives: primitives2, settings: settings2 }) {
      const store = settings2 || createSettingsStore(null);
      function renderHead(t, tab, onTab, rangeId, onRange) {
        const tabs = TABS.map(function(entry) {
          const active = entry.id === tab;
          return React2.createElement("button", {
            key: entry.id,
            type: "button",
            role: "tab",
            className: "dus-tab",
            "data-active": active ? "true" : "false",
            "aria-selected": active,
            onClick: function() {
              onTab(entry.id);
            }
          }, t("tab." + entry.id));
        });
        const ranges = RANGES.map(function(entry) {
          const active = entry.id === rangeId;
          return React2.createElement("button", {
            key: entry.id,
            type: "button",
            className: "dus-range",
            "data-active": active ? "true" : "false",
            "aria-pressed": active,
            title: entry.days === 0 ? t("range.all.hint") : t("range.days.hint", { days: entry.days }),
            onClick: function() {
              onRange(entry.id);
            }
          }, t("range." + entry.id));
        });
        return React2.createElement(
          "div",
          { className: "dus-head" },
          React2.createElement("div", { className: "dus-tabs", role: "tablist", "aria-label": t("aria.tabs") }, tabs),
          React2.createElement("div", { className: "dus-head-spacer", "aria-hidden": "true" }),
          React2.createElement("div", { className: "dus-ranges", role: "group", "aria-label": t("aria.ranges") }, ranges)
        );
      }
      function renderCards(view, t, unitScale) {
        const cards = metricCards(view, t, unitScale).map(function(card) {
          return React2.createElement(
            "div",
            {
              className: "dus-card",
              key: card.key,
              "data-card": card.key
            },
            React2.createElement("div", { className: "dus-card-label" }, card.label),
            React2.createElement("div", { className: "dus-card-value", title: card.value }, card.value)
          );
        });
        return React2.createElement("div", { className: "dus-grid" }, cards);
      }
      function renderHeat(allView, t, tips, unitScale) {
        const grid = buildHeatmap(allView.perDay, 0);
        if (grid.weeks.length === 0) {
          return React2.createElement("div", { className: "dus-note" }, t("note.noActivity"));
        }
        const cell = function(key, text, extra) {
          return React2.createElement("span", Object.assign({
            key,
            className: "dus-heat-cell",
            "aria-label": text,
            onMouseEnter: function(event) {
              tips.show(event.currentTarget, text);
            },
            onMouseLeave: function() {
              tips.hide();
            }
          }, extra));
        };
        const weeks = grid.weeks.map(function(week, index) {
          const cells = week.map(function(entry) {
            if (entry.pad) {
              return cell(
                entry.key,
                t("heat.cell.zero", { date: entry.key }),
                { "data-level": "0", "aria-hidden": "true" }
              );
            }
            if (entry.count === 0) {
              return cell(entry.key, t("heat.cell.zero", { date: entry.key }), { "data-level": "0" });
            }
            return cell(
              entry.key,
              t(
                entry.count === 1 ? "heat.cell.one" : "heat.cell",
                { date: entry.key, count: formatNumber(entry.count, unitScale) }
              ),
              { "data-level": String(entry.level) }
            );
          });
          return React2.createElement("div", { className: "dus-heat-week", key: "week-" + index }, cells);
        });
        return React2.createElement("div", {
          className: "dus-heat",
          role: "img",
          "aria-label": t("aria.heatmap", { weeks: grid.weeks.length, max: formatNumber(grid.max, unitScale) })
        }, weeks);
      }
      function renderModels(view, t, unitScale) {
        const rows = modelRows(view.perModel, view.totalTokens);
        if (rows.length === 0) {
          return React2.createElement("div", { className: "dus-note" }, t("note.noModels"));
        }
        return React2.createElement(
          "div",
          { className: "dus-models" },
          rows.map(function(row) {
            const share = shareLabel(row.share);
            return React2.createElement(
              "div",
              { className: "dus-model", key: row.id },
              React2.createElement(
                "div",
                { className: "dus-model-head" },
                React2.createElement("span", { className: "dus-model-id", title: row.id }, row.id),
                React2.createElement("span", { className: "dus-model-tokens" }, formatNumber(row.tokens, unitScale)),
                React2.createElement("span", { className: "dus-model-share" }, share)
              ),
              React2.createElement(
                "div",
                { className: "dus-model-track" },
                React2.createElement("div", { className: "dus-model-fill", style: { width: share } })
              )
            );
          })
        );
      }
      function Panel(props) {
        const visible = isBlankSession(props.session);
        const loadSummary = props.fetchSummary;
        const peekSummary = props.peekSummary;
        const t = typeof props.t === "function" ? props.t : FALLBACK_T;
        const settingsState = React2.useSyncExternalStore(store.subscribe, store.getState);
        const unitMode = settingsState.units === void 0 ? DEFAULT_UNITS : settingsState.units;
        const unitScale = resolveUnitScale(unitMode, t("book.lang"));
        const tabState = React2.useState(DEFAULT_STATE.tab);
        const tab = tabState[0];
        const setTab = tabState[1];
        const rangeState = React2.useState(DEFAULT_STATE.range);
        const rangeId = rangeState[0];
        const setRangeId = rangeState[1];
        const dataState = React2.useState(function() {
          const cached = typeof peekSummary === "function" ? peekSummary() : null;
          return cached === null ? { status: "loading", summary: null } : { status: "ready", summary: cached };
        });
        const load = dataState[0];
        const setLoad = dataState[1];
        const NARROW_VIEWPORT_PX2 = 560;
        const bandFor = function(width) {
          return typeof width === "number" && width > 0 && width < NARROW_VIEWPORT_PX2 ? "narrow" : "wide";
        };
        const widthState = React2.useState(function() {
          return bandFor(typeof window === "undefined" ? void 0 : window.innerWidth);
        });
        const viewportBand = widthState[0];
        const setViewportBand = widthState[1];
        React2.useEffect(function() {
          if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
            return void 0;
          }
          const onResize = function() {
            setViewportBand(function(previous) {
              const next = bandFor(window.innerWidth);
              return next === previous ? previous : next;
            });
          };
          window.addEventListener("resize", onResize);
          return function() {
            window.removeEventListener("resize", onResize);
          };
        }, []);
        const viewportWidth = viewportBand === "narrow" ? NARROW_VIEWPORT_PX2 - 1 : NARROW_VIEWPORT_PX2 + 1;
        const styleId = settingsState.style;
        const compact = isCompact(styleId);
        const bodyHeight = bodyHeightOf(settingsState);
        const panelRef = React2.useRef(null);
        const tipState = React2.useState(null);
        const tip = tipState[0];
        const setTip = tipState[1];
        const tipWidthRef = React2.useRef(0);
        const tips = React2.useMemo(function() {
          return {
            show: function(element, text) {
              const panel2 = panelRef.current;
              if (panel2 === null || element === null || text === void 0) return;
              const box = panel2.getBoundingClientRect();
              const cellBox = element.getBoundingClientRect();
              if (box.width === 0) return;
              const centre = cellBox.left - box.left + cellBox.width / 2;
              setTip({
                text,
                centre,
                left: tipCentre(centre, tipWidthRef.current || TIP_MAX_WIDTH, box.width, TIP_INSET),
                top: cellBox.top - box.top
              });
            },
            hide: function() {
              setTip(null);
            }
          };
        }, []);
        const useBeforePaint = typeof React2.useLayoutEffect === "function" ? React2.useLayoutEffect : React2.useEffect;
        const bubbleRef = React2.useRef(null);
        useBeforePaint(function() {
          const bubble2 = bubbleRef.current;
          const panel2 = panelRef.current;
          if (tip === null || bubble2 === null) return;
          const width = bubble2.getBoundingClientRect().width;
          if (width > 0) tipWidthRef.current = width;
          if (panel2 === null) return;
          const panelWidth = panel2.clientWidth;
          if (panelWidth <= 0) return;
          bubble2.style.left = tipCentre(tip.centre, width, panelWidth, TIP_INSET) + "px";
        }, [tip]);
        React2.useEffect(function() {
          if (!visible) return void 0;
          let cancelled = false;
          let retry = null;
          let retried = false;
          const fail = function() {
            if (cancelled) return;
            setLoad(function(previous) {
              return previous.summary === null ? { status: "error", summary: null } : previous;
            });
          };
          const accept = function(summary) {
            if (cancelled) return;
            setLoad({ status: "ready", summary });
            if (summary !== null && typeof summary === "object" && summary.stale === true && !retried && retry === null) {
              retried = true;
              retry = setTimeout(function() {
                retry = null;
                if (!cancelled) read({ refresh: true });
              }, STALE_RETRY_MS);
            }
          };
          const read = function(options) {
            let request;
            try {
              request = loadSummary(options);
            } catch (error) {
              fail();
              return;
            }
            Promise.resolve(request).then(accept, fail);
          };
          read();
          return function() {
            cancelled = true;
            if (retry !== null) {
              clearTimeout(retry);
              retry = null;
            }
          };
        }, [visible, loadSummary]);
        const range = RANGES.filter(function(entry) {
          return entry.id === rangeId;
        })[0] || RANGES[0];
        const view = React2.useMemo(function() {
          return load.summary === null ? null : summarize(load.summary, range.days);
        }, [load.summary, range.days]);
        const allView = React2.useMemo(function() {
          return load.summary === null ? null : summarize(load.summary, 0);
        }, [load.summary]);
        const rootRef = React2.useRef(null);
        React2.useEffect(function() {
          if (!visible) return void 0;
          return hoistAboveWorkspaceRow(rootRef.current);
        }, [visible]);
        React2.useEffect(function() {
          if (!visible) return void 0;
          return attachInputBudget(rootRef.current);
        }, [visible, bodyHeight]);
        const cardsBody = React2.useMemo(function() {
          if (view === null) return null;
          return renderCards(view, t, unitScale);
        }, [view, t, unitScale]);
        const heatBody = React2.useMemo(function() {
          if (allView === null) return null;
          return renderHeat(allView, t, tips, unitScale);
        }, [allView, t, tips, unitScale]);
        const overviewBody = React2.useMemo(function() {
          if (cardsBody === null || heatBody === null) return null;
          return overviewElement(React2, cardsBody, heatBody);
        }, [cardsBody, heatBody]);
        const modelsBody = React2.useMemo(function() {
          if (view === null) return null;
          return renderModels(view, t, unitScale);
        }, [view, t, unitScale]);
        if (!visible) return null;
        let body;
        if (load.status === "error") {
          body = React2.createElement("div", { className: "dus-note" }, t("note.unavailable"));
        } else if (view === null) {
          body = React2.createElement("div", { className: "dus-note" }, t("note.loading"));
        } else if (tab === "models") {
          body = modelsBody;
        } else {
          body = overviewBody;
        }
        const sliding = React2.createElement("div", {
          key: tab,
          className: "dus-body",
          "data-dir": tab === "models" ? "fwd" : "back"
        }, body);
        const bubble = React2.createElement("div", {
          className: "dus-tip-layer",
          "aria-hidden": "true"
        }, tip === null ? null : React2.createElement("div", {
          className: "dus-tip",
          ref: bubbleRef,
          style: { left: tip.left + "px", top: tip.top + "px" }
        }, tip.text));
        return React2.createElement(
          "div",
          {
            className: "dus-root",
            ref: rootRef,
            // The style switch rides ONE attribute. Every compact rule in `styles.js`
            // is scoped to `[data-dus-style="compact"]`, so the classic look and its
            // own rules are untouched by the option existing.
            "data-dus-style": compact ? "compact" : "classic"
          },
          React2.createElement(
            "div",
            {
              className: "dus-panel",
              ref: panelRef,
              // `--dus-body-height` is what `.dus-body` consumes
              // (`height: var(--dus-body-height, 344px)`); setting it on the panel
              // root means both tabs resolve the live preference, so the panel is one
              // fixed height no matter which tab is showing. The style's own derived
              // lengths ride the same inline object (the layout modules), so a shorter
              // setting draws smaller graphics instead of a scrollbar.
              style: bodyHeightStyle(bodyHeight, viewportWidth, styleId)
            },
            renderHead(t, tab, setTab, range.id, setRangeId),
            sliding,
            bubble
          )
        );
      }
      return { Panel };
    }

    // client/src/styles.js
    var PANEL_STYLE_ID = "dsh-usage-stats/panel";
    var PANEL_CSS = [
      // The wrapper owns the width, not the panel. The dock renders its occupants
      // as children of the hero's composer stack, whose width is the composer card
      // plus one `--dsh-composer-side-clearance` on each side; subtracting both
      // yields exactly the card width, so the panel edges line up with the input
      // box. This is the same width arithmetic the host's own dock occupant uses.
      //
      // The bottom margin is real on purpose. The queue dock cancels the stack gap
      // with a negative margin so it fuses with the composer; a stats panel fused
      // to the input would read as part of the composer, so this one is held off
      // it by its own margin instead.
      // THE POSITION. The reference stacks hero title → usage panel → input box in
      // one centred column, and the panel is held off the box by the stack's own
      // gap rather than by a margin of its own. An earlier 4px top + 8px bottom
      // margin doubled that gap, which read as the panel floating between the two
      // instead of belonging to the box below it.
      ".dus-root { box-sizing: border-box; flex: none;",
      "  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance));",
      "  max-width: var(--dsh-composer-card-max-width);",
      "  margin: 0 auto; }",
      // The panel is the ONE bordered shell (CDS 1-border rule). It reuses the
      // composer card's OWN elevation recipe verbatim — `--dsw-elevation-soft`
      // with its stroke color set to the L2 border token — so the panel sits on
      // the same elevation plane as the input box and reads as a clear sibling
      // object, not a flat fill. `--dsw-alias-bg-base` keeps it on the host canvas
      // tone.
      ".dus-panel { box-sizing: border-box; display: flex; flex-direction: column; gap: 10px;",
      "  position: relative;",
      "  padding: 10px 12px; border-radius: var(--dsw-radius-panel);",
      "  background: var(--dsw-alias-bg-base);",
      "  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);",
      "  box-shadow: var(--dsw-elevation-soft); }",
      // Hover bubble for the heatmap cells. CDS's floating-surface language: the
      // panel surface one step up, a hairline, the same soft elevation shadow and
      // 12px copy — instead of the OS tooltip the native `title` produced (system
      // font, system colours, ~500ms delay). `tabular-nums` because the sentence
      // carries a count. Never interactive: `pointer-events: none` so it cannot
      // steal the hover from the cell underneath.
      //
      // A CLIP GATE, NOT DECORATION: it stops the bubble becoming scrollable overflow
      // of the hero scroll container (the jitter — `docs/perf-audit.md` F4). Always
      // mounted, so a hover inserts one element.
      ".dus-tip-layer { position: absolute; inset: 0; z-index: 2;",
      "  overflow: hidden; pointer-events: none; }",
      // `max-width` is bounded by the panel too, so the clamp stays solvable when the
      // panel is narrow. 16px = twice the 8px inset `tipCentre()` uses.
      ".dus-tip { position: absolute; transform: translate(-50%, calc(-100% - 6px));",
      "  max-width: 240px; max-width: min(240px, calc(100% - 16px));",
      "  padding: 4px 8px; border-radius: var(--dsw-radius-sm);",
      "  background: var(--dsw-alias-bg-module-platform);",
      "  color: var(--dsw-alias-label-primary);",
      "  font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums;",
      "  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
      "  pointer-events: none;",
      "  box-shadow: inset 0 0 0 .5px var(--dsw-alias-border-l2), var(--dsw-elevation-soft); }",
      // Head: two groups of ghost chips — view tabs left, range pills right, the
      // free width between them. NO track, NO ring: an earlier pill-track +
      // raised-thumb recipe wrapped the buttons in a second surface, which read as
      // an extra layer around every switch.
      //
      // ONE CHIP FOR BOTH GROUPS. The reference (`home-panel.css:208-228`) sets its
      // tabs and its range pills from a single rule — 12/18 type, `1px 8px`, a 5px
      // radius, tertiary label — and lets the SELECTED one differ only by a fill
      // step plus primary ink. Ours gave the tabs their own size (12.5/20), their
      // own padding and their own weight, so the row read as two hierarchies rather
      // than one control. Both groups now share the chip, which also removes the
      // half-pixel type size: 12.5px lands between the theme's UI sizes, and any
      // UI-font-size change moves it off a whole pixel.
      //
      // NO WEIGHT CHANGE ON SELECTION either (`home-panel.css:222-228` changes fill
      // and colour only). A weight jump re-measures the label, so the chip visibly
      // grows and the neighbours slide when the user clicks — the row should not
      // move under the pointer.
      //
      // 5px IS HALF THE MEDIUM RADIUS, not a new literal: the reference rounds a
      // 20px-tall control to half its height, and `--dsw-radius-md` is the radius
      // this panel already uses for every other chip-shaped thing.
      ".dus-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }",
      ".dus-head-spacer { flex: 1; min-width: 4px; }",
      ".dus-tabs, .dus-ranges { display: inline-flex; align-items: center; gap: 2px; }",
      ".dus-range, .dus-tab { border: 0; border-radius: calc(var(--dsw-radius-md, 10px) / 2);",
      "  background: transparent; color: var(--dsw-alias-label-tertiary);",
      "  cursor: pointer; font: inherit; font-size: 12px; line-height: 18px; padding: 1px 8px;",
      "  font-variant-numeric: tabular-nums;",
      "  transition: color var(--ds-transition-duration-fast, .12s) var(--cds-ease-snap, cubic-bezier(.32, .72, 0, 1)),",
      "    background-color var(--ds-transition-duration-fast, .12s) var(--cds-ease-snap, cubic-bezier(.32, .72, 0, 1)); }",
      // Hover is a wash, not just a colour change, and never on the chip that is
      // already selected — that chip already carries the stronger fill.
      '.dus-range:hover:not([data-active="true"]),',
      '.dus-tab:hover:not([data-active="true"]) {',
      "  background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);",
      "  color: var(--dsw-alias-label-primary); }",
      ".dus-range:active, .dus-tab:active { transform: scale(.97); }",
      // The selected chip sits ONE STEP DEEPER than the surface under it, mixed
      // from the label ink (`home-panel.css:222-228`). `--dsw-alias-bg-module-platform`
      // alone is `#f7f7f5` in light mode — about two steps from a white card
      // (`docs/theme-defects.md` §3) — so a chip drawn with it reads as unselected.
      '.dus-range[data-active="true"], .dus-tab[data-active="true"] {',
      "  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, var(--dsw-alias-bg-module-platform));",
      "  color: var(--dsw-alias-label-primary); }",
      // Body: ONE fixed height for BOTH tabs, and the only place the setting is
      // consumed. Models fills it and scrolls inside; Overview fills it too and is
      // TOP-ALIGNED, so its reserved height simply pads the shorter tab (the
      // leftover reads as the canvas background below the foot line). This is what
      // keeps the composer dock below the panel from jumping when the user flips
      // tabs: the panel's content stack is head + 10px + body, identical on both
      // tabs for every setting value. `overflow: hidden` clips the horizontal slide
      // translate so the swap animation cannot paint outside the now-fixed box.
      ".dus-body { display: flex; flex-direction: column; gap: 10px; min-width: 0;",
      "  height: var(--dus-body-height, 344px);",
      "  overflow: hidden;",
      "  animation: dus-slide-in .22s cubic-bezier(.16, 1, .3, 1) both; }",
      '.dus-body[data-dir="fwd"] { --dus-slide-from: 14px; }',
      '.dus-body[data-dir="back"] { --dus-slide-from: -14px; }',
      "@keyframes dus-slide-in { from { opacity: 0; transform: translateX(var(--dus-slide-from, 14px)); }",
      "  to { opacity: 1; transform: translateX(0); } }",
      "@media (prefers-reduced-motion: reduce) { .dus-body { animation: none; } }",
      // Overview: the first tab's content, wrapped in one filler so it has the same
      // `height:100%` contract as the model list — the equality carrier, together
      // with the definite height on `.dus-body`. It is a top-aligned column and it
      // NEVER SCROLLS: the graphics shrink to fit instead (see `layout.js` and the
      // `--dus-*` lengths below). `overflow-y: hidden` is the belt to the
      // arithmetic's braces — if a host ever changes a metric the JS does not know
      // about, the tab clips a pixel rather than growing the very scrollbar the user
      // rejected. Every length here is fed by `overviewVars()` with today's value as
      // the fallback, so the module is the single place the shrink is computed.
      ".dus-overview { display: flex; flex-direction: column;",
      "  gap: var(--dus-overview-gap, 10px);",
      "  height: 100%; min-height: 0; overflow-y: hidden; }",
      // Six tiles, three across (two across under the 560px breakpoint). They are
      // fills, never outlined boxes: the tile boundary is the tint step between the
      // tile and the panel surface behind it — CDS low-contrast surface layering.
      // The type sizes carry floors: the packed tier stops at 10px/15px
      // (label/value), never smaller.
      //
      // THE FILL IS A SHARE OF THE LABEL INK, MIXED INTO THE PANEL SURFACE. Taking
      // the reference's 15% over its layer-2 card (`home-overview.css:12-21`) and
      // running it over `--dsw-alias-bg-module-platform` would double-apply the
      // step this panel already has from `--dsw-alias-bg-base`. 11% is the share
      // that lands the tile on the same visible step in light: the ink is #141413
      // and the panel is #fcfcfb, so the mix is a hair darker than the grey
      // `bg-module-platform` while staying a step ABOVE the heat band's own surface
      // — the tile still reads as the front layer, and one recipe serves dark.
      ".dus-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));",
      "  gap: var(--dus-grid-gap, 6px); }",
      ".dus-card { display: flex; flex-direction: column; gap: var(--dus-card-gap, 2px);",
      "  padding: var(--dus-card-pad, 8px) 10px;",
      "  border-radius: var(--dsw-radius-md);",
      "  background: color-mix(in srgb, var(--dsw-alias-label-primary) 11%, var(--dsw-alias-bg-base)); }",
      // The label is the tile's quiet half and the figure its loud one, and the
      // reference keeps that as its ONLY size pairing (12/16 label over 13/18
      // figure, `home-overview.css:23-44`). The label truncates in one line for the
      // same reason the figure does: "Favorite model" and "Total tokens" are longer
      // than the zh labels, and a wrapped label would make one tile taller than its
      // neighbours on a two-row grid.
      ".dus-card-label { color: var(--dsw-alias-label-tertiary);",
      "  font-size: var(--dus-card-label-size, 11px); line-height: var(--dus-card-label-lh, 15px);",
      "  letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
      ".dus-card-value { color: var(--dsw-alias-label-primary); font-weight: 600;",
      "  font-size: var(--dus-card-value-size, 17px); line-height: var(--dus-card-value-lh, 22px);",
      "  font-variant-numeric: tabular-nums; overflow: hidden;",
      "  text-overflow: ellipsis; white-space: nowrap; }",
      // The favourite model is a NAME, not a figure: the reference drops its weight
      // to the label's own (`home-overview.css:46-50`), which stops a long id from
      // reading as another count and from competing with the totals beside it.
      '.dus-card[data-card="model"] .dus-card-value { font-weight: 400; }',
      // Heatmap: one column per SEVEN-DAY BLOCK, oldest left, TODAY at the
      // bottom-right corner. The grid is anchored at today and counted backward
      // (`buildHeatmap`), so the newest square is always in the corner and every
      // column holds exactly seven cells. Columns SHARE the band edge to edge
      // (flex, capped) and cells stay square, so a full history reads as one dense
      // calendar like the design target; `space-between` spreads surplus into the
      // gaps so the band still spans the full width.
      //
      // THE BAND HUGS ITS CONTENT AND SHRINKS WITH THE PANEL. `flex: 0 0 auto`: its
      // height is exactly its calendar (7 square cells + 6 gaps + 2 paddings), and
      // the column cap is a HEIGHT BUDGET computed in `layout.js` from
      // `--dus-body-height` — `max-width: var(--dus-heat-cell-max, 22px)` on the
      // week column is what makes a shorter panel draw smaller squares instead of a
      // scrollbar. `aspect-ratio: 1` is the invariant: a rectangle would break the
      // calendar read. Cells never grow past the 22px design cap.
      //
      // Quiet days are DRAWN, not skipped: `buildHeatmap` emits level 0 for days
      // inside the window and `pad: true` only for the quiet columns before the
      // first active day; both take the same grey tile. A calendar with visible
      // holes is what makes the grid read as a calendar instead of a bar chart of
      // busy days.
      ".dus-heat { display: flex; align-items: stretch; gap: var(--dus-heat-gap, 4px);",
      "  flex: 0 0 auto; overflow-x: auto; padding: var(--dus-heat-pad, 8px);",
      "  border-radius: var(--dsw-radius-md);",
      "  background: var(--dsw-alias-bg-module-platform);",
      "  justify-content: space-between;",
      "  overscroll-behavior-x: contain; scrollbar-width: thin; }",
      ".dus-heat-week { display: flex; flex-direction: column; gap: var(--dus-heat-gap, 4px);",
      "  flex: 1 0 9px; max-width: var(--dus-heat-cell-max, 22px); }",
      // The quiet cell is a plain grey tile — visibly darker than the band, the
      // way the design target draws its empty days — so the grid reads as a grid
      // even when almost everything is empty. The accent only enters at level 1
      // and climbs a stepped ramp, which is what makes the hot days pop against
      // the field of quiet grey.
      ".dus-heat-cell { display: block; width: 100%; aspect-ratio: 1; border-radius: 2px;",
      "  background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 18%, var(--dsw-alias-bg-module-platform)); }",
      '.dus-heat-cell[data-level="1"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, var(--dsw-alias-bg-base)); }',
      '.dus-heat-cell[data-level="2"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-bg-base)); }',
      '.dus-heat-cell[data-level="3"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 80%, transparent); }',
      '.dus-heat-cell[data-level="4"] { background: var(--dsw-alias-state-business-primary); }',
      // Model list: one row per model, the share bar under its label row.
      //
      // The list FILLS the shared body height (`height: 100%; min-height: 0`) so the
      // two tabs stay exactly equal and the composer dock never jumps on a tab
      // switch. Scrolling is kept as a silent safety valve — a machine with twenty
      // providers' models would otherwise clip the tail — but it is INVISIBLE:
      //
      //   - no scrollbar: a visible gutter on a four-item list reads as "the panel
      //     is broken", and the model list is short in every real profile;
      //   - no fade mask: the earlier 12px/16px `mask-image` was meant as a
      //     half-row peek, but with only a few rows it fades the FIRST row's top and
      //     the LAST row's bottom for no reason, which looks like a rendering bug.
      //
      // `scrollbar-width: none` + the `::-webkit-scrollbar { display: none }` rule
      // below hide it in both engines; wheel/trackpad scrolling still works, so a
      // genuinely long list degrades to "scrolls without a bar" rather than "clips".
      //
      // THE HEIGHT IS NOT WRITTEN HERE. `.dus-body` owns the single
      // `--dus-body-height` height (above) and the Overview tab fills the same body;
      // this rule used to carry its own copy of the var, which is exactly why the
      // two tabs had different heights and the composer dock jumped on a tab switch.
      ".dus-models { display: flex; flex-direction: column;",
      "  height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain;",
      "  scrollbar-width: none; }",
      // Hidden in WebKit/Chromium too. `display: none` (not `width: 0`) is what also
      // removes the reserved gutter, so the rows keep the full width.
      ".dus-models::-webkit-scrollbar { display: none; }",
      ".dus-model { display: flex; flex-direction: column; gap: 6px; padding: 8px 0;",
      "  border-bottom: .5px solid var(--dsw-alias-border-l2); }",
      ".dus-model:last-child { border-bottom: none; }",
      ".dus-model-head { display: flex; align-items: baseline; gap: 10px; min-width: 0; }",
      ".dus-model-id { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;",
      "  white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; }",
      ".dus-model-tokens { flex: none; color: var(--dsw-alias-label-secondary); font-size: 12px;",
      "  line-height: 18px; font-variant-numeric: tabular-nums; }",
      ".dus-model-share { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 12px;",
      "  line-height: 18px; font-variant-numeric: tabular-nums; }",
      ".dus-model-track { height: 4px; overflow: hidden; border-radius: var(--dsw-radius-md);",
      "  background: var(--dsw-alias-border-l2); }",
      ".dus-model-fill { height: 100%; border-radius: inherit;",
      "  background: var(--dsw-alias-state-business-primary); }",
      // No caption and no divider above one. The bottom of this tab is the heat
      // grid, and the space the comparison line used to take is simply not
      // reserved: the body keeps its fixed height, so it lands as the quiet strip
      // the footnote used to occupy. `.dus-note` still paints the empty-state line
      // (an activity-free window has no grid at all).
      ".dus-note { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; padding: 4px 0; }",
      // — Settings rows -----------------------------------------------------------
      //
      // Both rows (panel height, number units) register into the 主题定制 page's
      // `settings.appearance.item` ledger, with the General list as the bounded-wait
      // fallback. Geometry mirrors the host's General rows (docs/host-hooks.md §5.3):
      // 14/22 title in label-primary, 12/18 description in label-tertiary, 16px
      // vertical padding and a .5px bottom hairline, with the control right-aligned.
      // Our own classes only — never the host's salted module hashes.
      ".dus-row { display: flex; align-items: center; gap: 8px; padding: 16px 0;",
      "  border-bottom: .5px solid var(--dsw-alias-border-l2); }",
      ".dus-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-right: 48px; }",
      ".dus-row-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 400; line-height: 22px; }",
      ".dus-row-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 400; line-height: 18px; }",
      ".dus-row-control { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }",
      ".dus-row-slider { -webkit-appearance: none; appearance: none; width: 180px; height: 20px;",
      "  background: transparent; cursor: pointer; }",
      ".dus-row-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 3px;",
      "  background: linear-gradient(to right, var(--dsw-alias-state-business-primary, #4c72e0) 0 var(--dus-fill, 0%),",
      "    var(--dsw-alias-border-l1, #d9d9d9) var(--dus-fill, 0%) 100%); }",
      ".dus-row-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px;",
      "  margin-top: -4px; border: 0; border-radius: 50%; background: var(--dsw-alias-state-business-primary, #4c72e0); }",
      ".dus-row-slider::-moz-range-track { height: 6px; border-radius: 3px; background: var(--dsw-alias-border-l1, #d9d9d9); }",
      ".dus-row-slider::-moz-range-progress { height: 6px; border-radius: 3px;",
      "  background: var(--dsw-alias-state-business-primary, #4c72e0); }",
      ".dus-row-slider::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%;",
      "  background: var(--dsw-alias-state-business-primary, #4c72e0); }",
      ".dus-row-value { flex: none; min-width: 52px; text-align: right; color: var(--dsw-alias-label-secondary);",
      "  font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }",
      // Three-way unit control: flat segmented buttons, the same switch grammar as
      // the panel's own tabs — no track, no ring, one soft fill for the active mode.
      // The unit row is a SWITCH, so it uses the host's own switch geometry (36×20,
      // 999px radius, 2px inset, 16px thumb travel) rather than inventing a size.
      // A three-option segmented control lived here before `units` became a switch;
      // its styles are gone rather than left orphaned.
      ".dct-toggle { position: relative; flex: none; width: 36px; height: 20px; padding: 2px;",
      "  box-sizing: border-box; cursor: pointer; border: none; border-radius: 999px;",
      "  background: var(--dsw-alias-border-l3);",
      "  transition: background-color .15s ease; }",
      '.dct-toggle[data-on="true"] { background: var(--dsw-alias-brand-primary); }',
      ".dct-toggle:focus-visible { outline: 2px solid var(--dsw-focus-ring-color); outline-offset: 2px; }",
      ".dct-toggle-knob { display: block; width: 16px; height: 16px; border-radius: 999px;",
      "  background: var(--dsw-alias-bg-base); box-shadow: 0 1px 2px rgba(0, 0, 0, .18);",
      "  transform: translateX(0); transition: transform .15s var(--cds-ease-snap, ease); }",
      '.dct-toggle[data-on="true"] .dct-toggle-knob { transform: translateX(16px); }',
      "@media (max-width: 600px) { .dus-row { flex-wrap: wrap; } .dus-row-text { padding-right: 0; }",
      "  .dus-row-slider { width: 100%; } }",
      // Two columns once three tiles would be narrower than their numbers.
      "@media (max-width: 560px) { .dus-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }",
      // — Preset chip placement ---------------------------------------------------
      //
      // "Standard mode" lives in the hero's workspace row, which in DOM order sits
      // ABOVE this panel. The host's composer stack is a column flex whose children
      // are the hero shell, that workspace row, the input dock outlet, and the
      // input bar (`dsh-client-ui-conversation` composer stack, class
      // `Dc7zOa_composerStack`).
      //
      // The dock outlet wrapper is `display: contents` (dsh-client-ui-renderer
      // SlotOutlet, ANCHOR_STYLE), which means the stack sees OUR root as its own
      // flex item. `order` on `.dus-root` can only move it to the very front of the
      // stack (a negative order beats every default-order sibling, including the
      // hero shell that carries the headline) — there is no integer order that
      // lands between two `order:0` DOM siblings, so CSS alone cannot place the
      // panel between the headline and the chip row.
      //
      // The row carries no `data-*` hook — only a CSS-module hash the host is free
      // to rename — and `:has()` cannot reach a PREVIOUS sibling. So the placement
      // the design wants (headline → panel → mode chips → composer) is done in
      // `panel.js` with a one-time `insertBefore` on the outlet's real parent: the
      // panel is hoisted so it sits right after the hero shell and right before the
      // workspace row, leaving the row fused to the composer. It is a DOM move of
      // our own node, not a style spoof; it degrades to the static dock position
      // (below the row) on any seat whose parent is not the composer stack.
      //
      // The panel's own bottom margin is re-seated here for its new neighbour: the
      // stack gap is 6px and the row carries a 4px top margin of its own, so 8px
      // keeps the panel-to-chip spacing at the rhythm it had against the composer.
      ".dus-root { margin-bottom: 8px; }",
      // — The input height budget (see `input-budget.js`) -------------------------
      //
      // WHY THIS IS A COMBINATION AND NOT A NEW NUMBER. The host caps the editor's
      // scrollport at `--dsh-composer-text-max-height` (336px, declared on the
      // composer seat); cds-theme's hero rules lower that same variable. Neither
      // knows how tall OUR panel is, so on a blank session a long draft plus a
      // 344/520px panel can exceed the hero scrollport — and the host's centred
      // stack then splits the overflow above and below the fold, leaving the panel
      // at a negative offset where scrolling cannot reach it.
      //
      // `min()` of the two caps is the fix: whichever is tighter wins, so the input
      // follows an installed theme without duplicating its numbers, and there is no
      // second wrapper to keep in sync with the host's own scrolling. The right-hand
      // operand is OUR property (written in px by `attachInputBudget`), so this is
      // one fixed declaration: it cannot reference itself, and re-syncing writes the
      // same custom property instead of nesting `min()` deeper each time.
      "[data-composer-card] [data-input-scroll] {",
      "  max-height: min(var(--dsh-composer-text-max-height, 336px), var(--dus-input-budget, 336px)); }",
      //
      // The page's own scrollport, marked only while this panel is mounted. `safe
      // center` centres the stack when it fits and start-aligns it when it does not,
      // so the top of the stack (this panel) stays reachable from scroll position 0
      // instead of being pushed above it. `flex-start` is the explicit fallback for
      // engines without `safe`; both are declared together so the invalid value is
      // dropped and the valid one wins. `!important` because the host's own hero rule
      // (`.root[data-phase=hero] .scrollBody`) outranks a single attribute selector
      // and this plugin owns no stylesheet-order guarantee.
      "[data-conversation-scroll][data-dus-hero-scroll] {",
      "  justify-content: flex-start !important;",
      "  justify-content: safe center !important; }",
      // — Compact style -----------------------------------------------------------
      //
      // The second selectable look, from the usage panel of the Claude-style
      // reference (github.com/Nwflower/dsh-claude-style, MIT for everything this
      // block uses). WHAT IS NOT TAKEN FROM IT: the Sodium engine (PolyForm Shield),
      // Anthropic's commercial typefaces and the crab artwork are outside that
      // licence, and none of them appears here — this block is plain CSS over host
      // tokens. Nor does it bring the reference's page treatment (hero pinned to the
      // top, 20px greeting, composer glued to the bottom): that belongs to the whole
      // new-session screen, and this option only changes the panel.
      //
      // EVERY RULE IS SCOPED to the root attribute the panel writes, so the classic
      // look above is untouched by this block and the option can be removed
      // by deleting it. What the compact rules now carry is only what genuinely
      // DIFFERS from classic: the head chip and the tile both already use the
      // reference's own geometry in the base rules, so this block keeps the surface
      // (the card's layer-2 wash) and the compact rhythm. The reference is a 480px
      // plain card: one tone of wash for the panel, tiles one tone deeper, the heat
      // grid directly on the card with no band of its own.
      //
      // THE FIRST RULE MATCHES THE ROOT ITSELF, NOT A DESCENDANT. `data-dus-style`
      // is written ON `.dus-root` (panel.js), so a `[data-dus-style] .dus-root`
      // selector would need an ancestor carrying the attribute and would never
      // match — the width would silently stay classic while every descendant rule
      // worked. That is why this one is `.dus-root[data-dus-style="compact"]` and
      // the rest keep the descendant form.
      '.dus-root[data-dus-style="compact"] { width: 480px;',
      "  max-width: calc(100% - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-side-clearance, 0px));",
      "  margin: 0 auto; }",
      // A flat wash, no outline and no elevation: the reference card is a fill, not
      // a raised surface. 4% of the label ink over the layer-2 tone is the whole
      // recipe — it flips with the theme on its own, so no dark override is needed.
      '[data-dus-style="compact"] .dus-panel { gap: 12px; padding: 12px;',
      "  border-radius: 12px;",
      "  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, var(--dsw-alias-bg-layer-2));",
      "  --dsw-elevation-stroke-color: transparent;",
      "  box-shadow: none; }",
      // The head chip IS the reference's chip in both styles now (12/18 type, a
      // 1px vertical pad, half the medium radius), so only the surface differs: the
      // compact panel is a layer-2 wash, and its selected chip is mixed over that
      // rather than over `bg-module-platform`. No weight change on selection in
      // either style — the reference changes fill and colour only
      // (`home-panel.css:222-228`), and a weight jump re-measures the label.
      '[data-dus-style="compact"] .dus-range[data-active="true"],',
      '[data-dus-style="compact"] .dus-tab[data-active="true"] {',
      "  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, var(--dsw-alias-bg-layer-2)); }",
      '[data-dus-style="compact"] .dus-body { gap: 12px; }',
      // Overview: the reference's own rhythm — tiles and grid, 12px apart.
      '[data-dus-style="compact"] .dus-overview { gap: var(--dus-compact-block-gap, 12px); }',
      // Tiles: three across at EVERY width (the reference's own arrangement). They
      // hold a short label and a 13px figure, so they stay legible well below the
      // classic style's 560px breakpoint, which is why that breakpoint is overridden
      // here rather than inherited.
      '[data-dus-style="compact"] .dus-grid { grid-template-columns: repeat(3, minmax(0, 1fr));',
      "  gap: var(--dus-compact-tile-gap, 4px); }",
      '[data-dus-style="compact"] .dus-card { gap: 2px; padding: 5px 8px; border-radius: 8px;',
      "  background: color-mix(in srgb, var(--dsw-alias-label-primary) 15%, var(--dsw-alias-bg-layer-2)); }",
      // The figure sits barely above its own label, which is also what keeps a long
      // model id on one line instead of cutting it. Both truncate rather than wrap.
      '[data-dus-style="compact"] .dus-card-label { letter-spacing: 0;',
      "  font-size: 12px; line-height: 16px; white-space: nowrap;",
      "  overflow: hidden; text-overflow: ellipsis; }",
      '[data-dus-style="compact"] .dus-card-value { font-size: 13px; line-height: 18px;',
      "  font-weight: 600; }",
      // The favourite model is a NAME, not a figure: the reference sets it at the
      // label weight so it does not read as another count.
      '[data-dus-style="compact"] .dus-card[data-card="model"] .dus-card-value { font-weight: 400; }',
      // The grid: no band behind it, no padding, 3px gaps. Columns share whatever
      // the card's inner width gives them and stop growing at the cap the layout
      // module derives from the body height, so the panel's height setting still
      // decides how large a square is. The grid has NO fixed height — every one of
      // the seven rows is always drawn.
      '[data-dus-style="compact"] .dus-heat { padding: 0; gap: var(--dus-compact-heat-gap, 3px);',
      "  background: transparent; border-radius: 0; }",
      '[data-dus-style="compact"] .dus-heat-week { gap: var(--dus-compact-heat-gap, 3px);',
      "  flex: 1 0 8px; max-width: var(--dus-compact-cell, 15px); }",
      // Level 0 is the faintest step of the label ink, on the card itself rather
      // than on a band. Every lit level mixes the project accent by the reference
      // ramp shares (20 / 40 / 65 / 100%), so the grid follows the theme's accent
      // colour instead of pinning the reference's data blue.
      '[data-dus-style="compact"] .dus-heat-cell { border-radius: 3px;',
      "  background: color-mix(in srgb, var(--dsw-alias-label-primary) 11%, transparent); }",
      '[data-dus-style="compact"] .dus-heat-cell[data-level="1"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, var(--dsw-alias-bg-layer-2)); }',
      '[data-dus-style="compact"] .dus-heat-cell[data-level="2"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, var(--dsw-alias-bg-layer-2)); }',
      '[data-dus-style="compact"] .dus-heat-cell[data-level="3"] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, var(--dsw-alias-bg-layer-2)); }',
      '[data-dus-style="compact"] .dus-heat-cell[data-level="4"] { background: var(--dsw-alias-state-business-primary); }',
      // NO CAPTION, NO DIVIDER, NO RESERVED LINE. The compact card used to end in
      // one truncated comparison line, and `compact-layout.js` still reserves its
      // 16px (`COMPACT_FOOT_HEIGHT`) inside `compactFixedHeight()` — deliberately,
      // so that deleting the line does NOT enlarge the heat columns: the budget the
      // cell size is computed from is unchanged, and 252 still draws a 14px grid of
      // seven uncut rows. The 16px now surfaces as a quiet strip under the grid,
      // which is the card's bottom inset.
      //
      // The models tab keeps the shared body, its silent scroll and its rows; only
      // the row rhythm gets the compact spacing.
      '[data-dus-style="compact"] .dus-model { gap: 4px; padding: 6px 0; }',
      '[data-dus-style="compact"] .dus-model-id { font-size: 13px; line-height: 18px; }',
      // The hover bubble rides the same card tone so it still reads as part of the
      // panel when the panel has no border of its own.
      '[data-dus-style="compact"] .dus-tip { border-radius: 8px;',
      "  box-shadow: inset 0 0 0 .5px var(--dsw-alias-border-l2); }",
      // — The style switcher (settings row 39) ------------------------------------
      //
      // Two flat buttons carrying the style names, in the same switch grammar as the
      // panel's own tabs: no track, no ring, one soft fill on the chosen one. It sits
      // ABOVE the height row so the page reads "pick a style, then size it", which is
      // also the order the two settings actually interact in.
      //
      // THE TIMING IS THE PROJECT'S, NOT A GENERIC CURVE: the snap curve and the fast
      // duration both come from the theme's own tokens (`--cds-ease-snap`,
      // `--ds-transition-duration-fast`) with their values as fallbacks, so the
      // control moves with the rest of the UI when cds-theme is installed and still
      // animates sensibly without it. `ease` and `ease-in-out` are banned here for
      // the same reason they are banned elsewhere in this repo.
      ".dus-seg { display: inline-flex; align-items: center; gap: 2px; }",
      ".dus-seg-btn { border: 0; border-radius: var(--dsw-radius-md);",
      "  background: transparent; color: var(--dsw-alias-label-tertiary);",
      "  cursor: pointer; font: inherit; font-size: 12px; line-height: 18px; padding: 3px 12px;",
      "  transition: color var(--ds-transition-duration-fast, .12s) var(--cds-ease-snap, cubic-bezier(.32, .72, 0, 1)),",
      "    background-color var(--ds-transition-duration-fast, .12s) var(--cds-ease-snap, cubic-bezier(.32, .72, 0, 1)),",
      "    transform var(--ds-transition-duration-fast, .12s) var(--cds-ease-snap, cubic-bezier(.32, .72, 0, 1)); }",
      ".dus-seg-btn:hover { color: var(--dsw-alias-label-primary); }",
      ".dus-seg-btn:active { transform: scale(.97); }",
      '.dus-seg-btn[data-active="true"] { background: var(--dsw-alias-bg-module-platform);',
      "  color: var(--dsw-alias-label-primary); font-weight: 500; }",
      ".dus-seg-btn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color); outline-offset: 2px; }",
      // Reduced motion means STILL, not slower: the press feedback is the only thing
      // this control animates, so it is dropped entirely when the user asked for no
      // motion. Scoped to this control so the shipped tab/range rules keep exactly
      // the behaviour they had.
      "@media (prefers-reduced-motion: reduce) { .dus-seg-btn { transition: none; }",
      "  .dus-seg-btn:active { transform: none; } }"
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

    // client/src/settings-slot.js
    var APPEARANCE_SLOT = "settings.appearance.item";
    var GENERAL_SLOT = "settings.general.item";
    var SLOT_WAIT_MS = 3e3;
    function rowRegistration(slot, row) {
      return {
        name: slot,
        id: row.id,
        order: row.order,
        // The outlet then injects `t(key, params)` and re-renders the row when the
        // host language changes — the same namespace the panel uses.
        locale: LOCALE_NS
      };
    }
    function registerSettingsRows(options) {
      const slots = options.slots;
      const rows = Array.isArray(options.rows) ? options.rows : [];
      const warn = typeof options.warn === "function" ? options.warn : function() {
      };
      const timers = options.timers || {
        setTimeout: function(fn, ms) {
          return setTimeout(fn, ms);
        },
        clearTimeout: function(handle) {
          clearTimeout(handle);
        }
      };
      const waitMs = options.waitMs === void 0 ? SLOT_WAIT_MS : options.waitMs;
      let mode = "pending";
      let reason = null;
      let timer = null;
      const disposers = [];
      let appearanceDisposers = [];
      let generalDisposers = [];
      function cancelWait() {
        if (timer === null) return;
        timers.clearTimeout(timer);
        timer = null;
      }
      function disposeAll(list) {
        for (const off of list) {
          try {
            off();
          } catch (ignored) {
          }
        }
        return [];
      }
      function disposeGeneral() {
        generalDisposers = disposeAll(generalDisposers);
      }
      function disposeAppearance() {
        appearanceDisposers = disposeAll(appearanceDisposers);
      }
      function place(slot) {
        const made = [];
        try {
          for (const row of rows) {
            made.push(slots.register(rowRegistration(slot, row), row.component));
          }
          return made;
        } catch (error) {
          warn("dsh-usage-stats: the host refused the settings rows on " + slot + " (" + String(error && error.message) + ")");
          disposeAll(made);
          return null;
        }
      }
      function fallBack(why) {
        if (mode !== "pending") return;
        mode = "general";
        reason = why;
        cancelWait();
        warn("dsh-usage-stats: theme page unavailable \u2014 " + why + "; the usage-stats settings rows fall back to the General list");
        const made = place(GENERAL_SLOT);
        if (made !== null) generalDisposers = made;
      }
      const stopWaiting = slots.inject(APPEARANCE_SLOT, function() {
        if (mode !== "pending") return function() {
        };
        const made = place(APPEARANCE_SLOT);
        if (made === null) {
          fallBack("the host refused the appearance-slot registration");
          return function() {
          };
        }
        appearanceDisposers = made;
        mode = "appearance";
        reason = null;
        cancelWait();
        return function() {
          disposeAppearance();
          if (mode === "appearance") {
            mode = "pending";
            fallBack("the theme page was removed");
          }
        };
      });
      if (typeof stopWaiting === "function") disposers.push(stopWaiting);
      if (waitMs > 0 && mode === "pending") {
        timer = timers.setTimeout(function() {
          timer = null;
          if (mode !== "pending") return;
          fallBack("no declaration arrived within " + String(waitMs) + "ms");
        }, waitMs);
      } else if (waitMs <= 0 && mode === "pending") {
        fallBack("no declaration is available");
      }
      return {
        get mode() {
          return mode;
        },
        reason() {
          return reason;
        },
        rows() {
          return rows.length;
        },
        dispose() {
          cancelWait();
          disposeAppearance();
          disposeGeneral();
          for (const off of disposers) {
            try {
              off();
            } catch (ignored) {
            }
          }
          disposers.length = 0;
        }
      };
    }

    // client/src/lifecycle.js
    function fallbackTranslate(key, params) {
      const template = en[key] ?? key;
      return String(template).replace(/\{(\w+)\}/g, function(match, name2) {
        return params && name2 in params ? String(params[name2]) : match;
      });
    }
    function createLifecycle({ React: React2, primitives: primitives2, panel: panel2, fetchSummary, peekSummary, settings: settings2 }) {
      const uiReady2 = Boolean(React2) && Boolean(primitives2) && Boolean(panel2) && typeof panel2.Panel === "function";
      let applied = false;
      let warned = false;
      function warnOnce(message) {
        if (warned) return;
        warned = true;
        console.warn(message);
      }
      function UsagePanel(props) {
        return React2.createElement(panel2.Panel, {
          session: props.session,
          fetchSummary,
          peekSummary,
          t: props.t
        });
      }
      function StyleRow(props) {
        const t = typeof props.t === "function" ? props.t : fallbackTranslate;
        const state = React2.useSyncExternalStore(settings2.subscribe, settings2.getState);
        const current = state.style;
        const options = [
          { id: "classic", label: t("settings.style.classic") },
          { id: "compact", label: t("settings.style.compact") }
        ];
        return React2.createElement(
          "div",
          { className: "dus-row" },
          React2.createElement(
            "div",
            { className: "dus-row-text" },
            React2.createElement("div", { className: "dus-row-title" }, t("settings.style.title")),
            React2.createElement("div", { className: "dus-row-desc" }, t("settings.style.desc"))
          ),
          React2.createElement(
            "div",
            { className: "dus-row-control" },
            React2.createElement("div", {
              className: "dus-seg",
              role: "group",
              "aria-label": t("settings.style.aria")
            }, options.map(function(option) {
              const active = option.id === current;
              return React2.createElement("button", {
                key: option.id,
                type: "button",
                className: "dus-seg-btn",
                "data-active": active ? "true" : "false",
                "data-style": option.id,
                "aria-pressed": active,
                onClick: function() {
                  settings2.setStyle(option.id);
                }
              }, option.label);
            }))
          )
        );
      }
      function UnitRow(props) {
        const t = typeof props.t === "function" ? props.t : fallbackTranslate;
        const state = React2.useSyncExternalStore(settings2.subscribe, settings2.getState);
        const on = unitsIsOn(state.units);
        return React2.createElement(
          "div",
          { className: "dus-row" },
          React2.createElement(
            "div",
            { className: "dus-row-text" },
            React2.createElement("div", { className: "dus-row-title" }, t("units.title")),
            React2.createElement("div", { className: "dus-row-desc" }, t("units.desc"))
          ),
          React2.createElement(
            "div",
            { className: "dus-row-control" },
            React2.createElement("button", {
              type: "button",
              role: "switch",
              className: "dct-toggle",
              "aria-checked": on,
              "aria-label": t("units.title"),
              "data-on": on ? "true" : "false",
              onClick: function() {
                settings2.setUnits(unitsForSwitch(!on));
              }
            }, React2.createElement("span", { className: "dct-toggle-knob" }))
          )
        );
      }
      function apply2(ctx) {
        if (!ctx || applied) return;
        if (!uiReady2) {
          warnOnce("dsh-usage-stats: react/primitives unavailable; usage panel not registered");
          return;
        }
        const slots = ctx.slots;
        if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") {
          warnOnce("dsh-usage-stats: slots service unavailable; usage panel not registered");
          return;
        }
        applied = true;
        if (ctx.locale && typeof ctx.locale.register === "function") {
          ctx.effect(function() {
            return ctx.locale.register(LOCALE_NS, { en, zh });
          }, "dsh-usage-stats: locale dictionaries");
        }
        ctx.effect(function() {
          installPanelCss();
          return function() {
            applied = false;
            removePanelCss();
          };
        }, "dsh-usage-stats: panel styles");
        slots.inject("conversation.input.dock", function() {
          return slots.register({
            name: "conversation.input.dock",
            id: "usage-stats",
            order: 5,
            // Gives every entry of this registration a `t(key, params)` prop backed
            // by the dictionaries registered above; the outlet re-renders it on a
            // locale switch for free.
            locale: LOCALE_NS
          }, UsagePanel);
        });
        if (settings2) {
          ctx.effect(function() {
            const placement = registerSettingsRows({
              slots,
              // The height row is deliberately absent: both styles are FIXED at
              // their designed heights (classic 344px, compact 252px). A slider let
              // the reader shrink the card until the heat band lost rows or the
              // caption clipped, and those failures were silent; the number is now
              // the style's own contract, not a preference.
              rows: [
                { id: STYLE_ROW_ID, order: STYLE_ROW_ORDER, component: StyleRow },
                { id: UNITS_ROW_ID, order: UNITS_ROW_ORDER, component: UnitRow }
              ],
              warn: warnOnce
            });
            return function() {
              placement.dispose();
            };
          }, "dsh-usage-stats: settings rows");
        }
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
    async function fetchSummaryFromHost(options) {
      const force = Boolean(options && options.force);
      const url = force ? USAGE_PATH + "?refresh=1" : USAGE_PATH;
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          [USAGE_MARKER_HEADER]: USAGE_MARKER_VALUE
        }
      });
      if (!response.ok) {
        throw new Error("dsh-usage-stats: summary request failed with status " + response.status);
      }
      return response.json();
    }
    var summaryCache = createSummaryCache({ fetcher: fetchSummaryFromHost });
    var storage = null;
    try {
      storage = typeof window === "undefined" ? null : window.localStorage;
    } catch (error) {
      storage = null;
    }
    var settings = createSettingsStore(storage);
    var panel = createPanel({ React, primitives, settings });
    var uiReady = Boolean(React) && Boolean(primitives);
    if (!uiReady) {
      console.warn("dsh-usage-stats: react/primitives unavailable; usage panel not registered");
    }
    var name = PLUGIN_ID;
    var inject = ["slots", "locale"];
    var apply = uiReady ? createLifecycle({
      React,
      primitives,
      panel,
      fetchSummary: summaryCache.load,
      peekSummary: summaryCache.peek,
      settings
    }) : function applyWithoutClientUi() {
    };
    return module.exports
  },
})
