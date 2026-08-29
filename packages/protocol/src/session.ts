import { z } from "zod";
import { CostSchema, TokenUsageSchema } from "./usage";
import { IsoTimestamp, SourceName } from "./common";

/** Which coding agent produced a session. */
export const AgentKind = z.enum([
  "claude-code",
  "codex",
  "gemini-cli",
  "opencode",
  "ollama",
  "other",
]);
export type AgentKind = z.infer<typeof AgentKind>;

export const SessionStatus = z.enum(["ACTIVE", "IDLE", "ENDED", "UNKNOWN"]);
export type SessionStatus = z.infer<typeof SessionStatus>;

/**
 * A single provenance tag: which field came from which source. Lets the UI show
 * lines like "projectPath source: process" / "tokens source: ccusage".
 */
export const FieldProvenanceSchema = z.object({
  field: z.string().min(1),
  source: SourceName,
});
export type FieldProvenance = z.infer<typeof FieldProvenanceSchema>;

/**
 * An AI coding session. Most fields are nullable: detection is best-effort and
 * we never fabricate a project, model, or token count we cannot determine.
 */
export const AISessionSchema = z.object({
  id: z.string().min(1),
  machineId: z.string().min(1),
  agent: AgentKind,
  pid: z.number().int().nullable(),
  projectName: z.string().nullable(),
  projectPath: z.string().nullable(),
  terminal: z.string().nullable(),
  startedAt: IsoTimestamp.nullable(),
  lastActivityAt: IsoTimestamp.nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  status: SessionStatus,
  model: z.string().nullable(),
  tokens: TokenUsageSchema.nullable(),
  cost: CostSchema.nullable(),
  /** Per-field provenance so the UI can be honest about where each value came from. */
  provenance: z.array(FieldProvenanceSchema).default([]),
});
export type AISession = z.infer<typeof AISessionSchema>;
