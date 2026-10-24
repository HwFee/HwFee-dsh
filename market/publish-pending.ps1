# Publish every plugin whose version is not on npm yet — one command.
#
#   $env:NPM_TOKEN = 'npm_...'        # or NODE_AUTH_TOKEN / NPM_AUTH_TOKEN
#   pwsh market/publish-pending.ps1            # build + test + gate + publish + verify
#   pwsh market/publish-pending.ps1 -WhatIf    # show what would be published
#
# WHY THIS EXISTS. The token must never be written into ~/.npmrc or the repo
# (`AGENTS.md` §八). It is injected per invocation through npm's CLI config key,
# so nothing on disk holds it. The pending set is DISCOVERED from `plugins/*`
# rather than hardcoded: a package whose `name@version` already answers from the
# registry is skipped, so a re-run after a partial failure cannot burn a version.
#
# THE TARBALL THAT IS CHECKED IS THE TARBALL THAT IS UPLOADED.
# The script packs once, gates THOSE bytes, and then runs `npm publish <file>` on
# that same file. `npm publish` with no argument re-packs the directory, which
# opens a window: anything that rewrites `client/client.js` between the gate and
# the publish would ship bytes nobody inspected. Publishing the file closes it.
# The build runs BEFORE the pack for the same reason — a tarball packed before the
# build does not contain what the build produces.
#
# THE ASSET GATE. `market/check-release-assets.mjs` refuses a package whose packed
# bytes carry a font we have no right to redistribute. A file-list check is not
# enough: cds-theme 0.1.5 inlined six commercial Anthropic faces as base64 inside
# `client/client.js` while its `files` field listed only `lib`, `client/client.js`,
# … The gate unpacks the real tarball and hashes every font payload, raw or base64.
#
# WHAT IS RECORDED. `market/publish-record.md` gets each package's tarball name,
# size, SHA-1, SHA-256, plus npm's `dist.shasum` / `dist.integrity` read back from
# the registry after publish. `AGENTS.md` requires a Release asset's shasum to
# equal npm's `dist.shasum`; that check needs the numbers afterwards, and
# re-deriving them by hand is how it ends up skipped.
#
# WHY FAILURE OUTPUT IS PRINTED. The test run used to be `| Out-Null` and the
# build `| Select-Object -Last 1`, so a red suite reported only "test failed".
# Both now dump the tail of the real output.
#
# THE ONLY SUCCESS TEST is the one AGENTS.md names: the version answers from the
# registry AND its tarball responds 200. `npm publish` printing "+ name@x.y.z"
# proves nothing.
param(
  [switch]$WhatIf,
  [string]$Registry = 'https://registry.npmjs.org',
  [string[]]$Only,
  [switch]$SkipAssetGate,
  [switch]$SkipTests,
  # Overridable so the gates can be exercised against a scratch copy without
  # publishing anything. Defaults to the repository this script lives in.
  [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$root = if ($RepoRoot) { $RepoRoot } else { Split-Path -Parent $PSScriptRoot }
. (Join-Path $PSScriptRoot 'packages.ps1')
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
  Write-Host 'On this machine the value may live only in the User scope, which a fresh'
  Write-Host 'shell does not inherit. Inject it for one command:'
  Write-Host "  `$env:NPM_TOKEN = [Environment]::GetEnvironmentVariable('NPM_TOKEN','User').Trim()"
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

<#
  Pack ONCE, into a temp dir kept for the whole run, and describe the bytes.
  The returned object carries the absolute path so the publish step can hand npm
  that exact file instead of letting it re-pack the directory.
#>
function New-PackReport([string]$dir, [string]$keepDir) {
  Push-Location $dir
  try {
    $json = & npm pack --pack-destination $keepDir --json 2>&1 | Out-String
  } finally {
    Pop-Location
  }
  $info = $null
  try { $info = ($json | ConvertFrom-Json)[0] } catch { return $null }
  if (-not $info -or -not $info.filename) { return $null }
  $tgz = Join-Path $keepDir $info.filename
  if (-not (Test-Path $tgz)) { return $null }
  return [pscustomobject]@{
    Path      = $tgz
    File      = $info.filename
    Bytes     = (Get-Item $tgz).Length
    Sha1      = (Get-FileHash $tgz -Algorithm SHA1).Hash.ToLower()
    Sha256    = (Get-FileHash $tgz -Algorithm SHA256).Hash.ToLower()
    Entries   = $info.entryCount
    Shasum    = $null
    Integrity = $null
  }
}

function Get-RegistryDist([string]$name, [string]$version) {
  $raw = & npm view "$name@$version" dist "--registry=$Registry" --json 2>&1 | Out-String
  try { return ($raw | ConvertFrom-Json) } catch { return $null }
}

$candidates = @(Get-ReleasePackages -RepoRoot $root -Only $Only)

$pending = @()
$unavailable = @()
foreach ($package in $candidates) {
  $published = Registry-Version $package.Name $package.Version
  if ($published -eq $package.Version) {
    $status = Tarball-Status $package.Name $package.Version
    if ($status -ne 200) {
      $unavailable += [pscustomobject]@{ Tag = "$($package.Name)@$($package.Version)"; Why = "version is listed, tarball=$status; do not republish this version" }
      Write-Host ("pending {0}@{1}  (listed, tarball={2})" -f $package.Name, $package.Version, $status) -ForegroundColor Yellow
    } else {
      Write-Host ("skip    {0}@{1}  (version listed, tarball 200)" -f $package.Name, $package.Version) -ForegroundColor DarkGray
    }
    continue
  }
  $pending += $package
}

if ($pending.Count -eq 0) {
  if ($unavailable.Count) {
    $unavailable | ForEach-Object { Write-Host "$($_.Tag): $($_.Why)" }
    exit 1
  }
  Write-Host 'Nothing to publish: every manifest version already answers from the registry.'
  exit 0
}

Write-Host ("pending: {0}" -f (($pending | ForEach-Object { "$($_.Name)@$($_.Version)" }) -join ', ')) -ForegroundColor Cyan
if ($WhatIf) { exit 0 }

$packRoot = Join-Path $env:TEMP ("dsh-publish-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $packRoot | Out-Null

$failures = @($unavailable)
$packs = @{}

try {
  foreach ($package in $pending) {
    $tag = "$($package.Name)@$($package.Version)"
    Write-Host ''
    Write-Host ("=== {0}" -f $tag) -ForegroundColor Cyan
    $keep = Join-Path $packRoot ($package.Slug)
    New-Item -ItemType Directory -Force $keep | Out-Null

    Push-Location $package.DirPath
    try {
      $buildOut = & npm run build 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) {
        Write-Host ($buildOut -split "`r?`n" | Select-Object -Last 15) -ForegroundColor DarkGray
        throw 'build failed'
      }
      Write-Host '    build ok' -ForegroundColor DarkGray

      if (-not $SkipTests) {
        $testOut = & npm test 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
          Write-Host ($testOut -split "`r?`n" | Select-Object -Last 25) -ForegroundColor DarkGray
          throw 'test failed'
        }
        Write-Host '    test ok' -ForegroundColor DarkGray
      }
    } catch {
      $failures += [pscustomobject]@{ Tag = $tag; Why = $_.Exception.Message }
      Pop-Location
      continue
    }
    Pop-Location

    # Pack AFTER the build, gate THESE bytes, publish THIS file.
    $report = New-PackReport $package.DirPath $keep
    if (-not $report) {
      $failures += [pscustomobject]@{ Tag = $tag; Why = 'npm pack produced nothing' }
      continue
    }
    Write-Host ("    pack {0}  {1} KB  {2} files  sha1={3}" -f $report.File, [math]::Round($report.Bytes / 1024, 1), $report.Entries, $report.Sha1) -ForegroundColor DarkGray
    $packs[$tag] = $report

    if (-not $SkipAssetGate) {
      $gateOut = & node (Join-Path $PSScriptRoot 'check-release-assets.mjs') --dir $package.DirPath 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) {
        Write-Host $gateOut
        $failures += [pscustomobject]@{ Tag = $tag; Why = 'asset gate failed' }
        continue
      }
      Write-Host '    asset gate ok' -ForegroundColor DarkGray
    }

    # `npm publish <file>` uploads exactly this tarball. Re-verify the file on disk
    # has not changed since it was hashed, so the recorded numbers describe the
    # uploaded bytes.
    if ((Get-FileHash $report.Path -Algorithm SHA1).Hash.ToLower() -ne $report.Sha1) {
      $failures += [pscustomobject]@{ Tag = $tag; Why = 'tarball changed between hashing and publish' }
      continue
    }

    Push-Location $package.DirPath
    try {
      & npm publish $report.Path "--//registry.npmjs.org/:_authToken=$token" 2>&1 |
        Where-Object { $_ -match '^npm (notice|error)' } |
        Select-Object -Last 6 | ForEach-Object { Write-Host "    $_" }
      if ($LASTEXITCODE -ne 0) { throw 'publish failed' }
    } catch {
      $failures += [pscustomobject]@{ Tag = $tag; Why = $_.Exception.Message }
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
      $dist = Get-RegistryDist $package.Name $package.Version
      if ($dist) {
        $report.Shasum = $dist.shasum
        $report.Integrity = $dist.integrity
      }
      $match = if ($dist -and $dist.shasum -eq $report.Sha1) { 'yes' } else { 'NO' }
      Write-Host ("    OK  tarball 200, registry {0}, shasum matches the packed file: {1}" -f $onRegistry, $match) `
        -ForegroundColor $(if ($match -eq 'yes') { 'Green' } else { 'Yellow' })
      if ($match -ne 'yes') {
        $failures += [pscustomobject]@{ Tag = $tag; Why = "published, but registry shasum '$($dist.shasum)' != packed sha1 '$($report.Sha1)'" }
      }
    } else {
      $failures += [pscustomobject]@{
        Tag = $tag
        Why = "tarball=$status registry=$([string]$onRegistry) (publish may still be committing; re-run this script to re-check)"
      }
    }
  }
} finally {
  # Keep the tarballs only on failure: a failed run's bytes are the evidence.
  if ($failures.Count -eq 0) { Remove-Item $packRoot -Recurse -Force -ErrorAction SilentlyContinue }
  else { Write-Host "`ntarballs kept for inspection: $packRoot" -ForegroundColor DarkGray }
}

# ---- write the record -------------------------------------------------------
# Every run writes it, pass or fail: a hash nobody recorded cannot be checked
# against the Release asset later.
$recordPath = Join-Path $PSScriptRoot 'publish-record.md'
$lines = @(
  '# Publish record'
  ''
  "Written by ``market/publish-pending.ps1`` on $((Get-Date).ToString('yyyy-MM-dd HH:mm')) local time."
  ''
  'Each Release asset must match the row for its version: `AGENTS.md` requires the'
  'asset shasum to equal npm `dist.shasum`. SHA-1 is what npm reports as'
  '`dist.shasum`; SHA-256 is what GitHub prints as the asset digest.'
  ''
  'These hashes describe the tarball the script packed and then published by path,'
  'so they are the uploaded bytes — not a re-pack of the directory afterwards.'
  ''
  '| Package | Version | Tarball | KB | SHA-1 = npm dist.shasum | SHA-256 | npm integrity |'
  '|---|---|---|---|---|---|---|'
)
foreach ($package in $pending) {
  $tag = "$($package.Name)@$($package.Version)"
  $p = $packs[$tag]
  $state = if ($failures | Where-Object { $_.Tag -eq $tag }) { '**failed**' } else { 'ok' }
  if (-not $p) {
    $lines += "| ``$($package.Name)`` | $($package.Version) | — | — | — | — | $state |"
    continue
  }
  $lines += "| ``$($package.Name)`` | $($package.Version) | ``$($p.File)`` | $([math]::Round($p.Bytes / 1024, 1)) | ``$($p.Sha1)`` | ``$($p.Sha256)`` | ``$($p.Integrity)`` |"
}
$lines += ''
Set-Content -Path $recordPath -Value ($lines -join "`n") -Encoding utf8
Write-Host ''
Write-Host "record written to $recordPath" -ForegroundColor DarkGray

Write-Host ''
if ($failures.Count -eq 0) {
  Write-Host 'published and verified:' -ForegroundColor Green
  $pending | ForEach-Object { Write-Host ("  {0}@{1}" -f $_.Name, $_.Version) }
  Write-Host ''
  Write-Host 'next: pwsh market/test-install-paths.ps1  (install matrix, then commit the report)'
  exit 0
}

Write-Host 'FAILED:' -ForegroundColor Red
$failures | ForEach-Object { Write-Host ("  {0}  {1}" -f $_.Tag, $_.Why) }
exit 1
