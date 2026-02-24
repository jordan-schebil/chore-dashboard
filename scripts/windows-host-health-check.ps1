[CmdletBinding()]
param(
    [string]$ServiceName = "ChoreDashboardApi",
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [int]$TimeoutSec = 5,
    [switch]$SkipServiceCheck
)

$ErrorActionPreference = "Stop"

function Normalize-BaseUrl {
    param([Parameter(Mandatory = $true)][string]$Url)
    return $Url.TrimEnd("/")
}

function Get-CheckUrl {
    param(
        [Parameter(Mandatory = $true)][string]$NormalizedBaseUrl,
        [Parameter(Mandatory = $true)][string]$Path
    )

    if ($Path.StartsWith("/")) {
        return "$NormalizedBaseUrl$Path"
    }

    return "$NormalizedBaseUrl/$Path"
}

function Add-CheckResult {
    param(
        [Parameter(Mandatory = $true)][System.Collections.Generic.List[object]]$Results,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Detail
    )

    $Results.Add([pscustomobject]@{
        name = $Name
        status = $Status
        detail = $Detail
    }) | Out-Null
}

function Invoke-Check {
    param(
        [Parameter(Mandatory = $true)][System.Collections.Generic.List[object]]$Results,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    try {
        $detail = & $Action
        if ($null -eq $detail -or $detail -eq "") {
            $detail = "ok"
        }

        Add-CheckResult -Results $Results -Name $Name -Status "PASS" -Detail ([string]$detail)
        Write-Host "[health-check] PASS - $Name ($detail)"
    }
    catch {
        $message = $_.Exception.Message
        Add-CheckResult -Results $Results -Name $Name -Status "FAIL" -Detail $message
        Write-Host "[health-check] FAIL - $Name ($message)"
    }
}

$normalizedBaseUrl = Normalize-BaseUrl -Url $BaseUrl
$results = [System.Collections.Generic.List[object]]::new()

Write-Host "[health-check] service name: $ServiceName"
Write-Host "[health-check] base URL: $normalizedBaseUrl"
Write-Host "[health-check] timeout: ${TimeoutSec}s"
Write-Host "[health-check] service check: $([bool](-not $SkipServiceCheck))"
Write-Host ""

if ($SkipServiceCheck) {
    Add-CheckResult -Results $results -Name "Windows service status" -Status "SKIP" -Detail "Skipped by -SkipServiceCheck"
    Write-Host "[health-check] SKIP - Windows service status (Skipped by -SkipServiceCheck)"
}
else {
    Invoke-Check -Results $results -Name "Windows service '$ServiceName' is Running" -Action {
        $service = Get-Service -Name $ServiceName -ErrorAction Stop
        if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Running) {
            throw "Service status is '$($service.Status)'"
        }
        return "Status=$($service.Status)"
    }
}

Invoke-Check -Results $results -Name "GET / health endpoint returns running status" -Action {
    $response = Invoke-RestMethod -Uri (Get-CheckUrl -NormalizedBaseUrl $normalizedBaseUrl -Path "/") -Method Get -TimeoutSec $TimeoutSec
    if ($null -eq $response) {
        throw "Empty response body"
    }
    if ($response.status -ne "running") {
        throw "Expected status 'running', got '$($response.status)'"
    }

    $message = $response.message
    if ($null -eq $message -or $message -eq "") {
        return "status=running"
    }
    return "status=running; message=$message"
}

Invoke-Check -Results $results -Name "GET /chores returns a JSON array" -Action {
    $response = Invoke-RestMethod -Uri (Get-CheckUrl -NormalizedBaseUrl $normalizedBaseUrl -Path "/chores") -Method Get -TimeoutSec $TimeoutSec
    if ($null -eq $response) {
        return "rows=0"
    }
    if (-not ($response -is [array])) {
        throw "Expected JSON array response"
    }
    return "rows=$(@($response).Count)"
}

Invoke-Check -Results $results -Name "GET /rooms returns a JSON array" -Action {
    $response = Invoke-RestMethod -Uri (Get-CheckUrl -NormalizedBaseUrl $normalizedBaseUrl -Path "/rooms") -Method Get -TimeoutSec $TimeoutSec
    if ($null -eq $response) {
        return "rows=0"
    }
    if (-not ($response -is [array])) {
        throw "Expected JSON array response"
    }
    return "rows=$(@($response).Count)"
}

$passCount = @($results | Where-Object { $_.status -eq "PASS" }).Count
$failCount = @($results | Where-Object { $_.status -eq "FAIL" }).Count
$skipCount = @($results | Where-Object { $_.status -eq "SKIP" }).Count

Write-Host ""
Write-Host "[health-check] Summary: $passCount pass / $failCount fail / $skipCount skip"

if ($failCount -gt 0) {
    exit 1
}

exit 0
