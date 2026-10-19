/**
 * Colour arithmetic for the theme.
 *
 * Small and dependency-free: the plugin ships a browser bundle with no
 * runtime dependencies, so a colour library is not an option. Everything here
 * works on sRGB, which is what the host's own tokens are authored in.
 */

/**
 * Parse a CSS colour into `{r,g,b,a}` (0–255, a 0–1).
 *
 * Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(...)`, `rgba(...)`,
 * `hsl(...)` and `hsla(...)`.
 *
 * `hsla` is not optional here. The host authors its whole border ladder as
 * `hsla(0, 0%, 8%, α)` and several of its own surfaces that way, and an earlier
 * version of this function returned null for those. The consequence was not a
 * crash but a silent blind spot: `contrast()` fell back to 0 for every pair
 * involving an alpha border, so a contrast audit could pass while the UI was
 * unreadable — and one real regression (a bubble fill read as 1.15:1) turned
 * out to be this parser failing, not the palette.
 */
export function parseColor(input) {
  const text = String(input == null ? '' : input).trim()
  if (text === '') return null

  const hex = /^#([0-9a-f]{3,8})$/i.exec(text)
  if (hex !== null) {
    const digits = hex[1]
    if (digits.length === 3 || digits.length === 4) {
      const r = parseInt(digits[0] + digits[0], 16)
      const g = parseInt(digits[1] + digits[1], 16)
      const b = parseInt(digits[2] + digits[2], 16)
      const a = digits.length === 4 ? parseInt(digits[3] + digits[3], 16) / 255 : 1
      return { r, g, b, a }
    }
    if (digits.length === 6 || digits.length === 8) {
      const r = parseInt(digits.slice(0, 2), 16)
      const g = parseInt(digits.slice(2, 4), 16)
      const b = parseInt(digits.slice(4, 6), 16)
      const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
      return { r, g, b, a }
    }
    return null
  }

  const fn = /^(rgba?|hsla?)\(([^)]+)\)$/i.exec(text)
  if (fn !== null) {
    const kind = fn[1].toLowerCase()
    const parts = fn[2].split(/[,/\s]+/).filter(function (piece) { return piece !== '' })
    if (parts.length < 3) return null
    const alpha = parts.length >= 4 ? clamp01(parseFloat(parts[3])) : 1

    if (kind === 'rgb' || kind === 'rgba') {
      const channel = function (piece) {
        const value = parseFloat(piece)
        if (!isFinite(value)) return 0
        return Math.min(255, Math.max(0, value))
      }
      return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: isFinite(alpha) ? alpha : 1 }
    }

    // hsl / hsla: hue in degrees (unit suffixes tolerated), s and l in percent
    // (a bare 0–1 fraction is accepted too, which is how some tools emit them).
    const hue = ((parseFloat(parts[0]) % 360) + 360) % 360
    const sat = percent(parts[1])
    const light = percent(parts[2])
    if (!isFinite(hue) || sat === null || light === null) return null
    const rgb = hslToRgb(hue, sat, light)
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: isFinite(alpha) ? alpha : 1 }
  }

  return null
}

function clamp01(value) {
  if (!isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

/** `50%` -> 0.5, `0.5` -> 0.5, garbage -> null. */
function percent(piece) {
  const text = String(piece == null ? '' : piece).trim()
  const isPct = text.endsWith('%')
  const value = parseFloat(text)
  if (!isFinite(value)) return null
  const ratio = isPct || value > 1 ? value / 100 : value
  return Math.min(1, Math.max(0, ratio))
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rgb
  if (hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const m = l - c / 2
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  }
}

/** `{r,g,b,a}` -> CSS string, `rgba()` when translucent and `#rrggbb` otherwise. */
export function formatColor(color) {
  const r = Math.round(Math.min(255, Math.max(0, color.r)))
  const g = Math.round(Math.min(255, Math.max(0, color.g)))
  const b = Math.round(Math.min(255, Math.max(0, color.b)))
  const a = color.a === undefined ? 1 : Math.min(1, Math.max(0, color.a))
  if (a >= 1) {
    return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0') }).join('')
  }
  // Three decimals keeps the value short and is well inside 8-bit rounding.
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + (Math.round(a * 1000) / 1000) + ')'
}

/**
 * Linear interpolation in sRGB between two colours, `t = 0` giving `from`.
 *
 * Alpha interpolates too, so mixing an opaque colour with a translucent one
 * behaves predictably.
 */
export function mixColor(from, to, t) {
  const a = parseColor(from)
  const b = parseColor(to)
  if (a === null) return String(to)
  if (b === null) return String(from)
  const k = Math.min(1, Math.max(0, t))
  return formatColor({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
    a: a.a + (b.a - a.a) * k,
  })
}

/**
 * Resolve a `{ cds, host }` surface pair against the warmth setting.
 *
 * The knob is a percentage 0–100: 0 reproduces the host's stock surface, 100 is
 * the CDS value, and anything between interpolates in sRGB. It defaults to 100
 * — this is a CDS theme, the design system is the point — but the knob lets
 * someone pull the palette back toward the stock look without uninstalling.
 *
 * Interpolating rather than switching keeps the setting continuous, so
 * dragging the slider reads as one surface cooling down instead of two
 * palettes cross-fading.
 */
export function resolveSurface(pair, warmth) {
  if (pair === null || pair === undefined) return ''
  if (typeof pair === 'string') return pair
  const t = Math.min(100, Math.max(0, Number(warmth))) / 100
  if (t >= 1) return pair.cds
  if (t <= 0) return pair.host
  return mixColor(pair.host, pair.cds, t)
}

/**
 * Relative luminance per WCAG 2.1.
 *
 * Fully transparent fractions would make the ratio meaningless, so a colour
 * with alpha < 1 is composited onto `backdrop` first when one is supplied. Pass
 * the page canvas as the backdrop when auditing a translucent fill: a 5% ink
 * wash has no contrast of its own, only a contrast over whatever it sits on.
 */
export function luminance(color, backdrop) {
  let c = typeof color === 'string' ? parseColor(color) : color
  if (c === null) return 0
  if (c.a < 1 && backdrop !== undefined) c = composite(c, backdrop)
  const channel = function (v) {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

/** Composite a translucent colour over an opaque backdrop, returning opaque sRGB. */
export function composite(color, backdrop) {
  const fg = typeof color === 'string' ? parseColor(color) : color
  const bg = typeof backdrop === 'string' ? parseColor(backdrop) : backdrop
  if (fg === null) return null
  if (bg === null) return { r: fg.r, g: fg.g, b: fg.b, a: 1 }
  const a = fg.a === undefined ? 1 : fg.a
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  }
}

/**
 * WCAG contrast ratio between two colours; 1–21.
 *
 * When either colour is translucent it is composited onto `backdrop` (the page
 * canvas by default is NOT assumed — pass it explicitly, because a border is
 * measured against the surface it sits on, not against white).
 */
export function contrast(a, b, backdrop) {
  const la = luminance(a, backdrop)
  const lb = luminance(b, backdrop)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}
