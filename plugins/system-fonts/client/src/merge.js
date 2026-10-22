/**
 * Seat the plugin's settings rows INSIDE the host's collapsible font region.
 *
 * WHY THIS EXISTS. `settings.general.item` is a flat sibling list: the slot
 * system can only put rows next to the host's FontSettingsGroup, never inside
 * it. The group renders the text font-size row and — only while its disclosure
 * button is open — a region holding the official family rows (and the code /
 * terminal size rows):
 *
 *   div.group
 *     ├─ FontSizeRow text        ← the ONLY expander: button[aria-expanded]
 *     │                            + aria-controls=regionId + a `px` label
 *     └─ {open && div#regionId
 *           ├─ FontFamilyRow text
 *           ├─ FontFamilyRow code
 *           ├─ FontSizeRow code
 *           ├─ FontFamilyRow terminal
 *           └─ FontSizeRow terminal
 *        }
 *
 * The plugin's pickers replace those official family inputs, so they belong
 * where the inputs are: INSIDE that region, each picker directly after its own
 * official row, and the line-height / tracking sliders at the end. They then
 * expand and collapse with the group, exactly like the host's own rows.
 *
 * COLLAPSED STATE. React renders the region conditionally, so when the group is
 * collapsed there is no region at all. A plugin row must never be left inside a
 * region React has removed — React still believes the row is the outlet's child
 * and a later `removeChild(outlet, row)` would throw. Every row is therefore
 * seated back into the slot outlet and hidden (`display:none` +
 * `data-dsf-collapsed`) while collapsed. The MutationObserver fires in the same
 * microtask checkpoint as the removal, so the orphaned window is the interval
 * between React's commit and that callback (no React work happens there).
 *
 * HOOKS (no salted CSS-Modules classes anywhere; JS structural traversal plus
 * our own `data-*` marks):
 *
 *   - `data-dsf-row="<slot id>"` marks every plugin row root.
 *   - The settings list is the host's own stable `data-slot` outlet —
 *     `div[data-slot="settings.general.item"]` (the host's GeneralSection
 *     stylesheet targets it too, see dsh-client-ui-settings-general).
 *   - The font group is the outlet entry carrying the font-size row: a
 *     disclosure button with `aria-expanded` + `aria-controls` beside a `px`
 *     unit label (`px` is `fontSize.unit` in BOTH host dictionaries), or —
 *     failing that — the entry carrying the official FontFamilyRow inputs
 *     (`maxlength=200`, or placeholder/aria-label from the host's
 *     `fontFamily.*` strings in either language).
 *   - The region is the group's non-control child that contains those family
 *     inputs. With no such child the group is collapsed (only the size row is
 *     mounted); a group with other children but no family inputs is an
 *     unrecognized shape.
 *   - Role mapping: the official family row's own text (`正文字体|代码字体|
 *     终端字体` in zh, `Text font|Code font|Terminal font` in en — the host's
 *     `fontFamily.<role>.title` strings, DATA not UI copy) decides which picker
 *     follows it; document order (text, code, terminal) is the fallback.
 *   - Official family rows are identified as the row-level ancestor of such an
 *     input (one family input, no expander, no px unit) and hidden with
 *     `display:none` + `data-dsf-covered`, never removed.
 *   - The host's code-size row is identified by its `fontSize.code.title` text
 *     (`代码字号` / `Code font size`), covered the same way, and the 行内代码
 *     stepper is seated where it was: two size rows share one markup, so the
 *     title is the only stable difference.
 *
 * IDEMPOTENT. A pass only calls `insertBefore` where the container's current
 * child differs from the desired sequence, and only writes the hidden state
 * when it differs — `insertBefore` on an in-place node still mutates the DOM
 * and would reschedule the observer forever. Expand → collapse → expand and
 * settings remounts converge.
 *
 * REVERSIBILITY. `restore()` seats every row back home, unhides every row it
 * hid and every official row it covered, and disarms a queued pass, so plugin
 * dispose leaves the host exactly as it was found.
 *
 * DEGRADATION. No outlet, no group, or a group whose shape is not recognized:
 * the rows stay visible at their slot positions and nothing is hidden.
 *
 * 机制：脚本只能注入平铺兄弟节点，故挂载后由 DOM 结构遍历找到宿主字号组与它的
 * 折叠区，把本插件的行放进折叠区、紧跟各自的官方族名行之后，滑杆置于末尾；
 * 折叠时宿主不渲染折叠区，行一律归位到槽位出口并 display:none（绝不能留在被
 * 删除的折叠区里，否则 React 之后 removeChild 会抛）。找不到可识别的结构时，
 * 行留在原位且不遮蔽任何东西。
 */

