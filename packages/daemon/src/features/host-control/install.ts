import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";

import { applyHostControlEnvironment } from "./env";
import { materializeHostSkill } from "./materialize";
import { isHostControlEnabled } from "./paths";

export interface HostControlInstallReport {
  enabled: boolean;
  envNames: string[];
  materialize: {
    missing: boolean;
    skillDir?: string;
    targetCount: number;
  };
}

/**
 * Stage 4 host-control install: materialize `angel-host` into runtime skill
 * roots and expose daemon connection + CLI path via process env.
 *
 * Skill-first only — MCP is not started or required.
 */
export function installHostControl(
  info: DaemonInfo,
  options: {
    env?: NodeJS.ProcessEnv;
    homeDirectory?: string;
  } = {},
): HostControlInstallReport {
  const env = options.env ?? process.env;
  if (!isHostControlEnabled(env)) {
    return {
      enabled: false,
      envNames: [],
      materialize: { missing: false, targetCount: 0 },
    };
  }

  const materialize = materializeHostSkill({
    env,
    homeDirectory: options.homeDirectory,
  });
  const variables = applyHostControlEnvironment(info, env, env);

  return {
    enabled: true,
    envNames: variables.map((variable) => variable.name),
    materialize: {
      missing: materialize.missing,
      skillDir: materialize.skillDir,
      targetCount: materialize.targets.length,
    },
  };
}
