import { execFile } from "node:child_process";
import { promisify, stripVTControlCharacters } from "node:util";

import which from "which";

const execFileAsync = promisify(execFile);
const OUTPUT_LIMIT = 4 * 1024 * 1024;

export type ProviderCliRunner = (
  args: readonly string[],
  options?: { cwd?: string; timeoutMs?: number },
) => Promise<{ stderr: string; stdout: string }>;

export function findProviderCli(command: string): Promise<string | null> {
  return which(command, { nothrow: true });
}

export function createProviderCliRunner(command: string): ProviderCliRunner {
  return async (args, options = {}) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      NO_COLOR: "1",
      PAGER: "cat",
    };
    delete env.CLICOLOR_FORCE;
    delete env.FORCE_COLOR;
    const result = await execFileAsync(command, [...args], {
      cwd: options.cwd,
      env,
      maxBuffer: OUTPUT_LIMIT,
      timeout: options.timeoutMs ?? 30_000,
    });
    return {
      stderr: stripVTControlCharacters(result.stderr.toString()),
      stdout: stripVTControlCharacters(result.stdout.toString()),
    };
  };
}
