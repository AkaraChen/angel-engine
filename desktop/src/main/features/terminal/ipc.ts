import type { WebContents } from "electron";
import type { IPty } from "node-pty";

import type {
  TerminalCreateRequest,
  TerminalDisposeInput,
  TerminalEvent,
  TerminalKillInput,
  TerminalResizeInput,
  TerminalWriteInput,
} from "../../../shared/terminal";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type } from "arktype";
import { ipcMain } from "electron";
import log from "electron-log/main";
import * as pty from "node-pty";

import {
  TERMINAL_CREATE_CHANNEL,
  TERMINAL_DISPOSE_CHANNEL,
  TERMINAL_KILL_CHANNEL,
  TERMINAL_RESIZE_CHANNEL,
  TERMINAL_WRITE_CHANNEL,
  terminalEventChannel,
} from "../../../shared/terminal";

interface TerminalSession {
  ptyProcess: IPty;
  scrollback: string[];
  subscribers: Set<WebContents>;
}

const terminalSessions = new Map<string, TerminalSession>();
const terminalScrollbackLimit = 1_000;

const nonEmptyTrimmedString = type("string.trim").to("string > 0");
const finiteNumber = type("number").narrow(
  (value, ctx) => Number.isFinite(value) || ctx.mustBe("finite"),
);
const terminalDimension = finiteNumber
  .pipe((value) => Math.max(1, Math.floor(value)))
  .to("number");

const terminalCreateInput = type({
  "+": "ignore",
  cols: terminalDimension,
  cwd: nonEmptyTrimmedString,
  rows: terminalDimension,
  sessionId: nonEmptyTrimmedString,
});

const terminalWriteInput = type({
  "+": "ignore",
  data: "string",
  sessionId: nonEmptyTrimmedString,
});

const terminalResizeInput = type({
  "+": "ignore",
  cols: terminalDimension,
  rows: terminalDimension,
  sessionId: nonEmptyTrimmedString,
});

const terminalDisposeInput = type({
  "+": "ignore",
  sessionId: nonEmptyTrimmedString,
});

const terminalKillInput = type({
  "+": "ignore",
  sessionId: nonEmptyTrimmedString,
});

export function registerTerminalIpc() {
  ipcMain.handle(TERMINAL_CREATE_CHANNEL, (event, input: unknown) => {
    const request = parseTerminalCreateRequest(input);
    const existingSession = terminalSessions.get(request.sessionId);
    if (existingSession) {
      attachTerminalSubscriber(
        existingSession,
        event.sender,
        request.sessionId,
      );
      existingSession.ptyProcess.resize(request.cols, request.rows);
      return { sessionId: request.sessionId };
    }

    let shell: ReturnType<typeof defaultShell>;
    let cwd: string;
    let ptyProcess: IPty;
    try {
      shell = defaultShell();
      cwd = resolveTerminalCwd(request.cwd);
      ptyProcess = pty.spawn(shell.file, shell.args, {
        cols: request.cols,
        cwd,
        env: {
          ...process.env,
          COLORTERM: "truecolor",
          TERM: "xterm-256color",
        },
        name: "xterm-256color",
        rows: request.rows,
      });
    } catch (error) {
      const message = `Failed to start terminal: ${errorMessage(error)}`;
      log.warn("Could not start terminal.", {
        cols: request.cols,
        cwd: resolveTerminalCwd(request.cwd),
        platform: process.platform,
        rows: request.rows,
        shell: safeDefaultShell(),
      });
      log.warn(error);
      event.sender.send(terminalEventChannel(request.sessionId), {
        message,
        type: "error",
      });
      return { sessionId: request.sessionId };
    }
    const session: TerminalSession = {
      ptyProcess,
      scrollback: [],
      subscribers: new Set(),
    };

    terminalSessions.set(request.sessionId, session);
    attachTerminalSubscriber(session, event.sender, request.sessionId);
    ptyProcess.onData((data) => {
      pushTerminalScrollback(session, data);
      emitTerminalEvent(session, request.sessionId, { data, type: "data" });
    });
    ptyProcess.onExit(({ exitCode, signal }) => {
      terminalSessions.delete(request.sessionId);
      emitTerminalEvent(session, request.sessionId, {
        exitCode,
        signal,
        type: "exit",
      });
    });

    return { sessionId: request.sessionId };
  });

  ipcMain.handle(TERMINAL_WRITE_CHANNEL, (_event, input: unknown) => {
    const request = parseTerminalWriteInput(input);
    terminalSessions.get(request.sessionId)?.ptyProcess.write(request.data);
    return { ok: true };
  });

  ipcMain.handle(TERMINAL_RESIZE_CHANNEL, (_event, input: unknown) => {
    const request = parseTerminalResizeInput(input);
    terminalSessions
      .get(request.sessionId)
      ?.ptyProcess.resize(request.cols, request.rows);
    return { ok: true };
  });

  ipcMain.handle(TERMINAL_DISPOSE_CHANNEL, (_event, input: unknown) => {
    const request = parseTerminalDisposeInput(input);
    const session = terminalSessions.get(request.sessionId);
    if (!session) {
      return { disposed: false };
    }

    session.subscribers.delete(_event.sender);
    return { disposed: true };
  });

  ipcMain.handle(TERMINAL_KILL_CHANNEL, (_event, input: unknown) => {
    const request = parseTerminalKillInput(input);
    return { killed: killTerminalSession(request.sessionId) };
  });
}

