import { FileText, ImageIcon, X } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/platform/utils";

type ChatAttachmentTileProps = {
  className?: string;
  contentType?: string;
  name: string;
  onRemove?: () => void;
  previewText?: string;
  previewUrl?: string;
  removeLabel?: string;
  typeLabel: string;
};

export function ChatAttachmentTile({
  className,
  contentType,
  name,
  onRemove,
  previewText,
  previewUrl,
  removeLabel,
  typeLabel,
}: ChatAttachmentTileProps) {
  const body = (
    <AttachmentTileBody
      contentType={contentType}
      name={name}
      previewUrl={previewUrl}
      typeLabel={typeLabel}
    />
  );

  return (
    <div className={cn("relative inline-flex max-w-full", className)}>
      {previewUrl || previewText !== undefined ? (
        <Dialog>
          <DialogTrigger asChild>
            <button
              aria-label={`Open ${name}`}
              className={attachmentTileClassName({
                interactive: true,
                removable: Boolean(onRemove),
              })}
              type="button"
            >
              {body}
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[88dvh] max-w-[min(56rem,calc(100vw-2rem))] gap-3 rounded-md p-3">
            <DialogTitle className="truncate pr-10 text-sm">{name}</DialogTitle>
            {previewUrl ? (
              <div className="flex min-h-0 items-center justify-center overflow-auto rounded-sm bg-muted/30">
                <img
                  alt={name}
                  className="max-h-[76dvh] max-w-full object-contain"
                  src={previewUrl}
                />
              </div>
            ) : (
              <pre className="max-h-[76dvh] overflow-auto whitespace-pre-wrap break-words rounded-sm bg-muted/30 p-3 font-mono text-xs leading-5">
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
          aria-label={removeLabel ?? `Remove ${name}`}
          className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
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
  name,
  previewUrl,
  typeLabel,
}: {
  contentType?: string;
  name: string;
  previewUrl?: string;
  typeLabel: string;
}) {
  return (
    <>
      <AttachmentThumb name={name} previewUrl={previewUrl} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span className="truncate text-[11px] leading-4 text-muted-foreground">
          {contentType ?? typeLabel}
        </span>
      </span>
    </>
  );
}

function AttachmentThumb({
  name,
  previewUrl,
}: {
  name: string;
  previewUrl?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-muted/50">
      {previewUrl && !imageFailed ? (
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
          src={previewUrl}
        />
      ) : previewUrl ? (
        <ImageIcon aria-label={name} className="size-4 text-muted-foreground" />
      ) : (
        <FileText aria-label={name} className="size-4 text-muted-foreground" />
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
    "inline-flex min-w-0 max-w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs shadow-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
    removable && "pr-7",
    interactive && "cursor-pointer hover:bg-muted/60",
  );
}
