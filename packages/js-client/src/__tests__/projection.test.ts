import type {
  ConversationSnapshot,
  DisplayMessagePartSnapshot,
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
    context: {
      additionalDirectories: [],
      raw: {},
    },
    elicitations: [],
    history: {
      hydrated: false,
      replay: [],
      turnCount: 0,
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

describe("projection", () => {
  it("projects snapshots into standard chat messages and runtime config", () => {
    const snapshot = conversationSnapshot({
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

  it.each([
    ["missing", undefined],
    ["invalid JSON", '{"command":"pwd"'],
    ["array JSON", "[]"],
    ["string JSON", '"pwd"'],
    ["boolean JSON", "true"],
    ["null JSON", "null"],
  ])(
    "skips hydrated history tool actions with %s raw input",
    (_name, rawInput) => {
      expect(
        conversationMessages(
          conversationSnapshot({
            history: {
              hydrated: true,
              replay: [],
              turnCount: 1,
            },
            messages: [
              {
                content: [
                  { text: "before", type: "text" },
                  toolPart({ id: "bad-action", inputSummary: "pwd", rawInput }),
                  toolPart({ id: "good-action" }),
                  { text: "after", type: "text" },
                ],
                id: "history-1",
                role: "assistant",
              },
            ],
          }),
        ),
      ).toEqual([
        {
          content: [
            { text: "before", type: "text" },
            expect.objectContaining({
              args: { command: "pwd" },
              toolCallId: "good-action",
              type: "tool-call",
            }),
            { text: "after", type: "text" },
          ],
          id: "history-1",
          role: "assistant",
        },
      ]);
    },
  );

  it("throws on non-history snapshot messages with malformed tool raw input", () => {
    expect(() =>
      conversationMessages(
        conversationSnapshot({
          history: {
            hydrated: true,
            replay: [],
            turnCount: 1,
          },
          messages: [
            {
              content: [toolPart({ rawInput: "[]" })],
              id: "turn-1:assistant",
              role: "assistant",
            },
          ],
        }),
      ),
    ).toThrow("Tool action raw input must be a JSON object.");
  });

  it("throws on live result snapshots with malformed tool raw input", () => {
    expect(() =>
      projectTurnRunResult({
        conversation: conversationSnapshot({
          history: {
            hydrated: true,
            replay: [],
            turnCount: 1,
          },
          messages: [
            {
              content: [toolPart({ rawInput: "[]" })],
              id: "turn-1:assistant",
              role: "assistant",
            },
          ],
        }),
        turnId: "turn-1",
      } as TurnRunResult),
    ).toThrow("Tool action raw input must be a JSON object.");
  });

  it("projects elicitation tool actions", () => {
    const event = projectTurnRunEvent({
      messagePart: toolPart({
        elicitationId: "elicitation-1",
        kind: "elicitation",
        phase: "awaitingDecision",
        rawInput: JSON.stringify({
          id: "elicitation-1",
          kind: "approval",
          phase: "open",
        }),
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
