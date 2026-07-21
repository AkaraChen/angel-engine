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
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/platform/utils";

function SettingsGroup({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="space-y-2">
      {is.nonEmptyString(title) ? (
        <h3 className="text-sm font-semibold">{title}</h3>
      ) : null}
      <div
        className="
          divide-y divide-border-subtle overflow-hidden rounded-xl border
          border-border-subtle bg-surface-1/50 shadow-xs
        "
      >
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  after,
  children,
  description,
  icon,
  muted,
  title,
  variant,
}: {
  after: ReactNode;
  children?: ReactNode;
  description?: string;
  icon?: ReactNode;
  muted?: boolean;
  title?: string;
  variant?: "destructive";
}) {
  return (
    <article
      className={cn(
        "flex min-h-12 items-center gap-3 bg-card px-4 py-3",
        muted && "text-muted-foreground",
      )}
    >
      {!is.falsy(icon) ? (
        <span
          className="
            flex size-8 shrink-0 items-center justify-center rounded-md
            bg-background
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
                "block text-sm font-medium",
                variant === "destructive" && "text-destructive",
              )}
            >
              {title}
            </span>
          ) : null}
          {is.nonEmptyString(description) ? (
            <span className="mt-1 block text-sm text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      )}
      <span className="ml-auto shrink-0">{after}</span>
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
    <label
      className="
        flex min-w-44 flex-col gap-1.5 text-xs font-medium text-muted-foreground
      "
    >
      <NativeSelect
        aria-label={label}
        className="w-full"
        onChange={(event) => onValueChange(event.currentTarget.value)}
        selectClassName="h-8 w-full rounded-md border-border bg-background py-0 pr-8 pl-3 text-xs"
        size="sm"
        value={value}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
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
        shrink-0 cursor-grab touch-none text-muted-foreground
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
        "flex min-h-12 items-center gap-3 bg-card px-4 py-3",
        dragging &&
          "relative z-10 rounded-lg shadow-lg ring-1 ring-foreground/10",
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
  ReorderableAgentRow,
  SettingsGroup,
  SettingsRow,
  SettingsSelect,
};
