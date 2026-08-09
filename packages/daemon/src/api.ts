import type {
  Chat,
  ChatIdsInput,
  ChatRunStartInput,
  ChatSendInput,
  ChatStreamElicitationResolveInput,
} from "@angel-engine/daemon-api/chat";
import type { Context, Hono } from "hono";
import type { ChatEventsApi } from "./features/chat/chat-events";
import type { Db } from "./platform/db";
import type { DaemonRuntime } from "./platform/runtime";

import { type as arkType } from "arktype";
import { Effect } from "effect";
import { streamSSE } from "hono/streaming";
import {
  createCustomAgentInputSchema,
  isCustomAgentRuntime,
  updateCustomAgentInputSchema,
} from "@angel-engine/daemon-api/agents";
import {
  chatCreateInputSchema,
  chatPrewarmInputSchema,
  chatRuntimeConfigInputSchema,
  importChatInputSchema,
  isChatAttentionReadInput,
  isChatElicitationResponse,
  isChatRunStartInput,
  listImportableSessionsInputSchema,
  chatSendInputSchema,
  chatSetModeInputSchema,
  chatSetPermissionModeInputSchema,
  chatSetRuntimeInputSchema,
  normalizeChatAttachmentsInput,
} from "@angel-engine/daemon-api/chat";
import { githubResolveUrlInputSchema } from "@angel-engine/daemon-api/github";
import {
  createProjectInputSchema,
  managedWorktreeDeleteInputSchema,
  updateProjectConfigInputSchema,
  updateProjectInputSchema,
} from "@angel-engine/daemon-api/projects";
import {
  workspaceToolGitCommitInputSchema,
  workspaceToolWriteFileInputSchema,
} from "@angel-engine/daemon-api/workspace-tools";
import { listGitHubItems } from "./features/github/list";
import { resolveGitHubUrl } from "./features/github/resolve";
import { listAvailableAgents } from "./features/agents/availability";
import {
  createCustomAgent,
  customAgentDeleteImpact,
  deleteCustomAgentWithChats,
  listCustomAgents,
  updateCustomAgent,
} from "./features/agents/repository";
import { listSkillsForAgent } from "./features/agents/skills";
import { ChatActivityStore } from "./features/chat/activity";
import { ChatEngine } from "./features/chat/engine-runtime";
import { ChatRunRegistry } from "./features/chat/run-registry";
import {
  archiveChat,
  deleteAllChats,
  deleteArchivedChats,
  deleteChat,
  getChat,
  listArchivedChats,
  listChats,
  renameChat,
  requireArchivedChat,
  restoreArchivedChats,
  setChatPinned,
} from "./features/chat/repository";
import {
  managedWorktreePath,
  removeManagedWorktree,
} from "./features/projects/git";
import { projectGitStatus } from "./features/projects/git";
import {
  deleteManagedWorktrees,
  scanManagedWorktrees,
} from "./features/projects/managed-worktrees";
import {
  readProjectConfig,
  updateProjectConfig,
} from "./features/projects/settings";
import { searchProjectFiles } from "./features/projects/file-search";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "./features/projects/repository";
import {
  workspaceFileTree,
  workspaceGitCommit,
  workspaceGitDiff,
  workspaceReadFile,
  workspaceWriteFile,
} from "./features/workspace-tools/service";
import { DaemonError } from "./platform/errors";
import { runDaemonApi } from "./platform/runtime";
import { ProcessRegistryService } from "./processes";

