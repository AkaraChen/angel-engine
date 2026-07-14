import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
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
export async function createMobileAuth(password: string): Promise<MobileAuth> {
  const salt = randomBytes(16);
  return {
    salt,
    sessionToken: randomBytes(32).toString("base64url"),
    verifier: await passwordVerifier(password, salt),
  };
}

/** Always runs scrypt, including for malformed or differently-sized input. */
export async function verifyMobilePassword(
  password: string,
  auth: MobileAuth,
): Promise<boolean> {
  const candidate = await passwordVerifier(password, auth.salt);
  return timingSafeEqual(candidate, auth.verifier);
}

async function passwordVerifier(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, VERIFIER_BYTES, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** Extracts the password from a pairing request body, or undefined if invalid. */
export function parsePairBody(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const password = (value as { password?: unknown }).password;
  return typeof password === "string" ? password : undefined;
}
