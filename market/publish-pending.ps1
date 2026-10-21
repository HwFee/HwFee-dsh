# Publish every plugin whose version is not on npm yet — one command.
#
#   $env:NPM_TOKEN = 'npm_...'        # or NODE_AUTH_TOKEN / NPM_AUTH_TOKEN
#   pwsh market/publish-pending.ps1            # build + test + publish + verify
#   pwsh market/publish-pending.ps1 -WhatIf    # show what would be published
#
# WHY THIS EXISTS. The token must never be written into ~/.npmrc or the repo
# (`AGENTS.md` §八). It is injected per invocation through npm's CLI config key,
# so nothing on disk holds it. The pending set is DISCOVERED, never hardcoded:
# a package whose `name@version` already answers on the registry is skipped, so a
# re-run after a partial failure cannot burn a version number.
#
# THE ONLY SUCCESS TEST is the one AGENTS.md names: the version answers from the
# registry AND its tarball responds 200. `npm publish` printing "+ name@x.y.z"
# proves nothing.
param(
  [switch]$WhatIf,
  [string]$Registry = 'https://registry.npmjs.org',
  [string[]]$Only
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$token = $env:NPM_TOKEN
if (-not $token) { $token = $env:NODE_AUTH_TOKEN }
if (-not $token) { $token = $env:NPM_AUTH_TOKEN }

if (-not $token) {
  Write-Host 'No npm token in the environment.' -ForegroundColor Red
  Write-Host ''
  Write-Host 'Set one of NPM_TOKEN / NODE_AUTH_TOKEN / NPM_AUTH_TOKEN, e.g.'
  Write-Host "  `$env:NPM_TOKEN = 'npm_...'          # this shell only"
  Write-Host "  setx NPM_TOKEN `"npm_...`"           # persistent, needs a restart to reach DSH"
  Write-Host ''
  Write-Host 'A granular token does not answer `npm whoami` (401 is expected); the'
  Write-Host 'real test is the publish call itself. See AGENTS.md §八.'
  exit 2
}

function Registry-Version([string]$name, [string]$version) {
  $out = & npm view "$name@$version" version "--registry=$Registry" 2>&1
  if ($LASTEXITCODE -ne 0) { return $null }
  return ($out | Out-String).Trim()
}

function Tarball-Status([string]$name, [string]$version) {
  # Scoped packages: the path keeps the scope, the FILENAME drops it.
  $file = ($name -split '/')[-1]
  $url = "$Registry/$name/-/$file-$version.tgz"
  try {
    $response = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 45
    return [int]$response.StatusCode
  } catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    return $status
  }
}

$candidates = Get-ChildItem (Join-Path $root 'plugins') -Directory | ForEach-Object {
  $manifest = Join-Path $_.FullName 'package.json'
  if (-not (Test-Path $manifest)) { return }
  $json = Get-Content $manifest -Raw | ConvertFrom-Json
  if (-not $json.dsh.bundle) { return }
  [pscustomobject]@{
    Dir     = $_.FullName
    Name    = $json.name
    Version = $json.version
    Tag     = "$($json.name)@$($json.version)"
  }
} | Where-Object { $Only.Count -eq 0 -or $Only -contains $_.Name }

$pending = @()
foreach ($package in $candidates) {
  $published = Registry-Version $package.Name $package.Version
  if ($published -eq $package.Version) {
    Write-Host ("skip    {0}  (already on npm)" -f $package.Tag) -ForegroundColor DarkGray
    continue
  }
  $pending += $package
}

if ($pending.Count -eq 0) {
  Write-Host 'Nothing to publish: every manifest version already answers from the registry.'
  exit 0
}

Write-Host ("pending: {0}" -f (($pending | ForEach-Object { $_.Tag }) -join ', ')) -ForegroundColor Cyan
if ($WhatIf) { exit 0 }

$failures = @()
foreach ($package in $pending) {
  Write-Host ''
  Write-Host ("=== {0}" -f $package.Tag) -ForegroundColor Cyan
  Push-Location $package.Dir
  try {
    & npm run build 2>&1 | Select-Object -Last 1 | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0) { throw 'build failed' }

    & npm test 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'test failed' }

    & npm publish "--//registry.npmjs.org/:_authToken=$token" 2>&1 |
      Where-Object { $_ -match '^npm (notice|error)' } |
      Select-Object -Last 6 | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0) { throw 'publish failed' }
  } catch {
    $failures += [pscustomobject]@{ Tag = $package.Tag; Why = $_.Exception.Message }
    Pop-Location
    continue
  }
  Pop-Location

  # The only two facts that count. npm may take a few seconds to commit.
  $status = $null
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Start-Sleep -Seconds 3
    $status = Tarball-Status $package.Name $package.Version
    if ($status -eq 200) { break }
  }
  $onRegistry = Registry-Version $package.Name $package.Version
  if ($status -eq 200 -and $onRegistry -eq $package.Version) {
    Write-Host ("    OK  tarball 200, registry says {0}" -f $onRegistry) -ForegroundColor Green
  } else {
    $failures += [pscustomobject]@{
      Tag = $package.Tag
      Why = "tarball=$status registry=$([string]$onRegistry) (publish may still be committing; re-run this script to re-check)"
    }
  }
}

Write-Host ''
if ($failures.Count -eq 0) {
  Write-Host 'published and verified:' -ForegroundColor Green
  $pending | ForEach-Object { Write-Host ("  {0}" -f $_.Tag) }
  Write-Host ''
  Write-Host 'next: pwsh market/test-install-paths.ps1  (install matrix, then commit the report)'
  exit 0
}

Write-Host 'FAILED:' -ForegroundColor Red
$failures | ForEach-Object { Write-Host ("  {0}  {1}" -f $_.Tag, $_.Why) }
exit 1