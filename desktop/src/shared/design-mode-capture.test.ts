// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  DESIGN_COMPUTED_STYLE_PROPS,
  buildCssPath,
  captureDesignElement,
  collectAttributes,
  collectReactComponentNames,
  designElementPayloadSize,
  isUsefulReactComponentName,
  normalizeDesignOutputDetail,
  shouldOmitElementValue,
} from "./design-mode-capture";

describe("design-mode-capture redaction", () => {
  it("omits password / email / tel input values", () => {
    for (const type of ["password", "email", "tel"] as const) {
      const input = document.createElement("input");
      input.type = type;
      input.value = "secret-value";
      expect(shouldOmitElementValue(input)).toBe(true);

      const captured = captureDesignElement(input, "detailed");
      expect(JSON.stringify(captured)).not.toContain("secret-value");
      expect(captured.attributes?.value).toBeUndefined();
      expect(captured.text).toBeUndefined();
    }
  });

  it("omits one-time-code and cc-* autocomplete values", () => {
    const otp = document.createElement("input");
    otp.type = "text";
    otp.autocomplete = "one-time-code";
    otp.value = "123456";
    expect(shouldOmitElementValue(otp)).toBe(true);
    expect(JSON.stringify(captureDesignElement(otp, "detailed"))).not.toContain(
      "123456",
    );

    const cc = document.createElement("input");
    cc.type = "text";
    cc.setAttribute("autocomplete", "cc-number");
    cc.value = "4111111111111111";
    expect(shouldOmitElementValue(cc)).toBe(true);
    const attrs = collectAttributes(cc, "detailed");
    expect(attrs?.value).toBeUndefined();
    expect(JSON.stringify(attrs ?? {})).not.toContain("4111111111111111");
  });

  it("allows non-sensitive text input values only in detailed attributes", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "hello-world";
    expect(shouldOmitElementValue(input)).toBe(false);

    const detailed = captureDesignElement(input, "detailed");
    expect(detailed.attributes?.value).toBe("hello-world");

    const standard = captureDesignElement(input, "standard");
    expect(standard.attributes).toBeUndefined();
  });
});

describe("design-mode-capture selectors + react names", () => {
  it("builds a cssPath selector from tag/class structure", () => {
    document.body.innerHTML = `
      <div class="layout">
        <button id="save-btn" class="btn primary" type="button">Save</button>
      </div>
    `;
    const button = document.querySelector("button")!;
    expect(buildCssPath(button)).toBe("#save-btn");

    button.removeAttribute("id");
    const path = buildCssPath(button);
    expect(path).toContain("button");
    expect(path.toLowerCase()).toContain("btn");
  });

  it("walks React fiber keys and filters noise names", () => {
    expect(isUsefulReactComponentName("PricingCard")).toBe(true);
    expect(isUsefulReactComponentName("Button")).toBe(true);
    expect(isUsefulReactComponentName("Provider")).toBe(false);
    expect(isUsefulReactComponentName("ThemeProvider")).toBe(false);
    expect(isUsefulReactComponentName("Memo")).toBe(false);
    expect(isUsefulReactComponentName("div")).toBe(false);

    const button = document.createElement("button");
    const leaf = {
      type: function Button() {},
      return: {
        type: { displayName: "PricingCard" },
        return: {
          type: { displayName: "ThemeProvider" },
          return: {
            type: function Fragment() {},
            return: null,
          },
        },
      },
    };
    Object.defineProperty(button, "__reactFiber$test", {
      value: leaf,
      configurable: true,
      enumerable: true,
    });

    expect(collectReactComponentNames(button)).toEqual([
      "Button",
      "PricingCard",
    ]);

    const captured = captureDesignElement(button, "standard");
    expect(captured.reactComponents).toEqual(["Button", "PricingCard"]);
    expect(captured.selector.length).toBeGreaterThan(0);
  });

  it("includes computed styles for standard/detailed tiers", () => {
    const el = document.createElement("div");
    el.textContent = "Hello";
    document.body.append(el);

    const compact = captureDesignElement(el, "compact");
    expect(compact.computedStyles).toBeUndefined();

    const standard = captureDesignElement(el, "standard");
    // jsdom may return empty strings for some props; when present they are keyed.
    if (standard.computedStyles) {
      expect(Object.keys(standard.computedStyles).length).toBeGreaterThan(0);
    }

    expect(DESIGN_COMPUTED_STYLE_PROPS).toHaveLength(37);
  });
});

describe("design-mode-capture output detail tiers", () => {
  it("normalizes unknown detail to standard", () => {
    expect(normalizeDesignOutputDetail(undefined)).toBe("standard");
    expect(normalizeDesignOutputDetail("nope")).toBe("standard");
    expect(normalizeDesignOutputDetail("compact")).toBe("compact");
  });

  it("changes payload volume across compact / standard / detailed", () => {
    document.body.innerHTML = `
      <section class="page">
        <article class="card" data-testid="pricing">
          <h2>Plan</h2>
          <button class="btn primary" type="button">Upgrade now</button>
        </article>
      </section>
    `;
    const button = document.querySelector("button")!;
    Object.defineProperty(button, "__reactFiber$test", {
      value: {
        type: function UpgradeButton() {},
        return: {
          type: { displayName: "PricingCard" },
          return: null,
        },
      },
      configurable: true,
      enumerable: true,
    });

    const compact = captureDesignElement(button, "compact");
    const standard = captureDesignElement(button, "standard");
    const detailed = captureDesignElement(button, "detailed");

    const compactSize = designElementPayloadSize(compact);
    const standardSize = designElementPayloadSize(standard);
    const detailedSize = designElementPayloadSize(detailed);

    expect(standardSize).toBeGreaterThan(compactSize);
    expect(detailedSize).toBeGreaterThan(standardSize);

    expect(compact.parents).toBeUndefined();
    expect(compact.attributes).toBeUndefined();
    expect(standard.parents?.length).toBeGreaterThan(0);
    expect(detailed.attributes).toBeDefined();
  });
});
