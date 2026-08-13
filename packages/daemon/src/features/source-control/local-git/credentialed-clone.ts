import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ProviderOperationContext } from "@angel-engine/daemon-api/source-control";

import { executeGit, type LocalGitRunner } from "./backend";

export class CloneRequiresConfigurationError extends Error {
  readonly code = "source-control/requires-configuration";

  constructor(message: string) {
    super(message);
    this.name = "CloneRequiresConfigurationError";
  }
}

export interface CredentialedCloneCli {
  clone(targetPath: string, timeoutMs: number): Promise<void>;
  isAvailable(): Promise<boolean>;
}

export interface CredentialedCloneOptions {
  cli?: CredentialedCloneCli;
  context: ProviderOperationContext;
  getToken?: () => Promise<string | null>;
  remoteUrl: string;
  runGit?: LocalGitRunner;
  targetPath: string;
  username?: string;
}

/**
 * Clone without ever embedding credentials in an argument or remote URL.
 * SSH is delegated to Git, then a provider CLI, the configured Git credential
 * helper, and finally an ephemeral askpass shim are attempted in that order.
 */
export async function credentialedClone(
  options: CredentialedCloneOptions,
): Promise<void> {
  const runGit = options.runGit ?? executeGit;
  const timeout = Math.max(1, options.context.deadline - Date.now());
  if (isSshRemote(options.remoteUrl)) {
    await cloneWithGit(runGit, options, timeout);
    return;
  }

  if (options.cli && (await options.cli.isAvailable())) {
    await options.cli.clone(options.targetPath, timeout);
    return;
  }

  if (await credentialHelperHasCredential(options.remoteUrl, timeout)) {
    await cloneWithGit(runGit, options, timeout);
    return;
  }

  const token = await options.getToken?.();
  if (token) {
    await cloneWithAskpass(runGit, options, timeout, token);
    return;
  }

  const host = remoteHost(options.remoteUrl);
  try {
    // Public HTTPS repositories need no credential source. Attempt the clean
    // URL once before reporting the private-repository configuration action.
    await cloneWithGit(runGit, options, timeout);
  } catch {
    throw new CloneRequiresConfigurationError(
      `Configure credentials for ${host} before cloning this private repository.`,
    );
  }
}

async function cloneWithGit(
  runGit: LocalGitRunner,
  options: CredentialedCloneOptions,
  timeout: number,
  env?: NodeJS.ProcessEnv,
) {
  await runGit(
    path.dirname(options.targetPath),
    ["clone", "--progress", options.remoteUrl, options.targetPath],
    { env, signal: options.context.signal, timeout },
  );
}

async function cloneWithAskpass(
  runGit: LocalGitRunner,
  options: CredentialedCloneOptions,
  timeout: number,
  token: string,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "angel-askpass-"));
  const askpass = path.join(directory, "askpass.sh");
  try {
    await writeFile(
      askpass,
      '#!/bin/sh\ncase "$1" in *Username*) printf "%s" "$ANGEL_GIT_USERNAME" ;; *) printf "%s" "$ANGEL_GIT_TOKEN" ;; esac\n',
      { encoding: "utf8", mode: 0o700 },
    );
    await chmod(askpass, 0o700);
    await cloneWithGit(runGit, options, timeout, {
      ...process.env,
      ANGEL_GIT_TOKEN: token,
      ANGEL_GIT_USERNAME: options.username ?? "oauth2",
      GIT_ASKPASS: askpass,
      GIT_TERMINAL_PROMPT: "0",
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function credentialHelperHasCredential(
  remoteUrl: string,
  timeout: number,
): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    return false;
  }
  const input = `protocol=${parsed.protocol.slice(0, -1)}\nhost=${parsed.host}\n\n`;
  return new Promise((resolve) => {
    const child = spawn("git", ["credential", "fill"], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const timer = setTimeout(() => child.kill(), timeout);
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && /^password=.+$/m.test(output));
    });
    child.stdin.end(input);
  });
}

function isSshRemote(remoteUrl: string) {
  return remoteUrl.startsWith("ssh://") || /^[\w.-]+@[\w.-]+:/.test(remoteUrl);
}

function remoteHost(remoteUrl: string) {
  const scp = /^[\w.-]+@([\w.-]+):/.exec(remoteUrl);
  if (scp) return scp[1];
  try {
    return new URL(remoteUrl).host;
  } catch {
    return "this source-control host";
  }
}
