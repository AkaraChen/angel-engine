import fs from "node:fs";
import path from "node:path";
import is from "@sindresorhus/is";
import { Effect } from "effect";

import { DaemonError } from "../../../platform/errors";

function normalizeText(value: string) {
  return value
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim();
}

/**
 * GitHub-documented locations for pull request templates, checked in order.
 * @see https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository
 */
const SINGLE_TEMPLATE_RELATIVE_PATHS = [
  path.join(".github", "PULL_REQUEST_TEMPLATE.md"),
  path.join(".github", "pull_request_template.md"),
  "PULL_REQUEST_TEMPLATE.md",
  "pull_request_template.md",
  path.join("docs", "PULL_REQUEST_TEMPLATE.md"),
  path.join("docs", "pull_request_template.md"),
] as const;

const TEMPLATE_DIRECTORIES = [
  path.join(".github", "PULL_REQUEST_TEMPLATE"),
  path.join(".github", "pull_request_template"),
  path.join("docs", "PULL_REQUEST_TEMPLATE"),
  path.join("docs", "pull_request_template"),
] as const;

export interface ChangeRequestTemplate {
  body: string;
  name: string;
  path: string | null;
  relativePath: string | null;
}

export interface ChangeRequestTemplateResult {
  body: string;
  templates: ChangeRequestTemplate[];
}

/**
 * Discover repository PR templates under `cwd`. Pure filesystem — no `gh` call.
 * When multiple templates exist (template folder), all are returned; the first
 * single-file match or first directory entry becomes the preferred `body`.
 */
export function discoverPullRequestTemplates(input: {
  cwd: string;
}): Effect.Effect<ChangeRequestTemplateResult, DaemonError> {
  return Effect.try({
    catch: (cause) =>
      DaemonError.sourceControlFetchFailed(
        cause,
        "Could not read pull request templates.",
      ),
    try: () => {
      const root = path.resolve(input.cwd);
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        return emptyTemplateResult();
      }

      const templates: ChangeRequestTemplate[] = [];

      for (const relative of SINGLE_TEMPLATE_RELATIVE_PATHS) {
        const absolute = path.join(root, relative);
        const template = readTemplateFile(absolute, relative);
        if (template) templates.push(template);
      }

      for (const relativeDir of TEMPLATE_DIRECTORIES) {
        const absoluteDir = path.join(root, relativeDir);
        if (
          !fs.existsSync(absoluteDir) ||
          !fs.statSync(absoluteDir).isDirectory()
        ) {
          continue;
        }
        const entries = fs
          .readdirSync(absoluteDir, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isFile() &&
              (entry.name.endsWith(".md") || entry.name.endsWith(".txt")),
          )
          .map((entry) => entry.name)
          .sort((left, right) => left.localeCompare(right));

        for (const name of entries) {
          const relative = path.join(relativeDir, name);
          const absolute = path.join(absoluteDir, name);
          const template = readTemplateFile(absolute, relative);
          if (template) templates.push(template);
        }
      }

      const unique = dedupeByPath(templates);
      return {
        body: unique[0]?.body ?? "",
        templates: unique,
      };
    },
  });
}

function readTemplateFile(
  absolute: string,
  relative: string,
): ChangeRequestTemplate | null {
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return null;
  }
  const raw = fs.readFileSync(absolute, "utf8");
  const body = normalizeText(raw);
  const baseName = path.basename(relative, path.extname(relative));
  return {
    body,
    name: baseName,
    path: absolute,
    relativePath: relative.split(path.sep).join("/"),
  };
}

function dedupeByPath(
  templates: ChangeRequestTemplate[],
): ChangeRequestTemplate[] {
  const seen = new Set<string>();
  const result: ChangeRequestTemplate[] = [];
  for (const template of templates) {
    // macOS/Windows default to case-insensitive filesystems; normalize so
    // PULL_REQUEST_TEMPLATE and pull_request_template collapse to one entry.
    const key = (
      is.nonEmptyString(template.path)
        ? path.resolve(template.path)
        : (template.relativePath ?? template.name)
    ).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(template);
  }
  return result;
}

function emptyTemplateResult(): ChangeRequestTemplateResult {
  return { body: "", templates: [] };
}
