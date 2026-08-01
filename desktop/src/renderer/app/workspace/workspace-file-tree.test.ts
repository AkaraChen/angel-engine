import { describe, expect, it } from "vitest";

import { treeHostStyle } from "@/app/workspace/workspace-file-tree";

describe("treeHostStyle", () => {
  it("grounds the file tree on the card surface, not the cream page", () => {
    // Sidebar tool body, git panel, and process inspector all sit on --card.
    // Painting --background here was the cream strip that made Files look
    // different from Git / Processes.
    expect(treeHostStyle["--trees-bg-override"]).toBe("var(--card)");
  });
});
