import type {
  AgentOption,
  AgentSkillsInput,
  CreateCustomAgentInput,
  CustomAgent,
  DeleteCustomAgentImpact,
  UpdateCustomAgentInput,
} from "./agents";
import type {
  Chat,
  ChatAvailableSkill,
  ChatArchivedDeleteImpact,
  ChatArchivedDeleteImpactInput,
  ChatArchivedDeleteInput,
  ChatArchivedDeleteResult,
  ChatArchivedRestoreInput,
  ChatCreateInput,
  ChatLoadResult,
  ChatPrewarmInput,
  ChatPrewarmResult,
  ChatRenameInput,
  ChatRuntimeConfig,
  ChatRuntimeConfigInput,
  ChatSetModeInput,
  ChatSetModeResult,
  ChatSetPermissionModeInput,
  ChatSetPermissionModeResult,
  ChatSetRuntimeInput,
  ProjectFileSearchInput,
  ProjectFileSearchResult,
} from "./chat";
import type {
  CreateProjectInput,
  Project,
  ProjectGitStatusInput,
  ProjectGitStatusResult,
} from "./projects";
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
} from "./workspace-tools";

export interface DaemonTransport {
  fetch: (pathname: string, init?: RequestInit) => Promise<Response>;
}

export function createDaemonApiClient(transport: DaemonTransport) {
  const request = async <T>(
    pathname: string,
    init?: RequestInit,
  ): Promise<T> => {
    const response = await transport.fetch(pathname, init);
    const body = (await response.json()) as T | { error: string };
    if (!response.ok) {
      throw new Error(
        "error" in (body as { error?: string })
          ? (body as { error: string }).error
          : `Daemon request failed (${response.status}).`,
      );
    }
    return body as T;
  };
  const json = (method: string, body?: object): RequestInit => ({
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });

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
      deleteAll: () =>
        request<{ deletedCount: number; deletedWorktreeCount: number }>(
          "/api/chats",
          { method: "DELETE" },
        ),
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
      setRuntime: (input: ChatSetRuntimeInput) =>
        request<Chat>(
          `/api/chats/${encodeURIComponent(input.chatId)}/runtime`,
          json("PUT", { runtime: input.runtime }),
        ),
    },
    projects: {
      create: (input: CreateProjectInput) =>
        request<Project>("/api/projects", json("POST", input)),
      gitStatus: (input: ProjectGitStatusInput) =>
        request<ProjectGitStatusResult>(
          `/api/projects/${encodeURIComponent(input.projectId)}/git-status`,
        ),
      list: () => request<Project[]>("/api/projects"),
      searchFiles: (input: ProjectFileSearchInput) =>
        request<ProjectFileSearchResult[]>(
          `/api/projects/files/search?${query(input)}`,
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

function query(input: object) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  return parameters.toString();
}

export type DaemonApiClient = ReturnType<typeof createDaemonApiClient>;
