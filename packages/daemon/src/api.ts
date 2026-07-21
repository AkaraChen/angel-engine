import type {
  Chat,
  ChatElicitationResponse,
  ChatIdsInput,
  ChatSendInput,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";
import type { Hono } from "hono";
import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";
import type { Db } from "./platform/db";
import type { DaemonRuntime } from "./platform/runtime";
import type { ChatStreamControls } from "./features/chat/runtime";

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
  chatSendInputSchema,
  chatSetModeInputSchema,
  chatSetPermissionModeInputSchema,
  chatSetRuntimeInputSchema,
  normalizeChatAttachmentsInput,
} from "@angel-engine/daemon-api/chat";
import {
  createProjectInputSchema,
  updateProjectInputSchema,
} from "@angel-engine/daemon-api/projects";
import {
  workspaceToolGitCommitInputSchema,
  workspaceToolWriteFileInputSchema,
} from "@angel-engine/daemon-api/workspace-tools";
import { listAvailableAgents } from "./features/agents/availability";
import {
  createCustomAgent,
  customAgentDeleteImpact,
  deleteCustomAgentWithChats,
  listCustomAgents,
  updateCustomAgent,
} from "./features/agents/repository";
import { listSkillsForAgent } from "./features/agents/skills";
import { ChatEngine } from "./features/chat/engine-runtime";
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

export interface EventPublisher {
  publish: (event: DaemonGlobalEvent) => void;
}

interface ActiveStream {
  abortController: AbortController;
  resolveElicitation?: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => Promise<void>;
}

export function registerApi(
  app: Hono,
  runtime: DaemonRuntime,
  publisher: EventPublisher,
) {
  const streams = new Map<string, ActiveStream>();
  const run = <A>(
    effect: Effect.Effect<A, DaemonError, Db | ChatEngine>,
  ): Promise<A> => runDaemonApi(runtime, effect);
  const engine = <A>(
    use: (
      chatEngine: Effect.Effect.Success<typeof ChatEngine>,
    ) => Effect.Effect<A, DaemonError, Db>,
  ) => Effect.flatMap(ChatEngine, use);

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
    const chat = await run(engine((e) => e.createChatFromInput(input)));
    publishChatMetadata(publisher, [chat.id]);
    return context.json(chat);
  });
  app.patch("/api/chats/:id", async (context) => {
    const body = await context.req.json<{ pinned?: boolean; title?: string }>();
    const chatId = context.req.param("id");
    if (typeof body.title === "string") {
      const chat = await run(renameChat(chatId, body.title));
      publishChatMetadata(publisher, [chat.id]);
      return context.json(chat);
    }
    if (typeof body.pinned === "boolean") {
      const chat = await run(setChatPinned(chatId, body.pinned));
      publishChatMetadata(publisher, [chat.id]);
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
    publishChatMetadata(publisher, [chatId]);
    return context.json({ ok: true });
  });
  app.post("/api/chats/:id/archive", async (context) => {
    const chat = await run(archiveChat(context.req.param("id")));
    publishChatMetadata(publisher, [chat.id]);
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
    publishChatMetadata(publisher, [chat.id]);
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
    publishChatMetadata(
      publisher,
      targets.map((chat) => chat.id),
    );
    return context.json({
      deletedCount,
      deletedWorktreeCount: worktrees.length,
    });
  });
  app.post("/api/chats/archived/restore", async (context) => {
    const body = await context.req.json<ChatIdsInput>();
    const chats = await run(restoreArchivedChats(readChatIds(body)));
    publishChatMetadata(
      publisher,
      chats.map((chat) => chat.id),
    );
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
    publishChatMetadata(publisher, chatIds);
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
    publishChatMetadata(publisher, deletedChatIds);
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

  app.post("/api/chat-streams", async (context) => {
    const streamId = requireQuery(context.req.query("streamId"), "streamId");
    const input = parseSendInput(await context.req.json());
    return streamSSE(context, async (stream) => {
      const abortController = new AbortController();
      const active: ActiveStream = { abortController };
      streams.set(streamId, active);
      const controls: ChatStreamControls = {
        setResolveElicitation(handler) {
          active.resolveElicitation = handler;
        },
      };
      let sendQueue = Promise.resolve();
      const send = (event: ChatStreamEvent) => {
        sendQueue = sendQueue.then(async () => {
          publisher.publish({ event, streamId, type: "chat-stream" });
          await stream.writeSSE({
            data: JSON.stringify(event),
            event: event.type,
          });
        });
        return sendQueue;
      };
      stream.onAbort(() => abortController.abort());
      try {
        const result = await run(
          engine((e) =>
            e.streamChat(
              input,
              (event) => {
                void send(event).catch(() => abortController.abort());
              },
              abortController.signal,
              controls,
            ),
          ),
        );
        await send({ result, type: "result" });
      } catch (error) {
        await send({ message: errorMessage(error), type: "error" });
      } finally {
        try {
          await send({ type: "done" });
        } finally {
          streams.delete(streamId);
        }
      }
    });
  });
  app.delete("/api/chat-streams/:id", (context) => {
    streams.get(context.req.param("id"))?.abortController.abort();
    return context.json({ ok: true });
  });
  app.post("/api/chat-streams/:id/elicitation", async (context) => {
    const active = streams.get(context.req.param("id"));
    if (active?.resolveElicitation === undefined)
      throw DaemonError.chatStreamNotWaiting();
    const body = await context.req.json<{
      elicitationId: string;
      response: ChatElicitationResponse;
    }>();
    await active.resolveElicitation(body.elicitationId, body.response);
    return context.json({ resolved: true });
  });
}

function publishChatMetadata(publisher: EventPublisher, chatIds: string[]) {
  if (chatIds.length === 0) return;
  publisher.publish({ chatIds, type: "chat-metadata-changed" });
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

function optionalNumber(value: string | undefined) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number))
    throw DaemonError.invalidRequest("Expected a finite number.");
  return number;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
