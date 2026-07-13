import type { AgentValueOption } from "@angel-engine/daemon-api/agents";
import type { ReactNode } from "react";
import { Paperclip } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

/* eslint-disable react-refresh/only-export-components -- Stable class-name constants are re-exported to preserve this module's public imports. */
export {
  composerModelMenuTriggerClassName,
  composerModelMenuValueClassName,
  composerNativeMenuClassName,
  composerNativeMenuLabelClassName,
} from "./composer-model-menu-primitives";
/* eslint-enable react-refresh/only-export-components */
export { ComposerModelMenu } from "./composer-model-menus";

export function PromptAttachmentButton() {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();

  return (
    <Button
      className="focus-visible:ring-0!"
      onClick={attachments.openFileDialog}
      size="icon-sm"
      title={t("composer.attachFiles")}
      type="button"
      variant="ghost"
    >
      <Paperclip />
      <span className="sr-only">{t("composer.attachFiles")}</span>
    </Button>
  );
}

export function ComposerOptionSelect({
  className,
  disabled,
  icon,
  label,
  onValueChange,
  options,
  title,
  value,
}: {
  className?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  options: AgentValueOption[];
  title?: string;
  value: string;
}) {
  return (
    <div
      className={["relative w-fit max-w-36", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className="
          pointer-events-none absolute top-1/2 left-2 z-10 flex size-4
          -translate-y-1/2 items-center justify-center
          [&_svg]:size-3.5
        "
      >
        {icon}
      </span>
      <NativeSelect
        aria-label={label}
        className="max-w-36"
        disabled={disabled}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        selectClassName="h-8 max-w-36 rounded-md border border-border-subtle bg-background/55 py-0 pr-8 pl-8 text-xs focus-visible:!border-primary/35 focus-visible:!ring-0 dark:bg-card/60"
        size="sm"
        title={title ?? label}
        value={value}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
