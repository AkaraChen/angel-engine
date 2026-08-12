import type {
  AgentOption,
  AgentSkillsInput,
  CreateCustomAgentInput,
  CustomAgent,
  DeleteCustomAgentImpact,
  UpdateCustomAgentInput,
} from "@angel-engine/daemon-api/agents";
import type {
  Automation,
  AutomationRun,
  CreateAutomationInput,
  UpdateAutomationInput,
} from "@angel-engine/daemon-api/automations";
import type {
  Chat,
  ChatActiveRunResult,
  ChatAmbiguousRunResult,
  ChatActivityListResult,
  ChatAttentionListResult,
  ChatAttentionReadInput,
  ChatAttentionReadResult,
  ChatArchivedDeleteImpact,
  ChatArchivedDeleteImpactInput,
  ChatArchivedDeleteInput,
  ChatArchivedDeleteResult,
  ChatArchivedRestoreInput,
  ChatArchiveWorkspaceResult,
  ChatAvailableSkill,
  ChatCreateInput,
  ChatLoadResult,
  ImportChatInput,
  ImportChatResult,
  ListImportableSessionsInput,
  ListImportableSessionsResult,
  ChatPrewarmInput,
  ChatPrewarmResult,
  ChatRenameInput,
  ChatRuntimeConfig,
  ChatRuntimeConfigInput,
  ChatRunObserverEvent,
  ChatRunStartInput,
  ChatSendInput,
  ChatSendResult,
  ChatSetModeInput,
  ChatSetModeResult,
  ChatSetPermissionModeInput,
  ChatSetPermissionModeResult,
  ChatSetRuntimeInput,
  ChatStreamElicitationResolveInput,
  ProjectFileSearchInput,
  ProjectFileSearchResult,
} from "@angel-engine/daemon-api/chat";
import {
  isChatActiveRunResult,
  isChatAmbiguousRunResult,
  isChatActivityListResult,
  isChatAttentionListResult,
  isChatAttentionReadResult,
  isChatRunObserverEvent,
} from "@angel-engine/daemon-api/chat";
import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";
import { isDaemonGlobalEvent } from "@angel-engine/daemon-api";
import type {
  DaemonErrorPayload,
  DaemonHealth,
  ProcessRegistryEntry,
  ProcessRegistrySnapshotEntry,
} from "@angel-engine/daemon-api/daemon";
import type {
  GitHubAddPullRequestCommentInput,
  GitHubAddPullRequestCommentResult,
  GitHubCreatePullRequestInput,
  GitHubCreatePullRequestResult,
  GitHubCreateWorkspaceFromPullRequestInput,
  GitHubCreateWorkspaceFromPullRequestResult,
  GitHubListItemsInput,
  GitHubListItemsResult,
  GitHubPrChecksFixPromptInput,
  GitHubPrChecksFixPromptResult,
  GitHubPrChecksInput,
  GitHubPrChecksResult,
  GitHubListPullRequestsInput,
  GitHubListPullRequestsResult,
  GitHubListRepositoriesInput,
  GitHubListRepositoriesResult,
  GitHubMergeInput,
  GitHubMergeResult,
  GitHubPullRequestDetail,
  GitHubPullRequestStatus,
  GitHubPullRequestStatusInput,
  GitHubPullRequestTemplateInput,
  GitHubPullRequestTemplateResult,
  GitHubRepositoryOwnersResult,
  GitHubResolveUrlInput,
  GitHubResolveThreadInput,
  GitHubResolveThreadResult,
  GitHubResolvedItem,
  GitHubViewPullRequestInput,
  PullRequestCreateInput,
  PullRequestCreateResult,
  PullRequestPreflight,
  PullRequestRecord,
} from "@angel-engine/daemon-api/github";
import type {
  ResolvedTaskLink,
  TaskLinkResolveInput,
} from "@angel-engine/daemon-api/links";
import type {
  ShepherdResumeInput,
  ShepherdSession,
  ShepherdStartInput,
  ShepherdStopInput,
} from "@angel-engine/daemon-api/shepherd";
import type {
  CreateProjectInput,
  ProjectCloneEvent,
  ProjectCloneInput,
  ManagedWorktreeDeleteInput,
  ManagedWorktreeDeleteResult,
  ManagedWorktreeScanInput,
  ManagedWorktreeSummary,
  Project,
  ProjectConfigInput,
  ProjectConfigResult,
  ProjectGitStatusInput,
  ProjectGitStatusResult,
  ProjectSetupLifecycleView,
  ProjectSetupRetryInput,
  UpdateProjectConfigInput,
  UpdateProjectInput,
} from "@angel-engine/daemon-api/projects";
import type {
  ChangeRequest,
  ChangeRequestCreatePreflightResult,
  ChangeRequestStatusResult,
  ChangeRequestTemplateResult,
  CheckRun,
  CheckSummary,
  ChecksFixPromptResult,
  CreateChangeRequestWorkspaceResult,
  MergeMethod,
  ReviewThread,
  SourceControlActivationResult,
} from "@angel-engine/daemon-api/source-control";
import { isProjectCloneEvent } from "@angel-engine/daemon-api/projects";
import type {
  WorkspaceFileReadResult,
  WorkspaceFileTreeResult,
  WorkspaceFileWriteResult,
  WorkspaceGitBranchesResult,
  WorkspaceGitCheckoutInput,
  WorkspaceGitCheckoutResult,
  WorkspaceGitCommitShowInput,
  WorkspaceGitCommitShowResult,
  WorkspaceGitDiffInput,
  WorkspaceGitDiffResult,
  WorkspaceGitLogResult,
  WorkspaceToolGitCommitInput,
  WorkspaceToolGitCommitResult,
  WorkspaceToolGitPullInput,
  WorkspaceToolGitPullResult,
  WorkspaceToolGitPushInput,
  WorkspaceToolGitPushResult,
  WorkspaceToolReadFileInput,
  WorkspaceToolRootInput,
  WorkspaceToolWriteFileInput,
} from "@angel-engine/daemon-api/workspace-tools";

