import type {
  ChatActiveRunSnapshot,
  ChatElicitationResponse,
  ChatLoadResult,
  ChatRunObserverEvent,
  ChatRunStartInput,
  ConversationMessage,
  DaemonElicitation,
  DaemonPlanData,
  DaemonRuntimeConfig,
  ProjectedConversationToolCall,
} from "@/platform/chat-types";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { DaemonRequestError } from "@angel-engine/daemon-client";

import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

import {
  partsToPlans,
  partsToText,
  partsToToolCalls,
  toConversation,
  toolCallFromAction,
} from "./message-view";
import { clearNewChatPrompt, readNewChatPrompt } from "./new-chat-prompt";
import { findPlanModeToggleTarget } from "./mode-options";
import { normalizeConversationPlans, upsertPlan } from "./plan-utils";

export interface Conversation {
  /** Persisted history plus the live (streaming) turn, in render order. */
  messages: ConversationMessage[];
  /** History load state. */
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  /** True while an assistant turn is streaming. */
  isStreaming: boolean;
  /** Send a user message and stream the assistant reply. */
  send: (text: string) => void;
  /** Abort the in-flight assistant turn, if any. */
  stop: () => void;
  /** An elicitation (permission/input prompt) the daemon is waiting on, if any. */
  pendingElicitation: DaemonElicitation | null;
  /** Answer the pending elicitation so the waiting turn can continue. */
  respondElicitation: (response: ChatElicitationResponse) => void;
  /** Runtime config from chat load / mode mutations (drives plan mode UI). */
  runtimeConfig: DaemonRuntimeConfig | null;
  /** True while a setMode / setPermissionMode call is in flight. */
  isModePending: boolean;
  /** Switch the agent mode (when `canSetMode`). */
  setMode: (mode: string) => Promise<void>;
  /** Switch the permission mode (when `canSetPermissionMode`). */
  setPermissionMode: (mode: string) => Promise<void>;
}

interface LiveTurn {
  userId: string;
  assistantId: string;
  userText: string;
  assistantText: string;
  assistantReasoning: string;
  /** Tool calls streamed this turn, in first-seen order and upserted by id. */
  assistantToolCalls: ProjectedConversationToolCall[];
  /** Plan snapshots streamed this turn, upserted by kind. */
  assistantPlans: DaemonPlanData[];
}

const EMPTY_TURN: LiveTurn = {
  userId: "",
  assistantId: "",
  userText: "",
  assistantText: "",
  assistantReasoning: "",
  assistantToolCalls: [],
  assistantPlans: [],
};

/** Upsert a streamed tool action into the turn's ordered tool-call list. */
function upsertToolCall(
  calls: ProjectedConversationToolCall[],
  call: ProjectedConversationToolCall,
): ProjectedConversationToolCall[] {
  const index = calls.findIndex((existing) => existing.id === call.id);
  if (index === -1) return [...calls, call];
  const next = calls.slice();
  next[index] = call;
  return next;
}

