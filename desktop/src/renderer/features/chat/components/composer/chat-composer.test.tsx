import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  restoreComposerDraft,
  snapshotComposerDraft,
} from "@/features/chat/components/composer/composer-draft";
import { ComposerMention } from "@/features/chat/components/composer/composer-editor-extensions";
import { composerMentionsFromDocument } from "@/features/chat/components/composer/composer-editor-model";
import type { ComposerGitHubAttachment } from "@/features/chat/components/composer/github-attachments";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function createEditor(content: string | object) {
  const editor = new Editor({
    content,
    contentType: typeof content === "string" ? "markdown" : "json",
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Markdown,
      ComposerMention,
    ],
  });
  editors.push(editor);
  return editor;
}

const githubAttachment: ComposerGitHubAttachment = {
  author: null,
  body: "body",
  contextText: "PR context",
  id: "gh-1",
  kind: "pullRequest",
  number: 42,
  owner: "owner",
  provider: "github",
  repo: "repo",
  state: "open",
  title: "PR #42",
  url: "https://github.com/owner/repo/pull/42",
};

describe("composer draft snapshot/restore", () => {
  it("restores text, mentions, GitHub attachments, and paste refs exactly", () => {
    const editor = createEditor({
      content: [
        {
          content: [
            { text: "draft text with ", type: "text" },
            {
              attrs: {
                id: "README.md",
                kind: "file",
                label: "README.md",
                path: "README.md",
              },
              type: "mention",
            },
            { text: " inside", type: "text" },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    const setGitHubAttachments = vi.fn();
    const setPasteSourceUrls = vi.fn();

    const snapshot = snapshotComposerDraft({
      editor,
      githubAttachments: [githubAttachment],
      pasteSourceUrls: ["https://example.com/spec"],
    });

    // What ChatComposer's reset() does before awaiting the send.
    editor.commands.setContent({
      content: [{ type: "paragraph" }],
      type: "doc",
    });
    expect(editor.getMarkdown()).toBe("");

    // What it does when that send rejects.
    restoreComposerDraft(snapshot, editor, {
      setGitHubAttachments,
      setPasteSourceUrls,
    });

    expect(editor.getMarkdown()).toContain("draft text");
    expect(editor.getMarkdown()).toContain("README.md");
    // Mention nodes round-trip: mentions are re-derived from the document,
    // not from a second store.
    const mentions = composerMentionsFromDocument(editor.state.doc);
    expect(mentions.files.map((file) => file.path)).toContain("README.md");
    expect(setPasteSourceUrls).toHaveBeenCalledWith([
      "https://example.com/spec",
    ]);
    expect(setGitHubAttachments).toHaveBeenCalledWith([githubAttachment]);
  });

  it("snapshots a destroyed editor as no content instead of throwing", () => {
    const editor = createEditor("gone");
    editor.destroy();

    const snapshot = snapshotComposerDraft({
      editor,
      githubAttachments: [],
      pasteSourceUrls: [],
    });
    expect(snapshot.content).toBeNull();
    expect(() =>
      restoreComposerDraft(snapshot, editor, {
        setGitHubAttachments: vi.fn(),
        setPasteSourceUrls: vi.fn(),
      }),
    ).not.toThrow();
  });
});
