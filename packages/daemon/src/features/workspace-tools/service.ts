import type { Dirent } from "node:fs";
import type {
  WorkspaceFileReadResult,
  WorkspaceFileTreeResult,
  WorkspaceFileWriteResult,
  WorkspaceGitBranchStatus,
  WorkspaceGitDiffBaseKind,
  WorkspaceGitDiffBaseOption,
  WorkspaceGitDiffResult,
  WorkspaceGitResolvedBase,
  WorkspaceToolGitCommitResult,
  WorkspaceToolGitPushResult,
  WorkspaceToolGitStatusEntry,
} from "@angel-engine/daemon-api/workspace-tools";

import fs from "node:fs/promises";
import path from "node:path";
import is from "@sindresorhus/is";
import { Effect } from "effect";
import { DaemonError } from "../../platform/errors";
import {
  buildUntrackedPatch,
  gitOutput,
  higherPriorityStatus,
  isProbablyBinary,
  joinPatches,
  mergeGitNumstatEntries,
  parseAheadBehindCounts,
  parseGitNumstatOutput,
  parseGitStatusOutput,
} from "./git";
import {
  absolutePathToTreePath,
  isMissingPathError,
  normalizeGitPath,
  pathIsInside,
  resolveWorkspaceTreePath,
  toTreePath,
  uniqueWorkspaceGitPaths,
} from "./paths";

const MAX_TREE_ENTRIES = 12_000;
const MAX_FILE_PREVIEW_BYTES = 512 * 1024;
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

export function workspaceFileTree(
  rootInput: string,
): Effect.Effect<WorkspaceFileTreeResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const scan = yield* Effect.promise(() => scanWorkspaceTree(root));
    const gitRoot = yield* gitRootFor(root);
    const gitStatus = is.nonEmptyString(gitRoot)
      ? yield* gitStatusEntries({ gitRoot, root }).pipe(
          Effect.orElseSucceed((): WorkspaceToolGitStatusEntry[] => []),
        )
      : [];

    return {
      gitStatus,
      paths: scan.paths,
      root,
      truncated: scan.truncated,
    };
  });
}

export function workspaceGitDiff(input: {
  baseKind?: string;
  baseRef?: string;
  chatId?: string;
  root: string;
}): Effect.Effect<WorkspaceGitDiffResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(input.root);
    const requestedBaseKind = parseWorkspaceGitDiffBaseKind(input.baseKind);
    const gitRoot = yield* gitRootFor(root);
    if (!is.nonEmptyString(gitRoot)) {
      return {
        availableBases: unavailableBaseOptions(requestedBaseKind),
        branchStatus: {
          ahead: 0,
          behind: 0,
          detached: false,
          unborn: false,
        },
        conflictedPaths: [],
        isGitRepository: false,
        numstat: [],
        patch: "",
        requestedBaseKind,
        resolvedBase: {
          available: false,
          kind: requestedBaseKind,
          unavailableReason: { code: "not-a-repository" },
        },
        root,
        skippedFiles: [],
        stagedPatch: "",
        status: [],
        unstagedPatch: "",
        warnings: [],
      };
    }

    const [branchStatus, status, stagedPatch, unstagedTrackedPatch, head] =
      yield* Effect.all(
        [
          gitBranchStatus(gitRoot),
          gitStatusEntries({ gitRoot, root }),
          workspaceGitOutput(gitRoot, [
            "diff",
            "--cached",
            "--patch",
            "--find-renames",
            "--no-ext-diff",
            "--no-color",
          ]),
          workspaceGitOutput(gitRoot, [
            "diff",
            "--patch",
            "--find-renames",
            "--no-ext-diff",
            "--no-color",
          ]),
          resolveCommit(gitRoot, "HEAD"),
        ],
        { concurrency: "unbounded" },
      );
    const untrackedResult = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.gitFailed(cause),
      try: () => buildUntrackedPatch(root, status),
    });
    const unstagedPatch = joinPatches(
      unstagedTrackedPatch,
      untrackedResult.patch,
    );
    const worktreeBase = resolvedBase("worktree", head);
    const unstagedBase: WorkspaceGitResolvedBase = {
      available: true,
      kind: "unstaged",
      ref: "index",
    };
    const branchBase = yield* resolveBranchBase(gitRoot, input.baseRef);
    const unavailableSession: WorkspaceGitResolvedBase = {
      available: false,
      kind: "session",
      unavailableReason: {
        anchorKind: "session",
        code: "anchor-unavailable",
      },
    };
    const unavailableTurn: WorkspaceGitResolvedBase = {
      available: false,
      kind: "turn",
      unavailableReason: { anchorKind: "turn", code: "anchor-unavailable" },
    };
    const bases = [
      worktreeBase,
      unstagedBase,
      branchBase,
      unavailableSession,
      unavailableTurn,
    ];
    const requestedBase = bases.find((base) => base.kind === requestedBaseKind);
    const selectedBase = requestedBase?.available
      ? requestedBase
      : {
          ...worktreeBase,
          unavailableReason: requestedBase?.unavailableReason,
        };
    const basePatch = yield* patchForBase({
      base: selectedBase,
      gitRoot,
      stagedPatch,
      unstagedTrackedPatch,
    });
    const trackedNumstat = yield* numstatForBase({
      base: selectedBase,
      gitRoot,
    });

    return {
      availableBases: bases.map(
        (base): WorkspaceGitDiffBaseOption => ({
          ...base,
          selected: base.kind === requestedBaseKind,
        }),
      ),
      branch: branchStatus.branch,
      branchStatus,
      conflictedPaths: status
        .filter((entry) => entry.conflicted)
        .map((entry) => entry.path),
      isGitRepository: true,
      numstat: mergeGitNumstatEntries(trackedNumstat, untrackedResult.numstat),
      patch: joinPatches(basePatch, untrackedResult.patch),
      requestedBaseKind,
      resolvedBase: selectedBase,
      root,
      skippedFiles: untrackedResult.skippedFiles,
      stagedPatch,
      status,
      unstagedPatch,
      warnings: untrackedResult.warnings,
    };
  });
}

