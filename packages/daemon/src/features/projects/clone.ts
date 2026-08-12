import type {
  Project,
  ProjectCloneInput,
  ProjectCloneProgressEvent,
} from "@angel-engine/daemon-api/projects";
import type { RepositoryIdentity } from "@angel-engine/daemon-api/source-control";
import type { Db } from "../../platform/db";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import is from "@sindresorhus/is";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import { createSourceControlRegistry } from "../source-control/providers";
import type { SourceControlRegistry } from "../source-control/registry/registry";
import { createProject, listProjects } from "./repository";

const execFileAsync = promisify(execFile);
const GIT_REMOTE_TIMEOUT_MS = 10_000;
const OWNER_REPO_SHORTHAND = /^[\w.-]+\/[\w.-]+$/;

export interface ProjectCloneResult {
  project: Project;
  reusedExistingCheckout: boolean;
}

interface CloneSource {
  /** What we hand to the generic git fallback. */
  cloneUrl: string;
  namespace: string[];
  repository: RepositoryIdentity | null;
  repo: string;
}

interface RemoteLocation {
  host: string;
  namespace: string[];
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
  signal?: AbortSignal,
  registry: SourceControlRegistry = createSourceControlRegistry(),
): Effect.Effect<ProjectCloneResult, DaemonError, Db> {
  return Effect.gen(function* () {
    yield* rejectIfAborted(signal);
    const source = yield* parseCloneSource(input.url, registry);
    const cloneRoot = projectCloneRoot();
    const targetPath = path.resolve(
      cloneRoot,
      ...source.namespace,
      source.repo,
    );
    yield* assertManagedTarget(cloneRoot, targetPath);
    const emit = (
      event: Omit<ProjectCloneProgressEvent, "targetPath" | "type">,
    ) => {
      onProgress({ ...event, targetPath, type: "progress" });
    };

    emit({ detail: source.cloneUrl, percent: 0, stage: "preparing" });
    const existing = yield* inspectTarget(targetPath, source.cloneUrl, signal);
    emit({ detail: null, percent: 100, stage: "preparing" });

    if (!existing.reusable) {
      emit({ detail: null, percent: 0, stage: "cloning" });
      yield* runClone(
        source,
        cloneRoot,
        targetPath,
        signal,
        registry,
        (detail, percent) => {
          emit({ detail, percent, stage: "cloning" });
        },
      );
    }
    emit({ detail: null, percent: 100, stage: "cloning" });

    yield* rejectIfAborted(signal);
    emit({ detail: null, percent: 0, stage: "registering" });
    const project = yield* registerProject(targetPath);
    emit({ detail: null, percent: 100, stage: "registering" });
    emit({ detail: null, percent: 100, stage: "completed" });

    return { project, reusedExistingCheckout: existing.reusable };
  });
}

function rejectIfAborted(
  signal: AbortSignal | undefined,
): Effect.Effect<void, DaemonError> {
  return Effect.try({
    catch: (cause) => DaemonError.gitFailed(cause, "Clone was cancelled."),
    try: () => {
      signal?.throwIfAborted();
    },
  });
}

