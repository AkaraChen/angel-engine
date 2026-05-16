import type { AgentAdapter } from "./adapter";
import type {
  ChatRuntimeConfig,
  ChatSendInput,
  ChatStreamEvent,
  ChatToolAction,
} from "./types";
import { createId } from "./utils";

export interface MockAgentAdapterOptions {
  delayMs?: number;
  id?: string;
}

export class MockAgentAdapter implements AgentAdapter {
  readonly id: string;
  readonly #delayMs: number;

  constructor(options: MockAgentAdapterOptions = {}) {
    this.id = options.id ?? "mock";
    this.#delayMs = options.delayMs ?? 80;
  }

  inspectConfig(): ChatRuntimeConfig {
    return {
      agentState: {
        currentMode: "chat",
        currentPermissionMode: "ask",
      },
      availableCommands: [
        {
          description: "Pretend to inspect the current workspace.",
          name: "inspect_workspace",
        },
      ],
      canSetMode: true,
      canSetModel: true,
      canSetPermissionMode: true,
      canSetReasoningEffort: true,
      currentMode: "chat",
      currentModel: "mock-fast",
      currentPermissionMode: "ask",
      currentReasoningEffort: "medium",
      modes: [
        { label: "Chat", value: "chat" },
        { label: "Plan", value: "plan" },
      ],
      models: [
        {
          description: "Browser-only deterministic mock",
          label: "Mock fast",
          value: "mock-fast",
        },
        {
          description: "Adds a longer stream",
          label: "Mock thoughtful",
          value: "mock-thoughtful",
        },
      ],
      permissionModes: [
        { label: "Ask", value: "ask" },
        { label: "Auto", value: "auto" },
      ],
      reasoningEfforts: [
        { label: "Low", value: "low" },
        { label: "Medium", value: "medium" },
        { label: "High", value: "high" },
      ],
    };
  }

  async *run(input: ChatSendInput): AsyncIterable<ChatStreamEvent> {
    const turnId = createId("mock-turn");
    const prompt = input.text.trim() || "empty prompt";

    yield {
      part: "reasoning",
      text: "Reading the request and selecting a browser-safe mock response.\n",
      turnId,
      type: "delta",
    };
    await delay(this.#delayMs);

    yield {
      plan: {
        entries: [
          { content: "Create a local chat run", status: "completed" },
          {
            content: "Stream deterministic assistant text",
            status: "in_progress",
          },
          {
            content: "Persist messages in the JS client store",
            status: "pending",
          },
        ],
        kind: "todo",
        presentation: "created",
        text: "Create a local chat run\nStream deterministic assistant text\nPersist messages in the JS client store",
      },
      turnId,
      type: "plan",
    };
    await delay(this.#delayMs);

    const actionId = createId("tool");
    const runningAction: ChatToolAction = {
      id: actionId,
      inputSummary: "Inspect mock project state",
      kind: "inspect_workspace",
      phase: "running",
      rawInput: JSON.stringify({ promptLength: prompt.length }),
      title: "Inspect workspace",
      turnId,
    };
    yield { action: runningAction, type: "tool" };
    await delay(this.#delayMs);
    yield {
      action: {
        ...runningAction,
        output: [{ kind: "text", text: "No backend was contacted." }],
        outputText: "No backend was contacted.",
        phase: "completed",
      },
      type: "toolDelta",
    };

    const response = [
      "This is a pure frontend mock agent.",
      `It received: "${prompt}".`,
      "The JS client owns chats, projects, message persistence, and stream accumulation.",
    ].join(" ");

    for (const token of response.split(/(\s+)/)) {
      await delay(this.#delayMs / 2);
      yield { part: "text", text: token, turnId, type: "delta" };
    }
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
