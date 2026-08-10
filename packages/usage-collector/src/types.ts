export const CCUSAGE_VERSION = "20.0.19" as const;

export type UsageUnavailableReason =
  | "binary-missing"
  | "exec-failed"
  | "schema-mismatch"
  | "timeout";

export interface UsageTokenCounts {
  cacheCreation: number;
  cacheRead: number;
  input: number;
  output: number;
}

export interface UsageBlock {
  burnRate: {
    costPerHour: number;
    tokensPerMinute: number;
  };
  costUsd: number;
  endTime: string;
  id: string;
  isActive: boolean;
  models: string[];
  projection: {
    remainingMinutes: number;
    totalCost: number;
  };
  startTime: string;
  tokenCounts: UsageTokenCounts;
}

export interface UsageSession {
  agent: string;
  lastActivity?: string;
  models: string[];
  period: string;
  tokenCounts: UsageTokenCounts;
  totalCost: number;
  totalTokens: number;
}

export interface UsagePeriodTotal {
  costUsd: number;
  tokens: number;
}

export interface UsageAgentTotal extends UsagePeriodTotal {
  agent: string;
}

export interface UsageReport {
  activeBlock?: UsageBlock;
  agentTotals: UsageAgentTotal[];
  ccusageVersion: typeof CCUSAGE_VERSION;
  collectedAt: number;
  periods: {
    month: UsagePeriodTotal;
    today: UsagePeriodTotal;
    week: UsagePeriodTotal;
  };
  sessions: UsageSession[];
}

export type UsageAvailability =
  | { kind: "collecting" }
  | { collectedAt: number; kind: "ok"; report: UsageReport }
  | {
      detail?: string;
      kind: "unavailable";
      reason: UsageUnavailableReason;
    };

export type ProviderUsageAvailability =
  | { agent: string; kind: "unsupported" }
  | { agent: string; kind: "no-data" }
  | {
      agent: string;
      kind: "ok";
      session?: UsageSession;
      total: UsageAgentTotal;
    }
  | Extract<UsageAvailability, { kind: "collecting" | "unavailable" }>;
