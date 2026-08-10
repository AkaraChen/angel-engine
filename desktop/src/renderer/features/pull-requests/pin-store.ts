const STORAGE_KEY = "angel-engine.pr-pins";

type PinMap = Record<string, number[]>;

const memoryStore = new Map<string, string>();

function storage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  try {
    const local =
      typeof globalThis !== "undefined"
        ? (globalThis as { localStorage?: Storage }).localStorage
        : undefined;
    if (local && typeof local.getItem === "function") {
      return local;
    }
  } catch {
    // jsdom/node without storage
  }
  return {
    getItem: (key) => memoryStore.get(key) ?? null,
    setItem: (key, value) => {
      memoryStore.set(key, value);
    },
  };
}

function projectKey(projectId: string) {
  return projectId;
}

function readMap(): PinMap {
  try {
    const raw = storage().getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return parsed as PinMap;
  } catch {
    return {};
  }
}

function writeMap(map: PinMap) {
  storage().setItem(STORAGE_KEY, JSON.stringify(map));
}

export function listPinnedPullRequests(projectId: string): number[] {
  const list = readMap()[projectKey(projectId)] ?? [];
  return [...list];
}

export function isPullRequestPinned(projectId: string, number: number) {
  return listPinnedPullRequests(projectId).includes(number);
}

export function setPullRequestPinned(
  projectId: string,
  number: number,
  pinned: boolean,
) {
  const map = readMap();
  const key = projectKey(projectId);
  const current = new Set(map[key] ?? []);
  if (pinned) current.add(number);
  else current.delete(number);
  map[key] = [...current].sort((left, right) => left - right);
  writeMap(map);
  return map[key];
}

/** Test helper: wipe pins without requiring a browser storage API. */
export function clearPinnedPullRequestsForTests() {
  memoryStore.clear();
  try {
    const local =
      typeof globalThis !== "undefined"
        ? (globalThis as { localStorage?: Storage }).localStorage
        : undefined;
    local?.removeItem?.(STORAGE_KEY);
  } catch {
    // ignore
  }
}
