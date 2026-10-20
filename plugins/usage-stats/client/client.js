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
    var SETTINGS_ROW_ID = "dsh-usage-stats-panel-height";
    var SETTINGS_ROW_ORDER = 40;
    var UNITS_ROW_ID = "dsh-usage-stats-units";
    var UNITS_ROW_ORDER = 41;
    var RANGES = [
      { id: "all", days: 0 },
      { id: "30d", days: 30 },
      { id: "7d", days: 7 }
    ];
    var BOOKS = [
      { title: "\u7EA2\u697C\u68A6", titleEn: "Dream of the Red Chamber", chars: 73e4 },
      { title: "\u4E09\u56FD\u6F14\u4E49", titleEn: "Romance of the Three Kingdoms", chars: 63e4 },
      { title: "\u56F4\u57CE", titleEn: "Fortress Besieged", chars: 23e4 },
      { title: "\u6D3B\u7740", titleEn: "To Live", chars: 12e4 },
      { title: "\u9A86\u9A7C\u7965\u5B50", titleEn: "Rickshaw Boy", chars: 1e5 }
    ];
    var DEFAULT_STATE = {
      range: "all",
      tab: "overview"
    };

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
        footPad: 8,
        footLh: 17,
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
        footPad: 8,
        footLh: 17,
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
        footPad: 4,
        footLh: 15,
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
      const foot = tier.footPad + 0.5 + tier.footLh;
      return grid + tier.overviewGap * 2 + foot;
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
        footPad: chosen.footPad,
        footLh: chosen.footLh,
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
        "--dus-foot-pad": layout.footPad + "px",
        "--dus-foot-lh": layout.footLh + "px",
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
      // The settings rows (both live on the 主题定制 page, General list as fallback).
      // The height edits the shared tab body `.dus-body` through `--dus-body-height`.
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
      // Interpolated by the panel from bookComparison's {title, ratio}; the
      // sentence shape lives here so translators own the word order. `book.lang`
      // is a self-reporting marker the panel uses to pick `title` vs `titleEn`
      // from the pick — translators never see it in the UI.
      "book.lang": "en",
      "book.less": "You haven't used a full copy of {title} yet.",
      "book.more": "You've used ~{ratio}\xD7 more tokens than {title}."
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
      // 两行设置（都在「主题定制」页，缺失时回退通用列表）。高度行通过
      // `--dus-body-height` 改两个标签页共用的 `.dus-body`。
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
      "book.lang": "zh",
      "book.less": "\u4F60\u7528\u6389\u7684 token \u8FD8\u6CA1\u51D1\u6EE1 1 \u672C\u300A{title}\u300B\u3002",
      "book.more": "\u4F60\u7528\u6389\u7684 token \u7EA6\u662F\u300A{title}\u300B\u7684 {ratio} \u500D\u3002"
    };

    // client/src/settings.js
    var DEFAULT_BODY_HEIGHT = 344;
    var MIN_BODY_HEIGHT2 = 240;
    var MAX_BODY_HEIGHT2 = 520;
    var BODY_HEIGHT_STEP = 4;
    var BODY_HEIGHT_VAR = "--dus-body-height";
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
    function clampBodyHeight(value) {
      let n = Number.NaN;
      if (typeof value === "number") n = value;
      else if (typeof value === "string" && value.trim() !== "") n = Number(value);
      if (!Number.isFinite(n)) return DEFAULT_BODY_HEIGHT;
      const clamped = Math.min(MAX_BODY_HEIGHT2, Math.max(MIN_BODY_HEIGHT2, Math.round(n)));
      const snapped = MIN_BODY_HEIGHT2 + Math.round((clamped - MIN_BODY_HEIGHT2) / BODY_HEIGHT_STEP) * BODY_HEIGHT_STEP;
      return Math.min(MAX_BODY_HEIGHT2, Math.max(MIN_BODY_HEIGHT2, snapped));
    }
    function sanitizeSettings(raw) {
      const source = raw && typeof raw === "object" ? raw : {};
      return {
        bodyHeight: clampBodyHeight(source.bodyHeight),
        // An old payload (from before the unit row existed) has no field → auto.
        units: clampUnits(source.units)
      };
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
    function bodyHeightStyle(height, viewportWidth) {
      const clamped = clampBodyHeight(height);
      return Object.assign(
        { [BODY_HEIGHT_VAR]: clamped + "px" },
        overviewVars(clamped, { viewportWidth })
      );
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
        /** Clamp + persist + notify; returns the value actually stored. */
        setBodyHeight(height) {
          const next = clampBodyHeight(height);
          if (next === state.bodyHeight) return next;
          commit(Object.assign({}, state, { bodyHeight: next }));
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
    function bookComparison(totalTokens, random = Math.random) {
      const total = typeof totalTokens === "number" && Number.isFinite(totalTokens) ? totalTokens : 0;
      const roll = typeof random === "function" ? Number(random()) : Number.NaN;
      const index = Number.isFinite(roll) ? Math.min(BOOKS.length - 1, Math.max(0, Math.floor(roll * BOOKS.length))) : 0;
      const pick = BOOKS[index];
      const ratio = pick.chars > 0 ? total / pick.chars : 0;
      return {
        title: pick.title,
        titleEn: pick.titleEn,
        chars: pick.chars,
        ratio
      };
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
    function overviewElement(React2, cards, heat, foot) {
      return React2.createElement("div", { className: "dus-overview" }, cards, heat, foot);
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
            { className: "dus-card", key: card.key },
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
      function renderFoot(view, roll, t, unitScale) {
        const book = bookComparison(view.totalTokens, function() {
          return roll;
        });
        const title = t("book.lang") === "zh" ? book.title : book.titleEn;
        const text = book.ratio < 1 ? t("book.less", { title }) : t("book.more", { title, ratio: formatNumber(book.ratio, unitScale) });
        return React2.createElement(
          "div",
          { className: "dus-foot" },
          React2.createElement("div", { className: "dus-foot-line" }, text)
        );
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
        const roll = React2.useState(function() {
          return Math.random();
        })[0];
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
        const cardsBody = React2.useMemo(function() {
          if (view === null) return null;
          return renderCards(view, t, unitScale);
        }, [view, t, unitScale]);
        const heatBody = React2.useMemo(function() {
          if (allView === null) return null;
          return renderHeat(allView, t, tips, unitScale);
        }, [allView, t, tips, unitScale]);
        const footBody = React2.useMemo(function() {
          if (allView === null) return null;
          return renderFoot(allView, roll, t, unitScale);
        }, [allView, roll, t, unitScale]);
        const overviewBody = React2.useMemo(function() {
          if (cardsBody === null || heatBody === null || footBody === null) return null;
          return overviewElement(React2, cardsBody, heatBody, footBody);
        }, [cardsBody, heatBody, footBody]);
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
          { className: "dus-root", ref: rootRef },
          React2.createElement(
            "div",
            {
              className: "dus-panel",
              ref: panelRef,
              // `--dus-body-height` is what `.dus-body` consumes
              // (`height: var(--dus-body-height, 344px)`); setting it on the panel
              // root means both tabs resolve the live preference, so the panel is one
              // fixed height no matter which tab is showing. The Overview tab's shrink
              // lengths ride the same inline style (`layout.js`), so a shorter setting
              // draws smaller graphics instead of a scrollbar.
              style: bodyHeightStyle(settingsState.bodyHeight, viewportWidth)
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
      ".dus-root { box-sizing: border-box; flex: none;",
      "  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance));",
      "  max-width: var(--dsh-composer-card-max-width);",
      "  margin: 4px auto 8px; }",
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
      // Head: plain switch buttons — tabs left, ranges right. NO track, NO ring:
      // the earlier pill-track + raised-thumb recipe wrapped the buttons in a
      // second surface, which read as an extra layer around every switch. Now the
      // only state feedback is one soft fill on the selected button.
      ".dus-head { display: flex; align-items: center; gap: 2px; }",
      ".dus-head-spacer { flex: 1; min-width: 4px; }",
      ".dus-tabs, .dus-ranges { display: inline-flex; align-items: center; gap: 2px; }",
      // Button geometry: flat text buttons, no border in any state so picking one
      // never shifts the row. The selected button is a single filled chip — no
      // hairline, no shadow. Tabs are primary text, ranges the quieter variant.
      ".dus-range, .dus-tab { border: 0; border-radius: var(--dsw-radius-md);",
      "  background: transparent; cursor: pointer; font: inherit; font-variant-numeric: tabular-nums;",
      "  transition: color .12s ease, background-color .12s ease; }",
      ".dus-range { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; padding: 3px 10px; }",
      ".dus-tab { color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 20px; padding: 3px 12px; }",
      ".dus-range:hover, .dus-tab:hover { color: var(--dsw-alias-label-primary); }",
      ".dus-range:active, .dus-tab:active { transform: scale(.97); }",
      '.dus-range[data-active="true"], .dus-tab[data-active="true"] {',
      "  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-primary); font-weight: 500; }",
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
      // fills, never outlined boxes: the tile boundary is the tint step between
      // `--dsw-alias-bg-module-platform` and the panel surface behind it — CDS
      // low-contrast surface layering. The type sizes carry floors: the packed tier
      // stops at 10px/15px (label/value), never smaller.
      ".dus-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));",
      "  gap: var(--dus-grid-gap, 6px); }",
      ".dus-card { display: flex; flex-direction: column; gap: var(--dus-card-gap, 2px);",
      "  padding: var(--dus-card-pad, 8px) 10px;",
      "  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform); }",
      ".dus-card-label { color: var(--dsw-alias-label-tertiary);",
      "  font-size: var(--dus-card-label-size, 11px); line-height: var(--dus-card-label-lh, 15px);",
      "  letter-spacing: .02em; }",
      ".dus-card-value { color: var(--dsw-alias-label-primary); font-weight: 600;",
      "  font-size: var(--dus-card-value-size, 17px); line-height: var(--dus-card-value-lh, 22px);",
      "  font-variant-numeric: tabular-nums; overflow: hidden;",
      "  text-overflow: ellipsis; white-space: nowrap; }",
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
      // The comparison is exactly one line — no byline and no basis. A hairline
      // divider (CDS one-directional rule) separates it from the tiles above. Its
      // padding and leading follow the same tier as the cards (`layout.js`), with the
      // 12px font size untouched — the foot is prose, so it is the LAST thing to give
      // and it never shrinks past its own line box.
      ".dus-foot { display: flex; flex-direction: column;",
      "  padding-top: var(--dus-foot-pad, 8px);",
      "  border-top: .5px solid var(--dsw-alias-border-l2);",
      "  color: var(--dsw-alias-label-tertiary); font-size: 12px;",
      "  line-height: var(--dus-foot-lh, 17px); }",
      ".dus-foot-line { color: var(--dsw-alias-label-secondary); }",
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
      ".dus-root { margin-bottom: 8px; }"
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
      function PanelHeightRow(props) {
        const t = typeof props.t === "function" ? props.t : fallbackTranslate;
        const state = React2.useSyncExternalStore(settings2.subscribe, settings2.getState);
        const height = state.bodyHeight;
        const span = MAX_BODY_HEIGHT2 - MIN_BODY_HEIGHT2;
        const fill = span > 0 ? Math.round((height - MIN_BODY_HEIGHT2) / span * 100) : 0;
        return React2.createElement(
          "div",
          { className: "dus-row" },
          React2.createElement(
            "div",
            { className: "dus-row-text" },
            React2.createElement("div", { className: "dus-row-title" }, t("settings.height.title")),
            React2.createElement("div", { className: "dus-row-desc" }, t("settings.height.desc"))
          ),
          React2.createElement(
            "div",
            { className: "dus-row-control" },
            React2.createElement("input", {
              type: "range",
              className: "dus-row-slider",
              min: MIN_BODY_HEIGHT2,
              max: MAX_BODY_HEIGHT2,
              step: BODY_HEIGHT_STEP,
              value: height,
              "aria-label": t("settings.height.title"),
              "aria-valuetext": height + " px",
              style: { "--dus-fill": fill + "%" },
              onChange: function(event) {
                settings2.setBodyHeight(parseInt(event.target.value, 10));
              }
            }),
            React2.createElement("span", { className: "dus-row-value" }, height + " px")
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
              rows: [
                { id: SETTINGS_ROW_ID, order: SETTINGS_ROW_ORDER, component: PanelHeightRow },
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
