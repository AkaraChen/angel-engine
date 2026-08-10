/** Compile blocked Host patterns once when the daemon starts. */
export function compileBlockedHostPatterns(
  patterns: readonly string[],
): readonly RegExp[] {
  return patterns.map((pattern) => new RegExp(pattern));
}

/**
 * Match the lower-cased Host header without stripping its port. Missing Host
 * headers match as an empty string, so callers can explicitly block them with
 * a pattern such as `^$`.
 */
export function isHostBlocked(
  hostHeader: string | undefined,
  patterns: readonly RegExp[],
): boolean {
  const host = (hostHeader ?? "").toLowerCase();
  return patterns.some((pattern) => pattern.test(host));
}
