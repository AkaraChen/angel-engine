import type { ReactElement } from "react";

import { useChatRunIsRunning } from "@/features/chat/state/chat-run-store";

interface ChatRunningPulseProps {
  chatId: string;
}

export function ChatRunningPulse({
  chatId,
}: ChatRunningPulseProps): ReactElement | null {
  const isRunning = useChatRunIsRunning(chatId);
  if (!isRunning) return null;

  return (
    <i aria-hidden className="relative flex size-2 shrink-0 rounded-full">
      <i
        className="
          absolute inline-flex size-full animate-ping rounded-full
          bg-emerald-400 opacity-60
        "
      />
      <i
        className="
          relative inline-flex size-2 rounded-full bg-emerald-500
          shadow-[0_0_0_1px_rgba(16,185,129,0.35)]
        "
      />
    </i>
  );
}
