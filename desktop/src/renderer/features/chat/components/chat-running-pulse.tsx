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

  // One dot that breathes in place. No ping ring and no box-shadow halo — a
  // glowing status dot is the tell of a vibe-coded UI, and the app already
  // signals the run in the header sweep and the composer state.
  return (
    <i
      aria-hidden
      className="
        inline-flex size-2 shrink-0 animate-chat-pulse rounded-full bg-primary
      "
    />
  );
}
