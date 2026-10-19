#!/usr/bin/env pwsh
<#
  Install-path test matrix.

  Every path a user might take, run for real in a throwaway profile, then torn
  down. The point is to find what BREAKS FOR A USER, so each case also records
  the failure the user would have seen, not just pass/fail.

  Tested per plugin:
    1  npm name                (the documented path once published)
    2  npm name@version        (pinned)
    3  release tarball URL     (works without npm)
    4  local tarball file      (offline)
    5  local link: path        (development)
    6  git@sha&path: subdir    (EXPECTED TO FAIL — proving the doc claim)
    7  GUI-style spec on an already installed package (already-installed path)

  Each case: create a fresh profile, add, verify the package really became a
  bundle LAYER (cordis.patch.yml present AND listed in dsh.profile.bundles),
  then remove and confirm nothing is left behind.

  Usage:  pwsh market/test-install-paths.ps1
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
  [string]$ProfilePrefix = '_it'
)

$ErrorActionPreference = 'Continue'
$results = New-Object System.Collections.ArrayList
$releaseBase = 'https://github.com/HwFee/HwFee-dsh/releases/download/v0.1.0'

function Note($msg) { Write-Host "      $msg" }
function Head($msg) { Write-Host "`n$msg" -ForegroundColor Cyan }

function New-TestProfile([string]$suffix) {
  $name = "$ProfilePrefix$suffix"
  $dir = Join-Path $env:USERPROFILE ".dsh\profiles\$name"
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
  return $name
}

function Remove-TestProfile([string]$name) {
  $dir = Join-Path $env:USERPROFILE ".dsh\profiles\$name"
  if (Test-Path $dir) {
    $resolved = (Resolve-Path $dir).Path
    # Guard: only ever delete a directory we created under .dsh\profiles.
    if ($resolved -like "*\.dsh\profiles\$name") {
      Remove-Item $resolved -Recurse -Force -ErrorAction SilentlyContinue
    } else {
      Note "REFUSED to delete unexpected path: $resolved"
    }
  }
}

<#
  Run one case. Returns a hashtable with the outcome and the user-visible error.
  `ExpectFailure` marks cases that are supposed to fail; those pass when the
  failure is clean and documented rather than when the install works.
#>
function Test-Case {
  param(
    [string]$Id,
    [string]$Spec,
    [string]$PackageName,
    [switch]$ExpectFailure,
    [string]$Suffix
  )
  $profile = New-TestProfile $Suffix
  $out = & dsh plugin --profile $profile add $Spec 2>&1 | Out-String
  $dir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
  $pkgDir = Join-Path $dir "node_modules\$PackageName"
  $hasPatch = Test-Path (Join-Path $pkgDir 'cordis.patch.yml')
  $inBundles = $false
  $pkgJson = Join-Path $dir 'package.json'
  if (Test-Path $pkgJson) {
    try { $inBundles = ((Get-Content $pkgJson -Raw | ConvertFrom-Json).dsh.profile.bundles -contains $PackageName) } catch { }
  }
  $ok = $hasPatch -and $inBundles

  # First meaningful error line, for the report.
  $err = ($out -split "`r?`n" | Where-Object { $_ -match 'ERR_|error|failed|Cannot|Refusing' } | Select-Object -First 1)
  if (-not $err) { $err = '' } else { $err = $err.Trim() }

  $verdict = if ($ok) { 'PASS' } elseif ($ExpectFailure) { 'FAIL-AS-EXPECTED' } else { 'FAIL' }
  $null = $results.Add([pscustomobject]@{
    Id = $Id; Package = $PackageName; Verdict = $verdict
    Patch = $hasPatch; Bundle = $inBundles; Error = $err
  })
  $colour = switch ($verdict) { 'PASS' { 'Green' } 'FAIL-AS-EXPECTED' { 'Yellow' } default { 'Red' } }
  Write-Host ("  {0,-22} {1}" -f $Id, $verdict) -ForegroundColor $colour
  if ($err) { Note $err }

  Remove-TestProfile $profile
  return $ok
}

# --------------------------------------------------------------- the matrix

Head 'A. Published npm name'
# From a default registry, which on this machine is a mirror — that is what a
# user in China gets, so it is the honest first test.
$null = Test-Case -Id 'npm-name' -Spec 'dsh-system-fonts' -PackageName 'dsh-system-fonts' -Suffix 'a1'
$null = Test-Case -Id 'npm-name@version' -Spec 'dsh-system-fonts@0.1.0' -PackageName 'dsh-system-fonts' -Suffix 'a2'
$null = Test-Case -Id 'npm-scoped' -Spec '@hwfee/dsh-usage-stats' -PackageName '@hwfee/dsh-usage-stats' -Suffix 'a3'
$null = Test-Case -Id 'npm-scoped@version' -Spec '@hwfee/dsh-usage-stats@0.1.0' -PackageName '@hwfee/dsh-usage-stats' -Suffix 'a4'

