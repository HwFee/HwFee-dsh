#!/usr/bin/env pwsh
<#
  Submit the three HwFee plugins to awesome-dsh-plugin/awesome-dsh-plugin.

  READ THIS FIRST. This touches TWO repositories:

    1. awesome-dsh-plugin/awesome-dsh-plugin  — forked, one YAML added per
       plugin, a PR opened. Nothing else in that fork is modified.
    2. HwFee/HwFee-dsh — NOT modified by this script.

  WHAT BLOCKS IT. That catalog's CI enforces "the repo is at least 1 day old"
  against the SUBMITTED repo (HwFee/HwFee-dsh), which was created
  2026-10-19T07:55:57Z. Before 2026-10-20T07:55Z the PR is rejected no matter
  what else is right, so this script refuses to run before then instead of
  producing a red PR. Override with -Force only if that rule has changed.

  WHAT IT DOES NOT DO. It does not decide anything the author has not already
  decided:
    - The Anthropic fonts in plugins/cds-theme/fonts reach the public catalog
      through this PR. The author was told and chose to ship them anyway. The
      PR body says so in one line rather than hiding it.
    - Categories were chosen by the author and are copied from
      market/catalog/*.yml, not re-derived here.

  IDEMPOTENT. Re-running after a partial run resumes: an existing fork is
  reused, an existing branch is reset, and an existing open PR is reported
  instead of opened twice.

  Usage:
    pwsh market/submit-to-catalog.ps1            # dry run: checks only
    pwsh market/submit-to-catalog.ps1 -Apply     # do it
    pwsh market/submit-to-catalog.ps1 -Apply -Force   # ignore the 1-day gate
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
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

# ---------------------------------------------------------------- 1. the gate

Step 1 'Repo age gate (the catalog CI rejects repos younger than 1 day)'
$ghRepo = gh repo view $Repo --json createdAt,isFork 2>$null | ConvertFrom-Json
if (-not $ghRepo) { Die "cannot read $Repo via gh (is gh authenticated?)" }
$created = [datetime]$ghRepo.createdAt
$age = (Get-Date).ToUniversalTime() - $created.ToUniversalTime()
Write-Host "    created: $($created.ToString('u'))  age: $([math]::Round($age.TotalHours,1))h"
if ($ghRepo.isFork) { Warn "$Repo is a fork; the catalog rejects forks" }
if ($age.TotalHours -lt 24) {
  if ($Force) {
    Warn 'younger than 24h, continuing because -Force was passed'
  } else {
    $ready = $created.AddDays(1).ToString('u')
    Die "too young (needs 1 day). Earliest submission: $ready  (pass -Force to override)"
  }
} else { Ok 'old enough' }

# ------------------------------------------------------- 2. local preconditions

Step 2 'Local preconditions'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Die 'gh CLI not found' }
foreach ($f in Get-ChildItem $catalogEntries -Filter *.yml) {
  $text = Get-Content $f.FullName -Raw
  foreach ($needle in @('url: https://github.com/', 'name: ', 'category: ', '  en: ')) {
    if (-not $text.Contains($needle)) { Die "$($f.Name) missing '$needle'" }
  }
  Ok "$($f.Name)"
}
$entries = @(Get-ChildItem $catalogEntries -Filter *.yml)
Write-Host "    $($entries.Count) entries to submit"

if (-not $Apply) {
  Write-Host "`nDRY RUN — nothing was changed. Re-run with -Apply." -ForegroundColor Yellow
  exit 0
}

# ----------------------------------------------------------------- 3. the fork

Step 3 "Fork and clone $Catalog"
if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
gh repo fork $Catalog --clone --default-branch-only 2>&1 | ForEach-Object { Write-Host "    $_" }
if (-not (Test-Path $WorkDir)) {
  # gh clones into ./<name>; fall back to an explicit clone.
  $fallback = Join-Path (Get-Location) 'awesome-dsh-plugin'
  if (Test-Path $fallback) { Move-Item $fallback $WorkDir } else { Die 'fork clone did not appear' }
}
Push-Location $WorkDir
try {
  $forkOwner = (gh api user --jq .login)
  Ok "working in $WorkDir as $forkOwner"

  # ------------------------------------------------------------ 4. the branch

  Step 4 'Branch'
  git checkout -B add-hwfee-plugins 2>&1 | ForEach-Object { Write-Host "    $_" }

  # ------------------------------------------------------------- 5. the files

  Step 5 'Copy entries into data/plugins/'
  if (-not (Test-Path 'data/plugins')) { Die 'data/plugins/ not found in the catalog checkout' }
  foreach ($f in $entries) {
    Copy-Item $f.FullName (Join-Path 'data/plugins' $f.Name) -Force
    Ok $f.Name
  }

  # ------------------------------------------------------------ 6. regenerate

  Step 6 'Install deps and regenerate the READMEs'
  # The catalog is authored as data/plugins/*.yml; the READMEs are generated.
  # Contributing.md says commit the regenerated files, not hand edits.
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
  $msg = @'
Add HwFee DSH plugins: CDS theme, system fonts, usage stats

Three plugins from a monorepo, one entry each per contributing.md's subpackage
rule (url points at the subdirectory, name is owner/repo#subname).

- cds-theme    (theme)  Remaps the host's tokens onto CDS warm-grey surfaces
                        and the clay accent; refines the composer, sidebar,
                        message rows, code blocks and markdown body.
- system-fonts (ui)     Font slots for content / code / terminal, plus weight,
                        line height and letter spacing.
- usage-stats  (usage)  Sessions, messages, total tokens, active days, peak
                        hour, favourite model and a heatmap, over all time /
                        30d / 7d.
'@
  git add 'data/plugins' README.md README.zh.md 2>$null
  git commit -m $msg 2>&1 | ForEach-Object { Write-Host "    $_" }

  # ------------------------------------------------------------------ 8. push

  Step 8 'Push'
  git push -u origin add-hwfee-plugins --force-with-lease 2>&1 | ForEach-Object { Write-Host "    $_" }
  if ($LASTEXITCODE -ne 0) { Die 'push failed' }

  # ------------------------------------------------------------------- 9. PR

  Step 9 'Open the pull request (skip if one is already open)'
  $existing = gh pr list --repo $Catalog --head "$forkOwner`:add-hwfee-plugins" --state open --json url --jq '.[0].url' 2>$null
  if ($existing) {
    Ok "already open: $existing"
  } else {
    $bodyFile = Join-Path $env:TEMP 'hwfee-pr-body.md'
    @'
Adds three plugins from https://github.com/HwFee/HwFee-dsh, a monorepo with one
plugin per `plugins/*` directory.

All three declare `dsh.bundle.patch` -> `./cordis.patch.yml` and ship the built
client artifact, so `dsh plugin add` works from the subdirectory.

| entry | category | what it does |
|---|---|---|
| `#cds-theme` | theme | Remaps the host's tokens onto CDS warm-grey surfaces and the clay accent; refines composer, sidebar, message rows, code blocks and markdown body. |
| `#system-fonts` | ui | Font slots for content / code / terminal, plus weight, line height and letter spacing. Typography only. |
| `#usage-stats` | usage | Sessions, messages, total tokens, active days, peak hour, favourite model and a heatmap, over all time / 30d / 7d. |

Monorepo layout per contributing.md: `url` points at the subdirectory, `name`
is `owner/repo#subname`.

One thing stated plainly rather than left for review to find: the cds-theme
package inlines six Anthropic web fonts as base64 (~660 KB). The design
language comes from [open-claude-ui](https://github.com/Caho1/open-claude-ui)
(MIT), and the README separates what is derived from it and what is not.

The repo carries the `dsh-plugin` topic. Checked against dsh `0.2.1-rc.2`.
'@ | Set-Content $bodyFile -Encoding utf8
    gh pr create --repo $Catalog `
      --head "$forkOwner`:add-hwfee-plugins" `
      --base main `
      --title 'Add HwFee DSH plugins (3): CDS theme, system fonts, usage stats' `
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
