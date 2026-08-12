// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "workspace.tools.empty.noChanges" ? "没有更改" : key,
  }),
}));

import { WorkspaceToolPatchFileList } from "./workspace-tool-patch-list";

describe("WorkspaceToolPatchFileList", () => {
  it("uses the localized empty-state copy", () => {
    render(
      <WorkspaceToolPatchFileList patchList={{ errors: [], files: [] }} />,
    );

    expect(screen.getByText("没有更改")).toBeDefined();
    expect(screen.queryByText("No changes")).toBeNull();
  });
});