import { DaemonRequestError } from "./errors";
import { readSseEvents } from "./sse";

export { DaemonRequestError } from "./errors";
export { readSseEvents } from "./sse";

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

export interface SourceControlCreateChangeRequestInput {
  body: string;
  draft: boolean;
  projectPath: string;
  publish: boolean;
  sourceBranch: string;
  targetBranch: string;
  title: string;
}

export interface SourceControlCreateWorkspaceInput {
  projectPath: string;
  runtime?: string;
  setupApproval?: string;
  title?: string;
}

export interface SourceControlMergeChangeRequestInput {
  deleteSourceBranch: boolean;
  method: MergeMethod;
  projectPath: string;
}

export interface DaemonEventHandlers {
  onEvent: (event: DaemonGlobalEvent) => void;
  onInvalidEvent?: (error: DaemonRequestError) => void;
  onOpen?: () => void;
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

  async function* streamRun(
    path: string,
    init: RequestInit,
  ): AsyncIterable<ChatRunObserverEvent> {
    const headers = new Headers(init.headers);
    headers.set("accept", "text/event-stream");
    const response = await send(path, { ...init, headers });
    if (!response.ok) {
      throw DaemonRequestError.http(
        response.status,
        undefined,
        `Daemon request failed: ${init.method ?? "GET"} ${path}`,
      );
    }
    if (response.body === null) {
      throw DaemonRequestError.invalidResponse(
        `Daemon returned an empty stream for ${path}.`,
        response.status,
      );
    }

    let sawSnapshot = false;
    let lastSequence = 0;
    for await (const message of readSseEvents(response.body)) {
      if (!isChatRunObserverEvent(message)) {
        throw DaemonRequestError.invalidResponse(
          `Daemon returned an invalid chat run event for ${path}.`,
          response.status,
        );
      }
      if (!sawSnapshot) {
        if (message.type !== "snapshot") {
          throw DaemonRequestError.invalidResponse(
            `Daemon did not start the chat run stream with a snapshot for ${path}.`,
            response.status,
          );
        }
        sawSnapshot = true;
        lastSequence = message.snapshot.lastEventSequence;
      } else {
        if (message.type !== "event" || message.sequence !== lastSequence + 1) {
          throw DaemonRequestError.invalidResponse(
            `Daemon returned a non-contiguous chat run sequence for ${path}.`,
            response.status,
          );
        }
        lastSequence = message.sequence;
      }
      yield message;
    }
    if (!sawSnapshot) {
      throw DaemonRequestError.invalidResponse(
        `Daemon returned a chat run stream without a snapshot for ${path}.`,
        response.status,
      );
    }
  }

