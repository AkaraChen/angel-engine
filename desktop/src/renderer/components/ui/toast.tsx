import type { IconProps } from "@phosphor-icons/react";
import {
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  WarningCircle as WarningCircleIcon,
  X as XIcon,
} from "@phosphor-icons/react";
import { Toast as ToastPrimitive } from "radix-ui";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/platform/utils";
import { Button } from "./button";

type ToastVariant = "default" | "success" | "attention" | "destructive";

/**
 * Every toast keeps the same neutral card. Status is carried by the icon
 * alone -- tinting the whole surface makes a routine notification shout as
 * loudly as a failure.
 */
const toastIconClasses: Record<ToastVariant, string> = {
  attention: "text-status-attention",
  default: "text-primary",
  destructive: "text-status-danger",
  success: "text-status-success",
};

const toastIcons: Record<ToastVariant, React.ComponentType<IconProps>> = {
  attention: WarningIcon,
  default: InfoIcon,
  destructive: WarningCircleIcon,
  success: CheckCircleIcon,
};

interface ToastMessage {
  action?: ToastAction;
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastAction {
  label: string;
  onClick: () => void;
}

type ToastInput = Omit<ToastMessage, "id">;

const ToastContext = React.createContext<((toast: ToastInput) => void) | null>(
  null,
);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((input: ToastInput) => {
    setToasts((current) => [
      ...current,
      {
        ...input,
        id: crypto.randomUUID(),
      },
    ]);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  React.useEffect(() => {
    return window.desktopWindow.onUpdateDownloaded((event) => {
      toast({
        action: {
          label: t("notifications.installUpdate"),
          onClick: () => {
            void window.desktopWindow.installUpdate();
          },
        },
        description: t("notifications.updateReadyDescription", {
          version: event.releaseName,
        }),
        title: t("notifications.updateReady"),
      });
    });
  }, [t, toast]);

  return (
    <ToastContext.Provider value={toast}>
      <ToastPrimitive.Provider duration={4500} swipeDirection="right">
        {children}
        {toasts.map((toast) => {
          const variant = toast.variant ?? "default";
          const ToastIcon = toastIcons[variant];

          return (
            <ToastPrimitive.Root
              className="
                relative grid w-full max-w-sm gap-1 overflow-hidden rounded-xl
                border border-border-subtle bg-card p-3 text-card-foreground
                shadow-popover
                data-open:animate-in data-open:fade-in-0
                data-open:slide-in-from-right-4
                data-closed:animate-out data-closed:fade-out-0
                data-closed:slide-out-to-right-4
                motion-reduce:animate-none
              "
              key={toast.id}
              onOpenChange={(open) => {
                if (!open) dismiss(toast.id);
              }}
            >
              <div className="flex items-start gap-3">
                <ToastIcon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    toastIconClasses[variant],
                  )}
                  weight="regular"
                />
                <div className="min-w-0 flex-1">
                  <ToastPrimitive.Title className="text-sm font-medium">
                    {toast.title}
                  </ToastPrimitive.Title>
                  {toast.description ? (
                    <ToastPrimitive.Description
                      className="
                    mt-1 text-xs text-muted-foreground
                  "
                    >
                      {toast.description}
                    </ToastPrimitive.Description>
                  ) : null}
                  {toast.action ? (
                    <div className="mt-3">
                      <Button
                        onClick={() => {
                          toast.action?.onClick();
                          dismiss(toast.id);
                        }}
                        size="sm"
                      >
                        {toast.action.label}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <ToastPrimitive.Close
                  className="
                  inline-flex size-6 shrink-0 items-center justify-center
                  rounded-md text-muted-foreground outline-none
                  hover:bg-overlay-hover hover:text-foreground
                  focus-visible:ring-2 focus-visible:ring-ring
                  focus-visible:ring-offset-2 focus-visible:ring-offset-card
                "
                >
                  <XIcon className="size-3.5" />
                  <span className="sr-only">{t("common.close")}</span>
                </ToastPrimitive.Close>
              </div>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport
          className="
            fixed right-4 bottom-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm
            flex-col gap-2 outline-none
          "
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function useToast() {
  const toast = React.useContext(ToastContext);
  if (!toast) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return toast;
}

export { ToastProvider, useToast };
