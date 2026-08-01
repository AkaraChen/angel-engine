// @vitest-environment jsdom

import type { ChatOptionsContextValue } from "@/features/chat/runtime/chat-options-context";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanModeToggleButton } from "./composer-plan-mode";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "composer.plan": "Plan",
        "composer.switchToBuild": "Switch to build mode",
        "composer.switchToPlan": "Switch to plan mode",
      })[key] ?? key,
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => vi.fn(),
}));

afterEach(cleanup);

describe("PlanModeToggleButton", () => {
  it("keeps the Plan label fixed and uses the selected style for plan mode", () => {
    const { rerender } = render(
      <PlanModeToggleButton options={chatOptions({ mode: "build" })} />,
    );

    const inactiveButton = screen.getByRole("button", {
      name: "Switch to plan mode",
    });
    expect(inactiveButton.textContent).toContain("Plan");
    expect(inactiveButton.getAttribute("aria-pressed")).toBe("false");
    expect(inactiveButton.getAttribute("data-variant")).toBe("ghost");

    rerender(<PlanModeToggleButton options={chatOptions({ mode: "plan" })} />);

    const activeButton = screen.getByRole("button", {
      name: "Switch to build mode",
    });
    expect(activeButton.textContent).toContain("Plan");
    expect(activeButton.getAttribute("aria-pressed")).toBe("true");
    expect(activeButton.getAttribute("data-variant")).toBe("secondary");
  });

  it("switches from build to plan mode", () => {
    const setMode = vi.fn();
    render(
      <PlanModeToggleButton
        options={chatOptions({ mode: "build", setMode })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to plan mode" }),
    );

    expect(setMode).toHaveBeenCalledWith("plan");
  });
});

function chatOptions(
  overrides: Partial<ChatOptionsContextValue> = {},
): ChatOptionsContextValue {
  return {
    canSetModel: true,
    canSetMode: true,
    canSetPermissionMode: false,
    canSetReasoningEffort: true,
    canSetRuntime: true,
    configLoading: false,
    model: "model",
    modelOptionCount: 1,
    modelOptions: [{ label: "Model", value: "model" }],
    mode: "build",
    modeOptionCount: 2,
    modeOptions: [
      { label: "Build", value: "build" },
      { label: "Plan", value: "plan" },
    ],
    permissionMode: "",
    permissionModeOptionCount: 0,
    permissionModeOptions: [],
    reasoningEffort: "medium",
    reasoningEffortOptionCount: 1,
    reasoningEffortOptions: [{ label: "Medium", value: "medium" }],
    runtime: "codex",
    runtimeOptions: [],
    setModel: vi.fn(),
    setMode: vi.fn(),
    setPermissionMode: vi.fn(),
    setReasoningEffort: vi.fn(),
    setRuntime: vi.fn(),
    ...overrides,
  };
}
