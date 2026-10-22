#!/usr/bin/env pwsh
<#
  Prove the mount criteria CATCH a bad install, without installing anything.

  WHY THIS EXISTS. `verify-mount.ps1` decides one thing: does the row in an
  installed `cordis.patch.yml` name a package that exists in the profile's
  `node_modules`? A check that has never failed is not a check. The full evidence
  for that is `prove-mount-guard.ps1`, but it needs a real `dsh plugin add` and a
  real registry, so it can only run after a publish.

  This script does the other half locally and cheaply: it builds throwaway profile
  directories that LOOK like installs, then asserts that the criteria used by
  `verify-mount.ps1` classify each one correctly — good resolves, and each known
  way of being broken is reported as broken.

  WHAT IT DOES NOT DO. It does not install, does not contact the registry, and does
  not produce install-matrix results. A pass here means the JUDGEMENT is right; it
  says nothing about whether a package can be installed. The matrix remains the only
  evidence for that, and this script never writes or claims a matrix.

  Every case below is a real failure mode recorded in this repository:
    - the row `name` not matching the package name (usage-stats after the rename:
      row never activated, plugin silently disappeared);
    - the bundle registering a stale id (whole web boot died on
      `duplicate factory registration`);
    - the Host half exporting `name` without `apply` (Cordis rejects it, zombie row);
    - a patch present but the package absent (half-install: pnpm succeeded, nothing
      mounted);
    - an empty patch (nothing named to resolve).

  Usage:
    pwsh market/test-mount-criteria.ps1
