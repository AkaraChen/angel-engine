import type {
  ImportChatInput,
  ImportChatResult,
  ListImportableSessionsInput,
  ListImportableSessionsResult,
} from "@angel-engine/daemon-api/chat";
import { describe, expect, it } from "vitest";
import {
  type ImportSessionApi,
  type ImportableSessionRow,
  filterImportableSessionRows,
  loadImportableSessions,
  selectionRange,
} from "./import-session-handlers";

function apiReturning(
  byRuntime: Record<string, ListImportableSessionsResult | Error>,
): ImportSessionApi {
  return {
    chats: {
      importSession: (_input: ImportChatInput): Promise<ImportChatResult> => {
        throw new Error("not used");
      },
      listImportableSessions: async (input: ListImportableSessionsInput) => {
        const entry = byRuntime[input.runtime];
        if (entry === undefined)
          throw new Error(`no stub for ${input.runtime}`);
        if (entry instanceof Error) throw entry;
        return entry;
      },
    },
  };
}

function row(
  runtime: string,
  remoteId: string,
  title: string,
): ImportableSessionRow {
  return {
    key: `${runtime}:${remoteId}`,
    runtime,
    runtimeLabel: runtime,
    session: { remoteId, title },
  };
}

describe("loadImportableSessions", () => {
  it("merges every agent so the user never picks a source first", async () => {
    const api = apiReturning({
      claude: { sessions: [{ remoteId: "b", title: "Two" }], nextCursor: null },
      codex: { sessions: [{ remoteId: "a", title: "One" }], nextCursor: null },
    });

    const result = await loadImportableSessions(api, {
      runtimes: [
        { label: "Codex", value: "codex" },
        { label: "Claude", value: "claude" },
      ],
    });

    expect(result.rows.map((entry) => entry.key)).toEqual([
      "codex:a",
      "claude:b",
    ]);
    expect(result.failures.size).toBe(0);
  });

  it("keeps working agents when one fails or is unsupported", async () => {
    const api = apiReturning({
      claude: new Error("claude is not installed"),
      codex: { sessions: [{ remoteId: "a", title: "One" }], nextCursor: null },
      cursor: {
        sessions: [],
        nextCursor: null,
        unsupportedReason: "no history",
      },
    });

    const result = await loadImportableSessions(api, {
      runtimes: [
        { label: "Codex", value: "codex" },
        { label: "Claude", value: "claude" },
        { label: "Cursor", value: "cursor" },
      ],
    });

    expect(result.rows.map((entry) => entry.key)).toEqual(["codex:a"]);
    expect(result.failures.get("claude")).toBe("claude is not installed");
    expect(result.failures.get("cursor")).toBe("no history");
  });

  it("keys rows per agent so a shared remote id stays distinct", async () => {
    const api = apiReturning({
      claude: {
        sessions: [{ remoteId: "same", title: "B" }],
        nextCursor: null,
      },
      codex: { sessions: [{ remoteId: "same", title: "A" }], nextCursor: null },
    });

    const result = await loadImportableSessions(api, {
      runtimes: [
        { label: "Codex", value: "codex" },
        { label: "Claude", value: "claude" },
      ],
    });

    expect(new Set(result.rows.map((entry) => entry.key)).size).toBe(2);
  });
});

describe("filterImportableSessionRows", () => {
  const rows = [
    row("codex", "a", "Fix login redirect"),
    row("claude", "b", "Add import batch tests"),
  ];

  it("returns everything when the query is blank and no agent is picked", () => {
    expect(
      filterImportableSessionRows(rows, { query: "  ", runtime: null }),
    ).toHaveLength(2);
  });

  it("matches titles case-insensitively", () => {
    const result = filterImportableSessionRows(rows, {
      query: "LOGIN",
      runtime: null,
    });
    expect(result.map((entry) => entry.key)).toEqual(["codex:a"]);
  });

  it("combines the agent filter with the query", () => {
    expect(
      filterImportableSessionRows(rows, { query: "login", runtime: "claude" }),
    ).toHaveLength(0);
  });
});

describe("selectionRange", () => {
  const keys = ["a", "b", "c", "d"];

  it("covers both ends regardless of direction", () => {
    expect(selectionRange(keys, "c", "a")).toEqual(["a", "b", "c"]);
    expect(selectionRange(keys, "a", "c")).toEqual(["a", "b", "c"]);
  });

  it("falls back to the clicked row when there is no anchor", () => {
    expect(selectionRange(keys, null, "c")).toEqual(["c"]);
  });

  it("ignores a target that is no longer visible", () => {
    expect(selectionRange(keys, "a", "zz")).toEqual([]);
  });
});
