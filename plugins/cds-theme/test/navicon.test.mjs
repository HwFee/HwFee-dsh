/**
 * The 「主题定制 / Theme」 settings-nav icon.
 *
 * WHY THIS FILE EXISTS. The host draws the settings sidebar's glyph from a
 * hardcoded if-chain (`dsh-client-ui-settings-general/lib/client.js:244-266`)
 * whose fallback is the gear, so our section — whose id is not in the chain —
 * showed the same glyph as 「通用」. A slot registration cannot supply an icon, so
 * `navicon.js` finds the nav button structurally and swaps the glyph. These tests
 * pin that marker's contract: it finds the right button, is idempotent, restores
 * the host's own SVG on dispose, never touches another entry, and degrades when
 * the nav is absent.
 *
 *   node test/navicon.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  NAV_ATTR, ICON_ATTR, MODAL_ANCHOR, ICON_VIEW_BOX, ICON_SHAPES, ICON_STROKE,
  BANNED_MOTIF,
  iconMarkup, createIconNode, findNavButton, hostSvgOf, iconIn,
  markAppearanceNav, createAppearanceIconMarker,
} from '../client/src/navicon.js'
import { en, zh } from '../client/src/locales.js'

const LABELS = [en['appearance.nav'], zh['appearance.nav']]

// ------------------------------------------------------------- fake DOM

/** A minimal element: tag, attributes, children, style, textContent. */
function element(tagName, attributes) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    attributes: Object.assign({}, attributes),
    children: [],
    parentNode: null,
    style: { display: '' },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(node.attributes, name) ? node.attributes[name] : null
    },
    setAttribute(name, value) { node.attributes[name] = String(value) },
    removeAttribute(name) { delete node.attributes[name] },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(node.attributes, name) },
    appendChild(child) {
      child.parentNode = node
      node.children.push(child)
      return child
    },
    insertBefore(child, reference) {
      child.parentNode = node
      const index = node.children.indexOf(reference)
      if (index < 0) node.children.push(child)
      else node.children.splice(index, 0, child)
      return child
    },
    removeChild(child) {
      const index = node.children.indexOf(child)
      if (index >= 0) node.children.splice(index, 1)
      child.parentNode = null
      return child
    },
    querySelector(selector) {
      const found = node.querySelectorAll(selector)
      return found.length > 0 ? found[0] : null
    },
    querySelectorAll(selector) {
      const out = []
      const walk = function (current) {
        for (const child of current.children) {
          if (matches(child, selector)) out.push(child)
          walk(child)
        }
      }
      walk(node)
      return out
    },
  }
  let text = ''
  Object.defineProperty(node, 'textContent', {
    enumerable: true,
    get() { return text },
    set(value) { text = String(value) },
  })
  return node
}

/** Enough selector support for the four forms this module uses. */
function matches(node, selector) {
  if (selector === 'button') return node.tagName === 'BUTTON'
  if (selector === 'svg') return node.tagName === 'SVG'
  const attribute = /^\[([a-zA-Z-]+)(?:="([^"]*)")?\]$/.exec(selector)
  if (attribute !== null) {
    if (!node.hasAttribute(attribute[1])) return false
    return attribute[2] === undefined || node.attributes[attribute[1]] === attribute[2]
  }
  return false
}

/** A fake document whose `createElementNS` produces the same element type. */
function fakeDocument() {
  const body = element('body')
  return {
    body,
    createElementNS(namespace, tagName) {
      return element(tagName, tagName === 'svg' ? { 'aria-hidden': 'true' } : {})
    },
    querySelector(selector) {
      return body.querySelector(selector)
    },
    querySelectorAll(selector) {
      return body.querySelectorAll(selector)
    },
  }
}

