import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ActiveRun, EngineMessage } from "../chat-run-types";

import { describe, expect, it } from "vitest";

import { createRunHandles, getRunHandles } from "../chat-run-handles";
import { selectSlot } from "../chat-run-reducer";
import {
  getChatRunContext,
  moveActiveRunToChat,
  replaceAssistantMessage,
  sendChatRunEvent,
} from "../chat-run-registry";

let counter = 0;
function uniqueKey(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}`;
}

function engineMessage(id: string, role: "assistant" | "user"): EngineMessage {
  return {
    attachments: [],
    content: [{ text: id, type: "text" }],
    createdAt: new Date(0),
    id,
    metadata: {
      custom: {},
      steps: [],
      unstable_annotations: [],
      unstable_data: [],
    },
    role,
    status: { reason: "stop", type: "complete" },
  } as unknown as EngineMessage;
}

function activeRun(runId: string, slotKey: string): ActiveRun {
  return {
    assistantMessageId: `${runId}-assistant`,
    initialSlotKey: slotKey,
    runId,
    startedAt: 0,
  };
}

function chat(id: string): Chat {
  return {
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    cwd: null,
    id,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: "Chat",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function startRun(slotKey: string, runId: string) {
  const run = activeRun(runId, slotKey);
  sendChatRunEvent({
    activeRun: run,
    assistantMessage: engineMessage(run.assistantMessageId, "assistant"),
    slotKey,
    type: "run.started",
    userMessage: engineMessage(`${runId}-user`, "user"),
  });
  return run;
}

describe("chat run registry machine", () => {
  it("spawns an idle slot on initialization with history messages", () => {
    const key = uniqueKey("slot");
    sendChatRunEvent({
      input: { historyMessages: [], historyRevision: 1, slotKey: key },
      messages: [engineMessage("history-1", "assistant")],
      type: "slot.initialized",
    });

    const slot = selectSlot(getChatRunContext(), key);
    expect(slot?.status).toBe("idle");
    expect(slot?.messages.map((message) => message.id)).toEqual(["history-1"]);
  });

  it("starts a run: user message appended, assistant streams separately", () => {
    const key = uniqueKey("slot");
    startRun(key, "run-a");

    const slot = selectSlot(getChatRunContext(), key);
    expect(slot?.status).toBe("streaming");
    expect(slot?.messages.map((message) => message.id)).toEqual(["run-a-user"]);
    expect(slot?.streamingAssistant?.id).toBe("run-a-assistant");
  });

  it("keeps the transcript reference-stable across stream deltas", () => {
    const key = uniqueKey("slot");
    const run = startRun(key, "run-b");
    const before = selectSlot(getChatRunContext(), key);

    const replaced = replaceAssistantMessage(
      key,
      run.runId,
      run.assistantMessageId,
      engineMessage(run.assistantMessageId, "assistant"),
    );
    const after = selectSlot(getChatRunContext(), key);

    expect(replaced).toBe(true);
    expect(after?.messages).toBe(before?.messages);
    expect(after?.streamingAssistant).not.toBe(before?.streamingAssistant);
  });

  it("ignores stale stream events from a previous run and aborts the replaced one", () => {
    const key = uniqueKey("slot");
    const oldHandles = createRunHandles("run-old");
    startRun(key, "run-old");
    const run = startRun(key, "run-new");

    expect(oldHandles.abortController.signal.aborted).toBe(true);

    const replaced = replaceAssistantMessage(
      key,
      "run-old",
      "run-old-assistant",
      engineMessage("run-old-assistant", "assistant"),
    );

    expect(replaced).toBe(false);
    const slot = selectSlot(getChatRunContext(), key);
    expect(slot?.activeRun?.runId).toBe(run.runId);
  });

  it("re-keys a draft slot to its created chat and resolves the old key", () => {
    const key = uniqueKey("draft");
    const run = startRun(key, "run-c");
    const created = chat(uniqueKey("chat"));

    const nextKey = moveActiveRunToChat(key, created, run.runId);

    expect(nextKey).toBe(created.id);
    const state = getChatRunContext();
    expect(Object.hasOwn(state.slots, key)).toBe(false);
    const slot = selectSlot(state, key);
    expect(slot?.key).toBe(created.id);
    expect(slot?.chatId).toBe(created.id);
    expect(slot?.status).toBe("streaming");
  });

  it("merges the final assistant message into the transcript on finish", () => {
    const key = uniqueKey("slot");
    const run = startRun(key, "run-d");

    sendChatRunEvent({
      assistantMessage: engineMessage(run.assistantMessageId, "assistant"),
      runId: run.runId,
      slotKey: key,
      type: "run.finished",
    });

    const slot = selectSlot(getChatRunContext(), key);
    expect(slot?.status).toBe("idle");
    expect(slot?.streamingAssistant).toBeUndefined();
    expect(slot?.messages.map((message) => message.id)).toEqual([
      "run-d-user",
      "run-d-assistant",
    ]);
  });

  it("merges a cancelled run into the transcript as incomplete and aborts the stream", () => {
    const key = uniqueKey("slot");
    const handles = createRunHandles("run-e");
    const run = startRun(key, "run-e");

    sendChatRunEvent({ slotKey: key, type: "run.cancelled" });

    expect(handles.cancelled).toBe(true);
    expect(handles.abortController.signal.aborted).toBe(true);
    expect(getRunHandles("run-e")).toBe(handles);

    const slot = selectSlot(getChatRunContext(), key);
    expect(slot?.status).toBe("idle");
    const assistant = slot?.messages.find(
      (message) => message.id === run.assistantMessageId,
    );
    expect(assistant?.status).toMatchObject({
      reason: "cancelled",
      type: "incomplete",
    });
  });

  it("lets a fresh draft reclaim a redirected draft key", () => {
    const key = uniqueKey("draft");
    const run = startRun(key, "run-f");
    const created = chat(uniqueKey("chat"));
    moveActiveRunToChat(key, created, run.runId);
    sendChatRunEvent({
      assistantMessage: engineMessage(run.assistantMessageId, "assistant"),
      runId: run.runId,
      slotKey: key,
      type: "run.finished",
    });

    sendChatRunEvent({
      input: { historyMessages: [], historyRevision: 0, slotKey: key },
      messages: [],
      type: "slot.initialized",
    });

    const state = getChatRunContext();
    const draftSlot = state.slots[key];
    expect(draftSlot?.messages).toEqual([]);
    expect(draftSlot?.chatId).toBeUndefined();
    // The finished chat remains addressable under its own id.
    expect(state.slots[created.id]?.chatId).toBe(created.id);
  });

  it("drops a slot and its redirects", () => {
    const key = uniqueKey("slot");
    startRun(key, "run-g");

    sendChatRunEvent({ slotKey: key, type: "slot.dropped" });

    expect(selectSlot(getChatRunContext(), key)).toBeUndefined();
  });

  it("spawns a slot to hold permission bypass state when missing", () => {
    const key = uniqueKey("slot");
    sendChatRunEvent({
      response: { type: "allow" },
      slotKey: key,
      type: "slot.permissionBypassEnabled",
    });

    const slot = selectSlot(getChatRunContext(), key);
    expect(slot?.permissionBypassEnabled).toBe(true);
    expect(slot?.status).toBe("idle");
  });
});
