const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi;

export function redactSourceControlText(
  value: string,
  secrets: readonly string[] = [],
): string {
  let redacted = value.replace(URL_CREDENTIALS, "$1[REDACTED]@");
  for (const secret of secrets) {
    if (secret.length > 0) redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted;
}

export function sanitizeSourceControlText(
  value: string,
  secrets: readonly string[] = [],
): string {
  let sanitized = value.replace(URL_CREDENTIALS, "$1");
  for (const secret of secrets) {
    if (secret.length > 0)
      sanitized = sanitized.replaceAll(secret, "[REDACTED]");
  }
  return sanitized;
}

export function errorText(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  return "Provider operation failed with a non-Error value.";
}

export function redactSourceControlValue<A>(
  value: A,
  secrets: readonly string[] = [],
): A {
  const serialized = JSON.stringify(value);
  return JSON.parse(redactSourceControlText(serialized, secrets)) as A;
}

export function sanitizeSourceControlValue<A>(
  value: A,
  secrets: readonly string[] = [],
): A {
  const serialized = JSON.stringify(value);
  return JSON.parse(sanitizeSourceControlText(serialized, secrets)) as A;
}
