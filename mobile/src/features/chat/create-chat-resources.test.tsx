import type { AgentOption, CustomAgent } from "@angel-engine/daemon-api/agents";
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
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import { AuthProvider } from "@/features/auth/auth-provider";
import { DaemonProvider } from "@/platform/daemon-provider";

import { CreateChatDrawer } from "./create-chat-drawer";

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

function renderDrawer() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const { hook } = memoryLocation({ path: "/" });
  return render(
    <AuthProvider>
      <DaemonProvider>
        <QueryClientProvider client={queryClient}>
          <Router hook={hook}>
            <CreateChatDrawer>
              <button type="button">Open composer</button>
            </CreateChatDrawer>
          </Router>
        </QueryClientProvider>
      </DaemonProvider>
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreateChatDrawer resource creation", () => {
  it("selects a newly created project and custom agent for the new chat", async () => {
    let projects: Project[] = [];
    let agents: AgentOption[] = [
      { description: "Codex", id: "codex", label: "Codex" },
    ];
    let createChatBody: Record<string, unknown> | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/api/projects") && method === "GET") {
          return jsonResponse(projects);
        }
        if (url.endsWith("/api/projects") && method === "POST") {
          const body = requestBody(init) as { path: string };
          const project = { id: "project-1", path: body.path };
          projects = [project];
          return jsonResponse(project);
        }
        if (url.endsWith("/api/agents") && method === "GET") {
          return jsonResponse(agents);
        }
        if (url.endsWith("/api/agents/custom") && method === "POST") {
          const body = requestBody(init) as {
            args: string[];
            autoAuthenticate: boolean;
            command: string;
            environment: CustomAgent["environment"];
            label: string;
            needAuth: boolean;
          };
          const agent: CustomAgent = {
            ...body,
            createdAt: "2026-07-25T00:00:00.000Z",
            id: "custom:mobile-agent",
            updatedAt: "2026-07-25T00:00:00.000Z",
          };
          agents = [
            ...agents,
            {
              description: agent.command,
              id: agent.id,
              label: agent.label,
            },
          ];
          return jsonResponse(agent);
        }
        if (url.endsWith("/api/chats/runtime-config")) {
          return jsonResponse({
            canSetModel: false,
            canSetReasoningEffort: false,
            models: [],
            reasoningEfforts: [],
          });
        }
        if (url.endsWith("/api/chats") && method === "POST") {
          createChatBody = requestBody(init) as Record<string, unknown>;
          return jsonResponse({
            archived: false,
            createdAt: "2026-07-25T00:00:00.000Z",
            cwd: "/Users/dev/project",
            id: "chat-1",
            pinned: false,
            projectId: "project-1",
            remoteThreadId: null,
            runtime: "custom:mobile-agent",
            title: "New chat",
            updatedAt: "2026-07-25T00:00:00.000Z",
          });
        }
        return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
      }),
    );

    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Open composer" }));

    fireEvent.click(await screen.findByRole("button", { name: "Add project" }));
    fireEvent.change(await screen.findByLabelText("Project path"), {
      target: { value: "/Users/dev/project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Project") as HTMLSelectElement).value,
      ).toBe("project-1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Mobile agent" },
    });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "mobile-agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect((screen.getByLabelText("Agent") as HTMLSelectElement).value).toBe(
        "custom:mobile-agent",
      ),
    );

    fireEvent.change(screen.getByLabelText("Initial prompt"), {
      target: { value: "Fix the issue" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create chat" }));

    await waitFor(() =>
      expect(createChatBody).toMatchObject({
        creationLocation: "project",
        projectId: "project-1",
        runtime: "custom:mobile-agent",
      }),
    );
  });
});
