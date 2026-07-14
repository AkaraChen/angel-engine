import type {
  ChatLoadResult,
  ChatSendInput,
  ChatStreamEvent,
  CreateChatInput,
  DaemonAgentOption,
  DaemonChat,
  DaemonProject,
  ElicitationResolveInput,
} from "./chat-types";

/** The transport fields the client needs: where to reach the daemon + a token. */
export interface DaemonClientConfig {
  baseUrl: string;
  token: string | null;
}

/** Runtime hooks for the client (kept separate from serializable config). */
export interface DaemonClientOptions {
  /**
   * Called when any request is rejected with 401 — the paired session token is
   * no longer valid (e.g. the daemon restarted or the password changed), so the
   * app should drop it and prompt the user to pair again.
   */
  onUnauthorized?: () => void;
}

/**
 * Typed fetch client for the desktop daemon HTTP API.
 *
 * These DTOs mirror the daemon's `/api` response contract
 * (`packages/daemon/src/api.ts`). They are kept local because `mobile` is a
 * browser bundle and must not depend on `@angel-engine/daemon-api` (which
 * transitively pulls the native binding); treat this file as the HTTP boundary
 * for the daemon.
 */
export interface DaemonHealth {
  pid: number;
  uptime: number;
  version: string;
}

export interface ProcessRegistryEntry {
  pid: number;
  label?: string;
}

export interface ProcessRegistrySnapshot {
  entries: ProcessRegistryEntry[];
}

export class DaemonRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DaemonRequestError";
  }
}

export interface DaemonClient {
  readonly baseUrl: string;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  health: () => Promise<DaemonHealth>;
  listProcesses: () => Promise<ProcessRegistrySnapshot>;
  listChats: () => Promise<DaemonChat[]>;
  getChat: (chatId: string) => Promise<DaemonChat>;
  listProjects: () => Promise<DaemonProject[]>;
  listAgents: () => Promise<DaemonAgentOption[]>;
  createChat: (input: CreateChatInput) => Promise<DaemonChat>;
  /**
   * Load a chat's metadata + persisted transcript (`POST /api/chats/:id/load`).
   * The daemon hydrates the runtime session and returns its history.
   */
  loadChat: (chatId: string) => Promise<ChatLoadResult>;
  /**
   * Send a message and stream the assistant turn back over SSE
   * (`POST /api/chat-streams?streamId=…`). Yields {@link ChatStreamEvent}s as
   * they arrive. Pass `streamId` so the turn can be cancelled with
   * {@link DaemonClient.abortChatStream}; the `AbortSignal` cancels the fetch.
   */
  streamChat: (
    input: ChatSendInput,
    streamId: string,
    signal?: AbortSignal,
  ) => AsyncIterable<ChatStreamEvent>;
  /** Ask the daemon to abort an in-flight stream (`DELETE /api/chat-streams/:id`). */
  abortChatStream: (streamId: string) => Promise<void>;
  /**
   * Answer an elicitation the daemon raised mid-stream
   * (`POST /api/chat-streams/:id/elicitation`), letting the waiting turn proceed.
   */
  resolveElicitation: (
    streamId: string,
    input: ElicitationResolveInput,
  ) => Promise<void>;
}

/**
 * Parse a `ReadableStream` of an SSE (`text/event-stream`) response and yield the
 * JSON-decoded `data:` payload of each event. Per the SSE spec, events are
 * separated by a blank line and multiple `data:` lines within one event are
 * joined with `\n`. Tolerates chunk boundaries splitting a line. Exported for
 * testing the parser in isolation.
 */
export async function* readSseEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  function consumeLine(line: string): void {
    if (line.startsWith("data:"))
      dataLines.push(line.slice(5).replace(/^ /, ""));
    // Other SSE fields (`event:`, `id:`, comments) carry no payload we need; the
    // event type is redundant with the `type` inside the JSON `data`.
  }

  function* flush(): Generator<unknown> {
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n");
    dataLines = [];
    if (payload.length > 0) yield JSON.parse(payload);
  }

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length === 0) yield* flush();
        else consumeLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
  // Handle a final event that was not terminated by a blank line.
  if (buffer.length > 0) consumeLine(buffer.replace(/\r$/, ""));
  yield* flush();
}

export function createDaemonClient(
  config: DaemonClientConfig,
  options: DaemonClientOptions = {},
): DaemonClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (config.token !== null) {
      headers.set("authorization", `Bearer ${config.token}`);
    }
    if (!headers.has("content-type") && init.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      if (response.status === 401) options.onUnauthorized?.();
      throw new DaemonRequestError(
        `Daemon request failed: ${init.method ?? "GET"} ${path}`,
        response.status,
      );
    }

    // When the mobile app is served by a plain static server (not the daemon),
    // unknown routes fall back to `index.html`. Guard against parsing that HTML
    // as JSON so the failure is legible instead of an opaque parse error.
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new DaemonRequestError(
        `Daemon returned a non-JSON response for ${path} ` +
          `(content-type: ${contentType.length > 0 ? contentType : "unknown"}). ` +
          `Is the mobile app being served by the daemon?`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  return {
    baseUrl: config.baseUrl,
    request,
    health: async () => request<DaemonHealth>("/api/health"),
    listProcesses: async () =>
      request<ProcessRegistrySnapshot>("/api/process-registry"),
    listChats: async () => request<DaemonChat[]>("/api/chats"),
    getChat: async (chatId) =>
      request<DaemonChat>(`/api/chats/${encodeURIComponent(chatId)}`),
    listProjects: async () => request<DaemonProject[]>("/api/projects"),
    listAgents: async () => request<DaemonAgentOption[]>("/api/agents"),
    createChat: async (input) =>
      request<DaemonChat>("/api/chats", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    loadChat: async (chatId) =>
      request<ChatLoadResult>(`/api/chats/${encodeURIComponent(chatId)}/load`, {
        method: "POST",
      }),
    streamChat: (input, streamId, signal) =>
      streamChat(config, input, streamId, signal, options.onUnauthorized),
    abortChatStream: async (streamId) => {
      await request<{ ok: boolean }>(
        `/api/chat-streams/${encodeURIComponent(streamId)}`,
        { method: "DELETE" },
      );
    },
    resolveElicitation: async (streamId, input) => {
      await request<{ resolved: boolean }>(
        `/api/chat-streams/${encodeURIComponent(streamId)}/elicitation`,
        { method: "POST", body: JSON.stringify(input) },
      );
    },
  };
}

async function* streamChat(
  config: DaemonClientConfig,
  input: ChatSendInput,
  streamId: string,
  signal?: AbortSignal,
  onUnauthorized?: () => void,
): AsyncIterable<ChatStreamEvent> {
  const headers = new Headers({
    accept: "text/event-stream",
    "content-type": "application/json",
  });
  if (config.token !== null) {
    headers.set("authorization", `Bearer ${config.token}`);
  }

  const path = `/api/chat-streams?streamId=${encodeURIComponent(streamId)}`;
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.();
    throw new DaemonRequestError(
      `Daemon request failed: POST ${path}`,
      response.status,
    );
  }
  if (response.body === null) {
    throw new DaemonRequestError(
      `Daemon returned an empty stream for ${path}.`,
      response.status,
    );
  }

  for await (const event of readSseEvents(response.body)) {
    yield event as ChatStreamEvent;
  }
}
