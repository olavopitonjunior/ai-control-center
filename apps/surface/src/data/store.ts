import { isTauri } from "../env";
import { MemoryStore } from "./memoryStore";
import type { Store } from "./types";

let instance: Store | null = null;
let initPromise: Promise<Store> | null = null;

/**
 * Return the singleton store: SQLite inside Tauri, in-memory in the browser dev shell.
 * The SQLite module is imported lazily so the browser build never pulls in the Tauri
 * plugin's IPC calls.
 */
export async function getStore(): Promise<Store> {
  if (instance) return instance;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    let store: Store;
    if (isTauri()) {
      const { SqliteStore } = await import("./sqliteStore");
      store = new SqliteStore();
    } else {
      store = new MemoryStore();
    }
    await store.init();
    instance = store;
    return store;
  })();
  return initPromise;
}
