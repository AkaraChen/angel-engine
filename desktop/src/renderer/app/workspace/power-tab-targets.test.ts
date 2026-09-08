import { describe, expect, it } from "vitest";

import {
  buildPowerTabTargets,
  currentPowerTabIndex,
  cyclePowerTabIndex,
} from "./power-tab-targets";

const chatA = { id: "a" };
const chatB = { id: "b" };

describe("buildPowerTabTargets", () => {
  it("does not include draft when draft tab is closed", () => {
    const targets = buildPowerTabTargets({
      powerModeActive: true,
      hasHomeTab: true,
      draftTabActive: false,
      chats: [chatA],
    });
    expect(targets.map((t) => t.kind)).toEqual(["home", "chat"]);
  });

  it("includes draft only when already open", () => {
    const targets = buildPowerTabTargets({
      powerModeActive: true,
      hasHomeTab: true,
      draftTabActive: true,
      chats: [chatA],
    });
    expect(targets.map((t) => t.kind)).toEqual(["home", "chat", "draft"]);
  });

  it("returns empty when power mode is off", () => {
    expect(
      buildPowerTabTargets({
        powerModeActive: false,
        hasHomeTab: true,
        draftTabActive: true,
        chats: [chatA],
      }),
    ).toEqual([]);
  });
});

describe("cyclePowerTabIndex", () => {
  it("returns null for a single tab (do not consume Ctrl+Tab)", () => {
    expect(cyclePowerTabIndex(1, 0, 1)).toBeNull();
    expect(cyclePowerTabIndex(0, -1, 1)).toBeNull();
  });

  it("cycles forward and backward", () => {
    expect(cyclePowerTabIndex(3, 0, 1)).toBe(1);
    expect(cyclePowerTabIndex(3, 2, 1)).toBe(0);
    expect(cyclePowerTabIndex(3, 0, -1)).toBe(2);
    expect(cyclePowerTabIndex(3, 1, -1)).toBe(0);
  });
});

describe("currentPowerTabIndex", () => {
  it("selects draft / home / chat correctly", () => {
    const targets = buildPowerTabTargets({
      powerModeActive: true,
      hasHomeTab: true,
      draftTabActive: true,
      chats: [chatA, chatB],
    });
    expect(
      currentPowerTabIndex(targets, {
        draftTabActive: true,
        homePageActive: false,
        selectedChatId: "a",
      }),
    ).toBe(targets.findIndex((t) => t.kind === "draft"));
    expect(
      currentPowerTabIndex(targets, {
        draftTabActive: false,
        homePageActive: true,
        selectedChatId: null,
      }),
    ).toBe(targets.findIndex((t) => t.kind === "home"));
    expect(
      currentPowerTabIndex(targets, {
        draftTabActive: false,
        homePageActive: false,
        selectedChatId: "b",
      }),
    ).toBe(targets.findIndex((t) => t.kind === "chat" && t.chat.id === "b"));
  });
});
