import { X as XIcon } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/platform/utils";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        `
          fixed inset-0 isolate z-50 bg-ink-950/40 duration-100
          supports-backdrop-filter:backdrop-blur-[2px]
          data-open:animate-in data-open:fade-in-0
          data-closed:animate-out data-closed:fade-out-0
        `,
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          `
            fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)]
            -translate-1/2 gap-6 rounded-xl bg-card p-6 text-sm
            text-card-foreground shadow-overlay ring-1 ring-border-subtle
            duration-200 ease-standard outline-none
            sm:max-w-md
            data-open:animate-in data-open:fade-in-0
            data-open:slide-in-from-top-1
            data-closed:animate-out data-closed:fade-out-0
            data-closed:slide-out-to-top-1 data-closed:duration-120
            motion-reduce:transition-none motion-reduce:animate-none
          `,
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-4 right-4 text-muted-foreground"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">{t("common.close")}</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/**
 * `icon` renders a Phosphor glyph in the dialog's top-left corner, aligned to
 * the title's cap height rather than the header box, so a two-line description
 * does not drag it off the baseline.
 */
function DialogHeader({
  className,
  children,
  icon,
  ...props
}: React.ComponentProps<"div"> & { icon?: React.ReactNode }) {
  if (is.falsy(icon)) {
    return (
      <div
        data-slot="dialog-header"
        className={cn("flex flex-col gap-1.5", className)}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      data-slot="dialog-header"
      className={cn("flex items-start gap-3", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        data-slot="dialog-header-icon"
        className="
          flex h-4 shrink-0 items-center text-muted-foreground
          [&_svg:not([class*='size-'])]:size-4
        "
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </div>
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        `
          flex flex-col-reverse gap-2
          sm:flex-row sm:justify-end
        `,
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{t("common.close")}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-display text-base leading-none font-semibold tracking-[-0.015em]",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        `
          text-sm text-muted-foreground
          *:[a]:underline *:[a]:underline-offset-3
          *:[a]:hover:text-foreground
        `,
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
