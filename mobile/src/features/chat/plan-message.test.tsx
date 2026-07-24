import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlanMessage } from "./plan-message";

const fullPlan = {
  text: "Ship plan mode",
  entries: [{ content: "Toggle", status: "pending" as const }],
  kind: "review" as const,
  presentation: null as "created" | "updated" | null,
};

describe("PlanMessage", () => {
  it("rerenders full → marker without throwing a hooks invariant", () => {
    const { rerender } = render(<PlanMessage plan={fullPlan} />);
    expect(screen.getByText("Ship plan mode")).toBeTruthy();

    expect(() =>
      rerender(<PlanMessage plan={{ ...fullPlan, presentation: "created" }} />),
    ).not.toThrow();
    expect(screen.getByText(/created/i)).toBeTruthy();
  });
});
