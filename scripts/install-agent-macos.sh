#!/usr/bin/env bash
# AI Control Center — macOS agent installer (Milestone 3).
# Validates prerequisites, generates a pairing token, and installs a per-user launchd
# agent that runs the AI Monitor Agent. Requires NO root. Reversible via
# uninstall-agent-macos.sh. Nothing is installed silently.
set -euo pipefail

PORT="${ACC_AGENT_PORT:-47600}"
LABEL="com.aicontrolcenter.agent"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "== AI Control Center — macOS agent setup =="
echo "repo: $REPO"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This installer is for macOS. On Windows use scripts\\install-agent.ps1." >&2
  exit 1
fi

fail=0
check() { if command -v "$2" >/dev/null 2>&1; then echo "  [ok]   $1: $(command -v "$2")"; else echo "  [MISS] $1 — $3"; fail=1; fi; }
check "Node.js" node "install Node >= 20 (https://nodejs.org or 'brew install node')"
check "pnpm"    pnpm "corepack enable && corepack prepare pnpm@latest --activate"
if command -v glances >/dev/null 2>&1; then echo "  [ok]   Glances present"; else
  echo "  [info] Glances not found — system telemetry shows 'Not available' until: pip3 install 'glances[web]'"; fi
echo "  [info] ccusage runs on demand via 'npx ccusage@latest' (no install)."
echo "  [info] Automations are read from your user crontab + launchd (no root)."
[[ "$fail" == "1" ]] && { echo "Install the missing prerequisites, then re-run."; exit 1; }

# Generate (or reuse) a pairing token.
TOKEN_FILE="$REPO/.agent-pairing-token"   # gitignored (*.local / token files)
if [[ -f "$TOKEN_FILE" ]]; then
  TOKEN="$(cat "$TOKEN_FILE")"
  echo "  [ok]   reusing existing pairing token ($TOKEN_FILE)"
else
  TOKEN="$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=')"
  ( umask 077; printf '%s' "$TOKEN" > "$TOKEN_FILE" )
  echo "  [ok]   generated pairing token -> $TOKEN_FILE (keep private)"
fi

PNPM_BIN="$(command -v pnpm)"
NODE_DIR="$(dirname "$(command -v node)")"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 'your-ip')"
HOSTNAME_SHORT="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
# Bonjour name, resolvable over mDNS as <name>.local. Preferred over the IP because a
# laptop's DHCP lease changes when it reconnects (macOS also bumps the name to -2, -3...
# on rejoin), which silently breaks a pinned IP.
MDNS_NAME="${HOSTNAME_SHORT}.local"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PNPM_BIN}</string>
    <string>--filter</string>
    <string>@acc/agent</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key><string>${REPO}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${NODE_DIR}:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>ACC_AGENT_HOST</key><string>0.0.0.0</string>
    <key>ACC_AGENT_PORT</key><string>${PORT}</string>
    <key>ACC_AGENT_TOKEN</key><string>${TOKEN}</string>
    <key>ACC_MACHINE_NAME</key><string>${HOSTNAME_SHORT}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${HOME}/Library/Logs/ai-control-center-agent.log</string>
  <key>StandardErrorPath</key><string>${HOME}/Library/Logs/ai-control-center-agent.log</string>
</dict>
</plist>
PLISTEOF
echo "  [ok]   wrote launchd plist -> $PLIST"

# (Re)load the agent.
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "  [ok]   loaded launchd agent '${LABEL}' (starts now + at login)"

echo ""
echo "On the Surface, open Settings -> Add a machine and enter:"
echo "  Name:    ${HOSTNAME_SHORT}"
echo "  Address: ${MDNS_NAME}:${PORT}     <- recommended (follows DHCP changes)"
echo "  Token:   (contents of ${TOKEN_FILE})"
echo ""
echo "  Current IP is ${IP}:${PORT}, but a laptop's DHCP lease changes when it"
echo "  reconnects, which would break a pinned IP. Use the .local name unless your"
echo "  router gives this Mac a fixed reservation."
echo ""
echo "Logs: ~/Library/Logs/ai-control-center-agent.log"
echo "Uninstall: scripts/uninstall-agent-macos.sh"
echo ""
echo "SECURITY: the agent is now bound to 0.0.0.0 (LAN) with bearer auth. Only do this on a"
echo "trusted private network. MVP LAN traffic is plaintext HTTP (TLS is Milestone 4)."
