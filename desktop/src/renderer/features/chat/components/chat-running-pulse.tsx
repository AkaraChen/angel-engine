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

  // Running is signalled by a breathing dot rather than a radiating halo: the
  // DNA translation keeps glows out of app surfaces.
  return (
    <i
      aria-hidden
      className="
        flex size-1.5 shrink-0 rounded-full bg-status-success
        animate-[skeleton-breathe_1.4s_ease-in-out_infinite]
        motion-reduce:animate-none
      "
    />
  );
}
