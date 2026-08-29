#Requires -Version 5.1
<#
.SYNOPSIS
  Prepare a monitored Windows PC to run the AI Monitor Agent.
.DESCRIPTION
  Milestone 0 scope: validate prerequisites, generate a high-entropy pairing token, and
  print the Surface connection details. It does NOT yet register a background service or
  open the firewall (Milestone 1). Nothing is installed silently.
#>
[CmdletBinding()]
param(
  [int]$Port = 47600,
  [switch]$GenerateToken
)

$ErrorActionPreference = "Stop"
Write-Host "== AI Control Center — Windows agent setup ==" -ForegroundColor Cyan

function Test-Tool($name, $cmd, $hint) {
  $found = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($found) { Write-Host ("  [ok]   {0}: {1}" -f $name, $found.Source); return $true }
  Write-Host ("  [MISS] {0} — {1}" -f $name, $hint) -ForegroundColor Yellow; return $false
}

$ok = $true
$ok = (Test-Tool "Node.js" "node" "install Node >= 20 from https://nodejs.org") -and $ok
$ok = (Test-Tool "pnpm"    "pnpm" "corepack enable; corepack prepare pnpm@latest --activate") -and $ok

# Optional data sources — reported honestly, not required to start.
if (Get-Command glances -ErrorAction SilentlyContinue) { Write-Host "  [ok]   Glances present (system telemetry)" }
else { Write-Host "  [info] Glances not found — system telemetry will show 'Not available' until installed: pip install 'glances[web]'" -ForegroundColor DarkYellow }
Write-Host "  [info] ccusage runs on demand via 'npx ccusage@latest' (no install needed)."

if ($GenerateToken) {
  $bytes = New-Object 'System.Byte[]' 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  $hostname = [System.Net.Dns]::GetHostName()
  $ips = ([System.Net.Dns]::GetHostAddresses($hostname) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.IPAddressToString }) -join ', '
  Write-Host ""
  Write-Host "Generated pairing token (store securely; do NOT commit):" -ForegroundColor Green
  Write-Host "  $token"
  Write-Host ""
  Write-Host "On the Surface, add this machine with:" -ForegroundColor Cyan
  Write-Host ("  Name:    {0}" -f $hostname)
  Write-Host ("  Address: {0}:{1}" -f $ips, $Port)
  Write-Host  "  Token:   (the value above)"
  Write-Host ""
  Write-Host "To start the agent LAN-exposed (only on a trusted private network):" -ForegroundColor Cyan
  Write-Host ('  $env:ACC_AGENT_HOST="0.0.0.0"; $env:ACC_AGENT_TOKEN="' + $token + '"; $env:ACC_AGENT_PORT=' + $Port + '; pnpm agent:dev')
} else {
  Write-Host ""
  Write-Host "Re-run with -GenerateToken to create a pairing token and print connection details." -ForegroundColor Yellow
  Write-Host "For local-only testing: pnpm agent:dev   (binds 127.0.0.1, no token needed)"
}

if (-not $ok) { exit 1 }
