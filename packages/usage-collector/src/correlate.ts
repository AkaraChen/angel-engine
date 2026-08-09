import type {
  ProviderUsageAvailability,
  UsageAvailability,
  UsageReport,
  UsageSession,
} from "./types.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODEX_PERIOD_PATTERN =
  /(?:^|\/)(?:rollout-[^/]*-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const SUPPORTED_AGENTS = new Set([
  "amp",
  "claude",
  "codebuff",
  "codex",
  "copilot",
  "droid",
  "gemini",
  "goose",
  "hermes",
  "kilo",
  "kimi",
  "openclaw",
  "opencode",
  "pi",
  "qwen",
]);

export function normalizedSessionId(
  agent: string,
  period: string,
): string | undefined {
  if ((agent === "claude" || agent === "kimi") && UUID_PATTERN.test(period)) {
    return period.toLowerCase();
  }
  if (agent === "codex") {
    return CODEX_PERIOD_PATTERN.exec(period)?.[1]?.toLowerCase();
  }
  return undefined;
}

export function findUsageSession(
  report: UsageReport,
  agent: string,
  remoteId: string,
): UsageSession | undefined {
  const expected = UUID_PATTERN.test(remoteId)
    ? remoteId.toLowerCase()
    : undefined;
  if (!expected) return undefined;
  return report.sessions.find(
    (session) =>
      session.agent === agent &&
      normalizedSessionId(agent, session.period) === expected,
  );
}

export function providerUsageAvailability(
  availability: UsageAvailability,
  agent: string,
  remoteId?: string | null,
): ProviderUsageAvailability {
  if (availability.kind !== "ok") return availability;
  if (!SUPPORTED_AGENTS.has(agent)) return { agent, kind: "unsupported" };

  const total = availability.report.agentTotals.find(
    (candidate) => candidate.agent === agent,
  );
  if (!total) return { agent, kind: "no-data" };

  return {
    agent,
    kind: "ok",
    session: remoteId
      ? findUsageSession(availability.report, agent, remoteId)
      : undefined,
    total,
  };
}
