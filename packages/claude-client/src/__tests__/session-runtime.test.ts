import type {
  ModelInfo,
  SDKControlInitializeResponse,
} from "@anthropic-ai/claude-agent-sdk";

import { describe, expect, it } from "vitest";
import { ClaudeCodeSessionRuntime } from "../session-runtime";

const models: ModelInfo[] = [
  {
    description: "Recommended model",
    displayName: "Default",
    supportedEffortLevels: ["low", "medium", "high"],
    supportsEffort: true,
    value: "default",
  },
  {
    description: "Fast model",
    displayName: "Haiku",
    value: "haiku",
  },
];

const initialization: SDKControlInitializeResponse = {
  account: {},
  agents: [],
  available_output_styles: [],
  commands: [],
  models,
  output_style: "default",
};

describe("ClaudeCodeSessionRuntime reasoning effort", () => {
  it("publishes the default model's supported effort levels and current effort", async () => {
    const runtime = new ClaudeCodeSessionRuntime();
    const conversation = runtime.ensureConversation({ cwd: "/workspace" });

    await runtime.applyRuntimeConfiguration(conversation.id, initialization);

    const snapshot = runtime.requireConversation();
    expect(runtime.currentModel).toBe("default");
    expect(snapshot.settings.reasoningLevel).toMatchObject({
      availableLevels: ["low", "medium", "high"],
      canSet: true,
      currentLevel: "high",
    });
    expect(
      snapshot.settings.reasoningLevel.availableOptions.map((option) => ({
        selected: option.selected,
        value: option.value,
      })),
    ).toEqual([
      { selected: false, value: "low" },
      { selected: false, value: "medium" },
      { selected: true, value: "high" },
    ]);

    runtime.close();
  });

  it("updates the current effort when a send selection sets it", async () => {
    const runtime = new ClaudeCodeSessionRuntime();
    const conversation = runtime.ensureConversation({ cwd: "/workspace" });
    await runtime.applyRuntimeConfiguration(conversation.id, initialization);

    runtime.applySelections(conversation.id, {
      reasoningEffort: "medium",
      text: "Hello",
    });

    expect(runtime.currentReasoningEffort).toBe("medium");
    expect(
      runtime.requireConversation().settings.reasoningLevel.currentLevel,
    ).toBe("medium");

    runtime.close();
  });
});
