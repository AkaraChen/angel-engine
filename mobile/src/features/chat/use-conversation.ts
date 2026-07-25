import type {
  ChatActiveRunSnapshot,
  ChatElicitationResponse,
  ChatLoadResult,
  ChatRunObserverEvent,
  ChatRunStartInput,
  ConversationMessage,
  DaemonElicitation,
  DaemonMessagePart,
  DaemonPlanData,
  DaemonRuntimeConfig,
  ProjectedConversationToolCall,
} from "@/platform/chat-types";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";

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
import {
  cloneChatPlanData,
  isChatPlanPart,
  normalizeConversationPlans,
  upsertPlan,
} from "./plan-utils";

export interface Conversation {
  messages: ConversationMessage[];
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  isStreaming: boolean;
  send: (text: string) => void;
  stop: () => void;
  pendingElicitation: DaemonElicitation | null;
  respondElicitation: (response: ChatElicitationResponse) => void;
  runtimeConfig: DaemonRuntimeConfig | null;
  isModePending: boolean;
  setMode: (mode: string) => Promise<void>;
  setPermissionMode: (mode: string) => Promise<void>;
}

interface LiveTurn {
  userId: string;
  assistantId: string;
  userText: string;
  assistantText: string;
  assistantReasoning: string;
  assistantToolCalls: ProjectedConversationToolCall[];
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

function newRunId(): string {
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
 * A conversation is now an observer of a daemon-owned run. Unmounting, changing
 * chats, or losing the network aborts only this observer request. The daemon
 * keeps executing until the explicit Stop route is called.
 */
export function useConversation(chatId: string): Conversation {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();

  const observerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const liveChatIdRef = useRef("");
  const liveTurnRef = useRef<LiveTurn>(EMPTY_TURN);
  const elicitationRef = useRef<DaemonElicitation | null>(null);
  const streamErrorRef = useRef<string | null>(null);
  const stopRequestedRef = useRef(false);
  const isStreamingRef = useRef(false);
  const isBootstrappingRef = useRef(true);
  const [, forceRender] = useReducer((value: number) => value + 1, 0);

  const isCurrent = useCallback(
    (controller: AbortController) =>
      !controller.signal.aborted && observerRef.current === controller,
    [],
  );

  const updateAssistant = useCallback((patch: Partial<LiveTurn>) => {
    liveTurnRef.current = { ...liveTurnRef.current, ...patch };
    forceRender();
  }, []);

  const applySnapshot = useCallback(
    (snapshot: ChatActiveRunSnapshot, controller: AbortController) => {
      if (!isCurrent(controller)) return;
      runIdRef.current = snapshot.runId;
      liveChatIdRef.current = snapshot.chatId;
      liveTurnRef.current = liveTurnFromSnapshot(snapshot);
      elicitationRef.current = snapshot.pendingElicitation;
      streamErrorRef.current = null;
      stopRequestedRef.current = false;
      isStreamingRef.current = true;
      isBootstrappingRef.current = false;
      forceRender();
    },
    [isCurrent],
  );

  const applyEvent = useCallback(
    (
      message: Extract<ChatRunObserverEvent, { type: "event" }>,
      controller: AbortController,
    ): boolean => {
      if (!isCurrent(controller)) return false;
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
        elicitationRef.current =
          event.elicitation.phase === "open" ? event.elicitation : null;
        forceRender();
      } else if (event.type === "result") {
        const turn = liveTurnRef.current;
        const resultContent: DaemonMessagePart[] = event.result.content;
        const resultPlans = resultContent
          .filter(isChatPlanPart)
          .map((part) => cloneChatPlanData(part.data));
        let nextPlans = turn.assistantPlans;
        for (const plan of resultPlans) {
          nextPlans = upsertPlan(nextPlans, plan);
        }
        updateAssistant({
          assistantPlans: nextPlans,
          assistantReasoning:
            partsToText(resultContent, "reasoning") || turn.assistantReasoning,
          assistantText: event.result.text || turn.assistantText,
          assistantToolCalls: partsToToolCalls(resultContent),
        });
        if (event.result.config) {
          queryClient.setQueryData<ChatLoadResult>(
            queryKeys.chats.load(chatId),
            (current) =>
              current ? { ...current, config: event.result.config } : current,
          );
        }
      } else if (event.type === "error") {
        if (!stopRequestedRef.current) {
          streamErrorRef.current =
            event.message || "The assistant turn failed.";
        }
        forceRender();
      }
      return event.type === "done";
    },
    [chatId, isCurrent, queryClient, updateAssistant],
  );

  const reconcileCanonicalHistory = useCallback(
    async (controller: AbortController) => {
      if (!isCurrent(controller)) return;
      const retainError =
        streamErrorRef.current !== null && !stopRequestedRef.current;
      runIdRef.current = null;
      elicitationRef.current = null;
      isStreamingRef.current = false;
      isBootstrappingRef.current = false;
      forceRender();

      await queryClient.invalidateQueries({
        queryKey: queryKeys.chats.load(chatId),
      });
      if (!isCurrent(controller)) return;
      if (!retainError) {
        liveTurnRef.current = EMPTY_TURN;
        liveChatIdRef.current = "";
        streamErrorRef.current = null;
      }
      stopRequestedRef.current = false;
      observerRef.current = null;
      forceRender();
    },
    [chatId, isCurrent, queryClient],
  );

  const consumeRun = useCallback(
    async (
      controller: AbortController,
      firstStream: () => AsyncIterable<ChatRunObserverEvent>,
    ) => {
      let openStream = firstStream;
      let sawSnapshot = false;
      let lastFailure: unknown;

      while (isCurrent(controller)) {
        let terminal = false;
        try {
          for await (const message of openStream()) {
            if (!isCurrent(controller)) return;
            if (message.type === "snapshot") {
              sawSnapshot = true;
              applySnapshot(message.snapshot, controller);
            } else if (applyEvent(message, controller)) {
              terminal = true;
            }
          }
          if (terminal) {
            await reconcileCanonicalHistory(controller);
            return;
          }
        } catch (error) {
          if (!isCurrent(controller)) return;
          lastFailure = error;
        }

        let active: Awaited<ReturnType<typeof daemon.chatRuns.active>>;
        try {
          active = await daemon.chatRuns.active(chatId);
        } catch {
          await retryDelay(controller.signal);
          continue;
        }
        if (!isCurrent(controller)) return;
        if (active.run === null) {
          if (!sawSnapshot && !stopRequestedRef.current) {
            streamErrorRef.current = errorMessage(lastFailure);
          }
          await reconcileCanonicalHistory(controller);
          return;
        }

        sawSnapshot = true;
        const activeRun = active.run;
        applySnapshot(activeRun, controller);
        openStream = () =>
          daemon.chatRuns.observe(activeRun.runId, controller.signal);
        await retryDelay(controller.signal);
      }
    },
    [
      applyEvent,
      applySnapshot,
      chatId,
      daemon,
      isCurrent,
      reconcileCanonicalHistory,
    ],
  );

  const history = useQuery({
    queryKey: queryKeys.chats.load(chatId),
    queryFn: async () => daemon.chats.load(chatId),
    enabled: chatId.length > 0,
    retry: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    observerRef.current = controller;
    runIdRef.current = null;
    liveChatIdRef.current = "";
    liveTurnRef.current = EMPTY_TURN;
    elicitationRef.current = null;
    streamErrorRef.current = null;
    stopRequestedRef.current = false;
    isStreamingRef.current = false;
    isBootstrappingRef.current = true;

    void (async () => {
      while (isCurrent(controller)) {
        try {
          const active = await daemon.chatRuns.active(chatId);
          if (!isCurrent(controller)) return;
          if (active.run === null) {
            isBootstrappingRef.current = false;
            observerRef.current = null;
            forceRender();
            return;
          }
          const activeRun = active.run;
          applySnapshot(activeRun, controller);
          await consumeRun(controller, () =>
            daemon.chatRuns.observe(activeRun.runId, controller.signal),
          );
          return;
        } catch {
          await retryDelay(controller.signal);
        }
      }
    })();

    return () => {
      // Observer detach only. Explicit Stop is the sole DELETE path.
      controller.abort();
      if (observerRef.current === controller) {
        observerRef.current = null;
        runIdRef.current = null;
        liveChatIdRef.current = "";
        liveTurnRef.current = EMPTY_TURN;
        elicitationRef.current = null;
        streamErrorRef.current = null;
        stopRequestedRef.current = false;
        isStreamingRef.current = false;
        isBootstrappingRef.current = true;
      }
    };
  }, [applySnapshot, chatId, consumeRun, daemon, isCurrent]);

  const modeMutation = useMutation({
    mutationFn: async (input: {
      chatId: string;
      family: "agent" | "permission";
      mode: string;
    }) => {
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
      if (
        text.length === 0 ||
        observerRef.current !== null ||
        isBootstrappingRef.current
      ) {
        return;
      }
      clearNewChatPrompt(chatId);
      const runId = newRunId();
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

      observerRef.current = controller;
      runIdRef.current = runId;
      liveChatIdRef.current = chatId;
      liveTurnRef.current = {
        userId: `${runId}:user`,
        assistantId: `${runId}:assistant`,
        userText: text,
        assistantText: "",
        assistantReasoning: "",
        assistantToolCalls: [],
        assistantPlans: [],
      };
      elicitationRef.current = null;
      streamErrorRef.current = null;
      stopRequestedRef.current = false;
      isStreamingRef.current = true;
      forceRender();
      void consumeRun(controller, () =>
        daemon.chatRuns.start(runId, input, controller.signal),
      );
    },
    [chatId, consumeRun, daemon, queryClient],
  );

  const initialPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isBootstrapping = isBootstrappingRef.current;
  const isStreaming = isStreamingRef.current;
  useEffect(() => {
    if (chatId.length === 0 || isBootstrapping) return;
    if (history.isPending || history.isError || isStreaming) return;
    if (liveTurnRef.current.userId.length > 0) return;
    const prompt = readNewChatPrompt(chatId);
    if (prompt === undefined) return;

    initialPromptTimeoutRef.current = setTimeout(() => {
      initialPromptTimeoutRef.current = null;
      if (
        observerRef.current !== null ||
        liveTurnRef.current.userId.length > 0
      ) {
        return;
      }
      clearNewChatPrompt(chatId);
      send(prompt);
    }, 0);

    return () => {
      if (initialPromptTimeoutRef.current !== null) {
        clearTimeout(initialPromptTimeoutRef.current);
        initialPromptTimeoutRef.current = null;
      }
    };
  }, [
    chatId,
    history.isError,
    history.isPending,
    isBootstrapping,
    isStreaming,
    send,
  ]);

  const stop = useCallback(() => {
    const runId = runIdRef.current;
    if (runId === null) return;
    stopRequestedRef.current = true;
    elicitationRef.current = null;
    forceRender();
    void daemon.chatRuns.stop(runId).catch((error: unknown) => {
      if (runIdRef.current !== runId) return;
      stopRequestedRef.current = false;
      streamErrorRef.current = errorMessage(error);
      forceRender();
    });
  }, [daemon]);

  const respondElicitation = useCallback(
    (response: ChatElicitationResponse) => {
      const runId = runIdRef.current;
      const elicitation = elicitationRef.current;
      if (runId === null || elicitation === null) return;
      const leavePlan =
        (response.type === "allow" || response.type === "allowForSession") &&
        isExitPlanModeElicitation(elicitation);
      const previousLoad = queryClient.getQueryData<ChatLoadResult>(
        queryKeys.chats.load(chatId),
      );
      const previousConfig = previousLoad?.config;
      elicitationRef.current = null;
      forceRender();
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
  const visibleTurn =
    liveChatIdRef.current === chatId ? liveTurnRef.current : EMPTY_TURN;
  const hasStashedPrompt = readNewChatPrompt(chatId) !== undefined;
  const live = buildLiveMessages(
    visibleTurn,
    isStreaming,
    liveChatIdRef.current === chatId ? streamErrorRef.current : null,
  );
  const messages = normalizeConversationPlans([
    ...persisted.filter(
      ({ id }) => id !== visibleTurn.userId && id !== visibleTurn.assistantId,
    ),
    ...live,
  ]);

  return {
    messages,
    isPending:
      history.isPending ||
      isBootstrapping ||
      (hasStashedPrompt && visibleTurn.userId.length === 0),
    isError: history.isError,
    refetch: () => void history.refetch(),
    isStreaming,
    send,
    stop,
    pendingElicitation:
      liveChatIdRef.current === chatId ? elicitationRef.current : null,
    respondElicitation,
    runtimeConfig: history.data?.config ?? null,
    isModePending: modeMutation.isPending,
    setMode,
    setPermissionMode,
  };
}

function liveTurnFromSnapshot(snapshot: ChatActiveRunSnapshot): LiveTurn {
  return {
    userId: snapshot.userMessage.id,
    assistantId: snapshot.assistantMessage.id,
    userText: partsToText(snapshot.userMessage.content, "text"),
    assistantText: partsToText(snapshot.assistantMessage.content, "text"),
    assistantReasoning: partsToText(
      snapshot.assistantMessage.content,
      "reasoning",
    ),
    assistantToolCalls: partsToToolCalls(snapshot.assistantMessage.content),
    assistantPlans: partsToPlans(snapshot.assistantMessage.content),
  };
}

function retryDelay(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, 500);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "The assistant turn failed.";
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
