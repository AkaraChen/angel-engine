import { describe, expect, it } from "vitest";
import { consumeDaemonBootstrapSecrets } from "./bootstrap-secrets";

describe("consumeDaemonBootstrapSecrets", () => {
  it("removes private bootstrap values before child processes inherit env", () => {
    const env: NodeJS.ProcessEnv = {
      ANGEL_MAIN_BRIDGE_SECRET: "bridge-secret",
      ANGEL_MOBILE_PASSWORD: "mobile-secret",
      PATH: "/usr/bin",
    };

    expect(consumeDaemonBootstrapSecrets(env)).toEqual({
      internalBridgeSecret: "bridge-secret",
      mobilePassword: "mobile-secret",
    });
    expect(env).toEqual({ PATH: "/usr/bin" });
  });

  it("also removes empty bootstrap variables", () => {
    const env: NodeJS.ProcessEnv = {
      ANGEL_MAIN_BRIDGE_SECRET: "",
      ANGEL_MOBILE_PASSWORD: "",
    };

    expect(consumeDaemonBootstrapSecrets(env)).toEqual({
      internalBridgeSecret: undefined,
      mobilePassword: undefined,
    });
    expect(env).toEqual({});
  });
});
