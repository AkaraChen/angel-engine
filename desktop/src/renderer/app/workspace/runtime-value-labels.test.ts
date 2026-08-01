import type { SupportedLanguage } from "@shared/i18n/resources";
import { resources } from "@shared/i18n/resources";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import {
  ensureConfigOption,
  runtimeConfigOptionsToAgentOptions,
} from "@/app/workspace/chat-runtime-options";
import { runtimeValueLabeler } from "@/app/workspace/runtime-value-labels";

function translatorFor(language: SupportedLanguage) {
  const instance = createInstance();
  void instance.init({ lng: language, resources });
  return instance.t.bind(instance);
}

describe("runtimeValueLabeler", () => {
  it("translates closed-set runtime values into the active language", () => {
    const t = translatorFor("zh-CN");

    expect(runtimeValueLabeler("reasoningEffort", t)("none", "None")).toBe(
      "不推理",
    );
    expect(runtimeValueLabeler("mode", t)("plan", "Plan")).toBe("计划");
    expect(
      runtimeValueLabeler("permissionMode", t)("on-request", "On Request"),
    ).toBe("按需询问");
  });

  it("matches the same value across runtime id spellings", () => {
    const localize = runtimeValueLabeler("permissionMode", translatorFor("ja"));

    expect(localize("acceptEdits", "Accept Edits")).toBe("編集を自動承認");
    expect(localize("accept_edits", "Accept Edits")).toBe("編集を自動承認");
  });

  it("keeps the runtime label for values it does not know", () => {
    const localize = runtimeValueLabeler("mode", translatorFor("zh-CN"));

    expect(localize("turbo-refactor", "Turbo Refactor")).toBe("Turbo Refactor");
  });
});

describe("runtime config option labels", () => {
  it("localizes labels the runtime reported in English", () => {
    const options = runtimeConfigOptionsToAgentOptions(
      [
        { description: null, label: "None", value: "none" },
        { description: null, label: "XHigh", value: "xhigh" },
      ],
      "使用默认",
      runtimeValueLabeler("reasoningEffort", translatorFor("zh-CN")),
    );

    expect(options.map((option) => option.label)).toEqual([
      "使用默认",
      "不推理",
      "极高",
    ]);
  });

  it("localizes the value added before the runtime option list arrives", () => {
    const options = ensureConfigOption(
      [],
      "on-request",
      "使用默认",
      "默认",
      runtimeValueLabeler("permissionMode", translatorFor("zh-CN")),
    );

    expect(options).toEqual([{ label: "按需询问", value: "on-request" }]);
  });

  it("falls back to a title-cased runtime value when nothing maps", () => {
    const options = ensureConfigOption(
      [],
      "turbo-refactor",
      "使用默认",
      "默认",
      runtimeValueLabeler("mode", translatorFor("zh-CN")),
    );

    expect(options).toEqual([
      { label: "Turbo Refactor", value: "turbo-refactor" },
    ]);
  });
});
