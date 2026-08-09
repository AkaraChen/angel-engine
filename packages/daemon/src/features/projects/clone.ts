import type {
  Project,
  ProjectCloneInput,
  ProjectCloneProgressEvent,
} from "@angel-engine/daemon-api/projects";
import type { Db } from "../../platform/db";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import is from "@sindresorhus/is";
import { Effect } from "effect";
import which from "which";

import { DaemonError } from "../../platform/errors";
import { createProject, listProjects } from "./repository";

const execFileAsync = promisify(execFile);
const GIT_REMOTE_TIMEOUT_MS = 10_000;
const OWNER_REPO_SHORTHAND = /^[\w.-]+\/[\w.-]+$/;

export interface ProjectCloneResult {
  project: Project;
  reusedExistingCheckout: boolean;
}

interface CloneSource {
  /** What we hand to git/gh; already normalized to a clonable remote. */
  cloneUrl: string;
  /** github.com `owner/repo`, set only when gh can clone it with its own auth. */
  gitHubSlug: string | null;
  owner: string | null;
  repo: string;
}

/** Where clones land. One directory per owner keeps same-named repos apart. */
export function projectCloneRoot(): string {
  return path.join(os.homedir(), "angel-engine");
}

/**
 * Clone a remote into the managed clone root and register it as a project.
 *
 * Re-running with the same remote is safe: a checkout that already points at
 * the same origin is adopted instead of cloned again, and a path that is
 * already a project is returned as-is. Any other occupied path fails before
 * git runs so an unrelated directory is never written into.
 */
export function cloneProject(
  input: ProjectCloneInput,
  onProgress: (event: ProjectCloneProgressEvent) => void,
): Effect.Effect<ProjectCloneResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const source = yield* parseCloneSource(input.url);
    const targetPath = path.join(
      projectCloneRoot(),
      source.owner ?? "",
      source.repo,
    );
    const emit = (
      event: Omit<ProjectCloneProgressEvent, "targetPath" | "type">,
    ) => {
      onProgress({ ...event, targetPath, type: "progress" });
    };

    emit({ detail: source.cloneUrl, percent: 0, stage: "preparing" });
    const existing = yield* inspectTarget(targetPath, source.cloneUrl);
    emit({ detail: null, percent: 100, stage: "preparing" });

    if (!existing.reusable) {
      emit({ detail: null, percent: 0, stage: "cloning" });
      yield* runClone(source, targetPath, (detail, percent) => {
        emit({ detail, percent, stage: "cloning" });
      });
    }
    emit({ detail: null, percent: 100, stage: "cloning" });

    emit({ detail: null, percent: 0, stage: "registering" });
    const project = yield* registerProject(targetPath);
    emit({ detail: null, percent: 100, stage: "registering" });
    emit({ detail: null, percent: 100, stage: "completed" });

    return { project, reusedExistingCheckout: existing.reusable };
  });
}

function parseCloneSource(
  rawUrl: string,
): Effect.Effect<CloneSource, DaemonError> {
  const url = rawUrl.trim();
  if (!is.nonEmptyString(url)) {
    return Effect.fail(DaemonError.invalidRequest("Repository URL is empty."));
  }

  if (OWNER_REPO_SHORTHAND.test(url)) {
    const [owner, repo] = url.split("/");
    return Effect.succeed({
      cloneUrl: `https://github.com/${owner}/${stripGitSuffix(repo)}.git`,
      gitHubSlug: `${owner}/${stripGitSuffix(repo)}`,
      owner,
      repo: stripGitSuffix(repo),
    });
  }

  const location = parseRemoteLocation(url);
  if (location === null) {
    return Effect.fail(
      DaemonError.invalidRequest(
        "Enter a git remote URL (https or ssh) or an owner/repo shorthand.",
      ),
    );
  }

  const isGitHub = location.host === "github.com";
  return Effect.succeed({
    cloneUrl: url,
    gitHubSlug:
      isGitHub && is.nonEmptyString(location.owner)
        ? `${location.owner}/${location.repo}`
        : null,
    owner: location.owner,
    repo: location.repo,
  });
}

function parseRemoteLocation(
  url: string,
): { host: string; owner: string | null; repo: string } | null {
  // `git@host:owner/repo.git` is not a URL the WHATWG parser accepts.
  const scpMatch = /^[\w.-]+@([\w.-]+):(.+)$/.exec(url);
  const [host, pathname] = scpMatch
    ? [scpMatch[1], scpMatch[2]]
    : parseStandardUrl(url);
  if (!is.nonEmptyString(host) || !is.nonEmptyString(pathname)) return null;

  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const repo = segments.at(-1);
  if (!is.nonEmptyString(repo)) return null;

  return {
    host,
    owner: segments.length > 1 ? (segments.at(-2) ?? null) : null,
    repo: stripGitSuffix(repo),
  };
}

function parseStandardUrl(url: string): [string | null, string | null] {
  try {
    const parsed = new URL(url);
    if (!["file:", "git:", "http:", "https:", "ssh:"].includes(parsed.protocol))
      return [null, null];
    // `file:` URLs carry no host; they still name one unambiguous local remote.
    return [
      parsed.protocol === "file:" ? "localhost" : parsed.hostname,
      parsed.pathname,
    ];
  } catch {
    return [null, null];
  }
}

