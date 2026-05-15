import type { PartState } from "@assistant-ui/react";
import type { VariantProps } from "class-variance-authority";
import type { TFunction } from "i18next";
import type {
  ComponentProps,
  CSSProperties,
  FC,
  PropsWithChildren,
} from "react";
import { useAuiState, useScrollLock } from "@assistant-ui/react";
import { cva } from "class-variance-authority";
import { ChevronDownIcon } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/platform/utils";
import { isChatToolAction, isTerminalChatToolPhase } from "@/shared/chat";

const ANIMATION_DURATION = 200;

const toolGroupVariants = cva(
  "aui-tool-group-root group/tool-group my-2 w-full",
  {
    defaultVariants: { variant: "outline" },
    variants: {
      variant: {
        ghost: "",
        muted: "",
        outline: "",
      },
    },
  },
);

export type ToolGroupRootProps = Omit<
  ComponentProps<typeof Collapsible>,
  "onOpenChange" | "open"
> &
  VariantProps<typeof toolGroupVariants> & {
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  };

function ToolGroupRoot({
  children,
  className,
  defaultOpen = false,
  onOpenChange: controlledOnOpenChange,
  open: controlledOpen,
  variant,
  ...props
}: ToolGroupRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) lockScroll();
      if (!isControlled) setUncontrolledOpen(open);
      controlledOnOpenChange?.(open);
    },
    [controlledOnOpenChange, isControlled, lockScroll],
  );

  return (
    <Collapsible
      className={cn(
        toolGroupVariants({ variant }),
        "group/tool-group-root",
        className,
      )}
      data-slot="tool-group-root"
      data-variant={variant ?? "outline"}
      onOpenChange={handleOpenChange}
      open={isOpen}
      ref={collapsibleRef}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

function ToolGroupTrigger({
  className,
  label,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & {
  active?: boolean;
  label: string;
}) {
  return (
    <CollapsibleTrigger
      className={cn(
        `
          aui-tool-group-trigger group/trigger flex min-h-7 w-fit max-w-full
          items-center gap-1.5 rounded-md text-[13px] text-muted-foreground
          transition-colors
          hover:text-foreground
        `,
        className,
      )}
      data-slot="tool-group-trigger"
      {...props}
    >
      <span
        className="
          aui-tool-group-trigger-label-wrapper min-w-0 truncate text-start
          leading-none font-medium
        "
        data-slot="tool-group-trigger-label"
      >
        {label}
      </span>
      <ChevronDownIcon
        className={cn(
          `
            aui-tool-group-trigger-chevron size-3.5 shrink-0
            text-muted-foreground/70
          `,
          "transition-transform duration-(--animation-duration) ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
        data-slot="tool-group-trigger-chevron"
      />
    </CollapsibleTrigger>
  );
}

function ToolGroupContent({
  children,
  className,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn(
        "aui-tool-group-content relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-out",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-(--animation-duration)",
        "data-[state=closed]:duration-(--animation-duration)",
        className,
      )}
      data-slot="tool-group-content"
      {...props}
    >
      <div className={cn("mt-1.5 flex flex-col gap-1.5")}>{children}</div>
    </CollapsibleContent>
  );
}

type ToolGroupComponent = FC<
  PropsWithChildren<{ endIndex: number; startIndex: number }>
> & {
  Content: typeof ToolGroupContent;
  Root: typeof ToolGroupRoot;
  Trigger: typeof ToolGroupTrigger;
};

const ToolGroupImpl: FC<
  PropsWithChildren<{ endIndex: number; startIndex: number }>
> = ({ children, endIndex, startIndex }) => {
  const { t } = useTranslation();
  const active = useAuiState((state) =>
    hasActiveToolGroupPart(state.message.parts, startIndex, endIndex),
  );
  const label = useAuiState((state) =>
    formatToolGroupLabel(state.message.parts, startIndex, endIndex, t),
  );
  const hasTextAfterGroup = useAuiState((state) =>
    hasTextContentAfterIndex(state.message.parts, endIndex),
  );
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const open = manualOpen ?? !hasTextAfterGroup;

  return (
    <ToolGroupRoot onOpenChange={setManualOpen} open={open}>
      <ToolGroupTrigger active={active} label={label} />
      <ToolGroupContent>{children}</ToolGroupContent>
    </ToolGroupRoot>
  );
};

function formatToolGroupLabel(
  parts: readonly PartState[],
  startIndex: number,
  endIndex: number,
  t: TFunction,
) {
  let approvalCount = 0;
  let partCount = 0;

  forEachToolGroupPart(parts, startIndex, endIndex, (part) => {
    partCount += 1;
    if (isElicitationToolPart(part)) approvalCount += 1;
  });

  const toolCount = Math.max(0, partCount - approvalCount);
  const labels = [
    toolCount > 0
      ? t("components.toolGroup.toolCalls", { count: toolCount })
      : undefined,
    approvalCount > 0
      ? t("components.toolGroup.approvals", { count: approvalCount })
      : undefined,
  ].filter(Boolean);

  return (
    labels.join(" · ") || t("components.toolGroup.toolCalls", { count: 0 })
  );
}

function hasActiveToolGroupPart(
  parts: readonly PartState[],
  startIndex: number,
  endIndex: number,
) {
  let active = false;
  forEachToolGroupPart(parts, startIndex, endIndex, (part) => {
    if (isActiveToolPart(part)) active = true;
  });
  return active;
}

function hasTextContentAfterIndex(parts: readonly PartState[], index: number) {
  for (
    let partIndex = Math.max(0, index + 1);
    partIndex < parts.length;
    partIndex += 1
  ) {
    const part = parts[partIndex];
    if (part?.type === "text" && part.text) return true;
  }
  return false;
}

function forEachToolGroupPart(
  parts: readonly PartState[],
  startIndex: number,
  endIndex: number,
  visit: (part: PartState) => void,
) {
  const start = Math.max(0, startIndex);
  const end = Math.min(endIndex, parts.length - 1);
  for (let index = start; index <= end; index += 1) {
    const part = parts[index];
    if (part) visit(part);
  }
}

function isActiveToolPart(part: PartState) {
  if (part.type !== "tool-call") return false;

  if (isChatToolAction(part.artifact) && part.artifact.phase) {
    return !isTerminalChatToolPhase(part.artifact.phase);
  }

  return (
    part.status.type === "running" || part.status.type === "requires-action"
  );
}

function isElicitationToolPart(part: PartState) {
  return (
    part.type === "tool-call" &&
    isChatToolAction(part.artifact) &&
    part.artifact.kind === "elicitation"
  );
}

const ToolGroup = memo(ToolGroupImpl) as unknown as ToolGroupComponent;

ToolGroup.displayName = "ToolGroup";
ToolGroup.Root = ToolGroupRoot;
ToolGroup.Trigger = ToolGroupTrigger;
ToolGroup.Content = ToolGroupContent;

export {
  ToolGroup,
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
  toolGroupVariants,
};