import { INLINE_CODE_SIZE_ROW_ID } from './constants.js'

/** Mark on each plugin row root; also the traversal's "ours" filter. */
export const ROW_ATTR = 'data-dsf-row'
/** Mark on covered official rows so `restore()` can unhide exactly them. */
export const COVERED_ATTR = 'data-dsf-covered'
/** Mark on plugin rows hidden because the host region is collapsed. */
export const COLLAPSED_ATTR = 'data-dsf-collapsed'
/** The host's stable settings-list outlet (a `data-slot` hook, not a class). */
export const OUTLET_ATTR = 'data-slot'
export const OUTLET_KEY = 'settings.general.item'

// The host's own `fontFamily.<role>.title` strings, in both dictionaries — DATA
// for role mapping, not UI copy. They match `.repro/asar/theme-client.js`'s
// locale tables; a host that changes them leaves the document-order fallback.
const ROLE_TITLES = [
  ['text', ['正文字体', 'Text font']],
  ['code', ['代码字体', 'Code font']],
  ['terminal', ['终端字体', 'Terminal font']],
  // The UI role. It has no HOST row to replace (the host has three font inputs),
  // so it is only ever OUR row — but it still has to be in this list, or the
  // merge drops it while moving rows into the host's collapsible group, and the
  // row silently never appears.
  ['ui', ['界面字体', 'Interface font']],
]
const ROLE_ORDER = ROLE_TITLES.map(function (entry) { return entry[0] })
const HOST_FAMILY_TITLES = ROLE_TITLES.reduce(function (all, entry) {
  return all.concat(entry[1])
}, [])
const HOST_FAMILY_PLACEHOLDERS = ['默认', 'Default']

// The host's own `fontSize.code.title` strings, both dictionaries — DATA for
// locating the row, not UI copy. The host's code-size row is REPLACED by this
// plugin's 行内代码 row, so it is covered (hidden) like the official family
// inputs are. Terminal and text sizes stay the host's: only the code axis is
// ours to own, because only its inline rung follows the user's number.
// 宿主「代码字号」行的两种语言标题：该行被本插件「行内代码」行取代，故一并遮蔽。
const CODE_SIZE_TITLES = ['代码字号', 'Code font size']

// ------------------------------------------------------------- DOM helpers

export function attr(el, name) {
  if (!el || typeof el.getAttribute !== 'function') return null
  try { return el.getAttribute(name) } catch (error) { return null }
}

export function setAttr(el, name, value) {
  if (el && typeof el.setAttribute === 'function') el.setAttribute(name, value)
}

export function delAttr(el, name) {
  if (el && typeof el.removeAttribute === 'function') el.removeAttribute(name)
}

function tagOf(el) {
  return el && typeof el.tagName === 'string' ? el.tagName.toUpperCase() : ''
}

export function childrenOf(el) {
  const out = []
  const kids = el && el.children
  if (!kids) return out
  for (let i = 0; i < kids.length; i += 1) out.push(kids[i])
  return out
}

export function textOf(el) {
  const text = el && el.textContent
  return text === undefined || text === null ? '' : String(text).trim()
}

function styleOf(el) {
  return el && el.style ? el.style : null
}

export function isOurRow(el) {
  return attr(el, ROW_ATTR) !== null
}

/** Depth-first over element children, pruning plugin-row subtrees. */
function eachDescendant(el, visit) {
  const stack = childrenOf(el).slice().reverse()
  while (stack.length > 0) {
    const node = stack.pop()
    if (isOurRow(node)) continue
    visit(node)
    const kids = childrenOf(node)
    for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i])
  }
}

function isExpanderButton(el) {
  return tagOf(el) === 'BUTTON'
    && attr(el, 'aria-expanded') !== null
    && typeof attr(el, 'aria-controls') === 'string'
    && attr(el, 'aria-controls') !== ''
}

