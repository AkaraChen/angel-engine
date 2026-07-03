import type {
  ConversationSnapshot,
  DisplayMessagePartSnapshot,
  DisplayPlanSnapshot,
  ElicitationSnapshot,
  TurnRunEvent,
  TurnRunResult,
} from "@angel-engine/client-napi";
import { TurnRunEventType } from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import {
  conversationMessages,
  projectTurnRunEvent,
  projectTurnRunResult,
  runtimeConfigFromConversationSnapshot,
} from "../projection";

function conversationSnapshot(
  overrides: Partial<ConversationSnapshot> = {},
): ConversationSnapshot {
  return {
    agentState: {},
    availableCommands: [],
    skills: {
      canList: false,
      canMention: false,
      skills: [],
    },
    context: {
      additionalDirectories: [],
      raw: {},
    },
    elicitations: [],
    history: {
      restored: false,
      source: null,
    },
    id: "conversation-1",
    messages: [],
    remoteId: null,
    remoteKind: "local",
    settings: {
      availableModes: {
        availableModes: [],
        canSet: false,
        currentModeId: null,
      },
      modelList: {
        availableModels: [],
        canSet: false,
        currentModelId: null,
      },
      permissionModes: {
        availableModes: [],
        canSet: false,
        currentModeId: null,
      },
      reasoningLevel: {
        availableOptions: [],
        canSet: false,
        currentLevel: null,
      },
    },
    usage: null,
    ...overrides,
  } as ConversationSnapshot;
}

function toolPart(
  overrides: Partial<NonNullable<DisplayMessagePartSnapshot["action"]>> = {},
): DisplayMessagePartSnapshot {
  return {
    action: {
      error: undefined,
      id: "action-1",
      kind: "command",
      output: [],
      outputText: "",
      phase: "running",
      rawInput: '{"command":"pwd"}',
      title: "pwd",
      turnId: "turn-1",
      ...overrides,
    },
    type: "tool-call",
  };
}

function elicitationSnapshot(
  overrides: Partial<ElicitationSnapshot> = {},
): ElicitationSnapshot {
  return {
    choices: [],
    id: "elicitation-1",
    kind: "approval",
    phase: "open",
    questions: [],
    title: "Permission request",
    turnId: "turn-1",
    ...overrides,
  };
}

function planSnapshot(
  overrides: Partial<DisplayPlanSnapshot> = {},
): DisplayPlanSnapshot {
  return {
    entries: [{ content: "Ship it", status: "in_progress" }],
    kind: "review",
    text: "",
    ...overrides,
  };
}

