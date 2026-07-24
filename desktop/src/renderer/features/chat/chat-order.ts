import type { Chat } from "@angel-engine/daemon-api/chat";

export function sortChatsPinnedFirst(chats: readonly Chat[]): Chat[] {
  return [...chats].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}
