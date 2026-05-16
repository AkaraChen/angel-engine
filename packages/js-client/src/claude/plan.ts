import type { ExitPlanModeInput } from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import type {
  ClaudeFileWriteInput,
  ClaudeToolInput,
  ClaudeTodoWriteInput,
} from "./sdk-types.js";
import type { ChatJsonObject } from "../types.js";
import type { ActiveClaudeTurn, EngineEventJson } from "./types.js";

import { homedir } from "node:os";

import path from "node:path";
import {
  EngineEventContentKind,
  PlanEntryStatus,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import { CLAUDE_TOOL, typedClaudeInput } from "./sdk-types.js";

interface PlanStateJson {
  entries: Array<{ content: string; status: string }>;
}

export function planEventsFromToolUse(
  active: ActiveClaudeTurn,
  toolName: string,
  input: ClaudeToolInput,
): EngineEventJson[] {
  const filePlan = planFromFileWriteToolUse(toolName, input);
  if (filePlan) {
    return planEventsFromStructuredPlan(active, filePlan);
  }

  const todoInput = typedClaudeInput(toolName, input, CLAUDE_TOOL.TodoWrite);
  if (todoInput) {
    const plan = planFromTodoInput(todoInput);
    return plan
      ? [
          {
            TodoUpdated: {
              conversation_id: active.conversationId,
              todo: plan,
              turn_id: active.turnId,
            },
          },
        ]
      : [];
  }

  const exitPlanInput = typedClaudeInput(
    toolName,
    input,
    CLAUDE_TOOL.ExitPlanMode,
  );
  if (!exitPlanInput) return [];
  const text = planTextFromExitPlanModeInput(exitPlanInput);
  if (!text) return [];

  const events: EngineEventJson[] = [
    {
      PlanDelta: {
        conversation_id: active.conversationId,
        delta: { [EngineEventContentKind.Text]: text },
        turn_id: active.turnId,
      },
    },
  ];
  const path = planPathFromExitPlanModeInput(exitPlanInput);
  if (path) {
    events.push({
      PlanPathUpdated: {
        conversation_id: active.conversationId,
        path,
        turn_id: active.turnId,
      },
    });
  }
  return events;
}

export function isClaudePlanToolUse(
  toolName: string,
  input?: ClaudeToolInput,
): boolean {
  if (toolName === CLAUDE_TOOL.TodoWrite) return true;
  if (toolName === CLAUDE_TOOL.ExitPlanMode) return true;
  return Boolean(input && planFromFileWriteToolUse(toolName, input));
}

export function structuredPlanFromToolUse(
  toolName: string,
  input: ClaudeToolInput,
): ChatJsonObject | undefined {
  const filePlan = planFromFileWriteToolUse(toolName, input);
  if (filePlan) return filePlan;

  const todoInput = typedClaudeInput(toolName, input, CLAUDE_TOOL.TodoWrite);
  if (todoInput) {
    const plan = planFromTodoInput(todoInput);
    if (!plan) return undefined;
    return { entries: plan.entries, kind: "todo", text: "", type: "plan" };
  }

  const exitPlanInput = typedClaudeInput(
    toolName,
    input,
    CLAUDE_TOOL.ExitPlanMode,
  );
  if (!exitPlanInput) return undefined;
  const text = planTextFromExitPlanModeInput(exitPlanInput);
  const path = planPathFromExitPlanModeInput(exitPlanInput);
  if (!text && !path) return undefined;
  return {
    entries: markdownPlanEntries(text),
    kind: "review",
    ...(path ? { path } : {}),
    text,
    type: "plan",
  };
}

function planEventsFromStructuredPlan(
  active: ActiveClaudeTurn,
  plan: ChatJsonObject,
): EngineEventJson[] {
  const text = typeof plan.text === "string" ? plan.text : "";
  const events: EngineEventJson[] = text
    ? [
        {
          PlanDelta: {
            conversation_id: active.conversationId,
            delta: { [EngineEventContentKind.Text]: text },
            turn_id: active.turnId,
          },
        },
      ]
    : [];
  if (typeof plan.path === "string" && plan.path) {
    events.push({
      PlanPathUpdated: {
        conversation_id: active.conversationId,
        path: plan.path,
        turn_id: active.turnId,
      },
    });
  }
  if (Array.isArray(plan.entries) && plan.entries.length > 0) {
    events.push({
      PlanUpdated: {
        conversation_id: active.conversationId,
        plan: { entries: plan.entries },
        turn_id: active.turnId,
      },
    });
  }
  return events;
}

function planFromFileWriteToolUse(
  toolName: string,
  input: ClaudeToolInput,
): ChatJsonObject | undefined {
  const writeInput = typedClaudeInput(toolName, input, CLAUDE_TOOL.Write);
  if (!writeInput || !isClaudePlanFileWrite(writeInput)) return undefined;
  if (typeof writeInput.content !== "string") return undefined;
  if (!writeInput.content) return undefined;
  return {
    entries: markdownPlanEntries(writeInput.content),
    kind: "review",
    path: writeInput.file_path,
    text: writeInput.content,
    type: "plan",
  };
}

function isClaudePlanFileWrite(input: ClaudeFileWriteInput): boolean {
  if (typeof input.file_path !== "string") return false;
  if (path.extname(input.file_path).toLowerCase() !== ".md") return false;
  return claudePlansDirs().some((plansDir) => {
    const relativePath = path.relative(plansDir, input.file_path);
    return (
      relativePath.length > 0 &&
      !relativePath.startsWith("..") &&
      !path.isAbsolute(relativePath)
    );
  });
}

function claudePlansDirs(): string[] {
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  const defaultDir = path.join(homedir(), ".claude");
  return Array.from(
    new Set(
      [configDir, defaultDir].filter((dir): dir is string => Boolean(dir)),
    ),
  ).map((dir) => path.join(dir, "plans"));
}

function planFromTodoInput(
  input: ClaudeTodoWriteInput,
): PlanStateJson | undefined {
  const entries = input.todos
    .map((todo) => {
      if (!is.string(todo.content)) {
        throw new Error("Claude todo content is missing.");
      }
      if (!is.string(todo.status)) {
        throw new Error("Claude todo status is missing.");
      }
      return {
        content: todo.content,
        status: todo.status,
      };
    })
    .filter((entry) => entry.content);
  if (entries.length === 0) return undefined;
  return { entries };
}

function planTextFromExitPlanModeInput(input: ExitPlanModeInput): string {
  if (!is.string(input.plan)) {
    throw new Error("Claude exit plan input is missing plan.");
  }
  return input.plan;
}

function planPathFromExitPlanModeInput(
  input: ExitPlanModeInput,
): string | undefined {
  return typeof input.planFilePath === "string" && input.planFilePath
    ? input.planFilePath
    : undefined;
}

function markdownPlanEntries(
  text: string,
): Array<{ content: string; status: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => line)
    .flatMap((line) => {
      const match = line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
      return match ? [match[1]] : [];
    })
    .filter((line) => line && !line.startsWith("`"))
    .slice(0, 20)
    .map((content) => ({ content, status: PlanEntryStatus.Pending }));
}