describe("projection", () => {
  it("projects snapshots into standard chat messages and runtime config", () => {
    const snapshot = conversationSnapshot({
      skills: {
        canList: true,
        canMention: true,
        skills: [
          {
            description: "Create and validate skills",
            enabled: true,
            name: "skill-authoring",
            path: "/home/user/.agents/skills/skill-authoring/SKILL.md",
            scope: "user",
          },
        ],
      },
      messages: [
        {
          content: [{ text: "hello", type: "text" }],
          id: "message-1",
          role: "assistant",
        },
      ],
      settings: {
        availableModes: {
          availableModes: [{ id: "plan", name: "Plan", selected: true }],
          canSet: true,
          currentModeId: "plan",
        },
        modelList: {
          availableModels: [{ id: "sonnet", name: "Sonnet", selected: true }],
          canSet: true,
          currentModelId: "sonnet",
        },
        permissionModes: {
          availableModes: [],
          canSet: false,
          currentModeId: undefined,
        },
        reasoningLevel: {
          availableLevels: [],
          availableOptions: [],
          canSet: false,
          configOptionId: undefined,
          currentLevel: undefined,
          source: "runtime",
        },
      },
    });

    expect(conversationMessages(snapshot)).toEqual([
      {
        content: [{ text: "hello", type: "text" }],
        id: "message-1",
        role: "assistant",
      },
    ]);
    expect(runtimeConfigFromConversationSnapshot(snapshot)).toMatchObject({
      availableSkills: [
        { enabled: true, name: "skill-authoring", scope: "user" },
      ],
      canListSkills: true,
      canMentionSkills: true,
      canSetMode: true,
      currentMode: "plan",
      currentModel: "sonnet",
      modes: [{ label: "Plan", value: "plan" }],
      models: [{ label: "Sonnet", value: "sonnet" }],
    });
  });

  it("projects turn results and events through the same chat shape", () => {
    const result = projectTurnRunResult({
      conversation: conversationSnapshot({
        messages: [
          {
            content: [toolPart()],
            id: "turn-1:assistant",
            role: "assistant",
          },
        ],
      }),
      turnId: "turn-1",
    } as TurnRunResult);
    const event = projectTurnRunEvent({
      messagePart: toolPart({ phase: "completed" }),
      turnId: "turn-1",
      type: TurnRunEventType.Delta,
    } as TurnRunEvent);

    expect(result.content).toHaveLength(1);
    expect(event).toMatchObject({
      action: { id: "action-1", title: "pwd", turnId: "turn-1" },
      type: "tool",
    });
  });

  it("only projects known remote ids as resumable chat thread ids", () => {
    expect(
      projectTurnRunResult({
        conversation: conversationSnapshot({
          remoteId: "req-token-123",
          remoteKind: "pending",
        }),
      } as TurnRunResult).remoteThreadId,
    ).toBeUndefined();

    expect(
      projectTurnRunResult({
        conversation: conversationSnapshot({
          remoteId: "sess-abc",
          remoteKind: "known",
        }),
      } as TurnRunResult).remoteThreadId,
    ).toBe("sess-abc");
  });

  it("projects elicitation tool actions", () => {
    const elicitation = elicitationSnapshot();
    const event = projectTurnRunEvent({
      messagePart: toolPart({
        elicitationId: "elicitation-1",
        kind: "elicitation",
        phase: "awaitingDecision",
        rawInput: JSON.stringify(elicitation),
        title: "Permission request",
      }),
      turnId: "turn-1",
      type: TurnRunEventType.Delta,
    } as TurnRunEvent);

    expect(event).toMatchObject({
      elicitation: {
        id: "elicitation-1",
        kind: "approval",
        phase: "open",
      },
      type: "elicitation",
    });
  });

  it("projects action observed events from message parts", () => {
    const event = projectTurnRunEvent({
      messagePart: toolPart({ phase: "completed" }),
      type: TurnRunEventType.ActionObserved,
    } as TurnRunEvent);

    expect(event).toMatchObject({
      action: {
        id: "action-1",
        phase: "completed",
        title: "pwd",
      },
      type: "tool",
    });
  });

  it("projects elicitation events from message parts", () => {
    const elicitation = elicitationSnapshot();
    const event = projectTurnRunEvent({
      messagePart: toolPart({
        elicitationId: elicitation.id,
        kind: "elicitation",
        phase: "awaitingDecision",
        rawInput: JSON.stringify(elicitation),
        title: "Permission request",
      }),
      type: TurnRunEventType.Elicitation,
    } as TurnRunEvent);

    expect(event).toMatchObject({
      elicitation: {
        id: "elicitation-1",
        phase: "open",
      },
      type: "elicitation",
    });
  });

  it("projects plan updated events from message parts", () => {
    const plan = planSnapshot();
    const event = projectTurnRunEvent({
      messagePart: {
        plan,
        type: "plan",
      },
      turnId: "turn-1",
      type: TurnRunEventType.PlanUpdated,
    } as TurnRunEvent);

    expect(event).toEqual({
      plan: {
        entries: [{ content: "Ship it", status: "in_progress" }],
        kind: "review",
        path: null,
        text: "",
      },
      turnId: "turn-1",
      type: "plan",
    });
  });

  it("throws when required projection input is missing", () => {
    expect(() =>
      projectTurnRunEvent({
        messagePart: toolPart({ title: undefined }),
        turnId: "turn-1",
        type: TurnRunEventType.Delta,
      } as TurnRunEvent),
    ).toThrow("Tool action is missing title.");

    expect(() =>
      projectTurnRunEvent({
        messagePart: toolPart({ turnId: undefined }),
        turnId: "turn-1",
        type: TurnRunEventType.Delta,
      } as TurnRunEvent),
    ).toThrow("Tool action is missing turnId.");
  });
});
