import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";
import path from "node:path";

import {
  resolveHostCliBinDir,
  resolveHostCliBinary,
  resolveHostSkillDir,
} from "./paths";

export interface HostControlEnvironmentVariable {
  name: string;
  value: string;
}

/**
 * Environment variables injected into agent process trees so they can run
 * `angelctl` against this daemon without inventing connection details.
 *
 * Never log the token value.
 */
export function buildHostControlEnvironment(
  info: DaemonInfo,
  env: NodeJS.ProcessEnv = process.env,
): HostControlEnvironmentVariable[] {
  const variables: HostControlEnvironmentVariable[] = [
    {
      name: "ANGEL_DAEMON_URL",
      value: `http://${info.host}:${info.port}`,
    },
    {
      name: "ANGEL_DAEMON_TOKEN",
      value: info.token,
    },
  ];

  const cliBin = resolveHostCliBinary(env);
  if (cliBin !== undefined) {
    variables.push({ name: "ANGELCTL_BIN", value: cliBin });
  }

  const cliBinDir = resolveHostCliBinDir(env);
  if (cliBinDir !== undefined) {
    variables.push({ name: "ANGELCTL_BIN_DIR", value: cliBinDir });
    const pathValue = prependPathEntry(env.PATH ?? "", cliBinDir);
    variables.push({ name: "PATH", value: pathValue });
  }

  const skillDir = resolveHostSkillDir(env);
  if (skillDir !== undefined) {
    variables.push({ name: "ANGEL_HOST_SKILL_DIR", value: skillDir });
    variables.push({
      name: "ANGEL_HOST_SKILL_ROOT",
      value: path.dirname(skillDir),
    });
  }

  return variables;
}

/**
 * Apply host-control env onto a process env bag (daemon process itself so
 * Claude/Pi children that inherit process.env also see connection details).
 */
export function applyHostControlEnvironment(
  info: DaemonInfo,
  target: NodeJS.ProcessEnv = process.env,
  source: NodeJS.ProcessEnv = process.env,
): HostControlEnvironmentVariable[] {
  const variables = buildHostControlEnvironment(info, source);
  for (const variable of variables) {
    target[variable.name] = variable.value;
  }
  return variables;
}

function prependPathEntry(pathValue: string, entry: string): string {
  const delimiter = path.delimiter;
  const parts = pathValue
    .split(delimiter)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== entry);
  return [entry, ...parts].join(delimiter);
}
