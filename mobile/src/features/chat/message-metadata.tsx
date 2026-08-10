import type { ConversationMessage } from "@/platform/chat-types";

import { useTranslation } from "react-i18next";

/**
 * Quiet message metadata: localized time for sighted users + explicit role for
 * assistive technology. Omits the time entirely when createdAt is missing —
 * never fabricates a timestamp.
 */
export function MessageMetadata({
  message,
  agentLabel,
}: {
  agentLabel?: string;
  message: ConversationMessage;
}) {
  const { t, i18n } = useTranslation();
  const roleLabel =
    message.role === "user"
      ? t("chat.roleUser")
      : (agentLabel ?? t("chat.roleAssistant"));

  let timeLabel: string | null = null;
  let fullTimeLabel: string | null = null;
  if (message.createdAt) {
    const date = new Date(message.createdAt);
    if (!Number.isNaN(date.getTime())) {
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
    <div
      className="
        flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground
      "
    >
      <span className="sr-only">{roleLabel}</span>
      {timeLabel && message.createdAt ? (
        <time dateTime={message.createdAt} title={fullTimeLabel ?? undefined}>
          {timeLabel}
        </time>
      ) : null}
    </div>
  );
}
