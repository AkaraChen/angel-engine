import type {
  PullRequestCreateInput,
  PullRequestCreateResult,
  PullRequestPreflight,
  PullRequestRecord,
} from "@angel-engine/daemon-api/github";
import type {
  ChangeRequest,
  ProviderOperationContext,
} from "@angel-engine/daemon-api/source-control";

import fs from "node:fs/promises";
import path from "node:path";
import is from "@sindresorhus/is";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import { pullRequests } from "../../../db/schema";
import { type Db, withDatabase } from "../../../platform/db";
import { DaemonError } from "../../../platform/errors";
import {
  createLocalGitBackend,
  executeGit,
  type LocalGitBackend,
  type LocalGitRunner,
} from "../local-git/backend";
import { findGhPath, type GhRunner, runGhCli } from "../../github/gh-cli";
import { createGitHubPlugin } from "../providers/github/plugin";

export type GitRunner = (
  args: string[],
  options: { cwd: string },
) => Promise<{ stderr: string; stdout: string }>;

interface PullRequestDependencies {
  localGit?: LocalGitBackend;
  readFile?: (filePath: string) => Promise<string>;
  runGh?: GhRunner;
  runGit?: GitRunner;
  saveRecord?: (record: PullRequestRecord) => Promise<PullRequestRecord>;
  whichGh?: () => Promise<string | null>;
}

const operationContext = (): ProviderOperationContext => ({
  deadline: Date.now() + 30_000,
  signal: new AbortController().signal,
});

export function pullRequestPreflight(
  root: string,
  requestedBase?: string,
  deps: PullRequestDependencies = {},
): Effect.Effect<PullRequestPreflight, DaemonError, Db> {
  return Effect.gen(function* () {
    const { localGit, plugin } = yield* prepareRunners(deps);
    yield* local(() => localGit.repositoryRoot(root));
    const head = yield* local(() => localGit.currentBranch(root));
    if (!is.nonEmptyString(head)) {
      return yield* Effect.fail(
        DaemonError.gitFailed(new Error("Detached HEAD is not supported.")),
      );
    }
    const remote = yield* local(() => localGit.remoteUrl(root, "origin")).pipe(
      Effect.mapError(() => DaemonError.gitRemoteMissing()),
    );
    if (!is.nonEmptyString(remote)) {
      return yield* Effect.fail(DaemonError.gitRemoteMissing());
    }
    const repository = plugin.git.parseUrl(remote);
    const preflight = plugin.changeRequests?.preflight;
    const list = plugin.changeRequests?.list;
    if (repository === null || preflight === undefined || list === undefined) {
      return yield* Effect.fail(DaemonError.sourceControlUrlUnsupported());
    }
    const providerPreflight = yield* providerCall(() =>
      preflight(
        { repository, sourceBranch: head, targetBranch: null },
        operationContext(),
      ),
    );
    const defaultBranch = providerPreflight.targetBranch;
    const base = requestedBase?.trim() || defaultBranch;
    const localBase = yield* local(() => localGit.resolveRef(root, base));
    const remoteBase =
      localBase === null
        ? yield* local(() => localGit.resolveRef(root, `origin/${base}`))
        : null;
    const baseRef =
      localBase !== null ? base : remoteBase !== null ? `origin/${base}` : null;
    if (baseRef === null) {
      return yield* Effect.fail(
        DaemonError.gitFailed(new Error(`Base branch ${base} was not found.`)),
      );
    }
    const aheadCount = yield* local(() =>
      localGit.aheadCount(root, baseRef, head),
    );
    const availableBaseBranches = yield* Effect.promise(() =>
      remoteBranches(localGit, root, base, head),
    );
    const existingChangeRequest = (yield* providerCall(() =>
      list(
        { limit: 1, query: `head:${head} is:open`, repository },
        operationContext(),
      ),
    )).find((changeRequest) => changeRequest.source.name === head);
    const existing = yield* persistRecord(
      existingChangeRequest === undefined
        ? null
        : toRecord(root, existingChangeRequest),
      deps,
    );
    const prefill = yield* buildPrefill(
      localGit,
      deps.readFile,
      root,
      baseRef,
      head,
    );

    return {
      aheadCount,
      availableBaseBranches,
      base,
      body: prefill.body,
      canCreate: aheadCount > 0 || existing !== null,
      defaultBranch,
      existing,
      head,
      reason:
        aheadCount === 0 && existing === null
          ? "pull-request-no-commits"
          : undefined,
      title: prefill.title,
    };
  });
}

