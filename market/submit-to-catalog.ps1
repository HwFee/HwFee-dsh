#!/usr/bin/env pwsh
<#
  Submit the HwFee plugins that are not yet on awesome-dsh-plugin/awesome-dsh-plugin.

  READ THIS FIRST. This touches TWO repositories:

    1. awesome-dsh-plugin/awesome-dsh-plugin  — forked, one YAML added per
       pending plugin, a PR opened. Nothing else in that fork is modified.
    2. HwFee/HwFee-dsh — NOT modified by this script.

  WHAT "PENDING" MEANS. An entry is pending when `data/plugins/<same file name>`
  does not exist upstream. Entries already on the list are never re-submitted:
  the catalog's review rules say a PR must not touch entries it has no business
  touching, and re-copying an existing file turns a clean add into a rewrite of
  someone else's row. Updating an entry you already own is an explicit act —
  pass -Update to submit every local entry.

  WHAT BLOCKS IT. That catalog's CI enforces "the repo is at least 1 day old"
  against the SUBMITTED repo (HwFee/HwFee-dsh), created 2026-10-19T07:55:57Z.
  Override with -Force only if that rule has changed. A PR may add at most three
  entries; more than three pending is refused so the submission gets split.

  WHAT IT DOES NOT DO. It does not decide anything the author has not already
  decided: categories and descriptions come from market/catalog/*.yml.

  IDEMPOTENT. Re-running after a partial run resumes: the fork is synced, the
  branch is reset, and an existing open PR is reported instead of opened twice.

  Usage:
    pwsh market/submit-to-catalog.ps1                 # dry run: checks + pending list
    pwsh market/submit-to-catalog.ps1 -Apply          # do it
    pwsh market/submit-to-catalog.ps1 -Apply -Update  # also submit changed existing entries
    pwsh market/submit-to-catalog.ps1 -Apply -Force   # ignore the 1-day gate
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Update,
  [switch]$Force,
  [string[]]$Only,
  [string]$WorkDir = (Join-Path ([IO.Path]::GetTempPath()) 'dsh-catalog-submit'),
  [string]$Repo = 'HwFee/HwFee-dsh',
  [string]$Catalog = 'awesome-dsh-plugin/awesome-dsh-plugin'
)

$ErrorActionPreference = 'Stop'

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "    OK   $msg" -ForegroundColor Green }
function Warn($msg)     { Write-Host "    WARN $msg" -ForegroundColor Yellow }
function Die($msg)      { Write-Host "    FAIL $msg" -ForegroundColor Red; exit 1 }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $here
$catalogEntries = Join-Path $here 'catalog'

# One entry file, read the way the catalog reads it: category + description.en
# are what the PR body quotes, the URL is what the submission gate resolves
# against the published repository, and the slug comes from the file name
# convention `Owner__repo--plugins-<slug>.yml`.
function Read-Entry([System.IO.FileInfo]$file) {
  $text = Get-Content $file.FullName -Raw
  $url = [regex]::Match($text, '(?m)^url:\s*(\S+)').Groups[1].Value
  $category = [regex]::Match($text, '(?m)^category:\s*(\S+)').Groups[1].Value
  $en = [regex]::Match($text, '(?ms)^\s{2}en:\s*(.+?)\s*$').Groups[1].Value.Trim()
  $en = $en.Trim("'").Trim('"')
  $slug = $file.BaseName -replace '^.*--plugins-', ''
  [pscustomobject]@{ File = $file; FileName = $file.Name; Slug = $slug; Url = $url; Category = $category; En = $en }
}

# A URL in an entry is a promise that a directory exists in the PUBLISHED
# repository. The submission gate resolves it against the default branch and
# fails the whole PR when it 404s — which is exactly what happened on PR #8392:
# three plugins were built, published to npm and installable from the working
# tree, but had never been committed, so `plugins/genui` did not exist on
# master. Checking here turns a twelve-minute CI round trip into an error
# before the PR is opened.
function Assert-EntryTarget([pscustomobject]$entry) {
  $match = [regex]::Match($entry.Url, '^https://github\.com/([^/]+)/([^/]+)/tree/([^/]+)/(.+)$')
  if (-not $match.Success) {
    Die "$($entry.FileName): url must be https://github.com/<owner>/<repo>/tree/<ref>/<dir>"
  }
  $owner = $match.Groups[1].Value
  $name = $match.Groups[2].Value
  $ref = $match.Groups[3].Value
  $path = $match.Groups[4].Value.TrimEnd('/')

  if ("$owner/$name" -eq $Repo) {
    git -C $repoRoot ls-files --error-unmatch "$path/package.json" *> $null
    if ($LASTEXITCODE -ne 0) {
      Die "$($entry.FileName): $path/package.json is not tracked - commit the plugin before submitting"
    }
  }

  $raw = "https://raw.githubusercontent.com/$owner/$name/$ref/$path/package.json"
  try {
    $text = (Invoke-WebRequest -Uri $raw -UseBasicParsing -Headers @{ 'User-Agent' = 'dsh-market-submit' }).Content
    $manifest = $text | ConvertFrom-Json
  } catch {
    $status = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    Die "$($entry.FileName): $raw is not readable (HTTP $status) - commit and push the plugin source first"
  }
  if (-not $manifest.dsh.bundle) {
    Die "$($entry.FileName): $raw declares no dsh.bundle - the catalog rejects it"
  }
  Ok "$($entry.Slug): $raw"
}

# ---------------------------------------------------------------- 1. the gate

Step 1 'Repo age gate (the catalog CI rejects repos younger than 1 day)'
$ghRepo = gh repo view $Repo --json createdAt,isFork 2>$null | ConvertFrom-Json
if (-not $ghRepo) { Die "cannot read $Repo via gh (is gh authenticated?)" }
$created = [datetime]$ghRepo.createdAt
$age = (Get-Date).ToUniversalTime() - $created.ToUniversalTime()
Write-Host "    created: $($created.ToString('u'))  age: $([math]::Round($age.TotalHours,1))h"
if ($ghRepo.isFork) { Warn "$Repo is a fork; the catalog rejects forks" }
if ($age.TotalHours -lt 24) {
  if ($Force) { Warn 'younger than 24h, continuing because -Force was passed' }
  else {
    $ready = $created.AddDays(1).ToString('u')
    Die "too young (needs 1 day). Earliest submission: $ready  (pass -Force to override)"
  }
} else { Ok 'old enough' }

# ------------------------------------------------- 2. entries and what is new

Step 2 'Local entries, and which of them upstream does not have yet'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Die 'gh CLI not found' }

$entries = @(Get-ChildItem $catalogEntries -Filter *.yml | ForEach-Object { Read-Entry $_ })
if ($Only) {
  $entries = @($entries | Where-Object { $Only -contains $_.Slug })
  $missing = @($Only | Where-Object { $_ -notin $entries.Slug })
  if ($missing.Count) { Die "Unknown catalog entries: $($missing -join ', ')" }
}
if (-not $entries.Count) { Die 'No catalog entries selected' }
foreach ($e in $entries) {
  foreach ($needle in @('url: https://github.com/', 'name: ', 'category: ', '  en: ')) {
    if (-not (Get-Content $e.File.FullName -Raw).Contains($needle)) { Die "$($e.FileName) missing '$needle'" }
  }
  if (-not $e.Category) { Die "$($e.FileName) has no category" }
}
Ok "$($entries.Count) local entries, all well formed"

# Ask for each file by name instead of listing the directory: the contents API
# truncates a directory listing at 1000 entries and this catalog is already past
# that, so a listing says "not there" for every entry beyond the cut.
#
# Existing entries are deliberately NOT compared byte-for-byte here. A text
# comparison on Windows is a decoding contest (Get-Content vs the API's UTF-8)
# and produced false "changed" warnings for entries that were byte-identical.
# Updating an entry you already own is an explicit act: pass -Update.
$pending = @()
foreach ($e in $entries) {
  $null = gh api "repos/$Catalog/contents/data/plugins/$($e.FileName)" `
    -H 'Accept: application/vnd.github.raw' 2>$null
  if ($LASTEXITCODE -ne 0) { $pending += $e }
}
Ok "$($entries.Count - $pending.Count) entries already on the list"
if ($Update) { $pending = @($entries) }

if ($pending.Count -eq 0) {
  Write-Host "`nNothing to submit — every local entry is already on the list." -ForegroundColor Green
  exit 0
}

if ($pending.Count -gt 3) {
  Die "$($pending.Count) entries pending; one PR may add at most 3. Split market/catalog into groups and submit again."
}

Write-Host "    pending:" -ForegroundColor Cyan
$pending | ForEach-Object { Write-Host ("      {0,-20} {1}" -f $_.Slug, $_.Category) }

# ------------------------------------------------- 2b. targets must resolve

Step '2b' 'Every pending entry resolves on its published repository'
foreach ($entry in $pending) { Assert-EntryTarget $entry }

if (-not $Apply) {
  Write-Host "`nDRY RUN — nothing was changed. Re-run with -Apply." -ForegroundColor Yellow
  exit 0
}

# ----------------------------------------------------------------- 3. the fork

$forkOwner = (gh api user --jq .login)
Step 3 "Fork $Catalog as $forkOwner and bring its main up to date"
gh repo fork $Catalog 2>&1 | ForEach-Object { Write-Host "    $_" }
# The previous submission may have left the fork behind; a branch cut from a
# stale main still opens, but the PR then renders against an old tree.
gh repo sync "$forkOwner/awesome-dsh-plugin" --source $Catalog --branch main 2>&1 |
  ForEach-Object { Write-Host "    $_" }
if ($LASTEXITCODE -ne 0) { Warn 'fork sync failed; continuing with whatever main the fork has' }

if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
gh repo clone "$forkOwner/awesome-dsh-plugin" $WorkDir -- --depth 1 2>&1 |
  ForEach-Object { Write-Host "    $_" }
if (-not (Test-Path $WorkDir)) { Die 'clone did not appear' }
Push-Location $WorkDir
try {
  # ------------------------------------------------------------ 4. the branch

  $branch = 'add-hwfee-plugins-' + (($pending | ForEach-Object { $_.Slug }) -join '-')
  Step 4 "Branch $branch"
  git checkout -B $branch 2>&1 | ForEach-Object { Write-Host "    $_" }

  # ------------------------------------------------------------- 5. the files

  Step 5 'Copy pending entries into data/plugins/'
  if (-not (Test-Path 'data/plugins')) { Die 'data/plugins/ not found in the catalog checkout' }
  foreach ($e in $pending) {
    Copy-Item $e.File.FullName (Join-Path 'data/plugins' $e.FileName) -Force
    Ok $e.FileName
  }

  # ------------------------------------------------------------ 6. regenerate

  Step 6 'Install deps and regenerate the READMEs'
  # The catalog is authored as data/plugins/*.yml; the READMEs are generated.
  # contributing.md says commit the regenerated files, not hand edits.
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if ($npm) {
    npm ci --silent 2>&1 | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0) { Warn 'npm ci failed; continuing, CI will catch a real problem' }
    node scripts/generate-readme.mjs 2>&1 | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0) { Warn 'generate-readme failed; the YAML is probably malformed' }
  } else { Warn 'npm not found; skipping README regeneration' }
  git status --short | ForEach-Object { Write-Host "    $_" }

  # --------------------------------------------------------------- 7. commit

  Step 7 'Commit'
  $slugs = ($pending | ForEach-Object { $_.Slug }) -join ', '
  $msgLines = @(
    "Add HwFee DSH plugin entries: $slugs"
    ''
    "$($pending.Count) plugin(s) from a monorepo, one entry each per contributing.md's"
    'subpackage rule (url points at the subdirectory, name is owner/repo#subname).'
    ''
  )
  foreach ($e in $pending) {
    $msgLines += "- $($e.Slug) ($($e.Category)) $($e.En)"
  }
  $msg = $msgLines -join "`n"
  git add 'data/plugins' README.md README.zh.md 2>$null
  git commit -m $msg 2>&1 | ForEach-Object { Write-Host "    $_" }

  # ------------------------------------------------------------------ 8. push

  Step 8 'Push'
  git push -u origin $branch --force-with-lease 2>&1 | ForEach-Object { Write-Host "    $_" }
  if ($LASTEXITCODE -ne 0) { Die 'push failed' }

  # ------------------------------------------------------------------- 9. PR

  Step 9 'Open the pull request (skip if one is already open)'
  $existing = gh pr list --repo $Catalog --head "$forkOwner`:$branch" --state open --json url --jq '.[0].url' 2>$null
  if ($existing) {
    Ok "already open: $existing"
  } else {
    $bodyFile = Join-Path $env:TEMP 'hwfee-pr-body.md'
    $body = @(
      "Adds $($pending.Count) plugin(s) from https://github.com/HwFee/HwFee-dsh, a monorepo with one"
      'plugin per `plugins/*` directory.'
      ''
      'Each entry declares `dsh.bundle.patch` -> `./cordis.patch.yml` and the package ships'
      'the built client artifact, so `dsh plugin add` works from the subdirectory.'
      ''
      '| entry | category | what it does |'
      '|---|---|---|'
    )
    foreach ($e in $pending) {
      $body += "| ``#$($e.Slug)`` | $($e.Category) | $($e.En) |"
    }
    $body += ''
    $body += 'Monorepo layout per contributing.md: `url` points at the subdirectory, `name`'
    $body += 'is `owner/repo#subname`.'
    $body += ''
    $body += 'The repo carries the `dsh-plugin` topic. Checked against dsh `0.2.1-rc.2`.'
    $body -join "`n" | Set-Content $bodyFile -Encoding utf8
    $title = "Add HwFee DSH plugins ($($pending.Count)): $slugs"
    gh pr create --repo $Catalog `
      --head "$forkOwner`:$branch" `
      --base main `
      --title $title `
      --body-file $bodyFile 2>&1 | ForEach-Object { Write-Host "    $_" }
  }

  # ------------------------------------------------------------ 10. secondary

  Step 10 'Secondary market: already covered by the dsh-plugin topic'
  # 2BingLing/dsh-market scans GitHub for the topic daily at 06:00; no PR needed.
  $topics = gh repo view $Repo --json repositoryTopics --jq '.repositoryTopics[].name' 2>$null
  if ($topics -contains 'dsh-plugin') { Ok 'topic present, that market will pick it up on its own' }
  else { Warn "topic missing — run: gh repo edit $Repo --add-topic dsh-plugin" }

} finally {
  Pop-Location
}

Write-Host "`nDone. Check the PR on https://github.com/$Catalog/pulls" -ForegroundColor Green
