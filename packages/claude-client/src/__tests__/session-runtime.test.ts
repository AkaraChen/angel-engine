import type {
  CanUseTool,
  ModelInfo,
  SDKControlInitializeResponse,
} from "@anthropic-ai/claude-agent-sdk";
import type { ActiveClaudeTurn } from "../types";

import { describe, expect, it, vi } from "vitest";
import { ClaudeCodeSessionRuntime } from "../session-runtime";
import { CLAUDE_TOOL } from "../sdk-types";

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

describe("ClaudeCodeSessionRuntime ExitPlanMode leave-plan", () => {
  it("switches plan → default after ExitPlanMode is allowed", async () => {
    const runtime = new ClaudeCodeSessionRuntime();
    const conversation = runtime.ensureConversation({ cwd: "/workspace" });
    await runtime.applyRuntimeConfiguration(conversation.id, initialization);
    runtime.currentPermissionMode = "plan";
    // Keep current_mode_id as plan in the options catalog for the assertion below.
    runtime.applySelections(conversation.id, {
      permissionMode: "plan",
      text: "plan then implement",
    });

    const setPermissionMode = vi.fn().mockResolvedValue(undefined);
    runtime.activeQuery = {
      close: vi.fn(),
      setPermissionMode,
    } as unknown as NonNullable<ClaudeCodeSessionRuntime["activeQuery"]>;

    const turn = runtime.startEngineTurn(
      conversation.id,
      "plan then implement",
      [],
    );
    const active: ActiveClaudeTurn = {
      actionIds: new Set(),
      conversationId: conversation.id,
      request: { text: "plan then implement" },
      sawReasoningDelta: false,
      sawTextDelta: false,
      turnId: turn.turnId,
    };

    const canUseTool = runtime.canUseTool(active, (events) => {
      runtime.applyEngineEvents(events);
    });

    const pending = canUseTool(
      CLAUDE_TOOL.ExitPlanMode,
      {
        plan: "# Plan\n\n- Step\n",
        planFilePath: "/tmp/plan.md",
      },
      {
        signal: new AbortController().signal,
        toolUseID: "exit-1",
      } as Parameters<CanUseTool>[2],
    );

    runtime.resolveElicitation("exit-1", { type: "allow" });
    await expect(pending).resolves.toMatchObject({
      behavior: "allow",
      toolUseID: "exit-1",
    });

    expect(runtime.currentPermissionMode).toBe("default");
    expect(setPermissionMode).toHaveBeenCalledWith("default");
    expect(
      runtime.requireConversation().settings.permissionModes.currentModeId,
    ).toBe("default");

    runtime.close();
  });

  it("does not change mode when ExitPlanMode is denied", async () => {
    const runtime = new ClaudeCodeSessionRuntime();
    const conversation = runtime.ensureConversation({ cwd: "/workspace" });
    await runtime.applyRuntimeConfiguration(conversation.id, initialization);
    runtime.applySelections(conversation.id, {
      permissionMode: "plan",
      text: "stay in plan",
    });

    const turn = runtime.startEngineTurn(conversation.id, "stay in plan", []);
    const active: ActiveClaudeTurn = {
      actionIds: new Set(),
      conversationId: conversation.id,
      request: { text: "stay in plan" },
      sawReasoningDelta: false,
      sawTextDelta: false,
      turnId: turn.turnId,
    };
    const canUseTool = runtime.canUseTool(active, (events) => {
      runtime.applyEngineEvents(events);
    });
    const pending = canUseTool(
      CLAUDE_TOOL.ExitPlanMode,
      { plan: "x", planFilePath: "/tmp/plan.md" },
      {
        signal: new AbortController().signal,
        toolUseID: "exit-deny",
      } as Parameters<CanUseTool>[2],
    );
    runtime.resolveElicitation("exit-deny", { type: "deny" });
    await expect(pending).resolves.toMatchObject({ behavior: "deny" });
    expect(runtime.currentPermissionMode).toBe("plan");
    runtime.close();
  });
});
