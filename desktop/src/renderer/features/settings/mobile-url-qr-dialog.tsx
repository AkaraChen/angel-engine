import { Check, Copy, DeviceMobile } from "@phosphor-icons/react";
import { useState } from "react";
import QRCode from "react-qr-code";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * QR codes are scanned by a camera, not read by a person, so the symbol keeps
 * a fixed dark-on-white plate in both themes rather than following the theme
 * tokens. The surrounding dialog is themed as usual.
 */
export function MobileUrlQrDialog({
  onOpenChange,
  open,
  url,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  url: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(setCopied, 1500, false);
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-5 rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <span
            aria-hidden="true"
            className="
              mb-1 flex size-8 items-center justify-center rounded-lg border
              border-border-subtle bg-surface-1
            "
          >
            <DeviceMobile className="size-4" weight="regular" />
          </span>
          <DialogTitle>{t("settings.mobile.qrDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings.mobile.qrDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div
            className="
              rounded-xl border border-border-subtle bg-white p-6 shadow-xs
            "
          >
            <QRCode
              bgColor="#ffffff"
              fgColor="#1a1a1a"
              level="M"
              size={184}
              title={url}
              value={url}
            />
          </div>
          <Button
            className="
              h-auto max-w-full gap-1.5 px-2.5 py-1.5 font-mono text-xs
              font-normal whitespace-normal text-muted-foreground
              hover:text-foreground
            "
            onClick={copyUrl}
            title={t("settings.mobile.copy")}
            type="button"
            variant="ghost"
          >
            {copied ? <Check /> : <Copy />}
            <span className="min-w-0 wrap-break-word">{url}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
