import type { IconProps } from "@phosphor-icons/react";
import type { ChatActivityStatus } from "@/platform/chat-types";
import type { ComponentType, FC } from "react";

import {
  CheckCircle,
  CircleNotch,
  WarningCircle,
  WarningOctagon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

const STATUS_LABEL_KEYS = {
  waiting_for_you: "activity.status.waitingForYou",
  failed: "activity.status.failed",
  stuck: "activity.status.stuck",
  running: "activity.status.running",
  done: "activity.status.done",
} as const satisfies Record<ChatActivityStatus, string>;

/** Status is never colour-only: the text carries it and the tone is redundant. */
const STATUS_TONE: Record<ChatActivityStatus, string> = {
  waiting_for_you: "text-status-attention",
  failed: "text-status-danger",
  stuck: "text-status-danger",
  running: "text-foreground",
  done: "text-status-success",
};

const STATUS_ICON: Record<
  ChatActivityStatus,
  ComponentType<Pick<IconProps, "size" | "weight">>
> = {
  waiting_for_you: WarningCircle,
  failed: WarningOctagon,
  stuck: WarningOctagon,
  running: CircleNotch,
  done: CheckCircle,
};

type ChatActivityBadgeProps = {
  status: ChatActivityStatus;
};

export const ChatActivityBadge: FC<ChatActivityBadgeProps> = ({ status }) => {
  const { t } = useTranslation();
  const label = t(STATUS_LABEL_KEYS[status]);
  const Icon = STATUS_ICON[status];
  return (
    <span
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${STATUS_TONE[status]}`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </span>
  );
};
