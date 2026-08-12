import i18n from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { resources } from "@shared/i18n/resources";
import { localizedErrorMessage } from "./error-message";

describe("localizedErrorMessage", () => {
  beforeAll(async () => {
    await i18n.init({ lng: "zh-CN", resources });
  });

  it("maps stable main-process codes to renderer translations", () => {
    expect(localizedErrorMessage({ code: "daemon-unavailable" })).toBe(
      "后端不可用",
    );
    expect(localizedErrorMessage({ code: "main-operation-failed" })).toBe(
      "桌面操作失败",
    );
  });

  it("keeps main-process English messages as the fallback", () => {
    expect(localizedErrorMessage(new Error("Desktop operation failed."))).toBe(
      "Desktop operation failed.",
    );
  });
});
