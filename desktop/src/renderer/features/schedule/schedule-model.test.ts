import { describe, expect, it } from "vitest";
import {
  hasMissedRun,
  nextRunPreview,
  scheduleFixture,
  sortedRuns,
  validateCron,
} from "@/features/schedule/schedule-model";

describe("schedule model", () => {
  it("validates supported five-field cron expressions", () => {
    expect(validateCron("0 9 * * *")).toBe(true);
    expect(validateCron("*/30 * * * *")).toBe(true);
    expect(validateCron("0 9 * * 1-5")).toBe(true);
    expect(validateCron("0 9 * *")).toBe(false);
    expect(validateCron("tomorrow morning")).toBe(false);
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

  it("sorts history newest first and detects missed runs", () => {
    const runs = scheduleFixture[0]?.runs ?? [];

    expect(sortedRuns(runs).map(({ id }) => id)).toEqual([
      "audit-run-1",
      "audit-run-2",
    ]);
    expect(hasMissedRun(scheduleFixture)).toBe(true);
  });
});
