import type {
  TerminalCreateRequest,
  TerminalEvent,
  TerminalResizeInput,
  TerminalWriteInput,
} from "@angel-engine/daemon-api/terminal";
import type { IPty } from "node-pty";
import type { WebSocket } from "ws";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pty from "node-pty";
import { parseTerminalClientMessage } from "@angel-engine/daemon-api/terminal";

interface TerminalSession {
  ptyProcess: IPty;
  scrollback: string[];
  subscribers: Set<WebSocket>;
}

export class TerminalManager {
  readonly #sessions = new Map<string, TerminalSession>();

  handle(socket: WebSocket, input: unknown) {
    const message = parseTerminalClientMessage(input);
    if (message.type === "create") return this.#create(socket, message);
    const session = this.#sessions.get(requireString(message.sessionId));
    if (message.type === "write") {
      session?.ptyProcess.write(message.data);
    } else if (message.type === "resize") {
      session?.ptyProcess.resize(
        dimension(message.cols),
        dimension(message.rows),
      );
    } else if (message.type === "kill") {
      session?.ptyProcess.kill();
    } else {
      session?.subscribers.delete(socket);
    }
  }

  close() {
    for (const session of this.#sessions.values()) session.ptyProcess.kill();
    this.#sessions.clear();
  }

  disconnect(socket: WebSocket) {
    for (const session of this.#sessions.values()) {
      session.subscribers.delete(socket);
    }
  }

  #create(socket: WebSocket, request: TerminalCreateRequest) {
    const sessionId = requireString(request.sessionId);
    const existing = this.#sessions.get(sessionId);
    if (existing !== undefined) {
      existing.subscribers.add(socket);
      existing.ptyProcess.resize(
        dimension(request.cols),
        dimension(request.rows),
      );
      if (existing.scrollback.length > 0) {
        send(socket, sessionId, {
          data: existing.scrollback.join(""),
          type: "replay",
        });
      }
      return;
    }

    const shell = defaultShell();
    const cwd = resolveCwd(requireString(request.cwd));
    const ptyProcess = pty.spawn(shell.file, shell.args, {
      cols: dimension(request.cols),
      cwd,
      env: { ...process.env, COLORTERM: "truecolor", TERM: "xterm-256color" },
      name: "xterm-256color",
      rows: dimension(request.rows),
    });
    const session: TerminalSession = {
      ptyProcess,
      scrollback: [],
      subscribers: new Set([socket]),
    };
    this.#sessions.set(sessionId, session);
    ptyProcess.onData((data) => {
      session.scrollback.push(data);
      if (session.scrollback.length > 1_000) session.scrollback.shift();
      this.#broadcast(sessionId, session, { data, type: "data" });
    });
    ptyProcess.onExit(({ exitCode, signal }) => {
      this.#sessions.delete(sessionId);
      this.#broadcast(sessionId, session, { exitCode, signal, type: "exit" });
    });
  }

  #broadcast(
    sessionId: string,
    session: TerminalSession,
    event: TerminalEvent,
  ) {
    for (const socket of session.subscribers) send(socket, sessionId, event);
  }
}

function send(socket: WebSocket, sessionId: string, event: TerminalEvent) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ event, sessionId }));
  }
}

function dimension(value: number) {
  if (!Number.isFinite(value))
    throw new TypeError("Terminal dimension is required.");
  return Math.max(1, Math.floor(value));
}

function requireString(value: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("A non-empty string is required.");
  }
  return value;
}

function resolveCwd(cwd: string) {
  return fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()
    ? cwd
    : os.homedir();
}

function defaultShell() {
  if (process.platform === "win32") {
    return { args: [], file: process.env.ComSpec ?? "cmd.exe" };
  }
  const file =
    process.env.SHELL ??
    (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  return { args: ["-l"], file: path.resolve(file) };
}
