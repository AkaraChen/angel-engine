import { watchFile, unwatchFile } from "node:fs";

import { executeGit } from "../local-git/backend";
import { projectProviderConfigPath } from "./config-store";

async function gitPath(projectPath: string, name: "HEAD" | "config") {
  const result = await executeGit(projectPath, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    name,
  ]);
  return result.stdout.trim();
}

export async function watchSourceControlProject(
  projectPath: string,
  onInvalidate: () => void,
  interval = 250,
) {
  const paths = [
    projectProviderConfigPath(projectPath),
    ...(await Promise.all([
      gitPath(projectPath, "config"),
      gitPath(projectPath, "HEAD"),
    ]).catch(() => [])),
  ];
  let queued = false;
  const listener = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      onInvalidate();
    });
  };

  for (const watchedPath of paths) {
    watchFile(watchedPath, { interval, persistent: false }, listener);
  }
  return () => {
    for (const watchedPath of paths) unwatchFile(watchedPath, listener);
  };
}
