/**
 * Per-file font metadata through WPF `GlyphTypeface`.
 *
 * For every file the Fonts registry keys point at, the script constructs a
 * `GlyphTypeface` and reads `Win32FamilyNames` (the family aliases the face
 * itself declares - e.g. a face can declare both an English name and a
 * localized name), the OpenType weight and the style. Where the registry
 * display-name parse can only guess, this reads what the face itself claims.
 *
 * Output is JSON written under an explicit UTF-8 console encoding.
 *
 * `run` is an execFile-style runner `(file, args, options) => {stdout}`; the
 * caller supplies `execFileBuffer` so this module stays process-free and the
 * reader is fully testable. Any failure - no PowerShell, missing WPF, empty or
 * malformed output - resolves to [].
 */

/**
 * Registry font-file values are DATA, not paths this process may trust.
 *
 * HKCU's Fonts key is writable by any process running as the user, and the
 * value reaches `Test-Path` and `New-Object System.Uri`/`GlyphTypeface`. A
 * planted value can therefore
 *
 *   - name a UNC path (`\\attacker\share\x.ttf`): `Test-Path` opens an SMB
 *     connection and offers the user's NTLM credentials to that host, and
 *     `GlyphTypeface` then fetches over it — outbound traffic and an
 *     authentication leak chosen by whoever wrote the value;
 *   - name the device namespace (`\\?\C:\…`, `\\.\…`), which bypasses path
 *     normalisation; or
 *   - climb out of the Fonts directory (`..\..\…`), which reads an arbitrary
 *     local file as if it were a font.
 *
 * `Test-FontPathCandidate` admits exactly the two shapes a real entry has: an
 * absolute path on a local drive, or a bare file name. It runs BEFORE any
 * `Test-Path`. It is exported so the tests can drive the same function the
 * script uses instead of a copy of its rules.
 */
export const FONT_PATH_GUARD_SCRIPT = String.raw`
function Test-FontPathCandidate {
  param([string] $value)
  if ($value -match '^[\\/]') { return $false }
  if ($value -match '(^|[\\/])\.\.([\\/]|$)') { return $false }
  if ($value -match '^[A-Za-z]:') { return ($value -match '^[A-Za-z]:[\\/]') }
  if ($value -match '[\\/:]') { return $false }
  return $true
}
`

const METADATA_SCRIPT = String.raw`
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName PresentationCore
${FONT_PATH_GUARD_SCRIPT}
$keys = @(
  'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts',
  'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
)
$paths = @{}
foreach ($key in $keys) {
  try { $props = Get-ItemProperty -LiteralPath $key } catch { continue }
  foreach ($p in $props.PSObject.Properties) {
    if ($p.Name -eq 'PSPath' -or $p.Name -eq 'PSParentPath' -or
        $p.Name -eq 'PSChildName' -or $p.Name -eq 'PSDrive' -or
        $p.Name -eq 'PSProvider') { continue }
    $value = $p.Value
    if ($value -isnot [string] -or $value -eq '') { continue }
    $value = $value.Trim()
    if (-not (Test-FontPathCandidate $value)) { continue }
    $full = $null
    if ([System.IO.Path]::IsPathRooted($value)) {
      if (Test-Path -LiteralPath $value) { $full = $value }
    } else {
      $machine = Join-Path $env:WINDIR ('Fonts\' + $value)
      $user = Join-Path $env:LOCALAPPDATA ('Microsoft\Windows\Fonts\' + $value)
      if (Test-Path -LiteralPath $machine) { $full = $machine }
      elseif (Test-Path -LiteralPath $user) { $full = $user }
    }
    if ($full -ne $null) { $paths[$full.ToLowerInvariant()] = $full }
  }
}
$records = foreach ($file in $paths.Values) {
  try {
    $face = New-Object System.Windows.Media.GlyphTypeface (New-Object System.Uri $file)
    $names = @($face.Win32FamilyNames.Values | Sort-Object -Unique)
    if ($names.Count -eq 0) { continue }
    [pscustomobject]@{
      families = $names
      weight = $face.Weight.ToOpenTypeWeight()
      italic = ($face.Style -ne [System.Windows.FontStyles]::Normal)
      file = $file
    }
  } catch { }
}
if ($records -eq $null) { $records = @() }
$records | ConvertTo-Json -Compress -Depth 4
`

/** The script the reader runs, exported for the guard test. */
export const METADATA_SCRIPT_SOURCE = METADATA_SCRIPT

function clean(record) {
  if (record === null || typeof record !== 'object' || !Array.isArray(record.families)) return null
  const weight = Number(record.weight)
  if (!Number.isInteger(weight) || weight < 1 || weight > 1000) return null
  const seen = new Set()
  const families = []
  for (const name of record.families) {
    if (typeof name !== 'string' || name.trim() === '') continue
    const trimmed = name.trim()
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    families.push(trimmed)
  }
  if (families.length === 0) return null
  return { families, weight, italic: record.italic === true, file: typeof record.file === 'string' ? record.file : '' }
}

/** Read per-file face records; [] on any failure or malformed output. */
export async function readFontMetadata(run) {
  if (typeof run !== 'function') return []
  let stdout = null
  try {
    const result = await run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      METADATA_SCRIPT,
    ])
    stdout = result ? result.stdout : null
  } catch (error) {
    return []
  }
  if (stdout === null || stdout === undefined) return []
  let parsed = null
  try {
    parsed = JSON.parse(Buffer.isBuffer(stdout) || typeof stdout === 'string'
      ? stdout.toString('utf8').replace(/^\uFEFF/, '').trim()
      : '')
  } catch (error) {
    return []
  }
  if (parsed === null) return []
  const records = (Array.isArray(parsed) ? parsed : [parsed])
    .map(clean)
    .filter((r) => r !== null)
  return records
}
