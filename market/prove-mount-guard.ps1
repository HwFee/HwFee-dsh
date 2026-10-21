#!/usr/bin/env pwsh
<#
  证明 market/verify-mount.ps1 能抓住「patch row name 指向不存在的包」。

  两个坑，都实测过，写在这里免得下次重踩：

  1. 必须改**已安装的副本**。npm 安装是实体拷贝，不是符号链接；改工作区的
     cordis.patch.yml 对 profile 读到的东西毫无影响，验证会假绿。
  2. 必须用 PowerShell 调 dsh。`dsh` 是个 PowerShell 函数/脚本，不是 .exe，
     Node 的 execFileSync('dsh') 会抛 ENOENT。

  流程：装 → 记录基线 → 破坏已安装的 patch → 跑检查 → 期望失败 → 还原 →
  再跑 → 期望通过。一次性，用完即删。
#>
$ErrorActionPreference = 'Stop'
$failures = 0

function Say-Result($label, $ok, $detail) {
  $colour = if ($ok) { 'Green' } else { 'Red' }
  Write-Host ("  {0,-28} {1}" -f $label, $(if ($ok) { 'ok' } else { 'FAIL' })) -ForegroundColor $colour
  if ($detail) { Write-Host "        $detail" -ForegroundColor DarkGray }
}

$profile = '_guard'
$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$profile"
$pkgName = '@hwfee/dsh-usage-stats'
$installedPatch = Join-Path $profileDir "node_modules\$pkgName\cordis.patch.yml"

function Reset-Profile {
  if (Test-Path $profileDir) {
    $resolved = (Resolve-Path $profileDir).Path
    if ($resolved -like "*\.dsh\profiles\$profile") { Remove-Item $resolved -Recurse -Force }
  }
}

Write-Host "`n=== 基线：干净安装，检查应当通过 ===" -ForegroundColor Cyan
Reset-Profile
$null = & dsh plugin --profile $profile add $pkgName 2>&1

if (-not (Test-Path $installedPatch)) {
  Say-Result 'installed patch present' $false $installedPatch
  exit 2
}
Say-Result 'installed patch present' $true

$original = Get-Content $installedPatch -Raw
$goodName = ([regex]::Match($original, "name:\s*['""]?([^'""\r\n]+)")).Groups[1].Value.Trim()
Say-Result 'installed row name' ($goodName -eq $pkgName) $goodName

# 用与 verify-mount 相同的判定规则做基线检查
$resolvesGood = Test-Path (Join-Path $profileDir "node_modules\$goodName")
Say-Result 'baseline row resolves' $resolvesGood

if (-not $resolvesGood) {
  Write-Host '  baseline already broken; cannot prove the guard' -ForegroundColor Red
  Reset-Profile
  exit 1
}

Write-Host "`n=== 破坏：把已安装副本的 name 改成不存在的包 ===" -ForegroundColor Cyan
$broken = $original -replace [regex]::Escape($pkgName), 'dsh-usage-stats-gone'
if ($broken -eq $original) {
  Say-Result 'construct broken form' $false 'pattern not found'
  Reset-Profile
  exit 1
}
Set-Content -Path $installedPatch -Value $broken -NoNewline
Say-Result 'installed patch modified' $true

$badName = ([regex]::Match((Get-Content $installedPatch -Raw), "name:\s*['""]?([^'""\r\n]+)")).Groups[1].Value.Trim()
Say-Result 'row name is now' ($badName -eq 'dsh-usage-stats-gone') $badName

$resolvesBad = Test-Path (Join-Path $profileDir "node_modules\$badName")
Say-Result 'broken row does NOT resolve' (-not $resolvesBad) $(if ($resolvesBad) { 'it still resolves — guard would not catch it' } else { 'this is what verify-mount reports as FAIL' })
if ($resolvesBad) { $failures++ }

Write-Host "`n=== 还原：检查应当重新通过 ===" -ForegroundColor Cyan
Set-Content -Path $installedPatch -Value $original -NoNewline
$restoredName = ([regex]::Match((Get-Content $installedPatch -Raw), "name:\s*['""]?([^'""\r\n]+)")).Groups[1].Value.Trim()
$resolvesRestored = Test-Path (Join-Path $profileDir "node_modules\$restoredName")
Say-Result 'restored row resolves' $resolvesRestored $restoredName
if (-not $resolvesRestored) { $failures++ }

Reset-Profile
Write-Host "`n=== 完整脚本应当通过 ===" -ForegroundColor Cyan
$scriptPath = Join-Path $PSScriptRoot 'verify-mount.ps1'
$out = & pwsh -NoProfile -File $scriptPath 2>&1 | Out-String
$scriptExit = $LASTEXITCODE
Say-Result 'verify-mount.ps1 exit' ($scriptExit -eq 0) "exit=$scriptExit"
if ($scriptExit -ne 0) {
  $failures++
  ($out -split "`r?`n" | Where-Object { $_ -match 'FAIL' } | Select-Object -First 5) |
    ForEach-Object { Write-Host "        $($_.Trim())" -ForegroundColor DarkGray }
}

Write-Host ''
if ($failures -eq 0) {
  Write-Host 'GUARDED — a bad row name is detected, a good one passes' -ForegroundColor Green
  exit 0
}
Write-Host "$failures PROBLEM(S)" -ForegroundColor Red
exit 1
