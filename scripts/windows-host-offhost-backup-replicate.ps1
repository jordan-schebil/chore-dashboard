[CmdletBinding()]
param(
    [string]$LocalBackupRoot = "C:\ChoreDashboard\backups",
    [string]$ReplicaRoot = "\\NAS01\ChoreDashboardBackups\windows-host-01",
    [string]$Pattern = "chore-db-*",
    [int]$RobocopyRetries = 2,
    [int]$RobocopyWaitSec = 5,
    [switch]$CreateReplicaRoot,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Assert-PathExists {
    param(
        [Parameter(Mandatory = $true)][string]$PathValue,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $PathValue)) {
        throw "$Label not found: $PathValue"
    }
}

if (-not $DryRun) {
    Assert-PathExists -PathValue $LocalBackupRoot -Label "Local backup root"
}

$latestLocal = Get-ChildItem -LiteralPath $LocalBackupRoot -Directory -Filter $Pattern -ErrorAction SilentlyContinue |
    Sort-Object Name |
    Select-Object -Last 1

Write-Host "[offhost-replicate] local backup root: $LocalBackupRoot"
Write-Host "[offhost-replicate] replica root: $ReplicaRoot"
Write-Host "[offhost-replicate] folder pattern: $Pattern"
Write-Host "[offhost-replicate] create replica root: $([bool]$CreateReplicaRoot)"
Write-Host "[offhost-replicate] dry-run: $([bool]$DryRun)"
Write-Host ""

if (-not $latestLocal) {
    if ($DryRun) {
        Write-Host "[offhost-replicate] note: no local backup folders matched '$Pattern' (dry-run preview only)"
    }
    else {
        throw "No local backup folders matched pattern '$Pattern' under $LocalBackupRoot"
    }
}
else {
    Write-Host "[offhost-replicate] latest local backup: $($latestLocal.Name)"
}

$robocopyArgs = @(
    $LocalBackupRoot,
    $ReplicaRoot,
    "*",
    "/E",
    "/R:$RobocopyRetries",
    "/W:$RobocopyWaitSec",
    "/NFL",
    "/NDL",
    "/NP"
)

if ($DryRun) {
    Write-Host "[offhost-replicate] (dry-run) robocopy command preview:"
    Write-Host ("robocopy " + ($robocopyArgs -join " "))
    if ($latestLocal) {
        $expectedReplica = Join-Path $ReplicaRoot $latestLocal.Name
        Write-Host "[offhost-replicate] (dry-run) verification checks:"
        Write-Host "  - Test-Path `"$expectedReplica`""
        Write-Host "  - Test-Path `"$expectedReplica\backup-manifest.json`""
    }
    Write-Host ""
    Write-Host "[offhost-replicate] dry-run complete (no copy performed)"
    exit 0
}

if (-not (Test-Path -LiteralPath $ReplicaRoot)) {
    if ($CreateReplicaRoot) {
        New-Item -ItemType Directory -Path $ReplicaRoot -Force | Out-Null
    }
    else {
        throw "Replica root not found: $ReplicaRoot (use -CreateReplicaRoot for initial setup)"
    }
}

& robocopy @robocopyArgs
$robocopyExit = $LASTEXITCODE
Write-Host "[offhost-replicate] robocopy exit code: $robocopyExit"

if ($robocopyExit -ge 8) {
    throw "robocopy failed with exit code $robocopyExit"
}

$replicaLatest = Join-Path $ReplicaRoot $latestLocal.Name
$replicaManifest = Join-Path $replicaLatest "backup-manifest.json"

if (-not (Test-Path -LiteralPath $replicaLatest)) {
    throw "Latest replicated backup folder not found: $replicaLatest"
}
if (-not (Test-Path -LiteralPath $replicaManifest)) {
    throw "Replicated backup manifest not found: $replicaManifest"
}

Write-Host "[offhost-replicate] verification passed for latest replicated backup"
Write-Host "[offhost-replicate] completed"
exit 0