/** The host's nav: a dialog with four entries, each a button + svg + label span. */
function fakeNav(doc, options) {
  const opts = options || {}
  const dialog = element('div', { 'data-shortcut-modal': 'settings' })
  const svg = function () {
    const node = element('svg', { viewBox: ICON_VIEW_BOX, width: '16', height: '16' })
    node.appendChild(element('circle', { cx: '8', cy: '8', r: '2.1' }))
    return node
  }
  const rows = [
    { id: 'account', label: opts.accountLabel || '账户' },
    { id: 'general', label: opts.generalLabel || '通用' },
    { id: 'appearance', label: opts.appearanceLabel || zh['appearance.nav'] },
    { id: 'models', label: opts.modelsLabel || '模型' },
  ]
  const buttons = rows.map(function (row) {
    const button = element('button', { type: 'button' })
    button.appendChild(svg())
    const span = element('span')
    span.textContent = row.label
    button.appendChild(span)
    dialog.appendChild(button)
    return button
  })
  doc.body.appendChild(dialog)
  return { dialog, buttons, hostSvgs: buttons.map(function (b) { return hostSvgOf(b) }) }
}

// ------------------------------------------------------------------ asset

test('the icon markup matches the host icon language', function () {
  const markup = iconMarkup(16, 'medium')
  assert.match(markup, /viewBox="0 0 16 16"/)
  assert.match(markup, /fill="none"/)
  assert.match(markup, /stroke="currentColor"/)
  assert.match(markup, /stroke-linecap="round"/)
  assert.match(markup, /stroke-linejoin="round"/)
  assert.match(markup, /aria-hidden="true"/)
  assert.match(markup, /width="16"/)
  assert.match(markup, /height="16"/)
  assert.match(markup, /stroke-width="1\.3"/, 'Medium is the rung the settings nav ships')
  // The two rungs differ ONLY in stroke width.
  const regular = iconMarkup(16, 'regular')
  assert.match(regular, /stroke-width="1"/)
  assert.equal(regular.replace('stroke-width="1"', 'stroke-width="1.3"'), markup)
  const bigger = iconMarkup(20, 'medium')
  assert.match(bigger, /width="20"/)
  assert.match(bigger, /height="20"/)
  assert.match(bigger, /viewBox="0 0 16 16"/, 'the viewBox scales, the geometry stays on the 16 grid')
})

test('the icon is monochrome: currentColor only, no baked-in palette', function () {
  const markup = iconMarkup(16, 'medium')
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(markup), 'no hard-coded colours')
  assert.ok(!/\brgb/i.test(markup), 'no rgb() colours')
  const strokes = markup.match(/stroke="([^"]+)"/g) || []
  for (const stroke of strokes) assert.equal(stroke, 'stroke="currentColor"')
  for (const shape of ICON_SHAPES) {
    if (shape.attrs.fill !== undefined) {
      assert.equal(shape.attrs.fill, 'currentColor', 'the only fill is currentColor')
    }
  }
})

test('the mark is nested rounded squares, concentric on the 16 grid', function () {
  // The glyph this page shows in the settings nav. Every assertion below is
  // geometric: it pins the design, not just "a shape exists".
  assert.equal(ICON_SHAPES.length, 2, 'exactly two frames')
  const rects = ICON_SHAPES.filter(function (shape) { return shape.tag === 'rect' })
  assert.equal(rects.length, 2, 'both frames are rects')
  const [outer, inner] = rects.map(function (shape) {
    return {
      x: Number(shape.attrs.x),
      y: Number(shape.attrs.y),
      w: Number(shape.attrs.width),
      h: Number(shape.attrs.height),
      r: Number(shape.attrs.rx),
    }
  })
  // Square frames, not oblongs.
  assert.equal(outer.w, outer.h, 'the outer frame is square')
  assert.equal(inner.w, inner.h, 'the inner frame is square')
  assert.ok(outer.w > inner.w, 'the outer frame is the larger one')
  // CONCENTRIC: both centres land on the grid centre (8,8), and the gap is equal
  // on all four sides — that is what makes them read as one nested mark.
  assert.equal(outer.x + outer.w / 2, 8, 'outer frame is centred')
  assert.equal(outer.y + outer.h / 2, 8)
  assert.equal(inner.x + inner.w / 2, 8, 'inner frame shares the centre')
  assert.equal(inner.y + inner.h / 2, 8)
  const gapLeft = inner.x - outer.x
  const gapTop = inner.y - outer.y
  const gapRight = (outer.x + outer.w) - (inner.x + inner.w)
  const gapBottom = (outer.y + outer.h) - (inner.y + inner.h)
  // Rounded to 2dp: the coordinates are decimals, so the arithmetic carries
  // sub-pixel float residue (3.3000000000000003 vs 3.299999999999999).
  const round = function (value) { return Math.round(value * 100) / 100 }
  assert.equal(round(gapLeft), round(gapTop), 'equal gap top and left')
  assert.equal(round(gapLeft), round(gapRight), 'equal gap left and right')
  assert.equal(round(gapLeft), round(gapBottom), 'equal gap top and bottom')
  assert.ok(gapLeft > 1, 'the gap is visible at 16px: ' + round(gapLeft) + 'px')
  // Radii: rounded but not a circle, and the inner corner is visibly tighter.
  for (const frame of [outer, inner]) {
    assert.ok(frame.r > 0, 'corners are rounded')
    assert.ok(frame.r < frame.w / 2, 'but not a stadium/circle: ' + frame.r + ' vs ' + frame.w / 2)
  }
  assert.ok(inner.r < outer.r, 'the inner corner is tighter than the outer — the concentric rule')
})

