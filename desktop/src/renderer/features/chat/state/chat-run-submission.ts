interface ChatRunAcceptanceInput {
  cancelled: boolean;
  error?: string;
  hadChatId: boolean;
  hasResult: boolean;
  initialSlotKey: string;
  slotKey: string;
}

export function resolveChatRunAccepted({
  cancelled,
  error,
  hadChatId,
  hasResult,
  initialSlotKey,
  slotKey,
}: ChatRunAcceptanceInput): boolean {
  if (hadChatId || hasResult || slotKey !== initialSlotKey) return true;
  if (cancelled) return false;

  throw new Error(error ?? "The chat did not start. Please try again.");
}
