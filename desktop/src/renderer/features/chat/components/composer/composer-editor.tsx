import type { ReactNode } from "react";
import type { ComposerEditorController } from "@/features/chat/components/composer/use-composer-editor";
import {
  Globe,
  SpinnerGap as Loader2,
  WarningCircle,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
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
import { urlPreviewQueryOptions } from "@/features/chat/api/url-preview-query";
import { pasteSourceUrlPath } from "@/features/chat/components/composer/composer-helpers";
import { composerRichTextClassName } from "@/features/chat/components/composer/composer-rich-text";
import { useSettingsStore } from "@/features/settings/settings-store";
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
  const sendWithModEnter = useSettingsStore((state) => state.sendWithModEnter);
  const {
    addPasteSourceUrl,
    editor,
    pasteSourceUrls,
    removePasteSourceUrl,
    setInteractions,
    setTextInput,
  } = controller;

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text !== undefined && text.length > 0) {
        void ipc.appReadClipboardSourceUrl({ text }).then(({ sourceUrl }) => {
          if (sourceUrl === undefined) return;
          // Copies made inside this app carry our own origin as the source;
          // attributing them as an external paste source is just noise.
          if (new URL(sourceUrl).host === window.location.host) return;
          addPasteSourceUrl(sourceUrl);
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
    [addPasteSourceUrl, allowAttachments, attachments],
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
      sendWithModEnter,
    });
  }, [
    blockSubmit,
    canCancel,
    handlePaste,
    onCancel,
    removeLastAttachment,
    sendWithModEnter,
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
        onRemovePasteSource={removePasteSourceUrl}
        pasteSourceUrls={pasteSourceUrls}
      />

      <PromptInputBody>
        <EditorContent
          className={cn(composerRichTextClassName, textareaClassName)}
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
  pasteSourceUrls,
}: {
  headerClassName?: string;
  headerLeading?: ReactNode;
  onRemovePasteSource: (sourceUrl: string) => void;
  pasteSourceUrls: string[];
}) {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();
  const hasHeaderLeading =
    headerLeading !== null && headerLeading !== undefined;

  if (
    !hasHeaderLeading &&
    attachments.files.length === 0 &&
    pasteSourceUrls.length === 0
  ) {
    return null;
  }

  return (
    <PromptInputHeader className={headerClassName}>
      {headerLeading}

      {pasteSourceUrls.map((sourceUrl) => (
        <PasteSourceTile
          key={sourceUrl}
          onRemove={() => onRemovePasteSource(sourceUrl)}
          sourceUrl={sourceUrl}
        />
      ))}

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

function PasteSourceTile({
  onRemove,
  sourceUrl,
}: {
  onRemove: () => void;
  sourceUrl: string;
}) {
  const { t } = useTranslation();
  const preview = useQuery(urlPreviewQueryOptions({ url: sourceUrl }));
  const host = new URL(sourceUrl).host;
  const title = preview.data?.title;
  const hasTitle = is.nonEmptyString(title);
  const fallbackIcon = preview.isPending ? (
    <Loader2
      aria-hidden
      className="size-4 animate-spin text-muted-foreground"
    />
  ) : preview.isError ? (
    <WarningCircle aria-hidden className="size-4 text-muted-foreground" />
  ) : (
    <Globe
      aria-hidden
      className="size-4 text-muted-foreground"
      weight="duotone"
    />
  );
  const contentType = hasTitle
    ? host
    : preview.isPending
      ? t("composer.loadingValue")
      : preview.isError
        ? t("composer.previewUnavailable")
        : pasteSourceUrlPath(sourceUrl);

  return (
    <ChatAttachmentTile
      className="max-w-80"
      contentType={contentType}
      fallbackIcon={fallbackIcon}
      name={hasTitle ? title : host}
      onRemove={onRemove}
      previewUrl={preview.data?.imageDataUrl}
      removeLabel={t("composer.removePasteSource", { url: sourceUrl })}
      typeLabel={pasteSourceUrlPath(sourceUrl)}
    />
  );
}