test('the banned three-track slider motif cannot come back', function () {
  // THE REGRESSION GUARD. This glyph used to be three tracks with round knobs,
  // which is the host's own 插件 glyph (`IconPersonalizationOutlineMedium`:
  // 3 circles + 3 gapped tracks). The user reported the duplicate twice. The
  // motif belongs to 插件 now, so anything shaped like it fails here.
  const circles = ICON_SHAPES.filter(function (shape) { return shape.tag === 'circle' })
  assert.equal(circles.length, 0,
    'no round knobs — that is the 插件 glyph (see BANNED_MOTIF)')
  assert.equal(BANNED_MOTIF.owner.includes('插件'), true, 'the guard still names the owner')

  // No horizontal track either: a track is a straight horizontal segment in a
  // path `d` (the old form was `M2.3 3.4h5.9M11.8 3.4h1.9` — `h`/`H` moves only
  // in x, so any path made only of M/h/H is a horizontal line).
  const horizontals = ICON_SHAPES.filter(function (shape) {
    if (shape.tag !== 'path') return false
    const d = String(shape.attrs.d)
    return /^[MmHh\d.\s,-]+$/.test(d) && /[hH]/.test(d)
  })
  assert.equal(horizontals.length, 0, 'no horizontal tracks — that is 插件 too')

  // And the shipped markup must not carry the old coordinates.
  const markup = iconMarkup(16, 'medium')
  for (const banned of ['h5.9', 'M11.8', 'r="1.45"', '<circle']) {
    assert.ok(!markup.includes(banned), 'the old track geometry must be gone: ' + banned)
  }
})

