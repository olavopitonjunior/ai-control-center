# DEPLOYMENT — putting AI Control Center on real machines

Target topology (spec §46):

```
  SURFACE PRO  (control plane, runs the app)
        |  Wi-Fi / LAN
        +---- OLAVO-PC     (Windows, Ethernet)  -> AI Monitor Agent :47600
        +---- MACBOOK-PRO  (macOS,  Wi-Fi)      -> AI Monitor Agent :47600
```

Every command below has been run and verified except where explicitly marked.

---

## 0. Prerequisites on every machine

- **Node >= 20** and **pnpm** (`corepack enable && corepack prepare pnpm@latest --activate`)
- **git**, to clone the repo
- Optional but recommended: **Glances** for system telemetry
  (`pip install "glances[web]"`). Without it the System screen honestly shows
  *Not available*; everything else keeps working.
- ccusage needs no install — the agent runs `npx ccusage@latest` on demand.

The Surface additionally needs **Rust + MSVC C++ Build Tools + WebView2** to build the
native app. (`pnpm surface:dev` runs the UI in a browser without them.)

---

## 1. Surface Pro (control plane)

```powershell
git clone https://github.com/olavopitonjunior/ai-control-center.git
cd ai-control-center
.\scripts\install-surface.ps1     # validates prerequisites, prints next steps
pnpm install
pnpm surface:tauri                # native app  (or: pnpm surface:dev for the browser shell)
```

Leave it running — you will add machines from **Settings** in step 4.

---

## 2. OLAVO-PC (monitored Windows machine)

```powershell
git clone https://github.com/olavopitonjunior/ai-control-center.git
cd ai-control-center
pnpm install

# Validates prerequisites, generates a pairing token, prints the address to use.
.\scripts\install-agent.ps1 -GenerateToken

# Optional, needs an ELEVATED PowerShell: allow inbound TCP 47600 on the
# Private network profile only (never Public).
.\scripts\install-agent.ps1 -GenerateToken -OpenFirewall
```

Start Glances bound to loopback (optional, for the System screen):

```powershell
python -m glances -w -p 61208 --disable-webui
```

Start the agent LAN-exposed (the script prints these exact lines with your values):

```powershell
$env:ACC_AGENT_HOST="0.0.0.0"
$env:ACC_AGENT_PORT="47600"
$env:ACC_AGENT_TOKEN=(Get-Content ".agent-pairing-token" -Raw).Trim()
pnpm agent:dev
```

The agent refuses to bind a non-loopback address without a token, so this cannot
accidentally expose an unauthenticated service.

---

## 3. MACBOOK-PRO (monitored macOS machine)

> Built and unit-tested, but **not yet run on Mac hardware** — expect to iterate here.

```bash
git clone https://github.com/olavopitonjunior/ai-control-center.git
cd ai-control-center
pnpm install

GENERATE_TOKEN=1 ./scripts/install-agent-macos.sh
```

That validates prerequisites, generates a token, writes a per-user launchd agent to
`~/Library/LaunchAgents/com.aicontrolcenter.agent.plist` (RunAtLoad + KeepAlive) and loads
it. No root required. Logs: `~/Library/Logs/ai-control-center-agent.log`.

Optional telemetry: `pip3 install "glances[web]" && glances -w -p 61208 --disable-webui`

To remove it later: `./scripts/uninstall-agent-macos.sh`

---

## 4. Pair from the Surface

In the app: **Settings -> Add a machine**

| Field | Value |
|---|---|
| Name | `OLAVO-PC` (or `MACBOOK-PRO`) |
| Address | the **private LAN** address the install script printed, e.g. `192.168.0.228:47600` |
| Pairing token | contents of `.agent-pairing-token` on that machine |

Then pick the machine in the top selector. Within a few seconds it should read **ONLINE**
and Overview/System/Sessions should populate.

Once one machine is paired you can use **Settings -> Discover machines** (mDNS) to find the
others without typing addresses.

---

## 5. Verify it really works

Run the MVP acceptance test on a monitored machine (starts and stops a real agent):

```bash
cd apps/agent && npx tsx ../../scripts/acceptance.ts
```

Expected: `11 passed, 0 failed`.

Manual checks worth doing once (spec §61):

- CPU/RAM on the **System** screen move in near real time.
- Stop the agent -> the machine flips to **OFFLINE** within ~15 s. Restart it -> **ONLINE**.
- Stop Glances -> System shows *Not available* while providers/sessions keep working.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Surface can't reach the agent | Wrong address (use the **private** `192.168.x` / `10.x` one, not a VPN address); firewall not opened; agent bound to loopback (`ACC_AGENT_HOST` must be `0.0.0.0`). |
| `401 unauthorized` | Token mismatch — re-copy `.agent-pairing-token`. |
| System says *Not available* | Glances isn't running on that machine. Everything else still works by design. |
| Sessions/Usage empty | ccusage found no local coding-agent logs on that machine. |
| `.ps1` won't run | Execution policy: `powershell -ExecutionPolicy Bypass -File .\scripts\install-agent.ps1 -GenerateToken`. |
| `zsh: permission denied: ./scripts/...sh` | The clone predates the executable-bit fix. Run `chmod +x scripts/*.sh`, or invoke via `bash ./scripts/install-agent-macos.sh`. |
| Native app won't build | Rust / MSVC Build Tools / WebView2 missing — `install-surface.ps1` reports which. |

## Security reminders

- LAN traffic is **plaintext HTTP** unless you set `ACC_TLS_CERT` + `ACC_TLS_KEY`
  (generate with `scripts/generate-cert.sh`). Only enable LAN access on a trusted network.
- The pairing token file is gitignored. Provider credentials never leave the monitored
  machine; the Surface only receives normalized results.
