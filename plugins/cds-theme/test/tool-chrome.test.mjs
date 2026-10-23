import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createToolChromeMarker, searchRecoveryNotice, TRACE_ATTR, BODY_ATTR, RECOVERY_ATTR } from '../client/src/tool-chrome.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize } from '../client/src/constants.js'

class Element {
  constructor(tag='div',attrs={},text=''){this.tagName=tag.toUpperCase();this.attrs={...attrs};this.textContent=text;this.children=[];this.parentElement=null;this.nodeType=1;this.dataset={};this.style={values:{},setProperty(k,v){this.values[k]=v},removeProperty(k){delete this.values[k]}};this.rect={top:0,left:0,width:18,height:18,right:18}}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node)}return this}
  hasAttribute(k){return Object.hasOwn(this.attrs,k)}
  getAttribute(k){return this.attrs[k]??null}
  setAttribute(k,v){this.attrs[k]=v}
  removeAttribute(k){delete this.attrs[k]}
  getBoundingClientRect(){const r=this.rect;return {top:r.top,left:r.left,width:r.width,height:r.height,right:r.left+r.width,bottom:r.top+r.height}}
  get isConnected(){return this.closest('body')!==null}
  get nextElementSibling(){const list=this.parentElement?.children||[];return list[list.indexOf(this)+1]||null}
  matches(s){const m=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(s);return m?this.hasAttribute(m[1])&&(m[2]===undefined||this.getAttribute(m[1])===m[2]):this.tagName===s.toUpperCase()}
  closest(s){for(let e=this;e;e=e.parentElement)if(e.matches(s))return e;return null}
  querySelectorAll(s){return this.children.flatMap(e=>[...(e.matches(s)?[e]:[]),...e.querySelectorAll(s)])}
  querySelector(s){return this.querySelectorAll(s)[0]||null}
}
const el=(...args)=>new Element(...args)
const note='(Showing 100 of 413 paths. Full sorted result stored at: C:\\results.txt. Use read with offset/limit.)'
function setup(){
  const body=el('body'),flow=el('div',{'data-conversation-content':''}),slot=el('div',{'data-slot':'tool.call.toolview'}),root=el('div',{'data-tool':'glob'}),wrap=el(),surface=el('div',{'data-search':'paths'}),recovery=el('div',{},'a.txt\nb.txt\n\n'+note),button=el('button',{},'查看').append(el('svg'))
  body.append(flow.append(slot.append(root.append(wrap.append(surface,recovery,button)))))
  let notify,pending=null,disconnected=false
  const listeners=new Map()
  const doc={body,querySelectorAll:s=>body.querySelectorAll(s),defaultView:{
    MutationObserver:class{constructor(fn){notify=fn}observe(){}disconnect(){disconnected=true}},
    requestAnimationFrame(fn){pending=fn;return 1},cancelAnimationFrame(){pending=null},
    addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)},
  }}
  return {doc,body,root,wrap,surface,recovery,button,notify:r=>notify(r),flush(){const f=pending;pending=null;f?.()},
    resize(){listeners.get('resize')?.()},get listeners(){return [...listeners.keys()]},
    get pending(){return pending},get disconnected(){return disconnected}}
}
test('extracts only a complete spill notice and leaves ordinary/error output intact',()=>{
  assert.equal(searchRecoveryNotice('a.txt\nb.txt\n\n'+note),note)
  for(const text of ['a.txt\nb.txt','permission denied','(Showing 100 results)','malformed Full sorted result stored at: file'])assert.equal(searchRecoveryNotice(text),null)
})
test('native trace controls leave normal flow while recovery retains the full-result pointer',()=>{
  const s=setup(),click=()=>{};s.button.onclick=click
  const marker=createToolChromeMarker(s.doc);marker.start()
  assert.equal(s.button.getAttribute(TRACE_ATTR),'');assert.equal(s.wrap.getAttribute(BODY_ATTR),'')
  assert.equal(s.recovery.getAttribute(RECOVERY_ATTR),note)
  assert.equal(s.button.onclick,click);assert.equal(s.button.textContent,'查看')
  assert.ok(s.recovery.textContent.includes('a.txt'))
  marker.stop();assert.equal(s.button.hasAttribute(TRACE_ATTR),false);assert.equal(s.wrap.hasAttribute(BODY_ATTR),false);assert.equal(s.recovery.hasAttribute(RECOVERY_ATTR),false);assert.equal(s.disconnected,true)
})
test('keeps unrelated buttons and pre-existing plugin-owned attributes; batches late mounts',()=>{
  const s=setup();s.button.textContent='Copy';s.button.setAttribute(TRACE_ATTR,'owned')
  const outside=el('button',{},'Inspect').append(el('svg'));s.body.append(outside)
  const marker=createToolChromeMarker(s.doc);marker.start()
  assert.equal(s.button.getAttribute(TRACE_ATTR),'owned');assert.equal(outside.hasAttribute(TRACE_ATTR),false)
  const late=el('button',{},'View in trajectory').append(el('svg'));s.wrap.append(late)
  s.notify([{target:s.wrap,addedNodes:[late]}]);assert.ok(s.pending);s.flush();assert.equal(late.getAttribute(TRACE_ATTR),'')
  s.notify([{type:'characterData',target:s.root}]);assert.equal(s.pending,null)
  marker.stop();assert.equal(s.button.getAttribute(TRACE_ATTR),'owned');assert.equal(late.hasAttribute(TRACE_ATTR),false)
})
test('the trace seat is measured from the copy control it sits beside',()=>{
  const doc={body:null}
  const s=setup()
  const header=el('div'),copy=el('button',{'data-cds-native-copy':'idle'},'Copy')
  copy.rect={top:10,left:600,width:18,height:18}
  s.wrap.rect={top:0,left:0,width:640,height:300}
  s.wrap.append(header.append(copy))
  doc.body=s.body
  doc.querySelectorAll=x=>s.body.querySelectorAll(x)
  doc.defaultView=s.doc.defaultView
  const marker=createToolChromeMarker(doc);marker.start()
  const top=s.button.style.values['--cds-trace-top'],right=s.button.style.values['--cds-trace-right']
  assert.equal(s.button.dataset.cdsTraceSeated,'1')
  assert.equal(top,'10px','the glyph must take the copy row, not the card corner')
  assert.equal(right,'48px','8px gap past the copy control')
  marker.stop()
  assert.equal(s.button.dataset.cdsTraceSeated,undefined)
  assert.deepEqual(s.button.style.values,{},'a disposed marker must not pin the control')
  assert.deepEqual(s.listeners,[],'the resize listener must be removed with the observer')
})

