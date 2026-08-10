import type { AgentOption } from "@angel-engine/daemon-api/agents";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";

const listAvailable = vi.fn<() => Promise<AgentOption[]>>();

vi.mock("@/platform/daemon-provider", () => ({
  useDaemonClient: () => ({
    agents: {
      listAvailable: () => listAvailable(),
    },
  }),
}));

import { AgentsSection } from "./agents-section";

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AgentsSection />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  listAvailable.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AgentsSection", () => {
  it("renders closed readiness for ready and unavailable catalog rows", async () => {
    listAvailable.mockResolvedValue([
      {
        description: "codex binary",
        id: "codex",
        label: "Codex",
        readiness: { detail: "codex", status: "ready" },
      },
      {
        description: "kimi binary",
        id: "kimi",
        label: "Kimi",
        readiness: {
          detail: "Command not found: kimi",
          status: "unavailable",
        },
      },
    ]);

    renderSection();

    expect(await screen.findByText("Codex")).toBeDefined();
    expect(screen.getByText("Kimi")).toBeDefined();
    // Detail is exposed via title for AT/hover; closed status drives recovery.
    expect(screen.getByTitle("codex")).toBeDefined();
    expect(screen.getByTitle("Command not found: kimi")).toBeDefined();
    // Recovery action present for non-ready only (unavailable).
    expect(screen.getAllByRole("button", { name: /Test again/i })).toHaveLength(
      1,
    );
  });

  it("offers Test again that re-probes listAvailable", async () => {
    listAvailable
      .mockResolvedValueOnce([
        {
          description: "pi binary",
          id: "pi",
          label: "Pi",
          readiness: {
            detail: "Command not found: pi",
            status: "unavailable",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          description: "pi binary",
          id: "pi",
          label: "Pi",
          readiness: { detail: "/usr/local/bin/pi", status: "ready" },
        },
      ]);

    renderSection();
    expect(await screen.findByTitle("Command not found: pi")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Test again/i }));

    await waitFor(() => {
      expect(listAvailable).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Test again/i })).toBeNull();
    });
    expect(screen.getByTitle("/usr/local/bin/pi")).toBeDefined();
  });
});
