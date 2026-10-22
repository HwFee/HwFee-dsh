#!/usr/bin/env pwsh
<#
  End-to-end install matrix — run this after EVERY publish, before telling anyone
  a release is ready. It answers one question: can a user actually install what we
  just shipped?

  WHY THIS EXISTS. Reading the code proves nothing here. The failures this catches
  were all invisible to source review:

    - a bundle patch naming a package that no longer exists: the row never
      activates and the plugin silently disappears;
    - an artifact registering a stale module id: the entire web boot dies with
      `duplicate factory registration`;
    - a stale mirror serving the old placeholder tarball: install fails with
      `ERR_PNPM_TARBALL_EXTRACT` after a minute of retries.

  The last one only appears when you actually install, and only through the
  mirror — which is the default registry on this machine, so it is exactly what
  a Chinese user gets.

  ONE RESULT THAT IS NOT A FAILURE. An unpinned install can land one version
  behind npm's `latest` for up to a day: pnpm's minimumReleaseAge policy keeps
  versions younger than its cutoff out of range resolution. The matrix notes it
  per package. Pinned installs and Release tarballs are unaffected — but a
  held-back version is whatever was newest before the cutoff, so read the
  Installed column rather than assuming it equals `latest`.

  WHAT IT DOES. For every package in the repository it reads the LIVE version from
  npm (never a hardcoded number — a stale version here would test the wrong thing
  and still pass), installs it through every supported path in a throwaway
  profile, verifies it landed as a real profile LAYER rather than a plain
  dependency, and tears the profile down. Then it writes a markdown report.

  THE REPORT IS PART OF THE WORK. A matrix you ran but did not record is a matrix
  nobody can check later. The script writes it every run, pass or fail.

  Usage:
    pwsh market/test-install-paths.ps1              # run, write report
    pwsh market/test-install-paths.ps1 -SkipMirror  # skip the mirror cases
    pwsh market/test-install-paths.ps1 -KeepProfiles  # leave profiles for inspection
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
  [string]$ProfilePrefix = '_mx',
  [string]$ReportPath,
  [switch]$SkipMirror,
  [switch]$KeepProfiles
)

$ErrorActionPreference = 'Continue'
$started = Get-Date

if (-not $ReportPath) {
  $ReportPath = Join-Path $RepoRoot 'market/install-matrix.md'
}

# The packages this repository ships, DERIVED from `plugins/*` rather than typed
# out here. The hand-written array that used to live at this spot listed six
# packages in two files (this one and verify-mount.ps1); a seventh plugin would
# have been silently skipped by whichever copy nobody remembered to edit, and the
# report would still have said ALL GREEN. `market/packages.ps1` computes the list
# from `dsh.bundle` and derives the per-package release tag and asset name:
# each package releases INDEPENDENTLY, so they cannot share one release tag.
# Scoped names drop the scope in the asset (`@hwfee/dsh-usage-stats` ships as
# `hwfee-dsh-usage-stats-<v>.tgz`).
. (Join-Path $PSScriptRoot 'packages.ps1')
$packages = @(Get-ReleasePackages -RepoRoot $RepoRoot | ForEach-Object {
  # `Asset` is the concrete filename; the matrix substitutes the live version, so
  # keep the shape it fills in (`{v}`) rather than swapping the string, which
  # would depend on the version never appearing twice in a filename.
  $bare = ($_.Name -replace '^@', '' -replace '/', '-')
  @{ Dir = $_.Dir; Name = $_.Name; Tag = $_.Slug; Asset = "$bare-{v}.tgz" }
})

$releaseBase = 'https://github.com/HwFee/HwFee-dsh/releases/download'
$results = New-Object System.Collections.ArrayList
$notes = New-Object System.Collections.ArrayList

function Say($msg)  { Write-Host $msg }
function Head($msg) { Write-Host "`n$msg" -ForegroundColor Cyan }

# ---------------------------------------------------------------- profile help

function New-TestProfile([string]$suffix) {
  $name = "$ProfilePrefix$suffix"
  $dir = Join-Path $env:USERPROFILE ".dsh\profiles\$name"
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
  return $name
}

function Remove-TestProfile([string]$name) {
  if ($KeepProfiles) { return }
  $dir = Join-Path $env:USERPROFILE ".dsh\profiles\$name"
  if (-not (Test-Path $dir)) { return }
  $resolved = (Resolve-Path $dir).Path
  # Guard: only ever delete a directory we created under .dsh\profiles.
  if ($resolved -like "*\.dsh\profiles\$name") {
    Remove-Item $resolved -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Say "    REFUSED to delete unexpected path: $resolved"
  }
}

