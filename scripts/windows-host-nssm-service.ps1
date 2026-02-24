[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("install", "uninstall", "start", "stop", "restart", "status", "dump", "set-env")]
    [string]$Action,

    [string]$ServiceName = "ChoreDashboardApi",
    [string]$DeployRoot = "C:\ChoreDashboard",
    [string]$AppDir,
    [string]$DataDir,
    [string]$LogsDir,
    [string]$NodeExe = "C:\Program Files\nodejs\node.exe",
    [string]$NssmExe = "nssm",
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8000,
    [string]$DatabasePath,
    [string]$AllowedOrigins = "https://chores.example.com",
    [switch]$EnableRequestLogging,
    [switch]$EnableRequestBodyLogging,
    [int]$LogRequestBodyMaxChars = 200,
    [switch]$SkipStopOnUninstall,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Resolve-HostPaths {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [string]$App,
        [string]$Data,
        [string]$Logs,
        [string]$DatabasePathValue
    )

    $resolvedApp = if ($App) { $App } else { Join-Path $Root "app" }
    $resolvedData = if ($Data) { $Data } else { Join-Path $Root "data" }
    $resolvedLogs = if ($Logs) { $Logs } else { Join-Path $Root "logs" }
    $resolvedDb = if ($DatabasePathValue) { $DatabasePathValue } else { Join-Path $resolvedData "chores.db" }

    return @{
        AppDir = $resolvedApp
        DataDir = $resolvedData
        LogsDir = $resolvedLogs
        DatabasePath = $resolvedDb
    }
}

function Write-CommandPreview {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $parts = @($Executable) + $Arguments
    Write-Host ("[nssm-helper] " + ($parts -join " "))
}

function Invoke-Nssm {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$DryRunMode
    )

    if ($DryRunMode) {
        Write-Host "[nssm-helper] (dry-run) NSSM command preview:"
        Write-CommandPreview -Executable $Executable -Arguments $Arguments
        return
    }

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "NSSM command failed with exit code $LASTEXITCODE"
    }
}

function Assert-PathExists {
    param(
        [Parameter(Mandatory = $true)][string]$PathValue,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $PathValue)) {
        throw "$Label not found: $PathValue"
    }
}

function Get-AppEnvironmentExtra {
    param(
        [Parameter(Mandatory = $true)][string]$HostValue,
        [Parameter(Mandatory = $true)][int]$PortValue,
        [Parameter(Mandatory = $true)][string]$DbPathValue,
        [Parameter(Mandatory = $true)][string]$OriginsValue,
        [Parameter(Mandatory = $true)][bool]$LogRequestsValue,
        [Parameter(Mandatory = $true)][bool]$LogRequestBodiesValue,
        [Parameter(Mandatory = $true)][int]$MaxBodyCharsValue
    )

    return @(
        "HOST=$HostValue",
        "PORT=$PortValue",
        "DATABASE_PATH=$DbPathValue",
        "ALLOWED_ORIGINS=$OriginsValue",
        "LOG_REQUESTS=$(($LogRequestsValue.ToString()).ToLowerInvariant())",
        "LOG_REQUEST_BODIES=$(($LogRequestBodiesValue.ToString()).ToLowerInvariant())",
        "LOG_REQUEST_BODY_MAX_CHARS=$MaxBodyCharsValue"
    )
}

$paths = Resolve-HostPaths -Root $DeployRoot -App $AppDir -Data $DataDir -Logs $LogsDir -DatabasePathValue $DatabasePath
$AppDir = $paths.AppDir
$DataDir = $paths.DataDir
$LogsDir = $paths.LogsDir
$DatabasePath = $paths.DatabasePath
$ApiEntrypoint = "server\index.js"
$StdoutLog = Join-Path $LogsDir "api-stdout.log"
$StderrLog = Join-Path $LogsDir "api-stderr.log"

Write-Host "[nssm-helper] action: $Action"
Write-Host "[nssm-helper] service: $ServiceName"
Write-Host "[nssm-helper] deploy root: $DeployRoot"
Write-Host "[nssm-helper] app dir: $AppDir"
Write-Host "[nssm-helper] data dir: $DataDir"
Write-Host "[nssm-helper] logs dir: $LogsDir"
Write-Host "[nssm-helper] database path: $DatabasePath"
Write-Host "[nssm-helper] host/port: $BindHost`:$Port"
Write-Host "[nssm-helper] dry-run: $([bool]$DryRun)"
Write-Host ""