test('the built artifact inlines the icon and carries no file path', function () {
  const artifact = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
  assert.ok(artifact.includes('data-cds-appearance-icon'), 'the marker attribute is in the artifact')
  assert.ok(artifact.includes('width: "10.8"'), 'the frame data is inlined')
  assert.ok(!artifact.includes('file://'), 'the icon is inline, not a file:// reference')
  assert.ok(!/[A-Za-z]:\\\\|\/Users\/|\/home\//.test(artifact), 'no absolute path in the artifact')
  assert.ok(!artifact.includes('assets/appearance-icon.svg'), 'the icon is not fetched by path')
  // The retired geometry must not survive in the bundle either.
  assert.ok(!artifact.includes('h5.9'), 'the banned slider tracks must not be bundled')
})

test('the standalone SVG asset matches the code that draws it', function () {
  const asset = readFileSync(new URL('../assets/appearance-icon.svg', import.meta.url), 'utf8').trim()
  assert.equal(asset, iconMarkup(16, 'medium'), 'the asset and the marker cannot drift')
})

// -------------------------------------------------------------- the lookup

test('findNavButton locates our entry by its label', function () {
  for (const label of LABELS) {
    const doc = fakeDocument()
    fakeNav(doc, { appearanceLabel: label })
    const button = findNavButton(doc, LABELS)
    assert.ok(button, 'expected to find the theme entry for ' + label)
    assert.equal(button.children[1].textContent, label)
  }
})

test('findNavButton ignores the other nav entries', function () {
  const doc = fakeDocument()
  const nav = fakeNav(doc)
  const button = findNavButton(doc, LABELS)
  for (const other of nav.buttons) {
    if (other === button) continue
    assert.ok(other.children.every(function (child) {
      return child !== button && child.getAttribute(ICON_ATTR) === null
    }), 'no other entry may be marked or re-iconed')
  }
})

test('findNavButton degrades when the nav is absent or unfamiliar', function () {
  assert.equal(findNavButton(null, LABELS), null)
  assert.equal(findNavButton({}, LABELS), null)
  const empty = fakeDocument()
  assert.equal(findNavButton(empty, LABELS), null, 'no settings dialog at all')
  // A dialog whose entries are not labelled ours.
  const other = fakeDocument()
  fakeNav(other, { appearanceLabel: 'Something else' })
  assert.equal(findNavButton(other, LABELS), null, 'an unknown label is left alone')
  // The host's own 外观 row inside General is not a nav entry and has no svg.
  const dialog = element('div', { 'data-shortcut-modal': 'settings' })
  const row = element('div')
  const span = element('span')
  span.textContent = '外观'
  row.appendChild(span)
  dialog.appendChild(row)
  other.body.appendChild(dialog)
  assert.equal(findNavButton(other, ['外观']), null, 'a label-only row is not a nav button')
})

test('the modal anchor is the published settings hook', function () {
  assert.equal(MODAL_ANCHOR, '[data-shortcut-modal="settings"]')
})

// ------------------------------------------------------------- the marker

test('markAppearanceNav inserts our svg before the host glyph and hides it', function () {
  const doc = fakeDocument()
  const nav = fakeNav(doc)
  const hostSvg = hostSvgOf(findNavButton(doc, LABELS))
  assert.ok(hostSvg)

  const result = markAppearanceNav(doc, LABELS, 'medium')
  assert.ok(result)
  assert.equal(result.created, true)
  assert.equal(result.button.children[0], result.icon, 'our icon takes the glyph slot')
  assert.equal(result.icon.tagName, 'SVG')
  assert.equal(result.icon.getAttribute(ICON_ATTR), '')
  assert.equal(result.icon.getAttribute('aria-hidden'), 'true', 'the label names the button')
  assert.equal(result.icon.getAttribute('width'), '16', 'size follows the host glyph')
  assert.equal(result.icon.getAttribute('stroke-width'), '1.3')
  assert.equal(result.button.getAttribute(NAV_ATTR), '', 'the button is marked')
  assert.equal(hostSvg.style.display, 'none', 'the host gear is hidden, not removed')
  assert.equal(result.button.children.indexOf(hostSvg), 1, 'the host svg is still in place')
  // The host button itself is untouched otherwise.
  assert.equal(result.button.children[1], hostSvg)
  assert.equal(result.button.children[2].tagName, 'SPAN')
  void nav
})

test('the marker is idempotent — a second sweep writes nothing', function () {
  const doc = fakeDocument()
  fakeNav(doc)
  const first = markAppearanceNav(doc, LABELS, 'medium')
  const again = markAppearanceNav(doc, LABELS, 'medium')
  assert.ok(again)
  assert.equal(again.created, false, 'no second icon')
  assert.equal(again.icon, first.icon, 'the same node is reused')
  assert.equal(first.button.children.filter(function (child) {
    return child.getAttribute(ICON_ATTR) !== null
  }).length, 1, 'exactly one icon in the button')
})

test('a language switch renames the label and the icon stays', function () {
  const doc = fakeDocument()
  const nav = fakeNav(doc, { appearanceLabel: zh['appearance.nav'] })
  const result = markAppearanceNav(doc, LABELS, 'medium')
  assert.ok(result)

  // The host re-renders the label span on a language switch; the button (and
  // therefore the mark) is unchanged.
  nav.buttons[2].children[2].textContent = en['appearance.nav']
  const after = findNavButton(doc, LABELS)
  assert.equal(after, result.button, 'the marked button is still ours')
  assert.equal(iconIn(after), result.icon)
})

test('a 20px host rung gets a 20px icon', function () {
  const doc = fakeDocument()
  const nav = fakeNav(doc)
  const host = hostSvgOf(nav.buttons[2])
  host.setAttribute('width', '20')
  host.setAttribute('height', '20')
  const result = markAppearanceNav(doc, LABELS, 'medium')
  assert.equal(result.icon.getAttribute('width'), '20')
  assert.equal(result.icon.getAttribute('height'), '20')
})

// ------------------------------------------------------------ lifecycle

test('dispose restores the host svg and removes every mark', function () {
  const doc = fakeDocument()
  const nav = fakeNav(doc)
  const hostSvg = hostSvgOf(nav.buttons[2])
  hostSvg.style.display = 'inline'   // a host that sets its own display

  const marker = createAppearanceIconMarker(doc, null)
  marker.start(function () { return LABELS })
  assert.equal(iconIn(nav.buttons[2]).getAttribute(ICON_ATTR), '')
  assert.equal(hostSvg.style.display, 'none')

  marker.stop()
  assert.equal(iconIn(nav.buttons[2]), null, 'our icon is gone')
  assert.equal(hostSvg.style.display, 'inline', 'the host display value is restored, not blanked')
  assert.equal(nav.buttons[2].getAttribute(NAV_ATTR), null, 'the mark is cleared')
  assert.equal(doc.body.querySelectorAll('[' + NAV_ATTR + ']').length, 0)
  assert.equal(doc.body.querySelectorAll('[' + ICON_ATTR + ']').length, 0)
})

test('the marker survives the dialog mounting after it starts', function () {
  const doc = fakeDocument()
  const observerCallbacks = []
  function Observer(callback) {
    observerCallbacks.push(callback)
    this.observe = function () {}
    this.disconnect = function () {}
  }
  const marker = createAppearanceIconMarker(doc, Observer)
  marker.start(function () { return LABELS })
  assert.equal(findNavButton(doc, LABELS), null, 'no nav yet')

  // The settings dialog opens later; its subtree addition schedules a sweep.
  const nav = fakeNav(doc)
  assert.equal(observerCallbacks.length, 1)
  observerCallbacks[0]([{ addedNodes: [nav.dialog] }])
  // The sweep is coalesced onto a frame; without a window it falls back to
  // setTimeout(0), so flush the macrotask queue.
  return new Promise(function (resolve) {
    setTimeout(function () {
      assert.ok(iconIn(nav.buttons[2]), 'the icon is inserted on the sweep')
      marker.stop()
      resolve()
    }, 5)
  })
})

test('a sweep with no matching nav does nothing', function () {
  const doc = fakeDocument()
  fakeNav(doc, { appearanceLabel: 'Unrelated page' })
  const marker = createAppearanceIconMarker(doc, null)
  marker.start(function () { return LABELS })
  assert.equal(doc.body.querySelectorAll('[' + ICON_ATTR + ']').length, 0)
  marker.stop()
})

test('start is inert without a document', function () {
  const marker = createAppearanceIconMarker(null, null)
  assert.doesNotThrow(function () { marker.start(function () { return LABELS }) })
  assert.doesNotThrow(function () { marker.stop() })
})

// ------------------------------------------------------------ icon builder

test('createIconNode falls back to 16px when the host glyph has no width', function () {
  const doc = fakeDocument()
  const node = createIconNode(doc, undefined, 'regular')
  assert.equal(node.getAttribute('width'), '16')
  assert.equal(node.getAttribute('stroke-width'), ICON_STROKE.regular)
  assert.equal(node.children.length, ICON_SHAPES.length)
  assert.equal(createIconNode(null, 16, 'medium'), null, 'a missing document yields null, never a throw')
})

test('the nav label used by the marker is the section label in both languages', function () {
  // The marker reads its labels through the lifecycle; this is the same pair the
  // lifecycle passes. It must be the DISAMBIGUATED word, or it would match the
  // host's own 外观/Appearance row.
  assert.deepEqual(LABELS.slice().sort(), ['Theme', '主题定制'].sort())
  assert.ok(LABELS.indexOf('外观') < 0, 'the old colliding word must never be matched')
})
