export interface DaemonBootstrapSecrets {
  internalBridgeSecret?: string;
  mobilePassword?: string;
}

/**
 * Moves one-shot bootstrap secrets out of the process environment before any
 * terminal, agent, setup script, or other child process can inherit them.
 */
export function consumeDaemonBootstrapSecrets(
  env: NodeJS.ProcessEnv = process.env,
): DaemonBootstrapSecrets {
  const secrets = {
    internalBridgeSecret: nonEmpty(env.ANGEL_MAIN_BRIDGE_SECRET),
    mobilePassword: nonEmpty(env.ANGEL_MOBILE_PASSWORD),
  };
  delete env.ANGEL_MAIN_BRIDGE_SECRET;
  delete env.ANGEL_MOBILE_PASSWORD;
  return secrets;
}

function nonEmpty(value: string | undefined) {
  return value !== undefined && value.length > 0 ? value : undefined;
}
