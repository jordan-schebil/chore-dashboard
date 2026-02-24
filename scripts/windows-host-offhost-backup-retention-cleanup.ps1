[CmdletBinding()]
param(
    [string]$ReplicaRoot = "\\NAS01\ChoreDashboardBackups\windows-host-01",
    [string]$Pattern = "chore-db-*",
    [int]$KeepCount = 30,
    [int]$MaxAgeDays = 0,
    [switch]$Apply,
    [string]$HelperScriptPath
)

$ErrorActionPreference = "Stop"

if (-not $HelperScriptPath) {
    $HelperScriptPath = Join-Path $PSScriptRoot "windows-host-backup-retention-cleanup.ps1"
}

if (-not (Test-Path -LiteralPath $HelperScriptPath)) {
    throw "Local retention helper script not found: $HelperScriptPath"
}

Write-Host "[offhost-retention] replica root: $ReplicaRoot"
Write-Host "[offhost-retention] keep count: $KeepCount"
Write-Host "[offhost-retention] max age days: $MaxAgeDays"
Write-Host "[offhost-retention] apply deletions: $([bool]$Apply)"
Write-Host "[offhost-retention] helper: $HelperScriptPath"
Write-Host ""

& $HelperScriptPath `
    -BackupRoot $ReplicaRoot `
    -Pattern $Pattern `
    -KeepCount $KeepCount `
    -MaxAgeDays $MaxAgeDays `
    -Apply:$Apply

if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

exit 0
