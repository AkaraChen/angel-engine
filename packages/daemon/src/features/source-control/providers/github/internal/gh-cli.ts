import { execFile } from "node:child_process";
import { promisify, stripVTControlCharacters } from "node:util";
import is from "@sindresorhus/is";
import which from "which";

import { DaemonError } from "../../../../../platform/errors";
import { GitHubError } from "./errors";

const execFileAsync = promisify(execFile);
const GH_OUTPUT_MAX_BUFFER = 2 * 1024 * 1024;
const GH_TIMEOUT_MS = 30_000;

export type GhRunner = (
  args: string[],
  options?: { cwd?: string; timeoutMs?: number },
) => Promise<{
  stderr: string;
  stdout: string;
}>;

interface GhExecutorOptions {
  cwd?: string;
  env: NodeJS.ProcessEnv;
  maxBuffer: number;
  timeout: number;
}

export type GhExecutor = (
  executable: string,
  args: string[],
  options: GhExecutorOptions,
) => Promise<{ stderr: Buffer | string; stdout: Buffer | string }>;

export async function findGhPath(): Promise<string | null> {
  return which("gh", { nothrow: true });
}

export function createGhRunner(execute: GhExecutor): GhRunner {
  return async (args, options = {}) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GH_NO_UPDATE_NOTIFIER: "1",
      GH_PAGER: "cat",
      GH_PROMPT_DISABLED: "1",
      GIT_TERMINAL_PROMPT: "0",
      NO_COLOR: "1",
    };
    delete env.CLICOLOR_FORCE;
    delete env.FORCE_COLOR;

    try {
      const result = await execute("gh", args, {
        cwd: options.cwd,
        env,
        maxBuffer: GH_OUTPUT_MAX_BUFFER,
        timeout: options.timeoutMs ?? GH_TIMEOUT_MS,
      });
      return {
        stderr: cleanOutput(result.stderr),
        stdout: cleanOutput(result.stdout),
      };
    } catch (cause) {
      throw cleanFailure(cause);
    }
  };
}

const executeGhFile: GhExecutor = async (executable, args, options) =>
  execFileAsync(executable, args, options);

export const runGhCli = createGhRunner(executeGhFile);

/**
 * Like `runGhCli`, but keeps stdout/stderr when the process exits non-zero.
 * Used for commands such as `gh pr checks` that return 1 (failed) or 8
 * (pending) while still printing JSON on stdout.
 */
export async function runGhCliCapturingExit(
  args: string[],
  options: { cwd?: string } = {},
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  try {
    const result = await runGhCli(args, options);
    return { exitCode: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (cause) {
    const stdout = extractProcessOutput(cause, "stdout");
    const stderr = extractProcessOutput(cause, "stderr");
    if (stdout !== null || stderr !== null) {
      return {
        exitCode: exitCodeFromCause(cause) ?? 1,
        stderr: stderr ?? "",
        stdout: stdout ?? "",
      };
    }
    throw cause;
  }
}

export function mapGhFailure(cause: unknown): DaemonError {
  const message = stderrOrMessage(cause).toLowerCase();
  if (
    message.includes("resource not accessible") ||
    message.includes("must have push access") ||
    message.includes("permission denied") ||
    message.includes("http 403") ||
    message.includes("status 403")
  ) {
    return GitHubError.sourceControlPermissionDenied();
  }
  if (
    message.includes("not mergeable") ||
    message.includes("merge conflict") ||
    message.includes("head branch was modified") ||
    message.includes("base branch policy prohibits")
  ) {
    return GitHubError.sourceControlMergeConflict();
  }
  if (
    message.includes("not logged into") ||
    message.includes("to re-authenticate") ||
    message.includes("authentication required") ||
    message.includes("gh auth login")
  ) {
    return GitHubError.sourceControlUnauthenticated(
      "GitHub CLI is not authenticated. Run `gh auth login` and try again.",
    );
  }
  if (isNoPullRequestMessage(message)) {
    return GitHubError.sourceControlItemNotFound(
      "No pull request is associated with the current branch.",
    );
  }
  if (
    message.includes("could not resolve") ||
    message.includes("not found") ||
    message.includes("http 404") ||
    message.includes("status 404")
  ) {
    return GitHubError.sourceControlItemNotFound();
  }
  return GitHubError.sourceControlFetchFailed(cause);
}

export function isNoPullRequestMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("no pull requests found") ||
    lower.includes("no pull request found") ||
    lower.includes("no open pull requests found")
  );
}

export function extractProcessOutput(
  cause: unknown,
  field: "stderr" | "stdout",
): string | null {
  if (!is.object(cause)) return null;
  const value = (cause as Record<string, unknown>)[field];
  if (is.string(value)) return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return null;
}

function exitCodeFromCause(cause: unknown): number | null {
  if (!is.object(cause)) return null;
  const code = (cause as { code?: unknown }).code;
  if (is.number(code) && Number.isInteger(code)) return code;
  return null;
}

export function normalizeText(value: string) {
  return value
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim();
}

function stderrOrMessage(cause: unknown): string {
  if (is.object(cause)) {
    const record = cause as { message?: unknown; stderr?: unknown };
    if (is.nonEmptyStringAndNotWhitespace(record.stderr)) {
      return record.stderr;
    }
    if (is.string(record.message)) {
      return record.message;
    }
  }
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

function cleanOutput(value: Buffer | string): string {
  return stripVTControlCharacters(value.toString());
}

function cleanFailure(cause: unknown): unknown {
  if (!is.object(cause)) return cause;

  const record = cause as {
    message?: unknown;
    stderr?: unknown;
    stdout?: unknown;
  };
  const message = is.string(record.message)
    ? stripVTControlCharacters(record.message)
    : "GitHub CLI command failed.";
  const cleanCause = Object.assign(new Error(message), cause) as Error & {
    stderr?: string;
    stdout?: string;
  };
  cleanCause.message = message;
  if (Buffer.isBuffer(record.stderr) || is.string(record.stderr)) {
    cleanCause.stderr = cleanOutput(record.stderr);
  }
  if (Buffer.isBuffer(record.stdout) || is.string(record.stdout)) {
    cleanCause.stdout = cleanOutput(record.stdout);
  }
  return cleanCause;
}
