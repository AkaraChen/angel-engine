import type { CustomAgent } from "@angel-engine/daemon-api/agents";
import type { Project } from "@angel-engine/daemon-api/projects";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/features/auth/auth-provider";
import { DaemonProvider } from "@/platform/daemon-provider";

import { CustomAgentsSettingsSection } from "./custom-agent-management";
import { ProjectsSettingsSection } from "./project-management";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function requestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("expected a JSON request body");
  }
  return JSON.parse(init.body);
}

function renderSections() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return render(
    <AuthProvider>
      <DaemonProvider>
        <QueryClientProvider client={queryClient}>
          <ProjectsSettingsSection />
          <CustomAgentsSettingsSection />
        </QueryClientProvider>
      </DaemonProvider>
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("resource settings", () => {
  it("edits resources and reads delete impact before deleting them", async () => {
    let projects: Project[] = [
      { id: "project-1", path: "/Users/dev/original" },
    ];
    let customAgents: CustomAgent[] = [
      {
        args: ["--stdio"],
        autoAuthenticate: false,
        command: "agent",
        createdAt: "2026-07-25T00:00:00.000Z",
        environment: [],
        id: "custom:agent",
        label: "Original agent",
        needAuth: false,
        updatedAt: "2026-07-25T00:00:00.000Z",
      },
    ];
    const requests: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        requests.push(`${method} ${url}`);

        if (url.endsWith("/api/projects") && method === "GET") {
          return jsonResponse(projects);
        }
        if (url.endsWith("/api/projects/project-1") && method === "PATCH") {
          const body = requestBody(init) as { path: string };
          projects = [{ id: "project-1", path: body.path }];
          return jsonResponse(projects[0]);
        }
        if (
          url.endsWith("/api/projects/project-1/delete-impact") &&
          method === "GET"
        ) {
          return jsonResponse({ chatCount: 2 });
        }
        if (url.endsWith("/api/projects/project-1") && method === "DELETE") {
          projects = [];
          return jsonResponse({ ok: true });
        }
        if (url.endsWith("/api/agents/custom") && method === "GET") {
          return jsonResponse(customAgents);
        }
        if (
          url.endsWith("/api/agents/custom/custom%3Aagent") &&
          method === "PUT"
        ) {
          const body = requestBody(init) as CustomAgent;
          customAgents = [
            {
              ...customAgents[0],
              ...body,
              id: "custom:agent",
              updatedAt: "2026-07-25T01:00:00.000Z",
            },
          ];
          return jsonResponse(customAgents[0]);
        }
        if (
          url.endsWith("/api/agents/custom/custom%3Aagent/delete-impact") &&
          method === "GET"
        ) {
          return jsonResponse({ chatCount: 3 });
        }
        if (
          url.endsWith("/api/agents/custom/custom%3Aagent") &&
          method === "DELETE"
        ) {
          customAgents = [];
          return jsonResponse({ deletedChatIds: ["chat-1", "chat-2"] });
        }
        return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
      }),
    );

    renderSections();

    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Edit original" },
        { timeout: 10_000 },
      ),
    );
    fireEvent.change(await screen.findByLabelText("Project path"), {
      target: { value: "/Users/dev/renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("renamed")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Edit renamed" }));
    expect(
      ((await screen.findByLabelText("Project path")) as HTMLInputElement)
        .value,
    ).toBe("/Users/dev/renamed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Original agent" }),
    );
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Renamed agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Renamed agent")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Edit Renamed agent" }));
    expect(
      ((await screen.findByLabelText("Name")) as HTMLInputElement).value,
    ).toBe("Renamed agent");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete renamed" }));
    expect(await screen.findByText(/2 linked chats/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.queryByText("/Users/dev/renamed")).toBeNull(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Renamed agent" }),
    );
    expect(await screen.findByText(/3 chats that use it/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Renamed agent")).toBeNull());

    expect(
      requests.indexOf("GET /api/projects/project-1/delete-impact"),
    ).toBeLessThan(requests.indexOf("DELETE /api/projects/project-1"));
    expect(
      requests.indexOf("GET /api/agents/custom/custom%3Aagent/delete-impact"),
    ).toBeLessThan(
      requests.indexOf("DELETE /api/agents/custom/custom%3Aagent"),
    );
  });
});
