import { useEffect, useState } from "react";

/**
 * Battery awareness (spec §57). The Surface may run unplugged, so the user can trade
 * refresh frequency for battery life. Power mode changes ONLY cadence and animation —
 * never provider semantics or how values are labelled.
 */
export type PowerMode = "performance" | "balanced" | "low-power";

export interface PowerProfile {
  /** Snapshot poll interval (ms). */
  pollMs: number;
  /** Retention sweep interval (ms). */
  retentionMs: number;
  /** Whether decorative transitions should run. */
  animations: boolean;
}

export const POWER_PROFILES: Record<PowerMode, PowerProfile> = {
  performance: { pollMs: 2000, retentionMs: 5 * 60_000, animations: true },
  balanced: { pollMs: 4000, retentionMs: 5 * 60_000, animations: true },
  "low-power": { pollMs: 15_000, retentionMs: 30 * 60_000, animations: false },
};

const KEY = "acc.powerMode";

/** Persisted mode; "auto" follows the battery/charging state when the API is available. */
export type PowerSetting = PowerMode | "auto";

export function loadPowerSetting(): PowerSetting {
  try {
    const raw = localStorage.getItem(KEY);
    if (
      raw === "auto" ||
      raw === "performance" ||
      raw === "balanced" ||
      raw === "low-power"
    )
      return raw;
  } catch {
    /* ignore */
  }
  return "balanced";
}

interface BatteryLike {
  charging: boolean;
  level: number;
  addEventListener: (t: string, fn: () => void) => void;
  removeEventListener: (t: string, fn: () => void) => void;
}

/**
 * Resolve the effective mode. In "auto": plugged in -> balanced; on battery -> low-power
 * below 30%, otherwise balanced. Falls back to balanced when the Battery API is absent
 * (it is not available in every WebView), rather than guessing.
 */
export function usePowerMode(): {
  setting: PowerSetting;
  setSetting: (s: PowerSetting) => void;
  mode: PowerMode;
  profile: PowerProfile;
  charging: boolean | null;
  level: number | null;
} {
  const [setting, setSettingState] = useState<PowerSetting>(() =>
    loadPowerSetting(),
  );
  const [charging, setCharging] = useState<boolean | null>(null);
  const [level, setLevel] = useState<number | null>(null);

  const setSetting = (s: PowerSetting) => {
    setSettingState(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let battery: BatteryLike | null = null;
    let cancelled = false;
    const onChange = () => {
      if (!battery || cancelled) return;
      setCharging(battery.charging);
      setLevel(battery.level);
    };
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryLike>;
    };
    if (nav.getBattery) {
      void nav
        .getBattery()
        .then((b) => {
          if (cancelled) return;
          battery = b;
          onChange();
          b.addEventListener("chargingchange", onChange);
          b.addEventListener("levelchange", onChange);
        })
        .catch(() => {
          /* API unavailable — stay on the explicit setting */
        });
    }
    return () => {
      cancelled = true;
      battery?.removeEventListener("chargingchange", onChange);
      battery?.removeEventListener("levelchange", onChange);
    };
  }, []);

  const mode: PowerMode =
    setting !== "auto"
      ? setting
      : charging === false && level !== null && level < 0.3
        ? "low-power"
        : "balanced";

  return {
    setting,
    setSetting,
    mode,
    profile: POWER_PROFILES[mode],
    charging,
    level,
  };
}
