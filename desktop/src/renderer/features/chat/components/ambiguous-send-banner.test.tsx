// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AmbiguousSendBanner } from "./ambiguous-send-banner";

const ambiguousRun = vi.fn();
const clearAmbiguousRun = vi.fn();

vi.mock("@/platform/api-client", () => ({
  getApiClient: () => ({ chats: { ambiguousRun, clearAmbiguousRun } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AmbiguousSendBanner", () => {
  it("shows a restart-ambiguous send and clears it by chat id", async () => {
    ambiguousRun.mockResolvedValue({
      run: {
        chatId: "chat-1",
        createdAt: "2026-08-10T00:00:00.000Z",
        runId: "run-ambiguous",
        status: "dispatching",
      },
    });
    clearAmbiguousRun.mockResolvedValue({ cleared: true });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AmbiguousSendBanner chatId="chat-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("ambiguous-send-banner")).toBeDefined();
    fireEvent.click(screen.getByTestId("ambiguous-send-dismiss"));

    await waitFor(() =>
      expect(clearAmbiguousRun).toHaveBeenCalledWith("chat-1"),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("ambiguous-send-banner")).toBeNull(),
    );
  });
});