  async function* streamCloneEvents(
    path: string,
    init: RequestInit,
  ): AsyncIterable<ProjectCloneEvent> {
    const headers = new Headers(init.headers);
    headers.set("accept", "text/event-stream");
    const response = await send(path, { ...init, headers });
    if (!response.ok) {
      throw DaemonRequestError.http(
        response.status,
        undefined,
        `Daemon request failed: ${init.method ?? "GET"} ${path}`,
      );
    }
    if (response.body === null) {
      throw DaemonRequestError.invalidResponse(
        `Daemon returned an empty stream for ${path}.`,
        response.status,
      );
    }

    let terminalEventReceived = false;
    for await (const message of readSseEvents(response.body)) {
      if (!isProjectCloneEvent(message)) {
        throw DaemonRequestError.invalidResponse(
          `Daemon returned an invalid clone event for ${path}.`,
          response.status,
        );
      }
      terminalEventReceived =
        terminalEventReceived ||
        message.type === "completed" ||
        message.type === "failed";
      yield message;
    }
    if (!terminalEventReceived) {
      throw DaemonRequestError.invalidResponse(
        `Daemon clone stream ended without a terminal event for ${path}.`,
        response.status,
      );
    }
  }

  const activeRun = async (chatId: string): Promise<ChatActiveRunResult> => {
    const path = `/api/chats/${encodeURIComponent(chatId)}/active-run`;
    const result = await request<unknown>(path);
    if (!isChatActiveRunResult(result)) {
      throw DaemonRequestError.invalidResponse(
        `Daemon returned an invalid active chat run for ${path}.`,
        200,
      );
    }
    return result;
  };

  const ambiguousRun = async (
    chatId: string,
  ): Promise<ChatAmbiguousRunResult> => {
    const path = `/api/chats/${encodeURIComponent(chatId)}/ambiguous-run`;
    const result = await request<unknown>(path);
    if (!isChatAmbiguousRunResult(result)) {
      throw DaemonRequestError.invalidResponse(
        `Daemon returned an invalid ambiguous chat run for ${path}.`,
        200,
      );
    }
    return result;
  };

  const listAttention = async (): Promise<ChatAttentionListResult> => {
    const result = await request<unknown>("/api/chat-attention");
    if (!isChatAttentionListResult(result)) {
      throw DaemonRequestError.invalidResponse(
        "Daemon returned an invalid chat attention snapshot.",
        200,
      );
    }
    return result;
  };

  const listActivity = async (): Promise<ChatActivityListResult> => {
    const result = await request<unknown>("/api/chat-activity");
    if (!isChatActivityListResult(result)) {
      throw DaemonRequestError.invalidResponse(
        "Daemon returned an invalid chat activity snapshot.",
        200,
      );
    }
    return result;
  };

