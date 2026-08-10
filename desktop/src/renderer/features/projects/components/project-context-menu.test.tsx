// @vitest-environment jsdom

import type { Project } from "@angel-engine/daemon-api/projects";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availability: vi.fn(async () => ({
    editors: [{ id: "vscode" as const, name: "VS Code" }],
    systemTerminal: true,
  })),
}));

vi.mock("@/platform/use-api", () => ({
  useApi: () => ({ pathLauncher: { availability: mocks.availability } }),
}));

import { SidebarProvider } from "@/components/ui/sidebar";
import { WorkspaceSidebarMenuButton } from "@/components/workspace-sidebar-primitives";
import { ProjectContextMenu } from "./project-context-menu";

const project = { id: "project-1", path: "/repo" } as Project;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: () => {},
      matches: false,
      media: query,
      removeEventListener: () => {},
    }),
    writable: true,
  });
  Object.defineProperty(window, "desktopEnvironment", {
    configurable: true,
    value: { platform: "darwin" },
    writable: true,
  });
});

afterEach(cleanup);

function renderMenu(onAction = vi.fn(), onPathLauncherAction = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SidebarProvider>
        <ProjectContextMenu
          onAction={onAction}
          onPathLauncherAction={onPathLauncherAction}
          project={project}
        >
          <WorkspaceSidebarMenuButton>/repo</WorkspaceSidebarMenuButton>
        </ProjectContextMenu>
      </SidebarProvider>
    </QueryClientProvider>,
  );
  return { onAction, onPathLauncherAction };
}

describe("ProjectContextMenu", () => {
  it("opens from the sidebar button and reports project actions", async () => {
    const { onAction } = renderMenu();

    fireEvent.contextMenu(screen.getByRole("button", { name: "/repo" }));
    fireEvent.click(await screen.findByText("common.delete"));

    expect(onAction).toHaveBeenCalledWith(project, "delete");
  });

  it("lists the host's path-launcher targets", async () => {
    const { onPathLauncherAction } = renderMenu();

    fireEvent.contextMenu(screen.getByRole("button", { name: "/repo" }));
    fireEvent.click(await screen.findByText("pathLauncher.openInEditor"));

    expect(onPathLauncherAction).toHaveBeenCalledWith(project, "editor:vscode");
  });
});
