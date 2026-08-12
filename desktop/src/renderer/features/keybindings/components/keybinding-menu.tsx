import type { FC, ReactNode } from "react";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type KeybindingMenuProps = {
  ariaLabel: string;
  canRemove: boolean;
  children: ReactNode;
  conflictTitle?: string;
  modified: boolean;
  onJumpToConflict?: () => void;
  onModify: (trigger: HTMLButtonElement) => void;
  onRemove: () => void;
  onReset: () => void;
};

export const KeybindingMenu: FC<KeybindingMenuProps> = ({
  ariaLabel,
  canRemove,
  children,
  conflictTitle,
  modified,
  onJumpToConflict,
  onModify,
  onRemove,
  onReset,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const cancelClose = () => window.clearTimeout(closeTimerRef.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      const focused = document.activeElement;
      if (
        focused === triggerRef.current ||
        (focused instanceof HTMLElement && focused.closest('[role="menu"]'))
      ) {
        return;
      }
      setOpen(false);
    }, 100);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={ariaLabel}
          className="rounded-lg outline-hidden focus-visible:ring-3 focus-visible:ring-primary/25"
          onFocus={(event) => {
            if (event.currentTarget.dataset.suppressMenuFocusOpen) {
              delete event.currentTarget.dataset.suppressMenuFocusOpen;
              return;
            }
            setOpen(true);
          }}
          onMouseEnter={() => {
            cancelClose();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          ref={triggerRef}
          type="button"
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60"
        collisionPadding={12}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        side="bottom"
        sideOffset={6}
      >
        {conflictTitle ? (
          <>
            <div className="rounded-md bg-status-danger-soft px-2.5 py-2 text-xs text-status-danger">
              <p className="font-medium">
                {t("settings.keyboard.conflictWith", {
                  command: conflictTitle,
                })}
              </p>
              <button
                className="mt-1 underline underline-offset-2"
                onClick={onJumpToConflict}
                type="button"
              >
                {t("settings.keyboard.jumpToConflict")}
              </button>
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            if (triggerRef.current) onModify(triggerRef.current);
          }}
        >
          {t("settings.keyboard.modifyShortcut")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!modified} onSelect={onReset}>
          {t("settings.keyboard.resetCommand")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canRemove}
          onSelect={onRemove}
          variant="destructive"
        >
          {t("settings.keyboard.remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