  const readAttention = async (
    chatId: string,
    input: ChatAttentionReadInput,
  ): Promise<ChatAttentionReadResult> => {
    const result = await request<unknown>(
      `/api/chats/${encodeURIComponent(chatId)}/attention/read`,
      json("POST", input),
    );
    if (!isChatAttentionReadResult(result)) {
      throw DaemonRequestError.invalidResponse(
        "Daemon returned an invalid chat attention read result.",
        200,
      );
    }
    return result;
  };

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
    automations: {
      create: (input: CreateAutomationInput) =>
        request<Automation>("/api/automations", json("POST", input)),
      delete: (id: string) =>
        request<{ ok: boolean }>(`/api/automations/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      list: () => request<Automation[]>("/api/automations"),
      listRuns: (id: string, limit?: number) =>
        request<AutomationRun[]>(
          `/api/automations/${encodeURIComponent(id)}/runs${limit === undefined ? "" : `?${query({ limit })}`}`,
        ),
      pause: (id: string) =>
        request<Automation>(
          `/api/automations/${encodeURIComponent(id)}/pause`,
          { method: "POST" },
        ),
      resume: (id: string) =>
        request<Automation>(
          `/api/automations/${encodeURIComponent(id)}/resume`,
          { method: "POST" },
        ),
      runNow: (id: string) =>
        request<Automation>(`/api/automations/${encodeURIComponent(id)}/run`, {
          method: "POST",
        }),
      update: (id: string, input: UpdateAutomationInput) =>
        request<Automation>(
          `/api/automations/${encodeURIComponent(id)}`,
          json("PATCH", input),
        ),
    },
    chatRuns: {
      active: activeRun,
      observe: (runId: string, signal?: AbortSignal) =>
        streamRun(`/api/chat-runs/${encodeURIComponent(runId)}/events`, {
          method: "GET",
          signal,
        }),
      resolveElicitation: (
        runId: string,
        input: ChatStreamElicitationResolveInput,
      ) =>
        request<{ resolved: boolean }>(
          `/api/chat-runs/${encodeURIComponent(runId)}/elicitation`,
          json("POST", input),
        ),
      start: (runId: string, input: ChatRunStartInput, signal?: AbortSignal) =>
        streamRun(`/api/chat-runs/${encodeURIComponent(runId)}`, {
          ...json("POST", input),
          signal,
        }),
      stop: (runId: string) =>
        request<{ ok: boolean }>(
          `/api/chat-runs/${encodeURIComponent(runId)}`,
          { method: "DELETE" },
        ),
    },
    attention: {
      list: listAttention,
      read: readAttention,
    },
    activity: {
      list: listActivity,
      read: readAttention,
    },
    chats: {
      ambiguousRun,
      archive: (id: string) =>
        request<Chat>(`/api/chats/${encodeURIComponent(id)}/archive`, {
          method: "POST",
        }),
      archiveWorkspace: (id: string) =>
        request<ChatArchiveWorkspaceResult>(
          `/api/chats/${encodeURIComponent(id)}/archive-workspace`,
          { method: "POST" },
        ),
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
      cancelWorktreeCreation: (id: string) =>
        request<Chat>(
          `/api/chats/${encodeURIComponent(id)}/worktree-creation`,
          { method: "DELETE" },
        ),
      clearAmbiguousRun: (id: string) =>
        request<{ cleared: boolean }>(
          `/api/chats/${encodeURIComponent(id)}/ambiguous-run`,
          { method: "DELETE" },
        ),
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
      lifecycle: (id: string) =>
        request<ProjectSetupLifecycleView>(
          `/api/chats/${encodeURIComponent(id)}/lifecycle`,
        ),
      cancelSetup: (id: string) =>
        request<ProjectSetupLifecycleView>(
          `/api/chats/${encodeURIComponent(id)}/setup/cancel`,
          { method: "POST" },
        ),
      continueSetup: (id: string) =>
        request<ProjectSetupLifecycleView>(
          `/api/chats/${encodeURIComponent(id)}/setup/continue`,
          { method: "POST" },
        ),
      discardSetup: (id: string) =>
        request<{ ok: boolean }>(
          `/api/chats/${encodeURIComponent(id)}/setup/discard`,
          { method: "POST" },
        ),
      retrySetup: (id: string, input: ProjectSetupRetryInput) =>
        request<ProjectSetupLifecycleView>(
          `/api/chats/${encodeURIComponent(id)}/setup/retry`,
          json("POST", input),
        ),
      inspectConfig: (input: ChatRuntimeConfigInput = {}) =>
        request<ChatRuntimeConfig>(
          "/api/chats/runtime-config",
          json("POST", input),
        ),
      list: () => request<Chat[]>("/api/chats"),
      listImportableSessions: (input: ListImportableSessionsInput) =>
        request<ListImportableSessionsResult>(
          "/api/sessions/importable",
          json("POST", input),
        ),
      importSession: (input: ImportChatInput) =>
        request<ImportChatResult>("/api/sessions/import", json("POST", input)),
      load: (id: string) =>
        request<ChatLoadResult>(`/api/chats/${encodeURIComponent(id)}/load`, {
          method: "POST",
        }),
      prewarm: (input: ChatPrewarmInput = {}) =>
        request<ChatPrewarmResult>("/api/chats/prewarm", json("POST", input)),
      retryWorktreeCreation: (id: string, worktreeSetupApproval?: string) =>
        request<Chat>(
          `/api/chats/${encodeURIComponent(id)}/worktree-creation/retry`,
          json("POST", { worktreeSetupApproval }),
        ),
      rename: (input: ChatRenameInput) =>
        request<Chat>(
          `/api/chats/${encodeURIComponent(input.chatId)}`,
          json("PATCH", { title: input.title }),
        ),
      send: (input: ChatSendInput) =>
        request<ChatSendResult>("/api/chats/send", json("POST", input)),
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
    github: {
      addPullRequestComment: (input: GitHubAddPullRequestCommentInput) =>
        request<GitHubAddPullRequestCommentResult>(
          `/api/github/pull-requests/${encodeURIComponent(String(input.number))}/comments`,
          json("POST", { body: input.body, cwd: input.cwd }),
        ),
      createPullRequest: (input: GitHubCreatePullRequestInput) =>
        request<GitHubCreatePullRequestResult>(
          "/api/github/pull-requests",
          json("POST", input),
        ),
      createWorkspaceFromPullRequest: (
        input: GitHubCreateWorkspaceFromPullRequestInput,
      ) =>
        request<GitHubCreateWorkspaceFromPullRequestResult>(
          "/api/github/pull-requests/workspace",
          json("POST", input),
        ),
      createWorkspacePullRequest: (input: PullRequestCreateInput) =>
        request<PullRequestCreateResult>(
          "/api/github/pull-request",
          json("POST", input),
        ),
      getWorkspacePullRequest: (root: string) =>
        request<PullRequestRecord | null>(
          `/api/github/pull-request?${query({ root })}`,
        ),
      listItems: (input: GitHubListItemsInput) =>
        request<GitHubListItemsResult>(`/api/github/items?${query(input)}`),
      listPrChecks: (input: GitHubPrChecksInput) =>
        request<GitHubPrChecksResult>(`/api/github/pr-checks?${query(input)}`),
      prChecksFixPrompt: (input: GitHubPrChecksFixPromptInput) =>
        request<GitHubPrChecksFixPromptResult>(
          "/api/github/pr-checks/fix-prompt",
          json("POST", input),
        ),
      listPullRequests: (input: GitHubListPullRequestsInput) =>
        request<GitHubListPullRequestsResult>(
          `/api/github/pull-requests?${query(input)}`,
        ),
      pullRequestTemplate: (input: GitHubPullRequestTemplateInput) =>
        request<GitHubPullRequestTemplateResult>(
          `/api/github/pull-request-template?${query(input)}`,
        ),
      listRepositories: (input: GitHubListRepositoriesInput) =>
        request<GitHubListRepositoriesResult>(
          `/api/github/repos?${query(input)}`,
        ),
      listRepositoryOwners: () =>
        request<GitHubRepositoryOwnersResult>("/api/github/repo-owners"),
      resolveUrl: (input: GitHubResolveUrlInput) =>
        request<GitHubResolvedItem>("/api/github/resolve", json("POST", input)),
      pullRequestStatus: (input: GitHubPullRequestStatusInput) =>
        request<GitHubPullRequestStatus>(
          `/api/github/pull-request?${query(input)}`,
        ),
      mergePullRequest: (input: GitHubMergeInput) =>
        request<GitHubMergeResult>(
          "/api/github/pull-request/merge",
          json("POST", input),
        ),
      resolveReviewThread: (input: GitHubResolveThreadInput) =>
        request<GitHubResolveThreadResult>(
          "/api/github/pull-request/resolve-thread",
          json("POST", input),
        ),
      workspacePullRequestPreflight: (root: string, base?: string) =>
        request<PullRequestPreflight>(
          `/api/github/pull-request/preflight?${query({ base, root })}`,
        ),
      viewPullRequest: (input: GitHubViewPullRequestInput) =>
        request<GitHubPullRequestDetail>(
          `/api/github/pull-requests/${encodeURIComponent(String(input.number))}?${query({ cwd: input.cwd })}`,
        ),
    },
    shepherd: {
      get: (chatId: string) =>
        request<{ session: ShepherdSession | null }>(
          `/api/shepherd?${query({ chatId })}`,
        ),
      resume: (input: ShepherdResumeInput) =>
        request<ShepherdSession>(
          `/api/shepherd/${encodeURIComponent(input.id)}/resume`,
          json("POST", {}),
        ),
      start: (input: ShepherdStartInput) =>
        request<ShepherdSession>("/api/shepherd/start", json("POST", input)),
      stop: (input: ShepherdStopInput) =>
        request<ShepherdSession>(
          `/api/shepherd/${encodeURIComponent(input.id)}/stop`,
          json("POST", {}),
        ),
    },
    sourceControl: {
      activation: (projectId: string) =>
        request<SourceControlActivationResult>(
          `/api/source-control/activation?${query({ projectId })}`,
        ),
      currentChangeRequest: (projectPath: string) =>
        request<ChangeRequestStatusResult | null>(
          `/api/source-control/change-requests/current?${query({ projectPath })}`,
        ),
      getChangeRequest: (projectPath: string, id: string) =>
        request<ChangeRequest>(
          `/api/source-control/change-requests/${encodeURIComponent(id)}?${query({ projectPath })}`,
        ),
      changeRequestPreflight: (projectPath: string, targetBranch?: string) =>
        request<ChangeRequestCreatePreflightResult>(
          `/api/source-control/change-requests/preflight?${query({ projectPath, targetBranch })}`,
        ),
      changeRequestTemplate: (projectPath: string) =>
        request<ChangeRequestTemplateResult>(
          `/api/source-control/change-requests/template?${query({ projectPath })}`,
        ),
      createChangeRequest: (input: SourceControlCreateChangeRequestInput) =>
        request<ChangeRequest>(
          "/api/source-control/change-requests",
          json("POST", input),
        ),
      mergeChangeRequest: (
        id: string,
        input: SourceControlMergeChangeRequestInput,
      ) =>
        request<ChangeRequest>(
          `/api/source-control/change-requests/${encodeURIComponent(id)}/merge`,
          json("POST", input),
        ),
      createChangeRequestWorkspace: (
        id: string,
        input: SourceControlCreateWorkspaceInput,
      ) =>
        request<CreateChangeRequestWorkspaceResult>(
          `/api/source-control/change-requests/${encodeURIComponent(id)}/workspace`,
          json("POST", input),
        ),
      checks: (projectPath: string, id: string) =>
        request<CheckRun[]>(
          `/api/source-control/checks?${query({ id, projectPath })}`,
        ),
      checksSummary: (projectPath: string, id: string) =>
        request<CheckSummary>(
          `/api/source-control/checks/summary?${query({ id, projectPath })}`,
        ),
      checksFixPrompt: (projectPath: string, id: string) =>
        request<ChecksFixPromptResult>(
          "/api/source-control/checks/fix-prompt",
          json("POST", { id, projectPath }),
        ),
      reviewThreads: (projectPath: string, id: string) =>
        request<ReviewThread[]>(
          `/api/source-control/reviews/threads?${query({ id, projectPath })}`,
        ),
      resolveReviewThread: (projectPath: string, threadId: string) =>
        request<{ resolved: boolean }>(
          `/api/source-control/reviews/threads/${encodeURIComponent(threadId)}/resolve`,
          json("POST", { projectPath }),
        ),
    },
    links: {
      resolve: (input: TaskLinkResolveInput) =>
        request<ResolvedTaskLink>("/api/links/resolve", json("POST", input)),
    },
    health: () => request<DaemonHealth>("/api/health"),
    events: {
      subscribe: (handlers: DaemonEventHandlers) =>
        subscribeDaemonEvents(options, handlers),
    },
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
      clone: (input: ProjectCloneInput, signal?: AbortSignal) =>
        streamCloneEvents("/api/projects/clone", {
          ...json("POST", input),
          signal,
        }),
      config: (input: ProjectConfigInput) =>
        request<ProjectConfigResult>(
          `/api/projects/${encodeURIComponent(input.projectId)}/config`,
        ),
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
      updateConfig: (input: UpdateProjectConfigInput) =>
        request<ProjectConfigResult>(
          `/api/projects/${encodeURIComponent(input.projectId)}/config`,
          json("PUT", {
            migrateLegacyInitScript: input.migrateLegacyInitScript,
            runScript: input.runScript,
            scriptShell: input.scriptShell,
            setupScript: input.setupScript,
            teardownScript: input.teardownScript,
          }),
        ),
    },
    worktrees: {
      deleteManaged: (input: ManagedWorktreeDeleteInput) =>
        request<ManagedWorktreeDeleteResult>(
          "/api/worktrees/managed/delete",
          json("POST", input),
        ),
      listManaged: (input: ManagedWorktreeScanInput = {}) =>
        request<ManagedWorktreeSummary[]>(
          `/api/worktrees/managed?${query(input)}`,
        ),
    },
    workspaceTools: {
      fileTree: (input: WorkspaceToolRootInput) =>
        request<WorkspaceFileTreeResult>(
          `/api/workspace/file-tree?${query(input)}`,
        ),
      gitBranches: (input: WorkspaceToolRootInput) =>
        request<WorkspaceGitBranchesResult>(
          `/api/workspace/git-branches?${query(input)}`,
        ),
      gitCheckout: (input: WorkspaceGitCheckoutInput) =>
        request<WorkspaceGitCheckoutResult>(
          "/api/workspace/git-checkout",
          json("POST", input),
        ),
      gitCommit: (input: WorkspaceToolGitCommitInput) =>
        request<WorkspaceToolGitCommitResult>(
          "/api/workspace/git-commit",
          json("POST", input),
        ),
      gitCommitShow: (input: WorkspaceGitCommitShowInput) =>
        request<WorkspaceGitCommitShowResult>(
          `/api/workspace/git-commit-show?${query(input)}`,
        ),
      gitDiff: (input: WorkspaceGitDiffInput) =>
        request<WorkspaceGitDiffResult>(
          `/api/workspace/git-diff?${query(input)}`,
        ),
      gitLog: (input: WorkspaceToolRootInput & { limit?: number }) =>
        request<WorkspaceGitLogResult>(
          `/api/workspace/git-log?${query(input)}`,
        ),
      gitPull: (input: WorkspaceToolGitPullInput) =>
        request<WorkspaceToolGitPullResult>(
          "/api/workspace/git-pull",
          json("POST", input),
        ),
      gitPush: (input: WorkspaceToolGitPushInput) =>
        request<WorkspaceToolGitPushResult>(
          "/api/workspace/git-push",
          json("POST", input),
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

function subscribeDaemonEvents(
  options: DaemonClientOptions,
  handlers: DaemonEventHandlers,
): () => void {
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let socket: WebSocket | undefined;
  let stopped = false;

  const connect = () => {
    let url: string;
    try {
      url = daemonEventUrl(options.baseUrl);
    } catch (cause) {
      stopped = true;
      handlers.onInvalidEvent?.(
        DaemonRequestError.invalidResponse(
          cause instanceof Error ? cause.message : String(cause),
          0,
        ),
      );
      return;
    }

    const protocol =
      options.token === undefined || options.token === null
        ? undefined
        : `angel-engine-token.${options.token}`;
    const next =
      protocol === undefined
        ? new WebSocket(url)
        : new WebSocket(url, protocol);
    socket = next;
    next.addEventListener("open", () => handlers.onOpen?.());
    next.addEventListener("message", (message) => {
      let candidate: unknown;
      try {
        candidate = JSON.parse(String(message.data));
      } catch (cause) {
        stopped = true;
        handlers.onInvalidEvent?.(
          DaemonRequestError.invalidResponse(
            cause instanceof Error ? cause.message : String(cause),
            0,
          ),
        );
        next.close(1003, "Invalid daemon event");
        return;
      }
      if (!isDaemonGlobalEvent(candidate)) {
        handlers.onInvalidEvent?.(
          DaemonRequestError.invalidResponse(
            "Daemon returned an invalid global event.",
            0,
          ),
        );
        return;
      }
      handlers.onEvent(candidate);
    });
    next.addEventListener("close", () => {
      if (socket !== next) return;
      socket = undefined;
      if (!stopped) reconnectTimer = setTimeout(connect, 1_000);
    });
  };

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    socket?.close();
    socket = undefined;
  };
}

function daemonEventUrl(baseUrl: string): string {
  const origin =
    baseUrl.length > 0
      ? baseUrl
      : typeof location === "undefined"
        ? undefined
        : location.origin;
  if (origin === undefined) {
    throw new Error("Daemon event URL requires an absolute base URL.");
  }
  const url = new URL("/api/events", origin);
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  else throw new Error(`Unsupported daemon event protocol: ${url.protocol}`);
  return url.toString();
}
