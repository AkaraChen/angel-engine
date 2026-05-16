import { execFileSync } from "node:child_process";

const isMacOS = process.platform === "darwin";

export function restoreShellPath() {
  if (!isMacOS) {
    return;
  }

  try {
    const shell = process.env.SHELL;
    if (!shell) {
      throw new Error("SHELL is not set.");
    }
    const shellPath = execFileSync(shell, ["-l", "-c", 'printf %s "$PATH"'], {
      encoding: "utf8",
      timeout: 5000,
    });
    process.env.PATH = mergePathEntries(shellPath, process.env.PATH);
  } catch {
    const homeLocalBin = process.env.HOME
      ? `${process.env.HOME}/.local/bin`
      : undefined;
    process.env.PATH = mergePathEntries(
      process.env.PATH,
      "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/sbin:/sbin",
      homeLocalBin,
    );
  }
}

export function mergePathEntries(...paths: Array<string | undefined>) {
  const entries = paths.flatMap((value) => {
    if (value === undefined) return [];
    return value.split(":").filter((entry) => entry !== "");
  });

  return Array.from(new Set(entries)).join(":");
}