export function createPullRequest(
  input: PullRequestCreateInput,
  deps: PullRequestDependencies = {},
): Effect.Effect<PullRequestCreateResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const { localGit, plugin } = yield* prepareRunners(deps);
    const head = yield* local(() => localGit.currentBranch(input.root));
    const remote = yield* local(() =>
      localGit.remoteUrl(input.root, "origin"),
    ).pipe(Effect.mapError(() => DaemonError.gitRemoteMissing()));
    const repository = plugin.git.parseUrl(remote);
    const publish = plugin.git.publishBranch;
    const create = plugin.changeRequests?.create;
    const list = plugin.changeRequests?.list;
    if (
      repository === null ||
      publish === undefined ||
      create === undefined ||
      list === undefined
    ) {
      return yield* Effect.fail(DaemonError.sourceControlUrlUnsupported());
    }
    let pushed = input.skipPush === true;

    if (!pushed) {
      const pushExit = yield* Effect.either(
        providerCall(() =>
          publish(
            {
              forceWithLease: false,
              localBranch: head,
              projectPath: input.root,
              remoteName: "origin",
              repository,
            },
            operationContext(),
          ),
        ),
      );
      if (pushExit._tag === "Left") {
        const error = mapPushFailure(pushExit.left);
        return failedResult(false, error);
      }
      pushed = true;
    }

    const createExit = yield* Effect.either(
      providerCall(() =>
        create(
          {
            body: input.body,
            draft: input.draft,
            repository,
            sourceBranch: head,
            targetBranch: input.base,
            title: input.title,
          },
          operationContext(),
        ),
      ),
    );
    if (createExit._tag === "Left") {
      const existing = yield* providerCall(() =>
        list(
          { limit: 1, query: `head:${head} is:open`, repository },
          operationContext(),
        ),
      ).pipe(Effect.orElseSucceed(() => []));
      const existingChangeRequest = existing.find(
        (changeRequest) => changeRequest.source.name === head,
      );
      if (existingChangeRequest !== undefined) {
        const record = yield* persistRecord(
          toRecord(input.root, existingChangeRequest),
          deps,
        );
        return { pushed, record, status: "existing" };
      }
      return failedResult(pushed, mapCreateFailure(createExit.left));
    }

    const record = yield* persistRecord(
      toRecord(input.root, createExit.right),
      deps,
    );
    return { pushed, record, status: "created" };
  });
}

export function getStoredPullRequest(root: string) {
  return Effect.gen(function* () {
    const branch = yield* local(() =>
      createLocalGitBackend().currentBranch(root),
    );
    return yield* withDatabase((database) =>
      database
        .select()
        .from(pullRequests)
        .where(
          and(eq(pullRequests.root, root), eq(pullRequests.branch, branch)),
        )
        .limit(1)
        .get(),
    ).pipe(Effect.map((record) => record ?? null));
  });
}

function prepareRunners(deps: PullRequestDependencies) {
  return Effect.gen(function* () {
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.sourceControlFetchFailed(cause),
      try: deps.whichGh ?? findGhPath,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(DaemonError.sourceControlCliMissing());
    }
    const legacyRunGit = deps.runGit;
    const runGit: LocalGitRunner =
      legacyRunGit === undefined
        ? executeGit
        : (cwd, args) => legacyRunGit([...args], { cwd });
    return {
      localGit: deps.localGit ?? createLocalGitBackend(runGit),
      plugin: createGitHubPlugin({
        findGh: deps.whichGh ?? findGhPath,
        runGh: deps.runGh ?? runGhCli,
        runGit,
      }),
    };
  });
}

function local<A>(operation: () => Promise<A>) {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.gitFailed(cause),
    try: operation,
  });
}

function providerCall<A>(operation: () => Promise<A>) {
  return Effect.tryPromise({
    catch: (cause) =>
      cause instanceof DaemonError
        ? cause
        : DaemonError.sourceControlFetchFailed(cause),
    try: operation,
  });
}

function toRecord(
  root: string,
  changeRequest: ChangeRequest,
): PullRequestRecord {
  return {
    baseBranch: changeRequest.target.name,
    branch: changeRequest.source.name,
    createdAt:
      changeRequest.createdAt ??
      changeRequest.updatedAt ??
      new Date().toISOString(),
    id: `${root}:${changeRequest.source.name}`,
    isDraft: changeRequest.draft,
    number: changeRequest.number ?? Number(changeRequest.id),
    root,
    state: changeRequest.state,
    title: changeRequest.title,
    updatedAt:
      changeRequest.updatedAt ??
      changeRequest.createdAt ??
      new Date().toISOString(),
    url: changeRequest.webUrl,
  };
}

