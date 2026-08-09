import { describe, expect, it } from "vitest";

import { commandRegistry } from "./registry";

function ensureTestCommand(id: string) {
  commandRegistry.describe([
    {
      id,
      titleKey: "test",
      categoryKey: "test",
      bindable: true,
      handlerScope: "app",
      invocableFromMain: false,
    },
  ]);
}

describe("commandRegistry handler stack", () => {
  it("nests registrations and restores the previous handler on dispose", () => {
    const id = "test.stack.command";
    ensureTestCommand(id);
    const calls: string[] = [];

    const disposeOuter = commandRegistry.register(id, () => {
      calls.push("outer");
      return true;
    });
    const disposeInner = commandRegistry.register(id, () => {
      calls.push("inner");
      return true;
    });

    expect(commandRegistry.tryExecute(id, undefined, {})).toBe("accepted");
    expect(calls).toEqual(["inner"]);

    disposeInner();
    calls.length = 0;
    expect(commandRegistry.tryExecute(id, undefined, {})).toBe("accepted");
    expect(calls).toEqual(["outer"]);

    disposeOuter();
    expect(commandRegistry.tryExecute(id, undefined, {})).toBe("missing");
  });

  it("falls through the stack when the top handler returns false (E4)", () => {
    const id = "test.stack.fallback";
    ensureTestCommand(id);
    const calls: string[] = [];

    const disposeOuter = commandRegistry.register(id, () => {
      calls.push("outer");
      return true;
    });
    const disposeInner = commandRegistry.register(id, () => {
      calls.push("inner");
      return false;
    });

    expect(commandRegistry.tryExecute(id, undefined, {})).toBe("accepted");
    expect(calls).toEqual(["inner", "outer"]);

    disposeInner();
    disposeOuter();
  });
});
