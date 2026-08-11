import type {
  Chat,
  ImportableSession,
  ListImportableSessionsResult,
} from "@angel-engine/daemon-api/chat";
import { describe, expect, it, vi } from "vitest";
import {
  alreadyImportedRemoteIds,
  failedImportRemoteIds,
  filterImportableSessions,
  importSessionAndOpen,
  importSessionsBatch,
  importSubmitBlockReason,
  importableSessionPrimaryLabel,
  importableSessionSecondaryLabel,
  searchImportableSessions,
  selectAllImportIds,
  successfulImportChatIds,
  toggleImportSelection,
} from "./import-session-handlers";

function chat(partial: Partial<Chat> & Pick<Chat, "id">): Chat {
  return {
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    cwd: null,
    pinned: false,
    projectId: "project-1",
    remoteThreadId: null,
    runtime: "codex",
    title: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("import session handlers", () => {
  it("searches importable sessions through the list API with runtime and dir", async () => {
    const result: ListImportableSessionsResult = {
      nextCursor: null,
      sessions: [
        {
          cwd: "/repo",
          remoteId: "remote-1",
          title: "Imported thread",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      unsupportedReason: null,
    };
    const listImportableSessions = vi.fn(async () => result);
    const api = { chats: { listImportableSessions, importSession: vi.fn() } };

    await expect(
      searchImportableSessions(api, { cwd: "/repo", runtime: "codex" }),
    ).resolves.toEqual(result);
    expect(listImportableSessions).toHaveBeenCalledWith({
      cwd: "/repo",
      runtime: "codex",
    });
  });

  it("imports a selected session through the import API and returns open result", async () => {
    const importResult = {
      chat: {
        archived: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        cwd: "/repo",
        id: "chat-1",
        pinned: false,
        projectId: "project-1",
        remoteThreadId: "remote-1",
        runtime: "codex",
        title: "Imported thread",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      messages: [],
    };
    const importSession = vi.fn(async () => importResult);
    const api = {
      chats: { listImportableSessions: vi.fn(), importSession },
    };

    await expect(
      importSessionAndOpen(api, {
        cwd: "/repo",
        projectId: "project-1",
        remoteThreadId: "remote-1",
        runtime: "codex",
        title: "Imported thread",
      }),
    ).resolves.toEqual(importResult);
    expect(importSession).toHaveBeenCalledWith({
      cwd: "/repo",
      projectId: "project-1",
      remoteThreadId: "remote-1",
      runtime: "codex",
      title: "Imported thread",
    });
  });

  it("labels sessions from title/metadata without inventing remote ids", () => {
    const session: ImportableSession = {
      cwd: "/repo",
      remoteId: "remote-1",
      title: "Fix tests",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(importableSessionPrimaryLabel(session)).toBe("Fix tests");
    expect(importableSessionSecondaryLabel(session)).toContain("/repo");
    expect(
      importableSessionPrimaryLabel({ remoteId: "only-id", title: null }),
    ).toBe("only-id");
  });

  it("rejects search/import without runtime, remote id, or project", async () => {
    const api = {
      chats: {
        listImportableSessions: vi.fn(),
        importSession: vi.fn(),
      },
    };
    await expect(
      searchImportableSessions(api, { runtime: "" }),
    ).rejects.toThrow(/runtime/i);
    await expect(
      importSessionAndOpen(api, {
        projectId: "project-1",
        remoteThreadId: "x",
        runtime: "",
      }),
    ).rejects.toThrow(/runtime/i);
    await expect(
      importSessionAndOpen(api, {
        projectId: "project-1",
        remoteThreadId: "",
        runtime: "codex",
      }),
    ).rejects.toThrow(/remote/i);
    await expect(
      importSessionAndOpen(api, {
        projectId: "",
        remoteThreadId: "remote-1",
        runtime: "codex",
      }),
    ).rejects.toThrow(/project/i);
  });

  it("filters sessions by title, remote id, cwd, or updated time", () => {
    const sessions: ImportableSession[] = [
      {
        cwd: "/alpha",
        remoteId: "r1",
        title: "Fix login",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        cwd: "/beta",
        remoteId: "r2",
        title: "Add tests",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ];
    expect(
      filterImportableSessions(sessions, "login").map((s) => s.remoteId),
    ).toEqual(["r1"]);
    expect(
      filterImportableSessions(sessions, "r2").map((s) => s.remoteId),
    ).toEqual(["r2"]);
    expect(
      filterImportableSessions(sessions, "/beta").map((s) => s.remoteId),
    ).toEqual(["r2"]);
    expect(filterImportableSessions(sessions, "  ").length).toBe(2);
  });

  it("maps already-imported remote ids for the same runtime only", () => {
    const chats = [
      chat({ id: "c1", remoteThreadId: "r1", runtime: "codex" }),
      chat({ id: "c2", remoteThreadId: "r1", runtime: "claude" }),
      chat({ id: "c3", remoteThreadId: "r2", runtime: "codex" }),
      chat({ id: "c4", remoteThreadId: null, runtime: "codex" }),
    ];
    const map = alreadyImportedRemoteIds(chats, "codex");
    expect(map.get("r1")).toBe("c1");
    expect(map.get("r2")).toBe("c3");
    expect(map.has("missing")).toBe(false);
    expect(alreadyImportedRemoteIds(chats, "").size).toBe(0);
  });

  it("toggles multi-select with shift range selection", () => {
    const ordered = ["a", "b", "c", "d"];
    const first = toggleImportSelection({
      anchorId: null,
      orderedIds: ordered,
      remoteId: "b",
      selected: new Set(),
      shift: false,
    });
    expect([...first.selected]).toEqual(["b"]);
    expect(first.anchorId).toBe("b");

    const range = toggleImportSelection({
      anchorId: first.anchorId,
      orderedIds: ordered,
      remoteId: "d",
      selected: first.selected,
      shift: true,
    });
    expect([...range.selected].sort()).toEqual(["b", "c", "d"]);

    const cleared = toggleImportSelection({
      anchorId: range.anchorId,
      orderedIds: ordered,
      remoteId: "c",
      selected: range.selected,
      shift: false,
    });
    expect(cleared.selected.has("c")).toBe(false);
    expect(selectAllImportIds(ordered).size).toBe(4);
  });

  it("blocks import when runtime, project, or selection is missing", () => {
    expect(
      importSubmitBlockReason({
        hasProject: true,
        hasRuntime: true,
        importing: false,
        selectedCount: 2,
      }),
    ).toBeNull();
    expect(
      importSubmitBlockReason({
        hasProject: false,
        hasRuntime: true,
        importing: false,
        selectedCount: 1,
      }),
    ).toBe("project");
    expect(
      importSubmitBlockReason({
        hasProject: true,
        hasRuntime: false,
        importing: false,
        selectedCount: 1,
      }),
    ).toBe("runtime");
    expect(
      importSubmitBlockReason({
        hasProject: true,
        hasRuntime: true,
        importing: false,
        selectedCount: 0,
      }),
    ).toBe("selection");
    expect(
      importSubmitBlockReason({
        hasProject: true,
        hasRuntime: true,
        importing: true,
        selectedCount: 1,
      }),
    ).toBe("importing");
  });

  it("imports a batch with partial failure summary and retry ids", async () => {
    const sessionsById = new Map<string, ImportableSession>([
      [
        "ok",
        {
          cwd: "/repo",
          remoteId: "ok",
          title: "Ok session",
          updatedAt: null,
        },
      ],
      [
        "bad",
        {
          cwd: "/repo",
          remoteId: "bad",
          title: "Bad session",
          updatedAt: null,
        },
      ],
    ]);
    const importSession = vi.fn(async (input: { remoteThreadId: string }) => {
      if (input.remoteThreadId === "bad") {
        throw new Error("hydrate failed");
      }
      return {
        chat: {
          archived: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          cwd: "/repo",
          id: `chat-${input.remoteThreadId}`,
          pinned: false,
          projectId: "project-1",
          remoteThreadId: input.remoteThreadId,
          runtime: "codex",
          title: "Ok session",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        messages: [],
      };
    });
    const api = {
      chats: { listImportableSessions: vi.fn(), importSession },
    };
    const progress: number[] = [];

    const result = await importSessionsBatch(api, {
      cwd: "/repo",
      onProgress: (items) => {
        progress.push(items.filter((item) => item.status !== "pending").length);
      },
      projectId: "project-1",
      remoteIds: ["ok", "bad"],
      runtime: "codex",
      sessionsById,
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(successfulImportChatIds(result.items)).toEqual(["chat-ok"]);
    expect(failedImportRemoteIds(result.items)).toEqual(["bad"]);
    expect(result.items.find((item) => item.remoteId === "bad")?.error).toBe(
      "hydrate failed",
    );
    expect(importSession).toHaveBeenCalledTimes(2);
    expect(progress.length).toBeGreaterThan(0);
  });

  it("rejects batch import without a target project", async () => {
    const api = {
      chats: { listImportableSessions: vi.fn(), importSession: vi.fn() },
    };
    await expect(
      importSessionsBatch(api, {
        projectId: "",
        remoteIds: ["a"],
        runtime: "codex",
        sessionsById: new Map(),
      }),
    ).rejects.toThrow(/project/i);
  });
});
