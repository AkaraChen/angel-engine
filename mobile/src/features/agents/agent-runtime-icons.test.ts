import { describe, expect, it } from "vitest";

import { agentRuntimeIconSvg } from "./agent-runtime-icons";

describe("agentRuntimeIconSvg", () => {
  it("returns an inline SVG for built-in runtimes", () => {
    for (const runtime of ["claude", "codex", "gemini", "pi"]) {
      const svg = agentRuntimeIconSvg(runtime);
      expect(svg).toContain("<svg");
    }
  });

  it("returns undefined for unknown/custom runtimes and nullish input", () => {
    expect(agentRuntimeIconSvg("custom:acme")).toBeUndefined();
    expect(agentRuntimeIconSvg("nope")).toBeUndefined();
    expect(agentRuntimeIconSvg(null)).toBeUndefined();
    expect(agentRuntimeIconSvg(undefined)).toBeUndefined();
  });
});
