import { useCallback, useEffect, useState } from "react";
import { isTauri } from "../env";

/**
 * Surface Mode (spec §33): a dedicated kiosk-like presentation for the Surface Pro —
 * fullscreen, reduced chrome, larger touch targets.
 *
 * Everything here is OPT-IN and persisted. Per the spec we deliberately do NOT keep the
 * screen awake by default; prevent-sleep is a separate switch the user turns on.
 */
export interface SurfaceModeSettings {
  enabled: boolean;
  /** Keep the display awake (only meaningful while plugged in). Default off. */
  preventSleep: boolean;
  /** Launch AI Control Center when Windows starts. Default off. */
  autostart: boolean;
}

const KEY = "acc.surfaceMode";
const DEFAULTS: SurfaceModeSettings = {
  enabled: false,
  preventSleep: false,
  autostart: false,
};

export function loadSurfaceMode(): SurfaceModeSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw
      ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SurfaceModeSettings>) }
      : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Ask the native window to enter/leave fullscreen. No-op in the browser dev shell. */
async function setFullscreen(on: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(on);
  } catch (e) {
    console.warn("fullscreen toggle unavailable", e);
  }
}

/**
 * Hold a screen wake lock while enabled. Uses the standard Screen Wake Lock API, which
 * the WebView2 runtime supports; silently degrades where it doesn't.
 */
function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let lock: { release: () => Promise<void> } | null = null;
    let released = false;

    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: {
            request: (t: "screen") => Promise<{ release: () => Promise<void> }>;
          };
        };
        if (!nav.wakeLock) return;
        lock = await nav.wakeLock.request("screen");
      } catch {
        /* denied or unsupported — nothing to do */
      }
    };
    void request();
    // Re-acquire after the OS drops the lock (e.g. on tab/window visibility change).
    const onVisible = () => {
      if (!released && document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

export function useSurfaceMode(): [
  SurfaceModeSettings,
  (patch: Partial<SurfaceModeSettings>) => void,
] {
  const [settings, setSettings] = useState<SurfaceModeSettings>(() =>
    loadSurfaceMode(),
  );

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  // Apply fullscreen + a body class that drives the reduced-chrome styling.
  useEffect(() => {
    void setFullscreen(settings.enabled);
    document.body.classList.toggle("surface-mode", settings.enabled);
  }, [settings.enabled]);

  useWakeLock(settings.enabled && settings.preventSleep);

  // Register/unregister launch-at-login to match the toggle (native only).
  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      try {
        const { enable, disable, isEnabled } =
          await import("@tauri-apps/plugin-autostart");
        const already = await isEnabled();
        if (settings.autostart && !already) await enable();
        if (!settings.autostart && already) await disable();
      } catch (e) {
        console.warn("autostart unavailable", e);
      }
    })();
  }, [settings.autostart]);

  const update = useCallback(
    (patch: Partial<SurfaceModeSettings>) =>
      setSettings((s) => ({ ...s, ...patch })),
    [],
  );
  return [settings, update];
}
