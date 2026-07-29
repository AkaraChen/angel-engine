import { describe, expect, it } from "vitest";

import {
  feedChannelForUpdateChannel,
  parseUpdateChannel,
  readUpdateChannelFromConfig,
} from "./update-channel";

describe("feedChannelForUpdateChannel", () => {
  it("keeps stable clients on the electron-builder default channel", () => {
    expect(feedChannelForUpdateChannel("stable")).toBe("latest");
  });

  it("points beta clients at the beta channel files", () => {
    expect(feedChannelForUpdateChannel("beta")).toBe("beta");
  });
});

describe("parseUpdateChannel", () => {
  it("accepts beta", () => {
    expect(parseUpdateChannel("beta")).toBe("beta");
  });

  it.each([
    undefined,
    null,
    "",
    "stable",
    "latest",
    1,
    {},
  ])("falls back to stable for %j", (value) => {
    expect(parseUpdateChannel(value)).toBe("stable");
  });
});

describe("readUpdateChannelFromConfig", () => {
  it("reads the persisted channel", () => {
    expect(readUpdateChannelFromConfig({ channel: "beta" })).toBe("beta");
  });

  it.each([
    undefined,
    null,
    "beta",
    { channel: "nope" },
    {},
  ])("falls back to stable for %j", (value) => {
    expect(readUpdateChannelFromConfig(value)).toBe("stable");
  });
});
