[CmdletBinding()]
param(
    [ValidateSet("warm", "cold")]
    [string]$Mode = "warm",
    [string]$AppDir = "C:\ChoreDashboard\app",
    [string]$DatabasePath = "C:\ChoreDashboard\data\chores.db",
    [string]$BackupRoot = "C:\ChoreDashboard\backups",
    [string]$ServiceName = "ChoreDashboardApi",
    [string]$NssmHelperScript,
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

function Invoke-NpmInAppDir {
    param(
        [Parameter(Mandatory = $true)][string]$AppDirectory,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$DryRunMode
    )

    if ($DryRunMode) {
        Write-Host "[scheduled-backup] (dry-run) npm " ($Arguments -join " ")
        return
    }

    Push-Location $AppDirectory
    try {
        & npm @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-NssmHelper {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string]$Action,
        [Parameter(Mandatory = $true)][string]$Service,
        [switch]$DryRunMode
    )

    if ($DryRunMode) {
        Write-Host "[scheduled-backup] (dry-run) `"$ScriptPath`" -Action $Action -ServiceName $Service"
        return
    }

    & $ScriptPath -Action $Action -ServiceName $Service
    if ($LASTEXITCODE -ne 0) {
        throw "NSSM helper action '$Action' failed with exit code $LASTEXITCODE"
    }
}

if (-not $NssmHelperScript) {
    $NssmHelperScript = Join-Path $AppDir "scripts\windows-host-nssm-service.ps1"
}

Write-Host "[scheduled-backup] mode: $Mode"
Write-Host "[scheduled-backup] app dir: $AppDir"
Write-Host "[scheduled-backup] database path: $DatabasePath"
Write-Host "[scheduled-backup] backup root: $BackupRoot"
Write-Host "[scheduled-backup] service: $ServiceName"
Write-Host "[scheduled-backup] dry-run: $([bool]$DryRun)"
Write-Host ""

if (-not $DryRun) {
    Assert-PathExists -PathValue $AppDir -Label "App directory"
    Assert-PathExists -PathValue (Join-Path $AppDir "package.json") -Label "package.json"
    Assert-PathExists -PathValue (Join-Path $AppDir "scripts\backup-db.mjs") -Label "Backup helper script"
    if ($Mode -eq "cold") {
        Assert-PathExists -PathValue $NssmHelperScript -Label "NSSM helper script"
    }
}

$serviceStopped = $false
$backupFailed = $false

try {
    if ($Mode -eq "cold") {
        Invoke-NssmHelper -ScriptPath $NssmHelperScript -Action "stop" -Service $ServiceName -DryRunMode:$DryRun
        $serviceStopped = $true
    }

    Invoke-NpmInAppDir -AppDirectory $AppDir -Arguments @(
        "run",
        "db:backup",
        "--",
        "--db",
        $DatabasePath,
        "--out-dir",
        $BackupRoot
    ) -DryRunMode:$DryRun
}
catch {
    $backupFailed = $true
    throw
}
finally {
    if ($Mode -eq "cold" -and $serviceStopped) {
        try {
            Invoke-NssmHelper -ScriptPath $NssmHelperScript -Action "start" -Service $ServiceName -DryRunMode:$DryRun
        }
        catch {
            if ($backupFailed) {
                Write-Host "[scheduled-backup] warning: backup failed and service restart also failed"
                throw
            }
            throw
        }
    }
}

Write-Host ""
Write-Host "[scheduled-backup] completed (mode=$Mode)"
