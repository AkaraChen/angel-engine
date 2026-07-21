import type {
  AgentOption,
  AgentSkillsInput,
  CreateCustomAgentInput,
  CustomAgent,
  DeleteCustomAgentImpact,
  UpdateCustomAgentInput,
} from "@angel-engine/daemon-api/agents";
import type {
  Chat,
  ChatArchivedDeleteImpact,
  ChatArchivedDeleteImpactInput,
  ChatArchivedDeleteInput,
  ChatArchivedDeleteResult,
  ChatArchivedRestoreInput,
  ChatAvailableSkill,
  ChatCreateInput,
  ChatElicitationResponse,
  ChatLoadResult,
  ChatPrewarmInput,
  ChatPrewarmResult,
  ChatRenameInput,
  ChatRuntimeConfig,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSetModeInput,
  ChatSetModeResult,
  ChatSetPermissionModeInput,
  ChatSetPermissionModeResult,
  ChatSetRuntimeInput,
  ChatStreamEvent,
  ProjectFileSearchInput,
  ProjectFileSearchResult,
} from "@angel-engine/daemon-api/chat";
import type {
  DaemonErrorPayload,
  DaemonHealth,
  ProcessRegistryEntry,
  ProcessRegistrySnapshotEntry,
} from "@angel-engine/daemon-api/daemon";
import type {
  CreateProjectInput,
  Project,
  ProjectGitStatusInput,
  ProjectGitStatusResult,
  UpdateProjectInput,
} from "@angel-engine/daemon-api/projects";
import type {
  WorkspaceFileReadResult,
  WorkspaceFileTreeResult,
  WorkspaceFileWriteResult,
  WorkspaceGitDiffResult,
  WorkspaceToolGitCommitInput,
  WorkspaceToolGitCommitResult,
  WorkspaceToolReadFileInput,
  WorkspaceToolRootInput,
  WorkspaceToolWriteFileInput,
} from "@angel-engine/daemon-api/workspace-tools";

import { DaemonRequestError } from "./errors";
import { readSseEvents } from "./sse";

export { DaemonRequestError } from "./errors";
export { readSseEvents } from "./sse";

/** Response of `POST /api/chat-streams/:id/elicitation`. */
export interface ChatStreamElicitationInput {
  elicitationId: string;
  response: ChatElicitationResponse;
}

export interface DaemonClientOptions {
  /** Origin the daemon listens on; `""` when `fetch` already addresses it. */
  baseUrl: string;
  /**
   * Plain-fetch-compatible transport. Defaults to `globalThis.fetch`; pass an
   * IPC tunnel, a `ky` instance's fetch, or anything with the same shape.
   */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Called on any 401 so the app can drop a stale pairing token. */
  onUnauthorized?: () => void;
  /** Bearer token; omit when the transport injects authorization itself. */
  token?: string | null;
}