function stripGitSuffix(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

/**
 * Decide whether the destination can be cloned into, adopted, or neither.
 * Adopting requires an existing checkout whose `origin` is the same remote.
 */
function inspectTarget(
  targetPath: string,
  cloneUrl: string,
): Effect.Effect<{ reusable: boolean }, DaemonError> {
  return Effect.gen(function* () {
    if (!fs.existsSync(targetPath)) return { reusable: false };

    if (!fs.statSync(targetPath).isDirectory()) {
      return yield* Effect.fail(
        DaemonError.projectPathInvalid(
          `A file already exists at ${targetPath}.`,
        ),
      );
    }

    if (fs.readdirSync(targetPath).length === 0) return { reusable: false };

    const origin = yield* Effect.tryPromise({
      catch: () => DaemonError.projectPathInvalid(occupiedMessage(targetPath)),
      try: async () => {
        const result = await execFileAsync(
          "git",
          ["remote", "get-url", "origin"],
          { cwd: targetPath, timeout: GIT_REMOTE_TIMEOUT_MS },
        );
        return result.stdout.toString().trim();
      },
    });

    if (!sameRemote(origin, cloneUrl)) {
      return yield* Effect.fail(
        DaemonError.projectPathInvalid(
          `${targetPath} already holds a checkout of ${origin}.`,
        ),
      );
    }
    return { reusable: true };
  });
}

function occupiedMessage(targetPath: string): string {
  return `${targetPath} already exists and is not a git checkout. Move or remove it and try again.`;
}

/** Compare remotes ignoring transport, credentials, and the `.git` suffix. */
function sameRemote(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const location = parseRemoteLocation(value);
    if (location === null) return value.toLowerCase();
    return `${location.host}/${location.owner ?? ""}/${location.repo}`.toLowerCase();
  };
  return normalize(left) === normalize(right);
}

function runClone(
  source: CloneSource,
  targetPath: string,
  onProgress: (detail: string, percent: number | null) => void,
): Effect.Effect<void, DaemonError> {
  return Effect.gen(function* () {
    const ghPath = is.nonEmptyString(source.gitHubSlug)
      ? yield* Effect.tryPromise({
          catch: () => DaemonError.gitFailed(undefined),
          try: () => which("gh", { nothrow: true }),
        })
      : null;

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    // `gh repo clone` reuses the CLI's credentials, which is the only way a
    // private repository clones without a preconfigured git credential helper.
    const [command, args] =
      is.nonEmptyString(ghPath) && is.nonEmptyString(source.gitHubSlug)
        ? ([
            "gh",
            [
              "repo",
              "clone",
              source.gitHubSlug,
              targetPath,
              "--",
              "--progress",
            ],
          ] as const)
        : ([
            "git",
            ["clone", "--progress", source.cloneUrl, targetPath],
          ] as const);

    yield* Effect.tryPromise({
      catch: (cause) =>
        DaemonError.gitFailed(cause, "Could not clone the repository."),
      try: () => spawnClone(command, [...args], onProgress),
    });
  });
}

function spawnClone(
  command: string,
  args: string[],
  onProgress: (detail: string, percent: number | null) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        GH_NO_UPDATE_NOTIFIER: "1",
        GH_PROMPT_DISABLED: "1",
        GIT_TERMINAL_PROMPT: "0",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrTail = "";
    let buffer = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrTail = `${stderrTail}${chunk}`.slice(-4000);
      // Git rewrites the progress line with `\r`; `\n` ends a phase.
      buffer += chunk;
      const lines = buffer.split(/[\n\r]/);
      buffer = lines.pop() ?? "";
      for (const line of lines) reportProgressLine(line, onProgress);
    });
    child.stdout.resume();

    child.on("error", reject);
    child.on("close", (code) => {
      reportProgressLine(buffer, onProgress);
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(
        stderrTail.trim() || `${command} exited with code ${code ?? "unknown"}`,
      );
      reject(error);
    });
  });
}

const PROGRESS_LINE = /^(?:remote:\s*)?([A-Za-z][A-Za-z ]+):\s+(\d{1,3})%/;
/**
 * Git reports each phase's own 0-100%. Stretch them over one monotonic bar so
 * the dialog never restarts from zero mid-clone.
 */
const PHASE_RANGES: ReadonlyArray<{
  end: number;
  phase: string;
  start: number;
}> = [
  { end: 10, phase: "counting objects", start: 0 },
  { end: 20, phase: "compressing objects", start: 10 },
  { end: 90, phase: "receiving objects", start: 20 },
  { end: 100, phase: "resolving deltas", start: 90 },
];

function reportProgressLine(
  line: string,
  onProgress: (detail: string, percent: number | null) => void,
): void {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;

  const match = PROGRESS_LINE.exec(trimmed);
  if (match === null) {
    onProgress(trimmed, null);
    return;
  }

  const phase = match[1].trim();
  const phasePercent = Math.min(Number(match[2]), 100);
  const range = PHASE_RANGES.find(
    (candidate) => candidate.phase === phase.toLowerCase(),
  );
  if (range === undefined) {
    onProgress(phase, null);
    return;
  }
  onProgress(
    phase,
    Math.round(range.start + ((range.end - range.start) * phasePercent) / 100),
  );
}

function registerProject(targetPath: string) {
  return Effect.gen(function* () {
    const projects = yield* listProjects();
    const existing = projects.find(
      (project) => path.resolve(project.path) === path.resolve(targetPath),
    );
    if (existing) return existing;
    return yield* createProject({ path: targetPath });
  });
}
