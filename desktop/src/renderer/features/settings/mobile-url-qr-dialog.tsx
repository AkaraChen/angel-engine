import { QrCode as QrCodeIcon } from "@phosphor-icons/react";
import QRCode from "react-qr-code";
import { useTranslation } from "react-i18next";

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
            <QrCodeIcon className="size-4" weight="duotone" />
          </span>
          <DialogTitle>{t("settings.mobile.qrDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings.mobile.qrDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl bg-white p-4 ring-1 ring-border-subtle">
            <QRCode
              bgColor="#ffffff"
              fgColor="#1a1a1a"
              level="M"
              size={184}
              title={url}
              value={url}
            />
          </div>
          <span
            className="
              text-center text-xs wrap-break-word text-muted-foreground
            "
          >
            {url}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
