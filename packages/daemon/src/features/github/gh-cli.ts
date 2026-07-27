import { execFile } from "node:child_process";
import { promisify } from "node:util";
import is from "@sindresorhus/is";
import which from "which";

import { DaemonError } from "../../platform/errors";

const execFileAsync = promisify(execFile);
const GH_OUTPUT_MAX_BUFFER = 2 * 1024 * 1024;
const GH_TIMEOUT_MS = 30_000;

export type GhRunner = (
  args: string[],
  options?: { cwd?: string },
) => Promise<{
  stderr: string;
  stdout: string;
}>;

export async function findGhPath(): Promise<string | null> {
  return which("gh", { nothrow: true });
}

export async function runGhCli(
  args: string[],
  options: { cwd?: string } = {},
): Promise<{ stderr: string; stdout: string }> {
  const result = await execFileAsync("gh", args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      GH_NO_UPDATE_NOTIFIER: "1",
      GH_PAGER: "cat",
      GH_PROMPT_DISABLED: "1",
      GIT_TERMINAL_PROMPT: "0",
      NO_COLOR: "1",
    },
    maxBuffer: GH_OUTPUT_MAX_BUFFER,
    timeout: GH_TIMEOUT_MS,
  });
  return {
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

export function mapGhFailure(cause: unknown): DaemonError {
  const message = stderrOrMessage(cause).toLowerCase();
  if (
    message.includes("not logged into") ||
    message.includes("to re-authenticate") ||
    message.includes("authentication required") ||
    message.includes("gh auth login")
  ) {
    return DaemonError.githubCliUnauthenticated(
      "GitHub CLI is not authenticated. Run `gh auth login` and try again.",
    );
  }
  if (
    message.includes("could not resolve") ||
    message.includes("not found") ||
    message.includes("http 404") ||
    message.includes("status 404")
  ) {
    return DaemonError.githubItemNotFound();
  }
  return DaemonError.githubFetchFailed(cause);
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
