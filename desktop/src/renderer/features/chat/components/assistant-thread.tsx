import {
  AuiIf,
  SelectionToolbarPrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { RiDoubleQuotesL as Quote } from "@remixicon/react";
import is from "@sindresorhus/is";
import { Trans, useTranslation } from "react-i18next";

import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { AssistantComposer } from "@/features/chat/components/assistant-composer";
import {
  AssistantMessage,
  UserEditComposer,
  UserMessage,
} from "@/features/chat/components/messages";
import { SketchUnderline } from "@/features/chat/components/sketch-underline";
import { workspaceContentColumnClass } from "@/features/chat/components/thread-styles";

export function AssistantThread({
  onBeforeSubmit,
  projectName,
}: {
  onBeforeSubmit?: () => boolean | Promise<boolean>;
  projectName?: string;
}) {
  const { t } = useTranslation();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);

  return (
    <ThreadPrimitive.Root
      className="flex h-full min-h-0 flex-col bg-background/96"
      data-workspace-mode={workspaceMode}
    >
      <ThreadPrimitive.Viewport
        className="
          relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4
          sm:px-7
        "
        scrollToBottomOnRunStart
      >
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <EmptyThread projectName={projectName} />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) => {
            if (message.role === "user") {
              if (message.composer.isEditing) return <UserEditComposer />;
              return <UserMessage />;
            }
            return <AssistantMessage />;
          }}
        </ThreadPrimitive.Messages>

        <SelectionToolbarPrimitive.Root
          className="
            z-20 flex items-center gap-1 rounded-lg border border-border-subtle
            bg-popover/95 p-1 text-popover-foreground shadow-popover
            backdrop-blur-xl
          "
        >
          <SelectionToolbarPrimitive.Quote
            className="
              inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs
              hover:bg-overlay-hover
              active:bg-overlay-active
            "
          >
            <Quote className="size-3" />
            {t("thread.quote")}
          </SelectionToolbarPrimitive.Quote>
        </SelectionToolbarPrimitive.Root>
      </ThreadPrimitive.Viewport>
      <div
        aria-hidden="true"
        className="
          pointer-events-none relative z-10 -mt-6 h-6 shrink-0 bg-linear-to-b
          from-background/0 via-background/78 to-background
        "
      />
      <div
        className="
          relative z-20 mt-[12px] shrink-0 bg-background px-4 pb-3
          sm:px-7
        "
      >
        <div className={workspaceContentColumnClass}>
          <AssistantComposer onBeforeSubmit={onBeforeSubmit} />
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
}

function EmptyThread({ projectName }: { projectName?: string }) {
  const { t } = useTranslation();

  return (
    <div
      className={`
        ${workspaceContentColumnClass}
        flex flex-1 items-center justify-center py-8
      `}
      data-workspace-mode="chat"
    >
      <div className="w-full max-w-136">
        <div className="min-w-0 text-center select-none">
          <h2
            className="
            text-2xl/tight font-semibold text-pretty text-foreground
          "
          >
            {is.nonEmptyString(projectName) ? (
              <Trans
                components={{ project: <SketchUnderline /> }}
                i18nKey="thread.empty.titleWithProject"
                values={{ projectName }}
              />
            ) : (
              t("thread.empty.title")
            )}
          </h2>
          <p className="mx-auto mt-2 max-w-120 text-sm/6 text-muted-foreground">
            {t("thread.empty.description")}
          </p>
        </div>
      </div>
    </div>
  );
}
