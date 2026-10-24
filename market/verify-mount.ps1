#!/usr/bin/env pwsh
<#
  Prove a plugin actually MOUNTS, not merely installs.

  WHY THIS IS SEPARATE FROM THE INSTALL MATRIX. The matrix checks that
  `cordis.patch.yml` exists and the name appears in `dsh.profile.bundles`. All of
  that can be true while the plugin never mounts — which is exactly what a stale
  patch `name` looks like from the outside: files present, bundles listed, and a
  row that silently never activates.

  WHAT DOES *NOT* WORK, measured so nobody repeats it:
    - `dsh --profile <p> --dump-config` only ECHOES the patch text. A patch naming
      a package that does not exist still dumps verbatim and exits 0. It proves
      composition order, not resolution.
    - Editing the plugin's `cordis.patch.yml` in the working tree changes nothing,
      because an npm install is a real copy under the profile's node_modules, not
      a symlink. The damage has to be made in the installed copy.

  SO THIS SCRIPT checks the one thing that decides mounting: whether the row's
  `name` resolves to an installed package. It reads the row from the INSTALLED
  patch, then asserts a directory exists at that name in the profile's
  node_modules. It reports the row id, the patch name, and the resolved path for
  each plugin, one at a time.

  Usage:
    pwsh market/verify-mount.ps1
    pwsh market/verify-mount.ps1 -Package dsh-cds-theme
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
  [string]$Package
)

$ErrorActionPreference = 'Continue'

# Derived, not typed out. This file used to carry its own array of six packages
# with a hand-written RowId each; a new plugin was skipped by whichever of the two
# arrays nobody edited, and the check still printed ALL N PLUGIN(S) MOUNT
# CORRECTLY. See market/packages.ps1.
. (Join-Path $PSScriptRoot 'packages.ps1')
$packages = @(Get-ReleasePackages -RepoRoot $RepoRoot | ForEach-Object {
  # RowId is the plugin's internal identity (patch `id`), read from its own patch
  # rather than guessed from the package name: `@hwfee/dsh-usage-stats` registers
  # the row id `dsh-usage-stats`, and the two must not be conflated.
  #
  # THE `- ` MATTERS. The patch row is `    - id: dsh-cds-theme`, so a pattern
  # anchored at `^\s*id:` matches nothing and yields an empty row id — silently,
  # because an empty string is still a string. Verified: an earlier version of
  # this derivation returned '' for all six packages.
  $patch = Join-Path $_.DirPath 'cordis.patch.yml'
  $rowId = if (Test-Path $patch) {
    [regex]::Match((Get-Content $patch -Raw), '(?m)^\s*-?\s*id:\s*[''"]?([^''"\r\n]+)[''"]?\s*$').Groups[1].Value.Trim()
  } else { '' }
  if (-not $rowId) {
    Write-Host "  FAIL  $($_.Name): cannot read the row id from $patch" -ForegroundColor Red
    $script:failures++
  }
  @{ Dir = $_.Dir; Name = $_.Name; RowId = $rowId; DirPath = $_.DirPath; Version = $_.Version }
})
if ($Package) { $packages = @($packages | Where-Object { $_.Name -eq $Package -or $_.RowId -eq $Package }) }

if ($packages.Count -eq 0) {
  Write-Host 'No package matched. Nothing was verified.' -ForegroundColor Red
  exit 1
}

$failures = 0

