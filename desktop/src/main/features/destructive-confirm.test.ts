import { describe, expect, it } from "vitest";
import {
  buildChatDeleteConfirmDetail,
  buildChatDeleteConfirmMessage,
  buildProjectDeleteConfirmDetail,
  buildProjectDeleteConfirmMessage,
  destructiveConfirmMessageBoxOptions,
  displayChatTitleForConfirm,
  projectDisplayName,
  type TranslateFn,
} from "./destructive-confirm";

const t: TranslateFn = (key, options) => {
  if (key === "workspace.newChat") return "New chat";
  if (key === "common.cancel") return "Cancel";
  if (key === "common.delete") return "Delete";
  if (key === "projects.confirmDeleteTitle") {
    return `Delete "${String(options?.name)}"?`;
  }
  if (key === "projects.confirmDeleteDetailNone") {
    return "No linked chats. Files remain. Irreversible.";
  }
  if (key === "projects.confirmDeleteDetailOne") {
    return "Deletes 1 linked chat. Files remain. Irreversible.";
  }
  if (key === "projects.confirmDeleteDetail") {
    return `Deletes ${String(options?.count)} linked chats. Files remain. Irreversible.`;
  }
  if (key === "dialog.confirmDeleteChatTitle") {
    return `Delete "${String(options?.title)}"?`;
  }
  if (key === "dialog.confirmDeleteChatDetail") {
    return "Permanently deletes the chat. Irreversible.";
  }
  return key;
};

describe("projectDisplayName", () => {
  it("uses the last path segment on posix and windows paths", () => {
    expect(projectDisplayName("/Users/eric/Developer/release-qa")).toBe(
      "release-qa",
    );
    expect(projectDisplayName("C:\\\\Repos\\\\angel-engine")).toBe(
      "angel-engine",
    );
  });
});

describe("displayChatTitleForConfirm", () => {
  it("localizes the default New chat sentinel and empty titles", () => {
    expect(displayChatTitleForConfirm("New chat", t)).toBe("New chat");
    expect(displayChatTitleForConfirm("  ", t)).toBe("New chat");
    expect(displayChatTitleForConfirm("Desktop verification", t)).toBe(
      "Desktop verification",
    );
  });
});

describe("project delete confirm copy builders", () => {
  it("names the project and pluralizes linked-chat impact", () => {
    expect(buildProjectDeleteConfirmMessage("Release QA", t)).toBe(
      'Delete "Release QA"?',
    );
    expect(buildProjectDeleteConfirmDetail(0, t)).toBe(
      "No linked chats. Files remain. Irreversible.",
    );
    expect(buildProjectDeleteConfirmDetail(1, t)).toBe(
      "Deletes 1 linked chat. Files remain. Irreversible.",
    );
    expect(buildProjectDeleteConfirmDetail(3, t)).toBe(
      "Deletes 3 linked chats. Files remain. Irreversible.",
    );
  });
});

describe("chat delete confirm copy builders", () => {
  it("names the chat and states irreversibility", () => {
    expect(buildChatDeleteConfirmMessage("Desktop verification", t)).toBe(
      'Delete "Desktop verification"?',
    );
    expect(buildChatDeleteConfirmMessage("New chat", t)).toBe(
      'Delete "New chat"?',
    );
    expect(buildChatDeleteConfirmDetail(t)).toBe(
      "Permanently deletes the chat. Irreversible.",
    );
  });
});

describe("destructiveConfirmMessageBoxOptions", () => {
  it("defaults Cancel and maps Escape to cancel", () => {
    expect(
      destructiveConfirmMessageBoxOptions({
        detail: "detail",
        message: "message",
        t,
      }),
    ).toEqual({
      buttons: ["Cancel", "Delete"],
      cancelId: 0,
      defaultId: 0,
      detail: "detail",
      message: "message",
      noLink: true,
      type: "warning",
    });
  });
});
