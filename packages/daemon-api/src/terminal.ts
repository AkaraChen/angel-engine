export interface TerminalCreateInput {
  cols: number;
  cwd: string;
  rows: number;
  sessionId?: string;
}

export interface TerminalCreateRequest extends TerminalCreateInput {
  sessionId: string;
}

export interface TerminalWriteInput {
  data: string;
  sessionId: string;
}

export interface TerminalResizeInput {
  cols: number;
  rows: number;
  sessionId: string;
}

export interface TerminalDisposeInput {
  sessionId: string;
}

export interface TerminalKillInput {
  sessionId: string;
}

export type TerminalEvent =
  | { data: string; type: "data" }
  | { data: string; type: "replay" }
  | { exitCode?: number; signal?: number; type: "exit" }
  | { message: string; type: "error" };

export type TerminalClientMessage =
  | ({ type: "create" } & TerminalCreateRequest)
  | ({ type: "write" } & TerminalWriteInput)
  | ({ type: "resize" } & TerminalResizeInput)
  | ({ type: "dispose" } & TerminalDisposeInput)
  | ({ type: "kill" } & TerminalKillInput);

export interface TerminalSessionController {
  dispose: () => void;
  kill: () => void;
  resize: (input: Omit<TerminalResizeInput, "sessionId">) => void;
  sessionId: string;
  write: (data: string) => void;
}

export interface TerminalApi {
  create: (
    input: TerminalCreateInput,
    onEvent: (event: TerminalEvent) => void,
  ) => TerminalSessionController;
  kill: (input: TerminalKillInput) => void;
}

export function parseTerminalClientMessage(
  value: unknown,
): TerminalClientMessage {
  if (!is.plainObject(value) || !is.nonEmptyString(value.type)) {
    throw new TypeError("Terminal message type is required.");
  }
  const sessionId = requiredString(value.sessionId, "Terminal session id");
  if (value.type === "create") {
    return {
      cols: requiredDimension(value.cols),
      cwd: requiredString(value.cwd, "Terminal cwd"),
      rows: requiredDimension(value.rows),
      sessionId,
      type: "create",
    };
  }
  if (value.type === "write") {
    if (typeof value.data !== "string") {
      throw new TypeError("Terminal input data is required.");
    }
    return { data: value.data, sessionId, type: "write" };
  }
  if (value.type === "resize") {
    return {
      cols: requiredDimension(value.cols),
      rows: requiredDimension(value.rows),
      sessionId,
      type: "resize",
    };
  }
  if (value.type === "dispose" || value.type === "kill") {
    return value.type === "dispose"
      ? { sessionId, type: "dispose" }
      : { sessionId, type: "kill" };
  }
  throw new TypeError(`Unknown terminal message type: ${value.type}.`);
}

function requiredString(value: unknown, label: string) {
  if (!is.nonEmptyString(value)) throw new TypeError(`${label} is required.`);
  return value;
}

function requiredDimension(value: unknown) {
  if (!is.number(value) || !Number.isFinite(value) || value < 1) {
    throw new TypeError("Terminal dimensions must be positive numbers.");
  }
  return value;
}
import is from "@sindresorhus/is";
