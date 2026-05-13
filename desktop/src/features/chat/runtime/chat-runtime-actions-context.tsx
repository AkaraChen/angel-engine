import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  useChatPermissionBypassEnabled,
  useChatRunStore,
} from "@/features/chat/state/chat-run-store";
import type { ChatElicitationResponse } from "@/shared/chat";

type ChatRuntimeActionsContextValue = {
  enablePermissionBypass: () => void;
  permissionBypassEnabled: boolean;
  resolveElicitation: (
    elicitationId: string,
    response: ChatElicitationResponse,
    localToolCallId?: string,
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
  const enablePermissionBypassForSlot = useChatRunStore(
    (state) => state.enablePermissionBypass,
  );
  const setModeForSlot = useChatRunStore((state) => state.setMode);
  const permissionBypassEnabled = useChatPermissionBypassEnabled(slotKey);
  const value = useMemo<ChatRuntimeActionsContextValue>(
    () => ({
      enablePermissionBypass() {
        enablePermissionBypassForSlot(slotKey);
      },
      permissionBypassEnabled,
      resolveElicitation(elicitationId, response, localToolCallId) {
        resolveElicitationForSlot(
          slotKey,
          response,
          localToolCallId ?? elicitationId,
          elicitationId,
        );
      },
      async setMode(mode) {
        await setModeForSlot(slotKey, mode);
      },
    }),
    [
      enablePermissionBypassForSlot,
      permissionBypassEnabled,
      resolveElicitationForSlot,
      setModeForSlot,
      slotKey,
    ],
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
