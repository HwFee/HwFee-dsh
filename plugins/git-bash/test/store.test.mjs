/**
 * The settings row's state.
 *
 * The store shapes are load-bearing: a plain function component reads PROPS and
 * subscribes with `useSyncExternalStore`, so every store here must expose exactly
 * `{ getSnapshot, subscribe }` and nothing else is assumed.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  MODE_KEY, SHELL_GLOBAL, createModeStore, createShellInfoStore, describeShell,
} = await import('../client/src/store.js')
const { LEGACY_BOOLEAN_KEY } = await import('../lib/mode.js')

function fakeStorage(initial = {}) {
  const data = { ...initial }
  return { getItem: (k) => (Object.hasOwn(data, k) ? data[k] : null), setItem: (k, v) => { data[k] = v }, data }
}

test('the shell store reads the host-published global', function () {
  const store = createShellInfoStore({
    [SHELL_GLOBAL]: { active: { path: 'C:/Program Files/Git/bin/bash.exe', kind: 'gitbash', source: 'git --exec-path (auto)', reason: null } },
  })
  assert.deepEqual(store.getSnapshot(), {
    path: 'C:/Program Files/Git/bin/bash.exe',
    kind: 'gitbash',
    source: 'git --exec-path (auto)',
    reason: null,
  })
})

test('an absent or malformed global reads as not found, not as a crash', function () {
  // The page may be served before resolution finished, or by an older build.
  for (const carrier of [undefined, {}, { [SHELL_GLOBAL]: null }, { [SHELL_GLOBAL]: { active: { path: 42 } } }]) {
    const snapshot = createShellInfoStore(carrier).getSnapshot()
    assert.equal(snapshot.path, null)
    assert.equal(snapshot.kind, null)
  }
})

test('a failure reason survives the store', function () {
  // The row's only way to say WHY nothing runs.
  const store = createShellInfoStore({
    [SHELL_GLOBAL]: { active: { path: null, kind: null, source: null, reason: 'gitbash-not-found' } },
  })
  assert.equal(store.getSnapshot().reason, 'gitbash-not-found')
})

test('the shell store is read-only: subscribing returns a working no-op', function () {
  const store = createShellInfoStore({ [SHELL_GLOBAL]: { active: { path: '/usr/bin/bash', kind: 'posix-bash' } } })
  const unsubscribe = store.subscribe(() => {})
  assert.equal(typeof unsubscribe, 'function')
  unsubscribe()
  store.dispose()
})

test('the mode store starts at auto and persists a change', function () {
  const storage = fakeStorage()
  const store = createModeStore(storage)
  assert.equal(store.getSnapshot(), 'auto')
  store.set('gitbash')
  assert.equal(store.getSnapshot(), 'gitbash')
  assert.equal(storage.data[MODE_KEY], 'gitbash')
})

test('the mode store notifies subscribers, and only on a real change', function () {
  const store = createModeStore(fakeStorage())
  const seen = []
  store.subscribe(() => seen.push(store.getSnapshot()))
  store.set('auto')       // already auto
  store.set('pwsh')
  store.set('pwsh')       // repeated
  store.set('gitbash')
  assert.deepEqual(seen, ['pwsh', 'gitbash'])
})

test('an invalid mode is ignored without notifying', function () {
  const store = createModeStore(fakeStorage())
  let count = 0
  store.subscribe(() => { count += 1 })
  store.set('fish')
  assert.equal(count, 0)
  assert.equal(store.getSnapshot(), 'auto')
})

test('a storage that throws still lets the mode change for this session', function () {
  // Private mode: the user just clicked the menu and expects to SEE the change.
  const hostile = { getItem: () => null, setItem() { throw new Error('QuotaExceeded') } }
  const store = createModeStore(hostile)
  store.set('gitbash')
  assert.equal(store.getSnapshot(), 'gitbash')
})

test('dispose stops notifications', function () {
  const store = createModeStore(fakeStorage())
  let count = 0
  store.subscribe(() => { count += 1 })
  store.dispose()
  store.set('pwsh')
  assert.equal(count, 0)
})

test('describeShell names the resolved shell and its family', function () {
  const t = (key, params) => key + ':' + (params === undefined ? '' : JSON.stringify(params))
  const text = describeShell(
    { path: 'C:/Git/bin/bash.exe', kind: 'gitbash', reason: null },
    t,
  )
  assert.match(text, /shell\.current/)
  assert.match(text, /C:\/Git\/bin\/bash\.exe/)
  assert.match(text, /shell\.kind\.gitbash:/,
    'the family is localized too, or the row reads "Windows PowerShell 5.1" as a raw kind')
})

test('describeShell distinguishes the two PowerShells', function () {
  // `pwsh` is ONE mode but TWO families. If the row folded them together, a user
  // reading "Windows PowerShell" would not know whether 5.1 or 7 ran their command.
  // The family travels as a `{kind}` param, so the stub must expand params.
  const t = (key, params) => key + (params === undefined ? '' : ' ' + Object.values(params).join(' '))
  const seven = describeShell({ path: 'P/pwsh.exe', kind: 'pwsh', reason: null }, t)
  const five = describeShell({ path: 'P/powershell.exe', kind: 'windows-powershell', reason: null }, t)
  assert.match(seven, /shell\.kind\.pwsh/)
  assert.match(five, /shell\.kind\.windows-powershell/)
  assert.notEqual(seven, five)
})

test('describeShell explains a failure instead of showing nothing', function () {
  const t = (key) => key
  assert.equal(describeShell({ path: null, kind: null, reason: 'gitbash-not-found' }, t),
    'shell.reason.gitbash-not-found')
  assert.equal(describeShell({ path: null, kind: null, reason: null }, t), 'shell.notFound')
  // An unknown reason must not leak a raw code into the row.
  assert.equal(describeShell({ path: null, kind: null, reason: 'something-new' }, t), 'shell.notFound')
})

test('the legacy boolean preference is migrated, and only once', function () {
  // `exposeNativeShell: 'false'` meant "Git Bash is the only way commands run",
  // which is the `gitbash` mode. Reading it as a mode directly would be wrong
  // (`'false'` is not a mode); reading it as "on" would silently drop the choice.
  const storage = fakeStorage({ [LEGACY_BOOLEAN_KEY]: 'false' })
  const store = createModeStore(storage)
  assert.equal(store.getSnapshot(), 'gitbash')
  assert.equal(storage.data[MODE_KEY], 'gitbash', 'the migration is persisted, not just applied')
})

test('the legacy value "true" leaves the user on auto, which behaves the same', function () {
  // The old default. Nothing was expressed about the shell, and `auto` prefers
  // Git Bash anyway, so the observable behaviour is unchanged.
  const storage = fakeStorage({ [LEGACY_BOOLEAN_KEY]: 'true' })
  assert.equal(createModeStore(storage).getSnapshot(), 'auto')
})

test('a stored mode always beats the legacy migration', function () {
  // Otherwise a user who picked `pwsh` after upgrading would be flipped back to
  // `gitbash` on the next launch by a key they last touched months ago.
  const storage = fakeStorage({ [LEGACY_BOOLEAN_KEY]: 'false', [MODE_KEY]: 'pwsh' })
  assert.equal(createModeStore(storage).getSnapshot(), 'pwsh')
})

test('a hostile legacy read leaves the mode at the default', function () {
  const hostile = { getItem() { throw new Error('SecurityError') }, setItem() { throw new Error('SecurityError') } }
  assert.equal(createModeStore(hostile).getSnapshot(), 'auto')
})

test('forMode returns a STABLE reference per mode', function () {
  // THE CRASH THIS PINS. `forMode` used to build a fresh object on every call.
  // That object is what `useSyncExternalStore` compares for change detection, so
  // a new identity on every render reads as "the store changed" and React
  // re-renders forever — error #185, maximum update depth — which took down the
  // whole settings slot with "slot entry crashed in 'settings.general.item'".
  //
  // A stable reference is the contract, not an optimization.
  const store = createShellInfoStore({
    [SHELL_GLOBAL]: {
      active: { path: 'C:/Git/bin/bash.exe', kind: 'gitbash' },
      byMode: {
        auto: { path: 'C:/Git/bin/bash.exe', kind: 'gitbash' },
        pwsh: { path: 'C:/pwsh.exe', kind: 'pwsh' },
      },
    },
  })
  assert.equal(store.forMode('auto'), store.forMode('auto'), 'same mode, same object')
  assert.equal(store.forMode('pwsh'), store.forMode('pwsh'))
  assert.notEqual(store.forMode('auto'), store.forMode('pwsh'), 'different modes differ')
  // An unknown mode falls back to the same stable record as the active one.
  assert.equal(store.forMode('fish'), store.forMode('nope'))
})

test('getSnapshot is stable too, for the same reason', function () {
  const store = createShellInfoStore({ [SHELL_GLOBAL]: { active: { path: '/usr/bin/bash', kind: 'posix-bash' } } })
  assert.equal(store.getSnapshot(), store.getSnapshot())
})
