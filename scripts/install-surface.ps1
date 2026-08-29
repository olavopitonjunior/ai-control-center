#Requires -Version 5.1
<#
.SYNOPSIS
  Prepare this machine (the Surface Pro) to run the AI Control Center app.
.DESCRIPTION
  Validates prerequisites and prints the exact next steps. Does not install toolchains
  silently; -Fix only enables pnpm via corepack, which ships with Node.

  NOTE: pure ASCII on purpose. Windows PowerShell 5.1 reads .ps1 as ANSI unless the file
  has a UTF-8 BOM, so non-ASCII punctuation breaks parsing.
.EXAMPLE
  .\install-surface.ps1
.EXAMPLE
  .\install-surface.ps1 -Fix
#>
[CmdletBinding()]
param(
  # Enable pnpm through corepack if it is missing.
  [switch]$Fix
)

$ErrorActionPreference = "Stop"
Write-Host "== AI Control Center - Surface setup ==" -ForegroundColor Cyan

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

if ($Fix -and -not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "Enabling pnpm via corepack..." -ForegroundColor Cyan
  corepack enable
  corepack prepare pnpm@latest --activate
}

$ok = $true
if (-not (Test-Tool "Node.js" "node" "install Node >= 20 from https://nodejs.org")) { $ok = $false }
if (-not (Test-Tool "pnpm" "pnpm" "run: corepack enable; corepack prepare pnpm@latest --activate (or pass -Fix)")) { $ok = $false }

# Rust + MSVC are only needed to BUILD the native app. Running the browser dev shell
# (pnpm surface:dev) does not need them, so report them as informational.
$hasRust = $null -ne (Get-Command rustc -ErrorAction SilentlyContinue)
if (-not $hasRust) {
  # rustup installs to ~/.cargo/bin; a shell started before install won't have it on PATH.
  $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin\rustc.exe"
  if (Test-Path $cargoBin) {
    $hasRust = $true
    Write-Host ("  [ok]   Rust (native build): {0}" -f $cargoBin)
    Write-Host "         Not on PATH in this shell - open a new terminal, or add %USERPROFILE%\.cargo\bin." -ForegroundColor DarkYellow
  } else {
    Write-Host "  [MISS] Rust (native build) - install from https://rustup.rs (only needed for 'pnpm surface:tauri')" -ForegroundColor Yellow
  }
} else {
  Write-Host ("  [ok]   Rust (native build): {0}" -f (Get-Command rustc).Source)
}

$wv = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
if ($wv) {
  Write-Host ("  [ok]   WebView2 runtime: {0}" -f $wv.pv)
} else {
  Write-Host "  [info] WebView2 not detected in the registry - it may still be present per-user." -ForegroundColor DarkYellow
  Write-Host "         If the native app fails to open a window, install it from:"
  Write-Host "         https://developer.microsoft.com/microsoft-edge/webview2/"
}

Write-Host ""
if (-not $ok) {
  Write-Host "Install the missing prerequisites above, then re-run this script." -ForegroundColor Yellow
  exit 1
}

Write-Host "Prerequisites present. Next:" -ForegroundColor Green
Write-Host "  pnpm install"
Write-Host "  pnpm surface:dev      # UI in a browser (no Rust needed)"
if ($hasRust) {
  Write-Host "  pnpm surface:tauri    # native Surface app"
} else {
  Write-Host "  pnpm surface:tauri    # native app - needs Rust + MSVC build tools (see above)"
}
Write-Host ""
Write-Host "Then open Settings -> Add a machine and pair a monitored PC or Mac." -ForegroundColor Cyan
Write-Host "On each monitored machine run scripts\install-agent.ps1 -GenerateToken (Windows)"
Write-Host "or scripts/install-agent-macos.sh (macOS) to get its address and token."
