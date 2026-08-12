import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";

import {
  changeRequestEn,
  changeRequestJa,
  changeRequestKo,
  changeRequestZhTW,
} from "./change-request";

describe("change request translations", () => {
  it.each([
    {
      count: 1,
      expected: "1 required check failed: build.",
      key: "blockers.checksFailed",
    },
    {
      count: 2,
      expected: "2 required checks failed: build, test.",
      key: "blockers.checksFailed",
    },
    {
      count: 1,
      expected: "1 review conversation is unresolved.",
      key: "blockers.unresolvedThreads",
    },
    {
      count: 2,
      expected: "2 review conversations are unresolved.",
      key: "blockers.unresolvedThreads",
    },
  ])("uses English plural copy for $key at $count", async (testCase) => {
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      resources: { en: { translation: { changeRequest: changeRequestEn } } },
    });

    expect(
      i18n.t(`changeRequest.${testCase.key}`, {
        count: testCase.count,
        names: testCase.count === 1 ? "build" : "build, test",
      }),
    ).toBe(testCase.expected);
  });

  it("keeps Traditional Chinese change request copy independent", () => {
    expect(changeRequestZhTW.archive).toBe("封存此工作區");
    expect(changeRequestZhTW.blockers.conflict).toBe(
      "此變更要求存在合併衝突。",
    );
  });

  it.each([
    {
      expected: "必須チェック 1 件が失敗しました：build。",
      language: "ja",
      resource: changeRequestJa,
    },
    {
      expected: "필수 검사 1개 실패: build.",
      language: "ko",
      resource: changeRequestKo,
    },
  ])("uses the CLDR other branch for $language", async (testCase) => {
    const i18n = createInstance();
    await i18n.init({
      lng: testCase.language,
      resources: {
        [testCase.language]: {
          translation: { changeRequest: testCase.resource },
        },
      },
    });

    expect(
      i18n.t("changeRequest.blockers.checksFailed", {
        count: 1,
        names: "build",
      }),
    ).toBe(testCase.expected);
  });
});
