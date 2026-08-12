// @vitest-environment jsdom

import type { WorkspaceGitDiffBaseOption } from "@angel-engine/daemon-api/workspace-tools";
import type { SupportedLanguage } from "@shared/i18n/resources";
import { resources, supportedLanguages } from "@shared/i18n/resources";
import { cleanup, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatWorkspaceGitDiffUnavailableReason,
  WorkspaceGitBaseSelect,
} from "./workspace-git-base-select";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "workspace.tools.diffBase.label": "Diff base",
        "workspace.tools.diffBase.turn": "Since previous turn",
        "workspace.tools.diffBase.worktree": "Uncommitted changes",
      })[key] ?? key,
  }),
}));

afterEach(cleanup);

const bases: WorkspaceGitDiffBaseOption[] = [
  {
    available: false,
    kind: "turn",
    selected: true,
    unavailableReason: { code: "anchor-missing", shortSha: "deadbee" },
  },
  {
    available: true,
    fullSha: "0123456789abcdef",
    kind: "worktree",
    selected: false,
    shortSha: "0123456",
  },
];

function translatorFor(language: SupportedLanguage) {
  const instance = createInstance();
  void instance.init({ lng: language, resources });
  return instance.t.bind(instance);
}

describe("WorkspaceGitBaseSelect", () => {
  it("keeps the requested preference selected when its diff falls back", () => {
    const onChange = vi.fn();
    const { container } = render(
      <WorkspaceGitBaseSelect
        bases={bases}
        resolvedBase={bases[1]}
        value="turn"
        onChange={onChange}
      />,
    );

    const select = screen.getByRole("combobox");
    expect(select.textContent).toContain("Since previous turn");
    expect(onChange).not.toHaveBeenCalled();
    const root = container.querySelector(
      '[data-slot="workspace-git-base-select"]',
    );
    expect(root?.classList.contains("w-full")).toBe(true);
    expect(root?.classList.contains("grid-cols-[auto_minmax(0,1fr)]")).toBe(
      true,
    );
    expect(select.classList.contains("w-full")).toBe(true);
    expect(select.classList.contains("min-w-32")).toBe(true);
    expect(select.textContent).not.toContain("deadbee");
  });
});

describe("formatWorkspaceGitDiffUnavailableReason", () => {
  it.each(
    supportedLanguages,
  )("localizes fallback reasons in %s", (language) => {
    const message = formatWorkspaceGitDiffUnavailableReason({
      fallbackKind: "worktree",
      reason: {
        anchorKind: "turn",
        code: "anchor-missing",
        shortSha: "deadbee",
      },
      requestedKind: "turn",
      t: translatorFor(language),
    });

    expect(message).not.toContain("workspace.tools.diffBase");
    expect(message).toContain("deadbee");
  });
});
