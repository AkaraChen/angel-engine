import { createContext, useContext, type ReactNode } from "react";

import { useChatRunStore } from "@/lib/chat-run-store";
import type { ChatElicitationResponse } from "@/shared/chat";

type ChatRuntimeActionsContextValue = {
  resolveElicitation: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => void;
  setMode: (mode: string) => Promise<void>;
};

const ChatRuntimeActionsContext =
  createContext<ChatRuntimeActionsContextValue | null>(null);

export function ChatRuntimeActionsProvider({
  children,
  slotKey,
}: {
  children: ReactNode;
  slotKey: string;
}) {
  const resolveElicitationForSlot = useChatRunStore(
    (state) => state.resolveElicitation,
  );
  const setModeForSlot = useChatRunStore((state) => state.setMode);

  return (
    <ChatRuntimeActionsContext.Provider
      value={{
        resolveElicitation(elicitationId, response) {
          resolveElicitationForSlot(slotKey, response, elicitationId);
        },
        async setMode(mode) {
          await setModeForSlot(slotKey, mode);
        },
      }}
    >
      {children}
    </ChatRuntimeActionsContext.Provider>
  );
}

export function useChatRuntimeActions() {
  const value = useContext(ChatRuntimeActionsContext);
  if (!value) {
    throw new Error(
      "useChatRuntimeActions must be used inside ChatRuntimeActionsProvider.",
    );
  }
  return value;
}
