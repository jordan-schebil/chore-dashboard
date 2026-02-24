[CmdletBinding()]
param(
    [string]$ArtifactDir,
    [string]$OutFile,
    [switch]$Force,
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

function Assert-ArtifactDir {
    param([Parameter(Mandatory = $true)][string]$ArtifactPath)

    foreach ($item in @("release-manifest.json", "dist", "server")) {
        if (-not (Test-Path -LiteralPath (Join-Path $ArtifactPath $item))) {
            throw "Artifact directory is missing required item: $item"
        }
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$artifactsRoot = Join-Path $repoRoot "release-artifacts"

if (-not $ArtifactDir) {
    $ArtifactDir = Get-LatestArtifactDir -ArtifactsRoot $artifactsRoot
}

$artifactPath = Resolve-AbsolutePath -PathValue $ArtifactDir
Assert-ArtifactDir -ArtifactPath $artifactPath

$artifactName = Split-Path -Leaf $artifactPath
if (-not $OutFile) {
    $OutFile = Join-Path (Split-Path -Parent $artifactPath) "$artifactName.zip"
}
$zipPath = Resolve-AbsolutePath -PathValue $OutFile

Write-Host "[release-zip] artifact dir: $artifactPath"
Write-Host "[release-zip] zip file: $zipPath"
Write-Host "[release-zip] note: zip will include the top-level artifact folder '$artifactName'"

if ((Test-Path -LiteralPath $zipPath) -and -not $Force) {
    throw "Zip file already exists: $zipPath (use -Force to overwrite)"
}

if ($DryRun) {
    Write-Host "[release-zip] dry-run complete (no files written)"
    exit 0
}

New-Item -ItemType Directory -Path (Split-Path -Parent $zipPath) -Force | Out-Null
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path $artifactPath -DestinationPath $zipPath -Force

if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "Zip file was not created: $zipPath"
}

$zipInfo = Get-Item -LiteralPath $zipPath
Write-Host "[release-zip] archive created successfully"
Write-Host "[release-zip] size bytes: $($zipInfo.Length)"
