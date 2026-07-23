import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import {
  composerEnterAction,
  ComposerDisplayMention,
  ComposerMention,
} from "@/features/chat/components/composer/composer-editor-extensions";
import { composerMentionsFromDocument } from "@/features/chat/components/composer/composer-editor-model";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("composer markdown", () => {
  it("serializes file, skill, and command mention nodes to text forms", () => {
    const editor = createEditor({
      content: [
        {
          content: [
            {
              attrs: {
                fileType: "file",
                id: "/repo/src/app.ts",
                kind: "file",
                label: "src/app.ts",
                mimeType: "text/typescript",
                name: "app.ts",
                path: "/repo/src/app.ts",
                relativePath: "src/app.ts",
              },
              type: "mention",
            },
            { text: " then ", type: "text" },
            {
              attrs: {
                id: "review",
                kind: "command",
                label: "review",
                name: "review",
              },
              type: "mention",
            },
            { text: " and ", type: "text" },
            {
              attrs: {
                description: "Review code",
                enabled: true,
                id: "/skills/review",
                kind: "skill",
                label: "review",
                name: "review",
                path: "/skills/review",
                scope: "repo",
              },
              type: "mention",
            },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    });

    expect(editor.getMarkdown()).toBe("@src/app.ts then /review and $review");
    expect(composerMentionsFromDocument(editor.state.doc)).toEqual({
      files: [
        {
          id: "/repo/src/app.ts",
          mimeType: "text/typescript",
          name: "app.ts",
          path: "/repo/src/app.ts",
          relativePath: "src/app.ts",
          type: "file",
        },
      ],
      skills: [
        {
          description: "Review code",
          enabled: true,
          id: "/skills/review",
          name: "review",
          path: "/skills/review",
          scope: "repo",
        },
      ],
    });
  });

  it("round-trips rich markdown", () => {
    const editor = createEditor("**bold**\n\n- one\n- two\n\n`code`");
    expect(editor.getMarkdown()).toBe("**bold**\n\n- one\n- two\n\n`code`");
  });

  it("restores command, skill, and file mentions for read-only messages", () => {
    const editor = createDisplayEditor(
      "/review with $skill-authoring and @src/app.ts",
    );
    const paragraph = editor.getJSON().content?.[0];

    expect(
      paragraph?.content
        ?.filter((node) => node.type === "mention")
        .map((node) => {
          const mention = node as {
            attrs?: { kind?: unknown; label?: unknown };
          };
          return {
            kind: mention.attrs?.kind,
            label: mention.attrs?.label,
          };
        }),
    ).toEqual([
      { kind: "command", label: "review" },
      { kind: "skill", label: "skill-authoring" },
      { kind: "file", label: "src/app.ts" },
    ]);
  });

  it("does not turn email addresses into file mentions", () => {
    const editor = createDisplayEditor(
      "email dev@example.com and inspect /tmp/output",
    );

    expect(
      editor
        .getJSON()
        .content?.[0]?.content?.some((node) => node.type === "mention"),
    ).toBe(false);
  });
});

describe("composer Enter key decisions", () => {
  it("allows IME composition to consume Enter", () => {
    expect(
      composerEnterAction({
        blockSubmit: false,
        composing: true,
        submitDisabled: false,
      }),
    ).toBe("allow-ime");
  });

  it("blocks disabled or explicitly blocked submit and submits otherwise", () => {
    expect(
      composerEnterAction({
        blockSubmit: false,
        composing: false,
        submitDisabled: true,
      }),
    ).toBe("block");
    expect(
      composerEnterAction({
        blockSubmit: true,
        composing: false,
        submitDisabled: false,
      }),
    ).toBe("block");
    expect(
      composerEnterAction({
        blockSubmit: false,
        composing: false,
        submitDisabled: false,
      }),
    ).toBe("submit");
  });
});

function createEditor(content: object | string) {
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

function createDisplayEditor(content: string) {
  const editor = new Editor({
    content,
    contentType: "markdown",
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Markdown,
      ComposerDisplayMention,
    ],
  });
  editors.push(editor);
  return editor;
}
