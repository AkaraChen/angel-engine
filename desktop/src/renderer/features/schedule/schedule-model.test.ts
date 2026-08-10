import type {
  Automation,
  AutomationRun,
} from "@/features/schedule/schedule-model";

import { describe, expect, it } from "vitest";
import {
  hasMissedRun,
  nextRunPreview,
  presetForCron,
  sortedRuns,
  validateCron,
} from "@/features/schedule/schedule-model";

describe("schedule model", () => {
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
