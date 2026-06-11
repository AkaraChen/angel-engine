export const TERMINAL_CREATE_CHANNEL = "terminal:create";
export const TERMINAL_DISPOSE_CHANNEL = "terminal:dispose";
export const TERMINAL_KILL_CHANNEL = "terminal:kill";
export const TERMINAL_RESIZE_CHANNEL = "terminal:resize";
export const TERMINAL_WRITE_CHANNEL = "terminal:write";

export function terminalEventChannel(sessionId: string) {
  return `terminal:event:${sessionId}`;
}

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
