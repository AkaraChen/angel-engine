import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Derives the session token handed to a mobile client after it proves knowledge
 * of the configured mobile password.
 *
 * The token is a deterministic function of the password, so it survives daemon
 * restarts (the mobile app keeps working without re-entering the password until
 * the password itself changes) without the daemon persisting any session state.
 * It never reveals the password: recovering the password from the token would
 * require breaking SHA-256. Changing the password invalidates every previously
 * issued token.
 */
export function deriveMobileToken(password: string): string {
  return createHash("sha256")
    .update(`angel-mobile-session:${password}`)
    .digest("base64url");
}

/** Constant-time string comparison that tolerates unequal lengths. */
export function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

/** Extracts the password from a pairing request body, or undefined if invalid. */
export function parsePairBody(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const password = (value as { password?: unknown }).password;
  return typeof password === "string" ? password : undefined;
}
