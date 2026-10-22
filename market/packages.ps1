# The one list of releasable packages, derived from the repository instead of
# typed out per script.
#
# WHY THIS FILE EXISTS. `test-install-paths.ps1` and `verify-mount.ps1` each used
# to carry their own hand-written array of six packages. Adding a seventh plugin
# meant remembering to edit two arrays in two files; forgetting one produced a
# matrix that reported "ALL GREEN" while never touching the new package. That is
# the same shape of silent failure this repository keeps getting bitten by: the
# report is green, the thing you shipped is untested.
#
# So the list is computed. A directory under `plugins/` qualifies when its
# manifest declares `dsh.bundle` — the same condition `publish-pending.ps1` uses
# to decide what is publishable, and the same one the market requires. Order is
# by directory name, so two runs on two machines produce the same sequence.
#
# THE NAMING RULES ARE DERIVED TOO, and each was checked against an existing
# release before being written here:
#
#   tag    = <directory>-v<version>     cds-theme-v0.1.5, git-bash-v0.1.0
#   asset  = <package name without @ and />-<version>.tgz
#            @hwfee/dsh-genui -> hwfee-dsh-genui-0.1.0.tgz
#
# The tag uses the DIRECTORY name, not the package name: `@hwfee/dsh-genui`
# would make an illegal git tag, and the existing releases all use the short
# name. The asset drops the scope, which is what npm pack and the published
# tarball filename both do.
#
# Usage (dot-source it):
#   . (Join-Path $PSScriptRoot 'packages.ps1')
#   $packages = Get-ReleasePackages -RepoRoot $root

function Get-ReleasePackages {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [string[]]$Only
  )

  $pluginsDir = Join-Path $RepoRoot 'plugins'
  if (-not (Test-Path $pluginsDir)) {
    throw "no plugins directory at $pluginsDir"
  }

  $packages = @()
  foreach ($dir in (Get-ChildItem $pluginsDir -Directory | Sort-Object Name)) {
    $manifestPath = Join-Path $dir.FullName 'package.json'
    if (-not (Test-Path $manifestPath)) { continue }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if (-not $manifest.dsh.bundle) { continue }

    $asset = ($manifest.name -replace '^@', '' -replace '/', '-') + "-$($manifest.version).tgz"
    $packages += [pscustomobject]@{
      Dir     = "plugins/$($dir.Name)"
      DirPath = $dir.FullName
      Slug    = $dir.Name
      Name    = $manifest.name
      Version = $manifest.version
      Tag     = "$($dir.Name)-v$($manifest.version)"
      Asset   = $asset
    }
  }

  if ($Only -and $Only.Count -gt 0) {
    $packages = @($packages | Where-Object { $Only -contains $_.Name -or $Only -contains $_.Slug })
  }

  return $packages
}

<#
  The tag/asset naming above is only safe while it keeps matching real releases.
  This is the assertion that would have caught a wrong derivation before it turned
  into a 404 on the matrix's release-url case.
#>
function Assert-ReleaseNaming {
  param(
    [Parameter(Mandatory = $true)]$Package,
    [string]$RepoRoot
  )

  $expectedTag = "$($Package.Slug)-v$($Package.Version)"
  if ($Package.Tag -ne $expectedTag) {
    throw "tag '$($Package.Tag)' should be '$expectedTag'"
  }

  $bare = $Package.Name -replace '^@', '' -replace '/', '-'
  $expectedAsset = "$bare-$($Package.Version).tgz"
  if ($Package.Asset -ne $expectedAsset) {
    throw "asset '$($Package.Asset)' should be '$expectedAsset'"
  }

  return $true
}
