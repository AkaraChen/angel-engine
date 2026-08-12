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
