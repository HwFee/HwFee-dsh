/**
 * The browser half of `@hwfee/dsh-codex-effort-slider`.
 *
 * What it does, in one sentence: it finds the host model menu's own 推理等级 row and
 * grows it to host a Codex-style continuous effort slider, whose fill runs blue →
 * violet and lights up a violet nebula with starfield particles at the high end.
 *
 * WHAT IT DOES NOT DO — each of these is a decision, not an omission:
 *   · it adds nothing to the composer's tool row (no pill, no floating chip);
 *   · it never injects a message, listens to a turn event, or builds conversation
 *     content. There is structurally no path to do so;
 *   · it never touches a menu that is not the model root panel of ITS OWN composer
 *     (`bridge.js` proves the panel by its model row before decorating anything);
 *   · it renders no control at all when the current model advertises no reasoning
 *     levels, or when the catalog has not loaded — an inert slider would lie.
 *
 * LIFECYCLE. Everything installed is disposed by the same `ctx.effect` that
 * installed it: the slot registration, the stylesheet, the popover and its document
 * listeners, the DOM bridge (observer included), and the directory accessors.
 * Disabling the plugin therefore leaves the host's menu exactly as it found it.
 *
 * PORTED FROM `Microqian2th/dsh-codex-effort-slider` (MIT). The attribution and the
 * exact list of modifications live in `licenses/NOTICE.md` and `README.md`.
 */

