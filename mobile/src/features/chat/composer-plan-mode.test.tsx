import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComposerPlanMode } from "./composer-plan-mode";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

const permissionConfig = {
  canSetPermissionMode: true,
  currentPermissionMode: "default",
  permissionModes: [
    { label: "Plan", value: "plan" },
    { label: "Default", value: "default" },
  ],
  modes: [],
  models: [],
  reasoningEfforts: [],
};

afterEach(cleanup);

describe("ComposerPlanMode", () => {
  beforeEach(() => {
    toastError.mockReset();
  });

  it("renders nothing when the runtime cannot set modes", () => {
    const { container } = render(
      <ComposerPlanMode
        config={{
          modes: [],
          models: [],
          permissionModes: [],
          reasoningEfforts: [],
        }}
        onSetMode={vi.fn()}
        onSetPermissionMode={vi.fn()}
      />,
    );
    expect(container.childElementCount).toBe(0);
  });

  it("toasts when setPermissionMode rejects", async () => {
    const onSetPermissionMode = vi
      .fn()
      .mockRejectedValue(new Error("daemon offline"));
    render(
      <ComposerPlanMode
        config={permissionConfig}
        onSetMode={vi.fn()}
        onSetPermissionMode={onSetPermissionMode}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /switch to plan/i }));
    await waitFor(() =>
      expect(onSetPermissionMode).toHaveBeenCalledWith("plan"),
    );
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ description: "daemon offline" }),
      ),
    );
  });
});