function newStreamId(): string {
  // `crypto.randomUUID` is only available in secure contexts; the mobile app may
  // be served over plain http from the daemon, so fall back to a manual v4.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Drives one conversation from canonical history plus a daemon-owned active run.
 * Route/component cleanup only detaches this observer; the daemon keeps the
 * provider alive until completion or an explicit Stop.
 */
export function useConversation(chatId: string): Conversation {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();

  const observerRef = useRef<{
    controller: AbortController;
    runId: string | null;
  } | null>(null);
  const runIdRef = useRef<string | null>(null);
  const liveTurnRef = useRef<LiveTurn>(EMPTY_TURN);
  const liveErrorRef = useRef<string | null>(null);
  const elicitationRef = useRef<DaemonElicitation | null>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const updateAssistant = useCallback((patch: Partial<LiveTurn>) => {
    liveTurnRef.current = { ...liveTurnRef.current, ...patch };
    forceRender();
  }, []);

  const history = useQuery({
    queryKey: queryKeys.chats.load(chatId),
    queryFn: async () => daemon.chats.load(chatId),
    enabled: chatId.length > 0,
    retry: false,
  });

  const applySnapshot = useCallback((snapshot: ChatActiveRunSnapshot) => {
    liveTurnRef.current = {
      assistantId: snapshot.assistantMessage.id,
      assistantPlans: partsToPlans(snapshot.assistantMessage.content),
      assistantReasoning: partsToText(
        snapshot.assistantMessage.content,
        "reasoning",
      ),
      assistantText: partsToText(snapshot.assistantMessage.content, "text"),
      assistantToolCalls: partsToToolCalls(snapshot.assistantMessage.content),
      userId: snapshot.userMessage.id,
      userText: partsToText(snapshot.userMessage.content, "text"),
    };
    runIdRef.current = snapshot.runId;
    liveErrorRef.current = null;
    elicitationRef.current = snapshot.pendingElicitation;
    forceRender();
  }, []);

  const applyEvent = useCallback(
    (message: Extract<ChatRunObserverEvent, { type: "event" }>): boolean => {
      const event = message.event;
      if (event.type === "delta") {
        const turn = liveTurnRef.current;
        updateAssistant(
          event.part === "reasoning"
            ? {
                assistantReasoning: turn.assistantReasoning + event.text,
              }
            : { assistantText: turn.assistantText + event.text },
        );
      } else if (event.type === "tool" || event.type === "toolDelta") {
        const turn = liveTurnRef.current;
        updateAssistant({
          assistantToolCalls: upsertToolCall(
            turn.assistantToolCalls,
            toolCallFromAction(event.action),
          ),
        });
      } else if (event.type === "plan") {
        const turn = liveTurnRef.current;
        updateAssistant({
          assistantPlans: upsertPlan(turn.assistantPlans, event.plan),
        });
      } else if (event.type === "elicitation") {
        elicitationRef.current = event.elicitation;
        forceRender();
      } else if (event.type === "result") {
        const turn = liveTurnRef.current;
        const content = event.result.content;
        const resultPlans = partsToPlans(content);
        const resultToolCalls = partsToToolCalls(content);
        updateAssistant({
          assistantPlans:
            resultPlans.length > 0 ? resultPlans : turn.assistantPlans,
          assistantReasoning:
            partsToText(content, "reasoning") ||
            event.result.reasoning ||
            turn.assistantReasoning,
          assistantText:
            partsToText(content, "text") ||
            event.result.text ||
            turn.assistantText,
          assistantToolCalls:
            resultToolCalls.length > 0
              ? resultToolCalls
              : turn.assistantToolCalls,
        });
        if (event.result.config) {
          queryClient.setQueryData<ChatLoadResult>(
            queryKeys.chats.load(chatId),
            (current) =>
              current ? { ...current, config: event.result.config } : current,
          );
        }
      } else if (event.type === "error") {
        liveErrorRef.current = event.message || "The assistant turn failed.";
        forceRender();
      }
      return event.type === "done";
    },
    [chatId, queryClient, updateAssistant],
  );

  const reconcileHistory = useCallback(
    async (controller: AbortController) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chats.load(chatId),
      });
      if (observerRef.current?.controller !== controller) return;
      if (liveErrorRef.current === null) liveTurnRef.current = EMPTY_TURN;
      forceRender();
    },
    [chatId, queryClient],
  );

  const followRun = useCallback(
    async (
      initialRunId: string,
      initialEvents: AsyncIterable<ChatRunObserverEvent>,
      controller: AbortController,
      knownActive: boolean,
    ) => {
      let runId = initialRunId;
      let events = initialEvents;
      let hasSnapshot = knownActive;
      for (;;) {
        let streamError: unknown;
        try {
          for await (const message of events) {
            if (controller.signal.aborted) return;
            if (message.type === "snapshot") {
              hasSnapshot = true;
              applySnapshot(message.snapshot);
            } else if (applyEvent(message)) {
              await reconcileHistory(controller);
              return;
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          if (isInvalidRunResponse(error)) throw error;
          streamError = error;
        }

        if (controller.signal.aborted) return;
        for (;;) {
          try {
            const active = await daemon.chatRuns.getActive(
              chatId,
              controller.signal,
            );
            if (active.run === null) {
              if (!hasSnapshot && streamError !== undefined) throw streamError;
              await reconcileHistory(controller);
              return;
            }
            runId = active.run.runId;
            hasSnapshot = true;
            observerRef.current = { controller, runId };
            applySnapshot(active.run);
            events = daemon.chatRuns.observe(runId, controller.signal);
            break;
          } catch (error) {
            if (controller.signal.aborted) return;
            if (error === streamError) throw error;
            if (isInvalidRunResponse(error)) throw error;
            await reconnectDelay(controller.signal);
          }
        }
      }
    },
    [applyEvent, applySnapshot, chatId, daemon, reconcileHistory],
  );

  const observeRun = useCallback(
    (
      runId: string,
      events: AsyncIterable<ChatRunObserverEvent>,
      controller: AbortController,
      knownActive: boolean,
    ) => {
      void followRun(runId, events, controller, knownActive)
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          liveErrorRef.current = errorMessage(error);
        })
        .finally(() => {
          if (observerRef.current?.controller !== controller) return;
          observerRef.current = null;
          runIdRef.current = null;
          elicitationRef.current = null;
          forceRender();
        });
    },
    [followRun],
  );

  const modeMutation = useMutation({
    mutationFn: async (input: {
      chatId: string;
      family: "agent" | "permission";
      mode: string;
    }) => {
      // Bind the target chat in the mutation variables so a late success after
      // a chat switch cannot write config into the newly selected transcript.
      if (input.family === "agent") {
        return daemon.chats.setMode({
          chatId: input.chatId,
          mode: input.mode,
        });
      }
      return daemon.chats.setPermissionMode({
        chatId: input.chatId,
        mode: input.mode,
      });
    },
    onSuccess: (result, input) => {
      queryClient.setQueryData<ChatLoadResult>(
        queryKeys.chats.load(input.chatId),
        (current) =>
          current
            ? { ...current, chat: result.chat, config: result.config }
            : current,
      );
    },
  });

  const setMode = useCallback(
    async (mode: string) => {
      await modeMutation.mutateAsync({ chatId, family: "agent", mode });
    },
    [chatId, modeMutation],
  );

  const setPermissionMode = useCallback(
    async (mode: string) => {
      await modeMutation.mutateAsync({ chatId, family: "permission", mode });
    },
    [chatId, modeMutation],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (text.length === 0 || observerRef.current !== null) return;
      clearNewChatPrompt(chatId);
      const runId = newStreamId();
      const controller = new AbortController();
      const config = queryClient.getQueryData<ChatLoadResult>(
        queryKeys.chats.load(chatId),
      )?.config;
      const input: ChatRunStartInput = {
        chatId,
        text,
        ...(config?.currentMode ? { mode: config.currentMode } : {}),
        ...(config?.currentPermissionMode
          ? { permissionMode: config.currentPermissionMode }
          : {}),
      };
      observerRef.current = { controller, runId };
      runIdRef.current = runId;
      liveTurnRef.current = {
        userId: `local-user-${runId}`,
        assistantId: `local-assistant-${runId}`,
        userText: text,
        assistantText: "",
        assistantReasoning: "",
        assistantToolCalls: [],
        assistantPlans: [],
      };
      liveErrorRef.current = null;
      elicitationRef.current = null;
      forceRender();
      observeRun(
        runId,
        daemon.chatRuns.start(input, runId, controller.signal),
        controller,
        false,
      );
    },
    [chatId, daemon, observeRun, queryClient],
  );

  const initialPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Bootstrap from the daemon registry before accepting a new turn. The
  // observer stream starts with another atomic snapshot, so an event cannot
  // fall between this lookup and attachment.
  useEffect(() => {
    if (chatId.length === 0) return;
    if (history.isPending || history.isError) return;
    if (observerRef.current !== null) return;

    const controller = new AbortController();
    observerRef.current = { controller, runId: null };
    forceRender();
    void daemon.chatRuns
      .getActive(chatId, controller.signal)
      .then((active) => {
        if (controller.signal.aborted) return;
        if (active.run !== null) {
          observerRef.current = {
            controller,
            runId: active.run.runId,
          };
          applySnapshot(active.run);
          observeRun(
            active.run.runId,
            daemon.chatRuns.observe(active.run.runId, controller.signal),
            controller,
            true,
          );
          return;
        }

        if (observerRef.current?.controller === controller) {
          observerRef.current = null;
          forceRender();
        }
        const prompt = readNewChatPrompt(chatId);
        if (prompt === undefined) return;
        // Defer the first send so React StrictMode's discarded mount can detach
        // before the daemon run is created.
        initialPromptTimeoutRef.current = setTimeout(() => {
          initialPromptTimeoutRef.current = null;
          if (
            controller.signal.aborted ||
            observerRef.current !== null ||
            liveTurnRef.current.userId.length > 0
          ) {
            return;
          }
          send(prompt);
        }, 0);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (observerRef.current?.controller === controller) {
          observerRef.current = null;
          if (liveTurnRef.current.userId.length > 0) {
            liveErrorRef.current = errorMessage(error);
          }
          forceRender();
        }
      });

    // Detach only. The provider abort controller belongs to the daemon.
    return () => {
      observerRef.current?.controller.abort();
      observerRef.current = null;
      runIdRef.current = null;
      liveTurnRef.current = EMPTY_TURN;
      liveErrorRef.current = null;
      elicitationRef.current = null;
      if (initialPromptTimeoutRef.current !== null) {
        clearTimeout(initialPromptTimeoutRef.current);
        initialPromptTimeoutRef.current = null;
      }
    };
  }, [
    applySnapshot,
    chatId,
    daemon,
    history.isError,
    history.isPending,
    observeRun,
    send,
  ]);

  const stop = useCallback(() => {
    const runId = runIdRef.current;
    if (runId !== null) void daemon.chatRuns.stop(runId).catch(() => {});
  }, [daemon]);

  const respondElicitation = useCallback(
    (response: ChatElicitationResponse) => {
      const runId = runIdRef.current;
      const elicitation = elicitationRef.current;
      if (runId === null || elicitation === null) return;
      const leavePlan =
        (response.type === "allow" || response.type === "allowForSession") &&
        isExitPlanModeElicitation(elicitation);
      // Snapshot for rollback if resolve fails after an optimistic leave-plan.
      const previousLoad = queryClient.getQueryData<ChatLoadResult>(
        queryKeys.chats.load(chatId),
      );
      const previousConfig = previousLoad?.config;
      elicitationRef.current = null;
      forceRender();
      // Optimistic UI: patch permission mode in the load cache *synchronously*
      // before resolving the elicitation. `setPermissionMode` is queued behind
      // the in-flight sendText on the provider, so waiting for onSuccess would
      // leave the composer chip on Plan while the next Bash/Write elicits.
      if (leavePlan && previousLoad?.config) {
        const buildMode = buildPermissionModeValue(previousLoad.config);
        if (buildMode) {
          queryClient.setQueryData<ChatLoadResult>(
            queryKeys.chats.load(chatId),
            {
              ...previousLoad,
              config: {
                ...previousLoad.config,
                currentPermissionMode: buildMode,
              },
            },
          );
          forceRender();
        }
      }
      void daemon.chatRuns
        .resolveElicitation(runId, {
          elicitationId: elicitation.id,
          response,
        })
        .catch(() => {
          // Network/daemon failure: roll back optimistic Build and re-open the
          // elicitation so the user can retry (provider is still Plan).
          if (
            leavePlan &&
            runIdRef.current === runId &&
            previousConfig !== undefined
          ) {
            queryClient.setQueryData<ChatLoadResult>(
              queryKeys.chats.load(chatId),
              (current) =>
                current ? { ...current, config: previousConfig } : current,
            );
          }
          if (runIdRef.current === runId) {
            elicitationRef.current = elicitation;
          }
          forceRender();
        });
    },
    [chatId, daemon, queryClient],
  );

  const persisted = history.data ? toConversation(history.data.messages) : [];
  const hasStashedPrompt = readNewChatPrompt(chatId) !== undefined;
  const liveError =
    liveErrorRef.current ??
    (history.isError && liveTurnRef.current.userId.length > 0
      ? (history.error?.message ?? "The turn failed.")
      : null);
  const live = buildLiveMessages(
    liveTurnRef.current,
    runIdRef.current !== null,
    liveError,
  );
  // Re-collapse plan presentations across the full transcript so a live plan
  // supersedes older persisted plans of the same kind (desktop parity).
  const messages = normalizeConversationPlans([...persisted, ...live]);

  return {
    messages,
    isPending:
      history.isPending ||
      (observerRef.current !== null && runIdRef.current === null) ||
      (hasStashedPrompt && liveTurnRef.current.userId.length === 0),
    isError: history.isError,
    refetch: () => void history.refetch(),
    isStreaming: runIdRef.current !== null,
    send,
    stop,
    pendingElicitation: elicitationRef.current,
    respondElicitation,
    runtimeConfig: history.data?.config ?? null,
    isModePending: modeMutation.isPending,
    setMode,
    setPermissionMode,
  };
}