#>
param(
  [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'packages.ps1')

$script:failures = 0
$script:cases = 0

function Check([string]$label, [bool]$ok, [string]$detail) {
  $script:cases++
  if ($ok) {
    Write-Host ("  ok    {0}" -f $label) -ForegroundColor Green
  } else {
    Write-Host ("  FAIL  {0}" -f $label) -ForegroundColor Red
    if ($detail) { Write-Host ("        {0}" -f $detail) -ForegroundColor DarkGray }
    $script:failures++
  }
}

<#
  THE CRITERIA, copied from verify-mount.ps1 in behaviour and asserted here so the
  two cannot drift apart silently. The regex constants below are compared against
  the literal text inside verify-mount.ps1 by case (h) — if someone edits one side,
  that case fails instead of the two quietly disagreeing.
#>
$ROW_NAME_PATTERN = '(?m)^\s*-?\s*name:\s*[''"]?([^''"\r\n]+)[''"]?\s*$'
$BUNDLE_ID_PATTERN = '__ModuleLoader__\.load\(\{\s*id:\s*["'']([^"'']+)["'']'

function Get-RowNames([string]$patchText) {
  [regex]::Matches($patchText, $ROW_NAME_PATTERN) |
    ForEach-Object { $_.Groups[1].Value.Trim() }
}

function Test-RowResolves([string]$patchText, [string]$profileDir) {
  $names = @(Get-RowNames $patchText)
  if ($names.Count -eq 0) { return $false }
  foreach ($n in $names) {
    if (-not (Test-Path (Join-Path $profileDir "node_modules\$n"))) { return $false }
  }
  return $true
}

function Test-BundleId([string]$bundleText, [string]$packageName) {
  $m = [regex]::Match($bundleText, $BUNDLE_ID_PATTERN)
  if (-not $m.Success) { return $false }
  return $m.Groups[1].Value -eq $packageName
}

function Test-HostExportsApply([string]$hostText) {
  ($hostText -match 'export\s+(async\s+)?function\s+apply') -or
  ($hostText -match 'export\s+const\s+apply') -or
  ($hostText -match 'exports\.apply')
}

# ------------------------------------------------------- 1. real packages, good

Write-Host "`n=== 1. The real packages, as they are on disk ===" -ForegroundColor Cyan
$packages = @(Get-ReleasePackages -RepoRoot $RepoRoot)
Check 'derived package list is non-empty' ($packages.Count -gt 0) "count=$($packages.Count)"

$good = @()
foreach ($p in $packages) {
  $patchPath = Join-Path $p.DirPath 'cordis.patch.yml'
  if (-not (Test-Path $patchPath)) {
    Check "$($p.Slug): patch exists" $false $patchPath
    continue
  }
  $patchText = Get-Content $patchPath -Raw
  $names = @(Get-RowNames $patchText)

  $namesOk = $names.Count -eq 1 -and $names[0] -eq $p.Name
  Check "$($p.Slug): row name equals the package name" $namesOk "row='$($names -join ',')' expected='$($p.Name)'"

  # Assert the row id is its own identity, NOT the package name for scoped packages.
  $rowId = [regex]::Match($patchText, '(?m)^\s*-?\s*id:\s*[''"]?([^''"\r\n]+)').Groups[1].Value.Trim()
  Check "$($p.Slug): row id is readable" ($rowId -ne '') "id='$rowId'"

  $bundlePath = Join-Path $p.DirPath 'client/client.js'
  if (Test-Path $bundlePath) {
    $bundleOk = Test-BundleId (Get-Content $bundlePath -Raw) $p.Name
    Check "$($p.Slug): bundle id equals the package name" $bundleOk $p.Name
  } else {
    Check "$($p.Slug): bundle exists" $false $bundlePath
  }

  $hostPath = Join-Path $p.DirPath 'lib/index.js'
  if (Test-Path $hostPath) {
    $hostOk = Test-HostExportsApply (Get-Content $hostPath -Raw)
    Check "$($p.Slug): Host exports apply" $hostOk
  } else {
    Check "$($p.Slug): lib/index.js exists" $false $hostPath
  }

  $good += $p
}

# --------------------------------------------- 2. broken variants must be caught

Write-Host "`n=== 2. Broken installs must be reported as broken ===" -ForegroundColor Cyan
$work = Join-Path $env:TEMP ("mount-criteria-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null

try {
  # A package to model: the scoped one whose row id differs from its package name --
  # that is the case that actually broke once after a rename.
  $model = $good | Where-Object { $_.Name -like '@*' } | Select-Object -First 1
  if (-not $model) { $model = $good[0] }

  $profile = Join-Path $work 'profile'
  $pkgDir = Join-Path $profile "node_modules\$($model.Name)"
  New-Item -ItemType Directory -Force $pkgDir | Out-Null
  Copy-Item (Join-Path $model.DirPath 'client/cordis.patch.yml') (Join-Path $pkgDir 'cordis.patch.yml') -ErrorAction SilentlyContinue
  if (-not (Test-Path (Join-Path $pkgDir 'cordis.patch.yml'))) {
    Copy-Item (Join-Path $model.DirPath 'cordis.patch.yml') (Join-Path $pkgDir 'cordis.patch.yml')
  }
  $goodPatch = Get-Content (Join-Path $pkgDir 'cordis.patch.yml') -Raw

  Check 'baseline: the good patch resolves' (Test-RowResolves $goodPatch $profile)

  # (a) row name points at a package that is not installed
  $badName = $goodPatch -replace [regex]::Escape($model.Name), 'dsh-gone-package'
  Check 'a row naming an uninstalled package is NOT resolved' (-not (Test-RowResolves $badName $profile)) `
    'this is the silent half-install: patch present, package absent'
  Check 'the bad patch really differs from the good one' ($badName -ne $goodPatch)

  # (b) empty patch: nothing named to resolve
  Check 'an empty patch is NOT resolved' (-not (Test-RowResolves "# nothing here`n" $profile))

  # (c) patch with a name but no id line must still resolve by name
  $nameOnly = "- insert:`n    - name: '$($model.Name)'`n"
  Check 'a patch with only a name still resolves' (Test-RowResolves $nameOnly $profile)

  # (d) bundle id mismatch: the web-boot killer
  $bundleGood = '__ModuleLoader__.load({ id: "' + $model.Name + '", factory: function () {} })'
  $bundleBad = '__ModuleLoader__.load({ id: "dsh-old-name", factory: function () {} })'
  Check 'a matching bundle id passes' (Test-BundleId $bundleGood $model.Name)
  Check 'a stale bundle id FAILS' (-not (Test-BundleId $bundleBad $model.Name)) `
    'a mismatched id takes down the whole web boot, not just this plugin'
  Check 'a bundle with no loader call FAILS' (-not (Test-BundleId 'console.log(1)' $model.Name))

  # (e) Host half: name without apply
  Check 'Host exporting apply passes' (Test-HostExportsApply 'export function apply (ctx) {}')
  Check 'Host exporting async apply passes' (Test-HostExportsApply 'export async function apply (ctx) {}')
  Check 'Host exporting const apply passes' (Test-HostExportsApply 'export const apply = (ctx) => {}')
  Check 'Host with name but NO apply FAILS' (-not (Test-HostExportsApply 'export const name = "x"')) `
    'Cordis rejects it and the row becomes a zombie with no fiber'

  # (f) a row id must not be mistaken for a package name
  $scoped = $good | Where-Object { $_.Name -like '@*' } | Select-Object -First 1
  if ($scoped) {
    $rowId = [regex]::Match((Get-Content (Join-Path $scoped.DirPath 'cordis.patch.yml') -Raw),
      '(?m)^\s*-?\s*id:\s*[''"]?([^''"\r\n]+)').Groups[1].Value.Trim()
    Check "$($scoped.Slug): row id differs from the package name" ($rowId -ne $scoped.Name) `
      "id='$rowId' package='$($scoped.Name)' — conflating them is what broke the rename"
  }

  # (g) a profile where the package sits at the wrong path (scoped package dropped
  #     into node_modules root instead of node_modules/@scope/)
  $wrongProfile = Join-Path $work 'wrong'
  $flat = Join-Path $wrongProfile "node_modules\$($model.Name -replace '^@[^/]+/', '')"
  New-Item -ItemType Directory -Force $flat | Out-Null
  Check 'a scoped package outside node_modules/<scope>/ does NOT resolve' `
    (-not (Test-RowResolves $goodPatch $wrongProfile)) `
    'npm/pnpm requires the scope directory'

  # (h) NO DRIFT. The patterns used above must be the ones verify-mount.ps1 actually
  #     runs. Without this, the self-test can pass while the real checker disagrees —
  #     which is worse than having no self-test, because it manufactures confidence.
  #
  #     The comparison unescapes PowerShell's doubled single quotes first: the pattern
  #     lives inside a single-quoted PS string, where `''` is one apostrophe. Comparing
  #     the runtime value against the raw source text fails for that reason alone —
  #     measured, and it is why this case exists rather than a comment saying "keep
  #     these in sync".
  $verifyText = Get-Content (Join-Path $PSScriptRoot 'verify-mount.ps1') -Raw
  foreach ($pair in @(
    @{ Name = 'row-name'; Pattern = $ROW_NAME_PATTERN },
    @{ Name = 'bundle-id'; Pattern = $BUNDLE_ID_PATTERN }
  )) {
    $literal = $pair.Pattern -replace "'", "''"
    Check "verify-mount.ps1 uses the $($pair.Name) pattern this test asserts" `
      ($verifyText.Contains($literal)) `
      'if this fails, make the two identical rather than deleting the check'
  }
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------------- 3. summary

Write-Host ''
if ($script:failures -eq 0) {
  Write-Host "all $($script:cases) mount criteria behave correctly" -ForegroundColor Green
  Write-Host 'This proves the JUDGEMENT only. Installability is still proven by' -ForegroundColor DarkGray
  Write-Host 'market/test-install-paths.ps1 against real published packages.' -ForegroundColor DarkGray
  exit 0
}
Write-Host "$($script:failures) of $($script:cases) mount criteria are wrong — fix verify-mount.ps1 before trusting it" -ForegroundColor Red
exit 1
