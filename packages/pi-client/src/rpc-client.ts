import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { SessionProcessIdListener } from "@angel-engine/js-client";
import type {
  RpcCommand,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  RpcResponse,
  RpcSessionState,
} from "@earendil-works/pi-coding-agent";
import type {
  PiAgentMessage,
  PiAgentSessionEvent,
  PiSdkRpcClient,
  PiThinkingLevel,
} from "./types.js";

import { spawn } from "node:child_process";
import { piAgentEntryPath } from "./pi-agent-entry-path.js";

type RpcEventListener = (event: PiAgentSessionEvent) => void;
type PiRpcModelInfo = Awaited<
  ReturnType<PiSdkRpcClient["getAvailableModels"]>
>[number];

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (response: RpcResponse) => void;
  timeout: NodeJS.Timeout;
}

interface AgentEndWaiter {
  reject: (error: Error) => void;
  resolve: () => void;
}

export interface PiRpcClientOptions {
  cwd: string;
  remoteId?: string;
  onProcessId: SessionProcessIdListener;
}

export class PiRpcClient {
  private readonly agentEndWaiters = new Set<AgentEndWaiter>();
  private readonly eventListeners = new Set<RpcEventListener>();
  private readonly options: PiRpcClientOptions;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private child?: ChildProcessWithoutNullStreams;
  private childAbortController?: AbortController;
  private exitError?: Error;
  private requestId = 0;
  private stderr = "";
  private stdoutBuffer = "";

  constructor(options: PiRpcClientOptions) {
    this.options = options;
  }

  processId(): number | undefined {
    const child = this.child;
    return child && !child.killed && child.exitCode === null
      ? child.pid
      : undefined;
  }

