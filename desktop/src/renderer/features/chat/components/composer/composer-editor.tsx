import type { ReactNode } from "react";
import type { ComposerEditorController } from "@/features/chat/components/composer/use-composer-editor";
import { EditorContent } from "@tiptap/react";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { WorkspaceFileTreeIconSprite } from "@/app/workspace/workspace-file-tree";
import {
  PromptInputBody,
  PromptInputHeader,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { ChatAttachmentTile } from "@/features/chat/components/attachment-tile";
import { ipc } from "@/platform/ipc";
import { cn } from "@/platform/utils";

export interface ComposerEditorProps {
  allowAttachments?: boolean;
  blockSubmit?: boolean;
  canCancel?: boolean;
  controller: ComposerEditorController;
  disabled?: boolean;
  headerClassName?: string;
  headerLeading?: ReactNode;
  onCancel?: () => void;
  rows?: number;
  textareaClassName?: string;
}

export function ComposerEditor({
  allowAttachments = true,
  blockSubmit = false,
  canCancel = false,
  controller,
  disabled = false,
  headerClassName,
  headerLeading,
  onCancel,
  textareaClassName,
}: ComposerEditorProps) {
  const promptController = usePromptInputController();
  const attachments = usePromptInputAttachments();
  const {
    editor,
    pasteSourceUrl,
    setInteractions,
    setPasteSourceUrl,
    setTextInput,
  } = controller;

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text !== undefined && text.length > 0) {
        void ipc.appReadClipboardSourceUrl({ text }).then(({ sourceUrl }) => {
          if (sourceUrl !== undefined) setPasteSourceUrl(sourceUrl);
        });
      }

      if (!allowAttachments) return false;

      const files = [...(event.clipboardData?.items ?? [])]
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length === 0) return false;

      event.preventDefault();
      attachments.add(files);
      return true;
    },
    [allowAttachments, attachments, setPasteSourceUrl],
  );
  const removeLastAttachment = useCallback(() => {
    const attachment = attachments.files.at(-1);
    if (attachment === undefined) return false;
    attachments.remove(attachment.id);
    return true;
  }, [attachments]);

  useEffect(() => {
    setInteractions({
      blockSubmit,
      handlePaste,
      onCancel: canCancel ? onCancel : undefined,
      removeLastAttachment,
    });
  }, [
    blockSubmit,
    canCancel,
    handlePaste,
    onCancel,
    removeLastAttachment,
    setInteractions,
  ]);
  useEffect(() => {
    setTextInput(promptController.textInput.setInput);
  }, [promptController.textInput.setInput, setTextInput]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <>
      <WorkspaceFileTreeIconSprite />
      <ComposerEditorHeader
        headerClassName={headerClassName}
        headerLeading={headerLeading}
        onRemovePasteSource={() => setPasteSourceUrl(undefined)}
        pasteSourceUrl={pasteSourceUrl}
      />

      <PromptInputBody>
        <EditorContent
          className={cn(
            `
              w-full
              [&_.tiptap]:max-h-40
              [&_.tiptap]:min-h-(--workspace-composer-min-height)
              [&_.tiptap]:overflow-y-auto
              [&_.tiptap]:[font-size:var(--workspace-composer-text-size)]
              [&_.tiptap]:leading-(--workspace-composer-line-height)
              [&_.tiptap]:wrap-anywhere [&_.tiptap]:outline-none
              [&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none
              [&_.tiptap_.is-editor-empty:first-child::before]:float-left
              [&_.tiptap_.is-editor-empty:first-child::before]:h-0
              [&_.tiptap_.is-editor-empty:first-child::before]:text-muted-foreground/62
              [&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
              [&_.tiptap_blockquote]:border-l-2
              [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-3
              [&_.tiptap_code]:rounded-sm [&_.tiptap_code]:bg-muted
              [&_.tiptap_code]:px-1 [&_.tiptap_code]:py-0.5
              [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5
              [&_.tiptap_p]:my-0
              [&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:rounded-md
              [&_.tiptap_pre]:bg-muted [&_.tiptap_pre]:p-3
              [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5
            `,
            textareaClassName,
          )}
          editor={editor}
        />
      </PromptInputBody>
    </>
  );
}

function ComposerEditorHeader({
  headerClassName,
  headerLeading,
  onRemovePasteSource,
  pasteSourceUrl,
}: {
  headerClassName?: string;
  headerLeading?: ReactNode;
  onRemovePasteSource: () => void;
  pasteSourceUrl: string | undefined;
}) {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();
  const hasHeaderLeading =
    headerLeading !== null && headerLeading !== undefined;

  if (
    !hasHeaderLeading &&
    attachments.files.length === 0 &&
    pasteSourceUrl === undefined
  ) {
    return null;
  }

  return (
    <PromptInputHeader className={headerClassName}>
      {headerLeading}

      {pasteSourceUrl !== undefined ? (
        <ChatAttachmentTile
          className="max-w-80"
          contentType={sourceUrlPath(pasteSourceUrl)}
          name={new URL(pasteSourceUrl).host}
          onRemove={onRemovePasteSource}
          removeLabel={t("composer.removePasteSource", {
            url: pasteSourceUrl,
          })}
          typeLabel={t("composer.pasteSource")}
        />
      ) : null}

      {attachments.files.map((file) => {
        if (!file.mediaType) {
          throw new Error("Composer attachment is missing mediaType.");
        }
        const mediaType = file.mediaType;
        const isImage = mediaType.startsWith("image/");
        const name = file.filename ?? t("common.attachment");

        return (
          <ChatAttachmentTile
            className="max-w-64"
            contentType={mediaType}
            key={file.id}
            name={name}
            onRemove={() => attachments.remove(file.id)}
            previewUrl={isImage ? file.url : undefined}
            removeLabel={t("composer.removeAttachment", { name })}
            typeLabel={isImage ? t("common.image") : t("common.file")}
          />
        );
      })}
    </PromptInputHeader>
  );
}

function sourceUrlPath(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  return `${url.pathname}${url.search}${url.hash}`;
}