window.__ModuleLoader__.load({
  id: "@hwfee/dsh-codex-effort-slider",
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
    var PLUGIN_ID = "@hwfee/dsh-codex-effort-slider";
    var SLOT_NAME = "conversation.input.right";
    var ENTRY_ID = "codex-effort-slider";
    var ENTRY_ORDER = 40;
    var STYLE_MARKER = PLUGIN_ID;
    var ROW_PADDING_BLOCK = "10px";
    var EFFORT_ROW_LABELS = ["\u63A8\u7406\u7B49\u7EA7", "Effort"];
    var MODEL_ROW_LABELS = ["\u6A21\u578B", "Model"];
    var COMMIT_THROTTLE_MS = 120;
    var COMMIT_DEADLINE_MS = 1e4;
    var RETRY_DELAYS = [60, 240, 540, 960, 1500, 3e3, 3e3];
    var TRACK_HEIGHT = 28;
    var KNOB_SIZE = TRACK_HEIGHT;
    var KNOB_RADIUS = KNOB_SIZE / 2;
    var STARFIELD_DURATION_MEAN = 1.5;
    var STARFIELD_DURATION_SPREAD = 0.08;
    var STARFIELD_MIN = 0.5;
    var GOLDEN_RATIO = 0.6180339887498949;
    var MAX_SPEED_FACTOR = 2;
    var MIN_HEIGHT_SLOTS = 3;
    var ENERGY_START = 1 / 3;
    var ENERGY_END = 2 / 3;
    var COLOR_BLUE = [77, 147, 248];
    var COLOR_VIOLET = [147, 51, 234];
    var COLOR_DEEP = [76, 29, 149];
    var COLOR_TEXT_VIOLET = [139, 92, 246];
    var SETTINGS_KEY = "dsh-codex-effort-slider.settings";
    var SETTINGS_EVENT = "dsh-codex-effort-slider:settings";
    var SETTINGS_VERSION = 3;

    // client/src/styles.js
    var FILL_RADIUS = "border-radius:" + KNOB_RADIUS + "px 0 0 " + KNOB_RADIUS + "px";
    var UI_FONT = "var(--dsw-font-family-ui, var(--dsw-font-family, system-ui, -apple-system, 'Segoe UI', sans-serif))";
    var FADE_EASING = "cubic-bezier(0.25, 0.1, 0.25, 1)";
    var CSS_RULES = [
      /* The container appended INTO the host's effort row: wraps to a second line and fills it. */
      ".ces-inline{--ces-accent:var(--dsw-alias-state-business-primary,#4d93f8);box-sizing:border-box;flex-basis:100%;width:100%;min-width:0;font-family:" + UI_FONT + "}",
      ".ces-track{position:relative;box-sizing:border-box;height:" + TRACK_HEIGHT + "px;margin-top:2px;border-radius:999px;background:var(--dsw-alias-border-l1,rgba(15,17,21,.08));cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}",
      ".ces-track:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--ces-accent));outline-offset:2px}",
      '.ces-track[aria-disabled="true"]{cursor:default}',
      ".ces-fill{position:absolute;top:0;bottom:0;left:0;" + FILL_RADIUS + ";pointer-events:none}",
      ".ces-tick{position:absolute;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:rgba(128,128,128,.30);background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 26%,transparent);pointer-events:none}",
      '.ces-tick[data-on="1"]{background:rgba(255,255,255,.5)}',
      /* Knob diameter == track height, so the circle fills the pipe mouth without a clipped flat edge. */
      ".ces-knob{position:absolute;top:50%;width:" + KNOB_SIZE + "px;height:" + KNOB_SIZE + "px;margin:" + -KNOB_RADIUS + "px 0 0 " + -KNOB_RADIUS + "px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.34),0 0 0 .5px rgba(0,0,0,.06);pointer-events:none}",
      ".ces-error{margin-top:6px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary,#e5484d)}",
      /* Energy layer (pure visual). Strength comes from ONE variable, --ces-energy (0..1):
         the outer layers only animate opacity/box-shadow, so the fade-in is a compositor
         colour interpolation rather than per-frame JS style writes. When off, particles are
         paused instead of being left to burn GPU invisibly. */
      '.ces-inline[data-energy="1"] .ces-track{box-shadow:0 0 calc(var(--ces-energy,0) * 16px) rgba(168,85,247,.5)}',
      '.ces-inline[data-energy="0"] .ces-star,.ces-inline[data-energy="0"] .ces-energy__sweep{animation-play-state:paused}',
      /* The energy layer covers the FILLED segment only (same width as the fill), so the
         part of the track right of the knob stays plain. */
      ".ces-energy{position:absolute;top:0;bottom:0;left:0;" + FILL_RADIUS + ";overflow:hidden;pointer-events:none;opacity:var(--ces-energy,0);transition:opacity .2s " + FADE_EASING + ";background:linear-gradient(90deg,#3b1178 0%,#6d28d9 30%,#9333ea 62%,#c084fc 100%)}",
      /* Stars get their own layer so they do NOT fade in with the nebula (at high the
         nebula is only 0.5 opaque, which would halve every star's visibility). */
      ".ces-stars{position:absolute;top:0;bottom:0;left:0;" + FILL_RADIUS + ";overflow:hidden;pointer-events:none;transition:opacity .2s " + FADE_EASING + "}",
      /* A star is a full-width track doing the crossing, with the dot at its right edge, so
           the trail only fades at the two ends — which are outside the visible area.
      
           DURATION AND PHASE ARE INLINE, NOT CSS VARIABLES. Measured in the real host: with
           `animation-delay:var(--ces-delay)` in the sheet a negative phase does not apply, and
           opening the menu piles every star at the start line for ten-odd seconds. `--ces-b`
           is fine as a variable because it does not participate in animation timing. */
      ".ces-star{position:absolute;left:0;right:0;height:3px;margin-top:-1.5px;pointer-events:none;animation-name:ces-star-sweep;animation-timing-function:linear;animation-iteration-count:infinite}",
      ".ces-star__dot{position:absolute;left:100%;top:0;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:#fff;box-shadow:0 0 4px rgba(255,255,255,.85);opacity:var(--ces-b,1);transform:scale(var(--ces-b,1))}",
      "@keyframes ces-star-sweep{0%{transform:translate3d(0,0,0);opacity:0}6%{opacity:1}94%{opacity:1}100%{transform:translate3d(-100%,0,0);opacity:0}}",
      ".ces-energy__sweep{position:absolute;inset:0;background:linear-gradient(100deg,transparent 18%,rgba(255,255,255,.30) 50%,transparent 82%);transform:translateX(100%);animation:ces-sweep 2.4s linear infinite}",
      "@keyframes ces-sweep{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}",
      "body[data-ds-dark-theme] .ces-star__dot{background:#f5f3ff;box-shadow:0 0 5px rgba(216,180,254,.95)}",
      /* Reduced motion STOPS, it does not slow down. The repository rule is explicit:
         "not slower — not moving". So the sweep is removed and the stars are not animated
         at all; the caller additionally skips building the star nodes and skips the
         frame loop, so this media query is the last line of defence rather than the only
         one. The knob still tracks the pointer (that is not decoration — it is the
         control's state) but it does so without interpolation. */
      "@media (prefers-reduced-motion: reduce){.ces-star,.ces-energy__sweep{animation:none;display:none}.ces-energy,.ces-stars{transition:none}}",
      /* Settings popover — mounted on body, so its rules must be global (still prefixed).
         The shell (fill, stroke, shadow, type) is the host's: a theme plugin that remaps
         `--dsw-elevation-prominent` or the label tokens restyles this popover too, which is
         the point. The ENERGY colours above stay fixed by design. */
      ".ces-set{position:fixed;z-index:2147483000;min-width:252px;max-width:340px;padding:10px 12px;border-radius:var(--dsw-radius-md,10px);box-sizing:border-box;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1b1c20);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.24));font:13px/1.5 " + UI_FONT + "}",
      ".ces-set__title{font-weight:600;margin:0 0 6px 0}",
      ".ces-set__row{font-size:12px;color:var(--dsw-alias-label-tertiary,#6b6f76);margin-bottom:8px}",
      ".ces-set__group{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;border:0;padding:0;margin-inline:0}",
      ".ces-set__group label{display:flex;gap:6px;align-items:center;cursor:pointer}",
      ".ces-set__legend{font-size:12px;color:var(--dsw-alias-label-tertiary,#6b6f76);margin-bottom:4px;padding:0}",
      ".ces-set__actions{display:flex;justify-content:space-between;gap:8px}",
      ".ces-set button{cursor:pointer;font:inherit;color:inherit;padding:4px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:transparent}",
      ".ces-set button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}",
      ".ces-set button:focus-visible,.ces-set input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d93f8));outline-offset:2px}",
      '.ces-set input[type="radio"],.ces-set input[type="checkbox"]{accent-color:var(--dsw-alias-state-business-primary,#4d93f8)}',
      /* "Reached level" ticks: dim = same colour as unreached; hidden = gone. */
      '.ces-inline[data-reached-ticks="dim"] .ces-tick[data-on="1"]{background:rgba(128,128,128,.30);background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 26%,transparent)}',
      '.ces-inline[data-reached-ticks="hidden"] .ces-tick[data-on="1"]{display:none}'
    ];
    var CSS = CSS_RULES.join("\n");
    function installStyles(doc) {
      const empty = { tag: null, dispose: function() {
      } };
      if (!doc || !doc.head || typeof doc.createElement !== "function") return empty;
      try {
        const existing = typeof doc.querySelector === "function" ? doc.querySelector('style[data-plugin-css="' + STYLE_MARKER + '"]') : null;
        if (existing) return { tag: existing, dispose: function() {
        } };
        const tag = doc.createElement("style");
        tag.setAttribute("data-plugin-css", STYLE_MARKER);
        tag.textContent = CSS;
        doc.head.appendChild(tag);
        return {
          tag,
          dispose: function() {
            try {
              if (tag.parentNode) tag.parentNode.removeChild(tag);
            } catch (error) {
            }
          }
        };
      } catch (error) {
        return empty;
      }
    }

    // client/src/settings.js
    var SETTINGS_SCHEMA = [
      {
        key: "motion",
        kind: "radio",
        group: "\u52A8\u753B\u6548\u679C",
        label: "\u52A8\u753B\u6548\u679C",
        default: "full",
        options: [
          { value: "fast", label: "\u5FEB\u901F\u52A8\u753B" },
          { value: "quick", label: "\u7B80\u6D01\u52A8\u753B" },
          { value: "full", label: "\u5B8C\u6574\u52A8\u753B" }
        ]
      },
      {
        key: "reachedTicks",
        kind: "radio",
        group: "\u5DF2\u5230\u8FBE\u6863\u4F4D\u7684\u523B\u5EA6\u70B9",
        label: "\u523B\u5EA6\u70B9",
        default: "hidden",
        options: [
          { value: "highlight", label: "\u4EAE\u767D\u663E\u793A" },
          { value: "dim", label: "\u4E0E\u672A\u5230\u8FBE\u540C\u8272" },
          { value: "hidden", label: "\u9690\u85CF" }
        ]
      }
    ];
    function schemaDefaults(schema) {
      const list = schema === void 0 ? SETTINGS_SCHEMA : schema;
      const out = {};
      for (const item of list) {
        if (item.default !== void 0) {
          out[item.key] = item.default;
          continue;
        }
        if (item.kind === "radio") out[item.key] = item.options[0].value;
        else if (item.kind === "switch") out[item.key] = true;
        else out[item.key] = null;
      }
      return out;
    }
    function normalizeSettings(raw, schema) {
      const list = schema === void 0 ? SETTINGS_SCHEMA : schema;
      const out = schemaDefaults(list);
      const source = raw && typeof raw === "object" ? raw : {};
      for (const item of list) {
        const value = source[item.key];
        if (value === void 0) continue;
        if (item.kind === "radio") {
          for (const option of item.options) {
            if (option.value === value) {
              out[item.key] = value;
              break;
            }
          }
        } else if (item.kind === "switch") {
          if (typeof value === "boolean") out[item.key] = value;
        }
      }
      return out;
    }
    function createSettingsStore(deps) {
      const storage = deps && deps.storage !== void 0 ? deps.storage : void 0;
      const win = deps && deps.win !== void 0 ? deps.win : void 0;
      let cache = null;
      function read() {
        if (cache !== null) return cache;
        let raw = null;
        try {
          if (storage) raw = storage.getItem(SETTINGS_KEY);
        } catch (error) {
        }
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch (error) {
          parsed = null;
        }
        const out = normalizeSettings(parsed);
        out.v = SETTINGS_VERSION;
        if (parsed && typeof parsed === "object" && parsed.v !== SETTINGS_VERSION) {
          try {
            if (storage) storage.setItem(SETTINGS_KEY, JSON.stringify(out));
          } catch (error) {
          }
        }
        cache = out;
        return out;
      }
      function write(patch) {
        const merged = Object.assign({}, read());
        if (patch && typeof patch === "object") Object.assign(merged, patch);
        const next = normalizeSettings(merged);
        next.v = SETTINGS_VERSION;
        cache = next;
        try {
          if (storage) storage.setItem(SETTINGS_KEY, JSON.stringify(next));
        } catch (error) {
        }
        try {
          if (win && typeof win.dispatchEvent === "function" && typeof CustomEvent === "function") {
            win.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
          }
        } catch (error) {
        }
        return next;
      }
      return {
        read,
        write,
        /** Called when another instance (or another window) wrote settings. */
        invalidate() {
          cache = null;
        },
        key: SETTINGS_KEY,
        event: SETTINGS_EVENT
      };
    }
    function createSettingsUi(deps) {
      const doc = deps.doc;
      const win = deps.win;
      const store = deps.store;
      const copy = deps.copy;
      const diagnostics = deps.diagnostics;
      const teardown = [];
      const state = { panel: null, longPressTimer: null, longPressOrigin: null, anchorEl: null };
      let installed = false;
      function listen(target, type, handler, capture) {
        if (!target || typeof target.addEventListener !== "function") return;
        target.addEventListener(type, handler, capture === true);
        teardown.push(function() {
          target.removeEventListener(type, handler, capture === true);
        });
      }
      function isOurSlider(node) {
        return !!(node && typeof node.closest === "function" && node.closest(".ces-inline"));
      }
      function el(tag, attrs, text) {
        const node = doc.createElement(tag);
        if (attrs) {
          for (const key of Object.keys(attrs)) {
            const value = attrs[key];
            if (value === void 0 || value === null || value === false) continue;
            if (key === "className") node.className = value;
            else if (key === "checked" || key === "disabled") node[key] = value === true;
            else node.setAttribute(key, String(value));
          }
        }
        if (text !== void 0 && text !== null) node.textContent = String(text);
        return node;
      }
      function renderKind(item, value) {
        if (item.kind === "radio") {
          const group = el("fieldset", { className: "ces-set__group", role: "radiogroup", "aria-label": item.group || item.label });
          if (item.group) group.appendChild(el("legend", { className: "ces-set__legend" }, item.group));
          for (const option of item.options) {
            const label = el("label");
            label.appendChild(el("input", {
              type: "radio",
              name: "ces-" + item.key,
              "data-ces-key": item.key,
              value: option.value,
              checked: value === option.value
            }));
            label.appendChild(doc.createTextNode(" " + option.label));
            group.appendChild(label);
          }
          return group;
        }
        if (item.kind === "switch") {
          const group = el("div", { className: "ces-set__group" });
          const label = el("label");
          label.appendChild(el("input", { type: "checkbox", "data-ces-key": item.key, checked: value === true }));
          label.appendChild(doc.createTextNode(" " + item.label));
          group.appendChild(label);
          return group;
        }
        return null;
      }
      function disposePanel() {
        if (state.longPressTimer !== null) {
          clearTimeout(state.longPressTimer);
          state.longPressTimer = null;
        }
        const panel = state.panel;
        state.panel = null;
        if (panel && panel.parentNode) {
          try {
            panel.parentNode.removeChild(panel);
          } catch (error) {
          }
        }
      }
      function syncPanel() {
        const panel = state.panel;
        if (!panel) return;
        const settings = store.read();
        for (const item of SETTINGS_SCHEMA) {
          if (item.kind !== "radio") continue;
          for (const input of panel.querySelectorAll('[data-ces-key="' + item.key + '"]')) {
            input.checked = input.value === settings[item.key];
          }
        }
        const system = panel.querySelector("[data-ces-system]");
        if (system) system.textContent = "\u7CFB\u7EDF\u8981\u6C42\u300C\u51CF\u5C11\u52A8\u6001\u6548\u679C\u300D\u65F6\uFF0C\u4EE5\u4E0A\u4E09\u79CD\u52A8\u753B\u90FD\u4F1A\u505C\u6B62\uFF1A\u4E0D\u6E32\u67D3\u7C92\u5B50\u3001\u7981\u7528\u626B\u5149\u3001\u65CB\u94AE\u76F4\u63A5\u8DF3\u4F4D\uFF08\u62D6\u62FD\u4E0E\u5199\u56DE\u7167\u5E38\uFF09";
      }
      function buildPanel() {
        disposePanel();
        const panel = el("div", { className: "ces-set", role: "dialog", "aria-label": "\u63A8\u7406\u7B49\u7EA7\u6ED1\u6761 \xB7 \u8BBE\u7F6E", tabindex: "-1" });
        panel.appendChild(el("div", { className: "ces-set__title" }, "\u6ED1\u6761\u8BBE\u7F6E"));
        panel.appendChild(el("div", { className: "ces-set__row", "data-ces-system": "" }));
        const settings = store.read();
        for (const item of SETTINGS_SCHEMA) {
          const control = renderKind(item, settings[item.key]);
          if (control !== null) panel.appendChild(control);
        }
        const actions = el("div", { className: "ces-set__actions" });
        actions.appendChild(el("button", { type: "button", "data-ces-trace": "" }, "\u590D\u5236\u8BCA\u65AD"));
        actions.appendChild(el("button", { type: "button", "data-ces-reset": "" }, "\u6062\u590D\u9ED8\u8BA4"));
        actions.appendChild(el("button", { type: "button", "data-ces-close": "" }, "\u5173\u95ED"));
        panel.appendChild(actions);
        panel.addEventListener("input", function(event) {
          const input = event.target;
          if (!input || typeof input.getAttribute !== "function") return;
          const key = input.getAttribute("data-ces-key");
          if (!key) return;
          const item = SETTINGS_SCHEMA.find(function(entry) {
            return entry.key === key;
          });
          if (!item) return;
          const patch = {};
          patch[key] = item.kind === "switch" ? input.checked === true : input.value;
          store.write(patch);
          syncPanel();
        });
        panel.addEventListener("click", function(event) {
          const target = event.target;
          if (!target || typeof target.hasAttribute !== "function") return;
          if (target.hasAttribute("data-ces-trace")) {
            const text = typeof diagnostics === "function" ? diagnostics() : "";
            let label = "\u65E0\u6CD5\u590D\u5236";
            try {
              if (typeof copy === "function") {
                copy(text);
                label = "\u5DF2\u590D\u5236 \u2713";
              }
            } catch (error) {
              label = "\u65E0\u6CD5\u590D\u5236";
            }
            target.textContent = label;
            setTimeout(function() {
              try {
                target.textContent = "\u590D\u5236\u8BCA\u65AD";
              } catch (error) {
              }
            }, 1500);
          }
          if (target.hasAttribute("data-ces-reset")) {
            store.write(schemaDefaults());
            syncPanel();
          }
          if (target.hasAttribute("data-ces-close")) closePanel();
        });
        panel.addEventListener("mousedown", function(event) {
          event.stopPropagation();
        });
        if (doc.body) doc.body.appendChild(panel);
        state.panel = panel;
        return panel;
      }
      function closePanel() {
        const panel = state.panel;
        if (!panel || panel.style.display === "none") return;
        panel.style.display = "none";
        try {
          if (state.anchorEl && typeof state.anchorEl.focus === "function") state.anchorEl.focus();
        } catch (error) {
        }
      }
      function openPanel(rect, anchorEl) {
        if (!doc || !doc.body) return;
        const panel = buildPanel();
        syncPanel();
        panel.style.display = "block";
        state.anchorEl = anchorEl || null;
        const width = panel.offsetWidth || 280;
        const height = panel.offsetHeight || 200;
        const x = rect ? rect.left : 40;
        const y = rect ? rect.bottom + 6 : 80;
        const maxX = (win && win.innerWidth ? win.innerWidth : 1024) - width - 8;
        const maxY = (win && win.innerHeight ? win.innerHeight : 768) - height - 8;
        panel.style.left = Math.max(8, Math.min(x, maxX)) + "px";
        panel.style.top = Math.max(8, Math.min(y, maxY)) + "px";
        try {
          panel.focus();
        } catch (error) {
        }
      }
      function install() {
        if (installed || !doc || typeof doc.addEventListener !== "function") return;
        installed = true;
        listen(win, SETTINGS_EVENT, function() {
          store.invalidate();
        });
        listen(doc, "contextmenu", function(event) {
          if (!isOurSlider(event.target)) return;
          event.preventDefault();
          event.stopPropagation();
          const hostEl = event.target.closest(".ces-inline");
          openPanel(hostEl.getBoundingClientRect(), hostEl);
        }, true);
        listen(doc, "pointerdown", function(event) {
          if (!isOurSlider(event.target)) return;
          const hostEl = event.target.closest(".ces-inline");
          clearTimeout(state.longPressTimer);
          state.longPressOrigin = { x: event.clientX, y: event.clientY };
          state.longPressTimer = setTimeout(function() {
            state.longPressTimer = null;
            openPanel(hostEl.getBoundingClientRect(), hostEl);
          }, 600);
        }, true);
        const cancelLongPress = function() {
          if (!state.longPressTimer) return;
          clearTimeout(state.longPressTimer);
          state.longPressTimer = null;
        };
        listen(doc, "pointermove", function(event) {
          const origin = state.longPressOrigin;
          if (!origin) return;
          if (Math.abs((event.clientX || 0) - origin.x) > 6 || Math.abs((event.clientY || 0) - origin.y) > 6) {
            cancelLongPress();
          }
        }, true);
        listen(doc, "pointerup", cancelLongPress, true);
        listen(doc, "pointercancel", cancelLongPress, true);
        listen(doc, "keydown", function(event) {
          const isMenuKey = event.shiftKey && event.key === "F10" || event.key === "ContextMenu";
          if (!isMenuKey) return;
          const activeEl = doc.activeElement;
          if (!isOurSlider(activeEl)) return;
          event.preventDefault();
          openPanel(activeEl.getBoundingClientRect(), activeEl);
        }, true);
        listen(doc, "keydown", function(event) {
          if (event.key === "Escape") closePanel();
        }, true);
        listen(doc, "mousedown", function(event) {
          const panel = state.panel;
          if (!panel || panel.style.display === "none") return;
          if (panel.contains(event.target)) return;
          if (isOurSlider(event.target)) return;
          closePanel();
        }, true);
      }
      function dispose() {
        installed = false;
        disposePanel();
        state.longPressOrigin = null;
        state.anchorEl = null;
        while (teardown.length > 0) {
          const remove = teardown.pop();
          try {
            remove();
          } catch (error) {
          }
        }
      }
      return {
        install,
        dispose,
        openPanel,
        closePanel,
        isOpen() {
          return !!(state.panel && state.panel.style.display !== "none");
        },
        panel() {
          return state.panel;
        }
      };
    }

    // client/src/levels.js
    var EMPTY_SNAPSHOT = Object.freeze({
      current: null,
      groups: [],
      failures: [],
      status: "idle",
      pending: null,
      error: null,
      retainedEffort: void 0
    });
    function modelOf(state) {
      const current = state && state.current;
      if (!current || typeof current.provider !== "string" || typeof current.model !== "string") return null;
      const groups = state && Array.isArray(state.groups) ? state.groups : [];
      for (const group of groups) {
        if (!group || group.id !== current.provider) continue;
        const models = Array.isArray(group.models) ? group.models : [];
        for (const model of models) {
          if (model && model.id === current.model) return model;
        }
      }
      return null;
    }
    function levelsOf(state) {
      const model = modelOf(state);
      const efforts = model && model.reasoning && Array.isArray(model.reasoning.efforts) ? model.reasoning.efforts : [];
      const out = [];
      for (const effort of efforts) {
        if (!effort || typeof effort.id !== "string" || effort.id.length === 0) continue;
        out.push({
          id: effort.id,
          name: typeof effort.name === "string" && effort.name.length > 0 ? effort.name : effort.id
        });
      }
      return out;
    }
    function reasoningSupport(state) {
      const current = state && state.current;
      if (!current || typeof current.provider !== "string" || typeof current.model !== "string") return null;
      const model = modelOf(state);
      if (model === null) return null;
      return !!(model.reasoning && typeof model.reasoning === "object");
    }
    function resolveLevels(liveLevels, liveKey, cache, reasoning) {
      if (liveLevels.length > 0) {
        cache.key = liveKey;
        cache.levels = liveLevels;
        return liveLevels;
      }
      if (reasoning === false) return liveLevels;
      if (liveKey === null || cache.key !== liveKey) return liveLevels;
      return cache.levels.length > 0 ? cache.levels : liveLevels;
    }
    function effectiveEffortId(state) {
      const current = state && state.current;
      if (current && typeof current.reasoningEffort === "string" && current.reasoningEffort.length > 0) {
        return current.reasoningEffort;
      }
      const model = modelOf(state);
      const fallback = model && model.reasoning && model.reasoning.defaultEffort;
      return typeof fallback === "string" && fallback.length > 0 ? fallback : null;
    }
    function indexOfLevel(levels, id) {
      if (typeof id !== "string") return -1;
      for (let i = 0; i < levels.length; i += 1) if (levels[i].id === id) return i;
      return -1;
    }
    function clamp01(value) {
      if (!(value > 0)) return 0;
      return value > 1 ? 1 : value;
    }
    function indexFromPct(pct, count) {
      if (count <= 1) return 0;
      return Math.max(0, Math.min(count - 1, Math.round(clamp01(pct) * (count - 1))));
    }
    function pctFromIndex(index, count) {
      if (count <= 0) return 0;
      if (count === 1) return 1;
      const safe = Math.max(0, Math.min(count - 1, index));
      return safe / (count - 1);
    }
    var DETENT_THIRD = 1 / 3;
    function detentTargetIndex(pos, cur, count, third) {
      if (count <= 1) return 0;
      const th = typeof third === "number" && third > 0 && third < 0.5 ? third : 1 / 3;
      const lo = Math.max(0, Math.min(count - 1, typeof cur === "number" ? cur : 0));
      const p = Math.max(0, Math.min(count - 1, pos));
      if (p >= lo + th) return Math.min(count - 1, Math.max(lo + 1, Math.round(p)));
      if (p <= lo - (1 - th)) return Math.max(0, Math.min(lo - 1, Math.round(p)));
      return lo;
    }

    // client/src/motion.js
    var MOTION = {
      K: 20,
      // position → velocity gain (1/s)
      A: 120,
      // braking slope (pct/s²): upper bound only; coast distance ≈ v²/(2A)
      k: 40,
      // velocity tracking gain (1/s)
      amax: 240,
      // acceleration ceiling (pct/s², safety valve)
      vmax: 6,
      // velocity ceiling (pct/s)
      epsX: 15e-4,
      // settled: position error threshold
      epsV: 0.02
      // settled: velocity threshold
    };
    var MOTION_REDUCED = {
      K: 40,
      A: 300,
      k: 40,
      amax: 200,
      vmax: 7,
      epsX: 15e-4,
      epsV: 0.02
    };
    var MOTION_FAST = {
      K: 60,
      A: 500,
      k: 60,
      amax: 300,
      vmax: 10,
      epsX: 15e-4,
      epsV: 0.02
    };
    var RELEASE_PROJECT_S = 0;
    var POINTER_SPEED_EMA = 0.4;
    var POINTER_STALE_S = 2 / 60;
    var POINTER_SPEED_TAU = 0.03;
    var MAX_FRAME_DT = 0.05;
    function clampAbs(value, limit) {
      if (value > limit) return limit;
      return value < -limit ? -limit : value;
    }
    function motionStep(m, dt, p) {
      const e = m.target - m.x;
      let vAbs = p.K * Math.abs(e);
      const brake = Math.sqrt(2 * p.A * Math.abs(e));
      if (brake < vAbs) vAbs = brake;
      if (vAbs > p.vmax) vAbs = p.vmax;
      const vDesired = e > 0 ? vAbs : e < 0 ? -vAbs : 0;
      m.a = clampAbs(p.k * (vDesired - m.v), p.amax);
      m.v = clampAbs(m.v + m.a * dt, p.vmax);
      if (e !== 0 && Math.abs(m.v * dt) >= Math.abs(e)) {
        m.x = m.target;
        m.v = 0;
        m.a = 0;
        return m;
      }
      const xRaw = m.x + m.v * dt;
      const xClamped = xRaw < 0 ? 0 : xRaw > 1 ? 1 : xRaw;
      if (xClamped !== xRaw && (xClamped === 0 && m.v < 0 || xClamped === 1 && m.v > 0)) {
        m.v = 0;
        m.a = 0;
      }
      m.x = xClamped;
      if (motionSettled(m, p)) {
        m.x = m.target;
        m.v = 0;
        m.a = 0;
      }
      return m;
    }
    function motionSettled(m, p) {
      return Math.abs(m.target - m.x) < p.epsX && Math.abs(m.v) < p.epsV;
    }
    function decayPointerSpeed(vPtr, sinceS, staleS, tau) {
      if (!(sinceS > staleS)) return vPtr;
      return vPtr * Math.exp(-(sinceS - staleS) / tau);
    }
    function releaseIndexFor(targetPct, vPtr, count) {
      return indexFromPct(clamp01(targetPct + vPtr * RELEASE_PROJECT_S), count);
    }
    function scheduleFrame(cb) {
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        return { raf: true, id: window.requestAnimationFrame(cb) };
      }
      return { raf: false, id: setTimeout(function() {
        cb(nowMs());
      }, 16) };
    }
    function cancelFrame(handle) {
      if (!handle) return;
      if (handle.raf) {
        if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(handle.id);
        }
        return;
      }
      clearTimeout(handle.id);
    }
    function nowMs() {
      return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    }
    function createTrackMetrics(deps) {
      const track = deps.track;
      const WatcherImpl = deps.SizeWatcherImpl !== void 0 ? deps.SizeWatcherImpl : typeof ResizeObserver === "function" ? ResizeObserver : null;
      let cached = null;
      let observer = null;
      function measure() {
        const el = track();
        if (!el || typeof el.getBoundingClientRect !== "function") {
          cached = null;
          return null;
        }
        const rect = el.getBoundingClientRect();
        cached = { left: rect.left, width: rect.width };
        return cached;
      }
      function start() {
        measure();
        if (WatcherImpl === null) return;
        const el = track();
        if (!el) return;
        try {
          observer = new WatcherImpl(function() {
            measure();
          });
          observer.observe(el);
        } catch (error) {
          observer = null;
        }
      }
      return {
        /** Re-measure on demand (drag start does this). */
        measure,
        /**
         * Pointer X → normalised position, or null when the track has no usable width.
         *
         * The mapping is over "the span the knob CENTRE can travel", so dragging to
         * either end always reaches the end level and the knob never overhangs.
         *
         * @param {number} clientX
         * @param {number} knobRadius
         */
        pctAt(clientX, knobRadius) {
          const box = cached === null ? measure() : cached;
          if (box === null) return null;
          const usable = box.width - knobRadius * 2;
          if (!(usable > 0)) return null;
          return clamp01((clientX - box.left - knobRadius) / usable);
        },
        start,
        dispose() {
          if (observer !== null) {
            try {
              observer.disconnect();
            } catch (error) {
            }
            observer = null;
          }
          cached = null;
        }
      };
    }

    // client/src/energy.js
    function mixColor(from, to, t) {
      const k = clamp01(t);
      return [
        Math.round(from[0] + (to[0] - from[0]) * k),
        Math.round(from[1] + (to[1] - from[1]) * k),
        Math.round(from[2] + (to[2] - from[2]) * k)
      ];
    }
    function rgbOf(color) {
      return "rgb(" + color[0] + "," + color[1] + "," + color[2] + ")";
    }
    function fillColorFor(pct) {
      const t = clamp01(pct);
      if (t <= ENERGY_START) return rgbOf(COLOR_BLUE);
      if (t <= ENERGY_END) {
        return rgbOf(mixColor(COLOR_BLUE, COLOR_VIOLET, (t - ENERGY_START) / (ENERGY_END - ENERGY_START)));
      }
      return rgbOf(mixColor(COLOR_VIOLET, COLOR_DEEP, (t - ENERGY_END) / (1 - ENERGY_END)));
    }
    function fillBackgroundFor(pct) {
      return "linear-gradient(90deg, " + rgbOf(COLOR_BLUE) + ", " + fillColorFor(pct) + ")";
    }
    function isOffLevel(level) {
      if (!level) return false;
      for (const candidate of [level.id, level.name]) {
        if (typeof candidate !== "string") continue;
        const flat = candidate.replace(/\s+/g, "").toLowerCase();
        if (flat === "off" || flat === "none" || flat === "\u5173\u95ED" || flat === "\u65E0") return true;
      }
      return false;
    }
    function valueColorFor(pct, level) {
      if (isOffLevel(level)) return "";
      return rgbOf(mixColor(COLOR_BLUE, COLOR_TEXT_VIOLET, energyFor(pct)));
    }
    function energyFor(pct) {
      return clamp01((clamp01(pct) - ENERGY_START) / (1 - ENERGY_START));
    }
    function speedFor(pct) {
      return Math.min(2, Math.max(0.35, 3 * clamp01(pct) - 1));
    }
    function starHash01(index, salt) {
      const value = (index + 1) * salt * 2654435761 % 4294967296;
      return (value >>> 8) % 1e3 / 1e3;
    }
    var PARTICLES = (function buildParticles() {
      const count = 22;
      const out = [];
      for (let i = 0; i < count; i += 1) out.push({ y: 0, phase: (i + 1) * GOLDEN_RATIO % 1 });
      const byPhase = [];
      for (let i = 0; i < count; i += 1) byPhase.push(i);
      byPhase.sort(function(a, b) {
        return out[a].phase - out[b].phase;
      });
      let slots = null;
      for (let salt = 71; salt < 4e3 && slots === null; salt += 1) {
        const candidate = [];
        for (let i = 0; i < count; i += 1) candidate.push(i);
        candidate.sort(function(a, b) {
          const ha = starHash01(a, salt);
          const hb = starHash01(b, salt);
          return ha === hb ? a - b : ha - hb;
        });
        let ok = true;
        for (let k = 1; k < count && ok; k += 1) {
          if (Math.abs(candidate[k] - candidate[k - 1]) < MIN_HEIGHT_SLOTS) ok = false;
        }
        if (ok) slots = candidate;
      }
      if (slots === null) {
        slots = [];
        for (let i = 0; i < count; i += 1) slots.push(i * 5 % count);
      }
      for (let rank = 0; rank < count; rank += 1) {
        out[byPhase[rank]].y = 8 + slots[rank] / (count - 1) * 84;
      }
      return out;
    })();
    function starBrightnessFor(index) {
      return STARFIELD_MIN + (1 - STARFIELD_MIN) * starHash01(index, 61);
    }
    function starDurationFor(index, speedFactor) {
      const speed = Math.min(MAX_SPEED_FACTOR, Math.max(0.35, typeof speedFactor === "number" ? speedFactor : MAX_SPEED_FACTOR));
      const spread = 1 - STARFIELD_DURATION_SPREAD + 2 * STARFIELD_DURATION_SPREAD * starHash01(index, 29);
      return STARFIELD_DURATION_MEAN * MAX_SPEED_FACTOR / speed * spread;
    }
    function starDelayFor(index, duration) {
      const particle = PARTICLES[index];
      const phase = particle && typeof particle.phase === "number" ? particle.phase : 0;
      const jitter = starHash01(index, 53) * 0.03;
      return -((phase + jitter) % 1 * duration);
    }
    function particleCountFor(pct) {
      return Math.round(energyFor(pct) * PARTICLES.length);
    }
    function starCountFor(pct) {
      return particleCountFor(pct);
    }
    function starLayerOpacityFor(pct) {
      return 0.6 + 0.4 * energyFor(pct);
    }
    function knobOffsetOf(pct) {
      const t = Math.round(clamp01(pct) * 1e4) / 1e4;
      return "calc(" + KNOB_RADIUS + "px + " + t + " * (100% - " + KNOB_RADIUS * 2 + "px))";
    }

    // client/src/bridge.js
    function firstSpanText(row) {
      try {
        const spans = row.querySelectorAll("span");
        for (const span of spans) {
          const text = span.textContent;
          if (typeof text === "string" && text.length > 0) return text;
        }
      } catch (error) {
      }
      return "";
    }
    function flattenLabel(text) {
      return typeof text === "string" ? text.replace(/\s+/g, "") : "";
    }
    function isLabel(text, labels) {
      const flat = flattenLabel(text);
      if (flat.length === 0) return false;
      return labels.some(function(label) {
        return flattenLabel(label) === flat;
      });
    }
    function findValueElement(row) {
      if (!row || typeof row.querySelectorAll !== "function") return null;
      try {
        const byClass = row.querySelectorAll('span[class*="cellValue"]');
        if (byClass.length > 0) return byClass[byClass.length - 1];
        const spans = row.querySelectorAll("span");
        let found = null;
        for (const span of spans) {
          const text = span.textContent;
          if (typeof text === "string" && text.replace(/\s+/g, "").length > 0) found = span;
        }
        return found;
      } catch (error) {
        return null;
      }
    }
    function findSeatEffort(doc, composer, expectedLabels) {
      if (!doc || !composer || typeof doc.querySelectorAll !== "function") return null;
      const list = typeof expectedLabels === "string" ? [expectedLabels] : expectedLabels;
      if (Object.prototype.toString.call(list) !== "[object Array]") return null;
      const wanted = [];
      for (const candidate of list) {
        const name2 = flattenLabel(candidate);
        if (name2.length > 0 && wanted.indexOf(name2) < 0) wanted.push(name2);
      }
      if (wanted.length === 0) return null;
      try {
        const seats = doc.querySelectorAll('button[aria-haspopup="menu"]');
        for (const seat of seats) {
          if (!composer.contains(seat)) continue;
          for (const span of seat.querySelectorAll("span")) {
            const text = span.textContent;
            if (typeof text === "string" && wanted.indexOf(flattenLabel(text)) >= 0) return span;
          }
        }
      } catch (error) {
        return null;
      }
      return null;
    }
    function openSeatOf(composer) {
      if (!composer || typeof composer.querySelectorAll !== "function") return null;
      try {
        const seats = composer.querySelectorAll('button[aria-haspopup="menu"][aria-expanded="true"]');
        return seats.length > 0 ? seats[0] : null;
      } catch (error) {
        return null;
      }
    }
    function findEffortRow(doc, composer) {
      if (!doc || !composer || typeof composer.querySelectorAll !== "function") return null;
      const seat = openSeatOf(composer);
      if (seat === null) return null;
      const menuId = typeof seat.getAttribute === "function" ? seat.getAttribute("aria-controls") : null;
      if (!menuId) return null;
      const menu = typeof doc.getElementById === "function" ? doc.getElementById(menuId) : null;
      if (!menu) return null;
      const items = menu.querySelectorAll('button[role="menuitem"]');
      if (items.length !== 2) return null;
      const first = flattenLabel(firstSpanText(items[0]));
      const second = flattenLabel(firstSpanText(items[1]));
      const secondIsEffort = isLabel(second, EFFORT_ROW_LABELS);
      const firstIsModel = isLabel(first, MODEL_ROW_LABELS);
      if (!firstIsModel) return null;
      if (!secondIsEffort && second.length > 0) return null;
      return items[1];
    }
    function createMenuBridge(options) {
      const doc = options.doc;
      const win = options.win;
      const anchor = options.anchor;
      const active = options.active;
      const onChange = options.onChange;
      const seatLabels = options.seatLabels;
      if (!doc || typeof doc.createElement !== "function") return null;
      let current = null;
      let seat = null;
      let seatColor = "";
      let observer = null;
      let timer = null;
      let disposed = false;
      let scanFrame = null;
      const ownerToken = {};
      function composerOf() {
        const node = anchor();
        if (!node) return null;
        let el = node;
        while (el && el.nodeType === 1) {
          if (typeof el.getAttribute === "function" && el.getAttribute("data-composer-card") !== null) return el;
          el = el.parentNode;
        }
        return null;
      }
      function detach() {
        if (current === null) return;
        const { row, container, previous } = current;
        try {
          if (container && container.parentNode) container.parentNode.removeChild(container);
        } catch (error) {
        }
        try {
          if (row && row.style) {
            row.style.height = previous.height;
            row.style.flexWrap = previous.flexWrap;
            row.style.paddingTop = previous.paddingTop;
            row.style.paddingBottom = previous.paddingBottom;
            row.style.boxShadow = previous.boxShadow;
          }
          if (current.value && current.value.style) current.value.style.color = previous.valueColor;
          if (row && row.__cesOwner === ownerToken) delete row.__cesOwner;
        } catch (error) {
        }
        current = null;
        onChange(null);
      }
      function releaseSeat() {
        if (seat === null) return;
        try {
          if (seat.el && seat.el.style) seat.el.style.color = seat.previousColor;
        } catch (error) {
        }
        seat = null;
      }
      function syncSeat(composer) {
        const target = composer === void 0 ? composerOf() : composer;
        if (target === null || active() !== true) {
          releaseSeat();
          return;
        }
        if (seat !== null && seat.el) {
          const stillOurs = isConnected(seat.el) && (typeof target.contains === "function" && target.contains(seat.el) || seat.el === target);
          if (stillOurs) {
            if (seatColor && seat.el.style) seat.el.style.color = seatColor;
            return;
          }
        }
        releaseSeat();
        const wanted = typeof seatLabels === "function" ? seatLabels() : null;
        const el = findSeatEffort(doc, target, wanted);
        if (el === null || !el.style) return;
        seat = { el, previousColor: el.style.color || "" };
        if (seatColor) el.style.color = seatColor;
      }
      function batchMatters(records) {
        if (disposed) return false;
        if (!records || records.length === 0) return false;
        for (const record of records) {
          if (!record || record.type !== "childList") continue;
          const added = record.addedNodes || [];
          const removed = record.removedNodes || [];
          for (const node of removed) {
            if (current !== null && node === current.row) return true;
            if (current !== null && node === current.container) return true;
          }
          for (const node of added) {
            if (!node || node.nodeType !== 1) continue;
            const role = typeof node.getAttribute === "function" ? node.getAttribute("role") : null;
            if (role === "menu" || role === "group") return true;
            const popup = typeof node.getAttribute === "function" ? node.getAttribute("aria-haspopup") : null;
            if (popup !== null) return true;
          }
        }
        return false;
      }
      function scheduleScan() {
        if (scanFrame !== null || disposed) return;
        const run = function() {
          scanFrame = null;
          if (disposed) return;
          scan();
        };
        if (win && typeof win.requestAnimationFrame === "function") {
          scanFrame = { kind: "raf", id: win.requestAnimationFrame(run) };
          return;
        }
        scanFrame = { kind: "timeout", id: setTimeout(run, 0) };
      }
      function cancelScheduledScan() {
        if (scanFrame === null) return;
        const handle = scanFrame;
        scanFrame = null;
        try {
          if (handle.kind === "raf") {
            if (win && typeof win.cancelAnimationFrame === "function") win.cancelAnimationFrame(handle.id);
          } else {
            clearTimeout(handle.id);
          }
        } catch (error) {
        }
      }
      function isConnected(node) {
        if (!node) return false;
        if (typeof node.isConnected === "boolean") return node.isConnected;
        return !!(doc.documentElement && doc.documentElement.contains(node));
      }
      function scan() {
        if (disposed) return;
        const composer = composerOf();
        try {
          syncSeat(composer);
        } catch (error) {
        }
        try {
          if (composer === null || active() !== true) {
            detach();
            return;
          }
          if (current !== null && current.row && isConnected(current.row)) {
            const expanded = current.seat && typeof current.seat.getAttribute === "function" ? current.seat.getAttribute("aria-expanded") : null;
            if (expanded !== "false") return;
            detach();
            return;
          }
          const row = findEffortRow(doc, composer);
          if (row === null) {
            detach();
            return;
          }
          if (row.__cesOwner !== void 0 && row.__cesOwner !== ownerToken) {
            detach();
            return;
          }
          detach();
          const value = findValueElement(row);
          const previous = {
            height: row.style.height || "",
            flexWrap: row.style.flexWrap || "",
            paddingTop: row.style.paddingTop || "",
            paddingBottom: row.style.paddingBottom || "",
            boxShadow: row.style.boxShadow || "",
            valueColor: value && value.style ? value.style.color || "" : ""
          };
          row.style.height = "auto";
          row.style.flexWrap = "wrap";
          row.style.paddingTop = ROW_PADDING_BLOCK;
          row.style.paddingBottom = ROW_PADDING_BLOCK;
          const container = doc.createElement("div");
          container.className = "ces-inline";
          container.setAttribute("data-ces-part", "host");
          row.appendChild(container);
          current = { row, container, value, previous, seat: openSeatOf(composer) };
          row.__cesOwner = ownerToken;
          onChange(current);
          try {
            win.dispatchEvent(new win.Event("resize"));
          } catch (error) {
          }
        } catch (error) {
          try {
            detach();
          } catch (inner) {
          }
        }
      }
      function start() {
        scan();
        const ObserverImpl = win && (win.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null));
        if (typeof ObserverImpl === "function") {
          try {
            observer = new ObserverImpl(function(records) {
              if (!batchMatters(records)) return;
              scheduleScan();
            });
            observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
            return;
          } catch (error) {
            observer = null;
          }
        }
        if (win && typeof win.setInterval === "function") timer = win.setInterval(scheduleScan, 400);
      }
      return {
        scan,
        start,
        /** The component hands us the colour to use; applied immediately when possible. */
        setSeatColor(color) {
          seatColor = typeof color === "string" ? color : "";
          if (seat !== null && seat.el && seat.el.style) {
            try {
              seat.el.style.color = seatColor;
            } catch (error) {
            }
          }
        },
        dispose() {
          disposed = true;
          cancelScheduledScan();
          if (observer !== null) {
            try {
              observer.disconnect();
            } catch (error) {
            }
            observer = null;
          }
          if (timer !== null) {
            try {
              win.clearInterval(timer);
            } catch (error) {
            }
            timer = null;
          }
          releaseSeat();
          detach();
        },
        /** Test seam: run a mutation batch through the cheap gate + coalescing. */
        notify(records) {
          if (!batchMatters(records)) return false;
          scheduleScan();
          return true;
        },
        /** Test seam: has a coalesced scan not run yet? */
        hasPendingScan() {
          return scanFrame !== null;
        },
        host() {
          return current;
        }
      };
    }

    // client/src/directory.js
    function createDirectoryAccess(deps) {
      const ctx = deps.ctx;
      const sessionId = deps.sessionId;
      const timers = deps.timers;
      const listeners = /* @__PURE__ */ new Set();
      let directory = null;
      let unsubscribe = null;
      let last = EMPTY_SNAPSHOT;
      let retryIndex = 0;
      let retryTimer = null;
      let closed = false;
      let lastLoadAt = 0;
      function notify() {
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch (error) {
          }
        }
      }
      function scheduleRetry() {
        if (closed || retryTimer !== null || retryIndex >= RETRY_DELAYS.length) return;
        const delay = RETRY_DELAYS[retryIndex];
        retryIndex += 1;
        retryTimer = timers.set(function() {
          retryTimer = null;
          if (resolve() !== null) {
            notify();
            return;
          }
          scheduleRetry();
        }, delay);
      }
      function resolve() {
        if (closed) return null;
        let fresh = null;
        try {
          fresh = ctx.modelDirectories.directoryFor(sessionId);
        } catch (error) {
          fresh = null;
        }
        if (!fresh || !fresh.store || typeof fresh.store.getSnapshot !== "function") fresh = null;
        if (fresh === directory) return directory;
        if (unsubscribe !== null) {
          try {
            unsubscribe();
          } catch (error) {
          }
          unsubscribe = null;
        }
        directory = fresh;
        if (directory !== null) {
          retryIndex = 0;
          try {
            unsubscribe = typeof directory.store.subscribe === "function" ? directory.store.subscribe(notify) : null;
          } catch (error) {
            unsubscribe = null;
          }
          kickLoad();
        }
        return directory;
      }
      function kickLoad() {
        if (closed || directory === null || typeof directory.load !== "function") return;
        const now = Date.now();
        if (now - lastLoadAt < 400) return;
        lastLoadAt = now;
        const target = directory;
        try {
          Promise.resolve(target.load()).catch(function() {
          });
        } catch (error) {
        }
      }
      return {
        getSnapshot() {
          if (closed) return EMPTY_SNAPSHOT;
          resolve();
          if (directory === null) scheduleRetry();
          if (directory !== null) {
            try {
              const value = directory.store.getSnapshot();
              if (value && typeof value === "object") last = value;
            } catch (error) {
            }
          }
          return last;
        },
        subscribe(listener) {
          if (closed) return function() {
          };
          listeners.add(listener);
          resolve();
          if (directory === null) scheduleRetry();
          return function() {
            listeners.delete(listener);
          };
        },
        /** The directory to write through, re-resolved at call time (never a stale instance). */
        directory() {
          const fresh = resolve();
          return fresh !== null ? fresh : directory;
        },
        load: kickLoad,
        dispose() {
          closed = true;
          listeners.clear();
          if (retryTimer !== null) {
            try {
              timers.clear(retryTimer);
            } catch (error) {
            }
            retryTimer = null;
          }
          if (unsubscribe !== null) {
            try {
              unsubscribe();
            } catch (error) {
            }
            unsubscribe = null;
          }
          directory = null;
        }
      };
    }

    // client/src/component.js
    var levelsCache = { key: null, levels: [] };
    var TRACE_LIMIT = 400;
    function createSliderComponent(deps) {
      const React2 = deps.React;
      const ReactDOM2 = deps.ReactDOM;
      const ctx = deps.ctx;
      const settings = deps.settings;
      const prefersReduced = deps.reducedMotion;
      const trace = deps.trace;
      const h = React2.createElement;
      function motionParamsFor(mode) {
        if (mode === "quick") return MOTION_REDUCED;
        if (mode === "fast") return MOTION_FAST;
        return MOTION;
      }
      return function CodexEffortSlider(props) {
        const sessionId = typeof props.sessionId === "string" && props.sessionId.length > 0 ? props.sessionId : null;
        const locked = props.locked === true;
        const reduced = prefersReduced();
        const mode = reduced ? "reduced" : (function() {
          const stored = settings.read().motion;
          return stored === "quick" || stored === "fast" ? stored : "full";
        })();
        const [, setSettingsTick] = React2.useState(0);
        const anchorRef = React2.useRef(null);
        const trackRef = React2.useRef(null);
        const settingsRef = React2.useRef(settings);
        settingsRef.current = settings;
        const access = React2.useMemo(function() {
          if (sessionId === null || !ctx) return null;
          return createDirectoryAccess({
            ctx,
            sessionId,
            timers: {
              set: function(fn, delay) {
                return setTimeout(fn, delay);
              },
              clear: function(handle) {
                clearTimeout(handle);
              }
            }
          });
        }, [ctx, sessionId]);
        React2.useEffect(function() {
          const bump = function() {
            setSettingsTick(function(n) {
              return n + 1;
            });
          };
          settingsRef.current = settings;
          let remove = null;
          if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener(settings.event, bump);
            remove = function() {
              window.removeEventListener(settings.event, bump);
            };
          }
          return function() {
            if (remove !== null) remove();
          };
        }, [settings]);
        React2.useEffect(function() {
          return function() {
            if (access !== null) access.dispose();
          };
        }, [access]);
        const subscribe = React2.useCallback(function(onChange) {
          return access === null ? function() {
          } : access.subscribe(onChange);
        }, [access]);
        const getSnapshot = React2.useCallback(function() {
          return access === null ? EMPTY_SNAPSHOT : access.getSnapshot();
        }, [access]);
        const state = React2.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
        const liveLevels = levelsOf(state);
        const liveKey = state && state.current && typeof state.current.provider === "string" && typeof state.current.model === "string" ? state.current.provider + "\0" + state.current.model : null;
        const levels = resolveLevels(liveLevels, liveKey, levelsCache, reasoningSupport(state));
        const effectiveId = effectiveEffortId(state);
        const committedIndex = indexOfLevel(levels, effectiveId);
        const levelCount = levels.length;
        const draftState = React2.useState(null);
        const draft = draftState[0];
        const setDraft = draftState[1];
        const optimisticState = React2.useState(null);
        const optimistic = optimisticState[0];
        const setOptimistic = optimisticState[1];
        const errorState = React2.useState(null);
        const errorText = errorState[0];
        const setError = errorState[1];
        const busyState = React2.useState(false);
        const busy = busyState[0];
        const setBusy = busyState[1];
        const hostState = React2.useState(null);
        const host = hostState[0];
        const setHost = hostState[1];
        const optimisticIdRef = React2.useRef(null);
        const draftRef = React2.useRef(null);
        const commitRef = React2.useRef({ timer: null, inFlight: false, queued: null, safetyTimer: null });
        const draggingRef = React2.useRef(false);
        const buttonDownRef = React2.useRef(false);
        const levelCountRef = React2.useRef(0);
        const levelsRef = React2.useRef([]);
        const lastValidIndexRef = React2.useRef(0);
        const lastCommittedIndexRef = React2.useRef(-1);
        const seatNamesRef = React2.useRef([]);
        const effectivePctRef = React2.useRef(0);
        const holdFramesRef = React2.useRef(0);
        const detentIndexRef = React2.useRef(-1);
        const snapIndexRef = React2.useRef(null);
        const bridgeRef = React2.useRef(null);
        const metricsRef = React2.useRef(null);
        const endDragRef = React2.useRef(null);
        const motionRef = React2.useRef(null);
        const frameRef = React2.useRef(null);
        const lastTsRef = React2.useRef(0);
        const lastPtrPctRef = React2.useRef(null);
        const lastPointerAtRef = React2.useRef(0);
        levelCountRef.current = levelCount;
        levelsRef.current = levels;
        const canRender = levelCount > 0;
        const optimisticId = optimistic !== null && typeof optimistic.id === "string" ? optimistic.id : null;
        const optimisticIndex = optimisticId === null ? -1 : indexOfLevel(levels, optimisticId);
        if (committedIndex >= 0) lastValidIndexRef.current = committedIndex;
        const midIndex = Math.max(0, Math.min(Math.max(0, levelCount - 1), Math.floor((levelCount - 1) / 2)));
        const lastIdx = lastValidIndexRef.current;
        const fallbackIndex = typeof lastIdx === "number" && lastIdx >= 0 && lastIdx < levelCount ? lastIdx : midIndex;
        let effectiveIndex = committedIndex >= 0 ? committedIndex : fallbackIndex;
        if (optimisticIndex >= 0) effectiveIndex = optimisticIndex;
        const effectivePct = pctFromIndex(effectiveIndex, levelCount);
        effectivePctRef.current = effectivePct;
        const effectiveLevel = levels[effectiveIndex] || null;
        const seatNames = [];
        for (const level of levels) {
          if (level && typeof level.name === "string" && level.name.length > 0) seatNames.push(level.name);
        }
        seatNamesRef.current = seatNames;
        const shownIndex = draft !== null ? draft.index : effectiveIndex;
        const shownPct = draft !== null && typeof draft.pct === "number" ? draft.pct : effectivePct;
        const shownLevel = levels[shownIndex] || null;
        const energy = energyFor(shownPct);
        const energyOn = energy > 0;
        const fillBackground = fillBackgroundFor(shownPct);
        const knobOffset = knobOffsetOf(shownPct);
        function motionParams() {
          return motionParamsFor(mode);
        }
        function ensureMotion() {
          if (motionRef.current === null) {
            const x0 = draftRef.current !== null && typeof draftRef.current.pct === "number" ? draftRef.current.pct : shownPct;
            motionRef.current = { x: x0, v: 0, a: 0, target: x0, vPtr: 0 };
          }
          return motionRef.current;
        }
        function draftIndexFor(m) {
          if (draggingRef.current) return indexFromPct(m.x, levelCountRef.current);
          return snapIndexRef.current !== null ? snapIndexRef.current : indexFromPct(m.x, levelCountRef.current);
        }
        function publishMotion(m) {
          const next = { pct: m.x, index: draftIndexFor(m) };
          const prev = draftRef.current;
          if (prev !== null && prev.pct === next.pct && prev.index === next.index) return;
          draftRef.current = next;
          setDraft(next);
        }
        React2.useEffect(function() {
          if (host === null || !host.row || !host.row.style) return;
          host.row.style.boxShadow = energyOn ? "inset 0 0 0 1px rgba(168,85,247," + (0.16 + 0.34 * energy).toFixed(2) + ")" : "";
        }, [host, energyOn, energy]);
        React2.useEffect(function() {
          if (host === null || !host.value || !host.value.style) return;
          host.value.style.color = valueColorFor(shownPct, shownLevel);
        }, [host, shownPct, shownLevel]);
        React2.useEffect(function() {
          if (bridgeRef.current === null) return;
          bridgeRef.current.setSeatColor(valueColorFor(effectivePct, effectiveLevel));
        }, [levelCount, effectivePct, effectiveLevel]);
        React2.useEffect(function() {
          if (optimisticId !== null && effectiveId === optimisticId) setOptimistic(null);
        }, [effectiveId, optimisticId]);
        React2.useEffect(function() {
          if (optimisticId === null) return void 0;
          const handle = setTimeout(function() {
            if (optimisticIdRef.current === optimisticId) {
              optimisticIdRef.current = null;
              setOptimistic(null);
              setError("\u6863\u4F4D\u5207\u6362\u8D85\u65F6\uFF0C\u5BBF\u4E3B\u672A\u56DE\u62A5\u7ED3\u679C\uFF08\u5DF2\u56DE\u6EDA\u663E\u793A\uFF09");
            }
          }, COMMIT_DEADLINE_MS);
          return function() {
            clearTimeout(handle);
          };
        }, [optimisticId]);
        React2.useEffect(function() {
          return function() {
            const pending = commitRef.current;
            if (pending.timer !== null) {
              clearTimeout(pending.timer);
              pending.timer = null;
            }
            if (pending.safetyTimer !== null) {
              clearTimeout(pending.safetyTimer);
              pending.safetyTimer = null;
            }
            pending.queued = null;
          };
        }, []);
        React2.useEffect(function() {
          if (typeof window === "undefined" || typeof window.addEventListener !== "function") return void 0;
          const stopDrag = function() {
            buttonDownRef.current = false;
            if (draggingRef.current && typeof endDragRef.current === "function") endDragRef.current();
          };
          window.addEventListener("pointerup", stopDrag, true);
          window.addEventListener("pointercancel", stopDrag, true);
          return function() {
            window.removeEventListener("pointerup", stopDrag, true);
            window.removeEventListener("pointercancel", stopDrag, true);
          };
        }, []);
        React2.useEffect(function() {
          if (sessionId === null || !ctx) return void 0;
          const bridge = createMenuBridge({
            doc: typeof document === "undefined" ? null : document,
            win: typeof window === "undefined" ? null : window,
            anchor: function() {
              return anchorRef.current;
            },
            active: function() {
              return levelCountRef.current > 0;
            },
            onChange: function(next) {
              setHost(next);
            },
            seatLabels: function() {
              return seatNamesRef.current;
            }
          });
          if (bridge === null) return void 0;
          bridgeRef.current = bridge;
          bridge.start();
          return function() {
            bridgeRef.current = null;
            bridge.dispose();
          };
        }, [ctx, sessionId]);
        React2.useEffect(function() {
          if (host === null) return void 0;
          const metrics = createTrackMetrics({
            track: function() {
              return trackRef.current;
            },
            SizeWatcherImpl: typeof ResizeObserver === "function" ? ResizeObserver : null
          });
          metricsRef.current = metrics;
          metrics.start();
          return function() {
            metricsRef.current = null;
            metrics.dispose();
          };
        }, [host]);
        React2.useEffect(function() {
          if (bridgeRef.current !== null) bridgeRef.current.scan();
        }, [levelCount]);
        React2.useEffect(function() {
          const m = motionRef.current;
          if (m === null) return;
          if (draftRef.current !== null) return;
          m.x = effectivePct;
          m.v = 0;
          m.a = 0;
          m.target = effectivePct;
          m.vPtr = 0;
        }, [effectivePct]);
        const modelIdentity = liveKey;
        React2.useEffect(function() {
          const pending = commitRef.current;
          if (pending.timer !== null) {
            clearTimeout(pending.timer);
            pending.timer = null;
          }
          if (pending.safetyTimer !== null) {
            clearTimeout(pending.safetyTimer);
            pending.safetyTimer = null;
          }
          pending.queued = null;
          optimisticIdRef.current = null;
          setOptimistic(null);
          setBusy(false);
          setError(null);
          setDraft(null);
          draftRef.current = null;
          snapIndexRef.current = null;
          detentIndexRef.current = -1;
          holdFramesRef.current = 0;
          lastValidIndexRef.current = 0;
          lastCommittedIndexRef.current = -1;
          draggingRef.current = false;
          buttonDownRef.current = false;
          cancelFrame(frameRef.current);
          frameRef.current = null;
          const m = motionRef.current;
          if (m !== null) {
            m.x = effectivePct;
            m.v = 0;
            m.a = 0;
            m.target = effectivePct;
            m.vPtr = 0;
          }
          trace({ k: "model-reset", identity: modelIdentity });
        }, [modelIdentity]);
        React2.useEffect(function() {
          return function() {
            cancelFrame(frameRef.current);
            frameRef.current = null;
          };
        }, []);
        function currentState() {
          return access === null ? EMPTY_SNAPSHOT : access.getSnapshot();
        }
        function flush() {
          const pending = commitRef.current;
          if (pending.timer !== null) {
            clearTimeout(pending.timer);
            pending.timer = null;
          }
          const queued = pending.queued;
          pending.queued = null;
          if (pending.safetyTimer !== null) {
            clearTimeout(pending.safetyTimer);
            pending.safetyTimer = null;
          }
          trace({ k: "flush", id: queued === null ? null : queued.levelId });
          if (queued === null || queued === void 0 || access === null) return;
          const directory = access.directory();
          const snapshot = currentState();
          const current = snapshot && snapshot.current;
          if (!current || typeof current.provider !== "string" || typeof current.model !== "string") {
            setError("\u6A21\u578B\u76EE\u5F55\u5C1A\u672A\u5C31\u7EEA\uFF0C\u65E0\u6CD5\u5199\u5165\u6863\u4F4D");
            return;
          }
          if (queued.provider !== current.provider || queued.model !== current.model) {
            trace({ k: "flush-drop", why: "model-changed", id: queued.levelId, queuedFor: queued.model, now: current.model });
            return;
          }
          const currentLevels = levelsRef.current;
          const knownLevels = currentLevels.length > 0 ? currentLevels : [];
          const listed = knownLevels.length > 0 ? knownLevels.some(function(level) {
            return level.id === queued.levelId;
          }) : queued.levels !== null && queued.levels.indexOf(queued.levelId) >= 0;
          if (!listed) {
            trace({ k: "flush-drop", why: "level-gone", id: queued.levelId });
            return;
          }
          if (effectiveEffortId(snapshot) === queued.levelId) {
            trace({ k: "flush-skip", id: queued.levelId, why: "dedupe" });
            return;
          }
          const levelId = queued.levelId;
          if (directory === null || typeof directory.select !== "function") {
            setError("\u6A21\u578B\u76EE\u5F55\u4E0D\u53EF\u7528\uFF0C\u6863\u4F4D\u672A\u5199\u5165");
            return;
          }
          pending.inFlight = true;
          optimisticIdRef.current = levelId;
          setOptimistic({ id: levelId });
          setError(null);
          setBusy(true);
          let result;
          try {
            result = directory.select({ provider: current.provider, model: current.model, reasoningEffort: levelId });
          } catch (error) {
            result = Promise.reject(error);
          }
          Promise.resolve(result).then(
            function(outcome) {
              pending.inFlight = false;
              trace({ k: outcome && outcome.ok === false ? "commit-fail" : "commit-ok" });
              if (outcome && outcome.ok === false) {
                optimisticIdRef.current = null;
                setOptimistic(null);
                setError(errorTextOf(outcome.error));
              }
            },
            function(error) {
              pending.inFlight = false;
              optimisticIdRef.current = null;
              setOptimistic(null);
              setError(errorTextOf(error));
            }
          ).then(function() {
            setBusy(false);
            if (pending.queued !== null) flush();
          });
        }
        function requestCommit(levelId, immediate) {
          if (levelId === null || levelId === void 0) return;
          const pending = commitRef.current;
          const snapshot = currentState();
          if (effectiveEffortId(snapshot) === levelId && pending.queued === null && !pending.inFlight) return;
          const current = snapshot && snapshot.current;
          const ids = [];
          for (const level of levelsRef.current) ids.push(level.id);
          pending.queued = {
            levelId,
            provider: current && typeof current.provider === "string" ? current.provider : null,
            model: current && typeof current.model === "string" ? current.model : null,
            levels: ids
          };
          trace({ k: "req", id: levelId, imm: immediate === true, inFlight: pending.inFlight });
          if (pending.inFlight) {
            if (pending.safetyTimer === null) {
              const armSafety = function() {
                pending.safetyTimer = setTimeout(function() {
                  pending.safetyTimer = null;
                  if (pending.queued === null) return;
                  if (pending.inFlight) {
                    armSafety();
                    return;
                  }
                  trace({ k: "safety-flush", id: pending.queued.levelId });
                  flush();
                }, 50);
              };
              armSafety();
            }
            return;
          }
          if (immediate === true) {
            flush();
            return;
          }
          if (pending.timer !== null) return;
          pending.timer = setTimeout(function() {
            pending.timer = null;
            flush();
          }, COMMIT_THROTTLE_MS);
        }
        function startFrames() {
          if (frameRef.current !== null) return;
          lastTsRef.current = nowMs();
          const step = function(ts) {
            frameRef.current = null;
            const m = motionRef.current;
            if (m === null) return;
            const p = motionParams();
            const dt = Math.min(MAX_FRAME_DT, Math.max(1e-3, (ts - lastTsRef.current) / 1e3));
            lastTsRef.current = ts;
            const sincePointer = (ts - lastPointerAtRef.current) / 1e3;
            m.vPtr = decayPointerSpeed(m.vPtr, sincePointer, POINTER_STALE_S, POINTER_SPEED_TAU);
            motionStep(m, dt, p);
            if (motionSettled(m, p)) {
              m.x = m.target;
              m.v = 0;
              m.a = 0;
              if (draggingRef.current) {
                publishMotion(m);
                frameRef.current = scheduleFrame(step);
                return;
              }
              if (Math.abs(effectivePctRef.current - m.target) > 1e-3 && holdFramesRef.current < 45) {
                holdFramesRef.current += 1;
                draftRef.current = { pct: m.target, index: snapIndexRef.current };
                publishMotion(m);
                frameRef.current = scheduleFrame(step);
                return;
              }
              holdFramesRef.current = 0;
              draftRef.current = null;
              snapIndexRef.current = null;
              setDraft(null);
              return;
            }
            publishMotion(m);
            frameRef.current = scheduleFrame(step);
          };
          frameRef.current = scheduleFrame(step);
        }
        function jumpTo(targetPct) {
          const m = ensureMotion();
          m.target = targetPct;
          m.x = targetPct;
          m.v = 0;
          m.a = 0;
          m.vPtr = 0;
        }
        function pctAt(clientX) {
          const metrics = metricsRef.current;
          if (metrics === null) return null;
          return metrics.pctAt(clientX, KNOB_RADIUS);
        }
        function swallow(event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        }
        function moveTo(clientX) {
          if (levelCount === 0) return;
          const pct = pctAt(clientX);
          if (pct === null) return;
          const m = ensureMotion();
          const now = nowMs();
          const dtPtr = (now - lastPointerAtRef.current) / 1e3;
          if (lastPtrPctRef.current !== null && dtPtr > 1e-3) {
            const raw = (pct - lastPtrPctRef.current) / dtPtr;
            m.vPtr = m.vPtr * (1 - POINTER_SPEED_EMA) + clampAbs(raw, MOTION.vmax) * POINTER_SPEED_EMA;
          }
          lastPtrPctRef.current = pct;
          lastPointerAtRef.current = now;
          const fastMode = mode === "fast";
          if (fastMode) {
            const pos = pct * Math.max(1, levelCount - 1);
            let cur = detentIndexRef.current;
            if (!(cur >= 0)) cur = indexFromPct(m.target, levelCount);
            cur = detentTargetIndex(pos, cur, levelCount, DETENT_THIRD);
            detentIndexRef.current = cur;
            m.target = pctFromIndex(cur, levelCount);
          } else {
            m.target = pct;
          }
          const nowIndex = fastMode ? detentIndexRef.current : indexFromPct(pct, levelCount);
          if (nowIndex >= 0 && nowIndex !== lastCommittedIndexRef.current) {
            lastCommittedIndexRef.current = nowIndex;
            requestCommit(levels[nowIndex].id, false);
          }
          if (mode === "reduced") {
            jumpTo(m.target);
            draftRef.current = { pct: m.target, index: indexFromPct(m.target, levelCount) };
            setDraft(draftRef.current);
            return;
          }
          startFrames();
        }
        function endDrag() {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          const m = ensureMotion();
          const levelCountNow = levelCountRef.current;
          const levelsNow = levelsRef.current;
          if (!(levelCountNow > 0) || !levelsNow || levelsNow.length < levelCountNow) {
            trace({ k: "release-abort", why: "levelCount=0" });
            return;
          }
          let idx;
          if (mode === "fast") {
            idx = detentIndexRef.current >= 0 ? detentIndexRef.current : indexFromPct(m.target, levelCountNow);
            idx = Math.max(0, Math.min(levelCountNow - 1, idx));
            m.vPtr = 0;
            m.target = pctFromIndex(idx, levelCountNow);
          } else {
            idx = releaseIndexFor(m.target, m.vPtr, levelCountNow);
            m.vPtr = 0;
            if (mode === "reduced") {
              jumpTo(pctFromIndex(idx, levelCountNow));
            } else {
              m.target = pctFromIndex(idx, levelCountNow);
            }
          }
          snapIndexRef.current = idx;
          if (idx >= 0 && idx < levelCountNow) requestCommit(levelsNow[idx].id, true);
          trace({ k: "release", idx, x: m.x, target: m.target });
          if (mode === "reduced") {
            draftRef.current = null;
            snapIndexRef.current = null;
            setDraft(null);
            return;
          }
          publishMotion(m);
          startFrames();
        }
        endDragRef.current = endDrag;
        function onTrackPointerDown(event) {
          if (locked || levelCount === 0) return;
          swallow(event);
          draggingRef.current = true;
          buttonDownRef.current = true;
          lastCommittedIndexRef.current = -1;
          detentIndexRef.current = -1;
          if (metricsRef.current !== null) metricsRef.current.measure();
          if (mode === "fast") {
            const p0 = pctAt(event.clientX);
            if (p0 !== null && levelCount > 0) detentIndexRef.current = indexFromPct(p0, levelCount);
          }
          holdFramesRef.current = 0;
          snapIndexRef.current = null;
          try {
            if (event.currentTarget && typeof event.currentTarget.setPointerCapture === "function" && event.pointerId !== void 0) {
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          } catch (error) {
          }
          lastPtrPctRef.current = null;
          moveTo(event.clientX);
        }
        function onTrackPointerMove(event) {
          if (!draggingRef.current) return;
          if (event && event.buttons === 0 && buttonDownRef.current !== true) return;
          swallow(event);
          moveTo(event.clientX);
        }
        function onKeyDown(event) {
          if (locked || levelCount === 0) return;
          const index = draftRef.current !== null ? draftRef.current.index : shownIndex;
          let next = null;
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(0, index - 1);
          else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(levelCount - 1, index + 1);
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = levelCount - 1;
          else return;
          swallow(event);
          if (typeof event.preventDefault === "function") event.preventDefault();
          const targetPct = pctFromIndex(next, levelCount);
          if (mode === "reduced") {
            jumpTo(targetPct);
            snapIndexRef.current = null;
            draftRef.current = null;
            setDraft(null);
          } else {
            const m = ensureMotion();
            snapIndexRef.current = next;
            m.target = targetPct;
            m.vPtr = 0;
            publishMotion(m);
            startFrames();
          }
          requestCommit(levels[next].id, true);
        }
        let portal = null;
        if (host !== null && host.container && canRender) {
          const tickNodes = [];
          for (let t = 0; t < levelCount; t += 1) {
            tickNodes.push(h("span", {
              key: "tick-" + levels[t].id,
              className: "ces-tick",
              "data-ces-part": "tick",
              "data-on": t <= shownIndex ? "1" : "0",
              style: { left: knobOffsetOf(pctFromIndex(t, levelCount)) }
            }));
          }
          const positionSpeed = speedFor(shownPct);
          const starCount = reduced ? 0 : starCountFor(shownPct);
          const starLayerOpacity = starLayerOpacityFor(shownPct);
          const particleNodes = [];
          for (let s = 0; s < starCount; s += 1) {
            const brightness = starBrightnessFor(s);
            const duration = starDurationFor(s, positionSpeed);
            particleNodes.push(h("span", {
              key: "star-" + s,
              className: "ces-star",
              "data-ces-part": "star",
              style: {
                top: PARTICLES[s].y + "%",
                animationDuration: duration.toFixed(3) + "s",
                animationDelay: starDelayFor(s, duration).toFixed(3) + "s"
              }
            }, h("span", {
              className: "ces-star__dot",
              "data-ces-part": "particle",
              "data-brightness": brightness.toFixed(3),
              style: { "--ces-b": brightness.toFixed(3) }
            })));
          }
          const track = h(
            "div",
            {
              ref: trackRef,
              className: "ces-track",
              "data-ces-part": "track",
              role: "slider",
              tabIndex: locked ? -1 : 0,
              "aria-label": "\u63A8\u7406\u7B49\u7EA7",
              "aria-valuemin": 0,
              "aria-valuemax": Math.max(0, levelCount - 1),
              "aria-valuenow": shownIndex,
              "aria-valuetext": shownLevel !== null ? shownLevel.name : "",
              "aria-disabled": locked ? "true" : void 0,
              title: "\u63A8\u7406\u7B49\u7EA7" + (shownLevel !== null ? "\uFF1A" + shownLevel.name : ""),
              onPointerDown: onTrackPointerDown,
              onPointerMove: onTrackPointerMove,
              onPointerUp: endDrag,
              onPointerCancel: endDrag,
              onKeyDown,
              onClick: swallow
            },
            // Fill: width reaches the knob CENTRE (not the whole track), background is
            // "blue on the left → this position's colour on the right".
            h("div", {
              className: "ces-fill",
              "data-ces-part": "fill",
              style: { width: knobOffset, background: fillBackground }
            }),
            // Energy layer (nebula + sweep): opacity = energy, which is what fades it in.
            h(
              "div",
              { className: "ces-energy", "data-ces-part": "energy", style: { width: knobOffset } },
              h("div", { className: "ces-energy__sweep", "data-ces-part": "sweep" })
            ),
            // Stars on their own layer: they must not fade in with the nebula.
            h("div", {
              className: "ces-stars",
              "data-ces-part": "stars",
              style: { width: knobOffset, opacity: starLayerOpacity.toFixed(3) }
            }, particleNodes),
            tickNodes,
            h("div", { className: "ces-knob", "data-ces-part": "knob", style: { left: knobOffset } })
          );
          portal = ReactDOM2.createPortal(
            h(
              "div",
              {
                className: "ces-inline",
                "data-ces-part": "root",
                "data-energy": energyOn ? "1" : "0",
                "data-motion": mode,
                "data-reached-ticks": settings.read().reachedTicks,
                "data-busy": busy ? "1" : "0",
                style: { "--ces-energy": String(energy) }
              },
              track,
              errorText !== null ? h("div", { className: "ces-error", "data-ces-part": "error", role: "status" }, errorText) : null
            ),
            host.container
          );
        }
        return h("span", {
          ref: anchorRef,
          hidden: true,
          "data-ces-part": "anchor",
          "aria-hidden": "true"
        }, portal);
      };
    }
    function errorTextOf(error) {
      if (error === null || error === void 0) return "\u6863\u4F4D\u5207\u6362\u5931\u8D25";
      if (typeof error === "string") return error;
      if (typeof error.message === "string" && error.message.length > 0) return error.message;
      if (typeof error.code === "string" && error.code.length > 0) return error.code;
      return String(error);
    }
    function createTrace() {
      const buffer = [];
      const push = function(entry) {
        try {
          buffer.push(entry);
          if (buffer.length > TRACE_LIMIT) buffer.splice(0, buffer.length - TRACE_LIMIT);
        } catch (error) {
        }
      };
      return {
        push,
        clear() {
          buffer.length = 0;
        },
        size() {
          return buffer.length;
        },
        dump() {
          try {
            const lines = ["=== \u63A8\u7406\u7B49\u7EA7\u6ED1\u6761\u8BCA\u65AD " + (/* @__PURE__ */ new Date()).toISOString() + " ==="];
            lines.push("\u8BB0\u5F55 " + buffer.length + " \u6761");
            for (const entry of buffer.slice(-TRACE_LIMIT)) lines.push(JSON.stringify(entry));
            return lines.join("\n");
          } catch (error) {
            return "\u8BCA\u65AD\u751F\u6210\u5931\u8D25: " + String(error);
          }
        }
      };
    }

    // client/src/index.js
    var name = PLUGIN_ID;
    var inject = ["slots", "sessions", "modelDirectories", "remote", "remote.session"];
    var React = (function requireReact() {
      try {
        return require("react");
      } catch (error) {
        return null;
      }
    })();
    var ReactDOM = (function requireReactDOM() {
      try {
        return require("react-dom");
      } catch (error) {
        return null;
      }
    })();
    var apply = React === null || ReactDOM === null ? function applyWithoutReact() {
    } : function apply2(ctx) {
      const doc = typeof document === "undefined" ? null : document;
      const win = typeof window === "undefined" ? null : window;
      ctx.effect(function() {
        const styles = installStyles(doc);
        let storage;
        try {
          storage = win && win.localStorage ? win.localStorage : void 0;
        } catch (error) {
          storage = void 0;
        }
        const settings = createSettingsStore({ storage, win });
        const trace = createTrace();
        const settingsUi = createSettingsUi({
          doc,
          win,
          store: settings,
          copy: function(text) {
            if (!win || !win.navigator || !win.navigator.clipboard) throw new Error("no clipboard");
            return win.navigator.clipboard.writeText(text);
          },
          diagnostics: function() {
            return trace.dump();
          }
        });
        settingsUi.install();
        function reducedMotion() {
          try {
            return !!(win && typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches === true);
          } catch (error) {
            return false;
          }
        }
        const Component = createSliderComponent({
          React,
          ReactDOM,
          ctx,
          settings,
          reducedMotion,
          trace: function(entry) {
            trace.push(entry);
          }
        });
        let removeSlot = null;
        try {
          ctx.slots.inject(SLOT_NAME, function() {
            const registration = ctx.slots.register(
              {
                name: SLOT_NAME,
                id: ENTRY_ID,
                order: ENTRY_ORDER,
                label: function() {
                  return "Reasoning effort";
                },
                // A second source for the session id (standard props usually carry it;
                // both paths agree on `props.sessionId`).
                inject: function(sessionId) {
                  return { sessionId };
                }
              },
              function SlotComponent(props) {
                return React.createElement(Component, props);
              }
            );
            if (registration && typeof registration.dispose === "function") removeSlot = function() {
              registration.dispose();
            };
            return registration;
          });
        } catch (error) {
          try {
            console.error("[codex-effort-slider] \u63D2\u69FD\u6CE8\u518C\u5931\u8D25\uFF0C\u6ED1\u6761\u4E0D\u4F1A\u51FA\u73B0\uFF1A", error);
          } catch (inner) {
          }
        }
        return function dispose() {
          if (removeSlot !== null) {
            try {
              removeSlot();
            } catch (error) {
            }
            removeSlot = null;
          }
          settingsUi.dispose();
          styles.dispose();
          trace.clear();
        };
      }, "dsh-codex-effort-slider: effort slider");
    };
    return module.exports
  },
})