  async start(): Promise<RpcSessionState> {
    if (this.child) throw new Error("Pi RPC client is already started.");

    const args = [piAgentEntryPath()];
    if (this.options.remoteId) args.push("--session", this.options.remoteId);
    const abortController = new AbortController();
    const child = spawn(process.execPath, args, {
      cwd: this.options.cwd,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      signal: abortController.signal,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.childAbortController = abortController;
    this.options.onProcessId(child.pid);

    child.stdout.on("data", (data: Buffer) => this.acceptStdout(data));
    child.stderr.on("data", (data: Buffer) => {
      this.stderr += data.toString();
    });
    child.once("error", (error) => this.fail(error));
    child.once("exit", (code, signal) => {
      const error = new Error(
        `Pi agent process exited (code=${code} signal=${signal}).${this.stderr ? ` Stderr: ${this.stderr}` : ""}`,
      );
      this.fail(error);
    });

    try {
      return await this.getState();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    child.stdin.end();
    if (child.exitCode !== null || child.killed) return;

    this.childAbortController?.abort();
    await new Promise<void>((resolve) => {
      const forceKill = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 1_000);
      const giveUp = setTimeout(() => {
        if (this.child === child) {
          this.child = undefined;
          this.options.onProcessId(undefined);
        }
        resolve();
      }, 5_000);
      child.once("exit", () => {
        clearTimeout(forceKill);
        clearTimeout(giveUp);
        resolve();
      });
    });
  }

  onEvent(listener: RpcEventListener): () => void {
    this.eventListeners.add(listener);
    return (): void => {
      this.eventListeners.delete(listener);
    };
  }

  async prompt(
    message: string,
    images?: Parameters<PiSdkRpcClient["prompt"]>[1],
  ): Promise<void> {
    const idle = this.waitForAgentEnd();
    try {
      await this.send({ images, message, type: "prompt" });
      await idle.promise;
    } catch (error) {
      idle.cancel();
      throw error;
    }
  }

  async abort(): Promise<void> {
    await this.send({ type: "abort" });
  }

  async getState(): Promise<RpcSessionState> {
    return this.requestData({ type: "get_state" });
  }

  async getAvailableModels(): Promise<PiRpcModelInfo[]> {
    const data = await this.requestData<{ models: PiRpcModelInfo[] }>({
      type: "get_available_models",
    });
    return data.models;
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    await this.send({ modelId, provider, type: "set_model" });
  }

  async setThinkingLevel(level: PiThinkingLevel): Promise<void> {
    await this.send({ level, type: "set_thinking_level" });
  }

  async getMessages(): Promise<PiAgentMessage[]> {
    const data = await this.requestData<{ messages: PiAgentMessage[] }>({
      type: "get_messages",
    });
    return data.messages;
  }

  private waitForAgentEnd(): { cancel: () => void; promise: Promise<void> } {
    let waiter: AgentEndWaiter | undefined;
    const promise = new Promise<void>((resolve, reject) => {
      waiter = { reject, resolve };
      this.agentEndWaiters.add(waiter);
    });
    return {
      cancel: (): void => {
        if (waiter) this.agentEndWaiters.delete(waiter);
      },
      promise,
    };
  }

  private async requestData<T>(command: RpcCommand): Promise<T> {
    const response = await this.send(command);
    if (!response.success) throw new Error(response.error);
    if (!("data" in response)) {
      throw new Error(`Pi RPC response for ${command.type} is missing data.`);
    }
    return response.data as T;
  }

  private send(command: RpcCommand): Promise<RpcResponse> {
    const child = this.child;
    if (!child)
      return Promise.reject(new Error("Pi RPC client is not started."));
    if (this.exitError) return Promise.reject(this.exitError);

    const id = `req_${++this.requestId}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timed out waiting for Pi RPC ${command.type}.`));
      }, 30_000);
      this.pendingRequests.set(id, { reject, resolve, timeout });
      child.stdin.write(`${JSON.stringify({ ...command, id })}\n`, (error) => {
        if (!error) return;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);
        pending.reject(error);
      });
    });
  }

  private acceptStdout(data: Buffer): void {
    this.stdoutBuffer += data.toString();
    for (;;) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.acceptLine(line);
    }
  }

  private acceptLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      this.fail(
        new Error(`Pi RPC emitted invalid JSON: ${line}`, { cause: error }),
      );
      return;
    }
    if (!isRpcMessage(value)) {
      this.fail(new Error("Pi RPC emitted a message without a type."));
      return;
    }

    if (value.type === "response") {
      if (!isRpcResponse(value)) {
        this.fail(new Error("Pi RPC emitted a malformed response."));
        return;
      }
      const response = value;
      const pending = this.pendingRequests.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.id);
      pending.resolve(response);
      return;
    }

    if (value.type === "extension_ui_request") {
      if (!isExtensionUiRequest(value)) {
        this.fail(
          new Error("Pi RPC emitted a malformed extension UI request."),
        );
        return;
      }
      this.answerExtensionUiRequest(value);
      return;
    }

    if (value.type === "extension_error") {
      this.stderr += `\nPi extension error: ${line}`;
      return;
    }

    if (!isPiAgentEvent(value)) {
      this.fail(
        new Error(`Pi RPC emitted an unsupported event: ${value.type}`),
      );
      return;
    }
    const event = value;
    for (const listener of this.eventListeners) listener(event);
    if (event.type === "agent_end") {
      for (const waiter of this.agentEndWaiters) waiter.resolve();
      this.agentEndWaiters.clear();
    }
  }

  private fail(error: Error): void {
    if (!this.exitError) this.exitError = error;
    const child = this.child;
    if (child) {
      this.child = undefined;
      this.childAbortController?.abort();
      this.childAbortController = undefined;
      this.options.onProcessId(undefined);
    }
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(this.exitError);
    }
    this.pendingRequests.clear();
    for (const waiter of this.agentEndWaiters) waiter.reject(this.exitError);
    this.agentEndWaiters.clear();
  }

  private answerExtensionUiRequest(request: RpcExtensionUIRequest): void {
    let response: RpcExtensionUIResponse | undefined;
    switch (request.method) {
      case "confirm":
        response = {
          confirmed: false,
          id: request.id,
          type: "extension_ui_response",
        };
        break;
      case "editor":
      case "input":
      case "select":
        response = {
          cancelled: true,
          id: request.id,
          type: "extension_ui_response",
        };
        break;
      case "notify":
      case "set_editor_text":
      case "setStatus":
      case "setTitle":
      case "setWidget":
        return;
    }
    if (!response) return;
    this.child?.stdin.write(`${JSON.stringify(response)}\n`);
  }
}

function isRpcMessage(value: unknown): value is { type: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function isRpcResponse(value: { type: string }): value is RpcResponse & {
  id: string;
} {
  return (
    value.type === "response" &&
    "id" in value &&
    typeof value.id === "string" &&
    "success" in value &&
    typeof value.success === "boolean"
  );
}

function isExtensionUiRequest(value: {
  type: string;
}): value is RpcExtensionUIRequest {
  if (
    value.type !== "extension_ui_request" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("method" in value) ||
    typeof value.method !== "string"
  ) {
    return false;
  }
  return [
    "confirm",
    "editor",
    "input",
    "notify",
    "select",
    "set_editor_text",
    "setStatus",
    "setTitle",
    "setWidget",
  ].includes(value.method);
}

function isPiAgentEvent(value: { type: string }): value is PiAgentSessionEvent {
  switch (value.type) {
    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "turn_end":
    case "message_start":
    case "message_update":
    case "message_end":
    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
    case "queue_update":
    case "compaction_start":
    case "compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
    case "session_info_changed":
    case "thinking_level_changed":
      return true;
    default:
      return false;
  }
}
