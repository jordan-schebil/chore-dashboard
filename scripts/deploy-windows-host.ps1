[CmdletBinding()]
param(
    [string]$ArtifactDir,
    [string]$TargetRoot = ".\deployments\windows-host",
    [switch]$SkipInstall,
    [switch]$StartApi,
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8000,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Resolve-AbsolutePath {
    param([Parameter(Mandatory = $true)][string]$PathValue)
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $PathValue))
}

function Get-LatestArtifactDir {
    param([Parameter(Mandatory = $true)][string]$ArtifactsRoot)

    if (-not (Test-Path -LiteralPath $ArtifactsRoot)) {
        throw "Artifacts root not found: $ArtifactsRoot"
    }

    $latest = Get-ChildItem -LiteralPath $ArtifactsRoot -Directory |
        Sort-Object Name |
        Select-Object -Last 1

    if (-not $latest) {
        throw "No artifact directories found under: $ArtifactsRoot"
    }

    return $latest.FullName
}

function Assert-ArtifactLayout {
    param([Parameter(Mandatory = $true)][string]$ArtifactPath)

    $required = @(
        "release-manifest.json",
        "server",
        "dist",
        "package.json",
        "package-lock.json"
    )

    foreach ($item in $required) {
        $candidate = Join-Path $ArtifactPath $item
        if (-not (Test-Path -LiteralPath $candidate)) {
            throw "Artifact is missing required item: $item"
        }
    }
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [switch]$DryRunMode
    )

    if ($DryRunMode) {
        Write-Host "[deploy-windows-host] (dry-run) $Label"
        return
    }

    & $Action
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$artifactPath = $ArtifactDir
if (-not $artifactPath) {
    $artifactPath = Get-LatestArtifactDir -ArtifactsRoot (Join-Path $repoRoot "release-artifacts")
}
$artifactPath = Resolve-AbsolutePath -PathValue $artifactPath
Assert-ArtifactLayout -ArtifactPath $artifactPath

$targetRootPath = Resolve-AbsolutePath -PathValue $TargetRoot
$appDir = Join-Path $targetRootPath "app"
$dataDir = Join-Path $targetRootPath "data"
$databasePath = Join-Path $dataDir "chores.db"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$previousAppDir = Join-Path $targetRootPath "app.previous.$timestamp"

$artifactName = Split-Path -Leaf $artifactPath

Write-Host "[deploy-windows-host] target shape: single Windows host (API process + separately hosted frontend/static files)"
Write-Host "[deploy-windows-host] artifact: $artifactPath"
Write-Host "[deploy-windows-host] target root: $targetRootPath"
Write-Host "[deploy-windows-host] app dir: $appDir"
Write-Host "[deploy-windows-host] data dir: $dataDir"
Write-Host "[deploy-windows-host] database path (runtime): $databasePath"
Write-Host "[deploy-windows-host] host/port (if started): $BindHost`:$Port"

Invoke-Step -Label "Create target root ($targetRootPath)" -DryRunMode:$DryRun {
    New-Item -ItemType Directory -Path $targetRootPath -Force | Out-Null
}

Invoke-Step -Label "Create data dir ($dataDir)" -DryRunMode:$DryRun {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

if (Test-Path -LiteralPath $appDir) {
    Invoke-Step -Label "Move existing app dir to $previousAppDir" -DryRunMode:$DryRun {
        Move-Item -LiteralPath $appDir -Destination $previousAppDir
    }
}

Invoke-Step -Label "Create app dir ($appDir)" -DryRunMode:$DryRun {
    New-Item -ItemType Directory -Path $appDir -Force | Out-Null
}

Invoke-Step -Label "Copy artifact contents into app dir" -DryRunMode:$DryRun {
    Copy-Item -Path (Join-Path $artifactPath "*") -Destination $appDir -Recurse -Force
}

if (-not $SkipInstall) {
    Invoke-Step -Label "Install production dependencies (npm ci --omit=dev)" -DryRunMode:$DryRun {
        Push-Location $appDir
        try {
            & npm ci --omit=dev
            if ($LASTEXITCODE -ne 0) {
                throw "npm ci --omit=dev failed with exit code $LASTEXITCODE"
            }
        }
        finally {
            Pop-Location
        }
    }
}
else {
    Write-Host "[deploy-windows-host] skipping dependency install (--SkipInstall)"
}

$deployManifest = @{
    deployed_at = (Get-Date).ToString("o")
    artifact_name = $artifactName
    artifact_path = $artifactPath
    target_root = $targetRootPath
    app_dir = $appDir
    data_dir = $dataDir
    database_path = $databasePath
    install_dependencies = (-not $SkipInstall)
    start_api = [bool]$StartApi
    bind_host = $BindHost
    port = $Port
}

Invoke-Step -Label "Write deployment manifest" -DryRunMode:$DryRun {
    $deployManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $targetRootPath "deploy-manifest.json")
}

if ($StartApi) {
    $startCommand = @(
        "Set-Location -LiteralPath '$appDir'",
        "`$env:HOST='$BindHost'",
        "`$env:PORT='$Port'",
        "`$env:DATABASE_PATH='$databasePath'",
        "npm run start:api:node"
    ) -join "; "

    Invoke-Step -Label "Start API in a new PowerShell window" -DryRunMode:$DryRun {
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $startCommand) `
            -WorkingDirectory $appDir | Out-Null
    }
}
else {
    Write-Host "[deploy-windows-host] API not started (use --StartApi to launch after deploy)"
}

Write-Host ""
Write-Host "[deploy-windows-host] deployment step complete"
Write-Host "[deploy-windows-host] next steps:"
Write-Host "  1. Serve frontend static files from: $appDir\dist"
Write-Host "  2. Run API from: $appDir (DATABASE_PATH => $databasePath)"
Write-Host "  3. Verify health: http://$BindHost`:$Port/"
Write-Host "  4. Run post-deploy smoke checks (see docs/windows-host-deployment.md)"
