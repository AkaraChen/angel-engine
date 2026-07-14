/**
 * Hand-off for the composer's first message.
 *
 * `POST /api/chats` creates an empty chat and returns it; it does not accept an
 * initial prompt. So the Home composer stashes the typed prompt keyed by the
 * new chat's id, and the Chat page (KIT-143) reads it once on open to prefill /
 * send. sessionStorage survives the in-app navigation and is scoped to the tab.
 */
const KEY_PREFIX = "angel:new-chat-prompt:";

export function stashNewChatPrompt(chatId: string, prompt: string): void {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) return;
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${chatId}`, trimmed);
  } catch {
    // Best-effort: a full/blocked sessionStorage just means no prefill.
  }
}

/** Reads and clears the stashed prompt for a chat, if any. */
export function takeNewChatPrompt(chatId: string): string | undefined {
  const key = `${KEY_PREFIX}${chatId}`;
  try {
    const value = sessionStorage.getItem(key);
    if (value !== null) sessionStorage.removeItem(key);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}
