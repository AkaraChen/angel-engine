// @vitest-environment jsdom

import type { ImportableSession } from "@angel-engine/daemon-api/chat";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportSessionDialog } from "./import-session-dialog";

const tMock = (key: string, options?: Record<string, unknown>) => {
  if (options && typeof options === "object") {
    return `${key}:${JSON.stringify(options)}`;
  }
  return key;
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: tMock }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sessions: ImportableSession[] = [
  {
    cwd: "/repo",
    remoteId: "remote-1",
    title: "Fix login",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    cwd: "/repo",
    remoteId: "remote-2",
    title: "Add tests",
    updatedAt: "2026-02-01T00:00:00.000Z",
  },
];

function renderDialog(
  overrides: Partial<Parameters<typeof ImportSessionDialog>[0]> = {},
) {
  const listImportableSessions = vi.fn(async () => ({
    nextCursor: null,
    sessions,
    unsupportedReason: null,
  }));
  const importSession = vi.fn(async (input: { remoteThreadId: string }) => ({
    chat: {
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      cwd: "/repo",
      id: `chat-${input.remoteThreadId}`,
      pinned: false,
      projectId: "project-1",
      remoteThreadId: input.remoteThreadId,
      runtime: "codex",
      title: input.remoteThreadId,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    messages: [],
  }));
  const onClose = vi.fn();
  const onImported = vi.fn();
  const api = { chats: { listImportableSessions, importSession } };

  render(
    <ImportSessionDialog
      api={api}
      cwd="/repo"
      existingChats={[]}
      initialProjectId="project-1"
      initialRuntime="codex"
      onClose={onClose}
      onImported={onImported}
      open
      projects={[{ id: "project-1", path: "/repo" }]}
      runtimeOptions={[
        { label: "Codex", value: "codex" },
        { label: "Claude", value: "claude" },
      ]}
      {...overrides}
    />,
  );

  return { api, importSession, listImportableSessions, onClose, onImported };
}

describe("ImportSessionDialog", () => {
  it("requires a project before enabling import and supports multi-select batch", async () => {
    const { importSession, listImportableSessions, onImported } = renderDialog({
      initialProjectId: null,
    });

    await waitFor(() => {
      expect(listImportableSessions).toHaveBeenCalled();
    });
    await screen.findByText("Fix login");

    // Without project, import stays disabled.
    const importButton = () =>
      screen.getByRole("button", {
        name: /dialog\.importSession\.importAction/,
      });
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);

    // Choose project — discovery reloads for the new project scope.
    fireEvent.change(
      screen.getByLabelText("dialog.importSession.targetProject"),
      {
        target: { value: "project-1" },
      },
    );
    await screen.findByText("Fix login");
    await screen.findByText("Add tests");

    // Still disabled until selection.
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText("Fix login"));
    fireEvent.click(screen.getByText("Add tests"));

    await waitFor(() => {
      expect((importButton() as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(importButton());

    await waitFor(() => {
      expect(importSession).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith([
        "chat-remote-1",
        "chat-remote-2",
      ]);
    });
    expect(screen.getByText(/dialog\.importSession\.summary/)).toBeDefined();
  });

  it("shows empty state when source agent has no sessions", async () => {
    const listImportableSessions = vi.fn(async () => ({
      nextCursor: null,
      sessions: [],
      unsupportedReason: null,
    }));
    renderDialog({
      api: {
        chats: {
          listImportableSessions,
          importSession: vi.fn(),
        },
      },
    });

    await waitFor(() => {
      expect(listImportableSessions).toHaveBeenCalled();
    });
    expect(await screen.findByText("dialog.importSession.empty")).toBeDefined();
  });

  it("marks already-imported sessions and still allows copy import", async () => {
    const { importSession } = renderDialog({
      existingChats: [
        {
          archived: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          cwd: "/repo",
          id: "existing",
          pinned: false,
          projectId: "project-1",
          remoteThreadId: "remote-1",
          runtime: "codex",
          title: "Fix login",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    await screen.findByText("Fix login");
    expect(
      screen.getByText("dialog.importSession.alreadyImported"),
    ).toBeDefined();

    fireEvent.click(screen.getByText("Fix login"));
    expect(
      screen.getByText("dialog.importSession.willCreateCopy"),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: /dialog\.importSession\.importAction/,
      }),
    );

    await waitFor(() => {
      expect(importSession).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          remoteThreadId: "remote-1",
          runtime: "codex",
        }),
      );
    });
  });
});