function attachTerminalSubscriber(
  session: TerminalSession,
  owner: WebContents,
  sessionId: string,
) {
  session.subscribers.add(owner);
  owner.once("destroyed", () => {
    session.subscribers.delete(owner);
  });
  if (session.scrollback.length > 0 && !owner.isDestroyed()) {
    owner.send(terminalEventChannel(sessionId), {
      data: session.scrollback.join(""),
      type: "replay",
    });
  }
}

type TerminalBroadcastEvent = Extract<TerminalEvent, { type: "data" | "exit" }>;

function emitTerminalEvent(
  session: TerminalSession,
  sessionId: string,
  event: TerminalBroadcastEvent,
) {
  for (const subscriber of session.subscribers) {
    if (subscriber.isDestroyed()) {
      session.subscribers.delete(subscriber);
      continue;
    }
    subscriber.send(terminalEventChannel(sessionId), event);
  }
}

function pushTerminalScrollback(session: TerminalSession, data: string) {
  session.scrollback.push(data);
  if (session.scrollback.length > terminalScrollbackLimit) {
    session.scrollback.splice(
      0,
      session.scrollback.length - terminalScrollbackLimit,
    );
  }
}

function killTerminalSession(sessionId: string) {
  const session = terminalSessions.get(sessionId);
  if (!session) return false;
  terminalSessions.delete(sessionId);
  session.ptyProcess.kill();
  return true;
}

function defaultShell() {
  switch (process.platform) {
    case "aix":
    case "android":
    case "freebsd":
    case "haiku":
    case "openbsd":
    case "sunos":
    case "cygwin":
    case "netbsd":
      throw new Error(`Unsupported terminal platform: ${process.platform}`);
    case "darwin":
      return { args: ["-l"], file: "/bin/zsh" };
    case "linux":
      return { args: [], file: "/bin/bash" };
    case "win32":
      return { args: ["-NoLogo"], file: "powershell.exe" };
  }
}

function safeDefaultShell() {
  try {
    return defaultShell();
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resolveTerminalCwd(input: string) {
  const cwd = path.resolve(input);
  try {
    if (fs.statSync(cwd).isDirectory()) {
      return cwd;
    }
  } catch {
    return os.homedir();
  }
  return os.homedir();
}

export function parseTerminalCreateRequest(
  input: unknown,
): TerminalCreateRequest {
  const value = terminalCreateInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseTerminalWriteInput(input: unknown): TerminalWriteInput {
  const value = terminalWriteInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseTerminalResizeInput(input: unknown): TerminalResizeInput {
  const value = terminalResizeInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseTerminalDisposeInput(
  input: unknown,
): TerminalDisposeInput {
  const value = terminalDisposeInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseTerminalKillInput(input: unknown): TerminalKillInput {
  const value = terminalKillInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}
