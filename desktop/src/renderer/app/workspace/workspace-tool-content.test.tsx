// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/workspace/workspace-tool-surface-model", () => ({
  useWorkspaceToolSurface: () => ({ activeDynamicTab: null }),
}));
import { WorkspaceToolContent } from "./workspace-tool-content";

describe("WorkspaceToolContent", () => {
  it("renders an unavailable shell when no dynamic tab is selected", () => {
    render(<WorkspaceToolContent root="/work/repo" />);
    expect(screen.getByText("workspace.tools.unavailable")).toBeTruthy();
  });
});
