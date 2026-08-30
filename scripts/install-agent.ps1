#Requires -Version 5.1
<#
.SYNOPSIS
  Prepare a monitored Windows PC to run the AI Monitor Agent.
.DESCRIPTION
  Validates prerequisites, generates a high-entropy pairing token, optionally adds a
  Windows Firewall rule for the Private profile only, and prints the exact details to
  enter on the Surface. Nothing is installed silently.

  NOTE: this file is intentionally pure ASCII. Windows PowerShell 5.1 reads .ps1 files
  as ANSI unless they carry a UTF-8 BOM, so non-ASCII punctuation breaks parsing.
.EXAMPLE
  .\install-agent.ps1 -GenerateToken
.EXAMPLE
  .\install-agent.ps1 -GenerateToken -OpenFirewall
#>
[CmdletBinding()]
param(
  [int]$Port = 47600,
  [switch]$GenerateToken,
  # Adds an inbound allow rule for the Private network profile only. Needs admin.
  [switch]$OpenFirewall,
  # Registers a Scheduled Task so the agent starts at logon and restarts on failure.
  [switch]$Autostart,
  # Removes that Scheduled Task.
  [switch]$RemoveAutostart
)

$ErrorActionPreference = "Stop"
Write-Host "== AI Control Center - Windows agent setup ==" -ForegroundColor Cyan

$repo = Split-Path -Parent $PSScriptRoot
Write-Host ("repo: {0}" -f $repo)

$taskName = "AI Control Center Agent"

if ($RemoveAutostart) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host ("  [ok]   removed scheduled task '{0}'" -f $taskName)
  } else {
    Write-Host ("  [info] no scheduled task named '{0}'" -f $taskName)
  }
  $wrapper = Join-Path $repo ".agent-autostart.cmd"
  if (Test-Path $wrapper) { Remove-Item $wrapper -Force; Write-Host "  [ok]   removed $wrapper" }
  exit 0
}

function Test-Tool {
  param([string]$Name, [string]$Cmd, [string]$Hint)
  $found = Get-Command $Cmd -ErrorAction SilentlyContinue
  if ($found) {
    Write-Host ("  [ok]   {0}: {1}" -f $Name, $found.Source)
    return $true
  }
  Write-Host ("  [MISS] {0} - {1}" -f $Name, $Hint) -ForegroundColor Yellow
  return $false
}

$ok = $true
if (-not (Test-Tool "Node.js" "node" "install Node >= 20 from https://nodejs.org")) { $ok = $false }
if (-not (Test-Tool "pnpm" "pnpm" "run: corepack enable; corepack prepare pnpm@latest --activate")) { $ok = $false }

# Optional data sources - reported honestly, never required to start.
if (Get-Command glances -ErrorAction SilentlyContinue) {
  Write-Host "  [ok]   Glances present (system telemetry)"
} else {
  Write-Host "  [info] Glances not found - System will show 'Not available' until you run: pip install glances[web]" -ForegroundColor DarkYellow
}
Write-Host "  [info] ccusage runs on demand via 'npx ccusage@latest' (no install needed)."
Write-Host "  [info] Scheduled tasks are read via Get-ScheduledTask (no admin needed)."

if (-not $ok) {
  Write-Host ""
  Write-Host "Install the missing prerequisites above, then re-run this script." -ForegroundColor Yellow
  exit 1
}

# --- pairing token -----------------------------------------------------------
$tokenFile = Join-Path $repo ".agent-pairing-token"
if ($GenerateToken) {
  if (Test-Path $tokenFile) {
    $token = (Get-Content $tokenFile -Raw).Trim()
    Write-Host ("  [ok]   reusing existing pairing token ({0})" -f $tokenFile)
  } else {
    $bytes = New-Object 'System.Byte[]' 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    Set-Content -Path $tokenFile -Value $token -NoNewline -Encoding ascii
    Write-Host ("  [ok]   generated pairing token -> {0} (keep private; gitignored)" -f $tokenFile)
  }
} else {
  Write-Host ""
  Write-Host "Re-run with -GenerateToken to create a pairing token and print connection details." -ForegroundColor Yellow
  Write-Host "For local-only testing: pnpm agent:dev   (binds 127.0.0.1, no token needed)"
  exit 0
}