function buildLiveMessages(
  turn: LiveTurn,
  isStreaming: boolean,
  error: string | null,
): ConversationMessage[] {
  if (turn.userId.length === 0) return [];
  const messages: ConversationMessage[] = [
    {
      id: turn.userId,
      role: "user",
      text: turn.userText,
      reasoning: "",
      status: "complete",
      toolCalls: [],
      plans: [],
    },
  ];
  // Always show the assistant row while a turn is live (even before the first
  // token, so the "Thinking…" indicator appears), on error, while tool calls /
  // plans are streaming, and while a completed initial turn is waiting for
  // canonical history hydration.
  if (
    isStreaming ||
    error !== null ||
    turn.assistantText.length > 0 ||
    turn.assistantReasoning.length > 0 ||
    turn.assistantToolCalls.length > 0 ||
    turn.assistantPlans.length > 0
  ) {
    messages.push({
      id: turn.assistantId,
      role: "assistant",
      text: turn.assistantText,
      reasoning: turn.assistantReasoning,
      status: error !== null ? "error" : isStreaming ? "streaming" : "complete",
      error: error ?? undefined,
      toolCalls: turn.assistantToolCalls,
      plans: turn.assistantPlans,
    });
  }
  return messages;
}

/** ExitPlanMode permissions use the tool name in title/body from claude-client. */
function isExitPlanModeElicitation(elicitation: {
  title?: string | null;
  body?: string | null;
}): boolean {
  const haystack = `${elicitation.title ?? ""} ${elicitation.body ?? ""}`;
  return /ExitPlanMode/i.test(haystack);
}

function buildPermissionModeValue(
  config: DaemonRuntimeConfig | null,
): string | null {
  const target = findPlanModeToggleTarget([
    {
      canSet: config?.canSetMode === true,
      family: "agent",
      options: config?.modes ?? [],
      value: config?.currentMode ?? "",
    },
    {
      canSet: config?.canSetPermissionMode === true,
      family: "permission",
      options: config?.permissionModes ?? [],
      value: config?.currentPermissionMode ?? "",
    },
  ]);
  return target?.buildMode.value ?? "default";
}

function isInvalidRunResponse(error: unknown): boolean {
  return (
    error instanceof DaemonRequestError &&
    error.message.includes("invalid chat run response")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "The assistant turn failed.";
}

function reconnectDelay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, 250);
    signal.addEventListener("abort", finish, { once: true });
  });
}
