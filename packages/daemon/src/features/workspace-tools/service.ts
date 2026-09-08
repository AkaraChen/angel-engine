import type {
  WorkspaceFileReadResult,
  WorkspaceGitBranchStatus,
  WorkspaceGitDiffBaseKind,
  WorkspaceGitDiffBaseOption,
  WorkspaceGitDiffResult,
  WorkspaceGitResolvedBase,
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
} from "../source-control/local-git/workspace";
import {
  absolutePathToTreePath,
  pathIsInside,
  resolveWorkspaceTreePath,
} from "./paths";

const MAX_FILE_PREVIEW_BYTES = 512 * 1024;

export function workspaceGitDiff<R = never>(
  input:
    | string
    | {
        baseKind?: string;
        baseRef?: string;
        chatId?: string;
        root: string;
      },
  anchorResolver: WorkspaceGitAnchorResolver<R> = (() =>
    Effect.succeed(undefined)) as WorkspaceGitAnchorResolver<R>,
): Effect.Effect<WorkspaceGitDiffResult, DaemonError, R> {
  return Effect.gen(function* () {
    const options = typeof input === "string" ? { root: input } : input;
    const root = yield* resolveWorkspaceRoot(options.root);
    const requestedBaseKind = parseWorkspaceGitDiffBaseKind(options.baseKind);
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
    const branchBase = yield* resolveBranchBase(gitRoot, options.baseRef);
    const sessionBase = yield* resolveChatAnchorBase({
      anchorResolver,
      chatId: options.chatId,
      gitRoot,
      kind: "session",
    });
    const turnBase = yield* resolveChatAnchorBase({
      anchorResolver,
      chatId: options.chatId,
      gitRoot,
      kind: "turn",
    });
    const bases = [
      worktreeBase,
      unstagedBase,
      branchBase,
      sessionBase,
      turnBase,
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

export interface WorkspaceGitAnchor {
  ref?: string;
  sha: string;
}

export type WorkspaceGitAnchorResolver<R = never> = (
  chatId: string,
  kind: "session" | "turn",
) => Effect.Effect<WorkspaceGitAnchor | undefined, DaemonError, R>;

export function workspaceGitHeadSha(
  rootInput: string,
): Effect.Effect<string | undefined, never> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const gitRoot = yield* gitRootFor(root);
    if (!gitRoot) return undefined;
    return yield* workspaceGitOutput(gitRoot, ["rev-parse", "HEAD"]);
  }).pipe(Effect.orElseSucceed(() => undefined));
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

function resolveChatAnchorBase<R>({
  anchorResolver,
  chatId,
  gitRoot,
  kind,
}: {
  anchorResolver: WorkspaceGitAnchorResolver<R>;
  chatId?: string;
  gitRoot: string;
  kind: "session" | "turn";
}): Effect.Effect<WorkspaceGitResolvedBase, DaemonError, R> {
  return Effect.gen(function* () {
    const unavailableReason = {
      anchorKind: kind,
      code: "anchor-unavailable",
    } as const;
    if (!is.nonEmptyString(chatId)) {
      return { available: false, kind, unavailableReason };
    }
    const anchor = yield* anchorResolver(chatId, kind);
    if (!anchor) return { available: false, kind, unavailableReason };
    const commit = yield* resolveCommit(gitRoot, anchor.sha);
    if (!commit) {
      return {
        available: false,
        kind,
        ref: anchor.ref,
        unavailableReason: {
          anchorKind: kind,
          code: "anchor-missing",
          shortSha: anchor.sha.slice(0, 7),
        },
      };
    }
    return resolvedBase(kind, commit, anchor.ref);
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
