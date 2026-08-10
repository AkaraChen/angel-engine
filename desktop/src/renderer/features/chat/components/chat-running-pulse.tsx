import type { ReactElement } from "react";

import {
  CheckCircle,
  CircleNotch,
  WarningCircle,
  WarningOctagon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

import { useChatRunIsRunning } from "@/features/chat/state/chat-run-store";
import { cn } from "@/platform/utils";

export type ChatStatusCueKind =
  | "completed"
  | "failed"
  | "needsInput"
  | "running";

interface ChatRunningPulseProps {
  chatId: string;
}

/**
 * Compact activity cue: shape/icon plus readable text. Color is a redundant
 * channel only — never the sole signal (grayscale / low vision).
 */
export function ChatStatusCue({
  kind,
  className,
}: {
  className?: string;
  kind: ChatStatusCueKind;
}): ReactElement {
  const { t } = useTranslation();
  const label =
    kind === "running"
      ? t("common.running")
      : kind === "needsInput"
        ? t("sidebar.needsInput")
        : kind === "completed"
          ? t("sidebar.completed")
          : t("common.failed");

  const Icon =
    kind === "running"
      ? CircleNotch
      : kind === "needsInput"
        ? WarningCircle
        : kind === "completed"
          ? CheckCircle
          : WarningOctagon;

  const toneClassName =
    kind === "running"
      ? "text-primary"
      : kind === "needsInput"
        ? "text-status-attention"
        : kind === "completed"
          ? "text-status-success"
          : "text-status-danger";

  return (
    <span
      className={cn(
        "inline-flex max-w-24 shrink-0 items-center gap-0.5 text-[10px] font-medium",
        toneClassName,
        className,
      )}
      title={label}
    >
      {kind === "running" ? (
        <i
          aria-hidden
          className="
            inline-flex size-1.5 shrink-0 animate-chat-pulse rounded-full
            bg-current
            motion-reduce:animate-none
          "
        />
      ) : (
        <Icon aria-hidden className="size-3 shrink-0" weight="fill" />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function ChatRunningPulse({
  chatId,
}: ChatRunningPulseProps): ReactElement | null {
  const isRunning = useChatRunIsRunning(chatId);
  if (!isRunning) return null;

  return <ChatStatusCue kind="running" />;
}