Head 'B. Tarball URL (no npm account needed)'
$null = Test-Case -Id 'release-url' -Spec "$releaseBase/dsh-system-fonts-0.1.0.tgz" -PackageName 'dsh-system-fonts' -Suffix 'b1'
$null = Test-Case -Id 'release-url-scoped' -Spec "$releaseBase/hwfee-dsh-usage-stats-0.1.0.tgz" -PackageName '@hwfee/dsh-usage-stats' -Suffix 'b2'

Head 'C. Local tarball file'
$localTgz = Join-Path $RepoRoot '.work\dist\dsh-system-fonts-0.1.0.tgz'
if (Test-Path $localTgz) {
  $null = Test-Case -Id 'local-tarball' -Spec $localTgz -PackageName 'dsh-system-fonts' -Suffix 'c1'
} else { Note "skipped: $localTgz not found (run npm pack first)" }

Head 'D. Local link: path (development)'
foreach ($i in 1..2) {
  $plugin = if ($i -eq 1) { 'system-fonts' } else { 'usage-stats' }
  $pkg = if ($i -eq 1) { 'dsh-system-fonts' } else { '@hwfee/dsh-usage-stats' }
  $path = (Join-Path $RepoRoot "plugins\$plugin").Replace('\', '/')
  $null = Test-Case -Id "link-$plugin" -Spec "link:$path" -PackageName $pkg -Suffix "d$i"
}

Head 'E. Git subdirectory (expected to fail — this proves the README claim)'
$sha = (& git -C $RepoRoot rev-parse HEAD).Trim()
$null = Test-Case -Id 'git-sha-path' -Spec "git+https://github.com/HwFee/HwFee-dsh.git#$sha&path:/plugins/system-fonts" -PackageName 'dsh-system-fonts' -Suffix 'e1' -ExpectFailure

Head 'F. Double install (what the GUI does when clicked twice)'
$profile = New-TestProfile 'f1'
$first = & dsh plugin --profile $profile add dsh-system-fonts 2>&1 | Out-String
$second = & dsh plugin --profile $profile add dsh-system-fonts 2>&1 | Out-String
$dir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
$bundles = $null
try { $bundles = (Get-Content (Join-Path $dir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles } catch { }
$dupCount = @($bundles | Where-Object { $_ -eq 'dsh-system-fonts' }).Count
$verdict = if ($dupCount -eq 1) { 'PASS (one entry, no duplicate)' } else { "FAIL ($dupCount entries)" }
Write-Host ("  {0,-22} {1}" -f 'double-install', $verdict) -ForegroundColor $(if ($dupCount -eq 1) { 'Green' } else { 'Red' })
$null = $results.Add([pscustomobject]@{
  Id = 'double-install'; Package = 'dsh-system-fonts'; Verdict = $verdict
  Patch = (Test-Path (Join-Path $dir 'node_modules\dsh-system-fonts\cordis.patch.yml')); Bundle = ($dupCount -eq 1); Error = ''
})
Remove-TestProfile $profile

Head 'G. Remove leaves nothing behind'
$profile = New-TestProfile 'g1'
$null = & dsh plugin --profile $profile add dsh-system-fonts 2>&1
$null = & dsh plugin --profile $profile remove dsh-system-fonts 2>&1
$dir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
$gone = -not (Test-Path (Join-Path $dir 'node_modules\dsh-system-fonts'))
$stillListed = $false
try { $stillListed = ((Get-Content (Join-Path $dir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles -contains 'dsh-system-fonts') } catch { }
$verdict = if ($gone -and -not $stillListed) { 'PASS' } else { 'FAIL' }
Write-Host ("  {0,-22} {1}" -f 'remove-clean', $verdict) -ForegroundColor $(if ($verdict -eq 'PASS') { 'Green' } else { 'Red' })
$null = $results.Add([pscustomobject]@{
  Id = 'remove-clean'; Package = 'dsh-system-fonts'; Verdict = $verdict
  Patch = (-not $gone); Bundle = $stillListed; Error = ''
})
Remove-TestProfile $profile

# ------------------------------------------------------------------ verdict

Head 'SUMMARY'
$results | Format-Table -AutoSize | Out-String | Write-Host
$bad = @($results | Where-Object { $_.Verdict -eq 'FAIL' })
Write-Host ("`n{0} cases, {1} unexpected failures" -f $results.Count, $bad.Count)
if ($bad.Count -gt 0) {
  Write-Host 'Unexpected failures:' -ForegroundColor Red
  $bad | ForEach-Object { Write-Host "  $($_.Id) [$($_.Package)] $($_.Error)" -ForegroundColor Red }
  exit 1
}
exit 0
