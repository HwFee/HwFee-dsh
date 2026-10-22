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

    // client/src/frame-bridge.js
    var MAX_INTERACT_CHARS = 2e3;
    var MAX_INTERACT_BYTES = 2e3;
    var MIN_HEIGHT = 1;
    var MAX_HEIGHT = 2e4;
    var FRAME_MESSAGE_TYPES = ["height", "interact", "failed"];
    var OPAQUE_ORIGIN = "null";
    function utf8Bytes(text) {
      let bytes = 0;
      const value = typeof text === "string" ? text : "";
      for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code < 128) bytes += 1;
        else if (code < 2048) bytes += 2;
        else if (code >= 55296 && code <= 56319) {
          const next = value.charCodeAt(index + 1);
          if (next >= 56320 && next <= 57343) {
            bytes += 4;
            index += 1;
          } else bytes += 3;
        } else bytes += 3;
      }
      return bytes;
    }
    function validateFrameMessage(event, expected) {
      const source = expected?.source;
      const token = expected?.token;
      if (event === null || typeof event !== "object") return { ok: false, reason: "not-an-event" };
      if (typeof token !== "string" || token === "") return { ok: false, reason: "no-token-configured" };
      if (source === null || source === void 0) return { ok: false, reason: "no-source-configured" };
      if (event.source !== source) return { ok: false, reason: "source-mismatch" };
      if (event.origin !== OPAQUE_ORIGIN) return { ok: false, reason: "origin-not-opaque" };
      const data = event.data;
      if (data === null || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "not-an-object" };
      if (typeof data.type !== "string" || !FRAME_MESSAGE_TYPES.includes(data.type)) {
        return { ok: false, reason: "unknown-type" };
      }
      if (data.token !== token) return { ok: false, reason: "token-mismatch" };
      if (data.type === "height") {
        const height = data.height;
        if (typeof height !== "number" || !Number.isFinite(height)) return { ok: false, reason: "height-not-a-number" };
        if (height < MIN_HEIGHT || height > MAX_HEIGHT) return { ok: false, reason: "height-out-of-range" };
        return { ok: true, type: "height", height: Math.round(height) };
      }
      if (data.type === "interact") {
        const text = data.text;
        if (typeof text !== "string") return { ok: false, reason: "text-not-a-string" };
        const trimmed = text.trim();
        if (trimmed === "") return { ok: false, reason: "text-empty" };
        if (trimmed.length > MAX_INTERACT_CHARS) return { ok: false, reason: "text-too-long" };
        if (utf8Bytes(trimmed) > MAX_INTERACT_BYTES) return { ok: false, reason: "text-too-long" };
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trimmed)) return { ok: false, reason: "text-has-control-chars" };
        return { ok: true, type: "interact", text: trimmed };
      }
      const detail = data.detail;
      if (typeof detail !== "string") return { ok: true, type: "failed", detail: "" };
      return { ok: true, type: "failed", detail: detail.slice(0, 500) };
    }
    function createInteractGate({ now = () => Date.now(), minIntervalMs = 1e3, maxPerCard = 20 } = {}) {
      let pending = null;
      let accepted = 0;
      let lastAcceptedAt = Number.NEGATIVE_INFINITY;
      return {
        /**
         * @param {string} text a validated request
         * @returns {{ ok: true } | { ok: false, reason: string }} whether it became pending
         */
        request(text) {
          if (pending !== null) return { ok: false, reason: "already-pending" };
          if (accepted >= maxPerCard) return { ok: false, reason: "cap-reached" };
          const at = now();
          if (at - lastAcceptedAt < minIntervalMs) return { ok: false, reason: "too-soon" };
          pending = { text, at };
          return { ok: true };
        },
        /** The text waiting for the user's click, or null. */
        getPending() {
          return pending;
        },
        /** Called when the user's own button was clicked. Returns the text to send, or null. */
        accept() {
          if (pending === null) return null;
          const text = pending.text;
          pending = null;
          accepted += 1;
          lastAcceptedAt = now();
          return text;
        },
        /** Called when the user dismissed the request, or the card went away. */
        clear() {
          pending = null;
        },
        /** How many messages this card has actually sent (for tests and diagnostics). */
        getAcceptedCount() {
          return accepted;
        }
      };
    }
    function encodeJsonForScript(value) {
      return JSON.stringify(value ?? null).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    function encodeCssForStyle(css) {
      return String(css ?? "").replace(/<\/(style|script)/gi, "<\\/$1");
    }

    // client/src/frame/runtime.bundle.json
    var runtime_bundle_default = { js: '(()=>{var Ic=Object.create;var Yi=Object.defineProperty;var Dc=Object.getOwnPropertyDescriptor;var Fc=Object.getOwnPropertyNames;var jc=Object.getPrototypeOf,Uc=Object.prototype.hasOwnProperty;var vt=(e,t)=>()=>(t||e((t={exports:{}}).exports,t),t.exports);var Ac=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let l of Fc(t))!Uc.call(e,l)&&l!==n&&Yi(e,l,{get:()=>t[l],enumerable:!(r=Dc(t,l))||r.enumerable});return e};var Xi=(e,t,n)=>(n=e!=null?Ic(jc(e)):{},Ac(t||!e||!e.__esModule?Yi(n,"default",{value:e,enumerable:!0}):n,e));var iu=vt(N=>{"use strict";var an=Symbol.for("react.element"),Vc=Symbol.for("react.portal"),Hc=Symbol.for("react.fragment"),Bc=Symbol.for("react.strict_mode"),$c=Symbol.for("react.profiler"),Wc=Symbol.for("react.provider"),Qc=Symbol.for("react.context"),Kc=Symbol.for("react.forward_ref"),Yc=Symbol.for("react.suspense"),Xc=Symbol.for("react.memo"),Gc=Symbol.for("react.lazy"),Gi=Symbol.iterator;function Zc(e){return e===null||typeof e!="object"?null:(e=Gi&&e[Gi]||e["@@iterator"],typeof e=="function"?e:null)}var qi={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},bi=Object.assign,eu={};function Ot(e,t,n){this.props=e,this.context=t,this.refs=eu,this.updater=n||qi}Ot.prototype.isReactComponent={};Ot.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")};Ot.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function tu(){}tu.prototype=Ot.prototype;function xl(e,t,n){this.props=e,this.context=t,this.refs=eu,this.updater=n||qi}var _l=xl.prototype=new tu;_l.constructor=xl;bi(_l,Ot.prototype);_l.isPureReactComponent=!0;var Zi=Array.isArray,nu=Object.prototype.hasOwnProperty,Nl={current:null},ru={key:!0,ref:!0,__self:!0,__source:!0};function lu(e,t,n){var r,l={},o=null,i=null;if(t!=null)for(r in t.ref!==void 0&&(i=t.ref),t.key!==void 0&&(o=""+t.key),t)nu.call(t,r)&&!ru.hasOwnProperty(r)&&(l[r]=t[r]);var u=arguments.length-2;if(u===1)l.children=n;else if(1<u){for(var s=Array(u),c=0;c<u;c++)s[c]=arguments[c+2];l.children=s}if(e&&e.defaultProps)for(r in u=e.defaultProps,u)l[r]===void 0&&(l[r]=u[r]);return{$$typeof:an,type:e,key:o,ref:i,props:l,_owner:Nl.current}}function Jc(e,t){return{$$typeof:an,type:e.type,key:t,ref:e.ref,props:e.props,_owner:e._owner}}function Pl(e){return typeof e=="object"&&e!==null&&e.$$typeof===an}function qc(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(n){return t[n]})}var Ji=/\\/+/g;function Cl(e,t){return typeof e=="object"&&e!==null&&e.key!=null?qc(""+e.key):t.toString(36)}function nr(e,t,n,r,l){var o=typeof e;(o==="undefined"||o==="boolean")&&(e=null);var i=!1;if(e===null)i=!0;else switch(o){case"string":case"number":i=!0;break;case"object":switch(e.$$typeof){case an:case Vc:i=!0}}if(i)return i=e,l=l(i),e=r===""?"."+Cl(i,0):r,Zi(l)?(n="",e!=null&&(n=e.replace(Ji,"$&/")+"/"),nr(l,t,n,"",function(c){return c})):l!=null&&(Pl(l)&&(l=Jc(l,n+(!l.key||i&&i.key===l.key?"":(""+l.key).replace(Ji,"$&/")+"/")+e)),t.push(l)),1;if(i=0,r=r===""?".":r+":",Zi(e))for(var u=0;u<e.length;u++){o=e[u];var s=r+Cl(o,u);i+=nr(o,t,n,s,l)}else if(s=Zc(e),typeof s=="function")for(e=s.call(e),u=0;!(o=e.next()).done;)o=o.value,s=r+Cl(o,u++),i+=nr(o,t,n,s,l);else if(o==="object")throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.");return i}function tr(e,t,n){if(e==null)return e;var r=[],l=0;return nr(e,r,"","",function(o){return t.call(n,o,l++)}),r}function bc(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(n){(e._status===0||e._status===-1)&&(e._status=1,e._result=n)},function(n){(e._status===0||e._status===-1)&&(e._status=2,e._result=n)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var te={current:null},rr={transition:null},ef={ReactCurrentDispatcher:te,ReactCurrentBatchConfig:rr,ReactCurrentOwner:Nl};function ou(){throw Error("act(...) is not supported in production builds of React.")}N.Children={map:tr,forEach:function(e,t,n){tr(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return tr(e,function(){t++}),t},toArray:function(e){return tr(e,function(t){return t})||[]},only:function(e){if(!Pl(e))throw Error("React.Children.only expected to receive a single React element child.");return e}};N.Component=Ot;N.Fragment=Hc;N.Profiler=$c;N.PureComponent=xl;N.StrictMode=Bc;N.Suspense=Yc;N.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=ef;N.act=ou;N.cloneElement=function(e,t,n){if(e==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+e+".");var r=bi({},e.props),l=e.key,o=e.ref,i=e._owner;if(t!=null){if(t.ref!==void 0&&(o=t.ref,i=Nl.current),t.key!==void 0&&(l=""+t.key),e.type&&e.type.defaultProps)var u=e.type.defaultProps;for(s in t)nu.call(t,s)&&!ru.hasOwnProperty(s)&&(r[s]=t[s]===void 0&&u!==void 0?u[s]:t[s])}var s=arguments.length-2;if(s===1)r.children=n;else if(1<s){u=Array(s);for(var c=0;c<s;c++)u[c]=arguments[c+2];r.children=u}return{$$typeof:an,type:e.type,key:l,ref:o,props:r,_owner:i}};N.createContext=function(e){return e={$$typeof:Qc,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},e.Provider={$$typeof:Wc,_context:e},e.Consumer=e};N.createElement=lu;N.createFactory=function(e){var t=lu.bind(null,e);return t.type=e,t};N.createRef=function(){return{current:null}};N.forwardRef=function(e){return{$$typeof:Kc,render:e}};N.isValidElement=Pl;N.lazy=function(e){return{$$typeof:Gc,_payload:{_status:-1,_result:e},_init:bc}};N.memo=function(e,t){return{$$typeof:Xc,type:e,compare:t===void 0?null:t}};N.startTransition=function(e){var t=rr.transition;rr.transition={};try{e()}finally{rr.transition=t}};N.unstable_act=ou;N.useCallback=function(e,t){return te.current.useCallback(e,t)};N.useContext=function(e){return te.current.useContext(e)};N.useDebugValue=function(){};N.useDeferredValue=function(e){return te.current.useDeferredValue(e)};N.useEffect=function(e,t){return te.current.useEffect(e,t)};N.useId=function(){return te.current.useId()};N.useImperativeHandle=function(e,t,n){return te.current.useImperativeHandle(e,t,n)};N.useInsertionEffect=function(e,t){return te.current.useInsertionEffect(e,t)};N.useLayoutEffect=function(e,t){return te.current.useLayoutEffect(e,t)};N.useMemo=function(e,t){return te.current.useMemo(e,t)};N.useReducer=function(e,t,n){return te.current.useReducer(e,t,n)};N.useRef=function(e){return te.current.useRef(e)};N.useState=function(e){return te.current.useState(e)};N.useSyncExternalStore=function(e,t,n){return te.current.useSyncExternalStore(e,t,n)};N.useTransition=function(){return te.current.useTransition()};N.version="18.3.1"});var zl=vt((yp,uu)=>{"use strict";uu.exports=iu()});var yu=vt(L=>{"use strict";function Ol(e,t){var n=e.length;e.push(t);e:for(;0<n;){var r=n-1>>>1,l=e[r];if(0<lr(l,t))e[r]=t,e[n]=l,n=r;else break e}}function Ce(e){return e.length===0?null:e[0]}function ir(e){if(e.length===0)return null;var t=e[0],n=e.pop();if(n!==t){e[0]=n;e:for(var r=0,l=e.length,o=l>>>1;r<o;){var i=2*(r+1)-1,u=e[i],s=i+1,c=e[s];if(0>lr(u,n))s<l&&0>lr(c,u)?(e[r]=c,e[s]=n,r=s):(e[r]=u,e[i]=n,r=i);else if(s<l&&0>lr(c,n))e[r]=c,e[s]=n,r=s;else break e}}return t}function lr(e,t){var n=e.sortIndex-t.sortIndex;return n!==0?n:e.id-t.id}typeof performance=="object"&&typeof performance.now=="function"?(su=performance,L.unstable_now=function(){return su.now()}):(Tl=Date,au=Tl.now(),L.unstable_now=function(){return Tl.now()-au});var su,Tl,au,Oe=[],Ge=[],tf=1,ve=null,Z=3,ur=!1,yt=!1,fn=!1,du=typeof setTimeout=="function"?setTimeout:null,pu=typeof clearTimeout=="function"?clearTimeout:null,cu=typeof setImmediate<"u"?setImmediate:null;typeof navigator<"u"&&navigator.scheduling!==void 0&&navigator.scheduling.isInputPending!==void 0&&navigator.scheduling.isInputPending.bind(navigator.scheduling);function Ml(e){for(var t=Ce(Ge);t!==null;){if(t.callback===null)ir(Ge);else if(t.startTime<=e)ir(Ge),t.sortIndex=t.expirationTime,Ol(Oe,t);else break;t=Ce(Ge)}}function Il(e){if(fn=!1,Ml(e),!yt)if(Ce(Oe)!==null)yt=!0,Fl(Dl);else{var t=Ce(Ge);t!==null&&jl(Il,t.startTime-e)}}function Dl(e,t){yt=!1,fn&&(fn=!1,pu(dn),dn=-1),ur=!0;var n=Z;try{for(Ml(t),ve=Ce(Oe);ve!==null&&(!(ve.expirationTime>t)||e&&!vu());){var r=ve.callback;if(typeof r=="function"){ve.callback=null,Z=ve.priorityLevel;var l=r(ve.expirationTime<=t);t=L.unstable_now(),typeof l=="function"?ve.callback=l:ve===Ce(Oe)&&ir(Oe),Ml(t)}else ir(Oe);ve=Ce(Oe)}if(ve!==null)var o=!0;else{var i=Ce(Ge);i!==null&&jl(Il,i.startTime-t),o=!1}return o}finally{ve=null,Z=n,ur=!1}}var sr=!1,or=null,dn=-1,mu=5,hu=-1;function vu(){return!(L.unstable_now()-hu<mu)}function Ll(){if(or!==null){var e=L.unstable_now();hu=e;var t=!0;try{t=or(!0,e)}finally{t?cn():(sr=!1,or=null)}}else sr=!1}var cn;typeof cu=="function"?cn=function(){cu(Ll)}:typeof MessageChannel<"u"?(Rl=new MessageChannel,fu=Rl.port2,Rl.port1.onmessage=Ll,cn=function(){fu.postMessage(null)}):cn=function(){du(Ll,0)};var Rl,fu;function Fl(e){or=e,sr||(sr=!0,cn())}function jl(e,t){dn=du(function(){e(L.unstable_now())},t)}L.unstable_IdlePriority=5;L.unstable_ImmediatePriority=1;L.unstable_LowPriority=4;L.unstable_NormalPriority=3;L.unstable_Profiling=null;L.unstable_UserBlockingPriority=2;L.unstable_cancelCallback=function(e){e.callback=null};L.unstable_continueExecution=function(){yt||ur||(yt=!0,Fl(Dl))};L.unstable_forceFrameRate=function(e){0>e||125<e?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):mu=0<e?Math.floor(1e3/e):5};L.unstable_getCurrentPriorityLevel=function(){return Z};L.unstable_getFirstCallbackNode=function(){return Ce(Oe)};L.unstable_next=function(e){switch(Z){case 1:case 2:case 3:var t=3;break;default:t=Z}var n=Z;Z=t;try{return e()}finally{Z=n}};L.unstable_pauseExecution=function(){};L.unstable_requestPaint=function(){};L.unstable_runWithPriority=function(e,t){switch(e){case 1:case 2:case 3:case 4:case 5:break;default:e=3}var n=Z;Z=e;try{return t()}finally{Z=n}};L.unstable_scheduleCallback=function(e,t,n){var r=L.unstable_now();switch(typeof n=="object"&&n!==null?(n=n.delay,n=typeof n=="number"&&0<n?r+n:r):n=r,e){case 1:var l=-1;break;case 2:l=250;break;case 5:l=1073741823;break;case 4:l=1e4;break;default:l=5e3}return l=n+l,e={id:tf++,callback:t,priorityLevel:e,startTime:n,expirationTime:l,sortIndex:-1},n>r?(e.sortIndex=n,Ol(Ge,e),Ce(Oe)===null&&e===Ce(Ge)&&(fn?(pu(dn),dn=-1):fn=!0,jl(Il,n-r))):(e.sortIndex=l,Ol(Oe,e),yt||ur||(yt=!0,Fl(Dl))),e};L.unstable_shouldYield=vu;L.unstable_wrapCallback=function(e){var t=Z;return function(){var n=Z;Z=t;try{return e.apply(this,arguments)}finally{Z=n}}}});var wu=vt((wp,gu)=>{"use strict";gu.exports=yu()});var Cc=vt(he=>{"use strict";var nf=zl(),pe=wu();function v(e){for(var t="https://reactjs.org/docs/error-decoder.html?invariant="+e,n=1;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n]);return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var Ns=new Set,In={};function Lt(e,t){bt(e,t),bt(e+"Capture",t)}function bt(e,t){for(In[e]=t,e=0;e<t.length;e++)Ns.add(t[e])}var $e=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),io=Object.prototype.hasOwnProperty,rf=/^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$/,Su={},ku={};function lf(e){return io.call(ku,e)?!0:io.call(Su,e)?!1:rf.test(e)?ku[e]=!0:(Su[e]=!0,!1)}function of(e,t,n,r){if(n!==null&&n.type===0)return!1;switch(typeof t){case"function":case"symbol":return!0;case"boolean":return r?!1:n!==null?!n.acceptsBooleans:(e=e.toLowerCase().slice(0,5),e!=="data-"&&e!=="aria-");default:return!1}}function uf(e,t,n,r){if(t===null||typeof t>"u"||of(e,t,n,r))return!0;if(r)return!1;if(n!==null)switch(n.type){case 3:return!t;case 4:return t===!1;case 5:return isNaN(t);case 6:return isNaN(t)||1>t}return!1}function le(e,t,n,r,l,o,i){this.acceptsBooleans=t===2||t===3||t===4,this.attributeName=r,this.attributeNamespace=l,this.mustUseProperty=n,this.propertyName=e,this.type=t,this.sanitizeURL=o,this.removeEmptyString=i}var G={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e){G[e]=new le(e,0,!1,e,null,!1,!1)});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(e){var t=e[0];G[t]=new le(t,1,!1,e[1],null,!1,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(e){G[e]=new le(e,2,!1,e.toLowerCase(),null,!1,!1)});["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(e){G[e]=new le(e,2,!1,e,null,!1,!1)});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e){G[e]=new le(e,3,!1,e.toLowerCase(),null,!1,!1)});["checked","multiple","muted","selected"].forEach(function(e){G[e]=new le(e,3,!0,e,null,!1,!1)});["capture","download"].forEach(function(e){G[e]=new le(e,4,!1,e,null,!1,!1)});["cols","rows","size","span"].forEach(function(e){G[e]=new le(e,6,!1,e,null,!1,!1)});["rowSpan","start"].forEach(function(e){G[e]=new le(e,5,!1,e.toLowerCase(),null,!1,!1)});var bo=/[\\-:]([a-z])/g;function ei(e){return e[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e){var t=e.replace(bo,ei);G[t]=new le(t,1,!1,e,null,!1,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e){var t=e.replace(bo,ei);G[t]=new le(t,1,!1,e,"http://www.w3.org/1999/xlink",!1,!1)});["xml:base","xml:lang","xml:space"].forEach(function(e){var t=e.replace(bo,ei);G[t]=new le(t,1,!1,e,"http://www.w3.org/XML/1998/namespace",!1,!1)});["tabIndex","crossOrigin"].forEach(function(e){G[e]=new le(e,1,!1,e.toLowerCase(),null,!1,!1)});G.xlinkHref=new le("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1);["src","href","action","formAction"].forEach(function(e){G[e]=new le(e,1,!1,e.toLowerCase(),null,!0,!0)});function ti(e,t,n,r){var l=G.hasOwnProperty(t)?G[t]:null;(l!==null?l.type!==0:r||!(2<t.length)||t[0]!=="o"&&t[0]!=="O"||t[1]!=="n"&&t[1]!=="N")&&(uf(t,n,l,r)&&(n=null),r||l===null?lf(t)&&(n===null?e.removeAttribute(t):e.setAttribute(t,""+n)):l.mustUseProperty?e[l.propertyName]=n===null?l.type===3?!1:"":n:(t=l.attributeName,r=l.attributeNamespace,n===null?e.removeAttribute(t):(l=l.type,n=l===3||l===4&&n===!0?"":""+n,r?e.setAttributeNS(r,t,n):e.setAttribute(t,n))))}var Ye=nf.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,ar=Symbol.for("react.element"),Dt=Symbol.for("react.portal"),Ft=Symbol.for("react.fragment"),ni=Symbol.for("react.strict_mode"),uo=Symbol.for("react.profiler"),Ps=Symbol.for("react.provider"),zs=Symbol.for("react.context"),ri=Symbol.for("react.forward_ref"),so=Symbol.for("react.suspense"),ao=Symbol.for("react.suspense_list"),li=Symbol.for("react.memo"),Je=Symbol.for("react.lazy");Symbol.for("react.scope");Symbol.for("react.debug_trace_mode");var Ts=Symbol.for("react.offscreen");Symbol.for("react.legacy_hidden");Symbol.for("react.cache");Symbol.for("react.tracing_marker");var Eu=Symbol.iterator;function pn(e){return e===null||typeof e!="object"?null:(e=Eu&&e[Eu]||e["@@iterator"],typeof e=="function"?e:null)}var j=Object.assign,Ul;function kn(e){if(Ul===void 0)try{throw Error()}catch(n){var t=n.stack.trim().match(/\\n( *(at )?)/);Ul=t&&t[1]||""}return`\n`+Ul+e}var Al=!1;function Vl(e,t){if(!e||Al)return"";Al=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(t)if(t=function(){throw Error()},Object.defineProperty(t.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(t,[])}catch(c){var r=c}Reflect.construct(e,[],t)}else{try{t.call()}catch(c){r=c}e.call(t.prototype)}else{try{throw Error()}catch(c){r=c}e()}}catch(c){if(c&&r&&typeof c.stack=="string"){for(var l=c.stack.split(`\n`),o=r.stack.split(`\n`),i=l.length-1,u=o.length-1;1<=i&&0<=u&&l[i]!==o[u];)u--;for(;1<=i&&0<=u;i--,u--)if(l[i]!==o[u]){if(i!==1||u!==1)do if(i--,u--,0>u||l[i]!==o[u]){var s=`\n`+l[i].replace(" at new "," at ");return e.displayName&&s.includes("<anonymous>")&&(s=s.replace("<anonymous>",e.displayName)),s}while(1<=i&&0<=u);break}}}finally{Al=!1,Error.prepareStackTrace=n}return(e=e?e.displayName||e.name:"")?kn(e):""}function sf(e){switch(e.tag){case 5:return kn(e.type);case 16:return kn("Lazy");case 13:return kn("Suspense");case 19:return kn("SuspenseList");case 0:case 2:case 15:return e=Vl(e.type,!1),e;case 11:return e=Vl(e.type.render,!1),e;case 1:return e=Vl(e.type,!0),e;default:return""}}function co(e){if(e==null)return null;if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case Ft:return"Fragment";case Dt:return"Portal";case uo:return"Profiler";case ni:return"StrictMode";case so:return"Suspense";case ao:return"SuspenseList"}if(typeof e=="object")switch(e.$$typeof){case zs:return(e.displayName||"Context")+".Consumer";case Ps:return(e._context.displayName||"Context")+".Provider";case ri:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case li:return t=e.displayName||null,t!==null?t:co(e.type)||"Memo";case Je:t=e._payload,e=e._init;try{return co(e(t))}catch{}}return null}function af(e){var t=e.type;switch(e.tag){case 24:return"Cache";case 9:return(t.displayName||"Context")+".Consumer";case 10:return(t._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return e=t.render,e=e.displayName||e.name||"",t.displayName||(e!==""?"ForwardRef("+e+")":"ForwardRef");case 7:return"Fragment";case 5:return t;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return co(t);case 8:return t===ni?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if(typeof t=="function")return t.displayName||t.name||null;if(typeof t=="string")return t}return null}function ft(e){switch(typeof e){case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function Ls(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function cf(e){var t=Ls(e)?"checked":"value",n=Object.getOwnPropertyDescriptor(e.constructor.prototype,t),r=""+e[t];if(!e.hasOwnProperty(t)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var l=n.get,o=n.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return l.call(this)},set:function(i){r=""+i,o.call(this,i)}}),Object.defineProperty(e,t,{enumerable:n.enumerable}),{getValue:function(){return r},setValue:function(i){r=""+i},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function cr(e){e._valueTracker||(e._valueTracker=cf(e))}function Rs(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r="";return e&&(r=Ls(e)?e.checked?"true":"false":e.value),e=r,e!==n?(t.setValue(e),!0):!1}function Ur(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}function fo(e,t){var n=t.checked;return j({},t,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:n??e._wrapperState.initialChecked})}function Cu(e,t){var n=t.defaultValue==null?"":t.defaultValue,r=t.checked!=null?t.checked:t.defaultChecked;n=ft(t.value!=null?t.value:n),e._wrapperState={initialChecked:r,initialValue:n,controlled:t.type==="checkbox"||t.type==="radio"?t.checked!=null:t.value!=null}}function Os(e,t){t=t.checked,t!=null&&ti(e,"checked",t,!1)}function po(e,t){Os(e,t);var n=ft(t.value),r=t.type;if(n!=null)r==="number"?(n===0&&e.value===""||e.value!=n)&&(e.value=""+n):e.value!==""+n&&(e.value=""+n);else if(r==="submit"||r==="reset"){e.removeAttribute("value");return}t.hasOwnProperty("value")?mo(e,t.type,n):t.hasOwnProperty("defaultValue")&&mo(e,t.type,ft(t.defaultValue)),t.checked==null&&t.defaultChecked!=null&&(e.defaultChecked=!!t.defaultChecked)}function xu(e,t,n){if(t.hasOwnProperty("value")||t.hasOwnProperty("defaultValue")){var r=t.type;if(!(r!=="submit"&&r!=="reset"||t.value!==void 0&&t.value!==null))return;t=""+e._wrapperState.initialValue,n||t===e.value||(e.value=t),e.defaultValue=t}n=e.name,n!==""&&(e.name=""),e.defaultChecked=!!e._wrapperState.initialChecked,n!==""&&(e.name=n)}function mo(e,t,n){(t!=="number"||Ur(e.ownerDocument)!==e)&&(n==null?e.defaultValue=""+e._wrapperState.initialValue:e.defaultValue!==""+n&&(e.defaultValue=""+n))}var En=Array.isArray;function Yt(e,t,n,r){if(e=e.options,t){t={};for(var l=0;l<n.length;l++)t["$"+n[l]]=!0;for(n=0;n<e.length;n++)l=t.hasOwnProperty("$"+e[n].value),e[n].selected!==l&&(e[n].selected=l),l&&r&&(e[n].defaultSelected=!0)}else{for(n=""+ft(n),t=null,l=0;l<e.length;l++){if(e[l].value===n){e[l].selected=!0,r&&(e[l].defaultSelected=!0);return}t!==null||e[l].disabled||(t=e[l])}t!==null&&(t.selected=!0)}}function ho(e,t){if(t.dangerouslySetInnerHTML!=null)throw Error(v(91));return j({},t,{value:void 0,defaultValue:void 0,children:""+e._wrapperState.initialValue})}function _u(e,t){var n=t.value;if(n==null){if(n=t.children,t=t.defaultValue,n!=null){if(t!=null)throw Error(v(92));if(En(n)){if(1<n.length)throw Error(v(93));n=n[0]}t=n}t==null&&(t=""),n=t}e._wrapperState={initialValue:ft(n)}}function Ms(e,t){var n=ft(t.value),r=ft(t.defaultValue);n!=null&&(n=""+n,n!==e.value&&(e.value=n),t.defaultValue==null&&e.defaultValue!==n&&(e.defaultValue=n)),r!=null&&(e.defaultValue=""+r)}function Nu(e){var t=e.textContent;t===e._wrapperState.initialValue&&t!==""&&t!==null&&(e.value=t)}function Is(e){switch(e){case"svg":return"http://www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function vo(e,t){return e==null||e==="http://www.w3.org/1999/xhtml"?Is(t):e==="http://www.w3.org/2000/svg"&&t==="foreignObject"?"http://www.w3.org/1999/xhtml":e}var fr,Ds=(function(e){return typeof MSApp<"u"&&MSApp.execUnsafeLocalFunction?function(t,n,r,l){MSApp.execUnsafeLocalFunction(function(){return e(t,n,r,l)})}:e})(function(e,t){if(e.namespaceURI!=="http://www.w3.org/2000/svg"||"innerHTML"in e)e.innerHTML=t;else{for(fr=fr||document.createElement("div"),fr.innerHTML="<svg>"+t.valueOf().toString()+"</svg>",t=fr.firstChild;e.firstChild;)e.removeChild(e.firstChild);for(;t.firstChild;)e.appendChild(t.firstChild)}});function Dn(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var _n={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},ff=["Webkit","ms","Moz","O"];Object.keys(_n).forEach(function(e){ff.forEach(function(t){t=t+e.charAt(0).toUpperCase()+e.substring(1),_n[t]=_n[e]})});function Fs(e,t,n){return t==null||typeof t=="boolean"||t===""?"":n||typeof t!="number"||t===0||_n.hasOwnProperty(e)&&_n[e]?(""+t).trim():t+"px"}function js(e,t){e=e.style;for(var n in t)if(t.hasOwnProperty(n)){var r=n.indexOf("--")===0,l=Fs(n,t[n],r);n==="float"&&(n="cssFloat"),r?e.setProperty(n,l):e[n]=l}}var df=j({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});function yo(e,t){if(t){if(df[e]&&(t.children!=null||t.dangerouslySetInnerHTML!=null))throw Error(v(137,e));if(t.dangerouslySetInnerHTML!=null){if(t.children!=null)throw Error(v(60));if(typeof t.dangerouslySetInnerHTML!="object"||!("__html"in t.dangerouslySetInnerHTML))throw Error(v(61))}if(t.style!=null&&typeof t.style!="object")throw Error(v(62))}}function go(e,t){if(e.indexOf("-")===-1)return typeof t.is=="string";switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var wo=null;function oi(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var So=null,Xt=null,Gt=null;function Pu(e){if(e=bn(e)){if(typeof So!="function")throw Error(v(280));var t=e.stateNode;t&&(t=dl(t),So(e.stateNode,e.type,t))}}function Us(e){Xt?Gt?Gt.push(e):Gt=[e]:Xt=e}function As(){if(Xt){var e=Xt,t=Gt;if(Gt=Xt=null,Pu(e),t)for(e=0;e<t.length;e++)Pu(t[e])}}function Vs(e,t){return e(t)}function Hs(){}var Hl=!1;function Bs(e,t,n){if(Hl)return e(t,n);Hl=!0;try{return Vs(e,t,n)}finally{Hl=!1,(Xt!==null||Gt!==null)&&(Hs(),As())}}function Fn(e,t){var n=e.stateNode;if(n===null)return null;var r=dl(n);if(r===null)return null;n=r[t];e:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(r=!r.disabled)||(e=e.type,r=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!r;break e;default:e=!1}if(e)return null;if(n&&typeof n!="function")throw Error(v(231,t,typeof n));return n}var ko=!1;if($e)try{Mt={},Object.defineProperty(Mt,"passive",{get:function(){ko=!0}}),window.addEventListener("test",Mt,Mt),window.removeEventListener("test",Mt,Mt)}catch{ko=!1}var Mt;function pf(e,t,n,r,l,o,i,u,s){var c=Array.prototype.slice.call(arguments,3);try{t.apply(n,c)}catch(m){this.onError(m)}}var Nn=!1,Ar=null,Vr=!1,Eo=null,mf={onError:function(e){Nn=!0,Ar=e}};function hf(e,t,n,r,l,o,i,u,s){Nn=!1,Ar=null,pf.apply(mf,arguments)}function vf(e,t,n,r,l,o,i,u,s){if(hf.apply(this,arguments),Nn){if(Nn){var c=Ar;Nn=!1,Ar=null}else throw Error(v(198));Vr||(Vr=!0,Eo=c)}}function Rt(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,(t.flags&4098)!==0&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function $s(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function zu(e){if(Rt(e)!==e)throw Error(v(188))}function yf(e){var t=e.alternate;if(!t){if(t=Rt(e),t===null)throw Error(v(188));return t!==e?null:e}for(var n=e,r=t;;){var l=n.return;if(l===null)break;var o=l.alternate;if(o===null){if(r=l.return,r!==null){n=r;continue}break}if(l.child===o.child){for(o=l.child;o;){if(o===n)return zu(l),e;if(o===r)return zu(l),t;o=o.sibling}throw Error(v(188))}if(n.return!==r.return)n=l,r=o;else{for(var i=!1,u=l.child;u;){if(u===n){i=!0,n=l,r=o;break}if(u===r){i=!0,r=l,n=o;break}u=u.sibling}if(!i){for(u=o.child;u;){if(u===n){i=!0,n=o,r=l;break}if(u===r){i=!0,r=o,n=l;break}u=u.sibling}if(!i)throw Error(v(189))}}if(n.alternate!==r)throw Error(v(190))}if(n.tag!==3)throw Error(v(188));return n.stateNode.current===n?e:t}function Ws(e){return e=yf(e),e!==null?Qs(e):null}function Qs(e){if(e.tag===5||e.tag===6)return e;for(e=e.child;e!==null;){var t=Qs(e);if(t!==null)return t;e=e.sibling}return null}var Ks=pe.unstable_scheduleCallback,Tu=pe.unstable_cancelCallback,gf=pe.unstable_shouldYield,wf=pe.unstable_requestPaint,V=pe.unstable_now,Sf=pe.unstable_getCurrentPriorityLevel,ii=pe.unstable_ImmediatePriority,Ys=pe.unstable_UserBlockingPriority,Hr=pe.unstable_NormalPriority,kf=pe.unstable_LowPriority,Xs=pe.unstable_IdlePriority,sl=null,Fe=null;function Ef(e){if(Fe&&typeof Fe.onCommitFiberRoot=="function")try{Fe.onCommitFiberRoot(sl,e,void 0,(e.current.flags&128)===128)}catch{}}var ze=Math.clz32?Math.clz32:_f,Cf=Math.log,xf=Math.LN2;function _f(e){return e>>>=0,e===0?32:31-(Cf(e)/xf|0)|0}var dr=64,pr=4194304;function Cn(e){switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e&4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return e&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return e}}function Br(e,t){var n=e.pendingLanes;if(n===0)return 0;var r=0,l=e.suspendedLanes,o=e.pingedLanes,i=n&268435455;if(i!==0){var u=i&~l;u!==0?r=Cn(u):(o&=i,o!==0&&(r=Cn(o)))}else i=n&~l,i!==0?r=Cn(i):o!==0&&(r=Cn(o));if(r===0)return 0;if(t!==0&&t!==r&&(t&l)===0&&(l=r&-r,o=t&-t,l>=o||l===16&&(o&4194240)!==0))return t;if((r&4)!==0&&(r|=n&16),t=e.entangledLanes,t!==0)for(e=e.entanglements,t&=r;0<t;)n=31-ze(t),l=1<<n,r|=e[n],t&=~l;return r}function Nf(e,t){switch(e){case 1:case 2:case 4:return t+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function Pf(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,l=e.expirationTimes,o=e.pendingLanes;0<o;){var i=31-ze(o),u=1<<i,s=l[i];s===-1?((u&n)===0||(u&r)!==0)&&(l[i]=Nf(u,t)):s<=t&&(e.expiredLanes|=u),o&=~u}}function Co(e){return e=e.pendingLanes&-1073741825,e!==0?e:e&1073741824?1073741824:0}function Gs(){var e=dr;return dr<<=1,(dr&4194240)===0&&(dr=64),e}function Bl(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function Jn(e,t,n){e.pendingLanes|=t,t!==536870912&&(e.suspendedLanes=0,e.pingedLanes=0),e=e.eventTimes,t=31-ze(t),e[t]=n}function zf(e,t){var n=e.pendingLanes&~t;e.pendingLanes=t,e.suspendedLanes=0,e.pingedLanes=0,e.expiredLanes&=t,e.mutableReadLanes&=t,e.entangledLanes&=t,t=e.entanglements;var r=e.eventTimes;for(e=e.expirationTimes;0<n;){var l=31-ze(n),o=1<<l;t[l]=0,r[l]=-1,e[l]=-1,n&=~o}}function ui(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-ze(n),l=1<<r;l&t|e[r]&t&&(e[r]|=t),n&=~l}}var T=0;function Zs(e){return e&=-e,1<e?4<e?(e&268435455)!==0?16:536870912:4:1}var Js,si,qs,bs,ea,xo=!1,mr=[],rt=null,lt=null,ot=null,jn=new Map,Un=new Map,be=[],Tf="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");function Lu(e,t){switch(e){case"focusin":case"focusout":rt=null;break;case"dragenter":case"dragleave":lt=null;break;case"mouseover":case"mouseout":ot=null;break;case"pointerover":case"pointerout":jn.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":Un.delete(t.pointerId)}}function mn(e,t,n,r,l,o){return e===null||e.nativeEvent!==o?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:o,targetContainers:[l]},t!==null&&(t=bn(t),t!==null&&si(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,l!==null&&t.indexOf(l)===-1&&t.push(l),e)}function Lf(e,t,n,r,l){switch(t){case"focusin":return rt=mn(rt,e,t,n,r,l),!0;case"dragenter":return lt=mn(lt,e,t,n,r,l),!0;case"mouseover":return ot=mn(ot,e,t,n,r,l),!0;case"pointerover":var o=l.pointerId;return jn.set(o,mn(jn.get(o)||null,e,t,n,r,l)),!0;case"gotpointercapture":return o=l.pointerId,Un.set(o,mn(Un.get(o)||null,e,t,n,r,l)),!0}return!1}function ta(e){var t=St(e.target);if(t!==null){var n=Rt(t);if(n!==null){if(t=n.tag,t===13){if(t=$s(n),t!==null){e.blockedOn=t,ea(e.priority,function(){qs(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function zr(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=_o(e.domEventName,e.eventSystemFlags,t[0],e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);wo=r,n.target.dispatchEvent(r),wo=null}else return t=bn(n),t!==null&&si(t),e.blockedOn=n,!1;t.shift()}return!0}function Ru(e,t,n){zr(e)&&n.delete(t)}function Rf(){xo=!1,rt!==null&&zr(rt)&&(rt=null),lt!==null&&zr(lt)&&(lt=null),ot!==null&&zr(ot)&&(ot=null),jn.forEach(Ru),Un.forEach(Ru)}function hn(e,t){e.blockedOn===t&&(e.blockedOn=null,xo||(xo=!0,pe.unstable_scheduleCallback(pe.unstable_NormalPriority,Rf)))}function An(e){function t(l){return hn(l,e)}if(0<mr.length){hn(mr[0],e);for(var n=1;n<mr.length;n++){var r=mr[n];r.blockedOn===e&&(r.blockedOn=null)}}for(rt!==null&&hn(rt,e),lt!==null&&hn(lt,e),ot!==null&&hn(ot,e),jn.forEach(t),Un.forEach(t),n=0;n<be.length;n++)r=be[n],r.blockedOn===e&&(r.blockedOn=null);for(;0<be.length&&(n=be[0],n.blockedOn===null);)ta(n),n.blockedOn===null&&be.shift()}var Zt=Ye.ReactCurrentBatchConfig,$r=!0;function Of(e,t,n,r){var l=T,o=Zt.transition;Zt.transition=null;try{T=1,ai(e,t,n,r)}finally{T=l,Zt.transition=o}}function Mf(e,t,n,r){var l=T,o=Zt.transition;Zt.transition=null;try{T=4,ai(e,t,n,r)}finally{T=l,Zt.transition=o}}function ai(e,t,n,r){if($r){var l=_o(e,t,n,r);if(l===null)Gl(e,t,r,Wr,n),Lu(e,r);else if(Lf(l,e,t,n,r))r.stopPropagation();else if(Lu(e,r),t&4&&-1<Tf.indexOf(e)){for(;l!==null;){var o=bn(l);if(o!==null&&Js(o),o=_o(e,t,n,r),o===null&&Gl(e,t,r,Wr,n),o===l)break;l=o}l!==null&&r.stopPropagation()}else Gl(e,t,r,null,n)}}var Wr=null;function _o(e,t,n,r){if(Wr=null,e=oi(r),e=St(e),e!==null)if(t=Rt(e),t===null)e=null;else if(n=t.tag,n===13){if(e=$s(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null);return Wr=e,null}function na(e){switch(e){case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 1;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"toggle":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 4;case"message":switch(Sf()){case ii:return 1;case Ys:return 4;case Hr:case kf:return 16;case Xs:return 536870912;default:return 16}default:return 16}}var tt=null,ci=null,Tr=null;function ra(){if(Tr)return Tr;var e,t=ci,n=t.length,r,l="value"in tt?tt.value:tt.textContent,o=l.length;for(e=0;e<n&&t[e]===l[e];e++);var i=n-e;for(r=1;r<=i&&t[n-r]===l[o-r];r++);return Tr=l.slice(e,1<r?1-r:void 0)}function Lr(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function hr(){return!0}function Ou(){return!1}function me(e){function t(n,r,l,o,i){this._reactName=n,this._targetInst=l,this.type=r,this.nativeEvent=o,this.target=i,this.currentTarget=null;for(var u in e)e.hasOwnProperty(u)&&(n=e[u],this[u]=n?n(o):o[u]);return this.isDefaultPrevented=(o.defaultPrevented!=null?o.defaultPrevented:o.returnValue===!1)?hr:Ou,this.isPropagationStopped=Ou,this}return j(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=hr)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=hr)},persist:function(){},isPersistent:hr}),t}var un={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},fi=me(un),qn=j({},un,{view:0,detail:0}),If=me(qn),$l,Wl,vn,al=j({},qn,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:di,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==vn&&(vn&&e.type==="mousemove"?($l=e.screenX-vn.screenX,Wl=e.screenY-vn.screenY):Wl=$l=0,vn=e),$l)},movementY:function(e){return"movementY"in e?e.movementY:Wl}}),Mu=me(al),Df=j({},al,{dataTransfer:0}),Ff=me(Df),jf=j({},qn,{relatedTarget:0}),Ql=me(jf),Uf=j({},un,{animationName:0,elapsedTime:0,pseudoElement:0}),Af=me(Uf),Vf=j({},un,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),Hf=me(Vf),Bf=j({},un,{data:0}),Iu=me(Bf),$f={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},Wf={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Qf={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function Kf(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=Qf[e])?!!t[e]:!1}function di(){return Kf}var Yf=j({},qn,{key:function(e){if(e.key){var t=$f[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=Lr(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?Wf[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:di,charCode:function(e){return e.type==="keypress"?Lr(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?Lr(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),Xf=me(Yf),Gf=j({},al,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),Du=me(Gf),Zf=j({},qn,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:di}),Jf=me(Zf),qf=j({},un,{propertyName:0,elapsedTime:0,pseudoElement:0}),bf=me(qf),ed=j({},al,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),td=me(ed),nd=[9,13,27,32],pi=$e&&"CompositionEvent"in window,Pn=null;$e&&"documentMode"in document&&(Pn=document.documentMode);var rd=$e&&"TextEvent"in window&&!Pn,la=$e&&(!pi||Pn&&8<Pn&&11>=Pn),Fu=" ",ju=!1;function oa(e,t){switch(e){case"keyup":return nd.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function ia(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var jt=!1;function ld(e,t){switch(e){case"compositionend":return ia(t);case"keypress":return t.which!==32?null:(ju=!0,Fu);case"textInput":return e=t.data,e===Fu&&ju?null:e;default:return null}}function od(e,t){if(jt)return e==="compositionend"||!pi&&oa(e,t)?(e=ra(),Tr=ci=tt=null,jt=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return la&&t.locale!=="ko"?null:t.data;default:return null}}var id={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Uu(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!id[e.type]:t==="textarea"}function ua(e,t,n,r){Us(r),t=Qr(t,"onChange"),0<t.length&&(n=new fi("onChange","change",null,n,r),e.push({event:n,listeners:t}))}var zn=null,Vn=null;function ud(e){ga(e,0)}function cl(e){var t=Vt(e);if(Rs(t))return e}function sd(e,t){if(e==="change")return t}var sa=!1;$e&&($e?(yr="oninput"in document,yr||(Kl=document.createElement("div"),Kl.setAttribute("oninput","return;"),yr=typeof Kl.oninput=="function"),vr=yr):vr=!1,sa=vr&&(!document.documentMode||9<document.documentMode));var vr,yr,Kl;function Au(){zn&&(zn.detachEvent("onpropertychange",aa),Vn=zn=null)}function aa(e){if(e.propertyName==="value"&&cl(Vn)){var t=[];ua(t,Vn,e,oi(e)),Bs(ud,t)}}function ad(e,t,n){e==="focusin"?(Au(),zn=t,Vn=n,zn.attachEvent("onpropertychange",aa)):e==="focusout"&&Au()}function cd(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return cl(Vn)}function fd(e,t){if(e==="click")return cl(t)}function dd(e,t){if(e==="input"||e==="change")return cl(t)}function pd(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var Le=typeof Object.is=="function"?Object.is:pd;function Hn(e,t){if(Le(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var l=n[r];if(!io.call(t,l)||!Le(e[l],t[l]))return!1}return!0}function Vu(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function Hu(e,t){var n=Vu(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}e:{for(;n;){if(n.nextSibling){n=n.nextSibling;break e}n=n.parentNode}n=void 0}n=Vu(n)}}function ca(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?ca(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function fa(){for(var e=window,t=Ur();t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href=="string"}catch{n=!1}if(n)e=t.contentWindow;else break;t=Ur(e.document)}return t}function mi(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}function md(e){var t=fa(),n=e.focusedElem,r=e.selectionRange;if(t!==n&&n&&n.ownerDocument&&ca(n.ownerDocument.documentElement,n)){if(r!==null&&mi(n)){if(t=r.start,e=r.end,e===void 0&&(e=t),"selectionStart"in n)n.selectionStart=t,n.selectionEnd=Math.min(e,n.value.length);else if(e=(t=n.ownerDocument||document)&&t.defaultView||window,e.getSelection){e=e.getSelection();var l=n.textContent.length,o=Math.min(r.start,l);r=r.end===void 0?o:Math.min(r.end,l),!e.extend&&o>r&&(l=r,r=o,o=l),l=Hu(n,o);var i=Hu(n,r);l&&i&&(e.rangeCount!==1||e.anchorNode!==l.node||e.anchorOffset!==l.offset||e.focusNode!==i.node||e.focusOffset!==i.offset)&&(t=t.createRange(),t.setStart(l.node,l.offset),e.removeAllRanges(),o>r?(e.addRange(t),e.extend(i.node,i.offset)):(t.setEnd(i.node,i.offset),e.addRange(t)))}}for(t=[],e=n;e=e.parentNode;)e.nodeType===1&&t.push({element:e,left:e.scrollLeft,top:e.scrollTop});for(typeof n.focus=="function"&&n.focus(),n=0;n<t.length;n++)e=t[n],e.element.scrollLeft=e.left,e.element.scrollTop=e.top}}var hd=$e&&"documentMode"in document&&11>=document.documentMode,Ut=null,No=null,Tn=null,Po=!1;function Bu(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;Po||Ut==null||Ut!==Ur(r)||(r=Ut,"selectionStart"in r&&mi(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),Tn&&Hn(Tn,r)||(Tn=r,r=Qr(No,"onSelect"),0<r.length&&(t=new fi("onSelect","select",null,t,n),e.push({event:t,listeners:r}),t.target=Ut)))}function gr(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n["Webkit"+e]="webkit"+t,n["Moz"+e]="moz"+t,n}var At={animationend:gr("Animation","AnimationEnd"),animationiteration:gr("Animation","AnimationIteration"),animationstart:gr("Animation","AnimationStart"),transitionend:gr("Transition","TransitionEnd")},Yl={},da={};$e&&(da=document.createElement("div").style,"AnimationEvent"in window||(delete At.animationend.animation,delete At.animationiteration.animation,delete At.animationstart.animation),"TransitionEvent"in window||delete At.transitionend.transition);function fl(e){if(Yl[e])return Yl[e];if(!At[e])return e;var t=At[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in da)return Yl[e]=t[n];return e}var pa=fl("animationend"),ma=fl("animationiteration"),ha=fl("animationstart"),va=fl("transitionend"),ya=new Map,$u="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");function pt(e,t){ya.set(e,t),Lt(t,[e])}for(wr=0;wr<$u.length;wr++)Sr=$u[wr],Wu=Sr.toLowerCase(),Qu=Sr[0].toUpperCase()+Sr.slice(1),pt(Wu,"on"+Qu);var Sr,Wu,Qu,wr;pt(pa,"onAnimationEnd");pt(ma,"onAnimationIteration");pt(ha,"onAnimationStart");pt("dblclick","onDoubleClick");pt("focusin","onFocus");pt("focusout","onBlur");pt(va,"onTransitionEnd");bt("onMouseEnter",["mouseout","mouseover"]);bt("onMouseLeave",["mouseout","mouseover"]);bt("onPointerEnter",["pointerout","pointerover"]);bt("onPointerLeave",["pointerout","pointerover"]);Lt("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));Lt("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));Lt("onBeforeInput",["compositionend","keypress","textInput","paste"]);Lt("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));Lt("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));Lt("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var xn="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),vd=new Set("cancel close invalid load scroll toggle".split(" ").concat(xn));function Ku(e,t,n){var r=e.type||"unknown-event";e.currentTarget=n,vf(r,t,void 0,e),e.currentTarget=null}function ga(e,t){t=(t&4)!==0;for(var n=0;n<e.length;n++){var r=e[n],l=r.event;r=r.listeners;e:{var o=void 0;if(t)for(var i=r.length-1;0<=i;i--){var u=r[i],s=u.instance,c=u.currentTarget;if(u=u.listener,s!==o&&l.isPropagationStopped())break e;Ku(l,u,c),o=s}else for(i=0;i<r.length;i++){if(u=r[i],s=u.instance,c=u.currentTarget,u=u.listener,s!==o&&l.isPropagationStopped())break e;Ku(l,u,c),o=s}}}if(Vr)throw e=Eo,Vr=!1,Eo=null,e}function O(e,t){var n=t[Oo];n===void 0&&(n=t[Oo]=new Set);var r=e+"__bubble";n.has(r)||(wa(t,e,2,!1),n.add(r))}function Xl(e,t,n){var r=0;t&&(r|=4),wa(n,e,r,t)}var kr="_reactListening"+Math.random().toString(36).slice(2);function Bn(e){if(!e[kr]){e[kr]=!0,Ns.forEach(function(n){n!=="selectionchange"&&(vd.has(n)||Xl(n,!1,e),Xl(n,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[kr]||(t[kr]=!0,Xl("selectionchange",!1,t))}}function wa(e,t,n,r){switch(na(t)){case 1:var l=Of;break;case 4:l=Mf;break;default:l=ai}n=l.bind(null,t,n,e),l=void 0,!ko||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(l=!0),r?l!==void 0?e.addEventListener(t,n,{capture:!0,passive:l}):e.addEventListener(t,n,!0):l!==void 0?e.addEventListener(t,n,{passive:l}):e.addEventListener(t,n,!1)}function Gl(e,t,n,r,l){var o=r;if((t&1)===0&&(t&2)===0&&r!==null)e:for(;;){if(r===null)return;var i=r.tag;if(i===3||i===4){var u=r.stateNode.containerInfo;if(u===l||u.nodeType===8&&u.parentNode===l)break;if(i===4)for(i=r.return;i!==null;){var s=i.tag;if((s===3||s===4)&&(s=i.stateNode.containerInfo,s===l||s.nodeType===8&&s.parentNode===l))return;i=i.return}for(;u!==null;){if(i=St(u),i===null)return;if(s=i.tag,s===5||s===6){r=o=i;continue e}u=u.parentNode}}r=r.return}Bs(function(){var c=o,m=oi(n),p=[];e:{var h=ya.get(e);if(h!==void 0){var w=fi,g=e;switch(e){case"keypress":if(Lr(n)===0)break e;case"keydown":case"keyup":w=Xf;break;case"focusin":g="focus",w=Ql;break;case"focusout":g="blur",w=Ql;break;case"beforeblur":case"afterblur":w=Ql;break;case"click":if(n.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":w=Mu;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":w=Ff;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":w=Jf;break;case pa:case ma:case ha:w=Af;break;case va:w=bf;break;case"scroll":w=If;break;case"wheel":w=td;break;case"copy":case"cut":case"paste":w=Hf;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":w=Du}var S=(t&4)!==0,A=!S&&e==="scroll",f=S?h!==null?h+"Capture":null:h;S=[];for(var a=c,d;a!==null;){d=a;var y=d.stateNode;if(d.tag===5&&y!==null&&(d=y,f!==null&&(y=Fn(a,f),y!=null&&S.push($n(a,y,d)))),A)break;a=a.return}0<S.length&&(h=new w(h,g,null,n,m),p.push({event:h,listeners:S}))}}if((t&7)===0){e:{if(h=e==="mouseover"||e==="pointerover",w=e==="mouseout"||e==="pointerout",h&&n!==wo&&(g=n.relatedTarget||n.fromElement)&&(St(g)||g[We]))break e;if((w||h)&&(h=m.window===m?m:(h=m.ownerDocument)?h.defaultView||h.parentWindow:window,w?(g=n.relatedTarget||n.toElement,w=c,g=g?St(g):null,g!==null&&(A=Rt(g),g!==A||g.tag!==5&&g.tag!==6)&&(g=null)):(w=null,g=c),w!==g)){if(S=Mu,y="onMouseLeave",f="onMouseEnter",a="mouse",(e==="pointerout"||e==="pointerover")&&(S=Du,y="onPointerLeave",f="onPointerEnter",a="pointer"),A=w==null?h:Vt(w),d=g==null?h:Vt(g),h=new S(y,a+"leave",w,n,m),h.target=A,h.relatedTarget=d,y=null,St(m)===c&&(S=new S(f,a+"enter",g,n,m),S.target=d,S.relatedTarget=A,y=S),A=y,w&&g)t:{for(S=w,f=g,a=0,d=S;d;d=It(d))a++;for(d=0,y=f;y;y=It(y))d++;for(;0<a-d;)S=It(S),a--;for(;0<d-a;)f=It(f),d--;for(;a--;){if(S===f||f!==null&&S===f.alternate)break t;S=It(S),f=It(f)}S=null}else S=null;w!==null&&Yu(p,h,w,S,!1),g!==null&&A!==null&&Yu(p,A,g,S,!0)}}e:{if(h=c?Vt(c):window,w=h.nodeName&&h.nodeName.toLowerCase(),w==="select"||w==="input"&&h.type==="file")var E=sd;else if(Uu(h))if(sa)E=dd;else{E=cd;var C=ad}else(w=h.nodeName)&&w.toLowerCase()==="input"&&(h.type==="checkbox"||h.type==="radio")&&(E=fd);if(E&&(E=E(e,c))){ua(p,E,n,m);break e}C&&C(e,h,c),e==="focusout"&&(C=h._wrapperState)&&C.controlled&&h.type==="number"&&mo(h,"number",h.value)}switch(C=c?Vt(c):window,e){case"focusin":(Uu(C)||C.contentEditable==="true")&&(Ut=C,No=c,Tn=null);break;case"focusout":Tn=No=Ut=null;break;case"mousedown":Po=!0;break;case"contextmenu":case"mouseup":case"dragend":Po=!1,Bu(p,n,m);break;case"selectionchange":if(hd)break;case"keydown":case"keyup":Bu(p,n,m)}var x;if(pi)e:{switch(e){case"compositionstart":var _="onCompositionStart";break e;case"compositionend":_="onCompositionEnd";break e;case"compositionupdate":_="onCompositionUpdate";break e}_=void 0}else jt?oa(e,n)&&(_="onCompositionEnd"):e==="keydown"&&n.keyCode===229&&(_="onCompositionStart");_&&(la&&n.locale!=="ko"&&(jt||_!=="onCompositionStart"?_==="onCompositionEnd"&&jt&&(x=ra()):(tt=m,ci="value"in tt?tt.value:tt.textContent,jt=!0)),C=Qr(c,_),0<C.length&&(_=new Iu(_,e,null,n,m),p.push({event:_,listeners:C}),x?_.data=x:(x=ia(n),x!==null&&(_.data=x)))),(x=rd?ld(e,n):od(e,n))&&(c=Qr(c,"onBeforeInput"),0<c.length&&(m=new Iu("onBeforeInput","beforeinput",null,n,m),p.push({event:m,listeners:c}),m.data=x))}ga(p,t)})}function $n(e,t,n){return{instance:e,listener:t,currentTarget:n}}function Qr(e,t){for(var n=t+"Capture",r=[];e!==null;){var l=e,o=l.stateNode;l.tag===5&&o!==null&&(l=o,o=Fn(e,n),o!=null&&r.unshift($n(e,o,l)),o=Fn(e,t),o!=null&&r.push($n(e,o,l))),e=e.return}return r}function It(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5);return e||null}function Yu(e,t,n,r,l){for(var o=t._reactName,i=[];n!==null&&n!==r;){var u=n,s=u.alternate,c=u.stateNode;if(s!==null&&s===r)break;u.tag===5&&c!==null&&(u=c,l?(s=Fn(n,o),s!=null&&i.unshift($n(n,s,u))):l||(s=Fn(n,o),s!=null&&i.push($n(n,s,u)))),n=n.return}i.length!==0&&e.push({event:t,listeners:i})}var yd=/\\r\\n?/g,gd=/\\u0000|\\uFFFD/g;function Xu(e){return(typeof e=="string"?e:""+e).replace(yd,`\n`).replace(gd,"")}function Er(e,t,n){if(t=Xu(t),Xu(e)!==t&&n)throw Error(v(425))}function Kr(){}var zo=null,To=null;function Lo(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var Ro=typeof setTimeout=="function"?setTimeout:void 0,wd=typeof clearTimeout=="function"?clearTimeout:void 0,Gu=typeof Promise=="function"?Promise:void 0,Sd=typeof queueMicrotask=="function"?queueMicrotask:typeof Gu<"u"?function(e){return Gu.resolve(null).then(e).catch(kd)}:Ro;function kd(e){setTimeout(function(){throw e})}function Zl(e,t){var n=t,r=0;do{var l=n.nextSibling;if(e.removeChild(n),l&&l.nodeType===8)if(n=l.data,n==="/$"){if(r===0){e.removeChild(l),An(t);return}r--}else n!=="$"&&n!=="$?"&&n!=="$!"||r++;n=l}while(n);An(t)}function it(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?")break;if(t==="/$")return null}}return e}function Zu(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="$"||n==="$!"||n==="$?"){if(t===0)return e;t--}else n==="/$"&&t++}e=e.previousSibling}return null}var sn=Math.random().toString(36).slice(2),De="__reactFiber$"+sn,Wn="__reactProps$"+sn,We="__reactContainer$"+sn,Oo="__reactEvents$"+sn,Ed="__reactListeners$"+sn,Cd="__reactHandles$"+sn;function St(e){var t=e[De];if(t)return t;for(var n=e.parentNode;n;){if(t=n[We]||n[De]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=Zu(e);e!==null;){if(n=e[De])return n;e=Zu(e)}return t}e=n,n=e.parentNode}return null}function bn(e){return e=e[De]||e[We],!e||e.tag!==5&&e.tag!==6&&e.tag!==13&&e.tag!==3?null:e}function Vt(e){if(e.tag===5||e.tag===6)return e.stateNode;throw Error(v(33))}function dl(e){return e[Wn]||null}var Mo=[],Ht=-1;function mt(e){return{current:e}}function M(e){0>Ht||(e.current=Mo[Ht],Mo[Ht]=null,Ht--)}function R(e,t){Ht++,Mo[Ht]=e.current,e.current=t}var dt={},ee=mt(dt),ue=mt(!1),_t=dt;function en(e,t){var n=e.type.contextTypes;if(!n)return dt;var r=e.stateNode;if(r&&r.__reactInternalMemoizedUnmaskedChildContext===t)return r.__reactInternalMemoizedMaskedChildContext;var l={},o;for(o in n)l[o]=t[o];return r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=t,e.__reactInternalMemoizedMaskedChildContext=l),l}function se(e){return e=e.childContextTypes,e!=null}function Yr(){M(ue),M(ee)}function Ju(e,t,n){if(ee.current!==dt)throw Error(v(168));R(ee,t),R(ue,n)}function Sa(e,t,n){var r=e.stateNode;if(t=t.childContextTypes,typeof r.getChildContext!="function")return n;r=r.getChildContext();for(var l in r)if(!(l in t))throw Error(v(108,af(e)||"Unknown",l));return j({},n,r)}function Xr(e){return e=(e=e.stateNode)&&e.__reactInternalMemoizedMergedChildContext||dt,_t=ee.current,R(ee,e),R(ue,ue.current),!0}function qu(e,t,n){var r=e.stateNode;if(!r)throw Error(v(169));n?(e=Sa(e,t,_t),r.__reactInternalMemoizedMergedChildContext=e,M(ue),M(ee),R(ee,e)):M(ue),R(ue,n)}var Ae=null,pl=!1,Jl=!1;function ka(e){Ae===null?Ae=[e]:Ae.push(e)}function xd(e){pl=!0,ka(e)}function ht(){if(!Jl&&Ae!==null){Jl=!0;var e=0,t=T;try{var n=Ae;for(T=1;e<n.length;e++){var r=n[e];do r=r(!0);while(r!==null)}Ae=null,pl=!1}catch(l){throw Ae!==null&&(Ae=Ae.slice(e+1)),Ks(ii,ht),l}finally{T=t,Jl=!1}}return null}var Bt=[],$t=0,Gr=null,Zr=0,ye=[],ge=0,Nt=null,Ve=1,He="";function gt(e,t){Bt[$t++]=Zr,Bt[$t++]=Gr,Gr=e,Zr=t}function Ea(e,t,n){ye[ge++]=Ve,ye[ge++]=He,ye[ge++]=Nt,Nt=e;var r=Ve;e=He;var l=32-ze(r)-1;r&=~(1<<l),n+=1;var o=32-ze(t)+l;if(30<o){var i=l-l%5;o=(r&(1<<i)-1).toString(32),r>>=i,l-=i,Ve=1<<32-ze(t)+l|n<<l|r,He=o+e}else Ve=1<<o|n<<l|r,He=e}function hi(e){e.return!==null&&(gt(e,1),Ea(e,1,0))}function vi(e){for(;e===Gr;)Gr=Bt[--$t],Bt[$t]=null,Zr=Bt[--$t],Bt[$t]=null;for(;e===Nt;)Nt=ye[--ge],ye[ge]=null,He=ye[--ge],ye[ge]=null,Ve=ye[--ge],ye[ge]=null}var de=null,fe=null,I=!1,Pe=null;function Ca(e,t){var n=we(5,null,null,0);n.elementType="DELETED",n.stateNode=t,n.return=e,t=e.deletions,t===null?(e.deletions=[n],e.flags|=16):t.push(n)}function bu(e,t){switch(e.tag){case 5:var n=e.type;return t=t.nodeType!==1||n.toLowerCase()!==t.nodeName.toLowerCase()?null:t,t!==null?(e.stateNode=t,de=e,fe=it(t.firstChild),!0):!1;case 6:return t=e.pendingProps===""||t.nodeType!==3?null:t,t!==null?(e.stateNode=t,de=e,fe=null,!0):!1;case 13:return t=t.nodeType!==8?null:t,t!==null?(n=Nt!==null?{id:Ve,overflow:He}:null,e.memoizedState={dehydrated:t,treeContext:n,retryLane:1073741824},n=we(18,null,null,0),n.stateNode=t,n.return=e,e.child=n,de=e,fe=null,!0):!1;default:return!1}}function Io(e){return(e.mode&1)!==0&&(e.flags&128)===0}function Do(e){if(I){var t=fe;if(t){var n=t;if(!bu(e,t)){if(Io(e))throw Error(v(418));t=it(n.nextSibling);var r=de;t&&bu(e,t)?Ca(r,n):(e.flags=e.flags&-4097|2,I=!1,de=e)}}else{if(Io(e))throw Error(v(418));e.flags=e.flags&-4097|2,I=!1,de=e}}}function es(e){for(e=e.return;e!==null&&e.tag!==5&&e.tag!==3&&e.tag!==13;)e=e.return;de=e}function Cr(e){if(e!==de)return!1;if(!I)return es(e),I=!0,!1;var t;if((t=e.tag!==3)&&!(t=e.tag!==5)&&(t=e.type,t=t!=="head"&&t!=="body"&&!Lo(e.type,e.memoizedProps)),t&&(t=fe)){if(Io(e))throw xa(),Error(v(418));for(;t;)Ca(e,t),t=it(t.nextSibling)}if(es(e),e.tag===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(v(317));e:{for(e=e.nextSibling,t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="/$"){if(t===0){fe=it(e.nextSibling);break e}t--}else n!=="$"&&n!=="$!"&&n!=="$?"||t++}e=e.nextSibling}fe=null}}else fe=de?it(e.stateNode.nextSibling):null;return!0}function xa(){for(var e=fe;e;)e=it(e.nextSibling)}function tn(){fe=de=null,I=!1}function yi(e){Pe===null?Pe=[e]:Pe.push(e)}var _d=Ye.ReactCurrentBatchConfig;function yn(e,t,n){if(e=n.ref,e!==null&&typeof e!="function"&&typeof e!="object"){if(n._owner){if(n=n._owner,n){if(n.tag!==1)throw Error(v(309));var r=n.stateNode}if(!r)throw Error(v(147,e));var l=r,o=""+e;return t!==null&&t.ref!==null&&typeof t.ref=="function"&&t.ref._stringRef===o?t.ref:(t=function(i){var u=l.refs;i===null?delete u[o]:u[o]=i},t._stringRef=o,t)}if(typeof e!="string")throw Error(v(284));if(!n._owner)throw Error(v(290,e))}return e}function xr(e,t){throw e=Object.prototype.toString.call(t),Error(v(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e))}function ts(e){var t=e._init;return t(e._payload)}function _a(e){function t(f,a){if(e){var d=f.deletions;d===null?(f.deletions=[a],f.flags|=16):d.push(a)}}function n(f,a){if(!e)return null;for(;a!==null;)t(f,a),a=a.sibling;return null}function r(f,a){for(f=new Map;a!==null;)a.key!==null?f.set(a.key,a):f.set(a.index,a),a=a.sibling;return f}function l(f,a){return f=ct(f,a),f.index=0,f.sibling=null,f}function o(f,a,d){return f.index=d,e?(d=f.alternate,d!==null?(d=d.index,d<a?(f.flags|=2,a):d):(f.flags|=2,a)):(f.flags|=1048576,a)}function i(f){return e&&f.alternate===null&&(f.flags|=2),f}function u(f,a,d,y){return a===null||a.tag!==6?(a=lo(d,f.mode,y),a.return=f,a):(a=l(a,d),a.return=f,a)}function s(f,a,d,y){var E=d.type;return E===Ft?m(f,a,d.props.children,y,d.key):a!==null&&(a.elementType===E||typeof E=="object"&&E!==null&&E.$$typeof===Je&&ts(E)===a.type)?(y=l(a,d.props),y.ref=yn(f,a,d),y.return=f,y):(y=jr(d.type,d.key,d.props,null,f.mode,y),y.ref=yn(f,a,d),y.return=f,y)}function c(f,a,d,y){return a===null||a.tag!==4||a.stateNode.containerInfo!==d.containerInfo||a.stateNode.implementation!==d.implementation?(a=oo(d,f.mode,y),a.return=f,a):(a=l(a,d.children||[]),a.return=f,a)}function m(f,a,d,y,E){return a===null||a.tag!==7?(a=xt(d,f.mode,y,E),a.return=f,a):(a=l(a,d),a.return=f,a)}function p(f,a,d){if(typeof a=="string"&&a!==""||typeof a=="number")return a=lo(""+a,f.mode,d),a.return=f,a;if(typeof a=="object"&&a!==null){switch(a.$$typeof){case ar:return d=jr(a.type,a.key,a.props,null,f.mode,d),d.ref=yn(f,null,a),d.return=f,d;case Dt:return a=oo(a,f.mode,d),a.return=f,a;case Je:var y=a._init;return p(f,y(a._payload),d)}if(En(a)||pn(a))return a=xt(a,f.mode,d,null),a.return=f,a;xr(f,a)}return null}function h(f,a,d,y){var E=a!==null?a.key:null;if(typeof d=="string"&&d!==""||typeof d=="number")return E!==null?null:u(f,a,""+d,y);if(typeof d=="object"&&d!==null){switch(d.$$typeof){case ar:return d.key===E?s(f,a,d,y):null;case Dt:return d.key===E?c(f,a,d,y):null;case Je:return E=d._init,h(f,a,E(d._payload),y)}if(En(d)||pn(d))return E!==null?null:m(f,a,d,y,null);xr(f,d)}return null}function w(f,a,d,y,E){if(typeof y=="string"&&y!==""||typeof y=="number")return f=f.get(d)||null,u(a,f,""+y,E);if(typeof y=="object"&&y!==null){switch(y.$$typeof){case ar:return f=f.get(y.key===null?d:y.key)||null,s(a,f,y,E);case Dt:return f=f.get(y.key===null?d:y.key)||null,c(a,f,y,E);case Je:var C=y._init;return w(f,a,d,C(y._payload),E)}if(En(y)||pn(y))return f=f.get(d)||null,m(a,f,y,E,null);xr(a,y)}return null}function g(f,a,d,y){for(var E=null,C=null,x=a,_=a=0,W=null;x!==null&&_<d.length;_++){x.index>_?(W=x,x=null):W=x.sibling;var z=h(f,x,d[_],y);if(z===null){x===null&&(x=W);break}e&&x&&z.alternate===null&&t(f,x),a=o(z,a,_),C===null?E=z:C.sibling=z,C=z,x=W}if(_===d.length)return n(f,x),I&&gt(f,_),E;if(x===null){for(;_<d.length;_++)x=p(f,d[_],y),x!==null&&(a=o(x,a,_),C===null?E=x:C.sibling=x,C=x);return I&&gt(f,_),E}for(x=r(f,x);_<d.length;_++)W=w(x,f,_,d[_],y),W!==null&&(e&&W.alternate!==null&&x.delete(W.key===null?_:W.key),a=o(W,a,_),C===null?E=W:C.sibling=W,C=W);return e&&x.forEach(function(Xe){return t(f,Xe)}),I&&gt(f,_),E}function S(f,a,d,y){var E=pn(d);if(typeof E!="function")throw Error(v(150));if(d=E.call(d),d==null)throw Error(v(151));for(var C=E=null,x=a,_=a=0,W=null,z=d.next();x!==null&&!z.done;_++,z=d.next()){x.index>_?(W=x,x=null):W=x.sibling;var Xe=h(f,x,z.value,y);if(Xe===null){x===null&&(x=W);break}e&&x&&Xe.alternate===null&&t(f,x),a=o(Xe,a,_),C===null?E=Xe:C.sibling=Xe,C=Xe,x=W}if(z.done)return n(f,x),I&&gt(f,_),E;if(x===null){for(;!z.done;_++,z=d.next())z=p(f,z.value,y),z!==null&&(a=o(z,a,_),C===null?E=z:C.sibling=z,C=z);return I&&gt(f,_),E}for(x=r(f,x);!z.done;_++,z=d.next())z=w(x,f,_,z.value,y),z!==null&&(e&&z.alternate!==null&&x.delete(z.key===null?_:z.key),a=o(z,a,_),C===null?E=z:C.sibling=z,C=z);return e&&x.forEach(function(Mc){return t(f,Mc)}),I&&gt(f,_),E}function A(f,a,d,y){if(typeof d=="object"&&d!==null&&d.type===Ft&&d.key===null&&(d=d.props.children),typeof d=="object"&&d!==null){switch(d.$$typeof){case ar:e:{for(var E=d.key,C=a;C!==null;){if(C.key===E){if(E=d.type,E===Ft){if(C.tag===7){n(f,C.sibling),a=l(C,d.props.children),a.return=f,f=a;break e}}else if(C.elementType===E||typeof E=="object"&&E!==null&&E.$$typeof===Je&&ts(E)===C.type){n(f,C.sibling),a=l(C,d.props),a.ref=yn(f,C,d),a.return=f,f=a;break e}n(f,C);break}else t(f,C);C=C.sibling}d.type===Ft?(a=xt(d.props.children,f.mode,y,d.key),a.return=f,f=a):(y=jr(d.type,d.key,d.props,null,f.mode,y),y.ref=yn(f,a,d),y.return=f,f=y)}return i(f);case Dt:e:{for(C=d.key;a!==null;){if(a.key===C)if(a.tag===4&&a.stateNode.containerInfo===d.containerInfo&&a.stateNode.implementation===d.implementation){n(f,a.sibling),a=l(a,d.children||[]),a.return=f,f=a;break e}else{n(f,a);break}else t(f,a);a=a.sibling}a=oo(d,f.mode,y),a.return=f,f=a}return i(f);case Je:return C=d._init,A(f,a,C(d._payload),y)}if(En(d))return g(f,a,d,y);if(pn(d))return S(f,a,d,y);xr(f,d)}return typeof d=="string"&&d!==""||typeof d=="number"?(d=""+d,a!==null&&a.tag===6?(n(f,a.sibling),a=l(a,d),a.return=f,f=a):(n(f,a),a=lo(d,f.mode,y),a.return=f,f=a),i(f)):n(f,a)}return A}var nn=_a(!0),Na=_a(!1),Jr=mt(null),qr=null,Wt=null,gi=null;function wi(){gi=Wt=qr=null}function Si(e){var t=Jr.current;M(Jr),e._currentValue=t}function Fo(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,r!==null&&(r.childLanes|=t)):r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t),e===n)break;e=e.return}}function Jt(e,t){qr=e,gi=Wt=null,e=e.dependencies,e!==null&&e.firstContext!==null&&((e.lanes&t)!==0&&(ie=!0),e.firstContext=null)}function ke(e){var t=e._currentValue;if(gi!==e)if(e={context:e,memoizedValue:t,next:null},Wt===null){if(qr===null)throw Error(v(308));Wt=e,qr.dependencies={lanes:0,firstContext:e}}else Wt=Wt.next=e;return t}var kt=null;function ki(e){kt===null?kt=[e]:kt.push(e)}function Pa(e,t,n,r){var l=t.interleaved;return l===null?(n.next=n,ki(t)):(n.next=l.next,l.next=n),t.interleaved=n,Qe(e,r)}function Qe(e,t){e.lanes|=t;var n=e.alternate;for(n!==null&&(n.lanes|=t),n=e,e=e.return;e!==null;)e.childLanes|=t,n=e.alternate,n!==null&&(n.childLanes|=t),n=e,e=e.return;return n.tag===3?n.stateNode:null}var qe=!1;function Ei(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function za(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,effects:e.effects})}function Be(e,t){return{eventTime:e,lane:t,tag:0,payload:null,callback:null,next:null}}function ut(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,(P&2)!==0){var l=r.pending;return l===null?t.next=t:(t.next=l.next,l.next=t),r.pending=t,Qe(e,n)}return l=r.interleaved,l===null?(t.next=t,ki(r)):(t.next=l.next,l.next=t),r.interleaved=t,Qe(e,n)}function Rr(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,(n&4194240)!==0)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,ui(e,n)}}function ns(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var l=null,o=null;if(n=n.firstBaseUpdate,n!==null){do{var i={eventTime:n.eventTime,lane:n.lane,tag:n.tag,payload:n.payload,callback:n.callback,next:null};o===null?l=o=i:o=o.next=i,n=n.next}while(n!==null);o===null?l=o=t:o=o.next=t}else l=o=t;n={baseState:r.baseState,firstBaseUpdate:l,lastBaseUpdate:o,shared:r.shared,effects:r.effects},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}function br(e,t,n,r){var l=e.updateQueue;qe=!1;var o=l.firstBaseUpdate,i=l.lastBaseUpdate,u=l.shared.pending;if(u!==null){l.shared.pending=null;var s=u,c=s.next;s.next=null,i===null?o=c:i.next=c,i=s;var m=e.alternate;m!==null&&(m=m.updateQueue,u=m.lastBaseUpdate,u!==i&&(u===null?m.firstBaseUpdate=c:u.next=c,m.lastBaseUpdate=s))}if(o!==null){var p=l.baseState;i=0,m=c=s=null,u=o;do{var h=u.lane,w=u.eventTime;if((r&h)===h){m!==null&&(m=m.next={eventTime:w,lane:0,tag:u.tag,payload:u.payload,callback:u.callback,next:null});e:{var g=e,S=u;switch(h=t,w=n,S.tag){case 1:if(g=S.payload,typeof g=="function"){p=g.call(w,p,h);break e}p=g;break e;case 3:g.flags=g.flags&-65537|128;case 0:if(g=S.payload,h=typeof g=="function"?g.call(w,p,h):g,h==null)break e;p=j({},p,h);break e;case 2:qe=!0}}u.callback!==null&&u.lane!==0&&(e.flags|=64,h=l.effects,h===null?l.effects=[u]:h.push(u))}else w={eventTime:w,lane:h,tag:u.tag,payload:u.payload,callback:u.callback,next:null},m===null?(c=m=w,s=p):m=m.next=w,i|=h;if(u=u.next,u===null){if(u=l.shared.pending,u===null)break;h=u,u=h.next,h.next=null,l.lastBaseUpdate=h,l.shared.pending=null}}while(!0);if(m===null&&(s=p),l.baseState=s,l.firstBaseUpdate=c,l.lastBaseUpdate=m,t=l.shared.interleaved,t!==null){l=t;do i|=l.lane,l=l.next;while(l!==t)}else o===null&&(l.shared.lanes=0);zt|=i,e.lanes=i,e.memoizedState=p}}function rs(e,t,n){if(e=t.effects,t.effects=null,e!==null)for(t=0;t<e.length;t++){var r=e[t],l=r.callback;if(l!==null){if(r.callback=null,r=n,typeof l!="function")throw Error(v(191,l));l.call(r)}}}var er={},je=mt(er),Qn=mt(er),Kn=mt(er);function Et(e){if(e===er)throw Error(v(174));return e}function Ci(e,t){switch(R(Kn,t),R(Qn,e),R(je,er),e=t.nodeType,e){case 9:case 11:t=(t=t.documentElement)?t.namespaceURI:vo(null,"");break;default:e=e===8?t.parentNode:t,t=e.namespaceURI||null,e=e.tagName,t=vo(t,e)}M(je),R(je,t)}function rn(){M(je),M(Qn),M(Kn)}function Ta(e){Et(Kn.current);var t=Et(je.current),n=vo(t,e.type);t!==n&&(R(Qn,e),R(je,n))}function xi(e){Qn.current===e&&(M(je),M(Qn))}var D=mt(0);function el(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||n.data==="$?"||n.data==="$!"))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!==void 0){if((t.flags&128)!==0)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var ql=[];function _i(){for(var e=0;e<ql.length;e++)ql[e]._workInProgressVersionPrimary=null;ql.length=0}var Or=Ye.ReactCurrentDispatcher,bl=Ye.ReactCurrentBatchConfig,Pt=0,F=null,B=null,Q=null,tl=!1,Ln=!1,Yn=0,Nd=0;function J(){throw Error(v(321))}function Ni(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!Le(e[n],t[n]))return!1;return!0}function Pi(e,t,n,r,l,o){if(Pt=o,F=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,Or.current=e===null||e.memoizedState===null?Ld:Rd,e=n(r,l),Ln){o=0;do{if(Ln=!1,Yn=0,25<=o)throw Error(v(301));o+=1,Q=B=null,t.updateQueue=null,Or.current=Od,e=n(r,l)}while(Ln)}if(Or.current=nl,t=B!==null&&B.next!==null,Pt=0,Q=B=F=null,tl=!1,t)throw Error(v(300));return e}function zi(){var e=Yn!==0;return Yn=0,e}function Ie(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return Q===null?F.memoizedState=Q=e:Q=Q.next=e,Q}function Ee(){if(B===null){var e=F.alternate;e=e!==null?e.memoizedState:null}else e=B.next;var t=Q===null?F.memoizedState:Q.next;if(t!==null)Q=t,B=e;else{if(e===null)throw Error(v(310));B=e,e={memoizedState:B.memoizedState,baseState:B.baseState,baseQueue:B.baseQueue,queue:B.queue,next:null},Q===null?F.memoizedState=Q=e:Q=Q.next=e}return Q}function Xn(e,t){return typeof t=="function"?t(e):t}function eo(e){var t=Ee(),n=t.queue;if(n===null)throw Error(v(311));n.lastRenderedReducer=e;var r=B,l=r.baseQueue,o=n.pending;if(o!==null){if(l!==null){var i=l.next;l.next=o.next,o.next=i}r.baseQueue=l=o,n.pending=null}if(l!==null){o=l.next,r=r.baseState;var u=i=null,s=null,c=o;do{var m=c.lane;if((Pt&m)===m)s!==null&&(s=s.next={lane:0,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null}),r=c.hasEagerState?c.eagerState:e(r,c.action);else{var p={lane:m,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null};s===null?(u=s=p,i=r):s=s.next=p,F.lanes|=m,zt|=m}c=c.next}while(c!==null&&c!==o);s===null?i=r:s.next=u,Le(r,t.memoizedState)||(ie=!0),t.memoizedState=r,t.baseState=i,t.baseQueue=s,n.lastRenderedState=r}if(e=n.interleaved,e!==null){l=e;do o=l.lane,F.lanes|=o,zt|=o,l=l.next;while(l!==e)}else l===null&&(n.lanes=0);return[t.memoizedState,n.dispatch]}function to(e){var t=Ee(),n=t.queue;if(n===null)throw Error(v(311));n.lastRenderedReducer=e;var r=n.dispatch,l=n.pending,o=t.memoizedState;if(l!==null){n.pending=null;var i=l=l.next;do o=e(o,i.action),i=i.next;while(i!==l);Le(o,t.memoizedState)||(ie=!0),t.memoizedState=o,t.baseQueue===null&&(t.baseState=o),n.lastRenderedState=o}return[o,r]}function La(){}function Ra(e,t){var n=F,r=Ee(),l=t(),o=!Le(r.memoizedState,l);if(o&&(r.memoizedState=l,ie=!0),r=r.queue,Ti(Ia.bind(null,n,r,e),[e]),r.getSnapshot!==t||o||Q!==null&&Q.memoizedState.tag&1){if(n.flags|=2048,Gn(9,Ma.bind(null,n,r,l,t),void 0,null),K===null)throw Error(v(349));(Pt&30)!==0||Oa(n,t,l)}return l}function Oa(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=F.updateQueue,t===null?(t={lastEffect:null,stores:null},F.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function Ma(e,t,n,r){t.value=n,t.getSnapshot=r,Da(t)&&Fa(e)}function Ia(e,t,n){return n(function(){Da(t)&&Fa(e)})}function Da(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!Le(e,n)}catch{return!0}}function Fa(e){var t=Qe(e,1);t!==null&&Te(t,e,1,-1)}function ls(e){var t=Ie();return typeof e=="function"&&(e=e()),t.memoizedState=t.baseState=e,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:Xn,lastRenderedState:e},t.queue=e,e=e.dispatch=Td.bind(null,F,e),[t.memoizedState,e]}function Gn(e,t,n,r){return e={tag:e,create:t,destroy:n,deps:r,next:null},t=F.updateQueue,t===null?(t={lastEffect:null,stores:null},F.updateQueue=t,t.lastEffect=e.next=e):(n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e)),e}function ja(){return Ee().memoizedState}function Mr(e,t,n,r){var l=Ie();F.flags|=e,l.memoizedState=Gn(1|t,n,void 0,r===void 0?null:r)}function ml(e,t,n,r){var l=Ee();r=r===void 0?null:r;var o=void 0;if(B!==null){var i=B.memoizedState;if(o=i.destroy,r!==null&&Ni(r,i.deps)){l.memoizedState=Gn(t,n,o,r);return}}F.flags|=e,l.memoizedState=Gn(1|t,n,o,r)}function os(e,t){return Mr(8390656,8,e,t)}function Ti(e,t){return ml(2048,8,e,t)}function Ua(e,t){return ml(4,2,e,t)}function Aa(e,t){return ml(4,4,e,t)}function Va(e,t){if(typeof t=="function")return e=e(),t(e),function(){t(null)};if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function Ha(e,t,n){return n=n!=null?n.concat([e]):null,ml(4,4,Va.bind(null,t,e),n)}function Li(){}function Ba(e,t){var n=Ee();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&Ni(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function $a(e,t){var n=Ee();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&Ni(t,r[1])?r[0]:(e=e(),n.memoizedState=[e,t],e)}function Wa(e,t,n){return(Pt&21)===0?(e.baseState&&(e.baseState=!1,ie=!0),e.memoizedState=n):(Le(n,t)||(n=Gs(),F.lanes|=n,zt|=n,e.baseState=!0),t)}function Pd(e,t){var n=T;T=n!==0&&4>n?n:4,e(!0);var r=bl.transition;bl.transition={};try{e(!1),t()}finally{T=n,bl.transition=r}}function Qa(){return Ee().memoizedState}function zd(e,t,n){var r=at(e);if(n={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null},Ka(e))Ya(t,n);else if(n=Pa(e,t,n,r),n!==null){var l=re();Te(n,e,r,l),Xa(n,t,r)}}function Td(e,t,n){var r=at(e),l={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null};if(Ka(e))Ya(t,l);else{var o=e.alternate;if(e.lanes===0&&(o===null||o.lanes===0)&&(o=t.lastRenderedReducer,o!==null))try{var i=t.lastRenderedState,u=o(i,n);if(l.hasEagerState=!0,l.eagerState=u,Le(u,i)){var s=t.interleaved;s===null?(l.next=l,ki(t)):(l.next=s.next,s.next=l),t.interleaved=l;return}}catch{}finally{}n=Pa(e,t,l,r),n!==null&&(l=re(),Te(n,e,r,l),Xa(n,t,r))}}function Ka(e){var t=e.alternate;return e===F||t!==null&&t===F}function Ya(e,t){Ln=tl=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function Xa(e,t,n){if((n&4194240)!==0){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,ui(e,n)}}var nl={readContext:ke,useCallback:J,useContext:J,useEffect:J,useImperativeHandle:J,useInsertionEffect:J,useLayoutEffect:J,useMemo:J,useReducer:J,useRef:J,useState:J,useDebugValue:J,useDeferredValue:J,useTransition:J,useMutableSource:J,useSyncExternalStore:J,useId:J,unstable_isNewReconciler:!1},Ld={readContext:ke,useCallback:function(e,t){return Ie().memoizedState=[e,t===void 0?null:t],e},useContext:ke,useEffect:os,useImperativeHandle:function(e,t,n){return n=n!=null?n.concat([e]):null,Mr(4194308,4,Va.bind(null,t,e),n)},useLayoutEffect:function(e,t){return Mr(4194308,4,e,t)},useInsertionEffect:function(e,t){return Mr(4,2,e,t)},useMemo:function(e,t){var n=Ie();return t=t===void 0?null:t,e=e(),n.memoizedState=[e,t],e},useReducer:function(e,t,n){var r=Ie();return t=n!==void 0?n(t):t,r.memoizedState=r.baseState=t,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:t},r.queue=e,e=e.dispatch=zd.bind(null,F,e),[r.memoizedState,e]},useRef:function(e){var t=Ie();return e={current:e},t.memoizedState=e},useState:ls,useDebugValue:Li,useDeferredValue:function(e){return Ie().memoizedState=e},useTransition:function(){var e=ls(!1),t=e[0];return e=Pd.bind(null,e[1]),Ie().memoizedState=e,[t,e]},useMutableSource:function(){},useSyncExternalStore:function(e,t,n){var r=F,l=Ie();if(I){if(n===void 0)throw Error(v(407));n=n()}else{if(n=t(),K===null)throw Error(v(349));(Pt&30)!==0||Oa(r,t,n)}l.memoizedState=n;var o={value:n,getSnapshot:t};return l.queue=o,os(Ia.bind(null,r,o,e),[e]),r.flags|=2048,Gn(9,Ma.bind(null,r,o,n,t),void 0,null),n},useId:function(){var e=Ie(),t=K.identifierPrefix;if(I){var n=He,r=Ve;n=(r&~(1<<32-ze(r)-1)).toString(32)+n,t=":"+t+"R"+n,n=Yn++,0<n&&(t+="H"+n.toString(32)),t+=":"}else n=Nd++,t=":"+t+"r"+n.toString(32)+":";return e.memoizedState=t},unstable_isNewReconciler:!1},Rd={readContext:ke,useCallback:Ba,useContext:ke,useEffect:Ti,useImperativeHandle:Ha,useInsertionEffect:Ua,useLayoutEffect:Aa,useMemo:$a,useReducer:eo,useRef:ja,useState:function(){return eo(Xn)},useDebugValue:Li,useDeferredValue:function(e){var t=Ee();return Wa(t,B.memoizedState,e)},useTransition:function(){var e=eo(Xn)[0],t=Ee().memoizedState;return[e,t]},useMutableSource:La,useSyncExternalStore:Ra,useId:Qa,unstable_isNewReconciler:!1},Od={readContext:ke,useCallback:Ba,useContext:ke,useEffect:Ti,useImperativeHandle:Ha,useInsertionEffect:Ua,useLayoutEffect:Aa,useMemo:$a,useReducer:to,useRef:ja,useState:function(){return to(Xn)},useDebugValue:Li,useDeferredValue:function(e){var t=Ee();return B===null?t.memoizedState=e:Wa(t,B.memoizedState,e)},useTransition:function(){var e=to(Xn)[0],t=Ee().memoizedState;return[e,t]},useMutableSource:La,useSyncExternalStore:Ra,useId:Qa,unstable_isNewReconciler:!1};function _e(e,t){if(e&&e.defaultProps){t=j({},t),e=e.defaultProps;for(var n in e)t[n]===void 0&&(t[n]=e[n]);return t}return t}function jo(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:j({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var hl={isMounted:function(e){return(e=e._reactInternals)?Rt(e)===e:!1},enqueueSetState:function(e,t,n){e=e._reactInternals;var r=re(),l=at(e),o=Be(r,l);o.payload=t,n!=null&&(o.callback=n),t=ut(e,o,l),t!==null&&(Te(t,e,l,r),Rr(t,e,l))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=re(),l=at(e),o=Be(r,l);o.tag=1,o.payload=t,n!=null&&(o.callback=n),t=ut(e,o,l),t!==null&&(Te(t,e,l,r),Rr(t,e,l))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=re(),r=at(e),l=Be(n,r);l.tag=2,t!=null&&(l.callback=t),t=ut(e,l,r),t!==null&&(Te(t,e,r,n),Rr(t,e,r))}};function is(e,t,n,r,l,o,i){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(r,o,i):t.prototype&&t.prototype.isPureReactComponent?!Hn(n,r)||!Hn(l,o):!0}function Ga(e,t,n){var r=!1,l=dt,o=t.contextType;return typeof o=="object"&&o!==null?o=ke(o):(l=se(t)?_t:ee.current,r=t.contextTypes,o=(r=r!=null)?en(e,l):dt),t=new t(n,o),e.memoizedState=t.state!==null&&t.state!==void 0?t.state:null,t.updater=hl,e.stateNode=t,t._reactInternals=e,r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=l,e.__reactInternalMemoizedMaskedChildContext=o),t}function us(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&hl.enqueueReplaceState(t,t.state,null)}function Uo(e,t,n,r){var l=e.stateNode;l.props=n,l.state=e.memoizedState,l.refs={},Ei(e);var o=t.contextType;typeof o=="object"&&o!==null?l.context=ke(o):(o=se(t)?_t:ee.current,l.context=en(e,o)),l.state=e.memoizedState,o=t.getDerivedStateFromProps,typeof o=="function"&&(jo(e,t,o,n),l.state=e.memoizedState),typeof t.getDerivedStateFromProps=="function"||typeof l.getSnapshotBeforeUpdate=="function"||typeof l.UNSAFE_componentWillMount!="function"&&typeof l.componentWillMount!="function"||(t=l.state,typeof l.componentWillMount=="function"&&l.componentWillMount(),typeof l.UNSAFE_componentWillMount=="function"&&l.UNSAFE_componentWillMount(),t!==l.state&&hl.enqueueReplaceState(l,l.state,null),br(e,n,l,r),l.state=e.memoizedState),typeof l.componentDidMount=="function"&&(e.flags|=4194308)}function ln(e,t){try{var n="",r=t;do n+=sf(r),r=r.return;while(r);var l=n}catch(o){l=`\nError generating stack: `+o.message+`\n`+o.stack}return{value:e,source:t,stack:l,digest:null}}function no(e,t,n){return{value:e,source:null,stack:n??null,digest:t??null}}function Ao(e,t){try{console.error(t.value)}catch(n){setTimeout(function(){throw n})}}var Md=typeof WeakMap=="function"?WeakMap:Map;function Za(e,t,n){n=Be(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){ll||(ll=!0,Go=r),Ao(e,t)},n}function Ja(e,t,n){n=Be(-1,n),n.tag=3;var r=e.type.getDerivedStateFromError;if(typeof r=="function"){var l=t.value;n.payload=function(){return r(l)},n.callback=function(){Ao(e,t)}}var o=e.stateNode;return o!==null&&typeof o.componentDidCatch=="function"&&(n.callback=function(){Ao(e,t),typeof r!="function"&&(st===null?st=new Set([this]):st.add(this));var i=t.stack;this.componentDidCatch(t.value,{componentStack:i!==null?i:""})}),n}function ss(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new Md;var l=new Set;r.set(t,l)}else l=r.get(t),l===void 0&&(l=new Set,r.set(t,l));l.has(n)||(l.add(n),e=Yd.bind(null,e,t,n),t.then(e,e))}function as(e){do{var t;if((t=e.tag===13)&&(t=e.memoizedState,t=t!==null?t.dehydrated!==null:!0),t)return e;e=e.return}while(e!==null);return null}function cs(e,t,n,r,l){return(e.mode&1)===0?(e===t?e.flags|=65536:(e.flags|=128,n.flags|=131072,n.flags&=-52805,n.tag===1&&(n.alternate===null?n.tag=17:(t=Be(-1,1),t.tag=2,ut(n,t,1))),n.lanes|=1),e):(e.flags|=65536,e.lanes=l,e)}var Id=Ye.ReactCurrentOwner,ie=!1;function ne(e,t,n,r){t.child=e===null?Na(t,null,n,r):nn(t,e.child,n,r)}function fs(e,t,n,r,l){n=n.render;var o=t.ref;return Jt(t,l),r=Pi(e,t,n,r,o,l),n=zi(),e!==null&&!ie?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~l,Ke(e,t,l)):(I&&n&&hi(t),t.flags|=1,ne(e,t,r,l),t.child)}function ds(e,t,n,r,l){if(e===null){var o=n.type;return typeof o=="function"&&!Ui(o)&&o.defaultProps===void 0&&n.compare===null&&n.defaultProps===void 0?(t.tag=15,t.type=o,qa(e,t,o,r,l)):(e=jr(n.type,null,r,t,t.mode,l),e.ref=t.ref,e.return=t,t.child=e)}if(o=e.child,(e.lanes&l)===0){var i=o.memoizedProps;if(n=n.compare,n=n!==null?n:Hn,n(i,r)&&e.ref===t.ref)return Ke(e,t,l)}return t.flags|=1,e=ct(o,r),e.ref=t.ref,e.return=t,t.child=e}function qa(e,t,n,r,l){if(e!==null){var o=e.memoizedProps;if(Hn(o,r)&&e.ref===t.ref)if(ie=!1,t.pendingProps=r=o,(e.lanes&l)!==0)(e.flags&131072)!==0&&(ie=!0);else return t.lanes=e.lanes,Ke(e,t,l)}return Vo(e,t,n,r,l)}function ba(e,t,n){var r=t.pendingProps,l=r.children,o=e!==null?e.memoizedState:null;if(r.mode==="hidden")if((t.mode&1)===0)t.memoizedState={baseLanes:0,cachePool:null,transitions:null},R(Kt,ce),ce|=n;else{if((n&1073741824)===0)return e=o!==null?o.baseLanes|n:n,t.lanes=t.childLanes=1073741824,t.memoizedState={baseLanes:e,cachePool:null,transitions:null},t.updateQueue=null,R(Kt,ce),ce|=e,null;t.memoizedState={baseLanes:0,cachePool:null,transitions:null},r=o!==null?o.baseLanes:n,R(Kt,ce),ce|=r}else o!==null?(r=o.baseLanes|n,t.memoizedState=null):r=n,R(Kt,ce),ce|=r;return ne(e,t,l,n),t.child}function ec(e,t){var n=t.ref;(e===null&&n!==null||e!==null&&e.ref!==n)&&(t.flags|=512,t.flags|=2097152)}function Vo(e,t,n,r,l){var o=se(n)?_t:ee.current;return o=en(t,o),Jt(t,l),n=Pi(e,t,n,r,o,l),r=zi(),e!==null&&!ie?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~l,Ke(e,t,l)):(I&&r&&hi(t),t.flags|=1,ne(e,t,n,l),t.child)}function ps(e,t,n,r,l){if(se(n)){var o=!0;Xr(t)}else o=!1;if(Jt(t,l),t.stateNode===null)Ir(e,t),Ga(t,n,r),Uo(t,n,r,l),r=!0;else if(e===null){var i=t.stateNode,u=t.memoizedProps;i.props=u;var s=i.context,c=n.contextType;typeof c=="object"&&c!==null?c=ke(c):(c=se(n)?_t:ee.current,c=en(t,c));var m=n.getDerivedStateFromProps,p=typeof m=="function"||typeof i.getSnapshotBeforeUpdate=="function";p||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(u!==r||s!==c)&&us(t,i,r,c),qe=!1;var h=t.memoizedState;i.state=h,br(t,r,i,l),s=t.memoizedState,u!==r||h!==s||ue.current||qe?(typeof m=="function"&&(jo(t,n,m,r),s=t.memoizedState),(u=qe||is(t,n,u,r,h,s,c))?(p||typeof i.UNSAFE_componentWillMount!="function"&&typeof i.componentWillMount!="function"||(typeof i.componentWillMount=="function"&&i.componentWillMount(),typeof i.UNSAFE_componentWillMount=="function"&&i.UNSAFE_componentWillMount()),typeof i.componentDidMount=="function"&&(t.flags|=4194308)):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=s),i.props=r,i.state=s,i.context=c,r=u):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),r=!1)}else{i=t.stateNode,za(e,t),u=t.memoizedProps,c=t.type===t.elementType?u:_e(t.type,u),i.props=c,p=t.pendingProps,h=i.context,s=n.contextType,typeof s=="object"&&s!==null?s=ke(s):(s=se(n)?_t:ee.current,s=en(t,s));var w=n.getDerivedStateFromProps;(m=typeof w=="function"||typeof i.getSnapshotBeforeUpdate=="function")||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(u!==p||h!==s)&&us(t,i,r,s),qe=!1,h=t.memoizedState,i.state=h,br(t,r,i,l);var g=t.memoizedState;u!==p||h!==g||ue.current||qe?(typeof w=="function"&&(jo(t,n,w,r),g=t.memoizedState),(c=qe||is(t,n,c,r,h,g,s)||!1)?(m||typeof i.UNSAFE_componentWillUpdate!="function"&&typeof i.componentWillUpdate!="function"||(typeof i.componentWillUpdate=="function"&&i.componentWillUpdate(r,g,s),typeof i.UNSAFE_componentWillUpdate=="function"&&i.UNSAFE_componentWillUpdate(r,g,s)),typeof i.componentDidUpdate=="function"&&(t.flags|=4),typeof i.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof i.componentDidUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=g),i.props=r,i.state=g,i.context=s,r=c):(typeof i.componentDidUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),r=!1)}return Ho(e,t,n,r,o,l)}function Ho(e,t,n,r,l,o){ec(e,t);var i=(t.flags&128)!==0;if(!r&&!i)return l&&qu(t,n,!1),Ke(e,t,o);r=t.stateNode,Id.current=t;var u=i&&typeof n.getDerivedStateFromError!="function"?null:r.render();return t.flags|=1,e!==null&&i?(t.child=nn(t,e.child,null,o),t.child=nn(t,null,u,o)):ne(e,t,u,o),t.memoizedState=r.state,l&&qu(t,n,!0),t.child}function tc(e){var t=e.stateNode;t.pendingContext?Ju(e,t.pendingContext,t.pendingContext!==t.context):t.context&&Ju(e,t.context,!1),Ci(e,t.containerInfo)}function ms(e,t,n,r,l){return tn(),yi(l),t.flags|=256,ne(e,t,n,r),t.child}var Bo={dehydrated:null,treeContext:null,retryLane:0};function $o(e){return{baseLanes:e,cachePool:null,transitions:null}}function nc(e,t,n){var r=t.pendingProps,l=D.current,o=!1,i=(t.flags&128)!==0,u;if((u=i)||(u=e!==null&&e.memoizedState===null?!1:(l&2)!==0),u?(o=!0,t.flags&=-129):(e===null||e.memoizedState!==null)&&(l|=1),R(D,l&1),e===null)return Do(t),e=t.memoizedState,e!==null&&(e=e.dehydrated,e!==null)?((t.mode&1)===0?t.lanes=1:e.data==="$!"?t.lanes=8:t.lanes=1073741824,null):(i=r.children,e=r.fallback,o?(r=t.mode,o=t.child,i={mode:"hidden",children:i},(r&1)===0&&o!==null?(o.childLanes=0,o.pendingProps=i):o=gl(i,r,0,null),e=xt(e,r,n,null),o.return=t,e.return=t,o.sibling=e,t.child=o,t.child.memoizedState=$o(n),t.memoizedState=Bo,e):Ri(t,i));if(l=e.memoizedState,l!==null&&(u=l.dehydrated,u!==null))return Dd(e,t,i,r,u,l,n);if(o){o=r.fallback,i=t.mode,l=e.child,u=l.sibling;var s={mode:"hidden",children:r.children};return(i&1)===0&&t.child!==l?(r=t.child,r.childLanes=0,r.pendingProps=s,t.deletions=null):(r=ct(l,s),r.subtreeFlags=l.subtreeFlags&14680064),u!==null?o=ct(u,o):(o=xt(o,i,n,null),o.flags|=2),o.return=t,r.return=t,r.sibling=o,t.child=r,r=o,o=t.child,i=e.child.memoizedState,i=i===null?$o(n):{baseLanes:i.baseLanes|n,cachePool:null,transitions:i.transitions},o.memoizedState=i,o.childLanes=e.childLanes&~n,t.memoizedState=Bo,r}return o=e.child,e=o.sibling,r=ct(o,{mode:"visible",children:r.children}),(t.mode&1)===0&&(r.lanes=n),r.return=t,r.sibling=null,e!==null&&(n=t.deletions,n===null?(t.deletions=[e],t.flags|=16):n.push(e)),t.child=r,t.memoizedState=null,r}function Ri(e,t){return t=gl({mode:"visible",children:t},e.mode,0,null),t.return=e,e.child=t}function _r(e,t,n,r){return r!==null&&yi(r),nn(t,e.child,null,n),e=Ri(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function Dd(e,t,n,r,l,o,i){if(n)return t.flags&256?(t.flags&=-257,r=no(Error(v(422))),_r(e,t,i,r)):t.memoizedState!==null?(t.child=e.child,t.flags|=128,null):(o=r.fallback,l=t.mode,r=gl({mode:"visible",children:r.children},l,0,null),o=xt(o,l,i,null),o.flags|=2,r.return=t,o.return=t,r.sibling=o,t.child=r,(t.mode&1)!==0&&nn(t,e.child,null,i),t.child.memoizedState=$o(i),t.memoizedState=Bo,o);if((t.mode&1)===0)return _r(e,t,i,null);if(l.data==="$!"){if(r=l.nextSibling&&l.nextSibling.dataset,r)var u=r.dgst;return r=u,o=Error(v(419)),r=no(o,r,void 0),_r(e,t,i,r)}if(u=(i&e.childLanes)!==0,ie||u){if(r=K,r!==null){switch(i&-i){case 4:l=2;break;case 16:l=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:l=32;break;case 536870912:l=268435456;break;default:l=0}l=(l&(r.suspendedLanes|i))!==0?0:l,l!==0&&l!==o.retryLane&&(o.retryLane=l,Qe(e,l),Te(r,e,l,-1))}return ji(),r=no(Error(v(421))),_r(e,t,i,r)}return l.data==="$?"?(t.flags|=128,t.child=e.child,t=Xd.bind(null,e),l._reactRetry=t,null):(e=o.treeContext,fe=it(l.nextSibling),de=t,I=!0,Pe=null,e!==null&&(ye[ge++]=Ve,ye[ge++]=He,ye[ge++]=Nt,Ve=e.id,He=e.overflow,Nt=t),t=Ri(t,r.children),t.flags|=4096,t)}function hs(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),Fo(e.return,t,n)}function ro(e,t,n,r,l){var o=e.memoizedState;o===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:l}:(o.isBackwards=t,o.rendering=null,o.renderingStartTime=0,o.last=r,o.tail=n,o.tailMode=l)}function rc(e,t,n){var r=t.pendingProps,l=r.revealOrder,o=r.tail;if(ne(e,t,r.children,n),r=D.current,(r&2)!==0)r=r&1|2,t.flags|=128;else{if(e!==null&&(e.flags&128)!==0)e:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&hs(e,n,t);else if(e.tag===19)hs(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break e;for(;e.sibling===null;){if(e.return===null||e.return===t)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}r&=1}if(R(D,r),(t.mode&1)===0)t.memoizedState=null;else switch(l){case"forwards":for(n=t.child,l=null;n!==null;)e=n.alternate,e!==null&&el(e)===null&&(l=n),n=n.sibling;n=l,n===null?(l=t.child,t.child=null):(l=n.sibling,n.sibling=null),ro(t,!1,l,n,o);break;case"backwards":for(n=null,l=t.child,t.child=null;l!==null;){if(e=l.alternate,e!==null&&el(e)===null){t.child=l;break}e=l.sibling,l.sibling=n,n=l,l=e}ro(t,!0,n,null,o);break;case"together":ro(t,!1,null,null,void 0);break;default:t.memoizedState=null}return t.child}function Ir(e,t){(t.mode&1)===0&&e!==null&&(e.alternate=null,t.alternate=null,t.flags|=2)}function Ke(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),zt|=t.lanes,(n&t.childLanes)===0)return null;if(e!==null&&t.child!==e.child)throw Error(v(153));if(t.child!==null){for(e=t.child,n=ct(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=ct(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function Fd(e,t,n){switch(t.tag){case 3:tc(t),tn();break;case 5:Ta(t);break;case 1:se(t.type)&&Xr(t);break;case 4:Ci(t,t.stateNode.containerInfo);break;case 10:var r=t.type._context,l=t.memoizedProps.value;R(Jr,r._currentValue),r._currentValue=l;break;case 13:if(r=t.memoizedState,r!==null)return r.dehydrated!==null?(R(D,D.current&1),t.flags|=128,null):(n&t.child.childLanes)!==0?nc(e,t,n):(R(D,D.current&1),e=Ke(e,t,n),e!==null?e.sibling:null);R(D,D.current&1);break;case 19:if(r=(n&t.childLanes)!==0,(e.flags&128)!==0){if(r)return rc(e,t,n);t.flags|=128}if(l=t.memoizedState,l!==null&&(l.rendering=null,l.tail=null,l.lastEffect=null),R(D,D.current),r)break;return null;case 22:case 23:return t.lanes=0,ba(e,t,n)}return Ke(e,t,n)}var lc,Wo,oc,ic;lc=function(e,t){for(var n=t.child;n!==null;){if(n.tag===5||n.tag===6)e.appendChild(n.stateNode);else if(n.tag!==4&&n.child!==null){n.child.return=n,n=n.child;continue}if(n===t)break;for(;n.sibling===null;){if(n.return===null||n.return===t)return;n=n.return}n.sibling.return=n.return,n=n.sibling}};Wo=function(){};oc=function(e,t,n,r){var l=e.memoizedProps;if(l!==r){e=t.stateNode,Et(je.current);var o=null;switch(n){case"input":l=fo(e,l),r=fo(e,r),o=[];break;case"select":l=j({},l,{value:void 0}),r=j({},r,{value:void 0}),o=[];break;case"textarea":l=ho(e,l),r=ho(e,r),o=[];break;default:typeof l.onClick!="function"&&typeof r.onClick=="function"&&(e.onclick=Kr)}yo(n,r);var i;n=null;for(c in l)if(!r.hasOwnProperty(c)&&l.hasOwnProperty(c)&&l[c]!=null)if(c==="style"){var u=l[c];for(i in u)u.hasOwnProperty(i)&&(n||(n={}),n[i]="")}else c!=="dangerouslySetInnerHTML"&&c!=="children"&&c!=="suppressContentEditableWarning"&&c!=="suppressHydrationWarning"&&c!=="autoFocus"&&(In.hasOwnProperty(c)?o||(o=[]):(o=o||[]).push(c,null));for(c in r){var s=r[c];if(u=l?.[c],r.hasOwnProperty(c)&&s!==u&&(s!=null||u!=null))if(c==="style")if(u){for(i in u)!u.hasOwnProperty(i)||s&&s.hasOwnProperty(i)||(n||(n={}),n[i]="");for(i in s)s.hasOwnProperty(i)&&u[i]!==s[i]&&(n||(n={}),n[i]=s[i])}else n||(o||(o=[]),o.push(c,n)),n=s;else c==="dangerouslySetInnerHTML"?(s=s?s.__html:void 0,u=u?u.__html:void 0,s!=null&&u!==s&&(o=o||[]).push(c,s)):c==="children"?typeof s!="string"&&typeof s!="number"||(o=o||[]).push(c,""+s):c!=="suppressContentEditableWarning"&&c!=="suppressHydrationWarning"&&(In.hasOwnProperty(c)?(s!=null&&c==="onScroll"&&O("scroll",e),o||u===s||(o=[])):(o=o||[]).push(c,s))}n&&(o=o||[]).push("style",n);var c=o;(t.updateQueue=c)&&(t.flags|=4)}};ic=function(e,t,n,r){n!==r&&(t.flags|=4)};function gn(e,t){if(!I)switch(e.tailMode){case"hidden":t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case"collapsed":n=e.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function q(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var l=e.child;l!==null;)n|=l.lanes|l.childLanes,r|=l.subtreeFlags&14680064,r|=l.flags&14680064,l.return=e,l=l.sibling;else for(l=e.child;l!==null;)n|=l.lanes|l.childLanes,r|=l.subtreeFlags,r|=l.flags,l.return=e,l=l.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function jd(e,t,n){var r=t.pendingProps;switch(vi(t),t.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return q(t),null;case 1:return se(t.type)&&Yr(),q(t),null;case 3:return r=t.stateNode,rn(),M(ue),M(ee),_i(),r.pendingContext&&(r.context=r.pendingContext,r.pendingContext=null),(e===null||e.child===null)&&(Cr(t)?t.flags|=4:e===null||e.memoizedState.isDehydrated&&(t.flags&256)===0||(t.flags|=1024,Pe!==null&&(qo(Pe),Pe=null))),Wo(e,t),q(t),null;case 5:xi(t);var l=Et(Kn.current);if(n=t.type,e!==null&&t.stateNode!=null)oc(e,t,n,r,l),e.ref!==t.ref&&(t.flags|=512,t.flags|=2097152);else{if(!r){if(t.stateNode===null)throw Error(v(166));return q(t),null}if(e=Et(je.current),Cr(t)){r=t.stateNode,n=t.type;var o=t.memoizedProps;switch(r[De]=t,r[Wn]=o,e=(t.mode&1)!==0,n){case"dialog":O("cancel",r),O("close",r);break;case"iframe":case"object":case"embed":O("load",r);break;case"video":case"audio":for(l=0;l<xn.length;l++)O(xn[l],r);break;case"source":O("error",r);break;case"img":case"image":case"link":O("error",r),O("load",r);break;case"details":O("toggle",r);break;case"input":Cu(r,o),O("invalid",r);break;case"select":r._wrapperState={wasMultiple:!!o.multiple},O("invalid",r);break;case"textarea":_u(r,o),O("invalid",r)}yo(n,o),l=null;for(var i in o)if(o.hasOwnProperty(i)){var u=o[i];i==="children"?typeof u=="string"?r.textContent!==u&&(o.suppressHydrationWarning!==!0&&Er(r.textContent,u,e),l=["children",u]):typeof u=="number"&&r.textContent!==""+u&&(o.suppressHydrationWarning!==!0&&Er(r.textContent,u,e),l=["children",""+u]):In.hasOwnProperty(i)&&u!=null&&i==="onScroll"&&O("scroll",r)}switch(n){case"input":cr(r),xu(r,o,!0);break;case"textarea":cr(r),Nu(r);break;case"select":case"option":break;default:typeof o.onClick=="function"&&(r.onclick=Kr)}r=l,t.updateQueue=r,r!==null&&(t.flags|=4)}else{i=l.nodeType===9?l:l.ownerDocument,e==="http://www.w3.org/1999/xhtml"&&(e=Is(n)),e==="http://www.w3.org/1999/xhtml"?n==="script"?(e=i.createElement("div"),e.innerHTML="<script><\\/script>",e=e.removeChild(e.firstChild)):typeof r.is=="string"?e=i.createElement(n,{is:r.is}):(e=i.createElement(n),n==="select"&&(i=e,r.multiple?i.multiple=!0:r.size&&(i.size=r.size))):e=i.createElementNS(e,n),e[De]=t,e[Wn]=r,lc(e,t,!1,!1),t.stateNode=e;e:{switch(i=go(n,r),n){case"dialog":O("cancel",e),O("close",e),l=r;break;case"iframe":case"object":case"embed":O("load",e),l=r;break;case"video":case"audio":for(l=0;l<xn.length;l++)O(xn[l],e);l=r;break;case"source":O("error",e),l=r;break;case"img":case"image":case"link":O("error",e),O("load",e),l=r;break;case"details":O("toggle",e),l=r;break;case"input":Cu(e,r),l=fo(e,r),O("invalid",e);break;case"option":l=r;break;case"select":e._wrapperState={wasMultiple:!!r.multiple},l=j({},r,{value:void 0}),O("invalid",e);break;case"textarea":_u(e,r),l=ho(e,r),O("invalid",e);break;default:l=r}yo(n,l),u=l;for(o in u)if(u.hasOwnProperty(o)){var s=u[o];o==="style"?js(e,s):o==="dangerouslySetInnerHTML"?(s=s?s.__html:void 0,s!=null&&Ds(e,s)):o==="children"?typeof s=="string"?(n!=="textarea"||s!=="")&&Dn(e,s):typeof s=="number"&&Dn(e,""+s):o!=="suppressContentEditableWarning"&&o!=="suppressHydrationWarning"&&o!=="autoFocus"&&(In.hasOwnProperty(o)?s!=null&&o==="onScroll"&&O("scroll",e):s!=null&&ti(e,o,s,i))}switch(n){case"input":cr(e),xu(e,r,!1);break;case"textarea":cr(e),Nu(e);break;case"option":r.value!=null&&e.setAttribute("value",""+ft(r.value));break;case"select":e.multiple=!!r.multiple,o=r.value,o!=null?Yt(e,!!r.multiple,o,!1):r.defaultValue!=null&&Yt(e,!!r.multiple,r.defaultValue,!0);break;default:typeof l.onClick=="function"&&(e.onclick=Kr)}switch(n){case"button":case"input":case"select":case"textarea":r=!!r.autoFocus;break e;case"img":r=!0;break e;default:r=!1}}r&&(t.flags|=4)}t.ref!==null&&(t.flags|=512,t.flags|=2097152)}return q(t),null;case 6:if(e&&t.stateNode!=null)ic(e,t,e.memoizedProps,r);else{if(typeof r!="string"&&t.stateNode===null)throw Error(v(166));if(n=Et(Kn.current),Et(je.current),Cr(t)){if(r=t.stateNode,n=t.memoizedProps,r[De]=t,(o=r.nodeValue!==n)&&(e=de,e!==null))switch(e.tag){case 3:Er(r.nodeValue,n,(e.mode&1)!==0);break;case 5:e.memoizedProps.suppressHydrationWarning!==!0&&Er(r.nodeValue,n,(e.mode&1)!==0)}o&&(t.flags|=4)}else r=(n.nodeType===9?n:n.ownerDocument).createTextNode(r),r[De]=t,t.stateNode=r}return q(t),null;case 13:if(M(D),r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(I&&fe!==null&&(t.mode&1)!==0&&(t.flags&128)===0)xa(),tn(),t.flags|=98560,o=!1;else if(o=Cr(t),r!==null&&r.dehydrated!==null){if(e===null){if(!o)throw Error(v(318));if(o=t.memoizedState,o=o!==null?o.dehydrated:null,!o)throw Error(v(317));o[De]=t}else tn(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;q(t),o=!1}else Pe!==null&&(qo(Pe),Pe=null),o=!0;if(!o)return t.flags&65536?t:null}return(t.flags&128)!==0?(t.lanes=n,t):(r=r!==null,r!==(e!==null&&e.memoizedState!==null)&&r&&(t.child.flags|=8192,(t.mode&1)!==0&&(e===null||(D.current&1)!==0?$===0&&($=3):ji())),t.updateQueue!==null&&(t.flags|=4),q(t),null);case 4:return rn(),Wo(e,t),e===null&&Bn(t.stateNode.containerInfo),q(t),null;case 10:return Si(t.type._context),q(t),null;case 17:return se(t.type)&&Yr(),q(t),null;case 19:if(M(D),o=t.memoizedState,o===null)return q(t),null;if(r=(t.flags&128)!==0,i=o.rendering,i===null)if(r)gn(o,!1);else{if($!==0||e!==null&&(e.flags&128)!==0)for(e=t.child;e!==null;){if(i=el(e),i!==null){for(t.flags|=128,gn(o,!1),r=i.updateQueue,r!==null&&(t.updateQueue=r,t.flags|=4),t.subtreeFlags=0,r=n,n=t.child;n!==null;)o=n,e=r,o.flags&=14680066,i=o.alternate,i===null?(o.childLanes=0,o.lanes=e,o.child=null,o.subtreeFlags=0,o.memoizedProps=null,o.memoizedState=null,o.updateQueue=null,o.dependencies=null,o.stateNode=null):(o.childLanes=i.childLanes,o.lanes=i.lanes,o.child=i.child,o.subtreeFlags=0,o.deletions=null,o.memoizedProps=i.memoizedProps,o.memoizedState=i.memoizedState,o.updateQueue=i.updateQueue,o.type=i.type,e=i.dependencies,o.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext}),n=n.sibling;return R(D,D.current&1|2),t.child}e=e.sibling}o.tail!==null&&V()>on&&(t.flags|=128,r=!0,gn(o,!1),t.lanes=4194304)}else{if(!r)if(e=el(i),e!==null){if(t.flags|=128,r=!0,n=e.updateQueue,n!==null&&(t.updateQueue=n,t.flags|=4),gn(o,!0),o.tail===null&&o.tailMode==="hidden"&&!i.alternate&&!I)return q(t),null}else 2*V()-o.renderingStartTime>on&&n!==1073741824&&(t.flags|=128,r=!0,gn(o,!1),t.lanes=4194304);o.isBackwards?(i.sibling=t.child,t.child=i):(n=o.last,n!==null?n.sibling=i:t.child=i,o.last=i)}return o.tail!==null?(t=o.tail,o.rendering=t,o.tail=t.sibling,o.renderingStartTime=V(),t.sibling=null,n=D.current,R(D,r?n&1|2:n&1),t):(q(t),null);case 22:case 23:return Fi(),r=t.memoizedState!==null,e!==null&&e.memoizedState!==null!==r&&(t.flags|=8192),r&&(t.mode&1)!==0?(ce&1073741824)!==0&&(q(t),t.subtreeFlags&6&&(t.flags|=8192)):q(t),null;case 24:return null;case 25:return null}throw Error(v(156,t.tag))}function Ud(e,t){switch(vi(t),t.tag){case 1:return se(t.type)&&Yr(),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return rn(),M(ue),M(ee),_i(),e=t.flags,(e&65536)!==0&&(e&128)===0?(t.flags=e&-65537|128,t):null;case 5:return xi(t),null;case 13:if(M(D),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(v(340));tn()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return M(D),null;case 4:return rn(),null;case 10:return Si(t.type._context),null;case 22:case 23:return Fi(),null;case 24:return null;default:return null}}var Nr=!1,b=!1,Ad=typeof WeakSet=="function"?WeakSet:Set,k=null;function Qt(e,t){var n=e.ref;if(n!==null)if(typeof n=="function")try{n(null)}catch(r){U(e,t,r)}else n.current=null}function Qo(e,t,n){try{n()}catch(r){U(e,t,r)}}var vs=!1;function Vd(e,t){if(zo=$r,e=fa(),mi(e)){if("selectionStart"in e)var n={start:e.selectionStart,end:e.selectionEnd};else e:{n=(n=e.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var l=r.anchorOffset,o=r.focusNode;r=r.focusOffset;try{n.nodeType,o.nodeType}catch{n=null;break e}var i=0,u=-1,s=-1,c=0,m=0,p=e,h=null;t:for(;;){for(var w;p!==n||l!==0&&p.nodeType!==3||(u=i+l),p!==o||r!==0&&p.nodeType!==3||(s=i+r),p.nodeType===3&&(i+=p.nodeValue.length),(w=p.firstChild)!==null;)h=p,p=w;for(;;){if(p===e)break t;if(h===n&&++c===l&&(u=i),h===o&&++m===r&&(s=i),(w=p.nextSibling)!==null)break;p=h,h=p.parentNode}p=w}n=u===-1||s===-1?null:{start:u,end:s}}else n=null}n=n||{start:0,end:0}}else n=null;for(To={focusedElem:e,selectionRange:n},$r=!1,k=t;k!==null;)if(t=k,e=t.child,(t.subtreeFlags&1028)!==0&&e!==null)e.return=t,k=e;else for(;k!==null;){t=k;try{var g=t.alternate;if((t.flags&1024)!==0)switch(t.tag){case 0:case 11:case 15:break;case 1:if(g!==null){var S=g.memoizedProps,A=g.memoizedState,f=t.stateNode,a=f.getSnapshotBeforeUpdate(t.elementType===t.type?S:_e(t.type,S),A);f.__reactInternalSnapshotBeforeUpdate=a}break;case 3:var d=t.stateNode.containerInfo;d.nodeType===1?d.textContent="":d.nodeType===9&&d.documentElement&&d.removeChild(d.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(v(163))}}catch(y){U(t,t.return,y)}if(e=t.sibling,e!==null){e.return=t.return,k=e;break}k=t.return}return g=vs,vs=!1,g}function Rn(e,t,n){var r=t.updateQueue;if(r=r!==null?r.lastEffect:null,r!==null){var l=r=r.next;do{if((l.tag&e)===e){var o=l.destroy;l.destroy=void 0,o!==void 0&&Qo(t,n,o)}l=l.next}while(l!==r)}}function vl(e,t){if(t=t.updateQueue,t=t!==null?t.lastEffect:null,t!==null){var n=t=t.next;do{if((n.tag&e)===e){var r=n.create;n.destroy=r()}n=n.next}while(n!==t)}}function Ko(e){var t=e.ref;if(t!==null){var n=e.stateNode;switch(e.tag){case 5:e=n;break;default:e=n}typeof t=="function"?t(e):t.current=e}}function uc(e){var t=e.alternate;t!==null&&(e.alternate=null,uc(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&(delete t[De],delete t[Wn],delete t[Oo],delete t[Ed],delete t[Cd])),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}function sc(e){return e.tag===5||e.tag===3||e.tag===4}function ys(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||sc(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Yo(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.nodeType===8?n.parentNode.insertBefore(e,t):n.insertBefore(e,t):(n.nodeType===8?(t=n.parentNode,t.insertBefore(e,n)):(t=n,t.appendChild(e)),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=Kr));else if(r!==4&&(e=e.child,e!==null))for(Yo(e,t,n),e=e.sibling;e!==null;)Yo(e,t,n),e=e.sibling}function Xo(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(r!==4&&(e=e.child,e!==null))for(Xo(e,t,n),e=e.sibling;e!==null;)Xo(e,t,n),e=e.sibling}var Y=null,Ne=!1;function Ze(e,t,n){for(n=n.child;n!==null;)ac(e,t,n),n=n.sibling}function ac(e,t,n){if(Fe&&typeof Fe.onCommitFiberUnmount=="function")try{Fe.onCommitFiberUnmount(sl,n)}catch{}switch(n.tag){case 5:b||Qt(n,t);case 6:var r=Y,l=Ne;Y=null,Ze(e,t,n),Y=r,Ne=l,Y!==null&&(Ne?(e=Y,n=n.stateNode,e.nodeType===8?e.parentNode.removeChild(n):e.removeChild(n)):Y.removeChild(n.stateNode));break;case 18:Y!==null&&(Ne?(e=Y,n=n.stateNode,e.nodeType===8?Zl(e.parentNode,n):e.nodeType===1&&Zl(e,n),An(e)):Zl(Y,n.stateNode));break;case 4:r=Y,l=Ne,Y=n.stateNode.containerInfo,Ne=!0,Ze(e,t,n),Y=r,Ne=l;break;case 0:case 11:case 14:case 15:if(!b&&(r=n.updateQueue,r!==null&&(r=r.lastEffect,r!==null))){l=r=r.next;do{var o=l,i=o.destroy;o=o.tag,i!==void 0&&((o&2)!==0||(o&4)!==0)&&Qo(n,t,i),l=l.next}while(l!==r)}Ze(e,t,n);break;case 1:if(!b&&(Qt(n,t),r=n.stateNode,typeof r.componentWillUnmount=="function"))try{r.props=n.memoizedProps,r.state=n.memoizedState,r.componentWillUnmount()}catch(u){U(n,t,u)}Ze(e,t,n);break;case 21:Ze(e,t,n);break;case 22:n.mode&1?(b=(r=b)||n.memoizedState!==null,Ze(e,t,n),b=r):Ze(e,t,n);break;default:Ze(e,t,n)}}function gs(e){var t=e.updateQueue;if(t!==null){e.updateQueue=null;var n=e.stateNode;n===null&&(n=e.stateNode=new Ad),t.forEach(function(r){var l=Gd.bind(null,e,r);n.has(r)||(n.add(r),r.then(l,l))})}}function xe(e,t){var n=t.deletions;if(n!==null)for(var r=0;r<n.length;r++){var l=n[r];try{var o=e,i=t,u=i;e:for(;u!==null;){switch(u.tag){case 5:Y=u.stateNode,Ne=!1;break e;case 3:Y=u.stateNode.containerInfo,Ne=!0;break e;case 4:Y=u.stateNode.containerInfo,Ne=!0;break e}u=u.return}if(Y===null)throw Error(v(160));ac(o,i,l),Y=null,Ne=!1;var s=l.alternate;s!==null&&(s.return=null),l.return=null}catch(c){U(l,t,c)}}if(t.subtreeFlags&12854)for(t=t.child;t!==null;)cc(t,e),t=t.sibling}function cc(e,t){var n=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if(xe(t,e),Me(e),r&4){try{Rn(3,e,e.return),vl(3,e)}catch(S){U(e,e.return,S)}try{Rn(5,e,e.return)}catch(S){U(e,e.return,S)}}break;case 1:xe(t,e),Me(e),r&512&&n!==null&&Qt(n,n.return);break;case 5:if(xe(t,e),Me(e),r&512&&n!==null&&Qt(n,n.return),e.flags&32){var l=e.stateNode;try{Dn(l,"")}catch(S){U(e,e.return,S)}}if(r&4&&(l=e.stateNode,l!=null)){var o=e.memoizedProps,i=n!==null?n.memoizedProps:o,u=e.type,s=e.updateQueue;if(e.updateQueue=null,s!==null)try{u==="input"&&o.type==="radio"&&o.name!=null&&Os(l,o),go(u,i);var c=go(u,o);for(i=0;i<s.length;i+=2){var m=s[i],p=s[i+1];m==="style"?js(l,p):m==="dangerouslySetInnerHTML"?Ds(l,p):m==="children"?Dn(l,p):ti(l,m,p,c)}switch(u){case"input":po(l,o);break;case"textarea":Ms(l,o);break;case"select":var h=l._wrapperState.wasMultiple;l._wrapperState.wasMultiple=!!o.multiple;var w=o.value;w!=null?Yt(l,!!o.multiple,w,!1):h!==!!o.multiple&&(o.defaultValue!=null?Yt(l,!!o.multiple,o.defaultValue,!0):Yt(l,!!o.multiple,o.multiple?[]:"",!1))}l[Wn]=o}catch(S){U(e,e.return,S)}}break;case 6:if(xe(t,e),Me(e),r&4){if(e.stateNode===null)throw Error(v(162));l=e.stateNode,o=e.memoizedProps;try{l.nodeValue=o}catch(S){U(e,e.return,S)}}break;case 3:if(xe(t,e),Me(e),r&4&&n!==null&&n.memoizedState.isDehydrated)try{An(t.containerInfo)}catch(S){U(e,e.return,S)}break;case 4:xe(t,e),Me(e);break;case 13:xe(t,e),Me(e),l=e.child,l.flags&8192&&(o=l.memoizedState!==null,l.stateNode.isHidden=o,!o||l.alternate!==null&&l.alternate.memoizedState!==null||(Ii=V())),r&4&&gs(e);break;case 22:if(m=n!==null&&n.memoizedState!==null,e.mode&1?(b=(c=b)||m,xe(t,e),b=c):xe(t,e),Me(e),r&8192){if(c=e.memoizedState!==null,(e.stateNode.isHidden=c)&&!m&&(e.mode&1)!==0)for(k=e,m=e.child;m!==null;){for(p=k=m;k!==null;){switch(h=k,w=h.child,h.tag){case 0:case 11:case 14:case 15:Rn(4,h,h.return);break;case 1:Qt(h,h.return);var g=h.stateNode;if(typeof g.componentWillUnmount=="function"){r=h,n=h.return;try{t=r,g.props=t.memoizedProps,g.state=t.memoizedState,g.componentWillUnmount()}catch(S){U(r,n,S)}}break;case 5:Qt(h,h.return);break;case 22:if(h.memoizedState!==null){Ss(p);continue}}w!==null?(w.return=h,k=w):Ss(p)}m=m.sibling}e:for(m=null,p=e;;){if(p.tag===5){if(m===null){m=p;try{l=p.stateNode,c?(o=l.style,typeof o.setProperty=="function"?o.setProperty("display","none","important"):o.display="none"):(u=p.stateNode,s=p.memoizedProps.style,i=s!=null&&s.hasOwnProperty("display")?s.display:null,u.style.display=Fs("display",i))}catch(S){U(e,e.return,S)}}}else if(p.tag===6){if(m===null)try{p.stateNode.nodeValue=c?"":p.memoizedProps}catch(S){U(e,e.return,S)}}else if((p.tag!==22&&p.tag!==23||p.memoizedState===null||p===e)&&p.child!==null){p.child.return=p,p=p.child;continue}if(p===e)break e;for(;p.sibling===null;){if(p.return===null||p.return===e)break e;m===p&&(m=null),p=p.return}m===p&&(m=null),p.sibling.return=p.return,p=p.sibling}}break;case 19:xe(t,e),Me(e),r&4&&gs(e);break;case 21:break;default:xe(t,e),Me(e)}}function Me(e){var t=e.flags;if(t&2){try{e:{for(var n=e.return;n!==null;){if(sc(n)){var r=n;break e}n=n.return}throw Error(v(160))}switch(r.tag){case 5:var l=r.stateNode;r.flags&32&&(Dn(l,""),r.flags&=-33);var o=ys(e);Xo(e,o,l);break;case 3:case 4:var i=r.stateNode.containerInfo,u=ys(e);Yo(e,u,i);break;default:throw Error(v(161))}}catch(s){U(e,e.return,s)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function Hd(e,t,n){k=e,fc(e,t,n)}function fc(e,t,n){for(var r=(e.mode&1)!==0;k!==null;){var l=k,o=l.child;if(l.tag===22&&r){var i=l.memoizedState!==null||Nr;if(!i){var u=l.alternate,s=u!==null&&u.memoizedState!==null||b;u=Nr;var c=b;if(Nr=i,(b=s)&&!c)for(k=l;k!==null;)i=k,s=i.child,i.tag===22&&i.memoizedState!==null?ks(l):s!==null?(s.return=i,k=s):ks(l);for(;o!==null;)k=o,fc(o,t,n),o=o.sibling;k=l,Nr=u,b=c}ws(e,t,n)}else(l.subtreeFlags&8772)!==0&&o!==null?(o.return=l,k=o):ws(e,t,n)}}function ws(e){for(;k!==null;){var t=k;if((t.flags&8772)!==0){var n=t.alternate;try{if((t.flags&8772)!==0)switch(t.tag){case 0:case 11:case 15:b||vl(5,t);break;case 1:var r=t.stateNode;if(t.flags&4&&!b)if(n===null)r.componentDidMount();else{var l=t.elementType===t.type?n.memoizedProps:_e(t.type,n.memoizedProps);r.componentDidUpdate(l,n.memoizedState,r.__reactInternalSnapshotBeforeUpdate)}var o=t.updateQueue;o!==null&&rs(t,o,r);break;case 3:var i=t.updateQueue;if(i!==null){if(n=null,t.child!==null)switch(t.child.tag){case 5:n=t.child.stateNode;break;case 1:n=t.child.stateNode}rs(t,i,n)}break;case 5:var u=t.stateNode;if(n===null&&t.flags&4){n=u;var s=t.memoizedProps;switch(t.type){case"button":case"input":case"select":case"textarea":s.autoFocus&&n.focus();break;case"img":s.src&&(n.src=s.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(t.memoizedState===null){var c=t.alternate;if(c!==null){var m=c.memoizedState;if(m!==null){var p=m.dehydrated;p!==null&&An(p)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(v(163))}b||t.flags&512&&Ko(t)}catch(h){U(t,t.return,h)}}if(t===e){k=null;break}if(n=t.sibling,n!==null){n.return=t.return,k=n;break}k=t.return}}function Ss(e){for(;k!==null;){var t=k;if(t===e){k=null;break}var n=t.sibling;if(n!==null){n.return=t.return,k=n;break}k=t.return}}function ks(e){for(;k!==null;){var t=k;try{switch(t.tag){case 0:case 11:case 15:var n=t.return;try{vl(4,t)}catch(s){U(t,n,s)}break;case 1:var r=t.stateNode;if(typeof r.componentDidMount=="function"){var l=t.return;try{r.componentDidMount()}catch(s){U(t,l,s)}}var o=t.return;try{Ko(t)}catch(s){U(t,o,s)}break;case 5:var i=t.return;try{Ko(t)}catch(s){U(t,i,s)}}}catch(s){U(t,t.return,s)}if(t===e){k=null;break}var u=t.sibling;if(u!==null){u.return=t.return,k=u;break}k=t.return}}var Bd=Math.ceil,rl=Ye.ReactCurrentDispatcher,Oi=Ye.ReactCurrentOwner,Se=Ye.ReactCurrentBatchConfig,P=0,K=null,H=null,X=0,ce=0,Kt=mt(0),$=0,Zn=null,zt=0,yl=0,Mi=0,On=null,oe=null,Ii=0,on=1/0,Ue=null,ll=!1,Go=null,st=null,Pr=!1,nt=null,ol=0,Mn=0,Zo=null,Dr=-1,Fr=0;function re(){return(P&6)!==0?V():Dr!==-1?Dr:Dr=V()}function at(e){return(e.mode&1)===0?1:(P&2)!==0&&X!==0?X&-X:_d.transition!==null?(Fr===0&&(Fr=Gs()),Fr):(e=T,e!==0||(e=window.event,e=e===void 0?16:na(e.type)),e)}function Te(e,t,n,r){if(50<Mn)throw Mn=0,Zo=null,Error(v(185));Jn(e,n,r),((P&2)===0||e!==K)&&(e===K&&((P&2)===0&&(yl|=n),$===4&&et(e,X)),ae(e,r),n===1&&P===0&&(t.mode&1)===0&&(on=V()+500,pl&&ht()))}function ae(e,t){var n=e.callbackNode;Pf(e,t);var r=Br(e,e===K?X:0);if(r===0)n!==null&&Tu(n),e.callbackNode=null,e.callbackPriority=0;else if(t=r&-r,e.callbackPriority!==t){if(n!=null&&Tu(n),t===1)e.tag===0?xd(Es.bind(null,e)):ka(Es.bind(null,e)),Sd(function(){(P&6)===0&&ht()}),n=null;else{switch(Zs(r)){case 1:n=ii;break;case 4:n=Ys;break;case 16:n=Hr;break;case 536870912:n=Xs;break;default:n=Hr}n=wc(n,dc.bind(null,e))}e.callbackPriority=t,e.callbackNode=n}}function dc(e,t){if(Dr=-1,Fr=0,(P&6)!==0)throw Error(v(327));var n=e.callbackNode;if(qt()&&e.callbackNode!==n)return null;var r=Br(e,e===K?X:0);if(r===0)return null;if((r&30)!==0||(r&e.expiredLanes)!==0||t)t=il(e,r);else{t=r;var l=P;P|=2;var o=mc();(K!==e||X!==t)&&(Ue=null,on=V()+500,Ct(e,t));do try{Qd();break}catch(u){pc(e,u)}while(!0);wi(),rl.current=o,P=l,H!==null?t=0:(K=null,X=0,t=$)}if(t!==0){if(t===2&&(l=Co(e),l!==0&&(r=l,t=Jo(e,l))),t===1)throw n=Zn,Ct(e,0),et(e,r),ae(e,V()),n;if(t===6)et(e,r);else{if(l=e.current.alternate,(r&30)===0&&!$d(l)&&(t=il(e,r),t===2&&(o=Co(e),o!==0&&(r=o,t=Jo(e,o))),t===1))throw n=Zn,Ct(e,0),et(e,r),ae(e,V()),n;switch(e.finishedWork=l,e.finishedLanes=r,t){case 0:case 1:throw Error(v(345));case 2:wt(e,oe,Ue);break;case 3:if(et(e,r),(r&130023424)===r&&(t=Ii+500-V(),10<t)){if(Br(e,0)!==0)break;if(l=e.suspendedLanes,(l&r)!==r){re(),e.pingedLanes|=e.suspendedLanes&l;break}e.timeoutHandle=Ro(wt.bind(null,e,oe,Ue),t);break}wt(e,oe,Ue);break;case 4:if(et(e,r),(r&4194240)===r)break;for(t=e.eventTimes,l=-1;0<r;){var i=31-ze(r);o=1<<i,i=t[i],i>l&&(l=i),r&=~o}if(r=l,r=V()-r,r=(120>r?120:480>r?480:1080>r?1080:1920>r?1920:3e3>r?3e3:4320>r?4320:1960*Bd(r/1960))-r,10<r){e.timeoutHandle=Ro(wt.bind(null,e,oe,Ue),r);break}wt(e,oe,Ue);break;case 5:wt(e,oe,Ue);break;default:throw Error(v(329))}}}return ae(e,V()),e.callbackNode===n?dc.bind(null,e):null}function Jo(e,t){var n=On;return e.current.memoizedState.isDehydrated&&(Ct(e,t).flags|=256),e=il(e,t),e!==2&&(t=oe,oe=n,t!==null&&qo(t)),e}function qo(e){oe===null?oe=e:oe.push.apply(oe,e)}function $d(e){for(var t=e;;){if(t.flags&16384){var n=t.updateQueue;if(n!==null&&(n=n.stores,n!==null))for(var r=0;r<n.length;r++){var l=n[r],o=l.getSnapshot;l=l.value;try{if(!Le(o(),l))return!1}catch{return!1}}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function et(e,t){for(t&=~Mi,t&=~yl,e.suspendedLanes|=t,e.pingedLanes&=~t,e=e.expirationTimes;0<t;){var n=31-ze(t),r=1<<n;e[n]=-1,t&=~r}}function Es(e){if((P&6)!==0)throw Error(v(327));qt();var t=Br(e,0);if((t&1)===0)return ae(e,V()),null;var n=il(e,t);if(e.tag!==0&&n===2){var r=Co(e);r!==0&&(t=r,n=Jo(e,r))}if(n===1)throw n=Zn,Ct(e,0),et(e,t),ae(e,V()),n;if(n===6)throw Error(v(345));return e.finishedWork=e.current.alternate,e.finishedLanes=t,wt(e,oe,Ue),ae(e,V()),null}function Di(e,t){var n=P;P|=1;try{return e(t)}finally{P=n,P===0&&(on=V()+500,pl&&ht())}}function Tt(e){nt!==null&&nt.tag===0&&(P&6)===0&&qt();var t=P;P|=1;var n=Se.transition,r=T;try{if(Se.transition=null,T=1,e)return e()}finally{T=r,Se.transition=n,P=t,(P&6)===0&&ht()}}function Fi(){ce=Kt.current,M(Kt)}function Ct(e,t){e.finishedWork=null,e.finishedLanes=0;var n=e.timeoutHandle;if(n!==-1&&(e.timeoutHandle=-1,wd(n)),H!==null)for(n=H.return;n!==null;){var r=n;switch(vi(r),r.tag){case 1:r=r.type.childContextTypes,r!=null&&Yr();break;case 3:rn(),M(ue),M(ee),_i();break;case 5:xi(r);break;case 4:rn();break;case 13:M(D);break;case 19:M(D);break;case 10:Si(r.type._context);break;case 22:case 23:Fi()}n=n.return}if(K=e,H=e=ct(e.current,null),X=ce=t,$=0,Zn=null,Mi=yl=zt=0,oe=On=null,kt!==null){for(t=0;t<kt.length;t++)if(n=kt[t],r=n.interleaved,r!==null){n.interleaved=null;var l=r.next,o=n.pending;if(o!==null){var i=o.next;o.next=l,r.next=i}n.pending=r}kt=null}return e}function pc(e,t){do{var n=H;try{if(wi(),Or.current=nl,tl){for(var r=F.memoizedState;r!==null;){var l=r.queue;l!==null&&(l.pending=null),r=r.next}tl=!1}if(Pt=0,Q=B=F=null,Ln=!1,Yn=0,Oi.current=null,n===null||n.return===null){$=1,Zn=t,H=null;break}e:{var o=e,i=n.return,u=n,s=t;if(t=X,u.flags|=32768,s!==null&&typeof s=="object"&&typeof s.then=="function"){var c=s,m=u,p=m.tag;if((m.mode&1)===0&&(p===0||p===11||p===15)){var h=m.alternate;h?(m.updateQueue=h.updateQueue,m.memoizedState=h.memoizedState,m.lanes=h.lanes):(m.updateQueue=null,m.memoizedState=null)}var w=as(i);if(w!==null){w.flags&=-257,cs(w,i,u,o,t),w.mode&1&&ss(o,c,t),t=w,s=c;var g=t.updateQueue;if(g===null){var S=new Set;S.add(s),t.updateQueue=S}else g.add(s);break e}else{if((t&1)===0){ss(o,c,t),ji();break e}s=Error(v(426))}}else if(I&&u.mode&1){var A=as(i);if(A!==null){(A.flags&65536)===0&&(A.flags|=256),cs(A,i,u,o,t),yi(ln(s,u));break e}}o=s=ln(s,u),$!==4&&($=2),On===null?On=[o]:On.push(o),o=i;do{switch(o.tag){case 3:o.flags|=65536,t&=-t,o.lanes|=t;var f=Za(o,s,t);ns(o,f);break e;case 1:u=s;var a=o.type,d=o.stateNode;if((o.flags&128)===0&&(typeof a.getDerivedStateFromError=="function"||d!==null&&typeof d.componentDidCatch=="function"&&(st===null||!st.has(d)))){o.flags|=65536,t&=-t,o.lanes|=t;var y=Ja(o,u,t);ns(o,y);break e}}o=o.return}while(o!==null)}vc(n)}catch(E){t=E,H===n&&n!==null&&(H=n=n.return);continue}break}while(!0)}function mc(){var e=rl.current;return rl.current=nl,e===null?nl:e}function ji(){($===0||$===3||$===2)&&($=4),K===null||(zt&268435455)===0&&(yl&268435455)===0||et(K,X)}function il(e,t){var n=P;P|=2;var r=mc();(K!==e||X!==t)&&(Ue=null,Ct(e,t));do try{Wd();break}catch(l){pc(e,l)}while(!0);if(wi(),P=n,rl.current=r,H!==null)throw Error(v(261));return K=null,X=0,$}function Wd(){for(;H!==null;)hc(H)}function Qd(){for(;H!==null&&!gf();)hc(H)}function hc(e){var t=gc(e.alternate,e,ce);e.memoizedProps=e.pendingProps,t===null?vc(e):H=t,Oi.current=null}function vc(e){var t=e;do{var n=t.alternate;if(e=t.return,(t.flags&32768)===0){if(n=jd(n,t,ce),n!==null){H=n;return}}else{if(n=Ud(n,t),n!==null){n.flags&=32767,H=n;return}if(e!==null)e.flags|=32768,e.subtreeFlags=0,e.deletions=null;else{$=6,H=null;return}}if(t=t.sibling,t!==null){H=t;return}H=t=e}while(t!==null);$===0&&($=5)}function wt(e,t,n){var r=T,l=Se.transition;try{Se.transition=null,T=1,Kd(e,t,n,r)}finally{Se.transition=l,T=r}return null}function Kd(e,t,n,r){do qt();while(nt!==null);if((P&6)!==0)throw Error(v(327));n=e.finishedWork;var l=e.finishedLanes;if(n===null)return null;if(e.finishedWork=null,e.finishedLanes=0,n===e.current)throw Error(v(177));e.callbackNode=null,e.callbackPriority=0;var o=n.lanes|n.childLanes;if(zf(e,o),e===K&&(H=K=null,X=0),(n.subtreeFlags&2064)===0&&(n.flags&2064)===0||Pr||(Pr=!0,wc(Hr,function(){return qt(),null})),o=(n.flags&15990)!==0,(n.subtreeFlags&15990)!==0||o){o=Se.transition,Se.transition=null;var i=T;T=1;var u=P;P|=4,Oi.current=null,Vd(e,n),cc(n,e),md(To),$r=!!zo,To=zo=null,e.current=n,Hd(n,e,l),wf(),P=u,T=i,Se.transition=o}else e.current=n;if(Pr&&(Pr=!1,nt=e,ol=l),o=e.pendingLanes,o===0&&(st=null),Ef(n.stateNode,r),ae(e,V()),t!==null)for(r=e.onRecoverableError,n=0;n<t.length;n++)l=t[n],r(l.value,{componentStack:l.stack,digest:l.digest});if(ll)throw ll=!1,e=Go,Go=null,e;return(ol&1)!==0&&e.tag!==0&&qt(),o=e.pendingLanes,(o&1)!==0?e===Zo?Mn++:(Mn=0,Zo=e):Mn=0,ht(),null}function qt(){if(nt!==null){var e=Zs(ol),t=Se.transition,n=T;try{if(Se.transition=null,T=16>e?16:e,nt===null)var r=!1;else{if(e=nt,nt=null,ol=0,(P&6)!==0)throw Error(v(331));var l=P;for(P|=4,k=e.current;k!==null;){var o=k,i=o.child;if((k.flags&16)!==0){var u=o.deletions;if(u!==null){for(var s=0;s<u.length;s++){var c=u[s];for(k=c;k!==null;){var m=k;switch(m.tag){case 0:case 11:case 15:Rn(8,m,o)}var p=m.child;if(p!==null)p.return=m,k=p;else for(;k!==null;){m=k;var h=m.sibling,w=m.return;if(uc(m),m===c){k=null;break}if(h!==null){h.return=w,k=h;break}k=w}}}var g=o.alternate;if(g!==null){var S=g.child;if(S!==null){g.child=null;do{var A=S.sibling;S.sibling=null,S=A}while(S!==null)}}k=o}}if((o.subtreeFlags&2064)!==0&&i!==null)i.return=o,k=i;else e:for(;k!==null;){if(o=k,(o.flags&2048)!==0)switch(o.tag){case 0:case 11:case 15:Rn(9,o,o.return)}var f=o.sibling;if(f!==null){f.return=o.return,k=f;break e}k=o.return}}var a=e.current;for(k=a;k!==null;){i=k;var d=i.child;if((i.subtreeFlags&2064)!==0&&d!==null)d.return=i,k=d;else e:for(i=a;k!==null;){if(u=k,(u.flags&2048)!==0)try{switch(u.tag){case 0:case 11:case 15:vl(9,u)}}catch(E){U(u,u.return,E)}if(u===i){k=null;break e}var y=u.sibling;if(y!==null){y.return=u.return,k=y;break e}k=u.return}}if(P=l,ht(),Fe&&typeof Fe.onPostCommitFiberRoot=="function")try{Fe.onPostCommitFiberRoot(sl,e)}catch{}r=!0}return r}finally{T=n,Se.transition=t}}return!1}function Cs(e,t,n){t=ln(n,t),t=Za(e,t,1),e=ut(e,t,1),t=re(),e!==null&&(Jn(e,1,t),ae(e,t))}function U(e,t,n){if(e.tag===3)Cs(e,e,n);else for(;t!==null;){if(t.tag===3){Cs(t,e,n);break}else if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof r.componentDidCatch=="function"&&(st===null||!st.has(r))){e=ln(n,e),e=Ja(t,e,1),t=ut(t,e,1),e=re(),t!==null&&(Jn(t,1,e),ae(t,e));break}}t=t.return}}function Yd(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),t=re(),e.pingedLanes|=e.suspendedLanes&n,K===e&&(X&n)===n&&($===4||$===3&&(X&130023424)===X&&500>V()-Ii?Ct(e,0):Mi|=n),ae(e,t)}function yc(e,t){t===0&&((e.mode&1)===0?t=1:(t=pr,pr<<=1,(pr&130023424)===0&&(pr=4194304)));var n=re();e=Qe(e,t),e!==null&&(Jn(e,t,n),ae(e,n))}function Xd(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),yc(e,n)}function Gd(e,t){var n=0;switch(e.tag){case 13:var r=e.stateNode,l=e.memoizedState;l!==null&&(n=l.retryLane);break;case 19:r=e.stateNode;break;default:throw Error(v(314))}r!==null&&r.delete(t),yc(e,n)}var gc;gc=function(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps||ue.current)ie=!0;else{if((e.lanes&n)===0&&(t.flags&128)===0)return ie=!1,Fd(e,t,n);ie=(e.flags&131072)!==0}else ie=!1,I&&(t.flags&1048576)!==0&&Ea(t,Zr,t.index);switch(t.lanes=0,t.tag){case 2:var r=t.type;Ir(e,t),e=t.pendingProps;var l=en(t,ee.current);Jt(t,n),l=Pi(null,t,r,e,l,n);var o=zi();return t.flags|=1,typeof l=="object"&&l!==null&&typeof l.render=="function"&&l.$$typeof===void 0?(t.tag=1,t.memoizedState=null,t.updateQueue=null,se(r)?(o=!0,Xr(t)):o=!1,t.memoizedState=l.state!==null&&l.state!==void 0?l.state:null,Ei(t),l.updater=hl,t.stateNode=l,l._reactInternals=t,Uo(t,r,e,n),t=Ho(null,t,r,!0,o,n)):(t.tag=0,I&&o&&hi(t),ne(null,t,l,n),t=t.child),t;case 16:r=t.elementType;e:{switch(Ir(e,t),e=t.pendingProps,l=r._init,r=l(r._payload),t.type=r,l=t.tag=Jd(r),e=_e(r,e),l){case 0:t=Vo(null,t,r,e,n);break e;case 1:t=ps(null,t,r,e,n);break e;case 11:t=fs(null,t,r,e,n);break e;case 14:t=ds(null,t,r,_e(r.type,e),n);break e}throw Error(v(306,r,""))}return t;case 0:return r=t.type,l=t.pendingProps,l=t.elementType===r?l:_e(r,l),Vo(e,t,r,l,n);case 1:return r=t.type,l=t.pendingProps,l=t.elementType===r?l:_e(r,l),ps(e,t,r,l,n);case 3:e:{if(tc(t),e===null)throw Error(v(387));r=t.pendingProps,o=t.memoizedState,l=o.element,za(e,t),br(t,r,null,n);var i=t.memoizedState;if(r=i.element,o.isDehydrated)if(o={element:r,isDehydrated:!1,cache:i.cache,pendingSuspenseBoundaries:i.pendingSuspenseBoundaries,transitions:i.transitions},t.updateQueue.baseState=o,t.memoizedState=o,t.flags&256){l=ln(Error(v(423)),t),t=ms(e,t,r,n,l);break e}else if(r!==l){l=ln(Error(v(424)),t),t=ms(e,t,r,n,l);break e}else for(fe=it(t.stateNode.containerInfo.firstChild),de=t,I=!0,Pe=null,n=Na(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling;else{if(tn(),r===l){t=Ke(e,t,n);break e}ne(e,t,r,n)}t=t.child}return t;case 5:return Ta(t),e===null&&Do(t),r=t.type,l=t.pendingProps,o=e!==null?e.memoizedProps:null,i=l.children,Lo(r,l)?i=null:o!==null&&Lo(r,o)&&(t.flags|=32),ec(e,t),ne(e,t,i,n),t.child;case 6:return e===null&&Do(t),null;case 13:return nc(e,t,n);case 4:return Ci(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=nn(t,null,r,n):ne(e,t,r,n),t.child;case 11:return r=t.type,l=t.pendingProps,l=t.elementType===r?l:_e(r,l),fs(e,t,r,l,n);case 7:return ne(e,t,t.pendingProps,n),t.child;case 8:return ne(e,t,t.pendingProps.children,n),t.child;case 12:return ne(e,t,t.pendingProps.children,n),t.child;case 10:e:{if(r=t.type._context,l=t.pendingProps,o=t.memoizedProps,i=l.value,R(Jr,r._currentValue),r._currentValue=i,o!==null)if(Le(o.value,i)){if(o.children===l.children&&!ue.current){t=Ke(e,t,n);break e}}else for(o=t.child,o!==null&&(o.return=t);o!==null;){var u=o.dependencies;if(u!==null){i=o.child;for(var s=u.firstContext;s!==null;){if(s.context===r){if(o.tag===1){s=Be(-1,n&-n),s.tag=2;var c=o.updateQueue;if(c!==null){c=c.shared;var m=c.pending;m===null?s.next=s:(s.next=m.next,m.next=s),c.pending=s}}o.lanes|=n,s=o.alternate,s!==null&&(s.lanes|=n),Fo(o.return,n,t),u.lanes|=n;break}s=s.next}}else if(o.tag===10)i=o.type===t.type?null:o.child;else if(o.tag===18){if(i=o.return,i===null)throw Error(v(341));i.lanes|=n,u=i.alternate,u!==null&&(u.lanes|=n),Fo(i,n,t),i=o.sibling}else i=o.child;if(i!==null)i.return=o;else for(i=o;i!==null;){if(i===t){i=null;break}if(o=i.sibling,o!==null){o.return=i.return,i=o;break}i=i.return}o=i}ne(e,t,l.children,n),t=t.child}return t;case 9:return l=t.type,r=t.pendingProps.children,Jt(t,n),l=ke(l),r=r(l),t.flags|=1,ne(e,t,r,n),t.child;case 14:return r=t.type,l=_e(r,t.pendingProps),l=_e(r.type,l),ds(e,t,r,l,n);case 15:return qa(e,t,t.type,t.pendingProps,n);case 17:return r=t.type,l=t.pendingProps,l=t.elementType===r?l:_e(r,l),Ir(e,t),t.tag=1,se(r)?(e=!0,Xr(t)):e=!1,Jt(t,n),Ga(t,r,l),Uo(t,r,l,n),Ho(null,t,r,!0,e,n);case 19:return rc(e,t,n);case 22:return ba(e,t,n)}throw Error(v(156,t.tag))};function wc(e,t){return Ks(e,t)}function Zd(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function we(e,t,n,r){return new Zd(e,t,n,r)}function Ui(e){return e=e.prototype,!(!e||!e.isReactComponent)}function Jd(e){if(typeof e=="function")return Ui(e)?1:0;if(e!=null){if(e=e.$$typeof,e===ri)return 11;if(e===li)return 14}return 2}function ct(e,t){var n=e.alternate;return n===null?(n=we(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&14680064,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n}function jr(e,t,n,r,l,o){var i=2;if(r=e,typeof e=="function")Ui(e)&&(i=1);else if(typeof e=="string")i=5;else e:switch(e){case Ft:return xt(n.children,l,o,t);case ni:i=8,l|=8;break;case uo:return e=we(12,n,t,l|2),e.elementType=uo,e.lanes=o,e;case so:return e=we(13,n,t,l),e.elementType=so,e.lanes=o,e;case ao:return e=we(19,n,t,l),e.elementType=ao,e.lanes=o,e;case Ts:return gl(n,l,o,t);default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case Ps:i=10;break e;case zs:i=9;break e;case ri:i=11;break e;case li:i=14;break e;case Je:i=16,r=null;break e}throw Error(v(130,e==null?e:typeof e,""))}return t=we(i,n,t,l),t.elementType=e,t.type=r,t.lanes=o,t}function xt(e,t,n,r){return e=we(7,e,r,t),e.lanes=n,e}function gl(e,t,n,r){return e=we(22,e,r,t),e.elementType=Ts,e.lanes=n,e.stateNode={isHidden:!1},e}function lo(e,t,n){return e=we(6,e,null,t),e.lanes=n,e}function oo(e,t,n){return t=we(4,e.children!==null?e.children:[],e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}function qd(e,t,n,r,l){this.tag=t,this.containerInfo=e,this.finishedWork=this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.pendingContext=this.context=null,this.callbackPriority=0,this.eventTimes=Bl(0),this.expirationTimes=Bl(-1),this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=Bl(0),this.identifierPrefix=r,this.onRecoverableError=l,this.mutableSourceEagerHydrationData=null}function Ai(e,t,n,r,l,o,i,u,s){return e=new qd(e,t,n,u,s),t===1?(t=1,o===!0&&(t|=8)):t=0,o=we(3,null,null,t),e.current=o,o.stateNode=e,o.memoizedState={element:r,isDehydrated:n,cache:null,transitions:null,pendingSuspenseBoundaries:null},Ei(o),e}function bd(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:Dt,key:r==null?null:""+r,children:e,containerInfo:t,implementation:n}}function Sc(e){if(!e)return dt;e=e._reactInternals;e:{if(Rt(e)!==e||e.tag!==1)throw Error(v(170));var t=e;do{switch(t.tag){case 3:t=t.stateNode.context;break e;case 1:if(se(t.type)){t=t.stateNode.__reactInternalMemoizedMergedChildContext;break e}}t=t.return}while(t!==null);throw Error(v(171))}if(e.tag===1){var n=e.type;if(se(n))return Sa(e,n,t)}return t}function kc(e,t,n,r,l,o,i,u,s){return e=Ai(n,r,!0,e,l,o,i,u,s),e.context=Sc(null),n=e.current,r=re(),l=at(n),o=Be(r,l),o.callback=t??null,ut(n,o,l),e.current.lanes=l,Jn(e,l,r),ae(e,r),e}function wl(e,t,n,r){var l=t.current,o=re(),i=at(l);return n=Sc(n),t.context===null?t.context=n:t.pendingContext=n,t=Be(o,i),t.payload={element:e},r=r===void 0?null:r,r!==null&&(t.callback=r),e=ut(l,t,i),e!==null&&(Te(e,l,i,o),Rr(e,l,i)),i}function ul(e){if(e=e.current,!e.child)return null;switch(e.child.tag){case 5:return e.child.stateNode;default:return e.child.stateNode}}function xs(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function Vi(e,t){xs(e,t),(e=e.alternate)&&xs(e,t)}function ep(){return null}var Ec=typeof reportError=="function"?reportError:function(e){console.error(e)};function Hi(e){this._internalRoot=e}Sl.prototype.render=Hi.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(v(409));wl(e,t,null,null)};Sl.prototype.unmount=Hi.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;Tt(function(){wl(null,e,null,null)}),t[We]=null}};function Sl(e){this._internalRoot=e}Sl.prototype.unstable_scheduleHydration=function(e){if(e){var t=bs();e={blockedOn:null,target:e,priority:t};for(var n=0;n<be.length&&t!==0&&t<be[n].priority;n++);be.splice(n,0,e),n===0&&ta(e)}};function Bi(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function kl(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11&&(e.nodeType!==8||e.nodeValue!==" react-mount-point-unstable "))}function _s(){}function tp(e,t,n,r,l){if(l){if(typeof r=="function"){var o=r;r=function(){var c=ul(i);o.call(c)}}var i=kc(t,r,e,0,null,!1,!1,"",_s);return e._reactRootContainer=i,e[We]=i.current,Bn(e.nodeType===8?e.parentNode:e),Tt(),i}for(;l=e.lastChild;)e.removeChild(l);if(typeof r=="function"){var u=r;r=function(){var c=ul(s);u.call(c)}}var s=Ai(e,0,!1,null,null,!1,!1,"",_s);return e._reactRootContainer=s,e[We]=s.current,Bn(e.nodeType===8?e.parentNode:e),Tt(function(){wl(t,s,n,r)}),s}function El(e,t,n,r,l){var o=n._reactRootContainer;if(o){var i=o;if(typeof l=="function"){var u=l;l=function(){var s=ul(i);u.call(s)}}wl(t,i,e,l)}else i=tp(n,t,e,l,r);return ul(i)}Js=function(e){switch(e.tag){case 3:var t=e.stateNode;if(t.current.memoizedState.isDehydrated){var n=Cn(t.pendingLanes);n!==0&&(ui(t,n|1),ae(t,V()),(P&6)===0&&(on=V()+500,ht()))}break;case 13:Tt(function(){var r=Qe(e,1);if(r!==null){var l=re();Te(r,e,1,l)}}),Vi(e,1)}};si=function(e){if(e.tag===13){var t=Qe(e,134217728);if(t!==null){var n=re();Te(t,e,134217728,n)}Vi(e,134217728)}};qs=function(e){if(e.tag===13){var t=at(e),n=Qe(e,t);if(n!==null){var r=re();Te(n,e,t,r)}Vi(e,t)}};bs=function(){return T};ea=function(e,t){var n=T;try{return T=e,t()}finally{T=n}};So=function(e,t,n){switch(t){case"input":if(po(e,n),t=n.name,n.type==="radio"&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll("input[name="+JSON.stringify(""+t)+\'][type="radio"]\'),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var l=dl(r);if(!l)throw Error(v(90));Rs(r),po(r,l)}}}break;case"textarea":Ms(e,n);break;case"select":t=n.value,t!=null&&Yt(e,!!n.multiple,t,!1)}};Vs=Di;Hs=Tt;var np={usingClientEntryPoint:!1,Events:[bn,Vt,dl,Us,As,Di]},wn={findFiberByHostInstance:St,bundleType:0,version:"18.3.1",rendererPackageName:"react-dom"},rp={bundleType:wn.bundleType,version:wn.version,rendererPackageName:wn.rendererPackageName,rendererConfig:wn.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:Ye.ReactCurrentDispatcher,findHostInstanceByFiber:function(e){return e=Ws(e),e===null?null:e.stateNode},findFiberByHostInstance:wn.findFiberByHostInstance||ep,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.3.1-next-f1338f8080-20240426"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"&&(Sn=__REACT_DEVTOOLS_GLOBAL_HOOK__,!Sn.isDisabled&&Sn.supportsFiber))try{sl=Sn.inject(rp),Fe=Sn}catch{}var Sn;he.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=np;he.createPortal=function(e,t){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!Bi(t))throw Error(v(200));return bd(e,t,null,n)};he.createRoot=function(e,t){if(!Bi(e))throw Error(v(299));var n=!1,r="",l=Ec;return t!=null&&(t.unstable_strictMode===!0&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onRecoverableError!==void 0&&(l=t.onRecoverableError)),t=Ai(e,1,!1,null,null,n,!1,r,l),e[We]=t.current,Bn(e.nodeType===8?e.parentNode:e),new Hi(t)};he.findDOMNode=function(e){if(e==null)return null;if(e.nodeType===1)return e;var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(v(188)):(e=Object.keys(e).join(","),Error(v(268,e)));return e=Ws(t),e=e===null?null:e.stateNode,e};he.flushSync=function(e){return Tt(e)};he.hydrate=function(e,t,n){if(!kl(t))throw Error(v(200));return El(null,e,t,!0,n)};he.hydrateRoot=function(e,t,n){if(!Bi(e))throw Error(v(405));var r=n!=null&&n.hydratedSources||null,l=!1,o="",i=Ec;if(n!=null&&(n.unstable_strictMode===!0&&(l=!0),n.identifierPrefix!==void 0&&(o=n.identifierPrefix),n.onRecoverableError!==void 0&&(i=n.onRecoverableError)),t=kc(t,null,e,1,n??null,l,!1,o,i),e[We]=t.current,Bn(e),r)for(e=0;e<r.length;e++)n=r[e],l=n._getVersion,l=l(n._source),t.mutableSourceEagerHydrationData==null?t.mutableSourceEagerHydrationData=[n,l]:t.mutableSourceEagerHydrationData.push(n,l);return new Sl(t)};he.render=function(e,t,n){if(!kl(t))throw Error(v(200));return El(null,e,t,!1,n)};he.unmountComponentAtNode=function(e){if(!kl(e))throw Error(v(40));return e._reactRootContainer?(Tt(function(){El(null,null,e,!1,function(){e._reactRootContainer=null,e[We]=null})}),!0):!1};he.unstable_batchedUpdates=Di;he.unstable_renderSubtreeIntoContainer=function(e,t,n,r){if(!kl(n))throw Error(v(200));if(e==null||e._reactInternals===void 0)throw Error(v(38));return El(e,t,n,!1,r)};he.version="18.3.1-next-f1338f8080-20240426"});var Nc=vt((kp,_c)=>{"use strict";function xc(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(xc)}catch(e){console.error(e)}}xc(),_c.exports=Cc()});var zc=vt($i=>{"use strict";var Pc=Nc();$i.createRoot=Pc.createRoot,$i.hydrateRoot=Pc.hydrateRoot;var Ep});var Re=Xi(zl(),1),Oc=Xi(zc(),1);var lp="data-dsh-genui-legible";function op(e){if(typeof e!="string")return null;let t=/^rgba?\\(([^)]+)\\)$/i.exec(e.trim());if(t===null)return null;let n=t[1].split(/[\\s,/]+/).filter(s=>s!=="");if(n.length<3)return null;let r=s=>{let c=s.endsWith("%")?Number(s.slice(0,-1))*2.55:Number(s);return Number.isFinite(c)?Math.round(c):null},l=r(n[0]),o=r(n[1]),i=r(n[2]);if(l===null||o===null||i===null)return null;let u=n.length>3?Number(n[3].endsWith("%")?n[3].slice(0,-1)/100:n[3]):1;return{r:l,g:o,b:i,a:Number.isFinite(u)?u:1}}function ip(e){let t=e.childNodes;if(t==null)return!1;for(let n of t)if(n.nodeType===3&&String(n.nodeValue??"").trim()!=="")return!0;return!1}function Tc(e,t){if(!ip(e)||e.style===void 0||e.style===null||typeof e.style.setProperty!="function")return!1;let n=t.getComputedStyle(e);if(n==null||(n.backgroundClip??n.webkitBackgroundClip)==="text")return!1;let l=op(n.color);return l===null||l.a>=.25?!1:(e.style.setProperty("color",`rgb(${l.r}, ${l.g}, ${l.b})`),typeof e.setAttribute=="function"&&e.setAttribute(lp,""),!0)}function Wi(e){let t=e?.ownerDocument?.defaultView??null;if(t===null||typeof t.getComputedStyle!="function"||typeof e.querySelectorAll!="function")return 0;let n=Tc(e,t)?1:0;for(let r of e.querySelectorAll("*"))Tc(r,t)&&(n+=1);return n}function Lc(e){let t=e?.ownerDocument?.defaultView??null,n=t?.MutationObserver;if(typeof n!="function")return Wi(e),function(){};let r=!1,l=!1,o=typeof t.requestAnimationFrame=="function"?p=>t.requestAnimationFrame(p):p=>t.setTimeout(p,0),i=typeof t.cancelAnimationFrame=="function"?p=>t.cancelAnimationFrame(p):p=>t.clearTimeout(p),u=null,s=()=>{r=!1,!l&&Wi(e)},c=()=>{r||l||(r=!0,u=o(s))};Wi(e);let m=new n(c);return m.observe(e,{childList:!0,subtree:!0,characterData:!0}),function(){l=!0,m.disconnect(),u!==null&&i(u)}}var up="dsh-genui-payload",sp=2e3,ap=2e4,cp=16;function fp(){let e=document.getElementById(up);if(e===null||typeof e.textContent!="string")throw new Error("this card has no payload");let t=JSON.parse(e.textContent);if(t===null||typeof t!="object")throw new Error("this card payload is not an object");return t}function Qi(e){window.parent.postMessage(e,"*")}function dp(){let e=new Set,t=n=>{if(typeof n!="function")throw new Error("timers.set/every needs a function");return function(){try{n()}catch(l){console.error("[dsh-genui] a card timer threw:",l)}}};return{api:{set(n,r){let l=setTimeout(()=>{e.delete(l),t(n)()},r);return e.add(l),l},every(n,r){let l=setInterval(t(n),r);return e.add(l),l},clear(n){e.delete(n)&&(clearTimeout(n),clearInterval(n))}},clear(){for(let n of e)clearTimeout(n),clearInterval(n);e.clear()}}}function pp(e,{interact:t,timers:n}){let r;try{r=new Function("React","h","interact","timers",`\'use strict\';\n${e}`)}catch(o){let i=o instanceof Error?o.message:String(o);throw new Error(`the snippet did not parse: ${i}. JSX is not available \\u2014 use h(tag, props, ...children) or React.createElement.`)}function l(){let o=r(Re,Re.createElement,t,n.api);if(typeof o=="function")try{if(/^[A-Z]/.test(o.name??"")||o.prototype?.isReactComponent!==void 0)return Re.createElement(o)}catch{return o}return o}return l}var Ki=class extends Re.Component{constructor(t){super(t),this.state={error:null}}static getDerivedStateFromError(t){return{error:t}}render(){if(this.state.error!==null){let t=this.state.error instanceof Error?this.state.error.message:String(this.state.error);return Re.createElement("div",{className:"dsh-genui-failure",role:"alert"},Re.createElement("div",{className:"dsh-genui-failure-title"},"This card failed to render"),Re.createElement("div",{className:"dsh-genui-failure-detail"},t))}return this.props.children}};function Rc(e){let t=document.documentElement,n=e?.vars??{};for(let[o,i]of Object.entries(n))typeof o!="string"||!/^--(dsw|dsh)-[a-z0-9-]+$/.test(o)||typeof i!="string"||i.length>200||t.style.setProperty(o,i);let r=e?.base??{},l=document.body;for(let[o,i]of Object.entries(r))typeof i!="string"||i.length>200||o!=="font-family"&&o!=="font-size"&&o!=="line-height"&&o!=="letter-spacing"||l.style.setProperty(o,i);e?.dark===!0?t.setAttribute("data-ds-dark-theme",""):t.removeAttribute("data-ds-dark-theme"),t.style.colorScheme=e?.dark===!0?"dark":"light"}function mp(){let e=fp(),t=typeof e.token=="string"?e.token:"";Rc(e.theme);let n=0,r=0,l=()=>{r=0;let g=Math.max(1,Math.min(ap,Math.ceil(document.documentElement.getBoundingClientRect().height)));g!==n&&(n=g,Qi({type:"height",token:t,height:g}))},o=()=>{r===0&&(r=setTimeout(l,cp))},i=dp(),u=g=>{if(typeof g!="string")throw new Error("interact() needs a string");let S=g.trim();if(S==="")throw new Error("interact() needs a non-empty message");if(new TextEncoder().encode(S).length>sp)throw new Error("interact() message is too long \\u2014 send the choice, not the transcript");Qi({type:"interact",token:t,text:S})},s=document.getElementById("root"),c=(0,Oc.createRoot)(s),m=pp(String(e.code??""),{interact:u,timers:i});c.render(Re.createElement(Ki,null,Re.createElement(m)));let p=document.getElementById("root"),h=Lc(p),w=new ResizeObserver(o);return w.observe(document.documentElement),w.observe(p),o(),window.addEventListener("message",g=>{if(g.source!==window.parent)return;let S=g.data;S===null||typeof S!="object"||S.token!==t||S.type==="theme"&&Rc(S.theme)}),window.addEventListener("error",()=>{o()}),function(){w.disconnect(),h(),i.clear(),c.unmount()}}try{mp()}catch(e){let t=e instanceof Error?e.message:String(e),n=document.getElementById("root");if(n!==null){n.textContent="";let r=document.createElement("div");r.className="dsh-genui-failure",r.setAttribute("role","alert"),r.textContent=t,n.append(r)}try{Qi({type:"failed",token:"",detail:t})}catch{}}})();' };

    // client/src/frame/runtime.generated.js
    var RUNTIME_JS = typeof runtime_bundle_default?.js === "string" ? runtime_bundle_default.js : "";

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

    /* ---- THE SANDBOXED FRAME ------------------------------------------------
       The card body is a separate document now (see frame-html.js), so the host
       only sizes it. display: block, border: 0 and width: 100% are the three
       properties an iframe does not default to the way one expects: inline-level by
       default (which leaves a text baseline gap under it), a 2px inset border in
       every engine, and a 300px default width.

       background: transparent keeps the frame's own document the thing that paints,
       so a card with no surface of its own sits on the conversation the way the
       prose around it does. */
    .dsh-genui-frame {
      display: block;
      width: 100%;
      border: 0;
      margin: 0;
      padding: 0;
      background: transparent;
      color-scheme: light dark;
    }

    /* ---- THE CONFIRMATION ROW -----------------------------------------------
       OUTSIDE the frame, on purpose: this is the host's own UI, so a card cannot
       restyle it, hide it, or click it. It appears only when the card asked to send
       something, and the message it sends is exactly the text shown here. */
    .dsh-genui-pending-send {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 10px;
      padding: 10px 12px;
      border-left: 2px solid var(--dsw-alias-brand-primary);
      border-radius: 0 var(--dsw-radius-sm) var(--dsw-radius-sm) 0;
      background: var(--dsw-alias-bg-layer-2);
    }

    /* MODEL-AUTHORED TEXT, RENDERED AS TEXT. It is a div with a text child, never
       markup: the frame is untrusted, and the one place its bytes reach the host
       document must not be an HTML sink. Wrapping is on because a 2000-character
       message is allowed. */
    .dsh-genui-pending-text {
      font-size: var(--dsh-content-font-size, 14px);
      line-height: 1.5;
      color: var(--dsw-alias-label-primary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .dsh-genui-pending-actions {
      display: flex;
      gap: 8px;
    }

    .dsh-genui-confirm,
    .dsh-genui-dismiss {
      font: inherit;
      font-size: var(--dsh-content-font-size-secondary, 13px);
      padding: 4px 12px;
      border-radius: var(--dsw-radius-sm);
      cursor: pointer;
    }

    .dsh-genui-confirm {
      border: 1px solid var(--dsw-alias-brand-primary);
      background: var(--dsw-alias-brand-primary);
      color: var(--dsw-alias-label-on-brand, #ffffff);
    }

    .dsh-genui-dismiss {
      border: 1px solid var(--dsw-alias-border-l2);
      background: transparent;
      color: var(--dsw-alias-label-secondary);
    }

    .dsh-genui-confirm:focus-visible,
    .dsh-genui-dismiss:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: no-preference) {
      .dsh-genui-confirm,
      .dsh-genui-dismiss {
        transition: background-color 120ms cubic-bezier(0.2, 0, 0, 1), border-color 120ms cubic-bezier(0.2, 0, 0, 1);
      }
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
    var CARD_CSS = CSS;

    // client/src/frame-html.js
    var NONCE_BYTES = 16;
    var FRAME_CSS = `
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
    }
    html {
      color-scheme: light dark;
    }
    body {
      color: var(--dsw-alias-label-primary, #141414);
      font-family: var(--dsh-font-family-ui, var(--dsw-font-family, system-ui, sans-serif));
      font-size: var(--dsh-content-font-size, 14px);
      line-height: 1.5;
      overflow: hidden;
    }
    #root {
      display: block;
      min-width: 0;
    }
    .dsh-genui-failure {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 0;
      color: var(--dsw-alias-state-error-primary, #ba2723);
      font-size: var(--dsh-content-font-size-secondary, 13px);
    }
    .dsh-genui-failure-title {
      font-weight: 600;
    }
    .dsh-genui-failure-detail {
      color: var(--dsw-alias-label-secondary, #5c5c5c);
      white-space: pre-wrap;
      word-break: break-word;
    }
    `;
    function createNonce(cryptoImpl) {
      const source = cryptoImpl ?? (typeof globalThis !== "undefined" ? globalThis.crypto : void 0);
      if (source === void 0 || source === null || typeof source.getRandomValues !== "function") {
        return "nonce-fallback-0000000000000000";
      }
      const bytes = new Uint8Array(NONCE_BYTES);
      source.getRandomValues(bytes);
      let out = "";
      for (const byte of bytes) out += (byte % 36).toString(36);
      return out;
    }
    function frameCsp(nonce) {
      return [
        "default-src 'none'",
        `script-src 'nonce-${nonce}' 'unsafe-eval'`,
        `style-src-elem 'nonce-${nonce}'`,
        "style-src-attr 'unsafe-inline'",
        "img-src data: blob:",
        "media-src data: blob:",
        "font-src data:",
        "connect-src 'none'",
        "object-src 'none'",
        "frame-src 'none'",
        "child-src 'none'",
        "form-action 'none'",
        "base-uri 'none'"
      ].join("; ");
    }
    function buildFrameDocument({ code, token, theme, nonce }) {
      const actualNonce = typeof nonce === "string" && nonce !== "" ? nonce : createNonce();
      const payload = encodeJsonForScript({ code, token, theme: theme ?? { vars: {}, base: {}, dark: false } });
      const css = encodeCssForStyle(FRAME_CSS + "\n" + CARD_CSS + "\n" + VENDOR_CSS);
      return [
        "<!doctype html>",
        "<html>",
        "<head>",
        '<meta charset="utf-8">',
        `<meta http-equiv="Content-Security-Policy" content="${frameCsp(actualNonce)}">`,
        '<meta name="referrer" content="no-referrer">',
        '<meta name="color-scheme" content="light dark">',
        `<style nonce="${actualNonce}">${css}</style>`,
        "</head>",
        "<body>",
        '<div id="root"></div>',
        `<script type="application/json" id="dsh-genui-payload">${payload}</script>`,
        `<script nonce="${actualNonce}">${RUNTIME_JS}</script>`,
        "</body>",
        "</html>"
      ].join("");
    }

    // client/src/theme-snapshot.js
    var SKILL_TOKENS = [
      "--dsw-alias-label-primary",
      "--dsw-alias-label-secondary",
      "--dsw-alias-label-tertiary",
      "--dsw-alias-label-caption",
      "--dsw-alias-border-l1",
      "--dsw-alias-border-l2",
      "--dsw-alias-bg-layer-1",
      "--dsw-alias-bg-layer-2",
      "--dsw-alias-brand-primary",
      "--dsw-alias-link",
      "--dsw-alias-state-error-primary",
      "--dsw-alias-state-success-primary",
      "--dsw-alias-state-warn-primary",
      "--dsw-alias-state-business-primary",
      "--dsw-alias-state-warn-label",
      "--dsw-alias-code-diff-added",
      "--dsw-alias-code-diff-deleted",
      "--dsw-radius-sm",
      "--dsw-radius-md",
      "--dsw-radius-lg",
      "--dsw-radius-xl",
      "--dsw-font-xxxs-11",
      "--dsw-font-xxs-12",
      "--dsw-font-xs-13",
      "--dsw-font-s-14",
      "--dsw-font-base-16",
      "--dsw-font-m-18",
      "--dsw-font-l-20",
      "--dsw-font-xl-24",
      "--dsh-content-font-size",
      "--dsh-content-font-size-secondary",
      "--dsh-content-font-size-caption",
      "--dsh-font-family-ui",
      "--dsw-font-family",
      "--ds-font-family-code",
      "--dsw-elevation-soft",
      "--dsw-elevation-panel"
    ];
    var BASE_PROPERTIES = ["font-family", "font-size", "line-height", "letter-spacing"];
    function varNamesIn(css) {
      const names = [];
      for (const match of String(css ?? "").matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) names.push(match[1]);
      return names;
    }
    function themeTokenNames() {
      const names = new Set(SKILL_TOKENS);
      for (const name2 of varNamesIn(CARD_CSS)) names.add(name2);
      for (const name2 of varNamesIn(VENDOR_CSS)) names.add(name2);
      return [...names].filter((name2) => /^--(dsw|dsh|ds|viz)-[a-z0-9-]+$/.test(name2)).sort();
    }
    function readThemeSnapshot(view, names = themeTokenNames()) {
      const empty = { vars: {}, base: {}, dark: false };
      if (view === void 0 || view === null) return empty;
      const doc = view.document;
      const body = doc?.body;
      if (body === void 0 || body === null) return empty;
      if (typeof view.getComputedStyle !== "function") return empty;
      const computed = view.getComputedStyle(body);
      if (computed === void 0 || computed === null) return empty;
      const vars = {};
      for (const name2 of names) {
        const value = computed.getPropertyValue(name2);
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed === "" || trimmed.length > 200) continue;
        vars[name2] = trimmed;
      }
      const base = {};
      for (const property of BASE_PROPERTIES) {
        const value = computed.getPropertyValue(property);
        if (typeof value === "string" && value.trim() !== "" && value.length <= 200) {
          base[property] = value.trim();
        }
      }
      return {
        vars,
        base,
        // The host's presenter writes the attribute on the root element; the body is
        // checked too because a theme plugin may write it there instead.
        dark: doc.documentElement?.hasAttribute?.("data-ds-dark-theme") === true || body.hasAttribute?.("data-ds-dark-theme") === true
      };
    }
    function observeTheme(view, onChange) {
      const noop = function disposeWithoutWindow() {
      };
      if (view === void 0 || view === null || typeof onChange !== "function") return noop;
      const doc = view.document;
      if (doc?.documentElement === void 0 || doc.documentElement === null) return noop;
      let queued = false;
      let cancelled = false;
      const Observer = view.MutationObserver;
      const flush = () => {
        queued = false;
        if (cancelled) return;
        onChange(readThemeSnapshot(view));
      };
      const schedule = () => {
        if (queued || cancelled) return;
        queued = true;
        if (typeof view.requestAnimationFrame === "function") view.requestAnimationFrame(flush);
        else view.setTimeout(flush, 0);
      };
      const relevant = (record) => {
        const target = record.target;
        if (target === doc.documentElement) return true;
        if (target === doc.body) return true;
        if (doc.head !== null && doc.head !== void 0) {
          if (target === doc.head) return true;
          if (typeof doc.head.contains === "function" && doc.head.contains(target)) return true;
        }
        return false;
      };
      let observer = null;
      if (typeof Observer === "function") {
        observer = new Observer((records) => {
          for (const record of records) {
            if (relevant(record)) {
              schedule();
              return;
            }
          }
        });
        observer.observe(doc.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["style", "class", "data-ds-dark-theme"]
        });
      }
      let query = null;
      const onMedia = () => schedule();
      if (typeof view.matchMedia === "function") {
        query = view.matchMedia("(prefers-color-scheme: dark)");
        if (typeof query.addEventListener === "function") query.addEventListener("change", onMedia);
      }
      return function dispose() {
        cancelled = true;
        if (observer !== null) observer.disconnect();
        if (query !== null && typeof query.removeEventListener === "function") query.removeEventListener("change", onMedia);
      };
    }

    // client/src/card.js
    var FRAME_CLASS = "dsh-genui-frame";
    var INITIAL_HEIGHT = 48;
    function createCard({ React: React2, toolName, readSpec }) {
      const h = React2.createElement;
      function CardFrame({ spec, t, sendMessage }) {
        const frame = React2.useRef(null);
        const tokenRef = React2.useRef("");
        const gateRef = React2.useRef(null);
        const [height, setHeight] = React2.useState(INITIAL_HEIGHT);
        const [pending, setPending] = React2.useState(null);
        const [sent, setSent] = React2.useState(false);
        const [sendFailed, setSendFailed] = React2.useState("");
        const [frameFailed, setFrameFailed] = React2.useState("");
        const tRef = React2.useRef(t);
        tRef.current = t;
        if (gateRef.current === null) gateRef.current = createInteractGate();
        React2.useEffect(() => {
          const element = frame.current;
          if (element === null) return void 0;
          const view = element.ownerDocument?.defaultView;
          if (view === void 0 || view === null) return void 0;
          const token = createNonce(view.crypto);
          tokenRef.current = token;
          const gate = gateRef.current;
          gate.clear();
          setPending(null);
          const theme = readThemeSnapshot(view);
          let loads = 0;
          const onLoad = () => {
            loads += 1;
            if (loads <= 1) return;
            element.removeAttribute("srcdoc");
            setFrameFailed(tRef.current("card.frameNavigated"));
          };
          element.addEventListener("load", onLoad);
          element.setAttribute("srcdoc", buildFrameDocument({ code: spec.code, token, theme }));
          const onMessage = (event) => {
            const verdict = validateFrameMessage(event, {
              source: element.contentWindow,
              token: tokenRef.current
            });
            if (!verdict.ok) return;
            if (verdict.type === "height") {
              setHeight(verdict.height);
              return;
            }
            if (verdict.type === "failed") {
              if (verdict.detail !== "") setFrameFailed(verdict.detail);
              return;
            }
            const outcome = gate.request(verdict.text);
            if (!outcome.ok) return;
            setPending({ text: verdict.text });
            setSent(false);
            setSendFailed("");
          };
          view.addEventListener("message", onMessage);
          const stopTheme = observeTheme(view, (snapshot) => {
            const target = element.contentWindow;
            if (target === null) return;
            target.postMessage({ type: "theme", token: tokenRef.current, theme: snapshot }, "*");
          });
          return function dispose() {
            element.removeEventListener("load", onLoad);
            view.removeEventListener("message", onMessage);
            stopTheme();
            gate.clear();
            tokenRef.current = "";
          };
        }, [spec.code]);
        const accept = React2.useCallback(async () => {
          const text = gateRef.current?.accept();
          if (text === null || text === void 0) return;
          setPending(null);
          if (typeof sendMessage !== "function") {
            setSendFailed("this card cannot send a message: no conversation bridge was injected");
            return;
          }
          try {
            await sendMessage(text);
            setSent(true);
            setSendFailed("");
          } catch (error) {
            setSendFailed(error instanceof Error ? error.message : String(error));
          }
        }, [sendMessage]);
        const dismiss = React2.useCallback(() => {
          gateRef.current?.clear();
          setPending(null);
        }, []);
        React2.useEffect(() => {
          if (!sent) return void 0;
          const timer = globalThis.setTimeout(() => setSent(false), 4e3);
          return () => {
            globalThis.clearTimeout(timer);
          };
        }, [sent]);
        return h(
          "div",
          { className: "dsh-genui-body" },
          h("iframe", {
            ref: frame,
            className: FRAME_CLASS,
            sandbox: "allow-scripts",
            title: spec.title,
            // No `allow` entry grants the frame any additional permission: camera,
            // microphone, geolocation, clipboard and fullscreen are not delegated to
            // it. What that means concretely is the browser's to enforce per feature;
            // this attribute is the absence of a grant, not a promise that every
            // related API is switched off.
            referrerPolicy: "no-referrer",
            // A fixed height set from the frame's own report. `scrolling="no"`
            // keeps a nested scrollbar out of the transcript.
            style: { height: height + "px" },
            scrolling: "no"
          }),
          pending !== null ? h(
            "div",
            { className: "dsh-genui-pending-send" },
            h("div", { className: "dsh-genui-pending-text" }, pending.text.slice(0, MAX_INTERACT_CHARS)),
            h(
              "div",
              { className: "dsh-genui-pending-actions" },
              h("button", {
                type: "button",
                className: "dsh-genui-confirm",
                onClick: accept
              }, t("card.sendChoice")),
              h("button", {
                type: "button",
                className: "dsh-genui-dismiss",
                onClick: dismiss
              }, t("card.dismissChoice"))
            )
          ) : null,
          sent ? h("div", { className: "dsh-genui-sent", role: "status" }, t("card.sent")) : null,
          sendFailed !== "" ? h(Failure, { t, title: t("card.sendFailed"), detail: sendFailed }) : null,
          frameFailed !== "" ? h(Failure, { t, title: t("card.failed"), detail: frameFailed }) : null
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
          h(CardFrame, { spec, t, sendMessage: props.sendMessage }),
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
      "card.sendChoice": "Send this choice",
      "card.dismissChoice": "Discard",
      "card.pendingHint": "This card is asking to send a message",
      "card.frameNavigated": "This card tried to load another page, so it was stopped. Its source is below.",
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
      "card.sendChoice": "\u53D1\u9001\u8FD9\u6761\u9009\u62E9",
      "card.dismissChoice": "\u4E22\u5F03",
      "card.pendingHint": "\u8FD9\u5F20\u5361\u7247\u8BF7\u6C42\u53D1\u9001\u4E00\u6761\u6D88\u606F",
      "card.frameNavigated": "\u8FD9\u5F20\u5361\u7247\u8BD5\u56FE\u52A0\u8F7D\u53E6\u4E00\u4E2A\u9875\u9762\uFF0C\u5DF2\u88AB\u62E6\u4E0B\u3002\u6E90\u7801\u5728\u4E0B\u65B9\u3002",
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
      const Card = createCard({ React: React2, toolName, readSpec: readUiSpec });
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
