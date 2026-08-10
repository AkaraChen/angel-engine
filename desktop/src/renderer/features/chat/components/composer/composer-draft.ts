import type { Editor, JSONContent } from "@tiptap/core";
import type { ComposerGitHubAttachment } from "@/features/chat/components/composer/github-attachments";

export interface ComposerDraftSnapshot {
  /** Tiptap document JSON; mention/skill nodes round-trip through it. */
  content: JSONContent | null;
  githubAttachments: ComposerGitHubAttachment[];
  pasteSourceUrls: string[];
}

/**
 * Whether the editor can still take content. The `commands` getter throws on a
 * destroyed editor; `isDestroyed` alone would also reject never-mounted
 * editors (e.g. headless), which accept content just fine.
 */
function editorAcceptsContent(editor: Editor | null): editor is Editor {
  if (editor === null) return false;
  try {
    void editor.commands;
    return true;
  } catch {
    return false;
  }
}

/**
 * Captures the complete composer draft so a rejected send can restore it
 * exactly. A destroyed editor yields no content rather than throwing.
 */
export function snapshotComposerDraft(input: {
  editor: Editor | null;
  githubAttachments: ComposerGitHubAttachment[];
  pasteSourceUrls: string[];
}): ComposerDraftSnapshot {
  const { editor } = input;
  return {
    content: editorAcceptsContent(editor) ? editor.getJSON() : null,
    githubAttachments: input.githubAttachments,
    pasteSourceUrls: input.pasteSourceUrls,
  };
}

/**
 * Puts a snapshot back. Setting the document re-fires the editor's update
 * flow, which re-derives mentions and skills — no second source of truth.
 */
export function restoreComposerDraft(
  snapshot: ComposerDraftSnapshot,
  editor: Editor | null,
  setters: {
    setGitHubAttachments: (value: ComposerGitHubAttachment[]) => void;
    setPasteSourceUrls: (value: string[]) => void;
  },
): void {
  if (snapshot.content !== null && editorAcceptsContent(editor)) {
    editor.commands.setContent(snapshot.content);
  }
  setters.setPasteSourceUrls(snapshot.pasteSourceUrls);
  setters.setGitHubAttachments(snapshot.githubAttachments);
}
