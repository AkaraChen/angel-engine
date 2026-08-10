// @vitest-environment jsdom

import type { Chat } from "@angel-engine/daemon-api/chat";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatContextMenu } from "./chat-context-menu";

afterEach(cleanup);

const chat = {
  id: "chat-1",
  pinned: false,
  title: "Ship the thing",
} as Chat;

function openMenu(trigger: HTMLElement) {
  // Radix opens on pointerdown for touch and on contextmenu for mouse.
  fireEvent.contextMenu(trigger);
}

describe("ChatContextMenu", () => {
  it("reports the picked action for the chat it wraps", async () => {
    const onAction = vi.fn();
    render(
      <ChatContextMenu chat={chat} onAction={onAction}>
        <button type="button">Ship the thing</button>
      </ChatContextMenu>,
    );

    openMenu(screen.getByRole("button", { name: "Ship the thing" }));
    fireEvent.click(await screen.findByText("common.rename"));

    expect(onAction).toHaveBeenCalledWith(chat, "rename");
  });

  it("offers unpin for a pinned chat", async () => {
    const onAction = vi.fn();
    render(
      <ChatContextMenu chat={{ ...chat, pinned: true }} onAction={onAction}>
        <button type="button">Ship the thing</button>
      </ChatContextMenu>,
    );

    openMenu(screen.getByRole("button", { name: "Ship the thing" }));

    await screen.findByText("common.unpin");
    expect(screen.queryByText("common.pin")).toBeNull();
  });
});
