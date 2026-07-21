import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { Effect } from "effect";

import { DaemonError } from "./platform/errors";

const VERIFIER_BYTES = 32;

export interface MobileAuth {
  salt: Buffer;
  sessionToken: string;
  verifier: Buffer;
}

/**
 * Builds an in-memory password verifier and an independent random session
 * credential. Neither value is derived into the other, so a recovered bearer
 * token cannot be used as an offline password oracle.
 */
export function createMobileAuth(
  password: string,
): Effect.Effect<MobileAuth, DaemonError> {
  return Effect.gen(function* () {
    const salt = randomBytes(16);
    return {
      salt,
      sessionToken: randomBytes(32).toString("base64url"),
      verifier: yield* passwordVerifier(password, salt),
    };
  });
}

/** Always runs scrypt, including for malformed or differently-sized input. */
export function verifyMobilePassword(
  password: string,
  auth: MobileAuth,
): Effect.Effect<boolean, DaemonError> {
  return Effect.map(passwordVerifier(password, auth.salt), (candidate) =>
    timingSafeEqual(candidate, auth.verifier),
  );
}

function passwordVerifier(
  password: string,
  salt: Buffer,
): Effect.Effect<Buffer, DaemonError> {
  return Effect.async<Buffer, DaemonError>((resume) => {
    scryptCallback(password, salt, VERIFIER_BYTES, (error, derivedKey) => {
      if (error) resume(Effect.fail(DaemonError.internal(error)));
      else resume(Effect.succeed(derivedKey));
    });
  });
}

/** Extracts the password from a pairing request body, or undefined if invalid. */
export function parsePairBody(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const password = (value as { password?: unknown }).password;
  return typeof password === "string" ? password : undefined;
}
