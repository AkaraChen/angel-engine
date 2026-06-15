import type { ReactNode } from "react";
import type { ChatRuntimeActionsContextValue } from "@/features/chat/runtime/chat-runtime-actions-context-value";
import { useMemo } from "react";
import { ChatRuntimeActionsContext } from "@/features/chat/runtime/chat-runtime-actions-context-value";
import {
  useChatPermissionBypassEnabled,
  useChatRunStore,
} from "@/features/chat/state/chat-run-store";

interface ChatRuntimeActionsProviderProps {
  children: ReactNode;
  slotKey: string;
}

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
  const setPermissionModeForSlot = useChatRunStore(
    (state) => state.setPermissionMode,
  );
  const permissionBypassEnabled = useChatPermissionBypassEnabled(slotKey);
  const value = useMemo<ChatRuntimeActionsContextValue>(
    () => ({
      enablePermissionBypass(response) {
        enablePermissionBypassForSlot(slotKey, response);
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
      async setPermissionMode(mode) {
        await setPermissionModeForSlot(slotKey, mode);
      },
      slotKey,
    }),
    [
      enablePermissionBypassForSlot,
      permissionBypassEnabled,
      resolveElicitationForSlot,
      setModeForSlot,
      setPermissionModeForSlot,
      slotKey,
    ],
  );

  return (
    <ChatRuntimeActionsContext value={value}>
      {children}
    </ChatRuntimeActionsContext>
  );
}