# --- optional firewall rule (Private profile only, spec section 26) ----------
if ($OpenFirewall) {
  $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Host "  [MISS] -OpenFirewall needs an elevated PowerShell. Re-run as Administrator." -ForegroundColor Yellow
  } else {
    $ruleName = "AI Control Center Agent (Private)"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
      Write-Host ("  [ok]   firewall rule already present: {0}" -f $ruleName)
    } else {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
      Write-Host ("  [ok]   added firewall rule '{0}' for TCP {1} (Private profile only)" -f $ruleName, $Port)
    }
  }
}

# --- optional autostart at logon (spec section 39) ---------------------------
if ($Autostart) {
  $pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
  if (-not $pnpm) {
    Write-Host "  [MISS] pnpm not found; cannot register autostart." -ForegroundColor Yellow
  } else {
    # A small wrapper sets the non-secret env and launches the agent. The TOKEN is
    # deliberately NOT written here - the agent reads .agent-pairing-token itself, so the
    # secret never lands in the Scheduled Task XML or this file.
    $wrapper = Join-Path $repo ".agent-autostart.cmd"
    $lines = @(
      "@echo off"
      "REM Generated by install-agent.ps1 -Autostart. Safe to delete; re-run to recreate."
      "cd /d ""$repo"""
      "set ACC_AGENT_HOST=0.0.0.0"
      "set ACC_AGENT_PORT=$Port"
      "call pnpm --filter @acc/agent start"
    )
    Set-Content -Path $wrapper -Value $lines -Encoding ascii
    Write-Host ("  [ok]   wrote launcher -> {0}" -f $wrapper)

    $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c """"$wrapper""""" -WorkingDirectory $repo
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    # Keep it modest: no admin, don't stop on battery, restart if it dies.
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3 `
      -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
      -Settings $settings -Principal $principal `
      -Description "Runs the AI Control Center monitoring agent at logon." | Out-Null
    Write-Host ("  [ok]   registered scheduled task '{0}' (at logon, restarts on failure)" -f $taskName)
    Write-Host  "         start it now with: Start-ScheduledTask -TaskName '$taskName'"
    Write-Host  "         remove it with:    .\scripts\install-agent.ps1 -RemoveAutostart"
  }
}

# --- connection details ------------------------------------------------------
$hostname = [System.Net.Dns]::GetHostName()
# Prefer a private LAN address (RFC1918). A machine may also have VPN/tunnel adapters
# with public addresses, which are NOT what the Surface should pair against.
$allIps = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
            Select-Object -ExpandProperty IPAddress)
$private = @($allIps | Where-Object {
  $_ -like '192.168.*' -or $_ -like '10.*' -or $_ -match '^172\.(1[6-9]|2[0-9]|3[01])\.'
})
# @() is required: PowerShell unwraps a single-element array to a scalar string, and
# indexing a string would yield its first CHARACTER instead of the address.
$ips = @(if ($private.Count -gt 0) { $private } else { $allIps })
$ipText = if ($allIps.Count -gt 0) { $allIps -join ', ' } else { 'your-ip' }
if ($ips.Count -eq 0) { $ips = @('your-ip') }

Write-Host ""
Write-Host "On the Surface, open Settings -> Add a machine and enter:" -ForegroundColor Green
Write-Host ("  Name:    {0}" -f $hostname)
Write-Host ("  Address: {0}:{1}" -f $ips[0], $Port)
Write-Host ("  Token:   (contents of {0})" -f $tokenFile)
if ($allIps.Count -gt 1) { Write-Host ("  (all detected addresses: {0})" -f $ipText) }
Write-Host ""
Write-Host ("  If this machine's IP changes, try the name form instead: {0}:{1}" -f "$hostname.local", $Port)
Write-Host "  (Windows resolves .local over mDNS on recent builds; if it fails, pin the IP"
Write-Host "   with a DHCP reservation in your router. A wired desktop rarely changes IP.)"

Write-Host ""
Write-Host "Start the agent LAN-exposed (trusted private network only):" -ForegroundColor Cyan
Write-Host ('  $env:ACC_AGENT_HOST="0.0.0.0"')
Write-Host ('  $env:ACC_AGENT_PORT="' + $Port + '"')
Write-Host ('  $env:ACC_AGENT_TOKEN=(Get-Content "' + $tokenFile + '" -Raw).Trim()')
Write-Host '  pnpm agent:dev'
Write-Host ""
Write-Host "SECURITY: LAN traffic is plaintext HTTP unless you set ACC_TLS_CERT/ACC_TLS_KEY" -ForegroundColor Yellow
Write-Host "(see scripts\generate-cert.sh). Only enable LAN access on a network you trust."