<#
  One case. A case PASSES only when the package arrived as a profile LAYER:
  `cordis.patch.yml` present in the installed copy AND the name listed in
  `dsh.profile.bundles`. A plain `dependencies` entry is not enough — that is the
  silent half-install where pnpm succeeds and the plugin never mounts.

  `ExpectFailure` marks a case that is supposed to fail (the git subdirectory
  path). Those pass when they fail, and fail when they work — either way the
  report records which.
#>
function Test-Case {
  param(
    [string]$Id,
    [string]$Spec,
    [string]$PackageName,
    [string]$SpecLabel,
    [switch]$ExpectFailure,
    [string]$Suffix
  )

  $profile = New-TestProfile $Suffix
  $out = & dsh plugin --profile $profile add $Spec 2>&1 | Out-String
  $dir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
  $pkgDir = Join-Path $dir "node_modules\$PackageName"

  $hasPatch = Test-Path (Join-Path $pkgDir 'cordis.patch.yml')
  $inBundles = $false
  $installedVersion = ''
  $manifest = Join-Path $pkgDir 'package.json'
  if (Test-Path $manifest) {
    try { $installedVersion = (Get-Content $manifest -Raw | ConvertFrom-Json).version } catch { }
  }
  $profileJson = Join-Path $dir 'package.json'
  if (Test-Path $profileJson) {
    try {
      $inBundles = ((Get-Content $profileJson -Raw | ConvertFrom-Json).dsh.profile.bundles -contains $PackageName)
    } catch { }
  }
  $ok = $hasPatch -and $inBundles

  # First meaningful error line — what the user would have seen.
  $err = ($out -split "`r?`n" | Where-Object { $_ -match 'ERR_|error|failed|Cannot|Refusing' } | Select-Object -First 1)
  $err = if ($err) { $err.Trim() } else { '' }

  if ($ok)                { $verdict = 'PASS' }
  elseif ($ExpectFailure) { $verdict = 'FAIL (expected)' }
  else                    { $verdict = 'FAIL' }

  $null = $results.Add([pscustomobject]@{
    Case = $Id; Package = $PackageName; Spec = $SpecLabel; Version = $installedVersion
    Patch = $hasPatch; Bundle = $inBundles; Verdict = $verdict; Error = $err
  })

  $colour = switch ($verdict) {
    'PASS'            { 'Green' }
    'FAIL (expected)' { 'Yellow' }
    default           { 'Red' }
  }
  Write-Host ("    {0,-22} {1}" -f $Id, $verdict) -ForegroundColor $colour
  if ($err) { Write-Host "      $err" -ForegroundColor DarkGray }

  Remove-TestProfile $profile
  return $ok
}

# ------------------------------------------------------------ 0. preconditions

Head '0. Preconditions'

foreach ($cmd in 'dsh', 'gh', 'npm') {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Say "    FAIL missing command: $cmd"
    exit 2
  }
}
Say '    dsh / gh / npm present'

$localVersions = @{}
foreach ($p in $packages) {
  $manifest = Join-Path $RepoRoot "$($p.Dir)/package.json"
  if (-not (Test-Path $manifest)) { Say "    FAIL missing manifest: $manifest"; exit 2 }
  $j = Get-Content $manifest -Raw | ConvertFrom-Json
  $localVersions[$p.Name] = $j.version
  if ($j.name -ne $p.Name) {
    Say "    FAIL $($p.Dir) manifest name is '$($j.name)' but the matrix expects '$($p.Name)'"
    exit 2
  }
}
Say '    repository manifests match the matrix'

# ----------------------------------------------------- 1. live versions on npm

