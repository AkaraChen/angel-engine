import type { Chat, ChatActivity } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";

import { describe, expect, it } from "vitest";

import {
  buildFleetRows,
  countFleetRows,
  filterFleetRows,
  FLEET_PROJECT_FILTER_ALL,
  FLEET_PROJECT_FILTER_STANDALONE,
  fleetProjectOptions,
  groupFleetRows,
  resolveFleetProjectFilter,
} from "./fleet-model";

const PROJECT: Project = {
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "project-1",
  name: "Angel",
  path: "/code/angel-engine",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Project;

function chat(overrides: Partial<Chat> & { id: string }): Chat {
  return {
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    cwd: null,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "claude",
    title: `Chat ${overrides.id}`,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function running(chatId: string, updatedAt: string): ChatActivity {
  return { chatId, runId: `${chatId}-run`, status: "running", updatedAt };
}

function waiting(chatId: string, updatedAt: string): ChatActivity {
  return {
    attentionId: `${chatId}-attention`,
    chatId,
    reason: "approval",
    runId: `${chatId}-run`,
    status: "waiting_for_you",
    updatedAt,
  };
}

function failed(chatId: string, updatedAt: string): ChatActivity {
  return {
    attentionId: `${chatId}-attention`,
    chatId,
    failure: { message: "runtime exited" },
    reason: "runtime_error",
    runId: `${chatId}-run`,
    status: "failed",
    updatedAt,
  };
}

function stuck(chatId: string, updatedAt: string): ChatActivity {
  return {
    chatId,
    reason: "process_exited",
    runId: `${chatId}-run`,
    status: "stuck",
    updatedAt,
  };
}

function done(chatId: string, updatedAt: string): ChatActivity {
  return {
    attentionId: `${chatId}-attention`,
    chatId,
    runId: `${chatId}-run`,
    status: "done",
    updatedAt,
  };
}

describe("buildFleetRows", () => {
  it("orders waiting_for_you, failed, stuck, running, then done", () => {
    const chats = ["a", "b", "c", "d", "e"].map((id) => chat({ id }));
    const rows = buildFleetRows({
      activities: [
        done("a", "2026-01-01T00:05:00.000Z"),
        running("b", "2026-01-01T00:04:00.000Z"),
        stuck("c", "2026-01-01T00:03:00.000Z"),
        failed("d", "2026-01-01T00:02:00.000Z"),
        waiting("e", "2026-01-01T00:01:00.000Z"),
      ],
      chats,
      projects: [],
    });

    expect(rows.map((row) => row.chatId)).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("breaks status ties by most recent update", () => {
    const chats = ["a", "b"].map((id) => chat({ id }));
    const rows = buildFleetRows({
      activities: [
        running("a", "2026-01-01T00:01:00.000Z"),
        running("b", "2026-01-01T00:09:00.000Z"),
      ],
      chats,
      projects: [],
    });

    expect(rows.map((row) => row.chatId)).toEqual(["b", "a"]);
  });

  it("reports the daemon status verbatim rather than re-deriving it", () => {
    // A run the user stopped explicitly leaves the daemon projection entirely,
    // so it must not surface here at all — and never as `failed`.
    const rows = buildFleetRows({
      activities: [running("a", "2026-01-01T00:01:00.000Z")],
      chats: [chat({ id: "a" }), chat({ id: "stopped" })],
      projects: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("running");
    expect(rows[0].failureMessage).toBeUndefined();
  });

  it("keeps the failure message for failed runs", () => {
    const rows = buildFleetRows({
      activities: [failed("a", "2026-01-01T00:01:00.000Z")],
      chats: [chat({ id: "a" })],
      projects: [],
    });

    expect(rows[0].failureMessage).toBe("runtime exited");
  });

  it("exposes a terminal marker only for runs that ended", () => {
    const rows = buildFleetRows({
      activities: [
        done("done", "2026-01-01T00:04:00.000Z"),
        failed("failed", "2026-01-01T00:03:00.000Z"),
        waiting("waiting", "2026-01-01T00:02:00.000Z"),
        running("running", "2026-01-01T00:01:00.000Z"),
      ],
      chats: ["done", "failed", "waiting", "running"].map((id) => chat({ id })),
      projects: [],
    });
    const markers = new Map(
      rows.map((row) => [row.chatId, row.terminalAttentionId]),
    );

    expect(markers.get("done")).toBe("done-attention");
    expect(markers.get("failed")).toBe("failed-attention");
    expect(markers.get("waiting")).toBeUndefined();
    expect(markers.get("running")).toBeUndefined();
  });

  it("drops activity whose chat is unknown or archived", () => {
    const rows = buildFleetRows({
      activities: [
        running("missing", "2026-01-01T00:01:00.000Z"),
        running("archived", "2026-01-01T00:02:00.000Z"),
        running("live", "2026-01-01T00:03:00.000Z"),
      ],
      chats: [chat({ archived: true, id: "archived" }), chat({ id: "live" })],
      projects: [],
    });

    expect(rows.map((row) => row.chatId)).toEqual(["live"]);
  });

  it("joins project name and worktree name from chat metadata", () => {
    const rows = buildFleetRows({
      activities: [
        running("worktree", "2026-01-01T00:02:00.000Z"),
        running("main", "2026-01-01T00:01:00.000Z"),
      ],
      chats: [
        chat({
          cwd: "/code/worktrees/feature-x",
          id: "worktree",
          projectId: PROJECT.id,
        }),
        chat({ cwd: PROJECT.path, id: "main", projectId: PROJECT.id }),
      ],
      projects: [PROJECT],
    });

    expect(rows[0]).toMatchObject({
      projectName: "angel-engine",
      worktreeName: "feature-x",
    });
    expect(rows[1].worktreeName).toBeUndefined();
  });
});

describe("filterFleetRows", () => {
  const rows = buildFleetRows({
    activities: [
      waiting("a", "2026-01-01T00:01:00.000Z"),
      running("b", "2026-01-01T00:02:00.000Z"),
      done("c", "2026-01-01T00:03:00.000Z"),
    ],
    chats: [
      chat({ id: "a", projectId: PROJECT.id }),
      chat({ id: "b" }),
      chat({ id: "c", projectId: PROJECT.id }),
    ],
    projects: [PROJECT],
  });

  it("filters by segment", () => {
    expect(
      filterFleetRows(rows, {
        projectFilter: FLEET_PROJECT_FILTER_ALL,
        segment: "attention",
      }).map((row) => row.chatId),
    ).toEqual(["a"]);
  });

  it("filters by project", () => {
    expect(
      filterFleetRows(rows, {
        projectFilter: PROJECT.id,
        segment: "all",
      }).map((row) => row.chatId),
    ).toEqual(["a", "c"]);
  });

  it("filters chats without a project", () => {
    expect(
      filterFleetRows(rows, {
        projectFilter: FLEET_PROJECT_FILTER_STANDALONE,
        segment: "all",
      }).map((row) => row.chatId),
    ).toEqual(["b"]);
  });

  it("searches the title, the project and the worktree", () => {
    const search = (query: string) =>
      filterFleetRows(rows, {
        projectFilter: FLEET_PROJECT_FILTER_ALL,
        search: query,
        segment: "all",
      }).map((row) => row.chatId);

    expect(search("chat a")).toEqual(["a"]);
    expect(search("ANGEL-ENGINE")).toEqual(["a", "c"]);
    expect(search("  ")).toEqual(["a", "b", "c"]);
    expect(search("nothing")).toEqual([]);
  });

  it("counts every group", () => {
    expect(countFleetRows(rows)).toEqual({
      all: 3,
      attention: 1,
      done: 1,
      running: 1,
    });
  });

  it("emits only non-empty groups in display order", () => {
    expect(groupFleetRows(rows).map((section) => section.group)).toEqual([
      "attention",
      "running",
      "done",
    ]);
    expect(
      groupFleetRows(rows.filter((row) => row.group === "done")).map(
        (section) => section.group,
      ),
    ).toEqual(["done"]);
  });
});

describe("fleetProjectOptions", () => {
  const rows = buildFleetRows({
    activities: [
      running("a", "2026-01-01T00:01:00.000Z"),
      running("b", "2026-01-01T00:02:00.000Z"),
    ],
    chats: [chat({ id: "a", projectId: PROJECT.id }), chat({ id: "b" })],
    projects: [PROJECT],
  });
  const labels = { allProjects: "All projects", standalone: "No project" };

  it("offers only projects that have activity", () => {
    expect(fleetProjectOptions(rows, labels)).toEqual([
      { label: "All projects", value: FLEET_PROJECT_FILTER_ALL },
      { label: "angel-engine", value: PROJECT.id },
      { label: "No project", value: FLEET_PROJECT_FILTER_STANDALONE },
    ]);
  });

  it("omits the standalone option when every row has a project", () => {
    const projectRows = rows.filter((row) => row.projectId !== undefined);
    expect(
      fleetProjectOptions(projectRows, labels).map((option) => option.value),
    ).toEqual([FLEET_PROJECT_FILTER_ALL, PROJECT.id]);
  });

  it("falls back to all projects when the filtered project disappears", () => {
    const options = fleetProjectOptions([], labels);
    expect(resolveFleetProjectFilter(PROJECT.id, options)).toBe(
      FLEET_PROJECT_FILTER_ALL,
    );
    expect(resolveFleetProjectFilter(FLEET_PROJECT_FILTER_ALL, options)).toBe(
      FLEET_PROJECT_FILTER_ALL,
    );
  });
});
