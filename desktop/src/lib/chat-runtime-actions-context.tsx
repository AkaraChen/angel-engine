import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useChatRunStore } from "@/lib/chat-run-store";
import type { ChatElicitationResponse } from "@/shared/chat";

type ChatRuntimeActionsContextValue = {
  resolveElicitation: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => void;
  setMode: (mode: string) => Promise<void>;
};

type ChatRuntimeActionsProviderProps = {
  children: ReactNode;
  slotKey: string;
};

const ChatRuntimeActionsContext =
  createContext<ChatRuntimeActionsContextValue | null>(null);

export function ChatRuntimeActionsProvider({
  children,
  slotKey,
}: ChatRuntimeActionsProviderProps) {
  const resolveElicitationForSlot = useChatRunStore(
    (state) => state.resolveElicitation,
  );
  const setModeForSlot = useChatRunStore((state) => state.setMode);
  const value = useMemo<ChatRuntimeActionsContextValue>(
    () => ({
      resolveElicitation(elicitationId, response) {
        resolveElicitationForSlot(slotKey, response, elicitationId);
      },
      async setMode(mode) {
        await setModeForSlot(slotKey, mode);
      },
    }),
    [resolveElicitationForSlot, setModeForSlot, slotKey],
  );

  return (
    <ChatRuntimeActionsContext.Provider value={value}>
      {children}
    </ChatRuntimeActionsContext.Provider>
  );
}

export function useChatRuntimeActions(): ChatRuntimeActionsContextValue {
  const value = useContext(ChatRuntimeActionsContext);
  if (!value) {
    throw new Error(
      "useChatRuntimeActions must be used inside ChatRuntimeActionsProvider.",
    );
  }
  return value;
}
