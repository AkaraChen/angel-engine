import { COMMAND_IDS } from "@shared/keybindings";
import { useEffect, useState, type ReactNode } from "react";

import { composerEnterAction } from "@/features/chat/components/composer/composer-editor-extensions";
import type { ComposerEditorController } from "@/features/chat/components/composer/use-composer-editor";
import {
  KeymapScope,
  useCommand,
  useContextKey,
} from "@/platform/keymap/provider";

export function ComposerKeymapBridge({
  blockSubmit,
  canCancel,
  controller,
  onCancel,
  children,
}: {
  blockSubmit: boolean;
  canCancel: boolean;
  controller: ComposerEditorController;
  onCancel?: () => void;
  children: ReactNode;
}) {
  const { editor } = controller;
  const [isEmpty, setIsEmpty] = useState(editor?.isEmpty ?? true);
  const [suggestionOpen, setSuggestionOpen] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      setIsEmpty(editor.isEmpty);
      const open =
        editor.view.dom
          .closest("[data-composer-root]")
          ?.querySelector("[data-composer-suggestion-open='true']") != null;
      setSuggestionOpen(Boolean(open));
    };
    sync();
    editor.on("transaction", sync);
    editor.on("selectionUpdate", sync);
    return () => {
      editor.off("transaction", sync);
      editor.off("selectionUpdate", sync);
    };
  }, [editor]);

  useContextKey("focus.panel", "chat.composer");
  useContextKey("focus.editable", true);
  useContextKey("chat.composerEmpty", isEmpty);
  useContextKey("chat.composerNotEmpty", !isEmpty);
  useContextKey("chat.submitDisabled", blockSubmit);
  useContextKey("chat.running", canCancel);
  useContextKey("chat.suggestionOpen", suggestionOpen);

  useCommand(COMMAND_IDS.chatSend, () => {
    if (!editor) return false;
    const form = editor.view.dom.closest("form");
    const submitButton = form?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    const action = composerEnterAction({
      blockSubmit,
      composing: editor.view.composing,
      submitDisabled: submitButton?.disabled ?? false,
    });
    if (action === "allow-ime") return false;
    if (action === "block") return true;
    form?.requestSubmit();
    return true;
  }, [blockSubmit, editor]);

  useCommand(COMMAND_IDS.chatNewline, () => {
    if (!editor) return false;
    return editor.commands.setHardBreak();
  }, [editor]);

  useCommand(COMMAND_IDS.chatInterrupt, () => {
    if (!canCancel || !onCancel) return false;
    onCancel();
    return true;
  }, [canCancel, onCancel]);

  return (
    <KeymapScope scope="editable" id="chat.composer" capture>
      <div className="contents" data-composer-root="">
        {children}
      </div>
    </KeymapScope>
  );
}