const workspaceGitDiffBaseKinds = new Set<WorkspaceGitDiffBaseKind>([
  "branch",
  "session",
  "turn",
  "unstaged",
  "worktree",
]);

function parseWorkspaceGitDiffBaseKind(
  value?: string,
): WorkspaceGitDiffBaseKind {
  if (!value) return "worktree";
  if (workspaceGitDiffBaseKinds.has(value as WorkspaceGitDiffBaseKind)) {
    return value as WorkspaceGitDiffBaseKind;
  }
  throw DaemonError.invalidRequest(`Unsupported Git diff base: ${value}`);
}

function unavailableBaseOptions(
  selectedKind: WorkspaceGitDiffBaseKind,
): WorkspaceGitDiffBaseOption[] {
  return [...workspaceGitDiffBaseKinds].map((kind) => ({
    available: false,
    kind,
    selected: kind === selectedKind,
    unavailableReason: { code: "not-a-repository" },
  }));
}

interface CommitDetails {
  commitTime: string;
  fullSha: string;
  shortSha: string;
  subject: string;
}

function resolveCommit(gitRoot: string, ref: string) {
  return workspaceGitOutput(gitRoot, [
    "show",
    "--no-patch",
    "--format=%H%x00%h%x00%s%x00%cI",
    ref,
  ]).pipe(
    Effect.map((output): CommitDetails | undefined => {
      const [fullSha, shortSha, subject, commitTime] = output.split("\0");
      return fullSha && shortSha && subject !== undefined && commitTime
        ? { commitTime, fullSha, shortSha, subject }
        : undefined;
    }),
    Effect.orElseSucceed(() => undefined),
  );
}

function resolvedBase(
  kind: WorkspaceGitDiffBaseKind,
  commit: CommitDetails | undefined,
  ref?: string,
): WorkspaceGitResolvedBase {
  return commit
    ? { available: true, kind, ref, ...commit }
    : {
        available: kind === "worktree",
        kind,
        ref,
        unavailableReason:
          kind === "worktree"
            ? undefined
            : { code: "git-ref-unavailable", ref: ref ?? kind },
      };
}

function resolveBranchBase(gitRoot: string, requestedRef?: string) {
  return Effect.gen(function* () {
    const ref = is.nonEmptyString(requestedRef)
      ? requestedRef
      : yield* detectDefaultBranch(gitRoot);
    if (!ref) {
      return {
        available: false,
        kind: "branch",
        unavailableReason: { code: "default-branch-unavailable" },
      } satisfies WorkspaceGitResolvedBase;
    }
    const mergeBase = yield* workspaceGitOutput(gitRoot, [
      "merge-base",
      ref,
      "HEAD",
    ]).pipe(Effect.orElseSucceed(() => ""));
    if (!mergeBase) {
      return {
        available: false,
        kind: "branch",
        ref,
        unavailableReason: { code: "no-merge-base", ref },
      } satisfies WorkspaceGitResolvedBase;
    }
    return resolvedBase(
      "branch",
      yield* resolveCommit(gitRoot, mergeBase),
      ref,
    );
  });
}

