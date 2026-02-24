[CmdletBinding()]
param(
    [string]$WebhookUrl,
    [string]$WebhookUrlEnvVar = "CHORE_ALERT_WEBHOOK_URL",
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet("info", "warning", "error", "critical")]
    [string]$Severity = "info",
    [string]$Source = "ChoreDashboard",
    [string]$EventType = "operator_notice",
    [string]$MetadataJson,
    [int]$TimeoutSec = 10,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-WebhookUrlForLog {
    param([Parameter(Mandatory = $true)][string]$Url)
    try {
        $uri = [System.Uri]$Url
        return "$($uri.Scheme)://$($uri.Host)$($uri.AbsolutePath)"
    }
    catch {
        return "<invalid-or-unparseable-url>"
    }
}

try {
    if (-not $WebhookUrl -and $WebhookUrlEnvVar) {
        try {
            $WebhookUrl = (Get-Item -Path ("Env:" + $WebhookUrlEnvVar) -ErrorAction Stop).Value
        }
        catch {
            $WebhookUrl = $null
        }
    }

    if (-not $WebhookUrl) {
        if ($DryRun) {
            $WebhookUrl = "https://example.invalid/webhook"
        }
        else {
            throw "Webhook URL is required (use -WebhookUrl or set $WebhookUrlEnvVar)"
        }
    }

    $payload = [ordered]@{
        timestamp  = (Get-Date).ToString("o")
        source     = $Source
        event_type = $EventType
        severity   = $Severity
        title      = $Title
        message    = $Message
    }

    if ($MetadataJson) {
        $payload.metadata = ($MetadataJson | ConvertFrom-Json -ErrorAction Stop)
    }

    $json = $payload | ConvertTo-Json -Depth 8

    Write-Host "[notify-webhook] severity: $Severity"
    Write-Host "[notify-webhook] title: $Title"
    Write-Host "[notify-webhook] target: $(Get-WebhookUrlForLog -Url $WebhookUrl)"
    Write-Host "[notify-webhook] dry-run: $([bool]$DryRun)"

    if ($DryRun) {
        Write-Host ""
        Write-Host "[notify-webhook] payload preview:"
        Write-Host $json
        Write-Host ""
        Write-Host "[notify-webhook] dry-run complete (no network request sent)"
        exit 0
    }

    $null = Invoke-RestMethod `
        -Uri $WebhookUrl `
        -Method Post `
        -ContentType "application/json" `
        -Body $json `
        -TimeoutSec $TimeoutSec

    Write-Host "[notify-webhook] notification sent successfully"
    exit 0
}
catch {
    Write-Host "[notify-webhook] failed: $($_.Exception.Message)"
    exit 1
}
