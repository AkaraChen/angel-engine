import type { Project } from "@angel-engine/daemon-api/projects";

import { describe, expect, it } from "vitest";
import { resolveProjectDraftRedirect } from "@/app/workspace/workspace-project-route-normalization";

const projects = [{ id: "project-1" } as Project];

describe("resolveProjectDraftRedirect", () => {
  it("normalizes a projectless draft after the project query succeeds", () => {
    expect(
      resolveProjectDraftRedirect({
        isDraftPage: true,
        isProjectMode: true,
        projects,
        projectsQuerySucceeded: true,
      }),
    ).toEqual({ path: "/project/project-1", reason: "projectless" });
  });

  it("normalizes a stale project draft to the first available project", () => {
    expect(
      resolveProjectDraftRedirect({
        isDraftPage: true,
        isProjectMode: true,
        projects,
        projectsQuerySucceeded: true,
        requestedProjectId: "removed-project",
      }),
    ).toEqual({ path: "/project/project-1", reason: "stale" });
  });

  it("does not normalize before the project query succeeds", () => {
    expect(
      resolveProjectDraftRedirect({
        isDraftPage: true,
        isProjectMode: true,
        projects,
        projectsQuerySucceeded: false,
      }),
    ).toBeUndefined();
  });
});
