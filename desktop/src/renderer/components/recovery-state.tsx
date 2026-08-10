import type { ReactElement, ReactNode } from "react";

import {
  WarningCircle as AlertCircle,
  CloudSlash,
  Info,
  SpinnerGap,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";

import { Button } from "@/components/ui/button";
import { cn } from "@/platform/utils";

/**
 * Shared recoverable feedback shell for pending / attention / error / offline.
 * Consumers supply surface-specific copy and actions; this only owns layout,
 * tone, and accessibility roles.
 */
export type RecoveryVariant = "pending" | "attention" | "error" | "offline";

export interface RecoveryAction {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  primary?: boolean;
  testId?: string;
}

export interface RecoveryStateProps {
  actions?: RecoveryAction[];
  className?: string;
  description?: string;
  detail?: string;
  /**
   * When true, uses a compact inline banner layout (e.g. stale fleet strip)
   * instead of a full-surface centered card.
   */
  inline?: boolean;
  title: string;
  variant: RecoveryVariant;
}

const VARIANT_TONE: Record<
  RecoveryVariant,
  {
    border: string;
    icon: typeof AlertCircle;
    iconClass: string;
    role: "alert" | "status";
    soft: string;
  }
> = {
  attention: {
    border: "border-status-attention-border",
    icon: Info,
    iconClass: "text-status-attention",
    role: "status",
    soft: "bg-status-attention-soft",
  },
  error: {
    border: "border-status-danger-border",
    icon: AlertCircle,
    iconClass: "text-status-danger",
    role: "alert",
    soft: "bg-status-danger-soft",
  },
  offline: {
    border: "border-status-attention-border",
    icon: CloudSlash,
    iconClass: "text-status-attention",
    role: "status",
    soft: "bg-status-attention-soft",
  },
  pending: {
    border: "border-border-subtle",
    icon: Info,
    iconClass: "text-muted-foreground",
    role: "status",
    soft: "bg-surface-1",
  },
};

export function RecoveryState({
  actions = [],
  className,
  description,
  detail,
  inline = false,
  title,
  variant,
}: RecoveryStateProps): ReactElement {
  const tone = VARIANT_TONE[variant];
  const Icon = tone.icon;

  if (inline) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xs",
          tone.border,
          tone.soft,
          className,
        )}
        role={tone.role}
      >
        <RecoveryIcon pending={variant === "pending"} tone={tone}>
          <Icon className={cn("size-4 shrink-0", tone.iconClass)} />
        </RecoveryIcon>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">{title}</div>
          {is.nonEmptyString(description) ? (
            <div className="mt-0.5 text-[13px]/5 text-muted-foreground">
              {description}
            </div>
          ) : null}
          {is.nonEmptyString(detail) ? (
            <div className="mt-1 text-xs break-all text-muted-foreground">
              {detail}
            </div>
          ) : null}
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action) => (
              <RecoveryActionButton action={action} key={action.label} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 p-6 text-center",
        className,
      )}
      role={tone.role}
    >
      <div
        className={cn(
          "w-full max-w-md rounded-xl border px-5 py-5 text-left shadow-xs",
          tone.border,
          tone.soft,
        )}
      >
        <div className="flex items-start gap-3 text-sm">
          <RecoveryIcon pending={variant === "pending"} tone={tone}>
            <Icon className={cn("mt-0.5 size-4 shrink-0", tone.iconClass)} />
          </RecoveryIcon>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground">{title}</div>
            {is.nonEmptyString(description) ? (
              <div className="mt-1 text-[13px]/5 text-muted-foreground">
                {description}
              </div>
            ) : null}
            {is.nonEmptyString(detail) ? (
              <div className="mt-1 text-xs break-all text-muted-foreground">
                {detail}
              </div>
            ) : null}
            {actions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {actions.map((action) => (
                  <RecoveryActionButton action={action} key={action.label} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecoveryIcon({
  children,
  pending,
  tone,
}: {
  children: ReactNode;
  pending: boolean;
  tone: (typeof VARIANT_TONE)[RecoveryVariant];
}): ReactElement {
  if (pending) {
    return (
      <SpinnerGap
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none",
          tone.iconClass,
        )}
      />
    );
  }
  return <>{children}</>;
}

function RecoveryActionButton({
  action,
}: {
  action: RecoveryAction;
}): ReactElement {
  return (
    <Button
      data-testid={action.testId}
      disabled={action.disabled}
      onClick={action.onClick}
      size="sm"
      type="button"
      variant={action.primary ? "default" : "outline"}
    >
      {action.label}
    </Button>
  );
}
