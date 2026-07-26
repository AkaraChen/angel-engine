import type { ChatActivity, ChatSummary } from "@/platform/chat-types";

import { describe, expect, it } from "vitest";

import {
  buildChatActivityRows,
  chatActivityFailureMessage,
  chatActivityRowTimestamp,
  countChatActivityRows,
  filterChatActivityRows,
  terminalAttentionId,
} from "./activity-model";

function chat(id: string): ChatSummary {
  return {
    id,
    pinned: false,
    projectId: null,
    projectName: null,
    runtime: "codex",
    title: id,
    updatedAt: "2026-07-25T00:00:00.000Z",
    worktreeBranch: null,
  };
}

const ACTIVITIES: ChatActivity[] = [
  {
    attentionId: "run-4:done",
    chatId: "done",
    runId: "run-4",
    status: "done",
    updatedAt: "2026-07-25T01:03:00.000Z",
  },
  {
    chatId: "running",
    runId: "run-3",
    status: "running",
    updatedAt: "2026-07-25T01:02:00.000Z",
  },
  {
    chatId: "stuck",
    reason: "process_exited",
    runId: "run-5",
    status: "stuck",
    updatedAt: "2026-07-25T01:04:00.000Z",
  },
  {
    attentionId: "run-2:failed",
    chatId: "failed",
    failure: { message: "the runtime exited" },
    reason: "runtime_error",
    runId: "run-2",
    status: "failed",
    updatedAt: "2026-07-25T01:01:00.000Z",
  },
  {
    attentionId: "run-1:input:elicitation-1",
    chatId: "waiting",
    reason: "approval",
    runId: "run-1",
    status: "waiting_for_you",
    updatedAt: "2026-07-25T01:00:00.000Z",
  },
];

const CHATS = [
  chat("idle"),
  chat("done"),
  chat("running"),
  chat("stuck"),
  chat("failed"),
  chat("waiting"),
];

describe("buildChatActivityRows", () => {
  it("orders active chats by urgency and keeps inactive ones last", () => {
    const rows = buildChatActivityRows({
      activities: ACTIVITIES,
      chats: CHATS,
    });

    expect(rows.map((row) => row.chat.id)).toEqual([
      "waiting",
      "failed",
      "stuck",
      "running",
      "done",
      "idle",
    ]);
  });

  it("keeps the daemon list order among chats with no activity", () => {
    const rows = buildChatActivityRows({
      activities: [],
      chats: [chat("b"), chat("a"), chat("c")],
    });

    expect(rows.map((row) => row.chat.id)).toEqual(["b", "a", "c"]);
  });

  it("breaks urgency ties with the most recent activity first", () => {
    const rows = buildChatActivityRows({
      activities: [
        {
          chatId: "older",
          runId: "run-1",
          status: "running",
          updatedAt: "2026-07-25T01:00:00.000Z",
        },
        {
          chatId: "newer",
          runId: "run-2",
          status: "running",
          updatedAt: "2026-07-25T02:00:00.000Z",
        },
      ],
      chats: [chat("older"), chat("newer")],
    });

    expect(rows.map((row) => row.chat.id)).toEqual(["newer", "older"]);
  });

  it("ignores activity for a chat that is not in the list", () => {
    const rows = buildChatActivityRows({
      activities: ACTIVITIES,
      chats: [chat("idle")],
    });

    expect(rows).toEqual([{ activity: null, chat: chat("idle") }]);
  });
});

describe("filterChatActivityRows", () => {
  const rows = buildChatActivityRows({ activities: ACTIVITIES, chats: CHATS });

  it("groups waiting, failed and stuck under the attention segment", () => {
    expect(
      filterChatActivityRows(rows, "attention").map((row) => row.chat.id),
    ).toEqual(["waiting", "failed", "stuck"]);
  });

  it("keeps chats without activity out of every segment but all", () => {
    expect(filterChatActivityRows(rows, "running")).toHaveLength(1);
    expect(filterChatActivityRows(rows, "done")).toHaveLength(1);
    expect(filterChatActivityRows(rows, "all")).toHaveLength(6);
  });
});

describe("countChatActivityRows", () => {
  it("counts every chat under all and only active ones per segment", () => {
    const rows = buildChatActivityRows({
      activities: ACTIVITIES,
      chats: CHATS,
    });

    expect(countChatActivityRows(rows)).toEqual({
      all: 6,
      attention: 3,
      done: 1,
      running: 1,
    });
  });
});

describe("chatActivityRowTimestamp", () => {
  it("reports the timestamp the row is ordered by, not the chat's own", () => {
    // The chat has been idle for months; the run that floated it to the top
    // started a minute ago, and that is the time the row has to show.
    const rows = buildChatActivityRows({
      activities: [
        {
          chatId: "running",
          runId: "run-1",
          status: "running",
          updatedAt: "2026-07-25T01:02:00.000Z",
        },
      ],
      chats: [{ ...chat("running"), updatedAt: "2026-01-01T00:00:00.000Z" }],
    });

    expect(chatActivityRowTimestamp(rows[0])).toBe("2026-07-25T01:02:00.000Z");
  });

  it("falls back to the chat for a row with no activity", () => {
    const rows = buildChatActivityRows({ activities: [], chats: [chat("a")] });

    expect(chatActivityRowTimestamp(rows[0])).toBe("2026-07-25T00:00:00.000Z");
  });
});

describe("chatActivityFailureMessage", () => {
  it("surfaces the daemon failure message only for failed rows", () => {
    const rows = buildChatActivityRows({
      activities: ACTIVITIES,
      chats: CHATS,
    });
    const byChatId = new Map(rows.map((row) => [row.chat.id, row]));

    expect(chatActivityFailureMessage(byChatId.get("failed")!)).toBe(
      "the runtime exited",
    );
    expect(chatActivityFailureMessage(byChatId.get("stuck")!)).toBeUndefined();
    expect(chatActivityFailureMessage(byChatId.get("idle")!)).toBeUndefined();
  });
});

describe("terminalAttentionId", () => {
  it("returns the marker only for statuses the user can acknowledge", () => {
    const byChatId = new Map(
      ACTIVITIES.map((activity) => [activity.chatId, activity]),
    );

    expect(terminalAttentionId(byChatId.get("done")!)).toBe("run-4:done");
    expect(terminalAttentionId(byChatId.get("failed")!)).toBe("run-2:failed");
    expect(terminalAttentionId(byChatId.get("waiting")!)).toBeUndefined();
    expect(terminalAttentionId(byChatId.get("running")!)).toBeUndefined();
    expect(terminalAttentionId(byChatId.get("stuck")!)).toBeUndefined();
  });
});
