// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/platform/ipc", () => ({ ipc: {} }));

vi.mock("@/app/workspace/workspace-git-panels", () => ({
  WorkspaceGitPanel: () => <div>local-git-panel</div>,
}));
vi.mock("@/app/workspace/workspace-tool-surface-model", () => ({
  useWorkspaceToolSurface: () => ({ activeTabId: "git", host: "sidebar" }),
}));
vi.mock("@/features/source-control/api/use-activation", () => ({
  useSourceControlActivation: () => {
    throw new Error("local Git must not activate a hosted provider");
  },
}));

import { WorkspaceToolContent } from "./workspace-tool-content";

describe("WorkspaceToolContent", () => {
  it("keeps the local Git panel independent from provider activation", () => {
    render(<WorkspaceToolContent root="/work/repo" />);
    expect(screen.getByText("local-git-panel")).toBeTruthy();
  });
});
