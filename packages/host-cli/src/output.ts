export interface OutputOptions {
  json: boolean;
  quiet: boolean;
}

/** Print command result. Never logs tokens. */
export function writeResult(
  value: unknown,
  options: OutputOptions,
  stream: NodeJS.WritableStream = process.stdout,
): void {
  if (options.json) {
    stream.write(`${JSON.stringify(value, null, 0)}\n`);
    return;
  }
  if (options.quiet) {
    stream.write(`${quietIds(value)}\n`);
    return;
  }
  stream.write(`${formatHuman(value)}\n`);
}

export function writeError(
  message: string,
  stream: NodeJS.WritableStream = process.stderr,
): void {
  stream.write(`${message}\n`);
}

function quietIds(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (
          typeof entry === "object" &&
          entry !== null &&
          "id" in entry &&
          typeof (entry as { id: unknown }).id === "string"
        ) {
          return (entry as { id: string }).id;
        }
        return "";
      })
      .filter((id) => id.length > 0)
      .join("\n");
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatHuman(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  return JSON.stringify(value, null, 2);
}
