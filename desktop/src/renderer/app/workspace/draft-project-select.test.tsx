// @vitest-environment jsdom

import type { Project } from "@angel-engine/daemon-api/projects";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  if (originalScrollIntoView) {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

afterEach(cleanup);

describe("DraftProjectSelect", () => {
  it("hides the no-project option when the caller requires a project", async () => {
    render(
      <DraftProjectSelect
        allowNoProject={false}
        onCreateProject={vi.fn()}
        onProjectChange={vi.fn()}
        projects={projects}
        selectedProjectId="project-1"
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "workspace.projectSelect" }),
      { key: "ArrowDown" },
    );

    expect(
      screen.queryByRole("option", { name: "workspace.noProject" }),
    ).toBeNull();
    expect(
      await screen.findByRole("option", { name: "sidebar.addProject" }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: "angel-engine" })).toBeTruthy();
  });

  it("shows the no-project option only when explicitly allowed", async () => {
    render(
      <DraftProjectSelect
        allowNoProject
        onCreateProject={vi.fn()}
        onProjectChange={vi.fn()}
        projects={projects}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "workspace.projectSelect" }),
      { key: "ArrowDown" },
    );

    expect(
      await screen.findByRole("option", { name: "workspace.noProject" }),
    ).toBeTruthy();
  });
});