export function createDaemonClient(options: DaemonClientOptions) {
  const fetchImpl =
    options.fetch ?? ((url, init) => globalThis.fetch(url, init));

  const send = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (options.token !== undefined && options.token !== null) {
      headers.set("authorization", `Bearer ${options.token}`);
    }
    if (!headers.has("content-type") && init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    const response = await fetchImpl(`${options.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (response.status === 401) options.onUnauthorized?.();
    return response;
  };

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await send(path, init);
    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as
        | Partial<DaemonErrorPayload>
        | undefined;
      throw DaemonRequestError.http(
        response.status,
        payload?.code,
        typeof payload?.error === "string" && payload.error.length > 0
          ? payload.error
          : `Daemon request failed (${response.status}).`,
      );
    }
    // A plain static server (not the daemon) answers unknown routes with
    // index.html; fail legibly instead of surfacing a JSON parse error.
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw DaemonRequestError.invalidResponse(
        `Daemon returned a non-JSON response for ${path} ` +
          `(content-type: ${contentType.length > 0 ? contentType : "unknown"}).`,
        response.status,
      );
    }
    return (await response.json()) as T;
  };
  const json = (method: string, body?: object): RequestInit => ({
    body: body === undefined ? undefined : JSON.stringify(body),
    method,
  });

  async function* streamChat(
    input: ChatSendInput,
    streamId: string,
    signal?: AbortSignal,
  ): AsyncIterable<ChatStreamEvent> {
    const path = `/api/chat-streams?streamId=${encodeURIComponent(streamId)}`;
    const response = await send(path, {
      ...json("POST", input),
      headers: { accept: "text/event-stream" },
      signal,
    });
    if (!response.ok) {
      throw DaemonRequestError.http(
        response.status,
        undefined,
        `Daemon request failed: POST ${path}`,
      );
    }
    if (response.body === null) {
      throw DaemonRequestError.invalidResponse(
        `Daemon returned an empty stream for ${path}.`,
        response.status,
      );
    }
    for await (const event of readSseEvents(response.body)) {
      yield event as ChatStreamEvent;
    }
  }

  return {
    agents: {
      createCustom: (input: CreateCustomAgentInput) =>
        request<CustomAgent>("/api/agents/custom", json("POST", input)),
      deleteCustom: (id: string) =>
        request<{ deletedChatIds: string[] }>(
          `/api/agents/custom/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        ),
      deleteCustomImpact: (id: string) =>
        request<DeleteCustomAgentImpact>(
          `/api/agents/custom/${encodeURIComponent(id)}/delete-impact`,
        ),
      listAvailable: () => request<AgentOption[]>("/api/agents"),
      listCustom: () => request<CustomAgent[]>("/api/agents/custom"),
      listSkills: (input: AgentSkillsInput) =>
        request<ChatAvailableSkill[]>(`/api/agents/skills?${query(input)}`),
      updateCustom: (input: UpdateCustomAgentInput) =>
        request<CustomAgent>(
          `/api/agents/custom/${encodeURIComponent(input.id)}`,
          json("PUT", input),
        ),
    },
    chatStreams: {
      abort: (streamId: string) =>
        request<{ ok: boolean }>(
          `/api/chat-streams/${encodeURIComponent(streamId)}`,
          { method: "DELETE" },
        ),
      resolveElicitation: (
        streamId: string,
        input: ChatStreamElicitationInput,
      ) =>
        request<{ resolved: boolean }>(
          `/api/chat-streams/${encodeURIComponent(streamId)}/elicitation`,
          json("POST", input),
        ),
      send: streamChat,
    },
    chats: {
      archive: (id: string) =>
        request<Chat>(`/api/chats/${encodeURIComponent(id)}/archive`, {
          method: "POST",
        }),
      archivedDelete: (input: ChatArchivedDeleteInput) =>
        request<ChatArchivedDeleteResult>(
          "/api/chats/archived/delete",
          json("POST", input),
        ),
      archivedDeleteImpact: (input: ChatArchivedDeleteImpactInput) =>
        request<ChatArchivedDeleteImpact>(
          "/api/chats/archived/delete-impact",
          json("POST", input),
        ),
      archivedList: () => request<Chat[]>("/api/chats/archived"),
      archivedRestore: (input: ChatArchivedRestoreInput) =>
        request<Chat[]>("/api/chats/archived/restore", json("POST", input)),
      create: (input: ChatCreateInput = {}) =>
        request<Chat>("/api/chats", json("POST", input)),
      delete: (id: string) =>
        request<{ ok: boolean }>(`/api/chats/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      deleteAll: () =>
        request<{ deletedCount: number; deletedWorktreeCount: number }>(
          "/api/chats",
          { method: "DELETE" },
        ),
      get: (id: string) =>
        request<Chat | null>(`/api/chats/${encodeURIComponent(id)}`),
      inspectConfig: (input: ChatRuntimeConfigInput = {}) =>
        request<ChatRuntimeConfig>(
          "/api/chats/runtime-config",
          json("POST", input),
        ),
      list: () => request<Chat[]>("/api/chats"),
      load: (id: string) =>
        request<ChatLoadResult>(`/api/chats/${encodeURIComponent(id)}/load`, {
          method: "POST",
        }),
      prewarm: (input: ChatPrewarmInput = {}) =>
        request<ChatPrewarmResult>("/api/chats/prewarm", json("POST", input)),
      rename: (input: ChatRenameInput) =>
        request<Chat>(
          `/api/chats/${encodeURIComponent(input.chatId)}`,
          json("PATCH", { title: input.title }),
        ),
      setMode: (input: ChatSetModeInput) =>
        request<ChatSetModeResult>(
          `/api/chats/${encodeURIComponent(input.chatId)}/mode`,
          json("PUT", { mode: input.mode }),
        ),
      setPermissionMode: (input: ChatSetPermissionModeInput) =>
        request<ChatSetPermissionModeResult>(
          `/api/chats/${encodeURIComponent(input.chatId)}/permission-mode`,
          json("PUT", { mode: input.mode }),
        ),
      setPinned: (id: string, pinned: boolean) =>
        request<Chat>(
          `/api/chats/${encodeURIComponent(id)}`,
          json("PATCH", { pinned }),
        ),
      setRuntime: (input: ChatSetRuntimeInput) =>
        request<Chat>(
          `/api/chats/${encodeURIComponent(input.chatId)}/runtime`,
          json("PUT", { runtime: input.runtime }),
        ),
    },
    health: () => request<DaemonHealth>("/api/health"),
    processes: {
      kill: (pid: number, force = false) =>
        request<{ ok: boolean }>(`/api/processes/${pid}/kill`, {
          ...json("POST", { force }),
        }),
      list: () =>
        request<{ entries: ProcessRegistrySnapshotEntry[] }>(
          "/api/process-registry",
        ),
      replace: (entries: ProcessRegistryEntry[]) =>
        request<{ ok: boolean }>(
          "/api/process-registry",
          json("PUT", { entries }),
        ),
    },
    projects: {
      create: (input: CreateProjectInput) =>
        request<Project>("/api/projects", json("POST", input)),
      delete: (id: string) =>
        request<{ ok: boolean }>(`/api/projects/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      get: (id: string) =>
        request<Project | null>(`/api/projects/${encodeURIComponent(id)}`),
      gitStatus: (input: ProjectGitStatusInput) =>
        request<ProjectGitStatusResult>(
          `/api/projects/${encodeURIComponent(input.projectId)}/git-status`,
        ),
      list: () => request<Project[]>("/api/projects"),
      searchFiles: (input: ProjectFileSearchInput) =>
        request<ProjectFileSearchResult[]>(
          `/api/projects/files/search?${query(input)}`,
        ),
      update: (input: UpdateProjectInput) =>
        request<Project>(
          `/api/projects/${encodeURIComponent(input.id)}`,
          json("PATCH", { path: input.path }),
        ),
    },
    workspaceTools: {
      fileTree: (input: WorkspaceToolRootInput) =>
        request<WorkspaceFileTreeResult>(
          `/api/workspace/file-tree?${query(input)}`,
        ),
      gitCommit: (input: WorkspaceToolGitCommitInput) =>
        request<WorkspaceToolGitCommitResult>(
          "/api/workspace/git-commit",
          json("POST", input),
        ),
      gitDiff: (input: WorkspaceToolRootInput) =>
        request<WorkspaceGitDiffResult>(
          `/api/workspace/git-diff?${query(input)}`,
        ),
      readFile: (input: WorkspaceToolReadFileInput) =>
        request<WorkspaceFileReadResult>(`/api/workspace/file?${query(input)}`),
      writeFile: (input: WorkspaceToolWriteFileInput) =>
        request<WorkspaceFileWriteResult>(
          "/api/workspace/file",
          json("PUT", input),
        ),
    },
  };
}

export type DaemonClient = ReturnType<typeof createDaemonClient>;

function query(input: object) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  return parameters.toString();
}
