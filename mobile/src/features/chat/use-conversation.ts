import type {
  ChatElicitationResponse,
  ChatLoadResult,
  ConversationMessage,
  ConversationToolCall,
  DaemonElicitation,
  DaemonMessagePart,
  DaemonPlanData,
  DaemonRuntimeConfig,
} from "@/platform/chat-types";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

import { toConversation, toolCallFromAction } from "./message-view";
import { clearNewChatPrompt, readNewChatPrompt } from "./new-chat-prompt";
import {
  chatPlanPartName,
  cloneChatPlanData,
  isChatPlanData,
  normalizeConversationPlans,
  upsertPlan,
} from "./plan-utils";

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
  assistantToolCalls: ConversationToolCall[];
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
  calls: ConversationToolCall[],
  call: ConversationToolCall,
): ConversationToolCall[] {
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
 * Drives a single conversation: history query + an optimistic, streamed turn.
 *
 * The live turn (the just-sent user message and the assistant reply as it
 * arrives) lives in a ref rather than the query cache so partial tokens never
 * leak into the cached transcript. When the turn finishes we append it to the
 * cache and reconcile with the daemon's canonical copy. All live state is keyed
 * to `chatId` and reset on switch so chat A's stream never bleeds into chat B.
 */
export function useConversation(chatId: string): Conversation {
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();

  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const liveTurnRef = useRef<LiveTurn>(EMPTY_TURN);
  const elicitationRef = useRef<DaemonElicitation | null>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const updateAssistant = useCallback((patch: Partial<LiveTurn>) => {
    liveTurnRef.current = { ...liveTurnRef.current, ...patch };
    forceRender();
  }, []);

  const streamTurn = useCallback(
    async (text: string, externalSignal?: AbortSignal) => {
      const controller = new AbortController();
      const streamId = newStreamId();
      const abortFromExternal = () => controller.abort(externalSignal?.reason);
      externalSignal?.addEventListener("abort", abortFromExternal, {
        once: true,
      });
      abortRef.current = controller;
      streamIdRef.current = streamId;
      const config = queryClient.getQueryData<ChatLoadResult>(
        queryKeys.chats.load(chatId),
      )?.config;
      const sendInput = {
        chatId,
        text,
        ...(config?.currentMode ? { mode: config.currentMode } : {}),
        ...(config?.currentPermissionMode
          ? { permissionMode: config.currentPermissionMode }
          : {}),
      };
      try {
        for await (const event of daemon.chatStreams.send(
          sendInput,
          streamId,
          controller.signal,
        )) {
          if (event.type === "delta") {
            const { part, text: delta } = event;
            const turn = liveTurnRef.current;
            updateAssistant(
              part === "reasoning"
                ? { assistantReasoning: turn.assistantReasoning + delta }
                : { assistantText: turn.assistantText + delta },
            );
          } else if (event.type === "tool" || event.type === "toolDelta") {
            // Tool actions stream as a full snapshot each time (a `tool` when a
            // call is proposed/started, `toolDelta` as its output/phase update);
            // upsert by id so the inline card reflects the latest state.
            const call = toolCallFromAction(event.action);
            if (call !== null) {
              const turn = liveTurnRef.current;
              updateAssistant({
                assistantToolCalls: upsertToolCall(
                  turn.assistantToolCalls,
                  call,
                ),
              });
            }
          } else if (event.type === "plan") {
            if (!isChatPlanData(event.plan)) {
              throw new Error(
                "Daemon sent a plan event with invalid plan data.",
              );
            }
            const turn = liveTurnRef.current;
            updateAssistant({
              assistantPlans: upsertPlan(turn.assistantPlans, event.plan),
            });
          } else if (event.type === "elicitation") {
            elicitationRef.current = event.elicitation;
            forceRender();
          } else if (event.type === "result") {
            // The daemon always sends `result.text` (empty string when there is
            // no prose). Keep any text we already streamed so a final empty
            // result does not wipe the live bubble.
            const turn = liveTurnRef.current;
            const resultContent: DaemonMessagePart[] =
              event.result.content ?? [];
            const resultPlans = resultContent
              .filter(
                (part): part is DaemonMessagePart & { data: DaemonPlanData } =>
                  part.type === "data" &&
                  (part.name === "plan" || part.name === "todo") &&
                  isChatPlanData(part.data),
              )
              .map((part) => cloneChatPlanData(part.data));
            let nextPlans = turn.assistantPlans;
            for (const plan of resultPlans) {
              nextPlans = upsertPlan(nextPlans, plan);
            }
            updateAssistant({
              assistantText: event.result.text || turn.assistantText,
              assistantPlans: nextPlans,
            });
          } else if (event.type === "error") {
            throw new Error(event.message || "The assistant turn failed.");
          } else if (event.type === "done") {
            break;
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        // A user Stop is an expected partial completion and continues to
        // canonical history hydration.
        if (externalSignal?.aborted) throw error;
      } finally {
        externalSignal?.removeEventListener("abort", abortFromExternal);
        abortRef.current = null;
        streamIdRef.current = null;
        elicitationRef.current = null;
        forceRender();
      }
    },
    [chatId, daemon, queryClient, updateAssistant],
  );

  const history = useQuery({
    queryKey: queryKeys.chats.load(chatId),
    queryFn: async () => daemon.chats.load(chatId),
    enabled: chatId.length > 0,
    retry: false,
  });

  const mutation = useMutation<void, Error, string>({
    mutationFn: async (text) => streamTurn(text),
    onSuccess: async (_data, text) => {
      const turn = liveTurnRef.current;
      // Skip if the turn was disposed (chat switch/unmount cleared the ref).
      if (turn.userId.length === 0) return;
      const content: DaemonMessagePart[] = [];
      if (turn.assistantReasoning.length > 0)
        content.push({ type: "reasoning", text: turn.assistantReasoning });
      // Keep the streamed tool cards visible between the optimistic append and
      // the background refetch that replaces this turn with the daemon's copy.
      for (const call of turn.assistantToolCalls)
        content.push(toolCallToPart(call));
      for (const plan of turn.assistantPlans) {
        content.push({
          type: "data",
          name: chatPlanPartName(plan),
          data: cloneChatPlanData(plan),
        });
      }
      content.push({ type: "text", text: turn.assistantText });
      const appendTurn = (result: ChatLoadResult): ChatLoadResult => ({
        ...result,
        messages: [
          ...result.messages,
          { id: turn.userId, role: "user", content: [{ type: "text", text }] },
          { id: turn.assistantId, role: "assistant", content },
        ],
      });

      const cached = queryClient.getQueryData<ChatLoadResult>(
        queryKeys.chats.load(chatId),
      );
      if (cached) {
        // Append the finished turn so it stays put, then invalidate in the
        // background so the daemon's canonical copy replaces it.
        queryClient.setQueryData(
          queryKeys.chats.load(chatId),
          appendTurn(cached),
        );
        liveTurnRef.current = EMPTY_TURN;
        forceRender();
        void queryClient.invalidateQueries({
          queryKey: queryKeys.chats.load(chatId),
        });
      } else {
        // No history cached yet: wait for the refetch (which now includes the
        // persisted turn) before dropping the optimistic one, to avoid a gap.
        await queryClient.invalidateQueries({
          queryKey: queryKeys.chats.load(chatId),
        });
        liveTurnRef.current = EMPTY_TURN;
        forceRender();
      }
    },
  });

  const { mutate, reset } = mutation;

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
      if (text.length === 0 || abortRef.current !== null) return;
      // Consume any stashed initial prompt so it is never auto-sent again.
      clearNewChatPrompt(chatId);
      const stamp = newStreamId();
      liveTurnRef.current = {
        userId: `local-user-${stamp}`,
        assistantId: `local-assistant-${stamp}`,
        userText: text,
        assistantText: "",
        assistantReasoning: "",
        assistantToolCalls: [],
        assistantPlans: [],
      };
      forceRender();
      mutate(text);
    },
    [chatId, mutate],
  );

  // Auto-send a stashed new-chat prompt once the empty chat has loaded.
  // The send is deferred by a macrotask so React StrictMode's mount/cleanup/
  // remount cycle does not start (and abort) a stream on the first, discarded
  // render; only the final mount actually fires the request.
  const initialPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    if (chatId.length === 0) return;
    if (history.isPending || history.isError) return;
    if (abortRef.current !== null || liveTurnRef.current.userId.length > 0)
      return;
    const prompt = readNewChatPrompt(chatId);
    if (prompt === undefined) return;

    initialPromptTimeoutRef.current = setTimeout(() => {
      initialPromptTimeoutRef.current = null;
      if (abortRef.current !== null || liveTurnRef.current.userId.length > 0)
        return;
      clearNewChatPrompt(chatId);
      send(prompt);
    }, 0);

    return () => {
      if (initialPromptTimeoutRef.current !== null) {
        clearTimeout(initialPromptTimeoutRef.current);
        initialPromptTimeoutRef.current = null;
      }
    };
  }, [chatId, history.isPending, history.isError, send]);

  const stop = useCallback(() => {
    const streamId = streamIdRef.current;
    abortRef.current?.abort();
    elicitationRef.current = null;
    forceRender();
    if (streamId !== null)
      void daemon.chatStreams.abort(streamId).catch(() => {});
  }, [daemon]);

  const respondElicitation = useCallback(
    (response: ChatElicitationResponse) => {
      const streamId = streamIdRef.current;
      const elicitation = elicitationRef.current;
      if (streamId === null || elicitation === null) return;
      elicitationRef.current = null;
      forceRender();
      void daemon.chatStreams
        .resolveElicitation(streamId, {
          elicitationId: elicitation.id,
          response,
        })
        .catch(() => {});
    },
    [daemon],
  );

  // Reset all live/optimistic state when the chat changes (or on unmount): abort
  // the in-flight stream, drop the local turn, and clear mutation status so the
  // new chat starts clean.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const streamId = streamIdRef.current;
      if (streamId !== null)
        void daemon.chatStreams.abort(streamId).catch(() => {});
      abortRef.current = null;
      streamIdRef.current = null;
      liveTurnRef.current = EMPTY_TURN;
      elicitationRef.current = null;
      reset();
    };
  }, [chatId, daemon, reset]);

  const persisted = history.data ? toConversation(history.data.messages) : [];
  const hasStashedPrompt = readNewChatPrompt(chatId) !== undefined;
  const liveError = mutation.isError
    ? (mutation.error?.message ?? "The turn failed.")
    : history.isError && liveTurnRef.current.userId.length > 0
      ? (history.error?.message ?? "The turn failed.")
      : null;
  const live = buildLiveMessages(
    liveTurnRef.current,
    mutation.isPending || abortRef.current !== null,
    liveError,
  );
  // Re-collapse plan presentations across the full transcript so a live plan
  // supersedes older persisted plans of the same kind (desktop parity).
  const messages = normalizeConversationPlans([...persisted, ...live]);

  return {
    messages,
    isPending:
      history.isPending ||
      (hasStashedPrompt && liveTurnRef.current.userId.length === 0),
    isError: history.isError,
    refetch: () => void history.refetch(),
    isStreaming: mutation.isPending || abortRef.current !== null,
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

/**
 * Reproject a rendered tool call back into a `tool-call` history part so an
 * optimistically-appended turn keeps its cards until the daemon's canonical copy
 * arrives. Lossy but transient — `toolCallFromPart` reads it back the same way.
 */
function toolCallToPart(call: ConversationToolCall): DaemonMessagePart {
  return {
    type: "tool-call",
    toolCallId: call.id,
    toolName: call.name,
    argsText: call.argsText,
    isError: call.isError,
    artifact: {
      id: call.id,
      phase: call.phase,
      // `name` reprojects via `toolName`; keep the human summary as the title so
      // the round-trip preserves both the identifier and its secondary label.
      title: call.summary,
      outputText: call.outputText,
      error: call.errorText.length > 0 ? { message: call.errorText } : null,
    },
  };
}
