import type {
  Chat,
  ChatElicitationResponse,
  ChatIdsInput,
  ChatSendInput,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";
import type { Hono } from "hono";
import type { ChatRuntime, ChatStreamControls } from "./features/chat/runtime";
import type { DaemonGlobalEvent } from "@angel-engine/daemon-api";

import { type as arkType } from "arktype";
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
  runtime: ChatRuntime,
  publisher: EventPublisher,
) {
  const streams = new Map<string, ActiveStream>();

  app.get("/api/chats", (context) => context.json(listChats()));
  app.get("/api/chats/archived", (context) =>
    context.json(listArchivedChats()),
  );
  app.get("/api/chats/:id", (context) =>
    context.json(getChat(context.req.param("id"))),
  );
  app.post("/api/chats", async (context) => {
    const input = chatCreateInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw new TypeError("Chat input is required.");
    const chat = runtime.createChatFromInput(input);
    publishChatMetadata(publisher, [chat.id]);
    return context.json(chat);
  });
  app.patch("/api/chats/:id", async (context) => {
    const body = await context.req.json<{ pinned?: boolean; title?: string }>();
    const chatId = context.req.param("id");
    if (typeof body.title === "string") {
      const chat = renameChat(chatId, body.title);
      publishChatMetadata(publisher, [chat.id]);
      return context.json(chat);
    }
    if (typeof body.pinned === "boolean") {
      const chat = setChatPinned(chatId, body.pinned);
      publishChatMetadata(publisher, [chat.id]);
      return context.json(chat);
    }
    throw new TypeError("Chat title or pinned state is required.");
  });
  app.delete("/api/chats/:id", async (context) => {
    const chatId = context.req.param("id");
    const chat = getChat(chatId);
    if (chat !== null) await removeWorktreesForDeletedChats([chat]);
    runtime.closeChatSession(chatId);
    deleteChat(chatId);
    publishChatMetadata(publisher, [chatId]);
    return context.json({ ok: true });
  });
  app.post("/api/chats/:id/archive", (context) => {
    const chat = archiveChat(context.req.param("id"));
    publishChatMetadata(publisher, [chat.id]);
    return context.json(chat);
  });
  app.post("/api/chats/:id/load", (context) =>
    runtime
      .loadChatSession(context.req.param("id"))
      .then((value) => context.json(value)),
  );
  app.put("/api/chats/:id/mode", async (context) => {
    const body = await context.req.json<{ mode: string }>();
    const input = chatSetModeInputSchema({
      chatId: context.req.param("id"),
      mode: body.mode,
    });
    if (input instanceof arkType.errors)
      throw new TypeError("Chat mode input is required.");
    return context.json(await runtime.setChatMode(input));
  });
  app.put("/api/chats/:id/permission-mode", async (context) => {
    const body = await context.req.json<{ mode: string }>();
    const input = chatSetPermissionModeInputSchema({
      chatId: context.req.param("id"),
      mode: body.mode,
    });
    if (input instanceof arkType.errors)
      throw new TypeError("Chat permission mode input is required.");
    return context.json(await runtime.setChatPermissionMode(input));
  });
  app.put("/api/chats/:id/runtime", async (context) => {
    const body = await context.req.json<{ runtime: string }>();
    const input = chatSetRuntimeInputSchema({
      chatId: context.req.param("id"),
      runtime: body.runtime,
    });
    if (input instanceof arkType.errors)
      throw new TypeError("Chat runtime input is required.");
    const chat = runtime.setChatRuntime(input);
    publishChatMetadata(publisher, [chat.id]);
    return context.json(chat);
  });
  app.post("/api/chats/prewarm", async (context) => {
    const input = chatPrewarmInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw new TypeError("Chat prewarm input is required.");
    return context.json(await runtime.prewarmChat(input));
  });
  app.post("/api/chats/runtime-config", async (context) => {
    const input = chatRuntimeConfigInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw new TypeError("Chat runtime config input is required.");
    return context.json(await runtime.inspectChatRuntimeConfig(input));
  });
  app.post("/api/chats/send", async (context) =>
    context.json(
      await runtime.sendChat(parseSendInput(await context.req.json())),
    ),
  );
  app.delete("/api/chats", async (context) => {
    const targets = [...listChats(), ...listArchivedChats()];
    const worktrees = await removeWorktreesForDeletedChats(targets);
    runtime.closeChatSession();
    publishChatMetadata(
      publisher,
      targets.map((chat) => chat.id),
    );
    return context.json({
      deletedCount: deleteAllChats(),
      deletedWorktreeCount: worktrees.length,
    });
  });
  app.post("/api/chats/archived/restore", async (context) => {
    const chats = restoreArchivedChats(readChatIds(await context.req.json()));
    publishChatMetadata(
      publisher,
      chats.map((chat) => chat.id),
    );
    return context.json(chats);
  });
  app.post("/api/chats/archived/delete-impact", async (context) => {
    const targets = readChatIds(await context.req.json()).map(
      requireArchivedChat,
    );
    const worktrees = managedWorktreesForChats(targets);
    return context.json({
      chatCount: targets.length,
      managedWorktreeCount: worktrees.length,
      managedWorktrees: worktrees,
    });
  });
  app.post("/api/chats/archived/delete", async (context) => {
    const chatIds = readChatIds(await context.req.json());
    const targets = chatIds.map(requireArchivedChat);
    const worktrees = await removeWorktreesForDeletedChats(targets);
    for (const chat of targets) runtime.closeChatSession(chat.id);
    publishChatMetadata(publisher, chatIds);
    return context.json({
      deletedCount: deleteArchivedChats(chatIds).length,
      deletedWorktreeCount: worktrees.length,
      deletedWorktrees: worktrees,
    });
  });

  app.get("/api/agents", (context) => context.json(listAvailableAgents()));
  app.get("/api/agents/custom", (context) => context.json(listCustomAgents()));
  app.post("/api/agents/custom", async (context) => {
    const input = createCustomAgentInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw new TypeError("Custom agent input is invalid.");
    return context.json(createCustomAgent(input));
  });
  app.put("/api/agents/custom/:id", async (context) => {
    const id = context.req.param("id");
    if (!isCustomAgentRuntime(id))
      throw new TypeError("Custom agent id is invalid.");
    const input = updateCustomAgentInputSchema({
      ...(await context.req.json()),
      id,
    });
    if (input instanceof arkType.errors)
      throw new TypeError("Custom agent input is invalid.");
    return context.json(updateCustomAgent({ ...input, id }));
  });
  app.get("/api/agents/custom/:id/delete-impact", (context) =>
    context.json(customAgentDeleteImpact(context.req.param("id"))),
  );
  app.delete("/api/agents/custom/:id", (context) => {
    const deletedChatIds = deleteCustomAgentWithChats(context.req.param("id"));
    for (const chatId of deletedChatIds) runtime.closeChatSession(chatId);
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

  app.get("/api/projects", (context) => context.json(listProjects()));
  app.get("/api/projects/files/search", (context) =>
    searchProjectFiles({
      limit: optionalNumber(context.req.query("limit")),
      query: requireQuery(context.req.query("query"), "query"),
      root: requireQuery(context.req.query("root"), "root"),
    }).then((value) => context.json(value)),
  );
  app.get("/api/projects/:id", (context) =>
    context.json(getProject(context.req.param("id"))),
  );
  app.post("/api/projects", async (context) => {
    const input = createProjectInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw new TypeError("Project input is invalid.");
    return context.json(createProject(input));
  });
  app.patch("/api/projects/:id", async (context) => {
    const input = updateProjectInputSchema({
      ...(await context.req.json()),
      id: context.req.param("id"),
    });
    if (input instanceof arkType.errors)
      throw new TypeError("Project input is invalid.");
    return context.json(updateProject(input));
  });
  app.delete("/api/projects/:id", (context) => {
    deleteProject(context.req.param("id"));
    return context.json({ ok: true });
  });
  app.get("/api/projects/:id/git-status", (context) =>
    projectGitStatus({ projectId: context.req.param("id") }).then((value) =>
      context.json(value),
    ),
  );
  app.get("/api/projects/:id/files", (context) =>
    searchProjectFiles({
      limit: optionalNumber(context.req.query("limit")),
      query: requireQuery(context.req.query("query"), "query"),
      root: requireQuery(context.req.query("root"), "root"),
    }).then((value) => context.json(value)),
  );

  app.get("/api/workspace/file-tree", (context) =>
    workspaceFileTree(requireQuery(context.req.query("root"), "root")).then(
      (value) => context.json(value),
    ),
  );
  app.get("/api/workspace/git-diff", (context) =>
    workspaceGitDiff(requireQuery(context.req.query("root"), "root")).then(
      (value) => context.json(value),
    ),
  );
  app.post("/api/workspace/git-commit", async (context) => {
    const input = workspaceToolGitCommitInputSchema(await context.req.json());
    if (input instanceof arkType.errors)
      throw new TypeError("Git commit input is invalid.");
    return context.json(await workspaceGitCommit(input));
  });
  app.get("/api/workspace/file", (context) =>
    workspaceReadFile(
      requireQuery(context.req.query("root"), "root"),
      requireQuery(context.req.query("path"), "path"),
    ).then((value) => context.json(value)),
  );
  app.put("/api/workspace/file", async (context) => {
    const body = workspaceToolWriteFileInputSchema(await context.req.json());
    if (body instanceof arkType.errors)
      throw new TypeError("Workspace file input is invalid.");
    return context.json(
      await workspaceWriteFile(body.root, body.path, body.content),
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
        const result = await runtime.streamChat(
          input,
          (event) => {
            void send(event).catch(() => abortController.abort());
          },
          abortController.signal,
          controls,
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
      throw new Error("Chat stream is not waiting for user input.");
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
    throw new TypeError("Chat input is required.");
  return {
    ...input,
    attachments: normalizeChatAttachmentsInput(input.attachments),
    runtime: input.runtime ?? undefined,
  };
}

function readChatIds(input: ChatIdsInput) {
  if (!Array.isArray(input.chatIds) || input.chatIds.length === 0)
    throw new TypeError("Chat ids are required.");
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

async function removeWorktreesForDeletedChats(targets: Chat[]) {
  const ids = new Set(targets.map((chat) => chat.id));
  const survivors = [...listChats(), ...listArchivedChats()].filter(
    (chat) => !ids.has(chat.id),
  );
  const survivorPaths = new Set(managedWorktreesForChats(survivors));
  const removed: string[] = [];
  for (const worktree of managedWorktreesForChats(targets).filter(
    (value) => !survivorPaths.has(value),
  )) {
    const result = await removeManagedWorktree(worktree);
    if (result !== undefined) removed.push(result);
  }
  return removed;
}

function requireQuery(value: string | undefined, name: string) {
  if (value === undefined || value.length === 0)
    throw new TypeError(`${name} is required.`);
  return value;
}

function optionalNumber(value: string | undefined) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new TypeError("Expected a finite number.");
  return number;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
