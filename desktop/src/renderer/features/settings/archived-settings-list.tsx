import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { ReactNode } from "react";

import {
  Archive,
  GitBranch,
  ArrowClockwise as Restore,
  Trash as Trash2,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useTranslation } from "react-i18next";
import {
  displayChatTitle,
  getProjectDisplayName,
} from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { dangerActionClassName } from "@/features/settings/settings-controls";
import { formatDateTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";

/**
 * List plate shared by the archived-chat and removable-worktree lists. Same
 * shape as a Fleet section: a hairline card that insets its rows so each row
 * can carry its own rounded hover surface instead of a divider grid.
 */
export function SettingsListPlate({ children }: { children: ReactNode }) {
  return (
    <div
      className="
        space-y-px rounded-xl border border-border-subtle bg-card p-1.5
        shadow-xs
      "
    >
      {children}
    </div>
  );
}

/** Loading / empty / error copy occupying a whole plate. */
export function SettingsListNotice({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-6 text-sm text-muted-foreground">{children}</div>
  );
}

/**
 * Bulk-selection bar. It floats above the list as a capsule rather than
 * docking into the layout, so entering bulk mode never reflows the rows the
 * user is aiming at.
 */
export function SettingsBulkBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="
        sticky top-14 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center
        justify-center gap-2 rounded-full border border-border-subtle
        bg-popover px-2.5 py-1.5 shadow-popover
      "
    >
      {children}
    </div>
  );
}

export function SettingsBulkCount({ children }: { children: ReactNode }) {
  return (
    <span className="px-1 text-xs tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

/** Row shell: rounded hover target, `--primary-soft` when bulk-selected. */
export function SettingsListRow({
  children,
  disabled,
  selected,
}: {
  children: ReactNode;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <article
      aria-disabled={disabled === true}
      className={cn(
        `
          flex min-w-0 items-start gap-3 rounded-lg px-3 py-2.5 transition-colors
          duration-120 ease-standard
          motion-reduce:transition-none
        `,
        selected === true ? "bg-primary-soft" : "hover:bg-overlay-hover",
        disabled === true && "pointer-events-none opacity-50",
      )}
    >
      {children}
    </article>
  );
}

export function ArchivedFilterSelect({
  children,
  label,
  onValueChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <label
      className="
        flex min-w-44 flex-col gap-1.5 text-xs font-medium text-muted-foreground
      "
    >
      {label}
      <NativeSelect
        aria-label={label}
        className="w-full"
        onChange={(event) => onValueChange(event.currentTarget.value)}
        selectClassName="h-8 w-full rounded-md border-border bg-background py-0 pr-8 pl-3 text-xs"
        size="sm"
        value={value}
      >
        {children}
      </NativeSelect>
    </label>
  );
}

export function ArchivedChatRow({
  bulkMode,
  chat,
  disabled,
  project,
  selected,
  onDelete,
  onRestore,
  onSelectedChange,
}: {
  bulkMode: boolean;
  chat: Chat;
  disabled: boolean;
  project?: Project;
  selected: boolean;
  onDelete: () => void;
  onRestore: () => void;
  onSelectedChange: (selected: boolean) => void;
}) {
  const { t } = useTranslation();
  const isWorktree = Boolean(
    is.nonEmptyString(project?.path) &&
      is.nonEmptyString(chat.cwd) &&
      chat.cwd !== project.path,
  );
  const projectName = project
    ? getProjectDisplayName(project.path)
    : t("settings.archived.noProject");
  const title = displayChatTitle(chat.title, t);

  return (
    <SettingsListRow selected={bulkMode && selected}>
      {bulkMode ? (
        <Checkbox
          aria-label={title}
          checked={selected}
          className="mt-0.5"
          disabled={disabled}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
        />
      ) : (
        <Archive className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
          {isWorktree ? (
            <span
              className="
                inline-flex shrink-0 items-center gap-1 rounded-full bg-muted
                px-2 py-0.5 font-mono text-[0.625rem] tracking-wide
                text-muted-foreground uppercase
              "
            >
              <GitBranch className="size-3" />
              {t("settings.archived.worktree")}
            </span>
          ) : null}
        </div>
        <div
          className="
            mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs
            text-muted-foreground
          "
        >
          <span>{projectName}</span>
          <span>{chat.runtime}</span>
          <span className="tabular-nums">{formatDateTime(chat.updatedAt)}</span>
        </div>
        {isWorktree && is.nonEmptyString(chat.cwd) ? (
          <div
            className="
              mt-1 truncate font-mono text-[0.6875rem] text-muted-foreground/70
            "
          >
            {chat.cwd}
          </div>
        ) : null}
      </div>
      {!bulkMode ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            disabled={disabled}
            onClick={onRestore}
            size="sm"
            type="button"
            variant="outline"
          >
            <Restore />
            {t("settings.archived.restore")}
          </Button>
          <Button
            className={dangerActionClassName}
            disabled={disabled}
            onClick={onDelete}
            size="sm"
            type="button"
            variant="destructive"
          >
            <Trash2 />
            {t("settings.archived.deletePermanently")}
          </Button>
        </div>
      ) : null}
    </SettingsListRow>
  );
}
