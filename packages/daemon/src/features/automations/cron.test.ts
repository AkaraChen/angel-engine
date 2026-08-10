import { describe, expect, it } from "vitest";
import { isValidCron, nextCronRun } from "./cron";

describe("automation cron", () => {
  it.each([
    "60 0 * * *",
    "0 24 * * *",
    "0 0 0 * *",
    "0 0 32 * *",
    "0 0 1 13 *",
    "0 0 * * 8",
    "*/0 * * * *",
    "10-5 * * * *",
  ])("rejects invalid field bounds: %s", (expression) => {
    expect(isValidCron(expression)).toBe(false);
  });

  it("finds the next three five-minute boundaries", () => {
    const first = nextCronRun("*/5 * * * *", new Date(2026, 7, 10, 8, 10));
    const second = first && nextCronRun("*/5 * * * *", first);
    const third = second && nextCronRun("*/5 * * * *", second);

    expect([
      first?.getMinutes(),
      second?.getMinutes(),
      third?.getMinutes(),
    ]).toEqual([15, 20, 25]);
  });
});
