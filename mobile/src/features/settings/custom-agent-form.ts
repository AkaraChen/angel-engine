import type {
  CreateCustomAgentInput,
  CustomAgent,
  CustomAgentEnvironmentVariable,
} from "@angel-engine/daemon-api/agents";

export interface CustomAgentDraft {
  argsText: string;
  autoAuthenticate: boolean;
  command: string;
  environmentText: string;
  label: string;
  needAuth: boolean;
}

export type CustomAgentDraftAction = {
  [Field in keyof CustomAgentDraft]: {
    field: Field;
    value: CustomAgentDraft[Field];
  };
}[keyof CustomAgentDraft];

export function createCustomAgentDraft(
  agent: CustomAgent | null,
): CustomAgentDraft {
  return {
    argsText: agent?.args.join("\n") ?? "",
    autoAuthenticate: agent?.autoAuthenticate ?? false,
    command: agent?.command ?? "",
    environmentText:
      agent?.environment
        .map((item) => `${item.name}=${item.value}`)
        .join("\n") ?? "",
    label: agent?.label ?? "",
    needAuth: agent?.needAuth ?? false,
  };
}

export function customAgentDraftReducer(
  state: CustomAgentDraft,
  action: CustomAgentDraftAction,
): CustomAgentDraft {
  switch (action.field) {
    case "argsText":
      return { ...state, argsText: action.value };
    case "autoAuthenticate":
      return { ...state, autoAuthenticate: action.value };
    case "command":
      return { ...state, command: action.value };
    case "environmentText":
      return { ...state, environmentText: action.value };
    case "label":
      return { ...state, label: action.value };
    case "needAuth":
      return { ...state, needAuth: action.value };
  }
}

export function buildCustomAgentInput(
  draft: CustomAgentDraft,
): CreateCustomAgentInput {
  return {
    args: parseArgs(draft.argsText),
    autoAuthenticate: draft.needAuth && draft.autoAuthenticate,
    command: draft.command.trim(),
    environment: parseEnvironment(draft.environmentText),
    label: draft.label.trim(),
    needAuth: draft.needAuth,
  };
}

// ACP arguments and environment variables stay line-oriented on mobile.
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
