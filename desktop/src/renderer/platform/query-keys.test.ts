import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { queryKeys } from "@/platform/query-keys";

describe("workspace git diff query keys", () => {
  it("invalidates every base and chat variant for one root", async () => {
    const queryClient = new QueryClient();
    const root = "/workspaces/angel";
    const rootVariants = [
      queryKeys.workspaceTools.gitDiff(root),
      queryKeys.workspaceTools.gitDiff(root, "branch", "main", null),
      queryKeys.workspaceTools.gitDiff(root, "session", null, "chat-1"),
      queryKeys.workspaceTools.gitDiff(root, "turn", null, "chat-1"),
    ];
    const otherRoot = queryKeys.workspaceTools.gitDiff(
      "/workspaces/other",
      "branch",
      "main",
      null,
    );
    for (const key of [...rootVariants, otherRoot]) {
      queryClient.setQueryData(key, { patch: "cached" });
    }

    await queryClient.invalidateQueries({
      queryKey: queryKeys.workspaceTools.gitDiffRoot(root),
    });

    for (const key of rootVariants) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(queryClient.getQueryState(otherRoot)?.isInvalidated).toBe(false);
  });
});
