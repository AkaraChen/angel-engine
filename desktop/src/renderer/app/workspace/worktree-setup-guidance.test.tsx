// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorktreeSetupGuidance } from "./worktree-setup-guidance";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("WorktreeSetupGuidance", () => {
  it("offers agent configuration without blocking worktree creation", () => {
    const configure = vi.fn();
    const dismiss = vi.fn();
    render(
      <WorktreeSetupGuidance
        hasLegacyInitScript={false}
        onConfigure={configure}
        onDismiss={dismiss}
        onMigrate={vi.fn()}
      />,
    );

    expect(screen.queryByText("workspace.worktreeSetupMigrate")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "workspace.worktreeSetupConfigure",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "workspace.worktreeSetupDismiss" }),
    );
    expect(configure).toHaveBeenCalledOnce();
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("offers explicit migration when init_script exists", () => {
    const migrate = vi.fn();
    render(
      <WorktreeSetupGuidance
        hasLegacyInitScript
        onConfigure={vi.fn()}
        onDismiss={vi.fn()}
        onMigrate={migrate}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "workspace.worktreeSetupMigrate" }),
    );
    expect(migrate).toHaveBeenCalledOnce();
    expect(
      screen.getByText("workspace.worktreeSetupLegacyDescription"),
    ).toBeDefined();
  });
});
