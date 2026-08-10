import { spawn } from "node:child_process";
import type { ZodType } from "zod";

export class UsageCollectionError extends Error {
  constructor(
    readonly reason:
      | "binary-missing"
      | "exec-failed"
      | "schema-mismatch"
      | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "UsageCollectionError";
  }
}

export async function runCcusageJson<T>(
  binaryPath: string,
  args: string[],
  schema: ZodType<T>,
  timeoutMs = 20_000,
): Promise<T> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(binaryPath, [...args, "--json", "--offline"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new UsageCollectionError("timeout", "ccusage timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new UsageCollectionError("exec-failed", error.message));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new UsageCollectionError(
            "exec-failed",
            Buffer.concat(stderr).toString("utf8").trim() ||
              `ccusage exited with status ${code ?? "unknown"}.`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });

  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    throw new UsageCollectionError(
      "schema-mismatch",
      "ccusage returned invalid JSON.",
    );
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new UsageCollectionError(
      "schema-mismatch",
      result.error.issues[0]?.message ?? "ccusage output schema changed.",
    );
  }
  return result.data;
}
