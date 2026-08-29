import type { ConnectionType } from "@acc/protocol";

/**
 * Classify a network-interface name into a ConnectionType. Names vary by OS, so this is a
 * heuristic over the common cases:
 *   - USB4 / Thunderbolt bridge  -> "usb4"   (Windows "USB4", macOS "Thunderbolt Bridge/en*bridge")
 *   - Wi-Fi / wireless / en0     -> "wifi"
 *   - Ethernet / en / eth        -> "ethernet"
 *   - anything else              -> "unknown"
 *
 * Data semantics are identical across transports — this only labels how a machine is
 * reached, it never changes what is collected.
 */
export function classifyInterface(name: string): ConnectionType {
  const n = name.toLowerCase();
  if (/(usb4|thunderbolt|tbolt|tb-?bridge|usb ?network)/.test(n)) return "usb4";
  if (/(wi-?fi|wlan|wireless|airport|\ben0\b)/.test(n)) return "wifi";
  if (
    /(ethernet|eth\d|\ben\d+\b|lan|realtek|intel\(r\).*(ethernet|network)|gigabit)/.test(
      n,
    )
  )
    return "ethernet";
  return "unknown";
}

export interface NetInterface {
  name: string;
  address: string;
  family: "IPv4" | "IPv6";
  connectionType: ConnectionType;
}

/**
 * Pick the "best" connection type from a set of interfaces, preferring a wired/USB4 link
 * over Wi-Fi (Ethernet/USB4 preference, Wi-Fi fallback — spec §49). Returns "unknown" when
 * nothing classifies.
 */
export function preferredConnectionType(
  types: ConnectionType[],
): ConnectionType {
  if (types.includes("usb4")) return "usb4";
  if (types.includes("ethernet")) return "ethernet";
  if (types.includes("wifi")) return "wifi";
  return "unknown";
}