export function registerApi(
  app: Hono,
  runtime: DaemonRuntime,
  chatEvents: ChatEventsApi,
) {
  const activity = new ChatActivityStore({
    onChange: (chatId) => chatEvents.activityChanged(chatId),
  });
  const run = <A>(
    effect: Effect.Effect<A, DaemonError, Db | ChatEngine>,
  ): Promise<A> => runDaemonApi(runtime, effect);
  const engine = <A>(
    use: (
      chatEngine: Effect.Effect.Success<typeof ChatEngine>,
    ) => Effect.Effect<A, DaemonError, Db>,
  ) => Effect.flatMap(ChatEngine, use);
  const chatRuns = new ChatRunRegistry({
    execute: (input, onEvent, signal, controls) =>
      run(engine((e) => e.streamChat(input, onEvent, signal, controls))),
    isRunIdRetained: (chatId, runId) => activity.hasRun(chatId, runId),
    onEvent: ({ chatId, event, runId }) => {
      activity.apply(chatId, runId, event);
      // A settled run means the chat's persisted history grew. Clients attached
      // to the run stream already saw the turn; those that were not attached
      // hold stale history and have no other signal to refetch on.
      if (event.type === "result" || event.type === "error") {
        chatEvents.conversationChanged([chatId]);
      }
    },
  });
  void runDaemonApi(
    runtime,
    Effect.flatMap(ProcessRegistryService, (registry) =>
      registry.observeChat((entries) =>
        activity.replaceProcessEntries(entries),
      ),
    ),
  ).catch(() => undefined);

  app.get("/api/chat-activity", (context) => context.json(activity.list()));
  app.get("/api/chat-attention", (context) =>
    context.json(activity.attentionList()),
  );
  app.post("/api/chats/:id/attention/read", async (context) => {
    const input = await context.req.json<unknown>();
    if (!isChatAttentionReadInput(input)) {
      throw DaemonError.invalidRequest("Chat attention input is invalid.");
    }
    const chatId = requirePath(context.req.param("id"), "chatId");
    const read = activity.acknowledge(chatId, input.attentionId);
    return context.json({ read });
  });

  app.get("/api/chats", async (context) =>
    context.json(await run(listChats())),
  );
  app.get("/api/chats/archived", async (context) =>
    context.json(await run(listArchivedChats())),
  );
  app.get("/api/chats/:id", async (context) =>
    context.json(await run(getChat(context.req.param("id")))),
  );
  app.post("/api/chats", async (context) => {
    const input = chatCreateInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Chat input is required.");
    const chat = await run(
      engine((e) => e.createChatFromInput(input, context.req.raw.signal)),
    );
    chatEvents.metadataChanged([chat.id]);
    return context.json(chat);
  });
  app.post("/api/sessions/importable", async (context) => {
    const input = listImportableSessionsInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest(
        "Importable session list input is required.",
      );
    return context.json(
      await run(engine((e) => e.listImportableSessions(input))),
    );
  });
  app.post("/api/sessions/import", async (context) => {
    const input = importChatInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Import chat input is required.");
    const result = await run(
      engine((e) => e.importChat(input, context.req.raw.signal)),
    );
    chatEvents.metadataChanged([result.chat.id]);
    chatEvents.conversationChanged([result.chat.id]);
    return context.json(result);
  });
  app.patch("/api/chats/:id", async (context) => {
    const body = await context.req.json<{ pinned?: boolean; title?: string }>();
    const chatId = context.req.param("id");
    if (typeof body.title === "string") {
      const chat = await run(renameChat(chatId, body.title));
      chatEvents.metadataChanged([chat.id]);
      return context.json(chat);
    }
    if (typeof body.pinned === "boolean") {
      const chat = await run(setChatPinned(chatId, body.pinned));
      chatEvents.metadataChanged([chat.id]);
      return context.json(chat);
    }
    throw DaemonError.invalidRequest("Chat title or pinned state is required.");
  });
  app.delete("/api/chats/:id", async (context) => {
    const chatId = context.req.param("id");
    await run(
      Effect.gen(function* () {
        const chat = yield* getChat(chatId);
        if (chat !== null) yield* removeWorktreesForDeletedChats([chat]);
        const chatEngine = yield* ChatEngine;
        yield* chatEngine.closeChatSession(chatId);
        yield* deleteChat(chatId);
      }),
    );
    activity.clearChat(chatId);
    chatEvents.metadataChanged([chatId]);
    return context.json({ ok: true });
  });
  app.post("/api/chats/:id/archive", async (context) => {
    const chat = await run(archiveChat(context.req.param("id")));
    activity.clearChat(chat.id);
    chatEvents.metadataChanged([chat.id]);
    return context.json(chat);
  });
  app.post("/api/chats/:id/load", async (context) =>
    context.json(
      await run(engine((e) => e.loadChatSession(context.req.param("id")))),
    ),
  );
  app.put("/api/chats/:id/mode", async (context) => {
    const body = await context.req.json<{ mode: string }>();
    const input = chatSetModeInputSchema({
      chatId: context.req.param("id"),
      mode: body.mode,
    });
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Chat mode input is required.");
    return context.json(await run(engine((e) => e.setChatMode(input))));
  });
  app.put("/api/chats/:id/permission-mode", async (context) => {
    const body = await context.req.json<{ mode: string }>();
    const input = chatSetPermissionModeInputSchema({
      chatId: context.req.param("id"),
      mode: body.mode,
    });
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest(
        "Chat permission mode input is required.",
      );
    return context.json(
      await run(engine((e) => e.setChatPermissionMode(input))),
    );
  });
  app.put("/api/chats/:id/runtime", async (context) => {
    const body = await context.req.json<{ runtime: string }>();
    const input = chatSetRuntimeInputSchema({
      chatId: context.req.param("id"),
      runtime: body.runtime,
    });
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Chat runtime input is required.");
    const chat = await run(engine((e) => e.setChatRuntime(input)));
    chatEvents.metadataChanged([chat.id]);
    return context.json(chat);
  });
  app.post("/api/chats/prewarm", async (context) => {
    const input = chatPrewarmInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Chat prewarm input is required.");
    return context.json(await run(engine((e) => e.prewarmChat(input))));
  });
  app.post("/api/chats/runtime-config", async (context) => {
    const input = chatRuntimeConfigInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest(
        "Chat runtime config input is required.",
      );
    return context.json(
      await run(engine((e) => e.inspectChatRuntimeConfig(input))),
    );
  });
  app.post("/api/chats/send", async (context) => {
    const input = parseSendInput(await context.req.json());
    const result = await run(engine((e) => e.sendChat(input)));
    return context.json(result);
  });
  app.delete("/api/chats", async (context) => {
    const { deletedCount, targets, worktrees } = await run(
      Effect.gen(function* () {
        const [activeChats, archivedChats] = yield* Effect.all([
          listChats(),
          listArchivedChats(),
        ]);
        const allTargets = [...activeChats, ...archivedChats];
        const removedWorktrees =
          yield* removeWorktreesForDeletedChats(allTargets);
        const chatEngine = yield* ChatEngine;
        yield* chatEngine.closeChatSession();
        return {
          deletedCount: yield* deleteAllChats(),
          targets: allTargets,
          worktrees: removedWorktrees,
        };
      }),
    );
    chatEvents.metadataChanged(targets.map((chat) => chat.id));
    for (const chat of targets) {
      activity.clearChat(chat.id);
    }
    return context.json({
      deletedCount,
      deletedWorktreeCount: worktrees.length,
    });
  });
  app.post("/api/chats/archived/restore", async (context) => {
    const body = await context.req.json<ChatIdsInput>();
    const chats = await run(restoreArchivedChats(readChatIds(body)));
    chatEvents.metadataChanged(chats.map((chat) => chat.id));
    return context.json(chats);
  });
  app.post("/api/chats/archived/delete-impact", async (context) => {
    const body = await context.req.json<ChatIdsInput>();
    const chatIds = readChatIds(body);
    const targets = await run(
      Effect.all(chatIds.map((id) => requireArchivedChat(id))),
    );
    const worktrees = managedWorktreesForChats(targets);
    return context.json({
      chatCount: targets.length,
      managedWorktreeCount: worktrees.length,
      managedWorktrees: worktrees,
    });
  });
  app.post("/api/chats/archived/delete", async (context) => {
    const chatIds = readChatIds(await context.req.json<ChatIdsInput>());
    const { deletedChats, worktrees } = await run(
      Effect.gen(function* () {
        const targets = yield* Effect.all(
          chatIds.map((id) => requireArchivedChat(id)),
        );
        const removedWorktrees = yield* removeWorktreesForDeletedChats(targets);
        const chatEngine = yield* ChatEngine;
        for (const chat of targets) {
          yield* chatEngine.closeChatSession(chat.id);
        }
        return {
          deletedChats: yield* deleteArchivedChats(chatIds),
          worktrees: removedWorktrees,
        };
      }),
    );
    for (const chatId of chatIds) {
      activity.clearChat(chatId);
    }
    chatEvents.metadataChanged(chatIds);
    return context.json({
      deletedCount: deletedChats.length,
      deletedWorktreeCount: worktrees.length,
      deletedWorktrees: worktrees,
    });
  });

  app.get("/api/agents", async (context) =>
    context.json(await run(listAvailableAgents())),
  );
  app.get("/api/agents/custom", async (context) =>
    context.json(await run(listCustomAgents())),
  );
  app.post("/api/agents/custom", async (context) => {
    const input = createCustomAgentInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Custom agent input is invalid.");
    return context.json(await run(createCustomAgent(input)));
  });
  app.put("/api/agents/custom/:id", async (context) => {
    const id = context.req.param("id");
    if (!isCustomAgentRuntime(id))
      throw DaemonError.invalidRequest("Custom agent id is invalid.");
    const body = await context.req.json<Record<string, unknown>>();
    const input = updateCustomAgentInputSchema({
      ...body,
      id,
    });
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Custom agent input is invalid.");
    return context.json(await run(updateCustomAgent({ ...input, id })));
  });
  app.get("/api/agents/custom/:id/delete-impact", async (context) =>
    context.json(await run(customAgentDeleteImpact(context.req.param("id")))),
  );
  app.delete("/api/agents/custom/:id", async (context) => {
    const deletedChatIds = await run(
      Effect.gen(function* () {
        const chatIds = yield* deleteCustomAgentWithChats(
          context.req.param("id"),
        );
        const chatEngine = yield* ChatEngine;
        for (const chatId of chatIds) {
          yield* chatEngine.closeChatSession(chatId);
        }
        return chatIds;
      }),
    );
    for (const chatId of deletedChatIds) {
      activity.clearChat(chatId);
    }
    chatEvents.metadataChanged(deletedChatIds);
    return context.json({ deletedChatIds });
  });
  app.get("/api/agents/skills", (context) =>
    context.json(
      listSkillsForAgent({
        projectPath: context.req.query("projectPath"),
        runtime: requireQuery(context.req.query("runtime"), "runtime"),
      }),
    ),
  );

  app.post("/api/github/resolve", async (context) => {
    const input = githubResolveUrlInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("GitHub URL is required.");
    return context.json(await run(resolveGitHubUrl(input)));
  });
  app.get("/api/github/items", async (context) =>
    context.json(
      await run(
        listGitHubItems({
          cwd: requireQuery(context.req.query("cwd"), "cwd"),
          limit: optionalNumber(context.req.query("limit")),
          query: context.req.query("query"),
        }),
      ),
    ),
  );

  app.get("/api/projects", async (context) =>
    context.json(await run(listProjects())),
  );
  app.get("/api/projects/files/search", async (context) =>
    context.json(
      await run(
        searchProjectFiles({
          limit: optionalNumber(context.req.query("limit")),
          query: requireQuery(context.req.query("query"), "query"),
          root: requireQuery(context.req.query("root"), "root"),
        }),
      ),
    ),
  );
  app.get("/api/projects/:id", async (context) =>
    context.json(await run(getProject(context.req.param("id")))),
  );
  app.post("/api/projects", async (context) => {
    const input = createProjectInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Project input is invalid.");
    return context.json(await run(createProject(input)));
  });
  app.patch("/api/projects/:id", async (context) => {
    const body = await context.req.json<Record<string, unknown>>();
    const input = updateProjectInputSchema({
      ...body,
      id: context.req.param("id"),
    });
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Project input is invalid.");
    return context.json(await run(updateProject(input)));
  });
  app.delete("/api/projects/:id", async (context) => {
    await run(deleteProject(context.req.param("id")));
    return context.json({ ok: true });
  });
  app.get("/api/projects/:id/config", async (context) =>
    context.json(
      await run(readProjectConfig({ projectId: context.req.param("id") })),
    ),
  );
  app.put("/api/projects/:id/config", async (context) => {
    const body = await context.req.json<Record<string, unknown>>();
    const input = updateProjectConfigInputSchema({
      ...body,
      projectId: context.req.param("id"),
    });
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Project settings are invalid.");
    return context.json(await run(updateProjectConfig(input)));
  });
  app.get("/api/projects/:id/git-status", async (context) =>
    context.json(
      await run(projectGitStatus({ projectId: context.req.param("id") })),
    ),
  );
  app.get("/api/projects/:id/files", async (context) =>
    context.json(
      await run(
        searchProjectFiles({
          limit: optionalNumber(context.req.query("limit")),
          query: requireQuery(context.req.query("query"), "query"),
          root: requireQuery(context.req.query("root"), "root"),
        }),
      ),
    ),
  );

  app.get("/api/worktrees/managed", async (context) =>
    context.json(
      await run(
        scanManagedWorktrees({
          eligibleOnly: context.req.query("eligibleOnly") === "true",
        }),
      ),
    ),
  );
  app.post("/api/worktrees/managed/delete", async (context) => {
    const input = managedWorktreeDeleteInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest(
        "Worktree deletion confirmation is required.",
      );
    const result = await run(
      Effect.gen(function* () {
        const chatEngine = yield* ChatEngine;
        return yield* deleteManagedWorktrees(input, (chatId) =>
          chatEngine.closeChatSession(chatId),
        );
      }),
    );
    for (const chatId of result.deletedChatIds) {
      activity.clearChat(chatId);
    }
    chatEvents.metadataChanged(result.deletedChatIds);
    return context.json(result);
  });

  app.get("/api/workspace/file-tree", async (context) =>
    context.json(
      await run(
        workspaceFileTree(requireQuery(context.req.query("root"), "root")),
      ),
    ),
  );
  app.get("/api/workspace/git-diff", async (context) =>
    context.json(
      await run(
        workspaceGitDiff(requireQuery(context.req.query("root"), "root")),
      ),
    ),
  );
  app.post("/api/workspace/git-commit", async (context) => {
    const input = workspaceToolGitCommitInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Git commit input is invalid.");
    return context.json(await run(workspaceGitCommit(input)));
  });
  app.get("/api/workspace/file", async (context) =>
    context.json(
      await run(
        workspaceReadFile(
          requireQuery(context.req.query("root"), "root"),
          requireQuery(context.req.query("path"), "path"),
        ),
      ),
    ),
  );
  app.put("/api/workspace/file", async (context) => {
    const body = workspaceToolWriteFileInputSchema(await context.req.json());
    if (body instanceof arkType.errors)
      throw DaemonError.invalidRequest("Workspace file input is invalid.");
    return context.json(
      await run(workspaceWriteFile(body.root, body.path, body.content)),
    );
  });

  app.post("/api/chat-runs/:runId", async (context) => {
    const runId = requirePath(context.req.param("runId"), "runId");
    const input = parseRunStartInput(await context.req.json());
    chatRuns.reserve(runId, input);
    activity.start(input.chatId, runId);
    // Other devices with this chat open are not attached to anything yet: they
    // probed `active-run` when they mounted and found nothing. Tell them a run
    // exists so they attach instead of sitting idle for the whole turn.
    chatEvents.conversationChanged([input.chatId]);
    return observeChatRun(context, chatRuns, runId, true);
  });
  app.get("/api/chats/:chatId/active-run", (context) =>
    context.json(
      chatRuns.active(requirePath(context.req.param("chatId"), "chatId")),
    ),
  );
  app.get("/api/chat-runs/:runId/events", (context) => {
    const runId = requirePath(context.req.param("runId"), "runId");
    chatRuns.snapshot(runId);
    return observeChatRun(context, chatRuns, runId, false);
  });
  app.delete("/api/chat-runs/:runId", (context) => {
    const runId = requirePath(context.req.param("runId"), "runId");
    const snapshot = chatRuns.snapshot(runId);
    activity.cancel(snapshot.chatId, runId);
    chatRuns.stop(runId);
    chatEvents.conversationChanged([snapshot.chatId]);
    return context.json({ ok: true });
  });
  app.post("/api/chat-runs/:runId/elicitation", async (context) => {
    const runId = requirePath(context.req.param("runId"), "runId");
    const body = parseElicitationResolveInput(await context.req.json());
    const snapshot = chatRuns.snapshot(runId);
    await chatRuns.resolveElicitation(runId, body.elicitationId, body.response);
    activity.resolveInput(snapshot.chatId, runId, body.elicitationId);
    return context.json({ resolved: true });
  });
}

