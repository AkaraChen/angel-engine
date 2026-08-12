import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitCommandOptions {
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  signal?: AbortSignal;
  timeout?: number;
}

export function executeGit(
  cwd: string,
  args: readonly string[],
  options: GitCommandOptions = {},
) {
  return execFileAsync("git", ["-C", cwd, ...args], options);
}
