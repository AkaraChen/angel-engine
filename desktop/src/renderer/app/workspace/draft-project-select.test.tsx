// @vitest-environment jsdom

import type { Project } from "@angel-engine/daemon-api/projects";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftProjectSelect } from "@/app/workspace/draft-project-select";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const projects = [
  {
    createdAt: "2026-08-12T00:00:00.000Z",
    id: "project-1",
    path: "/Users/akrc/angel-engine",
  } as Project,
];

afterEach(cleanup);

describe("DraftProjectSelect", () => {
  it("hides the no-project option when the caller requires a project", () => {
    render(
      <DraftProjectSelect
        allowNoProject={false}
        onCreateProject={vi.fn()}
        onProjectChange={vi.fn()}
        projects={projects}
        selectedProjectId="project-1"
      />,
    );

    expect(
      screen.queryByRole("option", { name: "workspace.noProject" }),
    ).toBeNull();
    expect(
      screen.getByRole("option", { name: "sidebar.addProject" }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: "angel-engine" })).toBeTruthy();
  });

  it("shows the no-project option only when explicitly allowed", () => {
    render(
      <DraftProjectSelect
        allowNoProject
        onCreateProject={vi.fn()}
        onProjectChange={vi.fn()}
        projects={projects}
      />,
    );

    expect(
      screen.getByRole("option", { name: "workspace.noProject" }),
    ).toBeTruthy();
  });
});