function observeChatRun(
  context: Context,
  registry: ChatRunRegistry,
  runId: string,
  begin: boolean,
) {
  return streamSSE(context, async (stream) => {
    await new Promise<void>((resolve) => {
      const detach = registry.observe(runId, {
        close: resolve,
        write: async (message) => {
          await stream.writeSSE({
            data: JSON.stringify(message),
            event: message.type,
          });
        },
      });
      stream.onAbort(detach);
      if (begin) registry.begin(runId);
    });
  });
}

function parseSendInput(value: unknown): ChatSendInput {
  const input = chatSendInputSchema(value);
  if (input instanceof arkType.errors)
    throw DaemonError.invalidRequest("Chat input is required.");
  return {
    ...input,
    attachments: normalizeChatAttachmentsInput(input.attachments),
    runtime: input.runtime ?? undefined,
  };
}

function parseRunStartInput(value: unknown): ChatRunStartInput {
  if (!isChatRunStartInput(value)) {
    throw DaemonError.invalidRequest("Chat run input is invalid.");
  }
  return {
    attachments: normalizeChatAttachmentsInput(value.attachments),
    chatId: value.chatId,
    mode: value.mode,
    model: value.model,
    permissionMode: value.permissionMode,
    reasoningEffort: value.reasoningEffort,
    text: value.text,
  };
}

