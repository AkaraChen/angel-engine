import { describe, expect, it } from "vitest";
import {
  countNeedsYou,
  selectTrayActivities,
  sortTraySessions,
  trayBadgeLabel,
} from "./model";

function activity(
  chatId: string,
  status: "waiting_for_you" | "running" | "stuck" | "failed" | "done",
  updatedAt = "2026-01-01T00:00:00.000Z",
) {
  if (status === "waiting_for_you") {
    return {
      attentionId: `${chatId}-attention`,
      chatId,
      reason: "question" as const,
      runId: `${chatId}-run`,
      status,
      updatedAt,
    };
  }
  if (status === "running") {
    return {
      chatId,
      runId: `${chatId}-run`,
      status,
      updatedAt,
    };
  }
  if (status === "stuck") {
    return {
      chatId,
      reason: "process_exited" as const,
      runId: `${chatId}-run`,
      status,
      updatedAt,
    };
  }
  if (status === "failed") {
    return {
      attentionId: `${chatId}-attention`,
      chatId,
      failure: { message: "boom" },
      reason: "runtime_error" as const,
      runId: `${chatId}-run`,
      status,
      updatedAt,
    };
  }
  return {
    attentionId: `${chatId}-attention`,
    chatId,
    runId: `${chatId}-run`,
    status,
    updatedAt,
  };
}

describe("countNeedsYou", () => {
  it("counts only waiting_for_you rows", () => {
    expect(
      countNeedsYou([
        activity("a", "waiting_for_you"),
        activity("b", "running"),
        activity("c", "waiting_for_you"),
        activity("d", "done"),
      ]),
    ).toBe(2);
  });

  it("returns 0 for an empty fleet", () => {
    expect(countNeedsYou([])).toBe(0);
  });
});

describe("trayBadgeLabel", () => {
  it("is empty when nothing needs the user", () => {
    expect(trayBadgeLabel(0)).toBe("");
  });

  it("shows the raw count for small values", () => {
    expect(trayBadgeLabel(3)).toBe("3");
  });

  it("caps large counts", () => {
    expect(trayBadgeLabel(100)).toBe("99+");
  });
});

describe("selectTrayActivities", () => {
  it("orders needs-you ahead of running and done", () => {
    const selected = selectTrayActivities([
      activity("done", "done", "2026-01-03T00:00:00.000Z"),
      activity("run", "running", "2026-01-02T00:00:00.000Z"),
      activity("need", "waiting_for_you", "2026-01-01T00:00:00.000Z"),
    ]);

    expect(selected.map((item) => item.chatId)).toEqual([
      "need",
      "run",
      "done",
    ]);
  });

  it("caps the menu list", () => {
    const activities = Array.from({ length: 20 }, (_, index) =>
      activity(
        `chat-${index}`,
        "running",
        `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
      ),
    );

    expect(selectTrayActivities(activities, 5)).toHaveLength(5);
  });
});

describe("sortTraySessions", () => {
  it("keeps needs-you first then title order", () => {
    const sorted = sortTraySessions([
      {
        chatId: "b",
        projectId: null,
        status: "running",
        title: "Beta",
      },
      {
        chatId: "a",
        projectId: null,
        status: "waiting_for_you",
        title: "Alpha",
      },
      {
        chatId: "c",
        projectId: null,
        status: "waiting_for_you",
        title: "Charlie",
      },
    ]);

    expect(sorted.map((item) => item.chatId)).toEqual(["a", "c", "b"]);
  });
});
