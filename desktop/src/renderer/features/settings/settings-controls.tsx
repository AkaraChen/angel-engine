"use client";

import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type { PointerEvent, ReactNode } from "react";

import { DotsSixVertical as DragHandle } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { Reorder, useDragControls } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/platform/utils";

/**
 * Danger affordance for actions that still have a confirmation step in front
 * of them (reset password, delete a worktree, wipe every chat). Those read as
 * an outline in danger ink; the saturated fill is reserved for the final
 * button inside the confirmation dialog itself.
 */
const dangerActionClassName = "border-status-danger-border";

/**
 * Section label: mono / uppercase / hairline tracking, sitting *outside* the
 * card so the card itself stays a clean white plate. Same treatment as the
 * sidebar and menu group labels. `settings-section-label` is the CJK carve-out
 * for the uppercase (see index-foundation.css).
 */
const sectionLabelClassName = `
  settings-section-label font-mono text-[0.6875rem] font-medium tracking-wide
  uppercase
`;

/**
 * Grouped-list card: an optional label block above a hairline-divided white
 * plate. `tone="danger"` swaps the card chrome for the danger triple (soft
 * border + danger label) instead of a saturated block.
 */
function SettingsGroup({
  children,
  description,
  title,
  tone = "default",
}: {
  children: ReactNode;
  description?: string;
  title?: string;
  tone?: "default" | "danger";
}) {
  const hasHeader = is.nonEmptyString(title) || is.nonEmptyString(description);

  return (
    <section className="space-y-2.5">
      {hasHeader ? (
        <div className="space-y-1.5 px-0.5">
          {is.nonEmptyString(title) ? (
            <h3
              className={cn(
                sectionLabelClassName,
                tone === "danger"
                  ? "text-status-danger"
                  : "text-muted-foreground",
              )}
            >
              {title}
            </h3>
          ) : null}
          {is.nonEmptyString(description) ? (
            <p className="text-xs leading-[1.55] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          "divide-y overflow-hidden rounded-xl border bg-card shadow-xs",
          tone === "danger"
            ? "divide-status-danger-border border-status-danger-border"
            : "divide-border-subtle border-border-subtle",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * One line of a grouped list: optional leading icon tile, a title/description
 * stack, and a trailing control pinned right. Rows are not interactive
 * themselves, so they carry no hover affordance.
 */
function SettingsRow({
  after,
  align = "center",
  children,
  description,
  icon,
  muted,
  title,
  variant,
}: {
  after: ReactNode;
  align?: "center" | "start";
  children?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  muted?: boolean;
  title?: string;
  variant?: "destructive";
}) {
  return (
    <article
      className={cn(
        "flex min-h-13 gap-4 px-5 py-3.5",
        align === "start" ? "items-start" : "items-center",
        muted && "text-muted-foreground",
      )}
    >
      {!is.falsy(icon) ? (
        <span
          className="
            flex size-7 shrink-0 items-center justify-center rounded-lg border
            border-border-subtle bg-background
          "
        >
          {icon}
        </span>
      ) : null}
      {!is.falsy(children) ? (
        children
      ) : (
        <span className="min-w-0 flex-1">
          {is.nonEmptyString(title) ? (
            <span
              className={cn(
                "block text-sm leading-snug font-medium",
                variant === "destructive" && "text-destructive",
              )}
            >
              {title}
            </span>
          ) : null}
          {!is.falsy(description) ? (
            <span
              className="
                mt-1 block text-xs leading-[1.55] wrap-break-word
                text-muted-foreground
              "
            >
              {description}
            </span>
          ) : null}
        </span>
      )}
      <span className={cn("ml-auto shrink-0", align === "start" && "-mt-0.5")}>
        {after}
      </span>
    </article>
  );
}

function SettingsSelect({
  label,
  onValueChange,
  options,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <Select onValueChange={onValueChange} value={value}>
      <SelectTrigger aria-label={label} className="w-44" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AgentOrderHandle({
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button
      aria-label={`Reorder ${label}`}
      className="
        -ml-1.5 shrink-0 cursor-grab touch-none text-muted-foreground/70
        hover:text-foreground
        active:cursor-grabbing
      "
      onPointerDown={onPointerDown}
      size="icon-xs"
      title={`Reorder ${label}`}
      type="button"
      variant="ghost"
    >
      <DragHandle />
    </Button>
  );
}

function ReorderableAgentRow({
  after,
  children,
  label,
  muted,
  onOrderCommit,
  runtime,
}: {
  after: ReactNode;
  children: ReactNode;
  label: string;
  muted?: boolean;
  onOrderCommit: () => void;
  runtime: AgentRuntime;
}) {
  const dragControls = useDragControls();
  const [dragging, setDragging] = useState(false);

  return (
    <Reorder.Item
      as="article"
      className={cn(
        "flex min-h-13 items-center gap-3 bg-card px-5 py-3",
        dragging &&
          "relative z-10 rounded-lg shadow-popover ring-1 ring-border-strong",
        muted && "text-muted-foreground",
      )}
      dragControls={dragControls}
      dragListener={false}
      onDragEnd={() => {
        setDragging(false);
        onOrderCommit();
      }}
      onDragStart={() => setDragging(true)}
      value={runtime}
    >
      <AgentOrderHandle
        label={label}
        onPointerDown={(event) => {
          event.preventDefault();
          dragControls.start(event);
        }}
      />
      {children}
      <span className="ml-auto shrink-0">{after}</span>
    </Reorder.Item>
  );
}

function AgentEnabledSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Switch
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      title={disabled ? t("settings.agents.minimumEnabled") : label}
    />
  );
}

export {
  AgentEnabledSwitch,
  dangerActionClassName,
  ReorderableAgentRow,
  sectionLabelClassName,
  SettingsGroup,
  SettingsRow,
  SettingsSelect,
};
