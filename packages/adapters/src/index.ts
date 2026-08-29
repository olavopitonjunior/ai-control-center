/**
 * @acc/adapters — the Collector interface plus pure normalizers that adapt each
 * upstream tool's native output into the @acc/protocol model. Keeping the
 * normalizers pure (no I/O) makes them fully unit-testable against captured
 * fixtures; the agent wraps them with the actual CLI/HTTP calls.
 */
export * from "./collector";
export * from "./ccusage";
export * from "./glances";
export * from "./cron";
export * from "./launchd";
export * from "./netiface";
export * from "./github";
export * from "./n8n";
export * from "./supabase";
export * from "./vercel";
