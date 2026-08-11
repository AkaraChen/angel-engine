import { describe, expect, it } from "vitest";

import { expandCssRect, mapCssRectToImagePixels } from "./design-mode-crop";

describe("mapCssRectToImagePixels", () => {
  it("scales CSS rect by naturalWidth / surfaceSize (2x DPR)", () => {
    const crop = mapCssRectToImagePixels(
      { x: 100, y: 50, width: 200, height: 80 },
      { width: 1000, height: 500 },
      { width: 2000, height: 1000 },
    );

    expect(crop).toEqual({ x: 200, y: 100, width: 400, height: 160 });
  });

  it("clamps crop to image bounds", () => {
    const crop = mapCssRectToImagePixels(
      { x: 900, y: 400, width: 200, height: 200 },
      { width: 1000, height: 500 },
      { width: 1000, height: 500 },
    );

    expect(crop).toEqual({ x: 900, y: 400, width: 100, height: 100 });
  });

  it("returns null for invalid sizes", () => {
    expect(
      mapCssRectToImagePixels(
        { x: 0, y: 0, width: 10, height: 10 },
        { width: 0, height: 500 },
        { width: 100, height: 100 },
      ),
    ).toBeNull();
    expect(
      mapCssRectToImagePixels(
        { x: 0, y: 0, width: 0, height: 10 },
        { width: 100, height: 100 },
        { width: 100, height: 100 },
      ),
    ).toBeNull();
  });
});

describe("expandCssRect", () => {
  it("pads and clamps to surface", () => {
    expect(
      expandCssRect({ x: 5, y: 5, width: 10, height: 10 }, 8, {
        width: 100,
        height: 100,
      }),
    ).toEqual({ x: 0, y: 0, width: 23, height: 23 });
  });
});
