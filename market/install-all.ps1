# Install every plugin in this repository at its newest PUBLISHED version.
#
# WHY THIS EXISTS. `dsh plugin add <name>` lets pnpm resolve the `latest` tag,
# and pnpm can answer that from a stale local cache: measured on this machine,
# `pnpm view dsh-cds-theme version` said 0.1.10 while `pnpm add dsh-cds-theme`
# installed 0.1.8 from an explicit `--registry=https://registry.npmjs.org/`
# request (and refused to work at all against a dead registry). So this script
# asks the registry for the version itself and installs `name@version`, which
# removes the resolution step that can go stale.
#
# Only two channels are supported: the official npm registry and the GitHub
# Release tarballs. No mirror is consulted anywhere.

param(
  [string]$Profile = 'desktop',
  [string[]]$Only,
  # context-rail is deliberately not installed by default.
  [switch]$IncludeContextRail,
  [string]$Registry = 'https://registry.npmjs.org',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'packages.ps1')
$repoRoot = Split-Path -Parent $PSScriptRoot

$dsh = Get-Command dsh -ErrorAction SilentlyContinue
if (-not $dsh) {
  $fallback = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
  if (Test-Path $fallback) { $dsh = Get-Item $fallback } else {
    throw 'dsh was not found. Open a shell where the DeepSeek Harness CLI is on PATH, or pass the CLI path by adding its bin directory to PATH.'
  }
}

$packages = @(Get-ReleasePackages -RepoRoot $repoRoot)
if (-not $IncludeContextRail) {
  $packages = @($packages | Where-Object { $_.Name -ne '@hwfee/dsh-context-rail' })
}
if ($Only -and $Only.Count -gt 0) {
  $packages = @($packages | Where-Object { $Only -contains $_.Name -or $Only -contains $_.Slug })
}
if ($packages.Count -eq 0) { throw 'no packages selected' }

Write-Host ("Profile: {0}   Registry: {1}   Packages: {2}" -f $Profile, $Registry, $packages.Count) -ForegroundColor Cyan

$installed = @()
foreach ($package in $packages) {
  $latest = (& npm view $package.Name version --registry=$Registry 2>$null | Select-Object -Last 1)
  if ($null -eq $latest -or "$latest".Trim() -eq '') {
    throw ("cannot read the latest version of {0} from {1}" -f $package.Name, $Registry)
  }
  $spec = "$($package.Name)@$("$latest".Trim())"

  if ($DryRun) {
    Write-Host ("would install {0}" -f $spec)
    $installed += [pscustomobject]@{ Package = $package.Name; Version = "$latest".Trim() }
    continue
  }

  Write-Host ("`n==> {0}" -f $spec) -ForegroundColor Cyan
  & $dsh.Source plugin --profile $Profile add $spec --registry=$Registry
  if ($LASTEXITCODE -ne 0) { throw ("install failed: {0} (exit {1})" -f $spec, $LASTEXITCODE) }
  $installed += [pscustomobject]@{ Package = $package.Name; Version = "$latest".Trim() }
}

$manifestPath = Join-Path (Join-Path $env:USERPROFILE ".dsh\profiles\$Profile") 'package.json'
if (Test-Path $manifestPath) {
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  Write-Host "`nInstalled in profile ${Profile}:" -ForegroundColor Cyan
  foreach ($row in $installed) {
    $declared = if ($manifest.dependencies.PSObject.Properties.Name -contains $row.Package) {
      $manifest.dependencies.($row.Package)
    } else { '(missing)' }
    $ok = $declared -like "*$($row.Version)*"
    Write-Host ("  {0} {1,-10} declared {2} {3}" -f $row.Package, $row.Version, $declared, $(if ($ok) { 'OK' } else { 'MISMATCH' }))
  }
}

Write-Host "`nFully quit and reopen DeepSeek Harness so the new bundles load." -ForegroundColor Yellow
