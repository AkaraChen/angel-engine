import type { Automation } from "@angel-engine/daemon-api/automations";
import type { Chat } from "@angel-engine/daemon-api/chat";
import type { AutomationRow } from "../../db/schema";

import { describe, expect, it, vi } from "vitest";
import { AutomationRuntime } from "./runtime";

const now = new Date(2026, 7, 10, 9, 0, 20);
const record: AutomationRow = {
  createdAt: now.toISOString(),
  cron: "* * * * *",
  enabled: true,
  id: "automation-1",
  name: "Dependency audit",
  nextRunAt: new Date(2026, 7, 10, 9, 0).toISOString(),
  notifyOnFailure: true,
  projectId: null,
  prompt: "Audit dependencies",
  runtime: "codex",
  updatedAt: now.toISOString(),
  workspaceKind: "project",
};
const automation: Automation = {
  ...record,
  runs: [],
  status: "active",
};
const chat: Chat = {
  archived: false,
  createdAt: now.toISOString(),
  cwd: "/tmp",
  id: "chat-1",
  pinned: false,
  projectId: null,
  remoteThreadId: null,
  runtime: "codex",
  title: record.name,
  updatedAt: now.toISOString(),
};

describe("automation runtime", () => {
  it("dispatches an on-time schedule through a real chat-run boundary", async () => {
    const options = runtimeOptions();
    const runtime = new AutomationRuntime(options);

    await runtime.tick();

    expect(options.createChat).toHaveBeenCalledWith(record);
    expect(options.startChatRun).toHaveBeenCalledWith("automation-run-1", {
      chatId: chat.id,
      text: record.prompt,
    });
    expect(options.setNextRun).toHaveBeenCalledWith(
      record.id,
      new Date(2026, 7, 10, 9, 1).toISOString(),
    );
  });

  it("records a sleeping-machine occurrence as missed without dispatching", async () => {
    const options = runtimeOptions({
      ...record,
      nextRunAt: new Date(2026, 7, 10, 8, 55).toISOString(),
    });
    const runtime = new AutomationRuntime(options);

    await runtime.tick();

    expect(options.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: record.id,
        status: "missed",
        trigger: "scheduled",
      }),
    );
    expect(options.startChatRun).not.toHaveBeenCalled();
  });

  it("persists terminal chat events and publishes an invalidation", async () => {
    const options = runtimeOptions();
    options.finishRun.mockResolvedValue(record.id);
    const runtime = new AutomationRuntime(options);

    await runtime.handleChatRunEvent("automation-run-1", {
      message: "provider failed",
      type: "error",
    });

    expect(options.finishRun).toHaveBeenCalledWith(
      "automation-run-1",
      "failed",
      "provider failed",
    );
    expect(options.onChanged).toHaveBeenCalledWith([record.id]);
  });

  it("reserves an automation before checking persisted active runs", async () => {
    let releaseActiveCheck: (() => void) | undefined;
    const activeCheck = new Promise<void>((resolve) => {
      releaseActiveCheck = resolve;
    });
    const options = runtimeOptions();
    options.hasActiveRun.mockImplementation(async () => {
      await activeCheck;
      return false;
    });
    const runtime = new AutomationRuntime(options);

    const first = runtime.runNow(record.id);
    await vi.waitFor(() => expect(options.hasActiveRun).toHaveBeenCalledOnce());
    await expect(runtime.runNow(record.id)).rejects.toMatchObject({
      code: "automation-run-conflict",
    });
    releaseActiveCheck?.();
    await first;

    expect(options.createRun).toHaveBeenCalledOnce();
  });
});

function runtimeOptions(override: Partial<AutomationRow> = {}) {
  const due = { ...record, ...override };
  return {
    attachRunChat: vi.fn(async () => undefined),
    createChat: vi.fn(async () => chat),
    createRun: vi.fn(async () => ({ id: "automation-run-1" })),
    finishRun: vi.fn(async () => null as string | null),
    getAutomation: vi.fn(async () => automation),
    getRecord: vi.fn(async () => due),
    hasActiveRun: vi.fn(async () => false),
    listDue: vi.fn(async () => [due]),
    now: () => now,
    onChanged: vi.fn(),
    setNextRun: vi.fn(async () => undefined),
    startChatRun: vi.fn(async () => undefined),
    stopChatRun: vi.fn(async () => undefined),
  };
}
