import { type as arkType } from "arktype";

export type AutomationRunStatus =
  | "cancelled"
  | "failed"
  | "missed"
  | "running"
  | "succeeded";
export type AutomationStatus = "active" | "failing" | "paused" | "running";
export type AutomationTrigger = "manual" | "scheduled";
export type AutomationWorkspaceKind = "project" | "worktree";

export interface AutomationRun {
  automationId: string;
  chatId: string | null;
  error: string | null;
  finishedAt: string | null;
  id: string;
  scheduledFor: string | null;
  startedAt: string;
  status: AutomationRunStatus;
  trigger: AutomationTrigger;
}

export interface Automation {
  createdAt: string;
  cron: string;
  enabled: boolean;
  id: string;
  name: string;
  nextRunAt: string | null;
  notifyOnFailure: boolean;
  projectId: string | null;
  prompt: string;
  runs: AutomationRun[];
  runtime: string;
  status: AutomationStatus;
  updatedAt: string;
  workspaceKind: AutomationWorkspaceKind;
}

export interface CreateAutomationInput {
  cron: string;
  enabled?: boolean;
  name: string;
  notifyOnFailure?: boolean;
  projectId?: string;
  prompt: string;
  runtime: string;
  workspaceKind?: AutomationWorkspaceKind;
}

export interface UpdateAutomationInput {
  cron?: string;
  enabled?: boolean;
  name?: string;
  notifyOnFailure?: boolean;
  projectId?: string | null;
  prompt?: string;
  runtime?: string;
  workspaceKind?: AutomationWorkspaceKind;
}

export const createAutomationInputSchema = arkType({
  "+": "ignore",
  "enabled?": "boolean | undefined",
  "notifyOnFailure?": "boolean | undefined",
  "projectId?": "string > 0 | undefined",
  "workspaceKind?": "'project' | 'worktree' | undefined",
  cron: "string > 0",
  name: "string > 0",
  prompt: "string > 0",
  runtime: "string > 0",
});

export const updateAutomationInputSchema = arkType({
  "+": "ignore",
  "cron?": "string > 0 | undefined",
  "enabled?": "boolean | undefined",
  "name?": "string > 0 | undefined",
  "notifyOnFailure?": "boolean | undefined",
  "projectId?": "string > 0 | null | undefined",
  "prompt?": "string > 0 | undefined",
  "runtime?": "string > 0 | undefined",
  "workspaceKind?": "'project' | 'worktree' | undefined",
});
