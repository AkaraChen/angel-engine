import type { ReactNode } from "react";
import { FileText, Image as ImageIcon, X } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/platform/utils";

interface ChatAttachmentTileProps {
  className?: string;
  contentType?: string;
  fallbackIcon?: ReactNode;
  name: string;
  onRemove?: () => void;
  previewText?: string;
  previewUrl?: string;
  removeLabel?: string;
  typeLabel: string;
}

export function ChatAttachmentTile({
  className,
  contentType,
  fallbackIcon,
  name,
  onRemove,
  previewText,
  previewUrl,
  removeLabel,
  typeLabel,
}: ChatAttachmentTileProps) {
  const { t } = useTranslation();
  const hasPreviewUrl = is.nonEmptyString(previewUrl);
  const hasPreview = hasPreviewUrl || previewText !== undefined;
  const body = (
    <AttachmentTileBody
      contentType={contentType}
      fallbackIcon={fallbackIcon}
      name={name}
      previewUrl={previewUrl}
      typeLabel={typeLabel}
    />
  );

  return (
    <div className={cn("relative inline-flex max-w-full", className)}>
      {hasPreview ? (
        <Dialog>
          <DialogTrigger asChild>
            <button
              aria-label={t("attachment.open", {
                defaultValue: "Open {{name}}",
                name,
              })}
              className={attachmentTileClassName({
                interactive: true,
                removable: Boolean(onRemove),
              })}
              type="button"
            >
              {body}
            </button>
          </DialogTrigger>
          <DialogContent
            className="
              max-h-[88dvh] max-w-[min(56rem,calc(100vw-2rem))] gap-3 rounded-lg
              p-3
            "
          >
            <DialogTitle className="truncate pr-10 text-sm">{name}</DialogTitle>
            {hasPreviewUrl ? (
              <div
                className="
                  flex min-h-0 items-center justify-center overflow-auto
                  rounded-md bg-muted/30
                "
              >
                <img
                  alt={name}
                  className="max-h-[76dvh] max-w-full object-contain"
                  src={previewUrl}
                />
              </div>
            ) : (
              <pre
                className="
                  max-h-[76dvh] overflow-auto rounded-md bg-muted/30 p-3
                  font-mono text-xs/5 wrap-break-word whitespace-pre-wrap
                "
              >
                {previewText}
              </pre>
            )}
          </DialogContent>
        </Dialog>
      ) : (
        <div
          className={attachmentTileClassName({
            interactive: false,
            removable: Boolean(onRemove),
          })}
        >
          {body}
        </div>
      )}

      {onRemove ? (
        <button
          aria-label={
            removeLabel ??
            t("composer.removeAttachment", {
              name,
            })
          }
          className="
            absolute -top-1 -right-1 inline-flex size-5 items-center
            justify-center rounded-full border bg-background
            text-muted-foreground shadow-sm
            hover:bg-overlay-hover hover:text-foreground
            active:bg-overlay-active
          "
          onClick={onRemove}
          type="button"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

function AttachmentTileBody({
  contentType,
  fallbackIcon,
  name,
  previewUrl,
  typeLabel,
}: {
  contentType?: string;
  fallbackIcon?: ReactNode;
  name: string;
  previewUrl?: string;
  typeLabel: string;
}) {
  return (
    <>
      <AttachmentThumb
        fallbackIcon={fallbackIcon}
        name={name}
        previewUrl={previewUrl}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span className="truncate text-[11px]/4 text-muted-foreground">
          {contentType ?? typeLabel}
        </span>
      </span>
    </>
  );
}

function AttachmentThumb({
  fallbackIcon,
  name,
  previewUrl,
}: {
  fallbackIcon?: ReactNode;
  name: string;
  previewUrl?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasPreviewUrl = is.nonEmptyString(previewUrl);

  return (
    <span
      className="
        flex size-10 shrink-0 items-center justify-center overflow-hidden
        rounded-md bg-surface-1
      "
    >
      {hasPreviewUrl && !imageFailed ? (
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
          src={previewUrl}
        />
      ) : hasPreviewUrl ? (
        <ImageIcon aria-label={name} className="size-4 text-muted-foreground" />
      ) : (
        (fallbackIcon ?? (
          <FileText
            aria-label={name}
            className="size-4 text-muted-foreground"
          />
        ))
      )}
    </span>
  );
}

function attachmentTileClassName({
  interactive,
  removable,
}: {
  interactive: boolean;
  removable: boolean;
}) {
  return cn(
    `
      inline-flex w-full min-w-0 items-center gap-2 rounded-lg border
      border-border-subtle bg-background/70 px-2 py-1.5 text-left text-xs
      shadow-panel backdrop-blur-xl transition-colors
    `,
    `focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:outline-none`,
    removable && "pr-7",
    interactive &&
      `
        hover:bg-overlay-hover
        active:bg-overlay-active
      `,
  );
}
