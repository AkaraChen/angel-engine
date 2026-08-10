import type { DesktopNotificationItem } from "@shared/notification-preferences";

import {
  Bell,
  CheckCircle,
  Trash as TrashIcon,
  WarningCircle,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { chatNotificationRoutePath } from "@/app/workspace/workspace-route-paths";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  clearNotificationHistory,
  markNotificationHistoryRead,
  startNotificationCenterStore,
  useNotificationHistoryItems,
  useNotificationUnreadCount,
} from "@/features/notifications/notification-center-store";
import { formatRelativeTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";

export function NotificationCenter() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const items = useNotificationHistoryItems();
  const unreadCount = useNotificationUnreadCount();

  useEffect(() => startNotificationCenterStore(), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("notifications.centerTitle")}
          className="relative size-8 shrink-0"
          data-electron-no-drag
          size="icon"
          type="button"
          variant="ghost"
        >
          <Bell className="size-4" weight="duotone" />
          {unreadCount > 0 ? (
            <span
              aria-label={t("notifications.centerUnread", {
                count: unreadCount,
              })}
              className="
                absolute top-1 right-1 flex size-3.5 items-center justify-center
                rounded-full bg-primary text-[9px] font-semibold text-primary-foreground
              "
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 p-0"
        data-electron-no-drag
        sideOffset={8}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <DropdownMenuLabel className="p-0 font-medium">
            {t("notifications.centerTitle")}
          </DropdownMenuLabel>
          {items.length > 0 ? (
            <Button
              className="h-7 px-2 text-xs"
              onClick={() => {
                void clearNotificationHistory();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <TrashIcon className="size-3.5" />
              {t("notifications.centerClear")}
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {items.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {t("notifications.centerEmpty")}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {items.map((item) => (
              <NotificationHistoryRow
                item={item}
                key={item.id}
                onOpen={() => {
                  void markNotificationHistoryRead([item.id]);
                  navigate(
                    chatNotificationRoutePath({
                      chatId: item.chatId,
                      projectId: item.projectId,
                    }),
                  );
                }}
              />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationHistoryRow({
  item,
  onOpen,
}: {
  item: DesktopNotificationItem;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const KindIcon =
    item.kind === "failed"
      ? WarningCircle
      : item.kind === "needsInput"
        ? Bell
        : CheckCircle;
  const toneClassName =
    item.kind === "failed"
      ? "text-status-danger"
      : item.kind === "needsInput"
        ? "text-status-attention"
        : "text-status-success";

  return (
    <DropdownMenuItem
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-none px-3 py-2.5",
        !item.read && "bg-primary/5",
      )}
      onSelect={(event) => {
        event.preventDefault();
        onOpen();
      }}
    >
      <KindIcon
        aria-hidden="true"
        className={cn("mt-0.5 size-4 shrink-0", toneClassName)}
        weight="fill"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-medium">{item.title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatRelativeTime(item.createdAt)}
          </span>
        </span>
        {is.nonEmptyString(item.body) ? (
          <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </span>
        ) : null}
        <span className="sr-only">{t("notifications.centerOpenChat")}</span>
      </span>
    </DropdownMenuItem>
  );
}
