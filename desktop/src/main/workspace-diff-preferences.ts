import type {
  WorkspaceDiffBasePreference,
  WorkspaceDiffBasePreferenceInput,
} from "../shared/workspace-diff-preferences";

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import is from "@sindresorhus/is";
import { app, ipcMain } from "electron";
import log from "electron-log/main";

import {
  DESKTOP_WORKSPACE_DIFF_BASE_GET_CHANNEL,
  DESKTOP_WORKSPACE_DIFF_BASE_SET_CHANNEL,
} from "../shared/workspace-diff-preferences";

const baseKinds = new Set([
  "branch",
  "session",
  "turn",
  "unstaged",
  "worktree",
]);

let didRegisterIpc = false;

export function registerWorkspaceDiffPreferencesIpc() {
  if (didRegisterIpc) return;
  didRegisterIpc = true;
  ipcMain.handle(DESKTOP_WORKSPACE_DIFF_BASE_GET_CHANNEL, (_event, root) =>
    is.nonEmptyString(root) ? readWorkspaceDiffBasePreference(root) : undefined,
  );
  ipcMain.handle(DESKTOP_WORKSPACE_DIFF_BASE_SET_CHANNEL, (_event, input) => {
    if (!isWorkspaceDiffBasePreferenceInput(input)) return;
    writeWorkspaceDiffBasePreference(input);
  });
}

export function readWorkspaceDiffBasePreference(
  root: string,
): WorkspaceDiffBasePreference | undefined {
  try {
    const stored = JSON.parse(readFileSync(preferencesPath(), "utf8"));
    if (!is.plainObject(stored) || !is.plainObject(stored[root])) {
      return undefined;
    }
    const preference = stored[root];
    if (!isWorkspaceDiffBasePreference(preference)) return undefined;
    return preference;
  } catch {
    return undefined;
  }
}

export function writeWorkspaceDiffBasePreference(
  input: WorkspaceDiffBasePreferenceInput,
) {
  let stored: Record<string, WorkspaceDiffBasePreference> = {};
  try {
    const parsed = JSON.parse(readFileSync(preferencesPath(), "utf8"));
    if (is.plainObject(parsed)) {
      stored = Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, WorkspaceDiffBasePreference] =>
            isWorkspaceDiffBasePreference(entry[1]),
        ),
      );
    }
  } catch {
    // A missing or corrupt preferences file starts fresh.
  }
  stored[input.root] = {
    baseKind: input.baseKind,
    branchRef: input.branchRef,
  };
  try {
    writeFileSync(preferencesPath(), `${JSON.stringify(stored, null, 2)}\n`);
  } catch (error: unknown) {
    log.warn("Could not persist the workspace diff base preference.", error);
  }
}

function preferencesPath() {
  return path.join(app.getPath("userData"), "workspace-diff-base.json");
}

function isWorkspaceDiffBasePreferenceInput(
  value: unknown,
): value is WorkspaceDiffBasePreferenceInput {
  return (
    is.plainObject(value) &&
    is.nonEmptyString(value.root) &&
    isWorkspaceDiffBasePreference(value)
  );
}

function isWorkspaceDiffBasePreference(
  value: unknown,
): value is WorkspaceDiffBasePreference {
  return (
    is.plainObject(value) &&
    is.string(value.baseKind) &&
    baseKinds.has(value.baseKind) &&
    (value.branchRef === undefined || is.nonEmptyString(value.branchRef))
  );
}