function detectDefaultBranch(gitRoot: string) {
  return Effect.gen(function* () {
    const originHead = yield* workspaceGitOutput(gitRoot, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "refs/remotes/origin/HEAD",
    ]).pipe(Effect.orElseSucceed(() => ""));
    if (originHead) return originHead;
    for (const ref of ["main", "master", "origin/main", "origin/master"]) {
      const exists = yield* workspaceGitOutput(gitRoot, [
        "rev-parse",
        "--verify",
        "--quiet",
        `${ref}^{commit}`,
      ]).pipe(Effect.orElseSucceed(() => ""));
      if (exists) return ref;
    }
    return undefined;
  });
}

function patchForBase({
  base,
  gitRoot,
  stagedPatch,
  unstagedTrackedPatch,
}: {
  base: WorkspaceGitResolvedBase;
  gitRoot: string;
  stagedPatch: string;
  unstagedTrackedPatch: string;
}) {
  if (base.kind === "worktree") {
    return Effect.succeed(joinPatches(stagedPatch, unstagedTrackedPatch));
  }
  if (base.kind === "unstaged") return Effect.succeed(unstagedTrackedPatch);
  if (!base.fullSha) return Effect.succeed("");
  return workspaceGitOutput(gitRoot, [
    "diff",
    "--patch",
    "--find-renames",
    "--no-ext-diff",
    "--no-color",
    base.fullSha,
  ]);
}

function numstatForBase({
  base,
  gitRoot,
}: {
  base: WorkspaceGitResolvedBase;
  gitRoot: string;
}) {
  const ref = base.kind === "unstaged" ? undefined : base.fullSha;
  return workspaceGitOutput(gitRoot, [
    "diff",
    "--numstat",
    "-z",
    "--find-renames",
    "--no-ext-diff",
    ...(ref ? [ref] : []),
  ]).pipe(Effect.map(parseGitNumstatOutput));
}

export function workspaceGitPush({
  root: rootInput,
}: {
  root: string;
}): Effect.Effect<WorkspaceToolGitPushResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const gitRoot = yield* gitRootFor(root);
    if (!is.nonEmptyString(gitRoot)) {
      return yield* Effect.fail(DaemonError.workspaceNotGitRepository());
    }

    const branchStatus = yield* gitBranchStatus(gitRoot);
    const branch = branchStatus.branch;
    if (branchStatus.unborn) {
      return yield* Effect.fail(DaemonError.workspaceGitNoCommits());
    }
    if (branchStatus.detached || !is.nonEmptyString(branch)) {
      return yield* Effect.fail(DaemonError.workspaceGitDetachedHead());
    }

    // With an upstream, `git push` already knows where to go; without one the
    // first push has to name the remote and record the tracking branch.
    const remote = is.nonEmptyString(branchStatus.upstream)
      ? upstreamRemote(branchStatus.upstream)
      : yield* defaultPushRemote(gitRoot);
    const pushArgs = is.nonEmptyString(branchStatus.upstream)
      ? ["push"]
      : ["push", "--set-upstream", remote, branch];

    yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspaceGitPushFailed(cause),
      try: () => gitOutput(gitRoot, pushArgs, { network: true }),
    });

    return {
      branchStatus: yield* gitBranchStatus(gitRoot),
      remote,
      root,
    };
  });
}

function upstreamRemote(upstream: string) {
  const [remote] = upstream.split("/");
  return is.nonEmptyString(remote) ? remote : "origin";
}

function defaultPushRemote(
  gitRoot: string,
): Effect.Effect<string, DaemonError> {
  return Effect.gen(function* () {
    const output = yield* workspaceGitOutput(gitRoot, ["remote"]).pipe(
      Effect.orElseSucceed(() => ""),
    );
    const remotes = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const first = remotes.at(0);
    if (first === undefined) {
      return yield* Effect.fail(DaemonError.workspaceGitNoRemote());
    }
    return remotes.includes("origin") ? "origin" : first;
  });
}

