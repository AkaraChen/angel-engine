// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useKeybindingCommandJump } from "./use-keybinding-command-jump";

const scrollIntoView = vi.fn();

function JumpHarness() {
  const [filter, setFilter] = useState<
    "all" | "conflicts" | "modified" | "unbound"
  >("conflicts");
  const [query, setQuery] = useState("different-command");
  const jumpToCommand = useKeybindingCommandJump({
    filter,
    query,
    setFilter,
    setQuery,
  });
  const targetVisible = filter === "all" && query === "";

  return (
    <>
      <button onClick={() => jumpToCommand("files.save")} type="button">
        Jump
      </button>
      {targetVisible ? (
        <div id="keybinding-files.save">
          <button type="button">Save file shortcut</button>
        </div>
      ) : null}
    </>
  );
}

describe("useKeybindingCommandJump", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("reveals a target hidden by search and filtering before scrolling and focusing", async () => {
    render(<JumpHarness />);

    expect(
      screen.queryByRole("button", { name: "Save file shortcut" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Jump" }));

    const target = await screen.findByRole("button", {
      name: "Save file shortcut",
    });
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "center",
      });
      expect(document.activeElement).toBe(target);
    });
  });
});
