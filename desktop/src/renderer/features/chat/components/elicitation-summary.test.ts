import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import {
  elicitationResolvedSubject,
  formatElicitationDecision,
  isNegativeElicitationDecision,
} from "./elicitation-summary";

const t = ((key: string) => key) as TFunction;
const formatPhase = (phase: string) => `phase:${phase}`;

describe("elicitationResolvedSubject", () => {
  it("prefers compacted body over title so the command stays visible", () => {
    expect(
      elicitationResolvedSubject(
        {
          body: "  git status\n  --short  ",
          title: "Bash",
        },
        "common.question",
      ),
    ).toBe("git status --short");
  });

  it("falls back to title when body is empty", () => {
    expect(
      elicitationResolvedSubject(
        { body: "   ", title: "Allow tool" },
        "common.question",
      ),
    ).toBe("Allow tool");
  });
});

describe("formatElicitationDecision", () => {
  it("labels a local allow response as Allow", () => {
    expect(
      formatElicitationDecision(
        "resolved:Answers",
        "allow",
        true,
        t,
        formatPhase,
      ),
    ).toBe("common.allow");
  });

  it("labels a local allowForSession response as Allow session", () => {
    expect(
      formatElicitationDecision(
        "resolved:Answers",
        "allowForSession",
        true,
        t,
        formatPhase,
      ),
    ).toBe("common.allowSession");
  });

  it("treats a resolved permission phase without a local response as Allow", () => {
    expect(
      formatElicitationDecision(
        "resolved:Answers",
        undefined,
        true,
        t,
        formatPhase,
      ),
    ).toBe("common.allow");
  });

  it("treats a cancelled permission phase without a local response as Declined", () => {
    expect(
      formatElicitationDecision("cancelled", undefined, true, t, formatPhase),
    ).toBe("common.declined");
  });
});

describe("isNegativeElicitationDecision", () => {
  it("marks deny and cancel as negative", () => {
    expect(isNegativeElicitationDecision("cancelled", "deny")).toBe(true);
    expect(isNegativeElicitationDecision("cancelled", "cancel")).toBe(true);
    expect(isNegativeElicitationDecision("resolved:Answers", "allow")).toBe(
      false,
    );
  });
});
