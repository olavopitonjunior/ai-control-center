#!/usr/bin/env bash
# AI Control Center — remove the macOS launchd agent. Does not delete the repo or the
# pairing token file. Requires no root.
set -euo pipefail

LABEL="com.aicontrolcenter.agent"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ -f "$PLIST" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed launchd agent '${LABEL}' and $PLIST"
else
  echo "no launchd agent found at $PLIST — nothing to do"
fi
echo "(the pairing token file .agent-pairing-token, if any, was left in place)"
