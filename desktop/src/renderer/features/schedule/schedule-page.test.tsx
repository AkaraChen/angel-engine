// @vitest-environment jsdom

import type { CreateAutomationFormState } from "@/features/schedule/schedule-model";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConfirmStep,
  ConfirmValidationNotice,
  ParametersStep,
  WhenStep,
  WizardProgress,
} from "@/features/schedule/schedule-page";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/schedule/requests/automations", () => ({
  automationListQueryOptions: vi.fn(),
  createAutomationMutationOptions: vi.fn(),
  deleteAutomationMutationOptions: vi.fn(),
  runAutomationNowMutationOptions: vi.fn(),
  setAutomationEnabledMutationOptions: vi.fn(),
}));

afterEach(cleanup);

const validState: CreateAutomationFormState = {
  cron: "0 9 * * *",
  name: "Current name",
  notifyOnFailure: true,
  preset: "daily",
  projectId: "",
  prompt: "Current prompt",
  time: "09:00",
  weekday: "1",
};

describe("schedule wizard boundaries", () => {
  it("explains why an empty run time cannot continue", () => {
    const { container } = render(
      <WhenStep
        cronValid={false}
        dispatch={vi.fn()}
        state={{ ...validState, cron: "", time: "" }}
        timeRequired
      />,
    );

    expect(screen.getByText("schedule.wizard.requiredTime")).toBeTruthy();
    expect(
      container
        .querySelector('input[type="time"]')
        ?.getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("shows only missing template parameters before advanced defaults", () => {
    const view = render(
      <ParametersStep
        dispatch={vi.fn()}
        nameValid
        projects={[]}
        promptValid
        state={validState}
        template={{
          cron: validState.cron,
          name: validState.name,
          notifyOnFailure: validState.notifyOnFailure,
          prompt: validState.prompt,
        }}
      />,
    );

    expect(screen.getByText("schedule.project")).toBeTruthy();
    expect(screen.queryByText("schedule.name")).toBeNull();
    expect(screen.queryByText("schedule.prompt")).toBeNull();

    fireEvent.click(screen.getByText("schedule.wizard.advancedSettings"));
    expect(screen.getByText("schedule.name")).toBeTruthy();
    expect(screen.getByText("schedule.prompt")).toBeTruthy();
    expect(screen.getByText("schedule.notifyOnFailure")).toBeTruthy();

    view.unmount();
    render(
      <ParametersStep
        dispatch={vi.fn()}
        nameValid
        projects={[]}
        promptValid
        state={validState}
      />,
    );
    expect(screen.getByText("schedule.name")).toBeTruthy();
    expect(screen.getByText("schedule.prompt")).toBeTruthy();
    expect(screen.getByText("schedule.project")).toBeTruthy();
    expect(screen.getByText("schedule.notifyOnFailure")).toBeTruthy();
    expect(screen.queryByText("schedule.wizard.advancedSettings")).toBeNull();
  });

  it("gives a disabled confirmation an explanation and repair action", () => {
    const onEdit = vi.fn();
    render(
      <ConfirmValidationNotice
        onEdit={onEdit}
        reason="schedule.wizard.requiredTime"
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "schedule.wizard.requiredTime",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "schedule.wizard.edit" }),
    );
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("makes later visited steps unreachable after an earlier invalidation", () => {
    render(
      <WizardProgress
        completedSteps={[true, true, true, false]}
        current={2}
        onStepChange={vi.fn()}
        stepValidity={[true, false, false, false]}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /schedule\.wizard\.steps\.parameters/,
      }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", {
        name: /schedule\.wizard\.steps\.confirm/,
      }),
    ).toHaveProperty("disabled", true);
  });

  it("renders four confirmation rows from the current form state", () => {
    const onEdit = vi.fn();
    render(
      <ConfirmStep
        nextRun="Aug 16, 2026, 9:00 AM"
        onEdit={onEdit}
        state={{
          ...validState,
          cron: "15 10 * * 2",
          name: "Edited name",
          preset: "custom",
          prompt: "Edited prompt",
        }}
      />,
    );

    expect(screen.getAllByRole("region")).toHaveLength(4);
    expect(screen.getByText("Edited name")).toBeTruthy();
    expect(screen.getByText("Edited prompt")).toBeTruthy();
    expect(screen.getByText("15 10 * * 2")).toBeTruthy();
    expect(screen.getByText("Aug 16, 2026, 9:00 AM")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "schedule.wizard.edit" }),
    ).toHaveLength(4);
    const whatSummary = screen.getByRole("region", {
      name: "schedule.wizard.steps.what",
    });
    fireEvent.click(
      within(whatSummary).getByRole("button", {
        name: "schedule.wizard.edit",
      }),
    );
    expect(onEdit).toHaveBeenCalledWith(3);
  });
});
