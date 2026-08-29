import { useCallback, useEffect, useState } from "react";

/**
 * User settings persisted to localStorage (available in both the Tauri webview and the
 * browser dev shell). These are preferences, not machine data, so they don't belong in
 * the per-machine SQLite DB.
 */
export interface Settings {
  /** Optional Claude 5-hour token ceiling. When set, the UI can show a % and an
   * ESTIMATED exhaustion forecast (the ceiling is user-supplied, hence ESTIMATED). */
  claude5hCeilingTokens: number | null;
}

const KEY = "acc.settings";
const DEFAULTS: Settings = { claude5hCeilingTokens: null };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw
      ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
      : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const update = useCallback(
    (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );
  return [settings, update];
}
