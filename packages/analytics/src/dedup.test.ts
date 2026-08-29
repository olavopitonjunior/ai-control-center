import { describe, expect, it } from "vitest";
import type { AISession, SourceName } from "@acc/protocol";
import {
  dedupeSessions,
  sessionFingerprint,
  sessionSourceRank,
  totalTokensDeduped,
} from "./dedup";

function session(
  over: Partial<AISession> & { tokenSource?: SourceName } = {},
): AISession {
  const { tokenSource, ...rest } = over;
  return {
    id: "claude-code:abc123",
    machineId: "olavo-pc",
    agent: "claude-code",
    pid: null,
    projectName: "Rankd",
    projectPath: "C:\\Projects\\Rankd",
    terminal: null,
    startedAt: "2026-08-29T10:00:00.000Z",
    lastActivityAt: "2026-08-29T10:30:00.000Z",
    durationSeconds: null,
    status: "ACTIVE",
    model: "claude-opus-4-8",
    tokens: {
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 300,
    },
    cost: {
      amount: 1.5,
      currency: "USD",
      source: "ccusage",
      sourceQuality: "CALCULATED",
    },
    provenance: [{ field: "tokens", source: tokenSource ?? "ccusage" }],
    ...rest,
  };
}

describe("sessionFingerprint", () => {
  it("is stable for the same logical session across collectors", () => {
    const a = session({ id: "claude-code:abc123", tokenSource: "ccusage" });
    const b = session({ id: "codexbar:abc123", tokenSource: "codexbar" });
    expect(sessionFingerprint(a)).toBe(sessionFingerprint(b));
  });

  it("tolerates small timestamp drift within the bucket", () => {
    const a = session({ startedAt: "2026-08-29T10:00:00.000Z" });
    const b = session({ startedAt: "2026-08-29T10:04:59.000Z" });
    expect(sessionFingerprint(a)).toBe(sessionFingerprint(b));
  });

  it("differs for a different project, model, or agent", () => {
    const base = session();
    expect(sessionFingerprint(session({ projectPath: "C:\\Other" }))).not.toBe(
      sessionFingerprint(base),
    );
    expect(sessionFingerprint(session({ model: "gpt-5" }))).not.toBe(
      sessionFingerprint(base),
    );
    expect(sessionFingerprint(session({ agent: "codex" }))).not.toBe(
      sessionFingerprint(base),
    );
  });
});

describe("sessionSourceRank", () => {
  it("ranks ccusage above codexbar above analytics", () => {
    expect(sessionSourceRank("ccusage")).toBeLessThan(
      sessionSourceRank("codexbar"),
    );
    expect(sessionSourceRank("codexbar")).toBeLessThan(
      sessionSourceRank("analytics"),
    );
    expect(sessionSourceRank(undefined)).toBeGreaterThan(
      sessionSourceRank("analytics"),
    );
  });
});

describe("dedupeSessions", () => {
  it("keeps ONE record when two collectors saw the same session (no double-count)", () => {
    const fromCcusage = session({
      id: "claude-code:abc123",
      tokenSource: "ccusage",
    });
    const fromCodexbar = session({
      id: "codexbar:abc123",
      tokenSource: "codexbar",
    });
    const deduped = dedupeSessions([fromCcusage, fromCodexbar]);
    expect(deduped).toHaveLength(1);
    // ccusage wins by precedence — values are chosen, never summed.
    expect(deduped[0]!.provenance[0]!.source).toBe("ccusage");
    expect(deduped[0]!.tokens!.totalTokens).toBe(300);
  });

  it("does NOT double tokens when both collectors report the same session", () => {
    const a = session({ tokenSource: "ccusage" });
    const b = session({ id: "codexbar:abc123", tokenSource: "codexbar" });
    expect(totalTokensDeduped([a, b])).toBe(300); // not 600
  });

  it("keeps genuinely distinct sessions", () => {
    const a = session({ id: "claude-code:one", projectPath: "C:\\A" });
    const b = session({ id: "claude-code:two", projectPath: "C:\\B" });
    expect(dedupeSessions([a, b])).toHaveLength(2);
    expect(totalTokensDeduped([a, b])).toBe(600);
  });

  it("prefers the record that actually carries token totals on a precedence tie", () => {
    const empty = session({ tokens: null });
    const full = session({ id: "claude-code:abc123" });
    const deduped = dedupeSessions([empty, full]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.tokens?.totalTokens).toBe(300);
  });
});
