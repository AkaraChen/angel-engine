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
  isAgentRuntime,
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
import { setLinearToken } from "./features/links/secrets";
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
  requireChat,
  requireArchivedChat,
  restoreArchivedChats,
  setChatPinned,
} from "./features/chat/repository";
import { searchProjectFiles } from "./features/projects/file-search";
import { getProject, listProjects } from "./features/projects/repository";
import { getChatDiffAnchor } from "./features/chat/diff-anchors";
import {
  workspaceGitDiff,
  workspaceReadFile,
} from "./features/workspace-tools/service";
import { DaemonError } from "./platform/errors";
import { runDaemonApi } from "./platform/runtime";
import { ProcessRegistryService } from "./processes";

export function registerApi(
  app: Hono,
  runtime: DaemonRuntime,
  chatEvents: ChatEventsApi,
  options: {
    internalBridgeSecret?: string;
  } = {},
) {
  const run = <A>(
    effect: Effect.Effect<A, DaemonError, Db | ChatEngine>,
  ): Promise<A> => runDaemonApi(runtime, effect);
  const engine = <A>(
    use: (
      chatEngine: Effect.Effect.Success<typeof ChatEngine>,
    ) => Effect.Effect<A, DaemonError, Db>,
  ) => Effect.flatMap(ChatEngine, use);
  const activity = new ChatActivityStore({
    onChange: (chatId) => {
      chatEvents.activityChanged(chatId);
    },
  });
  const chatRuns = new ChatRunRegistry({
    execute: async (input, onEvent, signal, controls, runId) => {
      const claim = await run(
        engine((e) => e.beginQueuedChatRunDispatch(runId)),
      );
      if (claim === "dispatching") {
        throw DaemonError.invalidRequest(
          "Queued chat run dispatch was interrupted; cancel it before retrying.",
        );
      }
      try {
        return await run(
          engine((e) => e.streamChat(input, onEvent, signal, controls)),
        );
      } finally {
        if (claim === "claimed") {
          await run(engine((e) => e.completeQueuedChatRun(runId)));
        }
      }
    },
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
  const queuedRunRecovery = run(
    engine((chatEngine) => chatEngine.restoreQueuedChatRuns()),
  ).then((queuedRuns) => {
    for (const queued of queuedRuns) {
      if (chatRuns.active(queued.input.chatId).run !== null) continue;
      chatRuns.start(queued.runId, queued.input);
      activity.start(queued.input.chatId, queued.runId);
      chatEvents.conversationChanged([queued.input.chatId]);
    }
  });
  void queuedRunRecovery.catch(() => undefined);
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

  app.get("/api/chats", async (context) => {
    const chats = await run(listChats());
    return context.json(chats);
  });
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
    const result = await run(engine((e) => e.importChat(input)));
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
    chatRuns.discardChat(chatId);
    await run(
      Effect.gen(function* () {
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
    const { deletedCount, targets } = await run(
      Effect.gen(function* () {
        const [activeChats, archivedChats] = yield* Effect.all([
          listChats(),
          listArchivedChats(),
        ]);
        const targets = [...activeChats, ...archivedChats];
        const chatEngine = yield* ChatEngine;
        for (const chat of targets) {
          chatRuns.discardChat(chat.id);
        }
        yield* chatEngine.closeChatSession();
        const deletedCount = yield* deleteAllChats();
        return { deletedCount, targets };
      }),
    );
    chatEvents.metadataChanged(targets.map((chat) => chat.id));
    for (const chat of targets) activity.clearChat(chat.id);
    return context.json({ deletedCount, deletedWorktreeCount: 0 });
  });
  app.post("/api/chats/archived/restore", async (context) => {
    const body = await context.req.json<ChatIdsInput>();
    const chats = await run(restoreArchivedChats(readChatIds(body)));
    chatEvents.metadataChanged(chats.map((chat) => chat.id));
    return context.json(chats);
  });
  app.post("/api/chats/archived/delete", async (context) => {
    const chatIds = readChatIds(await context.req.json<ChatIdsInput>());
    const deletedChats = await run(deleteArchivedChats(chatIds));
    for (const chatId of chatIds) activity.clearChat(chatId);
    chatEvents.metadataChanged(chatIds);
    return context.json({
      deletedCount: deletedChats.length,
      deletedWorktreeCount: 0,
      deletedWorktrees: [],
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
        const runtimeId = context.req.param("id");
        const candidateChats = [
          ...(yield* listChats()),
          ...(yield* listArchivedChats()),
        ].filter((chat) => chat.runtime === runtimeId);
        const chatEngine = yield* ChatEngine;
        for (const chat of candidateChats) {
          chatRuns.discardChat(chat.id);
        }
        const chatIds = yield* deleteCustomAgentWithChats(runtimeId);
        for (const chatId of chatIds) {
          yield* chatEngine.closeChatSession(chatId);
          yield* chatEngine.finishChatDeletion(chatId);
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

  app.put("/api/internal/secrets/linear", async (context) => {
    const expectedMainSecret = options.internalBridgeSecret;
    if (
      expectedMainSecret === undefined ||
      expectedMainSecret.length === 0 ||
      context.req.header("x-angel-main-secret") !== expectedMainSecret
    ) {
      throw DaemonError.invalidRequest(
        "Internal main-process request required.",
      );
    }
    const input = arkType({ "token?": "string" })(await context.req.json());
    if (input instanceof arkType.errors)
      throw DaemonError.invalidRequest("Linear secret update is invalid.");
    setLinearToken(input.token);
    return context.json({ hasToken: input.token !== undefined });
  });

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

  app.get("/api/workspace/git-diff", async (context) =>
    context.json(
      await run(
        workspaceGitDiff(
          {
            baseKind: context.req.query("baseKind"),
            baseRef: context.req.query("baseRef"),
            chatId: context.req.query("chatId"),
            root: requireQuery(context.req.query("root"), "root"),
          },
          (chatId, kind) =>
            getChatDiffAnchor(chatId, kind).pipe(
              Effect.map((anchor) =>
                anchor
                  ? { ref: anchor.turnId ?? undefined, sha: anchor.sha }
                  : undefined,
              ),
            ),
        ),
      ),
    ),
  );
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

  app.post("/api/chat-runs/:runId", async (context) => {
    const runId = requirePath(context.req.param("runId"), "runId");
    const input = parseRunStartInput(await context.req.json());
    await queuedRunRecovery;
    chatRuns.reserve(runId, input);
    try {
      await run(engine((chatEngine) => chatEngine.queueChatRun(runId, input)));
    } catch (error) {
      chatRuns.stop(runId);
      throw error;
    }
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
  app.get("/api/chats/:chatId/ambiguous-run", async (context) => {
    const chatId = requirePath(context.req.param("chatId"), "chatId");
    const ambiguous = await run(
      engine((chatEngine) => chatEngine.ambiguousQueuedChatRun(chatId)),
    );
    const active = chatRuns.active(chatId).run;
    return context.json({
      run: active?.runId === ambiguous.run?.runId ? null : ambiguous.run,
    });
  });
  app.delete("/api/chats/:chatId/ambiguous-run", async (context) => {
    const chatId = requirePath(context.req.param("chatId"), "chatId");
    const ambiguous = await run(
      engine((chatEngine) => chatEngine.ambiguousQueuedChatRun(chatId)),
    );
    const active = chatRuns.active(chatId).run;
    if (active?.runId === ambiguous.run?.runId) {
      throw DaemonError.invalidRequest(
        "An active chat run cannot be cleared as ambiguous.",
      );
    }
    const cancelled = await run(
      engine((chatEngine) => chatEngine.cancelAmbiguousQueuedChatRun(chatId)),
    );
    if (cancelled !== null) {
      activity.clearChat(chatId);
      chatEvents.conversationChanged([chatId]);
    }
    return context.json({ cleared: cancelled !== null });
  });
  app.get("/api/chat-runs/:runId/events", (context) => {
    const runId = requirePath(context.req.param("runId"), "runId");
    chatRuns.snapshot(runId);
    return observeChatRun(context, chatRuns, runId, false);
  });
  app.delete("/api/chat-runs/:runId", async (context) => {
    const runId = requirePath(context.req.param("runId"), "runId");
    let snapshot;
    try {
      snapshot = chatRuns.snapshot(runId);
    } catch (error) {
      const cancelled = await run(
        engine((chatEngine) => chatEngine.cancelQueuedChatRun(runId)),
      );
      if (cancelled === null) throw error;
      activity.clearChat(cancelled.chatId);
      chatEvents.conversationChanged([cancelled.chatId]);
      return context.json({ ok: true });
    }
    activity.cancel(snapshot.chatId, runId);
    chatRuns.stop(runId);
    await run(engine((chatEngine) => chatEngine.cancelQueuedChatRun(runId)));
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

  return () => {};
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
