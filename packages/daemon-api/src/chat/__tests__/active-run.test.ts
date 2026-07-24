import type {
  ChatActiveRunResult,
  ChatActiveRunSnapshot,
  ChatOpenElicitation,
  ChatRunObserverEvent,
} from "..";
import {
  isChatActiveRunResult,
  isChatActiveRunSnapshot,
  isChatRunObserverEvent,
} from "..";
import { describe, expect, it } from "vitest";

const elicitation: ChatOpenElicitation = {
  body: "Run the focused tests?",
  id: "elicitation-1",
  kind: "approval",
  phase: "open",
  title: "Permission",
};

const running: ChatActiveRunSnapshot = {
  assistantMessage: {
    content: [{ text: "Working", type: "text" }],
    createdAt: "2026-07-24T12:00:00.000Z",
    id: "assistant-1",
    role: "assistant",
  },
  chatId: "chat-1",
  lastEventSequence: 2,
  pendingElicitation: null,
  runId: "run-1",
  startedAt: "2026-07-24T12:00:00.000Z",
  status: "running",
  updatedAt: "2026-07-24T12:00:01.000Z",
  userMessage: {
    content: [{ text: "Run the tests", type: "text" }],
    createdAt: "2026-07-24T12:00:00.000Z",
    id: "user-1",
    role: "user",
  },
};

const needsInput: ChatActiveRunSnapshot = {
  ...running,
  lastEventSequence: 3,
  pendingElicitation: elicitation,
  status: "needsInput",
};

describe("active run boundary guards", () => {
  it("accepts both valid active-run states", () => {
    expect(isChatActiveRunSnapshot(running)).toBe(true);
    expect(isChatActiveRunSnapshot(needsInput)).toBe(true);
  });

  it("accepts active-run lookup results", () => {
    const present: ChatActiveRunResult = { run: needsInput };
    const absent: ChatActiveRunResult = { run: null };

    expect(isChatActiveRunResult(present)).toBe(true);
    expect(isChatActiveRunResult(absent)).toBe(true);
  });

  it("accepts snapshot-first observer messages", () => {
    const snapshot: ChatRunObserverEvent = {
      snapshot: running,
      type: "snapshot",
    };
    const event: ChatRunObserverEvent = {
      event: { part: "text", text: ".", type: "delta" },
      sequence: 3,
      type: "event",
    };

    expect(isChatRunObserverEvent(snapshot)).toBe(true);
    expect(isChatRunObserverEvent(event)).toBe(true);
  });

  it.each([
    [
      "a running state with pending input",
      { ...running, pendingElicitation: elicitation },
    ],
    [
      "a needs-input state without pending input",
      { ...needsInput, pendingElicitation: null },
    ],
    [
      "a needs-input state with a closed elicitation",
      {
        ...needsInput,
        pendingElicitation: { ...elicitation, phase: "resolved:Answers" },
      },
    ],
    [
      "a needs-input state without an elicitation id",
      {
        ...needsInput,
        pendingElicitation: { ...elicitation, id: "" },
      },
    ],
    ["an unknown state", { ...running, status: "completed" }],
    ["a negative last sequence", { ...running, lastEventSequence: -1 }],
    ["a fractional last sequence", { ...running, lastEventSequence: 1.5 }],
    [
      "a user message in the assistant slot",
      {
        ...running,
        assistantMessage: { ...running.assistantMessage, role: "user" },
      },
    ],
    [
      "an assistant message in the user slot",
      {
        ...running,
        userMessage: { ...running.userMessage, role: "assistant" },
      },
    ],
    [
      "a malformed assistant content part",
      {
        ...running,
        assistantMessage: {
          ...running.assistantMessage,
          content: [{ text: 42, type: "text" }],
        },
      },
    ],
    [
      "a non-canonical timestamp",
      { ...running, updatedAt: "2026-07-24 12:00:01" },
    ],
    [
      "an update timestamp before the start",
      { ...running, updatedAt: "2026-07-24T11:59:59.000Z" },
    ],
  ])("rejects %s", (_label, snapshot) => {
    expect(isChatActiveRunSnapshot(snapshot)).toBe(false);
  });

  it.each([
    [
      "a zero observer sequence",
      {
        event: { part: "text", text: ".", type: "delta" },
        sequence: 0,
        type: "event",
      },
    ],
    [
      "a malformed nested stream event",
      {
        event: { part: "analysis", text: ".", type: "delta" },
        sequence: 3,
        type: "event",
      },
    ],
    [
      "a malformed snapshot",
      {
        snapshot: { ...running, status: "completed" },
        type: "snapshot",
      },
    ],
  ])("rejects %s", (_label, event) => {
    expect(isChatRunObserverEvent(event)).toBe(false);
  });
});
