// @vitest-environment jsdom

import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ComponentProps } from "react";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChatTabBar,
  POWER_CHAT_TAB_DRAFT_ID,
  POWER_CHAT_TAB_HOME_ID,
  POWER_CHAT_TAB_PANEL_ID,
  powerChatTabId,
} from "./chat-tab-bar";

const useChatAttention = vi.fn();
const useChatRunIsRunning = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/chat/state/chat-run-store", () => ({
  useChatAttention: (chatId: string) => useChatAttention(chatId),
  useChatRunIsRunning: (chatId?: string) => useChatRunIsRunning(chatId),
}));

vi.mock("@/features/agents/agent-runtime-icons", () => ({
  agentRuntimeIconSvg: () => undefined,
  agentRuntimeLabel: (runtime?: string | null) => runtime ?? "agent",
}));

vi.mock("@/app/workspace/workspace-display", () => ({
  displayChatTitle: (title: string) => title,
}));

function makeChat(id: string, title: string): Chat {
  return {
    archived: false,
    createdAt: "2026-08-10T00:00:00.000Z",
    cwd: null,
    id,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title,
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
}

function renderTabBar(
  props: Partial<ComponentProps<typeof ChatTabBar>> = {},
): ReturnType<typeof render> {
  return render(
    <ChatTabBar
      activeChatId="chat-1"
      chats={[makeChat("chat-1", "Plan"), makeChat("chat-2", "Tests")]}
      historyTabActive={false}
      historyTabLabel="sidebar.powerWorktreeHome"
      onCloseChat={vi.fn()}
      onCloseDraftTab={vi.fn()}
      onNewChat={vi.fn()}
      onOpenChat={vi.fn()}
      onOpenHistory={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  useChatAttention.mockImplementation(() => ({
    completed: false,
    needsInput: false,
  }));
  useChatRunIsRunning.mockReturnValue(false);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatTabBar", () => {
  it("exposes a single tablist with real tabs and one selected tab", () => {
    renderTabBar();

    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeDefined();

    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(3);

    const selected = tabs.filter(
      (tab) => tab.getAttribute("aria-selected") === "true",
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe(powerChatTabId("chat-1"));
    expect(selected[0]?.getAttribute("tabindex")).toBe("0");

    for (const tab of tabs) {
      if (tab !== selected[0]) {
        expect(tab.getAttribute("tabindex")).toBe("-1");
      }
      expect(tab.getAttribute("aria-controls")).toBe(POWER_CHAT_TAB_PANEL_ID);
      expect(tab.tagName).toBe("BUTTON");
    }
  });

  it("keeps the close control as a named sibling, not nested inside role=tab", () => {
    renderTabBar();

    const planTab = screen.getByRole("tab", { name: /Plan/i });
    expect(within(planTab).queryByRole("button")).toBeNull();

    const closePlan = screen.getByRole("button", {
      name: "common.close Plan",
    });
    expect(closePlan.closest('[role="tab"]')).toBeNull();
    expect(closePlan.closest('[role="presentation"]')).not.toBeNull();
  });

  it("moves selection with Arrow, Home, and End keys", () => {
    const onOpenChat = vi.fn();
    const onOpenHistory = vi.fn();
    renderTabBar({ onOpenChat, onOpenHistory });

    const planTab = screen.getByRole("tab", { name: /Plan/i });
    planTab.focus();

    fireEvent.keyDown(planTab, { key: "ArrowRight" });
    expect(onOpenChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-2" }),
    );

    const testsTab = screen.getByRole("tab", { name: /Tests/i });
    fireEvent.keyDown(testsTab, { key: "Home" });
    expect(onOpenHistory).toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("tab", { name: /Plan/i }), {
      key: "End",
    });
    expect(onOpenChat).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "chat-2" }),
    );

    fireEvent.keyDown(testsTab, { key: "ArrowLeft" });
    expect(onOpenChat).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "chat-1" }),
    );
  });

  it("shows icon-plus-text status cues instead of color-only dots", () => {
    useChatAttention.mockImplementation((chatId: string) => ({
      completed: chatId === "chat-2",
      needsInput: chatId === "chat-1",
    }));
    useChatRunIsRunning.mockImplementation(
      (chatId?: string) => chatId === "chat-1",
    );

    renderTabBar();

    const planTab = screen.getByRole("tab", { name: /Plan/i });
    expect(within(planTab).getByText("sidebar.needsInput")).toBeDefined();
    expect(within(planTab).getByText("common.running")).toBeDefined();
    expect(within(planTab).queryByRole("img")).toBeNull();

    const testsTab = screen.getByRole("tab", { name: /Tests/i });
    expect(within(testsTab).getByText("sidebar.completed")).toBeDefined();
  });

  it("includes home and draft tabs in the roving order with stable ids", () => {
    renderTabBar({
      activeChatId: undefined,
      draftTabActive: true,
      historyTabActive: false,
    });

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.id)).toEqual([
      powerChatTabId(POWER_CHAT_TAB_HOME_ID),
      powerChatTabId("chat-1"),
      powerChatTabId("chat-2"),
      powerChatTabId(POWER_CHAT_TAB_DRAFT_ID),
    ]);

    const draftTab = screen.getByRole("tab", { name: "workspace.newChat" });
    expect(draftTab.getAttribute("aria-selected")).toBe("true");
    expect(draftTab.getAttribute("tabindex")).toBe("0");
  });

  it("invokes close without selecting the tab via nested tab semantics", () => {
    const onCloseChat = vi.fn();
    const onOpenChat = vi.fn();
    renderTabBar({ onCloseChat, onOpenChat });

    fireEvent.click(screen.getByRole("button", { name: "common.close Plan" }));
    expect(onCloseChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1" }),
    );
    expect(onOpenChat).not.toHaveBeenCalled();
  });
});
