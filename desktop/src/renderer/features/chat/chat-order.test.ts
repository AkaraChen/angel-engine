import type { Chat } from "@angel-engine/daemon-api/chat";
import { describe, expect, it } from "vitest";
import { sortChatsPinnedFirst } from "./chat-order";

function chat(
  id: string,
  {
    pinned = false,
    updatedAt,
  }: {
    pinned?: boolean;
    updatedAt: string;
  },
): Chat {
  return {
    archived: false,
    createdAt: updatedAt,
    cwd: "/home/user/project",
    id,
    pinned,
    projectId: "project-id",
    remoteThreadId: null,
    runtime: "codex",
    title: id,
    updatedAt,
  };
}

describe("sortChatsPinnedFirst", () => {
  it("puts pinned chats before more recently updated unpinned chats", () => {
    const newest = chat("newest", {
      updatedAt: "2026-07-24T12:00:00.000Z",
    });
    const pinned = chat("pinned", {
      pinned: true,
      updatedAt: "2026-07-23T12:00:00.000Z",
    });

    expect(
      sortChatsPinnedFirst([newest, pinned]).map((item) => item.id),
    ).toEqual(["pinned", "newest"]);
  });

  it("orders chats by latest activity within each pin state", () => {
    const chats = [
      chat("unpinned-old", {
        updatedAt: "2026-07-20T12:00:00.000Z",
      }),
      chat("pinned-old", {
        pinned: true,
        updatedAt: "2026-07-21T12:00:00.000Z",
      }),
      chat("unpinned-new", {
        updatedAt: "2026-07-24T12:00:00.000Z",
      }),
      chat("pinned-new", {
        pinned: true,
        updatedAt: "2026-07-23T12:00:00.000Z",
      }),
    ];

    expect(sortChatsPinnedFirst(chats).map((item) => item.id)).toEqual([
      "pinned-new",
      "pinned-old",
      "unpinned-new",
      "unpinned-old",
    ]);
    expect(chats.map((item) => item.id)).toEqual([
      "unpinned-old",
      "pinned-old",
      "unpinned-new",
      "pinned-new",
    ]);
  });
});
