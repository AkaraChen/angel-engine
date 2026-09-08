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
import { workspaceToolWriteFileInputSchema } from "@angel-engine/daemon-api/workspace-tools";
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
  workspaceFileTree,
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