function isFamilyInput(el) {
  if (tagOf(el) !== 'INPUT') return false
  if (attr(el, 'maxlength') === '200') return true
  const ph = attr(el, 'placeholder')
  if (ph !== null && HOST_FAMILY_PLACEHOLDERS.indexOf(ph.trim()) >= 0) return true
  const al = attr(el, 'aria-label')
  if (al !== null && HOST_FAMILY_TITLES.indexOf(al.trim()) >= 0) return true
  return false
}

function subtreeHas(el, predicate) {
  let found = false
  eachDescendant(el, (node) => { if (!found && predicate(node)) found = true })
  return found
}

function subtreeHasPx(el) {
  return subtreeHas(el, (node) => textOf(node) === 'px')
}

function subtreeHasExpander(el) {
  return subtreeHas(el, isExpanderButton)
}

function subtreeHasFamilyInput(el) {
  return subtreeHas(el, isFamilyInput)
}

function subtreeInputs(el) {
  const out = []
  eachDescendant(el, (node) => { if (isFamilyInput(node)) out.push(node) })
  return out
}

/** The role whose host dictionary title is `title`, or null. */
function roleOfTitle(title) {
  const needle = String(title == null ? '' : title).trim()
  if (needle === '') return null
  for (const entry of ROLE_TITLES) {
    if (entry[1].indexOf(needle) >= 0) return entry[0]
  }
  return null
}

/**
 * True when `el`'s own text is the host's code-size title.
 *
 * MATCHED ON THE TITLE ELEMENT, not on a `px` label or a stepper shape: the
 * region holds TWO size rows (code and terminal) with identical markup, so the
 * only thing that tells them apart is the string the host's own dictionary
 * puts in the title. `fontSize.code.title` is that string in both languages.
 * 按标题精确匹配：折叠区里代码/终端两个字号行结构完全相同，只有标题能区分。
 */
function isCodeSizeTitle(el) {
  return CODE_SIZE_TITLES.indexOf(textOf(el)) >= 0
}

/**
 * The host's code-size ROW inside `region`, or null.
 *
 * The title sits one or more levels below the row root, so the row is the
 * ancestor that is a direct child of the region — the same granularity
 * `familyRowOf` uses, and the same granularity `cover()` hides. Falls back to
 * the title element itself so the duplicate control still goes when the host's
 * row shape changes.
 */
function codeSizeRowIn(region) {
  let titleEl = null
  eachDescendant(region, (node) => { if (titleEl === null && isCodeSizeTitle(node)) titleEl = node })
  if (titleEl === null) return null
  return childOfList(titleEl, region) || titleEl
}

/** The ancestor of `node` that is a direct child of `list`, or null. */
function childOfList(node, list) {
  let current = node
  while (current && current.parentNode && current.parentNode !== list) current = current.parentNode
  return current && current.parentNode === list ? current : null
}

/**
 * The host's font settings group inside `list`: the row whose subtree carries
 * the font-size control (expander + `px` unit) or the official family inputs.
 * Collapsed and expanded states both resolve to the same row.
 * 折叠与展开两种形态都解析到同一行。
 */
function findHostFontGroup(list) {
  let hit = null
  eachDescendant(list, (node) => {
    if (hit !== null || !isExpanderButton(node)) return
    const row = childOfList(node, list)
    if (row !== null && !isOurRow(row) && subtreeHasPx(row)) hit = row
  })
  if (hit !== null) return hit
  eachDescendant(list, (node) => {
    if (hit !== null || !isFamilyInput(node)) return
    const row = childOfList(node, list)
    if (row !== null && !isOurRow(row)) hit = row
  })
  return hit
}

/**
 * Reorder `container`'s element children into `sequence` with the fewest
 * writes. When the child is already in position nothing is touched —
 * `insertBefore` on an in-place node still mutates the DOM and would wake the
 * MutationObserver for no reason.
 * 以最少的写操作把容器的子节点排成给定顺序；已在位的节点一概不碰。
 */
function applySequence(container, sequence, onError) {
  let cursor = container.firstChild || null
  for (const node of sequence) {
    if (cursor === node) {
      cursor = node.nextSibling || null
      continue
    }
    try {
      container.insertBefore(node, cursor)
    } catch (error) {
      if (typeof onError === 'function') onError(error)
      return false
    }
    // `node` now sits immediately before `cursor`; the next desired node goes
    // right there too, so the cursor stays put.
  }
  return true
}

