import type {
  ChatAvailableCommand,
  ChatAvailableSkill,
  ProjectFileSearchResult,
} from "@angel-engine/daemon-api/chat";
import type { SuggestionProps } from "@tiptap/suggestion";
import type { Ref } from "react";
import { SpinnerGap as Loader2 } from "@phosphor-icons/react";
import { useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import { nativeControlRowClass } from "@/features/chat/components/thread-styles";
import { cn } from "@/platform/utils";

export type ComposerSuggestionItem =
  | { command: ChatAvailableCommand; kind: "command" }
  | { file: ProjectFileSearchResult; kind: "file" }
  | { kind: "skill"; skill: ChatAvailableSkill };

export interface ComposerSuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface ComposerSuggestionListProps extends SuggestionProps<
  ComposerSuggestionItem,
  ComposerSuggestionItem
> {
  ref?: Ref<ComposerSuggestionListHandle>;
}

export function ComposerSuggestionList({
  command,
  items,
  loading,
  ref,
  text,
}: ComposerSuggestionListProps) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const kind = items[0]?.kind ?? suggestionKindFromText(text);
  const activeIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((current) =>
          items.length === 0 ? 0 : (current + items.length - 1) % items.length,
        );
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((current) =>
          items.length === 0 ? 0 : (current + 1) % items.length,
        );
        return true;
      }
      if ((event.key === "Enter" || event.key === "Tab") && items.length > 0) {
        const item = items[activeIndex];
        if (item !== undefined) command(item);
        return true;
      }
      return false;
    },
  }));

  const title =
    kind === "command"
      ? t("composer.commands")
      : kind === "skill"
        ? t("composer.skills")
        : t("composer.files");

  return (
    <div
      className="
        relative z-100 w-96 rounded-lg border border-border-subtle bg-popover/96
        p-1 text-popover-foreground shadow-[0_12px_30px_-24px_rgba(0,0,0,0.62)]
        backdrop-blur-xl
      "
    >
      <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
        {title}
      </div>
      <div className="max-h-48 overflow-y-auto">
        {loading ? (
          <div
            className="
              flex items-center gap-2 p-2 text-sm text-muted-foreground
            "
          >
            <Loader2 className="size-3.5 animate-spin" />
            <span>{t("common.searching")}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground">
            {kind === "command"
              ? t("composer.noMatchingCommands")
              : kind === "skill"
                ? t("composer.noMatchingSkills")
                : t("composer.noFilesFound")}
          </div>
        ) : (
          items.map((item, index) => (
            <SuggestionItem
              active={index === activeIndex}
              item={item}
              key={suggestionItemKey(item)}
              onSelect={() => command(item)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SuggestionItem({
  active,
  item,
  onSelect,
}: {
  active: boolean;
  item: ComposerSuggestionItem;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        nativeControlRowClass,
        "flex w-full min-w-0 px-2 py-1.5 text-left text-sm",
        active && "bg-overlay-hover",
        item.kind === "file" ? "flex-col" : "items-center gap-2",
      )}
      onClick={onSelect}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      {item.kind === "file" ? (
        <>
          <span className="w-full truncate">{item.file.name}</span>
          <span className="w-full truncate text-xs text-muted-foreground">
            {item.file.relativePath}
          </span>
        </>
      ) : item.kind === "skill" ? (
        <>
          <span className="max-w-[45%] truncate font-mono text-xs text-primary">
            {"$"}
            {item.skill.name}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {item.skill.description}
          </span>
        </>
      ) : (
        <>
          <span className="max-w-[45%] truncate font-mono text-xs text-primary">
            /{item.command.name}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {item.command.description}
          </span>
        </>
      )}
    </button>
  );
}

function suggestionKindFromText(text: string): ComposerSuggestionItem["kind"] {
  if (text.startsWith("/")) return "command";
  if (text.startsWith("$")) return "skill";
  return "file";
}

function suggestionItemKey(item: ComposerSuggestionItem) {
  switch (item.kind) {
    case "command":
      return `command:${item.command.name}`;
    case "file":
      return `file:${item.file.path}`;
    case "skill":
      return `skill:${item.skill.path}`;
  }
}
