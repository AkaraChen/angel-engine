import type { ChatElicitationResponse } from "@angel-engine/daemon-api/chat";

import { createContext } from "react";

export interface ChatRuntimeActionsContextValue {
  enablePermissionBypass: (response: ChatElicitationResponse) => void;
  permissionBypassEnabled: boolean;
  resolveElicitation: (
    elicitationId: string,
    response: ChatElicitationResponse,
    localToolCallId?: string,
  ) => void;
  setMode: (mode: string) => Promise<void>;
  setPermissionMode: (mode: string) => Promise<void>;
}

export const ChatRuntimeActionsContext =
  createContext<ChatRuntimeActionsContextValue | null>(null);
