import Fuse from "fuse.js";

export interface TitledCommandPaletteItem {
  title: string;
}

const TITLE_SEARCH_OPTIONS = {
  ignoreLocation: true,
  keys: ["title"],
  threshold: 0.35,
};

export function createTitleSearch<T extends TitledCommandPaletteItem>(
  items: T[],
) {
  const index = new Fuse(items, TITLE_SEARCH_OPTIONS);

  return (query: string, limit = 20): T[] => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) return items.slice(0, limit);

    return index
      .search(normalizedQuery, { limit })
      .map((result) => result.item);
  };
}
