import { isTauri as tauriDetect } from "@tauri-apps/api/core";

/**
 * Detect whether we're running inside the Tauri native shell or a plain browser
 * (used for UI-shell verification without a Rust build). Uses Tauri's official
 * detector, with a defensive fallback to the injected globals. The app renders the
 * same either way; only native features (SQLite, autostart) require Tauri.
 */
export function isTauri(): boolean {
  try {
    if (tauriDetect()) return true;
  } catch {
    /* fall through to global checks */
  }
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window ||
      "__TAURI__" in window ||
      "isTauri" in window)
  );
}

export const RUNTIME_LABEL = isTauri()
  ? "Tauri (native)"
  : "Browser (dev shell)";
