import type {
  ChatElicitation,
  ChatElicitationResponse,
} from "@angel-engine/daemon-api/chat";

import is from "@sindresorhus/is";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useChatRuntimeActions } from "@/features/chat/runtime/use-chat-runtime-actions";
import { cn } from "@/platform/utils";

type ElicitationQuestion = NonNullable<ChatElicitation["questions"]>[number];

const ALLOW_PERMISSION_RESPONSE: ChatElicitationResponse = { type: "allow" };
const ALLOW_SESSION_PERMISSION_RESPONSE: ChatElicitationResponse = {
  type: "allowForSession",
};

interface ElicitationFreeformAnswerProps {
  disabled: boolean;
  onChange: (value: string) => void;
  question: ElicitationQuestion;
  value?: string;
}

function PermissionApprovalActions({
  allowBypass = true,
  className,
  disabled,
  onResume,
}: {
  allowBypass?: boolean;
  className?: string;
  disabled: boolean;
  onResume: (response: ChatElicitationResponse) => void;
}) {
  const { t } = useTranslation();
  const { enablePermissionBypass, permissionBypassEnabled } =
    useChatRuntimeActions();
  const bypassPermission = () => {
    if (disabled) return;
    enablePermissionBypass(ALLOW_PERMISSION_RESPONSE);
    onResume(ALLOW_PERMISSION_RESPONSE);
  };

  return (
    <div className={cn("flex flex-wrap justify-end gap-2", className)}>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "deny" })}
        size="xs"
        type="button"
        variant="ghost"
      >
        {t("common.deny")}
      </Button>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "cancel" })}
        size="xs"
        type="button"
        variant="ghost"
      >
        {t("common.cancel")}
      </Button>
      <Button
        disabled={disabled}
        onClick={() => {
          enablePermissionBypass(ALLOW_SESSION_PERMISSION_RESPONSE);
          onResume(ALLOW_SESSION_PERMISSION_RESPONSE);
        }}
        size="xs"
        type="button"
        variant="outline"
      >
        {t("common.allowSession")}
      </Button>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "allow" })}
        size="xs"
        type="button"
      >
        {t("common.allow")}
      </Button>
      {allowBypass ? (
        <Button
          disabled={disabled || permissionBypassEnabled}
          onClick={bypassPermission}
          size="xs"
          type="button"
          variant="destructive"
        >
          {t("common.bypassPermission")}
        </Button>
      ) : null}
    </div>
  );
}

function ElicitationQuestionInput({
  disabled,
  onChange,
  question,
  value,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  question: ElicitationQuestion;
  value?: string;
}) {
  const { t } = useTranslation();
  const options = question.options ?? [];
  const [selection, setSelection] = useState<
    { label: string; type: "option" } | { type: "other" } | undefined
  >(() =>
    value !== undefined && options.some((option) => option.label === value)
      ? { label: value, type: "option" }
      : undefined,
  );
  const selectedOptionLabel =
    selection?.type === "option" ? selection.label : value;
  const selectedOther = selection?.type === "other";
  const hasOptions = options.length > 0;
  const showFreeformAnswer = !hasOptions || selectedOther;

  return (
    <div className="space-y-2">
      <div>
        {is.nonEmptyString(question.header) ? (
          <div
            className={cn(
              "text-[11px] font-medium text-muted-foreground uppercase",
            )}
          >
            {question.header}
          </div>
        ) : null}
        {is.nonEmptyString(question.question) ? (
          <div className="text-sm/5">{question.question}</div>
        ) : null}
      </div>

      {hasOptions ? (
        <div className="flex flex-col gap-1.5">
          {options.map((option) => (
            <button
              aria-pressed={selectedOptionLabel === option.label}
              className={cn(
                `
                  w-full rounded-md border border-border-subtle bg-background/75
                  px-3 py-2 text-left text-sm/5 transition-colors
                  hover:bg-overlay-hover
                  active:bg-overlay-active
                `,
                selectedOptionLabel === option.label &&
                  `border-primary/35 bg-primary-soft`,
              )}
              disabled={disabled}
              key={option.label}
              onClick={() => {
                setSelection({ label: option.label, type: "option" });
                onChange(option.label);
              }}
              type="button"
            >
              <span>{option.label}</span>
              {is.nonEmptyString(option.description) ? (
                <span className="mt-0.5 block text-xs/4 text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </button>
          ))}
          {question.isOther ? (
            <button
              aria-pressed={selectedOther}
              className={cn(
                `
                  w-full rounded-md border border-border-subtle bg-background/75
                  px-3 py-2 text-left text-sm/5 transition-colors
                  hover:bg-overlay-hover
                  active:bg-overlay-active
                `,
                selectedOther && `border-primary/35 bg-primary-soft`,
              )}
              disabled={disabled}
              onClick={() => {
                setSelection({ type: "other" });
                onChange("");
              }}
              type="button"
            >
              {t("common.other")}
            </button>
          ) : null}
        </div>
      ) : null}

      {showFreeformAnswer ? (
        <ElicitationFreeformAnswer
          disabled={disabled}
          onChange={onChange}
          question={question}
          value={value}
        />
      ) : null}
    </div>
  );
}

function ElicitationFreeformAnswer({
  disabled,
  onChange,
  question,
  value,
}: ElicitationFreeformAnswerProps) {
  if (question.isSecret) {
    return (
      <input
        className="
          h-8 w-full rounded-md border border-border-subtle bg-background/80
          px-3 text-sm outline-none
          focus-visible:border-primary/40 focus-visible:ring-3
          focus-visible:ring-primary/12
        "
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        value={value}
      />
    );
  }

  return (
    <textarea
      className="
        min-h-16 w-full resize-y rounded-md border border-border-subtle
        bg-background/80 px-3 py-2 text-sm outline-none
        focus-visible:border-primary/40 focus-visible:ring-3
        focus-visible:ring-primary/12
      "
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
}

export { ElicitationQuestionInput, PermissionApprovalActions };
