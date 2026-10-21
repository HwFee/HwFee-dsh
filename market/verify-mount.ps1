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

$packages = @(
  @{ Dir = 'plugins/cds-theme';    Name = 'dsh-cds-theme';          RowId = 'dsh-cds-theme' }
  @{ Dir = 'plugins/genui';        Name = '@hwfee/dsh-genui';       RowId = 'dsh-genui' }
  @{ Dir = 'plugins/git-bash';     Name = '@hwfee/dsh-git-bash';    RowId = 'dsh-git-bash' }
  @{ Dir = 'plugins/predict';      Name = '@hwfee/dsh-predict';     RowId = 'dsh-predict' }
  @{ Dir = 'plugins/system-fonts'; Name = 'dsh-system-fonts';       RowId = 'dsh-system-fonts' }
  @{ Dir = 'plugins/usage-stats';  Name = '@hwfee/dsh-usage-stats'; RowId = 'dsh-usage-stats' }
)
if ($Package) { $packages = @($packages | Where-Object { $_.Name -eq $Package }) }

$failures = 0

foreach ($p in $packages) {
  Write-Host "`n=== $($p.Name) ===" -ForegroundColor Cyan

  $slug = ($p.Name -replace '[@/]', '-')
  $profile = "_vm$slug"
  $dir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }

  # 1. install from npm, exactly the way a user would
  $install = & dsh plugin --profile $profile add $p.Name 2>&1 | Out-String
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
    $rowNames = [regex]::Matches($patchText, '(?m)^\s*name:\s*[''"]?([^''"\r\n]+)[''"]?\s*$') |
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
