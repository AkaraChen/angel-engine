import { describe, expect, it } from "vitest";
import { developmentUserDataPath } from "./user-data";

describe("developmentUserDataPath", () => {
  it("isolates development state from the packaged application", () => {
    expect(
      developmentUserDataPath(
        "/Users/test/Library/Application Support/Angel Engine",
      ),
    ).toBe("/Users/test/Library/Application Support/Angel Engine Dev");
  });

  it("does not append the development suffix twice", () => {
    expect(
      developmentUserDataPath(
        "/Users/test/Library/Application Support/Angel Engine Dev",
      ),
    ).toBe("/Users/test/Library/Application Support/Angel Engine Dev");
  });
});