// ------------------------------------------------------------ the merger

export function createHostMerger() {
  /** slotId -> { el, order, role, home: { parent, next } } */
  const rows = new Map()
  /** [{ el, prevDisplay }] — every covered element, in hide order. */
  const covered = []
  let observer = null
  let observed = null
  let scheduled = false
  let stopped = false
  let warned = false

  function warnOnce(error) {
    if (warned) return
    warned = true
    try { console.warn('dsh-system-fonts: host font group merge skipped', error) } catch (e) { /* no console, no problem */ }
  }

  function homeOf(el) {
    return { parent: el.parentNode || null, next: el.nextSibling || null }
  }

  function orderedRows() {
    return [...rows.values()].sort(function (a, b) { return a.order - b.order })
  }

  /**
   * Put one row back at its recorded home, unless it is already there.
   * Also used on unmount (before React removes the node): after the
   * reparenting React still believes the row is the outlet's child, and a row
   * left inside the host region would make its `removeChild(outlet, row)` throw.
   * 卸载时先把行放回原位，否则 React 会从槽位出口删一个不在那里的节点。
   */
  function seat(rec) {
    const el = rec.el
    if (!el || !rec.home || !rec.home.parent) return
    if (el.parentNode === rec.home.parent) return
    try {
      const next = rec.home.next && rec.home.next.parentNode === rec.home.parent ? rec.home.next : null
      rec.home.parent.insertBefore(el, next)
    } catch (error) {
      warnOnce(error)
    }
  }

  function seatHomeAll() {
    for (const rec of rows.values()) seat(rec)
  }

  /** Hide every row (collapsed group): no standalone settings entries show. */
  function hideRows() {
    for (const rec of rows.values()) {
      const el = rec.el
      if (!el) continue
      if (attr(el, COLLAPSED_ATTR) === null) setAttr(el, COLLAPSED_ATTR, '')
      const style = styleOf(el)
      if (style && style.display !== 'none') style.display = 'none'
    }
  }

  function unhideRows() {
    for (const rec of rows.values()) {
      const el = rec.el
      if (!el) continue
      if (attr(el, COLLAPSED_ATTR) !== null) delAttr(el, COLLAPSED_ATTR)
      const style = styleOf(el)
      if (style && style.display !== '') style.display = ''
    }
  }

  /**
   * Register a mounted row root. `el === null` unregisters (React ref cleanup)
   * and seats just that row back home, so a partial unmount never strands a
   * node inside the region.
   *
   * `role` is the theme role the row edits ('text' | 'code' | 'terminal'), or
   * null for the sliders — it decides which official row the picker follows.
   */
  function note(slotId, el, order, role) {
    if (!el) {
      const prev = rows.get(slotId)
      if (prev) {
        rows.delete(slotId)
        seat(prev)
      }
      if (rows.size === 0) {
        uncoverAll()
        disconnect()
      }
      return
    }
    setAttr(el, ROW_ATTR, slotId)
    // A fresh mount re-arms the merger even if a dispose restored it earlier.
    stopped = false
    const prev = rows.get(slotId)
    // A new node for the same slot (HMR, a remount that kept the plugin
    // mounted): send the old one home first, or React would try to remove a
    // node that is still sitting in the host region.
    if (prev && prev.el !== el) seat(prev)
    rows.set(slotId, {
      el,
      // The slot id rides along so a pass can address ONE specific row (the
      // inline-code stepper is seated after the host code-size row it replaces).
      id: slotId,
      order: order === undefined ? (prev ? prev.order : rows.size) : order,
      role: role === undefined ? (prev ? prev.role : null) : role,
      home: prev && prev.el === el ? prev.home : homeOf(el),
    })
    // Resolve immediately, not on the next frame: a deferred first pass would
    // show the rows as standalone settings entries for one frame before they
    // are seated/hidden. `schedule()` still runs one deferred retry in case
    // the host subtree settles later.
    flush()
    schedule()
  }

  function unnote(slotId) {
    note(slotId, null)
  }

  function schedule() {
    if (scheduled) return
    const run = function () {
      scheduled = false
      attempt()
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      scheduled = true
      window.requestAnimationFrame(run)
    } else if (typeof setTimeout === 'function') {
      scheduled = true
      setTimeout(run, 0)
    } else {
      attempt()
    }
  }

  /**
   * Run a pass NOW. Used by the row refs (mount) and by the MutationObserver
   * (expand / collapse / remount): acting inside the observer callback keeps a
   * row from sitting in a region React has already removed for longer than the
   * current microtask checkpoint.
   */
  function flush() {
    scheduled = false
    attempt()
  }

  /** The stable outlet that holds both our rows and the host group. */
  function findList() {
    for (const rec of rows.values()) {
      // Prefer the live ancestry — a merged row reaches the outlet through the
      // region — but fall back to the recorded home: right after a collapse the
      // row is still inside the detached region and its own ancestors stop at
      // that node. The pass must still find the list, or the row would stay
      // orphaned there.
      const starts = [rec.el, rec.home && rec.home.parent]
      for (const start of starts) {
        let node = start
        for (let i = 0; i < 8 && node; i += 1) {
          if (attr(node, OUTLET_ATTR) === OUTLET_KEY) return node
          node = node.parentNode
        }
      }
    }
    return null
  }

  /**
   * The host's font settings group inside `list`: the entry whose subtree
   * carries the font-size row (expander + `px` unit) or the official family
   * inputs. Collapsed and expanded states both resolve to the same entry.
   */
  function findGroup(list) {
    return findHostFontGroup(list)
  }

  /** The group child carrying the expander / `px` control row, or null. */
  function findControl(group) {
    // The disclosure button is the unique marker of the control row; a `px`
    // label alone also appears in the region's size rows, so it is only the
    // fallback (a host that dropped its expander).
    let pxHolder = null
    for (const child of childrenOf(group)) {
      if (isOurRow(child)) continue
      if (subtreeHasExpander(child)) return child
      if (pxHolder === null && subtreeHasPx(child)) pxHolder = child
    }
    return pxHolder
  }

  /** The group's children that are neither the control row nor ours. */
  function otherChildren(group, control) {
    return childrenOf(group).filter(function (child) {
      return child !== control && !isOurRow(child)
    })
  }

  /**
   * The collapsible region: the group's non-control child that holds the
   * official family inputs. Null while collapsed (React has not mounted it).
   */
  function findRegion(group, control) {
    for (const child of otherChildren(group, control)) {
      if (subtreeHasFamilyInput(child)) return child
    }
    return null
  }

  /** True when the group is in its normal collapsed shape (no region child). */
  function isCollapsedShape(group, control) {
    return otherChildren(group, control).length === 0
  }

  /**
   * The official family inputs of a region, each paired with its
   * row-level ancestor and its own aria-label/placeholder text.
   */
  function familyEntries(region) {
    const entries = []
    for (const input of subtreeInputs(region)) {
      const row = familyRowOf(input, region)
      if (entries.some((entry) => entry.row === row)) continue
      entries.push({ row, title: attr(input, 'aria-label') || attr(input, 'placeholder') || '' })
    }
    return entries
  }

  /**
   * The row-level ancestor of an official family input: exactly one family
   * input and neither the expander row nor a size row. Falls back to the
   * input itself so the control is still covered when the row shape changed.
   */
  function familyRowOf(input, region) {
    const candidates = []
    let node = input.parentNode
    while (node && node !== region) {
      const parent = node.parentNode
      if (!parent) break
      if (parent === region || (parent.parentNode === region && parent !== region)) candidates.push(node)
      node = parent
    }
    // Climbing pushed deepest-first; check the shallowest (row root) first.
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const cand = candidates[i]
      const inputs = subtreeInputs(cand)
      if (inputs.length === 1 && !subtreeHasExpander(cand) && !subtreeHasPx(cand)) return cand
    }
    return input
  }

  /** role -> official family row element, in the region. */
  function familyRoles(region) {
    const entries = familyEntries(region)
    const found = []
    entries.forEach((entry, index) => {
      const role = roleOfTitle(entry.title) || ROLE_ORDER[index] || null
      if (role === null) return
      if (found.some((item) => item.role === role)) return
      found.push({ role, row: entry.row })
    })
    return found
  }

  /**
   * Hide the rows this plugin replaces: the official family inputs, and the
   * host's code-size row (replaced by 行内代码 — the only code size the user
   * asked to own; the terminal's own size row stays the host's and stays
   * visible).
   * 遮蔽被本插件取代的宿主行：三个官方族名输入框，以及「代码字号」行。
   */
  function cover(region) {
    // Drop records whose node left the document (the region is unmounted on
    // every collapse), so the list cannot grow without bound.
    for (let i = covered.length - 1; i >= 0; i -= 1) {
      const entry = covered[i]
      if (entry.el && entry.el.parentNode !== null) continue
      covered.splice(i, 1)
    }
    const targets = familyEntries(region).map(function (entry) { return entry.row })
    const codeSizeRow = codeSizeRowIn(region)
    if (codeSizeRow !== null && targets.indexOf(codeSizeRow) < 0) targets.push(codeSizeRow)
    for (const target of targets) {
      const marked = attr(target, COVERED_ATTR) !== null
      const hidden = target.style ? target.style.display === 'none' : true
      // The mark and the inline style are TWO facts that can disagree: React
      // re-renders the row and resets `style.display`, while our attribute
      // survives because React does not manage it. Skipping on the mark alone
      // left the official row visible right next to our picker while `attempt()`
      // still reported success. Re-assert the style every pass — it is one
      // property write, and `hidden` above is what makes this idempotent.
      if (marked && hidden) continue
      if (!marked) {
        const prevDisplay = target.style ? target.style.display : undefined
        covered.push({ el: target, prevDisplay })
        setAttr(target, COVERED_ATTR, '')
      }
      if (target.style) target.style.display = 'none'
    }
  }

  /** Unhide everything we covered; used by restore and by row teardown. */
  function uncoverAll() {
    for (const entry of covered.splice(0)) {
      delAttr(entry.el, COVERED_ATTR)
      if (entry.el.style) entry.el.style.display = entry.prevDisplay === undefined ? '' : entry.prevDisplay
    }
  }

  /**
   * Move each plugin row to its place inside the region:
   *
   *   official text family row      → content picker
   *   official code family row      → code picker
   *   (official code size row)      → 行内代码 size row, which replaces it
   *   official terminal family row  → terminal picker
   *   (official terminal size row)
   *   …then the UI pair and the line-height / tracking sliders
   *
   * Only nodes that are out of place are moved (see `applySequence`).
   */
  function seatInRegion(region) {
    const roles = familyRoles(region)
    const ordered = orderedRows()
    const placed = new Set()
    const sequence = []
    // The inline-code row has no host FAMILY row to follow, but it does have a
    // host SIZE row: it takes that row's place, so 行内代码 reads as the control
    // the hidden 代码字号 used to be instead of trailing every other row.
    // 行内代码行顶上被隐藏的「代码字号」行位置，而不是排到末尾。
    const codeSizeRow = codeSizeRowIn(region)
    const inlineRec = ordered.find(function (row) {
      return row.id === INLINE_CODE_SIZE_ROW_ID && row.el
    }) || null
    for (const child of childrenOf(region)) {
      if (isOurRow(child)) continue
      sequence.push(child)
      if (inlineRec !== null && child === codeSizeRow && !placed.has(inlineRec)) {
        sequence.push(inlineRec.el)
        placed.add(inlineRec)
      }
      for (const item of roles) {
        if (item.row !== child) continue
        const rec = ordered.find(function (row) { return row.role === item.role && !placed.has(row) })
        if (rec && rec.el) {
          sequence.push(rec.el)
          placed.add(rec)
        }
      }
    }
    // Pickers whose official row could not be identified, and the sliders,
    // go last.
    for (const rec of ordered) {
      if (!rec.el || placed.has(rec)) continue
      sequence.push(rec.el)
      placed.add(rec)
    }
    return applySequence(region, sequence, warnOnce)
  }

  function watch(list) {
    const Observer = typeof window !== 'undefined' ? window.MutationObserver : null
    if (typeof Observer !== 'function') return
    if (observer && observed === list) return
    if (observer) { try { observer.disconnect() } catch (error) { /* ignore */ } }
    try {
      observer = new Observer(function () { flush() })
      observer.observe(list, { childList: true, subtree: true })
      observed = list
    } catch (error) {
      observer = null
      observed = null
    }
  }

  function disconnect() {
    if (observer) {
      try { observer.disconnect() } catch (error) { /* ignore */ }
    }
    observer = null
    observed = null
  }

  /**
   * The degradation every unresolved pass must end in: rows seated home in the
   * slot outlet, visible, and nothing of the host's hidden.
   *
   * WHY THIS IS NOT OPTIONAL. A row that stays inside the host group while
   * React removes that group travels into the detached subtree. React still
   * believes the row is a direct child of the outlet, so a later
   * `removeChild(outlet, row)` throws NotFoundError and takes the settings page
   * down with it — the failure this module exists to prevent. Seating must
   * therefore happen on the paths that FAIL to resolve the group too, not only
   * on the collapse path that has a test.
   * 解析不到宿主分组时同样必须归位：留在被删子树里的行会让 React 之后的
   * removeChild 抛错，整页设置崩掉。
   */
  function degrade() {
    seatHomeAll()
    unhideRows()
    uncoverAll()
  }

  /**
   * One merge pass.
   *
   * Returns true when the group was resolved and the rows are in their
   * intended state: inside the region while expanded, or home + hidden while
   * collapsed. False means "found nothing (or an unrecognized shape)" — the
   * rows then stay visible at their slot positions and nothing is hidden.
   */
  function attempt() {
    try {
      if (stopped || rows.size === 0) return false
      const list = findList()
      if (list === null) {
        // No outlet to seat into; still put back anything that can go home.
        degrade()
        return false
      }
      const group = findGroup(list)
      if (group === null) {
        // The host group is gone (its providing plugin reloaded, the section
        // re-rendered without it). Rows may be inside its removed subtree.
        // Keep watching the outlet: a group that mounts later still gets the
        // rows, even if that happens after the one deferred retry.
        watch(list)
        degrade()
        return false
      }
      const control = findControl(group)
      const region = findRegion(group, control)
      if (region !== null) {
        if (!seatInRegion(region)) {
          // A partially moved set is worse than no merge: half the rows inside
          // a region the host may delete, half in the outlet, official inputs
          // still visible. Go back to the documented degradation instead.
          degrade()
          return false
        }
        cover(region)
        unhideRows()
        watch(list)
        return true
      }
      if (isCollapsedShape(group, control)) {
        // Collapsed: React has not mounted the region. Rows live in the slot
        // outlet (never inside a removed region) and are invisible.
        seatHomeAll()
        hideRows()
        uncoverAll()
        watch(list)
        return true
      }
      // Unrecognized shape: keep the rows visible where the slot put them and
      // hide nothing.
      degrade()
      watch(list)
      return false
    } catch (error) {
      warnOnce(error)
      try {
        degrade()
      } catch (secondary) { /* nothing left to protect */ }
      return false
    }
  }

  /**
   * Put every row back home, unhide every row and every covered official row,
   * and disarm any pass already queued on an animation frame: a merge running
   * after the restore would move the rows again right before React removes
   * them. Idempotent.
   */
  function restore() {
    stopped = true
    seatHomeAll()
    unhideRows()
    uncoverAll()
    disconnect()
  }

  return {
    note,
    unnote,
    attempt,
    restore,
    /** Test/introspection surface. 测试与自省用。 */
    get rowCount() { return rows.size },
    get coveredCount() { return covered.length },
    /** All rows, in slot order. 全部行（按槽位顺序）。 */
    elements() {
      return orderedRows().map(function (rec) { return rec.el })
    },
    /** The host region currently resolved, or null (collapsed). 当前折叠区。 */
    region() {
      const list = findList()
      if (list === null) return null
      const group = findGroup(list)
      return group === null ? null : findRegion(group, findControl(group))
    },
    /** True when every row sits inside the live region. */
    isMerged() {
      const region = this.region()
      if (region === null) return false
      for (const rec of rows.values()) {
        if (!rec.el || rec.el.parentNode !== region) return false
      }
      return rows.size > 0
    },
    /** True when every row is home (slot outlet) and hidden by us. */
    isCollapsed() {
      if (rows.size === 0) return false
      for (const rec of rows.values()) {
        const el = rec.el
        if (!el || !rec.home || !rec.home.parent) return false
        if (el.parentNode !== rec.home.parent) return false
        if (attr(el, COLLAPSED_ATTR) === null) return false
        if (!el.style || el.style.display !== 'none') return false
      }
      return true
    },
  }
}
