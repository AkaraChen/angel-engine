import type {
  PullRequestCreateInput,
  PullRequestCreateResult,
  PullRequestPreflight,
  PullRequestRecord,
} from "@angel-engine/daemon-api/github";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import is from "@sindresorhus/is";
import { and, eq } from "drizzle-orm";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { pullRequests } from "../../db/schema";
import { type Db, withDatabase } from "../../platform/db";
import { DaemonError } from "../../platform/errors";
import { findGhPath, type GhRunner, mapGhFailure, runGhCli } from "./gh-cli";

const execFileAsync = promisify(execFile);

export type GitRunner = (
  args: string[],
  options: { cwd: string },
) => Promise<{ stderr: string; stdout: string }>;

interface PullRequestDependencies {
  readFile?: (filePath: string) => Promise<string>;
  runGh?: GhRunner;
  runGit?: GitRunner;
  saveRecord?: (record: PullRequestRecord) => Promise<PullRequestRecord>;
  whichGh?: () => Promise<string | null>;
}

const positiveInteger = arkType("number").narrow(
  (value) => Number.isInteger(value) && value > 0,
);
const repoPayloadSchema = arkType({
  "+": "ignore",
  defaultBranchRef: { name: "string > 0" },
});
const prPayloadSchema = arkType({
  "+": "ignore",
  baseRefName: "string > 0",
  createdAt: "string > 0",
  headRefName: "string > 0",
  isDraft: "boolean",
  number: positiveInteger,
  state: "string > 0",
  title: "string > 0",
  updatedAt: "string > 0",
  url: "string > 0",
});
const prListPayloadSchema = prPayloadSchema.array();

export function pullRequestPreflight(
  root: string,
  requestedBase?: string,
  deps: PullRequestDependencies = {},
): Effect.Effect<PullRequestPreflight, DaemonError, Db> {
  return Effect.gen(function* () {
    const { runGh, runGit } = yield* prepareRunners(deps);
    yield* git(runGit, root, ["rev-parse", "--show-toplevel"]);
    const head = yield* git(runGit, root, ["branch", "--show-current"]);
    if (!is.nonEmptyString(head)) {
      return yield* Effect.fail(
        DaemonError.gitFailed(new Error("Detached HEAD is not supported.")),
      );
    }
    const remote = yield* git(runGit, root, [
      "remote",
      "get-url",
      "origin",
    ]).pipe(Effect.mapError(() => DaemonError.gitRemoteMissing()));
    if (!is.nonEmptyString(remote)) {
      return yield* Effect.fail(DaemonError.gitRemoteMissing());
    }

    const repoOutput = yield* gh(runGh, root, [
      "repo",
      "view",
      "--json",
      "defaultBranchRef",
    ]);
    const repo = parsePayload(repoPayloadSchema, repoOutput.stdout);
    const defaultBranch = repo.defaultBranchRef.name;
    const base = requestedBase?.trim() || defaultBranch;
    const baseRef = yield* git(runGit, root, [
      "rev-parse",
      "--verify",
      base,
    ]).pipe(
      Effect.as(base),
      Effect.orElse(() =>
        git(runGit, root, ["rev-parse", "--verify", `origin/${base}`]).pipe(
          Effect.as(`origin/${base}`),
        ),
      ),
    );
    const aheadCount = Number(
      yield* git(runGit, root, ["rev-list", "--count", `${baseRef}..${head}`]),
    );
    const availableBaseBranches = yield* Effect.promise(() =>
      remoteBranches(runGit, root, base, head),
    );
    const existing = yield* findExistingPullRequest(runGh, root, head).pipe(
      Effect.flatMap((record) => persistRecord(record, deps)),
    );
    const prefill = yield* buildPrefill(
      runGit,
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
    const { runGh, runGit } = yield* prepareRunners(deps);
    const head = yield* git(runGit, input.root, ["branch", "--show-current"]);
    let pushed = input.skipPush === true;

    if (!pushed) {
      const pushExit = yield* Effect.either(
        git(runGit, input.root, ["push", "-u", "origin", head]),
      );
      if (pushExit._tag === "Left") {
        const error = mapPushFailure(pushExit.left);
        return failedResult(false, error);
      }
      pushed = true;
    }

    const createExit = yield* Effect.either(
      createWithBodyFile(runGh, input.root, head, input),
    );
    if (createExit._tag === "Left") {
      const existing = yield* findExistingPullRequest(
        runGh,
        input.root,
        head,
      ).pipe(Effect.orElseSucceed(() => null));
      if (existing !== null) {
        const record = yield* persistRecord(existing, deps);
        return { pushed, record, status: "existing" };
      }
      return failedResult(pushed, mapCreateFailure(createExit.left));
    }

    const record = yield* viewPullRequest(
      runGh,
      input.root,
      createExit.right.trim(),
    ).pipe(Effect.flatMap((value) => persistRecord(value, deps)));
    return { pushed, record, status: "created" };
  });
}

export function getStoredPullRequest(root: string) {
  return Effect.gen(function* () {
    const branch = yield* git(defaultGitRunner, root, [
      "branch",
      "--show-current",
    ]);
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
    return {
      runGh: deps.runGh ?? runGhCli,
      runGit: deps.runGit ?? defaultGitRunner,
    };
  });
}

async function defaultGitRunner(args: string[], options: { cwd: string }) {
  const result = await execFileAsync("git", args, {
    cwd: options.cwd,
    maxBuffer: 4 * 1024 * 1024,
  });
  return { stderr: result.stderr.toString(), stdout: result.stdout.toString() };
}

function git(runGit: GitRunner, cwd: string, args: string[]) {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.gitFailed(cause),
    try: () => runGit(args, { cwd }),
  }).pipe(Effect.map((output) => output.stdout.trim()));
}