foreach ($p in $packages) {
  Write-Host "`n=== $($p.Name) ===" -ForegroundColor Cyan

  $slug = ($p.Name -replace '[@/]', '-')
  $profile = "_vm$slug"
  $dir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }

  # 1. install from npm, exactly the way a user would
  $install = & dsh plugin --profile $profile add "$($p.Name)@$($p.Version)" --registry=https://registry.npmjs.org 2>&1 | Out-String
  $installedLine = ($install -split "`r?`n" | Where-Object { $_ -match '^\s*\+ ' } | Select-Object -First 1)
  if (-not $installedLine) {
    Write-Host '  FAIL  install produced no package line' -ForegroundColor Red
    $err = ($install -split "`r?`n" | Where-Object { $_ -match 'error|ERR_' } | Select-Object -First 1)
    if ($err) { Write-Host "        $($err.Trim())" -ForegroundColor DarkGray }
    $failures++
    if (Test-Path $dir) { Remove-Item (Resolve-Path $dir).Path -Recurse -Force }
    continue
  }
  Write-Host "  ok    install$($installedLine)" -ForegroundColor Green

  # 2. the INSTALLED package directory. This is what the Loader will resolve.
  $pkgDir = Join-Path $dir "node_modules\$($p.Name)"
  if (-not (Test-Path $pkgDir)) {
    Write-Host "  FAIL  installed directory missing: $pkgDir" -ForegroundColor Red
    $failures++
    $resolved = (Resolve-Path $dir -ErrorAction SilentlyContinue).Path
    if ($resolved -and $resolved -like "*\.dsh\profiles\$profile") { Remove-Item $resolved -Recurse -Force }
    continue
  }
  Write-Host '  ok    installed directory' -ForegroundColor Green

  # 3. THE CHECK THAT DECIDES MOUNTING. Read the row name out of the installed
  #    patch and confirm it names a directory that exists. A row whose name has no
  #    package behind it cannot resolve, so the plugin never activates — and
  #    nothing is thrown or logged anywhere.
  $installedPatch = Join-Path $pkgDir 'cordis.patch.yml'
  if (-not (Test-Path $installedPatch)) {
    Write-Host '  FAIL  installed patch missing (cannot become a profile layer)' -ForegroundColor Red
    $failures++
  } else {
    $patchText = Get-Content $installedPatch -Raw
    # `-?` so both YAML spellings are read: the two-line form this repository
    # writes (`    - id: x` / `      name: y`) and the compact one (`    - name: y`).
    # Without it the compact form yields zero names, and the check then reports
    # "the patch inserts no named row" for a patch that is perfectly fine — a false
    # FAIL that would send the next person hunting the wrong problem.
    $rowNames = [regex]::Matches($patchText, '(?m)^\s*-?\s*name:\s*[''"]?([^''"\r\n]+)[''"]?\s*$') |
      ForEach-Object { $_.Groups[1].Value.Trim() }

    if ($rowNames.Count -eq 0) {
      Write-Host '  FAIL  the patch inserts no named row' -ForegroundColor Red
      $failures++
    }
    foreach ($rowName in $rowNames) {
      $target = Join-Path $dir "node_modules\$rowName"
      if (Test-Path $target) {
        Write-Host "  ok    row name resolves: $rowName" -ForegroundColor Green
      } else {
        Write-Host "  FAIL  row name '$rowName' has no package at $target" -ForegroundColor Red
        Write-Host '        The row will never activate and the plugin silently disappears.' -ForegroundColor DarkGray
        $failures++
      }
    }
  }

  # 4. the client half must register under the package name, or web boot dies with
  #    `duplicate factory registration` and the whole app refuses to start.
  $bundle = Join-Path $pkgDir 'client\client.js'
  if (Test-Path $bundle) {
    $text = Get-Content $bundle -Raw
    $m = [regex]::Match($text, '__ModuleLoader__\.load\(\{\s*id:\s*["'']([^"'']+)["'']')
    if ($m.Success -and $m.Groups[1].Value -eq $p.Name) {
      Write-Host "  ok    bundle id: $($m.Groups[1].Value)" -ForegroundColor Green
    } elseif ($m.Success) {
      Write-Host "  FAIL  bundle id is '$($m.Groups[1].Value)', expected '$($p.Name)'" -ForegroundColor Red
      Write-Host '        A mismatched id fails the entire web boot, not just this plugin.' -ForegroundColor DarkGray
      $failures++
    } else {
      Write-Host '  FAIL  no loader registration found in the bundle' -ForegroundColor Red
      $failures++
    }
  } else {
    Write-Host '  FAIL  client/client.js not installed' -ForegroundColor Red
    $failures++
  }

  # 5. the Host half must export apply, or Cordis refuses it and the row becomes a
  #    zombie entry with no fiber.
  $hostEntry = Join-Path $pkgDir 'lib\index.js'
  if (Test-Path $hostEntry) {
    $hostText = Get-Content $hostEntry -Raw
    $exportsApply = ($hostText -match 'export\s+(async\s+)?function\s+apply') -or
                    ($hostText -match 'export\s+const\s+apply') -or
                    ($hostText -match 'exports\.apply')
    if ($exportsApply) { Write-Host '  ok    Host half exports apply' -ForegroundColor Green }
    else {
      Write-Host '  FAIL  Host half exports no apply — Cordis rejects it and the row never mounts' -ForegroundColor Red
      $failures++
    }
  } else {
    Write-Host '  FAIL  lib/index.js not installed' -ForegroundColor Red
    $failures++
  }

  # 6. compose the profile. Kept as a smoke test that nothing throws; it does NOT
  #    prove resolution (see the header), so it is reported separately.
  $dump = & dsh --profile $profile --dump-config 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { Write-Host '  ok    profile composes (dump-config exit 0)' -ForegroundColor Green }
  else {
    Write-Host '  FAIL  profile failed to compose' -ForegroundColor Red
    ($dump -split "`r?`n" | Where-Object { $_ -match 'error|ERR_' } | Select-Object -First 3) |
      ForEach-Object { Write-Host "        $($_.Trim())" -ForegroundColor DarkGray }
    $failures++
  }

  # 7. teardown
  $resolvedDir = (Resolve-Path $dir -ErrorAction SilentlyContinue).Path
  if ($resolvedDir -and $resolvedDir -like "*\.dsh\profiles\$profile") {
    Remove-Item $resolvedDir -Recurse -Force
  }
}

Write-Host ''
if ($failures -eq 0) {
  Write-Host "ALL $($packages.Count) PLUGIN(S) MOUNT CORRECTLY" -ForegroundColor Green
  exit 0
}
Write-Host "$failures FAILED CHECK(S)" -ForegroundColor Red
exit 1
