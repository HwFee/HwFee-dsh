import { FONTS_API, FONTS_MARKER_HEADER, FONTS_MARKER_VALUE } from './constants.js'

// ------------------------------------------------------- the font list

export function createCatalogue(fetchImpl) {
  const callFetch = fetchImpl || function () { return fetch.apply(null, arguments) }

  let fontList = { status: 'idle', families: [], sources: [], error: null, supported: true }
  const listeners = []
  let active = false
  let generation = 0

  function setFontList(next) {
    fontList = next
    for (let i = 0; i < listeners.length; i += 1) {
      try { listeners[i](fontList) } catch (error) { /* as above */ }
    }
  }

  function fetchFonts(refresh) {
    if (!active) return Promise.resolve()
    const gen = ++generation
    setFontList(Object.assign({}, fontList, { status: 'loading' }))
    const url = FONTS_API + (refresh ? '?refresh=1' : '')
    // The marker is the route's only access control (see constants.js); the
    // host answers 403 without it, before it considers `?refresh=1`.
    const headers = { [FONTS_MARKER_HEADER]: FONTS_MARKER_VALUE }
    return callFetch(url, { credentials: 'same-origin', headers })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status)
        return response.json()
      })
      .then(function (body) {
        if (gen !== generation) return
        setFontList({
          status: 'ready',
          families: Array.isArray(body && body.families) ? body.families : [],
          sources: Array.isArray(body && body.sources) ? body.sources : [],
          supported: body && body.supported !== false,
          error: null,
        })
      })
      .catch(function (error) {
        if (gen !== generation) return
        setFontList({
          status: 'error',
          families: [],
          sources: [],
          supported: false,
          error: error && error.message ? error.message : String(error),
        })
      })
  }

  function isKnownFamily(family) {
    if (!family) return true
    const needle = family.toLowerCase()
    for (let i = 0; i < fontList.families.length; i += 1) {
      if (fontList.families[i].family.toLowerCase() === needle) return true
    }
    return false
  }

  function resetLoading() {
    if (fontList.status === 'loading') {
      setFontList({ status: 'idle', families: [], sources: [], error: null, supported: true })
    }
  }

  return {
    get list() { return fontList },
    subscribe(listener) {
      listeners.push(listener)
      return function unsubscribe() {
        const i = listeners.indexOf(listener)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
    listenerCount() { return listeners.length },
    fetchFonts,
    isKnownFamily,
    activate() { active = true; resetLoading() },
    dispose() { active = false; generation += 1; resetLoading() },
  }
}
