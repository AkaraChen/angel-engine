import type {
  ChatLoadResult,
  ConversationMessage,
  DaemonMessagePart,
} from "@/platform/chat-types";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

import { toConversation } from "./message-view";

/**
 * Loads a chat's persisted transcript from the daemon (`POST /api/chats/:id/load`)
 * and projects it into the mobile conversation view model.
 */
export function useChatMessages(chatId: string) {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.chats.load(chatId),
    queryFn: async () => daemon.loadChat(chatId),
    select: (result) => toConversation(result.messages),
    enabled: chatId.length > 0,
  });
}

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
}

interface LiveTurn {
  userId: string;
  assistantId: string;
  userText: string;
  assistantText: string;
  assistantReasoning: string;
}

const EMPTY_TURN: LiveTurn = {
  userId: "",
  assistantId: "",
  userText: "",
  assistantText: "",
  assistantReasoning: "",
};

function newStreamId(): string {
  return crypto.randomUUID();
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
  const history = useChatMessages(chatId);

  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const liveTurnRef = useRef<LiveTurn>(EMPTY_TURN);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const updateAssistant = useCallback((patch: Partial<LiveTurn>) => {
    liveTurnRef.current = { ...liveTurnRef.current, ...patch };
    forceRender();
  }, []);

  const mutation = useMutation<void, Error, string>({
    mutationFn: async (text) => {
      const controller = new AbortController();
      const streamId = newStreamId();
      abortRef.current = controller;
      streamIdRef.current = streamId;
      try {
        for await (const event of daemon.streamChat(
          { chatId, text },
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
          } else if (event.type === "result") {
            updateAssistant({ assistantText: event.result.text });
          } else if (event.type === "error") {
            throw new Error(event.message || "The assistant turn failed.");
          } else if (event.type === "done") {
            break;
          }
        }
      } finally {
        abortRef.current = null;
        streamIdRef.current = null;
      }
    },
    onSuccess: async (_data, text) => {
      const turn = liveTurnRef.current;
      const content: DaemonMessagePart[] = [];
      if (turn.assistantReasoning.length > 0)
        content.push({ type: "reasoning", text: turn.assistantReasoning });
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

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (text.length === 0 || abortRef.current !== null) return;
      const stamp = newStreamId();
      liveTurnRef.current = {
        userId: `local-user-${stamp}`,
        assistantId: `local-assistant-${stamp}`,
        userText: text,
        assistantText: "",
        assistantReasoning: "",
      };
      forceRender();
      mutate(text);
    },
    [mutate],
  );

  const stop = useCallback(() => {
    const streamId = streamIdRef.current;
    abortRef.current?.abort();
    if (streamId !== null)
      void daemon.abortChatStream(streamId).catch(() => {});
  }, [daemon]);

  // Reset all live/optimistic state when the chat changes (or on unmount): abort
  // the in-flight stream, drop the local turn, and clear mutation status so the
  // new chat starts clean.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const streamId = streamIdRef.current;
      if (streamId !== null)
        void daemon.abortChatStream(streamId).catch(() => {});
      abortRef.current = null;
      streamIdRef.current = null;
      liveTurnRef.current = EMPTY_TURN;
      reset();
    };
  }, [chatId, daemon, reset]);

  const persisted = history.data ?? [];
  const live = buildLiveMessages(
    liveTurnRef.current,
    mutation.isPending,
    mutation.isError ? (mutation.error?.message ?? "The turn failed.") : null,
  );

  return {
    messages: [...persisted, ...live],
    isPending: history.isPending,
    isError: history.isError,
    refetch: () => void history.refetch(),
    isStreaming: mutation.isPending,
    send,
    stop,
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
    },
  ];
  // Always show the assistant row while a turn is live (even before the first
  // token, so the "Thinking…" indicator appears) and on error.
  if (isStreaming || error !== null) {
    messages.push({
      id: turn.assistantId,
      role: "assistant",
      text: turn.assistantText,
      reasoning: turn.assistantReasoning,
      status: error !== null ? "error" : "streaming",
      error: error ?? undefined,
    });
  }
  return messages;
}
