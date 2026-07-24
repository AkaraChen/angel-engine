import { describe, expect, it } from "vitest";

import { findPlanModeToggleTarget } from "./mode-options";

describe("findPlanModeToggleTarget", () => {
  it("prefers permission modes when agent mode cannot be set", () => {
    const target = findPlanModeToggleTarget([
      {
        canSet: false,
        family: "agent",
        options: [
          { label: "Plan", value: "plan" },
          { label: "Default", value: "default" },
        ],
        value: "default",
      },
      {
        canSet: true,
        family: "permission",
        options: [
          { label: "Plan", value: "plan" },
          { label: "Accept edits", value: "acceptEdits" },
        ],
        value: "acceptEdits",
      },
    ]);
    expect(target?.family).toBe("permission");
    expect(target?.isPlanMode).toBe(false);
    expect(target?.targetMode.value).toBe("plan");
  });

  it("toggles from plan back to build", () => {
    const target = findPlanModeToggleTarget([
      {
        canSet: true,
        family: "permission",
        options: [
          { label: "Plan", value: "plan" },
          { label: "Default", value: "default" },
        ],
        value: "plan",
      },
    ]);
    expect(target?.isPlanMode).toBe(true);
    expect(target?.targetMode.value).toBe("default");
  });

  it("returns undefined when capabilities are missing", () => {
    expect(
      findPlanModeToggleTarget([
        {
          canSet: false,
          family: "permission",
          options: [
            { label: "Plan", value: "plan" },
            { label: "Default", value: "default" },
          ],
          value: "default",
        },
      ]),
    ).toBeUndefined();
  });
});
