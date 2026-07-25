import type { ChatAttention } from "@/platform/chat-types";
import type { FC } from "react";

import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

type ChatRunAttentionBadgeProps = {
  status: ChatAttention["status"];
};

export const ChatRunAttentionBadge: FC<ChatRunAttentionBadgeProps> = ({
  status,
}) => {
  const { t } = useTranslation();
  const needsInput = status === "needsInput";
  const label = t(
    needsInput ? "chat.attentionNeedsInput" : "chat.attentionCompleted",
  );
  const Icon = needsInput ? WarningCircle : CheckCircle;
  return (
    <span
      aria-label={label}
      className={
        needsInput
          ? "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"
          : "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
      }
    >
      <Icon size={14} weight="fill" />
      <span>{label}</span>
    </span>
  );
};
