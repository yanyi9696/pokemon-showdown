param(
    [string]$SettingsFile = (Join-Path $PSScriptRoot 'local-development.json'),
    [string]$ServerRoot,
    [string]$ClientRoot,
    [switch]$Rebuild,
    [switch]$CheckOnly,
    [switch]$NoOpen,
    [switch]$Foreground
)
# Install this small bootstrap beside the .cmd and settings file.
$ErrorActionPreference = 'Stop'
try {
    $SettingsFile = (Resolve-Path -LiteralPath $SettingsFile).Path
    $settings = Get-Content -LiteralPath $SettingsFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $repository = $settings.serverRepository
    if (!$repository -or $repository -match '^(\\\\|//|\w+://)') { throw 'Server repository must be a local directory.' }
    if (![IO.Path]::IsPathRooted($repository)) { $repository = Join-Path (Split-Path $SettingsFile -Parent) $repository }
    $listing = @(& git -C $repository worktree list --porcelain)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot discover local Git worktrees.' }
    $toolsRoot = $null
    $currentRoot = $null
    foreach ($line in $listing) {
        if ($line.StartsWith('worktree ')) { $currentRoot = $line.Substring(9) }
        if ($line -eq "branch refs/heads/$($settings.toolsBranch)") { $toolsRoot = $currentRoot }
    }
    if (!$toolsRoot) { throw "No checked-out tools worktree for $($settings.toolsBranch). No branch was changed." }
    $script = Join-Path $toolsRoot 'tools\restart-local-development.ps1'
    if (!(Test-Path -LiteralPath $script)) { throw "Updater not found: $script" }
    $arguments = @{SettingsFile = $SettingsFile; Rebuild = $Rebuild; CheckOnly = $CheckOnly}
    if ($NoOpen) { $arguments.NoOpen = $true }
    if ($Foreground) { $arguments.Foreground = $true }
    if ($ServerRoot) { $arguments.ServerRoot = $ServerRoot }
    if ($ClientRoot) { $arguments.ClientRoot = $ClientRoot }
    & $script @arguments
    exit $LASTEXITCODE
} catch {
    Write-Host "Local update failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
