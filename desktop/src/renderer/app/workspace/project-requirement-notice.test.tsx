// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectRequirementNotice } from "@/app/workspace/project-requirement-notice";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("ProjectRequirementNotice", () => {
  it("blocks with a loading state while projects are pending", () => {
    render(
      <ProjectRequirementNotice
        onCreateProject={vi.fn()}
        projectCount={0}
        projectsStatus="pending"
      />,
    );

    expect(screen.getByText("sidebar.loadingProjects")).toBeTruthy();
    expect(screen.queryByText("sidebar.noProjects")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers project creation only after an empty query succeeds", () => {
    render(
      <ProjectRequirementNotice
        onCreateProject={vi.fn()}
        projectCount={0}
        projectsStatus="success"
      />,
    );

    expect(screen.getByText("sidebar.noProjects")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "sidebar.addProject" }),
    ).toBeTruthy();
    expect(screen.queryByText("sidebar.loadingProjects")).toBeNull();
  });

  it("reports a project query error without offering project creation", () => {
    render(
      <ProjectRequirementNotice
        onCreateProject={vi.fn()}
        projectCount={0}
        projectsStatus="error"
      />,
    );

    expect(screen.getByText("sidebar.projectsLoadError")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
