export type AutomationStatus = "active" | "failing" | "paused" | "running";

export type AutomationRunStatus =
  | "cancelled"
  | "failed"
  | "missed"
  | "running"
  | "succeeded";

export type SchedulePreset =
  | "every-30-minutes"
  | "hourly"
  | "daily"
  | "weekdays"
  | "weekly"
  | "custom";

export interface AutomationRun {
  durationSeconds?: number;
  error?: string;
  id: string;
  startedAt: string;
  status: AutomationRunStatus;
  trigger: "manual" | "scheduled";
}

export interface Automation {
  agentLabel: string;
  cron: string;
  enabled: boolean;
  id: string;
  name: string;
  nextRunAt?: string;
  notifyOnFailure: boolean;
  projectId?: string;
  projectName?: string;
  prompt: string;
  runs: AutomationRun[];
  scheduleLabel: string;
  status: AutomationStatus;
}

export interface CreateAutomationInput {
  agentLabel: string;
  cron: string;
  name: string;
  notifyOnFailure: boolean;
  projectId?: string;
  projectName?: string;
  prompt: string;
  scheduleLabel: string;
}

export const scheduleFixture: Automation[] = [
  {
    agentLabel: "Current agent",
    cron: "0 9 * * *",
    enabled: true,
    id: "dependency-audit",
    name: "Daily dependency audit",
    nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    notifyOnFailure: true,
    projectId: "angel-engine",
    projectName: "angel-engine",
    prompt:
      "Audit dependency updates and security advisories. Summarize only actionable changes.",
    runs: [
      {
        durationSeconds: 94,
        id: "audit-run-1",
        startedAt: "2026-08-09T01:00:00.000Z",
        status: "succeeded",
        trigger: "scheduled",
      },
      {
        id: "audit-run-2",
        startedAt: "2026-08-08T01:00:00.000Z",
        status: "missed",
        trigger: "scheduled",
      },
    ],
    scheduleLabel: "Every day at 09:00",
    status: "active",
  },
  {
    agentLabel: "Current agent",
    cron: "*/30 * * * *",
    enabled: true,
    id: "ci-heartbeat",
    name: "CI heartbeat",
    nextRunAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    notifyOnFailure: true,
    projectId: "angel-engine",
    projectName: "angel-engine",
    prompt: "Check CI and report only failures or jobs that appear stuck.",
    runs: [
      {
        durationSeconds: 38,
        error: "Desktop typecheck failed in workspace-page-view.tsx",
        id: "heartbeat-run-1",
        startedAt: "2026-08-09T15:30:00.000Z",
        status: "failed",
        trigger: "scheduled",
      },
      {
        durationSeconds: 31,
        id: "heartbeat-run-2",
        startedAt: "2026-08-09T15:00:00.000Z",
        status: "succeeded",
        trigger: "scheduled",
      },
    ],
    scheduleLabel: "Every 30 minutes",
    status: "failing",
  },
  {
    agentLabel: "Current agent",
    cron: "0 2 * * *",
    enabled: false,
    id: "nightly-tests",
    name: "Nightly test sweep",
    notifyOnFailure: true,
    prompt: "Run the test suite and summarize failures with likely owners.",
    runs: [],
    scheduleLabel: "Every day at 02:00",
    status: "paused",
  },
];

const CRON_FIELD_PATTERN = /^(?:\*|\d+)(?:[-/,]\d+)*$/;

export function validateCron(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  return (
    fields.length === 5 &&
    fields.every((field) => CRON_FIELD_PATTERN.test(field))
  );
}

export function nextRunPreview(
  preset: SchedulePreset,
  now = new Date(),
): Date[] {
  const next = new Date(now);
  next.setSeconds(0, 0);

  switch (preset) {
    case "every-30-minutes":
      next.setMinutes(next.getMinutes() < 30 ? 30 : 60);
      return sequence(next, 30 * 60 * 1000);
    case "hourly":
    case "custom":
      next.setMinutes(0);
      next.setHours(next.getHours() + 1);
      return sequence(next, 60 * 60 * 1000);
    case "daily":
      moveToFutureHour(next, 9);
      return sequence(next, 24 * 60 * 60 * 1000);
    case "weekly":
      moveToFutureHour(next, 9);
      next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7));
      return sequence(next, 7 * 24 * 60 * 60 * 1000);
    case "weekdays": {
      moveToFutureHour(next, 9);
      const values: Date[] = [];
      while (values.length < 3) {
        if (next.getDay() !== 0 && next.getDay() !== 6) {
          values.push(new Date(next));
        }
        next.setDate(next.getDate() + 1);
      }
      return values;
    }
  }
}

export function hasMissedRun(automations: Automation[]): boolean {
  return automations.some((automation) =>
    automation.runs.some((run) => run.status === "missed"),
  );
}

export function sortedRuns(runs: AutomationRun[]): AutomationRun[] {
  return [...runs].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

function moveToFutureHour(value: Date, hour: number): void {
  const currentTime = value.getTime();
  value.setHours(hour, 0, 0, 0);
  if (value.getTime() <= currentTime) value.setDate(value.getDate() + 1);
}

function sequence(first: Date, intervalMs: number): Date[] {
  return [0, 1, 2].map(
    (index) => new Date(first.getTime() + intervalMs * index),
  );
}
