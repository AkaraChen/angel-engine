import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";

import { EngineEventElicitationKind } from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import {
  claudeElicitationBody,
  claudeElicitationChoices,
  claudeElicitationKind,
  claudeElicitationQuestions,
  updatedInputFromElicitationResponse,
} from "../elicitation";
import { CLAUDE_TOOL } from "../sdk-types";

type CanUseToolContext = Parameters<CanUseTool>[2];

const askInput = {
  questions: [
    {
      header: "Mode",
      multiSelect: false,
      options: [
        { description: "Use the fast path", label: "Fast" },
        { description: "Use the safe path", label: "Safe" },
      ],
      question: "Which mode should I use?",
    },
  ],
};

function context(
  overrides: Partial<CanUseToolContext> = {},
): CanUseToolContext {
  return {
    signal: new AbortController().signal,
    toolUseID: "tool-1",
    ...overrides,
  };
}

describe("claude elicitations", () => {
  it("classifies questions as user input and other tools as approval", () => {
    expect(claudeElicitationKind(CLAUDE_TOOL.AskUserQuestion, askInput)).toBe(
      EngineEventElicitationKind.UserInput,
    );
    expect(
      claudeElicitationKind(CLAUDE_TOOL.Read, { file_path: "/tmp/a.txt" }),
    ).toBe(EngineEventElicitationKind.Approval);

    expect(
      claudeElicitationChoices(CLAUDE_TOOL.AskUserQuestion, askInput),
    ).toEqual([]);
    expect(
      claudeElicitationChoices(CLAUDE_TOOL.Read, { file_path: "/tmp/a.txt" }),
    ).toEqual(["Allow", "Allow for session", "Deny"]);
  });

  it("uses context text before fallback body text", () => {
    expect(
      claudeElicitationBody(
        CLAUDE_TOOL.Read,
        { file_path: "/tmp/a.txt" },
        context({ description: "Read file" }),
        "Fallback",
      ),
    ).toBe("Read file");
    expect(
      claudeElicitationBody(
        CLAUDE_TOOL.Read,
        { file_path: "/tmp/a.txt" },
        context({ decisionReason: "Need context" }),
        "Fallback",
      ),
    ).toBe("Need context");
    expect(
      claudeElicitationBody(
        CLAUDE_TOOL.AskUserQuestion,
        askInput,
        context(),
        "Fallback",
      ),
    ).toBeNull();
  });

  it("normalizes question schemas and answer responses", () => {
    expect(
      claudeElicitationQuestions(CLAUDE_TOOL.AskUserQuestion, askInput),
    ).toEqual([
      expect.objectContaining({
        header: "Mode",
        id: "question-0",
        options: [
          { description: "Use the fast path", label: "Fast" },
          { description: "Use the safe path", label: "Safe" },
        ],
        question: "Which mode should I use?",
        schema: expect.objectContaining({
          multiple: false,
          required: true,
          value_type: "String",
        }),
      }),
    ]);
    expect(
      claudeElicitationQuestions(CLAUDE_TOOL.Read, { file_path: "/tmp/a.txt" }),
    ).toEqual([]);

    expect(
      updatedInputFromElicitationResponse(
        CLAUDE_TOOL.AskUserQuestion,
        askInput,
        {
          answers: [{ id: "question-0", value: "Fast" }],
          type: "answers",
        },
      ),
    ).toMatchObject({
      answers: { "Which mode should I use?": "Fast" },
    });
    expect(
      updatedInputFromElicitationResponse(
        CLAUDE_TOOL.AskUserQuestion,
        askInput,
        {
          type: "deny",
        },
      ),
    ).toBe(askInput);
  });
});
