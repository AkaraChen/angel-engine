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

export type LocalGitRunner = (
  cwd: string,
  args: readonly string[],
  options?: GitCommandOptions,
) => Promise<{ stderr: Buffer | string; stdout: Buffer | string }>;

export interface LocalGitBackend {
  aheadCount(cwd: string, base: string, head: string): Promise<number>;
  currentBranch(cwd: string): Promise<string>;
  diffShortStat(cwd: string, base: string, head: string): Promise<string>;
  log(cwd: string, base: string, head: string): Promise<string>;
  remoteBranches(cwd: string, remoteName: string): Promise<readonly string[]>;
  remoteUrl(cwd: string, remoteName: string): Promise<string>;
  repositoryRoot(cwd: string): Promise<string>;
  resolveRef(cwd: string, ref: string): Promise<string | null>;
}

export function createLocalGitBackend(
  run: LocalGitRunner = executeGit,
): LocalGitBackend {
  const output = async (cwd: string, args: readonly string[]) =>
    (await run(cwd, args, { maxBuffer: 4 * 1024 * 1024 })).stdout
      .toString()
      .trim();
  return {
    aheadCount: async (cwd, base, head) => {
      const count = Number(
        await output(cwd, ["rev-list", "--count", `${base}..${head}`]),
      );
      if (!Number.isInteger(count) || count < 0) {
        throw new TypeError("Git did not return a valid ahead count.");
      }
      return count;
    },
    currentBranch: (cwd) => output(cwd, ["branch", "--show-current"]),
    diffShortStat: (cwd, base, head) =>
      output(cwd, ["diff", "--shortstat", `${base}..${head}`]),
    log: (cwd, base, head) =>
      output(cwd, ["log", "--format=%h%x09%s%x09%b%x00", `${base}..${head}`]),
    remoteBranches: async (cwd, remoteName) => {
      const refs = await output(cwd, [
        "for-each-ref",
        "--format=%(refname:short)",
        `refs/remotes/${remoteName}/*`,
      ]);
      return refs
        .split("\n")
        .map((ref) => ref.trim())
        .filter(Boolean);
    },
    remoteUrl: (cwd, remoteName) =>
      output(cwd, ["remote", "get-url", remoteName]),
    repositoryRoot: (cwd) => output(cwd, ["rev-parse", "--show-toplevel"]),
    resolveRef: async (cwd, ref) => {
      try {
        return await output(cwd, ["rev-parse", "--verify", ref]);
      } catch {
        return null;
      }
    },
  };
}

export const localGitBackend = createLocalGitBackend();
