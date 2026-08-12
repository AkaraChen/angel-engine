import { describe, expect, it } from "vitest";

import {
  DESIGN_TARGET_CROP_REQUIRED_ERROR,
  DESIGN_TARGET_RECT_MISSING_ERROR,
  buildDesignSendPackage,
  resolveCropRect,
} from "./design-mode-send";

describe("resolveCropRect", () => {
  it("prefers element.rect over anchor", () => {
    expect(
      resolveCropRect({
        anchor: {
          kind: "element",
          selector: "#a",
          rect: { x: 1, y: 2, width: 3, height: 4 },
        },
        element: {
          selector: "#a",
          tagName: "BUTTON",
          rect: { x: 10, y: 20, width: 30, height: 40 },
        },
      }),
    ).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it("uses region rect when no element", () => {
    expect(
      resolveCropRect({
        anchor: {
          kind: "region",
          rect: { x: 5, y: 6, width: 7, height: 8 },
        },
      }),
    ).toEqual({ x: 5, y: 6, width: 7, height: 8 });
  });

  it("returns null for point anchors", () => {
    expect(
      resolveCropRect({
        anchor: { kind: "point", x: 1, y: 2 },
      }),
    ).toBeNull();
  });
});

describe("buildDesignSendPackage hard failures", () => {
  const screenshot = {
    dataUrl: "data:image/png;base64,AAAA",
    height: 100,
    surfaceHeight: 100,
    surfaceWidth: 100,
    width: 100,
  };

  it("throws when selection has no crop rect", async () => {
    await expect(
      buildDesignSendPackage({
        screenshot,
        selection: {
          anchor: { kind: "point", x: 1, y: 2 },
          browserViewId: "v1",
          origin: "http://localhost:5173",
          pageUrl: "http://localhost:5173/",
          screenshot,
        },
        userText: "fix",
      }),
    ).rejects.toThrow(DESIGN_TARGET_RECT_MISSING_ERROR);
  });

  it("throws when crop produces no image", async () => {
    // Invalid surface forces mapCssRectToImagePixels → null → crop null.
    await expect(
      buildDesignSendPackage({
        screenshot: {
          ...screenshot,
          surfaceHeight: 0,
          surfaceWidth: 0,
        },
        selection: {
          anchor: {
            kind: "element",
            selector: "#btn",
            rect: { x: 10, y: 10, width: 20, height: 20 },
          },
          browserViewId: "v1",
          element: {
            selector: "#btn",
            tagName: "BUTTON",
            rect: { x: 10, y: 10, width: 20, height: 20 },
          },
          origin: "http://localhost:5173",
          pageUrl: "http://localhost:5173/",
          screenshot: null,
        },
        userText: "make primary",
      }),
    ).rejects.toThrow(DESIGN_TARGET_CROP_REQUIRED_ERROR);
  });
});