test('a resize drops the stale seat and measures it again in one frame',()=>{
  const s=setup()
  const copy=el('button',{'data-cds-native-copy':'idle'},'Copy')
  copy.rect={top:10,left:600,width:18,height:18}
  s.wrap.rect={top:0,left:0,width:640,height:300}
  s.wrap.append(copy)
  const marker=createToolChromeMarker(s.doc);marker.start()
  assert.equal(s.button.style.values['--cds-trace-top'],'10px')
  // The copy control moves after a reflow; the old inline seat is now wrong.
  copy.rect={top:26,left:600,width:18,height:18}
  s.resize()
  assert.equal(s.pending!==null,true,'a resize must schedule one measuring frame')
  const pendingSeat=s.button.style.values['--cds-trace-top']
  s.flush()
  assert.equal(s.button.style.values['--cds-trace-top'],'26px')
  assert.equal(pendingSeat,undefined,'the stale seat must be cleared before re-measuring')
  marker.stop()
})
test('trace/recovery rules remove footer flow and spare controls from broad card framing',()=>{
  const css=buildCssFor(sanitize({}))
  assert.match(css,/\[data-conversation-content\] \[data-cds-tool-inspect\] \{[^}]*position: absolute !important/)
  assert.match(css,/\[data-cds-diffrow\] > \[data-cds-tool-inspect\] \{ top: 3px !important; right: 26px !important;/)
  assert.match(css,/\[data-cds-diffrow\]:hover > \[data-cds-tool-inspect\]/)
  assert.match(css,/\[data-cds-tool-body\]:hover > \[data-cds-tool-inspect\]/)
  assert.match(css,/:not\(\[data-cds-tool-inspect\]\):not\(\[data-cds-search-recovery\]\)/)
  for(const state of [{refine:false},{enabled:false}])assert.ok(!buildCssFor(sanitize(state)).includes('mask: url(\'data:image/svg+xml'))
})
