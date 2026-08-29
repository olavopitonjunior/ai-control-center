import { z } from "zod";
import { IsoTimestamp, SourceName, SourceProvenance } from "./common";

/**
 * Token counts, broken out by kind. Every field nullable because not every
 * source reports every category. totalTokens is the source's own total when
 * provided, otherwise the consumer may sum the known parts.
 */
export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  cacheCreationTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * One quota window a provider exposes (session, 5-hour, daily, weekly, monthly,
 * RPM, TPM, ...). `used`/`remaining` are in the limit's native unit (tokens,
 * requests, USD). Percentages are 0–100. Anything unknown is null — the UI must
 * render "Not available", never 0.
 */
export const UsageLimitSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  used: z.number().nonnegative().nullable(),
  remaining: z.number().nonnegative().nullable(),
  capacity: z.number().nonnegative().nullable(),
  usedPercent: z.number().min(0).max(100).nullable(),
  remainingPercent: z.number().min(0).max(100).nullable(),
  resetAt: IsoTimestamp.nullable(),
  resetInSeconds: z.number().int().nullable(),
  /** Where this limit came from and how trustworthy its value is. */
  source: SourceName,
  sourceQuality: SourceProvenance,
});
export type UsageLimit = z.infer<typeof UsageLimitSchema>;

/** Monetary cost over some period, with the currency made explicit. */
export const CostSchema = z.object({
  amount: z.number().nonnegative().nullable(),
  currency: z.string().default("USD"),
  source: SourceName,
  sourceQuality: SourceProvenance,
});
export type Cost = z.infer<typeof CostSchema>;

/** One dimension of a usage breakdown (by model, by agent, by project). */
export const UsageBreakdownEntrySchema = z.object({
  key: z.string(),
  tokens: TokenUsageSchema,
  cost: z.number().nullable(),
});
export type UsageBreakdownEntry = z.infer<typeof UsageBreakdownEntrySchema>;

/** One time bucket (a day / week / month) of usage. */
export const UsagePointSchema = z.object({
  period: z.string(), // e.g. "2026-08-28" (daily), "2026-08" (monthly)
  tokens: TokenUsageSchema,
  cost: z.number().nullable(),
  byModel: z.array(UsageBreakdownEntrySchema).default([]),
  agents: z.array(z.string()).default([]),
});
export type UsagePoint = z.infer<typeof UsagePointSchema>;

export const UsageGranularity = z.enum(["daily", "weekly", "monthly"]);
export type UsageGranularity = z.infer<typeof UsageGranularity>;

/**
 * A normalized usage time-series + breakdowns — the payload behind the Usage screen's
 * charts. Built from ccusage (CALCULATED). Project breakdown is best-effort (ccusage's
 * per-instance split isn't always available) and omitted when unknown rather than faked.
 */
export const UsageReportSchema = z.object({
  granularity: UsageGranularity,
  source: SourceName,
  generatedAt: IsoTimestamp,
  points: z.array(UsagePointSchema).default([]),
  totals: z.object({ tokens: TokenUsageSchema, cost: z.number().nullable() }),
  byModel: z.array(UsageBreakdownEntrySchema).default([]),
  byAgent: z.array(UsageBreakdownEntrySchema).default([]),
  byProject: z.array(UsageBreakdownEntrySchema).default([]),
});
export type UsageReport = z.infer<typeof UsageReportSchema>;

/**
 * Normalized per-provider (per-account) usage rollup — the payload behind the
 * Limits and Usage screens.
 */
export const ProviderUsageSchema = z.object({
  provider: z.string().min(1),
  account: z.string().nullable(),
  source: SourceName,
  updatedAt: IsoTimestamp.nullable(),
  limits: z.array(UsageLimitSchema).default([]),
  credits: z.number().nullable(),
  cost: CostSchema.nullable(),
  tokens: TokenUsageSchema.nullable(),
  status: z.string().nullable(),
});
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>;
