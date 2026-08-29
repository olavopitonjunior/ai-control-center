#!/usr/bin/env bash
# Generate a self-signed TLS cert+key for the AI Monitor Agent (LAN use).
# Usage:  scripts/generate-cert.sh [common-name] [out-dir]
# Then:   ACC_TLS_CERT=<out>/agent-cert.pem ACC_TLS_KEY=<out>/agent-key.pem \
#         ACC_AGENT_HOST=0.0.0.0 ACC_AGENT_TOKEN=... pnpm agent:dev
#
# Self-signed certs are not trusted by default — on the Surface, add this machine using an
# https:// address and trust/pin the cert. Real CA-signed TLS is a deployment choice.
set -euo pipefail

CN="${1:-ai-control-agent}"
OUT="${2:-./certs}"
mkdir -p "$OUT"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl not found. On Windows it ships with Git Bash; on macOS/Linux install it." >&2
  exit 1
fi

# MSYS_NO_PATHCONV stops Git Bash (Windows) from rewriting the leading-slash -subj arg
# into a filesystem path. It's ignored by non-MSYS shells (macOS/Linux), so this is portable.
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
  -keyout "$OUT/agent-key.pem" -out "$OUT/agent-cert.pem" \
  -subj "/CN=${CN}" \
  -addext "subjectAltName=DNS:${CN},DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1

chmod 600 "$OUT/agent-key.pem" 2>/dev/null || true
echo "wrote $OUT/agent-cert.pem and $OUT/agent-key.pem (CN=${CN})"
echo "start the agent with:"
echo "  ACC_TLS_CERT=$OUT/agent-cert.pem ACC_TLS_KEY=$OUT/agent-key.pem pnpm agent:dev"
