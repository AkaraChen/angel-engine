import { stat } from "node:fs/promises";
import path from "node:path";
import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { PathLauncherTargetRef } from "@shared/path-launcher";
import is from "@sindresorhus/is";
import { daemonClient } from "../../daemon/client";

interface PathLauncherTargetDependencies {
  getChat: (id: string) => Promise<Chat | null>;
  getProject: (id: string) => Promise<Project | null>;
  isDirectory: (candidate: string) => Promise<boolean>;
}

const defaultDependencies: PathLauncherTargetDependencies = {
  getChat: (id) => daemonClient.chats.get(id),
  getProject: (id) => daemonClient.projects.get(id),
  isDirectory: async (candidate) => {
    try {
      return (await stat(candidate)).isDirectory();
    } catch {
      return false;
    }
  },
};

export async function resolvePathLauncherTarget(
  ref: PathLauncherTargetRef,
  dependencies: PathLauncherTargetDependencies = defaultDependencies,
): Promise<string> {
  const project = await dependencies.getProject(ref.projectId);
  if (project === null) throw new Error("Project not found.");

  let target = project.path;
  if (is.nonEmptyString(ref.chatId)) {
    const chat = await dependencies.getChat(ref.chatId);
    if (chat === null) throw new Error("Chat not found.");
    if (chat.projectId !== project.id) {
      throw new Error("Chat does not belong to this project.");
    }
    if (is.nonEmptyString(chat.cwd)) target = chat.cwd;
  }

  if (!path.isAbsolute(target) || !(await dependencies.isDirectory(target))) {
    throw new Error("Workspace directory is unavailable.");
  }
  return target;
}

export type { PathLauncherTargetDependencies };
