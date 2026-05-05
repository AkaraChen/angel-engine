import * as React from "react";
import { Toast as ToastPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastVariant = "default" | "destructive";

type ToastMessage = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type ToastInput = Omit<ToastMessage, "id">;

const ToastContext = React.createContext<((toast: ToastInput) => void) | null>(
  null,
);

function ToastProvider({ children }: { children: React.ReactNode }) {
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

  return (
    <ToastContext.Provider value={toast}>
      <ToastPrimitive.Provider duration={4500} swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            className={cn(
              "grid w-full max-w-sm gap-1 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right-4 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right-4",
              toast.variant === "destructive" &&
                "border-destructive/40 text-destructive",
            )}
            key={toast.id}
            onOpenChange={(open) => {
              if (!open) dismiss(toast.id);
            }}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-sm font-medium">
                  {toast.title}
                </ToastPrimitive.Title>
                {toast.description ? (
                  <ToastPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                    {toast.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <XIcon className="size-3.5" />
                <span className="sr-only">Close</span>
              </ToastPrimitive.Close>
            </div>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none" />
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