function gitBranchStatus(
  gitRoot: string,
): Effect.Effect<WorkspaceGitBranchStatus, never> {
  return Effect.gen(function* () {
    const [branch, head] = yield* Effect.all(
      [
        workspaceGitOutput(gitRoot, ["branch", "--show-current"]).pipe(
          Effect.orElseSucceed(() => ""),
        ),
        // Reports the literal "HEAD" while detached, and fails on an unborn
        // branch -- which is a fresh repository, not a detached checkout.
        workspaceGitOutput(gitRoot, ["rev-parse", "--abbrev-ref", "HEAD"]).pipe(
          Effect.orElseSucceed(() => ""),
        ),
      ],
      { concurrency: "unbounded" },
    );
    const unborn = !is.nonEmptyString(head) && is.nonEmptyString(branch);
    if (!is.nonEmptyString(branch)) {
      return {
        ahead: 0,
        behind: 0,
        detached: head === "HEAD",
        unborn: false,
      };
    }
    if (unborn) {
      return { ahead: 0, behind: 0, branch, detached: false, unborn: true };
    }

    const upstream = yield* workspaceGitOutput(gitRoot, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]).pipe(Effect.orElseSucceed(() => ""));
    if (!is.nonEmptyString(upstream)) {
      return { ahead: 0, behind: 0, branch, detached: false, unborn: false };
    }

    const counts = yield* workspaceGitOutput(gitRoot, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{upstream}",
    ]).pipe(Effect.orElseSucceed(() => ""));

    return {
      ...parseAheadBehindCounts(counts),
      branch,
      detached: false,
      unborn: false,
      upstream,
    };
  });
}

export function workspaceGitCommit({
  description,
  paths: pathInputs,
  root: rootInput,
  summary,
}: {
  description?: string;
  paths: string[];
  root: string;
  summary: string;
}): Effect.Effect<WorkspaceToolGitCommitResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const gitRoot = yield* gitRootFor(root);
    if (!is.nonEmptyString(gitRoot)) {
      return yield* Effect.fail(DaemonError.workspaceNotGitRepository());
    }

    const trimmedSummary = summary.trim();
    if (!is.nonEmptyString(trimmedSummary)) {
      return yield* Effect.fail(
        DaemonError.workspaceCommitInputInvalid("Commit summary is required."),
      );
    }

    const paths = uniqueWorkspaceGitPaths(root, pathInputs);
    if (paths.length === 0) {
      return yield* Effect.fail(
        DaemonError.workspaceCommitInputInvalid(
          "Select at least one file to commit.",
        ),
      );
    }

    yield* workspaceGitOutput(root, ["add", "--", ...paths]);

    const commitArgs = ["commit", "-m", trimmedSummary];
    const trimmedDescription = description?.trim();
    if (is.nonEmptyString(trimmedDescription)) {
      commitArgs.push("-m", trimmedDescription);
    }
    commitArgs.push("--only", "--", ...paths);

    yield* workspaceGitOutput(root, commitArgs);
    const commitHash = yield* workspaceGitOutput(root, [
      "rev-parse",
      "--short",
      "HEAD",
    ]);

    return {
      commitHash,
      root,
    };
  });
}

export function workspaceReadFile(
  rootInput: string,
  treePathInput: string,
): Effect.Effect<WorkspaceFileReadResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const absolutePath = yield* Effect.try({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: () => resolveWorkspaceTreePath(root, treePathInput),
    });
    const treePath = absolutePathToTreePath(root, absolutePath);
    if (!is.nonEmptyString(treePath)) {
      return yield* Effect.fail(
        DaemonError.workspacePathInvalid(
          "Workspace file path must stay inside the workspace root.",
        ),
      );
    }

    const [realRoot, realPath] = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: () => Promise.all([fs.realpath(root), fs.realpath(absolutePath)]),
    });
    if (!pathIsInside(realRoot, realPath)) {
      return yield* Effect.fail(
        DaemonError.workspacePathInvalid(
          "Workspace file path must stay inside the workspace root.",
        ),
      );
    }

    return yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: async (): Promise<WorkspaceFileReadResult> => {
        const stat = await fs.stat(realPath);

        if (!stat.isFile()) {
          return {
            path: treePath,
            reason: "not-file",
            root,
            size: stat.size,
            type: "unsupported",
          };
        }

        if (stat.size > MAX_FILE_PREVIEW_BYTES) {
          return {
            path: treePath,
            reason: "too-large",
            root,
            size: stat.size,
            type: "unsupported",
          };
        }

        const buffer = await fs.readFile(realPath);
        if (isProbablyBinary(buffer)) {
          return {
            path: treePath,
            reason: "binary",
            root,
            size: stat.size,
            type: "unsupported",
          };
        }

        return {
          content: buffer.toString("utf8"),
          path: treePath,
          root,
          size: stat.size,
          type: "text",
        };
      },
    });
  });
}

