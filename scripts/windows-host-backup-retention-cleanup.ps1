[CmdletBinding()]
param(
    [string]$BackupRoot = "C:\ChoreDashboard\backups",
    [string]$Pattern = "chore-db-*",
    [int]$KeepCount = 14,
    [int]$MaxAgeDays = 0,
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

if ($KeepCount -lt 0) {
    throw "KeepCount must be >= 0"
}
if ($MaxAgeDays -lt 0) {
    throw "MaxAgeDays must be >= 0"
}
if ($KeepCount -eq 0 -and $MaxAgeDays -eq 0) {
    throw "At least one retention rule is required (set KeepCount > 0 and/or MaxAgeDays > 0)"
}

if (-not (Test-Path -LiteralPath $BackupRoot)) {
    throw "Backup root not found: $BackupRoot"
}

$allDirs = @(
    Get-ChildItem -LiteralPath $BackupRoot -Directory -Filter $Pattern |
        Sort-Object Name
)

Write-Host "[backup-retention] backup root: $BackupRoot"
Write-Host "[backup-retention] pattern: $Pattern"
Write-Host "[backup-retention] keep count: $KeepCount"
Write-Host "[backup-retention] max age days: $MaxAgeDays"
Write-Host "[backup-retention] apply deletions: $([bool]$Apply)"
Write-Host "[backup-retention] matched folders: $($allDirs.Count)"
Write-Host ""

if ($allDirs.Count -eq 0) {
    Write-Host "[backup-retention] no backup folders matched"
    exit 0
}

$countRetentionEnabled = ($KeepCount -gt 0)
$protectedIndexStart = if ($countRetentionEnabled) { [Math]::Max(0, $allDirs.Count - $KeepCount) } else { $allDirs.Count }
$cutoff = if ($MaxAgeDays -gt 0) { (Get-Date).AddDays(-$MaxAgeDays) } else { $null }

$candidates = [System.Collections.Generic.List[object]]::new()

for ($i = 0; $i -lt $allDirs.Count; $i += 1) {
    $dir = $allDirs[$i]

    $isProtectedByCount = ($countRetentionEnabled -and $i -ge $protectedIndexStart)
    if ($isProtectedByCount) {
        continue
    }

    $reasons = [System.Collections.Generic.List[string]]::new()
    if ($countRetentionEnabled) {
        $reasons.Add("count") | Out-Null
    }
    if ($cutoff -and $dir.LastWriteTime -lt $cutoff) {
        $reasons.Add("age") | Out-Null
    }
    if ($reasons.Count -eq 0) {
        continue
    }

    $candidates.Add([pscustomobject]@{
        Name = $dir.Name
        FullName = $dir.FullName
        LastWriteTime = $dir.LastWriteTime
        Reason = ($reasons -join "+")
    }) | Out-Null
}

if ($candidates.Count -eq 0) {
    Write-Host "[backup-retention] nothing to delete (within current retention policy)"
    exit 0
}

Write-Host "[backup-retention] deletion candidates (oldest first):"
foreach ($entry in $candidates) {
    Write-Host "  - $($entry.Name)  [reason=$($entry.Reason); last_write=$($entry.LastWriteTime.ToString('s'))]"
}

if (-not $Apply) {
    Write-Host ""
    Write-Host "[backup-retention] preview only (use -Apply to delete listed folders)"
    exit 0
}

foreach ($entry in $candidates) {
    Remove-Item -LiteralPath $entry.FullName -Recurse -Force
    Write-Host "[backup-retention] deleted: $($entry.FullName)"
}

Write-Host ""
Write-Host "[backup-retention] completed"
