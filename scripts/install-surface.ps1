#Requires -Version 5.1
<#
.SYNOPSIS
  Prepare this machine (the Surface Pro) to run AI Control Center.
.DESCRIPTION
  Milestone 0 scope: validate prerequisites and print clear next steps. It does NOT
  silently install heavy toolchains or configure autostart yet (that lands in Milestone 1).
#>
[CmdletBinding()]
param(
  [switch]$Fix  # when set, offer to install missing pnpm via corepack
)

$ErrorActionPreference = "Stop"
Write-Host "== AI Control Center — Surface setup ==" -ForegroundColor Cyan

function Test-Tool($name, $cmd, $hint) {
  $found = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($found) {
    Write-Host ("  [ok]   {0}: {1}" -f $name, $found.Source)
    return $true
  }
  Write-Host ("  [MISS] {0} — {1}" -f $name, $hint) -ForegroundColor Yellow
  return $false
}

$ok = $true
$ok = (Test-Tool "Node.js"  "node"  "install Node >= 20 from https://nodejs.org") -and $ok
$ok = (Test-Tool "pnpm"     "pnpm"  "run: corepack enable; corepack prepare pnpm@latest --activate") -and $ok
$ok = (Test-Tool "Rust"     "rustc" "install from https://rustup.rs (needed for the native app)") -and $ok
$ok = (Test-Tool "Cargo"    "cargo" "installed with Rust") -and $ok

# WebView2 (required by Tauri on Windows)
$wv = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
if ($wv) { Write-Host ("  [ok]   WebView2: {0}" -f $wv.pv) }
else { Write-Host "  [MISS] WebView2 runtime — install from https://developer.microsoft.com/microsoft-edge/webview2/" -ForegroundColor Yellow; $ok = $false }

if ($Fix -and -not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "Enabling pnpm via corepack..." -ForegroundColor Cyan
  corepack enable; corepack prepare pnpm@latest --activate
}

Write-Host ""
if ($ok) {
  Write-Host "Prerequisites present. Next:" -ForegroundColor Green
  Write-Host "  pnpm install"
  Write-Host "  pnpm surface:dev     # UI in a browser (no Rust needed)"
  Write-Host "  pnpm surface:tauri   # native Surface app"
} else {
  Write-Host "Install the missing prerequisites above, then re-run this script." -ForegroundColor Yellow
  exit 1
}
