import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateChatDrawer } from "@/features/chat/create-chat-drawer";
import i18n from "@/i18n";

const mocks = vi.hoisted(() => ({
  createChat: {
    isError: false,
    isPending: false,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
  },
  navigate: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", mocks.navigate],
}));

vi.mock("@/features/chat/use-chats", () => ({
  useAgentList: () => ({ data: undefined }),
  useCreateChat: () => mocks.createChat,
  useProjectList: () => ({ data: [] }),
  useRuntimeConfig: () => ({ data: undefined, isFetching: false }),
}));

function renderDrawer() {
  return render(
    <CreateChatDrawer>
      <button type="button">New chat</button>
    </CreateChatDrawer>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.createChat.isError = false;
  mocks.createChat.isPending = false;
  mocks.createChat.mutateAsync.mockResolvedValue({ id: "chat-new" });
  await i18n.changeLanguage("en");
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("CreateChatDrawer prompt validation", () => {
  it("names the missing prompt on blur and keeps submission disabled", async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));

    const prompt = await screen.findByLabelText("Initial prompt");
    expect(
      (screen.getByRole("button", { name: "Create chat" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.blur(prompt);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Write a prompt first.",
    );
    expect(prompt.getAttribute("aria-invalid")).toBe("true");
    expect(prompt.getAttribute("aria-describedby")).toBe(
      "new-chat-prompt-error",
    );
    expect(mocks.createChat.mutateAsync).not.toHaveBeenCalled();

    // Correction clears the error and enables Create.
    fireEvent.change(prompt, { target: { value: "fix the bug" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Create chat" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("creates the chat and navigates on a valid submit", async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));

    fireEvent.change(await screen.findByLabelText("Initial prompt"), {
      target: { value: "fix the bug" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create chat" }));

    await waitFor(() => {
      expect(mocks.createChat.mutateAsync).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/chat/chat-new");
    });
  });
});
