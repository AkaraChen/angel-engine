import { describe, expect, it } from "vitest";

import {
  applyDesignChangeEdit,
  buildDraftStyleSheet,
  isUnsafeCssValue,
  sanitizeCssProperty,
  sanitizeCssValue,
  sanitizeDesignChanges,
} from "./design-mode-css";

describe("design-mode-css sanitization", () => {
  it("rejects values containing url(, expression(, or @import", () => {
    expect(isUnsafeCssValue("url(https://evil.example/x.png)")).toBe(true);
    expect(isUnsafeCssValue("red url(http://x)")).toBe(true);
    expect(isUnsafeCssValue("expression(alert(1))")).toBe(true);
    expect(isUnsafeCssValue("@import url(x)")).toBe(true);
    expect(sanitizeCssValue("url(https://evil.example)")).toBeNull();
    expect(sanitizeCssValue("red")).toBe("red");
  });

  it("strips declaration breakout characters", () => {
    expect(sanitizeCssValue("red; background: url(x)")).toBeNull();
    expect(sanitizeCssValue("10px;}")).toBe("10px");
    expect(sanitizeCssValue("{ color: red }")).toBe("color: red");
  });

  it("only allows inspector property names", () => {
    expect(sanitizeCssProperty("color")).toBe("color");
    expect(sanitizeCssProperty("COLOR")).toBe("color");
    expect(sanitizeCssProperty("background-image")).toBeNull();
    expect(sanitizeCssProperty("onclick")).toBeNull();
    expect(sanitizeCssProperty("color:red")).toBeNull();
  });

  it("builds attribute-selector draft stylesheet with !important", () => {
    const css = buildDraftStyleSheet([
      { property: "color", value: "red" },
      { property: "font-size", value: "20px" },
      { property: "background-image", value: "url(x)" },
    ]);
    expect(css).toBe(
      '[data-angel-design-target="active"] { color: red !important; font-size: 20px !important; }',
    );
  });

  it("drops unsafe entries from change lists", () => {
    expect(
      sanitizeDesignChanges([
        { property: "color", value: "blue" },
        { property: "background-color", value: "url(http://x)" },
      ]),
    ).toEqual([{ property: "color", value: "blue" }]);
  });

  it("applyDesignChangeEdit merges, clears, and rejects unsafe values", () => {
    const base = [{ property: "color", value: "red" }];
    expect(applyDesignChangeEdit(base, "font-size", "16px").changes).toEqual([
      { property: "color", value: "red" },
      { property: "font-size", value: "16px" },
    ]);
    expect(applyDesignChangeEdit(base, "color", "").changes).toEqual([]);
    const rejected = applyDesignChangeEdit(
      base,
      "color",
      "url(https://evil.example)",
    );
    expect(rejected.rejected).toBe(true);
    expect(rejected.changes).toEqual(base);
  });
});
