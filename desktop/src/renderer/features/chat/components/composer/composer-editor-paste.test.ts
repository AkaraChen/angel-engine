// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComposerInteractionRefs } from "@/features/chat/components/composer/composer-editor-extensions";
import { createComposerExtensions } from "@/features/chat/components/composer/composer-editor-extensions";
import { handleComposerFilePaste } from "@/features/chat/components/composer/composer-paste";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("composer file paste", () => {
  it("is consumed by the editor prop before the URL link plugin", () => {
    const addFiles = vi.fn();
    const editor = new Editor({
      content: "",
      contentType: "markdown",
      element: document.createElement("div"),
      editorProps: {
        handlePaste: (_view, event) => handleComposerFilePaste(event, addFiles),
      },
      extensions: createComposerExtensions({
        interactions: composerInteractions(),
        placeholder: "",
      }),
    });
    editors.push(editor);
    const file = new File(["image"], "image.png", { type: "image/png" });
    const preventDefault = vi.fn();
    const event = {
      clipboardData: {
        getData: (type: string) =>
          type === "text/plain" ? "https://example.com" : "",
        items: [{ getAsFile: () => file, kind: "file" }],
        types: ["text/plain", "Files"],
      },
      preventDefault,
    } as unknown as ClipboardEvent;

    const handled = editor.view.someProp("handlePaste", (handler) =>
      handler(editor.view, event, Slice.empty),
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(addFiles).toHaveBeenCalledWith([file]);
    expect(editor.getText()).toBe("");
  });
});

function composerInteractions(): ComposerInteractionRefs {
  return {
    blockSubmit: { current: false },
    catalog: {
      current: {
        api: {} as ComposerInteractionRefs["catalog"]["current"]["api"],
        commands: [],
        projectPath: undefined,
        projectToolsEnabled: false,
        skills: [],
      },
    },
    handlePaste: { current: () => false },
    onCancel: { current: undefined },
    removeLastAttachment: { current: () => false },
    sendWithModEnter: { current: false },
  };
}
