import type { AISession, SourceName } from "@acc/protocol";

/**
 * Deduplication of AI sessions observed by more than one collector (spec §55).
 *
 * ccusage and (later) codexbar can both see the SAME local session. Summing them would
 * silently double a user's tokens/cost. We therefore derive a stable fingerprint per
 * session and keep exactly one record per fingerprint, chosen by source precedence.
 */

/** Source precedence for session tokens (spec §54). Lower index wins. */
export const SESSION_SOURCE_PRECEDENCE: SourceName[] = [
  "ccusage",
  "codexbar",
  "analytics",
];

export function sessionSourceRank(source: SourceName | undefined): number {
  const i = SESSION_SOURCE_PRECEDENCE.indexOf(source as SourceName);
  return i === -1 ? SESSION_SOURCE_PRECEDENCE.length : i;
}

/** Round a timestamp to a bucket so near-identical starts from two collectors collide. */
function roundToBucket(iso: string | null, bucketMs: number): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  return String(Math.floor(t / bucketMs) * bucketMs);
}

/**
 * Stable fingerprint for a session: agent + session id + project + model + a rounded
 * time bucket. Two collectors observing the same underlying session produce the same
 * fingerprint even if their timestamps differ slightly.
 *
 * @param bucketMs time granularity for the start/activity bucket (default 5 minutes)
 */
export function sessionFingerprint(
  session: AISession,
  bucketMs = 5 * 60_000,
): string {
  const idPart = session.id.includes(":")
    ? session.id.split(":").slice(1).join(":")
    : session.id;
  return [
    session.agent,
    idPart || "-",
    session.projectPath ?? session.projectName ?? "-",
    session.model ?? "-",
    roundToBucket(session.startedAt ?? session.lastActivityAt, bucketMs),
  ].join("|");
}

/** Which source produced this session's tokens (from its provenance tags). */
function tokenSourceOf(session: AISession): SourceName | undefined {
  return session.provenance.find((p) => p.field === "tokens")?.source;
}

/**
 * Collapse sessions to one record per fingerprint. When two collectors report the same
 * session, the higher-precedence source wins outright — values are NEVER summed, which
 * is what would double-count. Ties break toward the record with more token detail.
 */
export function dedupeSessions(
  sessions: AISession[],
  bucketMs = 5 * 60_000,
): AISession[] {
  const best = new Map<string, AISession>();
  for (const s of sessions) {
    const fp = sessionFingerprint(s, bucketMs);
    const existing = best.get(fp);
    if (!existing) {
      best.set(fp, s);
      continue;
    }
    const a = sessionSourceRank(tokenSourceOf(existing));
    const b = sessionSourceRank(tokenSourceOf(s));
    if (b < a) {
      best.set(fp, s);
    } else if (b === a) {
      // Same source precedence: prefer the record carrying a token total.
      const existingHas = existing.tokens?.totalTokens ?? null;
      const candidateHas = s.tokens?.totalTokens ?? null;
      if (existingHas === null && candidateHas !== null) best.set(fp, s);
    }
  }
  return [...best.values()];
}

/**
 * Sum token totals across sessions AFTER deduplication. Always use this rather than
 * summing a raw collector list, so totals can't double when two collectors overlap.
 */
export function totalTokensDeduped(
  sessions: AISession[],
  bucketMs = 5 * 60_000,
): number {
  return dedupeSessions(sessions, bucketMs).reduce(
    (acc, s) => acc + (s.tokens?.totalTokens ?? 0),
    0,
  );
}
