/** Apply the same token namespaces that the host snapshot exports. */
export function createFrameThemeApplier(doc) {
  let applied = new Set()
  return function applyTheme(snapshot) {
    const root = doc.documentElement, next = new Set()
    for (const [name, value] of Object.entries(snapshot?.vars ?? {})) {
      if (!/^--(dsw|dsh|ds|viz)-[a-z0-9-]+$/.test(name)) continue
      if (typeof value !== 'string' || value.length > 200) continue
      root.style.setProperty(name, value)
      next.add(name)
    }
    for (const name of applied) if (!next.has(name)) root.style.removeProperty(name)
    applied = next
    const base = snapshot?.base ?? {}
    for (const prop of ['font-family', 'font-size', 'line-height', 'letter-spacing']) {
      const value = base[prop]
      if (typeof value === 'string' && value.length <= 200) doc.body.style.setProperty(prop, value)
      else doc.body.style.removeProperty(prop)
    }
    if (snapshot?.dark === true) root.setAttribute('data-ds-dark-theme', '')
    else root.removeAttribute('data-ds-dark-theme')
    root.style.colorScheme = snapshot?.dark === true ? 'dark' : 'light'
  }
}
