import { describe, expect, it } from "vitest";
import { displayChatTitle } from "./workspace-display";

const t = (key: string) => (key === "workspace.newChat" ? "新聊天" : key);

describe("displayChatTitle", () => {
  it("localizes the stored English default title", () => {
    expect(displayChatTitle("New chat", t)).toBe("新聊天");
  });

  it("localizes empty or whitespace titles as unnamed", () => {
    expect(displayChatTitle("", t)).toBe("新聊天");
    expect(displayChatTitle("   ", t)).toBe("新聊天");
  });

  it("leaves real titles unchanged", () => {
    expect(displayChatTitle("Fix login redirect", t)).toBe(
      "Fix login redirect",
    );
  });
});