export function workspaceWriteFile(
  rootInput: string,
  treePathInput: string,
  content: string,
): Effect.Effect<WorkspaceFileWriteResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const { absolutePath, treePath } = yield* Effect.try({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: () => {
        const normalizedTreePath = normalizeGitPath(treePathInput);
        return {
          absolutePath: resolveWorkspaceTreePath(root, normalizedTreePath),
          treePath: normalizedTreePath,
        };
      },
    });
    const { realPath, realRoot } = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: async () => {
        const resolvedRoot = await fs.realpath(root);
        let resolvedPath: string;
        try {
          resolvedPath = await fs.realpath(absolutePath);
        } catch {
          resolvedPath = await realpathNearestExistingParent(absolutePath);
        }
        return { realPath: resolvedPath, realRoot: resolvedRoot };
      },
    });

    if (!pathIsInside(realRoot, realPath)) {
      return yield* Effect.fail(
        DaemonError.workspacePathInvalid(
          "Workspace file path must stay inside the workspace root.",
        ),
      );
    }

    yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: async () => {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, content, "utf8");
      },
    });

    return {
      path: treePath,
      root,
      size: Buffer.byteLength(content, "utf8"),
    };
  });
}

async function realpathNearestExistingParent(absolutePath: string) {
  let directory = path.dirname(absolutePath);

  while (true) {
    try {
      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) {
        throw new Error("Workspace file parent must be a directory.");
      }
      return await fs.realpath(directory);
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Workspace file parent must exist.");
    }
    directory = parent;
  }
}

function resolveWorkspaceRoot(
  rootInput: string,
): Effect.Effect<string, DaemonError> {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
    try: async () => {
      const root = path.resolve(rootInput);
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) {
        throw new Error("Workspace root must be a directory.");
      }
      return root;
    },
  });
}

async function scanWorkspaceTree(root: string) {
  const paths: string[] = [];
  const dirs = [root];
  let visited = 0;
  let truncated = false;

  while (dirs.length > 0) {
    const dir = dirs.shift();
    if (!is.nonEmptyString(dir)) break;

    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    for (const entry of entries) {
      if (visited >= MAX_TREE_ENTRIES) {
        truncated = true;
        break;
      }
      visited += 1;

      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        paths.push(toTreePath(root, absolutePath, true));
        dirs.push(absolutePath);
        continue;
      }

      if (!entry.isFile() && !entry.isSymbolicLink()) {
        continue;
      }
      paths.push(toTreePath(root, absolutePath, false));
    }

    if (truncated) break;
  }

  return { paths, truncated };
}

function workspaceGitOutput(
  cwd: string,
  args: string[],
): Effect.Effect<string, DaemonError> {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.gitFailed(cause),
    try: () => gitOutput(cwd, args),
  });
}

function gitRootFor(root: string): Effect.Effect<string | null, never> {
  return workspaceGitOutput(root, ["rev-parse", "--show-toplevel"]).pipe(
    Effect.orElseSucceed(() => null),
  );
}

function gitStatusEntries({
  gitRoot,
  root,
}: {
  gitRoot: string;
  root: string;
}): Effect.Effect<WorkspaceToolGitStatusEntry[], DaemonError> {
  return Effect.gen(function* () {
    const output = yield* workspaceGitOutput(gitRoot, [
      "status",
      "--porcelain=v1",
      "--ignored=matching",
      "--untracked-files=all",
      "-z",
    ]);
    const entries = parseGitStatusOutput(output);
    const realRoot = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: () => fs.realpath(root),
    });
    const byPath = new Map<string, WorkspaceToolGitStatusEntry>();

    for (const entry of entries) {
      const absolutePath = path.resolve(gitRoot, entry.path);
      const treePath = absolutePathToTreePath(realRoot, absolutePath);
      if (!is.nonEmptyString(treePath)) continue;

      const current = byPath.get(treePath);
      if (!current) {
        byPath.set(treePath, { ...entry, path: treePath });
        continue;
      }

      byPath.set(treePath, {
        conflicted: current.conflicted || entry.conflicted,
        path: treePath,
        staged: current.staged || entry.staged,
        status: higherPriorityStatus(current.status, entry.status),
        unstaged: current.unstaged || entry.unstaged,
      });
    }

    return [...byPath.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  });
}

function causeMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
