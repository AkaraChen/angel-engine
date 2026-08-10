import type { ProjectLifecycleKind } from "@angel-engine/daemon-api/projects";

import {
  ProjectLifecycleRuntime,
  type ProjectLifecycleExecutionOptions,
} from "./lifecycle-runtime";

export type {
  ProjectLifecycleFailure,
  ProjectLifecycleKind,
  ProjectLifecycleSnapshot,
} from "@angel-engine/daemon-api/projects";
export {
  ProjectLifecycleConflictError,
  ProjectLifecycleExecutionError,
} from "./lifecycle-model";
export {
  lifecycleEnvironment,
  type InteractiveLifecycleProcessSession,
  type LifecycleProcessAdapter,
  type LifecycleProcessExit,
  type LifecycleProcessSession,
  type LifecycleProcessStartOptions,
  SpawnLifecycleProcessAdapter,
  terminateProcessTree,
} from "./lifecycle-process";
export {
  ProjectLifecycleRuntime,
  type ProjectLifecycleExecutionOptions,
  type ProjectLifecycleExecutionResult,
  type ProjectLifecycleRuntimeOptions,
  type ProjectRunStartResult,
} from "./lifecycle-runtime";

const defaultRuntime = new ProjectLifecycleRuntime();

export function executeProjectLifecycle(
  kind: "setup" | "teardown",
  options: ProjectLifecycleExecutionOptions,
) {
  return defaultRuntime.execute(kind, options);
}

export function startProjectRun(options: ProjectLifecycleExecutionOptions) {
  return defaultRuntime.startRun(options);
}

export function stopProjectRun(worktreePath: string) {
  return defaultRuntime.stopRun(worktreePath);
}

export function shutdownProjectRuns() {
  return defaultRuntime.shutdown();
}

export function readProjectLifecycleSnapshot(worktreePath: string) {
  return defaultRuntime.snapshot(worktreePath);
}

export function readProjectLifecycleLog(
  worktreePath: string,
  kind: ProjectLifecycleKind,
) {
  return defaultRuntime.log(worktreePath, kind);
}
