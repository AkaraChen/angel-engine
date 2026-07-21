import { describe, expect, it } from "vitest";
import { daemonStartupError } from "./startup-error";

describe("daemonStartupError", () => {
  it("turns an occupied listen address into an actionable error", () => {
    const stderr = `Error: listen EADDRINUSE: address already in use 0.0.0.0:14181
    at Server.setupListenHandle [as _listen2] (node:net:2009:16)`;

    expect(daemonStartupError(stderr, 1)).toBe(
      "Backend could not start because 0.0.0.0:14181 is already in use. Close the other Angel Engine instance or choose an automatic mobile hosting port.",
    );
  });

  it("keeps the exit code when no safe diagnostic is available", () => {
    expect(daemonStartupError("unexpected startup failure", 78)).toBe(
      "Backend exited before handshake with code 78.",
    );
  });
});