function parseElicitationResolveInput(
  value: unknown,
): ChatStreamElicitationResolveInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw DaemonError.invalidRequest("Elicitation input is invalid.");
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.elicitationId !== "string" ||
    input.elicitationId.length === 0
  ) {
    throw DaemonError.invalidRequest("elicitationId is required.");
  }
  if (!isChatElicitationResponse(input.response)) {
    throw DaemonError.invalidRequest("Elicitation response is invalid.");
  }
  return {
    elicitationId: input.elicitationId,
    response: input.response,
  };
}

function readChatIds(input: ChatIdsInput) {
  if (!Array.isArray(input.chatIds) || input.chatIds.length === 0)
    throw DaemonError.invalidRequest("Chat ids are required.");
  return [...new Set(input.chatIds)];
}

function managedWorktreesForChats(chats: Chat[]) {
  return [
    ...new Set(
      chats
        .map((chat) => managedWorktreePath(chat.cwd))
        .filter((cwd): cwd is string => cwd !== undefined),
    ),
  ];
}

function removeWorktreesForDeletedChats(targets: Chat[]) {
  return Effect.gen(function* () {
    const ids = new Set(targets.map((chat) => chat.id));
    const [activeChats, archivedChats] = yield* Effect.all([
      listChats(),
      listArchivedChats(),
    ]);
    const survivors = [...activeChats, ...archivedChats].filter(
      (chat) => !ids.has(chat.id),
    );
    const survivorPaths = new Set(managedWorktreesForChats(survivors));
    const removed: string[] = [];
    for (const worktree of managedWorktreesForChats(targets).filter(
      (value) => !survivorPaths.has(value),
    )) {
      const result = yield* removeManagedWorktree(worktree);
      if (result !== undefined) removed.push(result);
    }
    return removed;
  });
}

function requireQuery(value: string | undefined, name: string) {
  if (value === undefined || value.length === 0)
    throw DaemonError.invalidRequest(`${name} is required.`);
  return value;
}

function requirePath(value: string, name: string) {
  if (value.length === 0)
    throw DaemonError.invalidRequest(`${name} is required.`);
  return value;
}

function optionalNumber(value: string | undefined) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number))
    throw DaemonError.invalidRequest("Expected a finite number.");
  return number;
}
