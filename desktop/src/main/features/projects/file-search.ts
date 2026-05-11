import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";

import type {
  ProjectFileSearchInput,
  ProjectFileSearchResult,
} from "../../../shared/chat";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_VISITED = 12_000;
const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
]);

export async function searchProjectFiles(
  input: ProjectFileSearchInput,
): Promise<ProjectFileSearchResult[]> {
  const root = path.resolve(input.root);
  const query = input.query?.toLowerCase() ?? "";
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Math.floor(input.limit ?? DEFAULT_LIMIT)),
  );
  const matches: Array<ProjectFileSearchResult & { score: number }> = [];
  const dirs = [root];
  let visited = 0;

  while (dirs.length > 0 && visited < MAX_VISITED) {
    const dir = dirs.shift();
    if (!dir) break;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (visited++ >= MAX_VISITED) break;
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;

      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath);
      if (!relativePath || relativePath.startsWith("..")) continue;

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          dirs.push(absolutePath);
        }
        continue;
      }
      if (!entry.isFile()) continue;

      const score = scorePathMatch(query, relativePath, entry.name);
      if (score <= 0) continue;

      matches.push({
        name: entry.name,
        path: absolutePath,
        relativePath,
        score,
        type: "file",
      });
    }
  }

  return matches
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.relativePath.length - b.relativePath.length ||
        a.relativePath.localeCompare(b.relativePath),
    )
    .slice(0, limit)
    .map(({ score: _score, ...result }) => result);
}

function scorePathMatch(query: string, relativePath: string, name: string) {
  if (!query) {
    return 10 - Math.min(relativePath.split(path.sep).length, 9);
  }

  const normalizedPath = relativePath.toLowerCase();
  const normalizedName = name.toLowerCase();
  if (normalizedName === query) return 100;
  if (normalizedName.startsWith(query)) return 90;
  if (normalizedPath.startsWith(query)) return 80;
  if (normalizedName.includes(query)) return 70;
  if (normalizedPath.includes(query)) return 60;
  return fuzzyScore(query, normalizedPath);
}

function fuzzyScore(query: string, candidate: string) {
  let queryIndex = 0;
  let score = 0;

  for (
    let index = 0;
    index < candidate.length && queryIndex < query.length;
    index += 1
  ) {
    if (candidate[index] !== query[queryIndex]) continue;
    queryIndex += 1;
    score += index === 0 || candidate[index - 1] === "/" ? 6 : 2;
  }

  return queryIndex === query.length ? score : 0;
}
