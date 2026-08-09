import {
  blocksResponseSchema,
  unifiedResponseSchema,
  type AggregateOutput,
} from "./schema.js";
import { resolveCcusageBinary } from "./binary.js";
import { runCcusageJson, UsageCollectionError } from "./exec.js";
import {
  CCUSAGE_VERSION,
  type UsageAgentTotal,
  type UsageAvailability,
  type UsagePeriodTotal,
  type UsageReport,
  type UsageSession,
} from "./types.js";

const CACHE_MS = 10_000;

function tokenCounts(
  item: Pick<
    AggregateOutput,
    "cacheCreationTokens" | "cacheReadTokens" | "inputTokens" | "outputTokens"
  >,
) {
  return {
    cacheCreation: item.cacheCreationTokens,
    cacheRead: item.cacheReadTokens,
    input: item.inputTokens,
    output: item.outputTokens,
  };
}

function periodTotal(
  items: AggregateOutput[],
  period: string,
): UsagePeriodTotal {
  const item = items.find((candidate) => candidate.period === period);
  return { costUsd: item?.totalCost ?? 0, tokens: item?.totalTokens ?? 0 };
}

function currentWeekPeriod(now = new Date()): string {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  return start.toISOString().slice(0, 10);
}

function aggregateAgents(sessions: UsageSession[]): UsageAgentTotal[] {
  const totals = new Map<string, UsageAgentTotal>();
  for (const session of sessions) {
    const current = totals.get(session.agent) ?? {
      agent: session.agent,
      costUsd: 0,
      tokens: 0,
    };
    current.costUsd += session.totalCost;
    current.tokens += session.totalTokens;
    totals.set(session.agent, current);
  }
  return [...totals.values()].sort((left, right) =>
    left.agent.localeCompare(right.agent),
  );
}

export class UsageCollector {
  private cached?: UsageAvailability;
  private inFlight?: Promise<UsageAvailability>;

  getSnapshot(): UsageAvailability {
    return this.cached ?? { kind: "collecting" };
  }

  async collect(options: { force?: boolean } = {}): Promise<UsageAvailability> {
    if (this.inFlight) return this.inFlight;
    if (
      !options.force &&
      this.cached?.kind === "ok" &&
      Date.now() - this.cached.collectedAt < CACHE_MS
    ) {
      return this.cached;
    }

    this.inFlight = this.collectFresh().finally(() => {
      this.inFlight = undefined;
    });
    const availability = await this.inFlight;
    this.cached = availability;
    return availability;
  }

  private async collectFresh(): Promise<UsageAvailability> {
    const binaryPath = await resolveCcusageBinary();
    if (!binaryPath) return { kind: "unavailable", reason: "binary-missing" };

    try {
      const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
      const [blocks, unified] = await Promise.all([
        runCcusageJson(
          binaryPath,
          ["blocks", "--active"],
          blocksResponseSchema,
          15_000,
        ),
        runCcusageJson(
          binaryPath,
          [
            "daily",
            "--sections",
            "daily,weekly,monthly,session",
            "--by-agent",
            "--since",
            monthStart,
          ],
          unifiedResponseSchema,
          30_000,
        ),
      ]);
      const collectedAt = Date.now();
      const sessions: UsageSession[] = unified.session.map((session) => ({
        agent: session.agent,
        lastActivity: session.metadata?.lastActivity,
        models: session.modelsUsed,
        period: session.period,
        tokenCounts: tokenCounts(session),
        totalCost: session.totalCost,
        totalTokens: session.totalTokens,
      }));
      const active = blocks.blocks.find((block) => block.isActive);
      const report: UsageReport = {
        activeBlock: active
          ? {
              burnRate: {
                costPerHour: active.burnRate.costPerHour,
                tokensPerMinute: active.burnRate.tokensPerMinute,
              },
              costUsd: active.costUSD,
              endTime: active.endTime,
              id: active.id,
              isActive: active.isActive,
              models: active.models,
              projection: {
                remainingMinutes: active.projection.remainingMinutes,
                totalCost: active.projection.totalCost,
              },
              startTime: active.startTime,
              tokenCounts: {
                cacheCreation: active.tokenCounts.cacheCreationInputTokens,
                cacheRead: active.tokenCounts.cacheReadInputTokens,
                input: active.tokenCounts.inputTokens,
                output: active.tokenCounts.outputTokens,
              },
            }
          : undefined,
        agentTotals: aggregateAgents(sessions),
        ccusageVersion: CCUSAGE_VERSION,
        collectedAt,
        periods: {
          month: periodTotal(
            unified.monthly,
            new Date().toISOString().slice(0, 7),
          ),
          today: periodTotal(
            unified.daily,
            new Date().toISOString().slice(0, 10),
          ),
          week: periodTotal(unified.weekly, currentWeekPeriod()),
        },
        sessions,
      };
      return { collectedAt, kind: "ok", report };
    } catch (error) {
      if (error instanceof UsageCollectionError) {
        return {
          detail: error.message,
          kind: "unavailable",
          reason: error.reason,
        };
      }
      return {
        detail: error instanceof Error ? error.message : String(error),
        kind: "unavailable",
        reason: "exec-failed",
      };
    }
  }
}
