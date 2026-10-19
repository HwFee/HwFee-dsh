import { STORAGE_KEY, DEFAULT_STATE, sanitize } from './constants.js'

export function createSettingsStore(storage) {
  function loadState() {
    try {
      const raw = storage ? storage.getItem(STORAGE_KEY) : null
      if (!raw) return Object.assign({}, DEFAULT_STATE)
      return sanitize(JSON.parse(raw))
    } catch (error) {
      return Object.assign({}, DEFAULT_STATE)
    }
  }

  function saveState(next) {
    try {
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.warn('dsh-cds-theme: could not persist settings', error)
    }
  }

  let state = loadState()
  const listeners = []

  const store = {
    onChange: null,

    loadState,
    getState() { return state },

    setState(patch) {
      state = sanitize(Object.assign({}, state, patch))
      saveState(state)
      for (let i = 0; i < listeners.length; i += 1) {
        try { listeners[i](state) } catch (error) { /* one throwing panel must not stop the others */ }
      }
      if (typeof store.onChange === 'function') store.onChange(state)
    },

    subscribe(listener) {
      listeners.push(listener)
      return function unsubscribe() {
        const i = listeners.indexOf(listener)
        if (i >= 0) listeners.splice(i, 1)
      }
    },

    listenerCount() { return listeners.length },
  }
  return store
}
