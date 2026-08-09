import type {
  ImportableSession,
  ListImportableSessionsResult,
} from "@angel-engine/daemon-api/chat";
import { describe, expect, it, vi } from "vitest";
import {
  importSessionAndOpen,
  importableSessionPrimaryLabel,
  importableSessionSecondaryLabel,
  searchImportableSessions,
} from "./import-session-handlers";

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
        projectId: null,
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
        remoteThreadId: "remote-1",
        runtime: "codex",
        title: "Imported thread",
      }),
    ).resolves.toEqual(importResult);
    expect(importSession).toHaveBeenCalledWith({
      cwd: "/repo",
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

  it("rejects search/import without runtime or remote id", async () => {
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
        remoteThreadId: "x",
        runtime: "",
      }),
    ).rejects.toThrow(/runtime/i);
    await expect(
      importSessionAndOpen(api, {
        remoteThreadId: "",
        runtime: "codex",
      }),
    ).rejects.toThrow(/remote/i);
  });
});
