import {
  Editor,
  extensions as coreExtensions,
  sortExtensions,
} from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import {
  composerEnterAction,
  composerEnterIntent,
  ComposerLink,
  ComposerDisplayMention,
  ComposerMention,
  createComposerKeymap,
  handleComposerLinkPaste,
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
  it("handles Enter after mentions and before the default TipTap keymap", () => {
    const composerKeymap = createComposerKeymap({
      blockSubmit: { current: false },
      onCancel: { current: undefined },
      removeLastAttachment: { current: () => false },
      sendWithModEnter: { current: false },
    });
    const orderedKeymaps = sortExtensions(
      [coreExtensions.Keymap, composerKeymap, ComposerMention].reverse(),
    ).map((extension) => extension.name);

    expect(orderedKeymaps).toEqual(["mention", "composerKeymap", "keymap"]);
  });

  it("sends with Enter by default and reverses the shortcuts when configured", () => {
    expect(
      composerEnterIntent({ modKey: false, sendWithModEnter: false }),
    ).toBe("submit");
    expect(composerEnterIntent({ modKey: true, sendWithModEnter: false })).toBe(
      "newline",
    );
    expect(composerEnterIntent({ modKey: false, sendWithModEnter: true })).toBe(
      "newline",
    );
    expect(composerEnterIntent({ modKey: true, sendWithModEnter: true })).toBe(
      "submit",
    );
  });

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

describe("composer URL paste", () => {
  it("links only the URL inserted at a cursor and excludes later typing", () => {
    const editor = createEditor("hello world");
    const view = createPasteView(editor, 7);

    expect(paste(view, "https://example.com")).toBe(true);
    view.dispatch(view.state.tr.insertText("abc"));

    expect(textSegments(view)).toEqual([
      { href: null, text: "hello " },
      { href: "https://example.com", text: "https://example.com" },
      { href: null, text: "abcworld" },
    ]);
  });

  it("turns only selected plain text into a link", () => {
    const editor = createEditor("hello world");
    const view = createPasteView(editor, { from: 7, to: 12 });

    expect(paste(view, "https://example.com")).toBe(true);

    expect(textSegments(view)).toEqual([
      { href: null, text: "hello " },
      { href: "https://example.com", text: "world" },
    ]);
  });

  it("replaces the href only inside an existing linked selection", () => {
    const editor = createEditor({
      content: [
        {
          content: [
            { text: "hello ", type: "text" },
            {
              marks: [{ attrs: { href: "https://old.example" }, type: "link" }],
              text: "world",
              type: "text",
            },
            { text: " again", type: "text" },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    const view = createPasteView(editor, { from: 7, to: 12 });

    expect(paste(view, "https://example.com")).toBe(true);

    expect(textSegments(view)).toEqual([
      { href: null, text: "hello " },
      { href: "https://example.com", text: "world" },
      { href: null, text: " again" },
    ]);
  });

  it("leaves non-URL and rich-text paste to the default paste chain", () => {
    const editor = createEditor("hello world");
    const plainView = createPasteView(editor, 7);
    const richView = createPasteView(editor, 7);

    expect(paste(plainView, "ordinary text")).toBe(false);
    expect(paste(richView, "https://example.com", "<b>example</b>")).toBe(
      false,
    );
  });
});

function createEditor(content: object | string) {
  const editor = new Editor({
    content,
    contentType: typeof content === "string" ? "markdown" : "json",
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        link: false,
      }),
      ComposerLink,
      Markdown,
      ComposerMention,
    ],
  });
  editors.push(editor);
  return editor;
}

function createPasteView(
  editor: Editor,
  selection: number | { from: number; to: number },
) {
  let state = editor.state.apply(
    editor.state.tr.setSelection(
      typeof selection === "number"
        ? TextSelection.create(editor.state.doc, selection)
        : TextSelection.create(editor.state.doc, selection.from, selection.to),
    ),
  );
  return {
    dispatch(transaction: Parameters<Editor["view"]["dispatch"]>[0]) {
      state = state.apply(transaction);
    },
    get state() {
      return state;
    },
  } as Editor["view"];
}

function paste(view: Editor["view"], text: string, html?: string) {
  const types =
    html === undefined ? ["text/plain"] : ["text/plain", "text/html"];
  return handleComposerLinkPaste(view, {
    clipboardData: {
      getData: (type: string) => (type === "text/html" ? (html ?? "") : text),
      types,
    },
    preventDefault: () => undefined,
  } as unknown as ClipboardEvent);
}

function textSegments(view: Editor["view"]) {
  const segments: { href: string | null; text: string }[] = [];
  view.state.doc.descendants((node) => {
    if (!node.isText) return;
    const href =
      (node.marks.find((mark) => mark.type.name === "link")?.attrs.href as
        | string
        | undefined) ?? null;
    const previous = segments.at(-1);
    if (previous?.href === href) {
      previous.text += node.text ?? "";
    } else {
      segments.push({ href, text: node.text ?? "" });
    }
  });
  return segments;
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
