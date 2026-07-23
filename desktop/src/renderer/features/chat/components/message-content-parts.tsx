import type {
  CompleteAttachment,
  EnrichedPartState,
} from "@assistant-ui/react";
import type { TFunction } from "i18next";
import type { FC } from "react";

import { parseDataUrl } from "@angel-engine/daemon-api/chat";
import { isTextLikeMimeType } from "@angel-engine/daemon-api/mime";
import { useAuiState } from "@assistant-ui/react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import { SpinnerGap as Loader2 } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { cjk } from "@streamdown/cjk";
import { code as streamdownCode } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { EditorContent, useEditor } from "@tiptap/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ChatAttachmentTile } from "@/features/chat/components/attachment-tile";
import { createComposerDisplayExtensions } from "@/features/chat/components/composer/composer-editor-extensions";
import { composerRichTextClassName } from "@/features/chat/components/composer/composer-rich-text";
import { assistantTextContainerClassName } from "@/features/chat/components/message-styles";
import { cn } from "@/platform/utils";

function UserTextMessagePart(
  part: Extract<EnrichedPartState, { type: "text" }>,
) {
  const { t } = useTranslation();

  if (part.status.type === "running" && !part.text) {
    return (
      <span className="inline-flex items-center gap-2 opacity-70">
        <Loader2 className="size-3.5 animate-spin" />
        {t("common.thinking")}
      </span>
    );
  }

  return <UserMessageRichText text={part.text} />;
}

type UserMessageRichTextProps = {
  text: string;
};

const UserMessageRichText: FC<UserMessageRichTextProps> = ({ text }) => {
  const extensions = useMemo(createComposerDisplayExtensions, []);
  const editor = useEditor(
    {
      content: text,
      contentType: "markdown",
      editable: false,
      extensions,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
    },
    [extensions, text],
  );

  return (
    <EditorContent
      className={cn(
        composerRichTextClassName,
        `
          select-text
          [&_.tiptap]:max-h-none! [&_.tiptap]:min-h-0!
          [&_.tiptap]:overflow-visible!
          [&_[data-type=mention]]:text-primary-foreground!
          [&_[data-mention-kind=skill]]:bg-primary-foreground/12!
        `,
      )}
      editor={editor}
    />
  );
};

function AssistantTextMessagePart(
  part: Extract<EnrichedPartState, { type: "text" }>,
) {
  const { t } = useTranslation();
  const hasReasoningOrTool = useAuiState((state) =>
    state.message.parts.some(
      (messagePart) =>
        messagePart.type === "tool-call" ||
        (messagePart.type === "data" &&
          (messagePart.name === "plan" ||
            messagePart.name === "todo" ||
            messagePart.name === "elicitation")) ||
        (messagePart.type === "reasoning" &&
          (is.nonEmptyString(messagePart.text) ||
            messagePart.status.type === "running")),
    ),
  );

  if (part.type === "text" && part.status.type === "running" && !part.text) {
    return hasReasoningOrTool ? null : (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {t("common.thinking")}
      </span>
    );
  }

  return (
    <StreamdownTextPrimitive
      caret="block"
      containerClassName={assistantTextContainerClassName}
      controls={{ code: false }}
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="streaming"
      plugins={{ cjk, code: streamdownCode, math, mermaid }}
      shikiTheme={["vitesse-light", "vitesse-dark"]}
    />
  );
}

function ImageMessagePart(part: Extract<EnrichedPartState, { type: "image" }>) {
  const { t } = useTranslation();

  return (
    <ChatAttachmentTile
      className="my-2 max-w-64"
      name={part.filename ?? "image"}
      previewUrl={part.image}
      typeLabel={t("common.image")}
    />
  );
}

function FileMessagePart(part: Extract<EnrichedPartState, { type: "file" }>) {
  const { t } = useTranslation();
  const isMention = messageFileMention(part);
  if (isMention) return null;
  const isImage = part.mimeType.startsWith("image/");
  const previewText =
    isMention || isImage
      ? undefined
      : textFilePreview(part.data, part.mimeType);

  return (
    <ChatAttachmentTile
      className="my-2 max-w-64"
      contentType={part.mimeType}
      name={part.filename ?? part.mimeType}
      previewText={previewText}
      previewUrl={filePreviewUrl(part.data, part.mimeType, isMention, isImage)}
      typeLabel={fileTypeLabel(isMention, isImage, t)}
    />
  );
}

function filePreviewUrl(
  data: string,
  mimeType: string,
  isMention: boolean,
  isImage: boolean,
) {
  if (isMention || !isImage) return undefined;
  return imageFilePreviewUrl(data, mimeType);
}

function fileTypeLabel(isMention: boolean, isImage: boolean, t: TFunction) {
  if (isMention) return t("common.mention");
  if (isImage) return t("common.image");
  return t("common.file");
}

function imageFilePreviewUrl(data: string, mimeType: string) {
  return data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
}

function textFilePreview(data: string, mimeType: string) {
  if (!isTextLikeMimeType(mimeType)) return undefined;
  const parsed = parseDataUrl(data);
  const encoded = parsed?.data ?? data;
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return decoded.includes("\uFFFD") ? data : decoded;
  } catch {
    return data;
  }
}

function NullMessagePart(): null {
  return null;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-1 p-3">
      <div
        className="
          mb-1 text-[11px] font-medium tracking-wide text-muted-foreground
          uppercase
        "
      >
        {label}
      </div>
      <pre
        className="
          max-h-40 overflow-auto font-mono text-[11px]/4 wrap-break-word
          whitespace-pre-wrap
        "
      >
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function MessageAttachment({ attachment }: { attachment: CompleteAttachment }) {
  const { t } = useTranslation();
  const imagePart = attachment.content.find((part) => part.type === "image");
  const filePart = attachment.content.find((part) => part.type === "file");
  if (
    filePart &&
    (messageFileMention(filePart) || messageSkillMention(filePart))
  ) {
    return null;
  }
  const isMention = filePart ? messageFileMention(filePart) : false;
  const previewUrl = isMention
    ? undefined
    : (imagePart?.image ??
      (filePart?.mimeType.startsWith("image/")
        ? imageFilePreviewUrl(filePart.data, filePart.mimeType)
        : undefined));
  const previewText =
    !is.nonEmptyString(previewUrl) && filePart !== undefined && !isMention
      ? textFilePreview(filePart.data, filePart.mimeType)
      : undefined;

  return (
    <ChatAttachmentTile
      className="max-w-64"
      contentType={attachment.contentType ?? filePart?.mimeType}
      name={attachment.name}
      previewText={previewText}
      previewUrl={previewUrl}
      typeLabel={
        isMention
          ? t("common.mention")
          : attachment.type === "image"
            ? t("common.image")
            : attachment.type === "file"
              ? t("common.file")
              : attachment.type
      }
    />
  );
}

function messageFileMention(part: unknown) {
  return (part as { mention?: unknown }).mention === true;
}

function messageSkillMention(part: unknown) {
  return (part as { skill?: unknown }).skill === true;
}

export {
  AssistantTextMessagePart,
  FileMessagePart,
  ImageMessagePart,
  JsonBlock,
  MessageAttachment,
  NullMessagePart,
  UserTextMessagePart,
};
