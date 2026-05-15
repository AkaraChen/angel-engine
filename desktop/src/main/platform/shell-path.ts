import { execFileSync } from "node:child_process";

const isMacOS = process.platform === "darwin";

export function restoreShellPath() {
  if (!isMacOS) {
    return;
  }

  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const shellPath = execFileSync(shell, ["-l", "-c", 'printf %s "$PATH"'], {
      encoding: "utf8",
      timeout: 5000,
    });
    process.env.PATH = mergePathEntries(shellPath, process.env.PATH);
  } catch {
    process.env.PATH = mergePathEntries(
      process.env.PATH,
      "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/sbin:/sbin",
      `${process.env.HOME ?? ""}/.local/bin`,
    );
  }
}

export function mergePathEntries(...paths: Array<string | undefined>) {
  const entries = paths
    .flatMap((value) => value?.split(":") ?? [])
    .filter((entry) => entry !== "")
    .filter(Boolean);

  return Array.from(new Set(entries)).join(":");
}