function parseCloneSource(
  rawUrl: string,
  registry: SourceControlRegistry,
): Effect.Effect<CloneSource, DaemonError> {
  const url = rawUrl.trim();
  if (!is.nonEmptyString(url)) {
    return Effect.fail(DaemonError.invalidRequest("Repository URL is empty."));
  }

  if (OWNER_REPO_SHORTHAND.test(url)) {
    const resolution = registry.parseRepositoryUrl(url);
    if (resolution.status === "ambiguous") {
      return Effect.fail(
        DaemonError.invalidRequest(
          "The repository matches multiple source-control providers.",
        ),
      );
    }
    if (resolution.status === "resolved") {
      const repository = resolution.repository;
      return Effect.succeed({
        cloneUrl: repository.webUrl ?? url,
        namespace: [...repository.namespace],
        repository: resolution.cloneSupported ? repository : null,
        repo: repository.name,
      });
    }
  }

  const providerResolution = registry.parseRepositoryUrl(url);
  if (providerResolution.status === "ambiguous") {
    return Effect.fail(
      DaemonError.invalidRequest(
        "The repository matches multiple source-control providers.",
      ),
    );
  }
  if (providerResolution.status === "resolved") {
    const repository = providerResolution.repository;
    return Effect.succeed({
      cloneUrl: url,
      namespace: [...repository.namespace],
      repository: providerResolution.cloneSupported ? repository : null,
      repo: repository.name,
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

  return Effect.succeed({
    cloneUrl: url,
    namespace: location.namespace,
    repository: null,
    repo: location.repo,
  });
}

function parseRemoteLocation(url: string): RemoteLocation | null {
  // `git@host:owner/repo.git` is not a URL the WHATWG parser accepts.
  const scpMatch = /^[\w.-]+@([\w.-]+):(.+)$/.exec(url);
  const [host, pathname] = scpMatch
    ? [scpMatch[1], scpMatch[2]]
    : parseStandardUrl(url);
  if (!is.nonEmptyString(host) || !is.nonEmptyString(pathname)) return null;

  const segments = decodePathSegments(pathname);
  const rawRepo = segments?.at(-1);
  if (!is.nonEmptyString(rawRepo)) return null;
  const repo = stripGitSuffix(rawRepo);
  const namespace = segments?.slice(0, -1) ?? [];
  if (
    !isSafePathSegment(repo) ||
    !namespace.every((segment) => isSafePathSegment(segment))
  )
    return null;

  return {
    host: host.toLowerCase(),
    namespace,
    repo,
  };
}

function parseStandardUrl(url: string): [string | null, string | null] {
  try {
    const parsed = new URL(url);
    if (!["file:", "git:", "http:", "https:", "ssh:"].includes(parsed.protocol))
      return [null, null];
    // `file:` URLs carry no host; they still name one unambiguous local remote.
    return [
      parsed.protocol === "file:" ? "localhost" : parsed.host,
      parsed.pathname,
    ];
  } catch {
    return [null, null];
  }
}

function stripGitSuffix(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function decodePathSegments(pathname: string): string[] | null {
  try {
    return pathname
      .split("/")
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

function isSafePathSegment(value: string): boolean {
  return (
    is.nonEmptyString(value) &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0")
  );
}

function assertManagedTarget(
  cloneRoot: string,
  targetPath: string,
): Effect.Effect<void, DaemonError> {
  return Effect.try({
    catch: () =>
      DaemonError.projectPathInvalid(
        "The repository destination is outside or redirects outside the managed clone directory.",
      ),
    try: () => {
      const root = path.resolve(cloneRoot);
      const relative = path.relative(root, targetPath);
      if (
        relative.length === 0 ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error("Clone target escaped the managed root.");
      }

      let current = root;
      for (const segment of relative.split(path.sep)) {
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
          throw new Error(`${current} is a symbolic link.`);
        }
        current = path.join(current, segment);
      }
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
        throw new Error(`${current} is a symbolic link.`);
      }
    },
  });
}

/**
 * Decide whether the destination can be cloned into, adopted, or neither.
 * Adopting requires an existing checkout whose `origin` is the same remote.
 */
function inspectTarget(
  targetPath: string,
  cloneUrl: string,
  signal: AbortSignal | undefined,
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

    const checkout = yield* Effect.tryPromise({
      catch: () => DaemonError.projectPathInvalid(occupiedMessage(targetPath)),
      try: async () => {
        const [topLevel, origin] = await Promise.all([
          execFileAsync("git", ["rev-parse", "--show-toplevel"], {
            cwd: targetPath,
            signal,
            timeout: GIT_REMOTE_TIMEOUT_MS,
          }),
          execFileAsync("git", ["remote", "get-url", "origin"], {
            cwd: targetPath,
            signal,
            timeout: GIT_REMOTE_TIMEOUT_MS,
          }),
        ]);
        return {
          origin: origin.stdout.toString().trim(),
          topLevel: topLevel.stdout.toString().trim(),
        };
      },
    });

    if (fs.realpathSync(checkout.topLevel) !== fs.realpathSync(targetPath)) {
      return yield* Effect.fail(
        DaemonError.projectPathInvalid(occupiedMessage(targetPath)),
      );
    }

    if (!sameRemote(checkout.origin, cloneUrl)) {
      return yield* Effect.fail(
        DaemonError.projectPathInvalid(
          `${targetPath} already holds a checkout of ${checkout.origin}.`,
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
    const remotePath = [...location.namespace, location.repo].join("/");
    return `${location.host}/${remotePath}`;
  };
  return normalize(left) === normalize(right);
}

function runClone(
  source: CloneSource,
  cloneRoot: string,
  targetPath: string,
  signal: AbortSignal | undefined,
  registry: SourceControlRegistry,
  onProgress: (detail: string, percent: number | null) => void,
): Effect.Effect<void, DaemonError> {
  return Effect.gen(function* () {
    yield* assertManagedTarget(cloneRoot, targetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    yield* Effect.tryPromise({
      catch: (cause) =>
        DaemonError.gitFailed(cause, "Could not clone the repository."),
      try: async () => {
        if (source.repository !== null) {
          onProgress(source.repository.displayPath, null);
          await registry.cloneRepository({
            repository: source.repository,
            signal,
            targetPath,
          });
          return;
        }
        await spawnClone(
          "git",
          ["clone", "--progress", source.cloneUrl, targetPath],
          signal,
          onProgress,
        );
      },
    });
  });
}

function spawnClone(
  command: string,
  args: string[],
  signal: AbortSignal | undefined,
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
      signal,
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