Head '1. Live versions on npm'
$liveVersions = @{}
foreach ($p in $packages) {
  $v = (& npm view $p.Name version --registry=https://registry.npmjs.org 2>&1 | Select-Object -First 1)
  if ($LASTEXITCODE -ne 0 -or -not $v) {
    Say "    FAIL $($p.Name) is not published (npm view returned: $v)"
    exit 3
  }
  $v = "$v".Trim()
  $liveVersions[$p.Name] = $v
  $local = $localVersions[$p.Name]
  $status = if ($v -eq $local) { 'matches manifest' } else { "MANIFEST SAYS $local - the publish did not land" }
  Write-Host ("    {0,-26} {1,-8} {2}" -f $p.Name, $v, $status) `
    -ForegroundColor $(if ($v -eq $local) { 'Green' } else { 'Yellow' })
  if ($v -ne $local) {
    $null = $notes.Add("$($p.Name): npm has $v but the manifest says $local - republish or bump before calling this release done.")
  }
}

# ------------------------------------------------------- 2. per-package matrix

$suffix = 0
foreach ($p in $packages) {
  $name = $p.Name
  $version = $liveVersions[$name]
  Head "2. $name@$version"

  # (a) npm name, unpinned - the documented path
  $suffix++
  $null = Test-Case -Id 'npm-name' -Spec $name -PackageName $name -SpecLabel $name -Suffix "p$suffix"

  # (b) npm name pinned - what a profile lockfile writes
  $suffix++
  $null = Test-Case -Id 'npm-name@version' -Spec "$name@$version" -PackageName $name -SpecLabel "$name@$version" -Suffix "p$suffix"

  # (c) release tarball URL - works with no npm account at all. Each package has
  # its own release tag because the versions move independently.
  $suffix++
  $asset = $p.Asset -replace '\{v\}', $version
  $url = "$releaseBase/$($p.Tag)-v$version/$asset"
  $null = Test-Case -Id 'release-url' -Spec $url -PackageName $name -SpecLabel $url -Suffix "p$suffix"

  # (d) local tarball - offline install, and what `npm pack` gives an author
  $suffix++
  $packDir = Join-Path $env:TEMP "mx-pack-$suffix"
  Remove-Item $packDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $packDir | Out-Null
  Push-Location (Join-Path $RepoRoot $p.Dir)
  $packed = (& npm pack --pack-destination $packDir 2>&1 | Select-Object -Last 1)
  Pop-Location
  $packed = "$packed".Trim()
  $tgz = Join-Path $packDir $packed
  if ($packed -and (Test-Path $tgz)) {
    $null = Test-Case -Id 'local-tarball' -Spec $tgz -PackageName $name -SpecLabel "(npm pack) $packed" -Suffix "p$suffix"
  } else {
    Say '    local-tarball          SKIPPED (npm pack produced nothing)'
    $null = $results.Add([pscustomobject]@{
      Case = 'local-tarball'; Package = $name; Spec = '(npm pack)'; Version = ''
      Patch = $false; Bundle = $false; Verdict = 'SKIP'; Error = 'npm pack produced nothing'
    })
  }
  Remove-Item $packDir -Recurse -Force -ErrorAction SilentlyContinue

  # (e) local link: - the development path, reads the working tree
  $suffix++
  $linkPath = (Join-Path $RepoRoot $p.Dir).Replace('\', '/')
  $null = Test-Case -Id 'link-path' -Spec "link:$linkPath" -PackageName $name -SpecLabel "link:<repo>/$($p.Dir)" -Suffix "p$suffix"

  # An unpinned install can legitimately land an OLDER version than `latest`:
  # pnpm's minimumReleaseAge (the supply-chain policy the Host's plugin UI also
  # names) keeps versions younger than its cutoff out of range resolution. Pinned
  # installs are unaffected. Without this note the Installed column looks like a
  # failed publish. It also matters for safety: the held-back version is whatever
  # was newest before the cutoff, which after a rollback-shaped release can be a
  # build with a broken bundle id.
  $unpinned = $results | Where-Object { $_.Case -eq 'npm-name' -and $_.Package -eq $name } | Select-Object -Last 1
  if ($unpinned -and $unpinned.Version -and $unpinned.Version -ne $version) {
    Write-Host ("      note: unpinned install got {0}, not {1} - pnpm minimumReleaseAge" -f $unpinned.Version, $version) -ForegroundColor DarkYellow
    $null = $notes.Add("$($name): an unpinned install got $($unpinned.Version), not $version - pnpm's minimumReleaseAge keeps versions younger than its cutoff out of range resolution. Pinned installs are unaffected; re-run after the cutoff before treating this as a publish failure.")
  }
}

# ---------------------------------------------------- 3. cross-cutting cases

Head '3. Cross-cutting'

# (f) git subdirectory. EXPECTED TO FAIL: pnpm installs the repository ROOT for a
# git dependency and ignores `&path:`. This repository's root is not a plugin, so
# the install either lands the whole monorepo with a placeholder manifest or dies.
$sha = (& git -C $RepoRoot rev-parse HEAD).Trim()
$suffix++
$gitSpec = "git+https://github.com/HwFee/HwFee-dsh.git#$($sha.Substring(0,8))&path:/plugins/system-fonts"
$null = Test-Case -Id 'git-subdir' -Spec $gitSpec -PackageName 'dsh-system-fonts' -SpecLabel $gitSpec -Suffix "x$suffix" -ExpectFailure

# (g) install twice - what happens when the GUI button is clicked twice
$suffix++
$profile = New-TestProfile "x$suffix"
$null = & dsh plugin --profile $profile add dsh-system-fonts 2>&1
$null = & dsh plugin --profile $profile add dsh-system-fonts 2>&1
$dir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
$entries = @()
try { $entries = (Get-Content (Join-Path $dir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles } catch { }
$dup = @($entries | Where-Object { $_ -eq 'dsh-system-fonts' }).Count
$verdict = if ($dup -eq 1) { 'PASS' } else { 'FAIL' }
Write-Host ("    {0,-22} {1}  ({2} entries in bundles)" -f 'double-install', $verdict, $dup) `
  -ForegroundColor $(if ($dup -eq 1) { 'Green' } else { 'Red' })
$null = $results.Add([pscustomobject]@{
  Case = 'double-install'; Package = 'dsh-system-fonts'; Spec = 'add twice'
  Version = ''; Patch = $true; Bundle = ($dup -eq 1); Verdict = $verdict
  Error = if ($dup -eq 1) { '' } else { "$dup entries" }
})
Remove-TestProfile $profile

# (h) remove leaves nothing behind
$suffix++
$profile = New-TestProfile "x$suffix"
$null = & dsh plugin --profile $profile add dsh-system-fonts 2>&1
$null = & dsh plugin --profile $profile remove dsh-system-fonts 2>&1
$dir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
$gone = -not (Test-Path (Join-Path $dir 'node_modules\dsh-system-fonts'))
$stillListed = $false
try { $stillListed = ((Get-Content (Join-Path $dir 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles -contains 'dsh-system-fonts') } catch { }
$verdict = if ($gone -and -not $stillListed) { 'PASS' } else { 'FAIL' }
Write-Host ("    {0,-22} {1}" -f 'remove-clean', $verdict) -ForegroundColor $(if ($verdict -eq 'PASS') { 'Green' } else { 'Red' })
$null = $results.Add([pscustomobject]@{
  Case = 'remove-clean'; Package = 'dsh-system-fonts'; Spec = 'add then remove'
  Version = ''; Patch = $false; Bundle = $stillListed; Verdict = $verdict; Error = ''
})
Remove-TestProfile $profile

# (i) mirror registry. The machine's default `~/.npmrc` points at
# registry.npmmirror.com, so this is the path a Chinese user actually takes - and
# the one that served a broken placeholder tarball for 30 minutes after a publish.
if (-not $SkipMirror) {
  $suffix++
  $profile = New-TestProfile "x$suffix"
  $out = & dsh plugin --profile $profile add dsh-cds-theme 2>&1 | Out-String
  $dir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
  $pkgDir = Join-Path $dir 'node_modules\dsh-cds-theme'
  $hasPatch = Test-Path (Join-Path $pkgDir 'cordis.patch.yml')
  $installedVersion = ''
  if (Test-Path (Join-Path $pkgDir 'package.json')) {
    try { $installedVersion = (Get-Content (Join-Path $pkgDir 'package.json') -Raw | ConvertFrom-Json).version } catch { }
  }
  $verdict = if ($hasPatch) { 'PASS' } else { 'FAIL' }
  $mirrorErr = ($out -split "`r?`n" | Where-Object { $_ -match 'ERR_|error' } | Select-Object -First 1)
  Write-Host ("    {0,-22} {1}  (installed version '{2}')" -f 'mirror-install', $verdict, $installedVersion) `
    -ForegroundColor $(if ($hasPatch) { 'Green' } else { 'Red' })
  if ($mirrorErr) { Write-Host "      $($mirrorErr.Trim())" -ForegroundColor DarkGray }
  $null = $results.Add([pscustomobject]@{
    Case = 'mirror-install'; Package = 'dsh-cds-theme'; Spec = 'default registry (npmmirror)'
    Version = $installedVersion; Patch = $hasPatch; Bundle = $hasPatch; Verdict = $verdict
    Error = if ($mirrorErr) { $mirrorErr.Trim() } else { '' }
  })
  if (-not $hasPatch) {
    $null = $notes.Add("Mirror has not caught up for dsh-cds-theme: install failed or landed '$installedVersion'. Wait, or tell users to pass --config.registry=https://registry.npmjs.org.")
  }
  Remove-TestProfile $profile
}

# ------------------------------------------------------------- 4. the report

Head '4. Summary'
$results | Format-Table -AutoSize | Out-String | Write-Host

$unexpected = @($results | Where-Object { $_.Verdict -eq 'FAIL' })
$expected = @($results | Where-Object { $_.Verdict -eq 'FAIL (expected)' })
$passed = @($results | Where-Object { $_.Verdict -eq 'PASS' })
$skipped = @($results | Where-Object { $_.Verdict -eq 'SKIP' })

Say ("`n{0} cases: {1} pass, {2} expected failures, {3} skipped, {4} unexpected failures" -f `
  $results.Count, $passed.Count, $expected.Count, $skipped.Count, $unexpected.Count)

$md = New-Object System.Collections.ArrayList
$null = $md.Add('# Install matrix')
$null = $md.Add('')
$null = $md.Add("Generated by ``market/test-install-paths.ps1`` on $($started.ToString('yyyy-MM-dd HH:mm')) local time.")
$null = $md.Add('')
$null = $md.Add('Run this after every publish. It installs for real: each case creates a throwaway')
$null = $md.Add('profile, installs, checks the package arrived as a profile **layer**')
$null = $md.Add('(`cordis.patch.yml` present *and* the name in `dsh.profile.bundles`), then deletes')
$null = $md.Add('the profile. A plain dependency entry is not enough — that is the silent')
$null = $md.Add('half-install where pnpm succeeds and nothing mounts.')
$null = $md.Add('')
$overall = if ($unexpected.Count -eq 0) { 'ALL GREEN' } else { "$($unexpected.Count) FAILED" }
$null = $md.Add("**Result: $overall** — $($results.Count) cases, $($passed.Count) pass, $($expected.Count) expected failures, $($skipped.Count) skipped.")
$null = $md.Add('')
$null = $md.Add('## Versions tested')
$null = $md.Add('')
$null = $md.Add('| Package | npm `latest` | `package.json` | Agreement |')
$null = $md.Add('|---|---|---|---|')
foreach ($p in $packages) {
  $live = $liveVersions[$p.Name]
  $local = $localVersions[$p.Name]
  $agree = if ($live -eq $local) { 'match' } else { '**MISMATCH**' }
  $null = $md.Add("| ``$($p.Name)`` | $live | $local | $agree |")
}
$null = $md.Add('')
$null = $md.Add('## Results')
$null = $md.Add('')
$null = $md.Add('| Case | Package | Spec | Installed | Layer | Verdict |')
$null = $md.Add('|---|---|---|---|---|---|')
foreach ($r in $results) {
  $layer = if ($r.Patch -and $r.Bundle) { 'yes' } else { 'no' }
  $icon = switch ($r.Verdict) {
    'PASS'            { 'PASS' }
    'FAIL (expected)' { 'FAIL (expected)' }
    'SKIP'            { 'SKIP' }
    default           { '**FAIL**' }
  }
  $spec = "$($r.Spec)" -replace '\|', '\|'
  $ver = if ($r.Version) { $r.Version } else { '—' }
  $null = $md.Add("| ``$($r.Case)`` | ``$($r.Package)`` | $spec | $ver | $layer | $icon |")
}

if ($unexpected.Count -gt 0) {
  $null = $md.Add('')
  $null = $md.Add('## Failures')
  $null = $md.Add('')
  foreach ($r in $unexpected) {
    $null = $md.Add("### ``$($r.Case)`` — ``$($r.Package)``")
    $null = $md.Add('')
    $null = $md.Add("Spec: ``$($r.Spec)``")
    $null = $md.Add('')
    if ($r.Error) { $null = $md.Add('```'); $null = $md.Add($r.Error); $null = $md.Add('```') }
    else { $null = $md.Add('No error text captured.') }
    $null = $md.Add('')
  }
}

if ($notes.Count -gt 0) {
  $null = $md.Add('')
  $null = $md.Add('## Notes')
  $null = $md.Add('')
  foreach ($n in $notes) { $null = $md.Add("- $n") }
}

$null = $md.Add('')
$null = $md.Add('## Paths that are known not to work')
$null = $md.Add('')
$null = $md.Add('`git+https://…git#<sha>&path:/plugins/<name>` — pnpm installs the repository')
$null = $md.Add('**root** for a git dependency and ignores `&path:`. This repository''s root is not')
$null = $md.Add('a plugin, so the install lands the whole monorepo with a placeholder manifest, or')
$null = $md.Add('fails outright. A git-installable plugin needs the repo root to *be* the plugin.')
$null = $md.Add('')

Set-Content -Path $ReportPath -Value ($md -join "`n") -Encoding utf8
Say "`nReport written to $ReportPath"

if ($unexpected.Count -gt 0) {
  Say 'Unexpected failures:' -ForegroundColor Red
  foreach ($r in $unexpected) { Say "  $($r.Case) [$($r.Package)] $($r.Error)" -ForegroundColor Red }
  exit 1
}
exit 0