function gh(runGh: GhRunner, cwd: string, args: string[]) {
  return Effect.tryPromise({
    catch: mapGhFailure,
    try: () => runGh(args, { cwd }),
  });
}

function parsePayload<T>(
  schema: (value: unknown) => T | arkType.errors,
  json: string,
): T {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (cause) {
    throw DaemonError.sourceControlFetchFailed(
      cause,
      "GitHub CLI returned invalid JSON.",
    );
  }
  const parsed = schema(value);
  if (parsed instanceof arkType.errors) {
    throw DaemonError.sourceControlFetchFailed(
      new TypeError(`Unexpected GitHub CLI payload: ${parsed.summary}`),
    );
  }
  return parsed;
}

function findExistingPullRequest(runGh: GhRunner, root: string, head: string) {
  return gh(runGh, root, [
    "pr",
    "list",
    "--head",
    head,
    "--state",
    "open",
    "--limit",
    "1",
    "--json",
    "number,url,title,state,isDraft,baseRefName,headRefName,createdAt,updatedAt",
  ]).pipe(
    Effect.map((output) => {
      const records = parsePayload(prListPayloadSchema, output.stdout);
      return records[0] === undefined ? null : toRecord(root, records[0]);
    }),
  );
}

function viewPullRequest(runGh: GhRunner, root: string, url: string) {
  return gh(runGh, root, [
    "pr",
    "view",
    url,
    "--json",
    "number,url,title,state,isDraft,baseRefName,headRefName,createdAt,updatedAt",
  ]).pipe(
    Effect.map((output) =>
      toRecord(root, parsePayload(prPayloadSchema, output.stdout)),
    ),
  );
}

function toRecord(
  root: string,
  payload: typeof prPayloadSchema.infer,
): PullRequestRecord {
  return {
    baseBranch: payload.baseRefName,
    branch: payload.headRefName,
    createdAt: payload.createdAt,
    id: `${root}:${payload.headRefName}`,
    isDraft: payload.isDraft,
    number: payload.number,
    root,
    state: payload.state.toLowerCase(),
    title: payload.title,
    updatedAt: payload.updatedAt,
    url: payload.url,
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

function createWithBodyFile(
  runGh: GhRunner,
  root: string,
  head: string,
  input: PullRequestCreateInput,
) {
  return Effect.tryPromise({
    catch: mapGhFailure,
    try: async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "angel-pr-"));
      const bodyPath = path.join(directory, "body.md");
      try {
        await fs.writeFile(bodyPath, input.body, "utf8");
        const args = [
          "pr",
          "create",
          "--base",
          input.base,
          "--head",
          head,
          "--title",
          input.title.trim(),
          "--body-file",
          bodyPath,
        ];
        if (input.draft) args.push("--draft");
        const output = await runGh(args, { cwd: root });
        return output.stdout;
      } finally {
        await fs.rm(directory, { recursive: true });
      }
    },
  });
}

async function remoteBranches(
  runGit: GitRunner,
  root: string,
  base: string,
  head: string,
) {
  try {
    const output = await runGit(
      ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/*"],
      { cwd: root },
    );
    return Array.from(
      new Set([
        base,
        ...output.stdout
          .split("\n")
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
  runGit: GitRunner,
  readFile: PullRequestDependencies["readFile"],
  root: string,
  base: string,
  head: string,
) {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.gitFailed(cause),
    try: async () => {
      const log = await runGit(
        ["log", "--format=%h%x09%s%x09%b%x00", `${base}..${head}`],
        { cwd: root },
      );
      const commits = log.stdout
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
      const stat = await runGit(["diff", "--shortstat", `${base}..${head}`], {
        cwd: root,
      });
      const shown = commits.slice(0, 20);
      const commitSection = [
        "## Commits",
        ...shown.map((commit) => `- ${commit.subject} (${commit.sha})`),
        ...(commits.length > 20 ? [`- …and ${commits.length - 20} more`] : []),
        "",
        "## Files",
        stat.stdout.trim() || "No file summary available",
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
