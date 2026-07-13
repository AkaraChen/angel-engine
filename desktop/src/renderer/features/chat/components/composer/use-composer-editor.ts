import type { Editor } from "@tiptap/core";
import type {
  ComposerMentionedFile,
  ComposerMentionedSkill,
} from "@/features/chat/components/composer/composer-attachments";
import type {
  ComposerCatalog,
  ComposerInteractionRefs,
} from "@/features/chat/components/composer/composer-editor-extensions";
import { useEditor, useEditorState } from "@tiptap/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createComposerExtensions } from "@/features/chat/components/composer/composer-editor-extensions";
import { composerMentionsFromDocument } from "@/features/chat/components/composer/composer-editor-model";
import { useChatEnvironment } from "@/features/chat/runtime/chat-environment-context";
import { useApi } from "@/platform/use-api";

export interface ComposerEditorInteractions {
  blockSubmit: boolean;
  handlePaste: (event: ClipboardEvent) => boolean;
  onCancel?: () => void;
  removeLastAttachment: () => boolean;
}

export interface ComposerEditorController {
  editor: Editor | null;
  focus: () => void;
  getMarkdown: () => string;
  isEmpty: boolean;
  mentionedFiles: ComposerMentionedFile[];
  pasteSourceUrl: string | undefined;
  removeMention: (id: string) => void;
  reset: () => void;
  selectedSkills: ComposerMentionedSkill[];
  setInteractions: (interactions: ComposerEditorInteractions) => void;
  setPasteSourceUrl: (sourceUrl: string | undefined) => void;
  setTextInput: (setInput: (value: string) => void) => void;
}

export function useComposerEditor({
  initialMarkdown = "",
}: { initialMarkdown?: string } = {}): ComposerEditorController {
  const { t } = useTranslation();
  const api = useApi();
  const environment = useChatEnvironment();
  const [mentionedFiles, setMentionedFiles] = useState<ComposerMentionedFile[]>(
    [],
  );
  const [pasteSourceUrl, setPasteSourceUrl] = useState<string>();
  const [selectedSkills, setSelectedSkills] = useState<
    ComposerMentionedSkill[]
  >([]);
  const textInputRef = useRef<(value: string) => void>(() => undefined);
  const catalogRef = useRef<ComposerCatalog>({
    api,
    commands: environment.availableCommands,
    projectPath: environment.projectPath,
    projectToolsEnabled:
      environment.isProjectChat && environment.projectPath !== undefined,
    skills: environment.availableSkills,
  });
  catalogRef.current = {
    api,
    commands: environment.availableCommands,
    projectPath: environment.projectPath,
    projectToolsEnabled:
      environment.isProjectChat && environment.projectPath !== undefined,
    skills: environment.availableSkills,
  };
  const handlePasteRef = useRef<(event: ClipboardEvent) => boolean>(
    () => false,
  );
  const blockSubmitRef = useRef(false);
  const onCancelRef = useRef<(() => void) | undefined>(undefined);
  const removeLastAttachmentRef = useRef<() => boolean>(() => false);
  const interactions = useMemo<ComposerInteractionRefs>(
    () => ({
      blockSubmit: blockSubmitRef,
      catalog: catalogRef,
      handlePaste: handlePasteRef,
      onCancel: onCancelRef,
      removeLastAttachment: removeLastAttachmentRef,
    }),
    [],
  );

  const syncMentions = useCallback((editor: Editor) => {
    const { files, skills } = composerMentionsFromDocument(editor.state.doc);
    setMentionedFiles(files);
    setSelectedSkills(skills);
    textInputRef.current(editor.getMarkdown());
  }, []);

  const extensions = useMemo(
    () =>
      createComposerExtensions({
        interactions,
        placeholder: t("composer.placeholder"),
      }),
    [interactions, t],
  );
  const editor = useEditor(
    {
      content: initialMarkdown,
      contentType: "markdown",
      editorProps: {
        attributes: {
          "aria-label": t("composer.placeholder"),
          "data-slot": "input-group-control",
        },
        handlePaste: (_view, event) => handlePasteRef.current(event),
      },
      extensions,
      immediatelyRender: false,
      onCreate: ({ editor: createdEditor }) => syncMentions(createdEditor),
      onUpdate: ({ editor: updatedEditor }) => syncMentions(updatedEditor),
      shouldRerenderOnTransaction: false,
    },
    [extensions],
  );
  const emptyState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor?.isEmpty ?? true,
  });

  const focus = useCallback(() => editor?.commands.focus(), [editor]);
  const getMarkdown = useCallback(() => editor?.getMarkdown() ?? "", [editor]);
  const reset = useCallback(() => {
    editor?.commands.clearContent();
    setPasteSourceUrl(undefined);
  }, [editor]);
  const removeMention = useCallback(
    (id: string) => {
      if (editor === null) return;
      const positions: number[] = [];
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === "mention" && node.attrs.id === id) {
          positions.push(position);
        }
      });
      if (positions.length === 0) return;
      const transaction = editor.state.tr;
      for (const position of [...positions].reverse()) {
        transaction.delete(position, position + 1);
      }
      editor.view.dispatch(transaction);
      editor.commands.focus();
    },
    [editor],
  );
  const setInteractions = useCallback((next: ComposerEditorInteractions) => {
    blockSubmitRef.current = next.blockSubmit;
    handlePasteRef.current = next.handlePaste;
    onCancelRef.current = next.onCancel;
    removeLastAttachmentRef.current = next.removeLastAttachment;
  }, []);
  const setTextInput = useCallback(
    (setInput: (value: string) => void) => {
      textInputRef.current = setInput;
      if (editor !== null) setInput(editor.getMarkdown());
    },
    [editor],
  );

  return {
    editor,
    focus,
    getMarkdown,
    isEmpty: emptyState ?? true,
    mentionedFiles,
    pasteSourceUrl,
    removeMention,
    reset,
    selectedSkills,
    setInteractions,
    setPasteSourceUrl,
    setTextInput,
  };
}
