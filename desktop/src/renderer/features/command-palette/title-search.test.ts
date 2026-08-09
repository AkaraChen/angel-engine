import { describe, expect, it } from "vitest";

import { createTitleSearch } from "./title-search";

describe("createTitleSearch", () => {
  const items = [
    { id: "session-1", title: "Fix command palette" },
    { id: "hidden-match", title: "Unrelated session" },
  ];

  it("fuzzy matches titles", () => {
    const search = createTitleSearch(items);

    expect(search("comand palete")).toEqual([items[0]]);
  });

  it("does not match other item fields", () => {
    const search = createTitleSearch(items);

    expect(search("hidden-match")).toEqual([]);
  });

  it("returns registered items in order when the query is empty", () => {
    const search = createTitleSearch(items);

    expect(search("  ")).toEqual(items);
  });
});
