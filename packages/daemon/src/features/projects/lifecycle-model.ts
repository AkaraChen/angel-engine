import type {
  ProjectLifecycleFailure,
  ProjectLifecycleKind,
  ProjectLifecycleSnapshot,
  ProjectRunLifecycleState,
  ProjectSetupLifecycleState,
  ProjectTeardownLifecycleState,
} from "@angel-engine/daemon-api/projects";

import { PROJECT_CONFIG_FILE } from "./config";

export const ERROR_TAIL_LENGTH = 4096;
export const LOG_TAIL_LENGTH = 1024 * 1024;

export class ProjectLifecycleConflictError extends Error {
  readonly kind: ProjectLifecycleKind;

  constructor(kind: ProjectLifecycleKind) {
    super(`A ${kind} lifecycle is already active for this worktree.`);
    this.name = "ProjectLifecycleConflictError";
    this.kind = kind;
  }
}

export class ProjectLifecycleExecutionError extends Error {
  readonly failure: ProjectLifecycleFailure;

  constructor(
    message: string,
    failure: ProjectLifecycleFailure,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ProjectLifecycleExecutionError";
    this.failure = failure;
  }
}

export function initialLifecycleSnapshot(): ProjectLifecycleSnapshot {
  return {
    run: { status: "stopped" },
    setup: { status: "idle" },
    teardown: { status: "idle" },
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

export function recoverInterruptedLifecycleSnapshot(
  snapshot: ProjectLifecycleSnapshot,
): ProjectLifecycleSnapshot {
  const recovered = cloneLifecycleSnapshot(snapshot);
  const restartFailure = lifecycleFailure(
    "daemon_restart",
    "Daemon stopped while the lifecycle was active.",
  );
  if (recovered.setup.status === "running") {
    recovered.setup = {
      ...recovered.setup,
      failure: restartFailure,
      status: "failed",
    };
  }
  if (
    recovered.run.status === "running" ||
    recovered.run.status === "starting"
  ) {
    recovered.run = { failure: restartFailure, status: "failed" };
  }
  if (recovered.teardown.status === "running") {
    recovered.teardown = {
      ...recovered.teardown,
      failure: restartFailure,
      status: "failed",
    };
  }
  return recovered;
}

export function isLifecycleSnapshot(
  value: unknown,
): value is ProjectLifecycleSnapshot {
  if (!isRecord(value) || value.version !== 1 || !isIsoDate(value.updatedAt)) {
    return false;
  }
  if (
    value.approvedDigest !== undefined &&
    typeof value.approvedDigest !== "string"
  ) {
    return false;
  }
  return (
    isSetupState(value.setup) &&
    isRunState(value.run) &&
    isTeardownState(value.teardown)
  );
}

export function lifecycleFailure(
  reason: ProjectLifecycleFailure["reason"],
  message: string,
  exitCode: number | null = null,
  signal: string | null = null,
): ProjectLifecycleFailure {
  return { exitCode, message, reason, signal };
}

export function lifecycleFailureFrom(cause: unknown): ProjectLifecycleFailure {
  return cause instanceof ProjectLifecycleExecutionError
    ? cause.failure
    : lifecycleFailure("spawn", errorMessage(cause));
}

export function lifecycleScriptError(
  kind: "setup" | "teardown",
  command: string,
  structured: ProjectLifecycleFailure,
  cause: unknown,
) {
  return new ProjectLifecycleExecutionError(
    `${PROJECT_CONFIG_FILE} ${kind}_script failed (${tail(command, ERROR_TAIL_LENGTH)}): ${tail(structured.message, ERROR_TAIL_LENGTH)}`,
    structured,
    cause,
  );
}

export function cancelledLifecycleError() {
  return new ProjectLifecycleExecutionError(
    "Lifecycle was cancelled.",
    lifecycleFailure("cancelled", "Lifecycle was cancelled."),
  );
}

export function throwIfLifecycleCancelled(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw cancelledLifecycleError();
}

export function cloneLifecycleSnapshot(snapshot: ProjectLifecycleSnapshot) {
  return structuredClone(snapshot);
}

export function tail(value: string, length: number) {
  return value.length <= length ? value : value.slice(-length);
}

export function errorCode(cause: unknown) {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string"
  ) {
    return cause.code;
  }
  return undefined;
}

function isSetupState(value: unknown): value is ProjectSetupLifecycleState {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "idle") return true;
  if (value.status === "ready") return isIsoDate(value.completedAt);
  return (
    isStepState(value) &&
    (value.status === "running" ||
      (value.status === "failed" && isFailure(value.failure)))
  );
}

function isTeardownState(
  value: unknown,
): value is ProjectTeardownLifecycleState {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "idle") return true;
  if (value.status === "done") return isIsoDate(value.completedAt);
  return (
    isStepState(value) &&
    (value.status === "running" ||
      (value.status === "failed" && isFailure(value.failure)))
  );
}

function isRunState(value: unknown): value is ProjectRunLifecycleState {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "stopped") return true;
  if (value.status === "starting") return isPort(value.port);
  if (value.status === "running") {
    return (
      isPort(value.port) &&
      Number.isInteger(value.pid) &&
      Number(value.pid) > 0 &&
      (value.url === undefined || typeof value.url === "string")
    );
  }
  if (value.status === "exited") {
    return isNullableInteger(value.exitCode) && isNullableString(value.signal);
  }
  return value.status === "failed" && isFailure(value.failure);
}

function isStepState(value: Record<string, unknown>) {
  return (
    typeof value.command === "string" &&
    Number.isInteger(value.step) &&
    Number.isInteger(value.stepCount) &&
    Number(value.step) > 0 &&
    Number(value.stepCount) >= Number(value.step)
  );
}

function isFailure(value: unknown): value is ProjectLifecycleFailure {
  if (!isRecord(value)) return false;
  return (
    [
      "cancelled",
      "daemon_restart",
      "exit",
      "signal",
      "spawn",
      "timeout",
    ].includes(String(value.reason)) &&
    typeof value.message === "string" &&
    isNullableInteger(value.exitCode) &&
    isNullableString(value.signal)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNullableInteger(value: unknown) {
  return value === null || Number.isInteger(value);
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isPort(value: unknown) {
  return (
    Number.isInteger(value) && Number(value) > 0 && Number(value) <= 65_535
  );
}

function errorMessage(cause: unknown) {
  return cause instanceof Error && cause.message.length > 0
    ? cause.message
    : "Unknown error.";
}