switch ($Action) {
    "install" {
        if (-not $DryRun) {
            Assert-PathExists -PathValue $NodeExe -Label "Node executable"
            Assert-PathExists -PathValue $AppDir -Label "App directory"
            Assert-PathExists -PathValue (Join-Path $AppDir $ApiEntrypoint) -Label "API entrypoint"
            New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
            New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
        }
        else {
            Write-Host "[nssm-helper] (dry-run) would ensure logs/data directories exist"
        }

        $envArgs = Get-AppEnvironmentExtra `
            -HostValue $BindHost `
            -PortValue $Port `
            -DbPathValue $DatabasePath `
            -OriginsValue $AllowedOrigins `
            -LogRequestsValue ([bool]$EnableRequestLogging) `
            -LogRequestBodiesValue ([bool]$EnableRequestBodyLogging) `
            -MaxBodyCharsValue $LogRequestBodyMaxChars

        Invoke-Nssm -Executable $NssmExe -Arguments @("install", $ServiceName, $NodeExe, $ApiEntrypoint) -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments @("set", $ServiceName, "AppDirectory", $AppDir) -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments @("set", $ServiceName, "AppStdout", $StdoutLog) -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments @("set", $ServiceName, "AppStderr", $StderrLog) -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments @("set", $ServiceName, "AppRotateFiles", "1") -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments @("set", $ServiceName, "AppRotateOnline", "1") -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments @("set", $ServiceName, "AppRotateBytes", "10485760") -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments @("set", $ServiceName, "Start", "SERVICE_AUTO_START") -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments @("set", $ServiceName, "DisplayName", "Chore Dashboard API") -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments @("set", $ServiceName, "Description", "Express API service for Chore Dashboard") -DryRunMode:$DryRun
        Invoke-Nssm -Executable $NssmExe -Arguments (@("set", $ServiceName, "AppEnvironmentExtra") + $envArgs) -DryRunMode:$DryRun
        break
    }

    "set-env" {
        $envArgs = Get-AppEnvironmentExtra `
            -HostValue $BindHost `
            -PortValue $Port `
            -DbPathValue $DatabasePath `
            -OriginsValue $AllowedOrigins `
            -LogRequestsValue ([bool]$EnableRequestLogging) `
            -LogRequestBodiesValue ([bool]$EnableRequestBodyLogging) `
            -MaxBodyCharsValue $LogRequestBodyMaxChars

        Invoke-Nssm -Executable $NssmExe -Arguments (@("set", $ServiceName, "AppEnvironmentExtra") + $envArgs) -DryRunMode:$DryRun
        break
    }

    "start" {
        Invoke-Nssm -Executable $NssmExe -Arguments @("start", $ServiceName) -DryRunMode:$DryRun
        break
    }

    "stop" {
        Invoke-Nssm -Executable $NssmExe -Arguments @("stop", $ServiceName) -DryRunMode:$DryRun
        break
    }

    "restart" {
        Invoke-Nssm -Executable $NssmExe -Arguments @("restart", $ServiceName) -DryRunMode:$DryRun
        break
    }

    "status" {
        if ($DryRun) {
            Write-Host "[nssm-helper] (dry-run) would query service status and NSSM config"
            break
        }

        try {
            $svc = Get-Service -Name $ServiceName -ErrorAction Stop
            Write-Host "[nssm-helper] Windows service status: $($svc.Status)"
        }
        catch {
            throw "Windows service '$ServiceName' was not found"
        }

        try {
            Invoke-Nssm -Executable $NssmExe -Arguments @("status", $ServiceName)
        }
        catch {
            Write-Host "[nssm-helper] warning: failed to query 'nssm status'. Windows service status was returned above."
        }
        break
    }

    "dump" {
        Invoke-Nssm -Executable $NssmExe -Arguments @("dump", $ServiceName) -DryRunMode:$DryRun
        break
    }

    "uninstall" {
        if (-not $SkipStopOnUninstall) {
            try {
                Invoke-Nssm -Executable $NssmExe -Arguments @("stop", $ServiceName) -DryRunMode:$DryRun
            }
            catch {
                if ($DryRun) {
                    throw
                }
                Write-Host "[nssm-helper] warning: stop failed before uninstall; continuing to remove service"
            }
        }

        Invoke-Nssm -Executable $NssmExe -Arguments @("remove", $ServiceName, "confirm") -DryRunMode:$DryRun
        break
    }
}

Write-Host ""
Write-Host "[nssm-helper] completed action: $Action"
