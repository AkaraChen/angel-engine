import type {
  Automation,
  AutomationRun,
} from "@/features/schedule/schedule-model";

import { describe, expect, it } from "vitest";
import {
  automationParameterGroups,
  cronForNaturalSchedule,
  createAutomationFormInitialState,
  hasMissedRun,
  nextRunPreview,
  presetForCron,
  sortedRuns,
  summarizeAutomationPrompt,
  validateAutomationWizard,
  validateCron,
  weekdayKeyForValue,
} from "@/features/schedule/schedule-model";

describe("schedule model", () => {
  it("prefills every form value supplied by a template", () => {
    expect(
      createAutomationFormInitialState(
        {
          cron: "*/30 * * * *",
          name: "CI heartbeat",
          notifyOnFailure: false,
          projectId: "project-1",
          prompt: "Report CI exceptions.",
        },
        ["CI heartbeat", "CI heartbeat (2)"],
      ),
    ).toEqual({
      cron: "*/30 * * * *",
      name: "CI heartbeat (3)",
      notifyOnFailure: false,
      preset: "every-30-minutes",
      projectId: "project-1",
      prompt: "Report CI exceptions.",
      time: "09:00",
      weekday: "1",
    });
  });

  it("maps natural schedule choices back to cron", () => {
    expect(cronForNaturalSchedule("daily", "14:30", "1", "")).toBe(
      "30 14 * * *",
    );
    expect(cronForNaturalSchedule("weekly", "08:05", "5", "")).toBe(
      "5 8 * * 5",
    );
    expect(cronForNaturalSchedule("custom", "09:00", "1", "*/5 * * * *")).toBe(
      "*/5 * * * *",
    );
  });

  it("does not turn an empty run time into midnight", () => {
    expect(cronForNaturalSchedule("daily", "", "1", "")).toBe("");
  });

  it("separates missing template parameters from advanced defaults", () => {
    const template = {
      cron: "0 9 * * *",
      name: "Daily report",
      notifyOnFailure: true,
      prompt: "Summarize progress.",
    };

    expect(automationParameterGroups(template)).toEqual({
      advanced: ["name", "prompt", "notifyOnFailure"],
      primary: ["projectId"],
    });
    expect(automationParameterGroups()).toEqual({
      advanced: [],
      primary: ["name", "prompt", "projectId", "notifyOnFailure"],
    });
  });

  it("invalidates every later step after an earlier step becomes invalid", () => {
    const state = {
      ...createAutomationFormInitialState({
        cron: "0 9 * * *",
        name: "Daily report",
        prompt: "Summarize progress.",
      }),
      cron: "",
      time: "",
    };

    expect(validateAutomationWizard(state, true, false)).toEqual({
      firstInvalidStep: 2,
      steps: [true, false, false, false],
      timeRequired: true,
    });
  });

  it("summarizes the current prompt for confirmation", () => {
    const prompt = `  ${"Current task ".repeat(20)}  `;
    const summary = summarizeAutomationPrompt(prompt);

    expect(summary.length).toBeLessThanOrEqual(118);
    expect(summary.startsWith("Current task")).toBe(true);
    expect(summary.endsWith("…")).toBe(true);
  });

  it("normalizes Sunday weekday 7 at the form boundary", () => {
    const state = createAutomationFormInitialState({
      cron: "0 9 * * 7",
      name: "Sunday report",
      prompt: "Summarize the week.",
    });

    expect(state.weekday).toBe("0");
    expect(state.cron).toBe("0 9 * * 0");
  });

  it("displays normalized Sunday as Sunday", () => {
    const { weekday } = createAutomationFormInitialState({
      cron: "0 9 * * 7",
      name: "Sunday report",
      prompt: "Summarize the week.",
    });

    expect(weekdayKeyForValue(weekday)).toBe("sunday");
  });

  it("writes Sunday weekday 7 back as 0", () => {
    expect(cronForNaturalSchedule("weekly", "09:00", "7", "")).toBe(
      "0 9 * * 0",
    );
  });

  it("validates supported five-field cron expressions", () => {
    expect(validateCron("0 9 * * *")).toBe(true);
    expect(validateCron("*/30 * * * *")).toBe(true);
    expect(validateCron("0 9 * * 1-5")).toBe(true);
    expect(validateCron("59 23 31 12 7")).toBe(true);
    expect(validateCron("0 9 * *")).toBe(false);
    expect(validateCron("tomorrow morning")).toBe(false);
  });

  it.each([
    "60 0 * * *",
    "0 24 * * *",
    "0 0 0 * *",
    "0 0 32 * *",
    "0 0 1 0 *",
    "0 0 1 13 *",
    "0 0 * * 8",
    "*/0 * * * *",
    "10-5 * * * *",
    "-1 * * * *",
  ])("rejects an out-of-range cron expression: %s", (expression) => {
    expect(validateCron(expression)).toBe(false);
  });

  it("previews three future runs for a preset", () => {
    const now = new Date("2026-08-10T08:10:00.000Z");
    const preview = nextRunPreview("every-30-minutes", now);

    expect(preview).toHaveLength(3);
    expect(preview.map((value) => value.toISOString())).toEqual([
      "2026-08-10T08:30:00.000Z",
      "2026-08-10T09:00:00.000Z",
      "2026-08-10T09:30:00.000Z",
    ]);
  });

  it("uses the custom cron expression for its preview", () => {
    const now = new Date("2026-08-10T08:10:00.000Z");
    const preview = nextRunPreview("custom", now, "*/5 * * * *");

    expect(preview.map((value) => value.toISOString())).toEqual([
      "2026-08-10T08:15:00.000Z",
      "2026-08-10T08:20:00.000Z",
      "2026-08-10T08:25:00.000Z",
    ]);
  });

  it("recognizes persisted presets without mislabeling custom cron", () => {
    expect(presetForCron("  */30 * * * * ")).toBe("every-30-minutes");
    expect(presetForCron("0 9 * * *")).toBe("daily");
    expect(presetForCron("*/5 * * * *")).toBeUndefined();
  });

  it("sorts history newest first and detects missed runs", () => {
    const runs: AutomationRun[] = [
      {
        id: "older",
        startedAt: "2026-08-08T01:00:00.000Z",
        status: "missed",
        trigger: "scheduled",
      },
      {
        id: "newer",
        startedAt: "2026-08-09T01:00:00.000Z",
        status: "succeeded",
        trigger: "scheduled",
      },
    ];
    const automation: Automation = {
      cron: "0 9 * * *",
      enabled: true,
      id: "test",
      name: "Test automation",
      notifyOnFailure: true,
      prompt: "Test",
      runs,
      status: "active",
    };

    expect(sortedRuns(runs).map(({ id }) => id)).toEqual(["newer", "older"]);
    expect(hasMissedRun([automation])).toBe(true);
  });
});
