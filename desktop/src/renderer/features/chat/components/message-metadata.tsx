import type { ThreadMessageLike } from "@assistant-ui/react";

import { useTranslation } from "react-i18next";

/**
 * Quiet per-message time + explicit role for assistive technology.
 * Does not invent timestamps when the source message has none.
 */
export function MessageMetadata({
  createdAt,
  role,
  agentLabel,
}: {
  agentLabel?: string;
  createdAt?: Date | number | string | null;
  role: ThreadMessageLike["role"] | "user" | "assistant" | "system";
}) {
  const { t, i18n } = useTranslation();
  const roleLabel =
    role === "user"
      ? t("thread.roleUser", { defaultValue: "You" })
      : role === "assistant"
        ? (agentLabel ??
          t("thread.roleAssistant", { defaultValue: "Assistant" }))
        : t("thread.roleSystem", { defaultValue: "System" });

  let timeLabel: string | null = null;
  let fullTimeLabel: string | null = null;
  let dateTime: string | undefined;
  if (createdAt != null && createdAt !== "") {
    const date =
      createdAt instanceof Date
        ? createdAt
        : typeof createdAt === "number"
          ? new Date(createdAt)
          : new Date(createdAt);
    if (!Number.isNaN(date.getTime())) {
      dateTime = date.toISOString();
      timeLabel = new Intl.DateTimeFormat(i18n.language, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
      fullTimeLabel = new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    }
  }

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="sr-only">{roleLabel}</span>
      {timeLabel && dateTime ? (
        <time dateTime={dateTime} title={fullTimeLabel ?? undefined}>
          {timeLabel}
        </time>
      ) : null}
    </div>
  );
}