function persistRecord(
  record: PullRequestRecord,
  deps: PullRequestDependencies,
): Effect.Effect<PullRequestRecord, DaemonError, Db>;
function persistRecord(
  record: null,
  deps: PullRequestDependencies,
): Effect.Effect<null, DaemonError, Db>;
function persistRecord(
  record: PullRequestRecord | null,
  deps: PullRequestDependencies,
): Effect.Effect<PullRequestRecord | null, DaemonError, Db>;
function persistRecord(
  record: PullRequestRecord | null,
  deps: PullRequestDependencies,
): Effect.Effect<PullRequestRecord | null, DaemonError, Db> {
  if (record === null) return Effect.succeed(null);
  if (deps.saveRecord !== undefined) {
    return Effect.tryPromise({
      catch: (cause) =>
        DaemonError.databaseFailed(cause, "Could not save pull request."),
      try: () => deps.saveRecord?.(record) ?? Promise.resolve(record),
    });
  }
  return withDatabase((database) =>
    database
      .insert(pullRequests)
      .values(record)
      .onConflictDoUpdate({
        set: {
          baseBranch: record.baseBranch,
          isDraft: record.isDraft,
          number: record.number,
          state: record.state,
          title: record.title,
          updatedAt: record.updatedAt,
          url: record.url,
        },
        target: [pullRequests.root, pullRequests.branch],
      })
      .returning()
      .get(),
  );
}

async function remoteBranches(
  localGit: LocalGitBackend,
  root: string,
  base: string,
  head: string,
) {
  try {
    const refs = await localGit.remoteBranches(root, "origin");
    return Array.from(
      new Set([
        base,
        ...refs
          .map((branch) => branch.trim().replace(/^origin\//, ""))
          .filter(
            (branch) =>
              branch.length > 0 &&
              branch !== "HEAD" &&
              branch !== "origin" &&
              branch !== head,
          ),
      ]),
    ).filter((branch) => branch !== head);
  } catch {
    return base === head ? [] : [base];
  }
}

export function pullRequestTitleFromBranch(
  head: string,
  fallbackSubject?: string,
) {
  const title = head
    .replace(/^angel\//, "")
    .replace(/^agent\//, "")
    .replace(/[-_/]+/g, " ")
    .trim();
  return /^(?:pr\s+)?\d+$/i.test(title) && is.nonEmptyString(fallbackSubject)
    ? fallbackSubject
    : title || fallbackSubject || head;
}

function buildPrefill(
  localGit: LocalGitBackend,
  readFile: PullRequestDependencies["readFile"],
  root: string,
  base: string,
  head: string,
) {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.gitFailed(cause),
    try: async () => {
      const log = await localGit.log(root, base, head);
      const commits = log
        .split("\0")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [sha = "", subject = "", ...body] = line.split("\t");
          return { body: body.join("\t").trim(), sha, subject };
        });
      const title =
        commits.length === 1
          ? (commits[0]?.subject ?? head)
          : pullRequestTitleFromBranch(head, commits[0]?.subject);
      const stat = await localGit.diffShortStat(root, base, head);
      const shown = commits.slice(0, 20);
      const commitSection = [
        "## Commits",
        ...shown.map((commit) => `- ${commit.subject} (${commit.sha})`),
        ...(commits.length > 20 ? [`- …and ${commits.length - 20} more`] : []),
        "",
        "## Files",
        stat.trim() || "No file summary available",
      ].join("\n");
      let template = "";
      try {
        const templatePath = path.join(
          root,
          ".github",
          "PULL_REQUEST_TEMPLATE.md",
        );
        template = readFile
          ? await readFile(templatePath)
          : await fs.readFile(templatePath, "utf8");
      } catch {
        // A repository template is optional.
      }
      const latestBody = commits[0]?.body ?? "";
      return {
        body: [template.trim(), latestBody, commitSection]
          .filter(Boolean)
          .join("\n\n"),
        title,
      };
    },
  });
}

function failedResult(
  pushed: boolean,
  error: DaemonError,
): PullRequestCreateResult {
  return {
    error: { code: error.code, message: error.message },
    pushed,
    status: "failed",
  };
}

function mapPushFailure(error: DaemonError) {
  const message = error.message.toLowerCase();
  if (message.includes("non-fast-forward") || message.includes("fetch first")) {
    return DaemonError.gitPushNotFastForward();
  }
  if (
    message.includes("permission denied") ||
    message.includes("permission to") ||
    message.includes("403")
  ) {
    return DaemonError.gitPushDenied();
  }
  return error;
}

function mapCreateFailure(error: DaemonError) {
  const message = error.message.toLowerCase();
  if (
    message.includes("could not resolve host") ||
    message.includes("network") ||
    message.includes("timed out")
  ) {
    return DaemonError.sourceControlNetworkUnavailable();
  }
  if (message.includes("already exists")) {
    return DaemonError.pullRequestAlreadyExists();
  }
  return error;
}
