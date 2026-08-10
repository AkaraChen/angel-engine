import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";

import { pullRequestEn, pullRequestZhTW } from "./pull-request";

describe("pull request translations", () => {
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
      resources: { en: { translation: { pullRequest: pullRequestEn } } },
    });

    expect(
      i18n.t(`pullRequest.${testCase.key}`, {
        count: testCase.count,
        names: testCase.count === 1 ? "build" : "build, test",
      }),
    ).toBe(testCase.expected);
  });

  it("keeps Traditional Chinese pull request copy independent", () => {
    expect(pullRequestZhTW.archive).toBe("封存此工作區");
    expect(pullRequestZhTW.blockers.conflict).toBe("此提取要求存在合併衝突。");
  });
});
