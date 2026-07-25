import type {
  CreateCustomAgentInput,
  CustomAgent,
  CustomAgentEnvironmentVariable,
} from "@angel-engine/daemon-api/agents";

export interface CustomAgentDraft {
  argsText: string;
  command: string;
  environmentText: string;
  label: string;
}

export type CustomAgentDraftAction = {
  field: keyof CustomAgentDraft;
  value: string;
};

export function createCustomAgentDraft(
  agent: CustomAgent | null,
): CustomAgentDraft {
  return {
    argsText: agent?.args.join("\n") ?? "",
    command: agent?.command ?? "",
    environmentText:
      agent?.environment
        .map((item) => `${item.name}=${item.value}`)
        .join("\n") ?? "",
    label: agent?.label ?? "",
  };
}

export function customAgentDraftReducer(
  state: CustomAgentDraft,
  action: CustomAgentDraftAction,
): CustomAgentDraft {
  return { ...state, [action.field]: action.value };
}

export function buildCustomAgentInput(
  draft: CustomAgentDraft,
): CreateCustomAgentInput {
  return {
    args: parseArgs(draft.argsText),
    command: draft.command.trim(),
    environment: parseEnvironment(draft.environmentText),
    label: draft.label.trim(),
  };
}

function parseArgs(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEnvironment(value: string): CustomAgentEnvironmentVariable[] {
  return value
    .split(/\r?\n/)
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 0) {
        return { name: line.trim(), value: "" };
      }
      return {
        name: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1),
      };
    })
    .filter((item) => item.name.length > 0);
}
