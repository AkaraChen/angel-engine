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
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";

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

  return (
    <article className="flex min-w-0 items-start gap-3 px-4 py-3">
      {bulkMode ? (
        <Checkbox
          aria-label={chat.title}
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
          <span className="min-w-0 truncate text-sm font-medium">
            {chat.title}
          </span>
          {isWorktree ? (
            <span
              className="
                inline-flex shrink-0 items-center gap-1 rounded-sm bg-muted
                px-1.5 py-0.5 text-[11px] text-muted-foreground
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
          <span>{formatDateTime(chat.updatedAt)}</span>
        </div>
        {isWorktree && is.nonEmptyString(chat.cwd) ? (
          <div className="mt-1 truncate text-xs text-muted-foreground/70">
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
    </article>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
