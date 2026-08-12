import { describe, expect, it } from "vitest";

import { formatDesignPromptText } from "./design-mode-prompt";

describe("formatDesignPromptText", () => {
  it("includes user instruction and element context fields", () => {
    const text = formatDesignPromptText({
      url: "http://localhost:5173/pricing",
      viewport: { width: 1280, height: 720 },
      userText: "把这个改成 primary",
      anchor: {
        kind: "element",
        selector: "#upgrade-btn",
        rect: { x: 100, y: 200, width: 120, height: 40 },
      },
      element: {
        selector: "#upgrade-btn",
        tagName: "BUTTON",
        role: "button",
        testId: "upgrade",
        text: "Upgrade",
        href: undefined,
        reactComponents: ["UpgradeButton", "PricingCard"],
        rect: { x: 100, y: 200, width: 120, height: 40 },
        computedStyles: {
          "background-color": "rgb(37, 99, 235)",
          "font-weight": "600",
        },
        parents: [
          {
            selector: ".card",
            tagName: "DIV",
            reactComponents: ["PricingCard"],
          },
        ],
      },
    });

    expect(text).toContain("把这个改成 primary");
    expect(text).toContain("URL: http://localhost:5173/pricing");
    expect(text).toContain("Viewport: 1280×720");
    expect(text).toContain("Element selector: #upgrade-btn");
    expect(text).toContain("React components: <UpgradeButton> <PricingCard>");
    expect(text).toContain("Element text: Upgrade");
    expect(text).toContain("role: button");
    expect(text).toContain("testId: upgrade");
    expect(text).toContain("background-color: rgb(37, 99, 235)");
    expect(text).toContain("Parents: div .card [<PricingCard>]");
  });

  it("formats region-only selections without element block", () => {
    const text = formatDesignPromptText({
      url: "http://localhost:3000/",
      viewport: { width: 800, height: 600 },
      userText: "restyle this area",
      anchor: {
        kind: "region",
        rect: { x: 10, y: 20, width: 300, height: 150 },
      },
    });

    expect(text).toContain("Target: region @");
    expect(text).toContain("Region: 10,20 300×150");
    expect(text).not.toContain("Element selector:");
  });

  it("appends requested design changes when present", () => {
    const text = formatDesignPromptText({
      url: "http://localhost:5173/",
      viewport: { width: 100, height: 100 },
      userText: "",
      anchor: {
        kind: "element",
        selector: "button",
        rect: { x: 0, y: 0, width: 10, height: 10 },
      },
      element: {
        selector: "button",
        tagName: "BUTTON",
        rect: { x: 0, y: 0, width: 10, height: 10 },
      },
      changes: [{ property: "color", value: "red" }],
    });

    expect(text.startsWith("Design Mode selection")).toBe(true);
    expect(text).toContain("Requested design changes:");
    expect(text).toContain("- color: red");
  });
});
